import { useQuery } from '@tanstack/react-query';
import { jiraGet } from '@/lib/jira-client';
import { JiraMyselfSchema } from '@/lib/jira-types';
import { log } from '@/lib/log';
import type { JiraError } from '@/lib/result';

const MYSELF_STALE_TIME = 24 * 60 * 60 * 1000; // 24h — the current user changes rarely.

/**
 * Resolve the current (manager) user's `accountId` via `rest/api/3/myself`
 * (Story 5.6). This is the `by` field of every approval payload the fan-out
 * posts. Keyed `['current-user']` so it dedupes across the matrix; the queryFn
 * throws the non-`ok` `Result` so consumers branch on `error.kind` like the
 * other manager hooks. `useManagerReports` already resolves `myself` for the row
 * set, but does not surface the accountId — this small hook exposes it without
 * changing that hook's return shape (and its own query is deduped/cached).
 *
 * @param enabled Story 7.4 (D-7.4-21): `hooks/useTicketSearch.ts` needs this
 *   query for the "assigned to you" pill, but must NOT fire it on the
 *   popup's first-paint path (NFR1) — only once the user has actually typed
 *   a search query. Every other caller keeps the old always-on behaviour via
 *   the default.
 */
export function useCurrentUser(enabled = true) {
  return useQuery<string, JiraError>({
    queryKey: ['current-user'],
    queryFn: async () => {
      const myself = await jiraGet('rest/api/3/myself', JiraMyselfSchema);
      if (myself.kind !== 'ok') {
        log.warn('current-user.myself-failed', { kind: myself.kind });
        throw myself;
      }
      return myself.value.accountId;
    },
    staleTime: MYSELF_STALE_TIME,
    enabled,
  });
}
