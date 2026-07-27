import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory storage backing the wxt storage.defineItem mock.
const store = new Map<string, unknown>();

vi.stubGlobal('crypto', {
  randomUUID: (() => {
    let n = 0;
    return () => `id-${++n}`;
  })(),
});

vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: <T,>(key: string, opts: { fallback: T }) => ({
      getValue: vi.fn(async () => (store.has(key) ? (store.get(key) as T) : opts.fallback)),
      setValue: vi.fn(async (value: T) => {
        store.set(key, value);
      }),
      watch: vi.fn(() => () => {}),
    }),
  },
}));

const postWorklogMock = vi.fn();
const postCommentMock = vi.fn();
const updateWorklogMock = vi.fn();
const deleteWorklogMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  postWorklog: (...args: unknown[]) => postWorklogMock(...args),
  postComment: (...args: unknown[]) => postCommentMock(...args),
  updateWorklog: (...args: unknown[]) => updateWorklogMock(...args),
  deleteWorklog: (...args: unknown[]) => deleteWorklogMock(...args),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const {
  enqueue,
  list,
  remove,
  update,
  markFailed,
  clearOutbox,
  discardPending,
  runOutboxRetryPass,
  outboxItem,
  outboxDrainedItem,
  MAX_ATTEMPTS,
  OutboxEntrySchema,
} = await import('./outbox');

const mockClient = {
  postWorklog: postWorklogMock as never,
  postComment: postCommentMock as never,
  updateWorklog: updateWorklogMock as never,
  deleteWorklog: deleteWorklogMock as never,
};

describe('outbox queue helpers', () => {
  beforeEach(async () => {
    store.clear();
    postWorklogMock.mockReset();
    postCommentMock.mockReset();
    updateWorklogMock.mockReset();
    deleteWorklogMock.mockReset();
  });

  it('starts empty', async () => {
    expect(await list()).toEqual([]);
  });

  it('enqueue appends a pending entry with generated fields', async () => {
    const entry = await enqueue({
      kind: 'post',
      endpoint: 'rest/api/3/issue/PROJ-1/worklog',
      issueKey: 'PROJ-1',
      body: { timeSpentSeconds: 3600, started: 's' },
    });
    expect(entry.id).toBeTruthy();
    expect(entry.attemptCount).toBe(0);
    expect(entry.status).toBe('pending');
    expect(entry.enqueuedAt).toBeTruthy();

    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]!.issueKey).toBe('PROJ-1');
    expect(items[0]!.kind).toBe('post');
  });

  it('remove deletes by id', async () => {
    const a = await enqueue({ kind: 'delete', endpoint: 'e1', issueKey: 'P-1', worklogId: '1' });
    await enqueue({ kind: 'delete', endpoint: 'e2', issueKey: 'P-2', worklogId: '2' });
    await remove(a.id);
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]!.issueKey).toBe('P-2');
  });

  it('update patches an entry in place', async () => {
    const a = await enqueue({ kind: 'put', endpoint: 'e', issueKey: 'P-1', worklogId: '1' });
    await update(a.id, { attemptCount: 3, lastError: 'network' });
    const items = await list();
    expect(items[0]!.attemptCount).toBe(3);
    expect(items[0]!.lastError).toBe('network');
  });

  it('markFailed sets status failed + lastError', async () => {
    const a = await enqueue({ kind: 'put', endpoint: 'e', issueKey: 'P-1', worklogId: '1' });
    await markFailed(a.id, 'forbidden');
    const items = await list();
    expect(items[0]!.status).toBe('failed');
    expect(items[0]!.lastError).toBe('forbidden');
  });

  it('clearOutbox empties the queue', async () => {
    await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-1' });
    await clearOutbox();
    expect(await list()).toEqual([]);
  });

  it('list is fail-closed: drops a corrupt entry, never throws', async () => {
    // Inject one valid + one corrupt row directly into storage.
    const valid = {
      id: 'good',
      kind: 'post',
      endpoint: 'e',
      issueKey: 'P-1',
      attemptCount: 0,
      status: 'pending',
      enqueuedAt: 'now',
    };
    const corrupt = { id: 'bad', kind: 'not-a-kind', attemptCount: 'NaN' };
    await outboxItem.setValue([valid, corrupt] as never);
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('good');
  });

  it('OutboxEntrySchema rejects malformed entries', () => {
    expect(OutboxEntrySchema.safeParse({ id: 'x' }).success).toBe(false);
  });

  describe('discardPending (offline banner trash affordance)', () => {
    it('drops every pending entry and reports the count', async () => {
      await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-1' });
      await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-2' });

      expect(await discardPending()).toBe(2);
      expect(await list()).toEqual([]);
    });

    it('KEEPS failed entries — they belong to the write-error banner, not this one', async () => {
      const failing = await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-1' });
      await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-2' });
      await markFailed(failing.id, 'forbidden');

      expect(await discardPending()).toBe(1);

      // The banner counts `pending` only, so discarding a `failed` entry
      // would bin a write it never named — and would silently empty the
      // error banner, whose per-entry Retry is the only way back.
      const remaining = await list();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe(failing.id);
      expect(remaining[0]!.status).toBe('failed');
    });

    it('is a no-op on an empty queue — reports 0, writes nothing', async () => {
      const failing = await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-1' });
      await markFailed(failing.id, 'forbidden');
      const setValue = vi.mocked(outboxItem.setValue);
      setValue.mockClear();

      expect(await discardPending()).toBe(0);
      expect(setValue).not.toHaveBeenCalled();
      expect(await list()).toHaveLength(1);
    });
  });
});

describe('runOutboxRetryPass', () => {
  beforeEach(async () => {
    store.clear();
    postWorklogMock.mockReset();
    postCommentMock.mockReset();
    updateWorklogMock.mockReset();
    deleteWorklogMock.mockReset();
  });

  it('returns drained 0 when no pending entries', async () => {
    const res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(0);
  });

  it('success path: ok result removes the entry and counts as drained', async () => {
    await enqueue({
      kind: 'post',
      endpoint: 'e',
      issueKey: 'P-1',
      body: { timeSpentSeconds: 3600, started: 's' },
    });
    postWorklogMock.mockResolvedValueOnce({ kind: 'ok', value: { id: '99' } });

    const res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(1);
    expect(await list()).toEqual([]);
    expect(postWorklogMock).toHaveBeenCalledWith('P-1', { timeSpentSeconds: 3600, started: 's' });
  });

  it('replays put + delete through the right client method', async () => {
    await enqueue({ kind: 'put', endpoint: 'e', issueKey: 'P-1', worklogId: '10', body: { timeSpentSeconds: 60, started: 's' } });
    await enqueue({ kind: 'delete', endpoint: 'e', issueKey: 'P-2', worklogId: '20' });
    updateWorklogMock.mockResolvedValueOnce({ kind: 'ok', value: { id: '10' } });
    deleteWorklogMock.mockResolvedValueOnce({ kind: 'ok', value: undefined });

    const res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(2);
    expect(updateWorklogMock).toHaveBeenCalledWith('P-1', '10', { timeSpentSeconds: 60, started: 's' });
    expect(deleteWorklogMock).toHaveBeenCalledWith('P-2', '20');
    expect(await list()).toEqual([]);
  });

  it('fail-then-success: transient failure increments attemptCount, then drains on next pass', async () => {
    const entry = await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-1', body: {} });
    postWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });

    let res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(0);
    let items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(entry.id);
    expect(items[0]!.attemptCount).toBe(1);
    expect(items[0]!.status).toBe('pending');
    expect(items[0]!.lastError).toBe('network');

    postWorklogMock.mockResolvedValueOnce({ kind: 'ok', value: { id: '1' } });
    res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(1);
    items = await list();
    expect(items).toEqual([]);
  });

  it('exceeds max: at attemptCount 9, a transient failure moves to failed (not deleted)', async () => {
    const entry = await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-1', body: {} });
    // Pre-set attemptCount to MAX_ATTEMPTS - 1 so the next failure hits the cap.
    await update(entry.id, { attemptCount: MAX_ATTEMPTS - 1 });
    postWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });

    const res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(0);
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe('failed');
    expect(items[0]!.lastError).toBe('network');
  });

  it('non-retryable kind (forbidden) → immediate failed, not retried', async () => {
    await enqueue({ kind: 'put', endpoint: 'e', issueKey: 'P-1', worklogId: '1', body: {} });
    updateWorklogMock.mockResolvedValueOnce({ kind: 'forbidden' });

    const res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(0);
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe('failed');
    expect(items[0]!.lastError).toBe('forbidden');
  });

  it('only processes pending entries (skips failed)', async () => {
    const a = await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-1', body: {} });
    await markFailed(a.id, 'forbidden');
    const res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(0);
    expect(postWorklogMock).not.toHaveBeenCalled();
  });

  it('accumulates the drained counter for the popup toast', async () => {
    await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-1', body: {} });
    postWorklogMock.mockResolvedValueOnce({ kind: 'ok', value: { id: '1' } });
    await runOutboxRetryPass(mockClient);
    expect(await outboxDrainedItem.getValue()).toBe(1);
  });

  it('never throws when a replay rejects; keeps the entry pending', async () => {
    await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-1', body: {} });
    postWorklogMock.mockRejectedValueOnce(new Error('boom'));
    const res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(0);
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe('pending');
  });

  it('malformed entry (post with no body) → failed immediately, never sent to Jira', async () => {
    await enqueue({ kind: 'post', endpoint: 'e', issueKey: 'P-1' });
    const res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(0);
    expect(postWorklogMock).not.toHaveBeenCalled();
    const items = await list();
    expect(items[0]!.status).toBe('failed');
  });

  it('malformed entry (put/delete with no worklogId) → failed immediately, never sent to Jira', async () => {
    // Inject directly: enqueue would normally carry a worklogId for put/delete,
    // but a corrupt/legacy entry can pass the schema (worklogId is optional).
    await outboxItem.setValue([
      { id: 'p', kind: 'put', endpoint: 'e', issueKey: 'P-1', attemptCount: 0, status: 'pending', enqueuedAt: 'now', body: {} },
      { id: 'd', kind: 'delete', endpoint: 'e', issueKey: 'P-2', attemptCount: 0, status: 'pending', enqueuedAt: 'now' },
    ] as never);
    const res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(0);
    expect(updateWorklogMock).not.toHaveBeenCalled();
    expect(deleteWorklogMock).not.toHaveBeenCalled();
    const items = await list();
    expect(items.every((e) => e.status === 'failed')).toBe(true);
  });

  it('comment-kind enqueue persists and replays to postComment (Story 5.6)', async () => {
    const commentBody = {
      body: {
        type: 'doc' as const,
        version: 1 as const,
        content: [
          { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'approval' }] },
        ],
      },
    };
    await enqueue({
      kind: 'comment',
      endpoint: 'rest/api/3/issue/EP-1/comment',
      issueKey: 'EP-1',
      body: commentBody,
    });
    // It persists as a `comment` entry.
    const stored = await list();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.kind).toBe('comment');

    postCommentMock.mockResolvedValueOnce({ kind: 'ok', value: { id: 'c-1' } });
    const res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(1);
    expect(postCommentMock).toHaveBeenCalledWith('EP-1', commentBody);
    expect(await list()).toEqual([]);
  });

  it('comment-kind with no body → failed immediately, never sent to Jira', async () => {
    await outboxItem.setValue([
      { id: 'c', kind: 'comment', endpoint: 'e', issueKey: 'EP-1', attemptCount: 0, status: 'pending', enqueuedAt: 'now' },
    ] as never);
    const res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(0);
    expect(postCommentMock).not.toHaveBeenCalled();
    const items = await list();
    expect(items[0]!.status).toBe('failed');
  });

  it('comment-kind transient failure increments attemptCount then drains', async () => {
    const body = { body: { type: 'doc', version: 1, content: [] } };
    await enqueue({ kind: 'comment', endpoint: 'e', issueKey: 'EP-1', body });
    postCommentMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
    let res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(0);
    const items = await list();
    expect(items[0]!.attemptCount).toBe(1);
    expect(items[0]!.status).toBe('pending');

    postCommentMock.mockResolvedValueOnce({ kind: 'ok', value: { id: 'c' } });
    res = await runOutboxRetryPass(mockClient);
    expect(res.drained).toBe(1);
    expect(await list()).toEqual([]);
  });

  it('drain-in-progress guard: a concurrent pass short-circuits (no double replay)', async () => {
    await enqueue({
      kind: 'post',
      endpoint: 'e',
      issueKey: 'P-1',
      body: { timeSpentSeconds: 3600, started: 's' },
    });
    // First call blocks inside postWorklog; second call must see `draining` and
    // return immediately without replaying.
    let release: (() => void) | undefined;
    const invoked = new Promise<void>((resolveInvoked) => {
      postWorklogMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ kind: 'ok', value: { id: '1' } });
            resolveInvoked();
          }),
      );
    });
    const first = runOutboxRetryPass(mockClient);
    // Wait until the first pass is actually mid-replay (mock invoked) before the
    // concurrent call, so the guard is exercised against a real in-flight pass.
    await invoked;
    const second = await runOutboxRetryPass(mockClient);
    expect(second.drained).toBe(0);
    release?.();
    const firstRes = await first;
    expect(firstRes.drained).toBe(1);
    expect(postWorklogMock).toHaveBeenCalledTimes(1);
  });
});
