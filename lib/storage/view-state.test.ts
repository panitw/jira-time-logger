import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getPopupView,
  setPopupView,
  getMarkDoneState,
  setWeekMarkedDone,
  clearWeekMarkedDone,
  type PopupView,
} from './view-state';

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

describe('view-state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns default value { kind: "today" } when nothing is stored', async () => {
    mockGetValue.mockResolvedValue({ kind: 'today' as const });
    const view = await getPopupView();
    expect(view).toEqual({ kind: 'today' });
  });

  it('round-trips a PopupView through set and get', async () => {
    const view: PopupView = { kind: 'week', weekOf: '2026-06-16' };
    mockGetValue.mockResolvedValue(view);

    await setPopupView(view);
    expect(mockSetValue).toHaveBeenCalledWith(view);

    const result = await getPopupView();
    expect(result).toEqual(view);
  });

  it('persists week view with weekOf', async () => {
    const view: PopupView = { kind: 'week', weekOf: '2026-06-22' };
    mockGetValue.mockResolvedValue(view);

    await setPopupView(view);
    expect(mockSetValue).toHaveBeenCalledWith({ kind: 'week', weekOf: '2026-06-22' });

    const result = await getPopupView();
    expect(result.kind).toBe('week');
    if (result.kind === 'week') {
      expect(result.weekOf).toBe('2026-06-22');
    }
  });

  describe('mark-week-as-done flag (Story 4.5)', () => {
    it('returns null when nothing is marked done', async () => {
      mockGetValue.mockResolvedValue(null);
      expect(await getMarkDoneState()).toBeNull();
    });

    it('setWeekMarkedDone writes { weekOf, markedDoneAt }', async () => {
      await setWeekMarkedDone('2026-06-15');
      expect(mockSetValue).toHaveBeenCalledWith(
        expect.objectContaining({ weekOf: '2026-06-15' }),
      );
      const written = mockSetValue.mock.calls[0]?.[0] as {
        weekOf: string;
        markedDoneAt: string;
      };
      expect(typeof written.markedDoneAt).toBe('string');
      // markedDoneAt is a valid ISO timestamp.
      expect(Number.isNaN(Date.parse(written.markedDoneAt))).toBe(false);
    });

    it('round-trips a marked-done state through set and get', async () => {
      const state = { weekOf: '2026-06-15', markedDoneAt: '2026-06-19T17:00:00.000Z' };
      mockGetValue.mockResolvedValue(state);
      expect(await getMarkDoneState()).toEqual(state);
    });

    it('clearWeekMarkedDone writes null', async () => {
      await clearWeekMarkedDone();
      expect(mockSetValue).toHaveBeenCalledWith(null);
    });
  });
});