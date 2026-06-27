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
import { isCycleDirty, type WorklogTimes } from '@/lib/dirty-detect';
import { hoursToSeconds, secondsToHours } from '@/lib/hours';
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

// ---- Cell/row status decision (Story 5.4) --------------------------------

/**
 * A data cell's approval/target status, painted with a color token + lucide
 * icon + aria-label by the renderer. String-literal union (not an enum) per the
 * project conventions.
 */
export type CellStatus =
  | 'approved'
  | 'on-target'
  | 'gap'
  | 'dirty'
  | 'unapproved-neutral';

/** Target-comparison knobs the caller injects (no clock read in `lib/`). */
export type TargetOptions = {
  /** Per-workday target hours (from settings, default 8). */
  targetHours: number;
  /** Past-or-today Mon–Fri count in the cycle window. */
  workdaysElapsed: number;
};

/**
 * The row-grain on-target/gap judgment (Story 5.4 AC 4): target/gap is a
 * per-cycle, per-ROW decision, NOT per-cell. The green/red signal reflects
 * whether the report's TOTAL hours across all Epics met
 * `targetHours × workdaysElapsed` for the elapsed workdays — mirroring Story
 * 4.2's `computeDayStatuses` target comparison. Each non-empty cell inherits
 * this row status (the approved/dirty states are layered per-cell on top).
 *
 * - `unapproved-neutral` when the row logged nothing (an empty row is never red).
 * - `unapproved-neutral` when no workdays have elapsed yet (a future/not-started
 *   cycle has a zero target — there is no basis to judge on-target vs gap, so the
 *   row stays neutral rather than reading falsely green against a zero target).
 * - `on-target` when the row met/exceeded the elapsed target (boundary inclusive).
 * - `gap` when the row has hours but is below the elapsed target.
 *
 * Target math is in seconds via `hoursToSeconds` — never an inline `* 3600`.
 */
export function computeRowStatus(
  rowSeconds: number,
  { targetHours, workdaysElapsed }: TargetOptions,
): CellStatus {
  if (rowSeconds <= 0) return 'unapproved-neutral';
  // No elapsed workdays → zero target → no basis to color (never red/green).
  if (workdaysElapsed <= 0) return 'unapproved-neutral';
  const targetSeconds = hoursToSeconds(targetHours) * workdaysElapsed;
  return rowSeconds >= targetSeconds ? 'on-target' : 'gap';
}

/** The per-(report, Epic) worklog `updated` times the dirty rule reads. */
export function cellWorklogTimes(
  epics: ReportEpicWorklogs[],
  epicKey: string,
): WorklogTimes[] {
  for (const epic of epics) {
    if (epic.epicKey !== epicKey) continue;
    return epic.worklogs.map((w) =>
      w.updated !== undefined ? { updated: w.updated } : {},
    );
  }
  return [];
}

/** Inputs for a single `(report, Epic)` cell's status decision. */
export type CellStatusInput = {
  epics: ReportEpicWorklogs[];
  epicKey: string;
  /** From `approvalAtFor(...)` — `null` means this (user, cycle) is unapproved. */
  approvalAt: string | null;
  /** The row-grain on-target/gap status (see `computeRowStatus`). */
  rowStatus: CellStatus;
};

/**
 * Decide one cell's `CellStatus` (Story 5.4 AC 3). Pure — no clock read; the
 * approval anchor and the precomputed `rowStatus` are injected.
 *
 * Decision order (first match wins):
 *  1. `dirty`    — an approval exists AND a covered worklog changed after it.
 *                  Dirty supersedes "approved": a stale approval must visibly
 *                  demand re-approval (FR37/FR39).
 *  2. `approved` — an approval exists and is not dirty (FR30).
 *  3. `gap` / `on-target` — no approval: inherit the row-grain target judgment.
 *  4. `unapproved-neutral` — empty cell / no basis to color (never red-by-default).
 *
 * An empty cell (the report logged nothing on this Epic) always falls through to
 * neutral because `rowStatus` only colors cells that carry hours and there is no
 * approval anchor for an empty cell.
 */
export function computeCellStatus(input: CellStatusInput): CellStatus {
  const { epics, epicKey, approvalAt, rowStatus } = input;
  const hasHours = cellSeconds(epics, epicKey) > 0;

  if (approvalAt !== null) {
    if (isCycleDirty(cellWorklogTimes(epics, epicKey), approvalAt)) return 'dirty';
    return 'approved';
  }

  // No approval: an empty cell is neutral; a cell with hours inherits the
  // row-grain on-target/gap signal (never red-by-default just for lacking an
  // approval).
  if (!hasHours) return 'unapproved-neutral';
  return rowStatus === 'gap' ? 'gap' : rowStatus === 'on-target' ? 'on-target' : 'unapproved-neutral';
}
