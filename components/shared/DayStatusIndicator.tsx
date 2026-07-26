import {
  ChartPie,
  Circle,
  CircleCheck,
  CircleX,
  Diamond,
  EyeOff,
  LoaderCircle,
  Minus,
  type LucideIcon,
} from 'lucide-react';
import { STATUS_LABEL, type DayStatus, type StatusKind } from '@/lib/day-status';

/**
 * The ONE React renderer for the shared day-status vocabulary (Story 7.6,
 * D-7.6-2/3). This is the ONLY file (besides `styles/globals.css`) allowed
 * to import `CircleCheck`/`ChartPie`/`Diamond`/`Minus`/`EyeOff` from
 * `lucide-react`, or to reference `text-status-clean`/`text-amber-ink`/
 * `text-legacy-purple` (AC3's grep test enforces this).
 *
 * 7.7's week-totals row and 7.8's manager-matrix rows both consume this
 * component — `DayStatusIndicatorProps` below is the frozen deliverable
 * (D-7.6-3). Icon and colour are derived from `status` and are NOT
 * overridable through any other prop; `label` only ever substitutes the
 * WORDS, never the icon or colour (D-7.6-4's "attention" reused for
 * "edited after approval" is the intended pattern).
 */

const STATUS_ICON: Record<StatusKind, LucideIcon> = {
  met: CircleCheck,
  partial: ChartPie,
  attention: Circle,
  'time-off': Diamond,
  weekend: Minus,
  restricted: EyeOff,
  loading: LoaderCircle,
  error: CircleX,
};

/** The only two glyphs the vocabulary renders solid (AC5): `attention`'s
 * `Circle` and `time-off`'s `Diamond` — both `fill="currentColor"` so a
 * booked holiday can never read as "still calculating" (LoaderCircle is a
 * different, never-reused icon entirely). */
const FILLED_STATUSES = new Set<StatusKind>(['attention', 'time-off']);

/** The ONLY `Record<StatusKind, colourClass>` in the product (AC3). */
const STATUS_COLOR_CLASS: Record<StatusKind, string> = {
  met: 'text-status-clean',
  partial: 'text-foreground',
  attention: 'text-amber-ink',
  'time-off': 'text-legacy-purple',
  weekend: 'text-faint',
  restricted: 'text-faint',
  loading: 'text-primary',
  error: 'text-status-error',
};

/**
 * Story 7.7, D-7.7-15/17: `DayCell.tsx`'s time-off cell fill needs this SAME
 * text colour (the cell's purple tint is reinforcement, not the carrier of
 * meaning — the totals row's Diamond+words already satisfy AC8, D-7.7-17).
 * Exposed as ONE named value, not the whole map, so the AC3 grep guard
 * (`lib/day-status-vocabulary.grep.test.ts`) still catches an UNDISCLOSED
 * re-implementation elsewhere — `DayCell.tsx` reads this constant rather
 * than writing the literal class string, so the map still has exactly one
 * owner.
 */
export const TIME_OFF_TEXT_CLASS = STATUS_COLOR_CLASS['time-off'];

/**
 * On the chrome gradient, day status renders in white / white-at-opacity
 * ONLY — no per-status colour, for ANY status, `met` included (D-7.6-40,
 * which corrects D-7.6-39/this file's own earlier `met`-only exception).
 * `DESIGN.md:172`'s recipe is verbatim `on-chrome: 'background
 * rgba(255,255,255,.16), color #fff'`; the vendored round-2 design source
 * (`imports/jira-time-logger-round2.dc.html:497-521`) confirms every
 * element on the gradient — eyebrow, date, figure, bar fill, progress note —
 * is white or translucent white, with NO status colour anywhere. Colour
 * cues would fight the brand surface there; the chrome header carries
 * meaning through size/weight/wording instead (the big white figure, the
 * white bar, the plain-language note) — the colour vocabulary belongs to
 * the white canvas below.
 *
 * `--color-status-clean-on-chrome` (`styles/globals.css`) still exists —
 * D-7.6-39's token ADDITION stands — but its real consumer is Story 7.10's
 * connection-status dot (`epics.md:2044`), not a day status. It must not be
 * (and, after this correction, no longer is) used here.
 */
const CHROME_COLOR_CLASS = 'text-white/85';

/**
 * Background-wash tint per status, for a caller that needs a `<td>`/cell
 * BACKGROUND rather than the icon+text chip `DayStatusIndicator` itself
 * renders (`components/week/DayCell.tsx`'s body-cell tint, Story 7.6 /
 * D-7.6-45). Exported from here because D-7.6-2 is explicit that this
 * component owns the ONLY `Record<StatusKind, colourClass>` map in the
 * product — `DayCell` previously duplicated one locally, undisclosed, which
 * is exactly the per-surface re-implementation AC3 exists to prevent.
 *
 * `partial` and `weekend` are deliberately absent: `partial` carries no
 * background wash by design (only the icon+note convey it), and `weekend`'s
 * tint is NOT status-derived at all — it comes from the exported
 * `isWeekend(iso)` predicate, a separate axis (D-7.6-6/46). A caller falls
 * back to its own `isWeekend` check when a status has no entry here.
 */
export const STATUS_TINT_CLASS: Partial<Record<DayStatus, string>> = {
  met: 'bg-state-success-subtle',
  attention: 'bg-amber-soft',
  // Purple wash, not green — time off is not "success", it's a settled,
  // intentional day (its own identity: `--color-legacy-purple`'s soft tint).
  'time-off': 'bg-primary-soft',
};

/**
 * Story 7.7, D-7.7-16: the totals-row progress bar's colour is its OWN axis,
 * independent of `STATUS_COLOR_CLASS` (the text/icon colour) — `bg-current`
 * used to make the bar inherit the text colour, which rendered `partial`
 * (the commonest state in a normal week) as a near-black bar where the
 * design wants royal purple. Only `met` has bar == text; the other four
 * differ (`imports/jira-time-logger.dc.html:811-815`). This is the ONLY
 * `Record<StatusKind, colourClass>` for bar colour, living in the same file
 * D-7.6-2 already designates as the sole owner of status→colour maps.
 */
const STATUS_BAR_CLASS: Record<StatusKind, string> = {
  met: 'bg-status-clean',
  partial: 'bg-royal-purple',
  attention: 'bg-status-dirty',
  'time-off': 'bg-time-off-bar',
  weekend: 'bg-weekend-bar', // never actually painted — `weekend` renders no bar
  restricted: 'bg-faint',
  loading: 'bg-primary',
  error: 'bg-status-error',
};

const ICON_SIZE = 12; // 11-13px per DESIGN.md icons.defaults.size

// Quantised to 5% steps — Tailwind's build-time scanner cannot see a
// runtime-interpolated `w-[${pct}%]` class string (same trick as
// `ChromeHeader.tsx`'s progress bar, D-7.6-3's `percent` doc comment).
const BAR_WIDTH_CLASSES = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
] as const;

/**
 * Story 7.7, D-7.7-29 (defect 2 — quantisation): `Math.round` mapped 97.6% to
 * `w-full` (reads as fully done) and 2.4% to `w-0` (reads as empty).
 * `Math.floor` plus a non-zero floor fixes both directions: any genuinely
 * non-zero percentage renders at least `w-[5%]`, and only a true zero
 * renders `w-0`. `w-full` is now reserved for a percentage that actually
 * rounds down to 100 (or exceeds it, after clamping).
 */
function pctToWidthClass(pct: number): string {
  const clamped = Math.min(100, Math.max(0, pct));
  if (clamped <= 0) return 'w-0';
  const index = Math.max(1, Math.floor(clamped / 5));
  return BAR_WIDTH_CLASSES[index] ?? 'w-full';
}

export type DayStatusIndicatorProps = {
  /** Which vocabulary entry to render. Icon and colour are derived from this
   * and are NOT overridable — that is the whole point of the component. */
  status: StatusKind;

  /** Layout.
   *  'inline'  — icon + label on one line. Popup progress note; matrix
   *              exception chip.
   *  'stacked' — line 1: `value` + icon · line 2: 3px progress bar · line 3:
   *              the note. 7.7's week-totals-cell anatomy (DESIGN.md:471-473). */
  variant?: 'inline' | 'stacked';

  /** Line-one figure, e.g. `6.5 / 8h`. Rendered with the `tabular` utility.
   * Omit for a chip that carries no number. */
  value?: React.ReactNode;

  /** Overrides the visible text label. Defaults to `STATUS_LABEL[status]`.
   * Used by 7.8 to say "Edited after approval" for the SAME `attention`
   * token the week grid uses for "Nothing logged" — same icon, same colour,
   * different axis, different words. NEVER used to change a status's colour
   * or icon. */
  label?: string;

  /** 'stacked' line three — the plain-language note ("2.5h short"). Comes
   * from `dayStatusNote()`; passed in because only the caller knows the
   * seconds. Falls back to the visible label when omitted, so AC8's
   * "visible text label" holds even if a future caller forgets it. */
  note?: string;

  /** 'stacked' only, 0-100. The bar is `aria-hidden`; the note carries the
   * meaning. `weekend` never renders a bar (DESIGN.md: "no status of its
   * own"), regardless of `percent`. */
  percent?: number;

  /** Icon edge length in px. Default 12. DESIGN.md's icons.defaults.size
   * permits 11-13; 11 is pinned by Story 7.7's AC4 for the week-totals row's
   * glyph (`imports/jira-time-logger.dc.html:405`) — NOT for a cell icon;
   * see D-7.7-17, which found the time-off DATA cell carries no icon at
   * all. A closed union, not `number`, so an out-of-range value is a type
   * error rather than a review finding (D-7.7-30). */
  size?: 11 | 12 | 13;

  /** 'data' (default) or 'chrome'.
   *  'chrome' — D-7.6-5/40: white at 85% opacity, calibrated for the
   *             popup's purple gradient (`ChromeHeader`'s progress note;
   *             `DESIGN.md`'s own specified value there).
   *
   * `'chrome-solid'` (D-7.6-49) was REMOVED by Story 7.8 / D-7.8-26: once the
   * restricted chip carries its own `#F4F4F7` background (AC9), its only
   * call site (`ManagerMatrix.tsx`'s `approved`-cell override) no longer
   * needs a full-opacity white — the chip's contrast no longer depends on
   * what's behind it. This is the FIRST narrowing of the frozen
   * `DayStatusIndicatorProps` contract (D-7.6-3) — recorded there.
   */
  tone?: 'data' | 'chrome';

  className?: string;
};

export function DayStatusIndicator({
  status,
  variant = 'inline',
  value,
  label,
  note,
  percent,
  size,
  tone = 'data',
  className = '',
}: DayStatusIndicatorProps): React.ReactElement {
  const Icon = STATUS_ICON[status];
  const filled = FILLED_STATUSES.has(status);
  const colorClass = tone === 'chrome' ? CHROME_COLOR_CLASS : STATUS_COLOR_CLASS[status];
  // Finding 16: `||`, not `??` — the component has no icon-only mode
  // (silence is the absence of the component, D-7.6-3), so `label=""` is the
  // one way a caller could accidentally suppress the visible word entirely.
  // `??` lets an empty string pass straight through, producing an icon +
  // colour with ZERO visible text — a silent AC8/colour-alone violation no
  // test could catch. `||` falls back to the default label for both
  // `undefined` and `''`.
  const text = label || STATUS_LABEL[status];

  const icon = (
    <Icon
      size={size ?? ICON_SIZE}
      aria-hidden="true"
      {...(filled ? { fill: 'currentColor' } : {})}
    />
  );

  if (variant === 'stacked') {
    const showBar = status !== 'weekend' && typeof percent === 'number';
    // The note (or, failing that, the default/overridden label) is ALWAYS
    // the visible text — colour + icon + visible label, never colour/icon
    // alone (AC8). `||`, not `??`, for the same reason as `text` above
    // (Finding 16): `note=""` must not suppress the fallback.
    const noteText = note || text;
    return (
      // D-7.7-29 (defect 1 — width): `inline-flex` let `w-full` on the bar
      // resolve against the widest SIBLING line (value+icon, or the note
      // text) rather than the wrapper's own box, so the same `percent`
      // rendered a different pixel length depending on how long that
      // render's note happened to be. `flex w-full` gives the wrapper a
      // definite width — it now fills its container (the totals `<td>`,
      // pinned to 104px by D-7.7-23) — so the inner bar's `w-full` is
      // container-relative like every other bar in the product.
      <span
        className={`flex w-full flex-col items-end gap-0.5 ${colorClass} ${className}`}
      >
        <span className="flex items-center gap-0.5">
          {value !== undefined ? <span className="tabular">{value}</span> : null}
          {icon}
        </span>
        {showBar ? (
          <span
            aria-hidden="true"
            className={`h-[3px] w-full overflow-hidden rounded-full ${
              tone === 'chrome' ? 'bg-white/20' : 'bg-cell-border'
            }`}
          >
            <span
              className={`block h-full rounded-full ${
                tone === 'chrome' ? 'bg-white' : STATUS_BAR_CLASS[status]
              } ${pctToWidthClass(percent ?? 0)}`}
            />
          </span>
        ) : null}
        <span className="text-[10px] leading-tight">{noteText}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${colorClass} ${className}`}>
      {icon}
      {value !== undefined ? <span className="tabular">{value}</span> : null}
      <span>{text}</span>
    </span>
  );
}
