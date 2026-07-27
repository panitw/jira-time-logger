import { format } from 'date-fns';
import { DayStatusIndicator } from '@/components/shared/DayStatusIndicator';
import type { DayStatus } from '@/lib/day-status';
import { secondsToHours } from '@/lib/hours';
import { pctToWidthClass } from '@/lib/progress-width';

/**
 * Chrome header — the popup's fixed top field (Story 7.2, AC3/AC6). Also
 * mounted unchanged by the full page in 7.7 (hence the generic props below,
 * even though this story only needs the popup shape).
 *
 * Paints synchronously and unconditionally on first render (AC6) — only the
 * progress figure/bar area branches on `isPending`; the eyebrow, avatar, and
 * date never wait on a promise.
 */

const STRINGS = {
  product: 'Time Logger',
  toGoToday: (h: string) => `${h}h to go today`,
  targetMet: (target: number) => `Target met — ${target}h logged`,
  // Story 7.9, AC5: the disconnected chrome shows this note instead of the
  // figure/bar/live-region — no figure, no bar, no live region at all
  // (`connected` already gates all three below).
  notConnected: 'Not connected to Jira',
};

function formatHoursValue(seconds: number): string {
  return secondsToHours(seconds).toFixed(1);
}

function formatRemainingHours(hours: number): string {
  return hours.toFixed(1).replace(/\.0$/, '');
}

/**
 * Local met/partial/attention derivation for the popup's single "today"
 * aggregate (D-7.6-5): "the header derives met | partial | attention from
 * seconds vs targetHours exactly as it does now." Deliberately NOT the
 * general `dayStatusFor` — that also resolves `weekend`/`time-off`, neither
 * of which applies to this surface (7.9 owns time off here; there's no
 * per-weekday axis in a single "today" figure).
 */
function deriveHeaderStatus(seconds: number, targetSeconds: number): DayStatus {
  if (targetSeconds > 0 && seconds >= targetSeconds) return 'met';
  if (seconds > 0) return 'partial';
  return 'attention';
}

export type ChromeHeaderProps = {
  /** Whether the popup is in a connected state — the figure/bar/live-region
   * only render when true (disconnected shows eyebrow + date only). */
  connected: boolean;
  /** The connected user's first initial, or `null` while it is still
   * resolving — the chip renders empty-but-present so the header never
   * reflows once it resolves. */
  userInitial: string | null;
  /** Combined server + in-session seconds logged today. */
  seconds: number;
  targetHours: number;
  /** True while the today total is still resolving — renders skeleton
   * placeholders in the real layout shape (never a spinner). */
  isPending: boolean;
  /** Optional day-status override — 7.9's seam (a time-off day; `ChromeHeader`
   * has no way to tell time off from ordinary hours on its own, D-7.6-5).
   * When omitted, the header derives `met | partial | attention` from
   * `seconds` vs `targetHours` exactly as it does today. Purely a prop —
   * never a new query or storage read (NFR1: stays synchronous). */
  status?: DayStatus;
};

export function ChromeHeader({
  connected,
  userInitial,
  seconds,
  targetHours,
  isPending,
  status,
}: ChromeHeaderProps): React.ReactElement {
  const today = format(new Date(), 'EEE, MMM d');
  const targetSeconds = targetHours * 3600;
  const pct = targetSeconds > 0 ? (seconds / targetSeconds) * 100 : 0;
  const metTarget = seconds >= targetSeconds && targetSeconds > 0;
  const remainingHours = Math.max(0, targetHours - secondsToHours(seconds));
  const note = metTarget
    ? STRINGS.targetMet(targetHours)
    : STRINGS.toGoToday(formatRemainingHours(remainingHours));
  const dayStatus = status ?? deriveHeaderStatus(seconds, targetSeconds);

  return (
    <header className="bg-chrome-gradient relative shrink-0 overflow-hidden pt-[14px] px-[16px] pb-[20px]">
      {/* Concentric ring motif — chrome-only decoration, never under data. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-[46px] -top-[58px] h-[170px] w-[170px] rounded-full border-[1.5px] border-white/15" />
        <div className="absolute -right-[14px] -top-[26px] h-[104px] w-[104px] rounded-full border-[1.5px] border-white/[.13]" />
        <div className="absolute right-[36px] top-[8px] h-[6px] w-[6px] rounded-full bg-white/50" />
      </div>

      <div className="relative flex items-center justify-between">
        {/* Story 7.2 Finding 4: `/70` measures ~3.9:1 at the gradient's top
         * stop (where this row sits) — below WCAG AA's 4.5:1 for 11px normal
         * text. Raised to `/85` (~4.9:1 at the top stop, computed against
         * `bg-chrome-gradient`'s `#615b99` 0% stop) to clear AA; still
         * visibly subordinate to the full-white date/figure below it. This
         * is a deliberate deviation from the Dev Notes' original "keep the
         * eyebrow at /70 or above" guidance — recorded in the story's Finding
         * Resolutions for DESIGN.md's owner to fold back in. */}
        <span className="font-chrome text-eyebrow uppercase text-white/85">
          {STRINGS.product}
        </span>
        <span
          aria-hidden="true"
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/[.18] font-chrome text-[11px] font-medium text-white"
        >
          {userInitial ?? ''}
        </span>
      </div>

      <p className="relative mt-[12px] font-chrome text-display-sm text-white">{today}</p>

      {/* AC5: disconnected chrome — eyebrow + avatar + date + this note
       * ONLY. No figure, no bar, no live region (`connected` already gates
       * all three below; nothing new to suppress here). */}
      {!connected && (
        <p className="relative mt-[7px] font-chrome text-[11.5px] font-medium text-white/85">
          {STRINGS.notConnected}
        </p>
      )}

      {/* Story 7.2 Finding 5: the live region wraps BOTH the pending skeleton
       * and the resolved figure so it is present from first paint — a region
       * inserted into the DOM already populated (as it was before this fix,
       * mounted only in the `!isPending` branch) is generally not announced
       * by assistive tech, silencing the one moment the figure first
       * appears. Mounting it here means the pending → resolved swap happens
       * INSIDE an already-present region, which IS announced. */}
      {connected && (
        <div role="status" aria-live="polite" className="relative">
          {isPending ? (
            <>
              <div className="mt-[12px] h-[26px] w-24 animate-skeleton rounded bg-white/20" />
              <div className="mt-[12px] h-[4px] w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full w-full animate-skeleton rounded-full bg-white/40" />
              </div>
              <div className="mt-[7px] h-[11.5px] w-32 animate-skeleton rounded bg-white/20" />
            </>
          ) : (
            <>
              <p className="mt-[12px] font-chrome tabular text-display text-white">
                {formatHoursValue(seconds)}
                <span className="text-[14px] font-normal text-white/70"> / {targetHours}h</span>
              </p>
              <div
                aria-hidden="true"
                className="mt-[12px] h-[4px] overflow-hidden rounded-full bg-white/20"
              >
                <div className={`h-full rounded-full bg-white ${pctToWidthClass(pct)}`} />
              </div>
              <p className="mt-[7px]">
                <DayStatusIndicator
                  variant="inline"
                  tone="chrome"
                  status={dayStatus}
                  label={note}
                  className="font-chrome text-[11.5px] font-medium"
                />
              </p>
            </>
          )}
        </div>
      )}
    </header>
  );
}
