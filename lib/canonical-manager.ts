/**
 * Canonical-manager check (FR36, Story 5.8).
 *
 * A report's *canonical* manager is the person named in that report's Jira
 * `manager` field (FR44). Only the canonical manager may Approve / Re-approve a
 * report's cycle; everyone else with read visibility reads the matrix but cannot
 * approve. This module computes that canonicality as an INDEPENDENT per-report
 * verification — it does NOT rely on the row-set source being canonical-only, so
 * the Approve action is correctly gated read-only the moment a non-canonical
 * report surfaces (a broadened row set, or a `manager` field that changed in
 * Jira mid-session).
 *
 * Fail-closed: if canonicality cannot be proven (the lookup errors, or the
 * `manager` field is absent), the report is treated as NON-canonical so a write
 * action is never enabled on an unproven row. Mirrors `hasDirectReports()`
 * returning `false` on any error (`lib/manager-resolution.ts`).
 *
 * Framework-agnostic (no React imports). All HTTP flows through `jiraGet` — the
 * service-worker token-bucket scheduler boundary — never raw `fetch`.
 */
import { jiraGet } from '@/lib/jira-client';
import { JiraUserSchema } from '@/lib/jira-types';
import { log } from '@/lib/log';

export type CanonicalManagerResult = {
  isCanonical: boolean;
  /** The report's actual canonical-manager display name (for the AC1 tooltip); null when unprovable. */
  canonicalManagerName: string | null;
};

/**
 * Determine whether `currentUserAccountId` is the canonical manager of the
 * report identified by `reportAccountId`, and surface the report's canonical-
 * manager display name for the read-only tooltip.
 *
 * Reads the report's `manager` field from Jira's user directory via the same
 * `&expand=manager` lookup `findDirectReports` uses. Fails closed to
 * `{ isCanonical: false, canonicalManagerName: null }` on any non-`ok` Result or
 * when `manager` is absent.
 */
export async function resolveCanonicalManager(
  reportAccountId: string,
  currentUserAccountId: string,
): Promise<CanonicalManagerResult> {
  const userResult = await jiraGet(
    `rest/api/3/user?accountId=${encodeURIComponent(reportAccountId)}&expand=manager`,
    JiraUserSchema,
  );

  if (userResult.kind !== 'ok') {
    // Fail closed — an unprovable manager must never enable a write action.
    log.warn('canonical-manager.lookup-failed', { kind: userResult.kind });
    return { isCanonical: false, canonicalManagerName: null };
  }

  const manager = userResult.value.manager;
  if (manager == null) {
    return { isCanonical: false, canonicalManagerName: null };
  }

  return {
    isCanonical: manager.accountId === currentUserAccountId,
    canonicalManagerName: manager.displayName,
  };
}
