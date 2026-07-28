import { useState, useCallback, useEffect } from 'react';
import { LoggedToday, type LoggedEntry, type EditPatch } from '@/components/today/LoggedToday';
import { QuickLogForm } from '@/components/today/QuickLogForm';
import { RecentlyWorked } from '@/components/today/RecentlyWorked';
import { useRecentlyWorked } from '@/hooks/useRecentlyWorked';
import { log } from '@/lib/log';
import { outboxDrainedItem } from '@/lib/storage/outbox';
import { catchAllProjectKeyItem } from '@/lib/storage/settings';

/**
 * Story 7.5: the popup's 55-ticket browse tree (`TicketPicker`) is gone from
 * this view. "Recently worked" (fed by the already-fetched week-worklogs
 * query, D-7.5-16 — zero extra network) replaces it, and its `+` opens the
 * SAME `QuickLogForm`/`handleSelect` flow `TicketPicker` used to feed
 * (D-7.5-11) — never the resume card (D-7.3-9 stays absolute).
 *
 * `TicketPicker.tsx` has since been deleted outright. D-7.5-23 kept the file
 * alive for `components/week/WeeklyGrid.tsx`, its last consumer; the week
 * grid now uses `components/week/AddSubtaskRow.tsx` (live Jira search, per
 * the design source) instead of the hierarchy tree, so nothing imported it.
 */

const STRINGS = {
  catchAllNotConfiguredPrefix:
    'Catch-all not configured. Configure in ',
  settings: 'Settings',
  catchAllNotConfiguredSuffix: ' to log Admin/Meetings/time off.',
  syncedToast: (n: number) =>
    n === 1 ? 'Synced 1 pending worklog' : `Synced ${n} pending worklogs`,
  dismissToast: 'Dismiss',
};

const TOAST_DISMISS_MS = 4000;

type TodayViewProps = {
  /** Lifts the session's logged-seconds total up to the popup shell so the
   * chrome header can add it to the server-fetched today total (Story 7.2,
   * D-7.2-2). Optional so the component stays independently testable. */
  onTotalChange?: (seconds: number) => void;
  /** Story 7.2 Finding 3: entries logged by a producer OUTSIDE `TodayView`
   * (currently only the action bar's relocated `PtoQuickAction`) that should
   * still render in "Logged today" with working edit/delete. `TodayView`
   * merges these into its own `loggedEntries` for display only — it never
   * owns their lifecycle. Optional so the component stays independently
   * testable with none supplied. */
  externalEntries?: LoggedEntry[];
  /** Routes an edit of an `externalEntries` row back to its owner (the shell)
   * instead of `TodayView`'s own reducer. */
  onExternalEntryEdited?: (worklogId: string, patch: EditPatch) => void;
  /** Routes a delete of an `externalEntries` row back to its owner. */
  onExternalEntryDeleted?: (worklogId: string) => void;
  /** Story 7.5, D-7.5-18: the single pending-deletion id changed (or cleared)
   * inside `LoggedToday` — forwarded up so the shell can exclude it from
   * ITS OWN seconds derivation for `ptoEntries`/`resumeEntries`/
   * `searchEntries` (whichever list actually owns the pending entry). */
  onPendingDeletionChange?: (worklogId: string | null) => void;
  /** Story 7.5, D-7.5-22: the "Recently worked" handoff row's "Search to find
   * them →" affordance — calls the `SearchPanelHandle` seam Story 7.4
   * published for exactly this (D-7.4-26), via `App.tsx`. */
  onRequestSearchFocus?: () => void;
};

export function TodayView({
  onTotalChange,
  externalEntries,
  onExternalEntryEdited,
  onExternalEntryDeleted,
  onPendingDeletionChange,
  onRequestSearchFocus,
}: TodayViewProps): React.ReactElement {
  const [selectedTicket, setSelectedTicket] = useState<{ key: string; summary: string } | null>(null);
  const [loggedEntries, setLoggedEntries] = useState<LoggedEntry[]>([]);
  const [pendingDeletionId, setPendingDeletionId] = useState<string | null>(null);
  const [catchAllProjectKey, setCatchAllProjectKey] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);

  const recentlyWorked = useRecentlyWorked();

  useEffect(() => {
    void catchAllProjectKeyItem.getValue().then(setCatchAllProjectKey);
  }, []);

  // On mount, surface a single "Synced N pending worklogs" notice for any outbox
  // entries the service-worker drained while the popup was closed, then clear
  // the counter so it shows exactly once. (No dedicated toast component exists
  // yet — this is a minimal inline notice; same 4s auto-dismiss, max one.)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    void outboxDrainedItem.getValue().then((count) => {
      if (count > 0) {
        setSyncedCount(count);
        void outboxDrainedItem.setValue(0);
        timer = setTimeout(() => setSyncedCount(0), TOAST_DISMISS_MS);
      }
    });
    return () => clearTimeout(timer);
  }, []);

  const catchAllUnconfigured =
    catchAllProjectKey !== null && catchAllProjectKey.trim() === '';

  const openOptions = useCallback((): void => {
    chrome.runtime.openOptionsPage();
  }, []);

  // Story 7.5, D-7.5-11: the single entry point for BOTH the (now-removed)
  // TicketPicker and the "Recently worked" `+` — opens `QuickLogForm`
  // pre-targeted at the given ticket. Has no channel to the resume card at
  // all (D-7.3-9 stays absolute, by construction).
  const handleSelect = useCallback((ticketKey: string, ticketSummary: string): void => {
    log.info('today.ticket.picked', { key: ticketKey });
    setSelectedTicket({ key: ticketKey, summary: ticketSummary });
  }, []);

  const handleLogged = useCallback((entry: LoggedEntry): void => {
    setLoggedEntries((prev) => [...prev, entry]);
    setSelectedTicket(null);
  }, []);

  const handleCancel = useCallback((): void => {
    setSelectedTicket(null);
  }, []);

  const handleEdited = useCallback((worklogId: string, patch: EditPatch): void => {
    setLoggedEntries((prev) =>
      prev.map((e) =>
        e.worklogId === worklogId
          ? {
              ...e,
              hoursDisplay: patch.hoursDisplay,
              seconds: patch.seconds,
              started: patch.started,
              comment: patch.comment,
            }
          : e,
      ),
    );
  }, []);

  const handleDeleted = useCallback((worklogId: string): void => {
    setLoggedEntries((prev) => prev.filter((e) => e.worklogId !== worklogId));
  }, []);

  // Story 7.2 Finding 3: a worklog row rendered in "Logged today" may belong
  // to `TodayView`'s own reducer (ticket-logged entries) OR to an external
  // producer (the action bar's PtoQuickAction, via `externalEntries`). Route
  // edit/delete to whichever one actually owns it, so BOTH keep a working
  // in-popup correction path instead of only the ticket-logged half.
  const handleAnyEdited = useCallback(
    (worklogId: string, patch: EditPatch): void => {
      if (loggedEntries.some((e) => e.worklogId === worklogId)) {
        handleEdited(worklogId, patch);
      } else {
        onExternalEntryEdited?.(worklogId, patch);
      }
    },
    [loggedEntries, handleEdited, onExternalEntryEdited],
  );

  const handleAnyDeleted = useCallback(
    (worklogId: string): void => {
      if (loggedEntries.some((e) => e.worklogId === worklogId)) {
        handleDeleted(worklogId);
      } else {
        onExternalEntryDeleted?.(worklogId);
      }
    },
    [loggedEntries, handleDeleted, onExternalEntryDeleted],
  );

  const handlePendingDeletionChange = useCallback(
    (worklogId: string | null): void => {
      setPendingDeletionId(worklogId);
      onPendingDeletionChange?.(worklogId);
    },
    [onPendingDeletionChange],
  );

  // Entries rendered in "Logged today" — this component's own ticket-logged
  // entries plus any externally-owned ones (e.g. time-off). The session
  // total reported via `onTotalChange` below stays scoped to THIS
  // component's own entries only — the shell adds the external contribution
  // (`ptoSeconds`) separately, so merging here for display must not also
  // fold external seconds into `onTotalChange` (that would double-report it
  // on top of the shell's own tracking of the same entries).
  const allEntries = externalEntries?.length
    ? [...loggedEntries, ...externalEntries]
    : loggedEntries;

  // Story 7.5, D-7.5-18: a pending deletion is excluded from the total the
  // instant the row hides, and returns the instant undo cancels it — but
  // ONLY when the pending entry belongs to THIS component's own
  // `loggedEntries` (an externally-owned pending entry is excluded from ITS
  // OWNER's own sum instead, via `onPendingDeletionChange` above).
  const totalSeconds = loggedEntries
    .filter((e) => e.worklogId !== pendingDeletionId)
    .reduce((sum, e) => sum + e.seconds, 0);

  // Lift the session total up to the popup shell (Story 7.2, D-7.2-2) — the
  // chrome header adds this on top of the server-fetched today total.
  useEffect(() => {
    onTotalChange?.(totalSeconds);
  }, [totalSeconds, onTotalChange]);

  return (
    <div>
      {syncedCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="mb-2 flex items-center justify-between gap-2 rounded-md bg-state-info-subtle px-3 py-2 text-sm text-neutral-700"
        >
          <span>{STRINGS.syncedToast(syncedCount)}</span>
          <button
            type="button"
            aria-label={STRINGS.dismissToast}
            onClick={() => setSyncedCount(0)}
            className="rounded text-neutral-500 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ×
          </button>
        </div>
      )}

      {catchAllUnconfigured && (
        <p className="mt-2 text-center text-sm text-neutral-500">
          {STRINGS.catchAllNotConfiguredPrefix}
          <button
            type="button"
            onClick={openOptions}
            className="text-accent hover:underline"
          >
            {STRINGS.settings}
          </button>
          {STRINGS.catchAllNotConfiguredSuffix}
        </p>
      )}

      <div className="mt-3">
        <LoggedToday
          entries={allEntries}
          onEdited={handleAnyEdited}
          onDeleted={handleAnyDeleted}
          onPendingDeletionChange={handlePendingDeletionChange}
        />
      </div>

      {selectedTicket ? (
        <div className="mt-1">
          <QuickLogForm
            ticketKey={selectedTicket.key}
            ticketSummary={selectedTicket.summary}
            onLogged={handleLogged}
            onCancel={handleCancel}
          />
        </div>
      ) : (
        <RecentlyWorked
          items={recentlyWorked}
          onSelectTicket={handleSelect}
          onRequestSearchFocus={onRequestSearchFocus}
        />
      )}
    </div>
  );
}
