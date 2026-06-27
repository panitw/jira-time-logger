/**
 * Service-worker-side handlers for the inline banner (Story 3.3).
 *
 * The content script runs in the page and CANNOT: read auth, call
 * `postWorklog` through the SW scheduler, or call `chrome.action.openPopup`.
 * It therefore asks the SW (via request/response messages) to do these. This
 * module holds the SW-side logic, extracted so it is unit-testable without the
 * full background entrypoint.
 *
 * Mirrors the popup's `QuickLogForm` write pathway exactly: post → on ok
 * broadcast `badge-update`; on transient (`network`/`rate-limited`) enqueue the
 * durable outbox and report "pending"; other errors report "error".
 */
import type { z } from 'zod';
import { getWeekHoursMissing } from '@/lib/badge';
import { postWorklog } from '@/lib/jira-client';
import { currentTicketFromUrl } from '@/lib/jira-url';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import type {
  BannerStateRequestSchema,
  BannerStateResponseSchema,
  LogWorklogRequestSchema,
  LogWorklogResponseSchema,
} from '@/lib/messages';
import { enqueue as enqueueOutbox } from '@/lib/storage/outbox';

type BannerStateRequest = z.infer<typeof BannerStateRequestSchema>;
type BannerStateResponse = z.infer<typeof BannerStateResponseSchema>;
type LogWorklogRequest = z.infer<typeof LogWorklogRequestSchema>;
type LogWorklogResponse = z.infer<typeof LogWorklogResponseSchema>;

/**
 * Answer a `banner-state` request. Reuses the badge's single deficit source so
 * the banner's `hoursMissing` is identical to the badge's number.
 *
 *   - disconnected / auth-expired / transient → `getWeekHoursMissing()` is null
 *     → respond `hoursMissing: 0` (the "no banner" signal; the content script
 *     hides on `<= 0`). AC #8 + AC #2.
 *   - otherwise → the rounded deficit (0 = caught up, > 0 = behind).
 */
export async function handleBannerStateRequest(
  req: BannerStateRequest,
): Promise<BannerStateResponse> {
  const hours = await getWeekHoursMissing();
  const hoursMissing = hours ?? 0; // null (no-banner) collapses to 0
  const currentTicket = currentTicketFromUrl(req.url);
  log.info('banner.state', { hoursMissing, hasTicket: currentTicket !== undefined });
  return currentTicket !== undefined
    ? { hoursMissing, currentTicket }
    : { hoursMissing };
}

/**
 * Post the banner's inline worklog. IDENTICAL write pathway as popup logging
 * (QuickLogForm onSuccess): post via the SW scheduler, broadcast `badge-update`
 * on success, enqueue the outbox + report "pending" on transient failure.
 * Never throws — returns a status the banner renders.
 */
export async function handleLogWorklogRequest(
  req: LogWorklogRequest,
): Promise<LogWorklogResponse> {
  try {
    const result = await postWorklog(req.issueKey, {
      timeSpentSeconds: req.timeSpentSeconds,
      started: req.started,
      ...(req.comment !== undefined ? { comment: req.comment } : {}),
    });

    if (result.kind === 'ok') {
      log.info('banner.log.success', { key: req.issueKey });
      void sendMessage('badge-update', { hoursMissing: 0 });
      return { status: 'ok' };
    }

    if (result.kind === 'network' || result.kind === 'rate-limited') {
      log.warn('banner.log.failed', { key: req.issueKey, kind: result.kind });
      await enqueueOutbox({
        kind: 'post',
        endpoint: `rest/api/3/issue/${encodeURIComponent(req.issueKey)}/worklog`,
        issueKey: req.issueKey,
        body: { timeSpentSeconds: req.timeSpentSeconds, started: req.started },
      });
      return { status: 'pending' };
    }

    log.warn('banner.log.failed', { key: req.issueKey, kind: result.kind });
    return { status: 'error' };
  } catch (e) {
    log.error('banner.log.error', { key: req.issueKey, cause: String(e) });
    return { status: 'error' };
  }
}

/**
 * Open the extension popup on behalf of the content script. `openPopup` can
 * reject when no window is focused (or on browsers without the API) — log and
 * swallow, never throw (same pattern as `handleNotificationClick`).
 */
export async function handleOpenPopup(): Promise<void> {
  try {
    await chrome.action.openPopup();
    log.info('banner.open-popup', {});
  } catch (e) {
    log.warn('banner.open-popup.failed', { cause: String(e) });
  }
}
