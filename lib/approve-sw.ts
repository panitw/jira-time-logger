/**
 * Service-worker-side handler for the approve-cycle fan-out (Story 5.6).
 *
 * The popup's `ApproveButton` cannot call `postComment` in-page (it would
 * bypass the SW scheduler) so it asks the SW (via request/response) to run the
 * fan-out. This module holds the SW-side logic, extracted so it is unit-testable
 * without the full background entrypoint. Mirrors `banner-sw.ts`'s
 * `handleLogWorklogRequest` pattern: delegate to the pure orchestrator, map its
 * structured result to the wire response. Transient failures are enqueued in the
 * outbox INSIDE `approveCycle`, so this handler only flattens the result.
 */
import type { z } from 'zod';
import { approveCycle } from '@/lib/approval';
import { log } from '@/lib/log';
import type {
  ApproveCycleRequestSchema,
  ApproveCycleResponseSchema,
} from '@/lib/messages';

type ApproveCycleRequest = z.infer<typeof ApproveCycleRequestSchema>;
type ApproveCycleResponse = z.infer<typeof ApproveCycleResponseSchema>;

/**
 * Run the approval fan-out for one report's cycle. Never throws — returns the
 * wire response. `approveCycle` is itself fail-safe (each Epic is an isolated
 * retryable unit; transient failures enqueue the prebuilt body in the outbox).
 *
 *   - `confirmed`: Epic keys whose approval comment posted ok.
 *   - `failed`: Epic keys whose post failed (retryable OR terminal).
 *   - `enqueued`: the subset of `failed` that was enqueued for a deferred retry.
 */
export async function handleApproveCycle(
  req: ApproveCycleRequest,
): Promise<ApproveCycleResponse> {
  try {
    const result = await approveCycle({
      user: req.user,
      cycle: req.cycle,
      by: req.by,
      epics: req.epics,
    });
    return {
      confirmed: result.confirmed,
      failed: result.failed.map((f) => f.epicKey),
      enqueued: result.failed.filter((f) => f.enqueued).map((f) => f.epicKey),
    };
  } catch (e) {
    // Defensive: approveCycle is contracted never to throw, but if it does,
    // report every Epic as failed (none confirmed) rather than hanging the
    // caller. Nothing is enqueued in this path.
    log.error('approve.handler.error', { user: req.user, cause: String(e) });
    return {
      confirmed: [],
      failed: req.epics.map((e2) => e2.epicKey),
      enqueued: [],
    };
  }
}
