import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChromeHeader } from '@/components/shell/ChromeHeader';
import { OfflineBanner } from '@/components/shell/OfflineBanner';
import { PopupActionBar } from '@/components/shell/PopupActionBar';
import { PopupSkeletonBody } from '@/components/shell/PopupSkeletonBody';
import { WriteErrorBanner } from '@/components/shell/WriteErrorBanner';
import type { EditPatch, LoggedEntry } from '@/components/today/LoggedToday';
import { ResumeCard } from '@/components/today/ResumeCard';
import { SearchPanel, type SearchPanelHandle } from '@/components/today/SearchPanel';
import { TimeOffCard } from '@/components/today/TimeOffCard';
import { TodayView } from '@/components/today/TodayView';
import { Button } from '@/components/ui/button';
import { useOutboxState } from '@/hooks/useOutboxState';
import { useResumeDismissal } from '@/hooks/useResumeDismissal';
import { useResumeTicket, type ResumeTicket } from '@/hooks/useResumeTicket';
import { useTimeOffToday, type TimeOffWorklogRef } from '@/hooks/useTimeOffToday';
import { useTodayTotal } from '@/hooks/useTodayTotal';
import { log } from '@/lib/log';
import { resolvePopupState } from '@/lib/popup-state';
import { discardPending, runOutboxRetryPass, update as updateOutbox } from '@/lib/storage/outbox';
import { ptoSubtaskKeyItem, ptoSubtaskSummaryItem, targetHoursItem } from '@/lib/storage/settings';
import { getAuth, hasValidAuth, type AuthBundle } from '@/lib/storage/tokens';

/**
 * Popup shell (Story 7.2): fixed 380x560 surface, chrome header on top,
 * exactly one scroll region in the middle, fixed action bar at the bottom.
 * The Radix `Tabs` primitive is gone — the popup renders today's content and
 * nothing else (AC1). The manager reaches the matrix through the full page
 * instead (AC5, AC7) — there is no manager affordance in the popup
 * (EXPERIENCE.md lines 55-63, D-7.2-1 — settled, not relitigated here).
 *
 * Story 7.9 adds the popup-STATE derivation (AC6): every popup render
 * resolves to exactly one of `disconnected | loading | time-off | normal`
 * (`lib/popup-state.ts#resolvePopupState`), plus two orthogonal banners. No
 * component branches on "am I offline/error/time-off" for itself — each one
 * receives props (or nothing) from the single derivation below.
 */

const STRINGS = {
  disconnectedHeading: 'Connect to Jira',
  disconnectedBody:
    'Sign in once with your KKP Jira account. The extension reads your assigned tickets and writes worklogs as you.',
  connectCta: 'Sign in to Jira',
  disconnectedReassurance: 'Nothing is sent anywhere except your Jira instance.',
  timeOffEyebrow: 'Still want to log work?',
};

const EMPTY_WORKLOG_IDS: ReadonlySet<string> = new Set();

type AuthState =
  | { kind: 'loading' }
  | { kind: 'connected' }
  | { kind: 'disconnected' };

/**
 * First initial for the chrome header's avatar chip. Only the `api-token`
 * auth kind carries an email in local storage; an `oauth` bundle carries no
 * display name/email locally — resolving one would require a `myself`
 * network call, which the header must never await (AC6). Render no initial
 * for `oauth` rather than fetch on the popup's first-paint path.
 */
function userInitialFrom(bundle: AuthBundle | null): string | null {
  if (!bundle || bundle.kind !== 'api-token') return null;
  const local = bundle.email.split('@')[0];
  return local ? local.charAt(0).toUpperCase() : null;
}

export function App(): React.ReactElement {
  const [authState, setAuthState] = useState<AuthState>({ kind: 'loading' });
  const [userInitial, setUserInitial] = useState<string | null>(null);
  const [targetHours, setTargetHours] = useState(8);
  const [ptoSubtaskKey, setPtoSubtaskKey] = useState<string | null>(null);
  const [ptoSubtaskSummary, setPtoSubtaskSummary] = useState<string | null>(null);

  // Three independent contributions to "seconds logged this popup session"
  // (D-7.2-2): TodayView's own QuickLogForm-originated entries (lifted via
  // `onTotalChange`), the relocated action-bar PtoQuickAction's entries, and
  // (Story 7.3) the resume card's own post path.
  //
  // Story 7.2 Finding 3: the PTO contribution is a full entries LIST owned
  // here (`ptoEntries`), not a monotonic seconds accumulator — a monotonic
  // counter can never be decremented, which silently dropped the in-popup
  // edit/delete correction path a time-off entry had before this story
  // relocated `PtoQuickAction` out of `TodayView`. The list is passed down to
  // `TodayView` as `externalEntries` so it renders in "Logged today" with
  // working edit/delete (routed back here), and `ptoSeconds` is derived from
  // it so editing/deleting a PTO entry is reflected in the header for free.
  // Story 7.3 copies the same LIST pattern for `resumeEntries` — never a
  // counter, for the identical reason. Story 7.4 adds a FOURTH list,
  // `searchEntries`, for worklogs posted from `SearchPanel` — same reasoning.
  const [todayViewSeconds, setTodayViewSeconds] = useState(0);
  const [ptoEntries, setPtoEntries] = useState<LoggedEntry[]>([]);
  const [resumeEntries, setResumeEntries] = useState<LoggedEntry[]>([]);
  const [searchEntries, setSearchEntries] = useState<LoggedEntry[]>([]);
  // Story 7.5, D-7.5-18: the single worklog id currently pending deletion
  // inside `LoggedToday` (there is never more than one) — excluded from
  // whichever of these three sums actually owns it, so the chrome header
  // drops the figure the instant the row hides and restores it on undo.
  // `todayViewSeconds` needs no separate filter here: it is `TodayView`'s
  // OWN total, already computed net of a pending deletion that belongs to
  // ITS OWN `loggedEntries` (see `TodayView.tsx`).
  const [pendingDeletionId, setPendingDeletionId] = useState<string | null>(null);

  // Story 7.9, D-7.9-13: the set of worklog ids "Undo time off" is currently
  // removing (inside the 5s undo window, or already durably handed to the
  // outbox) — excluded from BOTH `useTimeOffToday` and `useTodayTotal`'s
  // seconds derivations so the chrome figure never disagrees with the
  // already-cleared card (the exact defect D-7.5-14 and 7.5's review both
  // had to fix). Lifted from `TimeOffCard` via `onExcludedIdsChange`, the
  // SAME shape as `LoggedToday`'s own `onPendingDeletionChange` above.
  // Declared BEFORE `ptoSeconds` (below) — Review Finding 4 needs it there
  // too.
  const [timeOffExcludedIds, setTimeOffExcludedIds] =
    useState<ReadonlySet<string>>(EMPTY_WORKLOG_IDS);

  // Review Finding 4: `timeOffExcludedIds` must ALSO net out of `ptoSeconds`
  // — not just `useTimeOffToday`/`useTodayTotal`'s SERVER sums.
  // `TimeOffCard`'s `worklogs` prop is `timeOffToday.worklogs` UNIONED with
  // any SESSION-posted entries (`sessionTimeOffWorklogs` below), and
  // `useTimeOffToday`'s own exclusion only ever touches the server loop —
  // it is arithmetically incapable of reaching a session entry, which lives
  // ONLY in `ptoEntries`/`ptoSeconds` here. Without this filter, undoing a
  // session-posted time-off worklog leaves the chrome figure permanently
  // wrong (the exact defect this finding named).
  const ptoSeconds = ptoEntries
    .filter((e) => e.worklogId !== pendingDeletionId)
    .filter((e) => !timeOffExcludedIds.has(e.worklogId))
    .reduce((sum, e) => sum + e.seconds, 0);
  const resumeSeconds = resumeEntries
    .filter((e) => e.worklogId !== pendingDeletionId)
    .reduce((sum, e) => sum + e.seconds, 0);
  const searchSeconds = searchEntries
    .filter((e) => e.worklogId !== pendingDeletionId)
    .reduce((sum, e) => sum + e.seconds, 0);
  const sessionSeconds = todayViewSeconds + ptoSeconds + resumeSeconds + searchSeconds;
  const externalEntries = [...ptoEntries, ...resumeEntries, ...searchEntries];

  // Story 7.4: whether a search query is active — the RAW (non-debounced)
  // query, per D-7.4-18 — drives the `hidden`-attribute wrapper around
  // `TodayView` below. `searchPanelRef` is the seam Story 7.5's "Recently
  // worked" handoff row ("More assigned tickets · Search to find them →",
  // D-7.5-12 — no count) calls via `handleRequestSearchFocus` (D-7.4-26);
  // the document-level `/` listener lives inside `SearchPanel` itself and
  // uses the exact same ref internally, so there is exactly one focus path.
  // Story 7.9, D-7.9-29: "Log elsewhere" (the error banner) reuses this SAME
  // seam rather than inventing a second focus path.
  const [searchActive, setSearchActive] = useState(false);
  const searchPanelRef = useRef<SearchPanelHandle>(null);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const bundle = await getAuth();
        if (ac.signal.aborted) return;
        const connected = hasValidAuth(bundle);
        setUserInitial(userInitialFrom(bundle));
        setAuthState(connected ? { kind: 'connected' } : { kind: 'disconnected' });
      } catch {
        if (!ac.signal.aborted) {
          setAuthState({ kind: 'disconnected' });
        }
      }
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    void targetHoursItem.getValue().then(setTargetHours);
    void ptoSubtaskKeyItem.getValue().then(setPtoSubtaskKey);
    void ptoSubtaskSummaryItem.getValue().then(setPtoSubtaskSummary);
  }, []);

  const handleTodayViewTotalChange = useCallback((seconds: number): void => {
    setTodayViewSeconds(seconds);
  }, []);

  const handlePtoLogged = useCallback((entry: LoggedEntry): void => {
    setPtoEntries((prev) => [...prev, entry]);
  }, []);

  const handleResumeLogged = useCallback((entry: LoggedEntry): void => {
    setResumeEntries((prev) => [...prev, entry]);
  }, []);

  const handleSearchLogged = useCallback((entry: LoggedEntry): void => {
    setSearchEntries((prev) => [...prev, entry]);
  }, []);

  const handleSearchActiveChange = useCallback((active: boolean): void => {
    setSearchActive(active);
  }, []);

  const handlePendingDeletionChange = useCallback((worklogId: string | null): void => {
    setPendingDeletionId(worklogId);
  }, []);

  // Story 7.5, D-7.5-22: the "Recently worked" handoff row's only focus path
  // — the exact seam `SearchPanel` itself uses for `/`, published for this
  // story by Story 7.4 (D-7.4-26). No second focus path is invented. Reused
  // verbatim by the error banner's "Log elsewhere" (D-7.9-29).
  const handleRequestSearchFocus = useCallback((): void => {
    searchPanelRef.current?.focus();
  }, []);

  // Story 7.3, Task 5 (extended by 7.4, Task 7): `externalEntries` now merges
  // THREE externally-owned lists (`ptoEntries`, `resumeEntries`,
  // `searchEntries`). Route an edit/delete to whichever list actually owns
  // the `worklogId` — mirrors `TodayView.handleAnyEdited` /
  // `handleAnyDeleted`'s own ownership check. Returning the SAME array
  // reference when a list does not own the id lets React bail out of that
  // list's re-render (no-op `setState`).
  const handleExternalEntryEdited = useCallback((worklogId: string, patch: EditPatch): void => {
    setPtoEntries((prev) =>
      prev.some((e) => e.worklogId === worklogId)
        ? prev.map((e) => (e.worklogId === worklogId ? { ...e, ...patch } : e))
        : prev,
    );
    setResumeEntries((prev) =>
      prev.some((e) => e.worklogId === worklogId)
        ? prev.map((e) => (e.worklogId === worklogId ? { ...e, ...patch } : e))
        : prev,
    );
    setSearchEntries((prev) =>
      prev.some((e) => e.worklogId === worklogId)
        ? prev.map((e) => (e.worklogId === worklogId ? { ...e, ...patch } : e))
        : prev,
    );
  }, []);

  const handleExternalEntryDeleted = useCallback((worklogId: string): void => {
    setPtoEntries((prev) =>
      prev.some((e) => e.worklogId === worklogId)
        ? prev.filter((e) => e.worklogId !== worklogId)
        : prev,
    );
    setResumeEntries((prev) =>
      prev.some((e) => e.worklogId === worklogId)
        ? prev.filter((e) => e.worklogId !== worklogId)
        : prev,
    );
    setSearchEntries((prev) =>
      prev.some((e) => e.worklogId === worklogId)
        ? prev.filter((e) => e.worklogId !== worklogId)
        : prev,
    );
  }, []);

  const handleConnect = (): void => {
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) {
        log.warn('popup.openOptionsPage.error', {
          message: chrome.runtime.lastError.message,
        });
      }
    });
  };

  // Story 7.9: the write-refused banner's "Retry" — reuses
  // `LoggedToday.handleRetryNow`'s exact shape (reset to pending + an
  // immediate drain pass), not a second retry path.
  const handleRetryFailedWrite = useCallback(async (id: string): Promise<void> => {
    await updateOutbox(id, { status: 'pending', attemptCount: 0 });
    try {
      await runOutboxRetryPass();
    } catch (e) {
      log.error('outbox.retry.error', { id, cause: String(e) });
    }
  }, []);

  // The offline banner's trash affordance. `discardPending` leaves `failed`
  // entries alone — they belong to the write-error banner, which has its own
  // per-entry Retry. `outboxItem.watch()` in `useOutboxState` re-reads on the
  // write, so the banner clears itself; nothing to set here.
  const handleDiscardQueued = useCallback(async (): Promise<void> => {
    try {
      await discardPending();
    } catch (e) {
      log.error('outbox.discard.failed', { cause: String(e) });
    }
  }, []);

  // Story 7.9: "Undo time off" commits — the ONE explicit transition D-7.9-14
  // permits out of the frozen time-off body.
  const handleUndoTimeOffCommitted = useCallback((): void => {
    setFrozenIsTimeOff(false);
  }, []);

  // The today total query composes over the existing week-worklogs fetch
  // regardless of auth state (it fails closed to isError, never throws) —
  // only the RENDERED figure is gated on `connected` inside ChromeHeader.
  // Story 7.9, D-7.9-13: excludes any worklog "Undo time off" is currently
  // removing, so the chrome figure never disagrees with the cleared card.
  const todayTotal = useTodayTotal(sessionSeconds, timeOffExcludedIds);

  // Story 7.9: the one genuinely new derivation — composes the ALREADY-
  // fetched week query (zero extra network) + the PTO subtask key storage
  // read `useResumeTicket` already performs.
  const timeOffToday = useTimeOffToday(ptoSeconds, timeOffExcludedIds);

  const outbox = useOutboxState();

  // Story 7.9, § State precedence: 'loading' covers BOTH `todayTotal` and
  // `timeOffToday` not having resolved yet — the latter additionally waits
  // on its own `ptoSubtaskKeyItem` read, a signal `todayTotal` alone does
  // not carry.
  const isPending = todayTotal.isPending || timeOffToday.isPending;

  // D-7.9-14 (OWNER decision): which body renders — normal vs the settled
  // time-off card — resolves ONCE, when the popup's data first settles, and
  // is FROZEN for the rest of this popup session. Marking today as time off
  // from the action bar mid-session does NOT swap the body (D-7.3-9 stays
  // absolute — switching would unmount the resume card and silently discard
  // hours typed but not submitted). "Undo time off" is the one explicit,
  // user-initiated transition (`handleUndoTimeOffCommitted` above).
  //
  // Latched in the same spirit as `ResumeCard`'s own identity/focus latches
  // (a state update guarded by a condition that becomes false after it
  // fires once — the standard React "adjust state during render" pattern).
  const [frozenIsTimeOff, setFrozenIsTimeOff] = useState<boolean | null>(null);
  if (frozenIsTimeOff === null && !isPending) {
    setFrozenIsTimeOff(timeOffToday.seconds > 0);
  }

  // Story 7.9, AC6: the single state derivation. No component below branches
  // on "am I offline/error/time-off" for itself.
  const popupState = resolvePopupState({
    authKind: authState.kind,
    isPending,
    // `resolvePopupState` only ever checks `> 0` — the frozen DECISION
    // (never the live, unfrozen `timeOffToday.seconds`) is what must drive
    // the body once latched, per D-7.9-14.
    timeOffSeconds: frozenIsTimeOff ? 1 : 0,
    pendingCount: outbox.pendingCount,
    failedCount: outbox.failed.length,
  });

  // Story 7.9, D-7.9-13: every worklog "Undo time off" could remove — the
  // server-fetched ones `useTimeOffToday` already found, UNIONED with any
  // posted THIS popup session (invisible to that query, Trap 1) — net of
  // whichever ids are already excluded (already being removed) or pending
  // LoggedToday's own, unrelated single-entry delete flow.
  const sessionTimeOffWorklogs: TimeOffWorklogRef[] = ptoEntries
    .filter((e) => e.worklogId !== pendingDeletionId)
    .filter((e) => !timeOffExcludedIds.has(e.worklogId))
    .map((e) => ({ key: e.key, worklogId: e.worklogId, seconds: e.seconds }));
  const allTimeOffWorklogs: TimeOffWorklogRef[] = [
    ...timeOffToday.worklogs,
    ...sessionTimeOffWorklogs,
  ];

  const rawResume = useResumeTicket();
  // Destructured: the hook returns a fresh object literal each render, so
  // depending on it would rebuild the callback below every time.
  const { dismissedKey, dismiss: dismissResume } = useResumeDismissal();

  // Fold dismissal into the resume status the rest of this component already
  // branches on, rather than threading a second boolean through every one of
  // those branches. A dismissed card is indistinguishable from "there is no
  // resume ticket" everywhere it matters — the card does not render, the
  // slot collapses, and `SearchPanel` takes the autofocus the hour input
  // would have had (D-7.4-23, the `resume.status === 'none'` prop below).
  //
  // The 'loading' hold is the pop-in guard: until storage says WHETHER this
  // ticket is dismissed, rendering the resolved card would show it and then
  // snatch it away. Holding the skeleton costs the same single-digit ms
  // `useResumeTicket`'s own storage read already costs, and keeps the card's
  // height identical throughout (the skeleton is height-matched by design —
  // `ResumeCard.tsx`, Finding 5).
  const resume = useMemo<ResumeTicket>(() => {
    if (rawResume.status !== 'ready') return rawResume;
    if (dismissedKey === undefined) return { status: 'loading' };
    if (dismissedKey === rawResume.key) return { status: 'none' };
    return rawResume;
  }, [rawResume, dismissedKey]);

  // D-7.9-29's seam again: closing the card removes the element focus is
  // sitting on, so focus must be placed deliberately or it falls to
  // <body>. Search is where the user goes next by definition — the card
  // they just declined was the only other producer.
  const handleDismissResume = useCallback(
    (key: string): void => {
      dismissResume(key);
      handleRequestSearchFocus();
    },
    [dismissResume, handleRequestSearchFocus],
  );

  const connected = authState.kind === 'connected';

  // D-7.9-16 (finisher-stage orchestrator ruling, closing Findings 5 & 11):
  // `<main>` is the SOLE owner of the −10 px baseline-break offset —
  // `breaksHeaderBaseline = !anyBanner`, full stop. No child of the scroll
  // container may carry its own `-mt-[10px]`: `<main>` is `overflow-y-auto`
  // with NO top padding (D-7.3-3), so a negative top margin on a CHILD is
  // silently CLIPPED (scrollTop cannot go negative), never overhung. The
  // shipped code applied this correctly to the resume/skeleton/time-off
  // bodies but wrongly let three elements self-carry `-mt-[10px]` instead
  // (`OfflineBanner.tsx`, `WriteErrorBanner.tsx`, the disconnected card) —
  // fixed at their own call sites; this is the one place the offset now
  // lives.
  //
  // This DROPS the earlier `connected && resume.status !== 'none'` guard
  // entirely — not narrowed, REMOVED. Keying the offset off `resume.status`
  // was always the wrong axis (D-7.9-16): it is a property of the SURFACE
  // (does a banner own the top of the scroll region right now?), not of the
  // resume card specifically. `!anyBanner` alone:
  //   - still offsets the 'normal' body when the resume card IS present
  //     (unchanged from every prior story);
  //   - now ALSO offsets the 'normal' body when `resume.status === 'none'`
  //     (SearchPanel promoted to the first child, D-7.4-23) — closing the
  //     routine (not theoretical) gap Finding 11 proved: `useResumeTicket`
  //     excludes the time-off key (D-7.3-12), so ANY week beginning with a
  //     day off gives `resume.status === 'none'` together with a time-off
  //     body, and the old guard silently dropped the offset there. Search
  //     needs `relative z-[1]` for this — added at its own call site.
  //   - still offsets 'loading' and 'time-off' for free (anyBanner is
  //     always false in 'loading', and the time-off body renders no banner
  //     unless one is independently true) — matching the design source's
  //     `margin-top:-10px` on both those cards;
  //   - now ALSO offsets 'disconnected' (anyBanner is suppressed there too)
  //     — which is exactly what the disconnected card's own self-carried
  //     `-mt-[10px]` used to (incorrectly) supply itself; `<main>` supplies
  //     it now instead, per the same mechanism as everything else.
  // `connected` was never load-bearing for the OFFSET itself — it only ever
  // gated whether the resume card rendered at all, which the `body` axis
  // already governs.
  const breaksHeaderBaseline = !popupState.anyBanner;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <ChromeHeader
        connected={connected}
        userInitial={userInitial}
        seconds={todayTotal.seconds}
        targetHours={targetHours}
        isPending={todayTotal.isPending}
        // Obligation 3 / D-7.6-40: time off on the chrome gradient renders
        // white/opacity only, via `tone="chrome"` — never a per-status
        // colour. Purely a prop; `ChromeHeader` never reads storage itself.
        // `exactOptionalPropertyTypes`: spread, never assign `undefined`.
        {...(popupState.body === 'time-off' ? { status: 'time-off' as const } : {})}
      />

      <main
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-[14px] pb-[14px] ${
          breaksHeaderBaseline ? '-mt-[10px]' : ''
        }`}
      >
        {popupState.body === 'disconnected' && (
          // AC5: the chrome still identifies the product; this is the ONLY
          // content in <main>, and no other producer (resume/search/today
          // view/action bar) mounts — all still gated on `connected` below.
          // D-7.9-16: carries NO self `-mt-[10px]` — `<main>` supplies the
          // design source's `margin-top:-10px` (`:543`) instead, since
          // `breaksHeaderBaseline` is now unconditionally true here
          // (`anyBanner` is always suppressed in the disconnected body).
          // `relative z-[1]` is required wherever the offset applies.
          <div className="relative z-[1] flex flex-col items-start gap-[10px] rounded-lg border border-border bg-surface p-[18px] shadow-raised">
            <h2 className="font-chrome text-heading font-medium text-foreground">
              {STRINGS.disconnectedHeading}
            </h2>
            <p className="text-body-sm leading-[1.6] text-muted">{STRINGS.disconnectedBody}</p>
            <Button variant="primary" onClick={handleConnect} className="w-full">
              {STRINGS.connectCta}
            </Button>
            <p className="text-[12px] text-faint">{STRINGS.disconnectedReassurance}</p>
          </div>
        )}

        {popupState.body === 'loading' && <PopupSkeletonBody />}

        {(popupState.body === 'normal' || popupState.body === 'time-off') && (
          <>
            {/* § Accessibility / Banner order: error ABOVE offline. */}
            {popupState.errorBanner && (
              <WriteErrorBanner
                entries={outbox.failed}
                onRetry={(id) => void handleRetryFailedWrite(id)}
                onLogElsewhere={handleRequestSearchFocus}
              />
            )}
            {popupState.offlineBanner && (
              <OfflineBanner
                pendingCount={outbox.pendingCount}
                onDiscardAll={() => void handleDiscardQueued()}
              />
            )}

            {popupState.body === 'time-off' && (
              <TimeOffCard
                totalSeconds={timeOffToday.seconds}
                subtaskKey={ptoSubtaskKey ?? ''}
                subtaskSummary={ptoSubtaskSummary ?? 'PTO'}
                worklogs={allTimeOffWorklogs}
                onExcludedIdsChange={setTimeOffExcludedIds}
                onUndoCommitted={handleUndoTimeOffCommitted}
              />
            )}

            {popupState.body === 'normal' && resume.status !== 'none' && (
              <div className="mb-3">
                <ResumeCard
                  resume={resume}
                  onLogged={handleResumeLogged}
                  onDismiss={handleDismissResume}
                />
              </div>
            )}

            {popupState.body === 'time-off' && (
              // Finding 17: design source `:561` specifies Kanit 12px/500
              // SENTENCE case ("Still want to log work?"), not the 11px
              // uppercase eyebrow treatment other headings use.
              <div className="mb-1">
                <span className="font-chrome text-label text-faint">{STRINGS.timeOffEyebrow}</span>
              </div>
            )}

            {/* AC7 / D-7.4-23: when the resume card is present, this renders
                BELOW it. When `resume.status === 'none'`, the block above
                renders nothing, so this becomes the FIRST child of the
                scroll region and takes the autofocus the hour input would
                otherwise have had. Time-off body: never autofocused — no
                producer claims focus in that state by design. */}
            <SearchPanel
              ref={searchPanelRef}
              autoFocus={popupState.body === 'normal' && resume.status === 'none'}
              onLogged={handleSearchLogged}
              onActiveChange={handleSearchActiveChange}
            />

            {popupState.body === 'normal' && (
              // D-7.4-18: `hidden` (the HTML ATTRIBUTE, not a Tailwind class —
              // jsdom honours the attribute but not the class, which is what
              // makes this AC machine-checkable) keeps `TodayView` MOUNTED
              // while a search is active, so its own `loggedEntries` state
              // and the running total it lifts via `onTotalChange` both
              // survive a search unharmed. `TodayView` is NEVER mounted in
              // the time-off body (D-7.9-13/14's settled card replaces it).
              <div hidden={searchActive}>
                <TodayView
                  onTotalChange={handleTodayViewTotalChange}
                  externalEntries={externalEntries}
                  onExternalEntryEdited={handleExternalEntryEdited}
                  onExternalEntryDeleted={handleExternalEntryDeleted}
                  onPendingDeletionChange={handlePendingDeletionChange}
                  onRequestSearchFocus={handleRequestSearchFocus}
                />
              </div>
            )}
          </>
        )}
      </main>

      {connected && <PopupActionBar onLogged={handlePtoLogged} />}
    </div>
  );
}
