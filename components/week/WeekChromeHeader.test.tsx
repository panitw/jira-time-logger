import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hoursToSeconds } from '@/lib/hours';
import { scan, criticalOrSerious } from '@/lib/test/axe';
import type { WeekGrid, WeekGridRow } from '@/lib/week-grid';

const setWeekMarkedDoneMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/storage/view-state', () => ({
  setWeekMarkedDone: (...args: unknown[]) => setWeekMarkedDoneMock(...args),
}));

const sendMessageMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { WeekChromeHeader } = await import('./WeekChromeHeader');

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
    hoursToSeconds(8),
    hoursToSeconds(8),
    hoursToSeconds(4),
    hoursToSeconds(8),
    0,
    0,
  ];
  return { days: DAYS, rows: [row(totals)], dayTotalsSeconds: totals };
}

/** A grid whose week total (against an 8h daily target, 40h week target)
 * logs exactly `hours` — all concentrated on Monday so the totals math is
 * trivial to reason about. */
function gridWithLoggedHours(hours: number): WeekGrid {
  const totals = [hoursToSeconds(hours), 0, 0, 0, 0, 0, 0];
  return { days: DAYS, rows: [row(totals)], dayTotalsSeconds: totals };
}

function baseProps() {
  return {
    weekOf: '2026-06-15',
    grid: fullGrid(),
    targetHours: 8,
    today: '2026-06-19',
    isMarkedDone: false,
    onMarkedDone: vi.fn(),
    onPrevWeek: vi.fn(),
    onNextWeek: vi.fn(),
  };
}

describe('WeekChromeHeader (Story 7.7, AC2)', () => {
  beforeEach(() => {
    setWeekMarkedDoneMock.mockClear();
    sendMessageMock.mockClear();
  });

  it('renders "Week of <date>" in the title', () => {
    render(<WeekChromeHeader {...baseProps()} />);
    expect(screen.getByText('Week of Mon, Jun 15')).toBeTruthy();
  });

  it('paints the title/nav even while grid is still loading (grid=null) — no figure, no CTA yet', () => {
    render(<WeekChromeHeader {...baseProps()} grid={null} />);
    expect(screen.getByText('Week of Mon, Jun 15')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark week as done' })).toBeNull();
  });

  it('prev/next buttons fire the callbacks that change the queried week', () => {
    const onPrevWeek = vi.fn();
    const onNextWeek = vi.fn();
    render(<WeekChromeHeader {...baseProps()} onPrevWeek={onPrevWeek} onNextWeek={onNextWeek} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(onPrevWeek).toHaveBeenCalledTimes(1);
    expect(onNextWeek).toHaveBeenCalledTimes(1);
  });

  it('shows the week total against the week target (40h for an 8h daily target)', () => {
    render(<WeekChromeHeader {...baseProps()} />);
    expect(screen.getByText('40')).toBeTruthy(); // 40h logged (full week)
    expect(screen.getByText('/ 40h')).toBeTruthy();
  });

  // RED-provable: swap `bg-white` for a status-colour class (e.g.
  // `bg-status-clean`) and this fails — D-7.6-40 forbids per-status colour
  // on the gradient, for ANY status, met included.
  it('the progress bar fill is plain white — no per-status colour class (D-7.6-40)', () => {
    const { container } = render(<WeekChromeHeader {...baseProps()} />);
    const track = container.querySelector('.h-\\[4px\\]');
    expect(track).toBeTruthy();
    const fill = track?.querySelector('div');
    expect(fill?.className).toContain('bg-white');
    expect(fill?.className).not.toMatch(/bg-status-|bg-state-|bg-amber-|bg-royal-purple|bg-legacy-purple/);
  });

  // Finisher fix (D-7.7-21c / Finding 1) — RED-proved by reverting
  // `pctToWidthClass` to `Math.round`: 39h of a 40h week is 97.5% and used
  // to render `w-full`, reading as fully done beside the mark-done CTA.
  it('39h of 40h (97.5%) does not read as fully done — quantisation fix (D-7.7-29/D-7.7-21c)', () => {
    const { container } = render(<WeekChromeHeader {...baseProps()} grid={gridWithLoggedHours(39)} />);
    const track = container.querySelector('.h-\\[4px\\]');
    const fill = track?.querySelector('div');
    expect(fill?.className).not.toMatch(/w-full/);
    expect(fill?.className).toMatch(/w-\[95%\]/);
  });

  // RED-proved the same way: 0.96h of 40h is 2.4% and used to round DOWN to
  // `w-0`, reading as empty after real hours were logged.
  it('0.96h of 40h (2.4%) does not read as fully empty — quantisation fix (D-7.7-29/D-7.7-21c)', () => {
    const { container } = render(<WeekChromeHeader {...baseProps()} grid={gridWithLoggedHours(0.96)} />);
    const track = container.querySelector('.h-\\[4px\\]');
    const fill = track?.querySelector('div');
    expect(fill?.className).not.toMatch(/w-0\b/);
    expect(fill?.className).toMatch(/w-\[5%\]/);
  });

  it('a genuine zero still renders w-0', () => {
    const { container } = render(<WeekChromeHeader {...baseProps()} grid={gridWithLoggedHours(0)} />);
    const track = container.querySelector('.h-\\[4px\\]');
    const fill = track?.querySelector('div');
    expect(fill?.className).toMatch(/w-0\b/);
  });

  it('renders the "Mark week as done" CTA when the week is not marked done', () => {
    render(<WeekChromeHeader {...baseProps()} />);
    expect(screen.getByRole('button', { name: 'Mark week as done' })).toBeTruthy();
  });

  it('hides the CTA when the week is already marked done — the header never ships a second button (D-7.7 Files)', () => {
    render(<WeekChromeHeader {...baseProps()} isMarkedDone />);
    expect(screen.queryByRole('button', { name: 'Mark week as done' })).toBeNull();
  });

  // --- Real composition (shared-seam discipline) --------------------------
  // Proves the REAL MarkAsDoneButton/GapAcknowledgmentDialog compose inside
  // this header, not a mock — the class of regression that bit 7.2/7.4/7.6.

  it('a no-gap week marks done immediately with no dialog (real MarkAsDoneButton composed)', async () => {
    const onMarkedDone = vi.fn();
    render(<WeekChromeHeader {...baseProps()} grid={fullGrid()} onMarkedDone={onMarkedDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark week as done' }));
    await waitFor(() => expect(setWeekMarkedDoneMock).toHaveBeenCalledWith('2026-06-15'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(onMarkedDone).toHaveBeenCalledTimes(1));
  });

  it('a gappy week opens the REAL gap dialog with the week total in its title', async () => {
    render(<WeekChromeHeader {...baseProps()} grid={gappyGrid()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark week as done' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    // gappyGrid: 8+8+8+4+8 = 36h logged of a 40h week target.
    expect(screen.getByText('Close the week at 36 of 40h?')).toBeTruthy();
  });

  // --- Story 7.7, Task 13: axe scan (Story 6.1 AC1 gate) -------------------

  describe('a11y scan (Story 6.1 AC1)', () => {
    it('the header (not-marked-done, real MarkAsDoneButton composed) has zero Critical/Serious violations', async () => {
      const { container } = render(<WeekChromeHeader {...baseProps()} />);
      const results = await scan(container);
      expect(criticalOrSerious(results.violations)).toEqual([]);
    });

    it('the open gap dialog has zero Critical/Serious violations', async () => {
      render(<WeekChromeHeader {...baseProps()} grid={gappyGrid()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mark week as done' }));
      await screen.findByRole('dialog');
      const results = await scan(document.body);
      expect(criticalOrSerious(results.violations)).toEqual([]);
    });

    it('the marked-done header (no CTA) has zero Critical/Serious violations', async () => {
      const { container } = render(<WeekChromeHeader {...baseProps()} isMarkedDone />);
      const results = await scan(container);
      expect(criticalOrSerious(results.violations)).toEqual([]);
    });
  });
});
