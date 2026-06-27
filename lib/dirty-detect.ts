/**
 * Per-(user, cycle) dirty detection for the manager approval matrix (Story 5.4).
 *
 * Implements the dirty-detection rule documented in `PROTOCOL.md`
 * §"Dirty-detection rule (forward reference — Story 5.4)" (lines 117–127):
 *
 *   An approved cycle is **dirty** (stale approval) when any worklog covered by
 *   the approval has a Jira `updated` timestamp **later than** the approval's
 *   `at` time — i.e. the work changed after it was approved.
 *
 * Framework-agnostic: NO React, NO chrome, NO network. Pure `Date.parse` epoch
 * comparison with no clock read — fully deterministic and unit-testable with
 * injected fixtures (mirrors how Story 4.2's `computeDayStatuses` injects
 * `today`). The dirty anchor is the approval **payload `at`** field (the
 * checksum-covered field returned by `approvalAtFor`), NOT the Jira-native
 * `created` timestamp (`findApprovalComments` uses `created` only for its
 * newest-wins tiebreak — see Story 5.1).
 */
import type { ApprovalComment } from '@/lib/comment-schema';

/** The subset of a worklog record the dirty rule reads: just its `updated` time. */
export type WorklogTimes = { updated?: string };

/**
 * Is an approved cycle dirty (stale) — has any covered worklog been edited after
 * the approval was recorded?
 *
 * Deterministic rules (no clock read):
 * - `null`/`undefined`/empty `approvalAt` → `false`. The cycle is **unapproved**,
 *   which is NOT dirty ("no approval" ≠ "stale approval"); an unapproved cycle is
 *   never red-by-default (epics §5.4 AC 2).
 * - Unparseable `approvalAt` (`Date.parse` → `NaN`) → `false`. A corrupt
 *   timestamp must never spuriously flag every cell; the corrupted-approval path
 *   is handled separately by the 5.1 parser failing closed.
 * - Else `true` iff **at least one** worklog has a parseable `updated` whose
 *   epoch ms is **strictly greater than** `Date.parse(approvalAt)`
 *   (`updated > approval.at`). `updated === at` is NOT dirty (a worklog touched
 *   at the exact approval instant is considered covered — matches "later than").
 *   A worklog with no `updated` or an unparseable `updated` does NOT contribute.
 */
export function isCycleDirty(
  worklogs: ReadonlyArray<WorklogTimes>,
  approvalAt: string | null | undefined,
): boolean {
  if (!approvalAt) return false;
  const approvalMs = Date.parse(approvalAt);
  if (Number.isNaN(approvalMs)) return false;

  for (const worklog of worklogs) {
    if (worklog.updated === undefined) continue;
    const updatedMs = Date.parse(worklog.updated);
    if (Number.isNaN(updatedMs)) continue;
    if (updatedMs > approvalMs) return true;
  }
  return false;
}

/**
 * Resolve the approval anchor timestamp for a single `(user, cycle)` pair so
 * callers never re-implement the matching.
 *
 * Returns the `at` of the approval whose `user`+`cycle` equal the arguments
 * **exactly**, or `null` when none matches. It considers ONLY this `(user,
 * cycle)` pair — another user's approval on the same Epic is irrelevant (FR41).
 *
 * `findApprovalComments` (Story 5.1) already applied "newest wins per (user,
 * cycle)", so the input list has at most one matching record. If (defensively)
 * more than one matches, keep the one with the latest parseable payload `at`; a
 * parseable `at` always beats an unparseable one.
 */
export function approvalAtFor(
  approvals: ReadonlyArray<ApprovalComment>,
  user: string,
  cycle: string,
): string | null {
  let bestAt: string | null = null;
  let bestMs = -Infinity;

  for (const approval of approvals) {
    if (approval.user !== user || approval.cycle !== cycle) continue;
    // An unparseable `at` sorts as the oldest possible time so it never beats a
    // real timestamp, yet is still selected when it is the only match.
    const ms = Date.parse(approval.at);
    const rank = Number.isNaN(ms) ? -Infinity : ms;
    if (bestAt === null || rank > bestMs) {
      bestAt = approval.at;
      bestMs = rank;
    }
  }

  return bestAt;
}
