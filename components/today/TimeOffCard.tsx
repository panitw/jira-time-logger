import { Undo2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { DayStatusIndicator } from '@/components/shared/DayStatusIndicator';
import { UNDO_WINDOW_MS } from '@/components/today/LoggedToday';
import type { TimeOffWorklogRef } from '@/hooks/useTimeOffToday';
import { secondsToHoursDisplay } from '@/lib/hours';
import { deleteWorklog } from '@/lib/jira-client';
import { enqueue as enqueueOutbox } from '@/lib/storage/outbox';

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
 * `lib/day-status-vocabulary.grep.test.ts`'s AC3 guard.
 *
 * Carries no self `-mt-[10px]` — the chrome-baseline offset lives on
 * `<main>` ONLY, via `breaksHeaderBaseline` (Obligation 2 / D-7.3-3: "do not
 * move the offset onto the card"). Unlike the offline/error banners (which
 * DO self-carry it, because `<main>` deliberately drops its own offset when
 * a banner renders), this card is never accompanied by that drop.
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
  /** The REAL Jira subtask summary, verbatim (SD-7 / D-7.7-18 / D-7.9-7) —
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

  const commit = useCallback(
    async (toCommit: TimeOffWorklogRef[]) => {
      const survivingIds = new Set<string>();
      let hadPersistentError = false;

      for (const w of toCommit) {
        try {
          const result = await deleteWorklog(w.key, w.worklogId);
          if (result.kind === 'ok') {
            survivingIds.add(w.worklogId);
          } else if (result.kind === 'network' || result.kind === 'rate-limited') {
            void enqueueOutbox({
              kind: 'delete',
              endpoint: `rest/api/3/issue/${encodeURIComponent(w.key)}/worklog/${encodeURIComponent(w.worklogId)}`,
              issueKey: w.key,
              worklogId: w.worklogId,
            });
            survivingIds.add(w.worklogId);
          } else {
            hadPersistentError = true;
          }
        } catch {
          hadPersistentError = true;
        }
      }

      pendingRef.current = null;
      setPending(null);
      onExcludedIdsChange(survivingIds);

      if (hadPersistentError) {
        // At least one worklog genuinely refused deletion — stay in the
        // time-off body (the day is not fully undone) and surface it inline,
        // the same convention the four existing post paths already use.
        setErrorMessage(STRINGS.undoError);
      } else {
        onUndoCommitted();
      }
    },
    [onExcludedIdsChange, onUndoCommitted],
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
      void commit(captured);
    }, UNDO_WINDOW_MS);
    const next: PendingUndo = { worklogs: captured, timeoutId };
    pendingRef.current = next;
    setPending(next);
    onExcludedIdsChange(new Set(captured.map((w) => w.worklogId)));
  }, [worklogs, commit, onExcludedIdsChange, onUndoCommitted]);

  const handleCancel = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    clearTimeout(current.timeoutId);
    pendingRef.current = null;
    setPending(null);
    // Zero Jira traffic occurred — nothing to keep excluded.
    onExcludedIdsChange(new Set());
  }, [onExcludedIdsChange]);

  if (pending) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-[11px] py-[9px] shadow-raised"
      >
        <span className="text-body-sm text-muted">{STRINGS.removedNotice(pending.worklogs.length)}</span>
        <button
          type="button"
          onClick={handleCancel}
          className="flex items-center gap-1 text-body-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-focus"
        >
          <Undo2 className="h-[13px] w-[13px]" aria-hidden="true" />
          {STRINGS.undoLabel(pending.worklogs.length)}
        </button>
      </div>
    );
  }

  const hoursLabel = secondsToHoursDisplay(totalSeconds);

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-surface p-[18px] shadow-raised">
      <DayStatusIndicator status="time-off" label={STRINGS.heading} className="text-heading font-medium" />
      <p className="text-body-sm text-muted">
        {STRINGS.explanationPrefix(hoursLabel)}
        <span className="font-medium text-foreground">
          {subtaskKey} · {subtaskSummary}
        </span>
        {STRINGS.explanationSuffix}
      </p>
      {errorMessage && (
        <p role="alert" className="text-[11.5px] font-medium text-state-danger">
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
