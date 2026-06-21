import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/jira-client', () => ({
  jiraGet: vi.fn(),
}));

vi.mock('@/lib/storage/settings', () => ({
  getManagerNames: vi.fn(),
  setManagerNames: vi.fn(),
}));

const { jiraGet } = await import('@/lib/jira-client');
const { getManagerNames } = await import('@/lib/storage/settings');
const { fetchHierarchy } = await import('./hierarchy');

const jiraGetMock = vi.mocked(jiraGet);
const getManagerNamesMock = vi.mocked(getManagerNames);

function issue(
  key: string,
  summary: string,
  options?: {
    subtask?: boolean;
    parent?: { id: string; key: string; summary: string };
    assignee?: { accountId: string; displayName: string };
  },
) {
  return {
    id: `${key}-id`,
    key,
    fields: {
      summary,
      issuetype: options?.subtask
        ? { id: '5', name: 'Sub-task', subtask: true }
        : { id: '3', name: 'Task' },
      parent: options?.parent
        ? {
            id: options.parent.id,
            key: options.parent.key,
            fields: { summary: options.parent.summary },
          }
        : undefined,
      assignee: options?.assignee,
    },
  };
}

function searchResult(issues: ReturnType<typeof issue>[]) {
  return { issues };
}

function ok<T>(value: T) {
  return { kind: 'ok' as const, value };
}

function networkError(cause: string) {
  return { kind: 'network' as const, cause };
}

function parseError(issue: unknown) {
  return { kind: 'parse-error' as const, issue };
}

describe('fetchHierarchy', () => {
  beforeEach(() => {
    jiraGetMock.mockReset();
    getManagerNamesMock.mockReset();
  });

  it('fetches self, manager, and skip-level trees and merges them', async () => {
    getManagerNamesMock.mockResolvedValue({
      managerDisplayName: 'Marco Rivera',
      skipLevelDisplayName: 'Anika Patel',
      managerAccountId: 'm1',
      skipLevelAccountId: 's1',
    });

    jiraGetMock
      .mockResolvedValueOnce(
        ok(
          searchResult([
            issue('KNP-1', 'My task', {
              assignee: { accountId: 'w1', displayName: 'Worker' },
            }),
            issue('KNP-2', 'My subtask', {
              subtask: true,
              parent: { id: '1', key: 'KNP-1', summary: 'My task' },
              assignee: { accountId: 'w1', displayName: 'Worker' },
            }),
          ]),
        ),
      )
      .mockResolvedValueOnce(
        ok(
          searchResult([
            issue('KNP-3', "Manager's task", {
              assignee: { accountId: 'm1', displayName: 'Marco Rivera' },
            }),
          ]),
        ),
      )
      .mockResolvedValueOnce(
        ok(
          searchResult([
            issue('KNP-4', "Skip-level's task", {
              assignee: { accountId: 's1', displayName: 'Anika Patel' },
            }),
          ]),
        ),
      );

    const result = await fetchHierarchy();

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.value).toHaveLength(3);
    expect(result.value.map((t) => t.key)).toEqual(
      expect.arrayContaining(['KNP-1', 'KNP-3', 'KNP-4']),
    );

    const selfTask = result.value.find((t) => t.key === 'KNP-1');
    expect(selfTask).toMatchObject({
      key: 'KNP-1',
      summary: 'My task',
      source: 'self',
      assigneeDisplayName: 'Worker',
      subtasks: [{ key: 'KNP-2', summary: 'My subtask', assigneeDisplayName: 'Worker' }],
    });

    const managerTask = result.value.find((t) => t.key === 'KNP-3');
    expect(managerTask).toMatchObject({
      key: 'KNP-3',
      summary: "Manager's task",
      source: 'manager',
      assigneeDisplayName: 'Marco Rivera',
      subtasks: [],
    });

    const skipTask = result.value.find((t) => t.key === 'KNP-4');
    expect(skipTask).toMatchObject({
      key: 'KNP-4',
      summary: "Skip-level's task",
      source: 'skip-level',
      assigneeDisplayName: 'Anika Patel',
      subtasks: [],
    });
  });

  it('prefers self source when the same task appears from manager', async () => {
    getManagerNamesMock.mockResolvedValue({
      managerDisplayName: 'Marco Rivera',
      skipLevelDisplayName: null,
      managerAccountId: 'm1',
      skipLevelAccountId: null,
    });

    jiraGetMock
      .mockResolvedValueOnce(
        ok(
          searchResult([
            issue('KNP-1', 'My task view', {
              assignee: { accountId: 'w1', displayName: 'Worker' },
            }),
          ]),
        ),
      )
      .mockResolvedValueOnce(
        ok(
          searchResult([
            issue('KNP-1', "Manager's task view", {
              assignee: { accountId: 'm1', displayName: 'Marco Rivera' },
            }),
          ]),
        ),
      );

    const result = await fetchHierarchy();

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      source: 'self',
      summary: 'My task view',
      assigneeDisplayName: 'Worker',
    });
  });

  it('only runs self lookup when manager and skip-level are unset', async () => {
    getManagerNamesMock.mockResolvedValue({
      managerDisplayName: null,
      skipLevelDisplayName: null,
      managerAccountId: null,
      skipLevelAccountId: null,
    });

    jiraGetMock.mockResolvedValueOnce(
      ok(searchResult([issue('KNP-1', 'My task')])),
    );

    const result = await fetchHierarchy();

    expect(result.kind).toBe('ok');
    expect(jiraGetMock).toHaveBeenCalledTimes(1);
    expect(jiraGetMock.mock.calls[0]![0]).toContain(
      'assignee%20%3D%20currentUser()',
    );
  });

  it('skips skip-level lookup when skip-level account ID is unset', async () => {
    getManagerNamesMock.mockResolvedValue({
      managerDisplayName: 'Marco Rivera',
      skipLevelDisplayName: null,
      managerAccountId: 'm1',
      skipLevelAccountId: null,
    });

    jiraGetMock
      .mockResolvedValueOnce(ok(searchResult([issue('KNP-1', 'My task')])))
      .mockResolvedValueOnce(ok(searchResult([issue('KNP-3', "Manager's task")])));

    const result = await fetchHierarchy();

    expect(result.kind).toBe('ok');
    expect(jiraGetMock).toHaveBeenCalledTimes(2);
  });

  it('returns the self-lookup error when JQL fails', async () => {
    getManagerNamesMock.mockResolvedValue({
      managerDisplayName: null,
      skipLevelDisplayName: null,
      managerAccountId: null,
      skipLevelAccountId: null,
    });

    jiraGetMock.mockResolvedValueOnce(networkError('HTTP 400: JQL syntax error'));

    const result = await fetchHierarchy();

    expect(result.kind).toBe('network');
    if (result.kind !== 'network') return;
    expect(result.cause).toBe('HTTP 400: JQL syntax error');
  });

  it('returns parse-error when Jira response is malformed', async () => {
    getManagerNamesMock.mockResolvedValue({
      managerDisplayName: null,
      skipLevelDisplayName: null,
      managerAccountId: null,
      skipLevelAccountId: null,
    });

    jiraGetMock.mockResolvedValueOnce(parseError('missing issues array'));

    const result = await fetchHierarchy();

    expect(result.kind).toBe('parse-error');
  });

  it('creates a parent stub for worker-owned subtasks whose parent is missing', async () => {
    getManagerNamesMock.mockResolvedValue({
      managerDisplayName: null,
      skipLevelDisplayName: null,
      managerAccountId: null,
      skipLevelAccountId: null,
    });

    jiraGetMock.mockResolvedValueOnce(
      ok(
        searchResult([
          issue('KNP-2', 'My orphan subtask', {
            subtask: true,
            parent: { id: '1', key: 'KNP-1', summary: 'Missing parent' },
            assignee: { accountId: 'w1', displayName: 'Worker' },
          }),
        ]),
      ),
    );

    const result = await fetchHierarchy();

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      key: 'KNP-1',
      summary: 'Missing parent',
      source: 'self',
      assigneeDisplayName: null,
      subtasks: [{ key: 'KNP-2', summary: 'My orphan subtask' }],
    });
  });

  it('keeps Epic-parented Tasks at top level (subtask classification regression)', async () => {
    getManagerNamesMock.mockResolvedValue({
      managerDisplayName: null,
      skipLevelDisplayName: null,
      managerAccountId: null,
      skipLevelAccountId: null,
    });

    jiraGetMock.mockResolvedValueOnce(
      ok(
        searchResult([
          issue('KNP-1', 'Task under Epic', {
            subtask: false,
            parent: { id: 'epic-1', key: 'KNP-0', summary: 'Epic' },
            assignee: { accountId: 'w1', displayName: 'Worker' },
          }),
        ]),
      ),
    );

    const result = await fetchHierarchy();

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      key: 'KNP-1',
      summary: 'Task under Epic',
      source: 'self',
      subtasks: [],
    });
  });

  it('parses the real Jira `/search/jql` fields-nested shape', async () => {
    const { JiraHierarchyIssueSchema } = await import('@/lib/jira-types');
    const parsed = JiraHierarchyIssueSchema.safeParse({
      id: '1',
      key: 'KNP-1',
      fields: {
        summary: 'Task',
        issuetype: { id: '3', name: 'Task', subtask: false },
        parent: { id: '0', key: 'KNP-0', fields: { summary: 'Epic' } },
        assignee: { accountId: 'w1', displayName: 'Worker' },
      },
    });
    expect(parsed.success).toBe(true);
  });
});
