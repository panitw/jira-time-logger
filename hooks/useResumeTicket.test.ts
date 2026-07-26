import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchByIssueMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  fetchCurrentUserWeekWorklogsByIssue: (...args: unknown[]) => fetchByIssueMock(...args),
}));

const getLastLoggedTicketMock = vi.fn();
vi.mock('@/lib/storage/last-logged', () => ({
  getLastLoggedTicket: () => getLastLoggedTicketMock(),
}));

const ptoSubtaskKeyGetValue = vi.fn(async () => null as string | null);
vi.mock('@/lib/storage/settings', () => ({
  ptoSubtaskKeyItem: { getValue: () => ptoSubtaskKeyGetValue() },
}));

const { useResumeTicket, COLD_START_SKELETON_BUDGET_MS } = await import('./useResumeTicket');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

function isoAt(hours: number, daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
}

describe('useResumeTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ptoSubtaskKeyGetValue.mockResolvedValue(null);
  });

  it('resolves "ready" from storage alone — the week query is never awaited', async () => {
    getLastLoggedTicketMock.mockResolvedValue({
      key: 'PROJ-1',
      summary: 'Fix the thing',
      seconds: 9000,
      startedAt: isoAt(9),
      recordedAt: isoAt(9),
    });
    // The week query never resolves within this test — proves status does
    // not wait on it.
    fetchByIssueMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useResumeTicket(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ status: 'ready', key: 'PROJ-1' });
  });

  it('status: "none" when both storage and the week scan are empty', async () => {
    getLastLoggedTicketMock.mockResolvedValue(null);
    fetchByIssueMock.mockResolvedValue({ kind: 'ok', value: [] });

    const { result } = renderHook(() => useResumeTicket(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('none'));
  });

  // D-7.3-10 / the skeleton-not-pop-in rule: when storage resolves to "no
  // record" but the week scan (the only other source) has not settled yet,
  // status must stay 'loading' — never a premature 'none' that later pops
  // into a card once the (already in-flight) week query resolves.
  it('does not flash "none" before the week scan settles when storage is empty', async () => {
    getLastLoggedTicketMock.mockResolvedValue(null);
    let resolveWeek: (value: unknown) => void = () => {};
    fetchByIssueMock.mockReturnValue(
      new Promise((resolve) => {
        resolveWeek = resolve;
      }),
    );

    const { result } = renderHook(() => useResumeTicket(), { wrapper });

    // Storage has resolved (null), but the week query is still in flight —
    // status must be 'loading', NOT 'none'.
    await waitFor(() => expect(getLastLoggedTicketMock).toHaveBeenCalled());
    // Give the storage microtask a tick to flow through state without
    // letting the week promise resolve.
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.status).toBe('loading');

    resolveWeek({
      kind: 'ok',
      value: [
        {
          key: 'PROJ-7',
          summary: 'Week-only ticket',
          worklogs: [{ id: 'w1', timeSpentSeconds: 5400, started: isoAt(9) }],
        },
      ],
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  // D-7.3-10: the cold-start skeleton is bounded, not unbounded — a stalled
  // or endlessly-retrying week query must not shimmer forever. Pinned with
  // fake timers so the 2000 ms budget is asserted exactly, not approximated
  // with a real wall-clock wait.
  it('falls through to "none" once COLD_START_SKELETON_BUDGET_MS elapses without the week query settling (D-7.3-10)', async () => {
    vi.useFakeTimers();
    try {
      getLastLoggedTicketMock.mockResolvedValue(null);
      fetchByIssueMock.mockReturnValue(new Promise(() => {})); // never settles

      const { result } = renderHook(() => useResumeTicket(), { wrapper });

      // Flush the storage microtask (getLastLoggedTicket → null) and the
      // effect that schedules the budget timer, without advancing fake time.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(getLastLoggedTicketMock).toHaveBeenCalled();
      expect(result.current.status).toBe('loading');

      // Just under the budget: still loading.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COLD_START_SKELETON_BUDGET_MS - 1);
      });
      expect(result.current.status).toBe('loading');

      // At the budget: falls through to 'none' — the week scan still has no
      // data, so there is nothing else to resolve to.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(result.current.status).toBe('none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the week scan when storage is empty but the week has a worklog', async () => {
    getLastLoggedTicketMock.mockResolvedValue(null);
    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        {
          key: 'PROJ-7',
          summary: 'Week-only ticket',
          worklogs: [{ id: 'w1', timeSpentSeconds: 5400, started: isoAt(9) }],
        },
      ],
    });

    const { result } = renderHook(() => useResumeTicket(), { wrapper });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        key: 'PROJ-7',
        prefillSeconds: 5400,
      }),
    );
  });

  it('a week worklog on a DIFFERENT, strictly newer issue overrides the stored record (server-wins)', async () => {
    getLastLoggedTicketMock.mockResolvedValue({
      key: 'PROJ-1',
      summary: 'Stored ticket',
      seconds: 3600,
      startedAt: isoAt(9, 1), // yesterday 09:00 — older
      recordedAt: isoAt(9, 1),
    });
    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        {
          key: 'PROJ-9',
          summary: 'Logged elsewhere',
          worklogs: [{ id: 'w1', timeSpentSeconds: 7200, started: isoAt(10) }], // today — newer
        },
      ],
    });

    const { result } = renderHook(() => useResumeTicket(), { wrapper });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        key: 'PROJ-9',
        prefillSeconds: 7200,
      }),
    );
  });

  it('a week worklog on the SAME issue does not override the stored duration, only the recency note', async () => {
    getLastLoggedTicketMock.mockResolvedValue({
      key: 'PROJ-1',
      summary: 'Stored ticket',
      seconds: 3600, // what the user actually typed
      startedAt: isoAt(9, 1),
      recordedAt: isoAt(9, 1),
    });
    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        {
          key: 'PROJ-1',
          summary: 'Stored ticket',
          // Same issue, edited duration — must NOT become the pre-fill.
          worklogs: [{ id: 'w1', timeSpentSeconds: 99999, started: isoAt(11) }],
        },
      ],
    });

    const { result } = renderHook(() => useResumeTicket(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ key: 'PROJ-1', prefillSeconds: 3600 });
  });

  it('excludes the configured PTO subtask from enrichment (D-7.3-12)', async () => {
    ptoSubtaskKeyGetValue.mockResolvedValue('KNP-99');
    getLastLoggedTicketMock.mockResolvedValue(null);
    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        {
          key: 'KNP-99',
          summary: 'PTO',
          worklogs: [{ id: 'w1', timeSpentSeconds: 28800, started: isoAt(9) }],
        },
      ],
    });

    const { result } = renderHook(() => useResumeTicket(), { wrapper });

    // The only worklog this week is PTO — must not become the resume ticket.
    await waitFor(() => expect(result.current.status).toBe('none'));
  });

  it('excludes the PTO subtask from the server-wins override even when it is strictly newer', async () => {
    ptoSubtaskKeyGetValue.mockResolvedValue('KNP-99');
    getLastLoggedTicketMock.mockResolvedValue({
      key: 'PROJ-1',
      summary: 'Real work',
      seconds: 3600,
      startedAt: isoAt(9, 1),
      recordedAt: isoAt(9, 1),
    });
    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        {
          key: 'KNP-99',
          summary: 'PTO',
          worklogs: [{ id: 'w1', timeSpentSeconds: 28800, started: isoAt(9) }], // newer than stored
        },
      ],
    });

    const { result } = renderHook(() => useResumeTicket(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    // Stays on the stored (non-PTO) ticket — the PTO worklog never wins.
    expect(result.current).toMatchObject({ key: 'PROJ-1' });
  });

  it('enrichment never flips a resolved "ready" back to "none"', async () => {
    getLastLoggedTicketMock.mockResolvedValue({
      key: 'PROJ-1',
      summary: 'Stored ticket',
      seconds: 3600,
      startedAt: isoAt(9, 1),
      recordedAt: isoAt(9, 1),
    });
    // The week query resolves to an empty week (e.g. a fresh week rollover).
    fetchByIssueMock.mockResolvedValue({ kind: 'ok', value: [] });

    const { result } = renderHook(() => useResumeTicket(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ key: 'PROJ-1', prefillSeconds: 3600 });
  });
});
