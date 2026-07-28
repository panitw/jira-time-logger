---
baseline_commit: 74fa23d118c5c240255ebe9a187fe637e341400c
---
# Story 5.1: Approval-Comment Schema, Checksum & Parser

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an architect protecting the audit-integrity contract,
I want the versioned approval-comment schema, checksum computation, and a fail-closed parser implemented as standalone modules with full test coverage,
so that every subsequent approval feature (5.2–5.8) can rely on a single canonical contract.

## Acceptance Criteria

**Schema (`lib/comment-schema.ts`)**

1. The module exports a Zod `discriminatedUnion('v', [ApprovalCommentV1Schema])` where `ApprovalCommentV1Schema` is `z.object({ v: z.literal(1), user: z.string(), cycle: z.string(), by: z.string(), at: z.string(), restrictedCount: z.number(), checksum: z.string() })`. `user` and `by` are Jira `accountId`s; `cycle` is a cycle id string (e.g., `"2026-05"`); `at` is an ISO 8601 datetime string. (AR14, NFR7, NFR8)
2. The inferred type is exported as `type ApprovalComment = z.infer<typeof ApprovalCommentSchema>` and the v1 payload type as `type ApprovalCommentV1` (Zod-naming convention: schema suffixed `Schema`, inferred type drops the suffix).
3. `serializeApproval(payload: ApprovalCommentV1): string` converts a typed payload into a **deterministic** plaintext block prefixed with the machine-marker line `[[JIRA-TIME-LOGGER:APPROVAL:v=1]]` so the comment is unambiguously identifiable. Serialization is stable: the same payload always produces byte-identical output (fixed field order, no `Date.now()`/locale dependence).
4. `parseApprovalComment(body: string): Result<ApprovalComment, ParseError>` fails closed. It returns `ok(approval)` ONLY when: the body contains the v=1 machine-marker, the encoded payload parses against the Zod schema, AND the embedded checksum verifies. Any deviation returns a `parse-error`.
5. `ParseError` is a discriminated union with a `reason` field covering at least: `'no-marker'`, `'malformed'` (marker present but payload not decodable / fails Zod), `'checksum-mismatch'`, and `'unknown-version'`. (NFR7, FR40)

**Checksum (`lib/checksum.ts`)**

6. `computeChecksum(payload): Promise<string>` computes a stable hash over the canonical-form `{ v, user, cycle, by, at, restrictedCount }` payload (the checksum field itself is EXCLUDED from the input). It uses `crypto.subtle.digest('SHA-256', ...)` over a canonical UTF-8 serialization with **fixed key ordering** (`v,user,cycle,by,at,restrictedCount`), and truncates the hex digest to the first 8 characters. (AR15)
7. The same payload always produces the same checksum across extension versions and JS engines — no `JSON.stringify` of an object with unstable key order; build the canonical string explicitly from the ordered fields.
8. `verifyChecksum(payload, claimedChecksum): Promise<boolean>` returns `true` iff `computeChecksum(payload) === claimedChecksum`; returns `false` for any tampered field (constant string compare is acceptable — this is integrity, not a secret).

**Parser / discovery (`lib/parser.ts`)**

9. `findApprovalComments(epicKey: string): Promise<Result<ApprovalComment[], JiraError>>` fetches all comments on the Epic via `GET /rest/api/3/issue/<key>/comment`, applies `parseApprovalComment` to each comment body (ADF → text via `adfToText`), and returns successfully-parsed approvals. Comments that fail parsing are dropped from the returned array but MUST NOT abort the whole call. (AR16)
10. The comment fetch goes through `jiraGet` (so it inherits scheduler + token-refresh + Result handling). A new Zod schema `JiraCommentListSchema` is added to `lib/jira-types.ts` for the comment-list response, modeling at minimum each comment's `id`, `created` (Jira-native ISO timestamp), and `body` (ADF, typed `z.unknown()`). Schemas tolerate extra fields.
11. The "newest wins per (user, cycle)" rule is applied: when multiple successfully-parsed approvals share the same `(user, cycle)` pair, only the comment with the latest Jira-native `created` timestamp is kept. The Jira `created` timestamp (NOT the payload `at` field) is the tiebreaker. (FR41)
12. Approvals for different `(user, cycle)` pairs on the same Epic are kept as separate records — multiple managers' approvals coexist. (FR41)

**Fail-closed behaviors**

13. A comment body that matches the v=1 machine-marker but whose checksum is invalid (e.g., a human edited the comment) returns `parse-error` with `reason: 'checksum-mismatch'`; `findApprovalComments` drops it from the result set. The seam for surfacing a "comment corrupted" warning is left for the UI (5.4) — this story does not render UI. (NFR7, FR40)
14. A comment with a future/unknown version (e.g., `v=2`) returns `parse-error` with `reason: 'unknown-version'` rather than crashing; the cycle is therefore treated as "not an approval I can verify" → unapproved. (NFR8 forward-compat)

**Tests (`*.test.ts` co-located)**

15. Co-located Vitest tests cover (table-driven where helpful): serialize → parse round-trip preserves all fields exactly; checksum verify accepts canonical payload and rejects each tampered field individually; parser returns the correct `parse-error` reason for missing marker, malformed payload, missing fields, wrong types, bad checksum, and unknown version; newest-wins resolution across 2, 3, and 5 duplicate comments for the same `(user, cycle)`; multi-user comments on the same Epic coexist (two distinct users' v=1 approvals both returned).

**Protocol doc**

16. `PROTOCOL.md` is created at the repo root documenting: the machine-marker format, the v=1 payload schema, the checksum algorithm (canonical field order + SHA-256 + 8-char truncation), the newest-wins rule, the dirty-detection rule (forward reference for 5.4), and the parser fail-closed contract. (AR19, NFR8)

## Tasks / Subtasks

- [x] **Task 1: `lib/comment-schema.ts` — schema + serializer + parser** (AC: 1, 2, 3, 4, 5, 13, 14)
  - [x] Define `ApprovalCommentV1Schema` (`z.object` with `v: z.literal(1)`, plus `user`, `cycle`, `by`, `at`, `restrictedCount`, `checksum`).
  - [x] Define `ApprovalCommentSchema = z.discriminatedUnion('v', [ApprovalCommentV1Schema])` and export inferred `ApprovalComment` / `ApprovalCommentV1` types.
  - [x] Define and export the machine-marker constant: `export const APPROVAL_MARKER_V1 = '[[JIRA-TIME-LOGGER:APPROVAL:v=1]]'` and a marker-detection helper / regex that also extracts the version number for unknown-version detection.
  - [x] Implement `serializeApproval(payload: ApprovalCommentV1): string` — first line is the marker, followed by a deterministic encoding of the 7 fields in fixed order. Recommended: marker line + a single JSON line built with explicit ordered keys (NOT `JSON.stringify(obj)` of an arbitrarily-keyed object — construct the object with literal keys in the canonical order, or hand-build the string). Document the exact format inline.
  - [x] Implement `parseApprovalComment(body: string): Result<ApprovalComment, ParseError>`:
    1. If no marker → `parse-error` `reason: 'no-marker'`.
    2. If marker present but version ≠ 1 → `reason: 'unknown-version'`.
    3. Decode the payload region; if not decodable or Zod `safeParse` fails → `reason: 'malformed'`.
    4. Recompute checksum over `{v,user,cycle,by,at,restrictedCount}` and compare to embedded `checksum`; mismatch → `reason: 'checksum-mismatch'`.
    5. Otherwise → `ok(approval)`.
  - [x] Define `ParseError` discriminated union (`{ kind: 'parse-error'; reason: ... }`) — see Dev Notes for whether to reuse `Result`'s existing `parse-error` or define a parser-local error type.
- [x] **Task 2: `lib/checksum.ts` — deterministic checksum** (AC: 6, 7, 8)
  - [x] Implement `canonicalString(payload)` private helper that builds the UTF-8 canonical string from the 6 fields in the fixed order `v,user,cycle,by,at,restrictedCount` (checksum excluded).
  - [x] Implement `computeChecksum(payload): Promise<string>` using `crypto.subtle.digest('SHA-256', ...)` (mirror the hex/encoding approach; truncate hex to 8 chars). Reuse the `TextEncoder` + digest pattern from `lib/oauth/pkce.ts` but produce **lowercase hex** (not base64url) for readability in the comment.
  - [x] Implement `verifyChecksum(payload, claimedChecksum): Promise<boolean>`.
- [x] **Task 3: `lib/jira-types.ts` — comment-list schema** (AC: 10)
  - [x] Add `JiraCommentSchema` (`{ id: z.string(), created: z.string(), body: z.unknown() }`, tolerate extra fields) and `JiraCommentListSchema` (`{ comments: z.array(JiraCommentSchema), total: z.number().optional() }`). Export inferred types.
  - [x] Add co-located assertions in `lib/jira-types.test.ts` if a representative sample is helpful (follow existing test style there).
- [x] **Task 4: `lib/parser.ts` — find + resolve approvals** (AC: 9, 11, 12, 13)
  - [x] Implement `findApprovalComments(epicKey: string): Promise<Result<ApprovalComment[], JiraError>>`:
    1. `jiraGet(`rest/api/3/issue/${encodeURIComponent(epicKey)}/comment`, JiraCommentListSchema)`; if not `ok`, propagate the JiraError.
    2. Map each comment → `{ created, parsed: parseApprovalComment(adfToText(c.body)) }`; keep only `ok` parses, carrying the Jira `created` timestamp alongside.
    3. Apply newest-wins reduction keyed by `(user, cycle)`: keep the entry with the latest `created` (parse with `Date.parse`; deterministic tiebreak if equal — keep first encountered, document it).
    4. Return `ok(resolvedApprovals)`.
  - [x] Keep parser logic pure/synchronous where possible; only the Jira fetch is async. `parseApprovalComment` itself calls `verifyChecksum` which is async → `parseApprovalComment` will be `async`. Reflect that in signatures (AC 4 signature becomes `Promise<Result<...>>`).
- [x] **Task 5: Co-located tests** (AC: 15)
  - [x] `lib/comment-schema.test.ts`: round-trip; each `parse-error` reason; missing/extra fields; wrong types.
  - [x] `lib/checksum.test.ts`: stable value snapshot (pin one known payload → known 8-char digest); reject each tampered field.
  - [x] `lib/parser.test.ts`: mock `jiraGet` (or inject a fetch boundary — see Dev Notes); newest-wins across 2/3/5 dupes; multi-user coexist; corrupted comment dropped; unknown-version dropped; underlying JiraError propagated.
- [x] **Task 6: `PROTOCOL.md`** (AC: 16)
  - [x] Author the repo-root protocol doc (see AC 16 contents). This is the human-readable contract referenced by architecture.md line 1078.
- [x] **Task 7: Verify** — run `npm test` and `eslint .`; all green; no `any`, named exports only, no barrel files.

## Dev Notes

### What this story is (and is NOT)

This is a **pure data/logic-layer** story. It delivers four lib modules + tests + `PROTOCOL.md`. **No React, no UI, no messaging, no service-worker wiring.** Leave clean seams for the UI/posting stories:

- `serializeApproval` is the seam **5.6 (approve fan-out)** calls to build comment bodies before `POST /rest/api/3/issue/<epicKey>/comment`.
- `findApprovalComments` + `parseApprovalComment` are the seams **5.4 (cell coloring / dirty detection)** and **5.5 (drill-down)** read.
- `computeChecksum` / `verifyChecksum` are reused by both serialize (5.6) and parse (this story).
- The `restrictedCount` field is populated by the caller (5.6) from per-row query data; this story just types and checksums it.
- Dirty detection itself (`lib/dirty-detect.ts`, comparing worklog `updated` > approval `at`) is **Story 5.4**, NOT here. This story only provides the approval records dirty-detect will consume. Mention the rule in `PROTOCOL.md` (AC 16) but do not implement `dirty-detect.ts`.

### Critical: determinism of checksum + serialization

5.4 dirty-detection and 5.6 posting both depend on the checksum being **byte-stable**. Pitfalls to avoid:

- Do NOT `JSON.stringify` an object whose key order is not guaranteed. JS preserves insertion order for string keys, so it is safe *if* you construct the object with literal keys in canonical order — but the safest approach is to build the canonical string by explicitly concatenating the 6 ordered fields with a delimiter (e.g., `${v} ${user} ${cycle} ${by} ${at} ${restrictedCount}`).
- Exclude `checksum` from its own input (chicken-and-egg).
- `restrictedCount` is a number → coerce to a canonical string form (e.g., `String(restrictedCount)`); never rely on locale formatting.
- The checksum input field order MUST equal `v,user,cycle,by,at,restrictedCount` and be documented identically in `PROTOCOL.md` and code. Any future drift breaks every prior approval's verification.

### crypto.subtle is async → checksum & parse are async

`crypto.subtle.digest` returns a `Promise` (confirmed in use at `lib/oauth/pkce.ts:43`). Therefore `computeChecksum`, `verifyChecksum`, `parseApprovalComment` (which verifies), and `findApprovalComments` are all `async`. The original AC 4 wrote a synchronous signature — implement it as `Promise<Result<...>>`. `crypto.subtle` is available in the MV3 service worker, popup, and Vitest (jsdom/Node) environments.

Hex encoding: pkce.ts uses base64url; for the checksum produce **lowercase hex** truncated to 8 chars (more legible inside a plaintext comment). Convert the digest `Uint8Array` to hex with `Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,8)`.

### `ParseError` type decision

`lib/result.ts` already has a `JiraError` variant `{ kind: 'parse-error'; issue: unknown }`. That variant carries a Zod `issue`, not a `reason`. Story ACs require a `reason` discriminator (`'no-marker' | 'malformed' | 'checksum-mismatch' | 'unknown-version'`). **Recommended:** define a parser-local `ParseError` type in `comment-schema.ts`:
```
export type ParseError = { kind: 'parse-error'; reason: 'no-marker' | 'malformed' | 'checksum-mismatch' | 'unknown-version' };
```
and have `parseApprovalComment` return `Result<ApprovalComment, ParseError>`. This keeps the network-layer `JiraError.parse-error` (Zod issues) distinct from the comment-protocol parse failures. `findApprovalComments` returns `Result<ApprovalComment[], JiraError>` (network errors only — comment-level parse failures are silently dropped, not surfaced as a JiraError).

### Files to CREATE (all NEW — no existing files modified except jira-types.ts)

- `lib/comment-schema.ts` + `lib/comment-schema.test.ts` (NEW)
- `lib/checksum.ts` + `lib/checksum.test.ts` (NEW)
- `lib/parser.ts` + `lib/parser.test.ts` (NEW)
- `PROTOCOL.md` at repo root (NEW)
- `lib/jira-types.ts` (UPDATE — add `JiraCommentSchema` / `JiraCommentListSchema`)

### Reuse — do NOT reinvent

- **`lib/adf.ts`** (`adfToText`, `textToAdf`) — Story 2.6. Jira comment bodies are ADF objects, not strings. Use `adfToText(comment.body)` to get the plaintext before `parseApprovalComment`. `serializeApproval` returns a plaintext string; the **caller (5.6)** wraps it with `textToAdf` before POSTing — do not couple serialization to ADF here. `adfToText` only reads the FIRST paragraph's text nodes, so serialize the entire approval block into a single paragraph / single text run (e.g., marker + payload on lines joined with `\n` within one paragraph), OR accept that the encoded payload must survive a first-paragraph round-trip. **Decision:** keep the whole serialized block as one paragraph's text so `adfToText` recovers it intact; verify the round-trip in `comment-schema.test.ts` using `textToAdf(serialize(...))` → `adfToText` → `parse`.
- **`lib/result.ts`** — `Result<T, E>`, `ok()`, `JiraError`, `isOk`. Use these; do not invent a new error model.
- **`lib/jira-client.ts`** — `jiraGet(path, schema)` already handles base URL, auth header, 401-refresh, 429/403/404 mapping, Zod parse, scheduler. `findApprovalComments` MUST go through `jiraGet`, not raw `fetch`.
- **`lib/oauth/pkce.ts`** — pattern reference for `crypto.subtle.digest` + `TextEncoder`.

### Testing standards

- Vitest, co-located `*.test.ts` (architecture.md: tests next to source; NOT under `tests/`).
- Table-driven where the AC lists enumerated cases (each tampered field, each parse-error reason).
- For `parser.test.ts`, the cleanest seam is to mock `jiraGet`. Existing tests mock the jira-client boundary — check `lib/jira-client.test.ts` / `lib/badge.test.ts` for the `vi.mock('@/lib/jira-client', ...)` pattern and follow it. Build comment fixtures with `textToAdf(serializeApproval(payload))` so fixtures are real, not hand-typed bodies that could drift from the serializer.
- Pin at least one **golden checksum**: hard-code a known payload and assert its exact 8-char digest, so an accidental change to the canonical form is caught by a failing test (this is the regression guard for 5.4/5.6 dependence).

### Project Structure Notes

- Module locations match architecture.md project tree exactly: `lib/comment-schema.ts`, `lib/parser.ts`, `lib/checksum.ts`, with co-located `.test.ts`. `PROTOCOL.md` at repo root (architecture.md project tree lists it).
- Naming: kebab-case files, `PascalCase` Zod schema names suffixed `Schema`, inferred types drop the suffix, named exports only, no barrel `index.ts`, `@/` path alias for cross-module imports.
- Async functions are unprefixed (no `Async` suffix); `Promise<T>` is the contract.
- No conflicts detected. `lib/comment-schema.ts`, `lib/checksum.ts`, `lib/parser.ts` do not yet exist (confirmed). `dirty-detect.ts`, `approval.ts` are intentionally out of scope (5.4 / 5.6).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1 (lines 1203-1250)] — full ACs.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4] — dirty-detect + cell coloring consumers (seam).
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.6] — approve fan-out / serializeApproval consumer (seam).
- [Source: _bmad-output/planning-artifacts/prd.md#FR33-FR42] — approval comment / fail-closed / multi-manager independence.
- [Source: _bmad-output/planning-artifacts/architecture.md#Schema validation: Zod v3 (line 341)] — `discriminatedUnion('v', [...])` contract.
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure (lines 719-723)] — module file layout + PROTOCOL.md.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data flow — Manager approves a cycle (lines ~883-890)] — serializeApproval call site.
- [Source: lib/adf.ts] — `adfToText` / `textToAdf` (Story 2.6).
- [Source: lib/result.ts] — `Result<T, E>`, `JiraError`, `ok`, `isOk`.
- [Source: lib/jira-client.ts:42] — `jiraGet(path, schema)`.
- [Source: lib/oauth/pkce.ts:40-45] — `crypto.subtle.digest('SHA-256', ...)` async pattern.
- [Source: lib/jira-types.ts] — Zod schema conventions; where to add `JiraCommentListSchema`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- `npm run test` → 57 test files, 713 passed | 1 skipped.
- `npm run compile` (tsc --noEmit) → exit 0, no type errors.
- `eslint .` → exit 0; 53 pre-existing `import/order` warnings (none in new files), 0 errors.

### Completion Notes List

- **Pure data/logic layer only** — no React/UI/messaging/service-worker wiring, per scope. Clean seams left for 5.2–5.8: `serializeApproval` (5.6 posting), `findApprovalComments`/`parseApprovalComment` (5.4 dirty-detect/coloring, 5.5 drill-down), `computeChecksum`/`verifyChecksum` (shared).
- **Determinism / golden checksum:** canonical form is the six fields `v,user,cycle,by,at,restrictedCount` joined with ASCII Unit Separator `U+001F` (chosen because it can't appear in accountIds/cycle ids/ISO timestamps, so no escaping and no adjacent-field collision), SHA-256 via `crypto.subtle.digest`, lowercase-hex truncated to 8 chars. Pinned golden checksum `f00a1c3b` asserted in `lib/checksum.test.ts` as the byte-stability regression guard for 5.4/5.6. A collision test confirms the delimiter prevents `("ab","c")` vs `("a","bc")` ambiguity.
- **Async signatures:** `crypto.subtle.digest` is async, so `computeChecksum`, `verifyChecksum`, `parseApprovalComment`, and `findApprovalComments` are all async — AC 4's originally-synchronous signature is implemented as `Promise<Result<...>>` per Dev Notes.
- **Fail-closed parser:** `parseApprovalComment` returns a parser-local `ParseError` (`{ kind: 'parse-error'; reason }`) distinct from `JiraError.parse-error`. Reasons: `no-marker`, `unknown-version` (marker v≠1), `malformed` (no JSON region / unparseable JSON / Zod failure incl. missing/wrong-typed fields), `checksum-mismatch` (tampered).
- **ADF round-trip verified:** serialized block is marker + payload joined by `\n` kept as one paragraph's text; `comment-schema.test.ts` asserts `textToAdf(serialize(...)) → adfToText → parse` recovers all fields exactly. Parser fixtures in `parser.test.ts` are built via the real serializer + `textToAdf` so they can't drift.
- **Newest-wins:** keyed by `(user, cycle)`, tiebreaker is Jira-native `created` (not payload `at`); equal-timestamp tiebreak keeps the first-encountered entry (documented in `parser.ts` and `PROTOCOL.md`). Covered for 2/3/5 duplicates and multi-user / multi-cycle coexistence.
- **No new dependencies.** Named exports only, no barrel files, no `any` introduced. `jira-types.ts` is the only existing source file modified (added `JiraCommentSchema`/`JiraCommentListSchema`).
- `dirty-detect.ts` intentionally NOT implemented (Story 5.4); its rule is documented as a forward reference in `PROTOCOL.md`.

### File List

- `lib/comment-schema.ts` (NEW)
- `lib/comment-schema.test.ts` (NEW)
- `lib/checksum.ts` (NEW)
- `lib/checksum.test.ts` (NEW)
- `lib/parser.ts` (NEW)
- `lib/parser.test.ts` (NEW)
- `PROTOCOL.md` (NEW)
- `lib/jira-types.ts` (MODIFIED — added `JiraCommentSchema` / `JiraCommentListSchema` + inferred types)
- `lib/jira-types.test.ts` (MODIFIED — added `JiraCommentListSchema` assertions)
- `_bmad-output/implementation-artifacts/5-1-approval-comment-schema-checksum-parser.md` (MODIFIED — frontmatter, task checkboxes, Dev Agent Record, status)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED — story status ready-for-dev → in-progress → review)

## Change Log

| Date       | Change                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------- |
| 2026-06-27 | Implemented approval-comment schema, deterministic checksum, fail-closed parser + discovery, comment-list Zod schema, PROTOCOL.md, and full co-located test coverage (golden checksum, ADF round-trip, all parse-error reasons, newest-wins 2/3/5 dupes, multi-user/cycle coexistence). All gates green. Status → review. |
| 2026-06-27 | Code review (bmad-code-review). 5 findings applied: comment pagination loop, newest-wins key delimiter → U+001F, NaN-`created` coerced to oldest, line-anchored marker regex, `restrictedCount` tightened to finite non-negative int. Added 8 regression tests. PROTOCOL.md updated. Gates re-run green (721 passed/1 skipped, tsc 0, eslint 0 errors). Status → done. See Review Findings. |

## Review Findings

**Reviewer:** bmad-code-review (independent context) · **Date:** 2026-06-27 · **Baseline:** `74fa23d`
**Outcome:** All 16 ACs MET (Acceptance Auditor verdict). Golden checksum `f00a1c3b` independently reproduced — non-tautological. 5 findings applied in the working tree; 3 LOW deferred. Final gates green.

### Applied (patches)

| # | Sev | Location | Finding | Fix |
| - | --- | -------- | ------- | --- |
| 1 | HIGH→MED | `parser.ts` `findApprovalComments` | Single un-paginated `GET …/comment` silently drops approvals on Epics with >100 comments (Jira paginates). Unacceptable for an audit-integrity read. | Loop over `startAt`/`maxResults=100` until reported `total` reached (bounded by `MAX_COMMENT_PAGES`). Added `startAt`/`maxResults` to `JiraCommentListSchema`. Tests: multi-page surfacing + single-short-page stop. |
| 2 | MED | `parser.ts` `resolveNewestWins` | Composite `(user,cycle)` key used a non-documented ` ` delimiter (the source `\x20`-looking char was actually NUL). Inconsistent with the protocol's U+001F invariant. | Switched key delimiter to `U+001F` (`KEY_SEP`), matching the checksum canonical form; documented in PROTOCOL.md. |
| 3 | MED | `parser.ts` `resolveNewestWins` | A comment with unparseable `created` (NaN) encountered FIRST would win over later valid duplicates (`NaN > x` is always false), contradicting the "sorts oldest" comment. | Coerce `NaN` → `-Infinity` on both sides of the comparison. Test: NaN-first loses to a valid timestamp. |
| 4 | MED | `comment-schema.ts` `MARKER_RE` | Regex was unanchored despite a doc-comment claiming line-anchoring; a marker quoted mid-sentence in a human comment could be parsed as an approval (checksum-gated, but contract-violating). | Anchored to `^…/m`. Test: mid-sentence marker → `no-marker`. PROTOCOL.md updated. |
| 5 | MED | `comment-schema.ts` `ApprovalCommentV1Schema` | `restrictedCount: z.number()` admits floats/`Infinity`/`NaN`. Floats break the cross-engine byte-stability claim (`1e21`→`"1e+21"`); in-memory non-finite values produce a write-once/never-readable approval. | Tightened to `z.number().int().nonnegative()`. Tests: float and negative → `malformed`. PROTOCOL.md updated. Golden checksum unaffected (`restrictedCount:3`). |

### Deferred (LOW / no action)

- **U+001F injection into a string field** — neutralized by checksum recompute under the stated tamper-evidence (not anti-forgery) threat model; a test would only document already-safe behavior. Low value.
- **`adfToText` null/array/string inputs untested here** — `lib/adf.ts` is Story 2.6 scope; the parser already fails closed on `''`. Out of scope.
- **`verifyChecksum` (public) not consumed by parser** (uses private `verifyApprovalChecksum`) — both correct and tested; trivial DRY nit, not an AC violation.

### Notable confirmations (no defect)

Checksum self-exclusion, FIELD_SEP = U+001F, 8-hex truncation, fail-closed against all throws (JSON.parse/regex/slice), discriminatedUnion v≠1 handling, ADF single-paragraph round-trip, `Date.parse('+0000')` correctness, async awaiting, and `z.unknown()` body tolerance all verified correct.

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-06-27 — created (ready-for-dev)

; Epic 5 → in-progress (first story of Epic 5)
