import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApprovalComment } from '@/lib/comment-schema';
import { getCurrentCycleId } from '@/lib/cycle-range';

const findMock = vi.fn();

vi.mock('@/lib/parser', () => ({
  findApprovalComments: (...args: unknown[]) => findMock(...args),
}));

const { useEpicApprovals } = await import('./useEpicApprovals');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

const APPROVAL: ApprovalComment = {
  v: 1,
  user: 'acct-1',
  cycle: '2026-06',
  by: 'mgr-1',
  at: '2026-06-15T12:00:00.000Z',
  restrictedCount: 0,
  checksum: 'deadbeef',
};

describe('useEpicApprovals', () => {
  beforeEach(() => {
    findMock.mockReset();
  });

  it('resolves to ApprovalComment[] on ok', async () => {
    findMock.mockResolvedValue({ kind: 'ok', value: [APPROVAL] });
    const { result } = renderHook(() => useEpicApprovals('PROJ-1', '2026-05'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([APPROVAL]);
    expect(findMock).toHaveBeenCalledWith('PROJ-1');
  });

  it('surfaces the JiraError on a non-ok result (throw-from-queryFn)', async () => {
    findMock.mockResolvedValue({ kind: 'auth-expired' });
    const { result } = renderHook(() => useEpicApprovals('PROJ-1', '2026-05'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { kind: string }).kind).toBe('auth-expired');
  });

  it("keys the query off ['epic-approvals', epicKey] (deduped per Epic)", async () => {
    findMock.mockResolvedValue({ kind: 'ok', value: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function keyWrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client }, children);
    }
    const { result } = renderHook(() => useEpicApprovals('PROJ-9', '2026-05'), {
      wrapper: keyWrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const key = client.getQueryCache().getAll().map((q) => q.queryKey)[0];
    expect(key).toEqual(['epic-approvals', 'PROJ-9']);
  });

  it('uses a finite staleTime for the current (open) cycle', async () => {
    findMock.mockResolvedValue({ kind: 'ok', value: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function keyWrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client }, children);
    }
    const openCycle = getCurrentCycleId('calendar-month');
    const { result } = renderHook(() => useEpicApprovals('PROJ-1', openCycle), {
      wrapper: keyWrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = client.getQueryCache().getAll()[0]!;
    expect((query.options as { staleTime?: number }).staleTime).toBe(60_000);
  });

  it('uses Infinity staleTime for a closed (past) cycle', async () => {
    findMock.mockResolvedValue({ kind: 'ok', value: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function keyWrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client }, children);
    }
    const { result } = renderHook(() => useEpicApprovals('PROJ-1', '2000-01'), {
      wrapper: keyWrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = client.getQueryCache().getAll()[0]!;
    expect((query.options as { staleTime?: number }).staleTime).toBe(Infinity);
  });
});
