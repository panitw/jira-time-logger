/**
 * The single popup-state derivation (Story 7.9, AC6).
 *
 * Pure — zero React, same discipline as `lib/day-status.ts`/`lib/week-grid.ts`
 * (framework-agnostic modules `entrypoints/popup/App.tsx` composes over).
 *
 * Two axes:
 *
 *   Axis A — BODY (exactly one, first match wins):
 *     1. disconnected  authKind === 'disconnected'
 *     2. loading       authKind === 'loading' OR isPending
 *     3. time-off      timeOffSeconds > 0
 *     4. normal        otherwise
 *
 *   Axis B — BANNERS (independent of A; both may be false; render ABOVE the
 *   body). Suppressed entirely when the body is 'disconnected' or 'loading'
 *   (AC5's "no dead UI renders behind it"; AC1's "skeletons in the real
 *   layout shape" — a banner is not a skeleton, and nothing has resolved yet
 *   to be honest about).
 *
 * Body 3 mirrors `lib/day-status.ts#dayStatusFor`'s existing
 * time-off-outranks-everything-below-it precedence (D-7.6-6) — reused, not
 * reinvented, per D-7.9-19.
 *
 * `timeOffSeconds` is whatever the CALLER decides is the current, effective
 * time-off amount — this function does not know (and must not know) that
 * `entrypoints/popup/App.tsx` freezes that decision at first paint (D-7.9-26 /
 * D-7.9-14). Freezing is the caller's concern; this function is a pure
 * function of its inputs on every call.
 */

export type PopupAuthKind = 'loading' | 'connected' | 'disconnected';

export type PopupBody = 'disconnected' | 'loading' | 'time-off' | 'normal';

export type PopupStateInput = {
  authKind: PopupAuthKind;
  /** Today total (or any other still-in-flight data the body's shape
   * depends on) has not resolved yet. */
  isPending: boolean;
  /** The effective seconds of time off logged today — 0 means "not a
   * time-off day" for body-derivation purposes. */
  timeOffSeconds: number;
  /** Outbox entries with `status: 'pending'` — awaiting automatic retry. */
  pendingCount: number;
  /** Outbox entries with `status: 'failed'` — a write Jira refused, or a
   * pending write that exhausted its retry budget. */
  failedCount: number;
};

export type PopupState = {
  body: PopupBody;
  /** `role="status" aria-live="polite"` — queued writes, will sync
   * automatically. */
  offlineBanner: boolean;
  /** `role="alert"` — a write Jira actually refused. */
  errorBanner: boolean;
  /** `offlineBanner || errorBanner` — the single boolean
   * `App.tsx`'s `breaksHeaderBaseline` appends (Obligation 2). */
  anyBanner: boolean;
};

export function resolvePopupState(input: PopupStateInput): PopupState {
  const { authKind, isPending, timeOffSeconds, pendingCount, failedCount } = input;

  let body: PopupBody;
  if (authKind === 'disconnected') {
    body = 'disconnected';
  } else if (authKind === 'loading' || isPending) {
    body = 'loading';
  } else if (timeOffSeconds > 0) {
    body = 'time-off';
  } else {
    body = 'normal';
  }

  const bannersSuppressed = body === 'disconnected' || body === 'loading';
  const offlineBanner = !bannersSuppressed && pendingCount > 0;
  const errorBanner = !bannersSuppressed && failedCount > 0;

  return {
    body,
    offlineBanner,
    errorBanner,
    anyBanner: offlineBanner || errorBanner,
  };
}
