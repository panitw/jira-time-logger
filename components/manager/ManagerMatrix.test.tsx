import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApprovalComment } from '@/lib/comment-schema';
import type { ReportCycleWorklogs, ReportEpicWorklogs } from '@/lib/jira-types';
import type { DirectReport } from '@/lib/storage/direct-reports';

// --- Mocks for the data hooks the matrix composes -------------------------

const reportsMock = vi.fn();
const rowMock = vi.fn();
const approvalsMock = vi.fn();
const currentUserMock = vi.fn();
const canApproveMock = vi.fn();

vi.mock('@/hooks/useManagerReports', () => ({
  useManagerReports: () => reportsMock(),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => currentUserMock(),
}));

// FR36 canonicality gate (Story 5.8). Per-report mock keyed on accountId so a
// mixed canonical / non-canonical matrix can be exercised; default canonical.
vi.mock('@/hooks/useCanApprove', () => ({
  useCanApprove: (accountId: string) => canApproveMock(accountId),
}));

/** A resolved canonicality query result (default: canonical, current user IS the manager). */
function canApproveState(
  isCanonical: boolean,
  canonicalManagerName: string | null = isCanonical ? 'Me' : 'Other Manager',
) {
  return {
    isSuccess: true,
    isPending: false,
    isError: false,
    data: { isCanonical, canonicalManagerName },
  };
}

// ApproveButton talks to the SW via sendRequest — mock the boundary so the row's
// Approve button mounts without touching chrome.runtime.
const sendRequestMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendRequest: (...a: unknown[]) => sendRequestMock(...a),
}));

vi.mock('@/hooks/useManagerRow', () => ({
  useManagerRow: (accountId: string) => rowMock(accountId),
}));

vi.mock('@/hooks/useEpicApprovals', () => ({
  useEpicApprovals: (epicKey: string) => approvalsMock(epicKey),
}));

// The matrix reads `targetHours` from settings in a `useEffect`. Mock the
// storage boundary so the async `getValue()` resolves cleanly instead of
// hitting the unmocked `@wxt-dev/storage` chrome API (which throws an
// unhandled rejection after the component mounts).
const targetHoursMock = vi.fn<() => Promise<number | null>>();

vi.mock('@/lib/storage/settings', () => ({
  targetHoursItem: { getValue: () => targetHoursMock() },
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

/** Build a resolved-row wrapper from a per-Epic group list (restrictedCount summed). */
function cycleData(epics: ReportEpicWorklogs[]): ReportCycleWorklogs {
  return {
    epics,
    restrictedCount: epics.reduce((s, e) => s + e.restrictedCount, 0),
  };
}

function epic(
  epicKey: string,
  totalSeconds: number,
  over: Partial<ReportEpicWorklogs> = {},
): ReportEpicWorklogs {
  return {
    epicKey,
    epicSummary: `${epicKey} summary`,
    totalSeconds,
    restrictedCount: 0,
    worklogs: [],
    ...over,
  };
}

function rowState(state: {
  status: 'pending' | 'error' | 'success';
  data?: ReportEpicWorklogs[];
}) {
  return {
    isPending: state.status === 'pending',
    isError: state.status === 'error',
    isSuccess: state.status === 'success',
    data: state.data ? cycleData(state.data) : undefined,
    error: state.status === 'error' ? { kind: 'network' } : undefined,
    refetch: vi.fn(),
  };
}

function approvalsState(data: ApprovalComment[] = []) {
  return { isPending: false, isError: false, isSuccess: true, data, error: undefined };
}

const REPORTS: DirectReport[] = [
  { accountId: 'r-bob', displayName: 'Bob' },
  { accountId: 'r-amy', displayName: 'Amy' },
];

describe('ManagerMatrix', () => {
  beforeEach(() => {
    reportsMock.mockReset();
    rowMock.mockReset();
    approvalsMock.mockReset();
    // Default: no approvals on any Epic (cells are worklog-only).
    approvalsMock.mockReturnValue(approvalsState([]));
    // Default per-workday target hours (settings boundary).
    targetHoursMock.mockReset();
    targetHoursMock.mockResolvedValue(8);
    // Default: the current manager's accountId resolved.
    currentUserMock.mockReset();
    currentUserMock.mockReturnValue({ isPending: false, isError: false, data: 'mgr-1' });
    // Default: the current user IS the canonical manager of every row (Story 5.8) —
    // preserves the existing enabled-Approve behavior of the 5.6/5.7 tests.
    canApproveMock.mockReset();
    canApproveMock.mockReturnValue(canApproveState(true));
    sendRequestMock.mockReset();
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
      data: [epic('PROJ-1', 64 * 3600)],
    });
    const amyRow = rowState({
      status: 'success',
      data: [epic('PROJ-2', 12.5 * 3600)],
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
        data: [epic('PROJ-1', 64 * 3600), epic('PROJ-2', 0)],
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

  it('carries a per-cell aria-label with the hours + status (on target above the boundary)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    // 250h far exceeds 8h × ~22 May workdays → on-target.
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 250 * 3600)] }),
    );
    renderMatrix();
    expect(screen.getByLabelText('Bob, PROJ-1, 250 hours, on target')).toBeTruthy();
  });

  it('renders a row-end "Approve <Person>" button for a row with hours (Story 5.6)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 64 * 3600)] }),
    );
    renderMatrix();
    const approve = screen.getByRole('button', { name: 'Approve Bob' });
    expect(approve).toBeTruthy();
    expect((approve as HTMLButtonElement).disabled).toBe(false);
  });

  // --- Story 5.8: non-canonical manager read-only mode (FR36, AC1/AC2/AC5/AC8) ---

  it('disables Approve with the exact non-canonical tooltip when the user is NOT the canonical manager (AC1)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 64 * 3600)] }),
    );
    canApproveMock.mockReturnValue(canApproveState(false, 'Carol Boss'));
    renderMatrix();
    const approve = screen.getByRole('button', { name: 'Approve Bob' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(approve.title).toBe(
      "Only Bob's canonical manager (Carol Boss) can approve their cycle. You can read but not approve here.",
    );
  });

  it('uses the "their manager" fallback in the tooltip when the canonical name is unprovable (fail-closed, AC5)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 64 * 3600)] }),
    );
    canApproveMock.mockReturnValue(canApproveState(false, null));
    renderMatrix();
    const approve = screen.getByRole('button', { name: 'Approve Bob' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(approve.title).toBe(
      "Only Bob's canonical manager (their manager) can approve their cycle. You can read but not approve here.",
    );
  });

  it('keeps Approve enabled for a canonical row alongside a disabled non-canonical row (mixed matrix, AC2)', () => {
    reportsMock.mockReturnValue(
      reportsOk([
        { accountId: 'r-bob', displayName: 'Bob' },
        { accountId: 'r-amy', displayName: 'Amy' },
      ]),
    );
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 64 * 3600)] }),
    );
    // Bob: canonical (enabled). Amy: non-canonical (disabled + tooltip).
    canApproveMock.mockImplementation((accountId: string) =>
      accountId === 'r-bob' ? canApproveState(true) : canApproveState(false, 'Dave Lead'),
    );
    renderMatrix();
    expect((screen.getByRole('button', { name: 'Approve Bob' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    const amy = screen.getByRole('button', { name: 'Approve Amy' }) as HTMLButtonElement;
    expect(amy.disabled).toBe(true);
    expect(amy.title).toBe(
      "Only Amy's canonical manager (Dave Lead) can approve their cycle. You can read but not approve here.",
    );
  });

  it('disables Approve while canonicality is still loading (no enabled flash before it is proven)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 64 * 3600)] }),
    );
    canApproveMock.mockReturnValue({
      isSuccess: false,
      isPending: true,
      isError: false,
      data: undefined,
    });
    renderMatrix();
    const approve = screen.getByRole('button', { name: 'Approve Bob' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(approve.title).toBe('Resolving your account…');
  });

  it("keeps 'Resolving your account…' precedence when the current-user accountId is unresolved (AC8)", () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 64 * 3600)] }),
    );
    // Current user still resolving — even if canonicality somehow resolved
    // non-canonical, the resolving copy must win (not a permission denial).
    currentUserMock.mockReturnValue({ isPending: true, isError: false, data: undefined });
    canApproveMock.mockReturnValue(canApproveState(false, 'Someone'));
    renderMatrix();
    const approve = screen.getByRole('button', { name: 'Approve Bob' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(approve.title).toBe('Resolving your account…');
  });

  it('disables the Approve button for an empty row (no touched Epics to fan out)', () => {
    // A row that resolved with NO epics (logged nothing) but with columns from
    // another report → renders ── cells + a disabled Approve. Use STABLE row
    // objects per account (a fresh object per render would make the parent's
    // resolved-map effect loop, since it dedupes by reference).
    const bobRow = rowState({ status: 'success', data: [] });
    const amyRow = rowState({ status: 'success', data: [epic('PROJ-1', 8 * 3600)] });
    rowMock.mockImplementation((accountId: string) =>
      accountId === 'r-bob' ? bobRow : amyRow,
    );
    reportsMock.mockReturnValue(
      reportsOk([
        { accountId: 'r-bob', displayName: 'Bob' },
        { accountId: 'r-amy', displayName: 'Amy' },
      ]),
    );
    renderMatrix();
    const approve = screen.getByRole('button', { name: 'Approve Bob' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
  });

  it('shows the "X of N done" progress chip in the header', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 64 * 3600)] }),
    );
    renderMatrix();
    // No approvals → 0 done of 1 report.
    expect(screen.getByTestId('matrix-progress').textContent).toBe('0 of 1 done');
  });

  it('counts a row as done in the progress chip when its only touched Epic is approved', async () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 64 * 3600, {
            worklogs: [
              {
                ticketKey: 'PROJ-1-1',
                ticketSummary: 's',
                seconds: 64 * 3600,
                updated: '2026-05-10T00:00:00.000Z',
              },
            ],
          }),
        ],
      }),
    );
    const approval: ApprovalComment = {
      v: 1,
      user: 'r-bob',
      cycle: '2026-05',
      by: 'mgr',
      at: '2026-05-20T00:00:00.000Z',
      restrictedCount: 0,
      checksum: 'x',
    };
    approvalsMock.mockReturnValue(approvalsState([approval]));
    renderMatrix();
    await waitFor(() =>
      expect(screen.getByTestId('matrix-progress').textContent).toBe('1 of 1 done'),
    );
  });

  it('renders an approved cell with a Check icon + approved aria-label when an approval exists and no later edit', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 64 * 3600, {
            worklogs: [
              {
                ticketKey: 'PROJ-1-1',
                ticketSummary: 's',
                seconds: 64 * 3600,
                updated: '2026-05-10T00:00:00.000Z',
              },
            ],
          }),
        ],
      }),
    );
    const approval: ApprovalComment = {
      v: 1,
      user: 'r-bob',
      cycle: '2026-05',
      by: 'mgr',
      at: '2026-05-20T00:00:00.000Z',
      restrictedCount: 0,
      checksum: 'x',
    };
    approvalsMock.mockReturnValue(approvalsState([approval]));
    const { container } = renderMatrix();
    expect(screen.getByLabelText(/Bob, PROJ-1, 64 hours, approved/)).toBeTruthy();
    // Approved is dark-green bg + white text.
    expect(container.querySelector('.bg-state-success.text-white')).toBeTruthy();
  });

  it('renders a dirty cell (RefreshCw + needs re-approval) when a worklog changed after approval', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 64 * 3600, {
            worklogs: [
              {
                ticketKey: 'PROJ-1-1',
                ticketSummary: 's',
                seconds: 64 * 3600,
                updated: '2026-05-25T00:00:00.000Z', // after the approval
              },
            ],
          }),
        ],
      }),
    );
    const approval: ApprovalComment = {
      v: 1,
      user: 'r-bob',
      cycle: '2026-05',
      by: 'mgr',
      at: '2026-05-20T00:00:00.000Z',
      restrictedCount: 0,
      checksum: 'x',
    };
    approvalsMock.mockReturnValue(approvalsState([approval]));
    const { container } = renderMatrix();
    expect(screen.getByLabelText(/needs re-approval/)).toBeTruthy();
    expect(screen.getByText('needs re-approval')).toBeTruthy();
    expect(container.querySelector('.bg-state-warning-subtle')).toBeTruthy();
  });

  // --- Story 5.7: dirty rows drive the re-approve mode --------------------

  it('a row with a dirty cell renders a secondary "Re-approve <Person>" button (not Approve)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 64 * 3600, {
            worklogs: [
              {
                ticketKey: 'PROJ-1-1',
                ticketSummary: 's',
                seconds: 64 * 3600,
                updated: '2026-05-25T00:00:00.000Z', // after the approval → dirty
              },
            ],
          }),
        ],
      }),
    );
    const approval: ApprovalComment = {
      v: 1,
      user: 'r-bob',
      cycle: '2026-05',
      by: 'mgr',
      at: '2026-05-20T08:30:00.000Z',
      restrictedCount: 0,
      checksum: 'x',
    };
    approvalsMock.mockReturnValue(approvalsState([approval]));
    renderMatrix();
    const btn = screen.getByRole('button', { name: 'Re-approve Bob' });
    expect(btn).toBeTruthy();
    // A dirty row never shows the primary "Approve <Person>" too.
    expect(screen.queryByRole('button', { name: 'Approve Bob' })).toBeNull();
    // Secondary tier, not brand-purple.
    expect(btn.className).toContain('bg-transparent');
    expect(btn.className).not.toContain('bg-accent');
  });

  it('a dirty row threads the prior approval at into the re-approve supersede line', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 64 * 3600, {
            worklogs: [
              {
                ticketKey: 'PROJ-1-1',
                ticketSummary: 's',
                seconds: 64 * 3600,
                updated: '2026-05-25T00:00:00.000Z',
              },
            ],
          }),
        ],
      }),
    );
    const approval: ApprovalComment = {
      v: 1,
      user: 'r-bob',
      cycle: '2026-05',
      by: 'mgr',
      at: '2026-05-20T08:30:00.000Z',
      restrictedCount: 0,
      checksum: 'x',
    };
    approvalsMock.mockReturnValue(approvalsState([approval]));
    renderMatrix();
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve Bob' }));
    const supersede = screen.getByTestId('approve-supersede-line');
    expect(supersede.textContent).toMatch(/supersedes prior approval from/i);
    expect(supersede.textContent).toMatch(/May 20, 2026/);
  });

  it('a non-dirty unapproved row stays a primary "Approve <Person>" button', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 64 * 3600)] }),
    );
    // No approvals → unapproved (not dirty).
    renderMatrix();
    expect(screen.getByRole('button', { name: 'Approve Bob' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Re-approve Bob' })).toBeNull();
  });

  it('a row dirty on some cells with a NEW unapproved Epic re-approves the FULL touched set (AC6)', async () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [
          // PROJ-1: approved then edited → dirty.
          epic('PROJ-1', 64 * 3600, {
            worklogs: [
              {
                ticketKey: 'PROJ-1-1',
                ticketSummary: 's',
                seconds: 64 * 3600,
                updated: '2026-05-25T00:00:00.000Z',
              },
            ],
          }),
          // PROJ-2: a newly-touched Epic, never approved (no approval comment).
          epic('PROJ-2', 8 * 3600, {
            worklogs: [
              {
                ticketKey: 'PROJ-2-1',
                ticketSummary: 's2',
                seconds: 8 * 3600,
                updated: '2026-05-26T00:00:00.000Z',
              },
            ],
          }),
        ],
      }),
    );
    // Only PROJ-1 has an approval; PROJ-2 has none.
    approvalsMock.mockImplementation((epicKey: string) =>
      epicKey === 'PROJ-1'
        ? approvalsState([
            {
              v: 1,
              user: 'r-bob',
              cycle: '2026-05',
              by: 'mgr',
              at: '2026-05-20T08:30:00.000Z',
              restrictedCount: 0,
              checksum: 'x',
            },
          ])
        : approvalsState([]),
    );
    sendRequestMock.mockResolvedValueOnce({
      confirmed: ['PROJ-1', 'PROJ-2'],
      failed: [],
      enqueued: [],
    });
    renderMatrix();
    // The whole row is in re-approve mode because at least one cell is dirty.
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve Bob' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve' }));
    await waitFor(() =>
      // The fan-out posts to the FULL current touched set (both Epics), not just
      // the dirty one — recomputed at click time.
      expect(sendRequestMock).toHaveBeenCalledWith('approve-cycle', {
        user: 'r-bob',
        cycle: '2026-05',
        by: 'mgr-1',
        epics: [
          { epicKey: 'PROJ-1', restrictedCount: 0 },
          { epicKey: 'PROJ-2', restrictedCount: 0 },
        ],
      }),
    );
  });

  it('renders a below-target row with AlertCircle + "below target"', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    // 10h is far below 8h × ~22 May workdays → gap.
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 10 * 3600)] }),
    );
    const { container } = renderMatrix();
    expect(screen.getByText('below target')).toBeTruthy();
    expect(screen.getByLabelText(/below target/)).toBeTruthy();
    expect(container.querySelector('.bg-state-danger-subtle')).toBeTruthy();
  });

  it('keeps an empty cell neutral with the "no hours logged" label (never red)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [epic('PROJ-1', 10 * 3600), epic('PROJ-2', 0)],
      }),
    );
    renderMatrix();
    // PROJ-2 logged nothing → neutral "no hours logged".
    expect(screen.getByLabelText('Bob, PROJ-2, no hours logged')).toBeTruthy();
  });

  it('shows a Lock overlay on a restricted cell AND the row chip "⚠ N restricted"', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [epic('PROJ-1', 64 * 3600, { restrictedCount: 2 })],
      }),
    );
    renderMatrix();
    // Cell aria-label appends ", restricted visibility" to the cell label.
    expect(
      screen.getByLabelText('Bob, PROJ-1, 64 hours, below target, restricted visibility'),
    ).toBeTruthy();
    // Row chip beside the name.
    expect(screen.getByText('⚠ 2 restricted')).toBeTruthy();
  });

  it('opens the drill-down panel when a data cell is clicked, populated from resolved records', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 12 * 3600, {
            worklogs: [
              { ticketKey: 'PROJ-1-101', ticketSummary: 'Epic planning', seconds: 12 * 3600 },
            ],
          }),
        ],
      }),
    );
    renderMatrix();
    // The cell is a real button carrying the accessible name.
    const cell = screen.getByRole('button', { name: /Bob, PROJ-1, 12 hours/ });
    fireEvent.click(cell);
    // Panel header + per-ticket evidence appear.
    expect(screen.getByText('Bob · PROJ-1 · May 2026')).toBeTruthy();
    expect(screen.getByText('PROJ-1-101')).toBeTruthy();
    expect(screen.getByText('12.0h')).toBeTruthy();
  });

  it('closes the panel via the Close affordance and the content disappears', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 12 * 3600)] }),
    );
    renderMatrix();
    fireEvent.click(screen.getByRole('button', { name: /Bob, PROJ-1/ }));
    expect(screen.getByText('Bob · PROJ-1 · May 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByText('Bob · PROJ-1 · May 2026')).toBeNull();
  });

  it('closes the panel on Esc', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 12 * 3600)] }),
    );
    renderMatrix();
    fireEvent.click(screen.getByRole('button', { name: /Bob, PROJ-1/ }));
    expect(screen.getByText('Bob · PROJ-1 · May 2026')).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    });
    expect(screen.queryByText('Bob · PROJ-1 · May 2026')).toBeNull();
  });

  it('returns focus to the originating cell button when the panel closes (AC 10)', async () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 12 * 3600)] }),
    );
    renderMatrix();
    const cell = screen.getByRole('button', { name: /Bob, PROJ-1/ });
    cell.focus();
    fireEvent.click(cell);
    expect(screen.getByText('Bob · PROJ-1 · May 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByText('Bob · PROJ-1 · May 2026')).toBeNull();
    // The conditionally-unmounted panel cannot rely on Radix's focus return, so
    // the matrix restores focus to the clicked cell itself (deferred a frame).
    await waitFor(() => expect(document.activeElement).toBe(cell));
  });

  it('opens the panel in its empty state when an empty ── cell is clicked', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        // PROJ-2 logged nothing → an empty `──` cell for Bob.
        data: [epic('PROJ-1', 64 * 3600), epic('PROJ-2', 0)],
      }),
    );
    renderMatrix();
    fireEvent.click(screen.getByRole('button', { name: 'Bob, PROJ-2, no hours logged' }));
    expect(
      screen.getByText('No tickets in PROJ-2 for Bob this cycle.'),
    ).toBeTruthy();
  });

  it('does not leak a 5.6/5.7 Approve/Re-approve/Done action or POST into the panel', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 12 * 3600, {
            worklogs: [
              { ticketKey: 'PROJ-1-101', ticketSummary: 'Epic planning', seconds: 12 * 3600 },
            ],
          }),
        ],
      }),
    );
    renderMatrix();
    fireEvent.click(screen.getByRole('button', { name: /Bob, PROJ-1/ }));
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText('Bob · PROJ-1 · May 2026')).toBeTruthy();
    // The drill-down panel itself stays READ-ONLY: the Approve action lives in
    // the matrix row, never inside the panel (Story 5.5/5.6 boundary).
    expect(
      within(panel).queryByRole('button', { name: /approve|re-approve|done/i }),
    ).toBeNull();
  });

  it('surfaces the per-Epic VisibilityWarning chip inside the panel when restrictedCount > 0', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [epic('PROJ-1', 64 * 3600, { restrictedCount: 2 })],
      }),
    );
    renderMatrix();
    fireEvent.click(screen.getByRole('button', { name: /Bob, PROJ-1/ }));
    expect(
      screen.getByText(/⚠ 2 worklogs with restricted visibility were excluded/),
    ).toBeTruthy();
  });

  it('enables a horizontal-scroll wrapper when more than 4 Epic columns exist', async () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: ['A-1', 'B-2', 'C-3', 'D-4', 'E-5'].map((k) => epic(k, 3600)),
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
