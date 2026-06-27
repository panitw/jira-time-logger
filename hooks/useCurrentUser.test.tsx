import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const jiraGetMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  jiraGet: (...a: unknown[]) => jiraGetMock(...a),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { useCurrentUser } = await import('./useCurrentUser');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useCurrentUser', () => {
  beforeEach(() => {
    jiraGetMock.mockReset();
  });

  it('resolves the current accountId from rest/api/3/myself', async () => {
    jiraGetMock.mockResolvedValueOnce({ kind: 'ok', value: { accountId: 'mgr-9', displayName: 'M' } });
    const { result } = renderHook(() => useCurrentUser(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('mgr-9');
    expect(jiraGetMock).toHaveBeenCalledWith('rest/api/3/myself', expect.anything());
  });

  it('surfaces the JiraError kind on failure', async () => {
    jiraGetMock.mockResolvedValueOnce({ kind: 'auth-expired' });
    const { result } = renderHook(() => useCurrentUser(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { kind: string }).kind).toBe('auth-expired');
  });
});
