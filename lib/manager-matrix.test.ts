import { describe, it, expect } from 'vitest';
import type { ReportEpicWorklogs } from './jira-types';
import {
  buildMatrixColumns,
  cellSeconds,
  formatCellHours,
  EMPTY_CELL,
  type MatrixRowInput,
} from './manager-matrix';

function epic(epicKey: string, totalSeconds: number): ReportEpicWorklogs {
  return {
    epicKey,
    epicSummary: `${epicKey} summary`,
    totalSeconds,
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
