import { describe, it, expect, vi, beforeEach } from 'vitest';
import { textToAdf } from './adf';
import { computeChecksum } from './checksum';
import { serializeApproval, type ApprovalCommentV1 } from './comment-schema';
import { isOk } from './result';

// ---- Mock the jira-client boundary (mirrors lib/badge.test.ts pattern) ----
const jiraGetMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  jiraGet: (...args: unknown[]) => jiraGetMock(...args),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { findApprovalComments } = await import('./parser');

/** Build a valid v1 payload with a correct checksum. */
async function payload(
  overrides: Partial<Omit<ApprovalCommentV1, 'v' | 'checksum'>> = {},
): Promise<ApprovalCommentV1> {
  const base = {
    v: 1 as const,
    user: '557058:abc-123',
    cycle: '2026-05',
    by: '557058:mgr-999',
    at: '2026-05-31T09:00:00.000Z',
    restrictedCount: 3,
    ...overrides,
  };
  return { ...base, checksum: await computeChecksum(base) };
}

/** Build a Jira comment object whose ADF body is a real serialized approval. */
async function approvalComment(
  id: string,
  created: string,
  p: ApprovalCommentV1,
): Promise<{ id: string; created: string; body: unknown }> {
  return { id, created, body: textToAdf(serializeApproval(p)) };
}

function okList(comments: unknown[]): { kind: 'ok'; value: { comments: unknown[] } } {
  return { kind: 'ok', value: { comments } };
}

beforeEach(() => {
  jiraGetMock.mockReset();
});

describe('findApprovalComments — request shape', () => {
  it('fetches the Epic comment endpoint with url-encoded key + pagination params', async () => {
    jiraGetMock.mockResolvedValue(okList([]));
    await findApprovalComments('KNP-42');
    expect(jiraGetMock).toHaveBeenCalledWith(
      'rest/api/3/issue/KNP-42/comment?startAt=0&maxResults=100',
      expect.anything(),
    );
  });
});

describe('findApprovalComments — pagination', () => {
  it('walks every page and surfaces approvals beyond the first page', async () => {
    const onPage2 = await payload({ user: '557058:page2' });
    // Page 1: 100 non-approval comments, total reported as 101.
    const page1 = Array.from({ length: 100 }, (_unused, i) => ({
      id: `p1-${i}`,
      created: '2026-05-31T09:00:00.000+0000',
      body: textToAdf('ordinary comment'),
    }));
    jiraGetMock
      .mockResolvedValueOnce({ kind: 'ok', value: { comments: page1, total: 101 } })
      .mockResolvedValueOnce({
        kind: 'ok',
        value: {
          comments: [await approvalComment('p2', '2026-05-31T10:00:00.000+0000', onPage2)],
          total: 101,
        },
      });
    const result = await findApprovalComments('KNP-1');
    expect(jiraGetMock).toHaveBeenCalledTimes(2);
    expect(jiraGetMock).toHaveBeenNthCalledWith(
      2,
      'rest/api/3/issue/KNP-1/comment?startAt=100&maxResults=100',
      expect.anything(),
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.user).toBe('557058:page2');
    }
  });

  it('stops after a single short page when total is omitted', async () => {
    jiraGetMock.mockResolvedValue(okList([]));
    await findApprovalComments('KNP-1');
    expect(jiraGetMock).toHaveBeenCalledTimes(1);
  });
});

describe('findApprovalComments — JiraError propagation', () => {
  it('propagates a network error from the list fetch', async () => {
    jiraGetMock.mockResolvedValue({ kind: 'network', cause: 'boom' });
    const result = await findApprovalComments('KNP-1');
    expect(result).toEqual({ kind: 'network', cause: 'boom' });
  });

  it('propagates auth-expired', async () => {
    jiraGetMock.mockResolvedValue({ kind: 'auth-expired' });
    const result = await findApprovalComments('KNP-1');
    expect(result).toEqual({ kind: 'auth-expired' });
  });
});

describe('findApprovalComments — parsing & filtering', () => {
  it('returns verified approvals and drops non-approval comments', async () => {
    const p = await payload();
    jiraGetMock.mockResolvedValue(
      okList([
        { id: '1', created: '2026-05-31T09:00:00.000+0000', body: textToAdf('just a normal human comment') },
        await approvalComment('2', '2026-05-31T10:00:00.000+0000', p),
      ]),
    );
    const result = await findApprovalComments('KNP-1');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toEqual(p);
    }
  });

  it('drops a corrupted (checksum-mismatch) approval comment but keeps the call ok', async () => {
    const good = await payload({ user: '557058:good' });
    // Tamper the serialized body so its checksum no longer matches.
    const tamperedBody = textToAdf(serializeApproval({ ...good, restrictedCount: 99, user: '557058:bad' }));
    jiraGetMock.mockResolvedValue(
      okList([
        await approvalComment('1', '2026-05-31T09:00:00.000+0000', good),
        { id: '2', created: '2026-05-31T10:00:00.000+0000', body: tamperedBody },
      ]),
    );
    const result = await findApprovalComments('KNP-1');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.user).toBe('557058:good');
    }
  });

  it('drops an unknown-version comment', async () => {
    jiraGetMock.mockResolvedValue(
      okList([
        { id: '1', created: '2026-05-31T09:00:00.000+0000', body: textToAdf('[[JIRA-TIME-LOGGER:APPROVAL:v=2]]\n{"v":2}') },
      ]),
    );
    const result = await findApprovalComments('KNP-1');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toHaveLength(0);
  });
});

describe('findApprovalComments — newest-wins per (user, cycle)', () => {
  it('keeps only the latest of 2 duplicate approvals (same user+cycle)', async () => {
    const older = await payload({ at: '2026-05-31T08:00:00.000Z', restrictedCount: 1 });
    const newer = await payload({ at: '2026-05-31T12:00:00.000Z', restrictedCount: 5 });
    jiraGetMock.mockResolvedValue(
      okList([
        await approvalComment('1', '2026-05-31T08:00:00.000+0000', older),
        await approvalComment('2', '2026-05-31T12:00:00.000+0000', newer),
      ]),
    );
    const result = await findApprovalComments('KNP-1');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.restrictedCount).toBe(5);
    }
  });

  it('keeps the latest of 3 duplicates regardless of input order', async () => {
    const a = await payload({ restrictedCount: 1 });
    const b = await payload({ restrictedCount: 2 });
    const c = await payload({ restrictedCount: 3 });
    jiraGetMock.mockResolvedValue(
      okList([
        await approvalComment('b', '2026-05-31T11:00:00.000+0000', b),
        await approvalComment('c', '2026-05-31T13:00:00.000+0000', c), // latest
        await approvalComment('a', '2026-05-31T09:00:00.000+0000', a),
      ]),
    );
    const result = await findApprovalComments('KNP-1');
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.restrictedCount).toBe(3);
    }
  });

  it('keeps the latest of 5 duplicates', async () => {
    const comments = [];
    for (let i = 0; i < 5; i++) {
      const p = await payload({ restrictedCount: i });
      const hour = String(9 + i).padStart(2, '0');
      comments.push(await approvalComment(`c${i}`, `2026-05-31T${hour}:00:00.000+0000`, p));
    }
    jiraGetMock.mockResolvedValue(okList(comments));
    const result = await findApprovalComments('KNP-1');
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.restrictedCount).toBe(4); // i=4 had the latest hour
    }
  });

  it('keeps the first-encountered entry on equal Jira created timestamps', async () => {
    const first = await payload({ restrictedCount: 1 });
    const second = await payload({ restrictedCount: 2 });
    const ts = '2026-05-31T09:00:00.000+0000';
    jiraGetMock.mockResolvedValue(
      okList([await approvalComment('1', ts, first), await approvalComment('2', ts, second)]),
    );
    const result = await findApprovalComments('KNP-1');
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.restrictedCount).toBe(1); // first wins on a tie
    }
  });

  it('treats an unparseable created as oldest even when it appears first', async () => {
    const garbage = await payload({ restrictedCount: 1 });
    const valid = await payload({ restrictedCount: 2 });
    jiraGetMock.mockResolvedValue(
      okList([
        await approvalComment('1', 'not-a-date', garbage), // NaN, encountered first
        await approvalComment('2', '2026-05-31T10:00:00.000+0000', valid),
      ]),
    );
    const result = await findApprovalComments('KNP-1');
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.restrictedCount).toBe(2); // valid timestamp wins
    }
  });

  it('uses Jira created (not payload at) as the tiebreaker', async () => {
    // payload `at` says the SECOND is older, but Jira `created` says it is newer.
    const first = await payload({ at: '2026-05-31T23:00:00.000Z', restrictedCount: 1 });
    const second = await payload({ at: '2026-05-31T01:00:00.000Z', restrictedCount: 2 });
    jiraGetMock.mockResolvedValue(
      okList([
        await approvalComment('1', '2026-05-31T08:00:00.000+0000', first),
        await approvalComment('2', '2026-05-31T20:00:00.000+0000', second), // newer created
      ]),
    );
    const result = await findApprovalComments('KNP-1');
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.restrictedCount).toBe(2);
    }
  });
});

describe('findApprovalComments — multi-key coexistence', () => {
  it('keeps approvals for two distinct users on the same Epic', async () => {
    const userA = await payload({ user: '557058:alice' });
    const userB = await payload({ user: '557058:bob' });
    jiraGetMock.mockResolvedValue(
      okList([
        await approvalComment('1', '2026-05-31T09:00:00.000+0000', userA),
        await approvalComment('2', '2026-05-31T10:00:00.000+0000', userB),
      ]),
    );
    const result = await findApprovalComments('KNP-1');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(2);
      expect(new Set(result.value.map((a) => a.user))).toEqual(
        new Set(['557058:alice', '557058:bob']),
      );
    }
  });

  it('keeps approvals for the same user across two distinct cycles', async () => {
    const may = await payload({ cycle: '2026-05' });
    const jun = await payload({ cycle: '2026-06' });
    jiraGetMock.mockResolvedValue(
      okList([
        await approvalComment('1', '2026-05-31T09:00:00.000+0000', may),
        await approvalComment('2', '2026-06-30T09:00:00.000+0000', jun),
      ]),
    );
    const result = await findApprovalComments('KNP-1');
    if (isOk(result)) {
      expect(result.value).toHaveLength(2);
      expect(new Set(result.value.map((a) => a.cycle))).toEqual(new Set(['2026-05', '2026-06']));
    }
  });
});
