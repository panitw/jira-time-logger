import { Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DayStatusIndicator } from '@/components/shared/DayStatusIndicator';
import { enqueueFailedWorklogMutation, UNDO_WINDOW_MS } from '@/components/today/LoggedToday';
import type { TimeOffWorklogRef } from '@/hooks/useTimeOffToday';
import { secondsToHoursDisplay } from '@/lib/hours';
import { deleteWorklog } from '@/lib/jira-client';

/**
 * The settled time-off card (Story 7.9, AC4).
 *
 * "Undo time off" removes ALL of today's time-off worklogs — D-7.9-13
 * (OWNER decision) — via the SAME deferred-delete-with-undo mechanism Story
 * 7.5 already built for "Logged today" (`UNDO_WINDOW_MS`, imported from
 * `LoggedToday.tsx` rather than a second copy): the card clears immediately,
 * the Jira DELETEs fire only when the window expires, and undoing inside the
 * window cancels with ZERO Jira traffic. No confirmation dialog — this
 * epic's rule is undo-not-confirm.
 *
 * Review Findings 1-3 (2 Blockers + 1 Major): the first cut of this card
 * shared only the `UNDO_WINDOW_MS` import with Story 7.5's mechanism and
 * re-declared everything else WITHOUT the two hardenings 7.5's own review
 * had to add — a duplicate irreversible DELETE if Undo is clicked while a
 * commit is in flight (Finding 1), and a silently-abandoned DELETE if the
 * popup closes inside the undo window (Finding 2). Both are fixed here by
 * PORTING the same two mechanisms `LoggedToday.tsx` uses (`committingIds`,
 * `:209-222`; the `pagehide`/`visibilitychange` flush, `:411-451`), and by
 * calling the SAME exported `enqueueFailedWorklogMutation` helper (`:136`)
 * instead of rebuilding the outbox endpoint inline with no `.catch`. See
 * that function's own comment for why the STATEFUL half is ported rather
 * than extracted into one shared hook (batch-undo vs. single-entry-undo are
 * different enough semantics that a forced shared hook would leak).
 *
 * `onExcludedIdsChange` lifts the set of worklog ids this card considers
 * "gone or going" up to `App.tsx` — mirrors `LoggedToday`'s own
 * `onPendingDeletionChange` shape exactly, so the caller can exclude them
 * from BOTH `useTimeOffToday` and `useTodayTotal`'s seconds derivations
 * (D-7.9-13's "must be filtered out of the seconds derivation as well as the
 * card" — the exact defect D-7.5-14 and 7.5's review both had to fix).
 *
 * `onUndoCommitted` fires once every worklog has genuinely been removed (or
 * durably handed to the outbox) — the ONE explicit transition D-7.9-14
 * permits out of the frozen time-off body.
 *
 * Filled `Diamond` comes ONLY through `<DayStatusIndicator status="time-off">`
 * — importing `Diamond` directly from `lucide-react` here would trip
 * `lib/day-status-vocabulary.grep.test.ts`'s AC3 guard. Review Finding 17:
 * the HEADING TEXT is rendered as a sibling `<h2>`, not through the
 * indicator's own text node (`hideText`) — `DayStatusIndicator` derives ONE
 * colour for icon AND label TOGETHER on the same element
 * (`text-legacy-purple`), but the design source (`:555`) specifies the
 * heading in `#1E1B2E` (`text-foreground`) at 15px Kanit — legacy-purple
 * belongs to the Diamond icon alone (`EXPERIENCE.md:203`), the same
 * reasoning `WriteErrorBanner` already applied for contrast. (`label=""`
 * does NOT achieve this — `DayStatusIndicator`'s `text = label ||
 * STATUS_LABEL[status]` falls back to "Time off" for an empty string by
 * design, so a genuine `hideText` prop was added instead of fighting that
 * guard with a duplicate-text bug.)
 *
 * Carries no self `-mt-[10px]` — the chrome-baseline offset lives on
 * `<main>` ONLY, via `breaksHeaderBaseline = !anyBanner` (D-7.9-16 /
 * Obligation 2 / D-7.3-3: "do not move the offset onto the card").
 */

const STRINGS = {
  heading: 'Marked as time off',
  explanationPrefix: (hours: string) => `${hours} logged to `,
  explanationSuffix: '. This day counts toward your week and needs nothing else from you.',
  undoLabel: (n: number) => (n > 1 ? `Undo time off · ${n} entries` : 'Undo time off'),
  removedNotice: (n: number) => (n > 1 ? `${n} entries removed.` : 'Time off removed.'),
  undoError: "Couldn't undo time off — try again",
};

type PendingUndo = {
  worklogs: TimeOffWorklogRef[];
  timeoutId: ReturnType<typeof setTimeout>;
};

export type TimeOffCardProps = {
  /** Total time-off seconds today (server + session) — feeds the
   * explanation's "8h logged to…" figure. */
  totalSeconds: number;
  subtaskKey: string;
  /** The REAL Jira subtask summary, verbatim (SD-7 / D-7.7-18 / D-7.9-25) —
   * NEVER renamed to "Time off". Falls back to `'PTO'`, matching
   * `PtoQuickAction.tsx`'s own `defaultSummary` for the identical reason. */
  subtaskSummary: string;
  /** Every worklog "Undo time off" deletes — server-fetched AND
   * session-posted, unioned by the caller. */
  worklogs: TimeOffWorklogRef[];
  onExcludedIdsChange: (ids: ReadonlySet<string>) => void;
  onUndoCommitted: () => void;
};

export function TimeOffCard({
  totalSeconds,
  subtaskKey,
  subtaskSummary,
  worklogs,
  onExcludedIdsChange,
  onUndoCommitted,
}: TimeOffCardProps): React.ReactElement {
  const [pending, setPending] = useState<PendingUndo | null>(null);
  const pendingRef = useRef<PendingUndo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Review Finding 1 (Blocker), ported from `LoggedToday.tsx:209-222`: the
  // set of worklog ids whose DELETE has been DISPATCHED (mutation in
  // flight, or irrevocably handed to the outbox by the teardown flush) but
  // has not yet settled. A ref mirror is kept in the SAME setState updater
  // so a synchronous read (inside `handleCancel`, which runs in an event
  // handler, not an effect) always sees the value from the render that just
  // committed — never a stale closure.
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

  // Review Finding 1 (Blocker): mark every id in this batch as "committing"
  // SYNCHRONOUSLY, before the async delete loop below ever awaits anything.
  // This is what makes a second DELETE of the same worklog(s) structurally
  // impossible — `handleCancel` (and the in-window Undo button's visibility)
  // both consult `committingIdsRef`/`committingIds` and go inert the instant
  // this runs, not only once the network round-trip eventually settles.
  const commit = useCallback(
    (toCommit: TimeOffWorklogRef[]) => {
      const ids = toCommit.map((w) => w.worklogId);
      setCommittingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });

      void (async () => {
        const removedIds = new Set<string>();
        let hadPersistentError = false;

        for (const w of toCommit) {
          try {
            const result = await deleteWorklog(w.key, w.worklogId);
            if (result.kind === 'ok') {
              removedIds.add(w.worklogId);
            } else if (result.kind === 'network' || result.kind === 'rate-limited') {
              enqueueFailedWorklogMutation({
                issueKey: w.key,
                worklogId: w.worklogId,
                kind: 'delete',
                resultKind: result.kind,
              });
              removedIds.add(w.worklogId);
            } else {
              hadPersistentError = true;
            }
          } catch {
            hadPersistentError = true;
          }
        }

        setCommittingIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
        pendingRef.current = null;
        setPending(null);
        onExcludedIdsChange(removedIds);

        if (hadPersistentError) {
          // At least one worklog genuinely refused deletion — stay in the
          // time-off body (the day is not fully undone) and surface it
          // inline, the same convention the four existing post paths use.
          setErrorMessage(STRINGS.undoError);
        } else {
          onUndoCommitted();
        }
      })();
    },
    [onExcludedIdsChange, onUndoCommitted, setCommittingIds],
  );

  const handleUndoClick = useCallback(() => {
    setErrorMessage(null);
    if (worklogs.length === 0) {
      // Nothing to delete (D-7.9-13's "zero" case) — the transition still
      // happens; there is simply no Jira traffic to defer.
      onUndoCommitted();
      return;
    }
    const captured = worklogs;
    const timeoutId = setTimeout(() => {
      commit(captured);
    }, UNDO_WINDOW_MS);
    const next: PendingUndo = { worklogs: captured, timeoutId };
    pendingRef.current = next;
    setPending(next);
    onExcludedIdsChange(new Set(captured.map((w) => w.worklogId)));
  }, [worklogs, commit, onExcludedIdsChange, onUndoCommitted]);

  // Review Finding 1: a no-op once ANY worklog in this batch is already
  // committing — once the batch's DELETEs have been dispatched (undo window
  // expired) or handed to the outbox (teardown flush below), there is
  // nothing left to cancel, and clearing `pending` here would let the card
  // re-admit the (still being deleted) worklogs with a live-looking Undo
  // button — exactly the duplicate-DELETE bug the probe reproduced.
  const handleCancel = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    if (current.worklogs.some((w) => committingIdsRef.current.has(w.worklogId))) return;
    clearTimeout(current.timeoutId);
    pendingRef.current = null;
    setPending(null);
    // Zero Jira traffic occurred — nothing to keep excluded.
    onExcludedIdsChange(new Set());
  }, [onExcludedIdsChange]);

  // Review Finding 2 (Blocker), ported from `LoggedToday.tsx:411-451`: if
  // the popup closes (or is hidden) while a delete is pending, do NOT race
  // an in-flight `fetch` from a teardown handler (not guaranteed to
  // complete) — durably enqueue every captured worklog to the Story 2.7
  // outbox instead, exactly like a transient commit failure does.
  // `flushedForRef` is keyed by REFERENCE to the current `pending` object
  // (not by a single id, since this is a batch) so `pagehide` AND
  // `visibilitychange` firing together never double-enqueue the same batch.
  const flushedForRef = useRef<PendingUndo | null>(null);
  useEffect(() => {
    if (pending) flushedForRef.current = null;
  }, [pending]);
  useEffect(() => {
    function flush(): void {
      const current = pendingRef.current;
      if (!current || flushedForRef.current === current) return;
      flushedForRef.current = current;
      clearTimeout(current.timeoutId);
      for (const w of current.worklogs) {
        enqueueFailedWorklogMutation({
          issueKey: w.key,
          worklogId: w.worklogId,
          kind: 'delete',
          resultKind: 'teardown',
        });
      }
      // Mirrors `LoggedToday.tsx`'s own flush: mark `committing` so the card
      // stays out of a re-admitted state and `handleCancel` becomes a no-op
      // if the popup ever survives being hidden. We deliberately do NOT
      // clear `pending` here — that would let the card re-admit the
      // worklogs while the outbox entries are still queued.
      setCommittingIds((prev) => {
        const next = new Set(prev);
        for (const w of current.worklogs) next.add(w.worklogId);
        return next;
      });
    }
    function onVisibilityChange(): void {
      if (document.visibilityState === 'hidden') flush();
    }
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [pending, setCommittingIds]);

  if (pending) {
    const anyCommitting = pending.worklogs.some((w) => committingIds.has(w.worklogId));
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-[11px] py-[9px] shadow-raised"
      >
        <span className="text-body-sm text-muted">{STRINGS.removedNotice(pending.worklogs.length)}</span>
        {/* Review Finding 1, mirroring LoggedToday.tsx:507: once this
            batch's own DELETEs have been dispatched or handed to the
            outbox, there is nothing left to cancel — hide the affordance
            rather than leave a live-looking button whose click is a no-op. */}
        {!anyCommitting && (
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center gap-1 text-body-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:border-primary focus-visible:ring-focus"
          >
            <Undo2 className="h-[13px] w-[13px]" aria-hidden="true" />
            {STRINGS.undoLabel(pending.worklogs.length)}
          </button>
        )}
      </div>
    );
  }

  const hoursLabel = secondsToHoursDisplay(totalSeconds);

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-surface p-[18px] shadow-raised">
      <div className="flex items-center gap-1.5">
        <DayStatusIndicator status="time-off" hideText className="shrink-0" />
        <h2 className="font-chrome text-heading font-medium text-foreground">{STRINGS.heading}</h2>
      </div>
      {/* Finding 20(b): `tabular` applied directly on this element (no
          extra wrapping node) — a nested span would give the existing
          `getByText(/KNP-99 · PTO/)`-style assertions in
          TimeOffCard.test.tsx a second element with matching textContent. */}
      <p className="tabular text-body-sm text-muted">
        {STRINGS.explanationPrefix(hoursLabel)}
        <span className="font-medium text-foreground">
          {subtaskKey} · {subtaskSummary}
        </span>
        {STRINGS.explanationSuffix}
      </p>
      {errorMessage && (
        <p role="alert" className="text-[11.5px] font-medium text-error-ink">
          {errorMessage}
        </p>
      )}
      <button
        type="button"
        onClick={handleUndoClick}
        className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-surface px-[12px] py-[7px] font-chrome text-body-sm font-medium text-primary hover:bg-neutral-100 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-focus"
      >
        <Undo2 className="h-[13px] w-[13px]" aria-hidden="true" />
        {STRINGS.undoLabel(worklogs.length)}
      </button>
    </div>
  );
}
