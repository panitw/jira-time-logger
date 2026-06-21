import { jiraGet } from '@/lib/jira-client';
import { JiraSearchSchema, type JiraIssue } from '@/lib/jira-types';
import { type Result, type JiraError } from '@/lib/result';

const TICKET_KEY_RE = /^[A-Za-z]+-\d+$/;
const SEARCH_FIELDS = 'key,summary';
const MAX_RESULTS = 20;

function buildSearchUrl(jql: string): string {
  return `rest/api/3/search/jql?jql=${encodeURIComponent(
    jql,
  )}&maxResults=${MAX_RESULTS}&fields=${encodeURIComponent(SEARCH_FIELDS)}`;
}

export async function searchTickets(
  query: string,
): Promise<Result<JiraIssue[], JiraError>> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { kind: 'ok', value: [] };
  }

  const jql = TICKET_KEY_RE.test(trimmed)
    ? `key = "${trimmed.toUpperCase()}"`
    : `summary ~ "${trimmed}" AND statusCategory != Done AND updated >= -28d`;

  const result = await jiraGet(buildSearchUrl(jql), JiraSearchSchema);
  if (result.kind !== 'ok') {
    return result;
  }
  return { kind: 'ok', value: result.value.issues };
}
