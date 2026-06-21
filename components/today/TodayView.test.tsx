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
});
