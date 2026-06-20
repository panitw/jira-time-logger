import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { OAuthBundle } from '@/lib/storage/tokens';

const memoryStore: Record<string, unknown> = {};
const sessionStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[] | Record<string, unknown> | null) => {
        if (keys === null) return { ...memoryStore };
        if (typeof keys === 'string') {
          return keys in memoryStore ? { [keys]: memoryStore[keys] } : {};
        }
        if (Array.isArray(keys)) {
          const out: Record<string, unknown> = {};
          for (const k of keys) {
            if (k in memoryStore) out[k] = memoryStore[k];
          }
          return out;
        }
        const out: Record<string, unknown> = {};
        for (const [k, def] of Object.entries(keys)) {
          out[k] = k in memoryStore ? memoryStore[k] : def;
        }
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(memoryStore, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete memoryStore[k];
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(memoryStore)) delete memoryStore[k];
      }),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    session: {
      get: vi.fn(async (key: string) => {
        return key in sessionStore ? { [key]: sessionStore[key] } : {};
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete sessionStore[k];
      }),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { id: 'test-extension-id' },
});

const { refreshTokens, refreshAuthExpired, refreshNetwork, refreshParseError, refreshRateLimited, refreshNoOauthBundle, refreshLockContention } =
  await import('./refresh');
const tokensModule = await import('@/lib/storage/tokens');
const { setAuth } = tokensModule;

function oauthBundle(overrides?: Partial<OAuthBundle>): OAuthBundle {
  return {
    kind: 'oauth',
    access_token: 'at',
    refresh_token: 'rt',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    cloudId: 'cloud-1',
    ...overrides,
  };
}

function makeTokenResponse(overrides?: Record<string, unknown>) {
  return {
    access_token: 'new-at',
    refresh_token: 'new-rt',
    expires_in: 3600,
    scope: 'read:jira-work write:jira-work read:me offline_access',
    token_type: 'Bearer' as const,
    ...overrides,
  };
}

describe('refreshTokens', () => {
  beforeEach(async () => {
    for (const k of Object.keys(memoryStore)) delete memoryStore[k];
    for (const k of Object.keys(sessionStore)) delete sessionStore[k];
    vi.restoreAllMocks();
  });

  it('returns no-oauth-bundle when no auth stored', async () => {
    const result = await refreshTokens();
    expect(result.kind).toBe('no-oauth-bundle');
  });

  it('returns no-oauth-bundle for an API-token bundle', async () => {
    await setAuth({
      kind: 'api-token',
      email: 'note@example.com',
      apiToken: 'secret-token',
      siteUrl: 'https://acme.atlassian.net',
      accountId: '5fae',
    });
    const result = await refreshTokens();
    expect(result.kind).toBe('no-oauth-bundle');
  });

  it('returns ok with existing bundle when token is fresh (>2 min remaining)', async () => {
    const bundle = oauthBundle({
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    await setAuth(bundle);
    const result = await refreshTokens();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.access_token).toBe(bundle.access_token);
      expect(result.value.refresh_token).toBe(bundle.refresh_token);
    }
  });

  it('returns auth-expired on 400 response and clears tokens', async () => {
    await setAuth(
      oauthBundle({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('invalid_grant', { status: 400 })),
    );

    const result = await refreshTokens();
    expect(result.kind).toBe('auth-expired');

    const stored = await tokensModule.getAuth();
    expect(stored).toBeNull();
  });

  it('returns auth-expired on 401 response and clears tokens', async () => {
    await setAuth(
      oauthBundle({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    );

    const result = await refreshTokens();
    expect(result.kind).toBe('auth-expired');

    const stored = await tokensModule.getAuth();
    expect(stored).toBeNull();
  });

  it('returns rate-limited on 429 and does NOT clear tokens', async () => {
    const bundle = oauthBundle({
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    await setAuth(bundle);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('rate limited', { status: 429, headers: { 'Retry-After': '30' } }),
      ),
    );

    const result = await refreshTokens();
    expect(result.kind).toBe('rate-limited');
    if (result.kind === 'rate-limited') {
      expect(result.retryAfterMs).toBe(30000);
    }

    const stored = await tokensModule.getAuth();
    expect(stored).not.toBeNull();
    expect(stored!.kind).toBe('oauth');
  });

  it('returns network on 5xx and does NOT clear tokens', async () => {
    const bundle = oauthBundle({
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    await setAuth(bundle);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('server error', { status: 503 })),
    );

    const result = await refreshTokens();
    expect(result.kind).toBe('network');

    const stored = await tokensModule.getAuth();
    expect(stored).not.toBeNull();
    expect(stored!.kind).toBe('oauth');
  });

  it('returns network when fetch throws', async () => {
    await setAuth(
      oauthBundle({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const result = await refreshTokens();
    expect(result.kind).toBe('network');
  });

  it('returns parse-error on schema drift', async () => {
    await setAuth(
      oauthBundle({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            access_token: 'at',
            // missing refresh_token, expires_in, scope, token_type
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const result = await refreshTokens();
    expect(result.kind).toBe('parse-error');
  });

  it('returns parse-error when expires_in is 0', async () => {
    await setAuth(
      oauthBundle({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify(makeTokenResponse({ expires_in: 0 })),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const result = await refreshTokens();
    expect(result.kind).toBe('parse-error');
  });

  it('returns parse-error when expires_in is negative', async () => {
    await setAuth(
      oauthBundle({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify(makeTokenResponse({ expires_in: -100 })),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const result = await refreshTokens();
    expect(result.kind).toBe('parse-error');
  });

  it('returns parse-error when expires_in is too large', async () => {
    await setAuth(
      oauthBundle({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify(makeTokenResponse({ expires_in: 31_536_001 })),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const result = await refreshTokens();
    expect(result.kind).toBe('parse-error');
  });

  it('returns ok with rotated tokens on success', async () => {
    const originalBundle = oauthBundle({
      access_token: 'old-at',
      refresh_token: 'old-rt',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      cloudId: 'cloud-1',
    });
    await setAuth(originalBundle);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify(makeTokenResponse({
            access_token: 'new-at',
            refresh_token: 'new-rt',
            expires_in: 3600,
          })),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const result = await refreshTokens();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.access_token).toBe('new-at');
      expect(result.value.refresh_token).toBe('new-rt');
      expect(result.value.cloudId).toBe('cloud-1');
      expect(result.value.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    const stored = await tokensModule.getAuth();
    expect(stored?.kind).toBe('oauth');
    if (stored && stored.kind === 'oauth') {
      expect(stored.access_token).toBe('new-at');
      expect(stored.refresh_token).toBe('new-rt');
    }
  });

  it('mutex contention: second caller awaits in-flight result', async () => {
    const expiredBundle = oauthBundle({
      access_token: 'old-at',
      refresh_token: 'old-rt',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    await setAuth(expiredBundle);

    let resolveFetch: (value: unknown) => void;
    const fetchDeferred = new Promise<unknown>((resolve) => {
      resolveFetch = resolve;
    });

    const fetchMock = vi.fn(() => fetchDeferred);
    vi.stubGlobal('fetch', fetchMock);

    const p1 = refreshTokens();
    const p2 = refreshTokens();

    await new Promise((r) => setTimeout(r, 50));
    resolveFetch!({
      ok: true,
      status: 200,
      json: async () => makeTokenResponse({
        access_token: 'refreshed-at',
        refresh_token: 'refreshed-rt',
      }),
      text: async () => '<text>',
    });

    const [result1, result2] = await Promise.all([p1, p2]);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(result1.kind).toBe('ok');
    expect(result2.kind).toBe('ok');

    if (result1.kind === 'ok') {
      expect(result1.value.access_token).toBe('refreshed-at');
    }
    if (result2.kind === 'ok') {
      expect(result2.value.access_token).toBe('refreshed-at');
      expect(result2.value.refresh_token).toBe('refreshed-rt');
    }
  });

  it('releases mutex lock on success', async () => {
    await setAuth(
      oauthBundle({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );

    let fetchCallCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchCallCount++;
        return new Response(
          JSON.stringify(makeTokenResponse()),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    await refreshTokens();
    expect(fetchCallCount).toBe(1);

    expect(await chrome.storage.session.get('oauth.refreshInFlight')).toEqual({});

    const freshBundle = oauthBundle({
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    await setAuth(freshBundle);

    const second = await refreshTokens();
    expect(second.kind).toBe('ok');
    expect(fetchCallCount).toBe(1);
  });
});

describe('RefreshError constructors', () => {
  it('refreshAuthExpired creates auth-expired', () => {
    expect(refreshAuthExpired()).toEqual({ kind: 'auth-expired' });
  });

  it('refreshNetwork creates network with cause', () => {
    expect(refreshNetwork('down')).toEqual({ kind: 'network', cause: 'down' });
  });

  it('refreshParseError creates parse-error with issue', () => {
    expect(refreshParseError('bad json')).toEqual({ kind: 'parse-error', issue: 'bad json' });
  });

  it('refreshRateLimited creates rate-limited with ms', () => {
    expect(refreshRateLimited(5000)).toEqual({ kind: 'rate-limited', retryAfterMs: 5000 });
  });

  it('refreshNoOauthBundle creates no-oauth-bundle', () => {
    expect(refreshNoOauthBundle()).toEqual({ kind: 'no-oauth-bundle' });
  });

  it('refreshLockContention creates lock-contention with message', () => {
    expect(refreshLockContention('busy')).toEqual({ kind: 'lock-contention', message: 'busy' });
  });
});
