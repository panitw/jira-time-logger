/**
 * Catch-all subtask fetch (Story 2.5).
 *
 * Framework-agnostic. Returns Result<T, JiraError> at the I/O boundary.
 * Mirrors lib/ticket-search.ts: builds a JQL search URL against the
 * /rest/api/3/search/jql endpoint (Story 1.5 migrated search off /rest/api/3/search)
 * and parses with JiraSearchSchema via jiraGet.
 *
 * ISSUE TYPES (amended twice — see D-CA-1 and D-CA-2 in
 * `_bmad-output/implementation-artifacts/epic-7-decision-log.md`):
 *
 * This originally filtered `issuetype = Sub-task`, implementing FR6's
 * "org-wide agreement that all time is recorded at the subtask level" and
 * FR10's "flat list of pre-existing shared subtasks". A real catch-all
 * project returned zero rows, so the time-off ticket could never be
 * configured and "Mark today as time off" was permanently unavailable — a
 * silent, total failure of FR11 with no error to explain it. Widening to
 * `IN ("Sub-task", "Task")` (D-CA-1) still returned zero: that project's
 * issues are typed something else again.
 *
 * So there is now **no issuetype filter at all** (D-CA-2). Guessing type
 * names cannot work — they are per-project, admin-defined, and may be
 * localised, so any allow-list is a guess that fails silently as an empty
 * dropdown. The picker instead shows every issue in the catch-all project
 * and LABELS each with its own `issuetype.name`, which keeps the list
 * readable without the query needing to know the schema.
 *
 * Consequence, accepted: the list is no longer inherently the curated
 * "shared subtasks" set FR10 describes — it is whatever the project holds,
 * capped and ordered by recency. And Epic 5's matrix rolls up subtask ->
 * parent -> epic (the deleted `lib/hierarchy.ts` filtered
 * `issuetype?.subtask === true`), so hours on a non-subtask do not enter
 * that walk. For time off
 * that is arguably correct; it is not epic work.
 */
import { jiraGet } from '@/lib/jira-client';
import { JiraHierarchySearchSchema } from '@/lib/jira-types';
import { type Result, type JiraError } from '@/lib/result';

const MAX_RESULTS = 50;

/** `issuetype` is projected so the picker can LABEL each option with its type
 * — the list stays meaningful without the query having to guess type names. */
const FIELDS = 'key,summary,issuetype';

function buildCatchAllUrl(projectKey: string): string {
  // Quote the project key as a JQL string value (mirrors lib/ticket-search.ts)
  // so keys with spaces or reserved words don't produce malformed JQL. Escape
  // embedded quotes/backslashes to keep the JQL literal well-formed.
  const escaped = projectKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // NO issuetype filter — see D-CA-2. Ordered so the most recently touched
  // items (the ones a shared catch-all actually uses) surface within the cap.
  const jql = `project = "${escaped}" ORDER BY updated DESC`;
  return `rest/api/3/search/jql?jql=${encodeURIComponent(
    jql,
  )}&maxResults=${MAX_RESULTS}&fields=${encodeURIComponent(FIELDS)}`;
}

export type CatchAllItem = {
  key: string;
  summary: string;
  /** Jira's own issue-type name, e.g. `Sub-task`, `Task`, `Service Request`.
   * `null` when Jira omitted it. Shown in the picker so the user can tell the
   * items apart without us needing to know the project's schema. */
  issueType: string | null;
};

export async function fetchCatchAllSubtasks(
  projectKey: string,
): Promise<Result<CatchAllItem[], JiraError>> {
  const key = projectKey.trim();
  if (!key) {
    return { kind: 'ok', value: [] };
  }

  const result = await jiraGet(buildCatchAllUrl(key), JiraHierarchySearchSchema);
  if (result.kind !== 'ok') {
    return result;
  }

  return {
    kind: 'ok',
    value: result.value.issues.map((i) => ({
      key: i.key,
      summary: i.fields.summary,
      issueType: i.fields.issuetype?.name ?? null,
    })),
  };
}
