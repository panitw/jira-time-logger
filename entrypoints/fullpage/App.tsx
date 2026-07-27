import { addWeeks, format, parseISO } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { ManagerView } from '@/components/manager/ManagerView';
import { SettingsView } from '@/components/settings/SettingsView';
import { SectionTabs } from '@/components/shared/SectionTabs';
import { Button } from '@/components/ui/button';
import { WeekView } from '@/components/week/WeekView';
import { getCurrentCycleId } from '@/lib/cycle-range';
import { hasDirectReports } from '@/lib/manager-resolution';
import type { FullPageSection } from '@/lib/open-full-page';
import { approvalCycleItem } from '@/lib/storage/settings';
import { getAuth, hasValidAuth } from '@/lib/storage/tokens';
import type { ISODate } from '@/lib/storage/view-state';
import { currentWeekMonday } from '@/lib/week-of';

/**
 * Full-page host shell (Story 7.2, AC5/AC7; Story 7.10, D-7.10-30): a THIN
 * shell only — Week/Manager/Settings section routing. No router library —
 * a discriminated-union view state seeded from `?section=` on the URL
 * (architecture.md > View routing).
 *
 * Story 7.10 removes this shell's own plain `<nav>` (Story 7.2's interim
 * tab row) entirely — the shared `SectionTabs` component now lives INSIDE
 * each section's own chrome header (`WeekChromeHeader`, `MatrixChromeHeader`,
 * `SettingsChromeHeader`), following the established D-7.7-22 pattern that
 * chrome lives inside the section component, not this shell. `section` /
 * `setSection` / `managesReports` are threaded down as props instead.
 *
 * Settings now mounts the real `SettingsView` (Story 7.10) — the D-7.2-5
 * placeholder body is gone. `entrypoints/options/` redirects here rather
 * than being removed (D-7.10-39); this shell no longer calls
 * `chrome.runtime.openOptionsPage()` anywhere.
 */

type Section = FullPageSection;

type AuthState = 'loading' | 'connected' | 'disconnected';

const STRINGS = {
  disconnectedHeading: 'Connect to Jira',
  disconnectedBody: 'Connect your Jira Cloud account to start logging time.',
  connectCta: 'Connect to Jira',
};

function sectionFromURL(): Section {
  const raw = new URLSearchParams(window.location.search).get('section');
  return raw === 'manager' || raw === 'settings' ? raw : 'week';
}

export function App(): React.ReactElement {
  const [section, setSectionState] = useState<Section>(() => sectionFromURL());
  const [authState, setAuthState] = useState<AuthState>('loading');
  // null = still resolving (or fails-closed to false on error) — the Manager
  // nav item stays hidden until this resolves true. Never rendered disabled
  // (UX-DR18) — reproduces the removed popup tab's exact semantics.
  const [managesReports, setManagesReports] = useState<boolean | null>(null);
  const [approvalCycle, setApprovalCycle] = useState('calendar-month');
  // Story 7.7, D-7.7-25: the ONE genuinely new piece of state AC2 needs — the
  // chrome header's prev/next nav. `useWeekWorklogs` keys on
  // `['week-worklogs', weekOf]`, so moving weeks is just a new query key; no
  // cache surgery, and D-7.2-2's ban on
  // `invalidateQueries(['week-worklogs'])` is not engaged.
  const [weekOf, setWeekOf] = useState<ISODate>(() => currentWeekMonday());
  const handlePrevWeek = useCallback(() => {
    setWeekOf((prev) => format(addWeeks(parseISO(prev), -1), 'yyyy-MM-dd'));
  }, []);
  const handleNextWeek = useCallback(() => {
    setWeekOf((prev) => format(addWeeks(parseISO(prev), 1), 'yyyy-MM-dd'));
  }, []);

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

  // D-7.10-40: once `entrypoints/options/` redirects here (D-7.10-39), calling
  // `chrome.runtime.openOptionsPage()` from THIS page would open a new tab
  // that redirects straight back to the page you are already on. Switch
  // sections in place instead.
  const handleConnect = useCallback((): void => {
    setSection('settings');
  }, [setSection]);

  // Unstyled is fine here (7.7/7.8/7.10 give each section its own KKP
  // chrome) — a neutral container and nothing more. Widened to 1180px,
  // and DECLARED to be so (D-7.10-36e/R-1) — `round2:790` draws Surface 2
  // (Week) at the same 1180px, so Week/Manager growing to match Settings
  // is intentional, not a side effect.
  //
  // Finding 10: this container used to be `max-w-[1180px] px-4`. Under
  // `border-box` (Tailwind preflight), `px-4` (32px) is subtracted from
  // the CONTENT box, so the actual content width was 1148px, not 1180 —
  // silently absorbed by SettingsView's own `max-w-full` clamp, so nothing
  // visibly broke and no test could see it. No horizontal padding here:
  // each section owns a full-bleed card (`rounded-[10px] border …`) with
  // its own internal padding, so the outer container doesn't need any.
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1180px] py-6">
        {authState === 'disconnected' && section !== 'settings' ? (
          // Finding 7: at baseline the shell's own `<nav>` painted above
          // this gate unconditionally, so every section stayed reachable
          // while disconnected. Removing that nav (D-7.10-30) left this the
          // one branch with no chrome and no way out except the CTA. A
          // minimal chrome bar carrying the real, unmocked `SectionTabs`
          // restores it — the same component every other surface uses.
          <div className="overflow-hidden rounded-[10px] border border-border bg-background shadow-raised">
            <header className="bg-chrome-gradient rounded-t-[10px] px-[26px] pb-[14px] pt-[16px]">
              <SectionTabs
                active={section}
                onSelect={setSection}
                showManager={managesReports === true}
              />
            </header>
            <div className="p-10 text-center">
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
          </div>
        ) : (
          <>
            {section === 'week' && (
              <WeekView
                weekOf={weekOf}
                onPrevWeek={handlePrevWeek}
                onNextWeek={handleNextWeek}
                section={section}
                onSectionChange={setSection}
                showManagerTab={managesReports === true}
              />
            )}
            {/* Finding 6: was `managesReports === true`, which matched
             * neither `true` nor `null` (the pending window before
             * `hasDirectReports()` resolves) nor `false` — a stale
             * `?section=manager` deep link landed on NO branch at all
             * while pending, rendering a blank, escape-proof page. `!==
             * false` covers the pending window too; the defensive
             * fallback effect above still redirects to Week the moment
             * this resolves false. */}
            {section === 'manager' && managesReports !== false && (
              <ManagerView
                cycle={getCurrentCycleId(approvalCycle)}
                // Misnomer inherited from the popup — there is no Today
                // section on the full page, so the defensive no-reports
                // fallback above lands on Week instead. Do not rename this
                // prop here (7.8 may).
                onSwitchToToday={() => setSection('week')}
                section={section}
                onSectionChange={setSection}
                showManagerTab={managesReports === true}
              />
            )}
            {section === 'settings' && (
              <SettingsView
                section={section}
                onSectionChange={setSection}
                showManagerTab={managesReports === true}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
