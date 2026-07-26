import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DayStatus } from '@/lib/day-status';
import { hoursToSeconds } from '@/lib/hours';
import type { WeekGridCell } from '@/lib/week-grid';

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

const enqueueOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: (...args: unknown[]) => enqueueOutboxMock(...args),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { DayCell } = await import('./DayCell');

function emptyCell(): WeekGridCell {
  return { seconds: 0, worklogs: [] };
}

function singleCell(seconds: number, startedISO = '2026-06-15T09:00:00.000+0000'): WeekGridCell {
  return { seconds, worklogs: [{ id: 'w-1', startedISO }] };
}

function multiCell(): WeekGridCell {
  return {
    seconds: hoursToSeconds(6),
    worklogs: [
      { id: 'w-1', startedISO: '2026-06-15T09:00:00.000+0000' },
      { id: 'w-2', startedISO: '2026-06-15T13:00:00.000+0000' },
    ],
  };
}

function renderCell(cell: WeekGridCell, onMutated = vi.fn(), status: DayStatus | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <table>
        <tbody>
          <tr>
            <DayCell
              rowKey="PROJ-1"
              rowSummary="Build the grid"
              dayIndex={0}
              dayName="Monday"
              dayISO="2026-06-15"
              cell={cell}
              status={status}
              onMutated={onMutated}
            />
          </tr>
        </tbody>
      </table>
    </QueryClientProvider>,
  );
  return { ...utils, onMutated };
}

describe('DayCell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postWorklogMock.mockResolvedValue({ kind: 'ok', value: { id: 'new-1', timeSpentSeconds: 9000 } });
    updateWorklogMock.mockResolvedValue({ kind: 'ok', value: { id: 'w-1', timeSpentSeconds: 9000 } });
    deleteWorklogMock.mockResolvedValue({ kind: 'ok', value: undefined });
  });

  it('renders an empty cell as em-dash with an edit button', () => {
    renderCell(emptyCell());
    const btn = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    expect(btn.textContent).toBe('——');
  });

  it('POSTs a new worklog when an empty cell is filled + Enter', async () => {
    const { onMutated } = renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(postWorklogMock).toHaveBeenCalledWith('PROJ-1', {
        timeSpentSeconds: hoursToSeconds(2.5),
        started: expect.any(String),
      });
    });
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
    expect(sendMessageMock).toHaveBeenCalledWith('badge-update', { hoursMissing: 0 });
  });

  it('pre-fills the editor with the current value and PUTs on a single-worklog cell', async () => {
    renderCell(singleCell(hoursToSeconds(4)));
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid') as HTMLInputElement;
    expect(input.value).toBe('4');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(updateWorklogMock).toHaveBeenCalledWith('PROJ-1', 'w-1', {
        timeSpentSeconds: hoursToSeconds(5),
        started: '2026-06-15T09:00:00.000+0000',
      });
    });
  });

  it('DELETEs the single worklog when cleared to empty + Enter', async () => {
    renderCell(singleCell(hoursToSeconds(4)));
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(deleteWorklogMock).toHaveBeenCalledWith('PROJ-1', 'w-1');
    });
  });

  it('hard-blocks over-24 hours: shows amber error (not red), no network call, stays editing on Enter (D-7.6-37)', async () => {
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '25' } });
    expect(
      screen.getByText('Hours per entry can’t exceed 24. Split into multiple entries if needed.'),
    ).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(postWorklogMock).not.toHaveBeenCalled();
    // Still in edit mode — amber now, never red (validation, not a refused write).
    expect(input.className).toContain('border-amber-border');
    expect(input.className).not.toContain('border-state-danger');
  });

  it('rejects unparseable input: amber border (not red), Enter is a no-op (no POST) (D-7.6-37)', () => {
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.className).toContain('border-amber-border');
    expect(input.className).not.toContain('border-state-danger');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(postWorklogMock).not.toHaveBeenCalled();
  });

  it('Escape cancels editing back to the prior value (no write)', () => {
    renderCell(singleCell(hoursToSeconds(4)));
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(updateWorklogMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid').textContent).toBe('4.0');
  });

  it('multi-worklog cell is read-only: no editor opens, shows the Multiple entries affordance', () => {
    renderCell(multiCell());
    const cell = screen.getByLabelText('2 entries for Monday, PROJ-1 Build the grid — edit in the Today view');
    expect(cell).toBeTruthy();
    // No editable button/input is exposed.
    expect(screen.queryByRole('button')).toBeNull();
    const marker = screen.getByTitle('Multiple entries — edit in Today view');
    expect(marker.textContent).toBe('6.0');
  });

  it('network failure enqueues an outbox POST and shows the pending chip', async () => {
    postWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Pending — will retry')).toBeTruthy();
    });
    expect(enqueueOutboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'post', issueKey: 'PROJ-1' }),
    );
  });

  it('non-transient failure shows an error chip and does not enqueue', async () => {
    postWorklogMock.mockResolvedValueOnce({ kind: 'forbidden' });
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/Couldn’t log time/)).toBeTruthy();
    });
    expect(enqueueOutboxMock).not.toHaveBeenCalled();
  });

  it('applies the carry-through tint for a met day', () => {
    renderCell(singleCell(hoursToSeconds(8)), vi.fn(), 'met');
    const btn = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    const td = btn.closest('td')!;
    expect(td.className).toContain('bg-state-success-subtle');
    expect(td.className).toContain('motion-safe:transition-colors');
  });

  it('applies the amber tint for an attention day — never the old danger-red', () => {
    renderCell(emptyCell(), vi.fn(), 'attention');
    const btn = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    const td = btn.closest('td')!;
    expect(td.className).toContain('bg-amber-soft');
    expect(td.className).not.toContain('state-danger');
  });

  it('Enter then the blur fired by closing the editor does not double-submit', async () => {
    renderCell(singleCell(hoursToSeconds(4)));
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '5' } });
    // Enter commits; the subsequent blur (as the input unmounts) must be a no-op.
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    await waitFor(() => expect(updateWorklogMock).toHaveBeenCalledTimes(1));
  });

  it('clearing an already-empty cell is a no-op (no delete)', () => {
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(deleteWorklogMock).not.toHaveBeenCalled();
    expect(postWorklogMock).not.toHaveBeenCalled();
  });
});
