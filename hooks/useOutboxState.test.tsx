import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let outboxEntries: unknown[] = [];
const watchers: ((v: unknown[]) => void)[] = [];
const getValueMock = vi.fn(async () => outboxEntries);
const watchMock = vi.fn((cb: (v: unknown[]) => void) => {
  watchers.push(cb);
  return () => {
    const i = watchers.indexOf(cb);
    if (i >= 0) watchers.splice(i, 1);
  };
});

vi.mock('@/lib/storage/outbox', () => ({
  outboxItem: {
    getValue: getValueMock,
    watch: (cb: (v: unknown[]) => void) => watchMock(cb),
  },
}));

const { useOutboxState } = await import('./useOutboxState');

function entry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'id-1',
    kind: 'post',
    endpoint: 'x',
    issueKey: 'PROJ-1',
    attemptCount: 0,
    status: 'pending',
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('useOutboxState', () => {
  beforeEach(() => {
    outboxEntries = [];
    watchers.length = 0;
    getValueMock.mockClear();
    watchMock.mockClear();
  });

  it('starts empty and reads the outbox on mount', async () => {
    outboxEntries = [entry({ id: 'p1', status: 'pending' })];
    const { result } = renderHook(() => useOutboxState());
    await waitFor(() => expect(result.current.pendingCount).toBe(1));
    expect(result.current.failed).toEqual([]);
  });

  it('counts only status:"pending" toward pendingCount — never "failed"', async () => {
    outboxEntries = [
      entry({ id: 'p1', status: 'pending' }),
      entry({ id: 'p2', status: 'pending' }),
      entry({ id: 'f1', status: 'failed', lastError: 'forbidden' }),
    ];
    const { result } = renderHook(() => useOutboxState());
    await waitFor(() => expect(result.current.pendingCount).toBe(2));
    expect(result.current.failed).toHaveLength(1);
    expect(result.current.failed[0]!.id).toBe('f1');
  });

  it('re-syncs when the outbox store fires a watch callback (reactive, no polling)', async () => {
    outboxEntries = [];
    const { result } = renderHook(() => useOutboxState());
    await waitFor(() => expect(getValueMock).toHaveBeenCalled());
    expect(result.current.pendingCount).toBe(0);

    outboxEntries = [entry({ id: 'p1', status: 'pending' })];
    act(() => {
      for (const cb of watchers) cb(outboxEntries);
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(1));
  });

  it('unwatches on unmount', async () => {
    const { unmount } = renderHook(() => useOutboxState());
    await waitFor(() => expect(watchers.length).toBe(1));
    unmount();
    expect(watchers.length).toBe(0);
  });
});
