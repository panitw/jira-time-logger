import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';

import {
  currentCycleRange,
  getCurrentCycleId,
  isWithinCycle,
  workdaysSoFar,
} from './cycle-range';

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

describe('getCurrentCycleId', () => {
  it('returns yyyy-MM for calendar-month', () => {
    const ref = new Date(2026, 5, 15, 10, 0, 0); // Jun 15 2026
    expect(getCurrentCycleId('calendar-month', ref)).toBe('2026-06');
  });

  it('returns yyyy-MM for an unknown cadence (default branch)', () => {
    const ref = new Date(2026, 11, 3); // Dec 2026
    expect(getCurrentCycleId('something-else', ref)).toBe('2026-12');
  });

  it('returns the Monday yyyy-MM-dd matching currentCycleRange("weekly").start', () => {
    const ref = new Date(2026, 5, 17, 14, 30, 0); // Wed Jun 17 2026
    const expected = format(currentCycleRange('weekly', ref).start, 'yyyy-MM-dd');
    expect(getCurrentCycleId('weekly', ref)).toBe(expected);
    // Sanity: the week of Wed Jun 17 2026 starts Mon Jun 15 2026.
    expect(getCurrentCycleId('weekly', ref)).toBe('2026-06-15');
  });

  it('is stable across dates within the same calendar-month cycle', () => {
    const a = getCurrentCycleId('calendar-month', new Date(2026, 5, 1));
    const b = getCurrentCycleId('calendar-month', new Date(2026, 5, 30, 23, 0, 0));
    expect(a).toBe(b);
  });

  it('is stable across dates within the same weekly cycle', () => {
    // Mon Jun 15 .. Sun Jun 21 2026 all map to the same Monday.
    const mon = getCurrentCycleId('weekly', new Date(2026, 5, 15, 8, 0, 0));
    const sun = getCurrentCycleId('weekly', new Date(2026, 5, 21, 22, 0, 0));
    expect(mon).toBe(sun);
    expect(mon).toBe('2026-06-15');
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

describe('workdaysSoFar', () => {
  // Week of Jun 15 2026: Mon Jun 15 ... Sun Jun 21.
  it('returns 1 on Monday', () => {
    expect(workdaysSoFar(new Date(2026, 5, 15, 9, 0, 0))).toBe(1); // Mon
  });

  it('returns 2 on Tuesday', () => {
    expect(workdaysSoFar(new Date(2026, 5, 16, 9, 0, 0))).toBe(2); // Tue
  });

  it('returns 3 on Wednesday', () => {
    expect(workdaysSoFar(new Date(2026, 5, 17, 9, 0, 0))).toBe(3); // Wed
  });

  it('returns 5 on Friday', () => {
    expect(workdaysSoFar(new Date(2026, 5, 19, 9, 0, 0))).toBe(5); // Fri
  });

  it('returns 5 on Saturday (weekend caps at 5)', () => {
    expect(workdaysSoFar(new Date(2026, 5, 20, 9, 0, 0))).toBe(5); // Sat
  });

  it('returns 5 on Sunday (weekend caps at 5)', () => {
    expect(workdaysSoFar(new Date(2026, 5, 21, 9, 0, 0))).toBe(5); // Sun
  });

  it('counts from the same Monday boundary as currentCycleRange("weekly")', () => {
    const ref = new Date(2026, 5, 18, 14, 30, 0); // Thu
    const { start } = currentCycleRange('weekly', ref);
    expect(start.getDay()).toBe(1); // Monday anchor
    expect(workdaysSoFar(ref)).toBe(4); // Mon..Thu inclusive
  });
});
