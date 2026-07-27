import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApprovalComment } from '@/lib/comment-schema';
import type { ReportCycleWorklogs, ReportEpicWorklogs } from '@/lib/jira-types';
import type { DirectReport } from '@/lib/storage/direct-reports';
import { scan, criticalOrSerious } from '@/lib/test/axe';

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

// Finding 12 (Major): the mock used to drop `cycleId` before it ever reached
// the spy, so `toHaveBeenCalledWith('r-bob')` could not distinguish a row
// re-querying the OLD cycle from the NEW one — the exact bug (`cycle` passed
// instead of `effectiveCycle`) this test claims to guard against was
// invisible to it. Pass both through.
vi.mock('@/hooks/useManagerRow', () => ({
  useManagerRow: (accountId: string, cycleId: string) => rowMock(accountId, cycleId),
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
  return render(
    <ManagerMatrix
      cycle="2026-05"
      onSwitchToToday={() => {}}
      section="manager"
      onSectionChange={() => {}}
      showManagerTab
      {...props}
    />,
    {
      wrapper,
    },
  );
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

  it('shows a bare tabular number and a faint-decorative middot for empty cells (Story 7.8 AC2/AC3)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [epic('PROJ-1', 64 * 3600), epic('PROJ-2', 0)],
      }),
    );
    renderMatrix();
    // The cell shows the bare number (scoped — "64" also appears in the row
    // total column now, Task 5).
    const cell = screen.getByLabelText(/Bob, PROJ-1, 64 hours/);
    expect(within(cell).getByText('64')).toBeTruthy();
    // PROJ-2 has a 0-second group → the faint-decorative middot, not `──`.
    expect(screen.getAllByText('·').length).toBeGreaterThan(0);
    expect(screen.queryByText('──')).toBeNull();
  });

  // --- D-7.8-17 "no hours" chip (Finding 4/33: had ZERO coverage) ---------

  describe('D-7.8-17: the row-grain "no hours" chip', () => {
    it('(a) row-grain: renders exactly ONE chip for a whole-cycle-zero row, regardless of column count', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
      rowMock.mockReturnValue(
        rowState({
          status: 'success',
          data: [epic('PROJ-1', 0), epic('PROJ-2', 0), epic('PROJ-3', 0)],
        }),
      );
      renderMatrix();
      expect(screen.getAllByText('no hours')).toHaveLength(1);
    });

    it('(b) whole-cycle-zero ONLY: a row with 40h on one Epic and 0 on another renders ZERO chips', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
      rowMock.mockReturnValue(
        rowState({
          status: 'success',
          data: [epic('PROJ-1', 40 * 3600), epic('PROJ-2', 0)],
        }),
      );
      renderMatrix();
      expect(screen.queryByText('no hours')).toBeNull();
    });

    it('(c) no chip on an errored row — the ONLY thing stopping a false accusation that a report logged nothing when the tool merely failed to read their data', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
      rowMock.mockReturnValue(rowState({ status: 'error' }));
      renderMatrix();
      expect(screen.queryByText('no hours')).toBeNull();
      expect(screen.getByText("Couldn't load")).toBeTruthy();
    });

    it('(d) the chip is not interactive — no cursor-pointer, no click affordance', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [epic('PROJ-1', 0)] }));
      renderMatrix();
      const chip = screen.getByText('no hours');
      expect(chip.tagName).not.toBe('BUTTON');
      expect(chip.closest('button')).toBeNull();
      expect(chip.className).not.toMatch(/cursor-pointer/);
    });

    it('never double-states: on a WHOLE-matrix-empty cycle, the row shows the placeholder cell text but NOT also the chip', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [] }));
      renderMatrix();
      expect(screen.getByText('(no hours logged this cycle)')).toBeTruthy();
      expect(screen.queryByText('no hours')).toBeNull();
    });
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
    // The empty-row Approve also carries an sr-only disabled reason that mentions
    // "No hours logged this cycle to approve" (Story 6.1 AC4), so scope to the
    // visible per-row placeholder (which does NOT end with "to approve").
    const matches = screen.getAllByText(/no hours logged this cycle/i);
    expect(matches.some((el) => !/to approve/i.test(el.textContent ?? ''))).toBe(true);
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
    // AC4 (Story 6.1): aria-disabled (kept focusable), not native disabled.
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(approve.disabled).toBe(false);
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
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(approve.disabled).toBe(false);
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
    const bob = screen.getByRole('button', { name: 'Approve Bob' }) as HTMLButtonElement;
    // Canonical row: enabled (no aria-disabled).
    expect(bob.getAttribute('aria-disabled')).toBeNull();
    const amy = screen.getByRole('button', { name: 'Approve Amy' }) as HTMLButtonElement;
    expect(amy.getAttribute('aria-disabled')).toBe('true');
    expect(amy.disabled).toBe(false);
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
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(approve.disabled).toBe(false);
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
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(approve.disabled).toBe(false);
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
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(approve.disabled).toBe(false);
  });

  it('shows the "X of N done" progress chip in the header', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 64 * 3600)] }),
    );
    renderMatrix();
    // No approvals → 0 done of 1 report.
    expect(screen.getByTestId('matrix-progress').textContent).toBe('0 of 1 approved');
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
      expect(screen.getByTestId('matrix-progress').textContent).toBe('1 of 1 approved'),
    );
  });

  it('renders an approved cell as a bare tabular number — no fill, no border, no icon (Story 7.8 AC2; D-7.8-34 rewrite of the old bg-state-success pin)', () => {
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
    const cell = screen.getByLabelText(/Bob, PROJ-1, 64 hours, approved/);
    // D-7.8-34: after Task 3/4, an approved cell has NO fill class at all —
    // the green dark bg + white text this test used to pin is gone by design
    // (DESIGN.md:475 — "Correct cells are near-silent").
    expect(container.querySelector('.bg-state-success')).toBeNull();
    expect(within(cell).getByText('64')).toBeTruthy();
    // Finding 11(a) (Major): the test's own TITLE says "no border" but only
    // ever asserted the FILL class — `border border-state-success` on the
    // cell passed undetected. Assert STRUCTURALLY: the number span carries
    // no `border`/`bg-`/`ring-` Tailwind token at all, rather than
    // enumerating one forbidden class name.
    const numberSpan = within(cell).getByText('64');
    const decoratedTokens = numberSpan.className
      .split(/\s+/)
      .filter((c) => /^(border|bg-|ring-)/.test(c));
    expect(decoratedTokens).toEqual([]);
    // ...and exactly one text child — the structural rule "a correct cell
    // contains one text node", not a specific enumerated wording.
    expect(numberSpan.childNodes).toHaveLength(1);
    expect(numberSpan.childNodes[0]!.nodeType).toBe(Node.TEXT_NODE);
  });

  it('an approved cell renders a bare number — no icon, no status label (D-7.6-41; stops Story 7.8 inheriting the pre-emption)', () => {
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
    const cell = screen.getByLabelText(/Bob, PROJ-1, 64 hours, approved/);
    expect(cell.querySelector('svg')).toBeNull();
    expect(within(cell).queryByText('approved')).toBeNull();
    expect(within(cell).queryByText('on target')).toBeNull();
    // Finding 11(b) (Major): the two word-literal queries above pin COPY,
    // not the structural rule — a differently-worded label (e.g. "verified")
    // would pass undetected. Assert the button's own visible text is
    // EXACTLY the number, full stop — no other text node anywhere inside it.
    expect(cell.textContent).toBe('64');
  });

  it('an approved+restricted cell renders "hidden" on its OWN chip-surface background, no cell fill at all (D-7.8-34/D-7.8-26: chrome-solid removed, no dependency on the cell behind it)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 64 * 3600, {
            restrictedCount: 2,
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
      restrictedCount: 2,
      checksum: 'x',
    };
    approvalsMock.mockReturnValue(approvalsState([approval]));
    const { container } = renderMatrix();
    const cell = screen.getByLabelText(
      /Bob, PROJ-1, 64 hours, approved, restricted visibility/,
    );
    // D-7.8-34: after Task 3, the cell itself has NO fill at all.
    expect(container.querySelector('.bg-state-success')).toBeNull();
    // The restricted chip renders `text-faint` on its OWN `bg-chip-surface`
    // background — the SAME pairing regardless of the cell's status, which
    // is the stronger property D-7.8-34 asked for (the regression this test
    // used to pin — `text-faint` on a dark green fill — cannot recur because
    // there is no more fill for the chip to sit on).
    const restrictedWrapper = within(cell).getByText('hidden').parentElement;
    expect(restrictedWrapper?.className).toContain('text-faint');
    expect(restrictedWrapper?.parentElement?.className).toContain('bg-chip-surface');
  });

  it('a restricted cell on ANY cell status renders the SAME text-faint on bg-chip-surface (no more per-status override — D-7.8-26/AC9)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [epic('PROJ-1', 64 * 3600, { restrictedCount: 2 })],
      }),
    );
    renderMatrix();
    const cell = screen.getByLabelText(
      'Bob, PROJ-1, 64 hours, short of target, restricted visibility',
    );
    // `hidden` sits in DayStatusIndicator's own inner span (text-faint); its
    // OWN chip-surface background lives one level further up, on the box
    // that wraps the indicator (D-7.8-26/AC9's actual claim: the chip reads
    // correctly regardless of the cell behind it, BECAUSE it carries its own
    // fill — checking only the inner span would miss a dropped box entirely).
    const restrictedWrapper = within(cell).getByText('hidden').parentElement;
    const chipBox = restrictedWrapper?.parentElement;
    expect(restrictedWrapper?.className).toContain('text-faint');
    expect(restrictedWrapper?.className).not.toContain('text-white');
    expect(chipBox?.className).toContain('bg-chip-surface');
  });

  it('renders a dirty cell as an amber chip (filled Circle + hours + "edited after approval") when a worklog changed after approval', () => {
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
    // The aria-label still states the required ACTION ("needs re-approval");
    // the VISIBLE chip word states the FACT (Task 4 / D-7.6-12: never a
    // verdict in the visible text).
    expect(screen.getByLabelText(/needs re-approval/)).toBeTruthy();
    expect(screen.getByText('edited after approval')).toBeTruthy();
    expect(container.querySelector('.bg-amber-soft')).toBeTruthy();
    expect(container.querySelector('svg.lucide-circle')).toBeTruthy();
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
    // The commit button now carries the figure (Task 9): 64h + 8h = 72h.
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve 72h' }));
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

  it('a gap row states "short of target" ONCE at the row total (D-7.8-32) — never on the cell, never "below target", never red', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    // 10h is far below 8h × ~22 May workdays → gap.
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 10 * 3600)] }),
    );
    const { container } = renderMatrix();
    // D-7.8-32: the shortfall moved from the cell to the row total — the CELL
    // itself is now a bare number with the plain aria-label suffix, not a
    // decorated chip. The row-total note carries the amber "short of target"
    // text (via the shared Circle/attention token).
    expect(screen.getByText('short of target')).toBeTruthy();
    expect(screen.getByLabelText(/Bob, PROJ-1, 10 hours, short of target/)).toBeTruthy();
    expect(screen.queryByText('below target')).toBeNull();
    expect(container.querySelector('.bg-state-danger-subtle')).toBeNull();
    expect(container.innerHTML).not.toContain('state-danger');
    expect(container.querySelector('svg.lucide-circle')).toBeTruthy();
    expect(container.querySelector('.text-amber-ink')).toBeTruthy();
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

  it('shows an EyeOff overlay (D-7.6-11, was Lock) on a restricted cell AND the row chip "N restricted" (no text glyph — AC11)', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({
        status: 'success',
        data: [epic('PROJ-1', 64 * 3600, { restrictedCount: 2 })],
      }),
    );
    const { container } = renderMatrix();
    // Cell aria-label appends ", restricted visibility" to the cell label.
    const cell = screen.getByLabelText(
      'Bob, PROJ-1, 64 hours, short of target, restricted visibility',
    );
    expect(cell).toBeTruthy();
    // Visible "hidden" text now accompanies the EyeOff icon (shared
    // registry) — lowercase per DESIGN.md's status-chip-restricted/Story
    // 7.8's AC (Finding 10 copy drift: was capitalised "Hidden").
    expect(within(cell).getByText('hidden')).toBeTruthy();
    expect(container.querySelector('svg.lucide-lock')).toBeNull();
    expect(container.querySelector('svg.lucide-eye-off')).toBeTruthy();
    // Row chip beside the name.
    expect(screen.getByText('2 restricted')).toBeTruthy();
    expect(screen.queryByText('⚠ 2 restricted')).toBeNull();
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
    expect(screen.getByText('Bob · PROJ-1')).toBeTruthy();
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
    expect(screen.getByText('Bob · PROJ-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByText('Bob · PROJ-1')).toBeNull();
  });

  it('closes the panel on Esc', () => {
    reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
    rowMock.mockReturnValue(
      rowState({ status: 'success', data: [epic('PROJ-1', 12 * 3600)] }),
    );
    renderMatrix();
    fireEvent.click(screen.getByRole('button', { name: /Bob, PROJ-1/ }));
    expect(screen.getByText('Bob · PROJ-1')).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    });
    expect(screen.queryByText('Bob · PROJ-1')).toBeNull();
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
    expect(screen.getByText('Bob · PROJ-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByText('Bob · PROJ-1')).toBeNull();
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

  it('the panel action reuses ApproveButton verbatim (Task 8: no second write path) — Story 7.8 supersedes the old "no action ever" boundary', () => {
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
    const panel = screen.getByRole('dialog', { name: /Bob · PROJ-1/ });
    expect(within(panel).getByText('Bob · PROJ-1')).toBeTruthy();
    // AC5 adds ONE action to the panel (Task 8) — reusing ApproveButton, the
    // SAME component the row's own button uses. Proven by the confirm
    // dialog it opens carrying ApproveButton's OWN copy/props (title, body,
    // commit label) — a hand-rolled second write path would not produce
    // this exact shape. (The mutation itself — the actual `sendRequest`
    // call — is exhaustively covered by `ApproveButton.test.tsx`; repeating
    // that full async round-trip here would only duplicate coverage.)
    fireEvent.click(within(panel).getByRole('button', { name: 'Approve 12h' }));
    const confirmDialog = screen.getByRole('dialog', { name: "Approve Bob's May 2026?" });
    expect(
      within(confirmDialog).getByTestId('approve-dialog-body').textContent,
    ).toBe("You're approving 12h across 1 epic for the May 2026 cycle. Accounting uses this figure.");
    expect(within(confirmDialog).getByRole('button', { name: 'Approve 12h' })).toBeTruthy();
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
    // AC11: no `⚠` text glyph — the chip's own registry icon carries it now.
    expect(
      screen.getByText(/2 worklogs with restricted visibility were excluded/),
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

  // --- Story 7.8: the chrome header, streaming line, cycle nav, and
  // "Approve remaining" ----------------------------------------------------

  describe('the chrome header + streaming line (AC1/AC4)', () => {
    it('shows the "N of M reports" streaming line as a role="status" live region while a report is still pending', () => {
      reportsMock.mockReturnValue(reportsOk(REPORTS));
      // Stable per-account mock objects (a fresh object per render would
      // make the parent's resolved-map effect loop, since it dedupes by
      // reference) — same convention as the pre-existing mixed-row tests.
      const bobRow = rowState({ status: 'success', data: [epic('PROJ-1', 8 * 3600)] });
      const amyRow = rowState({ status: 'pending' });
      rowMock.mockImplementation((accountId: string) =>
        accountId === 'r-bob' ? bobRow : amyRow,
      );
      renderMatrix();
      // `role="status"` has no "name from contents" per ARIA — query by role
      // alone and assert on its textContent.
      const line = screen.getByRole('status');
      expect(line.textContent).toMatch(/Loading 1 of 2 reports — rows appear as Jira responds/);
    });

    it('hides the streaming line once every report has settled', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [epic('PROJ-1', 8 * 3600)] }));
      renderMatrix();
      expect(screen.queryByRole('status')).toBeNull();
    });

    // Finding 31 (Minor, D-7.8-38): the POSITIVE half (deleting `role="status"`
    // from the streaming line reddens) was already guarded — this pins the
    // NEGATIVE half, which had nothing: re-adding `aria-live="polite"` to
    // `<tbody>` (the exact regression D-7.8-38 fixed — every streaming row,
    // every cell re-render, every status flip announced) passed undetected.
    it('Finding 31: <tbody> never carries aria-live (D-7.8-38 must not regress)', () => {
      reportsMock.mockReturnValue(reportsOk(REPORTS));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [epic('PROJ-1', 8 * 3600)] }));
      const { container } = renderMatrix();
      expect(container.querySelector('tbody')?.getAttribute('aria-live')).toBeNull();
    });

    // Finding 13 (Minor, AC1): zero tests pinned the eyebrow at baseline.
    it('Finding 13: renders the "Approvals · N reports" eyebrow', () => {
      reportsMock.mockReturnValue(reportsOk(REPORTS));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [] }));
      renderMatrix();
      expect(screen.getByText('Approvals · 2 reports')).toBeTruthy();
    });

    it('renders "N need attention" in white/opacity only on the chrome — never amber (D-7.8-30/AC8)', () => {
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
      approvalsMock.mockReturnValue(
        approvalsState([
          {
            v: 1,
            user: 'r-bob',
            cycle: '2026-05',
            by: 'mgr',
            at: '2026-05-20T00:00:00.000Z',
            restrictedCount: 0,
            checksum: 'x',
          },
        ]),
      );
      renderMatrix();
      // The text sits in DayStatusIndicator's bare inner <span>; the colour
      // class lives on its parent wrapper.
      const needAttentionText = screen.getByText('1 need attention');
      const wrapper = needAttentionText.parentElement;
      expect(wrapper?.className).toContain('text-white');
      expect(wrapper?.className).not.toMatch(/amber|state-warning/);
    });

    it('omits "need attention" entirely when the count is zero', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [epic('PROJ-1', 8 * 3600)] }));
      renderMatrix();
      expect(screen.queryByText(/need attention/)).toBeNull();
    });
  });

  describe('"Change cycle" actually moves between cycles of the SAME cadence (D-7.8-29/D-7.8-19e)', () => {
    it('moving to the previous cycle re-fetches the prior month and updates the title', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [] }));
      renderMatrix();
      expect(screen.getByText('May 2026')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Change cycle' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Previous cycle' }));
      expect(screen.getByText('April 2026')).toBeTruthy();
      expect(screen.queryByText('May 2026')).toBeNull();
      // The row re-queries the NEW cycle id, not the old one — Finding 12:
      // asserting the cycle id (not just the account id) is what actually
      // distinguishes this from the bug (passing `cycle` instead of
      // `effectiveCycle`) the test's own name claims to guard against.
      // (The mount naturally calls with the OLD '2026-05' first — the bug
      // this guards is the row STAYING on it after the cycle changes, so
      // the assertion checks the MOST RECENT call, not "never called".)
      expect(rowMock).toHaveBeenCalledWith('r-bob', '2026-04');
      const lastCall = rowMock.mock.calls[rowMock.mock.calls.length - 1];
      expect(lastCall).toEqual(['r-bob', '2026-04']);
    });

    it('moving next then previous returns to the original cycle', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [] }));
      renderMatrix();
      fireEvent.click(screen.getByRole('button', { name: 'Change cycle' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Next cycle' }));
      expect(screen.getByText('June 2026')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Change cycle' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Previous cycle' }));
      expect(screen.getByText('May 2026')).toBeTruthy();
    });
  });

  describe('"Approve remaining" actually works and respects the per-row canonicality gate (D-7.8-29/D-7.8-19e)', () => {
    it('is disabled with a visible reason when no report is eligible', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [] }));
      renderMatrix();
      const btn = screen.getByRole('button', { name: 'Approve remaining' });
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      expect(btn.title).toBe('No reports ready to approve');
    });

    it('batches every untouched-but-approvable report behind ONE confirm, excluding an already-approved row, a dirty row, and a non-canonical row', async () => {
      reportsMock.mockReturnValue(
        reportsOk([
          { accountId: 'r-amy', displayName: 'Amy' }, // untouched, canonical → eligible
          { accountId: 'r-bob', displayName: 'Bob' }, // already approved → excluded
          { accountId: 'r-cid', displayName: 'Cid' }, // dirty → excluded
          { accountId: 'r-deb', displayName: 'Deb' }, // non-canonical → excluded
        ]),
      );
      const amyRow = rowState({ status: 'success', data: [epic('PROJ-1', 10 * 3600)] });
      const bobRow = rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 20 * 3600, {
            worklogs: [
              {
                ticketKey: 'PROJ-1-1',
                ticketSummary: 's',
                seconds: 20 * 3600,
                updated: '2026-05-10T00:00:00.000Z',
              },
            ],
          }),
        ],
      });
      const cidRow = rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 5 * 3600, {
            worklogs: [
              {
                ticketKey: 'PROJ-1-1',
                ticketSummary: 's',
                seconds: 5 * 3600,
                updated: '2026-05-25T00:00:00.000Z', // after approval → dirty
              },
            ],
          }),
        ],
      });
      const debRow = rowState({ status: 'success', data: [epic('PROJ-1', 3 * 3600)] });
      rowMock.mockImplementation((accountId: string) => {
        if (accountId === 'r-amy') return amyRow;
        if (accountId === 'r-bob') return bobRow;
        if (accountId === 'r-cid') return cidRow;
        return debRow;
      });
      approvalsMock.mockImplementation(() =>
        approvalsState([
          {
            v: 1,
            user: 'r-bob',
            cycle: '2026-05',
            by: 'mgr',
            at: '2026-05-20T00:00:00.000Z',
            restrictedCount: 0,
            checksum: 'x',
          },
          {
            v: 1,
            user: 'r-cid',
            cycle: '2026-05',
            by: 'mgr',
            at: '2026-05-20T00:00:00.000Z',
            restrictedCount: 0,
            checksum: 'x',
          },
        ]),
      );
      canApproveMock.mockImplementation((accountId: string) =>
        accountId === 'r-deb' ? canApproveState(false, 'Other Manager') : canApproveState(true),
      );
      sendRequestMock.mockResolvedValue({ confirmed: ['PROJ-1'], failed: [], enqueued: [] });
      renderMatrix();
      await waitFor(() =>
        expect(screen.getByTestId('matrix-progress').textContent).toBe('1 of 4 approved'),
      );
      const btn = screen.getByRole('button', { name: 'Approve remaining' });
      expect(btn.getAttribute('aria-disabled')).toBeNull();
      fireEvent.click(btn);
      expect(screen.getByText('Approve 1 remaining report?')).toBeTruthy();
      expect(screen.getByTestId('approve-remaining-dialog-body').textContent).toBe(
        "You're approving 10h across 1 report for the May 2026 cycle. Accounting uses this figure.",
      );
      fireEvent.click(screen.getByTestId('approve-remaining-confirm'));
      await waitFor(() =>
        expect(sendRequestMock).toHaveBeenCalledWith('approve-cycle', {
          user: 'r-amy',
          cycle: '2026-05',
          by: 'mgr-1',
          epics: [{ epicKey: 'PROJ-1', restrictedCount: 0 }],
        }),
      );
      // Never fanned out for the excluded rows.
      expect(sendRequestMock).not.toHaveBeenCalledWith(
        'approve-cycle',
        expect.objectContaining({ user: 'r-bob' }),
      );
      expect(sendRequestMock).not.toHaveBeenCalledWith(
        'approve-cycle',
        expect.objectContaining({ user: 'r-cid' }),
      );
      expect(sendRequestMock).not.toHaveBeenCalledWith(
        'approve-cycle',
        expect.objectContaining({ user: 'r-deb' }),
      );
    });
  });

  // D-7.8-20 superseded D-7.8-16: `fetchReportCycleWorklogsByEpic` now pages
  // through every result, so the `truncated` flag/note/caveat this describe
  // block used to cover no longer exist anywhere in the type or the UI —
  // see `lib/jira-client.test.ts` for the pagination coverage that replaces
  // it. D-7.8-21 below is the Blocker's remaining half.

  describe('D-7.8-21: "Approve remaining" carries the aggregate restricted caveat', () => {
    it('renders the aggregate restricted caveat when any batched row has restrictedCount > 0', () => {
      reportsMock.mockReturnValue(
        reportsOk([
          { accountId: 'r-amy', displayName: 'Amy' },
          { accountId: 'r-bob', displayName: 'Bob' },
        ]),
      );
      const amyRow = rowState({
        status: 'success',
        data: [epic('PROJ-1', 10 * 3600, { restrictedCount: 2 })],
      });
      const bobRow = rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 5 * 3600, { restrictedCount: 1 }),
          epic('PROJ-2', 3 * 3600, { restrictedCount: 0 }),
        ],
      });
      rowMock.mockImplementation((accountId: string) => (accountId === 'r-amy' ? amyRow : bobRow));
      renderMatrix();
      fireEvent.click(screen.getByRole('button', { name: 'Approve remaining' }));
      const line = screen.getByTestId('approve-remaining-restricted-line');
      // 2 restricted epics total: Amy's PROJ-1 + Bob's PROJ-1 (Bob's PROJ-2 has none).
      expect(line.textContent).toMatch(/2 epics across these reports have worklogs you can't see/);
    });

    it('omits the aggregate restricted caveat when no batched row has any restricted worklogs', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-amy', displayName: 'Amy' }]));
      rowMock.mockReturnValue(
        rowState({ status: 'success', data: [epic('PROJ-1', 10 * 3600, { restrictedCount: 0 })] }),
      );
      renderMatrix();
      fireEvent.click(screen.getByRole('button', { name: 'Approve remaining' }));
      expect(screen.queryByTestId('approve-remaining-restricted-line')).toBeNull();
    });

    it('singular: "1 epic across these reports has worklogs..." at n=1', () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-amy', displayName: 'Amy' }]));
      rowMock.mockReturnValue(
        rowState({ status: 'success', data: [epic('PROJ-1', 10 * 3600, { restrictedCount: 1 })] }),
      );
      renderMatrix();
      fireEvent.click(screen.getByRole('button', { name: 'Approve remaining' }));
      expect(
        screen.getByTestId('approve-remaining-restricted-line').textContent,
      ).toMatch(/1 epic across these reports has worklogs you can't see/);
    });

    // Does NOT regress Story 5.8's canonicality gate — the existing
    // "batches every untouched-but-approvable report..." test above already
    // proves a non-canonical row is excluded; this proves adding the caveat
    // didn't change that.
    it('still excludes a non-canonical row from the batch even when it has restricted worklogs', async () => {
      reportsMock.mockReturnValue(
        reportsOk([
          { accountId: 'r-amy', displayName: 'Amy' },
          { accountId: 'r-deb', displayName: 'Deb' },
        ]),
      );
      const amyRow = rowState({
        status: 'success',
        data: [epic('PROJ-1', 10 * 3600, { restrictedCount: 0 })],
      });
      const debRow = rowState({
        status: 'success',
        data: [epic('PROJ-1', 3 * 3600, { restrictedCount: 5 })],
      });
      rowMock.mockImplementation((accountId: string) => (accountId === 'r-amy' ? amyRow : debRow));
      canApproveMock.mockImplementation((accountId: string) =>
        accountId === 'r-deb' ? canApproveState(false, 'Other Manager') : canApproveState(true),
      );
      sendRequestMock.mockResolvedValue({ confirmed: ['PROJ-1'], failed: [], enqueued: [] });
      renderMatrix();
      fireEvent.click(screen.getByRole('button', { name: 'Approve remaining' }));
      // Deb is excluded (non-canonical), so no restricted worklog reaches the batch.
      expect(screen.queryByTestId('approve-remaining-restricted-line')).toBeNull();
      fireEvent.click(screen.getByTestId('approve-remaining-confirm'));
      await waitFor(() =>
        expect(sendRequestMock).toHaveBeenCalledWith(
          'approve-cycle',
          expect.objectContaining({ user: 'r-amy' }),
        ),
      );
      expect(sendRequestMock).not.toHaveBeenCalledWith(
        'approve-cycle',
        expect.objectContaining({ user: 'r-deb' }),
      );
    });
  });

  describe('Finding 2: the "Approve remaining" confirm dialog backdrop does not dismiss', () => {
    it('a pointer-down outside the batch confirm dialog does NOT close it', async () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-amy', displayName: 'Amy' }]));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [epic('PROJ-1', 10 * 3600)] }));
      renderMatrix();
      fireEvent.click(screen.getByRole('button', { name: 'Approve remaining' }));
      expect(screen.getByRole('dialog')).toBeTruthy();
      // Let Radix's deferred outside-pointerdown listener attach (Story 7.7's
      // house pattern — a synchronous fireEvent never reaches it).
      await new Promise((resolve) => setTimeout(resolve, 0));
      fireEvent.pointerDown(document.body);
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(sendRequestMock).not.toHaveBeenCalled();
    });
  });

  describe('Finding 9/22: "Approve remaining" is never silently partial, and cannot double-fire', () => {
    it('Finding 22: the header button disables mid-batch, and a stray second click starts no overlapping batch', async () => {
      reportsMock.mockReturnValue(
        reportsOk([
          { accountId: 'r-amy', displayName: 'Amy' },
          { accountId: 'r-bob', displayName: 'Bob' },
        ]),
      );
      rowMock.mockReturnValue(rowState({ status: 'success', data: [epic('PROJ-1', 10 * 3600)] }));
      let resolveFirst: (v: { confirmed: string[]; failed: string[]; enqueued: string[] }) => void;
      let sendCallCount = 0;
      sendRequestMock.mockImplementation(() => {
        sendCallCount += 1;
        if (sendCallCount === 1) {
          return new Promise((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve({ confirmed: ['PROJ-1'], failed: [], enqueued: [] });
      });
      renderMatrix();
      fireEvent.click(screen.getByRole('button', { name: 'Approve remaining' }));
      fireEvent.click(screen.getByTestId('approve-remaining-confirm'));
      // Mid-batch, after the first (still-pending) post: the HEADER button
      // must be disabled — the original defect left it enabled throughout
      // the whole sequential loop, so a second click could re-open the
      // dialog over a still-stale row set and start an overlapping batch.
      await waitFor(() => {
        const btn = screen.getByRole('button', { name: 'Approve remaining' });
        expect(btn.getAttribute('aria-disabled')).toBe('true');
      });
      // A stray click while disabled opens no dialog and posts nothing extra
      // (MatrixChromeHeader's onClick fails closed on `aria-disabled`).
      fireEvent.click(screen.getByRole('button', { name: 'Approve remaining' }));
      expect(screen.queryAllByRole('dialog')).toHaveLength(0);
      expect(sendCallCount).toBe(1);
      resolveFirst!({ confirmed: ['PROJ-1'], failed: [], enqueued: [] });
      await waitFor(() => expect(sendCallCount).toBe(2));
      // The batch settles and the header re-enables.
      await waitFor(() => {
        const btn = screen.getByRole('button', { name: 'Approve remaining' });
        expect(btn.getAttribute('aria-disabled')).toBeNull();
      });
    });

    it('Finding 9: a mid-batch failure surfaces a visible amber (never red) summary — never silent', async () => {
      reportsMock.mockReturnValue(
        reportsOk([
          { accountId: 'r-amy', displayName: 'Amy' },
          { accountId: 'r-bob', displayName: 'Bob' },
        ]),
      );
      const amyRow = rowState({ status: 'success', data: [epic('PROJ-1', 10 * 3600)] });
      const bobRow = rowState({ status: 'success', data: [epic('PROJ-2', 5 * 3600)] });
      rowMock.mockImplementation((accountId: string) => (accountId === 'r-amy' ? amyRow : bobRow));
      sendRequestMock.mockImplementation((_type: string, payload: { user: string }) =>
        Promise.resolve(
          payload.user === 'r-amy'
            ? { confirmed: ['PROJ-1'], failed: [], enqueued: [] }
            : null, // sendRequest returns null (never throws) on a rejected/absent response
        ),
      );
      renderMatrix();
      fireEvent.click(screen.getByRole('button', { name: 'Approve remaining' }));
      fireEvent.click(screen.getByTestId('approve-remaining-confirm'));
      const summary = await screen.findByTestId('approve-remaining-summary');
      expect(summary.textContent).toMatch(/Approved 1 of 2 reports/);
      expect(summary.className).not.toMatch(/state-danger|status-error/);
      expect(summary.className).toMatch(/amber/);
    });

    it('Finding 9: aborts and posts nothing if the manager account is unresolved at click time', async () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-amy', displayName: 'Amy' }]));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [epic('PROJ-1', 10 * 3600)] }));
      currentUserMock.mockReturnValue({ isPending: false, isError: false, data: 'mgr-1' });
      const { rerender } = renderMatrix();
      fireEvent.click(screen.getByRole('button', { name: 'Approve remaining' }));
      // The current-user query invalidates to unresolved WHILE the dialog is
      // open — force the re-render a real invalidation would trigger.
      currentUserMock.mockReturnValue({ isPending: true, isError: false, data: undefined });
      rerender(
        <ManagerMatrix
          cycle="2026-05"
          onSwitchToToday={() => {}}
          section="manager"
          onSectionChange={() => {}}
          showManagerTab
        />,
      );
      fireEvent.click(screen.getByTestId('approve-remaining-confirm'));
      await new Promise((r) => setTimeout(r, 0));
      expect(sendRequestMock).not.toHaveBeenCalled();
    });
  });

  describe('Finding 34: "Approve remaining" excludes a zero-second row', () => {
    it('a row whose Epic groups sum to 0 seconds is excluded from the batch', async () => {
      reportsMock.mockReturnValue(
        reportsOk([
          { accountId: 'r-amy', displayName: 'Amy' },
          { accountId: 'r-zero', displayName: 'Zero' },
        ]),
      );
      const amyRow = rowState({ status: 'success', data: [epic('PROJ-1', 10 * 3600)] });
      const zeroRow = rowState({ status: 'success', data: [epic('PROJ-1', 0)] });
      rowMock.mockImplementation((accountId: string) => (accountId === 'r-amy' ? amyRow : zeroRow));
      sendRequestMock.mockResolvedValue({ confirmed: ['PROJ-1'], failed: [], enqueued: [] });
      renderMatrix();
      fireEvent.click(screen.getByRole('button', { name: 'Approve remaining' }));
      expect(screen.getByText('Approve 1 remaining report?')).toBeTruthy();
      fireEvent.click(screen.getByTestId('approve-remaining-confirm'));
      await waitFor(() =>
        expect(sendRequestMock).toHaveBeenCalledWith(
          'approve-cycle',
          expect.objectContaining({ user: 'r-amy' }),
        ),
      );
      expect(sendRequestMock).not.toHaveBeenCalledWith(
        'approve-cycle',
        expect.objectContaining({ user: 'r-zero' }),
      );
    });
  });

  // --- Story 6.1 AC1: axe a11y scan of the rendered Manager matrix --------

  describe('a11y scan (Story 6.1 AC1)', () => {
    it('a populated matrix (mixed canonical/non-canonical, restricted, approved) has zero Critical/Serious violations', async () => {
      reportsMock.mockReturnValue(reportsOk(REPORTS));
      const bobRow = rowState({
        status: 'success',
        data: [
          epic('PROJ-1', 64 * 3600, {
            restrictedCount: 2, // exercises the locked cell (decorative Lock fix)
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
      });
      const amyRow = rowState({ status: 'success', data: [epic('PROJ-2', 12.5 * 3600)] });
      rowMock.mockImplementation((accountId: string) =>
        accountId === 'r-bob' ? bobRow : amyRow,
      );
      // Bob: approved. Amy: non-canonical → disabled Approve (aria-disabled + reason).
      const approval: ApprovalComment = {
        v: 1,
        user: 'r-bob',
        cycle: '2026-05',
        by: 'mgr-1',
        at: '2026-05-20T00:00:00.000Z',
        restrictedCount: 2,
        checksum: 'x',
      };
      approvalsMock.mockImplementation(() => approvalsState([approval]));
      canApproveMock.mockImplementation((accountId: string) =>
        accountId === 'r-bob' ? canApproveState(true) : canApproveState(false, 'Dave Lead'),
      );
      const { container } = renderMatrix();
      await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
      const results = await scan(container);
      expect(criticalOrSerious(results.violations)).toEqual([]);
    });

    it('the empty-matrix state has zero Critical/Serious violations', async () => {
      reportsMock.mockReturnValue(reportsOk([{ accountId: 'r-bob', displayName: 'Bob' }]));
      rowMock.mockReturnValue(rowState({ status: 'success', data: [] }));
      const { container } = renderMatrix();
      const results = await scan(container);
      expect(criticalOrSerious(results.violations)).toEqual([]);
    });
  });
});
