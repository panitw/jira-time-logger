/**
 * Catch-all subtask fetch (Story 2.5).
 *
 * Framework-agnostic. Returns Result<T, JiraError> at the I/O boundary.
 * Mirrors lib/ticket-search.ts: builds a JQL search URL against the
 * /rest/api/3/search/jql endpoint (Story 1.5 migrated search off /rest/api/3/search)
 * and parses with JiraSearchSchema via jiraGet.
 *
 * ISSUE TYPES (amended 2026-07-27 by owner decision — see D-CA-1 in
 * `_bmad-output/implementation-artifacts/epic-7-decision-log.md`):
 *
 * This originally filtered `issuetype = Sub-task` alone, implementing FR6's
 * "org-wide agreement that all time is recorded at the subtask level" and
 * FR10's "flat list of pre-existing shared subtasks". That turned out to be
 * false of at least one real catch-all project, which uses **Task**: the
 * query returned zero rows, so the time-off item could never be configured
 * and "Mark today as time off" was permanently unavailable — a silent, total
 * failure of FR11 with no error to explain it.
 *
 * It now accepts **Sub-task and Task**, consistent with D-7.4-11, where the
 * owner ruled that search shows every issue type and permits logging directly
 * to a non-subtask. A filter is deliberately kept rather than dropped, so the
 * catch-all stays the curated shared list FR10 describes instead of every
 * issue in the project.
 *
 * Consequence, accepted: Epic 5's matrix rolls up subtask → parent → epic
 * (`lib/hierarchy.ts:45` filters `issuetype?.subtask === true`), so hours on a
 * Task do not enter that walk. For time off that is arguably correct — it is
 * not epic work.
 */
import { jiraGet } from '@/lib/jira-client';
import { JiraSearchSchema } from '@/lib/jira-types';
import { type Result, type JiraError } from '@/lib/result';

const MAX_RESULTS = 50;

function buildCatchAllUrl(projectKey: string): string {
  // Quote the project key as a JQL string value (mirrors lib/ticket-search.ts)
  // so keys with spaces or reserved words don't produce malformed JQL. Escape
  // embedded quotes/backslashes to keep the JQL literal well-formed.
  const escaped = projectKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // `"Sub-task"` is quoted because the hyphen is not safe unquoted in JQL.
  const jql = `project = "${escaped}" AND issuetype IN ("Sub-task", "Task")`;
  return `rest/api/3/search/jql?jql=${encodeURIComponent(
    jql,
  )}&maxResults=${MAX_RESULTS}`;
}

export async function fetchCatchAllSubtasks(
  projectKey: string,
): Promise<Result<{ key: string; summary: string }[], JiraError>> {
  const key = projectKey.trim();
  if (!key) {
    return { kind: 'ok', value: [] };
  }

  const result = await jiraGet(buildCatchAllUrl(key), JiraSearchSchema);
  if (result.kind !== 'ok') {
    return result;
  }

  return {
    kind: 'ok',
    value: result.value.issues.map((i) => ({
      key: i.key,
      summary: i.fields.summary,
    })),
  };
}
