import { describe, it, expect } from 'vitest';
import type { ReportEpicWorklogs } from './jira-types';
import {
  buildMatrixColumns,
  cellSeconds,
  formatCellHours,
  EMPTY_CELL,
  computeRowStatus,
  computeCellStatus,
  cellWorklogTimes,
  type MatrixRowInput,
} from './manager-matrix';

function epic(epicKey: string, totalSeconds: number): ReportEpicWorklogs {
  return {
    epicKey,
    epicSummary: `${epicKey} summary`,
    totalSeconds,
    restrictedCount: 0,
    worklogs: [
      { ticketKey: `${epicKey}-sub`, ticketSummary: 'sub', seconds: totalSeconds },
    ],
  };
}

describe('buildMatrixColumns', () => {
  it('derives the union of Epic keys across all rows', () => {
    const rows: MatrixRowInput[] = [
      { accountId: 'a', epics: [epic('PROJ-1', 3600), epic('PROJ-2', 7200)] },
      { accountId: 'b', epics: [epic('PROJ-2', 1800), epic('PROJ-3', 900)] },
    ];
    expect(buildMatrixColumns(rows)).toEqual(['PROJ-1', 'PROJ-2', 'PROJ-3']);
  });

  it('orders columns alphabetically by Epic key', () => {
    const rows: MatrixRowInput[] = [
      { accountId: 'a', epics: [epic('ZED-9', 3600), epic('ALPHA-1', 7200)] },
      { accountId: 'b', epics: [epic('MID-5', 1800)] },
    ];
    expect(buildMatrixColumns(rows)).toEqual(['ALPHA-1', 'MID-5', 'ZED-9']);
  });

  it('contributes no columns for a report with no worklogs', () => {
    const rows: MatrixRowInput[] = [
      { accountId: 'a', epics: [] },
      { accountId: 'b', epics: [epic('PROJ-1', 3600)] },
    ];
    expect(buildMatrixColumns(rows)).toEqual(['PROJ-1']);
  });

  it('dedupes a key touched by many rows', () => {
    const rows: MatrixRowInput[] = [
      { accountId: 'a', epics: [epic('PROJ-1', 3600)] },
      { accountId: 'b', epics: [epic('PROJ-1', 1800)] },
    ];
    expect(buildMatrixColumns(rows)).toEqual(['PROJ-1']);
  });

  it('returns an empty column set when nobody logged anything', () => {
    const rows: MatrixRowInput[] = [
      { accountId: 'a', epics: [] },
      { accountId: 'b', epics: [] },
    ];
    expect(buildMatrixColumns(rows)).toEqual([]);
  });
});

describe('cellSeconds', () => {
  it('returns the per-(report, Epic) total seconds', () => {
    const epics = [epic('PROJ-1', 3600), epic('PROJ-2', 7200)];
    expect(cellSeconds(epics, 'PROJ-1')).toBe(3600);
    expect(cellSeconds(epics, 'PROJ-2')).toBe(7200);
  });

  it('returns 0 when the report logged nothing on that Epic', () => {
    const epics = [epic('PROJ-1', 3600)];
    expect(cellSeconds(epics, 'PROJ-2')).toBe(0);
  });
});

describe('formatCellHours', () => {
  it('shows a whole number with no decimal when whole', () => {
    expect(formatCellHours(64 * 3600)).toBe('64');
  });

  it('shows one decimal when not whole', () => {
    expect(formatCellHours(12.5 * 3600)).toBe('12.5');
  });

  it('shows the em-dash pair for zero or negative', () => {
    expect(formatCellHours(0)).toBe(EMPTY_CELL);
    expect(formatCellHours(-100)).toBe(EMPTY_CELL);
  });

  it('rounds to one decimal place', () => {
    // 1h 20m = 4800s = 1.333… h → 1.3
    expect(formatCellHours(4800)).toBe('1.3');
  });
});

const H = 3600;

describe('computeRowStatus', () => {
  // target 8h × 5 workdays = 40h = 144000s.
  const opts = { targetHours: 8, workdaysElapsed: 5 };

  it('is neutral for an empty row (no hours)', () => {
    expect(computeRowStatus(0, opts)).toBe('unapproved-neutral');
  });

  it('is on-target when the row meets the target exactly (boundary)', () => {
    expect(computeRowStatus(40 * H, opts)).toBe('on-target');
  });

  it('is on-target when the row exceeds the target', () => {
    expect(computeRowStatus(50 * H, opts)).toBe('on-target');
  });

  it('is gap when the row has hours but is below target', () => {
    expect(computeRowStatus(20 * H, opts)).toBe('gap');
  });

  it('is neutral (never gap or green) when zero workdays have elapsed', () => {
    // A future/not-started cycle has a zero target — no basis to judge, so the
    // row stays neutral rather than reading falsely on-target against 0.
    expect(computeRowStatus(1 * H, { targetHours: 8, workdaysElapsed: 0 })).toBe(
      'unapproved-neutral',
    );
  });
});

describe('computeCellStatus', () => {
  const opts = { targetHours: 8, workdaysElapsed: 5 };

  function input(over: {
    epics?: ReportEpicWorklogs[];
    epicKey?: string;
    approvalAt?: string | null;
    rowSeconds?: number;
  }) {
    return {
      epics: over.epics ?? [],
      epicKey: over.epicKey ?? 'PROJ-1',
      approvalAt: over.approvalAt ?? null,
      rowStatus: computeRowStatus(over.rowSeconds ?? 0, opts),
    };
  }

  const AT = '2026-06-15T12:00:00.000Z';

  function epicWith(epicKey: string, totalSeconds: number, updated?: string): ReportEpicWorklogs {
    return {
      epicKey,
      epicSummary: `${epicKey} summary`,
      totalSeconds,
      restrictedCount: 0,
      worklogs: [
        {
          ticketKey: `${epicKey}-sub`,
          ticketSummary: 'sub',
          seconds: totalSeconds,
          ...(updated ? { updated } : {}),
        },
      ],
    };
  }

  it('is approved when an approval exists and no worklog changed after it', () => {
    const epics = [epicWith('PROJ-1', 40 * H, '2026-06-14T00:00:00.000Z')];
    expect(
      computeCellStatus(input({ epics, approvalAt: AT, rowSeconds: 40 * H })),
    ).toBe('approved');
  });

  it('is dirty (supersedes approved) when a worklog changed after the approval', () => {
    const epics = [epicWith('PROJ-1', 40 * H, '2026-06-16T00:00:00.000Z')];
    expect(
      computeCellStatus(input({ epics, approvalAt: AT, rowSeconds: 40 * H })),
    ).toBe('dirty');
  });

  it('is gap when no approval and the row is below target', () => {
    const epics = [epicWith('PROJ-1', 20 * H)];
    expect(computeCellStatus(input({ epics, approvalAt: null, rowSeconds: 20 * H }))).toBe('gap');
  });

  it('is on-target when no approval and the row meets target', () => {
    const epics = [epicWith('PROJ-1', 40 * H)];
    expect(computeCellStatus(input({ epics, approvalAt: null, rowSeconds: 40 * H }))).toBe(
      'on-target',
    );
  });

  it('is neutral for an empty cell (no hours), never red-by-default', () => {
    const epics = [epicWith('PROJ-2', 40 * H)];
    expect(
      computeCellStatus(input({ epics, epicKey: 'PROJ-1', approvalAt: null, rowSeconds: 40 * H })),
    ).toBe('unapproved-neutral');
  });

  it('paints gap (not unapproved-neutral) on a no-approval row that is below target', () => {
    // Regression guard against conflating "unapproved" with "red-by-default":
    // the cell HAS hours and the ROW is below target → gap, not neutral.
    const epics = [epicWith('PROJ-1', 10 * H)];
    expect(computeCellStatus(input({ epics, approvalAt: null, rowSeconds: 10 * H }))).toBe('gap');
  });
});

describe('cellWorklogTimes', () => {
  it('returns the (report, Epic) worklog updated times', () => {
    const epics: ReportEpicWorklogs[] = [
      {
        epicKey: 'PROJ-1',
        epicSummary: 'E1',
        totalSeconds: 3600,
        restrictedCount: 0,
        worklogs: [
          { ticketKey: 'PROJ-1-1', ticketSummary: 's', seconds: 1800, updated: 'a' },
          { ticketKey: 'PROJ-1-2', ticketSummary: 's', seconds: 1800 },
        ],
      },
    ];
    expect(cellWorklogTimes(epics, 'PROJ-1')).toEqual([{ updated: 'a' }, {}]);
  });

  it('returns an empty array when the report logged nothing on that Epic', () => {
    expect(cellWorklogTimes([], 'PROJ-1')).toEqual([]);
  });
});
