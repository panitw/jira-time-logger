import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * New for the Story 7.10 finisher pass (review Finding 8 / D-7.10-30's own
 * explicit requirement, restated at D-7.10-36i): every existing shell test
 * in `App.test.tsx` renders against a 30-line hand-written `fakeNav` stand-in
 * for `SectionTabs` — mutating the REAL `SectionTabs` to return `null`
 * leaves all 14 of those tests GREEN, because nothing in that file ever
 * mounts the real component. This file unmocks BOTH `WeekView` (so its real
 * `WeekChromeHeader` → real `SectionTabs` renders) and `SettingsView` (so
 * the real destination mounts) and drives one genuine click through a real
 * tab button — the round trip `App.test.tsx`'s mocks cannot prove.
 *
 * `ManagerView` stays mocked — this test's job is the Week → Settings round
 * trip specifically (per the review's own suggested resolution), not a full
 * re-proof of every section; Manager's own real-`SectionTabs` wiring is
 * already covered by `MatrixChromeHeader.test.tsx`.
 */

// ---- lib/storage/tokens — shared by App.tsx and SettingsView -------------
const getAuthMock = vi.fn();
const hasValidAuthMock = vi.fn();
vi.mock('@/lib/storage/tokens', () => ({
  getAuth: () => getAuthMock(),
  hasValidAuth: (bundle: unknown) => hasValidAuthMock(bundle),
}));

// ---- lib/manager-resolution — hasDirectReports (App.tsx) + resolveReportingLine (SettingsView) ----
const hasDirectReportsMock = vi.fn();
const resolveReportingLineMock = vi.fn();
vi.mock('@/lib/manager-resolution', () => ({
  hasDirectReports: () => hasDirectReportsMock(),
  resolveReportingLine: () => resolveReportingLineMock(),
}));

// ---- WeekView's own real-component recipe (copied from WeekView.test.tsx) ----
const useWeekWorklogsMock = vi.fn();
vi.mock('@/hooks/useWeekWorklogs', () => ({
  useWeekWorklogs: (...args: unknown[]) => useWeekWorklogsMock(...args),
}));

vi.mock('@/components/week/WeeklyGrid', () => ({
  WeeklyGrid: () => <div data-testid="weekly-grid" />,
}));

vi.mock('@/lib/storage/view-state', () => ({
  getMarkDoneState: async () => null,
  clearWeekMarkedDone: async () => {},
  setWeekMarkedDone: async () => {},
}));

vi.mock('@/lib/messages', () => ({
  sendMessage: async () => {},
}));

// ---- Settings' own real-component recipe (copied from SettingsView.test.tsx) ----
const resolveConnectedMetaMock = vi.fn();
vi.mock('@/lib/connection-meta', () => ({
  resolveConnectedMeta: (...args: unknown[]) => resolveConnectedMetaMock(...args),
}));

const jiraGetMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  jiraGet: (...args: unknown[]) => jiraGetMock(...args),
}));

vi.mock('@/lib/disconnect', () => ({
  disconnectAll: async () => ({ kind: 'ok', value: undefined }),
}));

vi.mock('@/lib/oauth/flow', () => ({
  startOAuthFlow: async () => ({ kind: 'oauth-cancelled' }),
}));

// ---- shared by both real trees ----
vi.mock('@/lib/storage/settings', () => ({
  targetHoursItem: { getValue: async () => 8, setValue: async () => {} },
  catchAllProjectKeyItem: { getValue: async () => 'KNP', setValue: async () => {} },
  ptoSubtaskKeyItem: { getValue: async () => null, setValue: async () => {} },
  ptoSubtaskSummaryItem: { getValue: async () => null, setValue: async () => {} },
  reminderTimeItem: { getValue: async () => '17:00', setValue: async () => {} },
  approvalCycleItem: { getValue: async () => 'calendar-month', setValue: async () => {} },
  lastSyncTimestampItem: { getValue: async () => null, setValue: async () => {} },
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/manager/ManagerView', () => ({
  ManagerView: () => <div data-testid="manager-view" />,
}));

vi.stubGlobal('chrome', {
  runtime: { id: 'test', openOptionsPage: vi.fn() },
  storage: {
    local: {
      get: async () => ({}),
      set: async () => {},
      remove: async () => {},
      getBytesInUse: async () => 5000,
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

const { App } = await import('./App');

function setUrl(search: string): void {
  window.history.pushState({}, '', `/fullpage.html${search}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  setUrl('');
  getAuthMock.mockResolvedValue({ kind: 'oauth', access_token: 't' });
  hasValidAuthMock.mockReturnValue(true);
  hasDirectReportsMock.mockResolvedValue(false);
  resolveConnectedMetaMock.mockResolvedValue({
    email: 'priya.raman@kkpfg.com',
    siteDomain: 'kkpfg.atlassian.net',
  });
  resolveReportingLineMock.mockResolvedValue({
    kind: 'ok',
    value: { managerDisplayName: null, skipLevelDisplayName: null },
  });
  jiraGetMock.mockImplementation(async (path: string) => {
    if (path.startsWith('rest/api/3/project/')) {
      return { kind: 'ok', value: { key: 'KNP', name: 'KKP Non-Project' } };
    }
    if (path.includes('issuetype=Sub-task')) return { kind: 'ok', value: { issues: [] } };
    return { kind: 'not-found' };
  });
  useWeekWorklogsMock.mockReturnValue({
    isPending: false,
    isError: false,
    // `buildWeekGrid` takes `WeekIssueWorklogs[]` directly — an empty week.
    data: [],
    refetch: vi.fn(),
  });
});

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    React.createElement(QueryClientProvider, { client }, React.createElement(App)),
  );
}

describe('fullpage App — real Week → Settings round trip (Finding 8)', () => {
  it('a real click on the REAL SectionTabs (inside the REAL WeekChromeHeader) mounts the REAL SettingsView, and the URL updates', async () => {
    renderApp();
    // Real WeekChromeHeader renders (unmocked WeekView) — its real
    // SectionTabs carries the "Settings" tab button, not fakeNav's.
    const settingsTab = await screen.findByRole('button', { name: 'Settings' });
    fireEvent.click(settingsTab);

    // The real SettingsView mounted — proven by content that ONLY the real
    // component renders (a fact block heading + a real labelled control),
    // not a `data-testid` stub.
    await waitFor(() => expect(screen.getByText('Connection')).toBeTruthy());
    await waitFor(() => expect(screen.getByLabelText('Catch-all project key')).toBeTruthy());
    expect(screen.queryByTestId('weekly-grid')).toBeNull();

    expect(new URLSearchParams(window.location.search).get('section')).toBe('settings');
  });

  it('navigating back to Week from the real SettingsView tab row also works (symmetric)', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(screen.getByText('Connection')).toBeTruthy());

    // The real SettingsChromeHeader's own SectionTabs — a DIFFERENT
    // component instance than the one that navigated here.
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() => expect(screen.getByTestId('weekly-grid')).toBeTruthy());
    expect(new URLSearchParams(window.location.search).get('section')).toBe('week');
  });
});
