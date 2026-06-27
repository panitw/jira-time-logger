---
baseline_commit: c9b67244a01b9f7b84ffd7bd9b5f235fe9487bd7
---
# Story 5.6: Approve Cycle — Per-Epic Fan-Out Posting of Versioned Comments

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a manager confident in a report's cycle,
I want to click "Approve [Person]" and have versioned-checksum approval comments fan out to every Epic they touched,
so that the cycle is approved atomically without my having to click N times.

## Acceptance Criteria

**AC1 — Row-end Approve button (FR32)**
**Given** the matrix is rendered and at least one row has hours
**When** that row's right-side action cell renders
**Then** a row-end **primary-tier** "Approve <Person>" button appears in brand-purple (`bg-accent` / `text-white` / `font-semibold`)
**And** the button is **disabled** (`neutral-300` text, `cursor-not-allowed`) when the row is currently approving (in-flight) OR the row is fully empty (no touched Epics to fan out to)
**And** a matching column-header cell ("Action" or empty) is added to the header row so the table stays rectangular.

**AC2 — Approve-confirm dialog (FR35)**
**Given** the user clicks "Approve <Person>"
**When** the approve-confirm dialog opens (shadcn/Radix `Dialog`, modal, focus-trapped)
**Then** it shows a one-line summary: **"Approve <Person>'s <Cycle>: <H>h across <N> Epics"** (H = row total hours via `secondsToHours`, N = touched-Epic count)
**And** if the row has any restricted-visibility worklogs (`ReportCycleWorklogs.restrictedCount > 0`), an additional line: **"⚠ N restricted-visibility worklog(s) excluded from your view; their count will be captured in the approval metadata for audit."**
**And** the dialog has **Cancel** (secondary, left) and **"Approve"** (primary, right); Esc cancels; backdrop click on this destructive/commit dialog requires explicit Cancel.

**AC3 — Fan-out posting via `lib/approval.ts` (FR33)**
**Given** the user confirms approval
**When** the fan-out runs (orchestrated in the service worker)
**Then** for **each Epic the report logged hours against during the cycle** (the row's touched-Epic set = `ReportCycleWorklogs.epics.map(e => e.epicKey)`), a versioned-checksum approval comment is posted via `POST /rest/api/3/issue/<epicKey>/comment`
**And** the comment body is built by: compute `at = new Date().toISOString()` ONCE for the whole fan-out → for each Epic compute `checksum = computeChecksum({ v:1, user, cycle, by, at, restrictedCount })` → `serializeApproval({ v:1, user, cycle, by, at, restrictedCount, checksum })` → `textToAdf(serialized)` → POST body `{ body: <AdfDoc> }`
**And** `user` = `report.accountId`, `cycle` = the matrix `cycle` prop **verbatim** (it is checksummed — never re-derive it), `by` = the **current manager's** accountId, `restrictedCount` = **that Epic's** `ReportEpicWorklogs.restrictedCount`
**And** each comment is posted **sequentially** through the scheduler (posts route through `jiraPost` → `scheduler.acquire`, never `Promise.all`)
**And** each post is a **separate retryable unit** — if Epic 3 of 5 fails, Epic 4 still attempts (no first-failure abort).

**AC4 — All posts succeed (FR30, FR39)**
**Given** all fan-out posts succeed
**When** the fan-out result is finalized
**Then** the affected `['epic-approvals', <epicKey>]` queries are invalidated so each touched cell re-renders with the **"Approved"** dark-green status (server-state via TanStack Query — do NOT flip a local "approved" flag)
**And** the matrix progress chip increments ("X of N done")
**And** the "Approve" button is replaced with a small **`✓ Done`** indicator.

**AC5 — Partial-success handling (FR33, NFR6, UX status-channel 2)**
**Given** some posts fail (e.g. 2 of 5 Epics returned a retryable error)
**When** the partial-success result is finalized
**Then** a **row-level status chip** appears: **"Approval partial — N of M Epics confirmed"** (durable; persists until state changes; has a `Tooltip` explaining what to do)
**And** the failed-Epic posts **enqueue in the outbox** (Story 2.7) and retry on connectivity recovery
**And** cells for **confirmed** Epics show "Approved" (their `['epic-approvals', epicKey]` query is invalidated individually); cells for **failed** Epics **retain prior state**
**And** the per-Epic comment body (already serialized with its computed checksum) is what gets enqueued, so a deferred retry posts the byte-identical, checksum-valid approval.

**AC6 — PTO Epics included in fan-out (PTO)**
**Given** the worker logged PTO days in the cycle
**When** the approval fan-out runs
**Then** the catch-all/PTO Epic is included automatically — PTO worklogs roll up to their owning Epic through `fetchReportCycleWorklogsByEpic`, so the touched-Epic set already contains it; **no special-casing of a PTO Epic key is needed** (PTO hours are approved like any other hours).

**AC7 — Re-post is append-only; never deletes (FR41, FR42)**
**Given** approval is for the same `(user, cycle)` as a prior approval (re-approval seam — see Story 5.7)
**When** the new comment posts
**Then** the new comment's Jira-native `created` timestamp becomes the new approval anchor by the parser's "newest-wins per (user, cycle)" rule (Story 5.1 / PROTOCOL.md)
**And** the old approval comment is **NOT deleted** (FR42 — append-only); it remains in Jira's timeline for audit
**And** approvals for a different `(user, cycle)` on the same Epic (another manager's approval) are unaffected (FR41 — multi-manager independence).

**AC8 — Tests**
**Given** the new modules are authored
**When** `./node_modules/.bin/vitest --run` runs
**Then** co-located Vitest tests cover (table-driven where helpful):
  - `lib/approval.ts` fan-out: all-success, partial (some Epics fail → confirmed set + failed set + outbox-enqueued set), empty touched-set guard, single-Epic, PTO-Epic included
  - payload assembly: `at` is computed once and shared across all Epics in one fan-out; per-Epic `restrictedCount` is used; `cycle`/`user`/`by` are exact; checksum recomputes-and-verifies via `parseApprovalComment` round-trip
  - `lib/jira-client.ts` `postComment`: body shape `{ body: <AdfDoc> }`, path `rest/api/3/issue/<urlencoded-key>/comment`, Result mapping (ok / rate-limited / network / forbidden / not-found)
  - outbox: a `comment`-kind entry enqueues, persists, and replays to `postComment` (drain → ok → removed)
  - `ApproveButton` component: disabled when empty/in-flight, confirm-dialog copy + restricted line, success → `✓ Done`, partial → status chip
  - progress chip: "X of N done" count derived from per-row approval state

## Tasks / Subtasks

- [x] **Task 1 — Add `postComment` helper to `lib/jira-client.ts`** (AC: #3, #8)
  - [x] Add `export async function postComment(issueKey: string, body: { body: AdfDoc }): Promise<Result<JiraComment, JiraError>>` mirroring `postWorklog`; route through `jiraPost(\`rest/api/3/issue/${encodeURIComponent(issueKey)}/comment\`, body, JiraCommentSchema)`. NOTE the v3 comment POST body nests the ADF under a `body` key — it is NOT the flat shape `postWorklog` uses.
  - [x] Confirm/extend `JiraCommentSchema` in `lib/jira-types.ts` parses the create response (`id`, `created`, `body: z.unknown()`); reuse it — do not invent a new schema.
  - [x] Co-locate tests in `lib/jira-client.test.ts` for the new helper (path, body shape, Result mapping). Follow the existing `postWorklog` test pattern.

- [x] **Task 2 — Create `lib/approval.ts` — pure/orchestration fan-out builder** (AC: #3, #4, #5, #6, #7, #8)
  - [x] Export a pure payload-builder: given `{ user, cycle, by, at, restrictedCount }` per Epic → compute checksum → `serializeApproval` → `textToAdf` → the POST body `{ body }`. Keep this React-free, no clock read inside (inject `at`). Reuse `computeChecksum` (`lib/checksum.ts`), `serializeApproval`/`ApprovalCommentV1` (`lib/comment-schema.ts`), `textToAdf` (`lib/adf.ts`). Do NOT reinvent serialization or checksum.
  - [x] Export `approveCycle(...)` orchestration: takes the touched-Epic set with per-Epic `restrictedCount`, `user`, `cycle`, `by`; computes `at` ONCE; iterates Epics **sequentially**, awaiting each `postComment` (which is scheduler-gated); accumulates `{ confirmed: epicKey[], failed: { epicKey, body, error }[] }`. On a retryable failure (`network` / `rate-limited`) enqueue the prebuilt body into the outbox as a `comment` op; on a non-retryable failure (`forbidden` / `not-found` / `parse-error`) record as failed WITHOUT enqueue (it will not succeed on retry). Never throw to the caller; return a structured result.
  - [x] Inject `postComment` and the outbox `enqueue` as dependencies (or import directly) so the fan-out is unit-testable with table-driven success/partial cases.
  - [x] Co-located `lib/approval.test.ts`: all-success, partial, empty guard, single-Epic, PTO-Epic-in-set, shared-`at` invariant, per-Epic-`restrictedCount`, round-trip parse of a built body.

- [x] **Task 3 — Extend the outbox to support comment posts (Story 2.7)** (AC: #5, #8)
  - [x] In `lib/storage/outbox.ts`: add a `'comment'` value to `OutboxKind` and to the Zod `OutboxEntrySchema` enum. Extend `OutboxJiraClient` with `postComment`. Add a `replay()` branch: `if (entry.kind === 'comment') return client.postComment(entry.issueKey, entry.body as { body: AdfDoc })`. (Current outbox is worklog-only and ignores `endpoint` on replay — `kind` is the dispatcher.)
  - [x] The enqueued `body` is the already-serialized ADF comment body `{ body: <AdfDoc> }` (so the deferred post is byte-identical / checksum-valid). `attemptCount` / `MAX_ATTEMPTS` / `failed` policy is reused unchanged.
  - [x] Update `lib/storage/outbox.test.ts` for the comment-kind enqueue + replay path. Update the stale file-comment that says "Posts never carry a comment in our enqueue paths."

- [x] **Task 4 — Wire the `approve-cycle` request through the SW message bus** (AC: #3, #4, #5)
  - [x] In `lib/messages.ts`: add `ApproveCycleRequestSchema` (`{ user, cycle, by, epics: { epicKey, restrictedCount }[] }`) and `ApproveCycleResponseSchema` (`{ confirmed: string[], failed: string[], enqueued: string[] }`), add `'approve-cycle'` to `RequestRegistry`, register both in `REQUEST_SCHEMAS`. Mirror the `log-worklog-request` request/response pattern exactly.
  - [x] Create `lib/approve-sw.ts` `handleApproveCycle(req)` mirroring `lib/banner-sw.ts` `handleLogWorklogRequest`: call `approval.approveCycle(...)`, return the structured result; transient failures are enqueued inside `approveCycle`.
  - [x] Register in `entrypoints/background.ts`: `onRequest('approve-cycle', (req) => handleApproveCycle(req));` (alongside the existing `log-worklog-request` registration).

- [x] **Task 5 — `ApproveButton` component + confirm dialog** (AC: #1, #2, #4, #5)
  - [x] Create `components/manager/ApproveButton.tsx`: states `ready | approving | done | partial`. Renders the row-end primary-tier brand-purple button; disabled (`neutral-300` / `cursor-not-allowed`) when empty or in-flight. On click opens the shadcn `Dialog` with the AC2 copy (summary line + conditional restricted line, Cancel left / Approve right).
  - [x] Use a `useMutation` that calls `sendRequest('approve-cycle', payload)`; on settle, invalidate `['epic-approvals', epicKey]` for each **confirmed** Epic (and `['manager-row', accountId, cycleId]` if needed) so cells flip to `approved`. On full success show `✓ Done`; on partial show the "Approval partial — N of M Epics confirmed" chip with a `Tooltip`.
  - [x] Co-located `ApproveButton.test.tsx`: mock `sendRequest` + `queryClient`; cover disabled states, dialog copy (with/without restricted line), success and partial outcomes. Mock the `@/lib/storage/settings` boundary (5-4 learned unmocked `targetHoursItem` leaks unhandled rejections).

- [x] **Task 6 — Integrate into `ManagerMatrix` + "X of N done" progress chip** (AC: #1, #4)
  - [x] In `components/manager/ManagerMatrix.tsx` `ManagerMatrixRow`, add a trailing `<td>` row-action cell (after `columns.map(...)`) rendering `<ApproveButton>` with the row's touched-Epic set (from the `resolved` map) + per-Epic `restrictedCount`. Add the matching header cell in `Header`.
  - [x] Expose the current manager's accountId (`by`): lift it out of `useManagerReports` (which already calls `rest/api/3/myself`) or add a small `useCurrentUser` hook. The report's accountId (`user`) is already in row scope as `report.accountId`.
  - [x] Build the "X of N done" progress chip in `Header`: N = `sortedReports.length`; done = count of rows whose every touched-Epic cell resolves to `approved` (derive from the same `useEpicApprovals` anchors the cells use). Update the chip text on approval success.
  - [x] Leave the Re-approve (dirty) affordance and the disabled/non-canonical button styling as **clean seams** for 5.7 / 5.8 (do not implement them here, but structure `ApproveButton`'s state union and props so they slot in without refactor).

- [x] **Task 7 — Gates** (AC: all)
  - [x] `./node_modules/.bin/eslint .` 0 errors; `./node_modules/.bin/tsc --noEmit` 0 errors; `./node_modules/.bin/vitest --run` all green (baseline after 5-5: 68 suites / ~871 passed / 1 skipped; 57 pre-existing import/order warnings tolerated). Use hyphenated Tailwind `state-*` / `accent` tokens.

## Dev Notes

### What 5-6 already has in hand (do NOT recompute)
- **Touched-Epic set per row** = `ReportCycleWorklogs.epics.map(e => e.epicKey)` from the `resolved: Map<accountId, ReportCycleWorklogs>` in `ManagerMatrix.tsx`. This is the fan-out target set and **already includes the catch-all/PTO Epic** when PTO was logged (AC6).
- **`restrictedCount`** is on both `ReportEpicWorklogs.restrictedCount` (per-Epic → goes into THAT Epic's payload) and `ReportCycleWorklogs.restrictedCount` (row sum → the dialog's "N restricted" line).
- **`cycle`** is the prop threaded `App.tsx → ManagerView → ManagerMatrix`. Use it **verbatim** in the payload — it is part of the checksum input. Do not re-derive from a date.
- **Read/state primitives** already built: `findApprovalComments` (`lib/parser.ts`), `approvalAtFor` / `isCycleDirty` (`lib/dirty-detect.ts`), `computeCellStatus` (`lib/manager-matrix.ts`), and the `useEpicApprovals`/`useManagerRow`/`useManagerReports` hooks.
- **Write primitives** already built: `serializeApproval` + `ApprovalCommentV1` (`lib/comment-schema.ts`), `computeChecksum` (`lib/checksum.ts`), `textToAdf` (`lib/adf.ts`), `jiraPost` (`lib/jira-client.ts`), `outbox.enqueue` (`lib/storage/outbox.ts`), the `onRequest`/`sendRequest` channel (`lib/messages.ts`).

### What 5-6 must build (the gaps the prior stories left)
1. **`postComment` helper** — does NOT exist in `lib/jira-client.ts`. Body shape `{ body: <AdfDoc> }` (ADF nested under `body`, unlike the flat worklog body). Route through `jiraPost` so it inherits auth + 401-refresh + scheduler + Result mapping for free.
2. **`lib/approval.ts`** — the fan-out orchestrator (`approveCycle`) + pure payload-builder. First WRITE in the manager surface.
3. **Outbox `comment` op** — current outbox is worklog-only; `kind` is the replay dispatcher (`endpoint` is stored but ignored). Add `'comment'` kind + schema enum value + `replay` branch + `OutboxJiraClient.postComment`.
4. **`approve-cycle` request type + SW handler + registration** — mirror `log-worklog-request` / `banner-sw.ts`.
5. **`ApproveButton.tsx`** + confirm dialog + integration into `ManagerMatrixRow` (trailing action `<td>`).
6. **"X of N done" progress chip** — `Header` currently shows only cycle title + report count.
7. **Expose manager `accountId` (`by`)** — `useManagerReports` resolves it via `rest/api/3/myself` but does not currently surface it to the matrix.

### The exact write recipe (PROTOCOL.md — do NOT deviate)
```
at = new Date().toISOString()            // computed ONCE per fan-out, shared across all Epics
for each touched Epic:
  payload = { v:1, user, cycle, by, at, restrictedCount: <thisEpic.restrictedCount> }
  checksum = await computeChecksum(payload)        // SHA-256, U+001F-joined, 8 hex chars
  serialized = serializeApproval({ ...payload, checksum })   // marker line + canonical JSON
  body = { body: textToAdf(serialized) }           // ADF nested under `body`
  result = await postComment(epicKey, body)        // scheduler-gated via jiraPost
```
- `serializeApproval` writes keys in FIXED order and does NOT compute the checksum — the caller (this story) computes it and sets it on the payload first. (`lib/comment-schema.ts` JSDoc confirms "the caller (5.6) computes it".)
- Checksum canonical fields, fixed order: `v, user, cycle, by, at, restrictedCount` (checksum excluded), `String()`-coerced, joined with ASCII Unit Separator `U+001F`, SHA-256, first 8 lowercase hex. Golden test pins a payload → `f00a1c3b`.
- `restrictedCount` MUST be a finite non-negative integer (FR35 — audit captures what was visible at THIS approval moment). Use the per-Epic count. (Open: Jira's worklog `total` window-scoping is unconfirmed — 5-4 treats restrictedCount as an upper-bound indicator; persist what the per-row query reports.)

### Partial-failure / idempotency / retry semantics
- **Append-only, read-side idempotency.** Fan-out does NOT find-and-update; it always POSTs a fresh comment. Re-posting (Story 5.7 re-approve, or an outbox retry) is safe because the parser's "newest-wins per (user, cycle)" rule (by Jira-native `created`) resolves duplicates at read time. Never delete or PUT a prior approval comment (FR42).
- **Per-Epic isolation.** No `Promise.all` — sequential awaited posts so the scheduler throttles (~2 req/s) and one failure never aborts the rest.
- **Retryable vs terminal.** `network` / `rate-limited` → enqueue the prebuilt body in the outbox (retried by the SW `outbox-retry` alarm on reconnect, `MAX_ATTEMPTS=10`). `forbidden` / `not-found` / `parse-error` → record failed, do NOT enqueue (won't succeed on retry). The architecture's "max 3 retries on a single user-initiated action" governs the in-flight attempt; durable retry is the outbox's job.
- **Cell reconciliation.** Confirmed Epics → invalidate `['epic-approvals', epicKey]` individually so only those cells flip to `approved`. Failed Epics keep prior state. The row chip "Approval partial — N of M Epics confirmed" persists until the outbox drains and a subsequent invalidation flips the remaining cells.

### Project structure / conventions
- Pure logic → `lib/*.ts` + co-located `lib/*.test.ts` (React-free, no chrome/network). Hooks → `hooks/*.ts(x)`. Components → `components/manager/*.tsx` + co-located `*.test.tsx`.
- Named exports only; no barrel files; `@/` alias; kebab-case lib files / `PascalCase.tsx` components.
- No inline `*3600` / `/3600` — use `secondsToHours` / `hoursToSeconds` (`lib/hours.ts`). No `console.log` — use `lib/log.ts`.
- All HTTP through `jiraGet`/`jiraPost`/`postComment` → the SW token-bucket scheduler. Never raw `fetch`. Never `Promise.all` fan-out that aborts on first failure.
- Server state via TanStack Query + invalidation — NOT local "approved" flags. Match the as-built single-file `ManagerMatrix.tsx` (do not split into separate cell files unless it reads cleaner).
- Tailwind: hyphenated `state-*` / `accent` tokens only (the recurring 4.2/5.4 trap — underscore/dot forms from planning docs do NOT exist in the theme).

### Component / status mapping reference (from 5-4, do not change)
| status | classes | lucide icon |
|---|---|---|
| `approved` | `bg-state-success text-white border …` | `Check` |
| `on-target` | `bg-state-success-subtle text-state-success` | `Check` |
| `gap` | `bg-state-danger-subtle text-state-danger` | `AlertCircle` |
| `dirty` | `bg-state-warning-subtle text-state-warning` + 45° stripe | `RefreshCw` |
| `unapproved-neutral` | `text-neutral-900` | none |

Brand-purple primary tier: `accent` (`#6b5b95`, hover `#5a4d7e`). Disabled: `neutral-300` text + `cursor-not-allowed`, always paired with an explanation (never a mystery-disabled button).

### Testing standards
- Vitest, co-located, table-driven for pure modules (no mocks). Component tests mock the hooks (`useManagerRow`, `useEpicApprovals`, `useManagerReports`, `sendRequest`) and the `@/lib/storage/settings` boundary. Run binaries via `./node_modules/.bin/*` (`npx` is proxied).
- Gates: `eslint` 0 errors, `tsc --noEmit` 0 errors, `vitest --run` all green.

### Seams left for downstream stories (keep clean)
- **5.7 Re-approve dirty:** structure `ApproveButton`'s state union (`ready | approving | done | partial`) and props so a `dirty`/re-approve variant (secondary-tier label, "supersedes prior approval from <at>" dialog line) slots in. The fan-out recomputes the touched-Epic set at approve time (re-approval will reuse `approveCycle` unchanged). Do NOT special-case dirty here.
- **5.8 Non-canonical read-only:** the disabled-Approve-with-tooltip styling for non-canonical managers is 5.8's job. Keep the `disabled` reasoning a prop input to `ApproveButton` (empty/in-flight now; canonicality added later) so 5.8 only passes a new disabled reason + tooltip.

### Project Structure Notes
- New files: `lib/approval.ts` (+ test), `lib/approve-sw.ts` (+ test), `components/manager/ApproveButton.tsx` (+ test).
- Modified files: `lib/jira-client.ts` (+ `postComment`), `lib/jira-types.ts` (confirm `JiraCommentSchema`), `lib/storage/outbox.ts` (+ `comment` kind), `lib/messages.ts` (+ `approve-cycle`), `entrypoints/background.ts` (register handler), `components/manager/ManagerMatrix.tsx` (row action cell + progress chip), and a current-user accountId source (`hooks/useManagerReports.ts` or new `hooks/useCurrentUser.ts`).
- The architecture's aspirational separate `MatrixCell.tsx`/`DirtyIndicator.tsx` were not created in 5-3/5-4; match the as-built single-file `ManagerMatrix.tsx`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.6] — full AC text, fan-out + partial-failure spec.
- [Source: PROTOCOL.md] — machine-marker, v=1 payload, checksum algorithm (U+001F, SHA-256, 8 hex, golden `f00a1c3b`), newest-wins per (user, cycle) by Jira `created`, fail-closed parser.
- [Source: lib/comment-schema.ts] — `serializeApproval`, `ApprovalCommentV1` (`restrictedCount: z.number().int().nonnegative()`); JSDoc: "caller (5.6) computes checksum".
- [Source: lib/checksum.ts] — `computeChecksum(ChecksumPayload)`; canonical-order fields, `crypto.subtle.digest` SHA-256, 8-char hex.
- [Source: lib/adf.ts] — `textToAdf(text): AdfDoc`; comment POST body is `{ body: <AdfDoc> }`.
- [Source: lib/jira-client.ts] — `jiraPost<T>(path, body, schema)` (auth + 401-refresh + scheduler + Result); `postWorklog` is the sibling pattern; `postComment` does NOT exist yet.
- [Source: lib/storage/outbox.ts] — `enqueue`, `OutboxEntry`/`OutboxKind` (`post|put|delete`), `replay` dispatches on `kind`, `runOutboxRetryPass`, `MAX_ATTEMPTS=10`; SW `outbox-retry` alarm in `entrypoints/background.ts`.
- [Source: lib/messages.ts] — `RequestRegistry` / `sendRequest` / `onRequest`; `log-worklog-request` is the request/response pattern to mirror. [Source: lib/banner-sw.ts] — `handleLogWorklogRequest` write-pathway + outbox-on-failure pattern.
- [Source: lib/jira-types.ts] — `ReportEpicWorklogs` (`epicKey`, `totalSeconds`, `restrictedCount`, `worklogs[]`), `ReportCycleWorklogs` (`epics[]`, row-sum `restrictedCount`); `JiraCommentSchema`.
- [Source: lib/dirty-detect.ts] — `approvalAtFor`, `isCycleDirty`, `WorklogTimes`. [Source: lib/manager-matrix.ts] — `computeCellStatus`, `CellStatus` union, `buildMatrixColumns`.
- [Source: hooks/useManagerRow.ts, hooks/useEpicApprovals.ts, hooks/useManagerReports.ts] — query keys `['manager-row', accountId, cycleId]`, `['epic-approvals', epicKey]`, `['manager-reports']`; `myself` accountId resolution.
- [Source: components/manager/ManagerMatrix.tsx] — `ManagerMatrixRow` (row-action seam after `columns.map`), `Header` (progress-chip seam), `STATUS_CLASSES`.
- [Source: lib/catch-all.ts, lib/pto.ts, lib/storage/settings.ts] — catch-all is a PROJECT key + PTO subtask key; no stored "catch-all Epic key" — PTO rolls up to its owning Epic automatically.
- [Source: _bmad-output/planning-artifacts/prd.md] — FR32 (one-action approve), FR33 (fan-out checksummed comment per touched Epic), FR35 (restrictedCount audit), FR39 (dirty), FR41 (multi-manager independence), FR42 (never delete), NFR6 (offline-tolerant retry), NFR7 (fail-closed parser), NFR8 (forward-compat read).
- [Source: _bmad-output/planning-artifacts/architecture.md] — Manager-approves data-flow (`ApproveButton` useMutation → `approve-cycle` SW message → `lib/approval.approveCycle` → per-Epic sequential through scheduler → `postComment` → invalidate approval queries); outbox + chrome.alarm retry; Retry-After respected unconditionally.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — `ApproveButton` (`components/manager/ApproveButton.tsx`, states ready/approving/done/dirty), row-end brand-purple; "X of N done" header chip; partial chip "Approval partial — N of M Epics confirmed" (status channel 2, durable, with Tooltip); `✓ Done`; modal confirm dialog (Cancel left / primary right, Esc cancels, Radix focus trap); disabled = `neutral.300` + `cursor-not-allowed`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8)

### Debug Log References

- Fixed a React `act()`/render-loop heap-OOM in `ManagerMatrix.test.tsx`: a new
  test used `rowMock.mockImplementation` returning a fresh object per call,
  which made the parent's reference-deduped `resolved`-map effect loop forever.
  Switched to stable per-account row objects (matches the existing
  `mockReturnValue` convention). This was a test-mock artifact, not a product
  bug — the real hooks return reference-stable query data.
- Moved the row's `onApprovalState` `useEffect` ABOVE the loading/error early
  returns to satisfy `react-hooks/rules-of-hooks` (no conditional hook).
- Mocked `@/hooks/useCurrentUser` in `ManagerView.test.tsx` (and added it to
  `ManagerMatrix.test.tsx`) so the matrix's new `myself` resolution never hits
  the unmocked wxt storage boundary (the recurring 5-4 unhandled-rejection
  pattern).

### Completion Notes List

- **Task 1** — Added `postComment(issueKey, { body: AdfDoc })` to
  `lib/jira-client.ts`, routed through `jiraPost` (inherits auth + 401-refresh +
  scheduler + Result mapping). The v3 comment body nests ADF under `body`
  (NOT the flat worklog shape). Reused the existing `JiraCommentSchema`
  (`id`, `created`, `body: z.unknown()`) — no new schema. Co-located 7 tests.
- **Task 2** — Created `lib/approval.ts`: pure `buildApprovalBody` (compute
  checksum → `serializeApproval` → `textToAdf` → `{ body }`, clock injected) and
  the `approveCycle` orchestrator (computes `at` ONCE, fans out SEQUENTIALLY,
  never `Promise.all`, never throws). Retryable (`network`/`rate-limited`) →
  enqueue the prebuilt body as a `comment` outbox op; terminal
  (`forbidden`/`not-found`/`parse-error`) → record failed WITHOUT enqueue. An
  unexpected throw is treated as retryable. `postComment`/`enqueue`/`now`
  injected for table-driven tests (16 tests incl. round-trip parse + shared-`at`
  + per-Epic `restrictedCount` invariants).
- **Task 3** — Extended `lib/storage/outbox.ts` with the `comment` kind (enum +
  Zod), `OutboxJiraClient.postComment`, and a `replay` branch dispatching on
  `kind`. Replaced the stale "Posts never carry a comment" comment. 3 new tests
  (enqueue+replay drain, malformed-no-body → failed, transient → retry → drain).
- **Task 4** — Added `ApproveCycleRequestSchema`/`ApproveCycleResponseSchema` +
  `approve-cycle` to `RequestRegistry`/`REQUEST_SCHEMAS` (mirrors
  `log-worklog-request`). Created `lib/approve-sw.ts` `handleApproveCycle`
  (delegates to `approveCycle`, flattens to `{confirmed, failed, enqueued}`,
  never throws). Registered in `entrypoints/background.ts`. 4 handler tests.
- **Task 5** — Created `components/manager/ApproveButton.tsx`: state union
  `ready | approving | done | partial`; row-end primary-tier brand-purple
  button (`bg-accent`/`text-white`/`font-semibold`); disabled (with explanatory
  `title`) when empty/in-flight or when a `disabledReason` prop is set (5.8
  seam). Confirm `Dialog` with the AC2 summary + conditional restricted line,
  Cancel-left/Approve-right, backdrop-click suppressed (commit dialog). On
  settle invalidates `['epic-approvals', epicKey]` per CONFIRMED Epic (server-
  state, no local flag); full success → `✓ Done`, partial → durable
  "Approval partial — N of M Epics confirmed" chip with explanatory tooltip.
  10 tests.
- **Task 6** — Integrated `<ApproveButton>` as a trailing row-action `<td>` in
  `ManagerMatrixRow` + a matching `Action` header cell (table stays
  rectangular; the pending/error/empty single-cell rows span the extra column).
  Added the `useCurrentUser` hook (`['current-user']`, `myself` accountId) for
  the manager `by` (kept `useManagerReports`'s return shape stable). Built the
  "X of N done" progress chip in `Header`: each `MatrixCell` lifts its
  `CellStatus` to the row, the row derives "all touched-Epic cells approved" and
  lifts that to the parent, which counts done rows — all from the SAME
  `useEpicApprovals` anchors the cells paint with (no local approved flag).
  5.7 (re-approve dirty) and 5.8 (non-canonical read-only) left as clean seams:
  the state union + `disabledReason` prop slot them in without refactor. 3 new
  matrix tests + 2 `useCurrentUser` hook tests; updated 2 prior guard tests
  that asserted 5.6 was absent.
- **Task 7 — Gates:** `eslint .` → 0 errors / 57 warnings (all pre-existing
  import/order, matches baseline); `tsc --noEmit` → 0 errors; `vitest --run` →
  72 suites / 915 passed / 1 skipped (baseline was 68 / 871 / 1).
- No new npm dependencies added.

### File List

**Created**
- `lib/approval.ts`
- `lib/approval.test.ts`
- `lib/approve-sw.ts`
- `lib/approve-sw.test.ts`
- `components/manager/ApproveButton.tsx`
- `components/manager/ApproveButton.test.tsx`
- `hooks/useCurrentUser.ts`
- `hooks/useCurrentUser.test.tsx`

**Modified**
- `lib/jira-client.ts` (+ `postComment`; import reorder)
- `lib/jira-client.test.ts` (+ `postComment` describe block)
- `lib/storage/outbox.ts` (+ `comment` kind, `OutboxJiraClient.postComment`, replay branch)
- `lib/storage/outbox.test.ts` (+ comment-kind enqueue/replay tests)
- `lib/messages.ts` (+ `approve-cycle` request/response schemas + registry)
- `entrypoints/background.ts` (register `approve-cycle` handler)
- `components/manager/ManagerMatrix.tsx` (row-action cell, progress chip, manager accountId, per-row approval-state lift)
- `components/manager/ManagerMatrix.test.tsx` (mocks + new/updated tests)
- `components/manager/ManagerView.test.tsx` (mock `useCurrentUser`)

## Review Findings (code-review, 2026-06-27)

Fresh-context adversarial review (Blind Hunter + Edge Case Hunter + Acceptance
Auditor) of the uncommitted working tree vs baseline `c9b6724`. The write recipe
is honored exactly: `at` computed once and shared, per-Epic `restrictedCount`
checksum-covered, fixed key order, U+001F/SHA-256/8-hex checksum, `{ body: <AdfDoc> }`
v3 comment shape (verified against Jira API), sequential fan-out (no `Promise.all`),
append-only, round-trip `serialize→textToAdf→adfToText→parseApprovalComment`
verified. No HIGH/MEDIUM finding survived triage unfixed.

### Patched (4)
1. **PATCH — `ApproveButton` terminal state never reset on subject change** (blind+edge, MEDIUM). A reused button instance kept a stale `✓ Done`/partial chip when the matrix `cycle`/`user` changed. Added a `useEffect` keyed on `[user, cycle]` that resets `state`/`confirmedCount`/`anyEnqueued`/`open` back to `ready`. (`ApproveButton.tsx`) + test.
2. **PATCH — partial chip falsely promised auto-retry for non-enqueued failures** (blind+edge, HIGH). Terminal failures (`forbidden`/`not-found`/`parse-error`) and a null SW response are `failed` but NOT `enqueued`; the fixed tooltip claimed "will retry automatically." Now tracks `anyEnqueued` from `res.enqueued` and shows a no-auto-retry message ("Re-approve to try again") when nothing was queued. (`ApproveButton.tsx`) + test.
3. **PATCH — duplicate `epicKey` double-posted and over-counted `confirmed`** (edge, HIGH). `approveCycle` now dedupes the touched-Epic set by `epicKey` (first occurrence wins) before the fan-out, so `confirmed.length` can never exceed the unique set. (`lib/approval.ts`) + test.
4. **PATCH — empty `by`/`user` could land a blank-approver audit comment** (edge, MEDIUM). `ApproveCycleRequestSchema` now requires `.min(1)` on `user`/`cycle`/`by`/`epicKey` (fail-closed before `approveCycle`); the matrix also disables the button when `managerAccountId === ''` (not just `undefined`). (`lib/messages.ts`, `ManagerMatrix.tsx`)

### Deferred (4 — real but out of scope / pre-existing / low-value)
- **`cellStatuses` map never pruned** (blind, LOW). `allApproved` reads only current `touchedEpics`, so stale keys are inert; pruning adds complexity for a one-render theoretical edge. Deferred.
- **`total` (partial denominator) read at render not mutation time** (blind+edge, MEDIUM→low impact). The dialog is modal and the button is hidden while approving, so `epics` is stable in practice. Deferred.
- **Outbox double-drain not serialized across popup/SW** (edge, MEDIUM). Pre-existing Story 2.7 limitation, explicitly documented in `outbox.ts`; newest-wins absorbs a double-post. Not caused by 5.6. Deferred.
- **Disabled-button `title` tooltip unreachable via hover (`disabled:pointer-events-none`)** (auditor, LOW). Cosmetic; the `title` stays in the DOM for assistive tech, and the fix would alter the shared `ui/button.tsx` design-system primitive — out of 5.6 scope. Deferred.

### Dismissed (6)
Progress chip reverting on a failed approval refetch (by-design server-state per AC4); self-approve unguarded (no spec requirement; append-only/audited); `auth-expired` terminal classification (correct, JSDoc-documented); per-Epic vs row-sum `restrictedCount` in the dialog (AC2 specifies row-sum in the dialog, per-Epic in the comment); unchecked `comment` body cast in outbox replay (pre-existing pattern; enqueue path always writes well-formed bodies); `enqueue`-throw recorded as `enqueued:false` (subsumed by patch #2's tooltip).

### Gates after patches
- `vitest --run`: **72 suites / 918 passed / 1 skipped** (baseline 72/915/1; +3 new tests).
- `tsc --noEmit`: **0 errors**.
- `eslint .`: **0 errors / 57 warnings** (all pre-existing import/order; matches baseline).

## Change Log

| Date | Version | Description |
|---|---|---|
| 2026-06-27 | 1.0 | Story 5.6 implemented: `postComment` helper, `lib/approval.ts` per-Epic sequential fan-out with partial-failure/outbox-`comment`-op handling, `approve-cycle` SW message + `approve-sw.ts` handler, `ApproveButton` + confirm dialog, ManagerMatrix row-action cell + "X of N done" progress chip + `useCurrentUser`. Gates green (eslint 0e, tsc 0e, vitest 72/915/1). Status → review. |
