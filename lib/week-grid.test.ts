import { describe, it, expect } from 'vitest';
import { hoursToSeconds } from '@/lib/hours';
import type { WeekIssueWorklogs } from '@/lib/jira-types';
import { buildWeekGrid } from '@/lib/week-grid';

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
});
