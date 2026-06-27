import { describe, it, expect } from 'vitest';
import { canonicalString, computeChecksum, verifyChecksum, type ChecksumPayload } from './checksum';

// A single pinned payload whose checksum is hard-coded below. If the canonical
// form (field order / delimiter / encoding) ever drifts, this golden assertion
// fails — that is the regression guard 5.4 (dirty-detect) and 5.6 (posting)
// depend on. DO NOT update GOLDEN_CHECKSUM without understanding that every
// previously-posted approval would then fail verification.
const PINNED: ChecksumPayload = {
  v: 1,
  user: '557058:abc-123',
  cycle: '2026-05',
  by: '557058:mgr-999',
  at: '2026-05-31T09:00:00.000Z',
  restrictedCount: 3,
};
const GOLDEN_CHECKSUM = 'f00a1c3b';

describe('canonicalString', () => {
  it('joins the six fields in fixed order with the unit separator', () => {
    const sep = String.fromCharCode(0x1f);
    expect(canonicalString(PINNED)).toBe(
      ['1', '557058:abc-123', '2026-05', '557058:mgr-999', '2026-05-31T09:00:00.000Z', '3'].join(sep),
    );
  });

  it('coerces numeric fields to plain string form (no locale formatting)', () => {
    const big: ChecksumPayload = { ...PINNED, restrictedCount: 1000 };
    expect(canonicalString(big)).toContain('1000'); // not "1,000"
  });
});

describe('computeChecksum', () => {
  it('produces the pinned golden checksum (byte-stability regression guard)', async () => {
    expect(await computeChecksum(PINNED)).toBe(GOLDEN_CHECKSUM);
  });

  it('returns exactly 8 lowercase hex characters', async () => {
    const cs = await computeChecksum(PINNED);
    expect(cs).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic across repeated calls', async () => {
    const a = await computeChecksum(PINNED);
    const b = await computeChecksum(PINNED);
    expect(a).toBe(b);
  });

  it('ignores an extra `checksum` field on the input object', async () => {
    const withChecksum = { ...PINNED, checksum: 'deadbeef' } as ChecksumPayload & { checksum: string };
    expect(await computeChecksum(withChecksum)).toBe(GOLDEN_CHECKSUM);
  });

  // Each tampered field must change the digest.
  const tampered: Array<[string, ChecksumPayload]> = [
    ['v', { ...PINNED, v: 2 }],
    ['user', { ...PINNED, user: '557058:other' }],
    ['cycle', { ...PINNED, cycle: '2026-06' }],
    ['by', { ...PINNED, by: '557058:mgr-000' }],
    ['at', { ...PINNED, at: '2026-05-31T09:00:01.000Z' }],
    ['restrictedCount', { ...PINNED, restrictedCount: 4 }],
  ];
  it.each(tampered)('changes when %s is tampered', async (_field, payload) => {
    expect(await computeChecksum(payload)).not.toBe(GOLDEN_CHECKSUM);
  });

  it('does not collide on adjacent-field shifting (delimiter prevents ambiguity)', async () => {
    // Without a delimiter, ("ab","c") and ("a","bc") would hash identically.
    const a = await computeChecksum({ ...PINNED, user: 'ab', cycle: 'c' });
    const b = await computeChecksum({ ...PINNED, user: 'a', cycle: 'bc' });
    expect(a).not.toBe(b);
  });
});

describe('verifyChecksum', () => {
  it('returns true for the canonical payload + its checksum', async () => {
    expect(await verifyChecksum(PINNED, GOLDEN_CHECKSUM)).toBe(true);
  });

  it('returns false for a wrong checksum', async () => {
    expect(await verifyChecksum(PINNED, '00000000')).toBe(false);
  });

  const tampered: Array<[string, ChecksumPayload]> = [
    ['v', { ...PINNED, v: 2 }],
    ['user', { ...PINNED, user: '557058:other' }],
    ['cycle', { ...PINNED, cycle: '2026-06' }],
    ['by', { ...PINNED, by: '557058:mgr-000' }],
    ['at', { ...PINNED, at: '2026-05-31T09:00:01.000Z' }],
    ['restrictedCount', { ...PINNED, restrictedCount: 4 }],
  ];
  it.each(tampered)('rejects a payload whose %s was tampered (checksum unchanged)', async (_f, payload) => {
    expect(await verifyChecksum(payload, GOLDEN_CHECKSUM)).toBe(false);
  });
});
