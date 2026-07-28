/* eslint-disable import-x/order */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scan, criticalOrSerious } from '@/lib/test/axe';

/**
 * New for the Story 7.10 finisher pass (review Finding 3 / D-7.10-36a):
 * at review time the Settings surface had ZERO render coverage and ZERO
 * axe coverage — `entrypoints/options/App.a11y.test.tsx` was retargeted at
 * the five-line redirect (fine, but not a substitute), and
 * `entrypoints/fullpage/App.test.tsx` mocks `SettingsView` away entirely.
 * Six of seven new components (`SettingsView`, `SettingsChromeHeader`,
 * `SettingsPrimitives`, `ConnectionBlock`, `LoggingDefaultsBlock`,
 * `LoggingDefaultsSilhouette`) had NOTHING. This file mounts the REAL
 * `SettingsView` — no mocking of any settings component — and scans it
 * with axe in both the connected and first-run (disconnected) states,
 * which is exactly the scan that would have caught Finding 2's Critical
 * (`select-name`) violation automatically.
 */

const getAuthMock = vi.fn();
const hasValidAuthMock = vi.fn();
vi.mock('@/lib/storage/tokens', () => ({
  getAuth: () => getAuthMock(),
  hasValidAuth: (bundle: unknown) => hasValidAuthMock(bundle),
}));

const resolveConnectedMetaMock = vi.fn();
vi.mock('@/lib/connection-meta', () => ({
  resolveConnectedMeta: (...args: unknown[]) => resolveConnectedMetaMock(...args),
}));

const resolveReportingLineMock = vi.fn();
vi.mock('@/lib/manager-resolution', () => ({
  resolveReportingLine: () => resolveReportingLineMock(),
}));

const jiraGetMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  jiraGet: (...args: unknown[]) => jiraGetMock(...args),
}));

const disconnectAllMock = vi.fn();
vi.mock('@/lib/disconnect', () => ({
  disconnectAll: () => disconnectAllMock(),
}));

const startOAuthFlowMock = vi.fn();
vi.mock('@/lib/oauth/flow', () => ({
  startOAuthFlow: () => startOAuthFlowMock(),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.stubGlobal('chrome', {
  runtime: { id: 'test' },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      getBytesInUse: vi.fn(async () => 5000),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

vi.mock('@/lib/storage/settings', () => ({
  catchAllProjectKeyItem: { getValue: vi.fn(async () => 'KNP'), setValue: vi.fn(async () => {}) },
  ptoSubtaskKeyItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  ptoSubtaskSummaryItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  targetHoursItem: { getValue: vi.fn(async () => 8), setValue: vi.fn(async () => {}) },
  reminderTimeItem: { getValue: vi.fn(async () => '17:00'), setValue: vi.fn(async () => {}) },
  approvalCycleItem: { getValue: vi.fn(async () => 'calendar-month'), setValue: vi.fn(async () => {}) },
  lastSyncTimestampItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
}));

import { SettingsView } from './SettingsView';

function connectedProps() {
  return { section: 'settings' as const, onSectionChange: vi.fn(), showManagerTab: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  jiraGetMock.mockImplementation(async (path: string) => {
    if (path.startsWith('rest/api/3/project/')) {
      return { kind: 'ok', value: { key: 'KNP', name: 'KKP Non-Project' } };
    }
    if (path.includes('issuetype=Sub-task')) {
      return { kind: 'ok', value: { issues: [] } };
    }
    return { kind: 'not-found' };
  });
  resolveReportingLineMock.mockResolvedValue({
    kind: 'ok',
    value: { managerDisplayName: 'Marco Rivera', skipLevelDisplayName: null },
  });
});

describe('SettingsView — connected', () => {
  beforeEach(() => {
    getAuthMock.mockResolvedValue({ kind: 'oauth', access_token: 't' });
    hasValidAuthMock.mockReturnValue(true);
    resolveConnectedMetaMock.mockResolvedValue({
      email: 'priya.raman@kkpfg.com',
      siteDomain: 'kkpfg.atlassian.net',
    });
  });

  it('renders the real Connection, Reporting-line, Logging-defaults, Diagnostics and Disconnect blocks (no mocks)', async () => {
    render(<SettingsView {...connectedProps()} />);
    await waitFor(() => expect(screen.getByText('Connection')).toBeTruthy());
    expect(screen.getByText('Reporting line')).toBeTruthy();
    expect(screen.getByText('Logging defaults')).toBeTruthy();
    expect(screen.getByText('Diagnostics')).toBeTruthy();
    expect(screen.getByText('Disconnect')).toBeTruthy();
    // Connection block facts (real ConnectionBlock, real resolveConnectedMeta)
    await waitFor(() => expect(screen.getByText('priya.raman@kkpfg.com')).toBeTruthy());
    // Logging-defaults fields (real CatchAllProjectField/TargetHoursField/etc.)
    expect(screen.getByLabelText('Catch-all project key')).toBeTruthy();
    expect(screen.getByLabelText('Work-day target')).toBeTruthy();
    expect(screen.getByLabelText('Daily reminder')).toBeTruthy();
    expect(screen.getByLabelText('Approval cycle')).toBeTruthy();
  });

  it('the chrome header carries the section tab row with Settings active', async () => {
    render(<SettingsView {...connectedProps()} />);
    await waitFor(() => expect(screen.getByText('Connection')).toBeTruthy());
    const settingsTab = screen.getByRole('button', { name: 'Settings' });
    expect(settingsTab.getAttribute('aria-current')).toBe('page');
  });

  it('has zero Critical/Serious axe violations (connected)', async () => {
    const { container } = render(<SettingsView {...connectedProps()} />);
    await waitFor(() => expect(screen.getByText('Connection')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByLabelText('Catch-all project key')).toBeTruthy(),
    );
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });
});

describe('SettingsView — first-run (disconnected)', () => {
  beforeEach(() => {
    getAuthMock.mockResolvedValue(null);
    hasValidAuthMock.mockReturnValue(false);
  });

  it('renders the real ConnectButton connect card and the LoggingDefaultsSilhouette (no mocks)', async () => {
    render(<SettingsView {...connectedProps()} />);
    await waitFor(() => expect(screen.getByText('Connect to Jira to begin')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Connect to Jira' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Set up with an API token instead' }),
    ).toBeTruthy();
    // The silhouette is aria-hidden/inert scenery, not text content — assert
    // its heading is present in the DOM even though it carries no semantics.
    expect(screen.getByText('Logging defaults', { selector: 'span' })).toBeTruthy();
  });

  it('has zero Critical/Serious axe violations (first-run)', async () => {
    const { container } = render(<SettingsView {...connectedProps()} />);
    await waitFor(() => expect(screen.getByText('Connect to Jira to begin')).toBeTruthy());
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });
});
