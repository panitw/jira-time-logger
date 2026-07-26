import { useEffect, useMemo, useState } from 'react';
import { useWeekWorklogs } from '@/hooks/useWeekWorklogs';
import type { WeekIssueWorklogs } from '@/lib/jira-types';
import { ptoSubtaskKeyItem } from '@/lib/storage/settings';
import { currentWeekMonday } from '@/lib/week-of';

/**
 * "Recently worked" — the popup's replacement for the deleted `TicketPicker`
 * tree (Story 7.5, AC1, D-7.5-16).
 *
 * The recency source is the SAME `['week-worklogs', weekOf]` query
 * `useTodayTotal` (D-7.2-2) and `useResumeTicket` (D-7.3-2) already
 * subscribe to — composing over it a third time costs ZERO additional
 * network requests. Deliberately NOT widened beyond the current
 * Monday–Sunday week (D-7.3-5, and D-7.5-16 carries the identical ruling for
 * this story): `fetchCurrentUserWeekWorklogsByIssue` is already an N+1
 * fan-out (one `/worklog` GET per issue), so widening the range widens the
 * fan-out with it. `currentWeekMonday()` is called in exactly ONE place
 * below (mirroring `useResumeTicket`/`useTodayTotal`) so widening the range
 * later — D-7.5-16 option (b) — stays a one-function change.
 */

export type RecentlyWorkedItem = {
  key: string;
  summary: string;
  /** The newest `started` timestamp among this issue's worklogs this week —
   * used both for ranking and for the row's recency note. */
  startedAt: string;
};

/** D-7.5-13 (orchestrator decision): AT MOST this many rows — never padded
 * to reach it, never reserving empty space for the ones that don't exist. */
export const MAX_RECENTLY_WORKED = 4;

/** The freshest (`started`) worklog timestamp for a single issue this week,
 * or `null` if it has none with a parseable date. Guards invalid/absent
 * `started` exactly as `useResumeTicket.ts#freshestWeekWorklog` does. */
function newestStartedForIssue(issue: WeekIssueWorklogs): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const worklog of issue.worklogs) {
    if (!worklog.started) continue;
    const ms = new Date(worklog.started).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = worklog.started;
    }
  }
  return best;
}

/**
 * Pure ranking function (exported for direct unit testing without a
 * QueryClient): groups by issue, takes each issue's newest `started`, sorts
 * descending, caps at `MAX_RECENTLY_WORKED`.
 *
 * Excludes `ptoKey` (D-7.3-12 mirrored here) — time off is a settled state
 * that "stops asking"; it has no place in a list whose whole purpose is
 * "here is what to log more time against". Does NOT exclude the catch-all
 * project (same rule, same reasoning) — Admin/Meetings work under the
 * catch-all is legitimately resumable.
 */
export function rankRecentlyWorked(
  issues: WeekIssueWorklogs[],
  ptoKey: string | null,
): RecentlyWorkedItem[] {
  const withRecency: (RecentlyWorkedItem & { ms: number })[] = [];
  for (const issue of issues) {
    if (ptoKey && issue.key === ptoKey) continue;
    const startedAt = newestStartedForIssue(issue);
    if (!startedAt) continue;
    withRecency.push({
      key: issue.key,
      summary: issue.summary,
      startedAt,
      ms: new Date(startedAt).getTime(),
    });
  }
  withRecency.sort((a, b) => b.ms - a.ms);
  return withRecency.slice(0, MAX_RECENTLY_WORKED).map((item) => ({
    key: item.key,
    summary: item.summary,
    startedAt: item.startedAt,
  }));
}

/**
 * Resolves "Recently worked" — up to `MAX_RECENTLY_WORKED` issues, ranked by
 * the recency of the user's own worklogs this week. Never invalidates
 * `['week-worklogs', …]` and never alters `staleTime` /
 * `refetchOnWindowFocus` / `refetchOnReconnect` (D-7.2-2) — it only reads
 * the query `useWeekWorklogs` already owns.
 */
export function useRecentlyWorked(): RecentlyWorkedItem[] {
  const [ptoKey, setPtoKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void ptoSubtaskKeyItem.getValue().then((key) => {
      if (active) setPtoKey(key);
    });
    return () => {
      active = false;
    };
  }, []);

  const weekQuery = useWeekWorklogs(currentWeekMonday());
  const weekIssues = weekQuery.data;

  return useMemo(
    () => rankRecentlyWorked(weekIssues ?? [], ptoKey),
    [weekIssues, ptoKey],
  );
}
