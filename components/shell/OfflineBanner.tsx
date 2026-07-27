import { WifiOff } from 'lucide-react';

/**
 * The offline/queued-writes banner (Story 7.9, AC2).
 *
 * `role="status" aria-live="polite"` — NOT `role="alert"` (D-7.9-2 /
 * `EXPERIENCE.md:262-263`: "the progress figure, queue count... are
 * role="status" aria-live="polite". Write failures are role="alert".").
 * Renders ABOVE the resume/time-off body — its own `-mt-[10px]` carries the
 * chrome-baseline offset that `<main>` drops the instant a banner is present
 * (Obligation 2), so this banner and the (now un-offset) card below it never
 * fight over the same negative margin.
 *
 * `navigator.onLine === false` is reliable and selects the headline WORD
 * only (D-7.9-5) — it never gates whether this banner renders at all. The
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
      className="-mt-[10px] mb-3 flex items-start gap-2 rounded-lg border border-amber-border bg-amber-soft px-[11px] py-[9px] shadow-hairline"
    >
      <WifiOff aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-status-dirty" />
      <div className="flex flex-col gap-0.5">
        <p className="font-chrome text-body-sm font-medium text-amber-ink">{headline}</p>
        <p className="text-[12px] leading-[1.5] text-muted">{STRINGS.body}</p>
      </div>
    </div>
  );
}
