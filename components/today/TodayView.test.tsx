import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UNDO_WINDOW_MS } from '@/components/today/LoggedToday';
import { scan, criticalOrSerious } from '@/lib/test/axe';

/**
 * Story 7.5: `TicketPicker` (and the 55-ticket browse tree it rendered) is
 * gone from this view — replaced by `RecentlyWorked`, fed by
 * `useRecentlyWorked`. This file's `useHierarchyTickets`/`pinned-tickets`/
 * `ticket-search`/`create-subtask`/`catch-all` mocks from Story 7.2–7.4 are
 * gone with it: none of those modules are reachable from `TodayView` any
 * more. `TicketPicker.tsx` has since been deleted outright — the week grid,
 * its last consumer, now uses `components/week/AddSubtaskRow.tsx` — and
 * `useHierarchyTickets`/`lib/hierarchy`/`pinned-tickets`/`create-subtask`
 * went with it.
 */

const mockUseRecentlyWorked = vi.fn();
vi.mock('@/hooks/useRecentlyWorked', () => ({
  useRecentlyWorked: () => mockUseRecentlyWorked(),
}));

const postWorklogMock = vi.fn();
const updateWorklogMock = vi.fn();
const deleteWorklogMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  postWorklog: (...args: unknown[]) => postWorklogMock(...args),
  updateWorklog: (...args: unknown[]) => updateWorklogMock(...args),
  deleteWorklog: (...args: unknown[]) => deleteWorklogMock(...args),
}));

const sendMessageMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

let outboxDrained = 0;
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: vi.fn(async () => ({})),
  remove: vi.fn(async () => {}),
  update: vi.fn(async () => {}),
  runOutboxRetryPass: vi.fn(async () => ({ drained: 0 })),
  outboxItem: {
    getValue: vi.fn(async () => []),
    setValue: vi.fn(async () => {}),
    watch: vi.fn(() => () => {}),
  },
  outboxDrainedItem: {
    getValue: vi.fn(async () => outboxDrained),
    setValue: vi.fn(async (v: number) => {
      outboxDrained = v;
    }),
    watch: vi.fn(() => () => {}),
  },
}));

const catchAllProjectKeyGetValue = vi.fn(async () => 'KNP' as string);
vi.mock('@/lib/storage/settings', () => ({
  approvalCycleItem: { getValue: vi.fn(async () => 'calendar-month') },
  targetHoursItem: { getValue: vi.fn(async () => 8) },
  catchAllProjectKeyItem: { getValue: () => catchAllProjectKeyGetValue() },
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// `QuickLogForm` (rendered for real by this file, reached via
// "Recently worked"'s "+", D-7.5-11) stamps the resume card's data seam on a
// confirmed post. `@wxt-dev/storage`'s `defineItem` fires an unawaited
// background read the instant a module calls it, so the real
// `lib/storage/last-logged` must be mocked here too — not just where a test
// explicitly asserts on the write (Story 7.3, Task 1).
vi.mock('@/lib/storage/last-logged', () => ({
  getLastLoggedTicket: vi.fn(async () => null),
  setLastLoggedTicket: vi.fn(async () => {}),
}));

const { TodayView } = await import('./TodayView');

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const ONE_RECENT = [{ key: 'PROJ-2', summary: 'Fix button', startedAt: new Date().toISOString() }];

async function logHoursViaRecentlyWorked(hours: string): Promise<void> {
  fireEvent.click(screen.getByLabelText('Log time to PROJ-2'));
  await waitFor(() => expect(screen.getByLabelText('Hours')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Hours'), { target: { value: hours } });
  fireEvent.click(screen.getByText('Log'));
}

describe('TodayView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outboxDrained = 0;
    catchAllProjectKeyGetValue.mockResolvedValue('KNP');
    mockUseRecentlyWorked.mockReturnValue([]);
    postWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-1', timeSpentSeconds: 9000 },
    });
    updateWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-1', timeSpentSeconds: 14400 },
    });
    deleteWorklogMock.mockResolvedValue({ kind: 'ok', value: undefined });
    // @ts-expect-error minimal chrome stub for openOptionsPage
    globalThis.chrome = { runtime: { openOptionsPage: vi.fn() } };
  });

  // ---- AC1: the tree is gone; RecentlyWorked replaces it -----------------

  it('does not render a ticket-picker tree, a search-or-pick input, or a "Recently used" heading', () => {
    renderWithProviders(<TodayView />);
    expect(screen.queryByPlaceholderText(/Search or pick/)).toBeNull();
    expect(screen.queryByText('Recently used')).toBeNull();
    expect(screen.queryByRole('tree')).toBeNull();
  });

  it('renders no "Recently worked" section when useRecentlyWorked returns zero items (D-7.5-13)', () => {
    mockUseRecentlyWorked.mockReturnValue([]);
    renderWithProviders(<TodayView />);
    expect(screen.queryByText('Recently worked')).toBeNull();
  });

  it('renders the "Recently worked" rows useRecentlyWorked returns', () => {
    mockUseRecentlyWorked.mockReturnValue(ONE_RECENT);
    renderWithProviders(<TodayView />);
    expect(screen.getByText('Recently worked')).toBeTruthy();
    expect(screen.getByText('PROJ-2')).toBeTruthy();
    expect(screen.getByText('Fix button')).toBeTruthy();
  });

  // ---- D-7.5-11: the `+` opens QuickLogForm, pre-targeted ----------------

  it('swaps "Recently worked" for QuickLogForm, pre-targeted at that ticket, when its "+" is clicked', async () => {
    mockUseRecentlyWorked.mockReturnValue(ONE_RECENT);
    renderWithProviders(<TodayView />);

    fireEvent.click(screen.getByLabelText('Log time to PROJ-2'));

    await waitFor(() => {
      expect(screen.getByText('PROJ-2')).toBeTruthy();
      expect(screen.getByLabelText('Hours')).toBeTruthy();
    });
    // The RecentlyWorked section itself is gone while the form is open —
    // it is a swap (D-7.5-22's `selectedTicket` branch), not an overlay.
    expect(screen.queryByText('Recently worked')).toBeNull();
  });

  it('reports the summed seconds via onTotalChange after logging via a Recently-worked row', async () => {
    mockUseRecentlyWorked.mockReturnValue(ONE_RECENT);
    const onTotalChange = vi.fn();
    renderWithProviders(<TodayView onTotalChange={onTotalChange} />);

    await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(0));
    await logHoursViaRecentlyWorked('2h');

    await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(7200), {
      timeout: 1000,
    });
  });

  it('editing a logged entry re-reports the recomputed total via onTotalChange', async () => {
    mockUseRecentlyWorked.mockReturnValue(ONE_RECENT);
    const onTotalChange = vi.fn();
    renderWithProviders(<TodayView onTotalChange={onTotalChange} />);

    await logHoursViaRecentlyWorked('8h');
    await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(28800), {
      timeout: 1000,
    });

    fireEvent.click(screen.getByLabelText('Edit PROJ-2, 8h'));
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '4h' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(updateWorklogMock).toHaveBeenCalledWith(
        'PROJ-2',
        'wl-1',
        expect.objectContaining({ timeSpentSeconds: 14400 }),
      );
    });
    await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(14400));
  });

  it('deleting a logged entry re-reports the total via onTotalChange once the undo window commits', async () => {
    mockUseRecentlyWorked.mockReturnValue(ONE_RECENT);
    const onTotalChange = vi.fn();
    renderWithProviders(<TodayView onTotalChange={onTotalChange} />);

    await logHoursViaRecentlyWorked('8h');
    await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(28800), {
      timeout: 1000,
    });

    // Fake timers only around the undo window itself — mixing them with
    // RTL's `waitFor` (which polls on its own timer) is unreliable, so every
    // assertion in this block is synchronous, per the project's established
    // `act(async () => { await vi.advanceTimersByTimeAsync(...) })` pattern
    // (see `hooks/useTicketSearch.test.ts`).
    vi.useFakeTimers();
    try {
      // The row hides (and the total drops) IMMEDIATELY on delete-request —
      // well before the undo window commits.
      //
      // Review Finding 3 (Major): `toHaveBeenCalledWith(0)` is satisfied by
      // ANY historical call with that argument, including the call made at
      // MOUNT (before anything was logged) — so this assertion passed even
      // with the `pendingDeletionId` filter completely removed from
      // `totalSeconds` below. `toHaveBeenLastCalledWith` pins the value of
      // the MOST RECENT call, which is what "drops immediately on
      // delete-request" actually claims.
      fireEvent.click(screen.getByLabelText('Delete PROJ-2, 8h'));
      expect(onTotalChange).toHaveBeenLastCalledWith(0);
      expect(deleteWorklogMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
      });
      expect(deleteWorklogMock).toHaveBeenCalledWith('PROJ-2', 'wl-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not throw when onTotalChange is omitted (stays independently testable)', async () => {
    mockUseRecentlyWorked.mockReturnValue(ONE_RECENT);
    renderWithProviders(<TodayView />);
    await expect(logHoursViaRecentlyWorked('1h')).resolves.not.toThrow();
  });

  // ---- D-7.5-22: the handoff row calls onRequestSearchFocus ---------------

  it('the "Recently worked" handoff row calls onRequestSearchFocus', () => {
    mockUseRecentlyWorked.mockReturnValue(ONE_RECENT);
    const onRequestSearchFocus = vi.fn();
    renderWithProviders(<TodayView onRequestSearchFocus={onRequestSearchFocus} />);

    fireEvent.click(screen.getByText('More assigned tickets · Search to find them →'));
    expect(onRequestSearchFocus).toHaveBeenCalledTimes(1);
  });

  // --- Story 7.2 Finding 3: externally-owned entries (the action bar's -----
  // --- relocated PtoQuickAction) keep a working in-popup correction path ---

  // Finding 26: `summary` stands in for a REAL Jira subtask summary (AC7 —
  // rendered verbatim, never rewritten by the copy rename); reverted from
  // "Time off" back to "PTO" so the fixture doesn't drift from the field it
  // models.
  const PTO_ENTRY = {
    key: 'PTO-1',
    summary: 'PTO',
    hoursDisplay: '8h',
    started: '2026-01-01',
    seconds: 28800,
    worklogId: 'pto-wl-1',
  };

  describe('externalEntries (Story 7.2, Finding 3)', () => {
    it('renders an externally-owned entry in "Logged today" alongside its own entries', () => {
      renderWithProviders(<TodayView externalEntries={[PTO_ENTRY]} />);

      expect(screen.getByText('PTO-1')).toBeTruthy();
      expect(screen.getByLabelText('Delete PTO-1, 8h')).toBeTruthy();
    });

    it('routes an edit of an externally-owned entry to onExternalEntryEdited, not its own reducer', async () => {
      const onExternalEntryEdited = vi.fn();

      renderWithProviders(
        <TodayView
          externalEntries={[PTO_ENTRY]}
          onExternalEntryEdited={onExternalEntryEdited}
        />,
      );

      fireEvent.click(screen.getByLabelText('Edit PTO-1, 8h'));
      fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '4h' } });
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(updateWorklogMock).toHaveBeenCalledWith(
          'PTO-1',
          'pto-wl-1',
          expect.objectContaining({ timeSpentSeconds: 14400 }),
        );
      });
      await waitFor(() =>
        expect(onExternalEntryEdited).toHaveBeenCalledWith(
          'pto-wl-1',
          expect.objectContaining({ seconds: 14400 }),
        ),
      );
    });

    it('routes a delete of an externally-owned entry to onExternalEntryDeleted, not its own reducer, once committed', async () => {
      const onExternalEntryDeleted = vi.fn();

      renderWithProviders(
        <TodayView
          externalEntries={[PTO_ENTRY]}
          onExternalEntryDeleted={onExternalEntryDeleted}
        />,
      );

      vi.useFakeTimers();
      try {
        fireEvent.click(screen.getByLabelText('Delete PTO-1, 8h'));
        expect(onExternalEntryDeleted).not.toHaveBeenCalled();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
        });
        expect(deleteWorklogMock).toHaveBeenCalledWith('PTO-1', 'pto-wl-1');
        expect(onExternalEntryDeleted).toHaveBeenCalledWith('pto-wl-1');
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports onTotalChange scoped to its own entries only — the external contribution is not folded in (avoids double-reporting what the shell already tracks separately)', async () => {
      mockUseRecentlyWorked.mockReturnValue(ONE_RECENT);
      const onTotalChange = vi.fn();

      renderWithProviders(
        <TodayView onTotalChange={onTotalChange} externalEntries={[PTO_ENTRY]} />,
      );

      // Mounts reporting 0 (its own entries are empty) even though an
      // external (PTO) entry is present and rendered.
      await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(0));

      await logHoursViaRecentlyWorked('2h');

      // Reports only its own 2h (7200s) — never 7200 + PTO_ENTRY.seconds.
      await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(7200), {
        timeout: 1000,
      });
      expect(onTotalChange).not.toHaveBeenCalledWith(7200 + PTO_ENTRY.seconds);
    });
  });

  // ---- D-7.5-18: pending-deletion forwarding -------------------------------

  it('forwards the pending-deletion id up via onPendingDeletionChange for both own and external entries', async () => {
    const onPendingDeletionChange = vi.fn();
    renderWithProviders(
      <TodayView
        externalEntries={[PTO_ENTRY]}
        onPendingDeletionChange={onPendingDeletionChange}
      />,
    );

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByLabelText('Delete PTO-1, 8h'));
      expect(onPendingDeletionChange).toHaveBeenCalledWith('pto-wl-1');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
      });
      expect(deleteWorklogMock).toHaveBeenCalled();
      expect(onPendingDeletionChange).toHaveBeenLastCalledWith(null);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the catch-all-unconfigured placeholder when the project key is blank', async () => {
    catchAllProjectKeyGetValue.mockResolvedValue('');

    renderWithProviders(<TodayView />);
    expect(await screen.findByText(/Catch-all not configured/)).toBeTruthy();
    expect(screen.getByText(/to log Admin\/Meetings\/time off/)).toBeTruthy();
  });

  // --- Story 6.1 AC1: axe a11y scan of the Today view --------------------

  describe('a11y scan (Story 6.1 AC1)', () => {
    it('the Today view has zero Critical/Serious violations', async () => {
      mockUseRecentlyWorked.mockReturnValue(ONE_RECENT);
      const { container } = renderWithProviders(
        <TodayView externalEntries={[PTO_ENTRY]} />,
      );
      await screen.findByText('Recently worked');
      const results = await scan(container);
      expect(criticalOrSerious(results.violations)).toEqual([]);
    });
  });
});
