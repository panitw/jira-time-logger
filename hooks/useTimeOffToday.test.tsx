import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchByIssueMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  fetchCurrentUserWeekWorklogsByIssue: (...args: unknown[]) => fetchByIssueMock(...args),
}));

let ptoKeyValue: string | null = 'KNP-99';
vi.mock('@/lib/storage/settings', () => ({
  ptoSubtaskKeyItem: { getValue: vi.fn(async () => ptoKeyValue) },
}));

const { useTimeOffToday } = await import('./useTimeOffToday');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoAt(date: Date, hours: number, minutes = 0): string {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

describe('useTimeOffToday', () => {
  beforeEach(() => {
    fetchByIssueMock.mockReset();
    ptoKeyValue = 'KNP-99';
  });

  it('sums only TODAY’s worklogs on the PTO subtask (categorised by key.startsWith(ptoSubtaskKey))', async () => {
    const today = localMidnight(new Date());
    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        {
          key: 'KNP-99',
          summary: 'PTO',
          worklogs: [{ id: 'w1', timeSpentSeconds: 28800, started: isoAt(today, 9) }],
        },
        {
          key: 'PROJ-1',
          summary: 'Not PTO',
          worklogs: [{ id: 'w2', timeSpentSeconds: 3600, started: isoAt(today, 10) }],
        },
      ],
    });

    const { result } = renderHook(() => useTimeOffToday(), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.seconds).toBe(28800);
    expect(result.current.worklogs).toEqual([
      { key: 'KNP-99', worklogId: 'w1', seconds: 28800 },
    ]);
  });

  it('excludes PTO worklogs outside today (yesterday/tomorrow) via local-day bucketing', async () => {
    const today = localMidnight(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        {
          key: 'KNP-99',
          summary: 'PTO',
          worklogs: [{ id: 'w0', timeSpentSeconds: 28800, started: isoAt(yesterday, 23, 59) }],
        },
      ],
    });

    const { result } = renderHook(() => useTimeOffToday(), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.seconds).toBe(0);
    expect(result.current.worklogs).toEqual([]);
  });

  // Trap 1: a time-off worklog posted THIS popup session never appears in
  // the week query (staleTime: 60_000, no invalidation) — must still count.
  it('Trap 1: adds sessionPtoSeconds on top of the server sum (session-posted PTO is invisible to the query)', async () => {
    fetchByIssueMock.mockResolvedValue({ kind: 'ok', value: [] });

    const { result } = renderHook(() => useTimeOffToday(14400), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.seconds).toBe(14400);
  });

  it('no PTO subtask configured (null) — zero seconds, zero worklogs, still resolves', async () => {
    ptoKeyValue = null;
    const today = localMidnight(new Date());
    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { key: 'PROJ-1', summary: 'X', worklogs: [{ id: 'w1', timeSpentSeconds: 3600, started: isoAt(today, 9) }] },
      ],
    });

    const { result } = renderHook(() => useTimeOffToday(), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.seconds).toBe(0);
    expect(result.current.worklogs).toEqual([]);
  });

  // D-7.9-13: a worklog pending Undo-time-off deletion is filtered out of
  // THIS seconds derivation, or the chrome figure disagrees with the
  // already-cleared card (the exact D-7.5-14 defect, reused not reinvented).
  it('D-7.9-13: excludeWorklogIds filters a pending-deletion worklog out of both seconds and worklogs', async () => {
    const today = localMidnight(new Date());
    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        {
          key: 'KNP-99',
          summary: 'PTO',
          worklogs: [
            { id: 'w1', timeSpentSeconds: 28800, started: isoAt(today, 9) },
            { id: 'w2', timeSpentSeconds: 14400, started: isoAt(today, 14) },
          ],
        },
      ],
    });

    const { result, rerender } = renderHook(
      ({ exclude }: { exclude: ReadonlySet<string> }) => useTimeOffToday(0, exclude),
      { wrapper, initialProps: { exclude: new Set<string>() } },
    );
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.seconds).toBe(28800 + 14400);
    expect(result.current.worklogs).toHaveLength(2);

    rerender({ exclude: new Set(['w1']) });
    await waitFor(() => expect(result.current.seconds).toBe(14400));
    expect(result.current.worklogs).toEqual([{ key: 'KNP-99', worklogId: 'w2', seconds: 14400 }]);
  });

  it('isPending stays true until BOTH the week query and the PTO key have resolved', () => {
    fetchByIssueMock.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useTimeOffToday(), { wrapper });
    expect(result.current.isPending).toBe(true);
    expect(result.current.seconds).toBe(0);
  });
});
