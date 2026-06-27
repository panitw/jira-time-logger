import { describe, it, expect } from 'vitest';
import { currentWeekMonday } from './week-of';

describe('currentWeekMonday', () => {
  it('returns the same Monday for a mid-week reference', () => {
    // 2026-06-17 is a Wednesday → Monday is 2026-06-15.
    expect(currentWeekMonday(new Date(2026, 5, 17, 10, 0, 0))).toBe('2026-06-15');
  });

  it('returns the date itself when reference is Monday', () => {
    expect(currentWeekMonday(new Date(2026, 5, 15, 0, 0, 0))).toBe('2026-06-15');
  });

  it('rolls a Sunday back to the PRECEDING Monday (not forward)', () => {
    // 2026-06-21 is a Sunday → Monday is 2026-06-15 (six days back).
    expect(currentWeekMonday(new Date(2026, 5, 21, 23, 0, 0))).toBe('2026-06-15');
  });

  it('uses LOCAL date — late-evening Monday does not roll to Sunday', () => {
    // Local midnight Monday must format as that Monday regardless of TZ offset.
    expect(currentWeekMonday(new Date(2026, 5, 15, 23, 59, 0))).toBe('2026-06-15');
  });

  it('crosses a month boundary correctly', () => {
    // 2026-07-01 is a Wednesday → Monday is 2026-06-29.
    expect(currentWeekMonday(new Date(2026, 6, 1, 9, 0, 0))).toBe('2026-06-29');
  });

  it('zero-pads single-digit months and days', () => {
    // 2026-03-04 is a Wednesday → Monday is 2026-03-02.
    expect(currentWeekMonday(new Date(2026, 2, 4, 9, 0, 0))).toBe('2026-03-02');
  });

  it('defaults to now when no reference is given (smoke)', () => {
    expect(currentWeekMonday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
