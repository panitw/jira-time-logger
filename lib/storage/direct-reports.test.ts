import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory storage backing the wxt storage.defineItem mock.
const store = new Map<string, unknown>();

vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: <T,>(key: string, opts: { fallback: T }) => ({
      getValue: vi.fn(async () => (store.has(key) ? (store.get(key) as T) : opts.fallback)),
      setValue: vi.fn(async (value: T) => {
        store.set(key, value);
      }),
      watch: vi.fn(() => () => {}),
    }),
  },
}));

const {
  getCachedDirectReports,
  setCachedDirectReports,
  DIRECT_REPORTS_TTL_MS,
} = await import('./direct-reports');

describe('direct-reports cache', () => {
  beforeEach(() => {
    store.clear();
    vi.useRealTimers();
  });

  it('returns null when nothing is cached', async () => {
    expect(await getCachedDirectReports('acc-A')).toBeNull();
  });

  it('round-trips a set then get as fresh', async () => {
    const reports = [{ accountId: 'r1', displayName: 'Report One' }];
    await setCachedDirectReports('acc-A', reports);
    const cached = await getCachedDirectReports('acc-A');
    expect(cached).not.toBeNull();
    expect(cached?.reports).toEqual(reports);
    expect(cached?.fresh).toBe(true);
  });

  it('round-trips an empty report set (manager of nobody)', async () => {
    await setCachedDirectReports('acc-A', []);
    const cached = await getCachedDirectReports('acc-A');
    expect(cached?.reports).toEqual([]);
    expect(cached?.fresh).toBe(true);
  });

  it('treats a cache older than the TTL as stale (fresh = false)', async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    await setCachedDirectReports('acc-A', [{ accountId: 'r1', displayName: 'R1' }]);
    // Advance past the TTL boundary.
    vi.setSystemTime(now + DIRECT_REPORTS_TTL_MS + 1);
    const cached = await getCachedDirectReports('acc-A');
    expect(cached).not.toBeNull();
    expect(cached?.fresh).toBe(false);
  });

  it('does not return a cache keyed for a different account', async () => {
    await setCachedDirectReports('acc-A', [{ accountId: 'r1', displayName: 'R1' }]);
    expect(await getCachedDirectReports('acc-B')).toBeNull();
  });

  it('coerces a malformed/legacy stored value to null', async () => {
    store.set('local:directReports', { not: 'a valid shape' });
    expect(await getCachedDirectReports('acc-A')).toBeNull();
  });

  it('coerces a stored value with non-array reports to null', async () => {
    store.set('local:directReports', { accountId: 'acc-A', reports: 'nope', fetchedAt: Date.now() });
    expect(await getCachedDirectReports('acc-A')).toBeNull();
  });
});
