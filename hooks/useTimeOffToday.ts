import { useEffect, useState } from 'react';
import { useWeekWorklogs } from '@/hooks/useWeekWorklogs';
import { ptoSubtaskKeyItem } from '@/lib/storage/settings';
import { currentWeekMonday } from '@/lib/week-of';

/**
 * "Is today a time-off day, and by how much" (Story 7.9, Task 1) — the one
 * genuinely new derivation this story adds. There is no "is today time off"
 * read in the product before this; `PtoQuickAction` only ever POSTS it.
 *
 * Composes the ALREADY-fetched `useWeekWorklogs(currentWeekMonday())` query
 * (same `queryKey` as `useTodayTotal`/`useResumeTicket` — zero extra network,
 * D-7.5-16's precedent) and `ptoSubtaskKeyItem` (the same storage item
 * `useResumeTicket` already reads). Buckets by LOCAL day (never
 * `started.slice(0, 10)`, never UTC — mirrors `useTodayTotal.ts`'s own
 * `startOfLocalDay`) and categorises with the SAME predicate
 * `lib/week-grid.ts#categorize` uses (`ptoSubtaskKey && key.startsWith(ptoSubtaskKey)`)
 * — no second predicate invented.
 *
 * Trap 1 (session-posted PTO is invisible to this query): `sessionPtoSeconds`
 * is `App.tsx`'s existing `ptoSeconds` — already net of the OTHER
 * (LoggedToday-owned) `pendingDeletionId` — added on top of the server sum so
 * a time-off entry posted in THIS popup session still counts.
 *
 * `excludeWorklogIds` is the "Undo time off" seam (D-7.9-13): a worklog whose
 * deferred DELETE is pending (inside the 5s undo window) must be filtered out
 * of this seconds derivation, or the chrome figure disagrees with the
 * already-cleared card — the exact defect D-7.5-14 and 7.5's review both had
 * to fix, here reused rather than reinvented.
 */

export type TimeOffWorklogRef = {
  key: string;
  worklogId: string;
  seconds: number;
};

export type TimeOffToday = {
  /** Server (net of `excludeWorklogIds`) + session seconds. */
  seconds: number;
  isPending: boolean;
  /** Today's server-fetched time-off worklogs, net of `excludeWorklogIds` —
   * what "Undo time off" (D-7.9-13) deletes. */
  worklogs: TimeOffWorklogRef[];
};

const EMPTY_SET: ReadonlySet<string> = new Set();

/** Local midnight at the start of the day containing `date` — mirrors
 * `hooks/useTodayTotal.ts#startOfLocalDay` exactly. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function useTimeOffToday(
  sessionPtoSeconds = 0,
  excludeWorklogIds: ReadonlySet<string> = EMPTY_SET,
): TimeOffToday {
  // `undefined` = not yet loaded; `null` = explicitly unconfigured (fallback).
  const [ptoKey, setPtoKey] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void ptoSubtaskKeyItem.getValue().then(setPtoKey);
  }, []);

  const query = useWeekWorklogs(currentWeekMonday());

  if (query.isError) {
    return { seconds: sessionPtoSeconds, isPending: false, worklogs: [] };
  }

  if (!query.data || ptoKey === undefined) {
    // Still resolving (the week query, or the PTO subtask key) — never
    // guess; the caller renders 'loading' while this is true.
    return { seconds: sessionPtoSeconds, isPending: true, worklogs: [] };
  }

  const worklogs: TimeOffWorklogRef[] = [];
  if (ptoKey) {
    const todayStartMs = startOfLocalDay(new Date()).getTime();
    const tomorrowStartMs = todayStartMs + 24 * 60 * 60 * 1000;

    for (const issue of query.data) {
      if (!issue.key.startsWith(ptoKey)) continue;
      for (const worklog of issue.worklogs) {
        if (!worklog.started) continue;
        const startedMs = new Date(worklog.started).getTime();
        if (!Number.isFinite(startedMs)) continue;
        if (startedMs < todayStartMs || startedMs >= tomorrowStartMs) continue;
        if (excludeWorklogIds.has(worklog.id)) continue;
        worklogs.push({ key: issue.key, worklogId: worklog.id, seconds: worklog.timeSpentSeconds });
      }
    }
  }

  const serverSeconds = worklogs.reduce((sum, w) => sum + w.seconds, 0);
  return {
    seconds: serverSeconds + sessionPtoSeconds,
    isPending: false,
    worklogs,
  };
}
