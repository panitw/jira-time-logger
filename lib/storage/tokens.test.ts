import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { OAuthBundle, ApiTokenBundle } from './tokens';

// Mock chrome.storage.local in-memory before importing the module under test.
const memoryStore: Record<string, unknown> = {};

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
        // Object form: keys map to defaults
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
        for (const k of arr) {
          delete memoryStore[k];
        }
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(memoryStore)) {
          delete memoryStore[k];
        }
      }),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    session: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { id: 'test-extension-id' },
});

const tokensModule = await import('./tokens');
const { getAuth, setAuth, clearAuth, hasValidAuth } = tokensModule;

function oauthBundle(overrides?: Partial<OAuthBundle>): OAuthBundle {
  return {
    kind: 'oauth',
    access_token: 'a',
    refresh_token: 'r',
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    cloudId: 'cloud-1',
    ...overrides,
  };
}

function apiTokenBundle(overrides?: Partial<ApiTokenBundle>): ApiTokenBundle {
  return {
    kind: 'api-token',
    email: 'note@example.com',
    apiToken: 'secret-token',
    siteUrl: 'https://acme.atlassian.net',
    accountId: '5fae...',
    ...overrides,
  };
}

describe('storage/tokens', () => {
  beforeEach(async () => {
    for (const k of Object.keys(memoryStore)) {
      delete memoryStore[k];
    }
  });

  it('returns null by default', async () => {
    expect(await getAuth()).toBeNull();
  });

  it('round-trips an OAuth bundle', async () => {
    const b = oauthBundle();
    await setAuth(b);
    expect(await getAuth()).toEqual(b);
  });

  it('round-trips an API-token bundle', async () => {
    const b = apiTokenBundle();
    await setAuth(b);
    expect(await getAuth()).toEqual(b);
  });

  it('clearAuth restores null', async () => {
    await setAuth(oauthBundle());
    await clearAuth();
    expect(await getAuth()).toBeNull();
  });

  it('setAuth makes exactly one underlying storage.set call (atomic write)', async () => {
    const setSpy = chrome.storage.local.set as ReturnType<typeof vi.fn>;
    setSpy.mockClear();
    await setAuth(oauthBundle());
    expect(setSpy).toHaveBeenCalledTimes(1);
  });
});

describe('hasValidAuth', () => {
  it('returns false for null', () => {
    expect(hasValidAuth(null)).toBe(false);
  });

  it('returns true when OAuth expires_at is in the future', () => {
    expect(
      hasValidAuth(oauthBundle({ expires_at: new Date(Date.now() + 120_000).toISOString() })),
    ).toBe(true);
  });

  it('returns false when OAuth expires_at is in the past', () => {
    expect(
      hasValidAuth(oauthBundle({ expires_at: new Date(Date.now() - 60_000).toISOString() })),
    ).toBe(false);
  });

  it('returns false when OAuth expires_at is unparseable', () => {
    expect(hasValidAuth(oauthBundle({ expires_at: 'not-a-date' }))).toBe(false);
  });

  it('returns true for an API-token bundle regardless of date (no expiry concept)', () => {
    expect(hasValidAuth(apiTokenBundle())).toBe(true);
  });
});
