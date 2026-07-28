---
baseline_commit: 88b728e7b8fc06768731d30f408f23a13e6550b4
---

# Story 4.1: Week View Shell — 7-Day Grid with Subtask Rows

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a worker on Friday afternoon,
I want to switch to the Week tab and see my entire week as a grid,
so that I can review what I've logged and spot gaps in seconds.

## Acceptance Criteria

1. **Week header.** Given the popup is open and the user clicks the Week tab, when the view-state changes to `{ kind: 'week', weekOf: <current Monday ISO date> }`, then the Week view renders a header showing `Week of <EEE, MMM d>` (e.g. "Week of Mon, May 12") and the week total formatted `<logged> / <target>h` (e.g. `28 / 40h`, where target = `targetHours × 5` workdays). The view title uses `text-lg font-semibold`. (UX-DR11, UX-DR2)

2. **Skeleton on first load.** Given the Week view is rendering before week data resolves, when the TanStack Query is `pending`, then a skeleton grid appears immediately: a 7-day column-header row plus 4–6 skeleton rows, using the existing `LoadingSkeleton`/skeleton primitive with the 1500 ms shimmer that becomes a static fill under `prefers-reduced-motion: reduce`. No spinner. (UX-DR26, UX-DR23, UX-DR7, UX-DR33)

3. **Semantic 7-day grid.** Given week worklog data resolves, when the grid renders, then it is a semantic `<table>` with a `<th scope="col">` for each day Mon–Sun (3-letter abbreviations `Mon Tue Wed Thu Fri Sat Sun`) and a `<th scope="row">` per subtask the worker logged against this week. Each data cell `<td>` contains either a monospace decimal hours value (`4.0`, `0.5`) or the `──` em-dash for empty cells, and carries `aria-label="Hours for <day name>, <ticketKey> <summary>"`. (UX-DR11, UX-DR32, UX-DR2)

4. **Per-day totals row.** Given the grid is rendered, when totals are computed, then a totals row shows each day's summed hours (monospace) under the day header, with `──` for days with zero hours. (Color coding and status icons are explicitly OUT OF SCOPE — Story 4.2. Render totals as neutral text only.)

5. **Row content + ordering.** Given worklogs are loaded, when rows are built, then each row's row-header shows `<ticketKey> <summary>` truncated to fit the 360 px popup width (monospace key, sans summary), and subtasks are ordered: hierarchy/other Tasks first (sorted by row total hours descending), catch-all-project subtasks next, PTO subtask last. The catch-all project key comes from `catchAllProjectKeyItem`; the PTO subtask key from `ptoSubtaskKeyItem`. (UX-DR11)

6. **Add-subtask affordance (placeholder).** Given the grid is rendered, when the user reaches the bottom, then a `+ Add a subtask to this week` tertiary affordance is present below the rows. Clicking it opens the existing `TicketPicker` (Story 2.3) inline; selecting a ticket adds it as a new all-`──` row in the grid for the rest of this popup session (local-only — no worklog is posted here). Cell editing to fill those `──` cells is OUT OF SCOPE (Story 4.3). If the chosen ticket already exists as a row, no duplicate is added. (UX-DR11)

7. **Empty week.** Given the worker has logged nothing this week, when the grid renders, then it shows the day headers and the totals row with all `──` cells and zero data rows; no "no entries" message — the empty grid IS the empty state. The `+ Add a subtask` affordance still renders. (UX-DR27)

8. **Mark-as-done placeholder.** Given the Week view is rendered, when the bottom CTA region renders, then a disabled (or no-op) primary-tier `Mark week as done` button placeholder appears centered at the bottom in brand-purple. Its gap-check / dialog / local flag behavior is OUT OF SCOPE (Story 4.5) — render the button shell only. (UX-DR13, UX-DR25)

9. **View persistence + no-refetch tab switch.** Given the user navigates Today→Week→Today, when tabs change, then the active view persists to `chrome.storage.local` via `lib/storage/view-state.ts` (already wired in `App.tsx`), the week query data persists across the switch (TanStack Query cache, `staleTime` 60 000 ms per AR23 — Today and Week both forceMount so neither unmounts), and switching back to Today within `staleTime` does not re-fetch. (UX-DR28, AR23)

10. **Error + auth-expired states.** Given the week query returns a non-`ok` `Result`, when the view renders, then `auth-expired` shows the honest "Connect to Jira" fallback (consistent with `App.tsx` disconnected state) and other errors (`network`, `rate-limited`, `forbidden`, `parse-error`) render the shared `ErrorState` keyed off error kind — never a raw exception. (UX-DR24, UX-DR23, AR28)

11. **Tests pass.** Given new `lib/` logic is added (week-grid row builder), when `npm run test` runs, co-located Vitest tests cover: grouping flat worklogs into subtask × day cells, day-total computation, row ordering (Task-by-hours-desc → catch-all → PTO), empty-week, and a worklog whose `started` falls outside the week (excluded). `npm run compile` and `npm run lint` are clean for new/changed files. (AR29)

## Tasks / Subtasks

- [x] **Task 1 — Extend the week fetch to carry the issue key/summary (AC: #3, #5, #11)**
  - [x] `fetchCurrentUserWeekWorklogs` (lib/jira-client.ts) currently returns a FLAT `JiraWorklog[]` and DISCARDS which issue each worklog belongs to (it loops issues but pushes only the worklog). The grid needs per-subtask rows, so the issue key+summary must survive. Add a new exported function (e.g. `fetchCurrentUserWeekWorklogsByIssue(range): Promise<Result<WeekIssueWorklogs[], JiraError>>`) that returns each issue (`{ key, summary }`) paired with its in-range worklogs. Do NOT delete or change the signature of `fetchCurrentUserWeekWorklogs` — `lib/badge.ts` (Story 3.1) and the banner (Story 3.3) depend on it.
  - [x] Reuse the existing JQL + per-issue worklog scan + `startedAfter`/`startedBefore` + author/`started`-in-range filtering already proven in `fetchCurrentUserWeekWorklogs` (lines 441–496). The search already requests `fields=key,summary`, so the summary is available on `searchResult.value.issues[i].fields.summary`.
  - [x] Add Zod-validated types to lib/jira-types.ts only if a new response shape is introduced; the existing `JiraWorklogListSchema` / `JiraSearchSchema` already cover the wire shapes. Prefer composing existing schemas over adding new ones.

- [x] **Task 2 — Build the pure week-grid row builder `lib/week-grid.ts` + tests (AC: #3, #4, #5, #7, #11)**
  - [x] New module `lib/week-grid.ts` (pure, no chrome/network) that maps `WeekIssueWorklogs[]` + `{ weekOf, catchAllProjectKey, ptoSubtaskKey }` into a view model: `{ days: ISODate[7]; rows: WeekGridRow[]; dayTotalsSeconds: number[7] }` where `WeekGridRow = { key; summary; category: 'task'|'catch-all'|'pto'; cellsSeconds: number[7]; rowTotalSeconds }`.
  - [x] Day indexing: index 0 = Monday … index 6 = Sunday, derived from `weekOf` (the Monday). Bucket each worklog into `[issueKey][dayIndex]` by its `started` date (local day). Sum `timeSpentSeconds` per (issue, day).
  - [x] Categorize each row: key startswith `<ptoSubtaskKey>` → `pto`; key project (prefix before `-`) equals `catchAllProjectKey` → `catch-all`; else `task`. Order: `task` (by `rowTotalSeconds` desc) → `catch-all` → `pto`. PTO row sinks last even if catch-all-keyed.
  - [x] Co-located `lib/week-grid.test.ts` covering AC #11 cases. Use `secondsToHours`/`hoursToSeconds` from lib/hours.ts — NEVER inline `* 3600` / `/ 3600` (ESLint AR4).

- [x] **Task 3 — `useWeekWorklogs` hook + query wiring (AC: #1, #2, #9, #10)**
  - [x] Add a hook (e.g. `hooks/useWeekWorklogs.ts`) using `useQuery({ queryKey: ['week-worklogs', weekOf], queryFn: () => fetchCurrentUserWeekWorklogsByIssue(currentCycleRange('weekly')), staleTime: 60_000 })`. Mirror the existing `useHierarchyTickets` hook pattern. `weekOf` (the Monday ISO) is the only cache-key dimension.
  - [x] The `queryFn` returns a `Result`; surface non-`ok` kinds to the component (throw to let TanStack `error` carry the `JiraError`, OR return the discriminated union and branch in the view — match whatever `useHierarchyTickets` already does so error handling is consistent).
  - [x] Reuse `currentCycleRange('weekly')` from lib/cycle-range.ts for the range — it anchors to the same Monday boundary the badge uses. Do NOT hand-roll week math; `weekOf` from `App.tsx`'s `getCurrentWeekMonday()` and `currentCycleRange('weekly')` must agree on the Monday.

- [x] **Task 4 — Replace the `WeekView` stub with the real shell (AC: #1, #2, #6, #7, #8, #9, #10)**
  - [x] Flesh out `components/week/WeekView.tsx` (currently a placeholder rendering "0h logged"): header (`Week of <EEE, MMM d>` via date-fns `format`, already imported in the stub) + week-total (`<logged> / <target>h`, target = `targetHours × 5`) + `WeeklyGrid` + add-subtask affordance + `Mark week as done` placeholder button.
  - [x] Read `targetHoursItem`, `catchAllProjectKeyItem`, `ptoSubtaskKeyItem` (lib/storage/settings.ts) — follow `TodayView`'s settings-load pattern.
  - [x] Loading → skeleton grid (AC #2); error → `ErrorState`/Connect fallback (AC #10); success → `WeeklyGrid`.
  - [x] Keep the co-located `STRINGS` constant pattern (the stub already has one). Update `components/week/WeekView.test.tsx` accordingly.

- [x] **Task 5 — `WeeklyGrid` semantic table component (AC: #3, #4, #5, #6, #7)**
  - [x] New `components/week/WeeklyGrid.tsx` rendering the semantic `<table>`: `<thead>` with `<th scope="col">` day headers + a totals row; `<tbody>` with one `<tr>` per `WeekGridRow`, `<th scope="row">` = truncated `<key> <summary>`, `<td>` per day with `secondsToHoursDisplay(cellSeconds)` (already returns `──` for ≤0) and the `aria-label` from AC #3.
  - [x] Use the shadcn `table` primitive (`components/ui/table.tsx`, installed in Story 1.1) for markup consistency. Monospace numerics/keys via `font-mono`. Truncate the row-header to the 360 px width with `truncate`.
  - [x] `+ Add a subtask to this week` (tertiary `Button`) wires the `TicketPicker` (Story 2.3 — `components/today/TicketPicker.tsx`, prop `onSelect(ticketKey, ticketSummary)`); on select, append a local all-`──` row to component state (dedupe by key). Do NOT post a worklog and do NOT build cell editing (Story 4.3).
  - [x] DO NOT build: per-day color coding / status icons (4.2), inline cell editing / add-remove worklogs (4.3), the PTO popover on the day header (4.4), or the mark-as-done gap-check/dialog/flag write (4.5). Leave `DayCellHeader`/`DayCell`/`PtoPopover`/`MarkAsDoneButton` as future files — render plain headers/cells and a static button here.

- [x] **Task 6 — Gates (AC: #11)**
  - [x] `npm run test` (Vitest) green; `npm run compile` (`tsc --noEmit`) 0 errors; `npm run lint` 0 errors on new/changed files (import/order warnings tolerated only if pre-existing pattern).

## Dev Notes

### What this story IS (scope guardrails)
This is the **shell/scaffold** for Epic 4's Week view. Deliver: the 7-day semantic grid, per-subtask rows grouped from worklogs, per-day total row (neutral, no color), week header + total, skeleton/error states, the add-subtask affordance (local row only), and a `Mark week as done` button placeholder. Everything is read-only review except the local add-subtask row. **Explicitly defer** color coding/status icons (4.2), inline cell editing & add/remove worklogs (4.3), the day-header PTO popover (4.4), and mark-as-done gap-check + local flag (4.5). Leave clean seams (component files, the disabled button, the local-row mechanism) for those stories.

### CRITICAL data-shape finding (do not skip)
`fetchCurrentUserWeekWorklogs` (lib/jira-client.ts:441–496) returns a **flat `JiraWorklog[]` that throws away the issue key/summary** — it iterates issues but only `collected.push(worklog)`. The badge (Story 3.1) and banner (Story 3.3) only need a sum, so that was fine. The grid needs **per-subtask rows**, so you MUST add a variant that preserves `{ key, summary }` per worklog group (Task 1). Do not refactor the flat function's signature — Stories 3.1/3.3 read it. Add a new sibling function.

### Files to read before coding (UPDATE targets)
- `entrypoints/popup/App.tsx` — view-router is DONE. It already: persists view via `getPopupView`/`setPopupView`, builds `{ kind:'week', weekOf: getCurrentWeekMonday() }`, force-mounts both tabs, and renders `<WeekView weekOf=... />`. Do NOT rewrite routing. **Note:** `getCurrentWeekMonday()` is a local helper in App.tsx; verify it agrees with `currentCycleRange('weekly')`'s Monday for the same `reference` (it should — both compute "Monday of this week, Sun→-6"). The week query uses `currentCycleRange('weekly')` for the range; `weekOf` is the display/cache key.
- `components/week/WeekView.tsx` + `WeekView.test.tsx` — current stub renders "0h logged"; you replace it. `date-fns` `format`/`parseISO`/`isValid` already imported.
- `lib/jira-client.ts` — `fetchCurrentUserWeekWorklogs` (clone its proven scan), `postWorklog`/`updateWorklog`/`deleteWorklog` (NOT needed this story), `toJqlDate`, all routed through `jiraGet` → scheduler + auth + 401-refresh + `Result`.
- `lib/cycle-range.ts` — `currentCycleRange('weekly')` returns `{start: Monday 00:00, end: Sunday 23:59}`; `workdaysSoFar()` (Mon=1..Fri=5) is for badge deficit, NOT needed for the grid total (the grid total is just summed logged hours; target = `targetHours × 5`).
- `lib/hours.ts` — `secondsToHours`, `hoursToSeconds`, `secondsToHoursDisplay` (returns `'——'` i.e. `──` for ≤0, else `<n>h`). For grid CELLS the wireframe shows bare decimals (`4.0`) not `4.0h`; decide on a cell formatter — either use `secondsToHoursDisplay` (yields `4h`/`──`) or a thin local formatter producing `4.0`/`──`. Match the UX wireframe's bare-decimal cells; keep `──` for empty. NEVER inline `*3600`/`/3600`.
- `lib/storage/view-state.ts` — `PopupView` union (`today` | `week`), `getPopupView`/`setPopupView`. `ISODate` type lives here.
- `lib/storage/settings.ts` — `targetHoursItem` (8), `catchAllProjectKeyItem` (''), `ptoSubtaskKeyItem` (''), `approvalCycleItem`. Load like `TodayView` does.
- `components/today/TicketPicker.tsx` — reuse for add-subtask; prop `onSelect: (ticketKey, ticketSummary) => void`.
- `components/today/TodayView.tsx` — settings-load + TanStack usage reference pattern.
- `components/ui/table.tsx`, `components/ui/button.tsx`, the skeleton primitive, `components/shared/ErrorState`/`ErrorBoundary` — reuse; do not re-create.
- `entrypoints/popup/main.tsx` — `QueryClient` defaults: `staleTime: 60_000`, `Retry-After`-aware `retry`/`retryDelay`, `refetchOnWindowFocus:false`. Don't change.

### Architecture & convention guardrails (AR/UX-DR)
- **All Jira HTTP through `lib/jira-client.ts`** (scheduler-gated, Zod-validated, `Result<T>`); never `fetch` directly (AR12).
- **`Result<T,E>` at I/O boundaries** — branch on `result.kind` (`ok`/`rate-limited`/`auth-expired`/`network`/`parse-error`/`forbidden`/`not-found`); never throw raw at the boundary (AR6).
- **Every new `lib/` module gets co-located `*.test.ts`** (AR29). `lib/week-grid.ts` must ship with `lib/week-grid.test.ts`.
- **ESLint (AR4):** kebab-case files, named exports only (no default exports), no `any`, no `console.log` outside tests, no inline `*3600`/`/3600`, import order.
- **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) — indexing `days[i]` / `cellsSeconds[i]` yields `T | undefined`; guard or build fixed-length tuples carefully.
- **Semantic HTML + a11y (UX-DR32, NFR12/13):** real `<table>` with `scope`; `aria-label` per cell; keyboard-reachable affordances; no clickable `<div>`s; color (4.2) will be paired with icon/text later, but THIS story has no color to pair.
- **Quiet Density / motion (UX-DR5, UX-DR7, UX-DR33):** flat (no card shadows); skeleton shimmer 1500 ms → static under `prefers-reduced-motion`; use `motion-safe:`/`motion-reduce:` Tailwind variants. No spinners.
- **STRINGS co-located constants (UX-DR31):** UI copy in named constants, not inline JSX. Honest copy (UX-DR30) — no exclamation marks, factual.
- **Popup width 360 px** (`min-w-[360px]` set by `App.tsx`); grid must fit / truncate, not overflow horizontally if avoidable.

### Previous-story intelligence
- **Story 3.1 (badge):** established `fetchCurrentUserWeekWorklogs`, `JiraWorklogListSchema`, `currentCycleRange('weekly')`/`workdaysSoFar`. Pattern: a pure, separately-unit-tested compute function (`computeHoursMissing`) + a thin orchestrator. Apply the same split here — pure `buildWeekGrid()` in `lib/week-grid.ts` (fully testable, no mocks) vs. the React hook/component that fetches. The marked-done storage key `local:weekMarkedDone` already exists (defaulting `false`); Story 4.5 will own writing it — do NOT write it here.
- **Story 2.1 (popup shell):** view-router, Tabs, `forceMount`, view-state persistence already built and tested. This story consumes that shell; it does not modify routing.
- **Stories 2.3/2.4/2.6:** `TicketPicker`, `QuickLogForm`, `LoggedToday` patterns + the Jira-flexible hours parser (`parseHours`) — reused later in 4.3, only `TicketPicker` is reused here.
- Gate baseline from 3.1: tests were ~40 files passing; lint had pre-existing import/order warnings only (0 errors). Keep new files warning-clean.

### Project Structure Notes
- New: `lib/week-grid.ts` + `lib/week-grid.test.ts`; `hooks/useWeekWorklogs.ts`; `components/week/WeeklyGrid.tsx`.
- Modified: `lib/jira-client.ts` (+ new by-issue fetcher) and `lib/jira-client.test.ts`; `components/week/WeekView.tsx` + `WeekView.test.tsx`; possibly `lib/jira-types.ts` (only if a new composed type is needed).
- No manifest/permission changes. No service-worker/background changes (badge already recomputes on its own alarm). No new dependencies — date-fns v4, TanStack Query v5, shadcn table all already present.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1] — ACs, week-grid shell scope, row ordering, add-subtask via TicketPicker.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4] — FR20–FR26 scope; FR20 (this story): 7-day grid + per-subtask breakdown.
- [Source: _bmad-output/planning-artifacts/prd.md] — FR20 (7-day grid view), FR21–FR26 (later stories, leave seams).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Weekly Review] — week-grid wireframe (Week of … / 28/40h / Mon–Sun headers / totals + status row / subtask rows / + Add a subtask / Mark week as done CTA); UX-DR11/12/13; typography text-lg semibold + font-mono numerics; 360px width + truncation; skeleton 4–6 rows 1500ms; empty grid IS the empty state.
- [Source: lib/jira-client.ts:441-496] — `fetchCurrentUserWeekWorklogs` flat fetcher to clone (preserve key/summary in the new variant).
- [Source: lib/cycle-range.ts] — `currentCycleRange('weekly')` Monday→Sunday range.
- [Source: lib/hours.ts:84-88] — `secondsToHoursDisplay` returns `──` for ≤0.
- [Source: lib/storage/view-state.ts] — `PopupView` / `ISODate` / get/set.
- [Source: entrypoints/popup/App.tsx] — view-router, `getCurrentWeekMonday`, forceMount tabs.
- [Source: components/week/WeekView.tsx] — current stub to replace.
- [Source: lib/badge.ts:64-75] — `local:weekMarkedDone` flag already defined (read-only here; 4.5 writes it).

## Review Findings

Code review 2026-06-27 (3-layer adversarial: Blind Hunter, Edge Case Hunter, Acceptance Auditor).
Outcome: 0 decision-needed, 1 patch (applied), 1 deferred, 7 dismissed as noise. All 11 ACs verified genuinely met; no scope leakage into 4.2–4.5; flat `fetchCurrentUserWeekWorklogs` signature confirmed untouched.

- [x] [Review][Patch] Duplicate React key / phantom row when a locally-added subtask later appears in refetched grid rows [components/week/WeeklyGrid.tsx:57] — APPLIED: local placeholder rows are now filtered against `existingKeys` (live `grid.rows`) at render, so a locally-picked key that subsequently arrives via a refetch no longer renders twice.
- [x] [Review][Defer] Search not paginated — users logging against >100 issues in a week silently lose rows [lib/jira-client.ts:528] — deferred, pre-existing: faithfully mirrors the flat sibling `fetchCurrentUserWeekWorklogs` (also `maxResults=100`, no pagination). Out of scope for this shell story; should be fixed in both fetchers together.

Dismissed (not defects / by design / spec-prescribed): N+1 first-failure abort (matches AR6 Result-propagation convention, identical to sibling); negative `timeSpentSeconds` (`z.number()` but Jira never emits negative durations); `weekOf` cache key vs `currentCycleRange('weekly')` fetch (spec Task 3 prescribes exactly this; weekOf is always current Monday in 4.1 shell); timezone day-bucketing (Edge Hunter verified handled — both buckets and worklog timestamps resolve via local civil midnight consistently); two hour formatters cell `4.0` vs header `4` (intentional per Dev Notes / wireframe); extra "Subtask" `<th>` column header (reasonable a11y addition, not a Mon–Sun violation); `act()` warnings in WeekView.test.tsx (cosmetic test hygiene, all tests pass).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Task 1:** Added `fetchCurrentUserWeekWorklogsByIssue` as a sibling of `fetchCurrentUserWeekWorklogs` (flat fetcher left untouched for badge 3.1 / banner 3.3). Reuses the proven JQL + per-issue `startedAfter`/`startedBefore` scan + author/in-range filter, but preserves `{ key, summary, worklogs }` per issue and omits issues with no in-range worklogs. New composed type `WeekIssueWorklogs` added to `lib/jira-types.ts` (no new Zod schema — composes existing `JiraWorklog`).
- **Task 2:** Pure `lib/week-grid.ts` `buildWeekGrid()` maps `WeekIssueWorklogs[]` → `{ days, rows, dayTotalsSeconds }`. Day index 0 = Monday..6 = Sunday derived from `weekOf`; worklogs bucketed by local-day; out-of-week worklogs excluded (rows with zero in-range total are dropped). Ordering: Task (rowTotal desc) → catch-all → PTO last (PTO sinks even when catch-all-keyed). All hour math via `hoursToSeconds`/`secondsToHours` — no inline `*3600`.
- **Task 3:** `hooks/useWeekWorklogs.ts` mirrors `useHierarchyTickets` — throws the non-`ok` `Result` so TanStack `error` carries the `JiraError`; keyed `['week-worklogs', weekOf]`, `staleTime` 60 000 ms; range from `currentCycleRange('weekly')`.
- **Task 4:** Replaced the `WeekView` stub. Header `Week of <EEE, MMM d>` + week total `<logged> / <target>h` (target = `targetHours × 5`); loads `targetHoursItem`/`catchAllProjectKeyItem`/`ptoSubtaskKeyItem` like `TodayView`. Pending → skeleton grid (no spinner, `motion-safe:animate-pulse`); `auth-expired` → Connect-to-Jira fallback (consistent with App.tsx); other errors → neutral error state with Try-again; success → `WeeklyGrid`.
- **Task 5:** `components/week/WeeklyGrid.tsx` — semantic `<table>` with `<th scope="col">` Mon–Sun, a neutral per-day totals row, `<th scope="row">` truncated `<key> <summary>`, `<td>` cells with bare-decimal/`──` via new `secondsToCellDisplay` and the AC#3 `aria-label`. `+ Add a subtask to this week` opens the existing `TicketPicker` inline; selecting appends a local all-`──` row (dedupe by key, no worklog posted). Disabled brand-purple `Mark week as done` placeholder. Color/status icons (4.2), cell editing (4.3), PTO popover (4.4), mark-done logic (4.5) deliberately NOT built.
- **Added** `secondsToCellDisplay` to `lib/hours.ts` (bare-decimal cell format `4.0` / `──`) + tests, to match the wireframe's bare cells without inline math.
- **App.tsx fix (story-flagged Monday agreement):** `getCurrentWeekMonday()` used `monday.toISOString().slice(0,10)`, which in positive-offset timezones (e.g. UTC+7) rolled local-midnight Monday back to Sunday — disagreeing with `currentCycleRange('weekly')`'s local-midnight Monday and producing an off-by-one week header/cache key. Changed to format the LOCAL date directly so the display/cache `weekOf` and the fetched range share the same Monday. Verified across TZs.
- **Gates:** `npm run test` 48 files / 567 passed / 1 skipped (baseline 45/539/1; +3 files, +28 tests). `npm run compile` (tsc --noEmit) 0 errors. `./node_modules/.bin/eslint .` exit 0, 0 errors; new files warning-clean (one pre-existing import/order warning remains in App.tsx, unrelated to this change).
- **Note (no shadcn `table`/`ErrorState` primitive):** The story referenced `components/ui/table.tsx` and a shared `ErrorState`, but neither exists in the repo. Followed the existing convention instead — a plain semantic `<table>` with Tailwind classes (matching how the codebase styles markup) and inline error/skeleton blocks modeled on `TicketPicker`/`TodayView`. No new dependencies added.

### File List

- `lib/jira-types.ts` (modified — added `WeekIssueWorklogs` composed type)
- `lib/jira-client.ts` (modified — added `fetchCurrentUserWeekWorklogsByIssue`)
- `lib/jira-client.test.ts` (modified — tests for the new by-issue fetcher)
- `lib/week-grid.ts` (new — pure `buildWeekGrid` row builder)
- `lib/week-grid.test.ts` (new — co-located tests)
- `lib/hours.ts` (modified — added `secondsToCellDisplay`)
- `lib/hours.test.ts` (modified — tests for `secondsToCellDisplay`)
- `hooks/useWeekWorklogs.ts` (new — week query hook)
- `hooks/useWeekWorklogs.test.tsx` (new — hook tests)
- `components/week/WeekView.tsx` (modified — replaced stub with the real shell)
- `components/week/WeekView.test.tsx` (modified — rewritten for the real shell)
- `components/week/WeeklyGrid.tsx` (new — semantic 7-day grid table)
- `components/week/WeeklyGrid.test.tsx` (new — grid tests)
- `entrypoints/popup/App.tsx` (modified — fixed `getCurrentWeekMonday` TZ off-by-one)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status → review)

## Change Log

- 2026-06-27: Story 4.1 created (ready-for-dev); Epic 4 → in-progress.
- 2026-06-27: Story 4.1 implemented (Tasks 1–6) → review. Added per-issue week fetcher, pure week-grid builder, `useWeekWorklogs` hook, real `WeekView` shell + semantic `WeeklyGrid`; fixed `getCurrentWeekMonday` timezone off-by-one. Gates: 567 tests pass, tsc clean, eslint 0 errors.

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-06-27 — created (ready-for-dev)

; Epic 4 → in-progress (first story of Epic 4)
