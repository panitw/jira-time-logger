import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scan, criticalOrSerious } from '@/lib/test/axe';

vi.mock('@/hooks/useHierarchyTickets', () => ({
  useHierarchyTickets: vi.fn(),
}));

vi.mock('@/lib/storage/pinned-tickets', async () => ({
  getPinnedTickets: vi.fn(async () => []),
  addPinnedTicket: vi.fn(async () => {}),
  removePinnedTicket: vi.fn(async () => {}),
}));

vi.mock('@/lib/ticket-search', () => ({
  searchTickets: vi.fn(async () => ({ kind: 'ok', value: [] })),
}));

vi.mock('@/lib/create-subtask', () => ({
  createSubtask: vi.fn(async () => ({ kind: 'ok', value: { id: '1', key: 'PROJ-999', summary: 'New sub' } })),
}));

const postWorklogMock = vi.fn();
const updateWorklogMock = vi.fn();
const deleteWorklogMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  postWorklog: (...args: unknown[]) => postWorklogMock(...args),
  updateWorklog: (...args: unknown[]) => updateWorklogMock(...args),
  deleteWorklog: (...args: unknown[]) => deleteWorklogMock(...args),
}));

const fetchCatchAllSubtasksMock = vi.fn();
vi.mock('@/lib/catch-all', () => ({
  fetchCatchAllSubtasks: (...args: unknown[]) => fetchCatchAllSubtasksMock(...args),
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

const { useHierarchyTickets } = await import('@/hooks/useHierarchyTickets');
const { TodayView } = await import('./TodayView');

const mockUseHierarchyTickets = vi.mocked(useHierarchyTickets);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const ONE_TASK_ONE_SUBTASK = [
  {
    key: 'PROJ-1',
    summary: 'Alpha task',
    assigneeDisplayName: 'Test User',
    source: 'self' as const,
    subtasks: [
      { key: 'PROJ-2', summary: 'Fix button', assigneeDisplayName: 'Test User' },
    ],
  },
];

async function logHours(hours: string): Promise<void> {
  fireEvent.click(screen.getByLabelText('Pick PROJ-2: Fix button'));
  await waitFor(() => expect(screen.getByLabelText('Hours')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Hours'), { target: { value: hours } });
  fireEvent.click(screen.getByText('Log'));
}

describe('TodayView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outboxDrained = 0;
    catchAllProjectKeyGetValue.mockResolvedValue('KNP');
    fetchCatchAllSubtasksMock.mockResolvedValue({ kind: 'ok', value: [] });
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

  it('renders the search input', () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);
    expect(screen.getByPlaceholderText(/Search or pick/)).toBeTruthy();
  });

  it('renders hierarchy tasks in the picker', () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: [
        {
          key: 'PROJ-123',
          summary: 'Settings page',
          assigneeDisplayName: 'Test User',
          source: 'self',
          subtasks: [
            { key: 'PROJ-124', summary: 'Fix button', assigneeDisplayName: 'Test User' },
          ],
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);
    expect(screen.getByText('PROJ-123')).toBeTruthy();
    expect(screen.getByText('Settings page')).toBeTruthy();
  });

  it('shows skeleton when loading', () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);

    const { container } = renderWithProviders(<TodayView />);
    // Reduced-motion gated (Story 6.1 AC6).
    expect(container.querySelector('.motion-safe\\:animate-pulse')).toBeTruthy();
  });

  it('shows error state with retry button', () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);
    expect(screen.getByText(/Couldn.t load suggestions/)).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('shows "Search Jira" affordance at bottom', () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);
    expect(screen.getByText('+ Search Jira for a ticket…')).toBeTruthy();
  });

  it('filters tasks when typing in search', async () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: [
        {
          key: 'PROJ-1',
          summary: 'Alpha task',
          assigneeDisplayName: null,
          source: 'self',
          subtasks: [],
        },
        {
          key: 'PROJ-2',
          summary: 'Beta task',
          assigneeDisplayName: null,
          source: 'self',
          subtasks: [],
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);

    const input = screen.getByPlaceholderText(/Search or pick/);
    fireEvent.change(input, { target: { value: 'Alpha' } });

    await waitFor(
      () => {
        expect(screen.getByText('PROJ-1')).toBeTruthy();
      },
      { timeout: 300 },
    );
  });

  it('swaps picker for QuickLogForm when a sub-task is selected', async () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: ONE_TASK_ONE_SUBTASK,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);

    // Click the sub-task leaf
    fireEvent.click(screen.getByLabelText('Pick PROJ-2: Fix button'));

    // QuickLogForm should render with the ticket key
    await waitFor(() => {
      expect(screen.getByText('PROJ-2')).toBeTruthy();
      expect(screen.getByLabelText('Hours')).toBeTruthy();
    });
  });

  // --- Story 7.2: onTotalChange lifts the session total to the popup shell -

  it('reports the summed seconds via onTotalChange after logging a ticket', async () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: ONE_TASK_ONE_SUBTASK,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    const onTotalChange = vi.fn();
    renderWithProviders(<TodayView onTotalChange={onTotalChange} />);

    // Reported once on mount with 0.
    await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(0));

    await logHours('2h');

    await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(7200), {
      timeout: 1000,
    });
  });

  it('editing a logged entry re-reports the recomputed total via onTotalChange', async () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: ONE_TASK_ONE_SUBTASK,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    const onTotalChange = vi.fn();
    renderWithProviders(<TodayView onTotalChange={onTotalChange} />);

    await logHours('8h');
    await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(28800), {
      timeout: 1000,
    });

    // Open the row menu and edit the entry down to 4h.
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-2, 8h'));
    fireEvent.click(screen.getByText('Edit'));
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

  it('deleting a logged entry re-reports the total via onTotalChange', async () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: ONE_TASK_ONE_SUBTASK,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    const onTotalChange = vi.fn();
    renderWithProviders(<TodayView onTotalChange={onTotalChange} />);

    await logHours('8h');
    await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(28800), {
      timeout: 1000,
    });

    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-2, 8h'));
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(deleteWorklogMock).toHaveBeenCalledWith('PROJ-2', 'wl-1');
    });
    await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(0));
  });

  it('does not throw when onTotalChange is omitted (stays independently testable)', async () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: ONE_TASK_ONE_SUBTASK,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);
    await expect(logHours('1h')).resolves.not.toThrow();
  });

  // --- Story 7.2 Finding 3: externally-owned entries (the action bar's -----
  // --- relocated PtoQuickAction) keep a working in-popup correction path ---

  const PTO_ENTRY = {
    key: 'PTO-1',
    summary: 'Time off',
    hoursDisplay: '8h',
    started: '2026-01-01',
    seconds: 28800,
    worklogId: 'pto-wl-1',
  };

  describe('externalEntries (Story 7.2, Finding 3)', () => {
    it('renders an externally-owned entry in "Logged today" alongside its own entries', () => {
      mockUseHierarchyTickets.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as never);

      renderWithProviders(<TodayView externalEntries={[PTO_ENTRY]} />);

      expect(screen.getByText('PTO-1')).toBeTruthy();
      expect(screen.getByLabelText('Worklog actions for PTO-1, 8h')).toBeTruthy();
    });

    it('routes an edit of an externally-owned entry to onExternalEntryEdited, not its own reducer', async () => {
      mockUseHierarchyTickets.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as never);
      const onExternalEntryEdited = vi.fn();

      renderWithProviders(
        <TodayView
          externalEntries={[PTO_ENTRY]}
          onExternalEntryEdited={onExternalEntryEdited}
        />,
      );

      fireEvent.click(screen.getByLabelText('Worklog actions for PTO-1, 8h'));
      fireEvent.click(screen.getByText('Edit'));
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

    it('routes a delete of an externally-owned entry to onExternalEntryDeleted, not its own reducer', async () => {
      mockUseHierarchyTickets.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as never);
      const onExternalEntryDeleted = vi.fn();

      renderWithProviders(
        <TodayView
          externalEntries={[PTO_ENTRY]}
          onExternalEntryDeleted={onExternalEntryDeleted}
        />,
      );

      fireEvent.click(screen.getByLabelText('Worklog actions for PTO-1, 8h'));
      fireEvent.click(screen.getByText('Delete'));
      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(deleteWorklogMock).toHaveBeenCalledWith('PTO-1', 'pto-wl-1');
      });
      await waitFor(() => expect(onExternalEntryDeleted).toHaveBeenCalledWith('pto-wl-1'));
    });

    it('reports onTotalChange scoped to its own entries only — the external contribution is not folded in (avoids double-reporting what the shell already tracks separately)', async () => {
      mockUseHierarchyTickets.mockReturnValue({
        data: ONE_TASK_ONE_SUBTASK,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as never);
      const onTotalChange = vi.fn();

      renderWithProviders(
        <TodayView onTotalChange={onTotalChange} externalEntries={[PTO_ENTRY]} />,
      );

      // Mounts reporting 0 (its own entries are empty) even though an
      // external (PTO) entry is present and rendered.
      await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(0));

      await logHours('2h');

      // Reports only its own 2h (7200s) — never 7200 + PTO_ENTRY.seconds.
      await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(7200), {
        timeout: 1000,
      });
      expect(onTotalChange).not.toHaveBeenCalledWith(7200 + PTO_ENTRY.seconds);
    });
  });

  it('shows the catch-all-unconfigured placeholder when the project key is blank', async () => {
    catchAllProjectKeyGetValue.mockResolvedValue('');
    mockUseHierarchyTickets.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);
    expect(await screen.findByText(/Catch-all not configured/)).toBeTruthy();
    expect(screen.getByText(/to log Admin\/Meetings\/PTO/)).toBeTruthy();
  });

  // --- Story 6.1 AC1: axe a11y scan of the Today view --------------------

  describe('a11y scan (Story 6.1 AC1)', () => {
    it('the Today view has zero Critical/Serious violations', async () => {
      mockUseHierarchyTickets.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as never);
      const { container } = renderWithProviders(<TodayView />);
      await screen.findByPlaceholderText(/Search or pick/);
      const results = await scan(container);
      expect(criticalOrSerious(results.violations)).toEqual([]);
    });
  });
});
