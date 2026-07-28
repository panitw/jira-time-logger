import { jiraGet } from '@/lib/jira-client';
import {
  JiraHierarchySearchSchema,
  type JiraHierarchyIssue,
  JiraSearchSchema,
  type JiraIssue,
} from '@/lib/jira-types';
import { type Result, type JiraError } from '@/lib/result';

const TICKET_KEY_RE = /^[A-Za-z]+-\d+$/;
// Story 7.4 (D-7.4-21, D-7.4-13): widened from 'key,summary' so the popup
// search surface can render the "assigned to you" pill (AC4), carry
// `issuetype.subtask` for D-7.4-11's warning, and rank open-before-done /
// recent-before-stale (D-7.4-13's forced mitigation for dropping the
// `statusCategory`/`updated` JQL filters below).
const WIDENED_SEARCH_FIELDS = 'key,summary,issuetype,assignee,status,updated';
// Byte-identical to the `dfccf5a` baseline — the only field projection any
// caller that does NOT opt in to `widen` ever sees.
const CONSERVATIVE_SEARCH_FIELDS = 'key,summary';
export const MAX_RESULTS = 20;

function buildSearchUrl(jql: string, fields: string): string {
  return `rest/api/3/search/jql?jql=${encodeURIComponent(
    jql,
  )}&maxResults=${MAX_RESULTS}&fields=${encodeURIComponent(fields)}`;
}

// Story 7.4 Finding 1 / D-7.4-15 (owner-restored scope): D-7.4-13's widened
// JQL was originally applied unconditionally, so it silently reached
// `TicketPicker.tsx` too — a consumer used by BOTH the popup and
// `WeeklyGrid.tsx` on the week surface — carrying every downside of the
// widening (done tickets, stale tickets, a broader index hit) and NONE of
// the compensating ranking, which lives only in `hooks/useTicketSearch.ts`.
// The widened behaviour is an explicit OPT-IN so any caller that does not ask
// for it gets the exact query `dfccf5a` sent, byte-for-byte
// (`lib/ticket-search.test.ts` holds that proof).
//
// NOTE: `TicketPicker.tsx` — the reason the opt-in exists, and the only
// caller that ever declined to widen — has been deleted, along with the
// end-to-end proof that lived in `TicketPicker.search-jql.test.tsx`. Every
// remaining production caller passes `{ widen: true }`, so the conservative
// branch below is currently reachable only from its own unit tests. It is
// kept rather than collapsed because D-7.4-15's boundary is the thing that
// stops the widened JQL from silently becoming the default again; delete it
// deliberately, not as a side effect.
function buildJql(trimmed: string, widen: boolean): string {
  if (TICKET_KEY_RE.test(trimmed)) {
    return `key = "${trimmed.toUpperCase()}"`;
  }
  // Story 7.4 (D-7.4-13, owner decision): the placeholder promises "any
  // ticket — key or text", so the WIDENED branch makes that literally true
  // rather than narrowing the copy. `text ~` covers summary AND description
  // (was `summary ~`, description-only matches were unreachable).
  // `statusCategory != Done` and `updated >= -28d` are BOTH dropped — a
  // ticket closed yesterday, or one untouched for 29 days, is still a valid
  // log target. The forced consequence (more/slower results, more
  // truncation) is mitigated by RANKING in `useTicketSearch` (open before
  // done, recent before stale — D-7.4-13) and by D-7.4-14's stated
  // truncation line, NOT by filtering. The single 250ms debounce and
  // `useQuery`-keyed cancellation in `useTicketSearch` are what make this
  // affordable — do not weaken them.
  return widen
    ? `text ~ "${trimmed}"`
    : `summary ~ "${trimmed}" AND statusCategory != Done AND updated >= -28d`;
}

export async function searchTickets(
  query: string,
  options: { widen: true },
): Promise<Result<JiraHierarchyIssue[], JiraError>>;
export async function searchTickets(
  query: string,
  options?: { widen?: false },
): Promise<Result<JiraIssue[], JiraError>>;
export async function searchTickets(
  query: string,
  options: { widen?: boolean } = {},
): Promise<Result<JiraIssue[] | JiraHierarchyIssue[], JiraError>> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { kind: 'ok', value: [] };
  }

  const widen = options.widen ?? false;
  const jql = buildJql(trimmed, widen);

  if (widen) {
    const result = await jiraGet(
      buildSearchUrl(jql, WIDENED_SEARCH_FIELDS),
      JiraHierarchySearchSchema,
    );
    if (result.kind !== 'ok') {
      return result;
    }
    return { kind: 'ok', value: result.value.issues };
  }

  const result = await jiraGet(
    buildSearchUrl(jql, CONSERVATIVE_SEARCH_FIELDS),
    JiraSearchSchema,
  );
  if (result.kind !== 'ok') {
    return result;
  }
  return { kind: 'ok', value: result.value.issues };
}
