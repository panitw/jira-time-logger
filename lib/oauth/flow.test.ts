import { describe, it, expect, beforeEach, vi } from 'vitest';

// Session-storage mock + chrome.identity mock + global fetch mock.
const sessionStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: vi.fn(async (key: string) => {
        return key in sessionStore ? { [key]: sessionStore[key] } : {};
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
      }),
      remove: vi.fn(async (keys: string[]) => {
        for (const k of keys) delete sessionStore[k];
      }),
    },
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  },
  identity: {
    getRedirectURL: vi.fn(() => 'https://test-extension-id.chromiumapp.org/'),
    launchWebAuthFlow: vi.fn(),
  },
  runtime: { id: 'test-extension', lastError: null },
});

const { buildAuthUrl, parseCallbackUrl, startOAuthFlow } = await import('./flow');
const { OAUTH_SCOPES } = await import('@/lib/env');

describe('buildAuthUrl', () => {
  it('includes all required PKCE params', () => {
    const url = buildAuthUrl({
      redirectUri: 'https://ext.chromiumapp.org/',
      codeChallenge: 'CHALLENGE',
      state: 'STATE',
    });
    expect(url).toContain('https://auth.atlassian.com/authorize?');
    expect(url).toContain('audience=api.atlassian.com');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('code_challenge=CHALLENGE');
    expect(url).toContain('state=STATE');
    expect(url).toContain('response_type=code');
    expect(url).toContain('prompt=consent');
    // URLSearchParams encodes spaces as '+' (also valid for query strings).
    // Decode the actual scope param and compare semantically.
    const parsed = new URL(url);
    expect(parsed.searchParams.get('scope')).toBe(OAUTH_SCOPES.join(' '));
  });
});

describe('parseCallbackUrl', () => {
  it('extracts code + state when present', () => {
    const url = 'https://ext.chromiumapp.org/?code=AUTHCODE&state=STATEVAL';
    expect(parseCallbackUrl(url)).toEqual({ code: 'AUTHCODE', state: 'STATEVAL' });
  });

  it('extracts error code on denial', () => {
    const url = 'https://ext.chromiumapp.org/?error=access_denied&state=S';
    expect(parseCallbackUrl(url)).toEqual({
      error: 'access_denied',
      state: 'S',
    });
  });
});

describe('startOAuthFlow', () => {
  beforeEach(() => {
    for (const k of Object.keys(sessionStore)) delete sessionStore[k];
    vi.restoreAllMocks();
  });

  it('returns oauth-cancelled when launchWebAuthFlow returns no responseUrl', async () => {
    const identityMock = chrome.identity.launchWebAuthFlow as ReturnType<typeof vi.fn>;
    identityMock.mockImplementation((_opts: unknown, cb: (url?: string) => void) => {
      cb(undefined);
    });

    const result = await startOAuthFlow();
    expect(result.kind).toBe('oauth-cancelled');
  });

  it('returns oauth-csrf-mismatch when state does not match', async () => {
    const identityMock = chrome.identity.launchWebAuthFlow as ReturnType<typeof vi.fn>;
    identityMock.mockImplementation((_opts: unknown, cb: (url?: string) => void) => {
      cb('https://ext.chromiumapp.org/?code=AUTH&state=WRONG_STATE');
    });

    const result = await startOAuthFlow();
    expect(result.kind).toBe('oauth-csrf-mismatch');
  });

  it('returns oauth-error when callback URL contains an error parameter', async () => {
    const identityMock = chrome.identity.launchWebAuthFlow as ReturnType<typeof vi.fn>;
    identityMock.mockImplementation((_opts: unknown, cb: (url?: string) => void) => {
      cb('https://ext.chromiumapp.org/?error=access_denied&state=ignored');
    });

    const result = await startOAuthFlow();
    expect(result.kind).toBe('oauth-error');
    if (result.kind === 'oauth-error') {
      expect(result.cause).toBe('access_denied');
    }
  });

  it('returns oauth-error when token exchange fails (non-2xx)', async () => {
    // First, capture the state we set in session by intercepting launchWebAuthFlow.
    const identityMock = chrome.identity.launchWebAuthFlow as ReturnType<typeof vi.fn>;
    identityMock.mockImplementation(async (opts: { url: string }, cb: (url?: string) => void) => {
      const stateMatch = /state=([^&]+)/.exec(opts.url)![1]!;
      cb(`https://ext.chromiumapp.org/?code=AUTH&state=${stateMatch}`);
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('invalid_grant', { status: 400 })),
    );

    const result = await startOAuthFlow();
    expect(result.kind).toBe('oauth-error');
  });

  it('returns ok with tokens + sites on full success', async () => {
    const identityMock = chrome.identity.launchWebAuthFlow as ReturnType<typeof vi.fn>;
    identityMock.mockImplementation(async (opts: { url: string }, cb: (url?: string) => void) => {
      const stateMatch = /state=([^&]+)/.exec(opts.url)![1]!;
      cb(`https://ext.chromiumapp.org/?code=AUTH&state=${stateMatch}`);
    });

    let fetchCallNum = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchCallNum++;
        if (fetchCallNum === 1) {
          // Token exchange
          return new Response(
            JSON.stringify({
              access_token: 'ACCESS',
              refresh_token: 'REFRESH',
              expires_in: 3600,
              scope: 'read:jira-work write:jira-work read:me offline_access',
              token_type: 'Bearer',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        // accessible-resources
        return new Response(
          JSON.stringify([
            {
              id: 'cloud-1',
              name: 'Acme',
              url: 'https://acme.atlassian.net',
              scopes: ['read:jira-work'],
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const result = await startOAuthFlow();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.tokens.access_token).toBe('ACCESS');
      expect(result.value.tokens.refresh_token).toBe('REFRESH');
      expect(result.value.tokens.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.value.sites).toHaveLength(1);
      expect(result.value.sites[0]!.id).toBe('cloud-1');
    }
  });

  it('returns parse-error on schema drift in token response', async () => {
    const identityMock = chrome.identity.launchWebAuthFlow as ReturnType<typeof vi.fn>;
    identityMock.mockImplementation(async (opts: { url: string }, cb: (url?: string) => void) => {
      const stateMatch = /state=([^&]+)/.exec(opts.url)![1]!;
      cb(`https://ext.chromiumapp.org/?code=AUTH&state=${stateMatch}`);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        // Missing refresh_token — schema should reject
        return new Response(
          JSON.stringify({
            access_token: 'A',
            expires_in: 3600,
            scope: 'read:jira-work',
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const result = await startOAuthFlow();
    expect(result.kind).toBe('parse-error');
  });
});
