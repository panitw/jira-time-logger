---
baseline_commit: 54e1769e7eebf57996af4445407f05f9018e6e3f
---

# Story 5.8: Non-Canonical Manager Read-Only Mode

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a project manager with read access to a teammate's data but no approval authority,
I want to read the manager matrix for them but be told clearly that I cannot approve,
so that I don't accidentally try to approve and so the report's canonical manager can do their job.

## Acceptance Criteria

**AC1 — Non-canonical row renders disabled Approve + tooltip (FR36, UX-DR17, UX-DR25)**
**Given** the user is viewing the manager matrix
**When** any row is rendered for a report whose canonical manager (their Jira `manager` field) is NOT the current user
**Then** the row's right-side Approve button is rendered disabled in primary-tier visual (`disabled:text-neutral-300` + `cursor-not-allowed`, already on the base `Button`)
**And** the disabled button's `title` (hover tooltip — the project's established tooltip mechanism) reads exactly: `Only <Person>'s canonical manager (<Manager-Name>) can approve their cycle. You can read but not approve here.` where `<Person>` is `report.displayName` and `<Manager-Name>` is the report's actual canonical manager display name from their Jira `manager` field.

**AC2 — Mixed canonical / non-canonical matrix**
**Given** the current user is the canonical manager of some reports AND a non-canonical reader of others
**When** the matrix renders
**Then** rows where the user IS canonical show enabled Approve / Re-approve buttons (existing 5.6/5.7 behavior, unchanged)
**And** rows where the user is non-canonical show the disabled Approve with the tooltip (AC1)
**And** the matrix as a whole still loads all visible rows — the user reads every row freely; non-canonicality disables only the Approve action, never the row, the cells, or the drill-down.

**AC3 — Drill-down stays read-only for everyone (FR36)**
**Given** a non-canonical reader clicks a cell
**When** the `DrillDownPanel` opens
**Then** the drill-down behavior is identical to the canonical-manager flow — full evidence is read (per-ticket aggregation + `VisibilityWarning`)
**And** no new Approve CTA is introduced in the drill-down (it has none today; this story does not add one). No change to `DrillDownPanel.tsx` is required.

**AC4 — Canonicality check (lib/canonical-manager.ts)**
**Given** a new `lib/canonical-manager.ts` (framework-agnostic, no React imports) determines canonicality
**When** the check runs for a report's `accountId`
**Then** it reads the report's `manager` field from Jira's user directory via `jiraGet('rest/api/3/user?accountId=<id>&expand=manager', JiraUserSchema)` and compares `manager.accountId` to the current user's `accountId`
**And** it returns BOTH the boolean canonicality AND the report's canonical-manager `displayName` (needed for the AC1 tooltip), e.g. `{ isCanonical: boolean; canonicalManagerName: string | null }`.

**AC5 — Fail-closed on ambiguity (safer for a write action)**
**Given** the canonicality check cannot conclusively determine the report's manager (the user lookup errors, the `manager` field is absent/null, or the current user's `accountId` is still resolving)
**When** the result is consumed
**Then** the row is treated as NON-canonical (read-only) — fail closed, mirroring `hasDirectReports()`'s fail-closed-to-`false` precedent
**And** when the reason stems from an unresolved current-user account (not a known non-canonical manager), the existing `'Resolving your account…'` reason takes precedence so a transient load is not mislabeled as a permission denial.

**AC6 — Cached in TanStack Query on the 24h directory TTL**
**Given** the canonicality result is fetched in a hook (`hooks/useCanApprove.ts`)
**When** the query runs
**Then** it is cached in TanStack Query keyed minimally on the report's `accountId` (e.g. `['canonical-manager', reportAccountId]`)
**And** its `staleTime` is `24 * 60 * 60 * 1000` (24h), matching `useManagerReports`' `REPORTS_STALE_TIME` and `DIRECT_REPORTS_TTL_MS` directory freshness window
**And** the hook follows the project convention: queryFn throws the non-`ok` `Result`; it does NOT override the popup `QueryClient`'s retry/retryDelay.

**AC7 — Mid-session manager change re-evaluates**
**Given** the user is canonical at matrix load but the report's `manager` field changes in Jira mid-session
**When** the cache refreshes on the next popup open after the 24h TTL expires
**Then** canonicality re-evaluates and the Approve buttons update accordingly (enabled ↔ disabled), with no extra wiring beyond the `staleTime` (TanStack refetches a stale query on next mount).

**AC8 — Wired through the existing 5.6/5.7 `disabledReason` seam (no regression)**
**Given** `components/manager/ApproveButton.tsx` already has the `disabledReason?: string | undefined` seam that gates BOTH `approve` and `reapprove` modes (`disabled = isEmpty || inFlight || disabledReason !== undefined`; `title = disabledReason ?? …`)
**When** a non-canonical reason string is produced
**Then** it is OR'd into the existing `disabledReason={…}` ternary in `ManagerMatrix.tsx`'s `approveCell` — `ApproveButton` itself needs no change (the canonicality reason flows prop → `disabled` term + `title` tooltip)
**And** the precedence is: `'Resolving your account…'` (current-user unresolved) → non-canonical tooltip → `undefined` (enabled). The empty-row disable (`'No hours logged this cycle to approve'`) continues to be handled inside `ApproveButton` and is unaffected.

**AC9 — Tests (co-located, vitest)**
**Given** the project's testing standard (new `lib/` modules require co-located unit tests)
**Then** `lib/canonical-manager.test.ts` covers: canonical (manager.accountId === current user), non-canonical (differs), fail-closed on lookup error, fail-closed on absent/null `manager`, and the returned `canonicalManagerName`
**And** `components/manager/ManagerMatrix.test.tsx` is extended to assert a non-canonical row renders the disabled Approve with the exact AC1 tooltip string, a canonical row stays enabled, and the `'Resolving…'` precedence still holds.

## Tasks / Subtasks

- [x] **Task 1 — `lib/canonical-manager.ts`: canonicality computation (AC4, AC5)**
  - [x] Create `lib/canonical-manager.ts` (kebab-case, named exports, NO React imports — framework-agnostic per `lib/` convention).
  - [x] Export `type CanonicalManagerResult = { isCanonical: boolean; canonicalManagerName: string | null }`.
  - [x] Export `async function resolveCanonicalManager(reportAccountId: string, currentUserAccountId: string): Promise<CanonicalManagerResult>`.
  - [x] Implementation: `jiraGet(\`rest/api/3/user?accountId=${encodeURIComponent(reportAccountId)}&expand=manager\`, JiraUserSchema)` (reuse the EXACT path string + `&expand=manager` pattern from `findDirectReports`, `lib/manager-resolution.ts:159-161`; route through `jiraGet` only — never raw `fetch`).
  - [x] On non-`ok` Result OR `manager == null`: return `{ isCanonical: false, canonicalManagerName: null }` (fail closed — AC5; mirror the `hasDirectReports()` fail-closed precedent). Log a `log.warn` on the error branch like the candidate-failed path.
  - [x] On `ok`: `isCanonical = user.manager.accountId === currentUserAccountId`; `canonicalManagerName = user.manager.displayName`.
  - [x] Consider co-locating in `lib/manager-resolution.ts` as an alternative; the story specifies `lib/canonical-manager.ts` (architecture.md names it) — default to the dedicated file.

- [x] **Task 2 — `hooks/useCanApprove.ts`: TanStack query wrapper (AC6, AC7)**
  - [x] Create `hooks/useCanApprove.ts` (use + PascalCase). Signature: `useCanApprove(reportAccountId: string, currentUserAccountId: string | undefined)`.
  - [x] `useQuery<CanonicalManagerResult, JiraError>({ queryKey: ['canonical-manager', reportAccountId], queryFn, staleTime: 24 * 60 * 60 * 1000, enabled: !!currentUserAccountId })`. Define the staleTime as a `SCREAMING_SNAKE_CASE` const (e.g. `CANONICAL_STALE_TIME = 24 * 60 * 60 * 1000`).
  - [x] queryFn calls `resolveCanonicalManager(reportAccountId, currentUserAccountId!)`. `resolveCanonicalManager` never returns a non-`ok` Result (it fails closed to a value), so the queryFn returns a value directly; if you instead surface errors, throw the non-`ok` Result per convention. Prefer the fail-closed value so a transient error renders read-only (safe) rather than an error row.
  - [x] Do NOT override the popup `QueryClient` retry/retryDelay (per `useManagerRow`/`useEpicApprovals` comments).

- [x] **Task 3 — Wire canonicality into the matrix row (AC1, AC2, AC8)**
  - [x] In `components/manager/ManagerMatrix.tsx` `ManagerMatrixRow`, call `useCanApprove(report.accountId, managerAccountId)` (`managerAccountId` is already lifted from `useCurrentUser()` and passed down RowProps).
  - [x] Build the non-canonical reason string with the EXACT copy: `Only ${report.displayName}'s canonical manager (${canonicalManagerName ?? 'their manager'}) can approve their cycle. You can read but not approve here.` — pick a sensible fallback (`'their manager'`) when `canonicalManagerName` is null so the sentence reads naturally under fail-closed.
  - [x] Update the existing `disabledReason={…}` expression in `approveCell` to the precedence chain (AC8): if `managerAccountId === undefined || managerAccountId === ''` → `'Resolving your account…'`; else if canonicality query is still loading → keep enabled or fail-closed (decide: while the canonicality query loads, fail closed to a brief non-canonical/read-only state OR keep `'Resolving your account…'`-style copy — prefer NOT enabling the button until canonicality is known, to avoid a flicker where a non-canonical user briefly sees an enabled Approve); else if `!isCanonical` → the non-canonical tooltip; else `undefined`.
  - [x] Keep `by={managerAccountId ?? ''}` and all other props unchanged. Do NOT touch `ApproveButton.tsx` (the seam already gates both modes).

- [x] **Task 4 — Verify drill-down requires no change (AC3)**
  - [x] Confirm `DrillDownPanel.tsx` has no Approve/Re-approve CTA and does not import `ApproveButton` (it doesn't, per analysis). No code change; add/verify a test or note that drill-down is read-only for all users.

- [x] **Task 5 — Tests (AC9)**
  - [x] `lib/canonical-manager.test.ts`: mock `jiraGet`; cases: canonical match, non-canonical differ, lookup error → fail-closed, `manager` absent/null → fail-closed, `canonicalManagerName` returned correctly.
  - [x] Extend `components/manager/ManagerMatrix.test.tsx`: mock `useCanApprove` (or the underlying `jiraGet`); assert non-canonical row → disabled `approve-button` with exact AC1 `title`; canonical row → enabled; unresolved `managerAccountId` → `'Resolving your account…'` precedence preserved.
  - [x] Run `pnpm test` (vitest run) — all green; no regressions in existing `ApproveButton.test.tsx` / `manager-resolution.test.ts`.

## Dev Notes

### CRITICAL design context — the current row set is canonical-only by construction

`useManagerReports()` → `findDirectReports(currentUserAccountId)` (`lib/manager-resolution.ts`) returns ONLY reports where `user.manager?.accountId === currentUserAccountId` (lines 148-171). **So with today's row-set source, every matrix row is already canonical and the non-canonical branch never fires.** This story is therefore **forward-compatible / fail-safe wiring**, not a behavior change for today's single-source row set:

- It implements the canonicality gate as an INDEPENDENT per-report verification (not relying on the row-set source to be canonical), so the moment the row set ever broadens (a future skip-level expansion, shared/matrixed visibility, a persisted stale view-state surfacing a report whose Jira manager changed), the Approve action is correctly gated read-only.
- It also covers the legitimate mid-session case (AC7): a report whose `manager` field changes in Jira after load — on TTL refresh the user becomes non-canonical for that row and Approve correctly disables, even though the row still appears (the stale `manager-reports` cache may still list them until its own 24h TTL lapses).
- **Fail-closed is the safe default for a write action** (AC5): if canonicality can't be proven, do NOT enable Approve. This matches `hasDirectReports()` returning `false` on any error.

This framing is the answer to "what does a non-canonical manager do?" — read everything (matrix rows, cells, drill-down evidence), approve nothing.

### The `disabledReason` seam (reuse — do NOT rebuild)

`components/manager/ApproveButton.tsx` already owns the seam (left by 5.6/5.7). Confirmed current code:

```ts
const disabled = isEmpty || inFlight || disabledReason !== undefined;  // gates BOTH approve & reapprove
const title = disabledReason ?? (isEmpty ? 'No hours logged this cycle to approve' : undefined);
// <Button disabled={disabled} title={title} aria-label={label} variant={isReapprove ? 'secondary' : 'primary'} ...>
```

The prop is `disabledReason?: string | undefined` (the `| undefined` is required by `exactOptionalPropertyTypes`). It already fires for `mode === 'reapprove'` too. **This story only computes the canonicality string and ORs it into the matrix's existing ternary.** ApproveButton needs NO change.

Today's wiring in `ManagerMatrix.tsx` `approveCell` (≈ line 630) already sets one reason — `'Resolving your account…'` when `managerAccountId` is unresolved. Extend that ternary; preserve its precedence.

### Tooltip mechanism — native `title`, NOT a Radix Tooltip

There is **no Radix Tooltip and no `components/ui/tooltip.tsx`** in the repo (`package.json` has only `@radix-ui/react-dialog` + `@radix-ui/react-tabs`). Every "tooltip" in this codebase is the native HTML `title` attribute (`VisibilityWarning`, the partial chip, the restricted-count chip all use `title` + `aria-label`). Follow that pattern — do NOT add `@radix-ui/react-tooltip`. The UX spec mentions a `tooltip` shadcn primitive aspirationally, but the established, accessible-equivalent implementation here is `title`.

- **Known/accepted limitation (do NOT try to "fix" in this story):** the base `Button` sets `disabled:pointer-events-none`, so a disabled button's native `title` is not hover-revealed (it remains in the DOM for AT). This was deliberately deferred in 5.6's review; stay consistent. `aria-disabled` is emitted by the disabled `<button>` for free (no extra work).

### Files to TOUCH

- **NEW** `lib/canonical-manager.ts` + `lib/canonical-manager.test.ts`
- **NEW** `hooks/useCanApprove.ts` (+ optional `hooks/useCanApprove.test.tsx`)
- **UPDATE** `components/manager/ManagerMatrix.tsx` — `ManagerMatrixRow`: call the hook, build the reason, extend the `disabledReason` ternary in `approveCell`. (RowProps already carries `managerAccountId: string | undefined`.)
- **UPDATE** `components/manager/ManagerMatrix.test.tsx`
- **DO NOT TOUCH** `components/manager/ApproveButton.tsx` (seam is complete), `components/manager/DrillDownPanel.tsx` (read-only, no Approve CTA).

### Reusable building blocks (do NOT reinvent)

- Current user accountId: `useCurrentUser()` → `.data` (`string | undefined`), queryKey `['current-user']`, 24h staleTime, source `rest/api/3/myself` → `accountId`. Already lifted in `ManagerMatrix` as `managerAccountId` and passed down RowProps — reuse it; do NOT re-fetch myself.
- Jira user + manager field: `JiraUserSchema` (`lib/jira-types.ts`) = `{ accountId, displayName, manager?: { accountId, displayName } }`. The `manager` sub-object is the canonical-manager source. **Keep `manager` in the schema** — Story 1.4's review found it was originally stripped by Zod, silently breaking resolution.
- I/O boundary: `jiraGet<T>(path, schema): Promise<Result<T, JiraError>>` (`lib/jira-client.ts`) — handles auth/refresh/429/403/404/Zod. Never raw `fetch`.
- `Result` kinds (`lib/result.ts`): `ok` (`.value`), plus `rate-limited`/`auth-expired`/`network`/`parse-error`/`forbidden`/`not-found` — branch on `kind`; treat any non-`ok` as fail-closed for canonicality.
- Fail-closed precedent: `hasDirectReports()` returns `false` on any error (`lib/manager-resolution.ts`).
- The exact directory lookup string to copy: `rest/api/3/user?accountId=<id>&expand=manager` (from `findDirectReports`).

### Anti-patterns to avoid

- Do NOT derive canonicality from `lib/storage/settings.ts` `managerAccountIdItem` (`local:managerAccountId`) — that is the CURRENT USER's OWN manager (who they report to), NOT a report's manager. Using it would invert the relationship.
- Do NOT add a read-only banner — the spec specifies the per-button tooltip only (no banner copy exists in the UX spec). The matrix loads fully; only the Approve action is gated.
- Do NOT block/throw the row on a non-canonical or fail-closed result — graceful degradation rule: render the non-blocking disabled state, never block the matrix.
- Do NOT enable Approve while canonicality is still loading (avoid a flash of an enabled button for a non-canonical user) — fail closed during load.

### Testing standards

- Runner: `vitest@^2.1.8`, `pnpm test` = `vitest run`. `environment: 'jsdom'`, `globals: true` (no need to import `describe/it/expect`). Path alias `@/` → root. Tests co-located as `*.test.ts` / `*.test.tsx`.
- React tests: `@testing-library/react@^16.3.0` + `@testing-library/jest-dom`; wrap hooks in a `QueryClientProvider`. Mock the I/O boundary (`lib/jira-client` `jiraGet`) and `lib/log`. Existing `ManagerMatrix.test.tsx` / `ApproveButton.test.tsx` show the established mocking patterns — match them.
- New `lib/` module ⇒ co-located unit test is a binding rule.

### Project Structure Notes

- `lib/` = flat kebab-case, framework-agnostic, named exports, no barrels. `hooks/` = `use{PascalCase}.ts(x)`. `components/manager/` = the manager view (`ManagerMatrix.tsx`, `ApproveButton.tsx`, `DrillDownPanel.tsx`, `VisibilityWarning.tsx`).
- TS: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (⇒ `?: T | undefined`). Prefer `type` over `interface`; no `any`/`as` (narrow `unknown`; `as` only after a runtime check with a comment); discriminated unions over enums; consts `SCREAMING_SNAKE_CASE`.
- Architecture.md names `lib/canonical-manager.ts` and `hooks/useCanApprove.ts` for "FR36 — canonical manager check"; the aspirational `ApproveDisabledTooltip.tsx` / `ReApproveButton.tsx` / `MatrixCell.tsx` were never created (folded into `ApproveButton.tsx` / inline in `ManagerMatrix.tsx`) — do not create them.
- TanStack: one `QueryClient` per surface (`entrypoints/popup/main.tsx`, default `staleTime: 60_000`, `retry` ≤3 w/ rate-limit-aware `retryDelay`). Directory data uses 24h staleTime (`REPORTS_STALE_TIME`, `DIRECT_REPORTS_TTL_MS`). Query keys are flat, minimally-keyed arrays.

### References

- [Source: epics.md#Story 5.8: Non-Canonical Manager Read-Only Mode] (lines 1471-1502 — full ACs, exact tooltip copy)
- [Source: epics.md#UX-DR17] (line 188 — ApproveButton + ApproveDisabledTooltip)
- [Source: epics.md#UX-DR25] (line 204 — disabled keeps tier visual + `neutral.300` text + `cursor-not-allowed` + paired explanation, never mystery-disabled)
- [Source: prd.md#FR36] (line 639 — non-canonical managers read but Approve disabled with explanatory tooltip)
- [Source: prd.md#Canonical manager per user (v1.0 assumption)] (line 343 — exactly one canonical manager per user; canonical = Jira `manager` field via FR44)
- [Source: ux-design-specification.md#Popup: Manager view] (lines 990-1014 — matrix wireframe, row-end Approve action) and (lines 1555-1571 — button hierarchy / disabled tokens) and (lines 1812-1844 — a11y: `aria-disabled` for free, real `<button>`)
- [Source: lib/manager-resolution.ts] (lines 147-176 — `findDirectReports` canonical comparison + `&expand=manager` path; canonical-only row set)
- [Source: hooks/useManagerReports.ts] (`REPORTS_STALE_TIME = 24h`; row set is canonical-only)
- [Source: hooks/useCurrentUser.ts] (`['current-user']`, 24h, `rest/api/3/myself` → accountId)
- [Source: components/manager/ApproveButton.tsx] (lines 92-129 prop interface incl. `disabledReason?: string | undefined`; lines 246-275 disabled/title render — gates both modes)
- [Source: components/manager/ManagerMatrix.tsx] (lines 617-637 `approveCell` — existing `disabledReason` ternary to extend; `managerAccountId` from `useCurrentUser`)
- [Source: lib/jira-types.ts] (`JiraUserSchema` with optional `manager: { accountId, displayName }`)
- [Source: lib/jira-client.ts] (`jiraGet`); [Source: lib/result.ts] (`Result` kinds); [Source: lib/storage/direct-reports.ts] (`DIRECT_REPORTS_TTL_MS = 24h`)
- [Source: architecture.md] (line 656 `ApproveDisabledTooltip`, line 688 `useCanApprove` — "FR36 — canonical manager check")
- [Source: 5-6-approve-cycle-per-epic-fan-out-posting-of-versioned-comments.md / 5-7-re-approve-dirty-cycles.md] (the `disabledReason` seam contract — gates both approve and reapprove)

### Review Findings

Code review (2026-06-27, adversarial: Blind Hunter + Edge Case Hunter + Acceptance Auditor). Fail-closed safety property (AC5) confirmed correct and tested — Approve is never enabled while canonicality is unknown. ApproveButton.tsx and DrillDownPanel.tsx confirmed untouched; JiraUserSchema.manager present (1.4 guard holds); no scope creep (row source not broadened).

Patches applied:

- [x] [Review][Patch] useCanApprove query key now includes currentUserAccountId [hooks/useCanApprove.ts:37] — canonicality (`manager.accountId === currentUserAccountId`) is user-relative; the original key `['canonical-manager', reportAccountId]` could (in a multi-account/re-auth edge) serve a verdict computed for a different signed-in user under the 24h staleTime, an authorization-gate hazard. Key is now `['canonical-manager', reportAccountId, currentUserAccountId]`. Raised by Blind + Edge Case Hunter.

Deferred:

- [x] [Review][Defer] Canonical-manager fetch fires for empty (zero-hours) rows whose Approve is already disabled by `isEmpty` [components/manager/ManagerMatrix.tsx:478] — N extra directory GETs per popup open with no UI effect. Deferred: spec Task 3 prescribes calling `useCanApprove(report.accountId, managerAccountId)` unconditionally; emptiness is only known after the per-row epics query resolves; pure efficiency, no correctness impact, out of scope.
- [x] [Review][Defer] Transient canonicality lookup error shows the definitive non-canonical tooltip ("their manager") rather than a "couldn't verify" message — behavior (disabled) is safe and spec-mandated fail-closed (AC5); distinguishing the error case is a product/UX copy decision and a spec deviation. Low value.

Dismissed as noise: `currentUserAccountId!` assertion (safe — gated by `enabled`); no `gcTime` (errs toward freshness, matches sibling hooks); empty/whitespace `displayName` (universal, not introduced here); self-approval blocked (correct per FR44); redundant double `'Resolving…'` branch (intentional, no-flash); `useQuery<CanonicalManagerResult>` without `JiraError` param (queryFn never throws); File List omits sprint-status.yaml (doc nit).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `npm run test` → 74 suites / 944 passed, 1 skipped (baseline 72/929 + 2 new suites + 15 new tests).
- `npm run compile` (`tsc --noEmit`) → clean, no type errors.
- `./node_modules/.bin/eslint .` → exit 0; 0 errors, 58 warnings (all pre-existing `import/order`; new source files clean).

### Completion Notes List

- **AC4/AC5** — `lib/canonical-manager.ts`: framework-agnostic `resolveCanonicalManager(reportAccountId, currentUserAccountId)` reuses the exact `rest/api/3/user?accountId=…&expand=manager` path via `jiraGet` + `JiraUserSchema`. Fails closed to `{ isCanonical: false, canonicalManagerName: null }` on any non-`ok` Result (with `log.warn('canonical-manager.lookup-failed')`) or absent `manager`, mirroring the `hasDirectReports()` precedent.
- **AC6/AC7** — `hooks/useCanApprove.ts`: `useQuery` keyed `['canonical-manager', reportAccountId]`, `staleTime = CANONICAL_STALE_TIME (24h)`, `enabled: !!currentUserAccountId`. queryFn returns the fail-closed value directly (never throws). Popup `QueryClient` retry/retryDelay untouched. 24h staleTime gives the mid-session re-evaluation for free.
- **AC1/AC2/AC8** — `ManagerMatrix.tsx` `ManagerMatrixRow` calls `useCanApprove(report.accountId, managerAccountId)` and ORs the canonicality reason into the existing `disabledReason` ternary. Precedence: current-user unresolved → `'Resolving your account…'`; canonicality still loading → fail closed to `'Resolving your account…'` (no enabled flash); `!isCanonical` → exact non-canonical tooltip (with `'their manager'` fallback when name is null); else enabled. `ApproveButton.tsx` untouched — its seam gates both approve & reapprove modes.
- **AC3** — `DrillDownPanel.tsx` confirmed to have no Approve CTA and no `ApproveButton` import; no change required. The existing "does not leak a 5.6/5.7 Approve/Re-approve/Done action" test already asserts read-only drill-down.
- **AC9** — `lib/canonical-manager.test.ts` (6 tests) + `hooks/useCanApprove.test.tsx` (4 tests incl. disabled-until-resolved) + `ManagerMatrix.test.tsx` extended (5 new tests: non-canonical tooltip, null-name fallback, mixed matrix, loading fail-closed, resolving precedence). New `useCanApprove` hook mock added to `ManagerMatrix.test.tsx` (default canonical) so existing 5.6/5.7 Approve tests stay green.
- `manager` field verified still present in `JiraUserSchema` (`lib/jira-types.ts`) — the 1.4 regression guard holds; no schema change made.
- No new npm dependencies. Native `title` tooltip used (no Radix Tooltip), per the established codebase pattern.

### File List

- **NEW** `lib/canonical-manager.ts`
- **NEW** `lib/canonical-manager.test.ts`
- **NEW** `hooks/useCanApprove.ts`
- **NEW** `hooks/useCanApprove.test.tsx`
- **MODIFIED** `components/manager/ManagerMatrix.tsx`
- **MODIFIED** `components/manager/ManagerMatrix.test.tsx`

### Change Log

- 2026-06-27 — Story 5.8 implemented: non-canonical manager read-only mode. Added `lib/canonical-manager.ts` + `hooks/useCanApprove.ts` (24h TanStack staleTime, fail-closed), wired the canonicality reason into the existing `disabledReason` seam in `ManagerMatrix`. Tests added/extended; all gates green. Status → review.

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-06-27 — created (ready-for-dev)

Completes Epic 5
