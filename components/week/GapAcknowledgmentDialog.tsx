import { format, parseISO } from 'date-fns';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { secondsToHours } from '@/lib/hours';
import type { ISODate } from '@/lib/storage/view-state';
import { type WeekGap, gapDayNote } from '@/lib/week-gaps';

const STRINGS = {
  title: (loggedLabel: string, targetLabel: string) =>
    `Close the week at ${loggedLabel} of ${targetLabel}h?`,
  framing: (dayCount: string, dayNoun: string, verb: string, targetHours: number) =>
    `${dayCount} ${dayNoun} ${verb} under ${targetHours}h. That's fine if it's accurate — accounting reads these numbers as final once the week is closed.`,
  checkboxLabel: "These hours are correct. I'm not missing time.",
  keepEditing: 'Keep editing',
  closeTheWeek: 'Close the week',
};

/** One-decimal hours, trailing `.0` stripped — the dialog's own bare-number
 * formatting (title figure, evidence-row "logged / target"), matching
 * `lib/week-gaps.ts`'s private `hoursLabel` without importing a private fn. */
function hoursLabel(seconds: number): string {
  return secondsToHours(seconds).toFixed(1).replace(/\.0$/, '');
}

/** `Mon 20` — short day name + date, for the evidence row's day column
 * (`imports/jira-time-logger.dc.html:434`, "Mon 20"/"Thu 23"/"Fri 24").
 *
 * Finisher fix (Finding 8): guards the same `''` ISO fallback
 * `computeWeekGaps` deliberately supports (`grid.days[i] ?? ''`,
 * `lib/week-gaps.ts:98`) — `format(parseISO(''), ...)` throws `RangeError:
 * Invalid time value`, which this codebase's convention elsewhere treats as
 * a degrade-safely case, not a crash (`lib/day-status.ts`'s `isWeekend`
 * Finding 24 comment; this same story's own `WeekChromeHeader.tsx` guards
 * an identical `parseISO` 40 lines away). Falls back to the always-populated
 * `gap.dayName` (`DAY_NAMES_LONG`, `lib/week-gaps.ts`), which also carries
 * the fuller weekday for screen readers. */
function shortDayLabel(gap: WeekGap): string {
  const parsed = parseISO(gap.iso);
  return Number.isNaN(parsed.getTime()) ? gap.dayName : format(parsed, 'EEE d');
}

/**
 * The gap-acknowledgment modal for "Mark week as done" (Story 4.5, FR25;
 * substantially rebuilt for Story 7.7 AC7/D-7.7-34; UX-DR13/29/30/32;
 * copy from `EXPERIENCE.md:120-121,313-317`'s "honest framing" and "the
 * friction did its job without moralising").
 *
 * Built on the shadcn Radix `Dialog` — its canonical use (focus-trap, Esc,
 * and ARIA modal semantics inherited) is what supplies AC7's focus trap for
 * free. Two AC7 changes to that inherited behaviour:
 *   - the backdrop no longer dismisses (`onPointerDownOutside` is
 *     prevented) — `Esc` is deliberately LEFT working, routing to
 *     `onCancel` ("Keep editing"), the safe direction.
 *   - initial focus moves to the REQUIRED checkbox, not the primary button
 *     — the primary starts `disabled` until the checkbox is checked, so
 *     focusing it first would be both useless and confusing.
 */
export function GapAcknowledgmentDialog({
  open,
  gaps,
  weekLoggedSeconds,
  weekTargetSeconds,
  dailyTargetHours,
  today,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  gaps: WeekGap[];
  /** Week-total logged/target seconds — "N of 40h" is the WEEK figure, not
   * the gap count (D-7.7-34 point 4). Threaded from the caller's existing
   * computation; never recomputed here. */
  weekLoggedSeconds: number;
  weekTargetSeconds: number;
  /** The per-day target (e.g. 8) for the framing sentence's "under 8h" —
   * a real settings value, never a hard-coded constant. */
  dailyTargetHours: number;
  today: ISODate;
  onCancel: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const checkboxId = useId();
  const [confirmed, setConfirmed] = useState(false);

  const n = gaps.length;
  const dayNoun = n === 1 ? 'day' : 'days';
  const verb = n === 1 ? 'is' : 'are';
  const title = STRINGS.title(hoursLabel(weekLoggedSeconds), hoursLabel(weekTargetSeconds));
  const framing = STRINGS.framing(String(n), dayNoun, verb, dailyTargetHours);

  // Finding 14a: merged from two separate `[open]`-keyed effects. Re-arm
  // the checkbox every time the dialog opens fresh (a prior "Keep editing"
  // + re-open must not silently carry a stale confirmation), and move
  // initial focus → the checkbox (AC7): it is the required next action, and
  // the primary button starts disabled.
  useEffect(() => {
    if (!open) return;
    setConfirmed(false);
    checkboxRef.current?.focus();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          checkboxRef.current?.focus();
        }}
        // AC7: the backdrop must NOT dismiss the dialog. `Esc` is left
        // alone — Radix routes it through `onOpenChange(false)` → the same
        // `onCancel` ("Keep editing") path, which is the safe direction and
        // suppressing `Esc` in a modal would itself be an a11y regression.
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-neutral-700">{framing}</p>

        <ul className="flex flex-col gap-1.5">
          {gaps.map((gap) => (
            <li
              key={gap.dayIndex}
              className="flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs"
            >
              <span className="w-[78px] shrink-0 font-medium text-neutral-900">
                {shortDayLabel(gap)}
              </span>
              <span className="tabular w-[62px] shrink-0 text-neutral-900">
                {`${hoursLabel(gap.loggedSeconds)} / ${hoursLabel(gap.targetSeconds)}h`}
              </span>
              <span className="flex-1 text-neutral-500">{gapDayNote(gap, today)}</span>
            </li>
          ))}
        </ul>

        <label htmlFor={checkboxId} className="flex cursor-pointer items-start gap-2">
          <input
            ref={checkboxRef}
            id={checkboxId}
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[1.5px] border-primary accent-primary focus-visible:outline-none focus-visible:ring-focus"
          />
          <span className="text-sm leading-snug text-neutral-900">{STRINGS.checkboxLabel}</span>
        </label>

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            {STRINGS.keepEditing}
          </Button>
          <Button variant="primary" disabled={!confirmed} onClick={onConfirm}>
            {STRINGS.closeTheWeek}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
