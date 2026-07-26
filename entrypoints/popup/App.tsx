import { useCallback, useEffect, useState } from 'react';
import { ChromeHeader } from '@/components/shell/ChromeHeader';
import { PopupActionBar } from '@/components/shell/PopupActionBar';
import type { EditPatch, LoggedEntry } from '@/components/today/LoggedToday';
import { TodayView } from '@/components/today/TodayView';
import { Button } from '@/components/ui/button';
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

  // Two independent contributions to "seconds logged this popup session"
  // (D-7.2-2): TodayView's own QuickLogForm-originated entries (lifted via
  // `onTotalChange`), and the relocated action-bar PtoQuickAction's entries.
  //
  // Story 7.2 Finding 3: the PTO contribution is a full entries LIST owned
  // here (`ptoEntries`), not a monotonic seconds accumulator — a monotonic
  // counter can never be decremented, which silently dropped the in-popup
  // edit/delete correction path a time-off entry had before this story
  // relocated `PtoQuickAction` out of `TodayView`. The list is passed down to
  // `TodayView` as `externalEntries` so it renders in "Logged today" with
  // working edit/delete (routed back here), and `ptoSeconds` is derived from
  // it so editing/deleting a PTO entry is reflected in the header for free.
  const [todayViewSeconds, setTodayViewSeconds] = useState(0);
  const [ptoEntries, setPtoEntries] = useState<LoggedEntry[]>([]);
  const ptoSeconds = ptoEntries.reduce((sum, e) => sum + e.seconds, 0);
  const sessionSeconds = todayViewSeconds + ptoSeconds;

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

  const handlePtoEntryEdited = useCallback((worklogId: string, patch: EditPatch): void => {
    setPtoEntries((prev) =>
      prev.map((e) => (e.worklogId === worklogId ? { ...e, ...patch } : e)),
    );
  }, []);

  const handlePtoEntryDeleted = useCallback((worklogId: string): void => {
    setPtoEntries((prev) => prev.filter((e) => e.worklogId !== worklogId));
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

  const connected = authState.kind === 'connected';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <ChromeHeader
        connected={connected}
        userInitial={userInitial}
        seconds={todayTotal.seconds}
        targetHours={targetHours}
        isPending={todayTotal.isPending}
      />

      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-[14px] pb-[14px]">
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
        {connected && (
          <TodayView
            onTotalChange={handleTodayViewTotalChange}
            externalEntries={ptoEntries}
            onExternalEntryEdited={handlePtoEntryEdited}
            onExternalEntryDeleted={handlePtoEntryDeleted}
          />
        )}
      </main>

      {connected && <PopupActionBar onLogged={handlePtoLogged} />}
    </div>
  );
}
