import { useQuery } from '@tanstack/react-query';
import type { CycleRange } from '@/lib/cycle-range';
import { getCurrentCycleId } from '@/lib/cycle-range';
import { fetchReportCycleWorklogsByEpic } from '@/lib/jira-client';
import type { ReportEpicWorklogs } from '@/lib/jira-types';
import { log } from '@/lib/log';
import type { JiraError } from '@/lib/result';
import type { CycleId } from '@/lib/storage/view-state';

const OPEN_CYCLE_STALE_TIME = 60_000; // AR23 — matches the popup QueryClient default.

/**
 * Is `cycleId` the cycle we're currently in? Closed/past cycles are immutable,
 * so their data can be cached forever (`staleTime: Infinity`). We don't know the
 * configured cadence here, so a match against either canonical current id
 * (calendar-month `yyyy-MM` or weekly ISO-Monday `yyyy-MM-dd`) means "open".
 */
function isCurrentCycle(cycleId: CycleId): boolean {
  return (
    cycleId === getCurrentCycleId('calendar-month') ||
    cycleId === getCurrentCycleId('weekly')
  );
}

/**
 * One TanStack query per report (Story 5.3). Rows resolve independently — a
 * slow/failed report never blocks the others — and each fetch flows through
 * `jiraGet` → the service-worker token-bucket scheduler, keeping the per-person
 * fan-out rate-safe (NFR2).
 *
 * Mirrors `useWeekWorklogs`: the queryFn throws the non-`ok` `Result` so
 * TanStack's `error` carries the discriminated `JiraError` and the row branches
 * on `error.kind`. The popup `QueryClient` already supplies the Retry-After-
 * aware retry/retryDelay (AC 11) — do NOT override it here.
 */
export function useManagerRow(
  reportAccountId: string,
  cycleId: CycleId,
  range: CycleRange,
) {
  return useQuery<ReportEpicWorklogs[], JiraError>({
    // `range` is intentionally NOT in the key: it is a pure, deterministic
    // function of `cycleId` (see ManagerMatrix's `range` useMemo), so a given
    // cycleId always maps to the same range. Adding it would only risk drift if
    // a caller hand-built a range inconsistent with the id — don't.
    queryKey: ['manager-row', reportAccountId, cycleId],
    queryFn: async () => {
      const result = await fetchReportCycleWorklogsByEpic(reportAccountId, range);
      if (result.kind !== 'ok') {
        log.warn('manager-row.query.failed', { kind: result.kind });
        throw result;
      }
      return result.value;
    },
    staleTime: isCurrentCycle(cycleId) ? OPEN_CYCLE_STALE_TIME : Infinity,
  });
}
