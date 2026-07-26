import { describe, it, expect } from 'vitest';
import { hoursToSeconds } from '@/lib/hours';
import type { WeekIssueWorklogs } from '@/lib/jira-types';
import type { WeekGrid, WeekGridCell, WeekGridRow } from '@/lib/week-grid';
import { buildWeekGrid, cellEditability, computeDayStatuses } from '@/lib/week-grid';

const WEEK_OF = '2026-06-15'; // Monday

function wl(seconds: number, started: string) {
  return { id: `${started}-${seconds}`, timeSpentSeconds: seconds, started };
}

describe('buildWeekGrid', () => {
  it('exposes the 7 ISO days Mon..Sun derived from weekOf', () => {
    const grid = buildWeekGrid([], {
      weekOf: WEEK_OF,
      catchAllProjectKey: 'KNP',
      ptoSubtaskKey: 'KNP-1',
    });
    expect(grid.days).toEqual([
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
      '2026-06-19',
      '2026-06-20',
      '2026-06-21',
    ]);
  });

  it('buckets worklogs into [issue][dayIndex] and sums seconds per cell', () => {
    const issues: WeekIssueWorklogs[] = [
      {
        key: 'PROJ-1',
        summary: 'Task A',
        worklogs: [
          wl(hoursToSeconds(4), '2026-06-15T09:00:00.000+0000'), // Mon
          wl(hoursToSeconds(2), '2026-06-15T13:00:00.000+0000'), // Mon (same day, sums)
          wl(hoursToSeconds(1), '2026-06-17T09:00:00.000+0000'), // Wed
        ],
      },
    ];
    const grid = buildWeekGrid(issues, {
      weekOf: WEEK_OF,
      catchAllProjectKey: 'KNP',
      ptoSubtaskKey: 'KNP-1',
    });
    expect(grid.rows).toHaveLength(1);
    const row = grid.rows[0]!;
    expect(row.cellsSeconds[0]).toBe(hoursToSeconds(6)); // Mon: 4 + 2
    expect(row.cellsSeconds[2]).toBe(hoursToSeconds(1)); // Wed
    expect(row.cellsSeconds[1]).toBe(0); // Tue empty
    expect(row.rowTotalSeconds).toBe(hoursToSeconds(7));
  });

  it('computes per-day totals across all rows', () => {
    const issues: WeekIssueWorklogs[] = [
      {
        key: 'PROJ-1',
        summary: 'A',
        worklogs: [wl(hoursToSeconds(3), '2026-06-15T09:00:00.000+0000')], // Mon
      },
      {
        key: 'PROJ-2',
        summary: 'B',
        worklogs: [wl(hoursToSeconds(5), '2026-06-15T09:00:00.000+0000')], // Mon
      },
    ];
    const grid = buildWeekGrid(issues, {
      weekOf: WEEK_OF,
      catchAllProjectKey: 'KNP',
      ptoSubtaskKey: 'KNP-1',
    });
    expect(grid.dayTotalsSeconds[0]).toBe(hoursToSeconds(8)); // Mon
    expect(grid.dayTotalsSeconds[1]).toBe(0); // Tue
  });

  it('orders rows: Task by total desc, then catch-all, then PTO last', () => {
    const issues: WeekIssueWorklogs[] = [
      {
        key: 'KNP-1',
        summary: 'PTO',
        worklogs: [wl(hoursToSeconds(8), '2026-06-15T09:00:00.000+0000')],
      },
      {
        key: 'KNP-9',
        summary: 'Meetings (catch-all)',
        worklogs: [wl(hoursToSeconds(2), '2026-06-16T09:00:00.000+0000')],
      },
      {
        key: 'PROJ-10',
        summary: 'Small task',
        worklogs: [wl(hoursToSeconds(1), '2026-06-16T09:00:00.000+0000')],
      },
      {
        key: 'PROJ-20',
        summary: 'Big task',
        worklogs: [wl(hoursToSeconds(10), '2026-06-16T09:00:00.000+0000')],
      },
    ];
    const grid = buildWeekGrid(issues, {
      weekOf: WEEK_OF,
      catchAllProjectKey: 'KNP',
      ptoSubtaskKey: 'KNP-1',
    });
    expect(grid.rows.map((r) => r.key)).toEqual([
      'PROJ-20', // task, biggest
      'PROJ-10', // task, smaller
      'KNP-9', // catch-all
      'KNP-1', // PTO last
    ]);
    expect(grid.rows.map((r) => r.category)).toEqual([
      'task',
      'task',
      'catch-all',
      'pto',
    ]);
  });

  it('sinks the PTO row last even though its key is catch-all-prefixed', () => {
    const issues: WeekIssueWorklogs[] = [
      {
        key: 'KNP-1',
        summary: 'PTO',
        worklogs: [wl(hoursToSeconds(8), '2026-06-15T09:00:00.000+0000')],
      },
      {
        key: 'KNP-2',
        summary: 'Admin',
        worklogs: [wl(hoursToSeconds(2), '2026-06-15T09:00:00.000+0000')],
      },
    ];
    const grid = buildWeekGrid(issues, {
      weekOf: WEEK_OF,
      catchAllProjectKey: 'KNP',
      ptoSubtaskKey: 'KNP-1',
    });
    expect(grid.rows.map((r) => r.key)).toEqual(['KNP-2', 'KNP-1']);
    expect(grid.rows.map((r) => r.category)).toEqual(['catch-all', 'pto']);
  });

  it('returns an empty-week shape: 7 days, no rows, zero day totals', () => {
    const grid = buildWeekGrid([], {
      weekOf: WEEK_OF,
      catchAllProjectKey: 'KNP',
      ptoSubtaskKey: 'KNP-1',
    });
    expect(grid.rows).toHaveLength(0);
    expect(grid.days).toHaveLength(7);
    expect(grid.dayTotalsSeconds).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('excludes a worklog whose started falls outside the week', () => {
    const issues: WeekIssueWorklogs[] = [
      {
        key: 'PROJ-1',
        summary: 'A',
        worklogs: [
          wl(hoursToSeconds(4), '2026-06-16T09:00:00.000+0000'), // Tue, in week
          wl(hoursToSeconds(9), '2026-06-22T09:00:00.000+0000'), // next Mon, out
          wl(hoursToSeconds(9), '2026-06-14T09:00:00.000+0000'), // prev Sun, out
        ],
      },
    ];
    const grid = buildWeekGrid(issues, {
      weekOf: WEEK_OF,
      catchAllProjectKey: 'KNP',
      ptoSubtaskKey: 'KNP-1',
    });
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0]!.rowTotalSeconds).toBe(hoursToSeconds(4));
    expect(grid.rows[0]!.cellsSeconds[1]).toBe(hoursToSeconds(4)); // Tue
  });

  it('drops a row whose only worklogs fall entirely outside the week', () => {
    const issues: WeekIssueWorklogs[] = [
      {
        key: 'PROJ-1',
        summary: 'A',
        worklogs: [wl(hoursToSeconds(9), '2026-06-22T09:00:00.000+0000')], // out
      },
    ];
    const grid = buildWeekGrid(issues, {
      weekOf: WEEK_OF,
      catchAllProjectKey: 'KNP',
      ptoSubtaskKey: 'KNP-1',
    });
    expect(grid.rows).toHaveLength(0);
  });

  it('retains per-cell worklog ids + started, and mirrors seconds into cellsSeconds', () => {
    const issues: WeekIssueWorklogs[] = [
      {
        key: 'PROJ-1',
        summary: 'Task A',
        worklogs: [
          // Mon: two same-day worklogs → one multi-worklog cell.
          { id: 'w-mon-1', timeSpentSeconds: hoursToSeconds(4), started: '2026-06-15T09:00:00.000+0000' },
          { id: 'w-mon-2', timeSpentSeconds: hoursToSeconds(2), started: '2026-06-15T13:00:00.000+0000' },
          // Wed: a single worklog → editable.
          { id: 'w-wed-1', timeSpentSeconds: hoursToSeconds(1), started: '2026-06-17T09:00:00.000+0000' },
        ],
      },
    ];
    const grid = buildWeekGrid(issues, {
      weekOf: WEEK_OF,
      catchAllProjectKey: 'KNP',
      ptoSubtaskKey: 'KNP-1',
    });
    const r = grid.rows[0]!;

    // Mon cell: summed seconds, two worklog ids (multi).
    expect(r.cells[0]!.seconds).toBe(hoursToSeconds(6));
    expect(r.cells[0]!.worklogs.map((w) => w.id)).toEqual(['w-mon-1', 'w-mon-2']);
    expect(r.cells[0]!.worklogs[0]!.startedISO).toBe('2026-06-15T09:00:00.000+0000');

    // Tue cell: empty.
    expect(r.cells[1]!.seconds).toBe(0);
    expect(r.cells[1]!.worklogs).toEqual([]);

    // Wed cell: single worklog.
    expect(r.cells[2]!.worklogs.map((w) => w.id)).toEqual(['w-wed-1']);

    // cellsSeconds is a faithful derived mirror of cells[i].seconds (4.2 contract).
    expect(r.cellsSeconds).toEqual(r.cells.map((c) => c.seconds));
  });

  it('classifies cell editability: empty / single / multi', () => {
    const issues: WeekIssueWorklogs[] = [
      {
        key: 'PROJ-1',
        summary: 'A',
        worklogs: [
          { id: 'w1', timeSpentSeconds: hoursToSeconds(4), started: '2026-06-15T09:00:00.000+0000' }, // Mon single
          { id: 'w2', timeSpentSeconds: hoursToSeconds(2), started: '2026-06-16T09:00:00.000+0000' }, // Tue
          { id: 'w3', timeSpentSeconds: hoursToSeconds(1), started: '2026-06-16T13:00:00.000+0000' }, // Tue → multi
        ],
      },
    ];
    const grid = buildWeekGrid(issues, {
      weekOf: WEEK_OF,
      catchAllProjectKey: 'KNP',
      ptoSubtaskKey: 'KNP-1',
    });
    const r = grid.rows[0]!;
    expect(cellEditability(r.cells[0]!)).toBe('single'); // Mon
    expect(cellEditability(r.cells[1]!)).toBe('multi'); // Tue (2 worklogs)
    expect(cellEditability(r.cells[2]!)).toBe('empty'); // Wed (none)
  });
});

const DAYS: WeekGrid['days'] = [
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
  const rowTotalSeconds = cellsSeconds.reduce((s, c) => s + c, 0);
  const cells: WeekGridCell[] = cellsSeconds.map((seconds) => ({
    seconds,
    worklogs: seconds > 0 ? [{ id: `id-${seconds}`, startedISO: undefined }] : [],
  }));
  return { key: 'X-1', summary: 'r', category, cells, cellsSeconds, rowTotalSeconds };
}

function gridOf(
  dayTotalsSeconds: number[],
  rows: WeekGridRow[] = [],
): WeekGrid {
  return { days: DAYS, rows, dayTotalsSeconds };
}

describe('computeDayStatuses (Story 7.6: five-state vocabulary via dayStatusFor)', () => {
  const TARGET = 8;

  it('marks a day met when the total is above target', () => {
    const grid = gridOf([hoursToSeconds(9), 0, 0, 0, 0, 0, 0]);
    const statuses = computeDayStatuses(grid, {
      targetHours: TARGET,
      today: '2026-06-21',
    });
    expect(statuses[0]).toBe('met');
  });

  it('marks a day met at the exact target boundary (== target)', () => {
    const grid = gridOf([hoursToSeconds(8), 0, 0, 0, 0, 0, 0]);
    const statuses = computeDayStatuses(grid, {
      targetHours: TARGET,
      today: '2026-06-21',
    });
    expect(statuses[0]).toBe('met');
  });

  it('marks a past workday with some but under-target hours as partial', () => {
    // Mon has 3h, today is Wed → Mon is a past workday and under target.
    const grid = gridOf([hoursToSeconds(3), 0, 0, 0, 0, 0, 0]);
    const statuses = computeDayStatuses(grid, {
      targetHours: TARGET,
      today: '2026-06-17',
    });
    expect(statuses[0]).toBe('partial');
  });

  it('treats today (== today) with 0h as ELAPSED → attention, not null (D-7.6-35)', () => {
    // Today is Wed with 0h logged → attention (in progress, not neutral).
    const grid = gridOf([0, 0, 0, 0, 0, 0, 0]);
    const statuses = computeDayStatuses(grid, {
      targetHours: TARGET,
      today: '2026-06-17',
    });
    expect(statuses[2]).toBe('attention');
  });

  it('a past workday with 0h is attention', () => {
    const grid = gridOf([0, 0, 0, 0, 0, 0, 0]);
    const statuses = computeDayStatuses(grid, {
      targetHours: TARGET,
      today: '2026-06-17',
    });
    expect(statuses[0]).toBe('attention'); // Mon, past
  });

  it('leaves a zero-hour FUTURE workday with no status at all (null, NOT amber) — D-7.6-35', () => {
    // Today is Wed; Thu/Fri are future workdays with 0h → null.
    const grid = gridOf([0, 0, 0, 0, 0, 0, 0]);
    const statuses = computeDayStatuses(grid, {
      targetHours: TARGET,
      today: '2026-06-17',
    });
    expect(statuses[3]).toBeNull(); // Thu future
    expect(statuses[4]).toBeNull(); // Fri future
  });

  it('a Monday-morning grid renders exactly one attention cell (today), not five', () => {
    const grid = gridOf([0, 0, 0, 0, 0, 0, 0]);
    const statuses = computeDayStatuses(grid, {
      targetHours: TARGET,
      today: '2026-06-15', // Monday
    });
    expect(statuses.slice(0, 5)).toEqual(['attention', null, null, null, null]);
  });

  it('a zero-hour weekend (past or future) is `weekend`, never null or attention', () => {
    const grid = gridOf([0, 0, 0, 0, 0, 0, 0]);
    const statuses = computeDayStatuses(grid, {
      targetHours: TARGET,
      today: '2026-06-28',
    });
    expect(statuses[5]).toBe('weekend'); // Sat, past, empty
    expect(statuses[6]).toBe('weekend'); // Sun, past, empty
  });

  it('marks a day with an under-target time-off worklog as time-off (wins outright)', () => {
    // Tue has a half-day time-off worklog (4h) under the 8h target → time-off.
    const ptoRow = row('pto', [0, hoursToSeconds(4), 0, 0, 0, 0, 0]);
    const grid = gridOf([0, hoursToSeconds(4), 0, 0, 0, 0, 0], [ptoRow]);
    const statuses = computeDayStatuses(grid, {
      targetHours: TARGET,
      today: '2026-06-21',
    });
    expect(statuses[1]).toBe('time-off');
  });

  it('weekend now wins over meeting target — a Saturday hitting target is `weekend`, not `met` (D-7.6-6)', () => {
    // Sat (index 5) hits target but is still `weekend`; Sun (index 6) has
    // time off, which wins over weekend too.
    const ptoRow = row('pto', [0, 0, 0, 0, 0, 0, hoursToSeconds(8)]);
    const grid = gridOf(
      [0, 0, 0, 0, 0, hoursToSeconds(8), hoursToSeconds(8)],
      [ptoRow],
    );
    const statuses = computeDayStatuses(grid, {
      targetHours: TARGET,
      today: '2026-06-28',
    });
    expect(statuses[5]).toBe('weekend');
    expect(statuses[6]).toBe('time-off');
  });

  it('returns a 7-element array indexed Monday..Sunday', () => {
    const grid = gridOf([0, 0, 0, 0, 0, 0, 0]);
    const statuses = computeDayStatuses(grid, {
      targetHours: TARGET,
      today: '2026-06-21',
    });
    expect(statuses).toHaveLength(7);
  });
});
