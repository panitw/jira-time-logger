---
baseline_commit: bf240d495a8ea1a9c4f104a0b45531caf7f888af
---
# Story 5.7: Re-Approve Dirty Cycles

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a manager whose report edited a worklog after I approved,
I want a "Re-approve" affordance that supersedes the prior approval with a new versioned comment,
so that the audit timeline reflects the latest approved state and the dirty (yellow-stripe) warning clears.

## Acceptance Criteria

**AC1 — Dirty rows show a "Re-approve" affordance instead of "Approve" (FR37, UX-DR17)**
**Given** a row has at least one cell in `dirty` (yellow-stripe) status (Story 5.4: an approval exists for this `(user, cycle)` AND a covered worklog's `updated` is later than the approval `at`)
**When** the row's right-side action cell renders
**Then** the row-end action becomes **"Re-approve <Person>"** rendered in **secondary tier** (`Button variant="secondary"` — transparent bg / `neutral-700` text / `neutral-200` border), NOT the brand-purple primary, because re-approval is a deliberate corrective action
**And** it visibly replaces the regular primary "Approve <Person>" button for that row (a row is never showing both)
**And** a row with NO dirty cell keeps the Story 5.6 behavior unchanged: primary "Approve <Person>" when unapproved, `✓ Done` when fully approved-and-clean.

**AC2 — Re-approve confirm dialog shows the supersede line (UX-DR17)**
**Given** the user clicks "Re-approve <Person>"
**When** the same approve-confirm `Dialog` opens (modal, focus-trapped, backdrop-click suppressed, Esc cancels — identical mechanics to Story 5.6)
**Then** it shows the same one-line summary: **"Re-approve <Person>'s <Cycle>: <H>h across <N> Epics"** (verb changes to "Re-approve"; H = row total via `secondsToHours`, N = touched-Epic count)
**And** an additional line: **"Re-approving — supersedes prior approval from <prior approval's `at`, formatted>"** where the prior `at` is the dirty row's existing approval anchor (`approvalAtFor(...)`)
**And** the restricted-visibility line (Story 5.6 AC2) still appears when `restrictedCount > 0`
**And** Cancel (secondary, left) / "Re-approve" (this dialog's primary commit action, right).

**AC3 — Re-approval reuses `approveCycle` unchanged; fan-out recomputed at click time (FR33)**
**Given** the user confirms re-approval
**When** the fan-out runs
**Then** it calls the **same** `approve-cycle` SW request → `lib/approval.ts` `approveCycle(...)` as Story 5.6 with **no new fan-out code path** — re-approval is just another append-only approval that supersedes via newest-wins
**And** the fan-out target set is **recomputed from the row's CURRENT touched-Epic set** (`ReportCycleWorklogs.epics.map(e => e.epicKey)`) at click time — NOT copied from the prior approval — so it covers **both previously-approved Epics AND any new Epics the report logged hours against since the prior approval**
**And** each per-Epic payload uses **that Epic's CURRENT `restrictedCount`** (audit captures what was visible at THIS approval moment, which may differ from the prior approval's `restrictedCount`)
**And** `at = new Date().toISOString()` is computed ONCE for the whole fan-out (the new anchor); `user`/`cycle`/`by` are identical to Story 5.6 (cycle used verbatim — it is checksummed).

**AC4 — Newest-wins supersession clears dirty (FR39, FR42, Story 5.1)**
**Given** the re-approval fan-out posts succeed
**When** the affected `['epic-approvals', <epicKey>]` queries are invalidated and the cells re-read
**Then** the parser's "newest-wins per (user, cycle)" rule (by Jira-native `created`) makes the new comment the authoritative anchor, so the new (later) `at` supersedes the stale one
**And** `isCycleDirty` re-computes against the new `at`: cells whose worklogs were edited before the new `at` are no longer dirty → they flip from `dirty` (yellow-stripe) back to `approved` (dark-green), clearing the warning
**And** the old approval comment is **NOT deleted** (FR42 — append-only); it stays in Jira's timeline for audit
**And** the button returns to `✓ Done` when the row is fully approved-and-clean again.

**AC5 — Re-approval partial-success reuses Story 5.6 handling (NFR6, UX status-channel 2)**
**Given** some re-approval posts fail
**When** the partial result is finalized
**Then** the SAME partial path as Story 5.6 applies: row-level "Approval partial — N of M Epics confirmed" chip; retryable failures (`network`/`rate-limited`) enqueue in the outbox as `comment` ops and replay on reconnect; terminal failures (`forbidden`/`not-found`/`parse-error`) are recorded failed WITHOUT enqueue
**And** confirmed Epics flip to `approved`/clean; **failed Epics retain their prior `dirty` state** (their stale anchor is unchanged, so they remain dirty and still demand re-approval).

**AC6 — A row dirty on some cells but with newly-added Epics re-approves the whole touched set (FR33)**
**Given** a row is dirty on some cells AND the report has logged hours on a NEW Epic since the prior approval (the new Epic shows as `gap`/`on-target`, never approved before)
**When** re-approval fans out
**Then** new approval comments post to **ALL** Epics in the recomputed touched set — both the previously-approved (now dirty) Epics AND the new ones — so the entire current cycle is freshly approved in one action (this is why the affordance is row-level "Re-approve <Person>", not a per-cell action).

**AC7 — Re-approve preserves the 5.8 read-only seam**
**Given** Story 5.8 will pass a non-canonical `disabledReason`
**When** a dirty row belongs to a report the current user cannot approve
**Then** the disabled-reason path still wins (the button is disabled with its tooltip whether it would otherwise render "Approve" or "Re-approve") — the `disabledReason` prop continues to gate both modes; do NOT special-case re-approve around it.

**AC8 — Tests**
**Given** the changes are authored
**When** `./node_modules/.bin/vitest --run` runs
**Then** co-located Vitest tests cover:
  - `ApproveButton`: `reapprove` mode renders the secondary-tier "Re-approve <Person>" label; the confirm dialog shows the supersede line with the formatted prior `at`; success → `✓ Done`; partial → the existing partial chip; `disabledReason` still disables in re-approve mode (AC7)
  - `ManagerMatrixRow` / `ManagerMatrix`: a row with a `dirty` cell drives `mode='reapprove'` + threads the prior approval `at`; a row with no dirty cell stays primary "Approve"; a fully-clean approved row shows `✓ Done`; a row dirty on some cells with a new Epic passes the FULL current touched set to `ApproveButton` (AC6)
  - regression: the existing Story 5.6 `ApproveButton`/matrix tests (approve flow, progress chip "X of N done", disabled empty/in-flight) remain green — `approveCycle`/`lib/approval.ts`/`approve-sw.ts`/outbox are **not** modified, so their suites need no change.

## Tasks / Subtasks

- [x] **Task 1 — Extend `ApproveButton` with a re-approve mode** (AC: #1, #2, #4, #5, #7, #8)
  - [x] In `components/manager/ApproveButton.tsx`, add two props: `mode?: 'approve' | 'reapprove'` (default `'approve'`) and `priorApprovalAt?: string` (the dirty row's existing approval anchor, used only in `reapprove` mode for the supersede line). Do NOT change the existing state union (`ready | approving | done | partial`) — re-approve is a label/variant/dialog-copy variation over the same machine, exactly as the Story 5.6 seam intended.
  - [x] When `mode === 'reapprove'`: render the ready-state `Button` with `variant="secondary"` and label **"Re-approve <Person>"**; the dialog title verb becomes "Re-approve" and the dialog adds a supersede line: **"Re-approving — supersedes prior approval from <formatted priorApprovalAt>"**. When `mode === 'approve'`: behavior is byte-for-byte the current Story 5.6 (primary "Approve <Person>"). Add the strings to the `STRINGS` block (reuse the parameterized `summary`/`restricted` helpers; do not fork them needlessly).
  - [x] Format `priorApprovalAt` for display with the project's existing date formatting (prefer a `date-fns` `format` consistent with how other surfaces render ISO timestamps; fall back to showing the raw ISO if `priorApprovalAt` is missing/unparseable — never crash). Keep it human-readable but unambiguous.
  - [x] The `mutationFn` / `onSuccess` / `onError` / outbox / invalidate logic is UNCHANGED — re-approve fires the same `sendRequest('approve-cycle', …)` payload. Confirmed Epics invalidate `['epic-approvals', epicKey]`; the cells then re-read and `isCycleDirty` clears against the new `at` (AC4). The `[user, cycle]` reset effect stays as-is.
  - [x] `disabledReason` continues to gate BOTH modes (AC7) — keep the existing `disabled = isEmpty || inFlight || disabledReason !== undefined` check; do not add a re-approve-specific bypass.
  - [x] Update `components/manager/ApproveButton.test.tsx`: add re-approve-mode cases (secondary label, supersede dialog line with formatted `at`, success→Done, partial chip, `disabledReason` disables in re-approve mode). Keep the `@/lib/storage/settings` boundary mocked (the recurring 5-4 unhandled-rejection trap).

- [x] **Task 2 — Derive the dirty signal + prior `at` in `ManagerMatrixRow` and drive the button mode** (AC: #1, #2, #3, #6)
  - [x] `ManagerMatrixRow` already lifts each cell's `CellStatus` into the `cellStatuses` map (via `handleCellStatus`). Derive `anyDirty = touchedEpics.some((e) => cellStatuses.get(e.epicKey) === 'dirty')`. Pass `mode={anyDirty ? 'reapprove' : 'approve'}` to `<ApproveButton>`.
  - [x] Thread the prior approval anchor: the row needs ONE prior `at` for the supersede line. Lift it from the cells the same way `cellStatuses` is lifted — extend the cell→row callback (or add a sibling map) so each `MatrixCell` reports its resolved `approvalAt` (it already computes `approvalAt = approvalAtFor(approvals, report.accountId, cycle)`). In the row, pick the prior `at` from a dirty cell (all dirty cells of one `(user, cycle)` share the same approval anchor — newest-wins per pair — so any dirty cell's `approvalAt` is correct). Pass it as `priorApprovalAt`.
  - [x] The fan-out target set passed to `ApproveButton` (`touchedEpics`) is ALREADY the row's full current touched set with per-Epic `restrictedCount` (Story 5.6) — do NOT filter it down to only dirty Epics. Re-approval posts to the whole current touched set (AC3/AC6). No change needed here beyond confirming it.
  - [x] Do NOT change `approvedRows`/`allApproved`/`doneCount` semantics: a dirty row is (correctly) not counted as done because a `dirty` cell is not `approved`. After a successful re-approval the cells flip to `approved`, `allApproved` becomes true, and the "X of N done" chip increments — all via the existing server-state lift (no local flag).

- [x] **Task 3 — Tests for the matrix wiring** (AC: #1, #3, #6, #8)
  - [x] Update `components/manager/ManagerMatrix.test.tsx`: a row whose cell resolves to `dirty` drives `ApproveButton` `mode='reapprove'` and threads a `priorApprovalAt`; a non-dirty unapproved row stays `mode='approve'`; a row dirty on some cells but with an additional non-approved Epic still passes the FULL touched set (AC6). Continue mocking `useCurrentUser`, `useManagerRow`, `useEpicApprovals`, and the `@/lib/storage/settings` boundary; use stable per-account row objects / `mockReturnValue` (the 5.6 heap-OOM lesson: never return a fresh object per call from a row mock).

- [x] **Task 4 — Gates** (AC: all)
  - [x] `./node_modules/.bin/eslint .` 0 errors (pre-existing import/order warnings tolerated — baseline 57); `./node_modules/.bin/tsc --noEmit` 0 errors; `./node_modules/.bin/vitest --run` all green (baseline after 5-6 code-review: 72 suites / 918 passed / 1 skipped). Use hyphenated Tailwind `state-*` / `accent` tokens only.

## Dev Notes

### Why this is a small, UI-only story (read this first)
Story 5.6 deliberately built `approveCycle` and `ApproveButton` so that re-approval is **not new write logic** — re-approval is just another append-only approval that supersedes via the parser's newest-wins rule. The entire write path (`lib/approval.ts`, `lib/approve-sw.ts`, the `approve-cycle` message, the outbox `comment` op, `postComment`) is **unchanged** in this story. The new work is exclusively the **dirty-aware UI**: a distinct secondary-tier "Re-approve" button variant, the supersede dialog line, and wiring the row's existing dirty signal to pick the mode. See `ApproveButton.tsx` JSDoc (lines 16–31) and Story 5.6 "Seams left for downstream stories" — both explicitly reserved this seam.

### What already exists (do NOT rebuild)
- **Dirty detection (Story 5.4).** `isCycleDirty(worklogs, approvalAt)` and `approvalAtFor(approvals, user, cycle)` in `lib/dirty-detect.ts`; `computeCellStatus` returns `'dirty'` when an approval exists AND a covered worklog's `updated` > approval `at`. Dirty supersedes approved (decision order in `computeCellStatus`, `lib/manager-matrix.ts` lines 143–169). The yellow-stripe paint (`DIRTY_STRIPE_STYLE`, `RefreshCw` icon, "needs re-approval" text) is already in `ManagerMatrix.tsx`.
- **Cell→row status lift.** `ManagerMatrixRow` already maintains `cellStatuses: Map<epicKey, CellStatus>` via `handleCellStatus`, and each `MatrixCell` already computes its `approvalAt`. You are EXTENDING this lift to also surface `dirty`-ness and the prior `at` — not adding a new query.
- **The fan-out (`approveCycle`) + `approve-cycle` SW message + outbox `comment` op + `postComment`** — built and code-reviewed in Story 5.6. Re-approve calls the identical `sendRequest('approve-cycle', { user, cycle, by, epics })`. The recipe (`at` computed once, per-Epic `restrictedCount`, U+001F/SHA-256/8-hex checksum, `{ body: <AdfDoc> }`, sequential fan-out, append-only) is in 5.6 and PROTOCOL.md — do not touch it.
- **Newest-wins (Story 5.1 / PROTOCOL.md).** `findApprovalComments` keeps only the latest comment per `(user, cycle)` by Jira-native `created`. A re-posted comment has a newer `created`, so it wins automatically at read time. This is what clears dirty — NO delete/PUT of the old comment (FR42).
- **`Button variant="secondary"`** already exists (`components/ui/button.tsx` lines 19–20: transparent bg / `neutral-700` text / `neutral-200` border). Use it for re-approve. `variant="primary"` stays for initial approve.

### The supersession mechanic (how dirty clears) — exact chain
1. Re-approve fan-out posts a fresh comment per touched Epic with a NEW `at` (= now) and NEW `created` (Jira-assigned, later than the prior).
2. `onSuccess` invalidates `['epic-approvals', epicKey]` for each confirmed Epic.
3. The cell's `useEpicApprovals` refetches; `findApprovalComments` returns the NEW comment (newest `created` wins).
4. `approvalAtFor` now returns the new (later) `at`; `isCycleDirty(cellWorklogTimes, newAt)` is `false` because the worklogs' `updated` predates the new `at`.
5. `computeCellStatus` → `approved`; the cell repaints dark-green (was yellow-stripe). The row's `allApproved` becomes true → progress chip increments. All server-state; no local flag.
6. If a worklog is edited AGAIN after this new `at`, the cell re-flags dirty (AC4 "typically zero immediately after re-approval"). Expected and correct.

### Decision: re-approve posts to the WHOLE current touched set (not only dirty Epics)
Per epics.md Story 5.7 AC ("posted to ALL Epics the report touched during the cycle — both previously-approved Epics AND new ones … recomputed at re-approval time, not copied from the prior approval", FR33). The row already passes `touchedEpics` = the full current set to `ApproveButton`; **keep it that way**. Re-posting to an already-clean Epic is harmless (append-only, newest-wins; its `at` simply refreshes to the same fan-out `at`). This also covers the new-Epic case (AC6) with zero extra branching. Do NOT add a "dirty Epics only" filter — it would (a) leave new/clean Epics on a stale anchor and (b) fork `approveCycle`, defeating the seam.

### Where to thread the prior `at` (the only mildly fiddly bit)
The supersede line needs one prior approval `at`. The cleanest path matching the as-built lift:
- Each `MatrixCell` already has `approvalAt` in scope (line ~684). Add it to the existing cell→row report (either widen `onStatus(epicKey, status)` to `onCell(epicKey, { status, approvalAt })`, or add a parallel `onCellAnchor` callback + `cellAnchors` map — pick whichever reads cleaner; widening the single callback is fewer moving parts).
- In the row, after deriving `anyDirty`, select the prior `at` from any dirty cell's reported `approvalAt` (all dirty cells of this `(user, cycle)` share one anchor by newest-wins). Pass it as `priorApprovalAt`.
- Guard for the (defensive) case where `anyDirty` is true but no `approvalAt` surfaced yet (race during stagger reveal): render the button in `reapprove` mode but let the dialog fall back to the raw/absent ISO (Task 1 handles the unparseable/missing fallback). Do not block re-approval on the cosmetic supersede line.

### Anti-patterns to avoid (carried from 5.3–5.6 review history)
- **Do NOT return a fresh object per call from a row/cell mock** — the parent's reference-deduped `resolved`/`cellStatuses` effects loop forever and OOM (the 5.6 `ManagerMatrix.test.tsx` heap-OOM). Use stable per-account objects / `mockReturnValue`.
- **Do NOT flip a local "approved"/"clean" flag** to clear dirty — invalidate the query and let server-state re-read (the cell already does this). A local flag would lie if the post actually failed.
- **Do NOT add a delete/PUT of the prior comment** (FR42 append-only). Supersession is read-side via newest-wins only.
- **Do NOT filter the fan-out to only-dirty Epics** (see decision above).
- **Tailwind tokens are hyphenated** `state-*` / `accent` — the recurring 4.2/5.4/5.6 trap (underscore/dot forms from planning docs do not exist in the theme).
- **No `Promise.all`, no raw `fetch`, no inline `*3600`/`/3600`, no `console.log`** — but note this story touches NO new write/HTTP code, so these mostly apply only if you (incorrectly) add fan-out logic here. You shouldn't need to.

### Status / icon mapping (from 5.4, unchanged — for reference)
| status | classes | lucide icon | row action |
|---|---|---|---|
| `approved` | `bg-state-success text-white border …` | `Check` | `✓ Done` (when whole row clean+approved) |
| `dirty` | `bg-state-warning-subtle text-state-warning` + 45° stripe | `RefreshCw` | **"Re-approve <Person>" (secondary)** ← this story |
| `gap` / `on-target` / `unapproved-neutral` | (see 5.4) | `AlertCircle` / `Check` / none | "Approve <Person>" (primary) |

A row's action is decided by: any `dirty` cell → Re-approve (secondary); else any non-approved cell with hours → Approve (primary); else fully approved → `✓ Done`. The "all approved → Done" derivation already exists (`allApproved`); you add only the "any dirty → re-approve" branch on top.

### Project structure / conventions
- Pure logic → `lib/*.ts` (+ co-located `*.test.ts`); components → `components/manager/*.tsx` (+ co-located `*.test.tsx`). This story touches only `components/manager/ApproveButton.tsx` and `components/manager/ManagerMatrix.tsx` (+ their tests). No `lib/` change expected; no new files expected.
- Named exports only; no barrel files; `@/` alias; `PascalCase.tsx`. Hours via `secondsToHours` (`lib/hours.ts`). Logging via `lib/log.ts`. Dates via `date-fns` (already a dependency; `ManagerMatrix.tsx` imports `parse`/`parseISO`/`isValid`).
- Server state via TanStack Query + invalidation — match the as-built single-file `ManagerMatrix.tsx` (do NOT split into `MatrixCell.tsx`/`ReApproveButton.tsx` separate files — the architecture/UX named those aspirationally but 5.3–5.6 built them inline/as one `ApproveButton`; keep the as-built shape).

### A note on the UX spec's `ReApproveButton.tsx`
The UX spec (ux-design-specification.md component table) lists a separate `components/manager/ReApproveButton.tsx`. **Do NOT create it.** Story 5.6 built ONE `ApproveButton` with a state union explicitly so the re-approve variant slots in as a `mode` prop, not a second component. A separate component would duplicate the dialog/mutation/invalidate logic. Implement re-approve as a `mode` of `ApproveButton` (this is the documented seam). Likewise the spec's `DirtyIndicator.tsx`/`MatrixCell.tsx` were folded into `ManagerMatrix.tsx` in 5.3/5.4 — match the as-built code.

### Testing standards
- Vitest, co-located. Component tests mock the hooks (`useManagerRow`, `useEpicApprovals`, `useManagerReports`, `useCurrentUser`, `sendRequest`) and the `@/lib/storage/settings` boundary. Run via `./node_modules/.bin/*` (`npx` is proxied).
- Gates: `eslint` 0 errors, `tsc --noEmit` 0 errors, `vitest --run` all green (baseline 72 suites / 918 passed / 1 skipped after 5.6 review).

### Seam left for Story 5.8 (keep clean)
Story 5.8 (non-canonical manager read-only) passes a `disabledReason` to `ApproveButton`. Keep `disabledReason` gating BOTH approve and re-approve modes (AC7) — a non-canonical reader of a dirty row sees a disabled (tooltip-explained) button regardless of mode. Do NOT couple re-approve to canonicality; 5.8 only adds a new `disabledReason` value + tooltip and does not need to know about the `mode` prop.

### Project Structure Notes
- **Modified files (expected):** `components/manager/ApproveButton.tsx` (+ `mode`/`priorApprovalAt` props, secondary variant, supersede line), `components/manager/ApproveButton.test.tsx`, `components/manager/ManagerMatrix.tsx` (derive `anyDirty` + thread prior `at`, pick button mode), `components/manager/ManagerMatrix.test.tsx`.
- **No new files; no `lib/` changes; no new dependencies.** If you find yourself editing `lib/approval.ts`, `lib/approve-sw.ts`, `lib/messages.ts`, the outbox, or `lib/jira-client.ts`, STOP — re-approval must reuse the Story 5.6 write path unchanged.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.7] — full AC text: secondary-tier "Re-approve <Person>", supersede dialog line, recompute touched-Epic set at re-approval time (not copied), post to ALL touched Epics incl. new ones, current `restrictedCount`, newest-wins clears dirty.
- [Source: PROTOCOL.md §Discovery & newest-wins resolution (lines 96–111)] — newest-wins per `(user, cycle)` by Jira-native `created`; unparseable `created` = oldest. [Source: PROTOCOL.md §Dirty-detection rule (lines 117–127)] — `updated > approval.at` ⇒ dirty.
- [Source: lib/dirty-detect.ts] — `isCycleDirty(worklogs, approvalAt)`, `approvalAtFor(approvals, user, cycle)`; dirty anchor is the payload `at`, not `created`.
- [Source: lib/manager-matrix.ts] — `computeCellStatus` decision order (dirty supersedes approved), `CellStatus` union (`approved | on-target | gap | dirty | unapproved-neutral`).
- [Source: components/manager/ApproveButton.tsx] — state union `ready|approving|done|partial`; JSDoc reserves the 5.7 re-approve seam; `disabledReason` reserves the 5.8 seam; `mutationFn` fires `sendRequest('approve-cycle', …)`; `[user, cycle]` reset effect; partial chip + tooltip (retry vs no-retry).
- [Source: components/manager/ManagerMatrix.tsx] — `ManagerMatrixRow` already lifts `cellStatuses` (per-Epic `CellStatus`) via `handleCellStatus`; `MatrixCell` computes `approvalAt = approvalAtFor(...)`; `touchedEpics` = full current touched set with per-Epic `restrictedCount`; `allApproved`/`doneCount` server-state derivation; `DIRTY_STRIPE_STYLE`, `STATUS_CLASSES`, `RefreshCw` "needs re-approval".
- [Source: components/ui/button.tsx] — `variant="primary"` (brand-purple) vs `variant="secondary"` (transparent / `neutral-700` / `neutral-200` border); disabled → `disabled:text-neutral-300 disabled:cursor-not-allowed`.
- [Source: _bmad-output/implementation-artifacts/5-6-approve-cycle-per-epic-fan-out-posting-of-versioned-comments.md] — `approveCycle`/`approve-cycle`/outbox-`comment`/`postComment` build + code-review (append-only, partial-failure, dedupe, blank-approver guard); "Seams left for downstream stories" (5.7 re-approve = `mode` over the same button; 5.8 = `disabledReason`); test heap-OOM lesson (stable row mocks); baseline 72/918/1.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — manager matrix wireframe (Priya row: yellow-stripe `↻` cell → "[Re-approve]" row action, lines 1011–1015); flowchart "Click 'Re-approve' → posts new approval comment; supersedes prior 'newest wins per (user, cycle)'" (line 1330); yellow-stripe token + `↻` icon + "needs re-approval" tooltip (lines 678/689); secondary-tier button = "Re-approve" (line 1562); `ApproveButton` states "ready/approving/done/dirty (re-approve)" (line 1510). NOTE: the spec's separate `ReApproveButton.tsx`/`DirtyIndicator.tsx`/`MatrixCell.tsx` were folded into the as-built `ApproveButton`/`ManagerMatrix` — match the code, not the aspirational table.
- [Source: _bmad-output/planning-artifacts/prd.md] — FR33 (fan-out checksummed comment per touched Epic), FR37 (re-approval supersedes), FR39 (dirty detection), FR41 (multi-manager independence), FR42 (never delete), NFR6 (offline-tolerant retry), NFR7 (fail-closed parser).
- [Source: _bmad-output/planning-artifacts/architecture.md] — Manager-approves data-flow (`ApproveButton` useMutation → `approve-cycle` SW message → `approveCycle` → per-Epic sequential through scheduler → `postComment` → invalidate approval queries). Re-approve reuses this flow verbatim.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8)

### Debug Log References

- `./node_modules/.bin/vitest --run` → 72 suites / 929 passed / 1 skipped (was 918; +11 new tests: 7 ApproveButton re-approve, 4 ManagerMatrix dirty/re-approve).
- `./node_modules/.bin/tsc --noEmit` → 0 errors.
- `./node_modules/.bin/eslint .` → exit 0, 0 errors, 57 pre-existing import/order warnings (baseline unchanged); 0 warnings on the four changed files.

### Completion Notes List

- **UI-only story; write path untouched.** No change to `lib/approval.ts`, `lib/approve-sw.ts`, `lib/messages.ts`, the outbox, or `lib/jira-client.ts`. Re-approve fires the identical `sendRequest('approve-cycle', { user, cycle, by, epics })` payload — re-approval is just another append-only approval that supersedes via the parser's newest-wins rule (verified by the AC6 matrix test asserting the exact `approve-cycle` payload).
- **`ApproveButton` re-approve mode.** Added `mode?: 'approve' | 'reapprove'` (default `'approve'`) and `priorApprovalAt?: string`. The state union (`ready | approving | done | partial`) is unchanged — re-approve is a label/variant/dialog-copy variation. In `reapprove` mode the ready button renders `variant="secondary"` with label "Re-approve <Person>", the dialog title verb becomes "Re-approve", a supersede line is added ("Re-approving — supersedes prior approval from <formatted at>"), and the commit button reads "Re-approve". The `summary` STRINGS helper was parameterized with a `verb` arg (single helper, no fork).
- **Date formatting.** `formatPriorApprovalAt` uses `date-fns` `format(parseISO(at), 'MMM d, yyyy h:mm a')` (date+time, unambiguous). Missing → "an earlier approval"; unparseable ISO → raw string. Never throws, so the cosmetic supersede line can never block re-approval.
- **`disabledReason` gates both modes (AC7).** The existing `disabled = isEmpty || inFlight || disabledReason !== undefined` is unchanged; no re-approve-specific bypass. Verified by a re-approve-mode disabled test.
- **Matrix wiring.** `ManagerMatrixRow` derives `anyDirty = touchedEpics.some((e) => cellStatuses.get(e.epicKey) === 'dirty')` and threads `mode={anyDirty ? 'reapprove' : 'approve'}`. The cell→row callback `onStatus` was widened to `(epicKey, status, approvalAt)`; a sibling `cellAnchors` map holds each cell's resolved `approvalAt`. The row picks `priorApprovalAt` from any dirty cell's anchor (all dirty cells of one (user, cycle) share one anchor by newest-wins); falls back to `undefined` if no anchor has surfaced yet (stagger-reveal race) — the dialog degrades gracefully.
- **Fan-out set unchanged.** `touchedEpics` (full current touched set with per-Epic `restrictedCount`) is passed as-is — NOT filtered to dirty Epics. This covers AC3 (recompute at click) and AC6 (new Epics) with zero extra branching.
- **No new local flags.** `approvedRows`/`allApproved`/`doneCount` semantics unchanged; dirty clears purely via query invalidation + server-state re-read.
- **Test-mock safety.** All row/approval mocks use stable per-account `mockReturnValue`/`mockImplementation` returning the same object reference per account — avoided the 5.6 heap-OOM trap (no fresh-object-per-call).

### File List

- `components/manager/ApproveButton.tsx` (modified) — `mode`/`priorApprovalAt` props, `ApproveMode` type, secondary-tier re-approve button + label, supersede dialog line, parameterized `summary` STRING, `formatPriorApprovalAt` helper (date-fns).
- `components/manager/ApproveButton.test.tsx` (modified) — 7 new re-approve-mode tests (secondary label, supersede line formatted/fallback/raw-ISO, success→Done, partial chip, disabledReason gates re-approve).
- `components/manager/ManagerMatrix.tsx` (modified) — widened cell→row `onStatus` callback to carry `approvalAt`; `cellAnchors` map; row-level `anyDirty` + `priorApprovalAt` derivation; `mode`/`priorApprovalAt` threaded into `ApproveButton`.
- `components/manager/ManagerMatrix.test.tsx` (modified) — 4 new tests (dirty row → secondary Re-approve; prior `at` supersede line; non-dirty stays Approve; dirty + new Epic re-approves FULL touched set, AC6).
- `_bmad-output/implementation-artifacts/5-7-re-approve-dirty-cycles.md` (modified) — frontmatter `baseline_commit`, task checkboxes, Dev Agent Record, File List, Change Log, Status.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — `5-7-re-approve-dirty-cycles` → in-progress → review.

### Review Findings

Code review (2026-06-27, three parallel adversarial layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor). Gates after review: vitest 72 suites / 929 passed / 1 skipped; `tsc --noEmit` 0 errors; `eslint .` 0 errors / 57 pre-existing warnings. Write path (`lib/approval.ts`, `lib/approve-sw.ts`, `lib/messages.ts`, outbox, `lib/jira-client.ts`) confirmed UNTOUCHED via `git diff HEAD --name-only`. All 8 ACs verified satisfied by the Acceptance Auditor. No `patch` and no `decision-needed` findings — nothing introduced by this UI-only story requires a fix.

- [x] [Review][Defer] Supersede line picks the first non-empty anchor, not the newest when multiple dirty Epics carry different `at` values [components/manager/ManagerMatrix.tsx:540-544] — deferred, cosmetic + spec-sanctioned. Dev Notes (lines 85/121) explicitly accept "any dirty cell's `approvalAt`"; the supersede line is cosmetic and "never blocks re-approval." Different Epics can theoretically carry different approval `at`s, but the displayed timestamp is informational only.
- [x] [Review][Defer] Partial re-approve renders a terminal "Approval partial" chip and removes the re-approve button until subject change [components/manager/ApproveButton.tsx:232-244] — deferred, pre-existing 5.6 behavior. AC5 mandates "reuses Story 5.6 handling"; the state machine and partial chip are unchanged by 5.7. Recovery-affordance ergonomics are a 5.6 concern, out of scope for this UI-only story.
- [x] [Review][Defer] `cellStatuses`/`cellAnchors` maps are set-only and never prune entries for Epics that leave the union columns [components/manager/ManagerMatrix.tsx:491-507] — deferred, pre-existing pattern. 5.7 only added the parallel `cellAnchors` map mirroring the pre-existing `cellStatuses` lift; derivations read only `touchedEpics` keys. A stale entry could resurface only via a column-shrink-then-regrow-before-remount race; theoretical and not introduced here.

Dismissed as noise (2): timezone/future-date/whitespace handling in `formatPriorApprovalAt` (LOW, cosmetic on an explicitly-cosmetic line; `at` comes from a SHA-checksummed Jira comment); "mode flips while dialog open shows stale verb" (no real bug — label and commit button are both derived from the same `isReapprove`, so the dialog stays self-consistent).

## Change Log

| Date | Version | Description |
|---|---|---|
| 2026-06-27 | 0.1 | Story 5.7 implemented: dirty-aware "Re-approve" mode on `ApproveButton` (secondary tier, supersede dialog line, reused 5.6 `approve-cycle` write path unchanged) + `ManagerMatrix` wiring (derive `anyDirty`, thread prior `at`). 72 suites / 929 passed / 1 skipped; tsc 0; eslint 0 errors. Status → review. |

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-06-27 — created (ready-for-dev)


