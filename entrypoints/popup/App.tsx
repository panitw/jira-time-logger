import { useEffect, useState } from 'react';

import { ManagerView } from '@/components/manager/ManagerView';
import { TodayView } from '@/components/today/TodayView';
import { WeekView } from '@/components/week/WeekView';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getCurrentCycleId } from '@/lib/cycle-range';
import { log } from '@/lib/log';
import { hasDirectReports } from '@/lib/manager-resolution';
import { approvalCycleItem } from '@/lib/storage/settings';
import { getAuth, hasValidAuth } from '@/lib/storage/tokens';
import { getPopupView, setPopupView, type PopupView } from '@/lib/storage/view-state';
import { currentWeekMonday } from '@/lib/week-of';

const STRINGS = {
  todayTab: 'Today',
  weekTab: 'Week',
  managerTab: 'Manager',
  disconnectedHeading: 'Connect to Jira',
  disconnectedBody:
    'Connect your Jira Cloud account to start logging time.',
  connectCta: 'Connect to Jira',
  loading: 'Loading\u2026',
  tabValueToday: 'today',
  tabValueWeek: 'week',
  tabValueManager: 'manager',
};

type AuthState =
  | { kind: 'loading' }
  | { kind: 'connected' }
  | { kind: 'disconnected' };

export function App(): React.ReactElement {
  const [authState, setAuthState] = useState<AuthState>({ kind: 'loading' });
  const [view, setView] = useState<PopupView | null>(null);
  // null = still resolving; the Manager tab is hidden while resolving and when
  // the user has no reports (or the lookup errored — `hasDirectReports` fails
  // closed to false). Never rendered disabled (UX-DR18).
  const [managesReports, setManagesReports] = useState<boolean | null>(null);
  const [approvalCycle, setApprovalCycle] = useState('calendar-month');

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const bundle = await getAuth();
        if (ac.signal.aborted) return;
        const connected = hasValidAuth(bundle);
        if (!ac.signal.aborted) {
          setAuthState(connected ? { kind: 'connected' } : { kind: 'disconnected' });
        }
      } catch {
        if (!ac.signal.aborted) {
          setAuthState({ kind: 'disconnected' });
        }
      }
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const saved = await getPopupView();
        if (!ac.signal.aborted) {
          setView(saved);
        }
      } catch {
        if (!ac.signal.aborted) {
          setView({ kind: 'today' });
        }
      }
    })();
    return () => ac.abort();
  }, []);

  // Resolve the cycle cadence + whether the user manages anyone. Non-blocking:
  // the popup renders Today/Week immediately; the Manager tab only appears once
  // this resolves true. `hasDirectReports` fails closed to false on any error.
  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const [cycle, manages] = await Promise.all([
          approvalCycleItem.getValue(),
          hasDirectReports(),
        ]);
        if (!ac.signal.aborted) {
          setApprovalCycle(cycle);
          setManagesReports(manages);
        }
      } catch {
        if (!ac.signal.aborted) {
          setManagesReports(false);
        }
      }
    })();
    return () => ac.abort();
  }, []);

  // Stale-state guard (AC 9): if a persisted `manager-matrix` view is restored
  // but the user no longer manages anyone, fall back to Today and persist it.
  // Runs only once reports resolve so it never fights the loading state.
  useEffect(() => {
    if (managesReports === false && view?.kind === 'manager-matrix') {
      const fallback: PopupView = { kind: 'today' };
      setView(fallback);
      void setPopupView(fallback).catch(() => {
        // View state is non-critical — worst case user sees default on next open
      });
    }
  }, [managesReports, view]);

  const handleTabChange = (value: string): void => {
    let newView: PopupView;
    if (value === STRINGS.tabValueManager) {
      newView = { kind: 'manager-matrix', cycle: getCurrentCycleId(approvalCycle) };
    } else if (value === STRINGS.tabValueWeek) {
      newView = { kind: 'week', weekOf: currentWeekMonday() };
    } else {
      newView = { kind: 'today' };
    }
    setView(newView);
    void setPopupView(newView).catch(() => {
      // View state is non-critical — worst case user sees default on next open
    });
  };

  const handleConnect = (): void => {
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) {
        log.warn('popup.openOptionsPage.error', {
          message: chrome.runtime.lastError.message,
        });
      }
    });
  };

  if (authState.kind === 'loading' || view === null) {
    return (
      <div className="min-w-[360px] p-4">
        <p className="text-sm text-neutral-500">{STRINGS.loading}</p>
      </div>
    );
  }

  if (authState.kind === 'disconnected') {
    return (
      <div className="min-w-[360px] p-4 text-center">
        <h2 className="text-lg font-semibold text-neutral-900">
          {STRINGS.disconnectedHeading}
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          {STRINGS.disconnectedBody}
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={handleConnect}>
            {STRINGS.connectCta}
          </Button>
        </div>
      </div>
    );
  }

  // The Manager trigger/content are only rendered once reports resolve true, so
  // never select the Manager tab before then — otherwise a restored
  // `manager-matrix` view would point Radix at a value with no rendered tab,
  // blanking the popup body during the async resolution window (and briefly
  // before the stale-state guard rewrites the view to Today).
  const activeTab =
    view.kind === 'manager-matrix' && managesReports === true
      ? STRINGS.tabValueManager
      : view.kind === 'week'
        ? STRINGS.tabValueWeek
        : STRINGS.tabValueToday;

  return (
    <div className="min-w-[360px] p-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value={STRINGS.tabValueToday}>
            {STRINGS.todayTab}
          </TabsTrigger>
          <TabsTrigger value={STRINGS.tabValueWeek}>
            {STRINGS.weekTab}
          </TabsTrigger>
          {managesReports === true && (
            <TabsTrigger value={STRINGS.tabValueManager}>
              {STRINGS.managerTab}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value={STRINGS.tabValueToday} forceMount>
          <TodayView />
        </TabsContent>
        <TabsContent value={STRINGS.tabValueWeek} forceMount>
          <WeekView weekOf={view.kind === 'week' ? view.weekOf : currentWeekMonday()} />
        </TabsContent>
        {managesReports === true && (
          <TabsContent value={STRINGS.tabValueManager}>
            <ManagerView
              cycle={view.kind === 'manager-matrix' ? view.cycle : getCurrentCycleId(approvalCycle)}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}