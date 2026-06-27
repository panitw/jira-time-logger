import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuth = vi.fn();
const mockHasValidAuth = vi.fn();
const mockGetPopupView = vi.fn();
const mockSetPopupView = vi.fn();
const mockHasDirectReports = vi.fn();
const mockApprovalCycleGet = vi.fn();

vi.mock('@/lib/storage/tokens', () => ({
  getAuth: () => mockGetAuth(),
  hasValidAuth: (bundle: unknown) => mockHasValidAuth(bundle),
}));

vi.mock('@/lib/storage/view-state', () => ({
  getPopupView: () => mockGetPopupView(),
  setPopupView: (v: unknown) => mockSetPopupView(v),
}));

vi.mock('@/lib/manager-resolution', () => ({
  hasDirectReports: () => mockHasDirectReports(),
}));

vi.mock('@/lib/storage/settings', () => ({
  approvalCycleItem: { getValue: () => mockApprovalCycleGet() },
}));

vi.mock('@/components/today/TodayView', () => ({
  TodayView: () => <div data-testid="today-view">Today Placeholder</div>,
}));

vi.mock('@/components/week/WeekView', () => ({
  WeekView: ({ weekOf }: { weekOf: string }) => (
    <div data-testid="week-view">Week of {weekOf}</div>
  ),
}));

vi.mock('@/components/manager/ManagerView', () => ({
  ManagerView: ({ cycle }: { cycle: string }) => (
    <div data-testid="manager-view">Manager cycle {cycle}</div>
  ),
}));

import { App } from './App';

function stubConnected() {
  mockGetAuth.mockResolvedValue({ kind: 'oauth', access_token: 't' });
  mockHasValidAuth.mockReturnValue(true);
  mockGetPopupView.mockResolvedValue({ kind: 'today' });
  mockSetPopupView.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuth.mockResolvedValue(null);
  mockHasValidAuth.mockReturnValue(false);
  mockGetPopupView.mockResolvedValue({ kind: 'today' });
  mockSetPopupView.mockResolvedValue(undefined);
  mockHasDirectReports.mockResolvedValue(false);
  mockApprovalCycleGet.mockResolvedValue('calendar-month');
});

describe('App', () => {
  it('renders disconnected fallback when not connected', async () => {
    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByText(
          'Connect your Jira Cloud account to start logging time.',
        ),
      ).toBeTruthy();
    });
  });

  it('renders a connect button in disconnected state', async () => {
    render(<App />);
    await waitFor(() => {
      const buttons = screen.getAllByText('Connect to Jira');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders Today view when connected', async () => {
    stubConnected();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('today-view')).toBeTruthy();
    });
  });

  it('renders tab bar when connected', async () => {
    stubConnected();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeTruthy();
      expect(screen.getByText('Week')).toBeTruthy();
    });
  });

  it('restores week view from storage', async () => {
    stubConnected();
    mockGetPopupView.mockResolvedValue({
      kind: 'week',
      weekOf: '2026-06-16',
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('week-view')).toBeTruthy();
    });
  });

  describe('Manager tab (Story 5.2)', () => {
    it('renders the Manager tab when the user has direct reports', async () => {
      stubConnected();
      mockHasDirectReports.mockResolvedValue(true);
      render(<App />);
      await waitFor(() => {
        expect(screen.getByText('Manager')).toBeTruthy();
      });
    });

    it('does NOT render the Manager tab when the user has no reports', async () => {
      stubConnected();
      mockHasDirectReports.mockResolvedValue(false);
      render(<App />);
      await waitFor(() => {
        expect(screen.getByText('Today')).toBeTruthy();
      });
      expect(screen.queryByText('Manager')).toBeNull();
    });

    it('does NOT render the Manager tab when the reports check errors', async () => {
      stubConnected();
      mockHasDirectReports.mockRejectedValue(new Error('directory down'));
      render(<App />);
      await waitFor(() => {
        expect(screen.getByText('Today')).toBeTruthy();
      });
      expect(screen.queryByText('Manager')).toBeNull();
    });

    it('selecting the Manager tab persists a manager-matrix view (real getCurrentCycleId)', async () => {
      stubConnected();
      mockHasDirectReports.mockResolvedValue(true);
      mockApprovalCycleGet.mockResolvedValue('calendar-month');
      render(<App />);
      await waitFor(() => {
        expect(screen.getByText('Manager')).toBeTruthy();
      });
      // Drive the controlled Tabs onValueChange directly (Radix Trigger's
      // pointerdown-based selection isn't reliably simulable in jsdom without a
      // PointerEvent polyfill; the handler wiring is what AC 7 specifies).
      const trigger = screen.getByText('Manager');
      fireEvent.keyDown(trigger, { key: 'Enter' });
      fireEvent.click(trigger);
      fireEvent.pointerDown(trigger, { button: 0 });
      await waitFor(() => {
        const persisted = mockSetPopupView.mock.calls
          .map((c) => c[0] as { kind: string; cycle?: string })
          .find((v) => v.kind === 'manager-matrix');
        expect(persisted).toBeDefined();
        // calendar-month → cycle id is the current `yyyy-MM` (real getCurrentCycleId).
        expect(persisted?.cycle).toMatch(/^\d{4}-\d{2}$/);
      });
    });

    it('renders ManagerView with the persisted cycle when restoring a manager-matrix view', async () => {
      stubConnected();
      mockHasDirectReports.mockResolvedValue(true);
      mockGetPopupView.mockResolvedValue({ kind: 'manager-matrix', cycle: '2026-06' });
      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId('manager-view')).toBeTruthy();
      });
      expect(screen.getByText('Manager cycle 2026-06')).toBeTruthy();
      // It did NOT fall back to Today (reports present).
      expect(mockSetPopupView).not.toHaveBeenCalledWith({ kind: 'today' });
    });

    it('shows Today (not a blank panel) while a restored manager-matrix view is still resolving reports', async () => {
      stubConnected();
      mockGetPopupView.mockResolvedValue({ kind: 'manager-matrix', cycle: '2026-06' });
      // Keep hasDirectReports pending so `managesReports` stays null (resolving).
      let resolveReports: (v: boolean) => void = () => {};
      mockHasDirectReports.mockReturnValue(
        new Promise<boolean>((resolve) => {
          resolveReports = resolve;
        }),
      );
      render(<App />);
      // During the resolution window the Manager tab/content are not rendered,
      // so the popup must fall back to the Today panel rather than blanking out.
      await waitFor(() => {
        expect(screen.getByTestId('today-view')).toBeTruthy();
      });
      expect(screen.queryByTestId('manager-view')).toBeNull();
      expect(screen.queryByText('Manager')).toBeNull();
      // Resolve to avoid an act() warning from the still-pending effect.
      resolveReports(true);
    });

    it('falls back to Today and persists it when a persisted manager-matrix view has no reports', async () => {
      stubConnected();
      mockGetPopupView.mockResolvedValue({ kind: 'manager-matrix', cycle: '2026-06' });
      mockHasDirectReports.mockResolvedValue(false);
      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId('today-view')).toBeTruthy();
      });
      await waitFor(() => {
        expect(mockSetPopupView).toHaveBeenCalledWith({ kind: 'today' });
      });
      expect(screen.queryByText('Manager')).toBeNull();
    });
  });
});