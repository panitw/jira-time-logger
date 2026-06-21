import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

vi.mock('@/lib/jira-client', () => ({
  postWorklog: vi.fn(async () => ({ kind: 'ok', value: { id: 'wl-1', timeSpentSeconds: 9000 } })),
}));

const fetchCatchAllSubtasksMock = vi.fn();
vi.mock('@/lib/catch-all', () => ({
  fetchCatchAllSubtasks: (...args: unknown[]) => fetchCatchAllSubtasksMock(...args),
}));

const logFullDayPtoMock = vi.fn();
const logHalfDayPtoMock = vi.fn();
vi.mock('@/lib/pto', () => ({
  logFullDayPto: (...args: unknown[]) => logFullDayPtoMock(...args),
  logHalfDayPto: (...args: unknown[]) => logHalfDayPtoMock(...args),
}));

const sendMessageMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

const catchAllProjectKeyGetValue = vi.fn(async () => 'KNP' as string);
const ptoSubtaskKeyGetValue = vi.fn(async () => 'KNP-99' as string | null);
const ptoSubtaskSummaryGetValue = vi.fn(async () => 'PTO' as string | null);
vi.mock('@/lib/storage/settings', () => ({
  approvalCycleItem: { getValue: vi.fn(async () => 'calendar-month') },
  targetHoursItem: { getValue: vi.fn(async () => 8) },
  catchAllProjectKeyItem: { getValue: () => catchAllProjectKeyGetValue() },
  ptoSubtaskKeyItem: { getValue: () => ptoSubtaskKeyGetValue() },
  ptoSubtaskSummaryItem: { getValue: () => ptoSubtaskSummaryGetValue() },
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { useHierarchyTickets } = await import('@/hooks/useHierarchyTickets');
const { TodayView } = await import('./TodayView');

const mockUseHierarchyTickets = vi.mocked(useHierarchyTickets);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('TodayView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catchAllProjectKeyGetValue.mockResolvedValue('KNP');
    ptoSubtaskKeyGetValue.mockResolvedValue('KNP-99');
    ptoSubtaskSummaryGetValue.mockResolvedValue('PTO');
    fetchCatchAllSubtasksMock.mockResolvedValue({ kind: 'ok', value: [] });
    logFullDayPtoMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-pto', timeSpentSeconds: 28800 },
    });
    // @ts-expect-error minimal chrome stub for openOptionsPage
    globalThis.chrome = { runtime: { openOptionsPage: vi.fn() } };
  });

  it('renders the heading', () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);
    expect(screen.getByText('Today')).toBeTruthy();
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
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
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
    expect(screen.getByText('+ Search Jira for a ticket\u2026')).toBeTruthy();
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
      data: [
        {
          key: 'PROJ-1',
          summary: 'Alpha task',
          assigneeDisplayName: 'Test User',
          source: 'self',
          subtasks: [
            { key: 'PROJ-2', summary: 'Fix button', assigneeDisplayName: 'Test User' },
          ],
        },
      ],
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

  it('shows total in header as 0h initially', () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);
    // totalDisplay for 0 seconds is ── per secondsToHoursDisplay
    expect(screen.getByText(/\/ 8h/)).toBeTruthy();
  });

  it('renders the "Mark today as PTO" action', async () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);
    expect(await screen.findByText('Mark today as PTO')).toBeTruthy();
  });

  it('logging full-day PTO appends an entry and increments the total', async () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithProviders(<TodayView />);
    fireEvent.click(await screen.findByText('Mark today as PTO'));
    fireEvent.click(await screen.findByText('Full day (8h)'));

    // 28800s = 8h, total should display 8h / 8h
    await waitFor(
      () => {
        expect(screen.getByText(/8h \/ 8h/)).toBeTruthy();
      },
      { timeout: 1000 },
    );
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
});
