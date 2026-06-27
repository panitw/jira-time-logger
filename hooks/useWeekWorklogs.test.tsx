import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchByIssueMock = vi.fn();

vi.mock('@/lib/jira-client', () => ({
  fetchCurrentUserWeekWorklogsByIssue: (...args: unknown[]) =>
    fetchByIssueMock(...args),
}));

vi.mock('@/lib/cycle-range', () => ({
  currentCycleRange: vi.fn(() => ({
    start: new Date(2026, 5, 15, 0, 0, 0, 0),
    end: new Date(2026, 5, 21, 23, 59, 59, 999),
  })),
}));

const { useWeekWorklogs } = await import('./useWeekWorklogs');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useWeekWorklogs', () => {
  beforeEach(() => {
    fetchByIssueMock.mockReset();
  });

  it('returns the value on ok', async () => {
    fetchByIssueMock.mockResolvedValue({
      kind: 'ok',
      value: [{ key: 'PROJ-1', summary: 'A', worklogs: [] }],
    });
    const { result } = renderHook(() => useWeekWorklogs('2026-06-15'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { key: 'PROJ-1', summary: 'A', worklogs: [] },
    ]);
  });

  it('surfaces the JiraError on a non-ok result', async () => {
    fetchByIssueMock.mockResolvedValue({ kind: 'auth-expired' });
    const { result } = renderHook(() => useWeekWorklogs('2026-06-15'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { kind: string }).kind).toBe('auth-expired');
  });

  it('keys the query off weekOf', async () => {
    fetchByIssueMock.mockResolvedValue({ kind: 'ok', value: [] });
    const { result } = renderHook(() => useWeekWorklogs('2026-06-15'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchByIssueMock).toHaveBeenCalledTimes(1);
  });
});
