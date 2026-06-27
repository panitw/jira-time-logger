import { describe, it, expect } from 'vitest';
import type { ApprovalComment } from '@/lib/comment-schema';
import { isCycleDirty, approvalAtFor, type WorklogTimes } from '@/lib/dirty-detect';

const AT = '2026-06-15T12:00:00.000Z';
const AT_MS = Date.parse(AT);

function approval(over: Partial<ApprovalComment> = {}): ApprovalComment {
  return {
    v: 1,
    user: 'acct-1',
    cycle: '2026-06',
    by: 'mgr-1',
    at: AT,
    restrictedCount: 0,
    checksum: 'deadbeef',
    ...over,
  };
}

describe('isCycleDirty', () => {
  it('returns false when the cycle is clean (no worklog updated after approval)', () => {
    const worklogs: WorklogTimes[] = [
      { updated: '2026-06-14T08:00:00.000Z' },
      { updated: '2026-06-15T11:59:59.000Z' },
    ];
    expect(isCycleDirty(worklogs, AT)).toBe(false);
  });

  it('returns true when a single worklog was edited after approval (updated > at)', () => {
    const worklogs: WorklogTimes[] = [
      { updated: '2026-06-14T08:00:00.000Z' },
      { updated: '2026-06-15T12:00:00.001Z' },
    ];
    expect(isCycleDirty(worklogs, AT)).toBe(true);
  });

  it('treats updated === at as NOT dirty (strict >)', () => {
    const worklogs: WorklogTimes[] = [{ updated: new Date(AT_MS).toISOString() }];
    expect(isCycleDirty(worklogs, AT)).toBe(false);
  });

  it('returns false for a worklog updated strictly before the approval', () => {
    const worklogs: WorklogTimes[] = [{ updated: '2026-01-01T00:00:00.000Z' }];
    expect(isCycleDirty(worklogs, AT)).toBe(false);
  });

  it('returns false (unapproved, not dirty) when approvalAt is null', () => {
    const worklogs: WorklogTimes[] = [{ updated: '2099-01-01T00:00:00.000Z' }];
    expect(isCycleDirty(worklogs, null)).toBe(false);
  });

  it('returns false when approvalAt is undefined', () => {
    expect(isCycleDirty([{ updated: '2099-01-01T00:00:00.000Z' }], undefined)).toBe(false);
  });

  it('returns false when approvalAt is empty string', () => {
    expect(isCycleDirty([{ updated: '2099-01-01T00:00:00.000Z' }], '')).toBe(false);
  });

  it('returns false when approvalAt is unparseable (NaN)', () => {
    expect(isCycleDirty([{ updated: '2099-01-01T00:00:00.000Z' }], 'not-a-date')).toBe(false);
  });

  it('ignores a worklog with no updated field', () => {
    const worklogs: WorklogTimes[] = [{}, { updated: '2026-06-14T08:00:00.000Z' }];
    expect(isCycleDirty(worklogs, AT)).toBe(false);
  });

  it('ignores a worklog with an unparseable updated field', () => {
    const worklogs: WorklogTimes[] = [{ updated: 'garbage' }, { updated: '2099-01-01T00:00:00.000Z' }];
    // The garbage one is ignored, but the 2099 one is later → dirty.
    expect(isCycleDirty(worklogs, AT)).toBe(true);
    // With ONLY the garbage one, it is not dirty.
    expect(isCycleDirty([{ updated: 'garbage' }], AT)).toBe(false);
  });

  it('returns false for an empty worklog list', () => {
    expect(isCycleDirty([], AT)).toBe(false);
  });
});

describe('approvalAtFor', () => {
  it('returns the at of the exact (user, cycle) match', () => {
    const approvals = [approval({ user: 'acct-1', cycle: '2026-06', at: AT })];
    expect(approvalAtFor(approvals, 'acct-1', '2026-06')).toBe(AT);
  });

  it('returns null when no approval matches', () => {
    const approvals = [approval({ user: 'acct-1', cycle: '2026-06' })];
    expect(approvalAtFor(approvals, 'acct-1', '2026-05')).toBeNull();
    expect(approvalAtFor(approvals, 'acct-2', '2026-06')).toBeNull();
  });

  it('ignores a different user approval on the same Epic/cycle (FR41)', () => {
    const approvals = [
      approval({ user: 'acct-2', cycle: '2026-06', at: '2099-01-01T00:00:00.000Z' }),
    ];
    expect(approvalAtFor(approvals, 'acct-1', '2026-06')).toBeNull();
  });

  it('returns null for an empty approvals list', () => {
    expect(approvalAtFor([], 'acct-1', '2026-06')).toBeNull();
  });

  it('picks the latest at when (defensively) two records match the same (user, cycle)', () => {
    const earlier = '2026-06-10T00:00:00.000Z';
    const later = '2026-06-20T00:00:00.000Z';
    const approvals = [
      approval({ user: 'acct-1', cycle: '2026-06', at: earlier }),
      approval({ user: 'acct-1', cycle: '2026-06', at: later }),
    ];
    expect(approvalAtFor(approvals, 'acct-1', '2026-06')).toBe(later);
    // Order-independent.
    expect(approvalAtFor([...approvals].reverse(), 'acct-1', '2026-06')).toBe(later);
  });

  it('keeps a parseable at over an unparseable one when both match', () => {
    const good = '2026-06-20T00:00:00.000Z';
    const approvals = [
      approval({ user: 'acct-1', cycle: '2026-06', at: 'garbage' }),
      approval({ user: 'acct-1', cycle: '2026-06', at: good }),
    ];
    expect(approvalAtFor(approvals, 'acct-1', '2026-06')).toBe(good);
  });
});
