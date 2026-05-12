import { describe, it, expect, beforeEach, vi } from 'vitest';

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
const { getTokens, setTokens, clearTokens, hasValidTokens } = tokensModule;

describe('storage/tokens', () => {
  beforeEach(async () => {
    for (const k of Object.keys(memoryStore)) {
      delete memoryStore[k];
    }
  });

  it('returns null by default', async () => {
    expect(await getTokens()).toBeNull();
  });

  it('round-trips a token bundle via set + get', async () => {
    const bundle = {
      access_token: 'a',
      refresh_token: 'r',
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      cloudId: 'cloud-1',
    };
    await setTokens(bundle);
    expect(await getTokens()).toEqual(bundle);
  });

  it('clearTokens restores null', async () => {
    await setTokens({
      access_token: 'a',
      refresh_token: 'r',
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      cloudId: 'cloud-1',
    });
    await clearTokens();
    expect(await getTokens()).toBeNull();
  });

  it('setTokens makes exactly one underlying storage.set call (atomic write)', async () => {
    const setSpy = chrome.storage.local.set as ReturnType<typeof vi.fn>;
    setSpy.mockClear();
    await setTokens({
      access_token: 'a',
      refresh_token: 'r',
      expires_at: new Date().toISOString(),
      cloudId: 'cloud-1',
    });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });
});

describe('hasValidTokens', () => {
  it('returns false for null', () => {
    expect(hasValidTokens(null)).toBe(false);
  });

  it('returns true when expires_at is in the future', () => {
    expect(
      hasValidTokens({
        access_token: 'a',
        refresh_token: 'r',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        cloudId: 'c',
      }),
    ).toBe(true);
  });

  it('returns false when expires_at is in the past', () => {
    expect(
      hasValidTokens({
        access_token: 'a',
        refresh_token: 'r',
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        cloudId: 'c',
      }),
    ).toBe(false);
  });

  it('returns false for an invalid expires_at string', () => {
    expect(
      hasValidTokens({
        access_token: 'a',
        refresh_token: 'r',
        expires_at: 'not-a-date',
        cloudId: 'c',
      }),
    ).toBe(false);
  });
});
