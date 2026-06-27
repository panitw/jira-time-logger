import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const jiraGetMock = vi.fn();
const findDirectReportsMock = vi.fn();

vi.mock('@/lib/jira-client', () => ({
  jiraGet: (...args: unknown[]) => jiraGetMock(...args),
}));
vi.mock('@/lib/manager-resolution', () => ({
  findDirectReports: (...args: unknown[]) => findDirectReportsMock(...args),
}));

const { useManagerReports } = await import('./useManagerReports');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useManagerReports', () => {
  beforeEach(() => {
    jiraGetMock.mockReset();
    findDirectReportsMock.mockReset();
  });

  it('resolves the normalized report set on ok', async () => {
    jiraGetMock.mockResolvedValue({ kind: 'ok', value: { accountId: 'mgr', displayName: 'Mgr' } });
    findDirectReportsMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { accountId: 'r1', displayName: 'Bob' },
        { accountId: 'r2', displayName: 'Carol' },
      ],
    });
    const { result } = renderHook(() => useManagerReports(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { accountId: 'r1', displayName: 'Bob' },
      { accountId: 'r2', displayName: 'Carol' },
    ]);
    expect(findDirectReportsMock).toHaveBeenCalledWith('mgr');
  });

  it('dedupes reports by accountId (Story 5.2 deferral)', async () => {
    jiraGetMock.mockResolvedValue({ kind: 'ok', value: { accountId: 'mgr', displayName: 'Mgr' } });
    findDirectReportsMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { accountId: 'r1', displayName: 'Bob' },
        { accountId: 'r1', displayName: 'Bob duplicate' },
      ],
    });
    const { result } = renderHook(() => useManagerReports(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ accountId: 'r1', displayName: 'Bob' }]);
  });

  it('drops malformed cached report entries (Story 5.2 deferral)', async () => {
    jiraGetMock.mockResolvedValue({ kind: 'ok', value: { accountId: 'mgr', displayName: 'Mgr' } });
    findDirectReportsMock.mockResolvedValue({
      kind: 'ok',
      value: [
        { accountId: 'r1', displayName: 'Bob' },
        null,
        { accountId: 42 },
      ],
    });
    const { result } = renderHook(() => useManagerReports(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ accountId: 'r1', displayName: 'Bob' }]);
  });

  it('surfaces the JiraError when myself fails', async () => {
    jiraGetMock.mockResolvedValue({ kind: 'auth-expired' });
    const { result } = renderHook(() => useManagerReports(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { kind: string }).kind).toBe('auth-expired');
  });

  it('surfaces the JiraError when findDirectReports fails', async () => {
    jiraGetMock.mockResolvedValue({ kind: 'ok', value: { accountId: 'mgr', displayName: 'Mgr' } });
    findDirectReportsMock.mockResolvedValue({ kind: 'network', cause: 'x' });
    const { result } = renderHook(() => useManagerReports(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { kind: string }).kind).toBe('network');
  });
});
