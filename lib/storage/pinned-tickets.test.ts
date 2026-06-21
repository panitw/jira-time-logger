import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
  },
});

vi.mock('wxt/utils/storage', () => {
  let store: { key: string; value: unknown }[] = [];
  return {
    storage: {
      defineItem: <T,>(key: string, opts: { fallback: T }) => ({
        getValue: vi.fn(async () => {
          const item = store.find((s) => s.key === key);
          return item ? (item.value as T) : opts.fallback;
        }),
        setValue: vi.fn(async (value: T) => {
          store = store.filter((s) => s.key !== key);
          store.push({ key, value });
        }),
        watch: vi.fn(() => () => {}),
      }),
    },
  };
});

const {
  getPinnedTickets,
  addPinnedTicket,
  removePinnedTicket,
} = await import('./pinned-tickets');

describe('pinned-tickets', () => {
  beforeEach(async () => {
    const items = await getPinnedTickets();
    for (const item of items) {
      await removePinnedTicket(item.key);
    }
  });

  it('returns empty array by default', async () => {
    const tickets = await getPinnedTickets();
    expect(tickets).toEqual([]);
  });

  it('adds a pinned ticket', async () => {
    await addPinnedTicket('PROJ-123', 'Fix bug');
    const tickets = await getPinnedTickets();
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.key).toBe('PROJ-123');
    expect(tickets[0]!.summary).toBe('Fix bug');
    expect(tickets[0]!.pinnedAt).toBeTruthy();
  });

  it('deduplicates by key (moves to front)', async () => {
    await addPinnedTicket('PROJ-1', 'First');
    await addPinnedTicket('PROJ-2', 'Second');
    await addPinnedTicket('PROJ-1', 'First updated');
    const tickets = await getPinnedTickets();
    expect(tickets).toHaveLength(2);
    expect(tickets[0]!.key).toBe('PROJ-1');
    expect(tickets[0]!.summary).toBe('First updated');
    expect(tickets[1]!.key).toBe('PROJ-2');
  });

  it('caps at 10 entries (FIFO eviction)', async () => {
    for (let i = 1; i <= 12; i++) {
      await addPinnedTicket(`PROJ-${i}`, `Ticket ${i}`);
    }
    const tickets = await getPinnedTickets();
    expect(tickets).toHaveLength(10);
    expect(tickets[0]!.key).toBe('PROJ-12');
    expect(tickets[9]!.key).toBe('PROJ-3');
  });

  it('removes a pinned ticket', async () => {
    await addPinnedTicket('PROJ-1', 'First');
    await addPinnedTicket('PROJ-2', 'Second');
    await removePinnedTicket('PROJ-1');
    const tickets = await getPinnedTickets();
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.key).toBe('PROJ-2');
  });

  it('remove is a no-op for non-existent key', async () => {
    await addPinnedTicket('PROJ-1', 'First');
    await removePinnedTicket('PROJ-999');
    const tickets = await getPinnedTickets();
    expect(tickets).toHaveLength(1);
  });
});
