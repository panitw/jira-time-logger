---
baseline_commit: HEAD
---
# Story 5.4: Cell Coloring, Dirty Detection & Visibility Warnings

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a manager scanning the matrix,
I want each cell's status (on-target, gap, dirty, restricted, approved) to pop visually with icons backing the color,
so that I find exceptions in seconds and approve the rest with confidence.

## Acceptance Criteria

**Dirty detection — pure, deterministic `lib/dirty-detect.ts` (NEW)**

1. A NEW pure module `lib/dirty-detect.ts` (framework-agnostic — no React, no chrome, no network) implements the dirty rule documented in `PROTOCOL.md` §"Dirty-detection rule". It exports a pure function:
   ```ts
   export type WorklogTimes = { updated?: string };
   export function isCycleDirty(
     worklogs: ReadonlyArray<WorklogTimes>,
     approvalAt: string | null | undefined,
   ): boolean;
   ```
   Rules (deterministic, no clock read):
   - If `approvalAt` is `null`/`undefined`/empty → return `false` (the cycle is **unapproved**, which is NOT dirty; "no approval" ≠ "stale approval"). (epics §5.4 AC 2, PROTOCOL.md §Dirty-detection)
   - Else parse `approvalAt` with `Date.parse`. If it is `NaN` (unparseable) → return `false` (cannot prove staleness; fail toward "not dirty" so a corrupt timestamp never spuriously flags every cell — the corrupted-approval path is handled separately by the parser failing closed in 5.1).
   - Else `dirty = true` iff **at least one** worklog has a parseable `updated` whose epoch ms is **strictly greater than** `Date.parse(approvalAt)` (`updated > approval.at`, strict `>`). A worklog with no `updated` or an unparseable `updated` does NOT contribute to dirtiness. (epics §5.4 AC 2, FR39)
2. The module also exports a small resolver that maps a per-`(user, cycle)` approval to a single anchor timestamp, so callers never re-implement the matching:
   ```ts
   export function approvalAtFor(
     approvals: ReadonlyArray<ApprovalComment>,
     user: string,
     cycle: string,
   ): string | null;
   ```
   It returns the `at` of the approval whose `(user, cycle)` matches **exactly** (`approval.user === user && approval.cycle === cycle`), or `null` when none matches. It considers ONLY this `(user, cycle)` pair — other users' approvals on the same Epic are ignored (FR41). `lib/parser.ts`'s `findApprovalComments` already applied "newest wins per (user, cycle)", so the input list has at most one matching record; if (defensively) more than one match is present, keep the one with the latest payload `at`. (epics §5.4 AC 2, FR41)

**Cell status computation — extend pure `lib/manager-matrix.ts` (UPDATE)**

3. Extend `lib/manager-matrix.ts` (the existing pure module) with a pure status-decision function that the cell renderer drives off. It must NOT read the clock internally — `today` (local ISO date) and `targetHours` are injected by the caller (mirrors `computeDayStatuses` from Story 4.2). Suggested shape:
   ```ts
   export type CellStatus =
     | 'approved' | 'on-target' | 'gap' | 'dirty' | 'unapproved-neutral';
   export type CellStatusInput = {
     epics: ReportEpicWorklogs[];
     epicKey: string;
     approvalAt: string | null;      // from approvalAtFor(...) — null = unapproved
     targetHours: number;
     workdaysElapsed: number;        // past-or-today Mon–Fri count in the cycle window
   };
   export function computeCellStatus(input: CellStatusInput): CellStatus;
   ```
   Decision order (first match wins):
   - **`dirty`** if an approval exists (`approvalAt != null`) AND `isCycleDirty(thisCell'sWorklogs, approvalAt)` is true. (Dirty supersedes "approved" — a stale approval must visibly demand re-approval.) (epics §5.4 AC 1 yellow-stripe, FR37, FR39)
   - **`approved`** else if `approvalAt != null` (approval exists and not dirty). (epics §5.4 AC 1 approved, FR30)
   - **`gap`** else if the cell has any hours but the report is below target for elapsed workdays — see AC 4 for the precise gap rule. (epics §5.4 AC 1 red/gap)
   - **`on-target`** else if the cell has hours and the report met/exceeded target across elapsed workdays. (epics §5.4 AC 1 green)
   - **`unapproved-neutral`** otherwise (empty `──` cell, or no basis to color). An empty cell is never red-by-default. (epics §5.4 AC 2 "not red-by-default")
   Co-located tests in `lib/manager-matrix.test.ts` and `lib/dirty-detect.test.ts` cover the decision table (see AC 9).

4. **Target/gap is a per-cycle, per-row judgment, not per-cell.** The green/red ("on-target" vs "gap") signal reflects whether the **report** met `targetHours × workdaysElapsed` across the cycle, computed from the row's TOTAL hours across all Epics — NOT the single cell's hours. A cell only paints green/red when it carries the row's status; **per-Epic cells that merely hold hours show neutral hours plus the row-level on-target/gap coloring applied at the row grain**. To keep this story shippable and consistent with the as-built per-cell renderer, compute one `rowStatus` per row (`on-target` | `gap` | `unapproved-neutral`) from the row's summed seconds vs `hoursToSeconds(targetHours) × workdaysElapsed`, and let each non-empty cell inherit it; the **approved** and **dirty** states are evaluated per `(report, Epic)` cell because approval + dirty are per-Epic. Document this split in Dev Notes. Use `secondsToHours`/`hoursToSeconds` from `lib/hours.ts` — NEVER inline `*3600`/`/3600`. (epics §5.4 AC 1; FR30; reuses the 4.2 target-comparison pattern)

**Approval fetch wiring — `hooks/useEpicApprovals.ts` (NEW) + matrix integration**

5. Approval-comment data is fetched via `lib/parser.ts`'s `findApprovalComments(epicKey)` (Story 5.1) — do NOT re-implement comment parsing, checksum, or newest-wins. A NEW hook `hooks/useEpicApprovals.ts` issues one TanStack Query per Epic column: `useQuery({ queryKey: ['epic-approvals', epicKey], queryFn })` whose `queryFn` calls `findApprovalComments(epicKey)` and throws the non-`ok` `Result` so TanStack `error` carries the `JiraError` (mirror `useManagerRow`/`useWeekWorklogs`). The matrix maps the resolved `ApprovalComment[]` per Epic; the cell looks up its anchor via `approvalAtFor(approvalsForThisEpic, report.accountId, cycle)`. (epics §5.4 AC 1; AR16; reuses Story 5.1)
   - `staleTime`: current (open) cycle → 60 000 ms; closed/past cycle → `Infinity` (immutable). Derive open-vs-closed the same way `useManagerRow` does (compare against `getCurrentCycleId`). Approval reads flow through `jiraGet` → the SW token-bucket scheduler (never raw `fetch`, never bypass the scheduler — AR12, NFR2). Approval-fetch failure of one Epic must NOT take down the matrix; on error that Epic's cells fall back to the worklog-only status (treat as unapproved) and may surface a quiet inline note, but the row's hours still render.

**Cell rendering — status icon + color (UPDATE `components/manager/ManagerMatrix.tsx`)**

6. Each non-empty data cell renders the computed `CellStatus` with a paired **color token + lucide icon + tooltip/aria-label**. Color is NEVER the sole signal (NFR12, UX-DR15, UX-DR32). Use the **hyphenated** Tailwind utilities that actually exist in `styles/globals.css` `@theme` — NOT the underscore form in the planning docs:
   - **approved** → `bg-state-success text-white` + a darker `border-state-success` (`border`/ring) + lucide `Check` (16px) + `aria-label="<Person>, <EpicKey>, <hours> hours, approved"`. (Note: dark-green bg with WHITE text — distinct from the subtle on-target green.)
   - **on-target** → `bg-state-success-subtle text-state-success` + lucide `Check` (16px) + `aria-label="…, on target"`.
   - **gap** → `bg-state-danger-subtle text-state-danger` + lucide `AlertCircle` (16px) + a small visible `below target` text + `aria-label="…, below target"`.
   - **dirty** → `bg-state-warning-subtle text-state-warning` + a **diagonal-stripe pattern** overlay (see AC 7) + lucide `RefreshCw` (16px) + a small visible `needs re-approval` text + `aria-label="…, approved but worklogs changed, needs re-approval"`. (epics §5.4 AC 1; FR37, FR39)
   - **unapproved-neutral** / empty `──` → current neutral styling (`text-neutral-900` for hours, `text-neutral-500` for `──`), no status icon; empty cells keep the AC-from-5.3 `aria-label` "…, no hours logged".
   Icons are `aria-hidden` (decorative); the verbal signal is the cell `aria-label` + the visible status text (`below target` / `needs re-approval`). Icons inherit `currentColor` so the `text-state-*` class colors them. Keep the numeric hours visible alongside the icon (the cell is narrow — 360 px popup; stack/tight-inline as `WeeklyGrid`'s totals cells do). Add `motion-safe:transition-colors motion-safe:duration-200` so color changes fade under motion-safe and are instant under `prefers-reduced-motion: reduce` (UX-DR33). (epics §5.4 AC 1; NFR12; UX-DR15/32/33)

7. **Dirty diagonal stripe (the non-color signal for warning).** The dirty cell's yellow background carries a diagonal-line pattern so the state reads without relying on color (NFR12 / UX accessibility: "yellow stripe uses diagonal lines, not just yellow bg"). Implement it as a CSS `repeating-linear-gradient(45deg, …)` overlay (an inline `style` background or a small reusable class) layered over `bg-state-warning-subtle`, using a low-contrast amber line so the `RefreshCw` icon and hours stay legible. Keep this in one place — a small `DirtyStripe`/`MatrixCell` helper inside `components/manager/` is acceptable; the architecture's aspirational `DirtyIndicator.tsx` is optional — match the as-built single-`ManagerMatrix.tsx` convention from 5.3 (a `MatrixCell` sub-component or inline cell renderer is fine; do NOT over-split unless it reads cleaner). (epics §5.4 AC 1; UX a11y; mirrors 4.2's "do not introduce files the as-built structure doesn't need")

**Visibility-restricted detection — fetcher + `restrictedCount` (UPDATE `lib/jira-client.ts`, `lib/jira-types.ts`)**

8. Surface visibility-restricted worklogs the manager cannot fully see. The Jira `GET /rest/api/3/issue/<key>/worklog` response returns a `total` (count of ALL worklogs on the issue) but only includes in its `worklogs` array the entries the requester is permitted to see; restricted-visibility worklogs are silently omitted. Compute a per-row `restrictedCount`:
   - In `fetchReportCycleWorklogsByEpic` (`lib/jira-client.ts`, UPDATE), for each worklogged subtask, compare the endpoint's `total` against the number of worklogs actually returned (`worklogResult.value.worklogs.length`). When `total > worklogs.length` AND the page was not merely truncated by `maxResults` (the badge/week fetchers scope to one date window — there is no `maxResults` on this endpoint call, so a short page IS the full set), the difference is the count of worklogs hidden from this manager. Sum these deltas across the row's subtasks into a per-row `restrictedCount: number`.
   - Extend the row return shape: add `restrictedCount` at the row level (or expose a `{ epics, restrictedCount }` wrapper) and per-Epic if cheap. Update `ReportEpicWorklogs`/the row result type in `lib/jira-types.ts` accordingly (the existing forward-compat comment at `lib/jira-types.ts:251` anticipates exactly this — wire it now). Do NOT change `fetchCurrentUserWeekWorklogs`/`…ByIssue` signatures (badge 3.1, banner 3.3, week 4.1 depend on them). (epics §5.4 AC 3; FR34)
   - Be tolerant: a missing/`undefined` `total` → contribute `0` to `restrictedCount` (never throw, never guess). A per-Epic granularity is preferred so the cell lock overlay (AC 6/below) is per-`(report, Epic)`; if per-Epic is awkward, scope the lock to the whole row and document the simplification.

9. **Cell lock overlay + row-level chip.** When a cell's `(report, Epic)` has restricted worklogs excluded, overlay a lucide `Lock` icon on top of the cell's normal status color (the lock does NOT replace the status — it stacks on green/red/yellow/approved). The lock icon carries its own `aria-label`/`<title>` ("Some worklogs on this Epic have restricted visibility you can't see") and a Radix `Tooltip` on hover/focus. When ANY cell in a row is restricted, a **row-level chip "⚠ N restricted"** appears next to the person's name (N = the row's summed `restrictedCount`), itself tooltip-explained. The cell `aria-label` appends ", restricted visibility" when locked. (epics §5.4 AC 3; FR34; UX-DR15)

**Tests (`*.test.ts(x)` co-located)**

10. `lib/dirty-detect.test.ts` (NEW) covers: clean cycle (no worklog `updated` after approval → not dirty); single edited worklog `updated > at` (dirty); worklog `updated === at` (NOT dirty — strict `>`); worklog `updated` before approval / created-before (clean); no approval (`null` → not dirty, "unapproved"); unparseable `approvalAt` → not dirty; worklog with missing/unparseable `updated` ignored; `approvalAtFor` matches exact `(user, cycle)`, ignores a different user's approval on the same Epic (FR41), returns `null` when none matches, and picks the latest `at` if (defensively) two match. (epics §5.4 AC 4; FR39/FR41) Pure — no mocks.
11. `lib/manager-matrix.test.ts` (UPDATE) covers the `computeCellStatus`/`rowStatus` decision table: dirty supersedes approved; approved when not dirty; gap below target; on-target at/above the boundary; empty cell → neutral (never red); no-approval row with a gap → red (gap), not "unapproved" red-by-default conflation. Pure fixtures (no Jira mocks).
12. `hooks/useEpicApprovals.test.tsx` (NEW): query keyed `['epic-approvals', epicKey]`; resolves to `ApprovalComment[]` on `ok`; surfaces the `JiraError` on failure (throw-from-queryFn pattern); open-cycle `staleTime` finite vs closed-cycle `Infinity`. Mock the `findApprovalComments` boundary (follow the `vi.mock` pattern in `useManagerRow.test.tsx`).
13. `lib/jira-client.test.ts` (UPDATE): `fetchReportCycleWorklogsByEpic` computes `restrictedCount` from `total > worklogs.length`; `total` undefined → `restrictedCount: 0`; restricted on one subtask sums correctly to the row total; signatures of the week/badge fetchers unchanged (regression). Mock `jiraGet`.
14. `components/manager/ManagerMatrix.test.tsx` (UPDATE): a cell with an approval + no later `updated` renders `Check` + the approved (dark-green/white) treatment + `aria-label` containing "approved"; a cell with a later `updated` renders `RefreshCw` + `needs re-approval` text + the dirty `aria-label`; a below-target row renders `AlertCircle` + `below target`; an on-target row renders `Check` + "on target"; an empty cell stays neutral with the "no hours logged" label; a restricted cell shows the `Lock` overlay AND the row chip "⚠ N restricted"; the neutral-cell / scope guards from 5.3 still hold. Mock `useManagerRow`, `useEpicApprovals`, `useManagerReports`.

**Gates**

15. `npm run lint` (0 errors), `npm run compile` (`tsc --noEmit`, 0 errors), `npm run test --run` (all green; record before/after counts), `npm run build` (popup entrypoint builds). No `any`; named exports only; no barrel files; `@/` alias for cross-module imports; `lib/` modules React-free; no inline `*3600`/`/3600` (use `lib/hours.ts`); no `console.log` (use `lib/log.ts`); use the **hyphenated** `state-*` Tailwind utilities. (AR4, AR29)

## Tasks / Subtasks

- [x] **Task 1 — `lib/dirty-detect.ts` (NEW, pure): the dirty rule + approval matcher** (AC: 1, 2, 10)
  - [x] `isCycleDirty(worklogs, approvalAt)`: `false` for null/empty/NaN `approvalAt`; else `true` iff any worklog `Date.parse(updated) > Date.parse(approvalAt)` (strict). Ignore worklogs with absent/NaN `updated`. No clock read.
  - [x] `approvalAtFor(approvals, user, cycle)`: exact `(user, cycle)` match → its `at`; `null` if none; latest-`at` if multiple (defensive). Ignore other users' approvals (FR41).
  - [x] Import `ApprovalComment` from `@/lib/comment-schema`; keep the module React/network-free. Document the rule references `PROTOCOL.md` §Dirty-detection.
  - [x] Co-located `lib/dirty-detect.test.ts` (AC 10).

- [x] **Task 2 — `lib/manager-matrix.ts` (UPDATE, pure): cell/row status decision** (AC: 3, 4, 11)
  - [x] Add `CellStatus` string-literal union + `computeCellStatus` (and/or a `computeRowStatus(rowSeconds, { targetHours, workdaysElapsed })`). Decision order: dirty → approved → gap → on-target → neutral.
  - [x] Target comparison in seconds via `hoursToSeconds(targetHours) * workdaysElapsed` (no inline `*3600`). Empty cell → neutral, never red.
  - [x] Provide a tiny helper to filter a cell's worklog records for `isCycleDirty` (the per-`(report, Epic)` `ReportEpicWorklogs.worklogs`).
  - [x] Co-located `lib/manager-matrix.test.ts` updates (AC 11).

- [x] **Task 3 — `lib/jira-client.ts` + `lib/jira-types.ts` (UPDATE): `restrictedCount`** (AC: 8, 13)
  - [x] In `fetchReportCycleWorklogsByEpic`, after the per-subtask worklog fetch, derive `restricted = (total ?? returnedLen) - returnedLen` clamped to `>= 0`; sum into a per-row (and ideally per-Epic) `restrictedCount`. Tolerate `total === undefined` (→ 0).
  - [x] Extend the row result type in `lib/jira-types.ts` (consume the forward-compat comment at line 251) — add `restrictedCount`. Per-Epic on `ReportEpicWorklogs` + row-summed via a new `ReportCycleWorklogs` wrapper. Do NOT touch the week/badge fetcher signatures.
  - [x] Co-located `lib/jira-client.test.ts` updates (AC 13) — mock `jiraGet`.

- [x] **Task 4 — `hooks/useEpicApprovals.ts` (NEW): per-Epic approval query** (AC: 5, 12)
  - [x] `useEpicApprovals(epicKey, cycle)` → `useQuery({ queryKey: ['epic-approvals', epicKey], queryFn })` calling `findApprovalComments(epicKey)`, throwing non-`ok` `Result`. Open-cycle `staleTime 60_000`, closed-cycle `Infinity` (mirror `useManagerRow`). Do NOT override the popup `QueryClient` retry config.
  - [x] Co-located `hooks/useEpicApprovals.test.tsx` (AC 12).

- [x] **Task 5 — `components/manager/ManagerMatrix.tsx` (UPDATE): paint cells + lock + chip** (AC: 6, 7, 9, 14)
  - [x] In `ManagerMatrixRow`, fetch approvals per visible Epic column via a `MatrixCell` sub-component calling `useEpicApprovals` (one query per Epic key, deduped across rows/cells by TanStack). Compute `approvalAt` per cell via `approvalAtFor`, `rowStatus` from the row's summed seconds, and the cell's `CellStatus` via `computeCellStatus`.
  - [x] Render each non-empty cell with the AC-6 token+icon+text+aria mapping (hyphenated `state-*` utilities). Empty `──` cells stay neutral with the existing "no hours logged" `aria-label`. Add `motion-safe:transition-colors motion-safe:duration-200`.
  - [x] Dirty stripe via `repeating-linear-gradient(45deg, …)` overlay over `bg-state-warning-subtle` (AC 7) — one `DIRTY_STRIPE_STYLE` const, not per-cell duplication.
  - [x] Lock overlay (`Lock` icon + `title`/`aria-label` a11y-equivalent fallback — no Radix tooltip primitive in-repo) on restricted cells; row-level "⚠ N restricted" chip beside `displayName` when the row's `restrictedCount > 0` (AC 9). Added `STRINGS` entries for every new copy string (UX-DR31); honest copy, no `!`.
  - [x] Derive `today`/`workdaysElapsed`/`targetHours` once at the matrix/component level (load `targetHours` from settings as `WeekView` does, default 8; `today` via `new Date()` local; `workdaysElapsedInWindow` counts past-or-today Mon–Fri in the cycle window). Inject into the pure status fns (no clock in `lib/`).
  - [x] **Leave clean seams for 5.5 / 5.6:** cells remain click-affordance-ready but the drill-down panel is 5.5 (NOT built); the row-end Approve/Re-approve action area stays empty (5.6/5.7); the "X of N done" progress chip stays out. Reads approvals only — never POSTs.
  - [x] Co-located `components/manager/ManagerMatrix.test.tsx` updates (AC 14).

- [x] **Task 6 — Verify all gates** (AC: 15)
  - [x] `./node_modules/.bin/eslint .` (0 errors, 57 pre-existing warnings), `./node_modules/.bin/tsc --noEmit` (0 errors), `npm run test --run` (66 suites / 838 passed / 1 skipped), `npm run build` (popup builds).

## Dev Notes

### What this story IS (scope guardrails — read first)

This is the **approval-state + status layer painted over the neutral matrix Story 5.3 already built.** Story 5.3 shipped `ManagerMatrix.tsx` with strictly neutral cells (raw hours / `──`) and explicitly deferred all of this. Deliver: (1) a pure `lib/dirty-detect.ts` (the heart of the story); (2) per-Epic approval fetching via Story 5.1's `findApprovalComments`; (3) per-cell status computation (approved / on-target / gap / dirty / neutral); (4) the color-token + icon + a11y painting (reusing the exact 4.2 pattern); (5) `restrictedCount` detection + the lock overlay + "⚠ N restricted" row chip.

**Explicitly DEFER — leave clean seams, do NOT build:**
- **Story 5.5** — the slide-in drill-down panel on cell click. Cells stay click-affordance-ready; do not wire the panel. (It reuses 5.3's per-ticket worklog records + the same `restrictedCount`/`VisibilityWarning` — see 5.5 ACs.)
- **Stories 5.6 / 5.7 / 5.8** — the row-end Approve / Re-approve / ✓ Done / disabled-for-non-canonical-manager actions, the per-Epic fan-out **posting** of comments, and the "X of N done" progress chip (it depends on approve posting). **This story READS approvals only — it never POSTs a comment.** Leave the row-end action area empty exactly as 5.3 left it.

### The dirty-detection algorithm (the heart of the story — must be deterministic and consistent with 5.1)

`PROTOCOL.md` §"Dirty-detection rule (forward reference — Story 5.4)" is the contract (lines 117–127):

> An approved cycle is **dirty** (stale approval) when any worklog covered by the approval has a Jira `updated` timestamp **later than** the approval's `at` time — i.e. the work changed after it was approved.

Precise, deterministic implementation (`isCycleDirty(worklogs, approvalAt)`):
- The anchor is the approval **payload `at`** field (an ISO-8601 string), NOT the Jira-native `created` timestamp. (Subtle but load-bearing: `findApprovalComments` uses `created` only for the *newest-wins* tiebreak; the dirty comparison uses the payload `at`, the same field the 5.1 checksum covers. `approvalAtFor` returns `approval.at`.)
- Comparison is **strict `>`** on epoch ms (`Date.parse`): `updated === at` is NOT dirty (a worklog touched at the exact approval instant is considered covered). This matches "later than".
- `null`/`undefined`/empty `approvalAt` → `false` (**unapproved**, not dirty — and critically NOT red-by-default; an unapproved cycle is neutral/own-status, never auto-flagged. epics §5.4 AC 2).
- Unparseable `approvalAt` (`NaN`) → `false`. Rationale: a corrupt/unverifiable approval is the parser's concern (5.1 fails closed → that approval never reaches this code as a verified record), so here we fail toward "not dirty" rather than flagging every cell.
- A worklog with no `updated` or an unparseable `updated` never contributes to dirtiness (defensive; Jira always sets `updated`, but the schema marks it optional).
- **Scope is per `(user, cycle)`** (FR41): `approvalAtFor` matches the approval whose `user`+`cycle` equal this report and the matrix cycle exactly; another user's approval on the same Epic is irrelevant. The worklog set passed to `isCycleDirty` for a cell is that `(report, Epic)`'s `ReportEpicWorklogs.worklogs` (already report-scoped by the 5.3 fetcher's `author.accountId === reportAccountId` filter).

Determinism: no clock reads, no locale formatting, pure `Date.parse` epoch comparison → byte-stable, fully unit-testable with injected fixtures (mirror how 4.2's `computeDayStatuses` injects `today`).

### Color tokens & icons (EXACT — the #1 disaster to avoid)

**Use the HYPHENATED Tailwind utilities that exist in `styles/globals.css` `@theme`. The planning docs (epics/UX spec) write `state.warning_subtle` (underscore/dot) — those utilities DO NOT EXIST in this repo.** Story 4.2 hit this exact trap. Confirmed tokens in `styles/globals.css`:
- `--color-state-success: #16a34a` → `bg-state-success` / `text-state-success`
- `--color-state-success-subtle: #dcfce7` → `bg-state-success-subtle`
- `--color-state-warning: #ca8a04` → `text-state-warning`
- `--color-state-warning-subtle: #fef9c3` → `bg-state-warning-subtle`
- `--color-state-danger: #dc2626` → `text-state-danger`
- `--color-state-danger-subtle: #fee2e2` → `bg-state-danger-subtle`

State → treatment (this story's full mapping):
| Status | bg | text | icon (lucide, 16px, `aria-hidden`) | visible text | aria-label suffix |
| --- | --- | --- | --- | --- | --- |
| approved | `bg-state-success` | `text-white` | `Check` | — | `approved` |
| on-target | `bg-state-success-subtle` | `text-state-success` | `Check` | — | `on target` |
| gap | `bg-state-danger-subtle` | `text-state-danger` | `AlertCircle` | `below target` | `below target` |
| dirty | `bg-state-warning-subtle` + 45° stripe | `text-state-warning` | `RefreshCw` | `needs re-approval` | `approved but worklogs changed, needs re-approval` |
| neutral / empty | none | `text-neutral-900` / `text-neutral-500` | — | — | `no hours logged` (empty) |
| (overlay) restricted | (on top of any above) | — | `Lock` | — | append `restricted visibility` |

- Icons: `import { Check, AlertCircle, RefreshCw, Lock } from 'lucide-react';` (already a dependency — 4.2/badge/banner use it). 16px, inherit `currentColor`. Mark status icons `aria-hidden`; the human-readable signal is the cell `aria-label` + visible status text. (UX iconography lines 790–804.)
- **Color is never the sole signal (NFR12, UX-DR15/32):** every colored state pairs bg/text with an icon AND an aria-label AND (for gap/dirty) visible literal text; the dirty state additionally uses the diagonal stripe so warning reads without color. Amber/`state-warning` is the **manager-view dirty concept** — 4.2 correctly reserved it (it's intentionally absent from the Week view); this is where it lands.
- Tone/copy (UX honesty, UX-DR30/31): `below target` (never "missing"/"behind"); `needs re-approval` (neutral, descriptive); no exclamation marks. All copy in `STRINGS`.
- Dirty stripe: `repeating-linear-gradient(45deg, transparent 0 6px, rgba(202,138,4,0.18) 6px 8px)` (or similar low-contrast amber over `bg-state-warning-subtle`) — tune so `RefreshCw`/hours stay legible; keep contrast WCAG AA (`state.warning`-family is pre-verified per UX). Single helper, not per-cell duplication.
- Tooltips: Radix `Tooltip` (shadcn) for the lock and the row "⚠ N restricted" chip. Confirm/install the `tooltip` shadcn primitive if not present (it is listed in the UX component set); if absent in-repo, a `title` attribute + `aria-label` is an acceptable a11y-equivalent fallback (document the choice — Epic 6 a11y audit owns final tooltip polish).

### Visibility-restricted (`restrictedCount`) — design note (subtle)

The manager genuinely **cannot see** worklogs another user marked with restricted (team/role) visibility — Jira omits them from the worklog-list `worklogs` array but still counts them in the endpoint's `total`. So detection = `total - returnedWorklogs.length` per issue, clamped `>= 0`, summed per row (and per Epic where cheap). The 5.3 fetcher calls `GET /rest/api/3/issue/<key>/worklog?startedAfter=…&startedBefore=…` with no `maxResults`, scoped to one cycle window, so the returned page is the full visible set — the `total`-vs-length delta is a clean signal (not page truncation). Caveat to document: `total` is the issue's all-time worklog count, while the returned array is window-scoped; to avoid over-counting out-of-window worklogs as "restricted", the safest interpretation is to treat the delta as an **upper-bound indicator** and surface it as "N restricted" only when the window-scoped JQL guarantees the comparison is apples-to-apples — if the endpoint's `total` is window-scoped (Jira's `startedAfter/Before` filters it), the delta is exact; if not, prefer flagging *presence* (lock icon) over an exact count, and set the row chip count from whatever exact signal is available. **Flag this in the Final Report as a design question** — the cleanest exact source is per-worklog `visibility` presence if Jira returns redacted stubs; otherwise the `total` delta. The story's audit value (5.6 captures `restrictedCount` into the approval payload) only needs a faithful count of what the approver couldn't see — bias toward not over-counting.

### Files to read before coding

- **`PROTOCOL.md`** (repo root, lines 117–127) — the dirty-detection rule contract; lines 58–79 the checksum/`at` semantics. `lib/dirty-detect.ts` implements this verbatim.
- **`lib/comment-schema.ts`** — `ApprovalComment` type (`{ v, user, cycle, by, at, restrictedCount, checksum }`); `at` is the dirty anchor. `parseApprovalComment` already verified the records you consume.
- **`lib/parser.ts`** — `findApprovalComments(epicKey): Promise<Result<ApprovalComment[], JiraError>>`; already applies fail-closed parse + newest-wins per `(user, cycle)`. Call it from the new hook; do NOT re-implement parsing.
- **`lib/jira-client.ts:611-708`** — `fetchReportCycleWorklogsByEpic` (the row fetcher to extend for `restrictedCount`); `MatrixWorklogRecord` (line 567); the per-subtask `GET …/worklog` call (line 669) whose response carries `total` (`JiraWorklogListSchema`, `lib/jira-types.ts:110-113`).
- **`lib/jira-types.ts:245-265`** — `ReportEpicWorklogs` (the per-row data contract with per-ticket `worklogs` incl. `updated`); line 251 forward-compat comment for `restrictedCount` (consume it). `JiraWorklogListSchema` has `total?: number`.
- **`lib/manager-matrix.ts`** — the pure module to extend (`buildMatrixColumns`, `cellSeconds`, `formatCellHours`, `EMPTY_CELL`). Add the status fns here.
- **`components/manager/ManagerMatrix.tsx`** — the as-built grid + `ManagerMatrixRow` (the cell renderer at lines 338–365 is the surface this story paints). The row already lifts resolved `ReportEpicWorklogs[]` and has the `aria-label` per cell — extend, don't restructure.
- **`hooks/useManagerRow.ts`** — the per-report query + open/closed-cycle `staleTime` pattern to mirror in `useEpicApprovals`; throw-non-ok-Result queryFn.
- **`components/week/WeeklyGrid.tsx` (Story 4.2 `TotalsCell`)** — the EXACT color+icon+aria pattern to clone: hyphenated `state-*` utilities, `Check`/`AlertCircle` 16px `aria-hidden`, `aria-label`, visible `below target` text, `motion-safe:transition-colors`. The matrix cell is the same recipe + `RefreshCw`/`Lock` + dirty stripe.
- **`_bmad-output/implementation-artifacts/4-2-per-day-color-coding-status-icons.md`** — the canonical coloring story; the hyphenated-token gotcha (line 91), inject-`today` pattern, "color never sole signal", reduced-motion.
- **`_bmad-output/implementation-artifacts/5-3-…md`** — the matrix data contract + scope guardrails this story unlocks; the per-ticket `updated` preservation (Completion Notes) and the `restrictedCount` forward-compat seam.
- **`lib/cycle-range.ts`** — `getCurrentCycleId`/`currentCycleRange`; derive open-vs-closed cycle (for `useEpicApprovals` staleTime) and the cycle window for `workdaysElapsed` — the cycle id MUST match what 5.1/5.6 checksum.
- **`lib/hours.ts`** — `secondsToHours`/`hoursToSeconds` for target math; never inline `/3600`.

### Architecture & convention guardrails (binding — AR/UX-DR)

- **All Jira HTTP through `lib/jira-client.ts` → `jiraGet`** (scheduler-gated, Zod, `Result`); never raw `fetch` (AR12). Approval fetches per Epic flow through the SW token-bucket scheduler singleton (NFR2). One slow/failed Epic approval query must not block the matrix (per-Epic independent queries; failure → treat that Epic's cells as unapproved + render hours).
- **`Result<T,E>` at I/O boundaries** — branch on `result.kind`; queryFn throws non-ok so TanStack `error` carries it (mirror `useManagerRow`).
- **Pure logic in `lib/` with co-located `*.test.ts` (AR29).** `lib/dirty-detect.ts` + `lib/dirty-detect.test.ts`; status decision extends `lib/manager-matrix.ts`(.test). `lib/` is React-free — NO React/chrome/network imports.
- **No clock in pure functions** — inject `approvalAt`, `today`, `workdaysElapsed`, `targetHours`. Deterministic tests (4.2 pattern).
- **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`): narrow all `array[i]`; spread optional props conditionally. String-literal discriminated unions, not enums.
- **ESLint (AR4):** kebab-case lib files, `PascalCase.tsx` components; named exports only; no `any`; no `console.log` (use `lib/log.ts`); no inline `*3600`/`/3600`; import order; no barrel `index.ts`; `@/` alias.
- **Semantic HTML + a11y (NFR12/13, UX-DR15/32):** keep the real `<table>` + `<th scope>`; color paired with icon + `aria-label` + (gap/dirty) visible text; the dirty stripe is the warning's non-color signal; lock icon has `aria-label`/`<title>` + tooltip. Visible focus ring (`accent` 2px) on any focusable element. Progressive-row reveal stays `aria-live="polite"`.
- **Motion (UX-DR33):** cell color changes `motion-safe:transition-colors motion-safe:duration-200`; instant under `prefers-reduced-motion: reduce`. No spinners; don't animate icon swaps.
- **STRINGS co-located (UX-DR31):** all new copy in the existing `STRINGS` const; honest, no exclamation marks (UX-DR30).
- **Popup width 360 px:** the cell now carries hours + icon (+ maybe a word) + possible lock overlay — keep the tight inline/stack layout; do not overflow. Horizontal scroll past 4 Epic columns already handled by 5.3.

### Previous-story intelligence

- **Story 5.3 (done — the seam you build on):** neutral `ManagerMatrix.tsx` + `ManagerMatrixRow`; per-report `useManagerRow` queries; `ReportEpicWorklogs` PRESERVES per-ticket `worklogs` with `updated` (the dirty input) — confirmed in its Completion Notes. The `restrictedCount` field was deliberately left for THIS story (forward-compat comment at `jira-types.ts:251`). The fetcher already filters worklogs to the report's `accountId`. Subtask→Epic rollup walks one grandparent level (its open design question is orthogonal to 5.4 — you consume whatever columns it produced).
- **Story 5.1 (done):** `lib/comment-schema.ts` / `lib/checksum.ts` / `lib/parser.ts` / `PROTOCOL.md`. `findApprovalComments` returns verified, newest-wins approvals. The `at` payload field (checksum-covered) is the dirty anchor — NOT Jira `created`. Don't re-implement; just consume.
- **Story 4.2 (done — the coloring template):** `computeDayStatuses` (pure, injected `today`) + `WeeklyGrid` `TotalsCell` (hyphenated `state-*`, `Check`/`AlertCircle` 16px `aria-hidden`, `aria-label`, visible `below target`, `motion-safe:transition-colors`). The matrix cell is the same recipe extended with `RefreshCw`/`Lock`/dirty-stripe. **The hyphenated-token gotcha (4.2 Dev Notes line 91) is the single biggest disaster to avoid.**
- **Gate baseline (after 5.3):** ~64 suites / 795 passed / 1 skipped; tsc 0; eslint 0 errors (57 pre-existing import/order warnings tolerated). Keep new files warning-clean; record before/after.

### What NOT to do (disaster prevention)

1. Do **NOT** use the underscore/dot token names from the planning docs (`state.warning_subtle`). Use the repo's **hyphenated** utilities (`bg-state-warning-subtle`). (4.2 trap.)
2. Do **NOT** re-implement comment parsing / checksum / newest-wins — call `findApprovalComments` (5.1). Do **NOT** POST any approval comment (that's 5.6).
3. Do **NOT** anchor dirty on Jira `created` — use the approval **payload `at`** (the checksum-covered, `approvalAtFor`-returned field). Strict `>` (`updated === at` is clean).
4. Do **NOT** flag an unapproved cycle as dirty or red-by-default — no approval = neutral/own-status, never auto-red (epics §5.4 AC 2).
5. Do **NOT** color by cell hours alone for the gap signal — gap/on-target is a per-row, per-cycle target judgment (row total vs `target × workdaysElapsed`); approved/dirty are per-`(report, Epic)` cell. Keep the split documented (AC 4).
6. Do **NOT** read the clock inside `lib/` — inject `today`/`approvalAt`/`workdaysElapsed`/`targetHours`.
7. Do **NOT** fetch all Epics' approvals in one blocking `Promise.all` — per-Epic independent queries through the scheduler; a failed Epic approval query degrades to "unapproved" for those cells, never a dead matrix.
8. Do **NOT** build the drill-down panel (5.5) or any Approve/Re-approve button / "X of N done" chip (5.6/5.7/5.8). Leave the row-end action area empty; keep cells click-affordance-ready only.
9. Do **NOT** change `fetchCurrentUserWeekWorklogs`/`…ByIssue` signatures (badge/banner/week depend on them) — extend only `fetchReportCycleWorklogsByEpic`.
10. Do **NOT** communicate any state by color alone — icon + aria-label + (gap/dirty) text + (dirty) stripe always accompany color (NFR12).
11. Do **NOT** over-count restricted worklogs — bias toward presence (lock) over an inexact count; surface the design question if `total` isn't window-scoped (see design note).

### Project Structure Notes

All locations match `architecture.md`'s project tree: `lib/dirty-detect.ts` (+ `.test.ts`) — architecture lines 728–729 ("Per (user, cycle) dirty detection (FR39)"); `lib/manager-matrix.ts` (UPDATE, pure); `hooks/useEpicApprovals.ts` (NEW — architecture aspirationally names `useManagerMatrix.ts`/`useDirtyStatus.ts`; this story adds the focused per-Epic approval hook, consistent with 5.3's per-row `useManagerRow` granularity — an aggregator can wrap later); `components/manager/ManagerMatrix.tsx` (UPDATE — architecture aspirationally lists `MatrixCell.tsx`/`DirtyIndicator.tsx`/`VisibilityWarning.tsx` as separate files, but 5.3 shipped a single `ManagerMatrix.tsx`; match the as-built structure — a `MatrixCell` sub-component or inline cell renderer is fine; only split files if it reads cleaner). `lib/jira-client.ts` + `lib/jira-types.ts` (UPDATE for `restrictedCount`). No new dependencies (React 18, TanStack Query v5, date-fns v4, Zod v3, Tailwind v4, lucide-react, Radix tooltip all present/available). No manifest/permission changes. No service-worker changes (approval reads reuse the existing scheduler path).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4 (lines 1324-1356)] — full ACs: five cell states (approved dark-green/white + Check + border; on-target subtle-green + Check; gap subtle-red + AlertCircle; dirty warning-subtle + diagonal stripe + RefreshCw; locked Lock overlay); color never sole signal (NFR12); `lib/dirty-detect.ts` `updated > approval.at` strict, per `(user, cycle)`, no-approval = unapproved-not-red; `restrictedCount` + "⚠ N restricted" row chip + lock overlay; test matrix.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3 (lines 1284-1322) / 5.5 (1358-1392) / 5.6 (1393-1438) / 5.7 (1439-1469)] — the matrix this paints; deferred drill-down (5.5 reuses the per-ticket records + `restrictedCount`), approve fan-out POST (5.6), re-approve (5.7) seams.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 (lines 1199-1201) + FR30/FR34/FR37/FR39/FR41] — manager coloring, visibility warnings, dirty/re-approval, multi-manager-per-Epic independence.
- [Source: PROTOCOL.md (lines 117-127)] — dirty-detection rule (forward reference → THIS story): `updated > at`, "stale approval", UI surfaces re-approval; (lines 45-79) v=1 payload `at` field + checksum/`at` semantics; (lines 96-115) newest-wins-per-(user,cycle) on Jira `created`.
- [Source: _bmad-output/planning-artifacts/architecture.md (lines 96, 578, 686, 728-729, 838)] — approval-comment protocol + dirty-detect; `PROTOCOL.md`; `useDirtyStatus.ts`; `lib/dirty-detect.ts` "Per (user, cycle) dirty detection (FR39)"; Manager-Approval module map (`lib/parser.ts`, `lib/dirty-detect.ts`).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR15 / Color System (lines 620-684) / Iconography (790-804) / Accessibility (833-843) / MatrixCell (1456-1458) / DirtyIndicator+VisibilityWarning (1508-1526)] — cell states + tokens; lucide `Check`/`AlertCircle`/`RefreshCw`/`Lock` 16px `currentColor`; "yellow stripe uses diagonal lines, not just yellow bg"; cell `aria-label="Sarah, PROJ-A, 64 hours, below target"`; lock icon `aria-label`/`<title>` + Radix Tooltip; "⚠ N restricted" chip.
- [Source: styles/globals.css (lines 33-40)] — `@theme` state tokens are **hyphenated** (`--color-state-success`/`-subtle`, `--color-state-warning`/`-subtle`, `--color-state-danger`/`-subtle`); utilities `bg-state-warning-subtle` / `text-state-warning` etc. (NOT the underscore form in planning docs).
- [Source: lib/comment-schema.ts:40-63] — `ApprovalComment` `{ v, user, cycle, by, at, restrictedCount, checksum }`; `at` is the dirty anchor.
- [Source: lib/parser.ts:68-108] — `findApprovalComments(epicKey)` → verified, newest-wins approvals (consume; don't re-implement).
- [Source: lib/checksum.ts:11-79] — canonical `{v,user,cycle,by,at,restrictedCount}` checksum; `at` consistency with dirty-detect.
- [Source: lib/jira-client.ts:611-708] — `fetchReportCycleWorklogsByEpic` (extend for `restrictedCount`); per-subtask `GET …/worklog` returns `total` (`JiraWorklogListSchema`).
- [Source: lib/jira-types.ts:87-115, 245-265] — `JiraWorklogSchema.updated?`, `JiraWorklogListSchema.total?`, `ReportEpicWorklogs` (+ `restrictedCount` forward-compat comment line 251).
- [Source: lib/manager-matrix.ts] — pure module to extend (`buildMatrixColumns`, `cellSeconds`, `formatCellHours`, `EMPTY_CELL`).
- [Source: components/manager/ManagerMatrix.tsx:255-366] — `ManagerMatrixRow` cell renderer (the painting surface); existing per-cell `aria-label`.
- [Source: hooks/useManagerRow.ts] — open/closed-cycle `staleTime` + throw-non-ok queryFn pattern for `useEpicApprovals`.
- [Source: components/week/WeeklyGrid.tsx + _bmad-output/implementation-artifacts/4-2-per-day-color-coding-status-icons.md] — the EXACT color+icon+aria+motion pattern to clone; the hyphenated-token gotcha (4.2 line 91); inject-`today` deterministic pattern.
- [Source: lib/cycle-range.ts] — `getCurrentCycleId`/`currentCycleRange` (open/closed cycle + window for `workdaysElapsed`); cycle id must match 5.1/5.6 checksum.
- [Source: lib/hours.ts] — `secondsToHours`/`hoursToSeconds` (no inline `/3600`).

### Review Findings

Code review (2026-06-27, three parallel adversarial layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor). The dirty-detection core (`lib/dirty-detect.ts`), the per-row/per-cell status decision, the hyphenated `state-*` coloring + icons + dirty stripe + lock overlay, and the READ-ONLY approval fetch all verified faithful to the spec and PROTOCOL.md. Two patches applied; one design question surfaced.

- [x] [Review][Patch] Test suite leaked 27 unhandled rejections — `targetHoursItem` storage boundary unmocked [components/manager/ManagerMatrix.test.tsx] — `ManagerMatrix` reads `targetHours` from settings in a `useEffect`; the test never mocked `@/lib/storage/settings`, so the real `@wxt-dev/storage` `getValue()` threw `Cannot read properties of undefined (reading 'runtime')` after mount. Tests passed (rejections landed post-assertion) but the suite was not clean and the targetHours path was untested. FIXED: mocked `@/lib/storage/settings` with a `targetHoursMock` defaulting to 8 in `beforeEach`.
- [x] [Review][Patch] `computeRowStatus` painted a future/not-started cycle falsely `on-target` against a zero target [lib/manager-matrix.ts] — when `workdaysElapsed === 0` (future cycle, or all-weekend window), `targetSeconds = 0`, so any `rowSeconds > 0` satisfied `>= 0` and returned `on-target` (false green). FIXED: added `if (workdaysElapsed <= 0) return 'unapproved-neutral'` — no elapsed workdays → no basis to judge. Updated the co-located test.
- [x] [Review][Defer] Approval-fetch failure downgrades a *dirty* cell to neutral/green, hiding the re-approval signal [components/manager/ManagerMatrix.tsx:503] — deferred: this is the spec's own AC5 mandate ("on error treat that Epic's cells as unapproved; the row's hours still render"). A by-design tradeoff. Worth an Epic-6 follow-up to add a quiet "couldn't check approval" cell indicator so a transient comment-fetch error is distinguishable from genuinely-unapproved, but out of scope for 5.4.
- [x] [Review][Defer] `useEpicApprovals` queryKey omits `cycle` while `staleTime` depends on it [hooks/useEpicApprovals.ts:42] — deferred: benign today (the matrix renders a single `cycle` per mount, and the approval data is cycle-independent — `approvalAtFor` filters by cycle downstream). Latent coupling only if a future split/concurrent-cycle view ever observes the same `epicKey` under two cycles. All three layers concurred it is not a current defect.

**Design question (unresolved — surfaced per AC11 / Dev Notes line 194):** `restrictedCount = total − returnedLen`. Both the Blind and Edge layers flagged this as the highest risk. The fetcher calls the worklog endpoint with `startedAfter`/`startedBefore`, so the returned `worklogs` array is window-scoped; the code assumes Jira's `total` is window-scoped too, making the delta exact. If Jira's `total` is instead the issue's all-time worklog count, a subtask with many historical worklogs would report a large false-positive delta (false lock + inflated "⚠ N restricted" chip), and that inaccurate count would propagate into the 5.6 approval payload. The implementation correctly biases toward presence (lock fires on any positive delta) and clamps `>= 0`, so it never throws or corrupts — but the exact chip count needs confirmation of Jira's `total` window-scoping semantics before 5.6 persists it. This is a genuine product/integration question, left for the team to confirm against a live Jira instance.

Dismissed as noise (false positives / by-design): `approvalAtFor` "unparseable `at` can win" (correct per AC2 — parseable beats unparseable, and the sole-match case is intentional; a corrupt `at` is the 5.1 parser's fail-closed concern); `computeCellStatus` final neutral branch "unreachable" (defensive, correct); `workdaysElapsedInWindow` "UTC/local mismatch" (false positive — both `currentCycleRange` and the loop use local date components consistently); dirty rule "can't detect deletions" (documented scope — the rule is `updated > at` per PROTOCOL.md); `throw result` not an Error (matches the existing `useManagerRow` convention); N×M `useEpicApprovals` hooks (the deduped-per-Epic independent-query fan-out is an explicit AC5 requirement); `findApprovalComments` pagination on restricted comments (pre-existing 5.1 code, out of scope).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code dev-story workflow)

### Debug Log References

- Gate baseline (start): 64 suites / 795 passed / 1 skipped; tsc 0; eslint 0 errors / 57 warnings.
- Final gates: `npm run test --run` → 66 suites / 838 passed / 1 skipped; `tsc --noEmit` → 0 errors; `eslint .` → 0 errors / 57 warnings (all pre-existing import/order; new files warning-clean); `npm run build` → popup builds (chrome-mv3, 535ms).

### Completion Notes List

- **`lib/dirty-detect.ts` (NEW, pure)** — `isCycleDirty` uses strict `>` of worklog `updated` epoch ms vs the approval payload `at` (the checksum-covered field, NOT Jira `created`); null/empty/unparseable `approvalAt` → `false` (unapproved ≠ dirty), worklogs with absent/unparseable `updated` are ignored. `approvalAtFor` matches `(user, cycle)` exactly (ignores other users' approvals, FR41), `null` when none, and defensively keeps the latest parseable `at` if two match. No clock read — deterministic. References `PROTOCOL.md` §Dirty-detection.
- **`lib/manager-matrix.ts` (UPDATE, pure)** — added `CellStatus` union, `computeRowStatus` (row-grain on-target/gap vs `hoursToSeconds(targetHours) × workdaysElapsed` — no inline `*3600`), `cellWorklogTimes` (per-(report, Epic) `updated` extractor), and `computeCellStatus` (decision order dirty → approved → gap → on-target → neutral; an empty cell is always neutral, never red-by-default).
- **Target/gap split (AC 4)** — on-target/gap is a **per-row** judgment computed from the row's summed seconds across all Epics; approved/dirty are per-`(report, Epic)`. Each non-empty cell inherits the row status; the per-cell approval anchor layers approved/dirty on top.
- **`lib/jira-client.ts` + `lib/jira-types.ts` (UPDATE)** — added per-Epic `restrictedCount` to `ReportEpicWorklogs` and a new `ReportCycleWorklogs = { epics, restrictedCount }` wrapper as the row return shape. `fetchReportCycleWorklogsByEpic` derives `restricted = max(0, total - returnedLen)` per subtask (undefined `total` → 0, never throws), attributes it to the Epic group, and sums the row total. A subtask with restricted-only worklogs still surfaces its Epic column so the lock is visible. Week/badge fetcher signatures untouched. `useManagerRow` updated to the wrapper type.
- **`hooks/useEpicApprovals.ts` (NEW)** — one TanStack query per Epic key (`['epic-approvals', epicKey]`, deduped across rows/cells), calling 5.1's `findApprovalComments`, throwing the non-`ok` Result so `error` carries the `JiraError`. Open-cycle `staleTime 60_000`, closed-cycle `Infinity` (mirrors `useManagerRow`). No POST.
- **`components/manager/ManagerMatrix.tsx` (UPDATE)** — extracted a `MatrixCell` sub-component that calls `useEpicApprovals` per cell (deduped), computes `approvalAt`/`CellStatus`, and paints with the AC-6 hyphenated `state-*` tokens + lucide `Check`/`AlertCircle`/`RefreshCw` (16px, `aria-hidden`) + per-status `aria-label` + visible `below target`/`needs re-approval` text + `motion-safe:transition-colors duration-200`. Dirty cells layer a single `DIRTY_STRIPE_STYLE` 45° `repeating-linear-gradient` over `bg-state-warning-subtle`. Restricted cells stack a `Lock` icon (with `title` + `aria-label` and `, restricted visibility` appended to the cell label); the row shows a "⚠ N restricted" chip beside the name. `targetHours` loaded from settings (default 8); `today`/`workdaysElapsed` derived once at component level and injected. Row-end action area left empty; cells click-affordance-ready only (5.5/5.6/5.7 seams clean).
- **Tooltip primitive note** — no Radix/shadcn `tooltip` primitive exists in `components/ui/`; per the story's allowed fallback, the lock and row chip use `title` + `aria-label` (a11y-equivalent). Epic 6 a11y audit owns final tooltip polish.
- **`restrictedCount` source — design question (see Final Report):** the count is `total - returnedWorklogs.length`. Jira's worklog-list `total` is the issue's all-time worklog count, while the returned array is window-scoped by `startedAfter`/`startedBefore`. If `total` is NOT also window-scoped, the delta over-counts out-of-window worklogs. Biased toward presence (the lock always fires on any positive delta) over an exact count; the chip count uses the delta as an upper-bound indicator. Recommend confirming whether Jira's `total` is window-scoped before relying on the exact count in the 5.6 approval payload.

### File List

- `lib/dirty-detect.ts` (NEW)
- `lib/dirty-detect.test.ts` (NEW)
- `lib/manager-matrix.ts` (MODIFIED)
- `lib/manager-matrix.test.ts` (MODIFIED)
- `lib/jira-client.ts` (MODIFIED)
- `lib/jira-client.test.ts` (MODIFIED)
- `lib/jira-types.ts` (MODIFIED)
- `hooks/useEpicApprovals.ts` (NEW)
- `hooks/useEpicApprovals.test.tsx` (NEW)
- `hooks/useManagerRow.ts` (MODIFIED)
- `components/manager/ManagerMatrix.tsx` (MODIFIED)
- `components/manager/ManagerMatrix.test.tsx` (MODIFIED)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED — status tracking)

## Change Log

| Date       | Change                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| 2026-06-27 | Story 5.4 implemented: pure `lib/dirty-detect.ts`, cell/row status in `lib/manager-matrix.ts`, per-Epic `restrictedCount` in the row fetcher, `useEpicApprovals` hook, and the cell coloring + dirty stripe + lock overlay + "⚠ N restricted" chip in `ManagerMatrix.tsx`. Status → review. |
