/**
 * Deterministic integrity checksum for approval-comment payloads (Story 5.1).
 *
 * The checksum is a tamper-evidence guard, NOT a secret/HMAC: it lets the
 * parser detect a human-edited approval comment and fail closed. Both the
 * serializer (5.6) and the parser (this story) compute it over the SAME
 * canonical form, so it MUST be byte-stable across extension versions and JS
 * engines. Any drift in the canonical field order or encoding silently breaks
 * verification of every previously-posted approval.
 *
 * Canonical form (documented identically in PROTOCOL.md):
 *   - Fields, in this FIXED order: v, user, cycle, by, at, restrictedCount
 *   - The `checksum` field itself is EXCLUDED (chicken-and-egg).
 *   - Each field is coerced to its string form and joined with the ASCII Unit
 *     Separator (U+001F). That delimiter cannot occur inside a Jira accountId,
 *     a cycle id, or an ISO-8601 timestamp, so the concatenation is
 *     unambiguous without escaping.
 *   - Hash: SHA-256 via `crypto.subtle.digest`, hex-encoded, truncated to the
 *     first 8 lowercase hex characters.
 *
 * `crypto.subtle.digest` is async (see lib/oauth/pkce.ts), so the functions
 * here are async and so is every caller that verifies.
 */

/** The six fields covered by the checksum (the `checksum` field is excluded). */
export type ChecksumPayload = {
  v: number;
  user: string;
  cycle: string;
  by: string;
  at: string;
  restrictedCount: number;
};

/** ASCII Unit Separator (U+001F) — the canonical field delimiter. */
const FIELD_SEP = '';

/**
 * Build the canonical UTF-8 string from the six fields in fixed order.
 * Exported for PROTOCOL.md cross-checking / debugging; not part of the public
 * contract beyond determinism.
 */
export function canonicalString(payload: ChecksumPayload): string {
  return [
    String(payload.v),
    payload.user,
    payload.cycle,
    payload.by,
    payload.at,
    String(payload.restrictedCount),
  ].join(FIELD_SEP);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute the stable 8-char checksum over the canonical-form payload.
 * The `checksum` field, if present on the input object, is ignored.
 */
export async function computeChecksum(payload: ChecksumPayload): Promise<string> {
  const data = new TextEncoder().encode(canonicalString(payload));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest).slice(0, 8);
}

/**
 * Verify a claimed checksum against the freshly-computed one.
 * Returns true iff they match. This is integrity, not a secret, so a plain
 * string compare is acceptable (no timing-attack surface).
 */
export async function verifyChecksum(
  payload: ChecksumPayload,
  claimedChecksum: string,
): Promise<boolean> {
  const expected = await computeChecksum(payload);
  return expected === claimedChecksum;
}
