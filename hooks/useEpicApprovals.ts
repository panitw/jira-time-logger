import { useQuery } from '@tanstack/react-query';
import type { ApprovalComment } from '@/lib/comment-schema';
import { getCurrentCycleId } from '@/lib/cycle-range';
import { log } from '@/lib/log';
import { findApprovalComments } from '@/lib/parser';
import type { JiraError } from '@/lib/result';
import type { CycleId } from '@/lib/storage/view-state';

const OPEN_CYCLE_STALE_TIME = 60_000; // AR23 — matches the popup QueryClient default.

/**
 * Is `cycleId` the cycle we're currently in? Closed/past cycles are immutable,
 * so their approval reads can be cached forever (`staleTime: Infinity`). Mirrors
 * `useManagerRow.isCurrentCycle` — a match against either canonical current id
 * (calendar-month `yyyy-MM` or weekly ISO-Monday `yyyy-MM-dd`) means "open".
 */
function isCurrentCycle(cycleId: CycleId): boolean {
  return (
    cycleId === getCurrentCycleId('calendar-month') ||
    cycleId === getCurrentCycleId('weekly')
  );
}

/**
 * One TanStack query per Epic column (Story 5.4): fetch the verified, newest-
 * wins approval comments via Story 5.1's `findApprovalComments`. Epics resolve
 * independently — one slow/failed Epic approval query never blocks the matrix;
 * on error the consumer treats that Epic's cells as unapproved (and still renders
 * the row's hours).
 *
 * Mirrors `useManagerRow`: the queryFn throws the non-`ok` `Result` so TanStack's
 * `error` carries the discriminated `JiraError`, and all HTTP flows through
 * `jiraGet` → the service-worker token-bucket scheduler (AR12, NFR2). The popup
 * `QueryClient` already supplies the Retry-After-aware retry/retryDelay — do NOT
 * override it here.
 *
 * The query is keyed only on `epicKey` so the same Epic queried from multiple
 * rows is deduped to one fetch. `cycle` drives only the open-vs-closed staleTime.
 */
export function useEpicApprovals(epicKey: string, cycle: CycleId) {
  return useQuery<ApprovalComment[], JiraError>({
    queryKey: ['epic-approvals', epicKey],
    queryFn: async () => {
      const result = await findApprovalComments(epicKey);
      if (result.kind !== 'ok') {
        log.warn('epic-approvals.query.failed', { kind: result.kind });
        throw result;
      }
      return result.value;
    },
    staleTime: isCurrentCycle(cycle) ? OPEN_CYCLE_STALE_TIME : Infinity,
  });
}
