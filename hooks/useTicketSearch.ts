import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type JiraHierarchyIssue } from '@/lib/jira-types';
import { type JiraError } from '@/lib/result';
import { MAX_RESULTS, searchTickets } from '@/lib/ticket-search';

/**
 * Debounced, cancellation-safe Jira ticket search (Story 7.4). `TicketPicker`'s
 * existing search is the anti-pattern this replaces: TWO chained debounces
 * (100ms + 300ms) fired through `useMutation`, which has no request identity
 * and no cancellation, so a slow response to an older query can land AFTER a
 * fast response to a newer one and clobber it. `useQuery` keyed by the
 * debounced query rules that out structurally — a stale response only ever
 * updates its OWN cache entry, never the entry the currently-rendered query
 * reads from (D-7.4-22).
 *
 * IMPORTANT: this hook calls `useCurrentUser()` internally, gated on the RAW
 * (non-debounced) query being non-empty rather than on the same 2-character
 * threshold the search itself uses — AC4 says the "assigned to you" pill
 * must never block the results list, so this GET is left to resolve in the
 * background as early as the first keystroke. The gate still guarantees it
 * never fires on the popup's first paint (NFR1): with an idle field the raw
 * query is `''`, so `enabled` is `false` until the user actually types.
 */

/** One debounce, 250ms — D-7.4-22; do not add a second one. */
export const SEARCH_DEBOUNCE_MS = 250;
/** A one-character (or whitespace-only) query is not worth a Jira round trip. */
const MIN_QUERY_LENGTH = 2;
/** Ranking-only staleness window: (D-7.4-13) prefers a match already visible
 * for THIS query over a slightly stale one, without ever re-fetching against
 * a still-live keystroke burst. */
const SEARCH_STALE_TIME_MS = 30_000;

export type SearchAssignment = 'you' | 'other' | 'unknown';

export type SearchResultItem = {
  issue: JiraHierarchyIssue;
  /**
   * `'you'` → renders the "assigned to you" pill (AC4). `'other'` → renders a
   * neutral pill carrying the assignee's display name, or the literal
   * "Unassigned" when the issue genuinely has none. `'unknown'` → renders NO
   * pill at all — `useCurrentUser` has not resolved or has failed, and AC4 is
   * explicit that the list must never guess rather than block on it.
   */
  assignment: SearchAssignment;
};

export type TicketSearchState =
  | { kind: 'idle' }
  | { kind: 'in-flight' }
  | { kind: 'results'; items: SearchResultItem[]; truncated: boolean }
  | { kind: 'empty' }
  | { kind: 'failed'; errorKind: JiraError['kind'] };

function isOpen(issue: JiraHierarchyIssue): boolean {
  return issue.fields.status?.statusCategory?.key !== 'done';
}

/** Missing/unparseable `updated` sorts as the stalest possible value, never
 * crashes, and never throws a result out of the ranking. */
function updatedMs(issue: JiraHierarchyIssue): number {
  const raw = issue.fields.updated;
  if (!raw) return -Infinity;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : -Infinity;
}

/** Finding 10 (Nit): when BOTH sides are missing/unparseable `updated`,
 * `updatedMs(b) - updatedMs(a)` is `-Infinity - (-Infinity)` = `NaN`.
 * `Array.prototype.sort`'s behaviour for a `NaN`-returning comparator is
 * implementation-defined per ECMA-262 — V8 happens to treat it as `0` today,
 * but this is a ranking path the owner made load-bearing (D-7.4-13), so the
 * tie-break is made explicit rather than relying on an engine quirk. */
function compareUpdated(a: JiraHierarchyIssue, b: JiraHierarchyIssue): number {
  const diff = updatedMs(b) - updatedMs(a);
  return Number.isNaN(diff) ? 0 : diff;
}

/**
 * Rank search results (AC4, D-7.4-22, D-7.4-13 — the owner's ranking
 * mitigation for widening the JQL):
 *   1. Assigned to you first — only when `accountId` is resolved; otherwise
 *      every item is `'unknown'` and this tier is a no-op (AC4's "never
 *      guess" rule applies to ranking, not just to the pill).
 *   2. Open before done — mitigates dropping `statusCategory != Done`.
 *   3. Recently-updated before stale — mitigates dropping `updated >= -28d`.
 *   4. Otherwise Jira's own relevance order survives: `Array.prototype.sort`
 *      is a stable sort (ES2019+), so returning `0` on a full tie never
 *      reorders two items relative to each other.
 */
function rankResults(
  issues: JiraHierarchyIssue[],
  accountId: string | undefined,
): SearchResultItem[] {
  const items: SearchResultItem[] = issues.map((issue) => ({
    issue,
    assignment: !accountId
      ? 'unknown'
      : issue.fields.assignee?.accountId === accountId
        ? 'you'
        : 'other',
  }));

  return items.sort((a, b) => {
    const aYou = a.assignment === 'you' ? 0 : 1;
    const bYou = b.assignment === 'you' ? 0 : 1;
    if (aYou !== bYou) return aYou - bYou;

    const aOpen = isOpen(a.issue) ? 0 : 1;
    const bOpen = isOpen(b.issue) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;

    return compareUpdated(a.issue, b.issue);
  });
}

export function useTicketSearch(query: string): TicketSearchState {
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const trimmed = debouncedQuery.trim();
  const enabled = trimmed.length >= MIN_QUERY_LENGTH;

  const search = useQuery<JiraHierarchyIssue[], JiraError>({
    queryKey: ['ticket-search', trimmed],
    queryFn: async () => {
      // D-7.4-15: explicit opt-in to the widened JQL — the only caller that
      // does. `TicketPicker.tsx` calls `searchTickets` with no options and
      // gets the conservative, `dfccf5a`-identical query instead.
      const result = await searchTickets(trimmed, { widen: true });
      if (result.kind !== 'ok') throw result;
      return result.value;
    },
    enabled,
    staleTime: SEARCH_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // AC4: never block the list on this — it resolves in the background while
  // the user types, and a failure/pending state just degrades to no pills.
  // Gated on the RAW query (not `enabled` above) so it starts resolving from
  // the first keystroke rather than waiting out the debounce (D-7.4-21).
  const currentUser = useCurrentUser(query.trim().length > 0);
  const accountId = currentUser.isSuccess ? currentUser.data : undefined;

  if (!enabled) {
    return { kind: 'idle' };
  }

  if (search.isPending) {
    return { kind: 'in-flight' };
  }

  if (search.isError) {
    const error = search.error as unknown;
    const errorKind: JiraError['kind'] =
      error && typeof error === 'object' && 'kind' in error
        ? (error as JiraError).kind
        : 'network';
    return { kind: 'failed', errorKind };
  }

  const issues = search.data ?? [];
  if (issues.length === 0) {
    return { kind: 'empty' };
  }

  return {
    kind: 'results',
    items: rankResults(issues, accountId),
    truncated: issues.length >= MAX_RESULTS,
  };
}
