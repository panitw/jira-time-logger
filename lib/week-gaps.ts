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
 *   - complete  → `dayTotalsSeconds[i] >= target`.
 *   - gap       → `< target`.
 * Saturday/Sunday (indices 5–6) are never evaluated.
 *
 * Story 7.7 / D-7.6-38 / D-7.7-27 / D-7.7-19: this function used to also
 * treat ANY time-off seconds that day as "not a gap" (a `ptoDays[i]` guard),
 * which let a genuinely-short half-day-off day be marked done. That guard
 * was redundant for the case it was meant to protect and wrong for the case
 * it accidentally also covered: `lib/week-grid.ts`'s `buildWeekGrid` already
 * sums EVERY worklog's seconds — time off included — into
 * `dayTotalsSeconds`, with no category filter. So a full day off (8h off,
 * nothing else) already clears an 8h target on `dayTotalsSeconds` alone; the
 * guard was never needed for that case. A half day off (4h off, nothing
 * else) is 4h short of an 8h target — a real gap the guard was silently
 * hiding. Removing the guard closes that hole with no new summing logic and
 * no new parameter: `dayTotalsSeconds` was always the right number to
 * compare. This is a WRITE-PATH change — it gates "Mark week as done" — so
 * it is closed here, not deferred again.
 */
import { dayStatusFor, dayStatusNote } from '@/lib/day-status';
import { hoursToSeconds } from '@/lib/hours';
import type { ISODate } from '@/lib/storage/view-state';
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

/** Mon–Fri workdays per week (single source — `WeekView.tsx`'s week-total
 * math, and the mark-done evidence dialog, both derive from this). */
export const WORKDAYS_PER_WEEK = LAST_WORKDAY_INDEX + 1;

export type WeekGap = {
  dayIndex: number;
  dayName: string;
  loggedSeconds: number;
  targetSeconds: number;
  /** This gap day's ISO date and time-off seconds — carried so
   * `gapDayNote` can derive an honest per-day note via the shared
   * `dayStatusNote` vocabulary (D-7.7-19) instead of a fixed suffix that
   * would go false the moment a half-day-off day can itself be a gap. */
  iso: ISODate;
  timeOffSeconds: number;
};

/**
 * Identify which Mon–Fri days are below target. Returns gaps in
 * Monday→Friday order.
 */
export function computeWeekGaps(
  grid: WeekGrid,
  params: { targetHours: number },
): WeekGap[] {
  const targetSeconds = hoursToSeconds(params.targetHours);

  // Per-day time-off seconds — same aggregation `computeDayStatuses` uses
  // (`lib/week-grid.ts`), so a gap's note can distinguish a half-day off
  // from an ordinary short day. Carried on the gap, not used to skip it:
  // see the module header comment for why the old boolean "any PTO that
  // day → not a gap" guard was removed (D-7.6-38/D-7.7-27/D-7.7-19).
  const timeOffSecondsByDay = new Array<number>(DAYS_PER_WEEK).fill(0);
  for (const r of grid.rows) {
    if (r.category !== 'pto') continue;
    for (let i = 0; i < DAYS_PER_WEEK; i++) {
      timeOffSecondsByDay[i] = (timeOffSecondsByDay[i] ?? 0) + (r.cellsSeconds[i] ?? 0);
    }
  }

  const gaps: WeekGap[] = [];
  for (let i = 0; i <= LAST_WORKDAY_INDEX; i++) {
    const logged = grid.dayTotalsSeconds[i] ?? 0;
    if (logged >= targetSeconds) continue;
    gaps.push({
      dayIndex: i,
      dayName: DAY_NAMES_LONG[i] ?? '',
      loggedSeconds: logged,
      targetSeconds,
      iso: grid.days[i] ?? '',
      timeOffSeconds: timeOffSecondsByDay[i] ?? 0,
    });
  }
  return gaps;
}

/**
 * Per-gap-day plain-language note (Story 7.7, D-7.7-19), reusing the SAME
 * shared `dayStatusNote` vocabulary the totals row uses — never a second
 * note formatter. `today` is needed here (unlike the rest of this
 * clock-blind module) because `dayStatusNote` itself distinguishes an
 * elapsed short day from one still in progress. A day with no status yet
 * (a future workday with nothing logged, D-7.6-35) has no note to derive —
 * "not yet due" is an honest, factual fallback, not a verdict.
 */
export function gapDayNote(gap: WeekGap, today: ISODate): string {
  const status = dayStatusFor({
    iso: gap.iso,
    loggedSeconds: gap.loggedSeconds,
    timeOffSeconds: gap.timeOffSeconds,
    targetSeconds: gap.targetSeconds,
    today,
  });
  if (!status) return 'not yet due';
  return dayStatusNote({
    status,
    loggedSeconds: gap.loggedSeconds,
    timeOffSeconds: gap.timeOffSeconds,
    targetSeconds: gap.targetSeconds,
    iso: gap.iso,
    today,
  });
}

// `gapSummary` (Screen-reader-friendly factual summary for a gap day,
// UX-DR32, e.g. `Thursday: 4h logged / 8h target — 4h short`) was REMOVED
// by the finisher pass (D-7.7-21b). History: D-7.7-19 required replacing
// its old fixed `, not marked time off` suffix with the real per-day note
// via `gapDayNote`/`dayStatusNote`, and that fix landed correctly — but the
// SAME story's `GapAcknowledgmentDialog` rebuild (AC7/D-7.7-34) stopped
// calling `gapSummary` at all, composing its own evidence row instead
// (day + logged/target + note as three sibling spans). The finisher
// verified the rebuilt row is a GENUINE accessible equivalent, not a
// silent a11y regression: none of the three spans carries `aria-hidden`,
// each evidence `<li>` gets `role="listitem"` (`GapAcknowledgmentDialog.
// test.tsx`'s `getAllByRole('listitem')`), and the dialog's own axe scan
// (`WeekChromeHeader.test.tsx`'s "the open gap dialog has zero Critical/
// Serious violations") is clean — a screen reader in browse mode reads all
// three facts (day, hours logged/target, note) in DOM order, exactly the
// same information `gapSummary`'s sentence carried, just not stitched into
// one continuous "logged / target" phrase. With its only production
// consumer gone and no accessible-name gap to fill, `gapSummary` was dead
// code whose 4 tests protected nothing a user could reach — removed rather
// than kept as an unreachable "coverage" illusion.
