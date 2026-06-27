import { useQuery } from '@tanstack/react-query';
import {
  resolveCanonicalManager,
  type CanonicalManagerResult,
} from '@/lib/canonical-manager';

const CANONICAL_STALE_TIME = 24 * 60 * 60 * 1000; // 24h — matches the directory freshness window (REPORTS_STALE_TIME / DIRECT_REPORTS_TTL_MS).

/**
 * Is the current user the canonical manager of `reportAccountId` (FR36, Story
 * 5.8)? Wraps `resolveCanonicalManager` in a TanStack query keyed minimally on
 * the report's accountId so the same report queried from multiple places dedupes
 * to one fetch.
 *
 * `staleTime` is 24h, matching `useManagerReports`' `REPORTS_STALE_TIME` and the
 * direct-reports cache TTL — the same directory-freshness window. A stale query
 * refetches on the next popup mount, so a `manager` field that changes in Jira
 * mid-session re-evaluates canonicality (and flips Approve enabled ↔ disabled)
 * with no wiring beyond the `staleTime` (AC7).
 *
 * The query is `enabled` only once the current user's accountId is known — until
 * then there is nothing to compare against, and the matrix surfaces the existing
 * `'Resolving your account…'` reason rather than mislabeling the transient load
 * as a permission denial.
 *
 * `resolveCanonicalManager` fails closed to a *value* (never throws / never
 * returns a non-`ok` Result), so the queryFn returns that value directly: a
 * transient error renders the safe read-only state rather than an error row.
 * Per the manager-hook convention, the popup `QueryClient`'s retry/retryDelay is
 * NOT overridden here.
 */
export function useCanApprove(
  reportAccountId: string,
  currentUserAccountId: string | undefined,
) {
  return useQuery<CanonicalManagerResult>({
    // Keyed on BOTH the report AND the current user: canonicality
    // (`manager.accountId === currentUserAccountId`) is user-relative, so the
    // verdict must not be reused across a different signed-in account. Reports
    // queried by the same user still dedupe to one fetch.
    queryKey: ['canonical-manager', reportAccountId, currentUserAccountId],
    queryFn: () => resolveCanonicalManager(reportAccountId, currentUserAccountId!),
    staleTime: CANONICAL_STALE_TIME,
    enabled: !!currentUserAccountId,
  });
}
