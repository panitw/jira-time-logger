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

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { isDismissedToday, dismissForToday, bannerDismissedDatesItem } =
  await import('./banner-dismiss');

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('banner-dismiss', () => {
  beforeEach(() => {
    store.clear();
  });

  it('isDismissedToday is false when nothing is stored', async () => {
    expect(await isDismissedToday()).toBe(false);
  });

  it('dismissForToday then isDismissedToday is true (same reference date)', async () => {
    const ref = new Date('2026-06-27T10:00:00');
    await dismissForToday(ref);
    expect(await isDismissedToday(ref)).toBe(true);
  });

  it('appends today’s YYYY-MM-DD key', async () => {
    const ref = new Date('2026-06-27T10:00:00');
    await dismissForToday(ref);
    expect(await bannerDismissedDatesItem.getValue()).toContain('2026-06-27');
  });

  it('dedupes repeated dismissals on the same day', async () => {
    const ref = new Date('2026-06-27T10:00:00');
    await dismissForToday(ref);
    await dismissForToday(ref);
    const dates = await bannerDismissedDatesItem.getValue();
    expect(dates.filter((d) => d === '2026-06-27')).toHaveLength(1);
  });

  it('cross-day rollover: dismissed yesterday is NOT dismissed today', async () => {
    const yesterday = new Date('2026-06-26T10:00:00');
    const today = new Date('2026-06-27T10:00:00');
    await dismissForToday(yesterday);
    expect(await isDismissedToday(today)).toBe(false);
  });

  it('prunes dates older than ~7 days on write', async () => {
    // Seed a very stale date directly.
    await bannerDismissedDatesItem.setValue(['2026-01-01']);
    const ref = new Date('2026-06-27T10:00:00');
    await dismissForToday(ref);
    const dates = await bannerDismissedDatesItem.getValue();
    expect(dates).not.toContain('2026-01-01');
    expect(dates).toContain('2026-06-27');
  });

  it('keeps recent dates (within window) on write', async () => {
    const ref = new Date('2026-06-27T10:00:00');
    await bannerDismissedDatesItem.setValue([iso(new Date('2026-06-24T10:00:00'))]);
    await dismissForToday(ref);
    const dates = await bannerDismissedDatesItem.getValue();
    expect(dates).toContain('2026-06-24');
    expect(dates).toContain('2026-06-27');
  });

  it('isDismissedToday returns false defensively on read error', async () => {
    const spy = vi
      .spyOn(bannerDismissedDatesItem, 'getValue')
      .mockRejectedValueOnce(new Error('storage down'));
    expect(await isDismissedToday()).toBe(false);
    spy.mockRestore();
  });

  it('dismissForToday never throws on write error', async () => {
    const spy = vi
      .spyOn(bannerDismissedDatesItem, 'setValue')
      .mockRejectedValueOnce(new Error('storage down'));
    await expect(dismissForToday()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
