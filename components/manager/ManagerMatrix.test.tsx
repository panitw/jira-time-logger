import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReportEpicWorklogs } from '@/lib/jira-types';
import type { DirectReport } from '@/lib/storage/direct-reports';

// --- Mocks for the data hooks the matrix composes -------------------------

const reportsMock = vi.fn();
const rowMock = vi.fn();

vi.mock('@/hooks/useManagerReports', () => ({
  useManagerReports: () => reportsMock(),
}));

vi.mock('@/hooks/useManagerRow', () => ({
  useManagerRow: (accountId: string) => rowMock(accountId),
}));

const { ManagerMatrix } = await import('./ManagerMatrix');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return React.createElement(QueryClientProvider, { client }, children);
}

function renderMatrix(props: Partial<React.ComponentProps<typeof ManagerMatrix>> = {}) {
  return render(<ManagerMatrix cycle="2026-05" onSwitchToToday={() => {}} {...props} />, {
    wrapper,
  });
}

function reportsOk(reports: DirectReport[]) {
  return { isPending: false, isError: false, data: reports };
}

function rowState(state: {
  status: 'pending' | 'error' | 'success';
  data?: ReportEpicWorklogs[];
}) {
  return {
    isPending: state.status === 'pending',
    isError: state.status === 'error',
    isSuccess: state.status === 'success',
    data: state.data,
    error: state.status === 'error' ? { kind: 'network' } : undefined,
    refetch: vi.fn(),
  };
}

const REPORTS: DirectReport[] = [
  { accountId: 'r-bob', displayName: 'Bob' },
  { accountId: 'r-amy', displayName: 'Amy' },
];

describe('ManagerMatrix', () => {
  beforeEach(() => {
    reportsMock.mockReset();
    rowMock.mockReset();
  });

  it('renders the cycle title from the cycle prop', () => {
    reportsMock.mockReturnValue(reportsOk(REPORTS));
    rowMock.mockReturnValue(rowState({ status: 'pending' }));
    renderMatrix();
    expect(screen.getByText(/May 2026/)).toBeTruthy();
  });

  it('renders a semantic table with sticky person column + Epic columns', () => {
    reportsMock.mockReturnValue(reportsOk(REPORTS));
    const bobRow = rowState({
      status: 'success',
      data: [{ epicKey: 'PROJ-1', epicSummary: 'E1', totalSeconds: 64 * 3600, worklogs: [] }],
    });
    const amyRow = rowState({
      status: 'success',
      data: [{ epicKey: 'PROJ-2', epicSummary: 'E2', totalSeconds: 12.5 * 3600, worklogs: [] }],
    });
    rowMock.mockImplementation((accountId: string) =>
      accountId === 'r-bob' ? bobRow : amyRow,
    );
    renderMatrix();
    const table = screen.getByRole('table');
    expect(table).toBeTruthy();
    // Epic-key column headers (union, alphabetical).
    expect(within(table).getByText('PROJ-1')).toBeTruthy();
    expect(within(table).getByText('PROJ-2')).toBeTruthy();
    // Person row headers.
    expect(within(table).getByText('Amy')).toBeTruthy();
    expect(within(table).getByText('Bob')).toBeTruthy();
  });

  it('renders one skeleton row per report initially (no spinners)', () => {
    reportsMock.mockReturnValue(reportsOk(REPORTS));
    rowMock.mockReturnValue(rowState({ status: 'pending' }));
    renderMatrix();
    expect(screen.getAllByTestId('matrix-skeleton-row')).toHaveLength(2);
  });

  it('shows neutral monospace hours and em-dash for empty cells', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [
          { epicKey: 'PROJ-1', epicSummary: 'E1', totalSeconds: 64 * 3600, worklogs: [] },
          { epicKey: 'PROJ-2', epicSummary: 'E2', totalSeconds: 0, worklogs: [] },
        ],
      }),
    );
    renderMatrix();
    expect(screen.getByText('64')).toBeTruthy();
    // PROJ-2 has a 0-second group → still an empty cell.
    expect(screen.getAllByText('──').length).toBeGreaterThan(0);
  });

  it('sorts rows by display name', () => {
    reportsMock.mockReturnValue(reportsOk(REPORTS)); // Bob then Amy as given
    rowMock.mockReturnValue(rowState({ status: 'success', data: [] }));
    renderMatrix();
    const rowHeaders = screen.getAllByRole('rowheader').map((el) => el.textContent);
    const amyIdx = rowHeaders.findIndex((t) => t?.includes('Amy'));
    const bobIdx = rowHeaders.findIndex((t) => t?.includes('Bob'));
    expect(amyIdx).toBeLessThan(bobIdx);
  });

  it('shows a per-row retry chip on failure and calls refetch', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    const refetch = vi.fn();
    rowMock.mockReturnValue({
      isPending: false,
      isError: true,
      isSuccess: false,
      data: undefined,
      error: { kind: 'network' },
      refetch,
    });
    renderMatrix();
    const retry = screen.getByRole('button', { name: /retry/i });
    expect(screen.getByText(/Couldn't load/i)).toBeTruthy();
    fireEvent.click(retry);
    expect(refetch).toHaveBeenCalled();
  });

  it('renders the no-reports empty state with a switch-to-Today action', () => {
    reportsMock.mockReturnValue(reportsOk([]));
    rowMock.mockReturnValue(rowState({ status: 'pending' }));
    const onSwitchToToday = vi.fn();
    renderMatrix({ onSwitchToToday });
    expect(screen.getByText(/not configured as anyone's manager/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /worker view|today/i }));
    expect(onSwitchToToday).toHaveBeenCalled();
  });

  it('shows a per-row no-hours placeholder when the whole matrix has no columns', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(rowState({ status: 'success', data: [] }));
    renderMatrix();
    expect(screen.getByText(/no hours logged this cycle/i)).toBeTruthy();
  });

  it('carries a per-cell aria-label "<Person>, <EpicKey>, <hours> hours"', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [{ epicKey: 'PROJ-1', epicSummary: 'E1', totalSeconds: 64 * 3600, worklogs: [] }],
      }),
    );
    renderMatrix();
    expect(screen.getByLabelText('Bob, PROJ-1, 64 hours')).toBeTruthy();
  });

  it('has NO status colors, status icons, or approve buttons (5.4–5.8 scope guard)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [{ epicKey: 'PROJ-1', epicSummary: 'E1', totalSeconds: 64 * 3600, worklogs: [] }],
      }),
    );
    const { container } = renderMatrix();
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    // No success/danger status background classes leaked from the week grid.
    expect(container.querySelector('.bg-state-success-subtle')).toBeNull();
    expect(container.querySelector('.bg-state-danger-subtle')).toBeNull();
  });

  it('enables a horizontal-scroll wrapper when more than 4 Epic columns exist', async () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: ['A-1', 'B-2', 'C-3', 'D-4', 'E-5'].map((k) => ({
          epicKey: k,
          epicSummary: k,
          totalSeconds: 3600,
          worklogs: [],
        })),
      }),
    );
    const { container } = renderMatrix();
    await waitFor(() =>
      expect(container.querySelector('[data-testid="matrix-scroll"]')).toBeTruthy(),
    );
    expect(container.querySelector('[data-testid="matrix-scroll"]')!.className).toContain(
      'overflow-x-auto',
    );
  });
});
