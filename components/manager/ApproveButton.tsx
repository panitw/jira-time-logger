import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isValid } from 'date-fns';
import { Info } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { DayStatusIndicator } from '@/components/shared/DayStatusIndicator';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/components/ui/utils';
import { secondsToHours } from '@/lib/hours';
import { log } from '@/lib/log';
import { sendRequest } from '@/lib/messages';

/**
 * The row-end "Approve <Person>" affordance (Story 5.6, FR32/FR35).
 *
 * State union (`ready | approving | done | partial`) is kept deliberately open
 * so Story 5.7's re-approve (dirty) variant and Story 5.8's non-canonical
 * read-only mode slot in without a refactor: 5.8 passes a `disabledReason`, 5.7
 * adds a `dirty` label/dialog-line. This story implements only the
 * empty/in-flight disabled reasons.
 *
 * On confirm it fires a `useMutation` that asks the SW (`approve-cycle`) to fan
 * the approval out across every touched Epic. On settle it invalidates
 * `['epic-approvals', epicKey]` for each CONFIRMED Epic so those cells re-render
 * with the server-state "Approved" status (NOT a local flag). Full success →
 * `✓ Done`; partial → a durable "Approval partial — N of M Epics confirmed"
 * chip with an explanatory tooltip.
 */

type TouchedEpic = { epicKey: string; restrictedCount: number };

/** The button's interaction mode: a normal first approval vs a dirty re-approval. */
export type ApproveMode = 'approve' | 'reapprove';

const STRINGS = {
  approve: (person: string) => `Approve ${person}`,
  reapprove: (person: string) => `Re-approve ${person}`,
  done: 'Done',
  approving: 'Approving…',
  cancel: 'Cancel',
  // Story 7.8, Task 9: title and body are now TWO separate strings (was one
  // combined "summary" line) — dc.html:609-610.
  dialogTitle: (verb: string, person: string, cycleTitle: string) =>
    `${verb} ${person}'s ${cycleTitle}?`,
  dialogBodyLead: "You're approving",
  dialogBodyEpics: (n: number) => `across ${n} ${n === 1 ? 'epic' : 'epics'}`,
  dialogBodyTail: (cycleTitle: string) =>
    `for the ${cycleTitle} cycle. Accounting uses this figure.`,
  // The commit button now CARRIES THE FIGURE (dc.html:618) — replaces the
  // bare "Approve"/"Re-approve" label.
  commit: (verb: string, hours: string) => `${verb} ${hours}h`,
  supersede: (formattedAt: string) =>
    `Re-approving — supersedes prior approval from ${formattedAt}`,
  // Story 7.8 / AC6: the axis changes from WORKLOGS to EPICS — "{N} epic{s}
  // has/have worklogs you can't see. Approving does not cover them."
  // (dc.html:613). Finding 26 (Nit): the noun pluralises AND the verb
  // agrees — dc.html:613 only quotes the n=1 form, so subject-verb
  // agreement at n>1 was a free choice, not a spec requirement.
  restrictedCaveat: (n: number) =>
    `${n} epic${n === 1 ? '' : 's'} ${n === 1 ? 'has' : 'have'} worklogs you can't see. Approving does not cover them.`,
  partial: (confirmed: number, total: number) =>
    `Approval partial — ${confirmed} of ${total} Epics confirmed`,
  // Retryable failures were enqueued in the outbox and WILL retry automatically.
  partialTooltipRetry:
    'Some Epics could not be confirmed. The failed posts were queued and will retry automatically when the connection recovers.',
  // No failure was enqueued (terminal errors, or no answer from the worker) —
  // do NOT promise an automatic retry that will never happen. Re-approving the
  // cycle is the recovery path.
  partialTooltipNoRetry:
    'Some Epics could not be confirmed and were not queued for retry (e.g. permission or not-found errors). Re-approve to try again.',
};

/**
 * Format the row total like the matrix cell: whole when whole, else 1
 * decimal. Exported (Story 7.8, Task 5) so `ManagerMatrix.tsx`'s row-total
 * column and confirm dialogs reuse this SAME shape rather than writing a
 * fourth hours formatter (siblings: `lib/manager-matrix.ts#formatCellHours`,
 * `DrillDownPanel.tsx#formatTotalHours`, `lib/hours.ts#secondsToFixedHoursDisplay`).
 */
export function formatHours(totalSeconds: number): string {
  const hours = secondsToHours(totalSeconds);
  return hours.toFixed(1).replace(/\.0$/, '');
}

/**
 * Format the prior approval `at` for the supersede line. Human-readable and
 * unambiguous (date + time). NEVER throws: a missing or unparseable ISO falls
 * back to the raw string (or a neutral placeholder when entirely absent) so the
 * cosmetic supersede line can never block re-approval (Story 5.7 Dev Notes).
 */
function formatPriorApprovalAt(at: string | undefined): string {
  if (!at) return 'an earlier approval';
  const parsed = parseISO(at);
  if (!isValid(parsed)) return at;
  return format(parsed, 'MMM d, yyyy h:mm a');
}

type ApproveButtonState = 'ready' | 'approving' | 'done' | 'partial';

type Props = {
  /** The report's display name (button label + dialog copy). */
  personName: string;
  /** The report's accountId — the `user` field of every approval payload. */
  user: string;
  /** The current manager's accountId — the `by` field. */
  by: string;
  /** The matrix `cycle` prop, verbatim (checksummed). */
  cycle: string;
  /** Human cycle title for the dialog summary line. */
  cycleTitle: string;
  /** The row's touched-Epic set with per-Epic restrictedCount (the fan-out set). */
  epics: TouchedEpic[];
  /** Row total seconds (dialog "<H>h"). */
  rowSeconds: number;
  /**
   * Row-summed restrictedCount — gates WHETHER the restricted caveat renders
   * (`> 0`). The caveat's own COPY counts Epics, not worklogs (AC6) —
   * derived locally from `epics.filter(e => e.restrictedCount > 0).length`,
   * no new prop needed.
   */
  restrictedCount: number;
  /**
   * A non-empty reason disables the button with a tooltip (5.8 seam: pass a
   * canonicality reason here). When set, the button is disabled regardless of
   * the empty/in-flight checks. Empty/undefined ⇒ enabled (subject to the
   * empty-row and in-flight checks below).
   */
  disabledReason?: string | undefined;
  /**
   * `'approve'` (default) = first approval (primary brand-purple button).
   * `'reapprove'` = the row is dirty; render a SECONDARY-tier "Re-approve
   * <Person>" button and add the supersede line to the confirm dialog. The
   * write path is identical in both modes (Story 5.7).
   */
  mode?: ApproveMode;
  /**
   * The dirty row's existing approval anchor (`at`), used ONLY in `reapprove`
   * mode for the cosmetic supersede dialog line. Missing/unparseable values
   * fall back gracefully and never block re-approval.
   */
  priorApprovalAt?: string | undefined;
  /**
   * Story 7.8 / Task 8: overrides the trigger button's visible text AND
   * accessible name (labels only — the dialog/mutation/state machine are
   * untouched). Used by `DrillDownPanel`'s "Re-approve Nh" / "Approve Nh"
   * action, which reuses this SAME component (mutation + canonicality gate +
   * outbox behaviour) rather than a second write path, but needs a
   * figure-carrying label per AC5 instead of the row button's person-named
   * one.
   */
  triggerLabel?: string | undefined;
  /**
   * Finding 18 (Minor): additive classes for the trigger `<Button>`. Lets
   * `DrillDownPanel` widen the trigger to the footer's full width — D-7.8-18's
   * stated compensation for removing the "Ask Anucha" secondary ("the primary
   * spans the footer's full width") was recorded in a comment but never
   * actually implemented, because `ApproveButton` exposed no way in. The row
   * button passes nothing and keeps its shrink-to-fit width.
   */
  className?: string | undefined;
};

export function ApproveButton({
  personName,
  user,
  by,
  cycle,
  cycleTitle,
  epics,
  rowSeconds,
  restrictedCount,
  disabledReason,
  mode = 'approve',
  className,
  priorApprovalAt,
  triggerLabel,
}: Props): React.ReactElement {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ApproveButtonState>('ready');
  const [confirmedCount, setConfirmedCount] = useState(0);
  // Whether any failed Epic was enqueued for an automatic outbox retry. Drives
  // the partial chip's tooltip so we never promise a retry that won't happen
  // (terminal errors / no SW answer enqueue nothing).
  const [anyEnqueued, setAnyEnqueued] = useState(false);

  const isEmpty = epics.length === 0;
  const total = epics.length;
  // Stable id linking the (aria-disabled) button to its visually-hidden reason
  // node via aria-describedby (AC4 — keyboard/SR-reachable disabled explanation).
  const reasonId = useId();

  // Reset the terminal (`done`/`partial`) state when the approval SUBJECT
  // changes (a different report or a different cycle), so a reused button
  // instance never shows a stale "✓ Done"/partial chip for a subject it never
  // approved. (Story 5.7 re-approve will add an explicit re-enter-ready path;
  // this only resets on an identity change.)
  useEffect(() => {
    setState('ready');
    setConfirmedCount(0);
    setAnyEnqueued(false);
    setOpen(false);
  }, [user, cycle]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await sendRequest('approve-cycle', {
        user,
        cycle,
        by,
        epics: epics.map((e) => ({
          epicKey: e.epicKey,
          restrictedCount: e.restrictedCount,
        })),
      });
      if (res === null) {
        // No answer from the SW — treat every Epic as failed so the row does
        // not falsely flip to Done.
        return { confirmed: [] as string[], failed: epics.map((e) => e.epicKey), enqueued: [] as string[] };
      }
      return res;
    },
    onSuccess: (res) => {
      // Invalidate each CONFIRMED Epic individually so only its cells flip to
      // the server-state "Approved" status. Failed Epics keep prior state.
      for (const epicKey of res.confirmed) {
        void queryClient.invalidateQueries({ queryKey: ['epic-approvals', epicKey] });
      }
      setConfirmedCount(res.confirmed.length);
      setAnyEnqueued(res.enqueued.length > 0);
      setState(res.failed.length === 0 ? 'done' : 'partial');
      log.info('approve.button.settled', {
        confirmed: res.confirmed.length,
        failed: res.failed.length,
        enqueued: res.enqueued.length,
      });
    },
    onError: (e) => {
      // approveCycle never throws and mutationFn maps a null response to a
      // structured result, so this path is a transport failure — nothing was
      // enqueued, so do not promise an automatic retry.
      log.error('approve.button.error', { cause: String(e) });
      setState('partial');
      setConfirmedCount(0);
      setAnyEnqueued(false);
    },
  });

  const handleConfirm = (): void => {
    setOpen(false);
    setState('approving');
    mutation.mutate();
  };

  // --- Done / partial terminal renders ------------------------------------

  if (state === 'done') {
    return (
      <span data-testid="approve-done">
        {/* AC11: the `✓` text glyph is gone — routed through the shared
         * registry (`met` → `CircleCheck` at `text-status-clean`). */}
        <DayStatusIndicator variant="inline" status="met" label={STRINGS.done} />
      </span>
    );
  }

  if (state === 'partial') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-state-warning-subtle px-2 py-0.5 text-xs font-medium text-state-warning"
        data-testid="approve-partial"
        title={anyEnqueued ? STRINGS.partialTooltipRetry : STRINGS.partialTooltipNoRetry}
        role="status"
      >
        {STRINGS.partial(confirmedCount, total)}
        <Info size={12} aria-hidden />
      </span>
    );
  }

  // --- Ready / approving ---------------------------------------------------

  const inFlight = state === 'approving';
  const disabled = isEmpty || inFlight || disabledReason !== undefined;
  // The disabled reason surfaces as a tooltip — never a mystery-disabled button.
  const title = disabledReason ?? (isEmpty ? 'No hours logged this cycle to approve' : undefined);
  // AC4 (Story 6.1): a native `disabled` button is dropped from the tab order
  // and its `title` is never exposed to assistive tech, so the disabled reason
  // becomes a mystery for keyboard / screen-reader users. Instead keep the
  // button focusable and mark it `aria-disabled`, associating the reason via a
  // visually-hidden `aria-describedby` node so it is announced. The click /
  // dialog-open path stays fully inert while disabled (fail-closed — Story 5.8
  // non-canonical Approve must NOT become actionable).
  const hasReason = disabled && title !== undefined;

  // Re-approve is a deliberate corrective action: secondary tier (NOT brand
  // primary), distinct label, and a supersede dialog line. The state machine,
  // mutation, and write payload are identical to first approval.
  const isReapprove = mode === 'reapprove';
  const verb = isReapprove ? 'Re-approve' : 'Approve';
  const label =
    triggerLabel ?? (isReapprove ? STRINGS.reapprove(personName) : STRINGS.approve(personName));
  const hoursDisplay = formatHours(rowSeconds);
  const commitLabel = STRINGS.commit(verb, hoursDisplay);
  const dialogTitle = STRINGS.dialogTitle(verb, personName, cycleTitle);
  // AC6: the caveat's epic count, not the row's worklog count — derived
  // locally from the fan-out set (`restrictedCount` above only gates
  // WHETHER the caveat renders).
  const restrictedEpicCount = epics.filter((e) => e.restrictedCount > 0).length;

  return (
    <>
      <Button
        variant={isReapprove ? 'secondary' : 'primary'}
        size="sm"
        // Keep the control focusable for AT: aria-disabled (not native disabled)
        // so it stays in the tab order and its reason is reachable/announced.
        aria-disabled={disabled || undefined}
        // Mirror native disabled affordances without leaving the tab order:
        // greyed text + not-allowed cursor (pointer activation is also guarded
        // in onClick below so a mouse click cannot open the dialog).
        className={cn(disabled ? 'cursor-not-allowed opacity-60' : undefined, className)}
        onClick={() => {
          // Fail-closed: never open the confirm dialog while disabled (this is
          // the Story 5.8 non-canonical Approve guard — must not regress).
          if (disabled) return;
          setOpen(true);
        }}
        title={title}
        aria-label={label}
        aria-describedby={hasReason ? reasonId : undefined}
        data-testid="approve-button"
      >
        {inFlight ? STRINGS.approving : label}
      </Button>
      {hasReason ? (
        <span id={reasonId} className="sr-only" data-testid="approve-disabled-reason">
          {title}
        </span>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          // This is a commit/destructive dialog: backdrop click must NOT
          // dismiss — only an explicit Cancel (or Esc) cancels.
          onInteractOutside={(e) => e.preventDefault()}
          aria-describedby={undefined}
        >
          <DialogHeader>
            {/* dc.html:609 — `font-chrome text-[16px] font-semibold`. */}
            <DialogTitle className="font-chrome text-[16px] font-semibold">
              {dialogTitle}
            </DialogTitle>
          </DialogHeader>
          {/* dc.html:610 — the figure and epic count in font-chrome font-medium tabular. */}
          <p className="text-sm text-muted" data-testid="approve-dialog-body">
            {STRINGS.dialogBodyLead}{' '}
            <span className="font-chrome font-medium tabular">{hoursDisplay}h</span>{' '}
            <span className="font-chrome font-medium">{STRINGS.dialogBodyEpics(total)}</span>{' '}
            {STRINGS.dialogBodyTail(cycleTitle)}
          </p>
          {isReapprove ? (
            <p className="text-sm text-neutral-700" data-testid="approve-supersede-line">
              {STRINGS.supersede(formatPriorApprovalAt(priorApprovalAt))}
            </p>
          ) : null}
          {restrictedCount > 0 ? (
            // dc.html:611-613 — the caveat box carries its own border + sunk
            // fill; the EyeOff registry icon + `text-faint` (matching
            // dc.html's #6B6B72) carry the signal, NOT amber (Task 9: amber
            // is reserved for the truncation caveat below — AC8 permits
            // amber here too, but the design source uses muted grey, not
            // warning colour, for a visibility caveat).
            <div
              className="flex items-start gap-2 rounded-md border border-border bg-surface-sunk px-[10px] py-2"
              data-testid="approve-restricted-line"
            >
              <DayStatusIndicator
                variant="inline"
                status="restricted"
                label={STRINGS.restrictedCaveat(restrictedEpicCount)}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {STRINGS.cancel}
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirm}>
              {commitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
