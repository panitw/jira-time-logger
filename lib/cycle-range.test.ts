import { describe, it, expect } from 'vitest';
import { currentCycleRange, isWithinCycle } from './cycle-range';

describe('currentCycleRange', () => {
  it('returns calendar-month range by default', () => {
    const ref = new Date(2026, 5, 15, 10, 0, 0); // Jun 15
    const range = currentCycleRange('calendar-month', ref);
    expect(range.start).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0));
    expect(range.end).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999));
  });

  it('returns weekly range (Monday-Sunday)', () => {
    const ref = new Date(2026, 5, 17, 10, 0, 0); // Wed Jun 17
    const range = currentCycleRange('weekly', ref);
    expect(range.start.getDay()).toBe(1); // Monday
    expect(range.end.getDay()).toBe(0); // Sunday
  });

  it('handles December → end of year', () => {
    const ref = new Date(2026, 11, 15); // Dec 15
    const range = currentCycleRange('calendar-month', ref);
    expect(range.start).toEqual(new Date(2026, 11, 1, 0, 0, 0, 0));
    expect(range.end).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
  });
});

describe('isWithinCycle', () => {
  it('returns true for date within current month', () => {
    const ref = new Date(2026, 5, 15);
    expect(isWithinCycle(new Date(2026, 5, 10), 'calendar-month', ref)).toBe(true);
  });

  it('returns false for date outside current month', () => {
    const ref = new Date(2026, 5, 15);
    expect(isWithinCycle(new Date(2026, 4, 30), 'calendar-month', ref)).toBe(false);
  });

  it('returns true for first day of month', () => {
    const ref = new Date(2026, 5, 15);
    expect(isWithinCycle(new Date(2026, 5, 1), 'calendar-month', ref)).toBe(true);
  });

  it('returns true for last day of month', () => {
    const ref = new Date(2026, 5, 15);
    expect(isWithinCycle(new Date(2026, 5, 30), 'calendar-month', ref)).toBe(true);
  });
});
