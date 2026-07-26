import { useCallback, useEffect, useRef, useState } from 'react';
import { ChromeHeader } from '@/components/shell/ChromeHeader';
import { PopupActionBar } from '@/components/shell/PopupActionBar';
import type { EditPatch, LoggedEntry } from '@/components/today/LoggedToday';
import { ResumeCard } from '@/components/today/ResumeCard';
import { SearchPanel, type SearchPanelHandle } from '@/components/today/SearchPanel';
import { TodayView } from '@/components/today/TodayView';
import { Button } from '@/components/ui/button';
import { useResumeTicket } from '@/hooks/useResumeTicket';
import { useTodayTotal } from '@/hooks/useTodayTotal';
import { log } from '@/lib/log';
import { targetHoursItem } from '@/lib/storage/settings';
import { getAuth, hasValidAuth, type AuthBundle } from '@/lib/storage/tokens';

/**
 * Popup shell (Story 7.2): fixed 380x560 surface, chrome header on top,
 * exactly one scroll region in the middle, fixed action bar at the bottom.
 * The Radix `Tabs` primitive is gone — the popup renders today's content and
 * nothing else (AC1). The manager reaches the matrix through the full page
 * instead (AC5, AC7) — there is no manager affordance in the popup
 * (EXPERIENCE.md lines 55-63, D-7.2-1 — settled, not relitigated here).
 */

const STRINGS = {
  disconnectedHeading: 'Connect to Jira',
  disconnectedBody: 'Connect your Jira Cloud account to start logging time.',
  connectCta: 'Connect to Jira',
};

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
  const ptoSeconds = ptoEntries
    .filter((e) => e.worklogId !== pendingDeletionId)
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
  // story by Story 7.4 (D-7.4-26). No second focus path is invented.
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

  // The today total query composes over the existing week-worklogs fetch
  // regardless of auth state (it fails closed to isError, never throws) —
  // only the RENDERED figure is gated on `connected` inside ChromeHeader.
  const todayTotal = useTodayTotal(sessionSeconds);

  // Story 7.3, Task 2: resolved once here so the offset boolean below and
  // the card's own render branch can never disagree about which state is
  // current (`resume` is passed down as a prop rather than re-resolved
  // inside `ResumeCard`).
  const resume = useResumeTicket();

  const connected = authState.kind === 'connected';

  // The −10 px baseline-break offset — one boolean, one place (D-7.3-3).
  // 7.9 extends this expression with `&& !offlineBanner && !writeErrorBanner`
  // (the mockup sets `resumeOffset: "0px"` in both the offline and error
  // states). Nothing else changes for 7.9. This same boolean also handles
  // AC5's collapse for free — when there is no resume ticket, the offset
  // drops along with the card.
  //
  // Finding 5: covers `'loading'` as well as `'ready'` — not `'ready'`
  // alone. The skeleton renders in the card's real layout shape and now
  // reserves the same message-region height (ResumeCard.tsx), so it and the
  // resolved card share one offset and one height; only `'none'` (AC5) still
  // drops it. Without this the popup double-shifted: once when the skeleton
  // mounted flush, a second time when it resolved to `'ready'` and the
  // offset kicked in — worse now that D-7.3-10 lets `'loading'` last up to
  // `COLD_START_SKELETON_BUDGET_MS` on a cold start.
  const breaksHeaderBaseline = connected && resume.status !== 'none';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <ChromeHeader
        connected={connected}
        userInitial={userInitial}
        seconds={todayTotal.seconds}
        targetHours={targetHours}
        isPending={todayTotal.isPending}
      />

      <main
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-[14px] pb-[14px] ${
          breaksHeaderBaseline ? '-mt-[10px]' : ''
        }`}
      >
        {authState.kind === 'disconnected' && (
          <div className="pt-4 text-center">
            <h2 className="text-lg font-semibold text-neutral-900">
              {STRINGS.disconnectedHeading}
            </h2>
            <p className="mt-2 text-sm text-neutral-500">{STRINGS.disconnectedBody}</p>
            <div className="mt-4">
              <Button variant="primary" onClick={handleConnect}>
                {STRINGS.connectCta}
              </Button>
            </div>
          </div>
        )}
        {connected && resume.status !== 'none' && (
          <div className="mb-3">
            <ResumeCard resume={resume} onLogged={handleResumeLogged} />
          </div>
        )}
        {connected && (
          // AC7 / D-7.4-23: when the resume card is present, this renders
          // BELOW it (the block above). When `resume.status === 'none'`,
          // the block above renders nothing, so this becomes the FIRST
          // child of the scroll region and takes the autofocus the hour
          // input would otherwise have had — no special-casing needed here,
          // it falls out of the two blocks' fixed order.
          <SearchPanel
            ref={searchPanelRef}
            autoFocus={resume.status === 'none'}
            onLogged={handleSearchLogged}
            onActiveChange={handleSearchActiveChange}
          />
        )}
        {connected && (
          // D-7.4-18: `hidden` (the HTML ATTRIBUTE, not a Tailwind class —
          // jsdom honours the attribute but not the class, which is what
          // makes this AC machine-checkable) keeps `TodayView` MOUNTED while
          // a search is active, so its own `loggedEntries` state and the
          // running total it lifts via `onTotalChange` both survive a
          // search unharmed. A conditional render here would unmount it and
          // silently wipe the session's logged entries out of the chrome
          // header's total — see the story's D-7.4-18 for the exact hazard.
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
      </main>

      {connected && <PopupActionBar onLogged={handlePtoLogged} />}
    </div>
  );
}
