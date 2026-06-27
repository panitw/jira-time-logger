# Manager-Approval Comment Protocol

This document is the human-readable contract for the manager-approval audit-integrity
protocol implemented in `lib/comment-schema.ts`, `lib/checksum.ts`, and `lib/parser.ts`
(Story 5.1). Every approval feature (5.2–5.8) relies on this single canonical contract.
Any change here is a breaking change to every previously-posted approval comment.

## Why a checksummed comment

An "approval" is recorded as a normal Jira comment on the Epic. There is no custom field
and no server component. To make the comment **machine-verifiable** and **tamper-evident**
(a human can edit a Jira comment freely), the comment carries a versioned, checksummed
payload. The parser **fails closed**: anything that is not a byte-valid, checksum-verified,
known-version approval is treated as "not an approval I can verify" → the cycle is
considered **unapproved**.

## Machine-marker format

The first line of an approval comment body (in plain text, after ADF → text conversion) is:

```
[[JIRA-TIME-LOGGER:APPROVAL:v=1]]
```

- The bracketed marker makes the comment unambiguously identifiable among ordinary comments.
- `v=<n>` carries the schema version. The marker is matched by the regex
  `^\[\[JIRA-TIME-LOGGER:APPROVAL:v=(\d+)\]\]` (multiline). The marker MUST begin
  its own line — a marker quoted mid-sentence in an ordinary human comment is
  `parse-error: no-marker`, not an approval. The captured digits are the version.
- A comment with **no** marker is `parse-error: no-marker` (an ordinary comment).
- A comment whose marker version is **not 1** is `parse-error: unknown-version`
  (forward-compatibility: a newer extension's v2 comment must not crash or be
  mis-read by an older extension — it is simply "not verifiable here").

## v=1 payload schema

The line after the marker is a single JSON object (the marker line + payload line live in
**one ADF paragraph** so `adfToText`, which reads only the first paragraph's text, recovers
the whole block intact):

```json
{"v":1,"user":"<accountId>","cycle":"<cycleId>","by":"<accountId>","at":"<ISO-8601>","restrictedCount":<number>,"checksum":"<8 hex>"}
```

| Field            | Type   | Meaning                                                              |
| ---------------- | ------ | ------------------------------------------------------------------- |
| `v`              | `1`    | Schema version (literal).                                           |
| `user`           | string | Jira `accountId` of the person whose cycle is approved.             |
| `cycle`          | string | Cycle id, e.g. `"2026-05"`.                                         |
| `by`             | string | Jira `accountId` of the approving manager.                          |
| `at`             | string | ISO-8601 datetime the approval was issued (payload-claimed time).   |
| `restrictedCount`| number | Count of restricted/hidden worklogs the approver could not see. A finite **non-negative integer** (floats/`Infinity`/`NaN` are rejected so the canonical string stays byte-stable across engines). |
| `checksum`       | string | 8-char integrity checksum over the other six fields (see below).    |

The schema is a Zod `discriminatedUnion('v', [ApprovalCommentV1Schema])`. Keys are written
by `serializeApproval` in the **fixed order above**, so serialization is byte-stable.

## Checksum algorithm

The checksum is an **integrity** guard, not a secret/HMAC — its only job is to detect
tampering (a human-edited comment) and let the parser fail closed.

1. **Canonical input fields, in this FIXED order:** `v, user, cycle, by, at, restrictedCount`.
   The `checksum` field itself is **excluded** (chicken-and-egg).
2. **Canonical string:** each field is coerced to its plain string form
   (`String(v)`, `String(restrictedCount)` — never locale formatting) and the six strings
   are joined with the ASCII **Unit Separator** `U+001F`. That delimiter cannot occur inside
   a Jira accountId, a cycle id, or an ISO-8601 timestamp, so the concatenation is
   unambiguous without escaping (it prevents `("ab","c")` colliding with `("a","bc")`).
3. **Hash:** `crypto.subtle.digest('SHA-256', utf8Bytes(canonicalString))`.
4. **Truncate:** lowercase-hex-encode the digest and keep the **first 8 characters**.

> Determinism is load-bearing: 5.4 dirty-detection and 5.6 posting both depend on this
> being byte-stable across extension versions and JS engines. A golden-checksum regression
> test (`lib/checksum.test.ts`) pins a known payload → `f00a1c3b`; do not change the
> canonical form without understanding it invalidates every prior approval.

`verifyChecksum(payload, claimed)` returns `true` iff `computeChecksum(payload) === claimed`.
A plain string compare is acceptable (integrity, not a secret).

## Parser fail-closed contract

`parseApprovalComment(body)` returns `Result<ApprovalComment, ParseError>`. It returns
`ok(approval)` **only** when all of the following hold; otherwise it returns a
`parse-error` with one of these `reason`s:

| `reason`            | Condition                                                            |
| ------------------- | -------------------------------------------------------------------- |
| `no-marker`         | The body contains no `[[JIRA-TIME-LOGGER:APPROVAL:v=…]]` marker.     |
| `unknown-version`   | Marker present but version ≠ 1.                                     |
| `malformed`         | Payload region absent, not valid JSON, or fails the Zod schema.     |
| `checksum-mismatch` | Shape is valid but the embedded checksum does not verify (tampered). |

Comment-level parse failures are **dropped**, never thrown — they must not abort discovery.

## Discovery & newest-wins resolution

`findApprovalComments(epicKey)`:

1. Fetches all comments via `jiraGet('rest/api/3/issue/<key>/comment?startAt=…&maxResults=100', JiraCommentListSchema)`
   (inherits scheduler + OAuth 401-refresh + Result handling). The endpoint **paginates**,
   so discovery loops over `startAt` until the reported `total` is reached — an Epic with
   more than one page of comments still surfaces every approval. A network/auth/parse
   failure of any **list** page surfaces as a `JiraError`.
2. Converts each comment `body` (ADF) to text with `adfToText`, runs `parseApprovalComment`,
   and keeps only the verified approvals.
3. **Newest wins per `(user, cycle)`:** when multiple verified approvals share the same
   `(user, cycle)` pair, only the one with the latest Jira-native **`created`** timestamp
   is kept (NOT the payload `at` field). The composite key joins `user` and `cycle` with
   the same `U+001F` separator the checksum uses, so distinct pairs never collide. An
   unparseable `created` is treated as the oldest possible time (never beats a real
   timestamp). Deterministic tiebreak on equal timestamps: the first-encountered entry is
   retained.
4. Approvals for **different** `(user, cycle)` pairs coexist — multiple managers' and
   multiple cycles' approvals are all returned as separate records.

## Dirty-detection rule (forward reference — Story 5.4)

This story provides the approval records; **dirty detection itself is Story 5.4** (`lib/dirty-detect.ts`),
not implemented here. The rule that 5.4 will apply, documented for the contract:

> An approved cycle is **dirty** (stale approval) when any worklog covered by the approval
> has a Jira `updated` timestamp **later than** the approval's `at` time — i.e. the work
> changed after it was approved. A dirty or checksum-mismatched cell surfaces a
> "comment corrupted / approval stale" warning in the UI (5.4); this data layer only
> supplies the verified approvals and never renders UI.
