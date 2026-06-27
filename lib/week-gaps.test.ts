import { describe, it, expect } from 'vitest';
import { hoursToSeconds } from './hours';
import { computeWeekGaps, gapSummary } from './week-gaps';
import type { WeekGrid, WeekGridRow } from './week-grid';

const DAYS = [
  '2026-06-15', // Mon
  '2026-06-16', // Tue
  '2026-06-17', // Wed
  '2026-06-18', // Thu
  '2026-06-19', // Fri
  '2026-06-20', // Sat
  '2026-06-21', // Sun
];

function row(
  category: WeekGridRow['category'],
  cellsSeconds: number[],
): WeekGridRow {
  return {
    key: category === 'pto' ? 'KNP-1' : 'PROJ-1',
    summary: category,
    category,
    cells: cellsSeconds.map((s) => ({ seconds: s, worklogs: [] })),
    cellsSeconds,
    rowTotalSeconds: cellsSeconds.reduce((a, b) => a + b, 0),
  };
}

function grid(
  rows: WeekGridRow[],
  dayTotalsSeconds: number[],
): WeekGrid {
  return { days: DAYS, rows, dayTotalsSeconds };
}

const H = (h: number): number => hoursToSeconds(h);

describe('computeWeekGaps', () => {
  it('a full week (every Mon–Fri >= target) has no gaps', () => {
    const totals = [H(8), H(8), H(8), H(8), H(8), 0, 0];
    const gaps = computeWeekGaps(grid([row('task', totals)], totals), {
      targetHours: 8,
    });
    expect(gaps).toEqual([]);
  });

  it('flags a single under-target weekday as a gap', () => {
    // Thu (index 3) logged 4h of 8h target.
    const totals = [H(8), H(8), H(8), H(4), H(8), 0, 0];
    const gaps = computeWeekGaps(grid([row('task', totals)], totals), {
      targetHours: 8,
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      dayIndex: 3,
      dayName: 'Thursday',
      loggedSeconds: H(4),
      targetSeconds: H(8),
    });
  });

  it('counts >= target exactly as complete (not a gap)', () => {
    const totals = [H(8), H(8), H(8), H(8), H(8), 0, 0];
    expect(
      computeWeekGaps(grid([row('task', totals)], totals), { targetHours: 8 }),
    ).toEqual([]);
  });

  it('a PTO day below target is NOT a gap', () => {
    // Fri (index 4) has a PTO worklog but only 4h — still complete via PTO.
    const ptoRow = row('pto', [0, 0, 0, 0, H(4), 0, 0]);
    const totals = [H(8), H(8), H(8), H(8), H(4), 0, 0];
    const gaps = computeWeekGaps(grid([ptoRow], totals), { targetHours: 8 });
    expect(gaps).toEqual([]);
  });

  it('counts under-target + no-PTO weekdays as gaps, in Mon→Fri order', () => {
    // Tue (1) and Thu (3) short, no PTO.
    const totals = [H(8), H(3), H(8), 0, H(8), 0, 0];
    const gaps = computeWeekGaps(grid([row('task', totals)], totals), {
      targetHours: 8,
    });
    expect(gaps.map((g) => g.dayIndex)).toEqual([1, 3]);
    expect(gaps.map((g) => g.dayName)).toEqual(['Tuesday', 'Thursday']);
  });

  it('NEVER evaluates the weekend — empty Sat/Sun are not gaps', () => {
    // Mon–Fri all complete; Sat/Sun empty.
    const totals = [H(8), H(8), H(8), H(8), H(8), 0, 0];
    expect(
      computeWeekGaps(grid([row('task', totals)], totals), { targetHours: 8 }),
    ).toEqual([]);
  });

  it('a fully empty week flags all five weekdays (NOT today-aware)', () => {
    const totals = [0, 0, 0, 0, 0, 0, 0];
    const gaps = computeWeekGaps(grid([], totals), { targetHours: 8 });
    expect(gaps.map((g) => g.dayIndex)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('gapSummary', () => {
  it('formats "<Weekday>: <Xh> logged / <T>h target, not marked PTO"', () => {
    const summary = gapSummary({
      dayIndex: 3,
      dayName: 'Thursday',
      loggedSeconds: H(4),
      targetSeconds: H(8),
    });
    expect(summary).toBe('Thursday: 4h logged / 8h target, not marked PTO');
  });

  it('renders an empty day as 0h logged', () => {
    const summary = gapSummary({
      dayIndex: 1,
      dayName: 'Tuesday',
      loggedSeconds: 0,
      targetSeconds: H(8),
    });
    expect(summary).toBe('Tuesday: 0h logged / 8h target, not marked PTO');
  });

  it('renders fractional logged hours one-decimal (e.g. 4.5h)', () => {
    const summary = gapSummary({
      dayIndex: 0,
      dayName: 'Monday',
      loggedSeconds: H(4.5),
      targetSeconds: H(8),
    });
    expect(summary).toBe('Monday: 4.5h logged / 8h target, not marked PTO');
  });
});
