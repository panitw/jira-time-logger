/**
 * Versioned approval-comment schema, serializer, and fail-closed parser
 * (Story 5.1) — the canonical audit-integrity contract for the manager-approval
 * protocol. Every approval feature (5.2–5.8) reads/writes through this module.
 *
 * Wire format of an approval comment body (plaintext; the caller wraps it in
 * ADF via `textToAdf` before POSTing — see lib/adf.ts):
 *
 *   [[JIRA-TIME-LOGGER:APPROVAL:v=1]]
 *   {"v":1,"user":"...","cycle":"...","by":"...","at":"...","restrictedCount":N,"checksum":"xxxxxxxx"}
 *
 * Line 1 is the machine-marker that makes the comment unambiguously
 * identifiable (and carries the version). Line 2 is a single JSON object whose
 * keys are written in a FIXED order so serialization is byte-stable. The whole
 * block is one paragraph's text so `adfToText` (which reads only the first
 * paragraph's text nodes) recovers it intact.
 *
 * The parser FAILS CLOSED: it returns `ok` only when the marker is present, the
 * version is 1, the payload parses against Zod, AND the embedded checksum
 * verifies. Any deviation is a `parse-error` with a specific `reason`, so a
 * tampered/forged/future-version comment is treated as "not a verifiable
 * approval" rather than crashing.
 */
import { z } from 'zod';
import { computeChecksum } from '@/lib/checksum';
import { type Result, ok } from '@/lib/result';

/** Machine-marker for the v=1 approval-comment format. */
export const APPROVAL_MARKER_V1 = '[[JIRA-TIME-LOGGER:APPROVAL:v=1]]';

/**
 * Matches the marker at the START of a line and captures the version digits, so
 * an unknown future version (e.g. v=2) is detectable rather than silently
 * mis-parsed. Anchored with `^`/`m` so a marker embedded mid-sentence in an
 * ordinary human comment is NOT treated as an approval block — the marker must
 * begin its own line, exactly as `serializeApproval` emits it.
 */
const MARKER_RE = /^\[\[JIRA-TIME-LOGGER:APPROVAL:v=(\d+)\]\]/m;

export const ApprovalCommentV1Schema = z.object({
  v: z.literal(1),
  user: z.string(),
  cycle: z.string(),
  by: z.string(),
  at: z.string(),
  // A count of restricted worklogs: a finite non-negative integer. Constraining
  // it here (rather than a bare `z.number()`) guarantees the canonical checksum
  // string is byte-stable — floats/`Infinity`/`NaN` would otherwise serialize as
  // `"3.5"`/`"Infinity"`/`"NaN"` and break the cross-engine determinism contract
  // (e.g. `1e21` → `"1e+21"`) or produce a write-once/never-readable approval.
  restrictedCount: z.number().int().nonnegative(),
  checksum: z.string(),
});

export type ApprovalCommentV1 = z.infer<typeof ApprovalCommentV1Schema>;

/**
 * Discriminated union over the version field. New versions are appended here;
 * the `discriminatedUnion('v', ...)` keeps unknown-version handling explicit.
 */
export const ApprovalCommentSchema = z.discriminatedUnion('v', [ApprovalCommentV1Schema]);

export type ApprovalComment = z.infer<typeof ApprovalCommentSchema>;

/**
 * Parser-local error type. Distinct from `JiraError.parse-error` (which carries
 * a Zod `issue` for network-layer parse failures) — this one carries a `reason`
 * describing WHY a comment is not a verifiable approval.
 */
export type ParseError = {
  kind: 'parse-error';
  reason: 'no-marker' | 'malformed' | 'checksum-mismatch' | 'unknown-version';
};

function parseError(reason: ParseError['reason']): ParseError {
  return { kind: 'parse-error', reason };
}

/**
 * Serialize a typed v1 payload into the deterministic plaintext block.
 *
 * The JSON object is built with literal keys in canonical order, so the output
 * is byte-identical for identical input (JS preserves string-key insertion
 * order). The marker and payload are joined with a newline into one block.
 *
 * NOTE: this does NOT compute the checksum — the caller (5.6) computes it via
 * `computeChecksum` and includes it on the payload before serializing, so the
 * checksum that lands in the comment matches the one the parser recomputes.
 */
export function serializeApproval(payload: ApprovalCommentV1): string {
  const ordered = {
    v: payload.v,
    user: payload.user,
    cycle: payload.cycle,
    by: payload.by,
    at: payload.at,
    restrictedCount: payload.restrictedCount,
    checksum: payload.checksum,
  };
  return `${APPROVAL_MARKER_V1}\n${JSON.stringify(ordered)}`;
}

/**
 * Fail-closed parse of a comment body (already converted from ADF to plain
 * text by the caller). Returns `ok(approval)` ONLY when the marker is present,
 * the version is 1, the JSON payload parses against the Zod schema, AND the
 * embedded checksum verifies. Async because checksum verification is async.
 */
export async function parseApprovalComment(
  body: string,
): Promise<Result<ApprovalComment, ParseError>> {
  const markerMatch = MARKER_RE.exec(body);
  if (!markerMatch) {
    return parseError('no-marker');
  }

  const version = Number(markerMatch[1]);
  if (version !== 1) {
    return parseError('unknown-version');
  }

  // The payload is the JSON region after the marker. Find the first `{` after
  // the marker and parse to the end of its line / block.
  const afterMarker = body.slice(markerMatch.index + markerMatch[0].length);
  const jsonStart = afterMarker.indexOf('{');
  if (jsonStart === -1) {
    return parseError('malformed');
  }
  const jsonRegion = afterMarker.slice(jsonStart).trim();

  let json: unknown;
  try {
    json = JSON.parse(jsonRegion);
  } catch {
    return parseError('malformed');
  }

  const parsed = ApprovalCommentSchema.safeParse(json);
  if (!parsed.success) {
    // A payload that declares a non-1 `v` (e.g. v:2) would fail the
    // discriminated union; the marker version already gated that, but a
    // mismatched/forged inner v also lands here as malformed.
    return parseError('malformed');
  }

  const approval = parsed.data;
  const valid = await verifyApprovalChecksum(approval);
  if (!valid) {
    return parseError('checksum-mismatch');
  }

  return ok(approval);
}

/** Recompute the checksum over the canonical fields and compare. */
async function verifyApprovalChecksum(approval: ApprovalComment): Promise<boolean> {
  const expected = await computeChecksum({
    v: approval.v,
    user: approval.user,
    cycle: approval.cycle,
    by: approval.by,
    at: approval.at,
    restrictedCount: approval.restrictedCount,
  });
  return expected === approval.checksum;
}
