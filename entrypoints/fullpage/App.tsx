import { useCallback, useEffect, useState } from 'react';
import { ManagerView } from '@/components/manager/ManagerView';
import { Button } from '@/components/ui/button';
import { WeekView } from '@/components/week/WeekView';
import { getCurrentCycleId } from '@/lib/cycle-range';
import { log } from '@/lib/log';
import { hasDirectReports } from '@/lib/manager-resolution';
import { approvalCycleItem } from '@/lib/storage/settings';
import { getAuth, hasValidAuth } from '@/lib/storage/tokens';
import { currentWeekMonday } from '@/lib/week-of';

/**
 * Full-page host shell (Story 7.2, AC5/AC7, ORCHESTRATOR DECISION D-7.2-1):
 * a THIN shell only — Week/Manager/Settings section routing that mounts the
 * EXISTING `WeekView`/`ManagerView` completely unchanged and unrestyled.
 * Removing the popup's tabs orphans them; this is where they now live. No
 * router library — a discriminated-union view state seeded from `?section=`
 * on the URL (architecture.md > View routing).
 *
 * Story 7.7 gives this page its KKP chrome header, the revamped week grid,
 * cell anatomy, totals row, and the gap dialog. Do NOT restyle `WeekView` /
 * `WeeklyGrid` / `ManagerView` / `ManagerMatrix` here.
 */

type Section = 'week' | 'manager' | 'settings';

const STRINGS = {
  week: 'Week',
  manager: 'Manager',
  settings: 'Settings',
  disconnectedHeading: 'Connect to Jira',
  disconnectedBody: 'Connect your Jira Cloud account to start logging time.',
  connectCta: 'Connect to Jira',
  settingsBody:
    'Manage your Jira connection, catch-all project, PTO subtask, and reminders.',
  openSettings: 'Open settings',
};

type AuthState = 'loading' | 'connected' | 'disconnected';

const NAV_BUTTON_CLASS =
  'rounded-md px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 aria-[current=page]:bg-neutral-100 aria-[current=page]:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

function sectionFromURL(): Section {
  const raw = new URLSearchParams(window.location.search).get('section');
  return raw === 'manager' || raw === 'settings' ? raw : 'week';
}

/** Story 7.10 slot: hands off to the existing options page — the nav item
 * is spec-mandated (EXPERIENCE.md lines 60-62); only this body is
 * provisional. */
function openOptions(): void {
  chrome.runtime.openOptionsPage();
}

export function App(): React.ReactElement {
  const [section, setSectionState] = useState<Section>(() => sectionFromURL());
  const [authState, setAuthState] = useState<AuthState>('loading');
  // null = still resolving (or fails-closed to false on error) — the Manager
  // nav item stays hidden until this resolves true. Never rendered disabled
  // (UX-DR18) — reproduces the removed popup tab's exact semantics.
  const [managesReports, setManagesReports] = useState<boolean | null>(null);
  const [approvalCycle, setApprovalCycle] = useState('calendar-month');

  const setSection = useCallback((next: Section): void => {
    setSectionState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('section', next);
    window.history.replaceState(null, '', url.toString());
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const bundle = await getAuth();
        if (ac.signal.aborted) return;
        setAuthState(hasValidAuth(bundle) ? 'connected' : 'disconnected');
      } catch {
        if (!ac.signal.aborted) setAuthState('disconnected');
      }
    })();
    return () => ac.abort();
  }, []);

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
        if (!ac.signal.aborted) setManagesReports(false);
      }
    })();
    return () => ac.abort();
  }, []);

  // Defensive fallback (mirrors the removed popup tab's stale-state guard):
  // if Manager is selected (e.g. via a stale `?section=manager` URL) but the
  // user turns out to have no reports, fall back to Week — there is no Today
  // section on the full page for it to fall back to.
  useEffect(() => {
    if (managesReports === false && section === 'manager') {
      setSection('week');
    }
  }, [managesReports, section, setSection]);

  const handleConnect = (): void => {
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) {
        log.warn('fullpage.openOptionsPage.error', {
          message: chrome.runtime.lastError.message,
        });
      }
    });
  };

  // Unstyled is fine here (7.7 gives it KKP chrome) — a neutral container and
  // nothing more.
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <nav className="flex items-center gap-2 border-b border-border pb-2" aria-label="Sections">
          <button
            type="button"
            aria-current={section === 'week' ? 'page' : undefined}
            onClick={() => setSection('week')}
            className={NAV_BUTTON_CLASS}
          >
            {STRINGS.week}
          </button>
          {managesReports === true && (
            <button
              type="button"
              aria-current={section === 'manager' ? 'page' : undefined}
              onClick={() => setSection('manager')}
              className={NAV_BUTTON_CLASS}
            >
              {STRINGS.manager}
            </button>
          )}
          <button
            type="button"
            aria-current={section === 'settings' ? 'page' : undefined}
            onClick={() => setSection('settings')}
            className={NAV_BUTTON_CLASS}
          >
            {STRINGS.settings}
          </button>
        </nav>

        <div className="mt-4">
          {authState === 'disconnected' && section !== 'settings' ? (
            <div className="text-center">
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
          ) : (
            <>
              {section === 'week' && <WeekView weekOf={currentWeekMonday()} />}
              {section === 'manager' && managesReports === true && (
                <ManagerView
                  cycle={getCurrentCycleId(approvalCycle)}
                  // Misnomer inherited from the popup — there is no Today
                  // section on the full page, so the defensive no-reports
                  // fallback above lands on Week instead. Do not rename this
                  // prop here (7.8 may).
                  onSwitchToToday={() => setSection('week')}
                />
              )}
              {section === 'settings' && (
                <div className="text-center">
                  <p className="text-sm text-neutral-500">{STRINGS.settingsBody}</p>
                  {/* Story 7.10 replaces this body in place. */}
                  <div className="mt-4">
                    <Button variant="primary" onClick={openOptions}>
                      {STRINGS.openSettings}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
