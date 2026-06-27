import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useWeekWorklogsMock = vi.fn();

vi.mock('@/hooks/useWeekWorklogs', () => ({
  useWeekWorklogs: (...args: unknown[]) => useWeekWorklogsMock(...args),
}));

vi.mock('@/components/week/WeeklyGrid', () => ({
  WeeklyGrid: ({ onMutated }: { onMutated?: () => void }) => (
    <div data-testid="weekly-grid">
      <button type="button" onClick={() => onMutated?.()}>
        trigger-mutated
      </button>
    </div>
  ),
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
  });

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
});
