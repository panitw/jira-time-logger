import { useMutation } from '@tanstack/react-query';
import { Pencil, Trash2, Undo2, Clock, X, XCircle, RefreshCw } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { textToAdf } from '@/lib/adf';
import { currentCycleRange, isWithinCycle } from '@/lib/cycle-range';
import { isTextEntryElement } from '@/lib/dom/text-entry';
import {
  parseHours,
  hoursToSeconds,
  secondsToHoursDisplay,
  MAX_HOURS_PER_ENTRY,
} from '@/lib/hours';
import { updateWorklog, deleteWorklog } from '@/lib/jira-client';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import type { JiraError } from '@/lib/result';
import {
  enqueue as enqueueOutbox,
  outboxItem,
  remove as removeOutbox,
  update as updateOutbox,
  runOutboxRetryPass,
  type OutboxEntry,
} from '@/lib/storage/outbox';
import { approvalCycleItem } from '@/lib/storage/settings';
import { formatStartedISO, formatDateForInput } from '@/lib/worklog-date';

/**
 * "Logged today" (Story 7.5, AC3/AC4/AC5/AC6) — rebuilt to the KKP list-row
 * anatomy and to a DEFERRED, undoable delete (D-7.5-18, D-7.5-14). See the
 * story's D-7.5-18 for the full reasoning: a Jira worklog DELETE is
 * irreversible, so "undo" must cancel a timer with zero Jira traffic rather
 * than delete-then-compensate.
 */

const STRINGS = {
  heading: 'Logged today',
  // AC5 — exact, verbatim (D-7.5's own audit: the old copy referenced a
  // ticket picker that no longer exists below this list).
  emptyLine1: 'Nothing on the clock yet today.',
  emptyLine2: 'Add hours above, or search for a ticket.',
  editLabel: (key: string, hours: string) => `Edit ${key}, ${hours}`,
  deleteLabel: (key: string, hours: string) => `Delete ${key}, ${hours}`,
  save: 'Save',
  cancel: 'Cancel',
  hoursLabel: 'Hours',
  hoursPlaceholder: '2.5h, 2h 30m, 2:30…',
  commentLabel: 'Comment',
  commentPlaceholder: 'Optional comment…',
  today: 'Today',
  yesterday: 'Yesterday',
  pickDate: 'Pick date',
  overLimitError: 'Hours per entry can’t exceed 24. Split into multiple entries if needed.',
  discardConfirm: 'Discard this pending write?',
  dismiss: 'Dismiss',
  retryNow: 'Retry now',
  discard: 'Discard',
  pending: 'Pending — will retry',
  failedPrefix: 'Couldn’t post after multiple tries — ',
  failedReason: {
    network: 'no connection',
    'rate-limited': 'the server was busy',
    forbidden: 'you don’t have permission',
    'not-found': 'the worklog no longer exists',
    'parse-error': 'an unexpected response',
    'auth-expired': 'your session expired',
  } as Record<string, string>,
  failedReasonDefault: 'an unexpected error',
  editError: {
    forbidden: 'Couldn’t update — you don’t have permission',
    'not-found': 'Couldn’t update — worklog no longer exists',
    'parse-error': 'Couldn’t update — unexpected response',
  } as Record<string, string>,
  deleteError: {
    forbidden: 'Couldn’t delete — you don’t have permission',
    'not-found': 'Couldn’t delete — worklog no longer exists',
    'parse-error': 'Couldn’t delete — unexpected response',
  } as Record<string, string>,
  undo: 'Undo',
  deletedNotice: (key: string) => `${key} deleted.`,
};

/** D-7.5-14 (orchestrator decision): the undo window. A named, exported
 * constant — never an inline literal — pinned by a fake-timer test. Longer
 * than `TOAST_DISMISS_MS` (4000, `TodayView.tsx`) because this one guards a
 * destructive, irreversible action rather than dismissing a message; the
 * delete is deferred (not optimistic), so a longer window costs nothing but
 * a slightly later write. */
export const UNDO_WINDOW_MS = 5000;

export type LoggedEntry = {
  key: string;
  summary: string;
  hoursDisplay: string;
  started: string;
  seconds: number;
  worklogId: string;
  comment?: string | undefined;
};

export type EditPatch = {
  hoursDisplay: string;
  seconds: number;
  started: string;
  comment?: string | undefined;
};

type LoggedTodayProps = {
  entries: LoggedEntry[];
  onEdited?: ((worklogId: string, patch: EditPatch) => void) | undefined;
  /** Called EXACTLY ONCE per entry, at commit (undo-window expiry or a
   * forced early commit) — never at the moment the user clicks delete. This
   * is what invokes the existing ownership routing (`TodayView.handleAnyDeleted`
   * / `App.tsx.handleExternalEntryDeleted`) exactly once, per D-7.5-18. */
  onDeleted?: ((worklogId: string) => void) | undefined;
  /** Fires whenever the single pending-deletion id changes (or clears, as
   * `null`) — the owner(s) of the various entry lists (`TodayView`'s own
   * `loggedEntries`, and `App.tsx`'s `ptoEntries`/`resumeEntries`/
   * `searchEntries`) use this to exclude the pending entry from their OWN
   * seconds derivation, so the chrome header total drops immediately when
   * the row hides and returns on undo (D-7.5-18's "easiest thing to get
   * half-right"). */
  onPendingDeletionChange?: ((worklogId: string | null) => void) | undefined;
};

/**
 * Outbox seam (Story 2.7 — durable queue).
 *
 * When an edit/delete fails transiently (`network` / `rate-limited`), the write
 * is appended to the durable outbox (`lib/storage/outbox.ts`) so the
 * service-worker `outbox-retry` alarm can replay it. The "Pending — will retry"
 * chip rendered by the caller stays until the entry drains. Fire-and-forget:
 * enqueue failures are logged but never block the row.
 */
function enqueueFailedWorklogMutation(info: {
  issueKey: string;
  worklogId: string;
  kind: 'edit' | 'delete';
  resultKind: string;
  editBody?: { timeSpentSeconds: number; started: string; comment?: unknown };
}): void {
  const endpoint =
    `rest/api/3/issue/${encodeURIComponent(info.issueKey)}` +
    `/worklog/${encodeURIComponent(info.worklogId)}`;
  void enqueueOutbox({
    kind: info.kind === 'edit' ? 'put' : 'delete',
    endpoint,
    issueKey: info.issueKey,
    worklogId: info.worklogId,
    ...(info.kind === 'edit' && info.editBody ? { body: info.editBody } : {}),
  }).catch((e) => {
    log.error('outbox.enqueue.failed', {
      kind: info.kind,
      issueKey: info.issueKey,
      cause: String(e),
    });
  });
}

type ValidationResult =
  | { kind: 'empty' }
  | { kind: 'valid'; seconds: number }
  | { kind: 'unparseable' }
  | { kind: 'over-limit' };

function validateHours(input: string): ValidationResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'empty' };
  const parsed = parseHours(trimmed);
  if (parsed.kind !== 'ok') return { kind: 'unparseable' };
  if (parsed.hours > MAX_HOURS_PER_ENTRY) return { kind: 'over-limit' };
  return { kind: 'valid', seconds: hoursToSeconds(parsed.hours) };
}

type PendingDeletion = {
  entry: LoggedEntry;
  timeoutId: ReturnType<typeof setTimeout>;
};

type DeleteOutcomeChip = {
  worklogId: string;
  kind: 'persistent' | 'pending';
  message: string;
};

export function LoggedToday({
  entries,
  onEdited,
  onDeleted,
  onPendingDeletionChange,
}: LoggedTodayProps): React.ReactElement {
  const [pending, setPending] = useState<PendingDeletion | null>(null);
  const [deleteOutcome, setDeleteOutcome] = useState<DeleteOutcomeChip | null>(null);
  const pendingRef = useRef<PendingDeletion | null>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);

  // Review Finding 1 (Blocker) / Finding 4 (Minor), D-7.5-18: worklog ids
  // whose DELETE has been DISPATCHED (mutation in flight, or irrevocably
  // handed to the outbox by `flush()`) but has not yet settled. Distinct
  // from `pending` (the undo-window countdown for the MOST RECENT entry)
  // because a forced "commit the previous entry immediately" (see
  // `requestDelete`) can leave an earlier entry's DELETE in flight after
  // `pending` has already moved on to a new entry — that entry must stay
  // hidden and its Undo must stay inert too, or it re-appears with live
  // buttons for the whole Jira round-trip (the exact bug Finding 1 proved
  // with a never-settling promise: the row came back, was clickable again,
  // and a second click issued a DUPLICATE irreversible DELETE).
  const [committingIds, setCommittingIdsState] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const committingIdsRef = useRef<ReadonlySet<string>>(committingIds);
  const setCommittingIds = useCallback(
    (updater: (prev: ReadonlySet<string>) => ReadonlySet<string>) => {
      setCommittingIdsState((prev) => {
        const next = updater(prev);
        committingIdsRef.current = next;
        return next;
      });
    },
    [],
  );

  const deleteMutation = useMutation({
    mutationFn: async (vars: { issueKey: string; worklogId: string }) =>
      deleteWorklog(vars.issueKey, vars.worklogId),
  });

  const setPendingBoth = useCallback((next: PendingDeletion | null) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  // Report the single pending id up to the owner(s) so THEIR seconds
  // derivation can exclude it too (D-7.5-18).
  useEffect(() => {
    onPendingDeletionChange?.(pending?.entry.worklogId ?? null);
  }, [pending, onPendingDeletionChange]);

  // Move focus to the undo affordance the moment it appears (D-7.5-20) — the
  // delete button that was just clicked is gone with its row, so focus would
  // otherwise fall back to <body>. Mirrors the reverse focus-steal guard
  // used elsewhere in the popup (`ResumeCard.tsx`/`SearchPanel.tsx`,
  // D-7.4-17): only reclaim focus when it would otherwise be lost at
  // <body> — never yank it away from something the user has ALREADY
  // explicitly focused (e.g. mid-edit on a different row).
  useEffect(() => {
    if (!pending) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    undoButtonRef.current?.focus();
  }, [pending]);

  // Review Finding 1 (Blocker): mark `worklogId` as "committing" BEFORE the
  // async mutation is dispatched, and only clear it once the mutation
  // SETTLES (`onSuccess`/`onError`) — never eagerly. This is what keeps the
  // row out of `visibleEntries` for the entire Jira round-trip instead of
  // only the undo window, and it is what makes a second DELETE of the same
  // worklog structurally impossible: there is no button to click on a row
  // that was never re-rendered back into existence.
  const commitDeletion = useCallback(
    (toCommit: PendingDeletion) => {
      clearTimeout(toCommit.timeoutId);
      const worklogId = toCommit.entry.worklogId;
      setCommittingIds((prev) => {
        if (prev.has(worklogId)) return prev;
        const next = new Set(prev);
        next.add(worklogId);
        return next;
      });
      const settle = (): void => {
        setCommittingIds((prev) => {
          if (!prev.has(worklogId)) return prev;
          const next = new Set(prev);
          next.delete(worklogId);
          return next;
        });
        // Only clear `pending` if it still points at THIS entry — a second,
        // later `requestDelete` may already have moved `pending` on to a
        // different entry (the "second delete commits the first
        // immediately" path), in which case that later entry's own
        // pending/undo state must not be disturbed here.
        if (pendingRef.current?.entry.worklogId === worklogId) {
          setPendingBoth(null);
        }
      };
      deleteMutation.mutate(
        { issueKey: toCommit.entry.key, worklogId },
        {
          onSuccess: (result) => {
            settle();
            if (result.kind === 'ok') {
              log.info('worklog.deleted', {
                key: toCommit.entry.key,
                worklogId: toCommit.entry.worklogId,
              });
              void sendMessage('badge-update', { hoursMissing: 0 });
              onDeleted?.(toCommit.entry.worklogId);
            } else if (result.kind === 'network' || result.kind === 'rate-limited') {
              log.warn('worklog.delete.failed', {
                key: toCommit.entry.key,
                kind: result.kind,
              });
              enqueueFailedWorklogMutation({
                issueKey: toCommit.entry.key,
                worklogId: toCommit.entry.worklogId,
                kind: 'delete',
                resultKind: result.kind,
              });
              // The row re-appears (it was never actually deleted) with the
              // existing "Pending — will retry" treatment.
              setDeleteOutcome({
                worklogId: toCommit.entry.worklogId,
                kind: 'pending',
                message: STRINGS.pending,
              });
            } else {
              log.warn('worklog.delete.failed', {
                key: toCommit.entry.key,
                kind: result.kind,
              });
              // D-7.5-18: a write Jira actually REFUSED — the row re-appears
              // with the persistent red chip. The only legitimate red here.
              const message = STRINGS.deleteError[result.kind] ?? STRINGS.deleteError['parse-error']!;
              setDeleteOutcome({
                worklogId: toCommit.entry.worklogId,
                kind: 'persistent',
                message,
              });
            }
          },
          onError: (e) => {
            settle();
            log.error('worklog.delete.error', {
              key: toCommit.entry.key,
              error: String(e),
            });
            setDeleteOutcome({
              worklogId: toCommit.entry.worklogId,
              kind: 'persistent',
              message: STRINGS.deleteError['parse-error']!,
            });
          },
        },
      );
    },
    [deleteMutation, onDeleted, setCommittingIds, setPendingBoth],
  );

  // D-7.5-18: at most ONE pending delete at a time. Requesting a second one
  // commits the first immediately, then starts the new window. The first
  // entry's own DELETE is now tracked via `committingIds` (set synchronously
  // inside `commitDeletion`, in the same tick as `setPendingBoth` below —
  // React 18 batches both, so there is no render where neither excludes it),
  // so it stays hidden and its Undo stays inert for as long as its own
  // mutation is in flight, even though `pending` has already moved on.
  const requestDelete = useCallback(
    (entry: LoggedEntry) => {
      setDeleteOutcome(null);
      const prev = pendingRef.current;
      if (prev) commitDeletion(prev);
      const timeoutId = setTimeout(() => {
        const current = pendingRef.current;
        if (current?.entry.worklogId === entry.worklogId) {
          commitDeletion(current);
        }
      }, UNDO_WINDOW_MS);
      setPendingBoth({ entry, timeoutId });
    },
    [commitDeletion, setPendingBoth],
  );

  // Undo — cancels the timer. Nothing was ever written; zero Jira traffic.
  // Review Finding 1 / Finding 4: a no-op once the entry is `committing` —
  // once its DELETE has been dispatched (undo window expired) or handed to
  // the outbox by `flush()`, there is nothing left to cancel, and clearing
  // `pending` here would let the row re-appear mid-flight (Finding 1) or let
  // Undo contradict a delete already queued for the service worker to finish
  // (Finding 4's "silent data-integrity lie", D-7.5-18).
  const cancelPendingDeletion = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    if (committingIdsRef.current.has(current.entry.worklogId)) return;
    clearTimeout(current.timeoutId);
    setPendingBoth(null);
  }, [setPendingBoth]);

  // D-7.5-20: `⌘/Ctrl+Z` triggers undo — but ONLY while the affordance
  // exists (bound/unbound with `pending`) and ONLY outside text-entry
  // elements, since `⌘Z` is meaningful native-undo everywhere else in the
  // popup (the resume card's hour input, the search field, an in-progress
  // edit). This is the INVERSE default of Story 7.4's `/` handler — see
  // `lib/dom/text-entry.ts` for why `SearchPanel.tsx`'s own predicate is
  // deliberately NOT reused here.
  useEffect(() => {
    if (!pending) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== 'z' || e.shiftKey) return; // ⇧⌘Z is redo — untouched.
      if (isTextEntryElement(document.activeElement)) return; // native undo wins.
      e.preventDefault();
      cancelPendingDeletion();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pending, cancelPendingDeletion]);

  // D-7.5-18: if the popup closes while a delete is pending, do NOT race an
  // in-flight `fetch` from a teardown handler (not guaranteed to complete) —
  // durably enqueue it to the Story 2.7 outbox instead, exactly like a
  // transient commit failure does.
  const flushedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (pending) flushedForRef.current = null;
  }, [pending]);
  useEffect(() => {
    function flush(): void {
      const current = pendingRef.current;
      if (!current || flushedForRef.current === current.entry.worklogId) return;
      flushedForRef.current = current.entry.worklogId;
      clearTimeout(current.timeoutId);
      enqueueFailedWorklogMutation({
        issueKey: current.entry.key,
        worklogId: current.entry.worklogId,
        kind: 'delete',
        resultKind: 'teardown',
      });
      // Review Finding 4 (Minor), D-7.5-18: the delete is now irrevocably
      // queued in the durable outbox — mark it `committing` so the row stays
      // hidden and `cancelPendingDeletion` becomes a no-op if the popup ever
      // survives being hidden (see the decision log's finisher addendum to
      // D-7.5-18). We deliberately do NOT clear `pending` here: doing so
      // would let the row re-appear (with live buttons) while the outbox
      // entry is still queued, which is the same class of bug as Finding 1.
      setCommittingIds((prev) => {
        if (prev.has(current.entry.worklogId)) return prev;
        const next = new Set(prev);
        next.add(current.entry.worklogId);
        return next;
      });
    }
    function onVisibilityChange(): void {
      if (document.visibilityState === 'hidden') flush();
    }
    // `pagehide` fires on `window`, not `document`.
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [pending, setCommittingIds]);

  // Review Finding 1 (Blocker): a row stays out of the list for the ENTIRE
  // in-flight period — the undo window (`pending`) AND the subsequent async
  // DELETE / outbox hand-off (`committingIds`) — not just the undo window.
  const visibleEntries = entries.filter(
    (e) => e.worklogId !== pending?.entry.worklogId && !committingIds.has(e.worklogId),
  );

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-eyebrow uppercase text-faint">{STRINGS.heading}</span>
        {visibleEntries.length > 0 && (
          <span className="tabular rounded-full bg-primary-soft px-[7px] py-px text-eyebrow text-primary">
            {visibleEntries.length}
          </span>
        )}
        <span aria-hidden="true" className="h-px flex-1 bg-border-faint" />
      </div>

      {visibleEntries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-body-sm text-muted">{STRINGS.emptyLine1}</p>
          <p className="text-body-sm text-faint">{STRINGS.emptyLine2}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-hairline">
          {visibleEntries.map((entry) => (
            <WorklogRow
              key={entry.worklogId}
              entry={entry}
              onEdited={onEdited}
              onRequestDelete={requestDelete}
              deleteOutcome={
                deleteOutcome?.worklogId === entry.worklogId ? deleteOutcome : null
              }
            />
          ))}
        </div>
      )}

      {pending && (
        <div
          role="status"
          aria-live="polite"
          className="mt-1 flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-[11px] py-[9px]"
        >
          <span className="text-body-sm text-muted">
            {STRINGS.deletedNotice(pending.entry.key)}
          </span>
          {/* Review Finding 1 / Finding 4, D-7.5-18: once this entry's own
              DELETE has been dispatched (undo window expired) or handed to
              the outbox (`flush()`), there is nothing left to cancel — hide
              the affordance rather than leave a live-looking button whose
              click does nothing. */}
          {!committingIds.has(pending.entry.worklogId) && (
            <button
              ref={undoButtonRef}
              type="button"
              onClick={cancelPendingDeletion}
              className="flex items-center gap-1 text-body-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-focus"
            >
              <Undo2 className="h-[13px] w-[13px]" aria-hidden="true" />
              {STRINGS.undo}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type RowMode = 'idle' | 'editing';

type ErrorChip =
  | { kind: 'persistent'; message: string }
  | { kind: 'pending'; message: string };

type WorklogRowProps = {
  entry: LoggedEntry;
  onEdited?: ((worklogId: string, patch: EditPatch) => void) | undefined;
  onRequestDelete: (entry: LoggedEntry) => void;
  /** Seeded onto this (freshly re-rendered) row when its just-committed
   * delete did not actually succeed — see `LoggedToday.commitDeletion`. */
  deleteOutcome: DeleteOutcomeChip | null;
};

function WorklogRow({
  entry,
  onEdited,
  onRequestDelete,
  deleteOutcome,
}: WorklogRowProps): React.ReactElement {
  const [mode, setMode] = useState<RowMode>('idle');
  const [errorChip, setErrorChip] = useState<ErrorChip | null>(null);

  // Seed the chip from a just-committed (and not actually successful)
  // delete outcome — this row was excluded from the list while pending and
  // has just been reinserted, so it mounts fresh with no local state of its
  // own to carry the outcome.
  useEffect(() => {
    if (deleteOutcome) {
      setErrorChip({ kind: deleteOutcome.kind, message: deleteOutcome.message });
    }
  }, [deleteOutcome]);

  // ---- Failed-outbox-entry tracking (AC5, Story 2.7) ----
  // A put/delete that exhausted retries (or hit a non-retryable error) lives in
  // the durable outbox as `status: 'failed'`. We surface it on the matching row
  // with a danger chip + Retry-now / Discard.
  const [failedEntry, setFailedEntry] = useState<OutboxEntry | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const discardConfirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    const sync = async (): Promise<void> => {
      try {
        const all = await outboxItem.getValue();
        const match = all.find(
          (e) =>
            e.status === 'failed' &&
            e.issueKey === entry.key &&
            e.worklogId === entry.worklogId &&
            (e.kind === 'put' || e.kind === 'delete'),
        );
        if (active) setFailedEntry(match ?? null);
      } catch {
        if (active) setFailedEntry(null);
      }
    };
    void sync();
    const unwatch = outboxItem.watch(() => {
      void sync();
    });
    return () => {
      active = false;
      unwatch();
    };
  }, [entry.worklogId, entry.key]);

  const failedReason = failedEntry
    ? (STRINGS.failedReason[failedEntry.lastError ?? ''] ?? STRINGS.failedReasonDefault)
    : '';

  const handleRetryNow = useCallback(async () => {
    if (!failedEntry) return;
    // Reset to pending with a fresh attempt budget, then trigger an immediate
    // drain pass (the SW alarm would otherwise wait up to 60s).
    await updateOutbox(failedEntry.id, {
      status: 'pending',
      attemptCount: 0,
    });
    setFailedEntry(null);
    setErrorChip({ kind: 'pending', message: STRINGS.pending });
    try {
      await runOutboxRetryPass();
    } catch (e) {
      log.error('outbox.retry.error', { worklogId: entry.worklogId, cause: String(e) });
    }
  }, [failedEntry, entry.worklogId]);

  const handleDiscard = useCallback(async () => {
    if (!failedEntry) return;
    await removeOutbox(failedEntry.id);
    setConfirmingDiscard(false);
    setFailedEntry(null);
  }, [failedEntry]);

  // Esc reverts the Discard confirmation (never discards).
  useEffect(() => {
    if (!confirmingDiscard) return;
    discardConfirmRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setConfirmingDiscard(false);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [confirmingDiscard]);

  // Edit-mode field state.
  const [hoursInput, setHoursInput] = useState('');
  const [commentInput, setCommentInput] = useState(entry.comment ?? '');
  const [dateSel, setDateSel] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(formatDateForInput(new Date()));
  const [cycle, setCycle] = useState<string>('calendar-month');

  const hoursInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void approvalCycleItem.getValue().then(setCycle);
  }, []);

  // Focus hours input on entering edit mode.
  useEffect(() => {
    if (mode === 'editing') hoursInputRef.current?.focus();
  }, [mode]);

  // Esc reverts edit mode.
  useEffect(() => {
    if (mode !== 'editing') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMode('idle');
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [mode]);

  // ---- Mutations ----
  const editMutation = useMutation({
    mutationFn: async (vars: {
      seconds: number;
      started: string;
      comment: string;
      hoursDisplay: string;
      selectedDate: string;
    }) => {
      const body: { timeSpentSeconds: number; started: string; comment?: unknown } = {
        timeSpentSeconds: vars.seconds,
        started: vars.started,
      };
      if (vars.comment.trim()) {
        body.comment = textToAdf(vars.comment.trim());
      }
      const result = await updateWorklog(entry.key, entry.worklogId, body);
      return { result, vars };
    },
  });

  const handleEditFailure = useCallback(
    (
      err: JiraError,
      editBody?: { timeSpentSeconds: number; started: string; comment?: unknown },
    ) => {
      if (err.kind === 'network' || err.kind === 'rate-limited') {
        enqueueFailedWorklogMutation({
          issueKey: entry.key,
          worklogId: entry.worklogId,
          kind: 'edit',
          resultKind: err.kind,
          ...(editBody ? { editBody } : {}),
        });
        setErrorChip({ kind: 'pending', message: STRINGS.pending });
      } else {
        const message = STRINGS.editError[err.kind] ?? STRINGS.editError['parse-error']!;
        setErrorChip({ kind: 'persistent', message });
      }
    },
    [entry.key, entry.worklogId],
  );

  const handleSaveEdit = useCallback(() => {
    if (editMutation.isPending) return;
    const validation = validateHours(hoursInput);
    if (validation.kind !== 'valid') return;

    const selectedDate =
      dateSel === 'today'
        ? formatDateForInput(new Date())
        : dateSel === 'yesterday'
          ? formatDateForInput(new Date(Date.now() - 86_400_000))
          : customDate;

    setErrorChip(null);
    editMutation.mutate(
      {
        seconds: validation.seconds,
        started: formatStartedISO(selectedDate),
        comment: commentInput,
        hoursDisplay: secondsToHoursDisplay(validation.seconds),
        selectedDate,
      },
      {
        onSuccess: ({ result, vars }) => {
          if (result.kind === 'ok') {
            log.info('worklog.edited', { key: entry.key, worklogId: entry.worklogId });
            void sendMessage('badge-update', { hoursMissing: 0 });
            onEdited?.(entry.worklogId, {
              hoursDisplay: vars.hoursDisplay,
              seconds: vars.seconds,
              started: vars.selectedDate,
              comment: vars.comment.trim() || undefined,
            });
            setMode('idle');
          } else {
            log.warn('worklog.edit.failed', { key: entry.key, kind: result.kind });
            setMode('idle');
            const editBody: {
              timeSpentSeconds: number;
              started: string;
              comment?: unknown;
            } = {
              timeSpentSeconds: vars.seconds,
              started: vars.started,
            };
            if (vars.comment.trim()) {
              editBody.comment = textToAdf(vars.comment.trim());
            }
            handleEditFailure(result, editBody);
          }
        },
        onError: (e) => {
          log.error('worklog.edit.error', { key: entry.key, error: String(e) });
          setMode('idle');
          setErrorChip({ kind: 'persistent', message: STRINGS.editError['parse-error']! });
        },
      },
    );
  }, [
    editMutation,
    hoursInput,
    dateSel,
    customDate,
    commentInput,
    entry.key,
    entry.worklogId,
    onEdited,
    handleEditFailure,
  ]);

  const startEdit = useCallback(() => {
    // Seed the edit fields from the current entry. Use the exact stored seconds
    // (not the lossy display string) so an unchanged Save round-trips to the
    // same duration.
    setHoursInput(secondsToHoursDisplay(entry.seconds));
    setCommentInput(entry.comment ?? '');
    // Seed the date selector from the entry's actual `started` date so editing
    // hours/comment alone does not silently move the worklog to today.
    const startedDate = new Date(entry.started);
    const startedDateStr = Number.isNaN(startedDate.getTime())
      ? formatDateForInput(new Date())
      : formatDateForInput(startedDate);
    const todayStr = formatDateForInput(new Date());
    const yesterdayStr = formatDateForInput(new Date(Date.now() - 86_400_000));
    if (startedDateStr === todayStr) {
      setDateSel('today');
    } else if (startedDateStr === yesterdayStr) {
      setDateSel('yesterday');
    } else {
      setDateSel('custom');
    }
    setCustomDate(startedDateStr);
    setMode('editing');
  }, [entry.seconds, entry.comment, entry.started]);

  const cancelEdit = useCallback(() => {
    setMode('idle');
  }, []);

  // ---- Render: editing mode ----
  if (mode === 'editing') {
    const validation = validateHours(hoursInput);
    const isValid = validation.kind === 'valid';
    const isError = validation.kind === 'unparseable' || validation.kind === 'over-limit';
    const borderClass =
      validation.kind === 'empty'
        ? 'border-border'
        : isError
          ? 'border-state-danger'
          : 'border-state-success';

    const cycleRange = currentCycleRange(cycle);
    const yesterdayInCycle = isWithinCycle(new Date(Date.now() - 86_400_000), cycle);
    const saveDisabled = !isValid || editMutation.isPending;

    return (
      <div
        className="border-b border-border-faint px-[11px] py-2 last:border-b-0"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveEdit();
          }
          if (e.key === 'Escape') {
            cancelEdit();
          }
        }}
      >
        <div className="flex items-center gap-2">
          <span className="tabular font-chrome text-body-sm font-medium text-primary shrink-0">
            {entry.key}
          </span>
          <span className="truncate text-body-sm text-muted flex-1">{entry.summary}</span>
        </div>

        <div className="mt-2 flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-700 mb-0.5">
              {STRINGS.hoursLabel}
            </label>
            <input
              ref={hoursInputRef}
              type="text"
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              placeholder={STRINGS.hoursPlaceholder}
              aria-label={STRINGS.hoursLabel}
              className={`flex h-9 w-full rounded-md border-2 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${borderClass}`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-0.5">
              {' '}
            </label>
            <select
              value={dateSel}
              onChange={(e) =>
                setDateSel(e.target.value as 'today' | 'yesterday' | 'custom')
              }
              className="h-9 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm"
              aria-label="Date"
            >
              <option value="today">{STRINGS.today}</option>
              {yesterdayInCycle && <option value="yesterday">{STRINGS.yesterday}</option>}
              <option value="custom">{STRINGS.pickDate}</option>
            </select>
          </div>
        </div>

        {dateSel === 'custom' && (
          <div className="mt-2">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              min={formatDateForInput(cycleRange.start)}
              max={formatDateForInput(cycleRange.end)}
              className="h-9 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm"
              aria-label="Pick date"
            />
          </div>
        )}

        <div className="mt-2">
          <label className="block text-xs font-medium text-neutral-700 mb-0.5">
            {STRINGS.commentLabel}
          </label>
          <input
            type="text"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder={STRINGS.commentPlaceholder}
            aria-label={STRINGS.commentLabel}
            className="flex h-9 w-full rounded-md border border-neutral-200 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          />
        </div>

        {validation.kind === 'over-limit' && (
          <p className="mt-1 text-xs text-state-danger font-medium">
            {STRINGS.overLimitError}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            aria-label={STRINGS.save}
            onClick={handleSaveEdit}
            disabled={saveDisabled}
          >
            {editMutation.isPending ? (
              <span className="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              STRINGS.save
            )}
          </Button>
          <Button variant="secondary" size="sm" onClick={cancelEdit}>
            {STRINGS.cancel}
          </Button>
        </div>
      </div>
    );
  }

  // ---- Render: normal row (idle) ----
  return (
    <div className="group relative flex h-[52px] items-center gap-[10px] border-b border-border-faint px-[11px] py-[9px] last:border-b-0 hover:bg-background focus-within:ring-focus motion-safe:animate-slide-in">
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="tabular font-chrome text-body-sm font-medium text-primary">
          {entry.key}
        </span>
        <span className="truncate text-body-sm text-muted">{entry.summary}</span>
      </div>
      <span className="tabular font-chrome shrink-0 text-body-sm text-foreground">
        {entry.hoursDisplay}
      </span>

      <button
        type="button"
        aria-label={STRINGS.editLabel(entry.key, entry.hoursDisplay)}
        onClick={startEdit}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-focus focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Pencil className="h-[13px] w-[13px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={STRINGS.deleteLabel(entry.key, entry.hoursDisplay)}
        onClick={() => onRequestDelete(entry)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-error-soft hover:text-state-danger focus-visible:outline-none focus-visible:ring-focus focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Trash2 className="h-[13px] w-[13px]" aria-hidden="true" />
      </button>

      {failedEntry ? (
        <div
          role="alert"
          aria-live="assertive"
          className="absolute right-2 top-full z-10 mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-state-danger font-medium"
        >
          <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {STRINGS.failedPrefix}
            {failedReason}
          </span>
          {confirmingDiscard ? (
            <span
              className="ml-1 flex items-center gap-1"
              role="group"
              aria-label={STRINGS.discardConfirm}
            >
              <span className="text-neutral-700">{STRINGS.discardConfirm}</span>
              <Button
                ref={discardConfirmRef}
                variant="secondary"
                size="sm"
                onClick={() => setConfirmingDiscard(false)}
              >
                {STRINGS.cancel}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-state-danger"
                aria-label={STRINGS.discard}
                onClick={() => void handleDiscard()}
              >
                {STRINGS.discard}
              </Button>
            </span>
          ) : (
            <>
              <button
                type="button"
                aria-label={STRINGS.retryNow}
                onClick={() => void handleRetryNow()}
                className="ml-1 inline-flex items-center gap-1 rounded text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                {STRINGS.retryNow}
              </button>
              <button
                type="button"
                aria-label={STRINGS.discard}
                onClick={() => setConfirmingDiscard(true)}
                className="ml-1 rounded text-state-danger hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {STRINGS.discard}
              </button>
            </>
          )}
        </div>
      ) : (
        errorChip && (
          <div
            role="alert"
            aria-live="assertive"
            className={`absolute right-2 top-full z-10 mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
              errorChip.kind === 'pending'
                ? 'bg-state-info-subtle text-neutral-700'
                : 'text-state-danger font-medium'
            }`}
          >
            {errorChip.kind === 'pending' && (
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
            <span>{errorChip.message}</span>
            <button
              type="button"
              aria-label={STRINGS.dismiss}
              onClick={() => setErrorChip(null)}
              className="ml-1 rounded text-neutral-500 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        )
      )}
    </div>
  );
}
