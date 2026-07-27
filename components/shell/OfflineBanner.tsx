import { WifiOff } from 'lucide-react';

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

const STRINGS = {
  headlineOffline: (n: number) => `Offline — ${n} ${n === 1 ? 'entry' : 'entries'} queued`,
  headlineOnline: (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'} queued`,
  body: "They'll sync to Jira automatically when you're back.",
};

export type OfflineBannerProps = {
  pendingCount: number;
};

export function OfflineBanner({ pendingCount }: OfflineBannerProps): React.ReactElement {
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
      <div className="flex flex-col gap-0.5">
        {/* Finding 20(b): `tabular` applied directly on this element (no
            extra wrapping node) — a nested span around just the headline
            would give the queue-count assertions in `OfflineBanner.test.tsx`
            TWO elements with identical textContent (this `<p>` and the
            span), breaking `getByText`'s single-match requirement. */}
        <p className="tabular font-chrome text-body-sm font-medium text-amber-ink">{headline}</p>
        <p className="text-[12px] leading-[1.5] text-muted">{STRINGS.body}</p>
      </div>
    </div>
  );
}
