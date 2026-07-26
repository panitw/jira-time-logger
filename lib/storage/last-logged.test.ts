import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getLastLoggedTicket, setLastLoggedTicket, type LastLoggedTicket } from './last-logged';

const { mockGetValue, mockSetValue } = vi.hoisted(() => ({
  mockGetValue: vi.fn(),
  mockSetValue: vi.fn(),
}));

vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: vi.fn(() => ({
      getValue: mockGetValue,
      setValue: mockSetValue,
    })),
  },
}));

describe('last-logged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when nothing is stored', async () => {
    mockGetValue.mockResolvedValue(null);
    expect(await getLastLoggedTicket()).toBeNull();
  });

  it('round-trips a record through set and get', async () => {
    const record: LastLoggedTicket = {
      key: 'PROJ-1',
      summary: 'Fix the thing',
      seconds: 9000,
      startedAt: '2026-07-24T09:00:00.000Z',
      recordedAt: '2026-07-24T09:00:01.000Z',
    };
    mockGetValue.mockResolvedValue(record);

    await setLastLoggedTicket(record);
    expect(mockSetValue).toHaveBeenCalledWith(record);

    expect(await getLastLoggedTicket()).toEqual(record);
  });

  it('last write wins — a second write overwrites, it does not append', async () => {
    const first: LastLoggedTicket = {
      key: 'PROJ-1',
      summary: 'First',
      seconds: 3600,
      startedAt: '2026-07-24T09:00:00.000Z',
      recordedAt: '2026-07-24T09:00:01.000Z',
    };
    const second: LastLoggedTicket = {
      key: 'PROJ-2',
      summary: 'Second',
      seconds: 1800,
      startedAt: '2026-07-25T09:00:00.000Z',
      recordedAt: '2026-07-25T09:00:01.000Z',
    };

    await setLastLoggedTicket(first);
    await setLastLoggedTicket(second);

    expect(mockSetValue).toHaveBeenCalledTimes(2);
    expect(mockSetValue).toHaveBeenNthCalledWith(1, first);
    expect(mockSetValue).toHaveBeenNthCalledWith(2, second);
  });

  // ---- Defensive coercion (mirrors lib/storage/view-state.ts) ------------
  it('coerces a malformed stored value (missing fields) to null', async () => {
    mockGetValue.mockResolvedValue({ key: 'PROJ-1' });
    expect(await getLastLoggedTicket()).toBeNull();
  });

  it('coerces a stale non-object shape (e.g. a legacy boolean) to null', async () => {
    mockGetValue.mockResolvedValue(true);
    expect(await getLastLoggedTicket()).toBeNull();
  });

  it('coerces a value with the wrong field types to null', async () => {
    mockGetValue.mockResolvedValue({
      key: 'PROJ-1',
      summary: 'Fix',
      seconds: '9000', // wrong type — should be number
      startedAt: '2026-07-24T09:00:00.000Z',
      recordedAt: '2026-07-24T09:00:01.000Z',
    });
    expect(await getLastLoggedTicket()).toBeNull();
  });
});
