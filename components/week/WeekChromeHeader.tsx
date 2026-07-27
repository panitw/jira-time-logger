import { format, parseISO } from 'date-fns';
import { SectionTabs } from '@/components/shared/SectionTabs';
import { MarkAsDoneButton } from '@/components/week/MarkAsDoneButton';
import { hoursToSeconds, secondsToHours } from '@/lib/hours';
import type { FullPageSection } from '@/lib/open-full-page';
import { pctToWidthClass } from '@/lib/progress-width';
import type { ISODate } from '@/lib/storage/view-state';
import { WORKDAYS_PER_WEEK } from '@/lib/week-gaps';
import type { WeekGrid } from '@/lib/week-grid';

/**
 * The full page's chrome header (Story 7.7, AC2). Mounted by `WeekView`
 * ONLY — the popup's `ChromeHeader.tsx` is a different component for a
 * different surface and is untouched by this story (D-7.7-25).
 *
 * Every value below is cited to the vendored design source (SD-6):
 * `imports/jira-time-logger.dc.html`. Reuses `bg-chrome-gradient` (already a
 * token, `styles/globals.css:225-231` — no new colours), and `text-display`
 * (already 26px/600, `globals.css:68-70` — an exact match for the design's
 * title/figure type, no new token needed).
 */

const STRINGS = {
  product: 'Time Logger',
  headingPrefix: 'Week of',
  invalidDate: 'Unknown week',
  prev: '‹ prev',
  next: 'next ›',
  prevAria: 'Previous week',
  nextAria: 'Next week',
};

/** Bare hours, one decimal with a trailing `.0` stripped — the header
 * figure's "28" (`imports/jira-time-logger.dc.html:357`). */
function hoursLabel(seconds: number): string {
  return secondsToHours(Math.max(0, seconds)).toFixed(1).replace(/\.0$/, '');
}

export type WeekChromeHeaderProps = {
  /** This week's local-midnight Monday. */
  weekOf: ISODate;
  /** Story 7.10, D-7.10-30: the shared Week/Manager/Settings tab row, now
   * mounted inside every full-page chrome header instead of the shell's
   * (removed) plain `<nav>`. */
  section: FullPageSection;
  onSectionChange: (section: FullPageSection) => void;
  showManagerTab: boolean;
  /** `null` while the week's worklogs are still loading (or errored) — the
   * title/eyebrow/nav paint synchronously regardless (same "paint
   * unconditionally, branch only the data-dependent piece" pattern as the
   * popup's `ChromeHeader.tsx`); the week figure/bar and the "Mark week as
   * done" CTA (which needs real data to gap-check) simply don't render
   * until a grid is available. */
  grid: WeekGrid | null;
  /** Daily target hours (a settings value) — the week target is
   * `targetHours * WORKDAYS_PER_WEEK`, never a hard-coded 40. */
  targetHours: number;
  /** Local `YYYY-MM-DD` "today", threaded to the mark-done gap dialog's
   * per-day notes (`gapDayNote`, D-7.7-19). */
  today: ISODate;
  isMarkedDone: boolean;
  onMarkedDone: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

export function WeekChromeHeader({
  weekOf,
  section,
  onSectionChange,
  showManagerTab,
  grid,
  targetHours,
  today,
  isMarkedDone,
  onMarkedDone,
  onPrevWeek,
  onNextWeek,
}: WeekChromeHeaderProps): React.ReactElement {
  const parsed = parseISO(weekOf);
  const displayDate = Number.isNaN(parsed.getTime())
    ? STRINGS.invalidDate
    : format(parsed, 'EEE, MMM d');

  const loggedSeconds = grid ? grid.dayTotalsSeconds.reduce((sum, s) => sum + s, 0) : 0;
  const targetSeconds = hoursToSeconds(targetHours * WORKDAYS_PER_WEEK);
  const pct = targetSeconds > 0 ? (loggedSeconds / targetSeconds) * 100 : 0;

  return (
    <header className="bg-chrome-gradient relative overflow-hidden rounded-t-[10px] pb-[20px] pt-[18px] px-[26px]">
      {/* Concentric ring motif — chrome-only decoration, never under data. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-[70px] -top-[96px] h-[250px] w-[250px] rounded-full border-[1.5px] border-white/[.14]" />
        <div className="absolute right-[10px] -top-[40px] h-[140px] w-[140px] rounded-full border-[1.5px] border-white/[.12]" />
      </div>

      <div className="relative flex items-end justify-between gap-6">
        <div className="flex flex-col gap-[5px]">
          {/* Hand-computed contrast (D-7.7-25 cites the design source's
           * literal rgba(255,255,255,.72), but at the gradient's LIGHTEST
           * stop — #615B99, where this row sits — 72% white measures only
           * ≈4.04:1, below AA's 4.5:1 for normal-size text. Raised to /85
           * (≈4.91:1) — the EXACT same fix, and the exact same reasoning,
           * as `ChromeHeader.tsx`'s own Finding 4 for its identical eyebrow
           * on the identical gradient. The axe harness cannot catch this
           * class of failure (`lib/test/axe.ts` disables `color-contrast`);
           * proven three times this epic already. */}
          <span className="font-chrome text-eyebrow uppercase text-white/85">
            {STRINGS.product}
          </span>
          <div className="flex items-baseline gap-[14px]">
            <span className="font-chrome text-display text-white">
              {STRINGS.headingPrefix} {displayDate}
            </span>
            {/* Same hand-computed fix as the eyebrow above — 12.5px normal
             * weight also needs 4.5:1, and /70 clears only ≈3.9:1 at the
             * lightest gradient stop. */}
            <span className="flex items-center gap-1 font-chrome text-[12.5px] text-white/85">
              <button
                type="button"
                onClick={onPrevWeek}
                aria-label={STRINGS.prevAria}
                className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {STRINGS.prev}
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onNextWeek}
                aria-label={STRINGS.nextAria}
                className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {STRINGS.next}
              </button>
            </span>
          </div>
        </div>

        {grid && (
          <div className="flex items-center gap-5">
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-baseline gap-1 font-chrome tabular">
                <span className="text-display text-white">{hoursLabel(loggedSeconds)}</span>
                {/* Same hand-computed contrast fix — 14px normal weight
                 * does not qualify as "large text" (needs 18px, or 14px
                 * bold), so it needs 4.5:1 too; /85 clears it. */}
                <span className="text-[14px] text-white/85">
                  / {targetHours * WORKDAYS_PER_WEEK}h
                </span>
              </div>
              {/* The header's progress bar is 4px, plain white fill — a
               * DIFFERENT bar from the totals cell's 3px status-coloured
               * one (D-7.7-25). D-7.6-40 governs: status on the gradient is
               * white/opacity ONLY, never a per-status colour. */}
              <div
                aria-hidden="true"
                className="h-[4px] w-[190px] overflow-hidden rounded-full bg-white/20"
              >
                <div className={`h-full rounded-full bg-white ${pctToWidthClass(pct)}`} />
              </div>
            </div>

            {!isMarkedDone && (
              <MarkAsDoneButton
                grid={grid}
                weekOf={weekOf}
                targetHours={targetHours}
                today={today}
                chrome
                onMarkedDone={onMarkedDone}
              />
            )}
          </div>
        )}
      </div>

      <SectionTabs active={section} onSelect={onSectionChange} showManager={showManagerTab} />
    </header>
  );
}
