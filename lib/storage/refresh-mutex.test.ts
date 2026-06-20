import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

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
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete sessionStore[k];
      }),
    },
  },
  runtime: { id: 'test-extension' },
});

const { acquireRefreshLock, releaseRefreshLock, isRefreshing } =
  await import('./refresh-mutex');

describe('refresh-mutex', () => {
  beforeEach(() => {
    for (const k of Object.keys(sessionStore)) delete sessionStore[k];
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('acquireRefreshLock', () => {
    it('returns true when key is absent', async () => {
      const got = await acquireRefreshLock();
      expect(got).toBe(true);
    });

    it('sets the mutex key in session storage on acquire', async () => {
      await acquireRefreshLock();
      const stored = await chrome.storage.session.get('oauth.refreshInFlight');
      expect(stored['oauth.refreshInFlight']).toBeDefined();
      expect(typeof stored['oauth.refreshInFlight']).toBe('number');
    });

    it('returns false when key is already present', async () => {
      await acquireRefreshLock();
      const second = await acquireRefreshLock();
      expect(second).toBe(false);
    });

    it('allows re-acquire after release', async () => {
      expect(await acquireRefreshLock()).toBe(true);
      await releaseRefreshLock();
      expect(await acquireRefreshLock()).toBe(true);
    });

    it('handles double-acquire pattern correctly', async () => {
      const first = await acquireRefreshLock();
      expect(first).toBe(true);
      const second = await acquireRefreshLock();
      expect(second).toBe(false);
      await releaseRefreshLock();
      const third = await acquireRefreshLock();
      expect(third).toBe(true);
    });

    it('reclaims stale lock after TTL expires', async () => {
      vi.useFakeTimers();
      await acquireRefreshLock();
      vi.advanceTimersByTime(31_000);
      const reacquired = await acquireRefreshLock();
      expect(reacquired).toBe(true);
      await releaseRefreshLock();
      const after = await isRefreshing();
      expect(after).toBe(false);
    });

    it('does NOT reclaim a lock still within TTL', async () => {
      vi.useFakeTimers();
      await acquireRefreshLock();
      vi.advanceTimersByTime(10_000);
      const second = await acquireRefreshLock();
      expect(second).toBe(false);
    });
  });

  describe('releaseRefreshLock', () => {
    it('removes the mutex key from session storage', async () => {
      await acquireRefreshLock();
      const before = await isRefreshing();
      expect(before).toBe(true);

      await releaseRefreshLock();
      const after = await isRefreshing();
      expect(after).toBe(false);
    });

    it('is safe to call when no lock is held', async () => {
      await expect(releaseRefreshLock()).resolves.toBeUndefined();
    });
  });

  describe('isRefreshing', () => {
    it('returns false when no lock is held', async () => {
      expect(await isRefreshing()).toBe(false);
    });

    it('returns true when lock is held', async () => {
      await acquireRefreshLock();
      expect(await isRefreshing()).toBe(true);
    });

    it('returns false after lock is released', async () => {
      await acquireRefreshLock();
      await releaseRefreshLock();
      expect(await isRefreshing()).toBe(false);
    });
  });
});
