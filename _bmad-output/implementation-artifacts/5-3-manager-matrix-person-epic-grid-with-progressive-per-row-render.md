---
baseline_commit: 5b01ebf6c09a3e1f29aabd12c519ee9ef630195a
---
# Story 5.3: Manager Matrix — Person × Epic Grid with Progressive Per-Row Render

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a manager on Day 1 of the month,
I want to see all my direct reports as rows and the Epics they touched as columns, rendering progressively so I can start reviewing immediately,
so that approval feels fast even when there's a lot of data.

## Acceptance Criteria

**Matrix shell — semantic table, header, sticky person column (`components/manager/ManagerMatrix.tsx` — NEW)**

1. When the Manager view mounts (`App.tsx` already renders `<ManagerView cycle={...} />` for view-state `manager-matrix`), `ManagerView` resolves its direct reports and renders a **semantic `<table>`** with a **sticky first column** (`position: sticky; left: 0`) of direct-report person `displayName`s, one `<th scope="row">` per report. The column header row uses `<th scope="col">` for the person column and each Epic key. (UX-DR14, UX-DR32, epics §5.3 AC 1)

2. A header line above the table shows the **cycle title** rendered from the `cycle: CycleId` prop via `date-fns` `format(parse(cycle, 'yyyy-MM', new Date()), 'MMMM yyyy')` (e.g. `"2026-05"` → `"May 2026"`). For a `weekly` cycle id (`yyyy-MM-dd`) fall back to a `MMM d` form. The header uses `text-lg font-semibold` (consistent with `WeekView`). The **"X of N done" approval-progress chip is OUT OF SCOPE** (it depends on approval state — Story 5.4/5.6); render only the cycle title here, with the report count as neutral context if helpful (e.g. `N reports`). (epics §5.3 AC 1, UX-DR14; progress chip deferred — see Scope guardrails)

**Progressive per-row data fetch — one TanStack query per report (`hooks/useManagerRow.ts` — NEW)**

3. Each report row gets its **own** TanStack Query via a `useManagerRow(reportAccountId, cycleId)` hook: `useQuery({ queryKey: ['manager-row', reportAccountId, cycleId], queryFn, staleTime })`. Rows resolve **independently** — one slow/failed report never blocks the others. The matrix maps over the resolved `DirectReport[]` and renders one `<ManagerMatrixRow>` per report, each owning its query. (FR29, AR23, NFR2, UX-DR14, epics §5.3 AC 2)

4. Each per-row query fetches **that report's** worklogs in the cycle and groups them by **Epic**. A new exported fetcher `fetchReportCycleWorklogsByEpic(reportAccountId, cycleRange): Promise<Result<ReportEpicWorklogs[], JiraError>>` in `lib/jira-client.ts` (UPDATE) clones the proven scan in `fetchCurrentUserWeekWorklogsByIssue` but: (a) scopes the JQL to the report via `worklogAuthor = "<accountId>"` (NOT `currentUser()`); (b) filters retained worklogs to `author.accountId === reportAccountId`; (c) preserves, **per worklog**, the parent **Epic key + summary** so the row can both total per-Epic AND expose the underlying records for Story 5.5's drill-down. All HTTP routes through `jiraGet` (scheduler + auth + 401-refresh + Zod + `Result`) — NEVER raw `fetch`. (FR28, FR29, AR12, epics §5.3 AC 2)

5. **Skeleton-first, staggered reveal:** the matrix renders one **skeleton row per known direct report immediately** (the report list resolves before any worklog data — reuse the `findDirectReports` cache from Story 5.2). As each per-row query resolves, that row replaces its skeleton and reveals **staggered ~100 ms apart** (the canonical Motion-table value; ignore the stray 150 ms in the UX spec). Use the existing 1500 ms shimmer skeleton that becomes a **static fill under `prefers-reduced-motion: reduce`** (Tailwind `motion-safe:` / `motion-reduce:`). **No spinners.** (NFR2, UX-DR7, UX-DR14, UX-DR26, UX-DR33, epics §5.3 AC 2)

6. Performance budget: the **first row is visible within ~2 s** and the **full matrix within ~15 s** for ≤ 12 reports × ≤ 50 Epics. This is achieved by per-row independent queries flowing through the **token-bucket scheduler** (singleton in the service worker) — do NOT fire all rows in one blocking `Promise.all` that throws on the first failure. (NFR2, epics §5.3 AC 2)

**Column derivation — union of touched Epics (`lib/manager-matrix.ts` — NEW, pure)**

7. The **columns** are the **union of all Epics that received hours from any report in this cycle**, computed as rows resolve (a newly-resolved row may introduce new Epic columns; existing rows render `──` for those). Column ordering is **alphabetical by Epic key**. A pure module `lib/manager-matrix.ts` exposes the builder(s): given a list of resolved per-row results, derive the ordered Epic-key column set and per-(report, Epic) total seconds. Co-located `lib/manager-matrix.test.ts` covers union derivation, alphabetical ordering, and per-cell totalling. (FR28, epics §5.3 AC 3)

8. If **more than 4 Epic columns** exist, **horizontal scroll** is enabled on the data region while the **sticky person-name column remains fixed** (CSS `position: sticky` on the first column; the scroll container wraps the table within the 360 px popup). (UX-DR14, epics §5.3 AC 3)

**Cell rendering — neutral hours only (NO coloring)**

9. Each data cell shows the **total hours** the report logged on that Epic this cycle, **monospace**, formatted as **a whole number with no decimal when whole** (e.g. `64`), else **one decimal** (e.g. `12.5`). Empty cells (report logged nothing on that Epic) show the **`──` em-dash**. Rows are **sorted by person `displayName`**. Hours conversion uses `secondsToHours` from `lib/hours.ts` — NEVER inline `* 3600` / `/ 3600`. (epics §5.3 AC 4)

10. **Cells are NEUTRAL.** Do **NOT** implement any status color (green/red/yellow-stripe/approved), status icons (`✓ ⚠ ↻ 🔒`), the dirty diagonal-stripe pattern, the visibility-restriction lock overlay, or approval parsing — **all of that is Story 5.4**. Cells are clickable-affordance-ready but the **drill-down panel is Story 5.5** (do not build it). The **row-end Approve/Re-approve action area is left empty** (Stories 5.6/5.7/5.8). (Scope guardrails — see Dev Notes)

**Each cell carries `aria-label="<Person>, <EpicKey>, <hours> hours"`** (no status suffix yet — that's 5.4's `below target`/etc.). (UX-DR32, epics §5.3 AC 4)

**Rate-limit resilience — never throw to the user (NFR2)**

11. Per-row queries flow through the scheduler, which honors `Retry-After` on **429** responses and queues. A rate-limited row **stays a skeleton longer** rather than failing; the existing popup `QueryClient` `retry`/`retryDelay` (Retry-After-aware, max 3, capped 30 s — `entrypoints/popup/main.tsx`) already handles this — do NOT override it. The degraded experience must recover within ~60 s. (NFR2, epics §5.3 AC 5)

12. If a row's data **fails after retries**, that row shows an **inline status chip "Couldn't load — retry"** with a **tertiary "Retry" action** that calls the query's `refetch()`. The chip is per-row and does NOT take down the rest of the matrix. (UX-DR24, epics §5.3 AC 5)

**Empty state — stale-navigation fallback**

13. If the user has **no direct reports** but somehow lands on the Manager view (e.g. stale persisted view-state — note Story 5.2's `App.tsx` guard already redirects this case to Today, so this is a defensive secondary fallback inside `ManagerMatrix`), the matrix shows the empty state: **"You're not configured as anyone's manager in Jira. Switch to Worker view."** with an inline link/button that flips to the Today view (reuse the `setPopupView({ kind: 'today' })` mechanism / a callback prop from `App.tsx`). (UX-DR27, epics §5.3 AC 6)

14. **Reports-exist-but-no-hours** secondary empty state: when reports resolve but a row has zero hours across all Epics this cycle, the row still renders with all-`──` cells; if the *whole matrix* has no Epic columns (nobody logged anything), render the report rows with a per-row "(no hours logged this cycle)" placeholder. (UX-DR27)

**Tests (`*.test.ts(x)` co-located)**

15. `lib/manager-matrix.test.ts` (NEW): Epic-column union derivation (rows touching disjoint Epics → union); alphabetical Epic-key ordering; per-(report, Epic) total seconds; a report with no worklogs → no columns contributed; whole-vs-decimal hours display formatting (`64` vs `12.5`, `──` for empty). Pure, no mocks.

16. `lib/jira-client.test.ts` (UPDATE): `fetchReportCycleWorklogsByEpic` issues the report-scoped JQL (`worklogAuthor = "<accountId>"`), retains only that report's worklogs, groups by parent Epic with key/summary preserved, propagates `JiraError` on search/worklog failure. Mock the `jiraGet` boundary (follow the existing `vi.mock` pattern in `jira-client.test.ts`). Do NOT change `fetchCurrentUserWeekWorklogs` / `fetchCurrentUserWeekWorklogsByIssue` signatures (badge 3.1, banner 3.3, week grid 4.1 depend on them).

17. `hooks/useManagerRow.test.tsx` (NEW): query keyed `['manager-row', accountId, cycleId]`; resolves to grouped per-Epic data on `ok`; surfaces the `JiraError` on failure (throw-from-queryFn pattern, mirror `useWeekWorklogs`).

18. `components/manager/ManagerMatrix.test.tsx` (NEW): renders a semantic `<table>` with sticky person column + Epic columns; one skeleton row per report initially; resolved rows show neutral monospace hours / `──`; rows sorted by display name; a failed row shows the "Couldn't load — retry" chip with a working Retry; no-reports → empty state with switch-to-Today link; **no status colors/icons/approve buttons present** (regression guard against scope leak into 5.4–5.8). Mock `useManagerRow` (or the fetcher) and `findDirectReports`.

19. `components/manager/ManagerView.test.tsx` (UPDATE): the placeholder body is replaced — `ManagerView` now renders `ManagerMatrix` and still accepts the `cycle: CycleId` prop without throwing.

**Gates**

20. `npm run lint` (0 errors), `npm run compile` (`tsc --noEmit`, 0 errors), `npm run test --run` (all green), `npm run build` (popup entrypoint builds). No `any`, named exports only, no barrel files, `@/` alias for cross-module imports, `lib/` modules React-free, no inline `*3600`/`/3600`, no `console.log` (use `lib/log.ts`). (AR4, AR29)

## Tasks / Subtasks

- [x] **Task 1 — `lib/jira-client.ts` (UPDATE): report-scoped, Epic-grouped worklog fetcher** (AC: 4, 16)
  - [x] Add `fetchReportCycleWorklogsByEpic(reportAccountId: string, range: CycleRange): Promise<Result<ReportEpicWorklogs[], JiraError>>`. Clone the proven scan in `fetchCurrentUserWeekWorklogsByIssue` (lines 509–561) but: JQL = `worklogAuthor = "<reportAccountId>" AND worklogDate >= "<start>" AND worklogDate <= "<end>"` (report-scoped, NOT `currentUser()`); retain worklogs where `author.accountId === reportAccountId`; keep the `startedAfter`/`startedBefore` epoch-ms window + in-range `started` guard.
  - [x] **Epic rollup:** the JQL `worklogDate`/`worklogAuthor` search returns the **subtasks** the report logged on, not their Epics. Map each subtask → its parent **Epic** (the column dimension). Request `fields=key,summary,parent` on the search (or use the hierarchy mechanism — see DECISION REQUIRED) and roll up subtask hours to the Epic key. Records with no resolvable Epic group under a synthetic/"no-Epic" bucket rather than being dropped (decide and document).
  - [x] Return shape `ReportEpicWorklogs = { epicKey: string; epicSummary: string; totalSeconds: number; worklogs: Array<{ ticketKey: string; ticketSummary: string; seconds: number; started?: string; updated?: string }> }[]` — **preserve the underlying per-ticket worklog records** (Story 5.5 filters them client-side; do NOT collapse to totals only). Include `updated` on each worklog (Story 5.4 dirty-detection reads it).
  - [x] Add the composed type(s) to `lib/jira-types.ts` only if a new wire shape is introduced; prefer composing existing `JiraWorklog`/`JiraSearchSchema`/`JiraWorklogListSchema`. If the search needs `parent`, extend the search schema tolerantly (extra fields allowed).
  - [x] Co-located test updates in `lib/jira-client.test.ts` (AC 16) — mock `jiraGet`. Leave `fetchCurrentUserWeekWorklogs` / `…ByIssue` untouched.

- [x] **Task 2 — `lib/manager-matrix.ts` (NEW, pure): column union + cell totals + display** (AC: 7, 9, 15)
  - [x] Pure module (no React, no chrome/network). `buildMatrixColumns(rows: Array<{ accountId: string; epics: ReportEpicWorklogs[] }>): string[]` → union of Epic keys, **alphabetical**. A cell-total accessor maps `(report, epicKey)` → seconds (0 → render `──`).
  - [x] `formatCellHours(seconds: number): string` → whole number with no decimal when whole (`64`), else one decimal (`12.5`), `──` for ≤ 0. Reuse `secondsToHours` from `lib/hours.ts`; do NOT inline `/3600`. (Note: `lib/hours.ts` already has `secondsToHoursDisplay`/`secondsToCellDisplay` — check whether one fits before adding a new formatter; the matrix wants bare `64`/`12.5`, not `64h`.)
  - [x] Co-located `lib/manager-matrix.test.ts` (AC 15).

- [x] **Task 3 — `hooks/useManagerRow.ts` (NEW): one query per report** (AC: 3, 6, 11, 17)
  - [x] `useManagerRow(reportAccountId: string, cycleId: CycleId, range: CycleRange)` → `useQuery({ queryKey: ['manager-row', reportAccountId, cycleId], queryFn })`. Mirror `useWeekWorklogs`: queryFn calls `fetchReportCycleWorklogsByEpic`, throws the non-`ok` `Result` so TanStack `error` carries the `JiraError`.
  - [x] `staleTime`: current cycle → 60 000 ms (matches the popup default); **closed/past cycles are immutable → `staleTime: Infinity`** (architecture caching rule). Derive open-vs-closed from whether `cycleId` is the current cycle (`getCurrentCycleId(approvalCycle)` equality).
  - [x] Do NOT override the popup `QueryClient` `retry`/`retryDelay` — the Retry-After-aware defaults in `main.tsx` already satisfy AC 11.
  - [x] Co-located `hooks/useManagerRow.test.tsx` (AC 17).

- [x] **Task 4 — `components/manager/ManagerMatrix.tsx` (NEW): the grid** (AC: 1, 2, 5, 8, 9, 10, 12, 13, 14, 18)
  - [x] Resolve reports: reuse `findDirectReports(currentUserAccountId)` (Story 5.2, `lib/manager-resolution.ts`) — the cached list is the row set. Resolve `currentUserAccountId` via the same `jiraGet('rest/api/3/myself', …)` pattern OR a small hook; reports come from the 24h cache when fresh. (Done via new `hooks/useManagerReports.ts` which dedupes by accountId + drops malformed cached entries — the Story 5.2 deferrals.)
  - [x] Header: cycle title from `cycle` prop via `date-fns` (AC 2). Semantic `<table>`; sticky first `<th>` column; `<th scope="col">` Epic-key headers; `<th scope="row">` person names sorted by `displayName`.
  - [x] Render one `<ManagerMatrixRow report={...} cycleId={...} range={...} />` per report; each row owns a `useManagerRow` query. Initial = skeleton row (reuse the existing skeleton/shimmer block from `WeekView`); resolved = neutral monospace hours / `──` cells with the AC-10 `aria-label`; failed = "Couldn't load — retry" chip + tertiary Retry → `refetch()`.
  - [x] Stagger reveal ~100 ms/row (`motion-safe:` only; static under `motion-reduce`). Compute the union Epic columns from resolved rows (lift resolved per-row data into the parent via a callback or a shared store-less reducer; the parent owns the column set because columns are cross-row).
  - [x] Horizontal scroll wrapper when > 4 Epic columns; sticky person column fixed (AC 8).
  - [x] Empty states: no reports → switch-to-Today empty state (AC 13, callback prop from `App.tsx` to flip view); reports-but-no-hours → per-row "(no hours logged this cycle)" (AC 14).
  - [x] `const STRINGS` for all copy (UX-DR31); honest copy, no exclamation marks (UX-DR30). `React.ReactElement` return type.
  - [x] **Do NOT build:** cell coloring/status icons/stripe/lock (5.4), drill-down panel (5.5), Approve/Re-approve/✓ Done buttons (5.6/5.7/5.8), the "X of N done" progress chip (depends on approval state). Leave the row-end action cell empty.
  - [x] Co-located `components/manager/ManagerMatrix.test.tsx` (AC 18).

- [x] **Task 5 — `components/manager/ManagerView.tsx` (UPDATE): drop in the matrix** (AC: 19)
  - [x] Replace the placeholder body with `<ManagerMatrix cycle={cycle} … />`, keeping the `{ cycle: CycleId }` prop and `App.tsx` wiring unchanged. Pass through any switch-to-Today callback `App.tsx` needs to provide (add the minimal prop + wire it in `App.tsx`'s `TabsContent` for the Manager tab — mirror its existing `setPopupView` usage; do NOT rewrite routing).
  - [x] Update `components/manager/ManagerView.test.tsx` (AC 19).

- [x] **Task 6 — Verify all gates** (AC: 20)
  - [x] `./node_modules/.bin/eslint .` (0 errors), `tsc --noEmit` (0 errors), `npm run test` (all green; record before/after counts), `npm run build` (popup builds). (`npx` is intercepted by the `rtk` proxy in this env — run binaries via `./node_modules/.bin/*`; project uses **npm** scripts, not pnpm.)

### Review Findings (code-review 2026-06-27)

Parallel adversarial review (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Critical data-contract and scope guardrails all CONFIRMED clean: per-ticket records preserved with `updated`; report-scoped `worklogAuthor` JQL (not `currentUser()`); bucket-don't-drop on unresolvable Epics; per-row independent queries (no `Promise.all`); cells strictly neutral (no 5.4–5.8 leak); semantic `<table>` + sticky person column + `<th scope>`; retry config untouched. The `onResolved`/useEffect lift + equality guard is correct and necessary (relies on TanStack referential stability; guard prevents the documented re-render storm).

**Patches applied (working tree):**
- [x] [Review][Patch] `parent.fields.summary` required-when-present → optional (a redacted/restricted parent no longer fails the whole row) [lib/jira-types.ts:215-224]
- [x] [Review][Patch] `formatCellHours` sub-rounding non-zero total displayed bare "0" (misleading "nothing logged") → now renders em-dash; precise seconds still preserved in records [lib/manager-matrix.ts:53-61]
- [x] [Review][Patch] No-hours row had dead/confusing control flow (`|| !hasHours` outer guard with no matching body) → simplified to `columns.length === 0` placeholder; columns-exist falls through to all-`──` (behaviorally unchanged, AC 14) [components/manager/ManagerMatrix.tsx:318-338]
- [x] [Review][Patch] Empty-cell `aria-label` announced "0 hours" (indistinguishable from a real zero for AT) → empty cells now announce "no hours logged"; cells with hours keep AC 4's format [components/manager/ManagerMatrix.tsx:346-365]
- [x] [Review][Patch] Documented the queryKey-omits-`range` invariant (range is a pure function of cycleId) [hooks/useManagerRow.ts:42-46]

**Deferred (pre-existing / out-of-scope / documented tradeoff):**
- [x] [Review][Defer] Pagination cap: report-scoped search uses `maxResults=100` with no `startAt` loop; a report logging on >100 distinct subtasks is silently truncated [lib/jira-client.ts:633] — deferred: identical to the sibling `fetchCurrentUserWeekWorklogsByIssue` the spec mandated cloning; project-wide pre-existing pattern. Should be addressed cross-cutting (both fetchers + per-issue worklog pages), not in this story.
- [x] [Review][Defer] Worklog with missing `started` retained unconditionally (could leak an out-of-cycle record into a total) [lib/jira-client.ts:681-686] — deferred: cloned faithfully from the sibling fetcher; same JQL `worklogDate` + endpoint `startedAfter/Before` backstop. Pre-existing pattern.
- [x] [Review][Defer] Subtask→Epic rollup walks exactly ONE level up; a deeper hierarchy (Epic→Initiative→Story→Subtask, or worklogs on a Story directly) buckets under the wrong key and can fragment one Epic's hours across columns [lib/jira-client.ts:599] — deferred: this is the documented "bucket don't drop" tradeoff (DECISION REQUIRED). Hours are never lost; audit integrity holds. See Design question below.

**Dismissed as noise:** `aria-live="polite"` over-announce during stagger (optional per spec); sequential awaits perf (correct, latency-only); `toFixed` float reconciliation (display-only, totals summed in integer seconds); `isCurrentCycle` double-call (no memo, trivial); transient column-lag during reveal (eventually consistent).

**Design/direction question (surfaced, not blocking):** the rollup assumes a fixed Epic→Story→Subtask depth (one grandparent hop = Epic) and does not consult the fetched `issuetype` to decide where to stop walking. For orgs with a deeper or mixed-depth hierarchy, a "column" may be an Initiative or a parentless Story rather than a true Epic, and one Epic's hours can split across columns. This is consistent with the spec's bucket-don't-drop priority but may surprise managers in deep hierarchies — confirm the intended hierarchy depth before Story 5.4 consumes these columns.

## Dev Notes

### What this story IS (scope guardrails — read first)

This is the **grid structure + progressive per-row data load**. Deliver: the semantic person × Epic `<table>` (sticky person column, Epic-key columns, horizontal scroll past 4), the column-union derivation, per-row TanStack queries (one per report) that stream in as skeletons → neutral hours, ~100 ms staggered reveal, the rate-limit-resilient "stays skeleton / per-row retry chip" behavior, and the no-reports + no-hours empty states. **Cells are NEUTRAL** — raw hours or `──`, nothing else.

**Explicitly DEFER (leave clean seams, do NOT build):**
- **Story 5.4** — cell status coloring (green/red/yellow-stripe/approved), status icons (`✓ ⚠ ↻ 🔒`), dirty diagonal-stripe, visibility-restriction `🔒` lock overlay + "⚠ N restricted" row chip, approval-comment parsing via `lib/parser.ts` (Story 5.1), `lib/dirty-detect.ts`. The "X of N done" progress chip also depends on approval state → defer.
- **Story 5.5** — the slide-in drill-down panel on cell click (it reuses THIS story's per-row worklog records, filtered client-side — that is why Task 1 must preserve the per-ticket records, not just totals).
- **Stories 5.6 / 5.7 / 5.8** — the row-end Approve / Re-approve / ✓ Done / disabled-for-non-canonical-manager actions and the per-Epic fan-out posting. Leave the row-end action area empty.

The matrix's per-row query result is the **data contract** that 5.4 (reads `restrictedCount` + `updated` for dirty/lock), 5.5 (reads per-ticket records), and 5.6 (reads the touched-Epic set) all consume. Shape it deliberately: per-Epic total **plus** the underlying per-ticket worklog records (with `ticketKey`, `ticketSummary`, `seconds`, `started`, `updated`). A future `restrictedCount` field is 5.4's to populate from restricted-visibility worklogs — leave a forward-compat comment; do not compute it here unless the fetcher trivially surfaces excluded counts.

### DECISION REQUIRED — subtask → Epic rollup mechanism

The matrix **columns are Epics**, but worklogs live on **subtasks** (architecture: "Worklog logging level — Subtask only"). The `worklogAuthor` JQL search returns the subtasks a report logged on; you must roll those up to their parent **Epic**. Jira's issue hierarchy is typically **Epic → Story/Task → Subtask** (two levels up), so a subtask's *direct* `parent` is usually the Story/Task, not the Epic. Options:

1. **Request `fields=key,summary,parent` and walk `parent` until the issue type is Epic** — but `parent` on the JQL search may only give one level; resolving to the Epic can need a second `jiraGet` per distinct parent. The project already has a **hierarchy-walk engine** (`lib/hierarchy.ts`, Story 1.4 / 2.2 — "Manager + skip-level task discovery") and the prefill source builds subtask→Task→Epic chains — **reuse it** rather than re-deriving the walk.
2. **Use the `parentEpic`/`epic link` field** if the deployment exposes it on the search response.

**Recommended default:** reuse the existing hierarchy mechanism (`lib/hierarchy.ts` / the Story 2.2 prefill source) to map each logged subtask to its owning Epic; keep the rollup isolated in `fetchReportCycleWorklogsByEpic` (or a small helper) behind the `ReportEpicWorklogs` contract so swapping the exact field/endpoint later is a one-function change. Group any subtask whose Epic can't be resolved under a clearly-labeled bucket (e.g. its top-most resolvable parent key) rather than silently dropping hours. **Read `lib/hierarchy.ts` before coding Task 1** to avoid reinventing the walk. This is the one genuine open question — surface the chosen approach in the Final Report.

### Files to read before coding

- **`components/manager/ManagerView.tsx`** — the placeholder you replace (Story 5.2 seam). Keeps `{ cycle: CycleId }`; `App.tsx` wiring stays.
- **`lib/manager-resolution.ts`** — `findDirectReports(currentUserAccountId)` returns `Result<DirectReport[], JiraError>` (`DirectReport = { accountId; displayName }`); `hasDirectReports()`; cached 24h per-account via `lib/storage/direct-reports.ts`. This is the row set. **Note the Story 5.2 review deferrals consumed here:** `findDirectReports` does **not dedupe by accountId** and the cache shape validates only `Array.isArray(reports)` — the matrix is the consumer that should **dedupe rows by accountId** and tolerate a malformed cached element. Handle both.
- **`lib/jira-client.ts`** — `fetchCurrentUserWeekWorklogsByIssue` (lines 509–561) is the scan to clone; `jiraGet(path, schema)` (scheduler + auth + 401-refresh + Zod + Result); `toJqlDate`; the `rest/api/3/search/jql?jql=…&fields=…` and `rest/api/3/issue/<key>/worklog?startedAfter=…&startedBefore=…` path styles. Worklogs return **oldest-first** — the `startedAfter`/`startedBefore` window matters on long-lived subtasks.
- **`lib/hierarchy.ts`** + the Story 2.2 prefill/hierarchy source — for the subtask → Epic rollup (DECISION REQUIRED). Do not reinvent the walk.
- **`lib/cycle-range.ts`** — `currentCycleRange(cycle, ref)` (`calendar-month` | `weekly` → `{start, end}`); `getCurrentCycleId(approvalCycle, ref)` (Story 5.2; `yyyy-MM` for month, ISO Monday for weekly) — the cycle id MUST match what 5.4/5.6 checksum. Derive the matrix's `range` from `cycle` consistently with this.
- **`hooks/useWeekWorklogs.ts`** — the throw-non-ok-Result queryFn pattern to mirror in `useManagerRow`.
- **`components/week/WeeklyGrid.tsx` + `components/week/WeekView.tsx`** — the established semantic-`<table>` + skeleton + `<th scope>` + `aria-label` + `font-mono` cell + `STRINGS` + error-state patterns. The matrix is a close analogue (people × Epics instead of subtasks × days). Note 4.1 found **no shadcn `table` primitive nor shared `ErrorState` exists** in the repo — use a plain semantic `<table>` with Tailwind classes and inline skeleton/error blocks (as `WeeklyGrid`/`WeekView` do).
- **`entrypoints/popup/main.tsx`** — the `QueryClient` defaults: `staleTime 60_000`, Retry-After-aware `retry` (max 3) + `retryDelay` (cap 30 s), `refetchOnWindowFocus:false`. **Do not change** — they satisfy AC 11.
- **`entrypoints/popup/App.tsx`** — renders `<ManagerView cycle={...} />` in the Manager `TabsContent`; owns `setPopupView`. Wire the switch-to-Today callback here; do NOT rewrite routing or the tab logic.
- **`lib/hours.ts`** — `secondsToHours`, `secondsToHoursDisplay` (`──` for ≤0, else `<n>h`), `secondsToCellDisplay` (bare decimal `4.0`/`──`). Pick/extend for the matrix's bare `64`/`12.5` cells; NEVER inline `/3600`.

### Architecture & convention guardrails (binding — AR/UX-DR)

- **All Jira HTTP through `lib/jira-client.ts`** (scheduler-gated, Zod-validated, `Result<T>`); never raw `fetch` (AR12). Per-row fan-out fetches each flow through the **token-bucket scheduler singleton in the service worker** — this is what makes the progressive render rate-safe (NFR2). Do NOT bypass it or batch into one all-or-nothing call.
- **`Result<T,E>` at I/O boundaries** — branch on `result.kind`; the queryFn throws the non-ok `Result` so TanStack `error` carries it (mirror `useWeekWorklogs`). Per-row failures are isolated to that row (AC 12).
- **Server state goes through TanStack Query — never copy server data into local React state** (architecture). The column union is derived state computed from resolved query data, lifted to the parent.
- **Every new `lib/` module ships a co-located `*.test.ts`** (AR29). `lib/manager-matrix.ts` → `lib/manager-matrix.test.ts`.
- **`lib/` modules are framework-agnostic — NO React imports** (`lib/manager-matrix.ts`, `lib/jira-client.ts`). React lives in `hooks/` and `components/`.
- **ESLint (AR4):** kebab-case file names for non-components, `PascalCase.tsx` for components; named exports only (no default exports); no `any`; no `console.log` outside tests (use `lib/log.ts`); no inline `*3600`/`/3600`; enforced import order; no barrel `index.ts`; `@/` path alias.
- **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`): indexing arrays yields `T | undefined` — guard. With `exactOptionalPropertyTypes`, spread optional props conditionally (`{...(x ? { prop: x } : {})}`) as `WeeklyGrid`/`App.tsx` do.
- **Semantic HTML + a11y (UX-DR32, NFR12/13):** a real `<table>` with `<th scope="row">` (person) / `<th scope="col">` (Epic key) — the spec prescribes **native table semantics, NOT `role=grid`** ("Don't add ARIA where semantic HTML already does the job"). Per-cell `aria-label="<Person>, <EpicKey>, <hours> hours"` carries row/column context. Progressive-row reveal is a dynamic update → keyboard-reachable, visible focus, `aria-live="polite"` for the reveal if announced. Sticky column via CSS `position: sticky`.
- **Quiet Density / motion (UX-DR5, UX-DR7, UX-DR33):** flat (no card shadows); stagger reveal **100 ms/row ease-out** (`motion-safe:` only); skeleton shimmer 1500 ms linear → static fill under `prefers-reduced-motion: reduce`. **No spinners.**
- **STRINGS co-located (UX-DR31):** all UI copy in named constants; honest copy, no exclamation marks (UX-DR30).
- **Popup width 360 px** (`min-w-[360px]` from `App.tsx`); the matrix must fit / horizontally scroll past 4 Epic columns, not overflow the popup body.

### Previous-story intelligence

- **Story 5.2 (done — the seam you build on):** `ManagerView` is a placeholder accepting `{ cycle: CycleId }`; `App.tsx` already renders it for `manager-matrix` view-state, hides the Manager tab when no reports, and has a stale-state guard redirecting a persisted `manager-matrix` to Today when reports resolve false (so AC 13's empty state is a **defensive secondary** path). `findDirectReports`/`hasDirectReports` + the 24h per-account cache are ready. `getCurrentCycleId('calendar-month')` → `yyyy-MM`, `weekly` → ISO Monday — the matrix must derive its `range` and title from the same `cycle` so 5.4/5.6 checksum the identical id. **5.2 review deferred to 5.3:** dedupe reports by accountId; tolerate a malformed cached report element.
- **Story 5.1 (done):** the approval contract (`lib/comment-schema.ts`, `lib/checksum.ts`, `lib/parser.ts`, `PROTOCOL.md`) — **not consumed by 5.3** (5.3 only fetches worklogs). 5.4 reads it. Don't pull it in.
- **Story 4.1 (done — closest analogue):** the week grid is people-less but otherwise the same shape — semantic `<table>`, skeleton-first, `<th scope>`, `font-mono` cells with `──` for empty, `aria-label` per cell, pure builder (`lib/week-grid.ts`) + thin hook (`useWeekWorklogs`) + component (`WeeklyGrid`). **Apply the same split:** pure `lib/manager-matrix.ts` (testable, no mocks) + `hooks/useManagerRow.ts` + `components/manager/ManagerMatrix.tsx`. 4.1 also confirmed: clone the worklog fetcher, don't change the flat one; no shadcn table/ErrorState primitive exists; watch local-day timezone bucketing.
- **Gate baseline:** Story 5.2 ended at ~758 tests passing / 1 skipped, tsc 0, eslint 0 errors (58 pre-existing import/order warnings tolerated). Keep new files warning-clean; record before/after test counts.

### What NOT to do (disaster prevention)

1. Do **NOT** build cell coloring, status icons, dirty-stripe, lock overlay, approval parsing, or the "X of N done" progress chip — **all Story 5.4**. Keep cells neutral.
2. Do **NOT** build the drill-down panel (5.5) or Approve/Re-approve buttons (5.6–5.8). Leave the row-end action cell empty.
3. Do **NOT** collapse the per-row result to per-Epic totals only — **preserve the per-ticket worklog records** (with `updated`) so 5.5 can filter client-side and 5.4 can dirty-detect. This is the single most important data-contract decision.
4. Do **NOT** fetch all rows in one blocking `Promise.all` that aborts on the first failure — each report is an **independent** query so one slow/failed report never blocks the matrix (NFR2). Per-row failures show a retry chip, not a dead matrix.
5. Do **NOT** bypass the scheduler or fire raw `fetch` — the per-person fan-out MUST flow through `jiraGet` → the SW token-bucket scheduler, or it will trip Jira rate limits (NFR2 risk: ~600 records/cycle, no bulk worklog endpoint).
6. Do **NOT** override the popup `QueryClient` retry/Retry-After config — it already handles 429 (AC 11).
7. Do **NOT** scope the JQL to `currentUser()` — that fetches the *manager's own* worklogs. Scope to each **report's** accountId (`worklogAuthor = "<accountId>"`).
8. Do **NOT** drop subtask hours when the Epic can't be resolved — bucket them, don't lose them (audit integrity).
9. Do **NOT** change `fetchCurrentUserWeekWorklogs` / `…ByIssue` signatures (badge 3.1, banner 3.3, week grid 4.1 depend on them) — add a new sibling fetcher.
10. Do **NOT** introduce a global store (Redux/Zustand) — `useState`/Context only (NFR1 TTI). The column union is lifted to the `ManagerMatrix` parent via callbacks/local state.
11. Do **NOT** fork the cycle id / range derivation — reuse `getCurrentCycleId` + `currentCycleRange` so the matrix agrees with the approval comments (5.4/5.6).

### Project Structure Notes

All locations match `architecture.md`'s project tree: `components/manager/ManagerMatrix.tsx` (line 651), `components/manager/ManagerView.tsx` (line 649, exists), `hooks/useManagerRow.ts` (architecture names `useManagerMatrix.ts` — "TanStack Query for matrix data, per-row queries"; this story uses the per-row granularity `useManagerRow` to match the `['manager-row', …]` query key the epic prescribes; a `useManagerMatrix` aggregator can wrap it later if needed), `lib/manager-matrix.ts` (new pure builder, alongside `lib/week-grid.ts`), `lib/jira-client.ts` (UPDATE). The architecture's `manager-matrix-row` Popup→SW message (`{ userAccountId, cycle }`) describes the eventual SW-routed fetch; the popup currently runs `jiraGet` directly through the scheduler (the scheduler singleton is shared), consistent with how Stories 2.x–4.x fetch — keep that pattern unless the SW-message indirection already exists. No new dependencies (React 18, TanStack Query v5, date-fns v4, Zod v3, Tailwind v4 all present). No manifest/permission changes.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3 (lines 1284-1322)] — full ACs: semantic table + sticky person column, cycle title, per-row `['manager-row', reportAccountId, cycleId]` queries, JQL-by-Epic grouping, skeleton-first ~100 ms stagger, first row ≤2 s / full ≤15 s, Epic-column union alphabetical, >4 cols horizontal scroll, whole/one-decimal hours + `──`, 429 stays-skeleton + per-row retry chip, no-reports empty state.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4 (lines 1324-1356)] — DEFERRED cell coloring/dirty/lock + `restrictedCount`/`updated` consumers.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5 (lines 1358-1392)] — DEFERRED drill-down reusing THIS story's per-row worklog records client-side (data-contract driver).
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.6 (lines 1393-1438)] — DEFERRED approve fan-out (touched-Epic-set consumer).
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 (lines 1199-1201)] — epic objective; FR28/FR29 (matrix + progressive render), NFR2.
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend / Components (lines 648-688)] — `ManagerMatrix.tsx`, `useManagerMatrix.ts`, `useManagerReports.ts` locations.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture / TanStack Query (lines 241-249)] — per-row progressive queries, `staleTime` infinite for closed cycles, `select` projection, Retry-After retry.
- [Source: _bmad-output/planning-artifacts/architecture.md#Rate-limit governance (lines 95, 697-698, 847)] — token-bucket scheduler singleton in the SW; Retry-After honored.
- [Source: _bmad-output/planning-artifacts/architecture.md#Messaging (lines 281-291)] — `manager-matrix-row` Popup→SW message `{ userAccountId, cycle }`.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Manager view wireframe (lines 988-1020)] — matrix layout: tabs, `Manager · May 2026` header, Person sticky column, Epic columns + horizontal scroll if >4, cell = hours / `──`, progressive rows. (Status icons/colors/approve buttons in the wireframe are the DEFERRED layer.)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Progressive render (lines 51, 199, 826, 1380, 1454, 1709)] — skeleton rows immediately, 100 ms/row stagger (canonical), first row 2 s / full 15 s, 1500 ms shimmer.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Empty/loading states (lines 1689-1718)] — no-reports + reports-but-no-hours empty states; per-row skeleton.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility (lines 1456, 1886-1925)] — semantic `<table>` + `<th scope>`, per-cell `aria-label`, sticky CSS, `aria-live` reveal, reduced-motion.
- [Source: _bmad-output/implementation-artifacts/5-2-modetoggle-worker-manager-tab-in-popup.md] — `ManagerView` seam, `findDirectReports`/`hasDirectReports`, `getCurrentCycleId`, `manager-matrix` view-state, dedupe/cache-shape deferrals consumed here.
- [Source: _bmad-output/implementation-artifacts/4-1-week-view-shell-7-day-grid-with-subtask-rows.md] — closest analogue: pure builder + hook + semantic-table component split; no shadcn table/ErrorState primitive; clone-don't-mutate the fetcher; TZ day-bucketing.
- [Source: lib/jira-client.ts:442-561] — `fetchCurrentUserWeekWorklogs` / `…ByIssue` scan to clone; `jiraGet`, `toJqlDate`, worklog window.
- [Source: lib/manager-resolution.ts:1-60] — `findDirectReports`, myself-resolution, candidate cap.
- [Source: hooks/useWeekWorklogs.ts] — throw-non-ok-Result queryFn pattern for `useManagerRow`.
- [Source: components/week/WeeklyGrid.tsx] — semantic table + `<th scope>` + `font-mono` cell + `aria-label` + STRINGS reference.
- [Source: entrypoints/popup/main.tsx] — `QueryClient` Retry-After-aware retry config (do not change).
- [Source: components/manager/ManagerView.tsx] — placeholder to replace.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8)

### Debug Log References

- Initial `ManagerMatrix.test.tsx` run OOM'd: the lift-up `useEffect` fired
  `onResolved` every render because the test mock returned a fresh `data` array
  reference each call, causing a parent setState → re-render → effect loop.
  Fixed two ways: (1) the parent's `setResolved` now bails when the reported
  data reference is unchanged (`prev.get(accountId) === epics`), guarding any
  re-render storm in production too; (2) the affected test cases now return
  stable per-account row objects. In real usage `query.data` is referentially
  stable across renders, so the loop never occurs.

### Completion Notes List

- **Subtask → Epic rollup mechanism (DECISION REQUIRED):** Implemented inside
  `fetchReportCycleWorklogsByEpic`, isolated behind the `ReportEpicWorklogs`
  contract so the exact endpoint can change in one place later. The
  report-scoped `worklogAuthor` search requests `fields=key,summary,parent,issuetype`;
  the search only returns the subtask's *direct* `parent` (the Story/Task), so
  each distinct parent is resolved one level up via a single
  `GET /rest/api/3/issue/<parentKey>?fields=key,summary,parent,issuetype` lookup
  (memoized per parent key, so a shared column costs one request). The
  grandparent (the Epic) becomes the column key. If a parent has no further
  parent, hours bucket under that top-most resolvable key; a subtask with no
  parent at all buckets under its own key — hours are NEVER dropped (audit
  integrity). I did NOT reuse `lib/hierarchy.ts` directly: that engine walks the
  self/manager/skip-level *assignee* chains and is not parameterizable by an
  arbitrary report account, so it does not fit the per-report worklog rollup.
- **Data contract preserved:** each `ReportEpicWorklogs` keeps `totalSeconds`
  PLUS the per-ticket `worklogs` records (`ticketKey`, `ticketSummary`,
  `seconds`, optional `started`, optional `updated`) so Story 5.4 (dirty-detect
  reads `updated`), 5.5 (drill-down filters records client-side), and 5.6
  (touched-Epic set) can consume them. Not collapsed to totals.
- **Cells are neutral:** raw hours / `──` only. No status colors, icons, stripe,
  lock, approval parsing, drill-down, approve buttons, or "X of N done" chip — a
  regression test asserts none of those leak in (scope guard for 5.4–5.8).
- **Per-row independence (NFR2):** one `useManagerRow` query per report; rows
  resolve independently through `jiraGet` → the SW token-bucket scheduler. No
  `Promise.all`. A failed row shows an inline "Couldn't load — Retry" chip
  wired to `query.refetch()` without taking down the matrix. The popup
  `QueryClient` retry/Retry-After config is untouched (AC 11).
- **Column union lifted to the parent:** each row reports its resolved epics up
  via an `onResolved` callback; `ManagerMatrix` derives the alphabetical Epic
  union (`buildMatrixColumns`) and toggles the `overflow-x-auto` scroll wrapper
  past 4 columns while the person column stays `position: sticky`.
- **Story 5.2 deferrals consumed:** `useManagerReports` dedupes reports by
  accountId and drops malformed cached entries.
- **No new dependencies** (React 18, TanStack Query v5, date-fns v4, Zod v3,
  Tailwind v4 already present). No manifest/permission changes.
- **Gates:** `tsc --noEmit` 0 errors; `eslint .` exits 0 (0 errors, 57
  pre-existing import/order warnings, down from 58 baseline — new files are
  warning-clean); `npm run test` 64 suites / 795 passed / 1 skipped (baseline
  60 / 758 / 1); `npm run build` popup builds.

### File List

- `lib/jira-client.ts` (UPDATE) — `fetchReportCycleWorklogsByEpic` + Epic-rollup helper; new imports.
- `lib/jira-client.test.ts` (UPDATE) — `fetchReportCycleWorklogsByEpic` test block (7 cases).
- `lib/jira-types.ts` (UPDATE) — `JiraMatrixIssueSchema`, `JiraMatrixSearchSchema`, `JiraIssueLookupSchema`, `ReportEpicWorklogs` type.
- `lib/manager-matrix.ts` (NEW) — pure builder: `buildMatrixColumns`, `cellSeconds`, `formatCellHours`, `EMPTY_CELL`, `MatrixRowInput`.
- `lib/manager-matrix.test.ts` (NEW) — 11 cases.
- `hooks/useManagerRow.ts` (NEW) — one TanStack query per report, open/closed-cycle staleTime.
- `hooks/useManagerRow.test.tsx` (NEW) — 3 cases.
- `hooks/useManagerReports.ts` (NEW) — resolve + dedupe + sanitize the row set.
- `hooks/useManagerReports.test.tsx` (NEW) — 5 cases.
- `components/manager/ManagerMatrix.tsx` (NEW) — the grid + per-row component, empty/error states, stagger, scroll.
- `components/manager/ManagerMatrix.test.tsx` (NEW) — 11 cases (incl. scope-leak regression guard).
- `components/manager/ManagerView.tsx` (UPDATE) — renders `ManagerMatrix`, passes `onSwitchToToday`.
- `components/manager/ManagerView.test.tsx` (UPDATE) — matrix-render assertions.
- `entrypoints/popup/App.tsx` (UPDATE) — wire `onSwitchToToday` for the Manager tab.

## Change Log

- 2026-06-27: Story 5.3 implemented — Manager matrix (person × Epic grid) with progressive per-row TanStack queries, alphabetical Epic-column union, neutral monospace hours / `──` cells, ~100 ms staggered reveal, per-row retry chip, no-reports + no-hours empty states. Replaces the 5.2 `ManagerView` placeholder. Subtask→Epic rollup via report-scoped `worklogAuthor` search + one-level grandparent lookup, unresolvable hours bucketed. Per-ticket worklog records (with `updated`) preserved for 5.4/5.5/5.6. Status → review.
