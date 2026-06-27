---
baseline_commit: 1164253
---

# Story 4.2: Per-Day Color Coding & Status Icons

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a worker scanning the week grid,
I want each day's status to be obvious at a glance with colors and icons,
so that gaps and PTO days stand out without my having to read numbers.

## Acceptance Criteria

1. **Per-day status color + icon on the totals/header cells.** Given the grid has rendered and per-day totals are computed, when each day's status is evaluated, then the day's totals-row cell (the per-day total under the `Mon`..`Sun` header — see "Seam from 4.1") is colored by status:
   - **Green** — `bg-state-success-subtle` + `text-state-success`, with a lucide `Check` icon — when the day total ≥ target hours **OR** the day has a PTO worklog.
   - **Red** — `bg-state-danger-subtle` + `text-state-danger`, with a lucide `AlertCircle` icon — when the day total < target **AND** the day has no PTO worklog (past/today workdays only — see AC #3).
   - **Green with a `PTO` text label** (in place of / alongside the total) when the day has a PTO worklog (full or half day).
   The per-day total keeps its `font-mono text-xs` numeric formatting (`secondsToCellDisplay` → `4.0` / `──`). (FR21)

2. **Color is never the sole signal.** Given color signaling is used, when a status color appears, then it is always paired with (a) a lucide icon (`Check` for complete, `AlertCircle` for below-target) and (b) an `aria-label` on the totals cell reading `<full day name>, <complete|below target|PTO>` (e.g. `Wednesday, below target`). The below-target cell additionally renders the literal text `below target` (small, alongside the `AlertCircle` icon) so the meaning is conveyed without color. The amber/yellow `state-warning` "dirty stripe" pattern is **NOT** used here — it is a manager-view (Epic 5) concept. (NFR12, UX-DR32 / semantic-`<table>`-with-aria)

3. **Future days and weekends are neutral — no red.** Given the current week may contain days that have not happened yet (e.g. when viewing on Thursday, then Fri/Sat/Sun are future), when the grid renders, then future **workdays** show neutral (`text-neutral-500`, no red/green tint, no status icon, `──` for the total when empty) — an incomplete future day is **not** "below target". And weekends (Sat/Sun) render neutral by default (no red), regardless of whether they are past, even with zero hours. Only **past-or-today Mon–Fri** days are eligible for the red below-target status. A weekend that *does* have ≥ target hours or a PTO worklog still earns the green/PTO treatment (green is positive and never withheld); weekends are only exempted from **red**.

4. **Reduced motion.** Given `prefers-reduced-motion: reduce` is set, when a cell's status color changes (e.g. red → green after a future story fills a gap, or on data refetch), then the color transition is instant rather than a 200 ms ease-in-out fade. Use Tailwind `motion-safe:` / `motion-reduce:` variants (the default cell transition is `motion-safe:transition-colors motion-safe:duration-200`). (UX-DR33)

5. **Status logic is a pure, unit-tested `lib/` function.** Given the per-day status decision (green / red / neutral / pto) involves target comparison, PTO detection, and the future-day/weekend rule, when this logic is implemented, then it lives in a pure function in `lib/week-grid.ts` (extend the existing module) — e.g. `computeDayStatuses(grid, { targetHours, today })`returning a `DayStatus[7]` — with a co-located test in `lib/week-grid.test.ts` covering: complete (≥ target), below-target past workday (red), exact-target boundary (green), zero-hour future workday (neutral, NOT red), zero-hour past weekend (neutral, NOT red), a day with a PTO worklog under target (green + pto), and "today" treated as eligible-for-red (not future). No `*3600` inline math — reuse `hoursToSeconds`/`secondsToHours` from `lib/hours.ts`.

6. **No scope leakage / no regression.** Given the colored grid renders, when the user interacts with the existing 4.1 shell, then: the row ordering, row content, add-subtask affordance, skeleton, error/auth-expired states, week header + total, and the disabled `Mark week as done` button all still behave exactly as in 4.1 (verified by the existing `WeeklyGrid`/`WeekView` tests still passing). This story adds coloring/icons to the per-day totals cells **only** — it does NOT add inline cell editing (4.3), the click-header PTO popover (4.4), or mark-as-done gap logic (4.5). Body data cells stay as they are in 4.1 (neutral); the UX spec's "column status carries through to body cells" tint is **deferred** (see Dev Notes → Scope decision).

7. **Tests + gates pass.** Given new/changed logic, when `npm run test` runs, then co-located Vitest tests cover the AC #5 status-decision cases plus a `WeeklyGrid` render test asserting the green/`Check`, red/`AlertCircle`+`below target`, PTO-label, and neutral-future-day cases (icon presence + `aria-label` text). `npm run compile` (`tsc --noEmit`) is 0 errors and `npm run lint` is 0 errors on new/changed files (pre-existing import/order warnings tolerated).

## Tasks / Subtasks

- [x] **Task 1 — Pure per-day status computation in `lib/week-grid.ts` (AC: #1, #3, #5)**
  - [x] Add an exported discriminated type, e.g. `export type DayStatus = 'complete' | 'below-target' | 'pto' | 'neutral';` (discriminated-union/string-literal style per architecture TypeScript rules — no enums).
  - [x] Add a pure function `export function computeDayStatuses(grid: WeekGrid, params: { targetHours: number; today: ISODate }): DayStatus[]` returning a 7-element array index 0 = Monday..6 = Sunday. Rules:
    - **pto** if any row with `category === 'pto'` has `cellsSeconds[dayIndex] > 0` for that day (PTO presence is derivable from the rows already produced by `buildWeekGrid` — no new fetch). PTO wins → green-with-PTO-label.
    - **complete** else if `grid.dayTotalsSeconds[dayIndex] >= hoursToSeconds(targetHours)`.
    - **below-target** else if the day is a **past-or-today Mon–Fri** day (weekday 1–5, and `grid.days[dayIndex] <= today`).
    - **neutral** otherwise (future workdays, all weekends without complete/pto).
  - [x] Derive weekday from `grid.days[dayIndex]` (the ISO date), NOT from the array index assumption alone (index 0 IS Monday by construction, but use the date so "today/future" comparison and weekend detection share one source of truth). Compare future-ness by ISO date string (`grid.days[i] <= today` is a safe lexical compare for `YYYY-MM-DD`). Weekend = Sat/Sun; with index 0 = Monday, indices 5 and 6 are the weekend — but still confirm via the date's weekday for clarity.
  - [x] Guard `noUncheckedIndexedAccess`: indexing `grid.dayTotalsSeconds[i]` / `grid.days[i]` / `cellsSeconds[i]` yields `T | undefined` — narrow with `?? 0` / early-continue, never `!` without a comment.
  - [x] Use `hoursToSeconds(targetHours)` for the target comparison (compare seconds-to-seconds) — NEVER inline `targetHours * 3600` (ESLint forbids inline `*3600`).

- [x] **Task 2 — Co-located tests `lib/week-grid.test.ts` (AC: #5, #7)**
  - [x] Extend the existing test file. Cover every AC #5 case: complete (> and == target boundary), below-target past workday → `below-target`, zero-hour future workday → `neutral`, zero-hour past **weekend** → `neutral` (not red), under-target day with a PTO row cell → `pto`, and "today" (== `today`) treated as eligible-for-red. Build `WeekGrid` fixtures directly (the function takes a `WeekGrid`, so no Jira mocks needed) or reuse `buildWeekGrid` output.
  - [x] Pass an explicit `today` ISO date in tests for determinism — do NOT let the function read the clock internally; the caller injects `today` (the component derives it once from `new Date()`).

- [x] **Task 3 — Color + icon the per-day totals cells in `components/week/WeeklyGrid.tsx` (AC: #1, #2, #3, #4, #6, #7)**
  - [x] `WeeklyGrid` currently receives `{ grid }`. Compute statuses: either accept a new prop `dayStatuses: DayStatus[]` (preferred — keeps `WeeklyGrid` presentational and lets `WeekView` own `targetHours`/`today`) OR pass `targetHours` + `today` and call `computeDayStatuses` inside. Pick the prop approach that keeps the component testable; document the choice. (Recommended: `WeekView` computes `dayStatuses` via `useMemo` and passes the array down, mirroring how it already builds `grid` via `buildWeekGrid`.)
  - [x] In the existing **totals row** (the second `<tr>` in `<thead>`, currently each `<td>` is `font-mono text-xs text-neutral-500`), drive the per-cell classes + icon + label off `dayStatuses[i]`:
    - `complete` → `bg-state-success-subtle text-state-success` + lucide `Check` (16px) + `aria-label="<dayNamesLong[i]>, complete"`.
    - `below-target` → `bg-state-danger-subtle text-state-danger` + lucide `AlertCircle` (16px) + a small `below target` text + `aria-label="<dayNamesLong[i]>, below target"`.
    - `pto` → `bg-state-success-subtle text-state-success` + a `PTO` text label (and `Check` icon) + `aria-label="<dayNamesLong[i]>, PTO"`.
    - `neutral` → current neutral styling (`text-neutral-500`), no icon, `aria-label` may simply read the total or be omitted (neutral days carry no status to announce).
  - [x] Keep the numeric total visible (`secondsToCellDisplay(seconds)` → `4.0` / `──`) alongside the icon/label. The cell is narrow (360 px popup, 7 columns) — stack icon above/below the number or use a tight inline layout; verify it does not overflow horizontally. Status icons are 16px and inherit `currentColor` (so the `text-state-*` class colors them).
  - [x] Add `motion-safe:transition-colors motion-safe:duration-200` to the totals cells so color changes fade under motion-safe and are instant under `prefers-reduced-motion: reduce` (UX-DR33). Do not animate icon swaps.
  - [x] Icons: `import { Check, AlertCircle } from 'lucide-react';` (already a dependency — used elsewhere in the app; confirm with a quick grep). Give icon-only elements `aria-hidden` (the human-readable signal is the cell's `aria-label` + the `below target` text), so the icon is decorative and the status is announced once.
  - [x] Do NOT touch the body data-cell rendering (rows), the add-subtask affordance, or the `Mark week as done` button — those are 4.1 / 4.3 / 4.5 surfaces. Only the `<thead>` totals row gains color/icons.

- [x] **Task 4 — Wire `targetHours` + `today` through `WeekView` (AC: #1, #3)**
  - [x] `WeekView` already loads `targetHours` (state, default 8) and builds `grid` via `useMemo`. Add a sibling `useMemo` computing `dayStatuses = grid ? computeDayStatuses(grid, { targetHours, today }) : null`, where `today` is the local ISO date computed once (`new Date()` → `YYYY-MM-DD` using the same local-date formatting as `lib/week-grid.ts`'s `toISODate`, or `date-fns format(new Date(),'yyyy-MM-dd')`). Pass `dayStatuses` to `<WeeklyGrid grid={grid} dayStatuses={dayStatuses} />`.
  - [x] Reduced-motion and 360px width already handled by `App.tsx`/globals.css; no new wiring.

- [x] **Task 5 — Update component tests + gates (AC: #6, #7)**
  - [x] Update `components/week/WeeklyGrid.test.tsx` (and `WeekView.test.tsx` if the prop shape changes): assert a complete day renders the `Check` icon + `aria-label` containing `complete`; a past below-target workday renders `AlertCircle` + the text `below target` + `aria-label` `below target`; a PTO day renders the `PTO` label + `aria-label` `PTO`; a future workday renders neutral (no `AlertCircle`, no red). Use `getByLabelText` / `getByText`; for icons, lucide renders an `<svg>` — assert via the surrounding labeled cell rather than the raw svg where possible.
  - [x] Confirm the existing 4.1 tests (row ordering, add-subtask, skeleton, error states, header total) still pass unchanged (AC #6 regression guard).
  - [x] `npm run test` green; `npm run compile` 0 errors; `npm run lint` 0 errors on new/changed files (pre-existing App.tsx import/order warning tolerated).

## Dev Notes

### What this story IS (scope guardrails)
A **read-and-paint** layer over the grid 4.1 already built. Compute a per-day status (green / red / pto / neutral) from the totals + PTO-row presence + a future-day/weekend rule, then color the **per-day totals cells** in the header and add a paired icon + accessible label. **No worklog mutation, no new fetch, no popover, no editing.** Explicitly defer: inline cell editing & add/remove worklogs (4.3), the click-header PTO popover that *creates* PTO worklogs (4.4 — this story only *reads* existing PTO worklogs to paint green), and the mark-as-done gap-check/gray-out/badge-clear (4.5). Leave the body data cells neutral.

### Seam from Story 4.1 (build on this exactly — do NOT restructure)
4.1 shipped a **single** `components/week/WeeklyGrid.tsx` — it did NOT create the separate `DayCellHeader.tsx` / `DayCell.tsx` files the UX spec/architecture aspirationally named (those files do not exist). Match the as-built structure:
- The grid is a semantic `<table>` (`WeeklyGrid.tsx`). The `<thead>` has **two `<tr>`s**: (1) the `Mon`..`Sun` day-name header (`<th scope="col">`), and (2) the **per-day totals row** (`aria-label="Daily totals"`, label cell + seven `<td className="... font-mono text-xs text-neutral-500">{secondsToCellDisplay(seconds)}</td>`). **This second `<tr>` is the surface this story colors.** (The wireframe draws a *separate* status-icon row beneath the totals; the as-built grid folds the total + status into one row — render the icon/label inline within each totals `<td>`. Do not add a third row unless it reads cleaner; one cell carrying both number and icon is acceptable and matches the dense 360px layout.)
- Day indexing is fixed: index 0 = Monday .. 6 = Sunday, for `grid.days`, `grid.dayTotalsSeconds`, and every row's `cellsSeconds`. The `STRINGS.dayNamesLong` / `dayHeadersShort` arrays in `WeeklyGrid.tsx` are already in this order — reuse them for `aria-label` day names.
- `buildWeekGrid` (in `lib/week-grid.ts`) already categorizes rows as `'task' | 'catch-all' | 'pto'`. **PTO-day detection needs no new data**: a day has a PTO worklog iff some row with `category === 'pto'` has `cellsSeconds[dayIndex] > 0`. Extend `lib/week-grid.ts` with the status function rather than re-fetching or adding a flag to the fetch layer.
- `WeekView.tsx` already loads `targetHours` (default 8), `catchAllProjectKey`, `ptoSubtaskKey` and builds `grid` via `useMemo`. Add the `dayStatuses` `useMemo` right beside it. `secondsToCellDisplay` (bare-decimal `4.0` / `──`) is the cell formatter — keep it.

### Scope decision (flagged for the dev — intentional simplification)
The UX spec says "the column's status carries through to every body cell" (a red column tints its body cells red too). 4.1 deliberately left the **body** cells neutral and only built a neutral totals row. **This story colors the totals/header cells only and leaves body data cells neutral.** Rationale: (1) AC1/FR21 are about *per-day status* which lives on the day header/total; (2) tinting body cells couples tightly with the inline-edit cell states (`empty/filled/editing/red/green/pending`) that Story 4.3 owns, and 4.3 is the right place to introduce per-cell coloring without double-implementing it. If the reviewer wants the body-cell carry-through now, it is a small follow-on, but the accessible per-day signal (color + icon + label on the header) fully satisfies FR21 + NFR12 on its own.

### Color tokens & icons (exact)
- Tokens are defined in `styles/globals.css` `@theme` (Tailwind v4 CSS-first). Utilities resolve as **`bg-state-success-subtle` / `text-state-success`** (green = #16a34a / subtle #dcfce7) and **`bg-state-danger-subtle` / `text-state-danger`** (red = #dc2626 / subtle #fee2e2). NOTE: globals.css uses **hyphenated** token names (`--color-state-success-subtle`), so the Tailwind utility is `bg-state-success-subtle` (hyphen), NOT the underscore form (`success_subtle`) that appears in the planning docs. Use the hyphenated utilities that actually exist in this repo.
- Do **not** use `state-warning` / amber in the Week view — amber is the manager-matrix dirty state (Epic 5).
- Contrast is pre-verified WCAG AA (`state.danger` on `state.danger-subtle` ≈ 6.2:1) — no need to re-tune colors.
- Icons: **`lucide-react`** (already in the dependency tree — the badge/banner/icons use it; grep to confirm import sites). Use `Check` (complete/PTO) and `AlertCircle` (below target). Default popup icon size 16px; icons inherit `currentColor` so the `text-state-*` class colors them. Mark icons `aria-hidden` and rely on the cell `aria-label` + visible `below target` text for the non-color signal.

### Tone / copy (UX honesty principles)
- Under-target label text is exactly **`below target`** — never "missing", "behind", "forgot", or any judgmental phrasing. No exclamation marks. The design posture is "colleague, not coach": show the gap, don't lecture.
- Red is desaturated (#dc2626 on #fee2e2 ground) by design — visible but not alarmist. Don't substitute a brighter red.

### Architecture & convention guardrails
- **Pure logic in `lib/` with co-located `*.test.ts`** — `computeDayStatuses` goes in `lib/week-grid.ts` next to `buildWeekGrid`; tests in `lib/week-grid.test.ts`. New `lib/` logic requires tests (enforcement gate).
- **ESLint:** kebab-case lib files, **named exports only** (no default exports), no `any`, no `console.log` outside tests, **no inline `*3600`/`/3600`** (use `lib/hours.ts`), import order.
- **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`): all `array[i]` accesses are `T | undefined` — narrow them. Prefer string-literal **discriminated unions over enums** for `DayStatus`.
- **Semantic HTML + a11y (NFR12/NFR13, UX-DR32):** keep the real `<table>` + `scope`; color is paired with icon + `aria-label` + visible text; do not introduce clickable `<div>`s (no interactivity is added this story — header click → popover is 4.4).
- **Motion (UX-DR33):** color transitions via `motion-safe:transition-colors`; instant under `prefers-reduced-motion: reduce`. No spinners, no shimmer changes (4.1 owns the skeleton).
- **Result<T>** is an I/O-boundary concern; this story adds no I/O — purely presentational + a pure function. The existing `useWeekWorklogs` error/auth handling is untouched.

### `today` / timezone correctness (do not regress 4.1's fix)
4.1 fixed a timezone off-by-one: `weekOf` and the fetched range must share the same **local** Monday. For 4.2, derive `today` as a **local** ISO date (`YYYY-MM-DD` from local `getFullYear/getMonth/getDate`, exactly like `toISODate` in `lib/week-grid.ts`) — do NOT use `new Date().toISOString().slice(0,10)` (that's UTC and would mis-flag "today vs future" in positive-offset timezones like UTC+7). Inject `today` into `computeDayStatuses` from the component; never read the clock inside the pure function (keeps tests deterministic).

### Previous-story intelligence
- **Story 4.1 (this epic's shell):** delivered `lib/week-grid.ts` (`buildWeekGrid`, `WeekGrid`/`WeekGridRow`/`WeekGridCategory` types), `lib/hours.ts` `secondsToCellDisplay`, `hooks/useWeekWorklogs.ts`, `WeekView.tsx`, `WeeklyGrid.tsx`. Review confirmed the as-built grid uses a plain `<table>` (no shadcn `table` primitive exists in the repo) and inline error/skeleton blocks. Follow that as-built convention — do not introduce a `components/ui/table.tsx`. The 4.1 review also confirmed two intentional hour formatters (cell `4.0` vs header total `4`) — leave both.
- **Story 3.1 (badge):** the marked-done flag `local:weekMarkedDone` exists but is owned by 4.5 — do NOT read or write it here (this story's status coloring is independent of mark-as-done; greying-out is 4.5).
- **Pattern:** pure compute fn + thin React consumer (mirrors `computeHoursMissing`/badge and `buildWeekGrid`/WeekView). Keep `WeeklyGrid` presentational; put the decision logic in `lib/`.
- Gate baseline after 4.1: `npm run test` ~48 files / 567 passing / 1 skipped; eslint 0 errors (one pre-existing App.tsx import/order warning). Keep new files warning-clean.

### Project Structure Notes
- **Modified:** `lib/week-grid.ts` (+ `computeDayStatuses` + `DayStatus` type), `lib/week-grid.test.ts` (+ status cases), `components/week/WeeklyGrid.tsx` (color/icon the totals row; new `dayStatuses` prop), `components/week/WeeklyGrid.test.tsx`, `components/week/WeekView.tsx` (compute + pass `dayStatuses`, derive local `today`), possibly `components/week/WeekView.test.tsx`.
- **New:** none required (extend existing modules). Do NOT create `DayCellHeader.tsx`/`DayCell.tsx` — match the as-built single-`WeeklyGrid` structure.
- No manifest/permission changes. No service-worker/background changes. No new dependencies (`lucide-react`, Tailwind v4 state tokens, date-fns all already present).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2 (lines 1036-1064)] — ACs: green (≥target OR PTO) + `Check`; red (<target AND no PTO) + `AlertCircle`; future/weekend neutral; color never sole signal + `aria-label` "<day>, <complete|below target|PTO>"; yellow-stripe excluded (Epic 5); reduced-motion instant.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4 (lines 998-1000, 299-304)] — Epic objective; green = complete or PTO, red = below target & not PTO.
- [Source: _bmad-output/planning-artifacts/prd.md#FR21 (line 621)] — "green when day is complete or PTO-marked; red when day is below target and not PTO."
- [Source: _bmad-output/planning-artifacts/prd.md#NFR12 (line 689)] — color signaling paired with non-color signal (text label, icon, pattern).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Popup: Week view (lines 936-986)] — wireframe: totals row + status-icon row (✓/⚠/PTO); "column status carries through to body cells" (deferred — see Scope decision); PTO column green with label.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Color Usage Rules (lines 676-684) + Semantic Color Tokens (lines 649-660)] — green = ≥target/PTO, red = <target/not-PTO; "desaturated, never alarming"; amber reserved for manager dirty.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Color Accessibility (lines 688-695) + line 1443] — red day cell carries `⚠` icon + text "below target"; header `aria-label="Wednesday, complete"`/"below target"/"PTO"; `state.danger` on `state.danger_subtle` 6.2:1 AA.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Iconography (lines 791-805)] — lucide-react; `Check`, `AlertCircle`; 16px in popup; inherits `currentColor`.
- [Source: styles/globals.css (lines 32-40)] — `@theme` state tokens are **hyphenated** (`--color-state-success-subtle`); utilities are `bg-state-success-subtle` / `text-state-success` / `bg-state-danger-subtle` / `text-state-danger`.
- [Source: lib/week-grid.ts] — `buildWeekGrid`, `WeekGrid` (`days`, `rows`, `dayTotalsSeconds`), `WeekGridRow.category` ('task'|'catch-all'|'pto'), `WeekGridRow.cellsSeconds[7]`, `toISODate` (local-date formatter); index 0 = Monday.
- [Source: lib/hours.ts] — `hoursToSeconds`/`secondsToHours` (no inline `*3600`); `secondsToCellDisplay` (`4.0`/`──`).
- [Source: components/week/WeeklyGrid.tsx] — as-built single grid component; totals row is the second `<thead>` `<tr>`; `STRINGS.dayNamesLong`/`dayHeadersShort` in Mon..Sun order.
- [Source: components/week/WeekView.tsx] — loads `targetHours` (default 8); builds `grid` via `useMemo`; add `dayStatuses` `useMemo` + local `today`.
- [Source: _bmad-output/implementation-artifacts/4-1-week-view-shell-7-day-grid-with-subtask-rows.md] — 4.1 scope, as-built notes, timezone-Monday fix, deferral list for 4.2–4.5.

### Review Findings

Code review (2026-06-27) — three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). No HIGH findings; no patches required; no decision-needed items. Acceptance Auditor verdict: PASS on AC1–AC7. The two real MEDIUM observations are spec-mandated behaviors and are deferred (flagged for the Epic 6 a11y audit / future refetch enhancement). 9 findings dismissed as false-positive/defensive-only/by-design.

- [x] [Review][Defer] `today` memoized with `[]` goes stale if the popup stays open across midnight [components/week/WeekView.tsx:72] — deferred: spec explicitly says the component derives `today` once from `new Date()` per mount (AC5 / Dev Notes); a browser-action popup remounts on open, so real-world impact is minimal. A recompute-on-refetch enhancement is out of scope for 4.2.
- [x] [Review][Defer] Cell `aria-label` overrides the numeric hours total for screen readers (complete/below-target/pto announce status word but not the figure) [components/week/WeeklyGrid.tsx:75-87] — deferred: the `aria-label` format `<day>, <complete|below target|PTO>` is mandated verbatim by AC2. Including the total would deviate from spec; flag for the Epic 6 formal a11y audit.

Dismissed (not written as action items): PTO replacing the numeric total (AC1 permits "in place of"); "missing type annotations / `statuses: any[]`" (false positive — code uses `new Array<DayStatus>()`, tsc strict passes); `targetHours=0` → all complete (cannot persist — settings validates integer 1–24, default 8); negative seconds (Jira worklogs are non-negative; `buildWeekGrid` is the source); `isWeekend` using `getDay()` vs index (as-specified — derive weekday from the date); PTO/complete visually identical (by design — both green, distinguished by label); future day meeting target shown complete (AC1 — green never withheld); `dayStatuses` length unvalidated (safe by construction — always 7, `?? 'neutral'` guards); PTO "any >0" threshold (as-specified).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added pure `computeDayStatuses(grid, { targetHours, today })` + `DayStatus` string-literal union to `lib/week-grid.ts`. PTO wins → green; complete at `>= hoursToSeconds(targetHours)` (boundary green); below-target only for past-or-today Mon–Fri (lexical `iso <= today` compare); future workdays and all weekends neutral. Weekend detection uses the day's local weekday (`new Date(\`${iso}T00:00:00\`).getDay()`), not the index alone. All indexed accesses narrowed with `?? 0` / early-continue (no `!`). No inline `*3600` — uses `hoursToSeconds`.
- Colored the **totals row only** in `WeeklyGrid.tsx` via a new optional `dayStatuses?: DayStatus[]` prop and a `TotalsCell` helper. Color is never the sole signal: each status pairs the bg/text token with a lucide icon (`Check` for complete/PTO, `AlertCircle` for below-target — both `aria-hidden`), an `aria-label` (`<Day>, complete|below target|PTO`), and the visible literal `below target` text for the red state. PTO renders the `PTO` label in place of the number; the numeric total stays visible for complete. Cells carry `motion-safe:transition-colors motion-safe:duration-200` (instant under reduced-motion). Body cells, add-subtask, and mark-week-done untouched (4.1/4.3/4.5).
- `WeekView.tsx` computes `dayStatuses` in a `useMemo` beside `grid`, deriving a local `today` via `date-fns format(new Date(),'yyyy-MM-dd')` (local, not UTC — avoids the timezone off-by-one). Passes `dayStatuses` conditionally (spread) to satisfy `exactOptionalPropertyTypes`.
- Scope decision honored: body-cell color carry-through deferred to 4.3; no PTO popover (4.4), no mark-as-done (4.5), no new fetch. `state-warning`/amber intentionally not used (Epic 5 manager concept).
- Gates: `npm run test` → 48 files, 581 passed / 1 skipped (+14 new: 9 status-logic, 5 grid render). `npm run compile` → 0 errors. `eslint` on changed files → 0 errors / 0 warnings (repo-wide pre-existing import/order warnings unchanged).

### File List

- `lib/week-grid.ts` (modified — added `DayStatus` type, `computeDayStatuses`, `isWeekend` helper, `hoursToSeconds` import)
- `lib/week-grid.test.ts` (modified — added `computeDayStatuses` describe block: 9 cases)
- `components/week/WeeklyGrid.tsx` (modified — `dayStatuses` prop, `TotalsCell` helper, lucide `Check`/`AlertCircle`, colored totals row)
- `components/week/WeeklyGrid.test.tsx` (modified — 5 render tests for complete/below-target/pto/neutral + back-compat)
- `components/week/WeekView.tsx` (modified — `localToday`, `dayStatuses` `useMemo`, pass prop)

## Change Log

| Date       | Change                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| 2026-06-27 | Implemented Story 4.2: per-day color coding + status icons on the week totals row; pure `computeDayStatuses`. All gates green (581 tests, tsc 0, lint 0). Status → review. |
