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

vi.mock('@/components/week/WeekView', () => ({
  WeekView: ({ weekOf }: { weekOf: string }) => (
    <div data-testid="week-view">Week of {weekOf}</div>
  ),
}));

vi.mock('@/components/manager/ManagerView', () => ({
  ManagerView: ({ cycle }: { cycle: string; onSwitchToToday: () => void }) => (
    <div data-testid="manager-view">Manager cycle {cycle}</div>
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

  it('the Settings section renders a thin panel whose action calls chrome.runtime.openOptionsPage', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('week-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByText('Open settings'));
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
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

  it('has zero Critical/Serious axe violations', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByTestId('week-view')).toBeTruthy());
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });
});
