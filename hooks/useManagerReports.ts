import { useQuery } from '@tanstack/react-query';
import { jiraGet } from '@/lib/jira-client';
import { JiraMyselfSchema } from '@/lib/jira-types';
import { log } from '@/lib/log';
import { findDirectReports } from '@/lib/manager-resolution';
import type { JiraError } from '@/lib/result';
import type { DirectReport } from '@/lib/storage/direct-reports';

const REPORTS_STALE_TIME = 24 * 60 * 60 * 1000; // 24h — reporting line changes rarely.

/**
 * Tolerate the deferred Story 5.2 review items the matrix is the consumer of:
 * `findDirectReports` does NOT dedupe by accountId and the cache shape only
 * validates `Array.isArray(reports)`, so an element may be malformed. Drop
 * malformed entries and collapse duplicates (first display name wins).
 */
function normalizeReports(reports: DirectReport[]): DirectReport[] {
  const seen = new Set<string>();
  const out: DirectReport[] = [];
  for (const r of reports) {
    if (
      r == null ||
      typeof r !== 'object' ||
      typeof r.accountId !== 'string' ||
      typeof r.displayName !== 'string'
    ) {
      log.warn('manager-reports.malformed-entry', {});
      continue;
    }
    if (seen.has(r.accountId)) continue;
    seen.add(r.accountId);
    out.push({ accountId: r.accountId, displayName: r.displayName });
  }
  return out;
}

/**
 * Resolve the current user's direct reports — the matrix row set (Story 5.3).
 *
 * Resolves the current user's `accountId` via `rest/api/3/myself`, then
 * `findDirectReports` (which reads its own 24h per-account cache). The result is
 * normalized: deduped by accountId and malformed cached entries dropped (the
 * Story 5.2 review deferrals the matrix consumes). The queryFn throws the
 * non-`ok` `Result` so the row branches on `error.kind` like `useWeekWorklogs`.
 */
export function useManagerReports() {
  return useQuery<DirectReport[], JiraError>({
    queryKey: ['manager-reports'],
    queryFn: async () => {
      const myself = await jiraGet('rest/api/3/myself', JiraMyselfSchema);
      if (myself.kind !== 'ok') {
        log.warn('manager-reports.myself-failed', { kind: myself.kind });
        throw myself;
      }
      const reports = await findDirectReports(myself.value.accountId);
      if (reports.kind !== 'ok') {
        log.warn('manager-reports.find-failed', { kind: reports.kind });
        throw reports;
      }
      return normalizeReports(reports.value);
    },
    staleTime: REPORTS_STALE_TIME,
  });
}
