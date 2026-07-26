import { describe, it, expect } from 'vitest';
import { adfToText, textToAdf } from './adf';
import { computeChecksum } from './checksum';
import {
  APPROVAL_MARKER_V1,
  ApprovalCommentSchema,
  parseApprovalComment,
  serializeApproval,
  type ApprovalCommentV1,
} from './comment-schema';
import { isOk } from './result';

/** Build a fully-valid v1 payload with a correct checksum. */
async function makeValidPayload(
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
  const checksum = await computeChecksum(base);
  return { ...base, checksum };
}

describe('serializeApproval', () => {
  it('prefixes the v=1 machine-marker on its own line', async () => {
    const payload = await makeValidPayload();
    const out = serializeApproval(payload);
    expect(out.startsWith(`${APPROVAL_MARKER_V1}\n`)).toBe(true);
  });

  it('is deterministic — identical payloads produce byte-identical output', async () => {
    const payload = await makeValidPayload();
    expect(serializeApproval(payload)).toBe(serializeApproval({ ...payload }));
  });

  it('emits keys in canonical order regardless of input object key order', async () => {
    const payload = await makeValidPayload();
    // Construct an object with keys in a scrambled order.
    const scrambled = {
      checksum: payload.checksum,
      restrictedCount: payload.restrictedCount,
      at: payload.at,
      by: payload.by,
      cycle: payload.cycle,
      user: payload.user,
      v: payload.v,
    } as ApprovalCommentV1;
    expect(serializeApproval(scrambled)).toBe(serializeApproval(payload));
  });
});

describe('serialize → parse round-trip', () => {
  // Story 7.8 / D-7.8-35: AC6's "the caveat is recorded in the approval
  // comment" clause is discharged HERE — `makeValidPayload()`'s default
  // ALREADY carries `restrictedCount: 3` (a restricted-Epic approval), so
  // this round-trip proves exactly what AC6 needs: a restricted-Epic
  // approval writes a non-zero, checksum-covered `restrictedCount` that
  // survives serialize → parse intact. No prose was added to discharge this
  // clause — see the negative test below for why.
  it('preserves all fields exactly through serialize → parse, including a restricted-Epic restrictedCount > 0 (AC6)', async () => {
    const payload = await makeValidPayload();
    expect(payload.restrictedCount).toBeGreaterThan(0);
    const result = await parseApprovalComment(serializeApproval(payload));
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual(payload);
      expect(result.value.restrictedCount).toBe(payload.restrictedCount);
    }
  });

  it('survives the ADF round-trip: serialize → textToAdf → adfToText → parse', async () => {
    const payload = await makeValidPayload();
    const body = adfToText(textToAdf(serializeApproval(payload)));
    const result = await parseApprovalComment(body);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual(payload);
    }
  });
});

describe('parseApprovalComment fail-closed reasons', () => {
  it('no-marker: ordinary comment with no marker', async () => {
    const result = await parseApprovalComment('Looks good to me, approved!');
    expect(result).toEqual({ kind: 'parse-error', reason: 'no-marker' });
  });

  it('unknown-version: marker declares v=2', async () => {
    const body = '[[JIRA-TIME-LOGGER:APPROVAL:v=2]]\n{"v":2,"user":"x"}';
    const result = await parseApprovalComment(body);
    expect(result).toEqual({ kind: 'parse-error', reason: 'unknown-version' });
  });

  it('malformed: marker present but no JSON region', async () => {
    const result = await parseApprovalComment(`${APPROVAL_MARKER_V1}\nnot json here`);
    expect(result).toEqual({ kind: 'parse-error', reason: 'malformed' });
  });

  it('malformed: marker present but JSON is unparseable', async () => {
    const result = await parseApprovalComment(`${APPROVAL_MARKER_V1}\n{ broken json`);
    expect(result).toEqual({ kind: 'parse-error', reason: 'malformed' });
  });

  it('malformed: missing a required field', async () => {
    const body = `${APPROVAL_MARKER_V1}\n{"v":1,"user":"u","cycle":"c","by":"b","at":"t","checksum":"abc"}`;
    const result = await parseApprovalComment(body);
    expect(result).toEqual({ kind: 'parse-error', reason: 'malformed' });
  });

  it('malformed: wrong type for a field (restrictedCount is a string)', async () => {
    const body = `${APPROVAL_MARKER_V1}\n{"v":1,"user":"u","cycle":"c","by":"b","at":"t","restrictedCount":"3","checksum":"abc"}`;
    const result = await parseApprovalComment(body);
    expect(result).toEqual({ kind: 'parse-error', reason: 'malformed' });
  });

  it('checksum-mismatch: valid shape but tampered field (human edit)', async () => {
    const payload = await makeValidPayload();
    // Tamper restrictedCount AFTER checksum was computed.
    const tampered = serializeApproval({ ...payload, restrictedCount: 999 });
    const result = await parseApprovalComment(tampered);
    expect(result).toEqual({ kind: 'parse-error', reason: 'checksum-mismatch' });
  });

  it('checksum-mismatch: outright wrong checksum string', async () => {
    const payload = await makeValidPayload();
    const result = await parseApprovalComment(serializeApproval({ ...payload, checksum: '00000000' }));
    expect(result).toEqual({ kind: 'parse-error', reason: 'checksum-mismatch' });
  });

  it('no-marker: marker embedded mid-sentence is NOT treated as an approval', async () => {
    const payload = await makeValidPayload();
    // A human comment that quotes the marker mid-line must not be parsed as an
    // approval — the marker must begin its own line (the serializer emits it so).
    const body = `please see ${APPROVAL_MARKER_V1} ${JSON.stringify(payload)}`;
    const result = await parseApprovalComment(body);
    expect(result).toEqual({ kind: 'parse-error', reason: 'no-marker' });
  });

  it('malformed: missing the discriminator `v`', async () => {
    const body = `${APPROVAL_MARKER_V1}\n{"user":"u","cycle":"c","by":"b","at":"t","restrictedCount":1,"checksum":"abc"}`;
    const result = await parseApprovalComment(body);
    expect(result).toEqual({ kind: 'parse-error', reason: 'malformed' });
  });

  it('malformed: restrictedCount is a non-integer (float)', async () => {
    const body = `${APPROVAL_MARKER_V1}\n{"v":1,"user":"u","cycle":"c","by":"b","at":"t","restrictedCount":3.5,"checksum":"abc"}`;
    const result = await parseApprovalComment(body);
    expect(result).toEqual({ kind: 'parse-error', reason: 'malformed' });
  });

  it('malformed: restrictedCount is negative', async () => {
    const body = `${APPROVAL_MARKER_V1}\n{"v":1,"user":"u","cycle":"c","by":"b","at":"t","restrictedCount":-1,"checksum":"abc"}`;
    const result = await parseApprovalComment(body);
    expect(result).toEqual({ kind: 'parse-error', reason: 'malformed' });
  });

  // Story 7.8 / D-7.8-35 — THE HAZARD TEST. Pins the exact catastrophe the
  // decision log calls "the single most dangerous line in the story":
  // `parseApprovalComment` finds the first `{` after the marker and runs
  // `JSON.parse` on EVERYTHING from there to the end of the string
  // (`lib/comment-schema.ts`'s `jsonRegion` slice has no upper bound). If a
  // future change appended a human-readable sentence AFTER the JSON to
  // "improve" the restricted-worklogs caveat, `JSON.parse` would throw on
  // the trailing prose, the comment would parse as `malformed`, the system
  // would fail closed, and EVERY restricted-Epic approval ever written
  // would become invisible — its cells silently reverting to unapproved.
  // This test proves that failure mode fires today, so nobody "fixes" this
  // the expensive way by shipping it to production first.
  it('HAZARD: appending prose AFTER the JSON breaks the parse — proves why the comment body must stay byte-identical (D-7.8-35)', async () => {
    const payload = await makeValidPayload();
    const validBody = serializeApproval(payload);
    // Sanity check: the unmodified body parses fine.
    const okResult = await parseApprovalComment(validBody);
    expect(isOk(okResult)).toBe(true);

    // The exact "improvement" a future dev might attempt: append a
    // human-readable caveat sentence after the JSON object.
    const withTrailingProse = `${validBody}\nNote: 1 epic has worklogs you can't see.`;
    const brokenResult = await parseApprovalComment(withTrailingProse);
    expect(brokenResult).toEqual({ kind: 'parse-error', reason: 'malformed' });
    // Fail-closed, not a crash — but every restricted-Epic approval this
    // shape touches becomes invisible (isOk === false).
    expect(isOk(brokenResult)).toBe(false);
  });
});

describe('ApprovalCommentSchema (discriminated union)', () => {
  it('accepts a well-formed v1 object', async () => {
    const payload = await makeValidPayload();
    expect(ApprovalCommentSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects an unknown version at the schema level', () => {
    expect(ApprovalCommentSchema.safeParse({ v: 2, user: 'x' }).success).toBe(false);
  });
});
