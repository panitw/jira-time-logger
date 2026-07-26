import { describe, it, expect, vi, beforeEach } from 'vitest';

const jiraGetMock = vi.fn();

vi.mock('@/lib/jira-client', () => ({
  jiraGet: (...args: unknown[]) => jiraGetMock(...args),
}));

const { searchTickets } = await import('./ticket-search');

describe('searchTickets', () => {
  beforeEach(() => {
    jiraGetMock.mockReset();
  });

  it('searches by key when query looks like a ticket key (unwidened — default call)', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { issues: [{ id: '1', key: 'PROJ-123', fields: { summary: 'Test' } }] },
    });

    const result = await searchTickets('PROJ-123');
    expect(result.kind).toBe('ok');

    const calledPath = jiraGetMock.mock.calls[0]![0] as string;
    expect(calledPath).toContain('key%20%3D%20%22PROJ-123%22');
  });

  // ---- D-7.4-15 (Finding 1): the widened branch is an explicit OPT-IN, and
  // any caller that does not pass `{ widen: true }` gets the byte-identical
  // `dfccf5a` query. The absence of any JQL assertion is exactly what let
  // the widened JQL leak into `TicketPicker` in the first place — these
  // tests assert the exact string for BOTH branches.
  describe('D-7.4-15: the widened JQL is opt-in only, and the default is byte-identical to dfccf5a', () => {
    it('default call (no options): fields=key,summary and the CONSERVATIVE text JQL — byte-identical to dfccf5a', async () => {
      jiraGetMock.mockResolvedValueOnce({ kind: 'ok', value: { issues: [] } });
      await searchTickets('auth review');

      const calledPath = jiraGetMock.mock.calls[0]![0] as string;
      const jqlParam = decodeURIComponent(calledPath.match(/jql=([^&]+)/)![1]!);
      // This is the EXACT string `dfccf5a`'s `searchTickets` produced.
      expect(jqlParam).toBe(
        'summary ~ "auth review" AND statusCategory != Done AND updated >= -28d',
      );
      expect(calledPath).toContain(`fields=${encodeURIComponent('key,summary')}`);
    });

    it('`{ widen: false }` explicitly: identical to the default (no options) call', async () => {
      jiraGetMock.mockResolvedValueOnce({ kind: 'ok', value: { issues: [] } });
      await searchTickets('auth review', { widen: false });

      const calledPath = jiraGetMock.mock.calls[0]![0] as string;
      const jqlParam = decodeURIComponent(calledPath.match(/jql=([^&]+)/)![1]!);
      expect(jqlParam).toBe(
        'summary ~ "auth review" AND statusCategory != Done AND updated >= -28d',
      );
      expect(calledPath).toContain(`fields=${encodeURIComponent('key,summary')}`);
    });

    it('`{ widen: true }`: fields widened and the JQL is `text ~` with no status/recency clause', async () => {
      jiraGetMock.mockResolvedValueOnce({ kind: 'ok', value: { issues: [] } });
      await searchTickets('auth review', { widen: true });

      const calledPath = jiraGetMock.mock.calls[0]![0] as string;
      const jqlParam = decodeURIComponent(calledPath.match(/jql=([^&]+)/)![1]!);
      expect(jqlParam).toBe('text ~ "auth review"');
      expect(calledPath).toContain(
        `fields=${encodeURIComponent('key,summary,issuetype,assignee,status,updated')}`,
      );
    });

    it('key-exact JQL is identical in both branches (only the text-query branch differs)', async () => {
      jiraGetMock.mockResolvedValueOnce({ kind: 'ok', value: { issues: [] } });
      await searchTickets('PROJ-123', { widen: true });
      const widenedPath = jiraGetMock.mock.calls[0]![0] as string;

      jiraGetMock.mockResolvedValueOnce({ kind: 'ok', value: { issues: [] } });
      await searchTickets('PROJ-123');
      const conservativePath = jiraGetMock.mock.calls[1]![0] as string;

      const widenedJql = decodeURIComponent(widenedPath.match(/jql=([^&]+)/)![1]!);
      const conservativeJql = decodeURIComponent(conservativePath.match(/jql=([^&]+)/)![1]!);
      expect(widenedJql).toBe(conservativeJql);
      expect(widenedJql).toBe('key = "PROJ-123"');
    });

    // The literal claim from D-7.4-15: "TicketPicker's query must be
    // byte-identical to commit dfccf5a." This is the byte-for-byte proof —
    // the exact URL `dfccf5a`'s `searchTickets('auth review')` produced,
    // reconstructed from that commit's own source and diffed against
    // today's default-call output.
    it('the full request URL for a default (unwidened) call is byte-identical to what dfccf5a produced', async () => {
      const DFCCF5A_MAX_RESULTS = 20;
      const dfccf5aJql =
        'summary ~ "auth review" AND statusCategory != Done AND updated >= -28d';
      const dfccf5aFields = 'key,summary';
      const dfccf5aUrl = `rest/api/3/search/jql?jql=${encodeURIComponent(
        dfccf5aJql,
      )}&maxResults=${DFCCF5A_MAX_RESULTS}&fields=${encodeURIComponent(dfccf5aFields)}`;

      jiraGetMock.mockResolvedValueOnce({ kind: 'ok', value: { issues: [] } });
      await searchTickets('auth review');
      const calledPath = jiraGetMock.mock.calls[0]![0] as string;

      expect(calledPath).toBe(dfccf5aUrl);
    });
  });

  it('round-trips an issue with an assignee (accountId + displayName) and issuetype.subtask (widened)', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: {
        issues: [
          {
            id: '3',
            key: 'PROJ-789',
            fields: {
              summary: 'Fix the flaky test',
              issuetype: { id: '10001', name: 'Subtask', subtask: true },
              assignee: { accountId: 'acc-1', displayName: 'Anucha P.' },
            },
          },
        ],
      },
    });

    const result = await searchTickets('flaky', { widen: true });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value[0]!.fields.assignee).toEqual({
        accountId: 'acc-1',
        displayName: 'Anucha P.',
      });
      expect(result.value[0]!.fields.issuetype?.subtask).toBe(true);
    }
  });

  it('parses an issue with no assignee (the field is optional, widened)', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: {
        issues: [
          {
            id: '4',
            key: 'PROJ-999',
            fields: { summary: 'Unassigned work', issuetype: { id: '1', name: 'Task' } },
          },
        ],
      },
    });

    const result = await searchTickets('unassigned', { widen: true });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value[0]!.fields.assignee).toBeUndefined();
    }
  });

  it('returns empty array when no results', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { issues: [] },
    });

    const result = await searchTickets('nonexistent');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual([]);
    }
  });

  it('empty query short-circuits without a request', async () => {
    const result = await searchTickets('   ');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual([]);
    }
    expect(jiraGetMock).not.toHaveBeenCalled();
  });

  it('passes through error results', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'network',
      cause: 'offline',
    });

    const result = await searchTickets('test');
    expect(result.kind).toBe('network');
  });
});
