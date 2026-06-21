import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuth = vi.fn();
const mockHasValidAuth = vi.fn();
const mockGetPopupView = vi.fn();
const mockSetPopupView = vi.fn();

vi.mock('@/lib/storage/tokens', () => ({
  getAuth: () => mockGetAuth(),
  hasValidAuth: (bundle: unknown) => mockHasValidAuth(bundle),
}));

vi.mock('@/lib/storage/view-state', () => ({
  getPopupView: () => mockGetPopupView(),
  setPopupView: (v: unknown) => mockSetPopupView(v),
}));

vi.mock('@/components/today/TodayView', () => ({
  TodayView: () => <div data-testid="today-view">Today Placeholder</div>,
}));

vi.mock('@/components/week/WeekView', () => ({
  WeekView: ({ weekOf }: { weekOf: string }) => (
    <div data-testid="week-view">Week of {weekOf}</div>
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
});