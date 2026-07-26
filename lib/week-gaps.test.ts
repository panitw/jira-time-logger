import { describe, it, expect } from 'vitest';
import { hoursToSeconds } from './hours';
import { computeWeekGaps, gapDayNote, WORKDAYS_PER_WEEK } from './week-gaps';
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

const TODAY = '2026-06-19'; // Friday — treats the whole Mon-Fri week as elapsed

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

  it('counts under-target weekdays as gaps, in Mon→Fri order', () => {
    // Tue (1) and Thu (3) short.
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

  // --- Story 7.7 / D-7.6-38 / D-7.7-27 / D-7.7-19 -----------------------
  // week-gaps.ts:61's closed bug: a half-day-off day used to be excluded
  // from the gap check entirely (`if (ptoDays[i]) continue`), letting a
  // week be marked done while genuinely short. These three cases pin the
  // fix. RED-proved by restoring the deleted `if (ptoDays[i]) continue`
  // guard (and the `ptoDays` accumulator) — each of the three would fail.
  describe('time-off days (guard removed — D-7.7-19)', () => {
    it('a full day off (8h off, nothing else, 8h target) is NOT a gap', () => {
      // Wed (index 2): 8h PTO, dayTotalsSeconds already includes it.
      const ptoRow = row('pto', [0, 0, H(8), 0, 0, 0, 0]);
      const totals = [H(8), H(8), H(8), H(8), H(8), 0, 0];
      const gaps = computeWeekGaps(grid([ptoRow], totals), { targetHours: 8 });
      expect(gaps.map((g) => g.dayIndex)).not.toContain(2);
    });

    it('a HALF day off (4h off, nothing else, 8h target) IS a gap, 4h short — the bug, now fixed', () => {
      const ptoRow = row('pto', [0, 0, H(4), 0, 0, 0, 0]);
      const totals = [H(8), H(8), H(4), H(8), H(8), 0, 0];
      const gaps = computeWeekGaps(grid([ptoRow], totals), { targetHours: 8 });
      const wed = gaps.find((g) => g.dayIndex === 2);
      expect(wed).toBeTruthy();
      expect(wed?.loggedSeconds).toBe(H(4));
      expect((wed?.targetSeconds ?? 0) - (wed?.loggedSeconds ?? 0)).toBe(H(4));
    });

    it('a half day off (4h) PLUS 4h of ordinary work (8h total, 8h target) is NOT a gap', () => {
      const ptoRow = row('pto', [0, 0, H(4), 0, 0, 0, 0]);
      const taskRow = row('task', [0, 0, H(4), 0, 0, 0, 0]);
      const totals = [H(8), H(8), H(8), H(8), H(8), 0, 0]; // Wed: 4h pto + 4h task = 8h
      const gaps = computeWeekGaps(grid([ptoRow, taskRow], totals), {
        targetHours: 8,
      });
      expect(gaps.map((g) => g.dayIndex)).not.toContain(2);
    });

    it('does not double-count: a full day off never reads as 16h against an 8h target', () => {
      const ptoRow = row('pto', [0, 0, H(8), 0, 0, 0, 0]);
      const totals = [H(8), H(8), H(8), H(8), H(8), 0, 0];
      const g = grid([ptoRow], totals);
      // dayTotalsSeconds is the single source of truth — never summed twice.
      expect(g.dayTotalsSeconds[2]).toBe(H(8));
      const gaps = computeWeekGaps(g, { targetHours: 8 });
      expect(gaps).toEqual([]);
    });
  });
});

describe('WORKDAYS_PER_WEEK', () => {
  it('is 5 (Mon–Fri)', () => {
    expect(WORKDAYS_PER_WEEK).toBe(5);
  });
});

describe('gapDayNote', () => {
  it('reuses the shared dayStatusNote vocabulary for an ordinary short day (past, elapsed)', () => {
    const gap = {
      dayIndex: 3,
      dayName: 'Thursday',
      loggedSeconds: H(4),
      targetSeconds: H(8),
      iso: '2026-06-18',
      timeOffSeconds: 0,
    };
    expect(gapDayNote(gap, TODAY)).toBe('4h short');
  });

  it('describes a half-day-off day honestly — never the old fixed suffix', () => {
    const gap = {
      dayIndex: 2,
      dayName: 'Wednesday',
      loggedSeconds: H(4),
      targetSeconds: H(8),
      iso: '2026-06-17',
      timeOffSeconds: H(4),
    };
    const note = gapDayNote(gap, TODAY);
    expect(note).toContain('Half-day time off');
    expect(note).not.toContain('not marked time off');
  });

  // Finisher fix, D-7.7-20 / Finding 4: a near-full time-off booking under
  // target (7.5h of an 8h target) must never claim "Half-day" — it took the
  // WHOLE day, just booked a different number of hours than the configured
  // target. RED-proved by reverting `dayStatusNote`'s `isActualHalf` arm.
  it('a near-full time-off day (7.5h of 8h target) reads the real hours, never "Half-day"', () => {
    const gap = {
      dayIndex: 2,
      dayName: 'Wednesday',
      loggedSeconds: H(7.5),
      targetSeconds: H(8),
      iso: '2026-06-17',
      timeOffSeconds: H(7.5),
    };
    const note = gapDayNote(gap, TODAY);
    expect(note).toBe('Time off · 7.5h · 0.5h short');
    expect(note).not.toContain('Half-day');
  });
});

// Finisher fix, D-7.7-20: the owner ruling's four mandated cases, exercised
// end-to-end through BOTH `computeWeekGaps` (the gap RULE, unchanged/
// uniform) and `gapDayNote` (the NOTE, fixed). "Full day at target" and
// "half day" are pinned above/elsewhere; these two close the ruling's
// explicit "full day under target" and "normal short day" cases together.
describe('D-7.7-20: a full-day time-off booking under target is a gap, accurately worded', () => {
  it('7.5h time off against an 8h target IS a gap (uniform rule, no exemption) and the note states the real shortfall', () => {
    const ptoRow = row('pto', [0, 0, H(7.5), 0, 0, 0, 0]);
    const totals = [H(8), H(8), H(7.5), H(8), H(8), 0, 0];
    const gaps = computeWeekGaps(grid([ptoRow], totals), { targetHours: 8 });
    const wed = gaps.find((g) => g.dayIndex === 2);
    expect(wed).toBeTruthy();
    expect(gapDayNote(wed!, TODAY)).toBe('Time off · 7.5h · 0.5h short');
  });

  it('a normal short workday (no time off) is still a gap with the plain shortfall note', () => {
    const totals = [H(8), H(8), H(3), H(8), H(8), 0, 0];
    const gaps = computeWeekGaps(grid([row('task', totals)], totals), { targetHours: 8 });
    const wed = gaps.find((g) => g.dayIndex === 2);
    expect(wed).toBeTruthy();
    expect(gapDayNote(wed!, TODAY)).toBe('5h short');
  });
});

// `gapSummary` and its tests were REMOVED by the finisher pass (D-7.7-21b):
// the AC7 dialog rebuild stopped calling it (composes its own evidence row
// instead), so these four tests protected code no user could reach. See
// `lib/week-gaps.ts`'s removal comment for the accessibility-equivalence
// investigation that justified deleting rather than re-attaching it.
