/**
 * The shared day-status vocabulary (Story 7.6, D-7.6-2/3).
 *
 * Pure — zero React, zero `lucide-react` (architecture rule, same as
 * `lib/pto.ts`/`lib/week-grid.ts`). The ONE React renderer that maps these
 * keys to an icon + colour token lives in
 * `components/shared/DayStatusIndicator.tsx`.
 *
 * Keys mirror DESIGN.md's `icons:` block verbatim (lines 231-240) so the
 * renderer can index straight off them:
 *
 *   met | partial | attention | time-off | weekend
 *
 * `StatusKind` additionally registers the three things that are explicitly
 * NOT a day status — `restricted` / `loading` / `error` — so no surface can
 * hard-code `EyeOff`/`LoaderCircle`/`CircleX` either (AC5).
 */
import { secondsToHours } from '@/lib/hours';
import type { ISODate } from '@/lib/storage/view-state';

export type DayStatus = 'met' | 'partial' | 'attention' | 'time-off' | 'weekend';

export type StatusKind = DayStatus | 'restricted' | 'loading' | 'error';

/** Exhaustiveness fixture — iterate this, never hard-code the 5 literals. */
export const DAY_STATUSES: readonly DayStatus[] = [
  'met',
  'partial',
  'attention',
  'time-off',
  'weekend',
];

/** Default visible text label per status (AC8's "visible text label").
 * D-7.6-12 requires these verbatim from EXPERIENCE.md/DESIGN.md — `attention`
 * and `restricted` previously drifted from a short paraphrase (Finding 10);
 * aligned back to spec here. */
export const STATUS_LABEL: Record<StatusKind, string> = {
  met: 'Met',
  partial: 'Partially logged',
  attention: 'Workday with nothing logged',
  'time-off': 'Time off',
  weekend: 'Weekend',
  restricted: 'hidden',
  loading: 'Loading',
  error: 'Failed',
};

/** True for Saturday/Sunday, derived from the day's local weekday. Exported
 * so 7.7 tints the week grid's weekend column from the SAME predicate the
 * status is derived from (D-7.6-6) — no drift between the two.
 *
 * Validates the ISO shape first (Finding 24) — `getDay()` on an Invalid Date
 * returns `NaN`, and `NaN === 0 || NaN === 6` is `false`, so a malformed
 * input (`''`, `'2026-13-01'`, an unpadded `'2026-6-20'`) previously
 * classified as a WEEKDAY silently, with no documented reason. Existing
 * callers in this story (`WeeklyGrid.tsx`'s `grid.days[i] ?? ''` defensive
 * fallback) already rely on a malformed/missing date degrading safely rather
 * than throwing, so this makes that behaviour explicit and documented
 * (fail-closed to "not a weekend") instead of an accidental NaN comparison —
 * it does not start throwing, which would turn an existing defensive
 * fallback into a crash. */
export function isWeekend(iso: ISODate): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const weekday = new Date(`${iso}T00:00:00`).getDay(); // 0 = Sun .. 6 = Sat
  return weekday === 0 || weekday === 6;
}

/**
 * Single-day derivation — pure, but CLOCK-AWARE via the injected `today`
 * (D-7.6-35, owner ruling). `dayStatusFor` never reads a clock itself; the
 * caller injects "today" as a local `YYYY-MM-DD` so the elapsed/future
 * boundary is deterministic and testable.
 *
 * Precedence (D-7.6-6): `time-off` > `weekend` > `met` > `partial` >
 * `attention`.
 *
 * Returns `null` for a workday that has not happened yet with nothing
 * logged (D-7.6-35: "workdays that have not happened yet render a
 * neutral/empty status"). `null` is not a sixth `DayStatus` member — AC2's
 * "exactly one of five" still holds for every day that HAS a status. A
 * future empty workday has no status to render, mirroring the precedent set
 * for 7.8's correct/approved matrix cell (D-7.6-3): silence is the absence
 * of the component, not a value in the vocabulary. The caller (e.g.
 * `WeeklyGrid`'s totals cell) renders a bare number for `null`, exactly as
 * it already does for a day with no `DayStatusIndicator` at all.
 */
export function dayStatusFor(input: {
  iso: ISODate;
  loggedSeconds: number;
  timeOffSeconds: number;
  targetSeconds: number;
  today: ISODate;
}): DayStatus | null {
  const { iso, loggedSeconds, timeOffSeconds, targetSeconds, today } = input;

  // Time off wins outright — a deliberately booked day is information,
  // regardless of what else landed on it (today's code already gives PTO
  // absolute precedence; preserved to avoid a silent behaviour change).
  if (timeOffSeconds > 0) return 'time-off';

  // Weekend is next: a target-relative status is meaningless without a
  // target (DESIGN.md:236 — "no status of its own"). This IS a visible
  // behaviour change from the old build (a Saturday hitting target used to
  // render `complete` green) — deliberate, per D-7.6-6.
  if (isWeekend(iso)) return 'weekend';

  // No configured target: every remaining branch below is target-relative
  // (`met`/`partial` compare against it; `attention` means "owed and
  // nothing logged"), so with no target there is nothing to be relative TO
  // — same rationale as the weekend guard above (Finding 19). Previously
  // `targetSeconds <= 0` fell through to `partial`/`attention` and produced
  // self-contradictory notes (e.g. "0h short" beside a fully-logged day).
  if (targetSeconds <= 0) return null;

  if (loggedSeconds >= targetSeconds) return 'met';
  if (loggedSeconds > 0) return 'partial';

  // Nothing logged, not a weekend, not time off: only an ELAPSED workday
  // (past-or-today, local-midnight boundary) reads as `attention`. A future
  // workday has no status yet — it has not had the chance to be anything.
  const elapsed = iso <= today; // safe lexical compare for YYYY-MM-DD
  return elapsed ? 'attention' : null;
}

/** `<n>h` rendered without a trailing ".0" — the vocabulary's one number
 * format, shared by the shortfall and the time-off amount below. */
function formatHoursLabel(seconds: number): string {
  return secondsToHours(Math.max(0, seconds)).toFixed(1).replace(/\.0$/, '');
}

/** `<n>h short` — the shortfall phrased as a fact, never a verdict. Floored
 * at "0.1h short" (Finding 23): every caller only invokes this when a real,
 * positive shortfall exists, so a sub-6-minute shortfall rounding to the
 * literal digit "0" would assert a self-contradictory "0h short" instead of
 * the true (small) fact. */
function shortfallLabel(seconds: number): string {
  const hours = Math.max(0.1, secondsToHours(Math.max(0, seconds)));
  return `${hours.toFixed(1).replace(/\.0$/, '')}h short`;
}

/**
 * The plain-language note (AC2). `today` is injected here too — for
 * `partial`, TODAY's still-accumulating hours read as "in progress" (the
 * day isn't over, so calling it "short" would be premature); a PAST
 * partial day gets the definite shortfall. This is what lets the STATUS
 * stay clock-free where possible while the NOTE still varies for a day in
 * progress (D-7.6-7's intent, carried into D-7.6-35's resolution).
 *
 * Guarded against `iso === today` only, which missed the FUTURE case
 * (D-7.6-47 #1 / Finding 5): `dayStatusFor`'s `partial` branch has no
 * elapsed gate (only the zero-logged branch does), so a future day with
 * something logged — reachable today by pre-logging into a future cell, or
 * by booking time off in advance — got a definite past-tense shortfall for
 * a day that has not happened. Both the `partial` and `time-off` branches
 * below now suppress the verdict for `iso >= today`, not just `iso ===
 * today`.
 *
 * Half-day time off (D-7.6-9/D-7.6-38, amended by D-7.6-47 #2 / Finding 6):
 * the status stays `time-off`; the note differentiates full vs. half vs. an
 * honest "some hours off" phrasing that claims no fraction, and — like
 * `partial` — never asserts a shortfall for a day that has not happened or
 * has no target to be short against.
 *
 * Finisher fix, D-7.7-20 (Finding 4): the rule stays uniform — ANY day below
 * target is a gap, time off included, no exemption, no tolerance threshold.
 * What was wrong was the NOTE, not the rule: 7.5h of time off against an 8h
 * target used to fall into the same bucket as a genuine 4h "half day"
 * (`timeOffSeconds >= targetSeconds / 2`) and print "Half-day time off",
 * which is false — the user took the whole day, just booked (or was
 * configured with) a slightly different number of hours than the target.
 * "Half-day time off" is now reserved for an ACTUAL half booking — the
 * value `logHalfDayPto` posts (`targetHours / 2`, D-7.6-9/38) — and every
 * other under-target time-off amount states the real hours booked plus the
 * shortfall, exactly like a normal short workday, never claiming a fraction
 * it isn't.
 */
export function dayStatusNote(input: {
  status: DayStatus;
  loggedSeconds: number;
  timeOffSeconds: number;
  targetSeconds: number;
  iso: ISODate;
  today: ISODate;
}): string {
  const { status, loggedSeconds, timeOffSeconds, targetSeconds, iso, today } = input;
  const future = iso >= today; // today itself is treated as "not yet over"

  switch (status) {
    case 'met':
      // Just the verdict. The hours are ALREADY on screen immediately above
      // this note ("8.0 / 8h"), so "— 8h logged" restated them and, in a
      // 104px grid column, wrapped the note onto a second line to do it.
      // Every other arm below earns its clause by adding something the
      // figure does not carry (a shortfall, a full/half claim, the real
      // time-off hours); "met" has nothing left to add.
      return 'Target met';
    case 'partial':
      return future ? 'in progress' : shortfallLabel(targetSeconds - loggedSeconds);
    case 'attention':
      return 'Workday with nothing logged';
    case 'time-off': {
      const timeOffHours = formatHoursLabel(timeOffSeconds);
      // A weekend has no target (D-7.6-6 — "no status of its own") and a
      // day with no configured target has nothing to be a fraction OF, so
      // neither can support a full/half claim or a shortfall — both would
      // be target-relative clauses that don't apply (Finding 6a).
      if (isWeekend(iso) || targetSeconds <= 0) {
        return `Time off · ${timeOffHours}h`;
      }
      if (timeOffSeconds >= targetSeconds) return 'Full-day time off';
      // A genuine three-way (Finding 6b): only >= half the target earns the
      // word "half" — anything less gets the same neutral "claims no
      // fraction" phrasing as the weekend/no-target case above, rather than
      // "Half-day time off" printing for any sub-target amount at all.
      if (timeOffSeconds < targetSeconds / 2) {
        return `Time off · ${timeOffHours}h`;
      }
      // D-7.7-20 (Finding 4)'s fourth arm: "half-day" is reserved for an
      // ACTUAL half booking (`logHalfDayPto`'s `targetHours / 2`, rounded to
      // the nearest second the same way it was posted) — anything strictly
      // between half and full is a near-full booking that landed short (the
      // 7.5h-vs-8h-target case the reviewer found), and claiming "half" for
      // it is the exact defect being fixed. State the real hours instead.
      const isActualHalf = timeOffSeconds === Math.round(targetSeconds / 2);
      if (!isActualHalf) {
        if (!future && loggedSeconds < targetSeconds) {
          return `Time off · ${timeOffHours}h · ${shortfallLabel(targetSeconds - loggedSeconds)}`;
        }
        return `Time off · ${timeOffHours}h`;
      }
      const base = 'Half-day time off';
      if (!future && loggedSeconds < targetSeconds) {
        return `${base} · ${shortfallLabel(targetSeconds - loggedSeconds)}`;
      }
      return base;
    }
    case 'weekend':
      return 'Weekend';
  }
}
