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
import { hoursToSeconds } from '@/lib/hours';
import type { WeekIssueWorklogs } from '@/lib/jira-types';
import type { ISODate } from '@/lib/storage/view-state';

export const DAYS_PER_WEEK = 7;

export type WeekGridCategory = 'task' | 'catch-all' | 'pto';

export type WeekGridRow = {
  key: string;
  summary: string;
  category: WeekGridCategory;
  /** Seconds logged per day, index 0 = Monday .. index 6 = Sunday. */
  cellsSeconds: number[];
  rowTotalSeconds: number;
};

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
    const cellsSeconds = new Array<number>(DAYS_PER_WEEK).fill(0);
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

      cellsSeconds[dayIndex] = (cellsSeconds[dayIndex] ?? 0) + worklog.timeSpentSeconds;
      rowTotalSeconds += worklog.timeSpentSeconds;
      dayTotalsSeconds[dayIndex] = (dayTotalsSeconds[dayIndex] ?? 0) + worklog.timeSpentSeconds;
    }

    if (rowTotalSeconds <= 0) continue;

    rows.push({
      key: issue.key,
      summary: issue.summary,
      category: categorize(issue.key, catchAllProjectKey, ptoSubtaskKey),
      cellsSeconds,
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
 * Per-day status for the week grid's totals/header cells (Story 4.2).
 *
 * - `complete`     — day total >= target hours (green + Check).
 * - `below-target` — past-or-today Mon..Fri under target with no PTO (red + AlertCircle).
 * - `pto`          — the day has a PTO worklog (green + PTO label); PTO always wins.
 * - `neutral`      — future workdays, and weekends without complete/pto (no red).
 */
export type DayStatus = 'complete' | 'below-target' | 'pto' | 'neutral';

/** True for Saturday/Sunday, derived from the day's local weekday. */
function isWeekend(iso: ISODate): boolean {
  const weekday = new Date(`${iso}T00:00:00`).getDay(); // 0 = Sun .. 6 = Sat
  return weekday === 0 || weekday === 6;
}

/**
 * Decide each day's status from the already-built grid — pure, no clock read.
 * The caller injects `today` (a local `YYYY-MM-DD`) so the future/past rule is
 * deterministic and testable. Returns a 7-element array, index 0 = Monday.
 */
export function computeDayStatuses(
  grid: WeekGrid,
  params: { targetHours: number; today: ISODate },
): DayStatus[] {
  const { targetHours, today } = params;
  const targetSeconds = hoursToSeconds(targetHours);

  // Which days have a PTO worklog: any pto-category row with seconds that day.
  const ptoDays = new Array<boolean>(DAYS_PER_WEEK).fill(false);
  for (const r of grid.rows) {
    if (r.category !== 'pto') continue;
    for (let i = 0; i < DAYS_PER_WEEK; i++) {
      if ((r.cellsSeconds[i] ?? 0) > 0) ptoDays[i] = true;
    }
  }

  const statuses = new Array<DayStatus>(DAYS_PER_WEEK).fill('neutral');
  for (let i = 0; i < DAYS_PER_WEEK; i++) {
    const iso = grid.days[i];
    if (!iso) continue; // defensive: malformed grid

    if (ptoDays[i]) {
      statuses[i] = 'pto';
      continue;
    }
    if ((grid.dayTotalsSeconds[i] ?? 0) >= targetSeconds) {
      statuses[i] = 'complete';
      continue;
    }
    // Below target: red only for past-or-today workdays (Mon..Fri). Future days
    // and all weekends stay neutral (an incomplete future day is not "behind").
    const pastOrToday = iso <= today; // safe lexical compare for YYYY-MM-DD
    if (pastOrToday && !isWeekend(iso)) {
      statuses[i] = 'below-target';
    }
  }

  return statuses;
}
