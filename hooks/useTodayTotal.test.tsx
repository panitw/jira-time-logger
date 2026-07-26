import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchByIssueMock = vi.fn();

vi.mock('@/lib/jira-client', () => ({
  fetchCurrentUserWeekWorklogsByIssue: (...args: unknown[]) =>
    fetchByIssueMock(...args),
}));

const { useTodayTotal } = await import('./useTodayTotal');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

/** Local midnight for `date` — mirrors the hook's own bucketing. */
function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoAt(date: Date, hours: number, minutes = 0): string {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

describe('useTodayTotal', () => {
  beforeEach(() => {
    fetchByIssueMock.mockReset();
  });

  it('sums only today’s local-day worklogs from a fixture spanning a week boundary', async () => {
    const today = localMidnight(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        {
          key: 'PROJ-1',
          summary: 'A',
          worklogs: [
            // Yesterday — excluded.
            { id: 'w0', timeSpentSeconds: 9999, started: isoAt(yesterday, 23, 59) },
            // Today, just after local midnight — included.
            { id: 'w1', timeSpentSeconds: 3600, started: isoAt(today, 0, 1) },
            // Today, late — included.
            { id: 'w2', timeSpentSeconds: 1800, started: isoAt(today, 23, 30) },
            // Tomorrow — excluded (proves the week-boundary bucketing doesn't
            // bleed into the next day).
            { id: 'w3', timeSpentSeconds: 7200, started: isoAt(tomorrow, 0, 1) },
          ],
        },
      ],
    });

    const { result } = renderHook(() => useTodayTotal(), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.seconds).toBe(3600 + 1800);
    expect(result.current.isError).toBe(false);
  });

  it('returns 0 with isError on a failed query', async () => {
    fetchByIssueMock.mockResolvedValue({ kind: 'auth-expired' });

    const { result } = renderHook(() => useTodayTotal(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.seconds).toBe(0);
    expect(result.current.isPending).toBe(false);
  });

  // Story 7.2 Finding 1: this test pins ONLY the addition (`serverSeconds +
  // sessionSeconds`) and the fact that a prop-only rerender never triggers a
  // fetch — a `rerender({ sessionSeconds: … })` against a stable query key
  // can never cause TanStack Query to refetch, so `toHaveBeenCalledTimes(1)`
  // here is a fact about React, not a guard against the hazard. The reviewer
  // proved this by injecting the forbidden `invalidateQueries(['week-worklogs'])`
  // into `TodayView.handleLogged` and finding the whole suite still green.
  // The actual guard — that logging an entry through the REAL production path
  // does not cause a refetch that would double-count — is pinned by
  // `entrypoints/popup/App.session-total.test.tsx`, which drives the real
  // composition root (`App` → `TodayView` → `useTodayTotal`) with a
  // QueryClient configured exactly like production and a fetch mock that
  // would expose the double-count if a refetch ever fired. That is the test
  // that goes red if a future change adds invalidation to `handleLogged`;
  // this one cannot, by construction, since nothing here ever refetches.
  it('adds the in-session delta on top of the server total (additive; not a guard against re-fetch)', async () => {
    const today = localMidnight(new Date());
    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        {
          key: 'PROJ-1',
          summary: 'A',
          worklogs: [{ id: 'w1', timeSpentSeconds: 3600, started: isoAt(today, 9) }],
        },
      ],
    });

    const { result, rerender } = renderHook(
      ({ sessionSeconds }: { sessionSeconds: number }) => useTodayTotal(sessionSeconds),
      { wrapper, initialProps: { sessionSeconds: 0 } },
    );
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.seconds).toBe(3600);

    // Simulate "logging an entry" in this popup session: the shell bumps
    // sessionSeconds by exactly the logged amount (1800s = 0.5h).
    rerender({ sessionSeconds: 1800 });

    await waitFor(() => expect(result.current.seconds).toBe(3600 + 1800));
  });
});
