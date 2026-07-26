/**
 * Today's logged-seconds total for the popup chrome header (Story 7.2, AC3/AC6,
 * ORCHESTRATOR DECISION D-7.2-2).
 *
 * There is no today-scoped worklog fetch in the product yet — `TodayView`'s
 * `loggedEntries` starts `[]` and only ever holds worklogs posted in the
 * current popup session, so a naive header would read `0.0 / 8h` even when
 * hours were logged earlier today. This hook composes the existing
 * `useWeekWorklogs(currentWeekMonday())` query (already fetched for the week
 * grid, `staleTime: 60_000`) and sums the seconds of worklogs whose `started`
 * falls on today's LOCAL day — bucketed the same way `lib/week-grid.ts`
 * (`startOfLocalDay`) does, never by UTC or `started.slice(0, 10)`.
 *
 * --- The double-count hazard (must stay true for `sessionSeconds` to be
 * additive rather than double-counted) ---
 * `sessionSeconds` is the running total of worklogs posted in THIS popup
 * session (lifted up from `TodayView` via `onTotalChange`). Adding it on top
 * of the server-fetched total is only correct because ALL THREE of these stay
 * true: the popup `QueryClient` sets `staleTime: 60_000`,
 * `refetchOnWindowFocus: false`, AND `refetchOnReconnect: false`
 * (`entrypoints/popup/main.tsx` — Story 7.2 Finding 6 added the third after
 * the first two were found to be an incomplete enumeration), and this story
 * adds NO `invalidateQueries(['week-worklogs', …])` after a successful log.
 * If a later story adds invalidation (or flips any of the three refetch
 * options back on), the refetched week query would already contain the
 * session's own writes and this addition would double-count them — the delta
 * must be dropped in the same change. `entrypoints/popup/App.session-total.test.tsx`
 * drives the real composition root (`App` → `TodayView` → this hook) so a
 * regression at the exact call site this hazard names is caught (Story 7.2
 * Finding 1 — the hook-only test below only pins the addition, not the guard).
 */
import { useWeekWorklogs } from '@/hooks/useWeekWorklogs';
import { currentWeekMonday } from '@/lib/week-of';

export type TodayTotal = {
  seconds: number;
  isPending: boolean;
  isError: boolean;
};

/** Local midnight at the start of the day containing `date` — mirrors
 * `lib/week-grid.ts#startOfLocalDay` so the popup and the week grid bucket
 * worklogs into the same local day. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * @param sessionSeconds seconds logged in this popup session so far (from
 *   `TodayView`'s `onTotalChange`), added on top of the server-fetched
 *   today total. Defaults to 0 for callers that only need the server value.
 */
export function useTodayTotal(sessionSeconds = 0): TodayTotal {
  const query = useWeekWorklogs(currentWeekMonday());

  if (query.isError) {
    return { seconds: sessionSeconds, isPending: false, isError: true };
  }

  if (!query.data) {
    // Still resolving (or absent-auth) — never throw or blank; the header
    // renders skeleton placeholders while `isPending`.
    return { seconds: sessionSeconds, isPending: true, isError: false };
  }

  const todayStartMs = startOfLocalDay(new Date()).getTime();
  const tomorrowStartMs = todayStartMs + 24 * 60 * 60 * 1000;

  let serverSeconds = 0;
  for (const issue of query.data) {
    for (const worklog of issue.worklogs) {
      if (!worklog.started) continue;
      const startedMs = new Date(worklog.started).getTime();
      if (!Number.isFinite(startedMs)) continue;
      if (startedMs >= todayStartMs && startedMs < tomorrowStartMs) {
        serverSeconds += worklog.timeSpentSeconds;
      }
    }
  }

  return { seconds: serverSeconds + sessionSeconds, isPending: false, isError: false };
}
