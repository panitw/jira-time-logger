import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useWeekWorklogsMock = vi.fn();

vi.mock('@/hooks/useWeekWorklogs', () => ({
  useWeekWorklogs: (...args: unknown[]) => useWeekWorklogsMock(...args),
}));

const weeklyGridProps = vi.fn();
vi.mock('@/components/week/WeeklyGrid', () => ({
  WeeklyGrid: (props: {
    weekOf?: string;
    onMutated?: () => void;
    ptoSubtaskKey?: string | null;
    targetHours?: number;
    isMarkedDone?: boolean;
    onMarkedDone?: () => void;
  }) => {
    weeklyGridProps(props);
    return (
      <div data-testid="weekly-grid">
        <button type="button" onClick={() => props.onMutated?.()}>
          trigger-mutated
        </button>
        {!props.isMarkedDone ? (
          <button type="button" onClick={() => props.onMarkedDone?.()}>
            Mark week as done
          </button>
        ) : null}
      </div>
    );
  },
}));

const getMarkDoneStateMock = vi.fn(async () => null as unknown);
const clearWeekMarkedDoneMock = vi.fn(async () => {});
vi.mock('@/lib/storage/view-state', () => ({
  getMarkDoneState: () => getMarkDoneStateMock(),
  clearWeekMarkedDone: () => clearWeekMarkedDoneMock(),
}));

const sendMessageMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

const targetHoursGet = vi.fn(async () => 8);
const catchAllGet = vi.fn(async () => 'KNP');
const ptoGet = vi.fn(async () => 'KNP-1');

vi.mock('@/lib/storage/settings', () => ({
  targetHoursItem: { getValue: () => targetHoursGet() },
  catchAllProjectKeyItem: { getValue: () => catchAllGet() },
  ptoSubtaskKeyItem: { getValue: () => ptoGet() },
}));

const { WeekView } = await import('./WeekView');
const { hoursToSeconds } = await import('@/lib/hours');

function renderView(weekOf = '2026-06-15') {
  const client = new QueryClient();
  const utils = render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(WeekView, { weekOf }),
    ),
  );
  return { ...utils, client };
}

describe('WeekView', () => {
  beforeEach(() => {
    useWeekWorklogsMock.mockReset();
    targetHoursGet.mockClear();
    getMarkDoneStateMock.mockReset();
    getMarkDoneStateMock.mockResolvedValue(null);
    clearWeekMarkedDoneMock.mockClear();
    sendMessageMock.mockClear();
  });

  function dataLoaded(): void {
    useWeekWorklogsMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        {
          key: 'PROJ-1',
          summary: 'A',
          worklogs: [
            {
              id: 'w1',
              timeSpentSeconds: hoursToSeconds(8),
              started: '2026-06-15T09:00:00.000+0000',
            },
          ],
        },
      ],
    });
  }

  it('renders the week header with the Monday date', async () => {
    useWeekWorklogsMock.mockReturnValue({ isPending: true });
    renderView('2026-06-15');
    expect(await screen.findByText('Week of Mon, Jun 15')).toBeTruthy();
  });

  it('shows a skeleton grid (no spinner) while pending', () => {
    useWeekWorklogsMock.mockReturnValue({ isPending: true });
    const { container } = renderView();
    expect(container.querySelector('[data-testid="week-skeleton"]')).toBeTruthy();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('renders the grid and week total on success', async () => {
    useWeekWorklogsMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        {
          key: 'PROJ-1',
          summary: 'A',
          worklogs: [
            {
              id: 'w1',
              timeSpentSeconds: hoursToSeconds(28),
              started: '2026-06-15T09:00:00.000+0000',
            },
          ],
        },
      ],
    });
    renderView();
    expect(await screen.findByTestId('weekly-grid')).toBeTruthy();
    // 28 logged / (8 * 5 = 40) target — value spans a <span> + text node.
    expect(screen.getByText('28')).toBeTruthy();
    expect(screen.getByText(/\/ 40h/)).toBeTruthy();
  });

  it('threads ptoSubtaskKey + targetHours to WeeklyGrid (Story 4.4)', async () => {
    useWeekWorklogsMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: [],
    });
    renderView();
    await screen.findByTestId('weekly-grid');
    await waitFor(() => {
      expect(weeklyGridProps).toHaveBeenCalledWith(
        expect.objectContaining({ ptoSubtaskKey: 'KNP-1', targetHours: 8 }),
      );
    });
  });

  it('invalidates the week query when the grid reports a mutation (AC #8)', async () => {
    useWeekWorklogsMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        {
          key: 'PROJ-1',
          summary: 'A',
          worklogs: [
            {
              id: 'w1',
              timeSpentSeconds: hoursToSeconds(8),
              started: '2026-06-15T09:00:00.000+0000',
            },
          ],
        },
      ],
    });
    const { client } = renderView('2026-06-15');
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(await screen.findByText('trigger-mutated'));
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['week-worklogs', '2026-06-15'],
      });
    });
  });

  it('shows the Connect to Jira fallback on auth-expired', async () => {
    useWeekWorklogsMock.mockReturnValue({
      isPending: false,
      isError: true,
      error: { kind: 'auth-expired' },
    });
    renderView();
    expect(
      await screen.findByRole('button', { name: /Connect to Jira/ }),
    ).toBeTruthy();
  });

  it('shows an error state (not a raw exception) on a network error', async () => {
    useWeekWorklogsMock.mockReturnValue({
      isPending: false,
      isError: true,
      error: { kind: 'network', cause: 'offline' },
    });
    renderView();
    expect(
      await screen.findByRole('button', { name: /Try again/i }),
    ).toBeTruthy();
    expect(screen.queryByTestId('weekly-grid')).toBeNull();
  });

  describe('mark-week-as-done (Story 4.5)', () => {
    it('not-marked: renders the mark-done button, no chip, no grayed state', async () => {
      dataLoaded();
      getMarkDoneStateMock.mockResolvedValue(null);
      const { container } = renderView('2026-06-15');
      await screen.findByTestId('weekly-grid');
      expect(screen.getByRole('button', { name: 'Mark week as done' })).toBeTruthy();
      expect(screen.queryByText('Week done')).toBeNull();
      expect(container.querySelector('[data-testid="week-grayed"]')).toBeNull();
    });

    it('marked-done (matching weekOf): chip + grayed grid + no mark-done button', async () => {
      dataLoaded();
      getMarkDoneStateMock.mockResolvedValue({
        weekOf: '2026-06-15',
        markedDoneAt: '2026-06-19T17:00:00.000Z',
      });
      const { container } = renderView('2026-06-15');
      await screen.findByTestId('weekly-grid');
      await waitFor(() => expect(screen.getByText('Week done')).toBeTruthy());
      expect(
        screen.getByRole('button', { name: 'Undo mark week as done' }),
      ).toBeTruthy();
      expect(container.querySelector('[data-testid="week-grayed"]')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Mark week as done' })).toBeNull();
    });

    it('a STALE marked-done (different weekOf) does NOT mark this week done', async () => {
      dataLoaded();
      getMarkDoneStateMock.mockResolvedValue({
        weekOf: '2026-06-08',
        markedDoneAt: '2026-06-12T17:00:00.000Z',
      });
      renderView('2026-06-15');
      await screen.findByTestId('weekly-grid');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Mark week as done' })).toBeTruthy(),
      );
      expect(screen.queryByText('Week done')).toBeNull();
    });

    it('Undo clears the flag, fires badge-update, restores the grid + button', async () => {
      dataLoaded();
      getMarkDoneStateMock.mockResolvedValue({
        weekOf: '2026-06-15',
        markedDoneAt: '2026-06-19T17:00:00.000Z',
      });
      renderView('2026-06-15');
      await screen.findByTestId('weekly-grid');
      const undo = await screen.findByRole('button', {
        name: 'Undo mark week as done',
      });
      fireEvent.click(undo);
      await waitFor(() => expect(clearWeekMarkedDoneMock).toHaveBeenCalledTimes(1));
      expect(sendMessageMock).toHaveBeenCalledWith('badge-update', {
        hoursMissing: 0,
      });
      await waitFor(() => expect(screen.queryByText('Week done')).toBeNull());
      expect(screen.getByRole('button', { name: 'Mark week as done' })).toBeTruthy();
    });

    it('onMarkedDone flips into the marked-done state (chip appears, button hides)', async () => {
      dataLoaded();
      getMarkDoneStateMock.mockResolvedValue(null);
      renderView('2026-06-15');
      await screen.findByTestId('weekly-grid');
      const markBtn = await screen.findByRole('button', {
        name: 'Mark week as done',
      });
      fireEvent.click(markBtn); // mock WeeklyGrid calls onMarkedDone
      await waitFor(() => expect(screen.getByText('Week done')).toBeTruthy());
      expect(screen.queryByRole('button', { name: 'Mark week as done' })).toBeNull();
    });

    it('threads weekOf + onMarkedDone to WeeklyGrid', async () => {
      dataLoaded();
      renderView('2026-06-15');
      await screen.findByTestId('weekly-grid');
      await waitFor(() => {
        expect(weeklyGridProps).toHaveBeenCalledWith(
          expect.objectContaining({ weekOf: '2026-06-15' }),
        );
      });
    });
  });
});
