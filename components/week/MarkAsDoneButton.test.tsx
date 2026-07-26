import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hoursToSeconds } from '@/lib/hours';
import type { WeekGrid, WeekGridRow } from '@/lib/week-grid';

const setWeekMarkedDoneMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/storage/view-state', () => ({
  setWeekMarkedDone: (...args: unknown[]) => setWeekMarkedDoneMock(...args),
}));

const sendMessageMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

const { MarkAsDoneButton } = await import('./MarkAsDoneButton');

const DAYS = [
  '2026-06-15',
  '2026-06-16',
  '2026-06-17',
  '2026-06-18',
  '2026-06-19',
  '2026-06-20',
  '2026-06-21',
];

function row(cellsSeconds: number[]): WeekGridRow {
  return {
    key: 'PROJ-1',
    summary: 'Task',
    category: 'task',
    cells: cellsSeconds.map((s) => ({ seconds: s, worklogs: [] })),
    cellsSeconds,
    rowTotalSeconds: cellsSeconds.reduce((a, b) => a + b, 0),
  };
}

function fullGrid(): WeekGrid {
  const totals = [
    hoursToSeconds(8),
    hoursToSeconds(8),
    hoursToSeconds(8),
    hoursToSeconds(8),
    hoursToSeconds(8),
    0,
    0,
  ];
  return { days: DAYS, rows: [row(totals)], dayTotalsSeconds: totals };
}

function gappyGrid(): WeekGrid {
  const totals = [
    hoursToSeconds(8),
    hoursToSeconds(4),
    hoursToSeconds(8),
    0,
    hoursToSeconds(8),
    0,
    0,
  ];
  return { days: DAYS, rows: [row(totals)], dayTotalsSeconds: totals };
}

function renderButton(grid: WeekGrid, onMarkedDone = vi.fn()) {
  render(
    <MarkAsDoneButton
      grid={grid}
      weekOf="2026-06-15"
      targetHours={8}
      onMarkedDone={onMarkedDone}
    />,
  );
  return { onMarkedDone };
}

describe('MarkAsDoneButton', () => {
  beforeEach(() => {
    setWeekMarkedDoneMock.mockClear();
    sendMessageMock.mockClear();
  });

  it('renders an enabled primary CTA', () => {
    renderButton(fullGrid());
    const btn = screen.getByRole('button', { name: 'Mark week as done' });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('no-gap click marks done immediately with NO dialog + fires badge-update', async () => {
    const { onMarkedDone } = renderButton(fullGrid());
    fireEvent.click(screen.getByRole('button', { name: 'Mark week as done' }));
    await waitFor(() =>
      expect(setWeekMarkedDoneMock).toHaveBeenCalledWith('2026-06-15'),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sendMessageMock).toHaveBeenCalledWith('badge-update', {
      hoursMissing: 0,
    });
    await waitFor(() => expect(onMarkedDone).toHaveBeenCalledTimes(1));
  });

  it('with-gaps click opens the dialog and does NOT write yet', async () => {
    renderButton(gappyGrid());
    fireEvent.click(screen.getByRole('button', { name: 'Mark week as done' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(setWeekMarkedDoneMock).not.toHaveBeenCalled();
    // Two gap days: Tue (4h) and Thu (0h).
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('"Close the week" (after checking the required box) writes the flag + fires badge-update + closes', async () => {
    const { onMarkedDone } = renderButton(gappyGrid());
    fireEvent.click(screen.getByRole('button', { name: 'Mark week as done' }));
    await screen.findByRole('dialog');
    fireEvent.click(
      screen.getByRole('checkbox', { name: "These hours are correct. I'm not missing time." }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close the week' }));
    await waitFor(() =>
      expect(setWeekMarkedDoneMock).toHaveBeenCalledWith('2026-06-15'),
    );
    expect(sendMessageMock).toHaveBeenCalledWith('badge-update', {
      hoursMissing: 0,
    });
    await waitFor(() => expect(onMarkedDone).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"Close the week" is disabled until the checkbox is checked — no write on a bare click', async () => {
    renderButton(gappyGrid());
    fireEvent.click(screen.getByRole('button', { name: 'Mark week as done' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Close the week' }));
    expect(setWeekMarkedDoneMock).not.toHaveBeenCalled();
  });

  it('"Keep editing" closes the dialog without writing', async () => {
    const { onMarkedDone } = renderButton(gappyGrid());
    fireEvent.click(screen.getByRole('button', { name: 'Mark week as done' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(setWeekMarkedDoneMock).not.toHaveBeenCalled();
    expect(onMarkedDone).not.toHaveBeenCalled();
  });

  it('renders the white-on-gradient chrome variant when `chrome` is set', () => {
    render(
      <MarkAsDoneButton
        grid={fullGrid()}
        weekOf="2026-06-15"
        targetHours={8}
        chrome
        onMarkedDone={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Mark week as done' });
    expect(btn.className).toContain('bg-surface');
    expect(btn.className).not.toContain('bg-accent');
  });
});
