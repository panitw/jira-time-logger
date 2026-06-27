import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();

vi.mock('@/lib/jira-client', () => ({
  fetchReportCycleWorklogsByEpic: (...args: unknown[]) => fetchMock(...args),
}));

const { useManagerRow } = await import('./useManagerRow');

const RANGE = {
  start: new Date(2026, 4, 1, 0, 0, 0, 0),
  end: new Date(2026, 4, 31, 23, 59, 59, 999),
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useManagerRow', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('resolves to grouped per-Epic data on ok', async () => {
    fetchMock.mockResolvedValue({
      kind: 'ok',
      value: [{ epicKey: 'PROJ-1', epicSummary: 'Epic', totalSeconds: 3600, worklogs: [] }],
    });
    const { result } = renderHook(
      () => useManagerRow('acct-1', '2026-05', RANGE),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { epicKey: 'PROJ-1', epicSummary: 'Epic', totalSeconds: 3600, worklogs: [] },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('acct-1', RANGE);
  });

  it('surfaces the JiraError on a non-ok result', async () => {
    fetchMock.mockResolvedValue({ kind: 'rate-limited' });
    const { result } = renderHook(
      () => useManagerRow('acct-1', '2026-05', RANGE),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { kind: string }).kind).toBe('rate-limited');
  });

  it('keys the query off accountId + cycleId', async () => {
    fetchMock.mockResolvedValue({ kind: 'ok', value: [] });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function keyWrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client }, children);
    }
    const { result } = renderHook(
      () => useManagerRow('acct-9', '2026-05', RANGE),
      { wrapper: keyWrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const lastKey = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)[0];
    expect(lastKey).toEqual(['manager-row', 'acct-9', '2026-05']);
  });
});
