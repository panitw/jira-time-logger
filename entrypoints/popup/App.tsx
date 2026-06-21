import { useEffect, useState } from 'react';

import { TodayView } from '@/components/today/TodayView';
import { WeekView } from '@/components/week/WeekView';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { log } from '@/lib/log';
import { getAuth, hasValidAuth } from '@/lib/storage/tokens';
import { getPopupView, setPopupView, type PopupView } from '@/lib/storage/view-state';

const STRINGS = {
  todayTab: 'Today',
  weekTab: 'Week',
  disconnectedHeading: 'Connect to Jira',
  disconnectedBody:
    'Connect your Jira Cloud account to start logging time.',
  connectCta: 'Connect to Jira',
  loading: 'Loading\u2026',
  tabValueToday: 'today',
  tabValueWeek: 'week',
};

type AuthState =
  | { kind: 'loading' }
  | { kind: 'connected' }
  | { kind: 'disconnected' };

export function App(): React.ReactElement {
  const [authState, setAuthState] = useState<AuthState>({ kind: 'loading' });
  const [view, setView] = useState<PopupView | null>(null);

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

  const handleTabChange = (value: string): void => {
    const newView: PopupView =
      value === STRINGS.tabValueWeek
        ? { kind: 'week', weekOf: getCurrentWeekMonday() }
        : { kind: 'today' };
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

  const activeTab =
    view.kind === 'week' ? STRINGS.tabValueWeek : STRINGS.tabValueToday;

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
        </TabsList>
        <TabsContent value={STRINGS.tabValueToday} forceMount>
          <TodayView />
        </TabsContent>
        <TabsContent value={STRINGS.tabValueWeek} forceMount>
          <WeekView weekOf={view.kind === 'week' ? view.weekOf : getCurrentWeekMonday()} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function getCurrentWeekMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  return monday.toISOString().slice(0, 10);
}