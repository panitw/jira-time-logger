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

const { useCanApprove } = await import('./useCanApprove');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useCanApprove', () => {
  beforeEach(() => {
    jiraGetMock.mockReset();
  });

  it('reports canonical when the report manager is the current user', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { accountId: 'r1', displayName: 'R', manager: { accountId: 'me', displayName: 'Boss' } },
    });
    const { result } = renderHook(() => useCanApprove('r1', 'me'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ isCanonical: true, canonicalManagerName: 'Boss' });
  });

  it('reports non-canonical when the report manager differs', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { accountId: 'r1', displayName: 'R', manager: { accountId: 'other', displayName: 'Other' } },
    });
    const { result } = renderHook(() => useCanApprove('r1', 'me'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ isCanonical: false, canonicalManagerName: 'Other' });
  });

  it('fails closed (value, not error) when the lookup errors', async () => {
    jiraGetMock.mockResolvedValueOnce({ kind: 'network', cause: 'boom' });
    const { result } = renderHook(() => useCanApprove('r1', 'me'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ isCanonical: false, canonicalManagerName: null });
  });

  it('is disabled (no fetch) until the current user accountId resolves', async () => {
    const { result } = renderHook(() => useCanApprove('r1', undefined), { wrapper });
    // Disabled query stays pending without firing the queryFn.
    expect(result.current.fetchStatus).toBe('idle');
    expect(jiraGetMock).not.toHaveBeenCalled();
  });
});
