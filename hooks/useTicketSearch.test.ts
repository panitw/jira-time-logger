import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type JiraHierarchyIssue } from '@/lib/jira-types';

const searchTicketsMock = vi.fn();
vi.mock('@/lib/ticket-search', () => ({
  searchTickets: (...args: unknown[]) => searchTicketsMock(...args),
  MAX_RESULTS: 20,
}));

const mockUseCurrentUser = vi.fn();
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

const { useTicketSearch, SEARCH_DEBOUNCE_MS } = await import('./useTicketSearch');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

function issue(
  key: string,
  opts: {
    assignee?: { accountId: string; displayName: string };
    statusKey?: string;
    updated?: string;
    subtask?: boolean;
  } = {},
): JiraHierarchyIssue {
  return {
    id: key,
    key,
    fields: {
      summary: `Summary for ${key}`,
      ...(opts.subtask !== undefined
        ? { issuetype: { id: '1', name: 'Sub-task', subtask: opts.subtask } }
        : {}),
      ...(opts.assignee ? { assignee: opts.assignee } : {}),
      ...(opts.statusKey ? { status: { statusCategory: { key: opts.statusKey } } } : {}),
      ...(opts.updated ? { updated: opts.updated } : {}),
    },
  };
}

describe('useTicketSearch', () => {
  beforeEach(() => {
    searchTicketsMock.mockReset();
    mockUseCurrentUser.mockReturnValue({ isSuccess: false, data: undefined });
  });

  it('does not search for a 1-character or whitespace-only query', async () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(({ q }) => useTicketSearch(q), {
        wrapper,
        initialProps: { q: 'a' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      expect(result.current).toEqual({ kind: 'idle' });
      expect(searchTicketsMock).not.toHaveBeenCalled();

      rerender({ q: '  ' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      expect(result.current).toEqual({ kind: 'idle' });
      expect(searchTicketsMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('collapses a typing burst into exactly one request, fired after the 250ms debounce', async () => {
    vi.useFakeTimers();
    try {
      searchTicketsMock.mockResolvedValue({ kind: 'ok', value: [] });
      const { rerender } = renderHook(({ q }) => useTicketSearch(q), {
        wrapper,
        initialProps: { q: 'a' },
      });

      // A fast burst — none of these individually reach the debounce window.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      rerender({ q: 'ab' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      rerender({ q: 'aba' });

      expect(searchTicketsMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });

      expect(searchTicketsMock).toHaveBeenCalledTimes(1);
      // D-7.4-15: this hook is the ONE caller that opts in to the widened
      // JQL — `searchTickets` must never widen by default.
      expect(searchTicketsMock).toHaveBeenCalledWith('aba', { widen: true });
    } finally {
      vi.useRealTimers();
    }
  });

  // The exact bug `TicketPicker`'s `useMutation` search has: no request
  // identity, so a slow response to an OLDER query can land after a fast
  // response to a NEWER one and clobber it. `useQuery` keyed by the debounced
  // query rules this out structurally.
  it('a stale response for an older query cannot overwrite a newer one', async () => {
    vi.useFakeTimers();
    try {
      let resolveAba: ((v: unknown) => void) | undefined;
      searchTicketsMock.mockImplementation((q: string) => {
        if (q === 'aba') {
          return new Promise((resolve) => {
            resolveAba = resolve;
          });
        }
        return Promise.resolve({ kind: 'ok', value: [issue('ABACUS-1')] });
      });

      const { result, rerender } = renderHook(({ q }) => useTicketSearch(q), {
        wrapper,
        initialProps: { q: 'aba' },
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      expect(result.current).toEqual({ kind: 'in-flight' });

      // The user keeps typing before "aba" resolves.
      rerender({ q: 'abacus' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current).toEqual({
        kind: 'results',
        items: [{ issue: issue('ABACUS-1'), assignment: 'unknown' }],
        truncated: false,
      });

      // The stale "aba" response finally lands — it must NOT clobber the
      // already-rendered "abacus" results.
      await act(async () => {
        resolveAba?.({ kind: 'ok', value: [issue('SHOULD-NOT-APPEAR')] });
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current).toEqual({
        kind: 'results',
        items: [{ issue: issue('ABACUS-1'), assignment: 'unknown' }],
        truncated: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('sorts assigned-to-you first, stably, ahead of everything else', async () => {
    vi.useFakeTimers();
    try {
      mockUseCurrentUser.mockReturnValue({ isSuccess: true, data: 'me' });
      const other1 = issue('OTHER-1', { assignee: { accountId: 'x', displayName: 'X' } });
      const mine = issue('MINE-1', { assignee: { accountId: 'me', displayName: 'Me' } });
      const other2 = issue('OTHER-2', { assignee: { accountId: 'y', displayName: 'Y' } });
      searchTicketsMock.mockResolvedValue({
        kind: 'ok',
        value: [other1, mine, other2],
      });

      const { result } = renderHook(() => useTicketSearch('abc'), { wrapper });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.kind).toBe('results');

      const state = result.current as Extract<
        ReturnType<typeof useTicketSearch>,
        { kind: 'results' }
      >;
      expect(state.items.map((i) => i.issue.key)).toEqual(['MINE-1', 'OTHER-1', 'OTHER-2']);
      expect(state.items[0]!.assignment).toBe('you');
      // Ordering WITHIN the non-you group is stable (OTHER-1 before OTHER-2,
      // matching Jira's own returned order).
      expect(state.items[1]!.issue.key).toBe('OTHER-1');
      expect(state.items[2]!.issue.key).toBe('OTHER-2');
    } finally {
      vi.useRealTimers();
    }
  });

  // D-7.4-13: the forced ranking mitigation for dropping the JQL's
  // statusCategory/updated filters — open before done, recent before stale.
  it('ranks open tickets before done ones, and recently-updated before stale, within a tier', async () => {
    vi.useFakeTimers();
    try {
      const done = issue('DONE-1', { statusKey: 'done', updated: '2026-07-01T00:00:00.000Z' });
      const openStale = issue('OPEN-STALE', {
        statusKey: 'new',
        updated: '2026-01-01T00:00:00.000Z',
      });
      const openFresh = issue('OPEN-FRESH', {
        statusKey: 'indeterminate',
        updated: '2026-07-20T00:00:00.000Z',
      });
      searchTicketsMock.mockResolvedValue({ kind: 'ok', value: [done, openStale, openFresh] });

      const { result } = renderHook(() => useTicketSearch('abc'), { wrapper });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.kind).toBe('results');

      const state = result.current as Extract<
        ReturnType<typeof useTicketSearch>,
        { kind: 'results' }
      >;
      expect(state.items.map((i) => i.issue.key)).toEqual([
        'OPEN-FRESH',
        'OPEN-STALE',
        'DONE-1',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  // Finding 10 (Nit): when BOTH items lack `updated`, the raw comparator
  // (`updatedMs(b) - updatedMs(a)`) evaluates `-Infinity - (-Infinity)` =
  // `NaN`, which is implementation-defined for `Array.prototype.sort`. Pins
  // the explicit `Number.isNaN` guard rather than relying on a V8 quirk.
  it('does not crash or reorder when both items lack `updated` (NaN-comparator guard)', async () => {
    vi.useFakeTimers();
    try {
      const first = issue('FIRST-1', { statusKey: 'new' });
      const second = issue('SECOND-1', { statusKey: 'new' });
      searchTicketsMock.mockResolvedValue({ kind: 'ok', value: [first, second] });

      const { result } = renderHook(() => useTicketSearch('abc'), { wrapper });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.kind).toBe('results');
      const state = result.current as Extract<
        ReturnType<typeof useTicketSearch>,
        { kind: 'results' }
      >;
      // Stable order preserved — Jira's own returned order survives a full
      // tie rather than being scrambled by an unspecified NaN comparator.
      expect(state.items.map((i) => i.issue.key)).toEqual(['FIRST-1', 'SECOND-1']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('degrades to Jira order with no pills when useCurrentUser has not resolved', async () => {
    vi.useFakeTimers();
    try {
      mockUseCurrentUser.mockReturnValue({ isSuccess: false, data: undefined });
      searchTicketsMock.mockResolvedValue({
        kind: 'ok',
        value: [issue('A-1', { assignee: { accountId: 'me', displayName: 'Me' } })],
      });

      const { result } = renderHook(() => useTicketSearch('abc'), { wrapper });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.kind).toBe('results');

      const state = result.current as Extract<
        ReturnType<typeof useTicketSearch>,
        { kind: 'results' }
      >;
      expect(state.items[0]!.assignment).toBe('unknown');
    } finally {
      vi.useRealTimers();
    }
  });

  it('degrades to Jira order with no pills when useCurrentUser has errored', async () => {
    vi.useFakeTimers();
    try {
      mockUseCurrentUser.mockReturnValue({ isSuccess: false, isError: true, data: undefined });
      searchTicketsMock.mockResolvedValue({ kind: 'ok', value: [issue('A-1')] });

      const { result } = renderHook(() => useTicketSearch('abc'), { wrapper });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.kind).toBe('results');

      const state = result.current as Extract<
        ReturnType<typeof useTicketSearch>,
        { kind: 'results' }
      >;
      expect(state.items[0]!.assignment).toBe('unknown');
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces "empty" when the search resolves with zero issues', async () => {
    vi.useFakeTimers();
    try {
      searchTicketsMock.mockResolvedValue({ kind: 'ok', value: [] });
      const { result } = renderHook(() => useTicketSearch('nonexistent'), { wrapper });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current).toEqual({ kind: 'empty' });
    } finally {
      vi.useRealTimers();
    }
  });

  // D-7.4-22/D-7.4-13: a 429 surfaces as its OWN state (never lumped in with a
  // generic failure) and, because `retry: false`, never auto-retries into
  // the rate limiter.
  it('surfaces a rate-limited failure as its own state and never retries', async () => {
    vi.useFakeTimers();
    try {
      searchTicketsMock.mockResolvedValue({ kind: 'rate-limited', retryAfterMs: 2000 });
      const { result } = renderHook(() => useTicketSearch('abc'), { wrapper });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current).toEqual({ kind: 'failed', errorKind: 'rate-limited' });
      // No retry was ever attempted beyond the one call.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(searchTicketsMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a bounded truncation flag when the result count hits MAX_RESULTS', async () => {
    vi.useFakeTimers();
    try {
      const many = Array.from({ length: 20 }, (_, i) => issue(`T-${i}`));
      searchTicketsMock.mockResolvedValue({ kind: 'ok', value: many });
      const { result } = renderHook(() => useTicketSearch('abc'), { wrapper });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.kind).toBe('results');
      const state = result.current as Extract<
        ReturnType<typeof useTicketSearch>,
        { kind: 'results' }
      >;
      expect(state.truncated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
