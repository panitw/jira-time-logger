import { describe, it, expect, vi, beforeEach } from 'vitest';

const jiraPostMock = vi.fn();
const jiraGetMock = vi.fn();

vi.mock('@/lib/jira-client', () => ({
  jiraPost: (...args: unknown[]) => jiraPostMock(...args),
  jiraGet: (...args: unknown[]) => jiraGetMock(...args),
}));

const { createSubtask } = await import('./create-subtask');

describe('createSubtask', () => {
  beforeEach(() => {
    jiraPostMock.mockReset();
    jiraGetMock.mockReset();
  });

  it('creates a subtask and returns the new issue (no fields in response)', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { accountId: 'user-123', displayName: 'Test User' },
    });

    // Real Jira POST /rest/api/3/issue response — only {id, key, self}, NO fields
    jiraPostMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { id: '999', key: 'PROJ-124' },
    });

    const result = await createSubtask('PROJ-123', 'My subtask');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.key).toBe('PROJ-124');
      expect(result.value.id).toBe('999');
      // summary is echoed from the user input, not from the response
      expect(result.value.summary).toBe('My subtask');
    }

    const postArgs = jiraPostMock.mock.calls[0]!;
    const body = postArgs[1] as { fields: Record<string, unknown> };
    expect(body.fields.project).toEqual({ key: 'PROJ' });
    expect(body.fields.issuetype).toEqual({ name: 'Sub-task' });
    expect(body.fields.parent).toEqual({ key: 'PROJ-123' });
    expect(body.fields.summary).toBe('My subtask');
    expect(body.fields.assignee).toEqual({ accountId: 'user-123' });
  });

  it('returns auth-expired when myself call fails', async () => {
    jiraGetMock.mockResolvedValueOnce({ kind: 'auth-expired' });

    const result = await createSubtask('PROJ-123', 'Test');
    expect(result.kind).toBe('auth-expired');
    expect(jiraPostMock).not.toHaveBeenCalled();
  });

  it('passes through post errors', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { accountId: 'user-123', displayName: 'Test User' },
    });

    jiraPostMock.mockResolvedValueOnce({
      kind: 'forbidden',
    });

    const result = await createSubtask('PROJ-123', 'Test');
    expect(result.kind).toBe('forbidden');
  });

  it('derives project key from parent key', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { accountId: 'user-123', displayName: 'Test User' },
    });

    jiraPostMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { id: '1', key: 'LONGPROJ-1' },
    });

    await createSubtask('LONGPROJ-456', 'Sub');
    const body = jiraPostMock.mock.calls[0]![1] as { fields: Record<string, unknown> };
    expect(body.fields.project).toEqual({ key: 'LONGPROJ' });
  });

  it('returns parse-error if response has unexpected shape', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { accountId: 'user-123', displayName: 'Test User' },
    });

    jiraPostMock.mockResolvedValueOnce({
      kind: 'parse-error',
      issue: 'missing key',
    });

    const result = await createSubtask('PROJ-123', 'Test');
    expect(result.kind).toBe('parse-error');
  });
});
