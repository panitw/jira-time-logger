/**
 * Pure builders for the Manager matrix (Story 5.3): person × Epic grid.
 *
 * Framework-agnostic (no React, no chrome/network). The component
 * (`components/manager/ManagerMatrix.tsx`) owns the cross-row column set because
 * columns are the *union* of every Epic any report touched; this module derives
 * that union and the per-cell totals/display from the resolved per-row data.
 *
 * Hours conversion goes through `secondsToHours` (`lib/hours.ts`) — never an
 * inline `/3600`.
 */
import { secondsToHours } from '@/lib/hours';
import type { ReportEpicWorklogs } from '@/lib/jira-types';

/** Em-dash pair shown in an empty cell (report logged nothing on that Epic). */
export const EMPTY_CELL = '──';

/** One resolved row's contribution to the matrix: the report + its Epic groups. */
export type MatrixRowInput = {
  accountId: string;
  epics: ReportEpicWorklogs[];
};

/**
 * The matrix columns: the union of every Epic key that received hours from any
 * report this cycle, ordered alphabetically by Epic key. A report with no
 * worklogs contributes nothing. Recomputed as rows resolve — a newly-resolved
 * row may introduce new columns (existing rows then render `──` for them).
 */
export function buildMatrixColumns(rows: MatrixRowInput[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const epic of row.epics) {
      keys.add(epic.epicKey);
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

/** Per-(report, Epic) total seconds; 0 when the report logged nothing there. */
export function cellSeconds(epics: ReportEpicWorklogs[], epicKey: string): number {
  for (const epic of epics) {
    if (epic.epicKey === epicKey) return epic.totalSeconds;
  }
  return 0;
}

/**
 * A data cell's display: a whole number with no decimal when whole (`64`), else
 * one decimal (`12.5`), and `──` for ≤ 0 (empty). No `h` suffix — the column
 * context supplies the unit (UX-DR11). Reuses `secondsToHours`.
 */
export function formatCellHours(seconds: number): string {
  if (seconds <= 0) return EMPTY_CELL;
  const hours = secondsToHours(seconds);
  const display = hours.toFixed(1).replace(/\.0$/, '');
  // A tiny but non-zero total (e.g. < ~3 min) rounds to "0" — that reads as
  // "nothing logged", which is misleading. Show the empty-cell glyph instead;
  // the precise seconds are still preserved in the per-ticket records.
  if (display === '0') return EMPTY_CELL;
  return display;
}
