import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getPopupView, setPopupView, type PopupView } from './view-state';

const mockGetValue = vi.fn();
const mockSetValue = vi.fn();

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
});