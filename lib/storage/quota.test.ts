import { describe, it, expect, vi, beforeEach } from 'vitest';

const localStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  runtime: { id: 'test' },
  storage: {
    local: {
      get: vi.fn(async () => ({ ...localStore })),
      set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(localStore, obj)),
      remove: vi.fn(async (keys: string[]) => keys.forEach((k) => delete localStore[k])),
      getBytesInUse: vi.fn(async () => {
        let total = 0;
        for (const key of Object.keys(localStore)) {
          total += JSON.stringify(localStore[key]).length;
        }
        return total;
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

const { ensureQuota, clearCache } = await import('./quota');

describe('ensureQuota', () => {
  beforeEach(() => {
    for (const k of Object.keys(localStore)) delete localStore[k];
  });

  it('does nothing when storage is under quota', async () => {
    localStore['some-key'] = 'value';
    await ensureQuota();
    expect(localStore['some-key']).toBe('value');
  });

  it('evicts cache keys when near quota', async () => {
    localStore['local:tokens'] = 'secret';
    localStore['local:cache-entry1'] = 'x'.repeat(8 * 1024 * 1024);
    localStore['local:cycle-old'] = 'x'.repeat(2 * 1024 * 1024);
    await ensureQuota();
    // tokens preserved, cache key evicted
    expect(localStore['local:tokens']).toBe('secret');
  });

  it('logs warning when no evictable data', async () => {
    localStore['local:tokens'] = 'x'.repeat(9 * 1024 * 1024);
    await ensureQuota();
    expect(localStore['local:tokens']).toBeDefined();
  });
});

describe('clearCache', () => {
  beforeEach(() => {
    for (const k of Object.keys(localStore)) delete localStore[k];
  });

  it('clears cache/view-state/outbox keys', async () => {
    localStore['local:cache-old'] = 'data';
    localStore['local:cycle-1'] = 'data';
    localStore['local:view-state'] = 'data';
    localStore['local:outbox'] = 'data';
    localStore['local:banner-dismiss'] = 'data';
    localStore['local:recent-ticket'] = 'data';
    localStore['local:pinned-ticket'] = 'data';
    await clearCache();
    expect(localStore['local:cache-old']).toBeUndefined();
    expect(localStore['local:cycle-1']).toBeUndefined();
    expect(localStore['local:view-state']).toBeUndefined();
    expect(localStore['local:outbox']).toBeUndefined();
    expect(localStore['local:banner-dismiss']).toBeUndefined();
    expect(localStore['local:recent-ticket']).toBeUndefined();
    expect(localStore['local:pinned-ticket']).toBeUndefined();
  });

  it('preserves tokens and settings', async () => {
    localStore['local:tokens'] = 'secret';
    localStore['local:managerDisplayName'] = 'Marco';
    localStore['local:catchAllProjectKey'] = 'KNP';
    localStore['local:cache-old'] = 'data';
    await clearCache();
    expect(localStore['local:tokens']).toBe('secret');
    expect(localStore['local:managerDisplayName']).toBe('Marco');
    expect(localStore['local:catchAllProjectKey']).toBe('KNP');
    expect(localStore['local:cache-old']).toBeUndefined();
  });
});