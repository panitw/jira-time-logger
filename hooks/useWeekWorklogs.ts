import { useQuery } from '@tanstack/react-query';
import { currentCycleRange } from '@/lib/cycle-range';
import { fetchCurrentUserWeekWorklogsByIssue } from '@/lib/jira-client';
import type { WeekIssueWorklogs } from '@/lib/jira-types';
import { log } from '@/lib/log';
import type { JiraError } from '@/lib/result';
import type { ISODate } from '@/lib/storage/view-state';

const WEEK_STALE_TIME = 60_000; // AR23 — 60s, matches the popup QueryClient default.

/**
 * Fetch the current user's per-issue worklogs for the week containing `weekOf`
 * (the Monday ISO date). The queryFn throws the
 * non-`ok` `Result` so TanStack's `error` carries the discriminated `JiraError`
 * and the view branches on `error.kind`.
 *
 * Range anchors to `currentCycleRange('weekly')` (the same Monday boundary the
 * badge uses). `weekOf` is the only cache-key dimension so a tab switch back
 * within `staleTime` does not re-fetch (AC #9).
 */
export function useWeekWorklogs(weekOf: ISODate) {
  return useQuery<WeekIssueWorklogs[], JiraError>({
    queryKey: ['week-worklogs', weekOf],
    queryFn: async () => {
      const result = await fetchCurrentUserWeekWorklogsByIssue(
        currentCycleRange('weekly'),
      );
      if (result.kind !== 'ok') {
        log.warn('week.query.failed', { kind: result.kind });
        throw result;
      }
      return result.value;
    },
    staleTime: WEEK_STALE_TIME,
  });
}
