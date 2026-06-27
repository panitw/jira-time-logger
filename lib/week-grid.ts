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
