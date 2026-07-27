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

  it('maps issues to { key, summary, issueType } on success', async () => {
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
        { key: 'KNP-1', summary: 'Admin', issueType: null },
        { key: 'KNP-2', summary: 'Meetings', issueType: null },
      ]);
    }
  });

  it('builds the JQL search URL with NO issuetype filter (D-CA-2)', async () => {
    jiraGetMock.mockResolvedValueOnce({ kind: 'ok', value: { issues: [] } });

    await fetchCatchAllSubtasks('KNP');
    const calledPath = jiraGetMock.mock.calls[0]![0] as string;
    expect(calledPath).toContain('rest/api/3/search/jql?jql=');
    // D-CA-2: guessing issue-type names cannot work — they are per-project and
    // admin-defined, and a wrong guess fails SILENTLY as an empty dropdown.
    // Two guesses (`Sub-task`, then `IN ("Sub-task","Task")`) both returned
    // zero rows against a real project, so there is no type filter at all.
    expect(calledPath).toContain(
      encodeURIComponent('project = "KNP" ORDER BY updated DESC'),
    );
    // The regression that matters: any reintroduced type filter. Scoped to the
    // JQL only — `issuetype` legitimately appears in the `fields` projection,
    // so asserting over the whole URL would be permanently red.
    const jql = decodeURIComponent(
      new URLSearchParams(calledPath.split('?')[1]).get('jql') ?? '',
    );
    expect(jql).not.toContain('issuetype');
    // `issuetype` IS projected, so each option can be labelled with its type.
    expect(calledPath).toContain(encodeURIComponent('key,summary,issuetype'));
    expect(calledPath).toContain('maxResults=50');
  });

  it('returns issues of ANY type, each carrying its own issueType label', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: {
        issues: [
          { key: 'KNP-99', fields: { summary: 'PTO', issuetype: { name: 'Service Request' } } },
          { key: 'KNP-12', fields: { summary: 'Meetings', issuetype: { name: 'Task' } } },
        ],
      },
    });

    const result = await fetchCatchAllSubtasks('KNP');
    expect(result).toEqual({
      kind: 'ok',
      value: [
        { key: 'KNP-99', summary: 'PTO', issueType: 'Service Request' },
        { key: 'KNP-12', summary: 'Meetings', issueType: 'Task' },
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
