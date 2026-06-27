---
baseline_commit: 770b859
---

# Story 4.4: Click Cell/Header → PTO Popover

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a worker reviewing the week who took a day (or half-day) off,
I want to click a day's column header in the weekly grid and mark that day full-day or half-day PTO in one click (or jump straight to logging a worklog on that day),
so that the day turns green without my having to open Today and manually post a worklog for the right date.

## Acceptance Criteria

1. **Day-header trigger opens a popover anchored to the clicked day column.** Given the week grid is rendered, when the user clicks (or presses Enter/Space on) any **day-name column header** (`<th scope="col">` in the first `<thead>` `<tr>` — the `Mon`…`Sun` cells, NOT the `Subtask` corner header, NOT the `Daily totals` row, NOT a body data cell), then a small popover opens anchored to that header. The header trigger is a real `<button>` inside the `<th>` (semantic HTML — no clickable bare `<div>`), `aria-haspopup="menu"`, `aria-expanded` reflecting open state, `aria-label="PTO and worklog actions for <Weekday>, <Mon D>"` (e.g. `… for Thursday, May 15`), min tap target 32×32px. Exactly one header popover is open at a time. (UX-DR12, UX-DR32, ux-design-specification.md lines 974-986, 1472-1483, 1668)

2. **Popover content: title, three actions, currently-logged announcement.** Given the popover is open, when it renders, then it shows (top→bottom): a **title** = the long weekday + date (e.g. `Thursday`); three actions as `<button role="menuitem">`s — **`Mark full-day PTO (<targetHours>h)`**, **`Mark half-day PTO (<targetHours/2>h)`** (half formatted like PtoQuickAction: `4`, not `4.0`), and **`Add a worklog…`**; and a footer line `Currently: <Xh> logged` where `<Xh>` is that day's total (`secondsToCellDisplay(grid.dayTotalsSeconds[dayIndex])`, e.g. `4.0` → `4h`, `0` → `0h`). The footer is wired to the trigger/popover via `aria-describedby` so screen readers announce the current total. Copy is honest/factual (UX-DR30 — no exclamation marks). (FR23, UX-DR12, UX-DR32, ux-design-specification.md lines 974-986, 1481)

3. **Full-day PTO posts one worklog to the configured PTO subtask, dated that day.** Given the popover is open and the PTO subtask is configured (`ptoSubtaskKeyItem` non-null/non-blank), when the user clicks **`Mark full-day PTO`**, then a single worklog is posted via **`logFullDayPto(ptoSubtaskKey, targetHours, started)` from `lib/pto.ts`** (Story 2.5) with `started = formatStartedISO(grid.days[dayIndex])` (09:00 local on **that** day, NOT today) and `timeSpentSeconds = hoursToSeconds(targetHours)`. On `Result.kind === 'ok'`: (a) `void sendMessage('badge-update', { hoursMissing: 0 })` is fired; (b) the week query is refreshed via the parent's `onMutated()` (`invalidateQueries({ queryKey: ['week-worklogs', weekOf] })`) so the grid re-derives — the PTO row's cell for that day shows the hours and the day's totals cell flips to the green `pto` status (4.2 already maps a configured-PTO-subtask day-total to the `pto` `DayStatus`); (c) the popover closes and focus returns to the header trigger. No inline `* 3600` — use `lib/hours.ts`. (FR23, ux-design-specification.md lines 1122-1123)

4. **Half-day PTO posts at half target.** Given the popover is open and PTO is configured, when the user clicks **`Mark half-day PTO`**, then the worklog is posted via **`logHalfDayPto(ptoSubtaskKey, targetHours, started)`** (`timeSpentSeconds = hoursToSeconds(targetHours / 2)`), everything else identical to AC #3 (same `started = formatStartedISO(grid.days[dayIndex])`, same success path / `onMutated` / badge / close-and-restore-focus). (FR23, ux-design-specification.md lines 1127-1128)

5. **`Add a worklog…` opens the inline day-scoped TicketPicker.** Given the popover is open, when the user clicks **`Add a worklog…`**, then the popover closes and the existing inline `TicketPicker` (Story 2.3, already wired into `WeeklyGrid` via the `+ Add a subtask` affordance) opens below the grid **scoped to the clicked day** — i.e. when the user selects a ticket, the resulting worklog will be dated `grid.days[dayIndex]` rather than added as an empty row. Implementation: reuse the existing `picking` TicketPicker state in `WeeklyGrid`, but carry a `pickerDayISO` so selection POSTs a worklog for that day (via `DayCell`'s edit flow or a direct `postWorklog` with `started = formatStartedISO(grid.days[dayIndex])`) instead of (or in addition to) adding a local row. The picker otherwise behaves identically to Story 2.3. **See Dev Notes → "Add a worklog… day-scoping" for the chosen approach and the simplest conforming default.** (FR23, ux-design-specification.md lines 1131-1133, 1483)

6. **PTO unconfigured → PTO buttons disabled + explained; `Add a worklog…` stays enabled.** Given the PTO subtask is unconfigured (`ptoSubtaskKeyItem` is `null` or blank — Story 1.5 graceful-degradation), when the popover opens, then the two PTO buttons render **disabled** (`disabled` + `aria-disabled="true"`, muted text) and the popover shows a discoverable helper `PTO subtask not configured. Configure in Settings.` where `Settings` is a `<button>` calling `chrome.runtime.openOptionsPage()` (mirror `PtoQuickAction`'s disabled affordance exactly — never a mystery-disabled button). The **`Add a worklog…`** action remains **enabled** (logging a real worklog does not depend on the PTO subtask). Never throw, never block. (FR23, UX-DR25, AR28 graceful degradation, ux-design-specification.md lines 1135-1138; Story 2.5 AC #7 pattern)

7. **PTO post failure: transient → outbox + pending chip; persistent → inline error; never crash.** Given a PTO worklog post returns a non-`ok` `Result`, when the failure is observed, then: **transient** (`network` / `rate-limited`) → enqueue via `enqueue` from `lib/storage/outbox.ts` (`{ kind: 'post', endpoint: 'rest/api/3/issue/<encodeURIComponent(ptoKey)>/worklog', issueKey: ptoKey, body: { timeSpentSeconds, started } }`) and show the `Clock` + `Pending — will retry` chip (`role="status" aria-live="polite"`, `bg-state-info-subtle`); **persistent** (`forbidden` / `not-found` / `parse-error` / `auth-expired`) → show inline error `Couldn’t mark PTO — try again` (`text-state-danger`, `aria-live="assertive"`) and re-enable the buttons for retry. No `badge-update`, no `onMutated`, no entry on failure. (Story 2.5 AC #8 + Story 2.7 outbox; mirror `PtoQuickAction` exactly)

8. **Dismissal + focus management (native, no Radix).** Given the popover is open, when the user presses **Esc** (capture-phase, `stopPropagation`) or clicks/pointer-downs **outside** the popover and trigger, then the popover closes and focus returns to the day-header trigger button. The popover uses the **native inline-popover pattern from `PtoQuickAction`/`WorklogRow`** (`triggerRef`/`popoverRef`/`firstActionRef`, `document` `keydown` capture for Esc, `pointerdown` click-outside, focus the first action on open, restore focus to trigger on close, `role="menu"` + `role="menuitem"`) — **NOT** `@radix-ui/react-popover` and **NOT** a new `components/ui/popover.tsx`. While in-flight, both PTO buttons are disabled (no double-post), and the brief post-success window is guarded against a second submit (mirror `PtoQuickAction`'s `isPending`/`showSuccess`/`resolved` guards). (UX-DR12, UX-DR32, ux-design-specification.md lines 1140-1142, 1668)

9. **Motion respects reduced-motion.** Given `prefers-reduced-motion: reduce`, when the popover opens, then any open animation is instant (no 150 ms ease-out). Use `motion-safe:` Tailwind variants (or no entrance animation at all, as `PtoQuickAction` does — the popover currently renders with no entrance transition, which already satisfies this). (UX-DR33, ux-design-specification.md line 1146)

10. **No scope leakage / no regression.** Given the header popover is added, when the user uses the existing 4.1/4.2/4.3 surfaces, then row ordering/content/truncation, the editable body `DayCell`s (4.3 — click-to-edit, POST/PUT/DELETE, multi-worklog read-only), the body-cell carry-through tint (4.3), the per-day totals-row color/icons/labels (4.2), the row `⋯` `Remove from week` menu (4.3), the `+ Add a subtask` affordance + duplicate dedupe focus-jump (4.1/4.3), the week header + total, the skeleton/error/auth-expired branches, and the disabled `Mark week as done` button all behave as before. This story does **NOT** build the **mark-as-done** gap-check/dialog/local-flag/grey-out (Story 4.5); it neither reads nor writes `local:weekMarkedDone` (or `lib/storage/view-state.ts` mark-done state); and it does NOT change the flat `fetchCurrentUserWeekWorklogs` (badge 3.1 / banner 3.3 depend on it). (Scope guard)

11. **Tests + gates pass.** Given new/changed logic, when `npm run test` runs, then co-located Vitest tests cover: header-click opens the popover; the three actions + `Currently: <Xh> logged` footer render; `Mark full-day PTO` calls `logFullDayPto` with `started` for the **clicked day** (not today) and on success fires `sendMessage('badge-update')` + `onMutated` + closes; `Mark half-day PTO` calls `logHalfDayPto`; PTO-unconfigured → PTO buttons disabled + Settings link, `Add a worklog…` still enabled; transient failure → outbox `enqueue` + pending chip; persistent failure → inline error, no `onMutated`/badge; `Add a worklog…` opens the day-scoped picker; Esc/click-outside closes + restores focus; the 4.1/4.2/4.3 surfaces still render (no regression). `npm run compile` (`tsc --noEmit`) is 0 errors and `./node_modules/.bin/eslint .` is 0 errors on new/changed files (pre-existing import/order warnings tolerated). (AR29)

## Tasks / Subtasks

- [x] **Task 1 — Build `components/week/PtoPopover.tsx` (native popover, reuse `lib/pto.ts`) (AC: #1, #2, #3, #4, #6, #7, #8, #9)**
  - [x] New `components/week/PtoPopover.tsx`. Props: `{ dayIndex; dayName; dayLabel; dayISO; loggedSeconds; ptoSubtaskKey: string | null; targetHours; onAddWorklog; onMutated? }`. Presentational + the PTO mutation; `WeeklyGrid` owns the day data.
  - [x] Day-header trigger is a real `<button>` (short `Mon`…`Sun` label visible) with `aria-haspopup="menu"`, `aria-expanded`, `aria-label="PTO and worklog actions for <dayName>, <dayLabel>"`, `aria-describedby` → footer, `h-8 min-w-[2rem]` (≥32×32px).
  - [x] Native-popover mechanics copied from `PtoQuickAction.tsx`: `triggerRef`/`popoverRef`/`firstActionRef`; toggle open on trigger; `document` `keydown` Esc (capture, `stopPropagation`) + `pointerdown` click-outside; focus first action on open; restore trigger focus on close. `role="menu"`/`role="menuitem"`. No Radix, no new `components/ui/popover.tsx`.
  - [x] Popover body: title (`dayName`), three `role="menuitem"` buttons, footer `Currently: <Xh> logged` with `id` referenced by `aria-describedby`. Half-hours via copied `formatHours` (`4` not `4.0`); footer via `loggedDisplay` (`4.0`→`4h`, `0`→`0h`).
  - [x] PTO mutation via `useMutation` returning the `Result` (no throw): variant picks `logFullDayPto`/`logHalfDayPto`, `started = formatStartedISO(dayISO)` (clicked day). `onSuccess`: `ok` → badge + `onMutated?()` + close + restore focus; `network`/`rate-limited` → `enqueue` post + pending chip; else → inline error. Double-submit guarded by `isPending` + `resolvedRef`.
  - [x] Disabled state (AC #6): `!ptoSubtaskKey` → both PTO buttons `disabled` + `aria-disabled="true"` (muted) + `PTO subtask not configured. Configure in <Settings>` (`openOptionsPage`). `Add a worklog…` stays enabled.
  - [x] Co-located `components/week/PtoPopover.test.tsx` (11 tests): open-on-click; three actions + footer; full-day → `logFullDayPto` with the clicked day's `started`; half-day → `logHalfDayPto`; success → badge + `onMutated` + close; transient → `enqueue` + pending chip; persistent → inline error, no `onMutated`/badge/enqueue; PTO-unset → disabled + Settings link + `Add a worklog…` enabled; Esc + click-outside close.

- [x] **Task 2 — Wire `PtoPopover` into the day-name headers in `WeeklyGrid.tsx` (AC: #1, #2, #5, #10)**
  - [x] Day-name `<th scope="col">`s now host the `PtoPopover` trigger (short label visible). Pass `dayIndex=i`, `dayName=STRINGS.dayNamesLong[i]`, `dayLabel=formatDayLabel(grid.days[i])`, `dayISO=grid.days[i]`, `loggedSeconds=grid.dayTotalsSeconds[i]`, `ptoSubtaskKey`, `targetHours`, `onAddWorklog`, `onMutated`.
  - [x] `WeeklyGrid` gains optional `ptoSubtaskKey?: string | null` + `targetHours?: number` props. Added `formatDayLabel` (`date-fns format(parseISO(iso), 'MMM d')`).
  - [x] Day-scoped `Add a worklog…`: `picking` is now `{ dayIndex } | boolean`. The header action sets `picking = { dayIndex }`; on `onSelect` the row is added (if new) and the clicked day's `DayCell` editor is opened via a `registerOpenEditor` callback registry, so the existing 4.3 `DayCell` POST dates the worklog to `grid.days[dayIndex]`. The plain `+ Add a subtask` affordance (`picking = true`) is unchanged.
  - [x] Did NOT touch `TotalsCell`, the body `DayCell` rows' core flow, `RowActions`, local-row reconciliation, or `existingKeys` dedupe (only additive `registerOpenEditor` prop on `DayCell`).
  - [x] `components/week/WeeklyGrid.test.tsx`: +2 tests (header renders/opens a popover trigger with the 4.2 totals + 4.3 body cells still present; header `Add a worklog…` opens the day-scoped picker). All 18 prior tests still green.

- [x] **Task 3 — Thread `ptoSubtaskKey` + `targetHours` from `WeekView.tsx` (AC: #3, #4, #6, #10)**
  - [x] `WeekView` passes its existing `ptoSubtaskKey`/`targetHours` state to `<WeeklyGrid>`. No new fetch, no memo/branch changes.
  - [x] Prop contract: `ptoSubtaskKey || null` so `PtoPopover` sees `null` when unset (AC #6).
  - [x] `components/week/WeekView.test.tsx`: +1 cheap assertion (props threaded to `WeeklyGrid`).

- [x] **Task 4 — Tests + gates (AC: #11)**
  - [x] `npm run test` (Vitest) green: 50 files / 616 passed / 1 skipped (was 49/602/1). No regressions.
  - [x] `npm run compile` (`tsc --noEmit`) 0 errors; `./node_modules/.bin/eslint .` exits 0 (53 pre-existing import/order warnings in untouched files; new/changed files warning-clean).

## Dev Notes

### What this story IS (scope guardrails)

Add a **day-header PTO popover** to the week grid. Clicking a day's column header (`Mon`…`Sun`) opens a small native popover with three actions: **Mark full-day PTO**, **Mark half-day PTO**, **Add a worklog…**, plus a `Currently: <Xh> logged` footer. Full/half PTO post a single worklog to the configured PTO subtask **dated that clicked day** (not today) by reusing `lib/pto.ts`'s `logFullDayPto`/`logHalfDayPto` (Story 2.5) — pass `started = formatStartedISO(grid.days[dayIndex])`. On success: badge broadcast + week-query invalidation (via the parent's existing `onMutated`) so the day flips green (4.2 already styles a PTO-subtask day-total as `pto`). `Add a worklog…` opens the existing inline `TicketPicker` scoped to that day. **Reuse — do not reinvent** the PTO helpers, the native inline-popover mechanics, the worklog-date helper, the outbox enqueue, and the badge broadcast. **Explicitly defer:** mark-as-done gap-check/dialog/flag/grey-out (Story 4.5) — leave that seam untouched.

### ⚠️ Popover decision — DO NOT add `@radix-ui/react-popover` (this is the key reuse decision)

The epic AC and the UX spec both literally say "shadcn `Popover` (Radix)". **The project deliberately did NOT install that dependency.** Confirmed at story-creation time:
- `package.json` has only `@radix-ui/react-dialog` and `@radix-ui/react-tabs`. There is **no `@radix-ui/react-popover`**.
- `components/ui/popover.tsx` does **not** exist.
- Story 2.5 (`PtoQuickAction`) made an explicit, reviewed decision to build a **lightweight native inline popover** instead of adding the Radix popover dep for a small 2-3 button menu, and that decision held through code review. Story 4.3's `RowActions` (`WorklogRow` menu) followed the same native pattern.

**Therefore: build `PtoPopover` with the native inline-popover pattern, NOT Radix.** Copy the mechanics directly from `components/today/PtoQuickAction.tsx` (lines 55-105, 234-289): `triggerRef`/`popoverRef`/`firstActionRef` refs; toggle `open` on the trigger; `document.addEventListener('keydown', …, true)` for capture-phase Esc with `stopPropagation`; `document.addEventListener('pointerdown', …)` for click-outside (ignore inside popover/trigger); `useEffect` to focus `firstActionRef` on open; restore `triggerRef` focus on close; `role="menu"`/`role="menuitem"`; `aria-haspopup`/`aria-expanded`/`aria-describedby`. This satisfies UX-DR12/UX-DR32 (focus moves in, Esc closes, focus returns) and UX-DR33 (no entrance animation = instant under reduced-motion). **Documented variance from the spec's literal "Radix Popover" — same as Story 2.5.** If a reviewer insists on the shared shadcn primitive, that's a larger dependency-adding follow-up, out of scope.

### Reuse map (do NOT reinvent)

- **PTO worklog helpers (Story 2.5):** `logFullDayPto(ptoSubtaskKey, targetHours, started)` and `logHalfDayPto(ptoSubtaskKey, targetHours, started)` from `lib/pto.ts` — both call `postWorklog` with `hoursToSeconds(targetHours)` / `hoursToSeconds(targetHours / 2)` and return `Result<JiraWorklog, JiraError>`. **`started` is a parameter** (the module is time-pure) — pass the clicked day's ISO, not today's.
- **`started` ISO:** `formatStartedISO(dateStr)` from `lib/worklog-date.ts` (09:00 local anchor; accepted v1 limitation). Use `formatStartedISO(grid.days[dayIndex])` — `grid.days[i]` is the correct **local** ISO date for that column (4.1 fixed the timezone off-by-one). Do NOT use `todayDateString()` here (that's `PtoQuickAction`'s today-anchored value — wrong for the week grid). Do NOT use `toISOString().slice(0,10)` (UTC, wrong in positive-offset TZs).
- **Native popover mechanics:** `components/today/PtoQuickAction.tsx` — the canonical reference for this exact component shape (trigger + 2-3 action menu + disabled state + error/pending chips + Esc/outside/focus). `WorklogRow`/`RowActions` (4.3) is the secondary reference for a grid-embedded native menu.
- **Hours conversion / formatting:** `hoursToSeconds`, `secondsToHoursDisplay` (`4h`), `secondsToCellDisplay` (`4.0`/`──`) from `lib/hours.ts`. The half-hour label helper `formatHours` (`4` not `4.0`) is defined inline in `PtoQuickAction.tsx:32` — copy it (or hoist if extraction is clean). **NEVER inline `* 3600` / `/ 3600`** (architecture binding).
- **Outbox enqueue (Story 2.7):** `enqueue({ kind: 'post', endpoint: 'rest/api/3/issue/<encodeURIComponent(ptoKey)>/worklog', issueKey: ptoKey, body: { timeSpentSeconds, started } })` from `lib/storage/outbox.ts` on transient failure — verbatim as `PtoQuickAction.tsx:141-148`. You only enqueue + show the `Clock` `Pending — will retry` chip; the SW `outbox-retry` alarm drains it.
- **Badge broadcast:** `void sendMessage('badge-update', { hoursMissing: 0 })` from `lib/messages.ts` after a successful post (payload is a placeholder; the SW recomputes via `fetchCurrentUserWeekWorklogs`).
- **Query refresh:** the parent (`WeekView`) already owns `handleMutated = () => invalidateQueries({ queryKey: ['week-worklogs', weekOf] })` and passes it as `onMutated` to `WeeklyGrid` (4.3). Thread it to `PtoPopover` and call it on success — **do NOT hand-mutate `query.data`**; invalidation is the source of truth (AC #3/#8 of 4.3). After invalidation, `buildWeekGrid` re-buckets the new PTO worklog into the PTO row's cell and `computeDayStatuses` re-derives that day as `pto` (green) automatically.
- **TicketPicker (Story 2.3):** `components/today/TicketPicker.tsx`, `onSelect(ticketKey, ticketSummary)`. Already wired into `WeeklyGrid` (`picking` state, line 430-431). Reuse for `Add a worklog…`; do not rebuild.
- **Disabled-affordance + Settings link:** `PtoQuickAction.tsx:191-217` — the exact `disabled` + `aria-disabled` + `text-neutral-500` helper + `Settings`-button-to-`openOptionsPage` markup. Mirror it.

### 4.2 will color the PTO day green automatically — verify, don't re-implement

`computeDayStatuses` (Story 4.2, `lib/week-grid.ts:220`) already returns the `pto` `DayStatus` for a day whose total comes from the configured PTO subtask, and `STATUS_CLASSES.pto` = `bg-state-success-subtle text-state-success` (green) with the `Check` icon + `PTO` label in `TotalsCell` (4.2). Story 4.3 already carries that tint through to the body cells. So **after a successful PTO post + `onMutated` invalidation, the day turns green and the PTO-row cell shows the hours with NO new color code in this story.** AC #3's "header turns green / PTO label" is satisfied by the existing 4.2 totals-cell + 4.3 carry-through — do NOT add a parallel coloring path. (Confirm the `pto` status fires for a PTO-subtask worklog when you write the test; if 4.2's `pto` detection keys off the catch-all/PTO category in `buildWeekGrid`, the new worklog must land in the PTO row — it will, because `buildWeekGrid` buckets by issue key and the PTO subtask key is a grid row.)

### "Add a worklog…" day-scoping (DESIGN DEFAULT — document the chosen approach)

The epic AC (lines 1131-1133) says `Add a worklog…` opens a compact `TicketPicker` "scoped to add a worklog with `started = <that day ISO>`" and "behaves identically to Story 2.3 but the resulting worklog targets the clicked day's date." The current `WeeklyGrid` `picking`/`TicketPicker` flow (4.1/4.3) **adds an empty local row** — it does not post a dated worklog. The gap: after picking a ticket, the user still has to click the day cell and type hours (4.3's `DayCell` POST), which already dates the worklog to that column. **Chosen simplest conforming default:**

1. `Add a worklog…` for day *D* opens the existing inline `TicketPicker` (set `picking = { dayIndex: D }`).
2. On `onSelect(key, summary)`: if the ticket is not already a row, add it as a local row (as today). Then **focus that row's day-*D* `DayCell` in edit mode** (or pre-open its editor) so the user types hours and the existing `DayCell` POST flow dates it to `grid.days[D]` (= the clicked day). This reuses 4.3's validated POST end-to-end with zero new posting code and keeps the "type the hours" step the user expects.

This satisfies "the resulting worklog targets the clicked day's date" because `DayCell`'s POST already uses `formatStartedISO(grid.days[dayIndex])`. **If the dev finds it cleaner**, an alternative is to POST a 0-prompt worklog directly on selection — but that bypasses the hours input and is worse UX; prefer the focus-the-cell approach. Either way, the picker itself behaves identically to Story 2.3. Document whichever is implemented in the Completion Notes. (If wiring the cross-component cell-focus is more than trivial, falling back to "open the picker, add the row, and rely on the user clicking the day cell" still conforms to the AC's letter — the worklog is dated that day via DayCell — but document the variance.)

### Where the trigger lives (seam from 4.1/4.2/4.3 — build on this exactly)

- `components/week/WeeklyGrid.tsx` `<thead>` has **two** `<tr>`s: the **day-name header row** (`Mon`…`Sun`, plain `<th scope="col">`, lines 359-367) — **this story's trigger surface** — and the **`Daily totals` row** (`TotalsCell`, 4.2 color/icons). Put the `PtoPopover` trigger in the day-name `<th>`s; leave the totals row alone.
- Day indexing is fixed: index 0 = Monday … 6 = Sunday across `grid.days`, `grid.dayTotalsSeconds`, `STRINGS.dayNamesLong`/`dayHeadersShort`. Reuse `STRINGS.dayNamesLong[i]` for the popover title and `aria-label`.
- `grid.days[i]` is the local ISO date for column `i` (`ISODate[]`, `lib/week-grid.ts`). `grid.dayTotalsSeconds[i]` is that day's total (for the `Currently: <Xh>` footer).
- `WeekView.tsx` already builds `grid`/`dayStatuses`, owns `handleMutated`/`onMutated`, and has `ptoSubtaskKey` + `targetHours` state — just thread the two new props to `WeeklyGrid`. Don't touch the memos, settings loads, or fallback branches.

### Architecture & convention guardrails (AR/UX-DR)

- **All Jira HTTP through `lib/jira-client.ts`** (scheduler-gated, Zod-validated, `Result<T>`) — and here, through `lib/pto.ts` which wraps `postWorklog`. Never raw `fetch` (AR12). The mutation returns the `Result` and branches on `result.kind` — **do NOT throw on non-ok**; `onError` is for genuine exceptions only (AR6, mirrors 2.5/2.6/4.3).
- **ESLint (AR4):** kebab-case files, **named exports only** (no default exports), no `any`, no `console.log` outside tests (use `lib/log.ts` — `log.info('pto.posted', …)`, `log.warn('pto.post.failed', …)`), **no inline `*3600`/`/3600`** (use `lib/hours.ts`), import order.
- **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`): every `array[i]` is `T | undefined` — narrow it (`grid.days[i] ?? ''`, etc.); spread optional props (`...(onMutated ? { onMutated } : {})`) — see how `WeeklyGrid` already does this for `onMutated` (line 407) and `dayStatuses` (WeekView line 120).
- **Semantic HTML + a11y (NFR12/13, UX-DR32):** the trigger is a real `<button>` inside the `<th scope="col">` (no clickable bare `<div>`); `aria-haspopup="menu"`/`aria-expanded`/`aria-label`/`aria-describedby`; errors `aria-live="assertive"`, pending `aria-live="polite"`; min tap target 32×32px in the 360px popup.
- **Motion (UX-DR33):** no popover entrance animation (matches `PtoQuickAction`) → instant under `prefers-reduced-motion`. If you add one, gate with `motion-safe:`.
- **Honest copy (UX-DR30):** no exclamation marks. Exact strings: `Mark full-day PTO (<h>h)`, `Mark half-day PTO (<h>h)`, `Add a worklog…`, `Currently: <Xh> logged`, `PTO subtask not configured. Configure in Settings.`, `Couldn’t mark PTO — try again` (curly apostrophe matches the existing `PtoQuickAction`/`QuickLogForm` repo convention), `Pending — will retry`.
- **Color tokens** are hyphenated Tailwind utilities (`bg-state-success-subtle`, `text-state-danger`, `bg-state-info-subtle`) in `styles/globals.css` `@theme`. Do NOT use `state-warning`/amber (Epic 5 concept). `accent` = brand purple (Button `variant="primary"`).

### Previous-story intelligence

- **Story 2.5 (PtoQuickAction + lib/pto):** THE template. `lib/pto.ts` `logFullDayPto`/`logHalfDayPto` (time-pure, `started` param). `PtoQuickAction.tsx` native popover + disabled state + error/pending chips + double-submit guard (`isPending`/`showSuccess`) + outbox enqueue on transient + badge broadcast. Reviewed decision: NO `@radix-ui/react-popover`. Reuse the helpers as-is; copy the component mechanics, swapping `todayDateString()` → the clicked-day ISO and `onLogged(entry)` → `onMutated()` (the grid is query-backed; it invalidates rather than appending to a parent list).
- **Story 2.6/2.7:** native `⋯` menu + confirm-chip pattern (`RowActions` in `WeeklyGrid` already uses it); outbox `enqueue` + `Clock` pending chip ("Pending — will retry"); `sendMessage('badge-update')` on success.
- **Story 4.1 (shell):** `buildWeekGrid`, `WeekGrid.days: ISODate[]` (local Monday-anchored), plain-`<table>` convention (no shadcn `Table`), local add-subtask rows + reconciliation, `useWeekWorklogs(['week-worklogs', weekOf])`. The day-name header row already exists — augment it.
- **Story 4.2 (color):** `computeDayStatuses` → `DayStatus` (`complete`/`below-target`/`pto`/`neutral`); `STATUS_CLASSES`; `TotalsCell` (totals-row color/icon/label, incl. the `pto` green + `PTO` label). A PTO-subtask day already renders green — this story's PTO post just produces such a day.
- **Story 4.3 (editable cells):** `DayCell` POST/PUT/DELETE (POST uses `formatStartedISO(grid.days[dayIndex])` — the exact pattern for dating a worklog to a column); body-cell carry-through tint; `RowActions` `Remove from week`; `WeekView.handleMutated`/`onMutated` invalidation plumbing; the multi-worklog-read-only default. The `picking` `TicketPicker` state lives in `WeeklyGrid` (extend it for day-scoping). `local:weekMarkedDone` owned by 4.5 — untouched.
- Gate baseline after 4.3: `npm run test` ~49 files / 602 passed / 1 skipped; `tsc --noEmit` 0 errors; eslint 0 errors (53 pre-existing import/order warnings in untouched files). Keep new files warning-clean.

### Project Structure Notes

- **New:** `components/week/PtoPopover.tsx` + `components/week/PtoPopover.test.tsx` (PascalCase component under `components/week/`, co-located `*.test.tsx` — matches the architecture's listed `components/week/PtoPopover.tsx`).
- **Modified:** `components/week/WeeklyGrid.tsx` (day-name headers host the popover trigger + day-scoped picker) + `WeeklyGrid.test.tsx`; `components/week/WeekView.tsx` (thread `ptoSubtaskKey` + `targetHours` props) + `WeekView.test.tsx` (if a cheap assertion).
- **Unchanged:** `lib/pto.ts` (helpers already exist — call them), `lib/worklog-date.ts`, `lib/hours.ts`, `lib/storage/outbox.ts`, `lib/messages.ts`, `lib/week-grid.ts` (`buildWeekGrid`/`computeDayStatuses` already produce the PTO row + `pto` status), `hooks/useWeekWorklogs.ts`, `components/week/DayCell.tsx` (unless the day-scoped picker pre-opens a cell's editor — if so, a small focusable hook may be needed; keep it minimal and don't regress 4.3). `components/today/PtoQuickAction.tsx` (the Today-view PTO action) stays as-is — this is the separate Week-view component.
- **No new dependencies** (`lucide-react`, TanStack Query v5, date-fns v4, Tailwind v4 state tokens all present). Specifically: **do NOT add `@radix-ui/react-popover`.**
- No manifest/permission/background changes.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4 (lines 1106-1146)] — ACs: click day column header → popover (3 actions + `Currently: <Xh> logged` via `aria-describedby`); full-day PTO via `lib/pto.ts` `started = <that day ISO>`; half-day; `Add a worklog…` → compact day-scoped `TicketPicker`; PTO-unconfigured → PTO buttons disabled + Settings deep link, `Add a worklog…` enabled; Esc/outside closes + restore focus; reduced-motion instant.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5 (lines 1148-1197)] — explicit scope boundary (mark-as-done/gap dialog/`view-state` flag — NOT this story).
- [Source: _bmad-output/planning-artifacts/epics.md (lines 180-181, 234, 303-304)] — `DayCellHeader` + `PtoPopover`; FR23 click-cell-header PTO popover.
- [Source: _bmad-output/planning-artifacts/prd.md#FR23] — mark a day full/half PTO via the click-cell-header popover.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 974-986)] — the PTO popover wireframe (title / 3 actions / `Currently: 4h logged`).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 1472-1483, 1506, 1668)] — `PtoPopover` spec (states/a11y/interaction), `DayCellHeader`, Popover overlay rules (no backdrop, focus in, Esc closes, opens adjacent to trigger).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 1140-1146)] — Esc/outside + focus return; reduced-motion instant.
- [Source: components/today/PtoQuickAction.tsx (lines 32-34, 55-105, 107-159, 191-217, 234-289)] — `formatHours`; native popover refs + Esc/outside/focus; PTO `useMutation` + outbox + badge + double-submit guard; disabled affordance + Settings link; popover markup.
- [Source: lib/pto.ts (lines 16-36)] — `logFullDayPto`/`logHalfDayPto(ptoSubtaskKey, targetHours, started)` (time-pure, return `Result`).
- [Source: lib/worklog-date.ts (formatStartedISO)] — 09:00 local anchor; pass `grid.days[dayIndex]`.
- [Source: lib/hours.ts] — `hoursToSeconds`, `secondsToHoursDisplay`, `secondsToCellDisplay`; no inline `*3600`.
- [Source: lib/storage/outbox.ts] — `enqueue({ kind:'post', endpoint, issueKey, body })`; SW drains.
- [Source: lib/messages.ts] — `sendMessage('badge-update', …)`.
- [Source: components/week/WeeklyGrid.tsx (lines 351-385, 411-423, 429-441)] — day-name header row (trigger surface), `DayCell` body rows (4.3), the `picking`/`TicketPicker` add-subtask flow to extend for day-scoping.
- [Source: components/week/WeekView.tsx (lines 48-70, 117-122)] — `ptoSubtaskKey`/`targetHours` state, `handleMutated`/`onMutated`, `WeeklyGrid` props.
- [Source: lib/week-grid.ts (lines 76-84, 207-236)] — `WeekGrid.days: ISODate[]`/`dayTotalsSeconds`; `DayStatus`/`computeDayStatuses` (`pto` green).
- [Source: components/week/DayCell.tsx] — POST `started = formatStartedISO(grid.days[dayIndex])` pattern for day-scoped logging (reused by `Add a worklog…`).
- [Source: _bmad-output/implementation-artifacts/2-5-catch-all-picker-one-click-pto-action.md] — the no-Radix-popover decision + `lib/pto.ts`/`PtoQuickAction` as-built.
- [Source: _bmad-output/implementation-artifacts/4-3-inline-cell-editing-add-remove-edit-hours.md] — `DayCell`/`RowActions`/`onMutated`/day-dating as-built; multi-worklog default; gate baseline.
- [Source: package.json (lines 25-26)] — only `@radix-ui/react-dialog` + `@radix-ui/react-tabs` installed (no popover dep — confirms the native-popover path).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- `./node_modules/.bin/vitest run` → 50 files / 616 passed / 1 skipped.
- `npm run compile` (`tsc --noEmit`) → 0 errors.
- `./node_modules/.bin/eslint .` → exit 0; 53 pre-existing import/order warnings in untouched files; new/changed files warning-clean.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Built `components/week/PtoPopover.tsx` as a presentational day-header popover + PTO mutation, copying the native inline-popover mechanics (refs, capture-phase Esc, `pointerdown` click-outside, focus-first/restore-trigger, `role="menu"`/`menuitem`) from `PtoQuickAction.tsx`. **No `@radix-ui/react-popover` added** — same reviewed decision as Story 2.5 (documented variance from the spec's literal "Radix Popover").
- PTO posts reuse `lib/pto.ts` `logFullDayPto`/`logHalfDayPto` with `started = formatStartedISO(dayISO)` — the **clicked day's** ISO (`grid.days[dayIndex]`), not today. Success → `sendMessage('badge-update', { hoursMissing: 0 })` + parent `onMutated()` (query invalidation) + close/restore-focus; transient (`network`/`rate-limited`) → outbox `enqueue` post + `Clock` `Pending — will retry` chip; persistent → inline `Couldn’t mark PTO — try again`, buttons re-enabled. Double-submit guarded via `isPending` + a `resolvedRef`. The green-on-PTO coloring is left entirely to 4.2's `computeDayStatuses` + 4.3 carry-through after invalidation (no new coloring path).
- PTO-unconfigured (`ptoSubtaskKey` null/blank) disables both PTO buttons (`disabled` + `aria-disabled="true"`, muted) and shows the `PTO subtask not configured. Configure in Settings.` helper (Settings → `chrome.runtime.openOptionsPage()`), mirroring `PtoQuickAction`. `Add a worklog…` stays enabled.
- **"Add a worklog…" day-scoping (chosen approach — the Dev Notes' simplest conforming default):** the header action sets `picking = { dayIndex }`, opening the existing inline `TicketPicker`. On `onSelect`, the ticket is added as a local row (if new) and the clicked day's `DayCell` editor is opened programmatically via a new additive `registerOpenEditor?` callback on `DayCell` (a `WeeklyGrid` ref-registry keyed by `rowKey-dayIndex`, deferred two `requestAnimationFrame`s so the freshly-mounted cell exists). The user then types hours and the existing **4.3 `DayCell` POST** dates the worklog to `grid.days[dayIndex]` — zero new posting code, keeps the expected "type the hours" step. The plain `+ Add a subtask` affordance (`picking = true`, no day) is unchanged. `registerOpenEditor` is a no-op for multi-worklog cells and unregisters on unmount.
- Scope guard honored: mark-as-done (4.5), `local:weekMarkedDone`/`view-state`, and the flat `fetchCurrentUserWeekWorklogs` are untouched. No manifest/permission/background changes. No new dependencies.

### File List

**New:**
- `components/week/PtoPopover.tsx`
- `components/week/PtoPopover.test.tsx`

**Modified:**
- `components/week/WeeklyGrid.tsx` (day-name headers host the `PtoPopover` trigger; `ptoSubtaskKey`/`targetHours` props; `formatDayLabel`; day-scoped `picking` state + `registerOpenEditor` cell-editor registry)
- `components/week/WeeklyGrid.test.tsx` (+2 tests: popover trigger render/open + 4.2/4.3 surfaces intact; header day-scoped picker)
- `components/week/DayCell.tsx` (additive optional `registerOpenEditor?` prop exposing the editor-open action)
- `components/week/WeekView.tsx` (thread `ptoSubtaskKey || null` + `targetHours` to `WeeklyGrid`)
- `components/week/WeekView.test.tsx` (+1 assertion: props threaded to `WeeklyGrid`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status → in-progress → review)

### Change Log

### Review Findings

Independent code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-06-27. Baseline `770b859`, uncommitted working tree. All 11 ACs COVERED by the Acceptance Auditor (no HIGH/MEDIUM acceptance gaps). 3 patches applied, 2 deferred (pre-existing), 5 dismissed as noise.

Patches applied (working tree):
- [x] [Review][Patch] Focus-on-open targeted a disabled button when PTO unconfigured → keyboard focus dropped to `<body>` [components/week/PtoPopover.tsx]. Fixed: focus falls back to the enabled `Add a worklog…` action when `!ptoSubtaskKey`. Added regression test.
- [x] [Review][Patch] Two day-header popovers could be open at once when a second trigger is activated via keyboard (fires `click` but no `pointerdown`, so the open popover's click-outside never fired) [components/week/PtoPopover.tsx]. Fixed: added a capture-phase `focusout` listener that closes the popover when focus moves outside it — enforces the AC #1 "exactly one open at a time" invariant for keyboard users.
- [x] [Review][Patch] `aria-describedby` on the trigger pointed at the footer `id`, which only exists in the DOM while the popover is open (dangling IDREF when closed) [components/week/PtoPopover.tsx]. Fixed: `aria-describedby` is set only while `open`.

Deferred (pre-existing, not introduced by 4.4):
- [x] [Review][Defer] Day-scoped "Add a worklog…" editor-open relies on a 2×requestAnimationFrame race against the freshly-mounted DayCell's registration effect; a missed lookup is swallowed by `?.()` with no retry [components/week/WeeklyGrid.tsx:339-347] — deferred: this is the Dev-Notes-sanctioned "simplest conforming default"; AC #5's date-correctness is still met via the DayCell POST, and the editor-open is a focus convenience. Worth hardening if intermittent failures are observed.
- [x] [Review][Defer] `TicketPicker` is rendered with no `onCancel`; opening the picker (plain or day-scoped) and never selecting leaves `picking` set with no dismiss UI [components/week/WeeklyGrid.tsx:484-485, components/today/TicketPicker.tsx] — deferred: pre-existing 4.1/4.3 behavior (`TicketPicker` has no cancel prop); the day-scoped `dayIndex` self-heals when `+ Add a subtask` resets `picking = true`.

Dismissed (verified non-issues):
- Outbox transient replay reconstructs the payload by hand "bypassing lib/pto" → divergence: `lib/pto.ts` does only `timeSpentSeconds + started`, identical to the enqueued body; matches PtoQuickAction exactly.
- Transient/error branches re-enable the buttons allowing a manual re-submit: this is the intended retry affordance and mirrors PtoQuickAction; `isPending` + `resolvedRef` guard the involuntary double-post.
- PtoPopover lacks DayCell's `mountedRef` unmount guard: no reachable unmount-during-flight path — the 7 header popovers are structurally stable across refetches (refetch re-renders body rows, not the static `<thead>` triggers).
- Multi-worklog day "Add a worklog…" is a silent no-op: consistent with the read-only multi-cell design ("edit in Today view").
- `role="menu"` contains non-menuitem children (title/footer/helper/error/pending): matches the accepted PtoQuickAction/RowActions convention the spec mandates.

Gates after patches: `npm run test` 50 files / 617 passed / 1 skipped (was 616; +1 new focus-fallback test); `tsc --noEmit` 0 errors; `eslint .` 0 errors (53 pre-existing import/order warnings in untouched files; all changed files warning-clean).

### Change Log

- 2026-06-27: Implemented Story 4.4 (Click Cell/Header → PTO Popover). New `PtoPopover` native day-header popover (full/half-day PTO via `lib/pto.ts` dated to the clicked day, `Add a worklog…` opening the day-scoped picker, `Currently: <Xh> logged` footer, PTO-unconfigured disabled affordance + Settings deep link, outbox-on-transient + pending chip, persistent inline error, Esc/click-outside dismissal + focus return). Wired into `WeeklyGrid` day-name headers; threaded `ptoSubtaskKey`/`targetHours` from `WeekView`. Tests: 50 files / 616 passed / 1 skipped; tsc 0 errors; eslint exit 0. Status → review.
