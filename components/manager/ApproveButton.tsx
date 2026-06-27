import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

const STRINGS = {
  approve: (person: string) => `Approve ${person}`,
  approveShort: 'Approve',
  cancel: 'Cancel',
  done: '✓ Done',
  approving: 'Approving…',
  summary: (person: string, cycleTitle: string, hours: string, n: number) =>
    `Approve ${person}'s ${cycleTitle}: ${hours}h across ${n} ${n === 1 ? 'Epic' : 'Epics'}`,
  restricted: (n: number) =>
    `⚠ ${n} restricted-visibility worklog${n === 1 ? '' : 's'} excluded from your view; ` +
    `${n === 1 ? 'its' : 'their'} count will be captured in the approval metadata for audit.`,
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

/** Format the row total like the matrix cell: whole when whole, else 1 decimal. */
function formatHours(totalSeconds: number): string {
  const hours = secondsToHours(totalSeconds);
  return hours.toFixed(1).replace(/\.0$/, '');
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
  /** Row-summed restrictedCount (dialog "⚠ N restricted" line). */
  restrictedCount: number;
  /**
   * A non-empty reason disables the button with a tooltip (5.8 seam: pass a
   * canonicality reason here). When set, the button is disabled regardless of
   * the empty/in-flight checks. Empty/undefined ⇒ enabled (subject to the
   * empty-row and in-flight checks below).
   */
  disabledReason?: string | undefined;
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
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-state-success"
        data-testid="approve-done"
      >
        <Check size={14} aria-hidden />
        {STRINGS.done}
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

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={title}
        aria-label={STRINGS.approve(personName)}
        data-testid="approve-button"
      >
        {inFlight ? STRINGS.approving : STRINGS.approve(personName)}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          // This is a commit/destructive dialog: backdrop click must NOT
          // dismiss — only an explicit Cancel (or Esc) cancels.
          onInteractOutside={(e) => e.preventDefault()}
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>
              {STRINGS.summary(personName, cycleTitle, formatHours(rowSeconds), total)}
            </DialogTitle>
          </DialogHeader>
          {restrictedCount > 0 ? (
            <p className="text-sm text-state-warning" data-testid="approve-restricted-line">
              {STRINGS.restricted(restrictedCount)}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {STRINGS.cancel}
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirm}>
              {STRINGS.approveShort}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
