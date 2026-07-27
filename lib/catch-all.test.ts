import { describe, it, expect, vi, beforeEach } from 'vitest';

const jiraGetMock = vi.fn();

vi.mock('@/lib/jira-client', () => ({
  jiraGet: (...args: unknown[]) => jiraGetMock(...args),
}));

const { fetchCatchAllSubtasks } = await import('./catch-all');

describe('fetchCatchAllSubtasks', () => {
  beforeEach(() => {
    jiraGetMock.mockReset();
  });

  it('maps issues to { key, summary } on success', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: {
        issues: [
          { id: '1', key: 'KNP-1', fields: { summary: 'Admin' } },
          { id: '2', key: 'KNP-2', fields: { summary: 'Meetings' } },
        ],
      },
    });

    const result = await fetchCatchAllSubtasks('KNP');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual([
        { key: 'KNP-1', summary: 'Admin' },
        { key: 'KNP-2', summary: 'Meetings' },
      ]);
    }
  });

  it('builds the JQL search URL using /rest/api/3/search/jql, accepting Sub-task AND Task', async () => {
    jiraGetMock.mockResolvedValueOnce({ kind: 'ok', value: { issues: [] } });

    await fetchCatchAllSubtasks('KNP');
    const calledPath = jiraGetMock.mock.calls[0]![0] as string;
    expect(calledPath).toContain('rest/api/3/search/jql?jql=');
    // D-CA-1: `Sub-task` alone returned zero rows for a real catch-all project
    // built from Tasks, so the time-off ticket could never be configured and
    // "Mark today as time off" was permanently unavailable. Asserting the exact
    // JQL, not just a substring — a `toContain('Sub-task')` would still pass if
    // `Task` were dropped again, since "Sub-task" contains "Task".
    expect(calledPath).toContain(
      encodeURIComponent('project = "KNP" AND issuetype IN ("Sub-task", "Task")'),
    );
    expect(calledPath).toContain('maxResults=50');
  });

  it('returns Task-typed catch-all issues, not only Sub-tasks', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: {
        issues: [
          { key: 'KNP-99', fields: { summary: 'PTO' } },
          { key: 'KNP-12', fields: { summary: 'Meetings' } },
        ],
      },
    });

    const result = await fetchCatchAllSubtasks('KNP');
    expect(result).toEqual({
      kind: 'ok',
      value: [
        { key: 'KNP-99', summary: 'PTO' },
        { key: 'KNP-12', summary: 'Meetings' },
      ],
    });
  });

  it('short-circuits to [] without an HTTP call when project key is blank', async () => {
    const result = await fetchCatchAllSubtasks('   ');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual([]);
    }
    expect(jiraGetMock).not.toHaveBeenCalled();
  });

  it('surfaces a rate-limited Result', async () => {
    jiraGetMock.mockResolvedValueOnce({ kind: 'rate-limited', retryAfterMs: 1000 });
    const result = await fetchCatchAllSubtasks('KNP');
    expect(result.kind).toBe('rate-limited');
  });

  it('surfaces a parse-error Result', async () => {
    jiraGetMock.mockResolvedValueOnce({ kind: 'parse-error', issue: 'bad' });
    const result = await fetchCatchAllSubtasks('KNP');
    expect(result.kind).toBe('parse-error');
  });

  it('returns [] when the issues array is empty', async () => {
    jiraGetMock.mockResolvedValueOnce({ kind: 'ok', value: { issues: [] } });
    const result = await fetchCatchAllSubtasks('KNP');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual([]);
    }
  });
});
