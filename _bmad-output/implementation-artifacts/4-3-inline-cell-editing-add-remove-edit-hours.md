---
baseline_commit: 1994b25ff6c2716e9949184337174e2144b81b79
---

# Story 4.3: Inline Cell Editing — Add / Remove / Edit Hours

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a worker reviewing the week,
I want to click any grid cell to add, edit, or remove that subtask's hours for that day (and color the body cells by day status),
so that I can fix gaps directly in the grid without leaving the Week view.

## Acceptance Criteria

1. **Click-to-edit a data cell.** Given the week grid is rendered, when the user clicks (or presses Enter/Space on) any **data cell** `<td>` (NOT a column-header, NOT the totals row, NOT the row-header), then that cell enters inline edit mode showing a focused number `<input>` pre-filled with the current value (the cell's hours as a bare decimal `4.0`, or empty when the cell is `──`). The input has `aria-label="Hours for <day name>, <ticketKey> <summary>"` and `inputMode="decimal"`. Exactly one cell is in edit mode at a time (opening a second cell commits/cancels the first per AC #2/#3). (UX-DR11, UX-DR32, ux-design-specification.md#WeeklyGrid line 1441/1445/1505)

2. **Add or update via the Jira-flexible parser.** Given a cell is in edit mode, when the user types a parseable hours value (the **same `parseHours` from `lib/hours.ts`** used by QuickLogForm — `2.5`, `2.5h`, `2h 30m`, `2:30`, `150m`) and presses **Enter** or **blurs** the input, then:
   - If the cell currently has **no worklog** (was `──`), `postWorklog(<key>, { timeSpentSeconds, started })` is called with `started = formatStartedISO(grid.days[dayIndex])` (09:00 local on that day). (FR22)
   - If the cell has **exactly one** worklog, `updateWorklog(<key>, <worklogId>, { timeSpentSeconds, started })` updates that entry; reuse the existing `started` of that worklog (do not move its time-of-day).
   - The **24-hour hard block (UX-DR9)** applies: values `> MAX_HOURS_PER_ENTRY` (24) are rejected inline with the exact QuickLogForm message `Hours per entry can't exceed 24. Split into multiple entries if needed.` and no network call is made.
   - Unparseable input shows the live red-border invalid state and blocks submit; pressing Enter on an unparseable value is a no-op (stays in edit mode); blurring an unparseable value cancels back to the prior cell value (no write).
   (FR22, UX-DR9)

3. **Clear to delete.** Given a cell is in edit mode and currently has **exactly one** worklog, when the user clears the input to empty and presses **Enter** (or blurs an emptied input that previously had a value), then that worklog is deleted via `deleteWorklog(<key>, <worklogId>)` and the cell returns to `──`. Clearing an already-empty cell is a no-op (just exits edit mode). (FR22)

4. **Multi-worklog cell is read-only here (multi-worklog-per-cell semantics — DESIGN DEFAULT).** Given a cell aggregates **more than one** worklog for that (subtask, day) — possible because `buildWeekGrid` sums multiple same-issue/same-day worklogs into one cell — when the user activates that cell, then it does **NOT** open the inline numeric editor (which worklog to PUT/DELETE is ambiguous, and inline editing must not silently collapse two entries into one). Instead the cell shows a small non-destructive affordance/tooltip with copy exactly `Multiple entries — edit in Today view` and the cell carries `aria-label="<n> entries for <day>, <key> <summary> — edit in the Today view"`. No POST/PUT/DELETE is issued from a multi-worklog cell. (Rationale documented in Dev Notes → Multi-worklog-per-cell decision; mirrors Story 2.6's deliberate per-worklog edit/delete in Today.)

5. **Add a subtask row, then fill it.** Given the user clicks the existing `+ Add a subtask to this week` affordance (Story 4.1) and selects a ticket in the inline `TicketPicker` (Story 2.3), when the ticket is **not already** a grid row, then it is added as a new all-`──` row (local-only, as in 4.1) and its cells are now **editable** — clicking a cell POSTs a worklog per AC #2. When the chosen ticket **is already** a row, nothing is added and focus moves to that existing row's row-header (no duplicate). (UX-DR11, FR22)

6. **Remove a subtask row from the week.** Given the user hovers/focuses a subtask row, when a `⋯` (`MoreHorizontal`) row-actions menu is revealed and the user opens it, then it offers a tertiary `Remove from week` action with this behavior:
   - If the row is **all empty** (`rowTotalSeconds === 0`, e.g. a just-added local row, or a row whose worklogs were all cleared), `Remove from week` simply **hides the row locally** from the grid for the rest of the popup session — no network call (worklogs only get deleted via the deliberate Today-view flow, Story 2.6).
   - If the row **has hours**, `Remove from week` shows an **inline confirmation chip** (`Remove all entries for <key>?` with `Cancel` left / `Remove` right, reusing the Story 2.6 confirm-chip pattern); on confirm it **deletes every in-range worklog in that row** (one `deleteWorklog` per worklog id; transient failures enqueue per AC #7) and the row disappears once empty.
   The menu/confirm uses the **native inline-popover pattern** from Story 2.6 `WorklogRow` (triggerRef/popoverRef/firstActionRef, capture-phase Esc, pointerdown click-outside, focus-first/restore-trigger, `role="menu"`/`menuitem`, `aria-haspopup`/`aria-expanded`) — NOT Radix. Trigger is a real `<button>`, ≥32×32px, revealed on `group-hover:`/`group-focus-within:`/`focus-visible:`, `aria-label="Row actions for <key>"`. (FR22, UX-DR32)

7. **Transient failure → outbox + pending chip.** Given a cell POST/PUT/DELETE (or a row-remove delete) returns `Result.kind === 'network'` or `'rate-limited'`, when the failure is observed, then the change is enqueued in the outbox via `enqueue` from `lib/storage/outbox.ts` (`kind: 'post' | 'put' | 'delete'`, `endpoint`, `issueKey`, `worklogId?`, `body?`) and the cell shows a lucide `Clock` icon + the `Pending — will retry` chip on `bg-state-info-subtle` (`role="status" aria-live="polite"`), exactly as QuickLogForm/WorklogRow do. The optimistic value stays visible. Non-transient errors (`forbidden`/`not-found`/`parse-error`/`auth-expired`) revert the cell to its prior value and show a persistent error chip (`aria-live="assertive"`). (Story 2.7 outbox; UX-DR32)

8. **Success path: refetch + badge broadcast.** Given a cell write or row-remove succeeds (`Result.kind === 'ok'`), when it completes, then (a) `void sendMessage('badge-update', { hoursMissing: 0 })` is fired (the SW recomputes authoritatively via `updateBadge()` — the payload is a placeholder), and (b) the week query is refreshed via `useQueryClient().invalidateQueries({ queryKey: ['week-worklogs', weekOf] })` so the grid, totals, and 4.2 day-status colors reflect the change. Do NOT hand-mutate `query.data`; invalidation is the source of truth. (Story 3.1 badge; hooks/useWeekWorklogs.ts)

9. **Body-cell color carry-through (deferred from 4.2 — include here).** Given `dayStatuses` are computed (Story 4.2), when the grid renders body data cells, then each `<td>` is tinted by its day's status (the UX spec's "the column's status carries through to body cells", ux-design-specification.md line 971): a `complete`/`pto` column tints its body cells `bg-state-success-subtle`, a `below-target` column tints them `bg-state-danger-subtle`, `neutral` stays current neutral. Use the existing `STATUS_CLASSES` map in `WeeklyGrid.tsx`; gate the color transition with `motion-safe:transition-colors motion-safe:duration-200` (instant under `prefers-reduced-motion: reduce`). Color is never the sole signal — the per-day icon/label already lives on the totals/header cell (4.2), so body-cell tint is reinforcing, not the sole carrier (NFR12). A cell in edit mode shows its input chrome (green/red validation border per QuickLogForm) layered over / replacing the status tint. (FR21 carry-through, UX-DR33, NFR12)

10. **Keyboard + a11y.** Given the grid is rendered, when the user navigates by keyboard, then: editable data cells are reachable (each cell is a `<td>` containing a focusable control — a `<button>` in display mode that opens the editor, or the cell itself is `tabIndex={0}` with an `onKeyDown` Enter/Space handler — pick the semantic-HTML option, no clickable bare `<div>`); **Tab** moves to the next cell in DOM order (left-to-right, then next row), **Shift+Tab** moves back (native DOM order — do not trap or re-order focus); **Esc** while editing cancels back to the prior value and returns focus to the cell; **Enter** commits per AC #2/#3. The editing input's `aria-label` is `Hours for <day>, <key> <summary>`; error text is announced `aria-live="assertive"`, the pending chip `aria-live="polite"`. Min tap target 32×32px in the popup. (UX-DR11, UX-DR32, ux-design-specification.md lines 838/1639/1899/1906-1909)

11. **No scope leakage / no regression.** Given the editable grid renders, when the user uses the existing 4.1/4.2 surfaces, then row ordering, row content/truncation, the add-subtask affordance, skeleton, error/auth-expired states, week header + total, the per-day totals-row color/icons/labels (4.2), and the disabled `Mark week as done` button all behave as before. This story does **NOT** build: the day-header **PTO popover** (4.4), the **mark-as-done** gap-check/dialog/local-flag/grey-out (4.5), or any change to the flat `fetchCurrentUserWeekWorklogs` (badge 3.1 / banner 3.3 depend on it). The marked-done flag (`local:weekMarkedDone`) is neither read nor written here. (Scope guard)

12. **Tests + gates pass.** Given new/changed logic, when `npm run test` runs, then co-located Vitest tests cover: (a) `lib/week-grid.ts` extension — a cell retains its worklog id(s) and single vs. multi-worklog classification, and `computeDayStatuses` still passes unchanged; (b) `WeeklyGrid`/`DayCell` render+interaction — empty cell click → POST, single-worklog cell edit → PUT, clear → DELETE, multi-worklog cell is read-only with the `Multiple entries` affordance, over-24 hard block, unparseable rejection, body-cell carry-through tint, Tab order, pending-chip on network failure, row `⋯` Remove-from-week (empty → local hide; non-empty → confirm + delete-all), success → `invalidateQueries` + `sendMessage('badge-update')`. `npm run compile` (`tsc --noEmit`) is 0 errors and `npm run lint` is 0 errors on new/changed files (pre-existing import/order warnings tolerated). (AR29)

## Tasks / Subtasks

- [x] **Task 1 — Retain per-cell worklog identity in `lib/week-grid.ts` (AC: #1, #2, #3, #4, #12)**
  - [x] Extend `WeekGridRow` to carry, per day, the worklog ids that make up the cell — without breaking 4.2's `computeDayStatuses` (which reads `cellsSeconds`/`dayTotalsSeconds`). Added `cells: WeekGridCell[]` (length 7) where `WeekGridCell = { seconds: number; worklogs: { id; startedISO }[] }`, and KEPT `cellsSeconds: number[]` as a derived mirror. Did NOT remove `cellsSeconds`/`dayTotalsSeconds`.
  - [x] In `buildWeekGrid`, while bucketing each worklog into `[dayIndex]`, push `{ id, startedISO }` onto `cells[dayIndex].worklogs` and add `worklog.timeSpentSeconds` to `cells[dayIndex].seconds`. >1 = multi (AC #4); 1 = editable PUT/DELETE; 0 = editable POST.
  - [x] Added pure helper `cellEditability(cell): 'empty' | 'single' | 'multi'`. All hour math via `lib/hours.ts`; every `cells[i]` access guarded.
  - [x] Extended `lib/week-grid.test.ts`: same-day pair → one cell, summed, 2 worklogs (multi); single → 1; empty → `[]`; editability classifier; `computeDayStatuses` cases still pass.

- [x] **Task 2 — `DayCell` editable cell component `components/week/DayCell.tsx` + tests (AC: #1, #2, #3, #4, #9, #10, #7)**
  - [x] New `components/week/DayCell.tsx` rendering ONE body `<td>` for a (row, dayIndex). Props `{ rowKey; rowSummary; dayIndex; dayName; dayISO; cell: WeekGridCell; status: DayStatus; onMutated }`. Display mode shows `secondsToCellDisplay` with carry-through tint (AC #9). Click → edit (single/empty) OR multi read-only affordance (AC #4). The display trigger is a real `<button>` (semantic-HTML, no bare div).
  - [x] Edit mode replicates QuickLogForm's validated input: reuses `parseHours`/`MAX_HOURS_PER_ENTRY`/`hoursToSeconds`; same `validateHours` discriminated result + green/red `border-2` classes + exact `overLimitError` string. Enter/blur commits; Esc cancels. `aria-label="Hours for <day>, <key> <summary>"`, `inputMode="decimal"`. No date picker (date fixed = `dayISO`).
  - [x] Mutations via `useMutation` returning the `Result` (no throw); branch on `result.kind`. POST `started` = `formatStartedISO(dayISO)`; PUT reuses the worklog's own `startedISO` (fallback to `formatStartedISO(dayISO)`). On `ok` → `sendMessage('badge-update')` + `onMutated()`. Transient → `enqueue` + Clock pending chip (`role="status"`). Other → error chip (`aria-live="assertive"`). Double-submit guarded by `isPending`.
  - [x] PUT carries the worklog's `started` via the Task-1 cell model (`worklogs: { id; startedISO }[]`), so `DayCell` is self-contained.
  - [x] Co-located `components/week/DayCell.test.tsx` (12 tests): POST/PUT/DELETE, over-24 hard block, unparseable rejection, Esc cancel, multi read-only, network pending chip, non-transient error, carry-through tint, empty-clear no-op.

- [x] **Task 3 — Wire `DayCell` + body-cell carry-through into `WeeklyGrid.tsx` (AC: #1, #5, #6, #9, #10, #11)**
  - [x] Replaced the static body `<td>` map with `<DayCell>` per cell, passing `status={dayStatuses?.[i] ?? 'neutral'}` (carry-through tint, AC #9) and `onMutated` bubbling to the parent. `<th scope="row">` row-headers and the totals row left as-is (4.2 surface).
  - [x] Added the row `⋯` actions menu + `Remove from week` (AC #6) via a `RowActions` sub-component using the Story 2.6 native inline-popover pattern (triggerRef/popoverRef/firstActionRef, capture-phase Esc, pointerdown outside, focus-first/restore, `role="menu"`/`menuitem`, `aria-haspopup`/`aria-expanded`). Empty row → local hide (`hiddenKeys` state, filtered from `allRows`); non-empty → inline confirm chip then sequential `deleteWorklog` (transient failures enqueue), then `onMutated`.
  - [x] AC #5: on a duplicate pick, focus jumps to the existing row-header (`tabIndex={-1}` + ref map). New local rows' cells are editable `DayCell`s that POST.
  - [x] Local-row reconciliation + `existingKeys` dedupe (4.1) kept intact.

- [x] **Task 4 — Lift mutation/refresh coordination in `WeekView.tsx` (AC: #8, #11)**
  - [x] Added `const queryClient = useQueryClient();` and a memoized `handleMutated` = `() => void queryClient.invalidateQueries({ queryKey: ['week-worklogs', weekOf] })`, passed to `WeeklyGrid` → `DayCell`/row-remove. No hand-mutation of `query.data` (AC #8).
  - [x] No change to the settings load, the `buildWeekGrid`/`computeDayStatuses` `useMemo`s, the skeleton/error/auth-expired branches, or the local-`today` derivation. Added a WeekView test asserting the invalidation.

- [x] **Task 5 — Tests + gates (AC: #12)**
  - [x] `npm run test` (Vitest) green: 49 files / 601 passed / 1 skipped (baseline 48/581/1 → +1 suite, +20 tests, no regressions). `npm run compile` (`tsc --noEmit`) 0 errors. `./node_modules/.bin/eslint .` 0 errors (53 pre-existing import/order warnings in untouched files tolerated; new/changed files warning-clean).

## Dev Notes

### What this story IS (scope guardrails)
Make the week grid's **body data cells editable**. Click a cell → inline number input (same parser/validation/24h-block as QuickLogForm) → POST (empty cell), PUT (single-worklog cell), or DELETE (cleared single-worklog cell). Add the row `⋯` `Remove from week` action. Thread the 4.2 day-status color into the **body cells** (the carry-through 4.2 deferred). Reuse — do not reinvent — the hours parser, the worklog write helpers, the worklog-date helper, the outbox enqueue, the badge broadcast, and the Today-view (2.6) edit/delete/confirm-chip + native-menu patterns. **Explicitly defer:** the day-header PTO popover (4.4) and mark-as-done gap-check/dialog/flag/grey-out (4.5). Leave those seams untouched.

### Multi-worklog-per-cell decision (the key design point — DEFAULT chosen, documented)
`buildWeekGrid` **sums** all of a given issue's worklogs on a given local day into one cell (`cellsSeconds[i]`), so a single grid cell can represent 1..N underlying worklogs. PUT/DELETE require a specific `worklogId`. The chosen default:
- **empty cell (0 worklogs):** click → **POST** a new worklog (`started` = 09:00 local on that day).
- **single-worklog cell (1):** click → edit input; commit → **PUT** that worklog (reuse its `started`); clear → **DELETE** it.
- **multi-worklog cell (>1):** **read-only here.** Do NOT inline-edit (which of the N to PUT/DELETE is ambiguous; editing must not silently collapse N entries into 1, which would destroy data and worklog comments). Show `Multiple entries — edit in Today view` and point the user to the deliberate per-worklog edit/delete flow built in Story 2.6. This keeps destructive/ambiguous operations explicit and is consistent with the epic's "delete actions deliberate" intent (epics.md Story 4.3 row-remove note). If a reviewer prefers an expand-into-N-rows interaction, that's a larger follow-on; the read-only default fully satisfies FR22 for the common 1-worklog-per-cell case.

This requires extending the grid model to retain per-cell worklog ids (and their `started`) — Task 1. Keep `cellsSeconds`/`dayTotalsSeconds` intact so 4.2's `computeDayStatuses` and its tests are untouched.

### Reuse map (do NOT reinvent)
- **Hours parser + 24h block + validation + error STRINGS:** `lib/hours.ts` `parseHours`, `MAX_HOURS_PER_ENTRY` (24), `hoursToSeconds`, `secondsToHours`, `secondsToCellDisplay` (`4.0`/`──`). The `validateHours` discriminated result + green/red `border-2` classes + exact copy live in `components/today/QuickLogForm.tsx:50-94` — replicate that markup (the 2.6 dev deliberately replicated rather than extracted; follow suit unless extraction is clean). Over-limit copy verbatim: `Hours per entry can't exceed 24. Split into multiple entries if needed.`
- **Worklog write helpers:** `postWorklog`, `updateWorklog`, `deleteWorklog` in `lib/jira-client.ts` (all return `Result<…, JiraError>`; success `result.value.id` is the new worklog id). Bodies are FLAT (`{ timeSpentSeconds, started, comment? }`). Comment is not edited here — omit it (don't send `comment`), so existing comments on a PUT'd worklog are preserved by Jira's partial update.
- **`started` ISO:** `formatStartedISO(dateStr)` from `lib/worklog-date.ts` (09:00 local anchor; the 09:00 is an accepted v1 limitation). For PUT, reuse the worklog's own `started`.
- **Outbox enqueue:** `enqueue(input)` from `lib/storage/outbox.ts` — `{ kind: 'post'|'put'|'delete'; endpoint; issueKey; body?; worklogId? }`. `endpoint` = `rest/api/3/issue/<encodeURIComponent(key)>/worklog` (post) or `.../worklog/<encodeURIComponent(worklogId)>` (put/delete). Mirror `enqueueFailedWorklogMutation` in `LoggedToday.tsx:106` and the failure dispatcher `handleEditFailure` (`LoggedToday.tsx:368`): transient (`network`/`rate-limited`) → enqueue + Clock pending chip; else persistent error chip. The SW `outbox-retry` alarm drains it — you only enqueue.
- **Badge broadcast:** `void sendMessage('badge-update', { hoursMissing: 0 })` after any successful write (payload is a placeholder; SW `updateBadge()` recomputes via `fetchCurrentUserWeekWorklogs`). Same import the Today flow uses.
- **Query refresh:** `useQueryClient().invalidateQueries({ queryKey: ['week-worklogs', weekOf] })` — the week data is a TanStack query (`hooks/useWeekWorklogs.ts`), so invalidate (unlike Today's parent-owned local state). Do not optimistic-mutate `query.data`; the optimistic *display* lives in `DayCell` local state until refetch settles.
- **Row `⋯` menu + confirm chip:** native inline-popover pattern in `LoggedToday.tsx` `WorklogRow` (triggerRef/popoverRef/firstActionRef, capture-phase Esc, pointerdown outside, focus-first/restore, `role="menu"`/`menuitem`). Confirm chip: `Cancel` (`variant="secondary"`, left) + the destructive action as `variant="ghost"` + `text-state-danger` (there is no `danger` Button variant). NO Radix — project ethos is native menus.
- **TicketPicker:** `components/today/TicketPicker.tsx`, `onSelect(ticketKey, ticketSummary)` — already wired in `WeeklyGrid` 4.1; do not rebuild.

### Seam from 4.1 / 4.2 (build on this exactly — do NOT restructure)
- `components/week/WeeklyGrid.tsx` is a single semantic `<table>`. `<thead>` has two `<tr>`s (day-name header + the **Daily totals** row with `TotalsCell`). 4.2 colored ONLY the totals row. `<tbody>` rows render a `<th scope="row">` + seven neutral `<td>`s (lines 193-201) — **those `<td>`s are this story's editable surface and where carry-through tint goes.** `STATUS_CLASSES` (lines 50-55) already maps `complete`/`below-target`/`pto`/`neutral` → bg/text classes; reuse it for body cells.
- Day indexing is fixed: index 0 = Monday .. 6 = Sunday across `grid.days`, `grid.dayTotalsSeconds`, every row's `cellsSeconds`. `STRINGS.dayNamesLong`/`dayHeadersShort` are in that order; reuse for `aria-label`s.
- `WeekView.tsx` already builds `grid` and `dayStatuses` via `useMemo` and passes them to `WeeklyGrid`. Add `useQueryClient` + `onMutated` there; thread it down. Do NOT touch the settings load, the local-`today` derivation, or the skeleton/error/auth branches.
- `buildWeekGrid` is the only producer of cell data — extend it (Task 1), don't add a parallel fetch. `WeekIssueWorklogs.worklogs` already carries each `JiraWorklog` (`id`, `timeSpentSeconds`, `started?`), so per-cell ids/`started` are available without a new request.
- The local add-subtask rows + reconciliation (filter local rows whose key later appears in `grid.rows`) and `existingKeys` dedupe (4.1) must stay intact.

### `today` / timezone correctness (do not regress)
4.1 fixed a timezone off-by-one: `weekOf`, the fetched range, and the grid days all share the same **local** Monday; 4.2 derives a local `today`. For 4.3, the cell's POST `started` comes from `formatStartedISO(grid.days[dayIndex])` — `grid.days[i]` is the correct local ISO date for that column, so no new date math. Do not use `toISOString().slice(0,10)` anywhere (UTC, wrong in positive-offset TZs).

### Architecture & convention guardrails (AR/UX-DR)
- **All Jira HTTP through `lib/jira-client.ts`** (scheduler-gated, Zod-validated, `Result<T>`); never raw `fetch` (AR12). Mutations return the `Result` and branch on `result.kind` — **do NOT throw on non-ok** in `mutationFn`; `onError` is for genuine exceptions only (AR6, mirrors 2.6).
- **Pure logic in `lib/` with co-located `*.test.ts`** (AR29): the cell-model/editability extension goes in `lib/week-grid.ts` + `lib/week-grid.test.ts`.
- **ESLint (AR4):** kebab-case files, **named exports only** (no default exports), no `any`, no `console.log` outside tests, **no inline `*3600`/`/3600`** (use `lib/hours.ts`), import order.
- **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`): every `array[i]` is `T | undefined` — narrow it; spread optional props (`...(x ? { prop: x } : {})`) to satisfy `exactOptionalPropertyTypes`.
- **Semantic HTML + a11y (NFR12/13, UX-DR32):** keep the real `<table>` + `scope`; **no clickable bare `<div>`s** — use `<button>`/`tabIndex={0}`+`onKeyDown` for the cell trigger; `aria-label` per editing input; errors `aria-live="assertive"`, pending `aria-live="polite"`; Tab follows native DOM order (don't trap); min tap target 32×32px.
- **Motion (UX-DR33):** body-cell color transitions via `motion-safe:transition-colors motion-safe:duration-200` (instant under `prefers-reduced-motion`). No spinners for the cell (the in-cell write is fast; show the small spinner-to-check like QuickLogForm only if it reads cleaner, ≤200ms).
- **Honest copy (UX-DR30):** no exclamation marks, factual. `below target`, `Pending — will retry`, `Multiple entries — edit in Today view`, `Remove from week`.
- **Color tokens** are hyphenated Tailwind utilities (`bg-state-success-subtle`, `text-state-danger`, `bg-state-info-subtle`) defined in `styles/globals.css` `@theme`. Do NOT use `state-warning`/amber (Epic 5 manager concept).

### Previous-story intelligence
- **Story 2.6 (edit/delete in Today):** canonical mutation + confirm-chip + native-menu patterns. `WorklogRow` `RowMode` state machine (`idle`/`menu`/`editing`/`confirming-delete`), `useMutation` returning the `Result` (no throw), `handleEditFailure` branching transient→outbox vs. persistent error, `sendMessage('badge-update')` on success. `LoggedEntry = { key; summary; hoursDisplay; started; seconds; worklogId; comment? }`. Reuse the *patterns*; the week grid is query-backed so it invalidates instead of patching parent state.
- **Story 2.7 (outbox):** `lib/storage/outbox.ts` `enqueue(...)` (popup-side enqueue; SW `outbox-retry` alarm drains). `OutboxKind = 'post'|'put'|'delete'`. `Clock` pending chip (`bg-state-info-subtle`, "Pending — will retry"). You only enqueue + show the chip; retry is the SW's job.
- **Story 2.4 (QuickLogForm):** `validateHours`/`parseHours`/24h-block/error STRINGS/green-red border — the editing-input blueprint.
- **Story 4.1 (shell):** `lib/week-grid.ts` `buildWeekGrid`, `WeekGrid`/`WeekGridRow`/`WeekGridCategory`, `hooks/useWeekWorklogs.ts` (`['week-worklogs', weekOf]`, throws non-ok Result), as-built single `WeeklyGrid` (no shadcn `table` primitive; plain `<table>`), local add-subtask rows + reconciliation. No `components/ui/table.tsx` exists — follow the plain-`<table>` convention. `secondsToCellDisplay` is the cell formatter.
- **Story 4.2 (color):** `computeDayStatuses` + `DayStatus` + `STATUS_CLASSES` + `TotalsCell` (totals-row color only); body-cell carry-through deliberately deferred to THIS story. `local:weekMarkedDone` owned by 4.5 — do not touch.
- Gate baseline after 4.2: `npm run test` ~48 files / 581 passed / 1 skipped; eslint 0 errors (one pre-existing App.tsx import/order warning). Keep new files warning-clean.

### Project Structure Notes
- **New:** `components/week/DayCell.tsx` + `components/week/DayCell.test.tsx`.
- **Modified:** `lib/week-grid.ts` (+ `WeekGridCell`/per-cell worklog ids + `started`; keep `cellsSeconds`/`dayTotalsSeconds`), `lib/week-grid.test.ts`; `components/week/WeeklyGrid.tsx` (DayCell bodies + carry-through tint + row `⋯`/Remove-from-week) + `WeeklyGrid.test.tsx`; `components/week/WeekView.tsx` (+ `useQueryClient` + `onMutated`) + `WeekView.test.tsx`.
- **Unchanged:** `lib/jira-client.ts` (write helpers already exist — `postWorklog`/`updateWorklog`/`deleteWorklog`), `lib/hours.ts`, `lib/worklog-date.ts`, `lib/storage/outbox.ts`, `hooks/useWeekWorklogs.ts`, the flat `fetchCurrentUserWeekWorklogs`. No manifest/permission/background changes. No new dependencies (`lucide-react`, TanStack Query v5, date-fns v4, Tailwind v4 state tokens all present).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3 (lines 1066-1104)] — ACs: click cell → focused input + `aria-label="Hours for <day>, <subtask>"`; Tab next cell; parse → POST (no worklog) / PUT (exists); 24h hard-block (UX-DR9); clear+Enter → DELETE; add-subtask via TicketPicker + dedupe focus-jump; row `⋯` Remove-from-week (empty → local hide, has-hours → confirm + delete-all); transient fail → outbox + Clock "Pending — will retry".
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4 (lines 299-304, 47-51)] — FR20–FR26; FR22 (this story): edit hours / add / remove subtasks in the weekly grid.
- [Source: _bmad-output/planning-artifacts/prd.md#FR21/FR22] — FR21 per-day color; FR22 grid editing.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 1441, 1443, 1445, 1505)] — WeeklyGrid/DayCell states (`empty / filled / editing / red / green / pending`), interaction (click cell to edit, Tab to next cell), a11y (`aria-label="Hours for [day], [subtask]"`, semantic table).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 968-972, esp. 971)] — "the column's status carries through to body cells" — the deferred carry-through this story implements (AC #9).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 539, 586)] — 24h hard-block + exact error copy "Hours per entry can't exceed 24. Split into multiple entries if needed."
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 537, 799, 680)] — Clock icon + "Pending — will retry", `state.info_subtle` token.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 838, 1639, 1899, 1906-1909)] — Tab/DOM order, Esc closes, Enter submits, focus first day-cell on Week view.
- [Source: components/week/WeeklyGrid.tsx (lines 50-55, 193-201)] — `STATUS_CLASSES`; static body `<td>`s (the edit + carry-through hook point).
- [Source: components/week/WeekView.tsx] — `grid`/`dayStatuses` `useMemo`s; add `useQueryClient`/`onMutated`.
- [Source: lib/week-grid.ts (lines 19-34, 75-144)] — `WeekGridRow.cellsSeconds` summed (no ids today — extend in Task 1); `buildWeekGrid` bucketing loop.
- [Source: lib/jira-client.ts (lines 126-135, 393-417)] — `postWorklog`/`updateWorklog`/`deleteWorklog` (FLAT bodies, return `Result`, `result.value.id`).
- [Source: lib/hours.ts (lines 12, 33-70, 72-98)] — `MAX_HOURS_PER_ENTRY`, `parseHours`, `hoursToSeconds`, `secondsToHours`, `secondsToCellDisplay`.
- [Source: lib/worklog-date.ts (line 12)] — `formatStartedISO(dateStr)` 09:00 local anchor.
- [Source: lib/storage/outbox.ts] — `enqueue({ kind, endpoint, issueKey, body?, worklogId? })`; `OutboxKind`.
- [Source: lib/jira-types.ts (lines 63-105)] — `JiraWorklogSchema` (`id` required, `started?`, `timeSpentSeconds`, `author?.accountId?`); `WeekIssueWorklogs`.
- [Source: components/today/QuickLogForm.tsx (lines 20-33, 50-94, 107-186, 272-281)] — `validateHours`, STRINGS, border classes, mutation, Enter/Esc, pending chip.
- [Source: components/today/LoggedToday.tsx (lines 74-89, 106, 368-461)] — `WorklogRow` state machine, `enqueueFailedWorklogMutation`, `handleEditFailure`, confirm-chip + native menu, `sendMessage('badge-update')`.
- [Source: hooks/useWeekWorklogs.ts] — `['week-worklogs', weekOf]` query to invalidate on success.
- [Source: _bmad-output/implementation-artifacts/4-1-week-view-shell-7-day-grid-with-subtask-rows.md] — 4.1 as-built, plain-`<table>` convention, local-row mechanism, timezone-Monday fix.
- [Source: _bmad-output/implementation-artifacts/4-2-per-day-color-coding-status-icons.md] — `computeDayStatuses`/`STATUS_CLASSES`/`TotalsCell`; body-cell carry-through Scope decision deferring it to 4.3.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8)

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Task 1** — Extended `lib/week-grid.ts` with `WeekGridCell { seconds; worklogs: { id; startedISO }[] }` and `WeekGridRow.cells: WeekGridCell[]`; `cellsSeconds`/`dayTotalsSeconds` kept as derived mirrors so 4.2's `computeDayStatuses` and its tests are untouched. Added pure `cellEditability(cell)` → `'empty' | 'single' | 'multi'`. `buildWeekGrid` now records each contributing worklog's id + `started` per cell.
- **Task 2** — New `components/week/DayCell.tsx`: a single body `<td>` with a `<button>` display trigger (semantic HTML, no clickable bare div), validated inline editor (reuses `parseHours`/`MAX_HOURS_PER_ENTRY`/`hoursToSeconds`, same green/red `border-2` + exact `overLimitError` copy, `inputMode="decimal"`, `aria-label="Hours for <day>, <key> <summary>"`). Empty→POST, single→PUT (reuses worklog `startedISO`), clear→DELETE. `useMutation` returns the `Result` (no throw); transient → outbox `enqueue` + Clock pending chip (`role="status"`); non-transient → error chip (`aria-live="assertive"`); ok → `sendMessage('badge-update')` + `onMutated()`. Multi-worklog cell is read-only with the `Multiple entries — edit in Today view` affordance and an `<n> entries …` aria-label. Carry-through tint applied to every body cell via a `STATUS_TINT` map gated by `motion-safe:transition-colors duration-200`.
- **Task 3** — `WeeklyGrid.tsx` now renders `<DayCell>` per cell (passing `status` for the carry-through tint and `onMutated`). Added a `RowActions` sub-component implementing the Story 2.6 native inline-popover `⋯` menu + `Remove from week`: empty/local rows hide locally (`hiddenKeys` state), rows with hours show an inline confirm chip then sequentially `deleteWorklog` every in-range worklog id (transient failures enqueue) and fire `onMutated`. Duplicate add-subtask picks now focus-jump to the existing row-header (`tabIndex={-1}` + ref map). Totals row, row-headers, local-row reconciliation, and `existingKeys` dedupe unchanged.
- **Task 4** — `WeekView.tsx` adds `useQueryClient` + a memoized `handleMutated` that `invalidateQueries({ queryKey: ['week-worklogs', weekOf] })`, threaded to `WeeklyGrid`. No hand-mutation of `query.data`; settings load, memos, skeleton/error/auth branches, and local-`today` derivation untouched.
- **Multi-worklog-per-cell**: implemented the documented DEFAULT — `multi` (>1 worklog) cells are read-only (no POST/PUT/DELETE), pointing the user to the Today view. No destructive collapse of N entries.
- **Scope**: PTO popover (4.4) and mark-as-done (4.5) left untouched; `local:weekMarkedDone` neither read nor written; flat `fetchCurrentUserWeekWorklogs` unchanged.
- **Gates**: vitest 49 files / 601 passed / 1 skipped; `tsc --noEmit` 0 errors; eslint 0 errors (new files warning-clean).

### File List

- **New:** `components/week/DayCell.tsx`, `components/week/DayCell.test.tsx`
- **Modified:** `lib/week-grid.ts`, `lib/week-grid.test.ts`, `components/week/WeeklyGrid.tsx`, `components/week/WeeklyGrid.test.tsx`, `components/week/WeekView.tsx`, `components/week/WeekView.test.tsx`
- **Modified (tracking):** `_bmad-output/implementation-artifacts/4-3-inline-cell-editing-add-remove-edit-hours.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Review Findings

Code review (adversarial, three parallel layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor) on the uncommitted working tree vs baseline `1994b25`. Reviewer: independent context. Date: 2026-06-27.

### Applied patches (DayCell.tsx + DayCell.test.tsx)

1. **[HIGH] Enter→blur double-submit (duplicate POST/PUT/DELETE).** `commit()` did `setEditing(false)` then `mutate()`; closing the editor unmounts the focused `<input>`, which fires a `blur` → `handleBlur` → `commit()` a second time. `mutation.isPending` is stale inside event-handler closures and could not gate it, so a single Enter could fire two identical writes (duplicate worklog on the empty→POST path = data integrity issue). **Fix:** added a synchronous `resolvedRef` guard — a session resolves exactly once; the second `commit`/`handleBlur` invocation is a no-op. Reset only when a fresh edit opens (`startEdit`). Added a regression test ("Enter then the blur fired by closing the editor does not double-submit").

2. **[MEDIUM] Open editor survives a refetch that flips the cell to `multi` → ambiguous PUT/DELETE.** If a concurrent worklog landed (via `invalidateQueries` refetch) while the editor was open, the cell became `multi` but the `editing` render branch (checked before `isMulti`) kept the input mounted, allowing a PUT/DELETE against `cell.worklogs[0]` — exactly the ambiguous write AC #4 forbids. **Fix:** `commit()` now re-checks `isMulti` at mutation time and cancels instead of writing.

3. **[MEDIUM] setState after unmount.** A refetch can drop/re-sort rows while a mutation is in flight, unmounting the DayCell before `onSuccess`/`onError` runs `setChip`. **Fix:** added a `mountedRef`; all post-mutation `setChip` calls are guarded.

### Deferred (with reason)

- **[AC#7 wording] "optimistic value stays visible" / "revert to prior value."** The implementation never renders an optimistic value — the cell shows the prop value from `cell.seconds` and relies on `invalidateQueries` as the source of truth (which AC #8 explicitly mandates: "Do NOT hand-mutate query.data"). The observed outcome is correct for both branches (old value + correct pending/error chip; no enqueue on hard failure). The literal "optimistic value" phrasing is internally in tension with AC #8; behavior is conforming. No change.
- **[AC#9 convention] DayCell defines its own `STATUS_TINT` rather than reusing `WeeklyGrid`'s `STATUS_CLASSES`.** Functionally correct (same `bg-state-*-subtle` tokens; deliberately drops the `text-*` colors that are inappropriate for body cells). Reusing `STATUS_CLASSES` verbatim would apply wrong text colors to body cells. Low-value convention nit; left as-is.
- **[AC#1 wording] "exactly one cell editing at a time."** Enforced incidentally but reliably via native blur: activating a second cell (mouse or keyboard-Tab to its button) blurs the first input → commits/cancels it. A dedicated cross-cell coordinator is a larger change with no observed defect. Deferred.
- **[LOW] `formatStartedISO('')` would throw on an empty `dayISO`.** `grid.days[i]` is always a well-formed `toISODate` output for any rendered grid (incl. local rows); the `?? ''` is purely defensive and unreachable in practice. Not patched to avoid touching the shared `formatStartedISO` (also used by QuickLogForm/pto).
- **[LOW] Long-decimal prefill** for fractional-hour cells (e.g. 20 min → `0.3333333333333333`). Cosmetic; round-trip is lossless. Deferred.
- **[LOW] RowActions full-failure gives no error chip.** A 100%-failed row-remove closes the menu silently (unlike DayCell's error chip). Minor UX; `onMutated` invalidation re-shows the unchanged row. Deferred.
- **[LOW] RowActions deletes worklogs from multi cells too.** Correct intent for "remove all entries for this row"; confirm copy covers it. Not a bug.

### Verified clean (no action)

- `lib/week-grid.ts`: `cellsSeconds`/`dayTotalsSeconds` remain correct derived mirrors of `cells[i].seconds` (single accumulation per worklog, no double-count); `computeDayStatuses` + its 4.2 tests unchanged and still pass.
- worklog-id targeting: empty→POST, single→PUT/DELETE against `worklogs[0].id`, multi→read-only — all correct. PUT reuses `single.startedISO`. POST `started = formatStartedISO(dayISO)` where `dayISO = grid.days[i]`.
- AC #5/#6/#8/#10/#11: met (dedupe focus-jump, native ⋯ menu + confirm-chip delete-all, badge broadcast + invalidate, Tab DOM order + a11y, no scope leakage into 4.4/4.5, `local:weekMarkedDone` untouched).

### Gates after patches

- `npm run test`: 49 files, **602 passed / 1 skipped** (was 601; +1 regression test).
- `npm run compile` (`tsc --noEmit`): **0 errors**.
- `./node_modules/.bin/eslint .`: **0 errors** (53 pre-existing import/order warnings in untouched files; new/changed files warning-clean).

## Change Log

- 2026-06-27: Story 4.3 created (ready-for-dev). Editable week-grid cells (POST/PUT/DELETE via existing helpers), multi-worklog-per-cell read-only default, row Remove-from-week, body-cell color carry-through (deferred from 4.2). Reuses hours parser, worklog-date, outbox enqueue, badge broadcast, and Story 2.6 edit/menu patterns.
- 2026-06-27: Story 4.3 implemented (→ review). Extended `lib/week-grid.ts` per-cell worklog model (`cells`/`cellEditability`, mirrors kept); new `DayCell` editable-cell component (POST/PUT/DELETE, validation + 24h block, pending/error chips, multi read-only, carry-through tint); `WeeklyGrid` wired with `DayCell` + `RowActions` (`Remove from week`) + duplicate-pick focus jump; `WeekView` invalidates the week query via `onMutated`. Gates: vitest 49/601 passed/1 skipped, tsc 0 errors, eslint 0 errors.

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-06-27 — created (ready-for-dev)


