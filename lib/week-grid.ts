/**
 * Pure week-grid row builder (Story 4.1).
 *
 * Maps the per-issue worklogs fetched for a week into a view model the Week
 * grid can render directly: 7 day columns (Mon..Sun), one row per subtask the
 * worker logged against, per-cell second sums, and per-day totals.
 *
 * Pure — no chrome/network/React. Co-located tests cover bucketing, totals,
 * ordering, empty-week, and out-of-range exclusion (AC #11).
 */
import { dayStatusFor, type DayStatus } from '@/lib/day-status';
import { hoursToSeconds } from '@/lib/hours';
import type { WeekIssueWorklogs } from '@/lib/jira-types';
import type { ISODate } from '@/lib/storage/view-state';

// Re-exported so existing call sites (`WeeklyGrid.tsx`, `DayCell.tsx`) keep
// compiling unchanged — `DayStatus` now lives in `lib/day-status.ts`, the
// framework-agnostic vocabulary module shared with
// `components/shared/DayStatusIndicator.tsx` (Story 7.6, D-7.6-2).
export type { DayStatus } from '@/lib/day-status';

export const DAYS_PER_WEEK = 7;

export type WeekGridCategory = 'task' | 'catch-all' | 'pto';

/**
 * One underlying worklog that contributes to a cell (Story 4.3). `startedISO`
 * is the worklog's own `started` timestamp — reused verbatim for a PUT so an
 * inline edit does not move the worklog's time-of-day. Optional because a
 * worklog can lack `started` (excluded from bucketing, but kept defensive).
 */
export type WeekGridCellWorklog = {
  id: string;
  startedISO: string | undefined;
};

/**
 * A single (subtask, day) cell (Story 4.3). `seconds` is the summed duration;
 * `worklogs` carries each contributing worklog's id + `started` so the cell can
 * issue a PUT/DELETE against a specific worklog. 0 worklogs → POST (empty cell);
 * exactly 1 → editable PUT/DELETE; >1 → read-only (multi-worklog ambiguity, AC #4).
 */
export type WeekGridCell = {
  seconds: number;
  worklogs: WeekGridCellWorklog[];
};

export type WeekGridRow = {
  key: string;
  summary: string;
  category: WeekGridCategory;
  /** Per-day cells, index 0 = Monday .. index 6 = Sunday. */
  cells: WeekGridCell[];
  /**
   * Seconds logged per day, index 0 = Monday .. index 6 = Sunday. Derived
   * mirror of `cells[i].seconds`, retained so Story 4.2's `computeDayStatuses`
   * (and its tests) keep working unchanged.
   */
  cellsSeconds: number[];
  rowTotalSeconds: number;
};

/** How a cell may be edited inline (Story 4.3). */
export type CellEditability = 'empty' | 'single' | 'multi';

/**
 * Classify a cell by how many worklogs it aggregates:
 * - `empty`  — 0 worklogs → click POSTs a new worklog.
 * - `single` — exactly 1 → editable (PUT to update, DELETE to clear).
 * - `multi`  — >1 → read-only here (which worklog to PUT/DELETE is ambiguous).
 */
export function cellEditability(cell: WeekGridCell): CellEditability {
  const count = cell.worklogs.length;
  if (count === 0) return 'empty';
  if (count === 1) return 'single';
  return 'multi';
}

function emptyCell(): WeekGridCell {
  return { seconds: 0, worklogs: [] };
}

export type WeekGrid = {
  /** ISO date strings, index 0 = Monday .. index 6 = Sunday. */
  days: ISODate[];
  rows: WeekGridRow[];
  /** Summed seconds per day across all rows, index 0 = Monday. */
  dayTotalsSeconds: number[];
};

export type WeekGridParams = {
  weekOf: ISODate;
  catchAllProjectKey: string;
  ptoSubtaskKey: string;
};

function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local midnight at the start of the day containing `date`. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function categorize(
  key: string,
  catchAllProjectKey: string,
  ptoSubtaskKey: string,
): WeekGridCategory {
  if (ptoSubtaskKey && key.startsWith(ptoSubtaskKey)) return 'pto';
  const projectKey = key.split('-')[0] ?? '';
  if (catchAllProjectKey && projectKey === catchAllProjectKey) return 'catch-all';
  return 'task';
}

const CATEGORY_RANK: Record<WeekGridCategory, number> = {
  task: 0,
  'catch-all': 1,
  pto: 2,
};

/**
 * Build the 7-day grid view model. Worklogs outside the Mon..Sun window are
 * excluded; an issue whose every worklog is out of range yields no row.
 */
export function buildWeekGrid(
  issues: WeekIssueWorklogs[],
  params: WeekGridParams,
): WeekGrid {
  const { weekOf, catchAllProjectKey, ptoSubtaskKey } = params;

  // Day boundaries (local midnight) for Mon..Sun derived from weekOf (Monday).
  const monday = startOfLocalDay(new Date(`${weekOf}T00:00:00`));
  const dayStarts: Date[] = [];
  const days: ISODate[] = [];
  for (let i = 0; i < DAYS_PER_WEEK; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    dayStarts.push(d);
    days.push(toISODate(d));
  }
  const weekStartMs = dayStarts[0]!.getTime();
  // Exclusive upper bound = start of the day after Sunday.
  const weekEndMs = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + DAYS_PER_WEEK,
  ).getTime();

  const dayTotalsSeconds = new Array<number>(DAYS_PER_WEEK).fill(0);
  const rows: WeekGridRow[] = [];

  for (const issue of issues) {
    const cells: WeekGridCell[] = Array.from({ length: DAYS_PER_WEEK }, emptyCell);
    let rowTotalSeconds = 0;

    for (const worklog of issue.worklogs) {
      if (!worklog.started) continue;
      const startedMs = new Date(worklog.started).getTime();
      if (!Number.isFinite(startedMs)) continue;
      if (startedMs < weekStartMs || startedMs >= weekEndMs) continue;

      // Bucket by local day: find the index whose day-start is the latest one
      // not after the worklog's start.
      const localDayStartMs = startOfLocalDay(new Date(startedMs)).getTime();
      const dayIndex = dayStarts.findIndex(
        (d) => d.getTime() === localDayStartMs,
      );
      if (dayIndex < 0) continue;

      const cell = cells[dayIndex];
      if (!cell) continue; // defensive: dayIndex is always in [0, 6)
      cell.seconds += worklog.timeSpentSeconds;
      cell.worklogs.push({ id: worklog.id, startedISO: worklog.started });
      rowTotalSeconds += worklog.timeSpentSeconds;
      dayTotalsSeconds[dayIndex] = (dayTotalsSeconds[dayIndex] ?? 0) + worklog.timeSpentSeconds;
    }

    if (rowTotalSeconds <= 0) continue;

    rows.push({
      key: issue.key,
      summary: issue.summary,
      category: categorize(issue.key, catchAllProjectKey, ptoSubtaskKey),
      cells,
      // Derived mirror — keep in sync with cells[i].seconds for 4.2.
      cellsSeconds: cells.map((c) => c.seconds),
      rowTotalSeconds,
    });
  }

  rows.sort((a, b) => {
    const rankDiff = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
    if (rankDiff !== 0) return rankDiff;
    // Within the Task group, sort by row total hours descending.
    if (a.category === 'task') return b.rowTotalSeconds - a.rowTotalSeconds;
    return 0;
  });

  return { days, rows, dayTotalsSeconds };
}

/**
 * Per-day status for the week grid's totals/header cells (Story 4.2;
 * rewritten in place for Story 7.6 to the shared five-state vocabulary —
 * `lib/day-status.ts`'s `dayStatusFor` is the single derivation this
 * delegates to per day). Pure, no clock read: the caller injects `today` (a
 * local `YYYY-MM-DD`).
 *
 * `null` at an index means the day has no status to render yet (a future
 * workday with nothing logged, D-7.6-35) — the caller renders a bare number,
 * not a neutral/sixth status.
 *
 * `buildWeekGrid`, `WeekGridCategory`, and `cellEditability` are untouched —
 * this function is the only thing Story 7.6 changes in this module.
 */
export function computeDayStatuses(
  grid: WeekGrid,
  params: { targetHours: number; today: ISODate },
): (DayStatus | null)[] {
  const { targetHours, today } = params;
  const targetSeconds = hoursToSeconds(targetHours);

  // Per-day time-off seconds: any pto-category row's seconds that day, summed
  // (not just a boolean) so `dayStatusNote` can tell a half-day from a full
  // day (D-7.6-9/38) — the status derivation itself only needs ">0".
  const timeOffSecondsByDay = new Array<number>(DAYS_PER_WEEK).fill(0);
  for (const r of grid.rows) {
    if (r.category !== 'pto') continue;
    for (let i = 0; i < DAYS_PER_WEEK; i++) {
      timeOffSecondsByDay[i] = (timeOffSecondsByDay[i] ?? 0) + (r.cellsSeconds[i] ?? 0);
    }
  }

  const statuses: (DayStatus | null)[] = new Array(DAYS_PER_WEEK).fill(null);
  for (let i = 0; i < DAYS_PER_WEEK; i++) {
    const iso = grid.days[i];
    if (!iso) continue; // defensive: malformed grid

    statuses[i] = dayStatusFor({
      iso,
      loggedSeconds: grid.dayTotalsSeconds[i] ?? 0,
      timeOffSeconds: timeOffSecondsByDay[i] ?? 0,
      targetSeconds,
      today,
    });
  }

  return statuses;
}
