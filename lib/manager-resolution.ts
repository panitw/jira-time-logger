/**
 * Manager + skip-level resolution from Jira's user directory.
 *
 * Reads the worker's manager field from the Jira user record, then resolves
 * the skip-level (manager's manager) recursively. Both display names are
 * persisted to chrome.storage.local via lib/storage/settings.ts.
 *
 * Graceful degradation: no-throw when manager/skip-level is unset.
 * Per FR46: non-blocking notice, never blocks the core log-my-time flow.
 */
import { jiraGet } from '@/lib/jira-client';
import {
  JiraMyselfSchema,
  JiraUserSchema,
  JiraUserSearchResultSchema,
  type JiraUser,
} from '@/lib/jira-types';
import { log } from '@/lib/log';
import { type Result, type JiraError, ok } from '@/lib/result';
import {
  getCachedDirectReports,
  setCachedDirectReports,
  type DirectReport,
} from '@/lib/storage/direct-reports';
import { setManagerNames, type ManagerNames } from '@/lib/storage/settings';

export type { ManagerNames };
export type { DirectReport };

/**
 * Max directory candidates expanded when resolving direct reports. Bounds the
 * per-candidate fan-out so a large org never spins the scheduler indefinitely.
 */
const DIRECT_REPORTS_CANDIDATE_LIMIT = 50;

export async function resolveReportingLine(): Promise<Result<ManagerNames, JiraError>> {
  log.info('manager-resolution.start', {});

  const myselfResult = await jiraGet('rest/api/3/myself', JiraMyselfSchema);
  if (myselfResult.kind !== 'ok') {
    log.warn('manager-resolution.myself-failed', { kind: myselfResult.kind });
    return myselfResult;
  }

  const accountId = myselfResult.value.accountId;
  log.info('manager-resolution.account-resolved', { accountId });

  const userResult = await jiraGet(
    `rest/api/3/user?accountId=${encodeURIComponent(accountId)}`,
    JiraUserSchema,
  );
  if (userResult.kind !== 'ok') {
    log.warn('manager-resolution.user-failed', { kind: userResult.kind });
    return userResult;
  }

  const managerNames: ManagerNames = {
    managerDisplayName: null,
    skipLevelDisplayName: null,
    managerAccountId: null,
    skipLevelAccountId: null,
  };
  const user = userResult.value as JiraUser;

  if (!user.manager) {
    log.info('manager-resolution.manager-not-set', { accountId });
    await setManagerNames(managerNames);
    return ok(managerNames);
  }

  managerNames.managerDisplayName = user.manager.displayName ?? null;
  managerNames.managerAccountId = user.manager.accountId ?? null;
  log.info('manager-resolution.manager-resolved', {
    displayName: user.manager.displayName,
    accountId: user.manager.accountId,
  });

  if (!user.manager.accountId) {
    log.info('manager-resolution.skip-level-no-account-id', {
      managerAccountId: user.manager.accountId,
    });
    managerNames.skipLevelDisplayName = null;
    await setManagerNames(managerNames);
    return ok(managerNames);
  }

  const skipLevelResult = await jiraGet(
    `rest/api/3/user?accountId=${encodeURIComponent(user.manager.accountId)}`,
    JiraUserSchema,
  );

  if (skipLevelResult.kind !== 'ok') {
    log.warn('manager-resolution.skip-level-failed', { kind: skipLevelResult.kind });
    await setManagerNames(managerNames);
    return ok(managerNames);
  }

  const skipLevelUser = skipLevelResult.value as JiraUser;
  if (skipLevelUser.manager) {
    managerNames.skipLevelDisplayName = skipLevelUser.manager.displayName;
    managerNames.skipLevelAccountId = skipLevelUser.manager.accountId ?? null;
    log.info('manager-resolution.skip-level-resolved', {
      displayName: skipLevelUser.manager.displayName,
      accountId: skipLevelUser.manager.accountId,
    });
  }

  await setManagerNames(managerNames);
  return ok(managerNames);
}

/**
 * Resolve the current user's direct reports (the INVERSE of
 * `resolveReportingLine`: who reports to me, not who I report to).
 *
 * --- The Jira-directory limitation (Story 5.2 DECISION) ---
 * Jira Cloud has no JQL operator nor a single endpoint that filters users by
 * their `manager` attribute. The best-available Jira REST v3 surface is a
 * directory query (`GET /rest/api/3/user/search`) for candidate users, then a
 * per-candidate manager lookup (`GET /rest/api/3/user?accountId=…&expand=…`)
 * confirming `manager.accountId === currentUserAccountId`. This is the chosen
 * endpoint; it is deliberately isolated in THIS one function with a
 * Zod-validated boundary so a future swap (Teams API, org directory) is a
 * single-function change. Candidate fan-out is capped at
 * `DIRECT_REPORTS_CANDIDATE_LIMIT`.
 *
 * Contract: returns `ok([])` when the user manages nobody (or the directory is
 * empty); propagates the `JiraError` on a network/parse failure of the initial
 * directory query. All HTTP routes through `jiraGet` — never raw `fetch`.
 */
export async function findDirectReports(
  currentUserAccountId: string,
): Promise<Result<DirectReport[], JiraError>> {
  log.info('direct-reports.find.start', { accountId: currentUserAccountId });

  const searchPath = `rest/api/3/user/search?query=&maxResults=${DIRECT_REPORTS_CANDIDATE_LIMIT}`;
  const candidatesResult = await jiraGet(searchPath, JiraUserSearchResultSchema);
  if (candidatesResult.kind !== 'ok') {
    log.warn('direct-reports.find.search-failed', { kind: candidatesResult.kind });
    return candidatesResult;
  }

  const reports: DirectReport[] = [];
  // Enforce the fan-out cap client-side too — never trust the server to honor
  // `maxResults`, so the per-candidate expansion can never exceed the bound.
  const candidates = candidatesResult.value.slice(0, DIRECT_REPORTS_CANDIDATE_LIMIT);
  for (const candidate of candidates) {
    if (candidate.accountId === currentUserAccountId) continue;

    // If the directory already expanded the manager, use it directly.
    if (candidate.manager) {
      if (candidate.manager.accountId === currentUserAccountId) {
        reports.push({ accountId: candidate.accountId, displayName: candidate.displayName });
      }
      continue;
    }

    // Otherwise confirm via a per-candidate user lookup that carries `manager`.
    const userResult = await jiraGet(
      `rest/api/3/user?accountId=${encodeURIComponent(candidate.accountId)}&expand=manager`,
      JiraUserSchema,
    );
    if (userResult.kind !== 'ok') {
      // A single candidate failing must not sink the whole resolution — skip it.
      log.warn('direct-reports.find.candidate-failed', { kind: userResult.kind });
      continue;
    }
    const user = userResult.value as JiraUser;
    if (user.manager?.accountId === currentUserAccountId) {
      reports.push({ accountId: user.accountId, displayName: user.displayName });
    }
  }

  log.info('direct-reports.find.resolved', { count: reports.length });
  return ok(reports);
}

/**
 * Does the current user have any direct reports? Drives Manager-tab visibility.
 *
 * Resolves the current user's `accountId` via `rest/api/3/myself` (reusing the
 * pattern from `resolveReportingLine`), reads the per-account 24h cache, and
 * returns the cached answer when fresh. Otherwise calls `findDirectReports`,
 * refreshes the cache on success, and returns whether the set is non-empty.
 *
 * FAILS CLOSED to `false` on ANY Jira error (tab hidden) — a directory hiccup
 * must never block the worker flow nor wrongly expose the Manager tab
 * (UX-DR18, Experience Principle 6/7).
 */
export async function hasDirectReports(): Promise<boolean> {
  try {
    const myselfResult = await jiraGet('rest/api/3/myself', JiraMyselfSchema);
    if (myselfResult.kind !== 'ok') {
      log.warn('direct-reports.has.myself-failed', { kind: myselfResult.kind });
      return false;
    }
    const accountId = myselfResult.value.accountId;

    const cached = await getCachedDirectReports(accountId);
    if (cached && cached.fresh) {
      return cached.reports.length > 0;
    }

    const reportsResult = await findDirectReports(accountId);
    if (reportsResult.kind !== 'ok') {
      log.warn('direct-reports.has.find-failed', { kind: reportsResult.kind });
      return false;
    }

    await setCachedDirectReports(accountId, reportsResult.value);
    return reportsResult.value.length > 0;
  } catch (cause) {
    log.warn('direct-reports.has.unexpected', { cause: String(cause) });
    return false;
  }
}