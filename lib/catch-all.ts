/**
 * Catch-all subtask fetch (Story 2.5).
 *
 * Framework-agnostic. Returns Result<T, JiraError> at the I/O boundary.
 * Mirrors lib/ticket-search.ts: builds a JQL search URL against the
 * /rest/api/3/search/jql endpoint (Story 1.5 migrated search off /rest/api/3/search)
 * and parses with JiraSearchSchema via jiraGet.
 *
 * The JQL filters issuetype=Sub-task so the catch-all group is inherently
 * subtask-only (FR6/FR10 subtask-only logging).
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
  const jql = `project = "${escaped}" AND issuetype = Sub-task`;
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
