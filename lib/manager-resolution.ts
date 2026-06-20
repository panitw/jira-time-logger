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
import { JiraMyselfSchema, JiraUserSchema, type JiraUser } from '@/lib/jira-types';
import { log } from '@/lib/log';
import { type Result, type JiraError, ok } from '@/lib/result';
import { setManagerNames, type ManagerNames } from '@/lib/storage/settings';

export type { ManagerNames };

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

  const managerNames: ManagerNames = { managerDisplayName: null, skipLevelDisplayName: null };
  const user = userResult.value as JiraUser;

  if (!user.manager) {
    log.info('manager-resolution.manager-not-set', { accountId });
    await setManagerNames(managerNames);
    return ok(managerNames);
  }

  managerNames.managerDisplayName = user.manager.displayName ?? null;
  log.info('manager-resolution.manager-resolved', {
    displayName: user.manager.displayName,
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
    log.info('manager-resolution.skip-level-resolved', {
      displayName: skipLevelUser.manager.displayName,
    });
  }

  await setManagerNames(managerNames);
  return ok(managerNames);
}