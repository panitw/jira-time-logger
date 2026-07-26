/**
 * Pure Mon–Fri gap-check for the Mark-week-as-done flow (Story 4.5, FR25).
 *
 * Distinct from Story 4.2's `computeDayStatuses`:
 *   - `computeDayStatuses` only reds *past-or-today* weekdays (grid coloring).
 *   - `computeWeekGaps` evaluates ALL Mon–Fri regardless of today — marking a
 *     week done is an end-of-week act, so an empty future workday legitimately
 *     counts as a gap to acknowledge (epics.md#L1163).
 *
 * Pure — no clock read, no `today`, no chrome/network/React. A day is:
 *   - complete  → `dayTotalsSeconds[i] >= target` OR the day has a PTO worklog.
 *   - gap       → `< target` AND not marked PTO.
 * Saturday/Sunday (indices 5–6) are never evaluated.
 */
import { hoursToSeconds, secondsToHours } from '@/lib/hours';
import { type WeekGrid, DAYS_PER_WEEK } from '@/lib/week-grid';

/** Long weekday names, index 0 = Monday .. 6 = Sunday (single source). */
const DAY_NAMES_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** Mon–Fri only: indices 0..4. */
const LAST_WORKDAY_INDEX = 4;

export type WeekGap = {
  dayIndex: number;
  dayName: string;
  loggedSeconds: number;
  targetSeconds: number;
};

/**
 * Identify which Mon–Fri days are below target and not marked PTO.
 * Returns gaps in Monday→Friday order.
 */
export function computeWeekGaps(
  grid: WeekGrid,
  params: { targetHours: number },
): WeekGap[] {
  const targetSeconds = hoursToSeconds(params.targetHours);

  // Which days have a PTO worklog: any pto-category row with seconds that
  // day. Finding 18: this is a deliberately separate, clock-blind BOOLEAN
  // detector — it is NOT "the same detection as computeDayStatuses, reused"
  // any more (D-7.6-38 changed that function to SUM per-day time-off
  // seconds, so it can tell a half-day from a full one; this one still only
  // asks "any at all, per row"). They agree for ordinary data but diverge on
  // sign: e.g. offsetting +8h/-8h pto rows on the same day would read as
  // time-off here while `dayStatusFor` sees zero net time-off seconds and
  // renders `attention`. Kept deliberately unmerged (D-7.6-1/D-7.6-38 — this
  // file gates the mark-week-as-done write path, an end-of-week act, and
  // stays out of this story's copy-and-vocabulary scope); the pre-existing
  // "a half-day-off day is never a gap, so a week with a genuine shortfall
  // can be marked done" bug at `:61` is hereby handed to Story 7.7 to close
  // or explicitly re-defer, not fixed here.
  const ptoDays = new Array<boolean>(DAYS_PER_WEEK).fill(false);
  for (const r of grid.rows) {
    if (r.category !== 'pto') continue;
    for (let i = 0; i < DAYS_PER_WEEK; i++) {
      if ((r.cellsSeconds[i] ?? 0) > 0) ptoDays[i] = true;
    }
  }

  const gaps: WeekGap[] = [];
  for (let i = 0; i <= LAST_WORKDAY_INDEX; i++) {
    if (ptoDays[i]) continue;
    const logged = grid.dayTotalsSeconds[i] ?? 0;
    if (logged >= targetSeconds) continue;
    gaps.push({
      dayIndex: i,
      dayName: DAY_NAMES_LONG[i] ?? '',
      loggedSeconds: logged,
      targetSeconds,
    });
  }
  return gaps;
}

/** One-decimal hours with a trailing `.0` stripped (`4`, `4.5`, `0`). */
function hoursLabel(seconds: number): string {
  return secondsToHours(seconds).toFixed(1).replace(/\.0$/, '');
}

/**
 * Screen-reader-friendly factual summary for a gap day (UX-DR32), e.g.
 * `Thursday: 4h logged / 8h target, not marked time off`.
 *
 * Copy-only rename (Story 7.6, D-7.6-12/AC6) — the underlying gap-detection
 * logic (`computeWeekGaps`, `lib/week-gaps.ts:43`) is untouched; see its
 * header comment for why it deliberately stays a separate, clock-blind
 * derivation from `computeDayStatuses`.
 */
export function gapSummary(gap: WeekGap): string {
  const logged = hoursLabel(gap.loggedSeconds);
  const target = hoursLabel(gap.targetSeconds);
  return `${gap.dayName}: ${logged}h logged / ${target}h target, not marked time off`;
}
