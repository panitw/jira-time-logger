import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WeeklyGrid } from './WeeklyGrid';
import { hoursToSeconds } from '@/lib/hours';
import type { DayStatus, WeekGrid } from '@/lib/week-grid';

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

const DAYS: WeekGrid['days'] = [
  '2026-06-15',
  '2026-06-16',
  '2026-06-17',
  '2026-06-18',
  '2026-06-19',
  '2026-06-20',
  '2026-06-21',
];

function gridWithOneRow(): WeekGrid {
  const cells = [hoursToSeconds(4), 0, hoursToSeconds(0.5), 0, 0, 0, 0];
  return {
    days: DAYS,
    rows: [
      {
        key: 'PROJ-1',
        summary: 'Build the grid',
        category: 'task',
        cellsSeconds: cells,
        rowTotalSeconds: hoursToSeconds(4.5),
      },
    ],
    dayTotalsSeconds: cells,
  };
}

function emptyGrid(): WeekGrid {
  return {
    days: DAYS,
    rows: [],
    dayTotalsSeconds: [0, 0, 0, 0, 0, 0, 0],
  };
}

describe('WeeklyGrid', () => {
  it('renders a semantic table with Mon..Sun column headers', () => {
    render(<WeeklyGrid grid={gridWithOneRow()} />);
    const colHeaders = screen
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    expect(colHeaders).toEqual(
      expect.arrayContaining(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
    );
  });

  it('renders a row-header with key + summary and bare-decimal / em-dash cells', () => {
    render(<WeeklyGrid grid={gridWithOneRow()} />);
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
    render(<WeeklyGrid grid={gridWithOneRow()} />);
    expect(
      screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'),
    ).toBeTruthy();
  });

  it('renders a per-day totals row', () => {
    render(<WeeklyGrid grid={gridWithOneRow()} />);
    const totalsRow = screen.getByRole('row', { name: /Daily totals/i });
    expect(within(totalsRow).getByText('4.0')).toBeTruthy();
  });

  it('renders day headers + totals but no data rows for an empty week', () => {
    render(<WeeklyGrid grid={emptyGrid()} />);
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThanOrEqual(7);
    expect(screen.queryByText(/Build the grid/)).toBeNull();
  });

  it('shows the add-subtask affordance and the mark-week-done placeholder', () => {
    render(<WeeklyGrid grid={emptyGrid()} />);
    expect(screen.getByText(/Add a subtask to this week/)).toBeTruthy();
    const markDone = screen.getByRole('button', { name: /Mark week as done/i });
    expect(markDone).toBeTruthy();
  });

  it('the mark-week-done placeholder is disabled (Story 4.5 owns behavior)', () => {
    render(<WeeklyGrid grid={emptyGrid()} />);
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
    render(<WeeklyGrid grid={gridWithOneRow()} dayStatuses={statuses} />);
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
    render(<WeeklyGrid grid={gridWithOneRow()} dayStatuses={statuses} />);
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
    render(<WeeklyGrid grid={gridWithOneRow()} dayStatuses={statuses} />);
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
    render(<WeeklyGrid grid={emptyGrid()} dayStatuses={statuses} />);
    expect(screen.queryByLabelText(/below target/)).toBeNull();
    expect(screen.queryByLabelText(/, complete/)).toBeNull();
    const totalsRow = screen.getByRole('row', { name: /Daily totals/i });
    expect(totalsRow.querySelector('svg')).toBeNull(); // no status icons
  });

  it('renders neutral totals when dayStatuses is omitted (back-compat)', () => {
    render(<WeeklyGrid grid={gridWithOneRow()} />);
    const totalsRow = screen.getByRole('row', { name: /Daily totals/i });
    expect(within(totalsRow).getByText('4.0')).toBeTruthy();
    expect(totalsRow.querySelector('svg')).toBeNull();
  });

  it('appends a local all-em-dash row when a ticket is picked, deduping by key', () => {
    render(<WeeklyGrid grid={emptyGrid()} />);
    fireEvent.click(screen.getByText(/Add a subtask to this week/));
    fireEvent.click(screen.getByText('mock-pick'));
    expect(screen.getByText(/A new ticket/)).toBeTruthy();

    // Pick the same ticket again — no duplicate row.
    fireEvent.click(screen.getByText(/Add a subtask to this week/));
    fireEvent.click(screen.getByText('mock-pick'));
    expect(screen.getAllByText(/A new ticket/)).toHaveLength(1);
  });
});
