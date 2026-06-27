/**
 * Single wrapper for all Jira Cloud REST API v3 calls.
 *
 * Per architecture.md > API & Communication Patterns:
 *   - All Jira HTTP goes through this module
 *   - Returns Result<T, JiraError>
 *   - Routes through scheduler for rate limiting
 *   - Refreshes OAuth token on 401
 *   - Parses responses with Zod schemas from jira-types.ts
 */
import { type z } from 'zod';
import { type CycleRange } from '@/lib/cycle-range';
import {
  JiraMyselfSchema,
  JiraSearchSchema,
  JiraWorklogListSchema,
  JiraWorklogSchema,
  JiraMatrixSearchSchema,
  JiraIssueLookupSchema,
  type JiraWorklog,
  type WeekIssueWorklogs,
  type ReportEpicWorklogs,
} from '@/lib/jira-types';
import { log } from '@/lib/log';
import { refreshTokens } from '@/lib/oauth/refresh';
import { type Result, type JiraError, ok, authExpired, rateLimited, network, parseError, forbidden, notFound } from '@/lib/result';
import { scheduler } from '@/lib/scheduler';
import { getAuth, type AuthBundle } from '@/lib/storage/tokens';

function getBaseUrl(bundle: AuthBundle): string {
  if (bundle.kind === 'oauth') {
    return `https://api.atlassian.com/ex/jira/${bundle.cloudId}`;
  }
  return bundle.siteUrl.replace(/\/$/, '');
}

function getAuthHeader(bundle: AuthBundle): string {
  if (bundle.kind === 'oauth') {
    return `Bearer ${bundle.access_token}`;
  }
  const encoded = btoa(`${bundle.email}:${bundle.apiToken}`);
  return `Basic ${encoded}`;
}

export async function jiraGet<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<Result<T, JiraError>> {
  const bundle = await getAuth();
  if (!bundle) {
    return authExpired();
  }

  const result = await scheduler.acquire(async () => {
    try {
      const url = `${getBaseUrl(bundle)}/${path}`;
      const headers: Record<string, string> = {
        Authorization: getAuthHeader(bundle),
        Accept: 'application/json',
      };

      log.debug('jira.get.request', { path });

      let res = await fetch(url, { headers });

      if (res.status === 401 && bundle.kind === 'oauth') {
        log.info('jira.get.401-refreshing', { path });
        const refreshResult = await refreshTokens();
        if (refreshResult.kind === 'ok') {
          const newBundle = await getAuth();
          if (!newBundle) return authExpired();
          headers.Authorization = getAuthHeader(newBundle);
          res = await fetch(url, { headers });
        } else {
          return authExpired();
        }
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
        return rateLimited(Number.isFinite(retryAfterMs) ? retryAfterMs : 1000);
      }

      if (res.status === 401) {
        return authExpired();
      }

      if (res.status === 403) {
        return forbidden();
      }

      if (res.status === 404) {
        return notFound();
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return network(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      const json: unknown = await res.json().catch(() => null);
      if (json === null) {
        return parseError('Response body is not valid JSON');
      }

      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        return parseError(parsed.error.issues);
      }

      return ok(parsed.data);
    } catch (e) {
      log.error('jira.get.unexpected-error', { path, cause: String(e) });
      return network(String(e));
    }
  });

  return result;
}

/**
 * Post a worklog to a Jira issue.
 *
 * POST /rest/api/3/issue/{issueKey}/worklog
 * Body is FLAT (not wrapped in { fields }) — different from create-issue.
 * Returns the created worklog object.
 */
export async function postWorklog(
  issueKey: string,
  body: { timeSpentSeconds: number; started: string; comment?: string },
): Promise<Result<JiraWorklog, JiraError>> {
  return jiraPost(
    `rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`,
    body,
    JiraWorklogSchema,
  );
}
export async function jiraPost<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<Result<T, JiraError>> {
  const bundle = await getAuth();
  if (!bundle) {
    return authExpired();
  }

  const result = await scheduler.acquire(async () => {
    try {
      const url = `${getBaseUrl(bundle)}/${path}`;
      const headers: Record<string, string> = {
        Authorization: getAuthHeader(bundle),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      log.debug('jira.post.request', { path });

      let res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (res.status === 401 && bundle.kind === 'oauth') {
        log.info('jira.post.401-refreshing', { path });
        const refreshResult = await refreshTokens();
        if (refreshResult.kind === 'ok') {
          const newBundle = await getAuth();
          if (!newBundle) return authExpired();
          headers.Authorization = getAuthHeader(newBundle);
          res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });
        } else {
          return authExpired();
        }
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
        return rateLimited(Number.isFinite(retryAfterMs) ? retryAfterMs : 1000);
      }

      if (res.status === 401) {
        return authExpired();
      }

      if (res.status === 403) {
        return forbidden();
      }

      if (res.status === 404) {
        return notFound();
      }

      if (!res.ok) {
        const resBody = await res.text().catch(() => '');
        return network(`HTTP ${res.status}: ${resBody.slice(0, 200)}`);
      }

      const json: unknown = await res.json().catch(() => null);
      if (json === null) {
        return parseError('Response body is not valid JSON');
      }

      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        return parseError(parsed.error.issues);
      }

      return ok(parsed.data);
    } catch (e) {
      log.error('jira.post.unexpected-error', { path, cause: String(e) });
      return network(String(e));
    }
  });

  return result;
}

/**
 * PUT a body to a Jira resource and parse the JSON response.
 * Mirrors `jiraPost` exactly, only the HTTP method differs.
 */
export async function jiraPut<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<Result<T, JiraError>> {
  const bundle = await getAuth();
  if (!bundle) {
    return authExpired();
  }

  const result = await scheduler.acquire(async () => {
    try {
      const url = `${getBaseUrl(bundle)}/${path}`;
      const headers: Record<string, string> = {
        Authorization: getAuthHeader(bundle),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      log.debug('jira.put.request', { path });

      let res = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });

      if (res.status === 401 && bundle.kind === 'oauth') {
        log.info('jira.put.401-refreshing', { path });
        const refreshResult = await refreshTokens();
        if (refreshResult.kind === 'ok') {
          const newBundle = await getAuth();
          if (!newBundle) return authExpired();
          headers.Authorization = getAuthHeader(newBundle);
          res = await fetch(url, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body),
          });
        } else {
          return authExpired();
        }
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
        return rateLimited(Number.isFinite(retryAfterMs) ? retryAfterMs : 1000);
      }

      if (res.status === 401) {
        return authExpired();
      }

      if (res.status === 403) {
        return forbidden();
      }

      if (res.status === 404) {
        return notFound();
      }

      if (!res.ok) {
        const resBody = await res.text().catch(() => '');
        return network(`HTTP ${res.status}: ${resBody.slice(0, 200)}`);
      }

      const json: unknown = await res.json().catch(() => null);
      if (json === null) {
        return parseError('Response body is not valid JSON');
      }

      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        return parseError(parsed.error.issues);
      }

      return ok(parsed.data);
    } catch (e) {
      log.error('jira.put.unexpected-error', { path, cause: String(e) });
      return network(String(e));
    }
  });

  return result;
}

/**
 * DELETE a Jira resource.
 *
 * Jira returns 204 No Content (no JSON body) on success, so we do NOT call
 * `res.json()` / schema-parse here. Mirrors the status-handling block of the
 * other wrappers otherwise.
 */
export async function jiraDelete(path: string): Promise<Result<void, JiraError>> {
  const bundle = await getAuth();
  if (!bundle) {
    return authExpired();
  }

  const result = await scheduler.acquire(async () => {
    try {
      const url = `${getBaseUrl(bundle)}/${path}`;
      const headers: Record<string, string> = {
        Authorization: getAuthHeader(bundle),
        Accept: 'application/json',
      };

      log.debug('jira.delete.request', { path });

      let res = await fetch(url, { method: 'DELETE', headers });

      if (res.status === 401 && bundle.kind === 'oauth') {
        log.info('jira.delete.401-refreshing', { path });
        const refreshResult = await refreshTokens();
        if (refreshResult.kind === 'ok') {
          const newBundle = await getAuth();
          if (!newBundle) return authExpired();
          headers.Authorization = getAuthHeader(newBundle);
          res = await fetch(url, { method: 'DELETE', headers });
        } else {
          return authExpired();
        }
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
        return rateLimited(Number.isFinite(retryAfterMs) ? retryAfterMs : 1000);
      }

      if (res.status === 401) {
        return authExpired();
      }

      if (res.status === 403) {
        return forbidden();
      }

      if (res.status === 404) {
        return notFound();
      }

      if (!res.ok) {
        const resBody = await res.text().catch(() => '');
        return network(`HTTP ${res.status}: ${resBody.slice(0, 200)}`);
      }

      // 204 No Content — no body to parse.
      return ok(undefined);
    } catch (e) {
      log.error('jira.delete.unexpected-error', { path, cause: String(e) });
      return network(String(e));
    }
  });

  return result;
}

/**
 * Update an existing worklog on a Jira issue.
 *
 * PUT /rest/api/3/issue/{issueKey}/worklog/{worklogId}
 * Body is FLAT (mirrors `postWorklog`). `comment`, when present, must already
 * be an ADF document object (see lib/adf.ts), never a plain string.
 */
export async function updateWorklog(
  issueKey: string,
  worklogId: string,
  body: { timeSpentSeconds: number; started: string; comment?: unknown },
): Promise<Result<JiraWorklog, JiraError>> {
  return jiraPut(
    `rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
    body,
    JiraWorklogSchema,
  );
}

/**
 * Delete a worklog from a Jira issue.
 *
 * DELETE /rest/api/3/issue/{issueKey}/worklog/{worklogId}
 */
export async function deleteWorklog(
  issueKey: string,
  worklogId: string,
): Promise<Result<void, JiraError>> {
  return jiraDelete(
    `rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
  );
}

/** Format a Date as `yyyy-MM-dd` (local) for JQL `worklogDate` comparisons. */
function toJqlDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Fetch the current user's worklogs for the given week range (Story 3.1).
 *
 * Strategy:
 *   1. Resolve the current user's accountId via `rest/api/3/myself`.
 *   2. JQL-search for issues the user logged time on this week
 *      (`worklogAuthor = currentUser() AND worklogDate >= <start> AND
 *       worklogDate <= <end>`).
 *   3. Read each matching issue's worklog list and keep only the current
 *      user's worklogs whose `started` falls within the range.
 *
 * PTO worklogs are ordinary worklogs on the catch-all subtask and count like
 * any other — no special handling. All HTTP routes through `jiraGet` (which
 * already wraps scheduler + auth + 401-refresh + Result), never raw `fetch`.
 */
export async function fetchCurrentUserWeekWorklogs(
  range: CycleRange,
): Promise<Result<JiraWorklog[], JiraError>> {
  const myselfResult = await jiraGet('rest/api/3/myself', JiraMyselfSchema);
  if (myselfResult.kind !== 'ok') {
    return myselfResult;
  }
  const accountId = myselfResult.value.accountId;

  const startDate = toJqlDate(range.start);
  const endDate = toJqlDate(range.end);
  const jql = `worklogAuthor = currentUser() AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}"`;
  // `summary` is requested (not just `key`) because JiraSearchSchema/JiraIssueSchema
  // require `fields.summary`; asking for `key` alone returns `fields: {}` and the
  // Zod parse fails, silently breaking the badge. Mirrors lib/ticket-search.ts.
  const searchPath = `rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=key,summary`;

  const searchResult = await jiraGet(searchPath, JiraSearchSchema);
  if (searchResult.kind !== 'ok') {
    return searchResult;
  }

  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const collected: JiraWorklog[] = [];

  // Use the worklog endpoint's `startedAfter`/`startedBefore` (epoch ms) so the
  // server returns only worklogs in the week window. Jira returns worklogs
  // oldest-first, so on a long-lived catch-all/PTO subtask the current week's
  // entries land on the LAST page; without this filter, reading only the first
  // page would silently miss them. The filter keeps the page small and relevant.
  const startedAfter = startMs - 1; // inclusive lower bound
  const startedBefore = endMs + 1; // inclusive upper bound
  for (const issue of searchResult.value.issues) {
    const worklogResult = await jiraGet(
      `rest/api/3/issue/${encodeURIComponent(issue.key)}/worklog?startedAfter=${startedAfter}&startedBefore=${startedBefore}`,
      JiraWorklogListSchema,
    );
    if (worklogResult.kind !== 'ok') {
      return worklogResult;
    }

    for (const worklog of worklogResult.value.worklogs) {
      if (worklog.author?.accountId !== accountId) continue;
      if (worklog.started) {
        const startedMs = new Date(worklog.started).getTime();
        if (!Number.isFinite(startedMs) || startedMs < startMs || startedMs > endMs) {
          continue;
        }
      }
      collected.push(worklog);
    }
  }

  return ok(collected);
}

/**
 * Like `fetchCurrentUserWeekWorklogs`, but preserves which issue each worklog
 * belongs to (Story 4.1, week grid). Returns one `WeekIssueWorklogs` per issue
 * that has at least one of the current user's in-range worklogs, carrying the
 * issue `key`/`summary` so the grid can build per-subtask rows.
 *
 * NOTE: This is a sibling of `fetchCurrentUserWeekWorklogs` — do NOT collapse
 * the two. The flat version is consumed by the badge (3.1) and banner (3.3),
 * which only need a sum; this version is consumed by the Week view grid.
 */
export async function fetchCurrentUserWeekWorklogsByIssue(
  range: CycleRange,
): Promise<Result<WeekIssueWorklogs[], JiraError>> {
  const myselfResult = await jiraGet('rest/api/3/myself', JiraMyselfSchema);
  if (myselfResult.kind !== 'ok') {
    return myselfResult;
  }
  const accountId = myselfResult.value.accountId;

  const startDate = toJqlDate(range.start);
  const endDate = toJqlDate(range.end);
  const jql = `worklogAuthor = currentUser() AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}"`;
  const searchPath = `rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=key,summary`;

  const searchResult = await jiraGet(searchPath, JiraSearchSchema);
  if (searchResult.kind !== 'ok') {
    return searchResult;
  }

  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const startedAfter = startMs - 1; // inclusive lower bound
  const startedBefore = endMs + 1; // inclusive upper bound

  const collected: WeekIssueWorklogs[] = [];
  for (const issue of searchResult.value.issues) {
    const worklogResult = await jiraGet(
      `rest/api/3/issue/${encodeURIComponent(issue.key)}/worklog?startedAfter=${startedAfter}&startedBefore=${startedBefore}`,
      JiraWorklogListSchema,
    );
    if (worklogResult.kind !== 'ok') {
      return worklogResult;
    }

    const worklogs: JiraWorklog[] = [];
    for (const worklog of worklogResult.value.worklogs) {
      if (worklog.author?.accountId !== accountId) continue;
      if (worklog.started) {
        const startedMs = new Date(worklog.started).getTime();
        if (!Number.isFinite(startedMs) || startedMs < startMs || startedMs > endMs) {
          continue;
        }
      }
      worklogs.push(worklog);
    }

    if (worklogs.length > 0) {
      collected.push({ key: issue.key, summary: issue.fields.summary, worklogs });
    }
  }

  return ok(collected);
}

/** One worklog the matrix retains, flattened to the matrix data contract. */
type MatrixWorklogRecord = ReportEpicWorklogs['worklogs'][number];

/**
 * Resolve the Epic column a subtask rolls up to (Story 5.3).
 *
 * The report-scoped search returns the subtask's *direct* `parent` (usually the
 * Story/Task), not its Epic. We resolve the Epic with at most one extra lookup
 * per distinct parent key — `getEpic(parentKey)` returns the parent's own
 * `parent` (the Epic). If the parent has no further parent (it IS the top of
 * the chain), the hours bucket under that top-most resolvable key rather than
 * being dropped (audit integrity). Lookups are memoized in `cache` so a column
 * shared by many subtasks costs one request.
 *
 * Subtasks missing a `parent` entirely fall back to a synthetic bucket keyed on
 * their own key — hours are never lost.
 */
async function resolveEpicForParent(
  parentKey: string,
  parentSummary: string,
  cache: Map<string, { epicKey: string; epicSummary: string }>,
): Promise<Result<{ epicKey: string; epicSummary: string }, JiraError>> {
  const cached = cache.get(parentKey);
  if (cached) return ok(cached);

  const lookup = await jiraGet(
    `rest/api/3/issue/${encodeURIComponent(parentKey)}?fields=key,summary,parent,issuetype`,
    JiraIssueLookupSchema,
  );
  if (lookup.kind !== 'ok') {
    return lookup;
  }

  const grandparent = lookup.value.fields.parent;
  const resolved = grandparent
    ? {
        epicKey: grandparent.key,
        epicSummary: grandparent.fields?.summary ?? grandparent.key,
      }
    : { epicKey: parentKey, epicSummary: parentSummary };

  cache.set(parentKey, resolved);
  return ok(resolved);
}

/**
 * Fetch one report's worklogs in the cycle, grouped by owning Epic (Story 5.3).
 *
 * Sibling of `fetchCurrentUserWeekWorklogsByIssue` — do NOT collapse the two.
 * Differences: (a) the JQL is scoped to the *report* via
 * `worklogAuthor = "<accountId>"` (NOT `currentUser()`); (b) retained worklogs
 * are filtered to `author.accountId === reportAccountId`; (c) each worklogged
 * subtask is rolled up to its parent **Epic** (the matrix column), preserving
 * the per-ticket records (with `updated`) so Stories 5.4/5.5 can consume them.
 *
 * All HTTP routes through `jiraGet` (scheduler + auth + 401-refresh + Zod +
 * Result) — never raw `fetch`. Returns one `ReportEpicWorklogs` per Epic the
 * report touched in the cycle. Empty when the report logged nothing.
 */
export async function fetchReportCycleWorklogsByEpic(
  reportAccountId: string,
  range: CycleRange,
): Promise<Result<ReportEpicWorklogs[], JiraError>> {
  const startDate = toJqlDate(range.start);
  const endDate = toJqlDate(range.end);
  const jql = `worklogAuthor = "${reportAccountId}" AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}"`;
  // `parent`/`issuetype` are requested so each subtask can roll up to its Epic.
  const searchPath = `rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=${encodeURIComponent('key,summary,parent,issuetype')}`;

  const searchResult = await jiraGet(searchPath, JiraMatrixSearchSchema);
  if (searchResult.kind !== 'ok') {
    return searchResult;
  }

  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const startedAfter = startMs - 1;
  const startedBefore = endMs + 1;

  // Epic-resolution cache shared across all subtasks in this fetch.
  const epicCache = new Map<string, { epicKey: string; epicSummary: string }>();
  // epicKey → accumulating group.
  const groups = new Map<string, ReportEpicWorklogs>();

  for (const issue of searchResult.value.issues) {
    // Resolve the Epic column for this subtask. A subtask with no parent at all
    // buckets under its own key so its hours are never dropped.
    let epic: { epicKey: string; epicSummary: string };
    const parent = issue.fields.parent;
    if (parent) {
      const resolved = await resolveEpicForParent(
        parent.key,
        parent.fields?.summary ?? parent.key,
        epicCache,
      );
      if (resolved.kind !== 'ok') {
        return resolved;
      }
      epic = resolved.value;
    } else {
      epic = { epicKey: issue.key, epicSummary: issue.fields.summary };
    }

    const worklogResult = await jiraGet(
      `rest/api/3/issue/${encodeURIComponent(issue.key)}/worklog?startedAfter=${startedAfter}&startedBefore=${startedBefore}`,
      JiraWorklogListSchema,
    );
    if (worklogResult.kind !== 'ok') {
      return worklogResult;
    }

    const records: MatrixWorklogRecord[] = [];
    let issueSeconds = 0;
    for (const worklog of worklogResult.value.worklogs) {
      if (worklog.author?.accountId !== reportAccountId) continue;
      if (worklog.started) {
        const startedMs = new Date(worklog.started).getTime();
        if (!Number.isFinite(startedMs) || startedMs < startMs || startedMs > endMs) {
          continue;
        }
      }
      const seconds = worklog.timeSpentSeconds;
      issueSeconds += seconds;
      records.push({
        ticketKey: issue.key,
        ticketSummary: issue.fields.summary,
        seconds,
        ...(worklog.started ? { started: worklog.started } : {}),
        ...(worklog.updated ? { updated: worklog.updated } : {}),
      });
    }

    if (records.length === 0) continue;

    const existing = groups.get(epic.epicKey);
    if (existing) {
      existing.totalSeconds += issueSeconds;
      existing.worklogs.push(...records);
    } else {
      groups.set(epic.epicKey, {
        epicKey: epic.epicKey,
        epicSummary: epic.epicSummary,
        totalSeconds: issueSeconds,
        worklogs: records,
      });
    }
  }

  return ok(Array.from(groups.values()));
}