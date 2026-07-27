import { Trash2, WifiOff } from 'lucide-react';
import { useState } from 'react';

/**
 * The offline/queued-writes banner (Story 7.9, AC2).
 *
 * `role="status" aria-live="polite"` — NOT `role="alert"` (D-7.9-20 /
 * `EXPERIENCE.md:262-263`: "the progress figure, queue count... are
 * role="status" aria-live="polite". Write failures are role="alert".").
 * Renders ABOVE the resume/time-off body. D-7.9-16: carries NO self
 * `-mt-[10px]` — the round-2 design source sets `resumeOffset: "0px"` for
 * this state (`:1195`, "Banner pushes the resume card down"), and `<main>`
 * (`overflow-y-auto`, no top padding) would silently CLIP a negative margin
 * on a child rather than overhang it (D-7.3-3). `breaksHeaderBaseline` in
 * `App.tsx` is `!anyBanner`, so `<main>` correctly drops its OWN offset the
 * instant this banner renders — nothing here needs to fight over it.
 *
 * `navigator.onLine === false` is reliable and selects the headline WORD
 * only (D-7.9-23) — it never gates whether this banner renders at all. The
 * banner's existence is driven purely by `pendingCount > 0` (an outbox
 * `status: 'pending'` entry), decided by the caller via
 * `lib/popup-state.ts#resolvePopupState`.
 */

const entries = (n: number): string => `${n} ${n === 1 ? 'entry' : 'entries'}`;

const STRINGS = {
  headlineOffline: (n: number) => `Offline — ${entries(n)} queued`,
  headlineOnline: (n: number) => `${entries(n)} queued`,
  body: "They'll sync to Jira automatically when you're back.",
  discardTooltip: (n: number) => `Discard ${entries(n)}`,
  confirmHeadline: (n: number) => `Discard ${entries(n)}?`,
  // Names the consequence, not the mechanism. The queued time has never
  // reached Jira, so discarding is not "cancelling a sync" — it is deleting
  // hours the user entered, with no undo.
  confirmBody: 'This deletes the hours. Jira never receives them.',
  confirmYes: 'Discard',
  confirmNo: 'Keep',
};

export type OfflineBannerProps = {
  pendingCount: number;
  /** Discard every queued entry. Fired only after the inline confirm. */
  onDiscardAll: () => void;
};

/**
 * D-7.9-16 note above still holds for the confirm state — it swaps the
 * banner's CONTENTS, never its box, so no offset or margin changes underneath
 * the resume card when the user arms the discard.
 *
 * The trash affordance is deliberately two-step. A queued entry is time the
 * user typed that Jira has never seen; a single misplaced click would delete
 * it with no undo and no record anywhere. The confirm lives inline (not in a
 * dialog) because the popup is 380px of a single scroll region — `PtoPopover`
 * is the only modal precedent here and it exists to COLLECT input, not to
 * guard one destructive verb.
 */
export function OfflineBanner({
  pendingCount,
  onDiscardAll,
}: OfflineBannerProps): React.ReactElement {
  const [confirming, setConfirming] = useState(false);
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const headline = isOffline
    ? STRINGS.headlineOffline(pendingCount)
    : STRINGS.headlineOnline(pendingCount);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-3 flex items-start gap-2 rounded-lg border border-amber-border bg-amber-soft px-[11px] py-[9px] shadow-hairline"
    >
      <WifiOff aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-status-dirty" />
      <div className="flex flex-1 flex-col gap-0.5">
        {/* Finding 20(b): `tabular` applied directly on this element (no
            extra wrapping node) — a nested span around just the headline
            would give the queue-count assertions in `OfflineBanner.test.tsx`
            TWO elements with identical textContent (this `<p>` and the
            span), breaking `getByText`'s single-match requirement. */}
        <p className="tabular font-chrome text-body-sm font-medium text-amber-ink">
          {confirming ? STRINGS.confirmHeadline(pendingCount) : headline}
        </p>
        <p className="text-[12px] leading-[1.5] text-muted">
          {confirming ? STRINGS.confirmBody : STRINGS.body}
        </p>
        {confirming && (
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscardAll}
              className="rounded-md border border-error-border bg-white px-[10px] py-[5px] font-chrome text-label font-medium text-error-ink hover:bg-error-soft focus-visible:outline-none focus-visible:border-primary focus-visible:ring-focus"
            >
              {STRINGS.confirmYes}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded px-1 py-[5px] font-chrome text-label font-medium text-muted hover:text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-focus"
            >
              {STRINGS.confirmNo}
            </button>
          </div>
        )}
      </div>
      {!confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title={STRINGS.discardTooltip(pendingCount)}
          aria-label={STRINGS.discardTooltip(pendingCount)}
          className="-mr-1 shrink-0 rounded p-1 text-muted hover:text-error-ink focus-visible:outline-none focus-visible:border-primary focus-visible:ring-focus"
        >
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
