import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scan, criticalOrSerious } from '@/lib/test/axe';

const mockGetAuth = vi.fn();
const mockHasValidAuth = vi.fn();
const mockHasDirectReports = vi.fn();
const mockApprovalCycleGet = vi.fn();

vi.mock('@/lib/storage/tokens', () => ({
  getAuth: () => mockGetAuth(),
  hasValidAuth: (bundle: unknown) => mockHasValidAuth(bundle),
}));

vi.mock('@/lib/manager-resolution', () => ({
  hasDirectReports: () => mockHasDirectReports(),
}));

vi.mock('@/lib/storage/settings', () => ({
  approvalCycleItem: { getValue: () => mockApprovalCycleGet() },
}));

/**
 * Story 7.10, D-7.10-30: the shell no longer renders its own `<nav>` — each
 * section now carries the shared `SectionTabs` inside its OWN chrome
 * header. These mocks render a minimal stand-in nav from the
 * `section`/`onSectionChange`/`showManagerTab` props the shell now passes
 * down, so this file keeps proving the SHELL's routing/prop-plumbing
 * responsibility without re-testing `SectionTabs` itself (that component's
 * real, unmocked behaviour is proven directly in
 * `components/shared/SectionTabs.test.tsx` and in each real chrome header's
 * own test file).
 */
function fakeNav(
  section: string,
  onSectionChange: (s: string) => void,
  showManagerTab: boolean,
): React.ReactElement {
  return (
    <nav aria-label="Sections">
      <button
        type="button"
        aria-current={section === 'week' ? 'page' : undefined}
        onClick={() => onSectionChange('week')}
      >
        Week
      </button>
      {showManagerTab && (
        <button
          type="button"
          aria-current={section === 'manager' ? 'page' : undefined}
          onClick={() => onSectionChange('manager')}
        >
          Manager
        </button>
      )}
      <button
        type="button"
        aria-current={section === 'settings' ? 'page' : undefined}
        onClick={() => onSectionChange('settings')}
      >
        Settings
      </button>
    </nav>
  );
}

vi.mock('@/components/week/WeekView', () => ({
  WeekView: ({
    weekOf,
    onPrevWeek,
    onNextWeek,
    section,
    onSectionChange,
    showManagerTab,
  }: {
    weekOf: string;
    onPrevWeek?: () => void;
    onNextWeek?: () => void;
    section: string;
    onSectionChange: (s: string) => void;
    showManagerTab: boolean;
  }) => (
    <div data-testid="week-view">
      {fakeNav(section, onSectionChange, showManagerTab)}
      Week of {weekOf}
      <button type="button" onClick={onPrevWeek}>
        mock-prev
      </button>
      <button type="button" onClick={onNextWeek}>
        mock-next
      </button>
    </div>
  ),
}));

vi.mock('@/components/manager/ManagerView', () => ({
  ManagerView: ({
    cycle,
    section,
    onSectionChange,
    showManagerTab,
  }: {
    cycle: string;
    onSwitchToToday: () => void;
    section: string;
    onSectionChange: (s: string) => void;
    showManagerTab: boolean;
  }) => (
    <div data-testid="manager-view">
      {fakeNav(section, onSectionChange, showManagerTab)}
      Manager cycle {cycle}
    </div>
  ),
}));

vi.mock('@/components/settings/SettingsView', () => ({
  SettingsView: ({
    section,
    onSectionChange,
    showManagerTab,
  }: {
    section: string;
    onSectionChange: (s: string) => void;
    showManagerTab: boolean;
  }) => (
    <div data-testid="settings-view">
      {fakeNav(section, onSectionChange, showManagerTab)}
      Settings body
    </div>
  ),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { App } = await import('./App');

function setUrl(search: string) {
  window.history.pushState({}, '', `/fullpage.html${search}`);
}

function stubConnected() {
  mockGetAuth.mockResolvedValue({ kind: 'oauth', access_token: 't' });
  mockHasValidAuth.mockReturnValue(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  setUrl('');
  stubConnected();
  mockHasDirectReports.mockResolvedValue(false);
  mockApprovalCycleGet.mockResolvedValue('calendar-month');
  // @ts-expect-error minimal chrome stub
  globalThis.chrome = { runtime: { openOptionsPage: vi.fn() } };
});

describe('fullpage App', () => {
  it('defaults to the Week section', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('week-view')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Week' }).getAttribute('aria-current')).toBe('page');
  });

  it('renders no top-level shell nav — only the mounted section carries one (D-7.10-30)', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('week-view')).toBeTruthy());
    expect(screen.getAllByRole('navigation', { name: 'Sections' }).length).toBe(1);
  });

  it('?section=manager selects Manager once reports resolve true', async () => {
    setUrl('?section=manager');
    mockHasDirectReports.mockResolvedValue(true);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('manager-view')).toBeTruthy();
    });
    expect(screen.queryByTestId('week-view')).toBeNull();
  });

  it('the Manager nav item is absent while hasDirectReports() is pending', async () => {
    let resolveReports: (v: boolean) => void = () => {};
    mockHasDirectReports.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveReports = resolve;
      }),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('week-view')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Manager' })).toBeNull();
    resolveReports(false);
  });

  it('the Manager nav item is absent when hasDirectReports() resolves false', async () => {
    mockHasDirectReports.mockResolvedValue(false);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('week-view')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Manager' })).toBeNull();
  });

  it('the Manager nav item is absent when hasDirectReports() rejects', async () => {
    mockHasDirectReports.mockRejectedValue(new Error('directory down'));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('week-view')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Manager' })).toBeNull();
  });

  it('the Manager nav item is present when hasDirectReports() resolves true', async () => {
    mockHasDirectReports.mockResolvedValue(true);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Manager' })).toBeTruthy();
    });
  });

  it('clicking the Manager nav item mounts ManagerView with the resolved cycle', async () => {
    mockHasDirectReports.mockResolvedValue(true);
    mockApprovalCycleGet.mockResolvedValue('calendar-month');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manager' }));
    await waitFor(() => {
      expect(screen.getByTestId('manager-view')).toBeTruthy();
    });
    expect(screen.getByText(/Manager cycle \d{4}-\d{2}/)).toBeTruthy();
  });

  it('clicking the Settings nav item mounts the real SettingsView', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('week-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(screen.getByTestId('settings-view')).toBeTruthy());
  });

  // D-7.10-30: navigating FROM Settings back to Week also works — proves
  // the shell's `setSection` plumbing is symmetric, not one-directional.
  it('navigating from Settings back to Week works', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('week-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(screen.getByTestId('settings-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() => expect(screen.getByTestId('week-view')).toBeTruthy());
  });

  it('disconnected: shows the connect affordance instead of the Week section', async () => {
    mockGetAuth.mockResolvedValue(null);
    mockHasValidAuth.mockReturnValue(false);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Connect to Jira' })).toBeTruthy();
    });
    expect(screen.queryByTestId('week-view')).toBeNull();
  });

  // D-7.10-40: the disconnected fallback's CTA switches section IN PLACE —
  // it must never call chrome.runtime.openOptionsPage() (that would open a
  // new tab that redirects straight back here, per D-7.10-39).
  it('disconnected: the Connect to Jira CTA switches to Settings without opening a new tab', async () => {
    mockGetAuth.mockResolvedValue(null);
    mockHasValidAuth.mockReturnValue(false);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Connect to Jira' }));
    await waitFor(() => expect(screen.getByTestId('settings-view')).toBeTruthy());
    expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  // Story 7.7, D-7.7-25: `weekOf` is lifted to full-page state so the chrome
  // header's prev/next nav has somewhere to live.
  it('prev/next nav moves the queried week by one week (D-7.7-25)', async () => {
    render(<App />);
    const before = (await screen.findByTestId('week-view')).textContent;
    fireEvent.click(screen.getByText('mock-next'));
    await waitFor(() => {
      expect(screen.getByTestId('week-view').textContent).not.toBe(before);
    });
    const afterNext = screen.getByTestId('week-view').textContent;
    fireEvent.click(screen.getByText('mock-prev'));
    await waitFor(() => {
      expect(screen.getByTestId('week-view').textContent).toBe(before);
    });
    expect(afterNext).not.toBe(before);
  });

  it('has zero Critical/Serious axe violations', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByTestId('week-view')).toBeTruthy());
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });
});
