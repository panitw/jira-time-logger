import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type WeekGap, gapSummary } from '@/lib/week-gaps';

const STRINGS = {
  title: 'Submit week with gaps?',
  cancel: 'Cancel',
  submitAnyway: 'Submit anyway',
};

/**
 * Honest gap-acknowledgment modal (Story 4.5, FR25; UX-DR13/29/30/32).
 *
 * Built on the shadcn Radix `Dialog` — its canonical use (focus-trap, Esc, and
 * ARIA modal semantics inherited). Default focus is the primary `Submit anyway`
 * action (the worker has already seen the gaps on the grid; this confirms
 * intent). Esc / ✕ / backdrop all route through `onOpenChange(false)` →
 * `onCancel` — never `onConfirm` (AC #4). Honest copy: no exclamation beyond
 * the question, factual `<li>` list, never preachy.
 */
export function GapAcknowledgmentDialog({
  open,
  gaps,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  gaps: WeekGap[];
  onCancel: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  const submitRef = useRef<HTMLButtonElement>(null);
  const n = gaps.length;
  const verb = n === 1 ? 'is' : 'are';
  const noun = n === 1 ? 'day' : 'days';
  const body = `${n} ${noun} ${verb} below target and not marked as PTO. Submit anyway?`;

  // Default focus on the primary action (Radix focus-trap is inherited; we only
  // steer the *initial* focus target per AC #3).
  useEffect(() => {
    if (open) submitRef.current?.focus();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent
        className="max-w-sm"
        onOpenAutoFocus={(e) => {
          // Take over Radix's default (which would focus the first tabbable —
          // the ✕) and focus Submit anyway instead.
          e.preventDefault();
          submitRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{STRINGS.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-neutral-700">{body}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          {gaps.map((gap) => (
            <li key={gap.dayIndex}>{gapSummary(gap)}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            {STRINGS.cancel}
          </Button>
          <Button ref={submitRef} variant="primary" onClick={onConfirm}>
            {STRINGS.submitAnyway}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
