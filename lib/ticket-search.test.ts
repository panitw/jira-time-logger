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

  it('searches by key when query looks like a ticket key', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { issues: [{ id: '1', key: 'PROJ-123', fields: { summary: 'Test' } }] },
    });

    const result = await searchTickets('PROJ-123');
    expect(result.kind).toBe('ok');

    const calledPath = jiraGetMock.mock.calls[0]![0] as string;
    expect(calledPath).toContain('key%20%3D%20%22PROJ-123%22');
  });

  it('searches by summary for text queries', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'ok',
      value: { issues: [{ id: '2', key: 'PROJ-456', fields: { summary: 'Auth review' } }] },
    });

    const result = await searchTickets('auth review');
    expect(result.kind).toBe('ok');

    const calledPath = jiraGetMock.mock.calls[0]![0] as string;
    expect(calledPath).toContain('summary%20~%20%22auth%20review%22');
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

  it('passes through error results', async () => {
    jiraGetMock.mockResolvedValueOnce({
      kind: 'network',
      cause: 'offline',
    });

    const result = await searchTickets('test');
    expect(result.kind).toBe('network');
  });
});
