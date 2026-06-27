/**
 * Approval fan-out orchestrator (Story 5.6, FR32/FR33/FR41/FR42).
 *
 * "Approve <Person>" fans a versioned-checksum approval comment out to EVERY
 * Epic the report logged hours against during the cycle. The write recipe is
 * fixed by PROTOCOL.md and must NOT deviate:
 *
 *   at = new Date().toISOString()       // computed ONCE per fan-out, shared
 *   for each touched Epic:
 *     payload   = { v:1, user, cycle, by, at, restrictedCount: <thisEpic> }
 *     checksum  = await computeChecksum(payload)
 *     serialized= serializeApproval({ ...payload, checksum })
 *     body      = { body: textToAdf(serialized) }   // ADF nested under `body`
 *     result    = await postComment(epicKey, body)  // scheduler-gated
 *
 * Fan-out is SEQUENTIAL (no `Promise.all`): each `postComment` is awaited so the
 * service-worker token-bucket scheduler throttles ~2 req/s, and a single Epic's
 * failure never aborts the rest (each post is its own retryable unit).
 *
 * Partial-failure policy:
 *   - `network` / `rate-limited` (RETRYABLE) → enqueue the prebuilt body in the
 *     outbox as a `comment` op so a deferred retry posts the byte-identical,
 *     checksum-valid approval; recorded as failed (not yet confirmed).
 *   - `forbidden` / `not-found` / `parse-error` / `auth-expired` (TERMINAL) →
 *     recorded as failed WITHOUT enqueue (it will not succeed on retry).
 *
 * Append-only: the fan-out always POSTs a fresh comment — it never finds-and-
 * updates or deletes a prior approval (FR42). The parser's "newest-wins per
 * (user, cycle)" rule resolves duplicates at read time, so re-posting (Story 5.7
 * re-approve, or an outbox retry) is safe.
 *
 * React-free / no clock read inside the pure builder: `at` is injected. This
 * keeps the fan-out unit-testable with table-driven success/partial cases.
 */
import { type AdfDoc, textToAdf } from '@/lib/adf';
import { computeChecksum } from '@/lib/checksum';
import { serializeApproval } from '@/lib/comment-schema';
import { postComment as defaultPostComment } from '@/lib/jira-client';
import type { JiraComment } from '@/lib/jira-types';
import { log } from '@/lib/log';
import type { JiraError, Result } from '@/lib/result';
import { enqueue as defaultEnqueue } from '@/lib/storage/outbox';

/** One Epic the report touched this cycle, with the per-Epic restricted count. */
export type TouchedEpic = {
  epicKey: string;
  /** THIS Epic's `ReportEpicWorklogs.restrictedCount` — checksum-covered. */
  restrictedCount: number;
};

/** The fixed inputs shared across every Epic in one fan-out. */
export type ApproveCycleInput = {
  /** The report's accountId (`report.accountId`). */
  user: string;
  /** The matrix `cycle` prop VERBATIM — it is checksummed; never re-derive it. */
  cycle: string;
  /** The current manager's accountId. */
  by: string;
  /** The touched-Epic set (already includes the catch-all/PTO Epic, AC6). */
  epics: TouchedEpic[];
};

/** A per-Epic failure record (carries the prebuilt body for outbox replay). */
export type ApprovalFailure = {
  epicKey: string;
  body: { body: AdfDoc };
  error: JiraError;
  /** Whether the prebuilt body was enqueued for a deferred outbox retry. */
  enqueued: boolean;
};

/** The structured fan-out result. Never thrown — always returned. */
export type ApproveCycleResult = {
  confirmed: string[];
  failed: ApprovalFailure[];
};

/** Injected collaborators so the fan-out is unit-testable. */
export type ApproveCycleDeps = {
  postComment: typeof defaultPostComment;
  enqueue: typeof defaultEnqueue;
  /** Injectable clock so the shared-`at` invariant is testable. */
  now: () => string;
};

const defaultDeps: ApproveCycleDeps = {
  postComment: defaultPostComment,
  enqueue: defaultEnqueue,
  now: () => new Date().toISOString(),
};

/** A retryable error is one the outbox can later replay successfully. */
function isRetryable(error: JiraError): boolean {
  return error.kind === 'network' || error.kind === 'rate-limited';
}

/**
 * Pure payload-builder: given the fixed fan-out inputs + a single Epic's
 * `restrictedCount` + the shared `at`, build the POST body `{ body: <AdfDoc> }`.
 * Reuses `computeChecksum` → `serializeApproval` → `textToAdf`. No clock read,
 * no network — fully deterministic for a fixed input.
 */
export async function buildApprovalBody(args: {
  user: string;
  cycle: string;
  by: string;
  at: string;
  restrictedCount: number;
}): Promise<{ body: AdfDoc }> {
  const payload = {
    v: 1 as const,
    user: args.user,
    cycle: args.cycle,
    by: args.by,
    at: args.at,
    restrictedCount: args.restrictedCount,
  };
  const checksum = await computeChecksum(payload);
  const serialized = serializeApproval({ ...payload, checksum });
  return { body: textToAdf(serialized) };
}

/**
 * Fan the approval out across every touched Epic, sequentially. Computes `at`
 * ONCE up front and shares it across all Epics, so a single approval action has
 * one consistent timestamp/anchor. Never throws — returns a structured
 * `{ confirmed, failed }` result the SW handler / UI maps to cell invalidations
 * and the partial chip.
 */
export async function approveCycle(
  input: ApproveCycleInput,
  deps: Partial<ApproveCycleDeps> = {},
): Promise<ApproveCycleResult> {
  const { postComment, enqueue, now } = { ...defaultDeps, ...deps };

  const confirmed: string[] = [];
  const failed: ApprovalFailure[] = [];

  // Empty touched-set guard: nothing to fan out to (AC1 disables the button for
  // an empty row, but the orchestrator is defensive too).
  if (input.epics.length === 0) {
    log.warn('approval.fanout.empty', { user: input.user, cycle: input.cycle });
    return { confirmed, failed };
  }

  // Dedupe by epicKey: posting the same Epic twice in one fan-out would double-
  // post an approval comment AND push the key twice into `confirmed`, making
  // `confirmed.length` exceed the touched-Epic count (a "3 of 2 confirmed" chip).
  // Newest-wins absorbs duplicate comments at read time, but the counts must be
  // sound. First occurrence wins (keeps its restrictedCount).
  const seen = new Set<string>();
  const epics = input.epics.filter((e) => {
    if (seen.has(e.epicKey)) return false;
    seen.add(e.epicKey);
    return true;
  });

  // Compute the shared `at` ONCE for the whole fan-out.
  const at = now();
  log.info('approval.fanout.start', {
    user: input.user,
    cycle: input.cycle,
    epics: epics.length,
  });

  for (const epic of epics) {
    const body = await buildApprovalBody({
      user: input.user,
      cycle: input.cycle,
      by: input.by,
      at,
      restrictedCount: epic.restrictedCount,
    });

    let result: Result<JiraComment, JiraError>;
    try {
      result = await postComment(epic.epicKey, body);
    } catch (e) {
      // postComment is contracted to return a Result, never throw. Defensive:
      // treat an unexpected throw as a retryable network error so the body is
      // enqueued rather than silently lost.
      log.error('approval.fanout.threw', { epicKey: epic.epicKey, cause: String(e) });
      result = { kind: 'network', cause: String(e) };
    }

    if (result.kind === 'ok') {
      confirmed.push(epic.epicKey);
      log.info('approval.fanout.confirmed', { epicKey: epic.epicKey });
      continue;
    }

    // A failure. Retryable → enqueue the prebuilt body for a deferred retry;
    // terminal → record without enqueue.
    let enqueued = false;
    if (isRetryable(result)) {
      try {
        await enqueue({
          kind: 'comment',
          endpoint: `rest/api/3/issue/${encodeURIComponent(epic.epicKey)}/comment`,
          issueKey: epic.epicKey,
          body,
        });
        enqueued = true;
      } catch (e) {
        log.error('approval.fanout.enqueue-failed', {
          epicKey: epic.epicKey,
          cause: String(e),
        });
      }
      log.warn('approval.fanout.failed', {
        epicKey: epic.epicKey,
        kind: result.kind,
        enqueued,
      });
    } else {
      log.warn('approval.fanout.failed', {
        epicKey: epic.epicKey,
        kind: result.kind,
        enqueued: false,
      });
    }

    failed.push({ epicKey: epic.epicKey, body, error: result, enqueued });
  }

  log.info('approval.fanout.done', {
    confirmed: confirmed.length,
    failed: failed.length,
  });
  return { confirmed, failed };
}
