import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchByIssueMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  fetchCurrentUserWeekWorklogsByIssue: (...args: unknown[]) => fetchByIssueMock(...args),
}));

const ptoSubtaskKeyGetValue = vi.fn(async () => null as string | null);
vi.mock('@/lib/storage/settings', () => ({
  ptoSubtaskKeyItem: { getValue: () => ptoSubtaskKeyGetValue() },
}));

const { useRecentlyWorked, rankRecentlyWorked, MAX_RECENTLY_WORKED } =
  await import('./useRecentlyWorked');

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

describe('rankRecentlyWorked (pure)', () => {
  it('returns an empty array for an empty week', () => {
    expect(rankRecentlyWorked([], null)).toEqual([]);
  });

  it('ranks issues by their newest worklog started, descending', () => {
    const issues = [
      { key: 'PROJ-1', summary: 'Oldest', worklogs: [{ id: 'w1', timeSpentSeconds: 3600, started: isoAt(9, 2) }] },
      { key: 'PROJ-2', summary: 'Newest', worklogs: [{ id: 'w2', timeSpentSeconds: 3600, started: isoAt(9) }] },
      { key: 'PROJ-3', summary: 'Middle', worklogs: [{ id: 'w3', timeSpentSeconds: 3600, started: isoAt(9, 1) }] },
    ];
    expect(rankRecentlyWorked(issues, null).map((i) => i.key)).toEqual([
      'PROJ-2',
      'PROJ-3',
      'PROJ-1',
    ]);
  });

  it('ranks an issue by its NEWEST worklog even when it has several', () => {
    const issues = [
      {
        key: 'PROJ-1',
        summary: 'Multi-worklog',
        worklogs: [
          { id: 'w1', timeSpentSeconds: 3600, started: isoAt(8, 3) },
          { id: 'w2', timeSpentSeconds: 3600, started: isoAt(9) }, // newest
        ],
      },
      { key: 'PROJ-2', summary: 'Single', worklogs: [{ id: 'w3', timeSpentSeconds: 3600, started: isoAt(9, 1) }] },
    ];
    expect(rankRecentlyWorked(issues, null).map((i) => i.key)).toEqual(['PROJ-1', 'PROJ-2']);
  });

  it(`caps at ${MAX_RECENTLY_WORKED} even with more available`, () => {
    const issues = Array.from({ length: 6 }, (_, i) => ({
      key: `PROJ-${i}`,
      summary: `Issue ${i}`,
      worklogs: [{ id: `w${i}`, timeSpentSeconds: 3600, started: isoAt(9, i) }],
    }));
    const ranked = rankRecentlyWorked(issues, null);
    expect(ranked).toHaveLength(MAX_RECENTLY_WORKED);
    // Newest four (smallest daysAgo) win.
    expect(ranked.map((i) => i.key)).toEqual(['PROJ-0', 'PROJ-1', 'PROJ-2', 'PROJ-3']);
  });

  it('excludes the configured PTO subtask (D-7.3-12 mirrored)', () => {
    const issues = [
      { key: 'KNP-99', summary: 'Time off', worklogs: [{ id: 'w1', timeSpentSeconds: 28800, started: isoAt(9) }] },
      { key: 'PROJ-1', summary: 'Real work', worklogs: [{ id: 'w2', timeSpentSeconds: 3600, started: isoAt(9, 1) }] },
    ];
    expect(rankRecentlyWorked(issues, 'KNP-99').map((i) => i.key)).toEqual(['PROJ-1']);
  });

  it('does NOT exclude the catch-all project', () => {
    const issues = [
      { key: 'KNP-CATCHALL-1', summary: 'Admin', worklogs: [{ id: 'w1', timeSpentSeconds: 1800, started: isoAt(9) }] },
    ];
    // No PTO key configured (null) — nothing filters the catch-all issue.
    expect(rankRecentlyWorked(issues, null).map((i) => i.key)).toEqual(['KNP-CATCHALL-1']);
  });

  it('guards invalid/absent started (Number.isFinite), matching useResumeTicket', () => {
    const issues = [
      { key: 'PROJ-1', summary: 'Bad date', worklogs: [{ id: 'w1', timeSpentSeconds: 3600, started: 'not-a-date' }] },
      { key: 'PROJ-2', summary: 'No worklogs', worklogs: [] },
      { key: 'PROJ-3', summary: 'Valid', worklogs: [{ id: 'w2', timeSpentSeconds: 3600, started: isoAt(9) }] },
    ];
    expect(rankRecentlyWorked(issues, null).map((i) => i.key)).toEqual(['PROJ-3']);
  });

  it('fewer than four available renders fewer than four — never padded', () => {
    const issues = [
      { key: 'PROJ-1', summary: 'Only one', worklogs: [{ id: 'w1', timeSpentSeconds: 3600, started: isoAt(9) }] },
    ];
    expect(rankRecentlyWorked(issues, null)).toHaveLength(1);
  });
});

describe('useRecentlyWorked (hook composition)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ptoSubtaskKeyGetValue.mockResolvedValue(null);
  });

  it('reads the SAME query useTodayTotal/useResumeTicket use — zero extra network calls', async () => {
    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { key: 'PROJ-1', summary: 'Alpha', worklogs: [{ id: 'w1', timeSpentSeconds: 3600, started: isoAt(9) }] },
      ],
    });

    const { result } = renderHook(() => useRecentlyWorked(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({ key: 'PROJ-1', summary: 'Alpha' });
    expect(fetchByIssueMock).toHaveBeenCalledTimes(1);
  });

  it('resolves to an empty array while the query is loading, then updates once data arrives', async () => {
    let resolve: (v: unknown) => void = () => {};
    fetchByIssueMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { result } = renderHook(() => useRecentlyWorked(), { wrapper });
    expect(result.current).toEqual([]);

    resolve({
      kind: 'ok',
      value: [
        { key: 'PROJ-1', summary: 'Alpha', worklogs: [{ id: 'w1', timeSpentSeconds: 3600, started: isoAt(9) }] },
      ],
    });

    await waitFor(() => expect(result.current).toHaveLength(1));
  });

  it('resolves to an empty array on a query error — fails closed, never throws', async () => {
    fetchByIssueMock.mockResolvedValue({ kind: 'network', cause: 'offline' });
    const { result } = renderHook(() => useRecentlyWorked(), { wrapper });
    await waitFor(() => expect(fetchByIssueMock).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
