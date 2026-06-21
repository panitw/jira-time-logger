import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useHierarchyTickets', () => ({
  useHierarchyTickets: vi.fn(),
}));

const getPinnedTicketsMock = vi.fn();
const addPinnedTicketMock = vi.fn();
vi.mock('@/lib/storage/pinned-tickets', () => ({
  getPinnedTickets: (...args: unknown[]) => getPinnedTicketsMock(...args),
  addPinnedTicket: (...args: unknown[]) => addPinnedTicketMock(...args),
  removePinnedTicket: vi.fn(async () => {}),
}));

const searchTicketsMock = vi.fn();
vi.mock('@/lib/ticket-search', () => ({
  searchTickets: (...args: unknown[]) => searchTicketsMock(...args),
}));

const createSubtaskMock = vi.fn();
vi.mock('@/lib/create-subtask', () => ({
  createSubtask: (...args: unknown[]) => createSubtaskMock(...args),
}));

const fetchCatchAllSubtasksMock = vi.fn();
vi.mock('@/lib/catch-all', () => ({
  fetchCatchAllSubtasks: (...args: unknown[]) =>
    fetchCatchAllSubtasksMock(...args),
}));

const catchAllProjectKeyGetValue = vi.fn(async () => '');
vi.mock('@/lib/storage/settings', () => ({
  catchAllProjectKeyItem: { getValue: () => catchAllProjectKeyGetValue() },
}));

vi.mock('@/lib/log', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

const { useHierarchyTickets } = await import('@/hooks/useHierarchyTickets');
const { TicketPicker } = await import('./TicketPicker');

const mockUseHierarchyTickets = vi.mocked(useHierarchyTickets);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function mockHierarchyLoaded(tasks: object[] = []) {
  mockUseHierarchyTickets.mockReturnValue({
    data: tasks,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
}

const sampleTasks = [
  {
    key: 'PROJ-1',
    summary: 'Alpha task',
    assigneeDisplayName: 'Test User',
    source: 'self',
    subtasks: [
      {
        key: 'PROJ-2',
        summary: 'Fix alpha button',
        assigneeDisplayName: 'Test User',
      },
    ],
  },
  {
    key: 'PROJ-3',
    summary: 'Beta task with no subtasks',
    assigneeDisplayName: null,
    source: 'self',
    subtasks: [],
  },
  {
    key: 'PROJ-100',
    summary: 'Manager project',
    assigneeDisplayName: 'Alice Manager',
    source: 'manager',
    subtasks: [
      {
        key: 'PROJ-101',
        summary: 'Manager sub',
        assigneeDisplayName: 'Test User',
      },
    ],
  },
];

describe('TicketPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPinnedTicketsMock.mockResolvedValue([]);
    searchTicketsMock.mockResolvedValue({ kind: 'ok', value: [] });
    catchAllProjectKeyGetValue.mockResolvedValue('');
    fetchCatchAllSubtasksMock.mockResolvedValue({ kind: 'ok', value: [] });
    createSubtaskMock.mockResolvedValue({
      // Real Jira POST /rest/api/3/issue response — only {id, key}, NO fields
      kind: 'ok',
      value: { id: '9', key: 'PROJ-99', summary: 'My new subtask' },
    });
  });

  it('focuses the search input on mount', () => {
    mockHierarchyLoaded();
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Search or pick/);
    expect(document.activeElement).toBe(input);
  });

  it('renders source-grouped sections: "Your Tasks" and "<assignee>\u2019s Tasks"', () => {
    mockHierarchyLoaded(sampleTasks);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    expect(screen.getByText(/Your Tasks/)).toBeTruthy();
    expect(screen.getByText(/Alice Manager\u2019s Tasks/)).toBeTruthy();
  });

  it('renders Task headers as <summary>, not selectable <button> rows', () => {
    mockHierarchyLoaded(sampleTasks);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    // Task key + summary are in a <summary> (expandable header), not a <button>
    const summary = screen.getByText('PROJ-1').closest('summary');
    expect(summary).toBeTruthy();
    // Task header must NOT have role=option or data-picker-row
    const taskRow = screen.queryByLabelText('Pick PROJ-1: Alpha task');
    expect(taskRow).toBeNull();
  });

  it('renders sub-task leaves as <button role="option"> with aria-labels', () => {
    mockHierarchyLoaded(sampleTasks);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    expect(
      screen.getByLabelText('Pick PROJ-2: Fix alpha button'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Pick PROJ-101: Manager sub'),
    ).toBeTruthy();
  });

  it('does NOT call onSelect when a Task header is clicked (Task is a container, not a log target)', () => {
    mockHierarchyLoaded(sampleTasks);
    const onSelect = vi.fn();
    renderWithProviders(<TicketPicker onSelect={onSelect} />);

    fireEvent.click(screen.getByText('PROJ-1').closest('summary')!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onSelect when a sub-task leaf is clicked', () => {
    mockHierarchyLoaded(sampleTasks);
    const onSelect = vi.fn();
    renderWithProviders(<TicketPicker onSelect={onSelect} />);

    fireEvent.click(screen.getByLabelText('Pick PROJ-2: Fix alpha button'));
    expect(onSelect).toHaveBeenCalledWith('PROJ-2', 'Fix alpha button');
  });

  it('filters Task headers and sub-tasks by query (case-insensitive)', async () => {
    mockHierarchyLoaded(sampleTasks);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText(/Search or pick/);
    fireEvent.change(input, { target: { value: 'alpha' } });

    await waitFor(
      () => {
        // Task header "PROJ-1 Alpha task" matches → visible
        expect(screen.getByText('PROJ-1')).toBeTruthy();
        // Sub-task "Fix alpha button" matches → visible
        expect(
          screen.getByLabelText('Pick PROJ-2: Fix alpha button'),
        ).toBeTruthy();
        // Non-matching task hidden
        expect(screen.queryByText('PROJ-3')).toBeNull();
      },
      { timeout: 500 },
    );
  });

  it('shows empty state when no hierarchy matches the query', async () => {
    mockHierarchyLoaded(sampleTasks);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText(/Search or pick/);
    fireEvent.change(input, { target: { value: 'zzz-no-match' } });

    await waitFor(
      () => {
        expect(screen.getByText('No matching tickets.')).toBeTruthy();
      },
      { timeout: 500 },
    );
  });

  it('shows the always-available Search Jira affordance at the bottom', () => {
    mockHierarchyLoaded(sampleTasks);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);
    expect(
      screen.getByText('+ Search Jira for a ticket\u2026'),
    ).toBeTruthy();
  });

  it('shows skeleton when hierarchy is loading', () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    const { container } = renderWithProviders(
      <TicketPicker onSelect={vi.fn()} />,
    );
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows error state with retry button when hierarchy fails', () => {
    mockUseHierarchyTickets.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as never);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);
    expect(screen.getByText(/Couldn.t load suggestions/)).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('renders pinned/recently-used group when pinned tickets exist', async () => {
    getPinnedTicketsMock.mockResolvedValue([
      {
        key: 'PIN-1',
        summary: 'Pinned ticket',
        pinnedAt: '2026-01-01T00:00:00Z',
      },
    ]);
    mockHierarchyLoaded([]);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Recently used/)).toBeTruthy();
    });
    expect(screen.getByLabelText('Pick PIN-1: Pinned ticket')).toBeTruthy();
  });

  it('enters search-Jira mode and shows results after debounce', async () => {
    searchTicketsMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { id: '5', key: 'EXT-7', fields: { summary: 'External result' } },
      ],
    });
    mockHierarchyLoaded([]);

    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    fireEvent.click(screen.getByText('+ Search Jira for a ticket\u2026'));

    const input = screen.getByPlaceholderText(
      'Type a ticket key (e.g., OTHER-789) or text',
    );
    fireEvent.change(input, { target: { value: 'external' } });

    await waitFor(
      () => {
        expect(searchTicketsMock).toHaveBeenCalledWith('external');
      },
      { timeout: 1000 },
    );

    await waitFor(
      () => {
        expect(
          screen.getByLabelText('Pick EXT-7: External result'),
        ).toBeTruthy();
      },
      { timeout: 1000 },
    );
  });

  it('pins a ticket and calls onSelect when a search-Jira result is selected', async () => {
    searchTicketsMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { id: '5', key: 'EXT-7', fields: { summary: 'External result' } },
      ],
    });
    mockHierarchyLoaded([]);
    const onSelect = vi.fn();

    renderWithProviders(<TicketPicker onSelect={onSelect} />);

    fireEvent.click(screen.getByText('+ Search Jira for a ticket\u2026'));
    const input = screen.getByPlaceholderText(
      'Type a ticket key (e.g., OTHER-789) or text',
    );
    fireEvent.change(input, { target: { value: 'external' } });

    await waitFor(
      () => {
        expect(
          screen.getByLabelText('Pick EXT-7: External result'),
        ).toBeTruthy();
      },
      { timeout: 1000 },
    );

    fireEvent.click(screen.getByLabelText('Pick EXT-7: External result'));

    await waitFor(() => {
      expect(addPinnedTicketMock).toHaveBeenCalledWith('EXT-7', 'External result');
    });
    expect(onSelect).toHaveBeenCalledWith('EXT-7', 'External result');
  });

  it('shows create-subtask affordance inside an expanded Task with no subtasks', () => {
    mockHierarchyLoaded(sampleTasks);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    // Expand the Task with no subtasks (PROJ-3)
    fireEvent.click(screen.getByText('PROJ-3').closest('summary')!);
    // Affordance is now visible inside the expanded Task
    expect(
      screen.getByText('+ Create my subtask under this Task'),
    ).toBeTruthy();
  });

  it('creates a subtask and auto-selects it on success', async () => {
    mockHierarchyLoaded(sampleTasks);
    const onSelect = vi.fn();
    renderWithProviders(<TicketPicker onSelect={onSelect} />);

    // Expand the Task with no subtasks
    fireEvent.click(screen.getByText('PROJ-3').closest('summary')!);
    // Click the affordance to reveal the inline form
    fireEvent.click(screen.getByText('+ Create my subtask under this Task'));

    const nameInput = screen.getByLabelText('Create subtask under PROJ-3');
    fireEvent.change(nameInput, { target: { value: 'My new subtask' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(createSubtaskMock).toHaveBeenCalledWith('PROJ-3', 'My new subtask');
    });

    await waitFor(() => {
      // summary is echoed from user input — Jira's create response omits fields
      expect(onSelect).toHaveBeenCalledWith('PROJ-99', 'My new subtask');
    });
  });

  it('Escape clears the search query in hierarchy mode', () => {
    mockHierarchyLoaded(sampleTasks);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText(
      /Search or pick/,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'alpha' } });

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input.value).toBe('');
  });

  it('Escape exits search-Jira mode', () => {
    mockHierarchyLoaded([]);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    fireEvent.click(screen.getByText('+ Search Jira for a ticket\u2026'));
    const searchInput = screen.getByPlaceholderText(
      'Type a ticket key (e.g., OTHER-789) or text',
    );

    fireEvent.keyDown(searchInput, { key: 'Escape' });

    expect(screen.getByPlaceholderText(/Search or pick/)).toBeTruthy();
  });

  it('ARIA: listbox container + sub-task rows have role=option', () => {
    mockHierarchyLoaded(sampleTasks);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeTruthy();
    expect(listbox.getAttribute('aria-label')).toBe('Ticket picker');

    const subtaskRow = screen.getByLabelText('Pick PROJ-2: Fix alpha button');
    expect(subtaskRow.getAttribute('role')).toBe('option');
  });

  it('arrow-key nav moves focus between visible sub-task leaves only', async () => {
    // Use pinned tickets so a row is visible on mount (Recently Used group is open by default)
    getPinnedTicketsMock.mockResolvedValue([
      { key: 'PIN-1', summary: 'First pinned', pinnedAt: '2026-01-01T00:00:00Z' },
      { key: 'PIN-2', summary: 'Second pinned', pinnedAt: '2026-01-01T00:00:00Z' },
    ]);
    mockHierarchyLoaded([]);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    // Wait for async pinned-tickets load (useEffect resolves getPinnedTickets)
    await waitFor(() => {
      expect(screen.getByLabelText('Pick PIN-1: First pinned')).toBeTruthy();
    });

    const input = screen.getByPlaceholderText(/Search or pick/);
    input.focus();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(
      screen.getByLabelText('Pick PIN-1: First pinned'),
    );

    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'ArrowDown',
    });
    expect(document.activeElement).toBe(
      screen.getByLabelText('Pick PIN-2: Second pinned'),
    );
  });

  it('arrow-key nav skips rows inside a collapsed Task', async () => {
    // Two pinned tickets + one Task with a subtask (Task starts collapsed)
    getPinnedTicketsMock.mockResolvedValue([
      { key: 'PIN-1', summary: 'Pinned', pinnedAt: '2026-01-01T00:00:00Z' },
    ]);
    mockHierarchyLoaded([
      {
        key: 'PROJ-1',
        summary: 'Task with subtask',
        assigneeDisplayName: 'Test User',
        source: 'self',
        subtasks: [
          { key: 'PROJ-2', summary: 'Nested subtask', assigneeDisplayName: 'Test User' },
        ],
      },
    ]);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Pick PIN-1: Pinned')).toBeTruthy();
    });

    const input = screen.getByPlaceholderText(/Search or pick/);
    input.focus();

    // ArrowDown should reach the pinned row (visible), not the nested subtask (inside collapsed Task)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(
      screen.getByLabelText('Pick PIN-1: Pinned'),
    );

    // ArrowDown again — wraps to the only visible row (PIN-1)
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'ArrowDown',
    });
    expect(document.activeElement).toBe(
      screen.getByLabelText('Pick PIN-1: Pinned'),
    );
    // The nested subtask button must NOT receive focus
    expect(document.activeElement).not.toBe(
      screen.getByLabelText('Pick PROJ-2: Nested subtask'),
    );
  });

  it('clicking a focused sub-task row triggers onSelect exactly once (no Enter double-fire)', () => {
    mockHierarchyLoaded(sampleTasks);
    const onSelect = vi.fn();
    renderWithProviders(<TicketPicker onSelect={onSelect} />);

    const subtaskRow = screen.getByLabelText('Pick PROJ-2: Fix alpha button');
    subtaskRow.focus();
    fireEvent.click(subtaskRow);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('PROJ-2', 'Fix alpha button');
  });

  it('Enter keyDown on a focused row does NOT manually click (native button handles activation)', () => {
    mockHierarchyLoaded(sampleTasks);
    const onSelect = vi.fn();
    renderWithProviders(<TicketPicker onSelect={onSelect} />);

    const subtaskRow = screen.getByLabelText('Pick PROJ-2: Fix alpha button');
    subtaskRow.focus();
    fireEvent.keyDown(subtaskRow, { key: 'Enter' });

    // Our keydown handler must NOT call btn.click() — native button activation
    // handles Enter. Double-clicking would double-fire onSelect in real browsers.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('search dead-end fix: Task matches but sub-tasks don\u2019t → renders all sub-tasks', async () => {
    // Task PROJ-1 "Alpha task" has sub-task PROJ-2 "Fix alpha button"
    // Searching "PROJ-1" matches the Task key but NOT the sub-task
    mockHierarchyLoaded([
      {
        key: 'PROJ-1',
        summary: 'Alpha task',
        assigneeDisplayName: 'Test User',
        source: 'self',
        subtasks: [
          { key: 'PROJ-2', summary: 'Fix alpha button', assigneeDisplayName: 'Test User' },
        ],
      },
    ]);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText(/Search or pick/);
    fireEvent.change(input, { target: { value: 'PROJ-1' } });

    await waitFor(
      () => {
        // Task header is visible (matches by key)
        expect(screen.getByText('PROJ-1')).toBeTruthy();
        // Sub-task is ALSO visible even though it didn't match the filter —
        // prevents the empty-dead-end when Task matches but sub-tasks don't
        expect(
          screen.getByLabelText('Pick PROJ-2: Fix alpha button'),
        ).toBeTruthy();
      },
      { timeout: 500 },
    );
  });

  it('hides the catch-all group when the project key is blank', async () => {
    catchAllProjectKeyGetValue.mockResolvedValue('');
    mockHierarchyLoaded(sampleTasks);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    // Give the settings effect a tick to resolve
    await waitFor(() =>
      expect(screen.getByText(/Your Tasks/)).toBeTruthy(),
    );
    expect(screen.queryByText(/Catch-all/)).toBeNull();
    expect(fetchCatchAllSubtasksMock).not.toHaveBeenCalled();
  });

  it('renders the catch-all group as a flat list when configured', async () => {
    catchAllProjectKeyGetValue.mockResolvedValue('KNP');
    fetchCatchAllSubtasksMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { key: 'KNP-1', summary: 'Admin' },
        { key: 'KNP-2', summary: 'Meetings' },
      ],
    });
    mockHierarchyLoaded([]);
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Catch-all (KNP)')).toBeTruthy();
      expect(screen.getByLabelText('Pick KNP-1: Admin')).toBeTruthy();
      expect(screen.getByLabelText('Pick KNP-2: Meetings')).toBeTruthy();
    });
    // No create-subtask affordance (the catch-all group is a flat, read-only list).
    expect(screen.queryByText(/Create my subtask/)).toBeNull();
  });

  it('selecting a catch-all row calls onSelect with the same handoff', async () => {
    catchAllProjectKeyGetValue.mockResolvedValue('KNP');
    fetchCatchAllSubtasksMock.mockResolvedValue({
      kind: 'ok',
      value: [{ key: 'KNP-1', summary: 'Admin' }],
    });
    const onSelect = vi.fn();
    mockHierarchyLoaded([]);
    renderWithProviders(<TicketPicker onSelect={onSelect} />);

    const row = await screen.findByLabelText('Pick KNP-1: Admin');
    fireEvent.click(row);
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith('KNP-1', 'Admin');
    });
  });
});
