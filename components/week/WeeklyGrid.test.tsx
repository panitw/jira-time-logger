import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hoursToSeconds } from '@/lib/hours';
import type { DayStatus, WeekGrid, WeekGridCell } from '@/lib/week-grid';

vi.mock('@/components/today/TicketPicker', () => ({
  TicketPicker: ({
    onSelect,
  }: {
    onSelect: (k: string, s: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSelect('NEW-1', 'A new ticket')}
    >
      mock-pick
    </button>
  ),
}));

const postWorklogMock = vi.fn();
const deleteWorklogMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  postWorklog: (...args: unknown[]) => postWorklogMock(...args),
  updateWorklog: vi.fn(),
  deleteWorklog: (...args: unknown[]) => deleteWorklogMock(...args),
}));

const sendMessageMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

const enqueueOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: (...args: unknown[]) => enqueueOutboxMock(...args),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { WeeklyGrid } = await import('./WeeklyGrid');

const DAYS: WeekGrid['days'] = [
  '2026-06-15',
  '2026-06-16',
  '2026-06-17',
  '2026-06-18',
  '2026-06-19',
  '2026-06-20',
  '2026-06-21',
];

function singleCell(seconds: number, id: string, startedISO: string): WeekGridCell {
  return { seconds, worklogs: seconds > 0 ? [{ id, startedISO }] : [] };
}

function gridWithOneRow(): WeekGrid {
  const cells: WeekGridCell[] = [
    singleCell(hoursToSeconds(4), 'w-mon', '2026-06-15T09:00:00.000+0000'),
    singleCell(0, '', ''),
    singleCell(hoursToSeconds(0.5), 'w-wed', '2026-06-17T09:00:00.000+0000'),
    singleCell(0, '', ''),
    singleCell(0, '', ''),
    singleCell(0, '', ''),
    singleCell(0, '', ''),
  ];
  const cellsSeconds = cells.map((c) => c.seconds);
  return {
    days: DAYS,
    rows: [
      {
        key: 'PROJ-1',
        summary: 'Build the grid',
        category: 'task',
        cells,
        cellsSeconds,
        rowTotalSeconds: hoursToSeconds(4.5),
      },
    ],
    dayTotalsSeconds: cellsSeconds,
  };
}

function emptyGrid(): WeekGrid {
  return {
    days: DAYS,
    rows: [],
    dayTotalsSeconds: [0, 0, 0, 0, 0, 0, 0],
  };
}

function renderGrid(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  postWorklogMock.mockResolvedValue({ kind: 'ok', value: { id: 'new-1', timeSpentSeconds: 9000 } });
  deleteWorklogMock.mockResolvedValue({ kind: 'ok', value: undefined });
});

describe('WeeklyGrid', () => {
  it('renders a semantic table with Mon..Sun column headers', () => {
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} />);
    const colHeaders = screen
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    expect(colHeaders).toEqual(
      expect.arrayContaining(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
    );
  });

  it('renders a row-header with key + summary and bare-decimal / em-dash cells', () => {
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} />);
    const rowHeader = screen.getByText(/Build the grid/).closest('th');
    expect(rowHeader?.textContent).toContain('PROJ-1');
    expect(rowHeader?.textContent).toContain('Build the grid');
    expect(
      screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid').textContent,
    ).toBe('4.0');
    expect(
      screen.getByLabelText('Hours for Wednesday, PROJ-1 Build the grid').textContent,
    ).toBe('0.5');
  });

  it('gives each data cell an aria-label with day name + ticket', () => {
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} />);
    expect(
      screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'),
    ).toBeTruthy();
  });

  it('renders a per-day totals row', () => {
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} />);
    const totalsRow = screen.getByRole('row', { name: /Daily totals/i });
    expect(within(totalsRow).getByText('4.0')).toBeTruthy();
  });

  it('renders day headers + totals but no data rows for an empty week', () => {
    renderGrid(<WeeklyGrid grid={emptyGrid()} />);
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThanOrEqual(7);
    expect(screen.queryByText(/Build the grid/)).toBeNull();
  });

  it('shows the add-subtask affordance and the mark-week-done placeholder', () => {
    renderGrid(<WeeklyGrid grid={emptyGrid()} />);
    expect(screen.getByText(/Add a subtask to this week/)).toBeTruthy();
    const markDone = screen.getByRole('button', { name: /Mark week as done/i });
    expect(markDone).toBeTruthy();
  });

  it('the mark-week-done placeholder is disabled (Story 4.5 owns behavior)', () => {
    renderGrid(<WeeklyGrid grid={emptyGrid()} />);
    const markDone = screen.getByRole('button', {
      name: /Mark week as done/i,
    }) as HTMLButtonElement;
    expect(markDone.disabled).toBe(true);
  });

  it('colors a complete day green with a Check icon and aria-label', () => {
    const statuses: DayStatus[] = [
      'complete',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
    ];
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} dayStatuses={statuses} />);
    const cell = screen.getByLabelText('Monday, complete');
    expect(cell).toBeTruthy();
    expect(cell.querySelector('svg')).toBeTruthy(); // lucide Check
    expect(cell.className).toContain('text-state-success');
    expect(cell.textContent).toContain('4.0'); // numeric total preserved
  });

  it('colors a below-target day red with AlertCircle + visible "below target" text', () => {
    const statuses: DayStatus[] = [
      'below-target',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
    ];
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} dayStatuses={statuses} />);
    const cell = screen.getByLabelText('Monday, below target');
    expect(cell).toBeTruthy();
    expect(cell.querySelector('svg')).toBeTruthy(); // lucide AlertCircle
    expect(cell.className).toContain('text-state-danger');
    expect(within(cell).getByText('below target')).toBeTruthy();
  });

  it('renders a PTO day green with a PTO label and aria-label', () => {
    const statuses: DayStatus[] = [
      'neutral',
      'pto',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
    ];
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} dayStatuses={statuses} />);
    const cell = screen.getByLabelText('Tuesday, PTO');
    expect(cell).toBeTruthy();
    expect(cell.className).toContain('text-state-success');
    expect(within(cell).getByText('PTO')).toBeTruthy();
  });

  it('leaves a neutral (future/weekend) day uncolored with no status icon or label', () => {
    const statuses: DayStatus[] = [
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
    ];
    renderGrid(<WeeklyGrid grid={emptyGrid()} dayStatuses={statuses} />);
    expect(screen.queryByLabelText(/below target/)).toBeNull();
    expect(screen.queryByLabelText(/, complete/)).toBeNull();
    const totalsRow = screen.getByRole('row', { name: /Daily totals/i });
    expect(totalsRow.querySelector('svg')).toBeNull(); // no status icons
  });

  it('renders neutral totals when dayStatuses is omitted (back-compat)', () => {
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} />);
    const totalsRow = screen.getByRole('row', { name: /Daily totals/i });
    expect(within(totalsRow).getByText('4.0')).toBeTruthy();
    expect(totalsRow.querySelector('svg')).toBeNull();
  });

  it('appends a local all-em-dash row when a ticket is picked, deduping by key', () => {
    renderGrid(<WeeklyGrid grid={emptyGrid()} />);
    fireEvent.click(screen.getByText(/Add a subtask to this week/));
    fireEvent.click(screen.getByText('mock-pick'));
    expect(screen.getByText(/A new ticket/)).toBeTruthy();

    // Pick the same ticket again — no duplicate row.
    fireEvent.click(screen.getByText(/Add a subtask to this week/));
    fireEvent.click(screen.getByText('mock-pick'));
    expect(screen.getAllByText(/A new ticket/)).toHaveLength(1);
  });

  it('clicking an empty cell and entering hours POSTs a worklog (AC #2/#5)', async () => {
    const onMutated = vi.fn();
    renderGrid(<WeeklyGrid grid={emptyGrid()} onMutated={onMutated} />);
    // Add a local row, then fill its Monday cell.
    fireEvent.click(screen.getByText(/Add a subtask to this week/));
    fireEvent.click(screen.getByText('mock-pick'));
    const cellBtn = screen.getByLabelText('Hours for Monday, NEW-1 A new ticket');
    fireEvent.click(cellBtn);
    const input = screen.getByLabelText('Hours for Monday, NEW-1 A new ticket');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(postWorklogMock).toHaveBeenCalledWith('NEW-1', {
        timeSpentSeconds: hoursToSeconds(3),
        started: expect.any(String),
      });
    });
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
  });

  it('tints body data cells by their day status (carry-through, AC #9)', () => {
    const statuses: DayStatus[] = [
      'complete',
      'neutral',
      'below-target',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
    ];
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} dayStatuses={statuses} />);
    const monCell = screen
      .getByLabelText('Hours for Monday, PROJ-1 Build the grid')
      .closest('td')!;
    expect(monCell.className).toContain('bg-state-success-subtle');
    expect(monCell.className).toContain('motion-safe:transition-colors');
    const wedCell = screen
      .getByLabelText('Hours for Wednesday, PROJ-1 Build the grid')
      .closest('td')!;
    expect(wedCell.className).toContain('bg-state-danger-subtle');
  });

  it('keeps body cells in native left-to-right DOM order (Tab order, AC #10)', () => {
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} />);
    const labels = screen
      .getAllByLabelText(/^Hours for /)
      .map((el) => el.getAttribute('aria-label'));
    expect(labels.slice(0, 3)).toEqual([
      'Hours for Monday, PROJ-1 Build the grid',
      'Hours for Tuesday, PROJ-1 Build the grid',
      'Hours for Wednesday, PROJ-1 Build the grid',
    ]);
  });

  it('row ⋯ Remove from week hides an empty (local) row with no network call', () => {
    renderGrid(<WeeklyGrid grid={emptyGrid()} />);
    fireEvent.click(screen.getByText(/Add a subtask to this week/));
    fireEvent.click(screen.getByText('mock-pick'));
    expect(screen.getByText(/A new ticket/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Row actions for NEW-1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove from week/ }));

    expect(screen.queryByText(/A new ticket/)).toBeNull();
    expect(deleteWorklogMock).not.toHaveBeenCalled();
  });

  it('renders a PTO/worklog popover trigger on each day header that opens on click', () => {
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} ptoSubtaskKey="PTO-1" targetHours={8} />);
    const trigger = screen.getByRole('button', {
      name: /PTO and worklog actions for Monday, Jun 15/,
    });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: /Mark full-day PTO \(8h\)/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Add a worklog/ })).toBeTruthy();
    // The 4.2 totals row and 4.3 body cells still render alongside the popover.
    expect(screen.getByRole('row', { name: /Daily totals/i })).toBeTruthy();
    expect(
      screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'),
    ).toBeTruthy();
  });

  it('header "Add a worklog…" opens the day-scoped picker', () => {
    renderGrid(<WeeklyGrid grid={emptyGrid()} ptoSubtaskKey="PTO-1" targetHours={8} />);
    fireEvent.click(
      screen.getByRole('button', { name: /PTO and worklog actions for Monday, Jun 15/ }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /Add a worklog/ }));
    // The TicketPicker (mocked) is now shown.
    expect(screen.getByText('mock-pick')).toBeTruthy();
  });

  it('row ⋯ Remove from week on a row with hours confirms, then deletes every worklog', async () => {
    const onMutated = vi.fn();
    renderGrid(<WeeklyGrid grid={gridWithOneRow()} onMutated={onMutated} />);

    fireEvent.click(screen.getByRole('button', { name: 'Row actions for PROJ-1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove from week/ }));
    // Inline confirm chip appears.
    expect(screen.getByText('Remove all entries for PROJ-1?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(deleteWorklogMock).toHaveBeenCalledWith('PROJ-1', 'w-mon');
      expect(deleteWorklogMock).toHaveBeenCalledWith('PROJ-1', 'w-wed');
    });
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
    expect(sendMessageMock).toHaveBeenCalledWith('badge-update', { hoursMissing: 0 });
  });
});
