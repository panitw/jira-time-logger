import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, unknown>();
let failReads = false;
let failWrites = false;

vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: <T,>(key: string, opts: { fallback: T }) => ({
      getValue: vi.fn(async () => {
        if (failReads) throw new Error('storage unavailable');
        return store.has(key) ? (store.get(key) as T) : opts.fallback;
      }),
      setValue: vi.fn(async (value: T) => {
        if (failWrites) throw new Error('quota exceeded');
        store.set(key, value);
      }),
      watch: vi.fn(() => () => {}),
    }),
  },
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { getDismissedResumeKey, dismissResumeKey, resumeDismissedKeyItem } =
  await import('./resume-dismiss');

describe('resume-dismiss', () => {
  beforeEach(() => {
    store.clear();
    failReads = false;
    failWrites = false;
  });

  it('reports null when nothing has been dismissed', async () => {
    expect(await getDismissedResumeKey()).toBeNull();
  });

  it('round-trips a dismissed key', async () => {
    await dismissResumeKey('PROJ-1');
    expect(await getDismissedResumeKey()).toBe('PROJ-1');
  });

  it('dismissing a second ticket REPLACES the first — A returns if it comes back', async () => {
    // The intended reading of "hidden until a different ticket": only one
    // ticket is ever the resume ticket, so only one dismissal is live.
    await dismissResumeKey('PROJ-1');
    await dismissResumeKey('PROJ-2');
    expect(await getDismissedResumeKey()).toBe('PROJ-2');
  });

  it('treats an empty-string key as not dismissed — never hides a card on a falsy match', async () => {
    await resumeDismissedKeyItem.setValue('');
    expect(await getDismissedResumeKey()).toBeNull();
  });

  it('fails OPEN on a read error — shows the card rather than hiding it', async () => {
    await dismissResumeKey('PROJ-1');
    failReads = true;
    expect(await getDismissedResumeKey()).toBeNull();
  });

  it('swallows a write error — never throws into the click handler', async () => {
    failWrites = true;
    await expect(dismissResumeKey('PROJ-1')).resolves.toBeUndefined();
  });
});
