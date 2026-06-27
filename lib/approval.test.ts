import { describe, it, expect, vi } from 'vitest';
import { adfToText } from '@/lib/adf';
import { computeChecksum } from '@/lib/checksum';
import { parseApprovalComment } from '@/lib/comment-schema';
import type { JiraError } from '@/lib/result';

// approveCycle injects `postComment`/`enqueue` in every test, but importing the
// module pulls in `@/lib/storage/outbox` (which calls storage.defineItem at load
// against the unmocked wxt chrome API). Mock both network/storage boundaries so
// the unit test never touches chrome.storage — the injected deps are what's
// exercised. (5-4 learned an unmocked storage boundary leaks unhandled
// rejections after the module mounts.)
vi.mock('@/lib/jira-client', () => ({ postComment: vi.fn() }));
vi.mock('@/lib/storage/outbox', () => ({ enqueue: vi.fn() }));

const { approveCycle, buildApprovalBody } = await import('@/lib/approval');
type TouchedEpic = import('@/lib/approval').TouchedEpic;

// crypto.subtle.digest is needed by computeChecksum — Node provides it on the
// global `crypto`. jsdom env exposes it; assert it is present.
describe('buildApprovalBody (pure payload builder)', () => {
  it('nests the serialized approval under `body` as a single-paragraph ADF doc', async () => {
    const body = await buildApprovalBody({
      user: 'u1',
      cycle: '2026-05',
      by: 'mgr',
      at: '2026-06-27T10:00:00.000Z',
      restrictedCount: 0,
    });
    expect(body.body.type).toBe('doc');
    expect(body.body.version).toBe(1);
    const text = adfToText(body.body);
    expect(text).toContain('[[JIRA-TIME-LOGGER:APPROVAL:v=1]]');
  });

  it('round-trips through parseApprovalComment with a verifying checksum', async () => {
    const body = await buildApprovalBody({
      user: 'report-1',
      cycle: '2026-05',
      by: 'manager-9',
      at: '2026-06-27T10:00:00.000Z',
      restrictedCount: 2,
    });
    const parsed = await parseApprovalComment(adfToText(body.body));
    expect(parsed.kind).toBe('ok');
    if (parsed.kind === 'ok') {
      expect(parsed.value.user).toBe('report-1');
      expect(parsed.value.cycle).toBe('2026-05');
      expect(parsed.value.by).toBe('manager-9');
      expect(parsed.value.at).toBe('2026-06-27T10:00:00.000Z');
      expect(parsed.value.restrictedCount).toBe(2);
    }
  });

  it('embeds the per-Epic restrictedCount into the checksummed payload', async () => {
    const body = await buildApprovalBody({
      user: 'u',
      cycle: 'c',
      by: 'm',
      at: 'at',
      restrictedCount: 5,
    });
    const text = adfToText(body.body);
    const json = JSON.parse(text.split('\n')[1]!);
    expect(json.restrictedCount).toBe(5);
    // The embedded checksum must match a recompute over the canonical fields.
    const expected = await computeChecksum({
      v: 1,
      user: 'u',
      cycle: 'c',
      by: 'm',
      at: 'at',
      restrictedCount: 5,
    });
    expect(json.checksum).toBe(expected);
  });
});

// --- Fan-out orchestration ------------------------------------------------

const FIXED_AT = '2026-06-27T12:00:00.000Z';

function okComment() {
  return { kind: 'ok' as const, value: { id: 'c', created: FIXED_AT, body: {} } };
}

function err(kind: JiraError['kind']): JiraError {
  if (kind === 'network') return { kind: 'network', cause: 'offline' };
  if (kind === 'rate-limited') return { kind: 'rate-limited', retryAfterMs: 1000 };
  if (kind === 'parse-error') return { kind: 'parse-error', issue: 'x' };
  return { kind } as JiraError;
}

function epics(...keys: Array<[string, number]>): TouchedEpic[] {
  return keys.map(([epicKey, restrictedCount]) => ({ epicKey, restrictedCount }));
}

const baseInput = {
  user: 'report-1',
  cycle: '2026-05',
  by: 'manager-9',
};

describe('approveCycle fan-out', () => {
  it('all-success: every Epic confirmed, nothing failed/enqueued', async () => {
    const postComment = vi.fn(async () => okComment());
    const enqueue = vi.fn();
    const result = await approveCycle(
      { ...baseInput, epics: epics(['EP-1', 0], ['EP-2', 0], ['EP-3', 1]) },
      { postComment: postComment as never, enqueue: enqueue as never, now: () => FIXED_AT },
    );
    expect(result.confirmed).toEqual(['EP-1', 'EP-2', 'EP-3']);
    expect(result.failed).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
    expect(postComment).toHaveBeenCalledTimes(3);
  });

  it('single-Epic success', async () => {
    const postComment = vi.fn(async () => okComment());
    const result = await approveCycle(
      { ...baseInput, epics: epics(['EP-1', 0]) },
      { postComment: postComment as never, enqueue: vi.fn() as never, now: () => FIXED_AT },
    );
    expect(result.confirmed).toEqual(['EP-1']);
  });

  it('empty touched-set guard: no posts, empty result', async () => {
    const postComment = vi.fn(async () => okComment());
    const enqueue = vi.fn();
    const result = await approveCycle(
      { ...baseInput, epics: [] },
      { postComment: postComment as never, enqueue: enqueue as never, now: () => FIXED_AT },
    );
    expect(result.confirmed).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(postComment).not.toHaveBeenCalled();
  });

  it('PTO Epic in the set is approved like any other (no special-casing)', async () => {
    const postComment = vi.fn(async () => okComment());
    const result = await approveCycle(
      { ...baseInput, epics: epics(['EP-1', 0], ['PTO-CATCHALL', 0]) },
      { postComment: postComment as never, enqueue: vi.fn() as never, now: () => FIXED_AT },
    );
    expect(result.confirmed).toEqual(['EP-1', 'PTO-CATCHALL']);
  });

  it('dedupes a repeated epicKey: posts once, confirmed never exceeds the unique set', async () => {
    const postComment = vi.fn(async () => okComment());
    const enqueue = vi.fn();
    const result = await approveCycle(
      { ...baseInput, epics: epics(['EP-1', 0], ['EP-1', 0], ['EP-2', 0]) },
      { postComment: postComment as never, enqueue: enqueue as never, now: () => FIXED_AT },
    );
    expect(postComment).toHaveBeenCalledTimes(2);
    expect(result.confirmed).toEqual(['EP-1', 'EP-2']);
    expect(result.failed).toEqual([]);
  });

  it('partial: retryable failures enqueue; confirmed/failed sets are disjoint', async () => {
    // EP-1 ok, EP-2 network (retryable→enqueue), EP-3 ok, EP-4 rate-limited→enqueue
    const postComment = vi
      .fn()
      .mockResolvedValueOnce(okComment())
      .mockResolvedValueOnce(err('network'))
      .mockResolvedValueOnce(okComment())
      .mockResolvedValueOnce(err('rate-limited'));
    const enqueue = vi.fn(async (_input: unknown) => ({}));
    const result = await approveCycle(
      { ...baseInput, epics: epics(['EP-1', 0], ['EP-2', 0], ['EP-3', 0], ['EP-4', 0]) },
      { postComment: postComment as never, enqueue: enqueue as never, now: () => FIXED_AT },
    );
    expect(result.confirmed).toEqual(['EP-1', 'EP-3']);
    expect(result.failed.map((f) => f.epicKey)).toEqual(['EP-2', 'EP-4']);
    expect(result.failed.every((f) => f.enqueued)).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(2);
    // The enqueued op is a `comment` kind carrying the prebuilt body.
    const call = enqueue.mock.calls[0]![0] as {
      kind: string;
      issueKey: string;
      body: { body: { type: string } };
    };
    expect(call.kind).toBe('comment');
    expect(call.issueKey).toBe('EP-2');
    expect(call.body.body.type).toBe('doc');
  });

  it('no first-failure abort: EP-2 fails, EP-3+ still attempt', async () => {
    const postComment = vi
      .fn()
      .mockResolvedValueOnce(okComment())
      .mockResolvedValueOnce(err('network'))
      .mockResolvedValueOnce(okComment());
    const result = await approveCycle(
      { ...baseInput, epics: epics(['EP-1', 0], ['EP-2', 0], ['EP-3', 0]) },
      { postComment: postComment as never, enqueue: vi.fn(async () => ({})) as never, now: () => FIXED_AT },
    );
    expect(postComment).toHaveBeenCalledTimes(3);
    expect(result.confirmed).toEqual(['EP-1', 'EP-3']);
  });

  it('terminal failure (forbidden) is recorded WITHOUT enqueue', async () => {
    const postComment = vi.fn().mockResolvedValueOnce(err('forbidden'));
    const enqueue = vi.fn();
    const result = await approveCycle(
      { ...baseInput, epics: epics(['EP-1', 0]) },
      { postComment: postComment as never, enqueue: enqueue as never, now: () => FIXED_AT },
    );
    expect(result.confirmed).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.enqueued).toBe(false);
    expect(result.failed[0]!.error.kind).toBe('forbidden');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('terminal failure (not-found) is recorded WITHOUT enqueue', async () => {
    const postComment = vi.fn().mockResolvedValueOnce(err('not-found'));
    const enqueue = vi.fn();
    const result = await approveCycle(
      { ...baseInput, epics: epics(['EP-1', 0]) },
      { postComment: postComment as never, enqueue: enqueue as never, now: () => FIXED_AT },
    );
    expect(result.failed[0]!.enqueued).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('shared-`at` invariant: every Epic body carries the SAME `at`', async () => {
    const bodies: string[] = [];
    const postComment = vi.fn(async (_key: string, b: { body: unknown }) => {
      bodies.push(adfToText(b.body));
      return okComment();
    });
    await approveCycle(
      { ...baseInput, epics: epics(['EP-1', 0], ['EP-2', 3]) },
      { postComment: postComment as never, enqueue: vi.fn() as never, now: () => FIXED_AT },
    );
    const ats = bodies.map((t) => JSON.parse(t.split('\n')[1]!).at);
    expect(ats).toEqual([FIXED_AT, FIXED_AT]);
  });

  it('uses the per-Epic restrictedCount in each Epic body', async () => {
    const seen: Array<{ key: string; restrictedCount: number }> = [];
    const postComment = vi.fn(async (key: string, b: { body: unknown }) => {
      const json = JSON.parse(adfToText(b.body).split('\n')[1]!);
      seen.push({ key, restrictedCount: json.restrictedCount });
      return okComment();
    });
    await approveCycle(
      { ...baseInput, epics: epics(['EP-1', 2], ['EP-2', 7]) },
      { postComment: postComment as never, enqueue: vi.fn() as never, now: () => FIXED_AT },
    );
    expect(seen).toEqual([
      { key: 'EP-1', restrictedCount: 2 },
      { key: 'EP-2', restrictedCount: 7 },
    ]);
  });

  it('user / cycle / by are exact in the built payloads', async () => {
    let captured: { user: string; cycle: string; by: string } | undefined;
    const postComment = vi.fn(async (_key: string, b: { body: unknown }) => {
      const json = JSON.parse(adfToText(b.body).split('\n')[1]!);
      captured = { user: json.user, cycle: json.cycle, by: json.by };
      return okComment();
    });
    await approveCycle(
      { user: 'U', cycle: 'C', by: 'B', epics: epics(['EP-1', 0]) },
      { postComment: postComment as never, enqueue: vi.fn() as never, now: () => FIXED_AT },
    );
    expect(captured).toEqual({ user: 'U', cycle: 'C', by: 'B' });
  });

  it('an unexpected throw from postComment is treated as retryable (enqueued)', async () => {
    const postComment = vi.fn().mockRejectedValueOnce(new Error('boom'));
    const enqueue = vi.fn(async () => ({}));
    const result = await approveCycle(
      { ...baseInput, epics: epics(['EP-1', 0]) },
      { postComment: postComment as never, enqueue: enqueue as never, now: () => FIXED_AT },
    );
    expect(result.failed[0]!.enqueued).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
