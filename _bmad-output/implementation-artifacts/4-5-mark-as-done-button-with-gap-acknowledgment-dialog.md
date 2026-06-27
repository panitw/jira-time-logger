---
baseline_commit: 1611679
---

# Story 4.5: Mark-as-Done Button with Gap-Acknowledgment Dialog

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a worker finishing the week,
I want to click "Mark week as done" and have the badge drop to zero, with an honest gap-acknowledgment if I'm leaving days short,
so that I close out the week deliberately.

## Acceptance Criteria

1. **Mark-as-done CTA: primary button, always enabled.** Given the Week grid is rendered (loaded, not skeleton/error/auth-expired) and the **current week is NOT already marked done**, when the bottom CTA renders, then a single primary-tier `Button variant="primary"` labelled **`Mark week as done`** appears centered at the bottom of the grid (the existing `WeeklyGrid.tsx` placeholder at lines 497-501 — currently `disabled` — is wired up). The button is **enabled regardless of grid state** (the gap-check happens on click). It is the only primary button on the Week surface (UX-DR13, UX-DR25, ux-design-specification.md#L964, #L1561). (FR24)

2. **Click → Mon–Fri gap-check; zero gaps marks done immediately (no dialog).** Given the user clicks `Mark week as done`, when the click handler runs, then a pure gap-check evaluates **Mon–Fri only** (indices 0–4; Sat/Sun never evaluated) computing per-day `complete` vs `gap`: a day is **`complete`** if its total `>= targetHours` **OR** it has a PTO worklog that day; a day is a **`gap`** if it is `< target` **and** not marked PTO. If **zero gaps**, the local mark-as-done state is set immediately with **no dialog** (AC #5 write path). If **one or more gaps**, the `GapAcknowledgmentDialog` opens (AC #3). **The gap-check is day-of-week-based, NOT today-aware** — a Monday-only week with empty Tue–Fri counts those as gaps (unlike `computeDayStatuses`, which only reds *past-or-today* days for the grid coloring). (FR25, epics.md#L1161-1165)

3. **GapAcknowledgmentDialog content + copy (exact).** Given the gap-check found ≥1 gap, when the dialog renders, then it uses the shadcn `Dialog` primitive (`components/ui/dialog.tsx`, Radix — focus-trap + Esc + ARIA modal inherited) and shows: a `DialogTitle`; the exact body sentence **`<N> day(s) are below target and not marked as PTO. Submit anyway?`** (use `day` for N=1, `days` for N>1; UX-DR30 — informational, not preachy); and a semantic `<ul>` listing each gap day as an `<li>` with the long weekday name + a short factual summary, e.g. **`Thursday: 4h logged / 8h target, not marked PTO`** (screen-reader friendly, UX-DR32). The two footer buttons are **`Cancel`** (`variant="secondary"`, left) and **`Submit anyway`** (`variant="primary"`, right); **default focus is on `Submit anyway`** (the worker has already seen the gaps on the grid — this confirms intent). (UX-DR13, UX-DR29, UX-DR30, UX-DR32, ux-design-specification.md#L1485-1496, #L201, epics.md#L1167-1171)

4. **Cancel / Esc / backdrop closes with no state change.** Given the dialog is open, when the user clicks `Cancel`, presses **Esc**, or clicks the `✕` close affordance, then the dialog closes and **no state changes** — the worker returns to the grid to fill gaps. Backdrop-click on this **destructive/confirmation** dialog should NOT silently mark done; treat it as cancel (it closes without writing) — never as "Submit anyway" (UX-DR-overlay rules, ux-design-specification.md#L1667, #L1673-1678). (epics.md#L1173-1175)

5. **Submit / no-gap path writes the local-only flag (`{ weekOf, markedDoneAt }`).** Given either zero gaps (AC #2) or the user clicks `Submit anyway` (AC #3), when the mark-done action runs, then the local mark-as-done state is written to `chrome.storage.local` via **`lib/storage/view-state.ts`** as **`{ weekOf: <this view's weekOf ISODate>, markedDoneAt: <new Date().toISOString()> }`** under the existing storage key **`local:weekMarkedDone`** (see Dev Notes → "Flag shape & home — the reconciliation"). The dialog (if open) closes. This is **local-only** — never posted to Jira, never sent to a manager (FR24, FR26, epics.md#L1177-1179, #L51-53).

6. **Marked-done visual state: grayed grid + "Week done · Undo" chip + badge → 0.** Given the current week is marked done, when the Week view renders, then: (a) the grid receives a **faint grayed/banded overlay** indicating done (UX-DR13, ux-design-specification.md#L1441 "week grayed out"); (b) a **`Week done`** status chip appears at the top of the Week view (near the heading) with an **`Undo`** tertiary affordance (a real `<button>`, `text-neutral-500` ghost tier, accessible label); (c) the `Mark week as done` button is **replaced/hidden** (no second mark-done while already done) — do not show an enabled mark-done button for an already-done week; (d) the **toolbar badge clears** — fire `void sendMessage('badge-update', { hoursMissing: 0 })` so the SW `updateBadge()` recomputes and skips this week (Story 3.1 `badge.ts` already short-circuits via `isCurrentWeekMarkedDone()` once it reads the new shape). (FR24, epics.md#L1181-1183, ux-design-specification.md#L69, #L196)

7. **Undo clears the flag, restores the grid, re-renders the badge.** Given the week is marked done, when the user clicks `Undo` on the `Week done` chip, then the local mark-as-done flag is cleared (write `null` to `local:weekMarkedDone` via view-state), the grid returns to its normal (non-grayed) state, the `Mark week as done` button reappears (AC #1), and the badge re-renders to the **live deficit** — fire `void sendMessage('badge-update', { hoursMissing: 0 })` so `updateBadge()` recomputes the real number. (epics.md#L1190-1192)

8. **Edits after mark-done do NOT auto-invalidate the flag.** Given the week is marked done, when the worker posts or edits a worklog in this week (from Today, Week inline cells, the PTO popover, or the banner), then the mark-as-done flag **remains in place** (FR26 — mark-as-done is local-only and does not auto-dirty from edits; the only way to clear it is explicit `Undo`). The new entries still appear in the Week grid (the query invalidates and re-derives as usual). **Do NOT add any edit-triggered un-mark logic.** (epics.md#L1185-1188)

9. **Mark-as-done is invisible to the manager / read paths.** Given any manager-side or remote read of worklog data (Epic 5), when it runs, then the mark-as-done state is **NOT** visible — it lives only in the worker's local `chrome.storage.local`. This story writes nothing to Jira and adds no field to any fetched/posted worklog. (FR26, epics.md#L1194-1197)

10. **Badge `isCurrentWeekMarkedDone` becomes week-aware (completes the 3.1/3.2/3.3 defensive reads).** Given `lib/badge.ts` currently reads `local:weekMarkedDone` as a bare `boolean` (defensive forward-compat stub, badge.ts#L57-75), when this story lands, then the flag's authoritative definition + shape moves to `lib/storage/view-state.ts` as `{ weekOf, markedDoneAt } | null`, and `badge.ts` `isCurrentWeekMarkedDone()` is refactored to return `true` **only when** the stored `state.weekOf` equals the **current** week's Monday (so a *stale* mark-done from a previous week never suppresses *this* week's badge). `getWeekDeficit()`/`updateBadge()` (the `cleared`/`marked-done` branch) keep working unchanged. The Story 3.3 banner (`getWeekHoursMissing` → SW `banner-state`) and Story 3.2 notification, which already gate on the same `isCurrentWeekMarkedDone()`, are automatically correct once it reads the real shape — no banner/notification code changes. (FR24, badge.ts#L57-75, #L101-139)

11. **No regression to 4.1–4.4 surfaces.** Given the CTA + dialog + chip are added, when the existing Week surfaces are used, then the 4.1 grid/rows/add-subtask, 4.2 totals coloring + `computeDayStatuses` (unchanged — the new gap-check is a *separate* pure function), 4.3 inline `DayCell` POST/PUT/DELETE + carry-through tint + `RowActions`, and 4.4 day-header `PtoPopover` all behave as before. The popup view-router (`App.tsx`) and `PopupView` (today/week) are unchanged. `fetchCurrentUserWeekWorklogs` (badge 3.1 / banner 3.3) is unchanged. (Scope guard)

12. **Tests + gates pass.** Given new/changed logic, when `npm run test` runs, then co-located Vitest tests cover: the **pure gap-check** (Mon–Fri only; complete via `>=target` OR PTO; gap via `<target` and no PTO; weekend never a gap; gap-day summary strings); the dialog opens only with ≥1 gap and the no-gap path marks done with no dialog; exact body copy + `<li>` list + default focus on `Submit anyway`; Cancel/Esc closes with no write; `Submit anyway` / no-gap writes `{ weekOf, markedDoneAt }` to `local:weekMarkedDone` + fires `badge-update`; marked-done renders grayed grid + `Week done · Undo` chip + hides the mark-done button; `Undo` clears the flag + fires `badge-update`; **`badge.ts` `isCurrentWeekMarkedDone()` is `true` only for the current `weekOf`, `false` for a stale `weekOf` or `null`** (update `lib/badge.test.ts`). `npm run compile` (`tsc --noEmit`) 0 errors and `./node_modules/.bin/eslint .` exits 0 on new/changed files (pre-existing import/order warnings tolerated). (AR-test, NFR12/13)

## Tasks / Subtasks

- [x] **Task 1 — Move the mark-done flag into `lib/storage/view-state.ts` as the authoritative `{ weekOf, markedDoneAt }` item (AC: #5, #7, #9, #10)**
  - [x] In `lib/storage/view-state.ts`, add `export type MarkDoneState = { weekOf: ISODate; markedDoneAt: string };` and `const weekMarkedDoneItem = storage.defineItem<MarkDoneState | null>('local:weekMarkedDone', { fallback: null });` — reused the existing key `local:weekMarkedDone` (no migration).
  - [x] Export `getMarkDoneState()`, `setWeekMarkedDone(weekOf)` (writes `{ weekOf, markedDoneAt: new Date().toISOString() }`), and `clearWeekMarkedDone()` (writes `null`). `PopupView`/`getPopupView`/`setPopupView` unchanged.
  - [x] **Shared week-of helper:** extracted `getCurrentWeekMonday()` from `App.tsx` to `lib/week-of.ts` (`currentWeekMonday(reference?: Date): ISODate`, same local-midnight Monday math). `App.tsx` and `badge.ts` import it. Co-located `lib/week-of.test.ts` (7 tests).

- [x] **Task 2 — Refactor `lib/badge.ts` `isCurrentWeekMarkedDone()` to be week-aware (AC: #10)**
  - [x] Deleted the local `weekMarkedDoneItem` boolean stub, imported `getMarkDoneState` + `currentWeekMonday`. `isCurrentWeekMarkedDone()` now `return s != null && s.weekOf === currentWeekMonday()` in try/catch.
  - [x] `getWeekDeficit()`/`updateBadge()` otherwise untouched. Updated `lib/badge.test.ts`: matching-`weekOf` → cleared/`marked-done`; stale `weekOf` → live deficit; `null` → live deficit (badge + getWeekHoursMissing both).

- [x] **Task 3 — Build `lib/week-gaps.ts` pure gap-check (AC: #2, #3, #12)**
  - [x] New `lib/week-gaps.ts`: `WeekGap` type + `computeWeekGaps(grid, { targetHours })` iterating indices 0–4 only; gap when NOT (`dayTotalsSeconds[i] >= hoursToSeconds(targetHours)` OR PTO-category row with `cellsSeconds[i] > 0`). Pure — no clock read, no `today`. Uses `hoursToSeconds`/`secondsToHours`.
  - [x] `gapSummary(gap)` producing `<Weekday>: <X>h logged / <T>h target, not marked PTO` (one-decimal, trailing `.0` stripped so `4h`/`4.5h`/`0h`).
  - [x] Co-located `lib/week-gaps.test.ts` (10 tests): Mon–Fri only; `>=target` not a gap; PTO day not a gap; `<target`+no-PTO gap; weekend never a gap; empty week flags all 5 weekdays (NOT today-aware); summary format.

- [x] **Task 4 — Build `components/week/GapAcknowledgmentDialog.tsx` on the shadcn Dialog (AC: #3, #4, #12)**
  - [x] New `components/week/GapAcknowledgmentDialog.tsx`. Props `{ open, gaps, onCancel, onConfirm }`. Composes `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` + body sentence + semantic `<ul>`/`<li>` gap summaries + `DialogFooter` (`Cancel` secondary left / `Submit anyway` primary right). `onOpenChange(false)` (Esc/✕/backdrop) → `onCancel` only.
  - [x] Default focus on `Submit anyway` via ref + `onOpenAutoFocus` preventDefault + focus, plus a mount effect.
  - [x] Body copy: grammar micro-fix applied — `${n} ${n===1?'day':'days'} ${n===1?'is':'are'} below target and not marked as PTO. Submit anyway?` → `1 day is …` / `2 days are …`. No exclamation marks. (See Completion Notes.)
  - [x] Co-located `components/week/GapAcknowledgmentDialog.test.tsx` (8 tests): singular + plural body, one `<li>` per gap, default focus on `Submit anyway`, Cancel/Esc → `onCancel` (no `onConfirm`), `Submit anyway` → `onConfirm`, closed renders no dialog.

- [x] **Task 5 — Build `components/week/MarkAsDoneButton.tsx` + wire into `WeeklyGrid.tsx` (AC: #1, #2, #5, #6, #11)**
  - [x] New `components/week/MarkAsDoneButton.tsx`. Props `{ grid, weekOf, targetHours, onMarkedDone }`. Always-enabled primary `Button`; on click `computeWeekGaps` → empty: `setWeekMarkedDone(weekOf)` + `sendMessage('badge-update', { hoursMissing: 0 })` + `onMarkedDone()`; else open dialog. `Submit anyway`: same write + close. `Cancel`: close only.
  - [x] Replaced the disabled placeholder in `WeeklyGrid.tsx` with `<MarkAsDoneButton …/>`. `WeeklyGrid` gained `weekOf`, `isMarkedDone`, `onMarkedDone` props; button hidden entirely when `isMarkedDone`.
  - [x] `MarkAsDoneButton.test.tsx` (5 tests) + updated `WeeklyGrid.test.tsx` (enabled CTA; hidden when marked done). All existing WeeklyGrid tests green.

- [x] **Task 6 — `WeekView.tsx`: read the flag, render grayed state + `Week done · Undo` chip, thread props (AC: #5, #6, #7, #8, #11)**
  - [x] `WeekView` reads `getMarkDoneState()` on mount into `isMarkedDone = state?.weekOf === weekOf` (local `useState` + `useEffect`, refreshed by mark/undo callbacks).
  - [x] When marked done: `Week done · Undo` chip near the heading (`Undo` real `<button>`, `aria-label="Undo mark week as done"`) + faint grayed tint wrapper (`bg-neutral-100/60 opacity-60`, NOT `pointer-events-none` so edits stay possible per AC #8). `Undo` → `clearWeekMarkedDone()` + `sendMessage('badge-update', …)` + flip false.
  - [x] When not marked done: threads `weekOf`/`targetHours`/`onMarkedDone` to `WeeklyGrid`; button shows.
  - [x] No edit-triggered un-marking — `handleMutated` stays invalidation-only. `WeekView.test.tsx` (7 new tests): not-marked button; marked chip+grayed+no-button; stale weekOf not done; Undo clears+badge-update; onMarkedDone flips; threads weekOf.

- [x] **Task 7 — Tests + gates (AC: #12)**
  - [x] `npm run test` (Vitest) green: 54 files / 662 passed / 1 skipped (baseline 50/617/1; +4 files, +45 tests).
  - [x] `npm run compile` (`tsc --noEmit`) 0 errors; `./node_modules/.bin/eslint .` exits 0 (53 pre-existing import/order warnings, unchanged; new/changed files warning-clean).

## Dev Notes

### What this story IS (scope guardrails)

Wire up the **last** Epic-4 piece: the `Mark week as done` primary CTA (the placeholder button already sits disabled at `WeeklyGrid.tsx` lines 497-501), an honest `GapAcknowledgmentDialog` (the canonical use of the real shadcn **Radix Dialog** — focus-trap + Esc + modal), and the local-only `{ weekOf, markedDoneAt }` flag that earlier stories (3.1 badge, 3.2 notification, 3.3 banner) have been reading defensively via `badge.ts`'s `isCurrentWeekMarkedDone()`. Clicking with zero Mon–Fri gaps marks done silently; with gaps, the dialog forces an explicit `Submit anyway`. Marking done grays the week, shows a `Week done · Undo` chip, and drops the badge to 0. `Undo` reverses it. **Reuse — do not reinvent:** the shadcn `Dialog` (`components/ui/dialog.tsx`), the `Button` (`components/ui/button.tsx`), the `badge-update` broadcast, the `WeekGrid`/PTO-row model + `computeDayStatuses` PTO logic, and the week-of Monday math. **Explicitly out of scope:** any Jira write, any manager-visible field, any edit-triggered auto-un-mark (FR26 forbids it), and any change to `fetchCurrentUserWeekWorklogs`/`buildWeekGrid`/`computeDayStatuses`/4.2-4.4 behavior.

### ⚠️ Flag shape & home — the reconciliation (READ THIS FIRST)

The epic AC (epics.md#L1179) specifies the flag is written via **`lib/storage/view-state.ts`** as **`{ weekOf: <ISO>, markedDoneAt: <ISO timestamp> }`**. But `lib/badge.ts` (Story 3.1, lines 64-75) already defines a **temporary boolean stub**:

```ts
const weekMarkedDoneItem = storage.defineItem<boolean>('local:weekMarkedDone', { fallback: false });
export async function isCurrentWeekMarkedDone(): Promise<boolean> { … === true … }
```

with a comment explicitly stating *"Story 4.5 owns the UI + the authoritative write of this flag… We only READ it here, defensively."* This story is that moment.

**Decision (locked):**
- The **authoritative item moves to `lib/storage/view-state.ts`**, keeping the **same storage key `local:weekMarkedDone`**, but with the richer shape **`{ weekOf: ISODate; markedDoneAt: string } | null`** (fallback `null`). No migration script needed — the old stub's value was `false`/absent and is simply overwritten by `null`/the new object; nothing in production has written a real value yet.
- `badge.ts` **deletes its stub** and re-implements `isCurrentWeekMarkedDone()` to read the new item and return `true` **only when `state.weekOf === currentWeekMonday()`**. This is a behavior *upgrade*: a stale mark-done from last week no longer suppresses this week's badge (the old boolean had no week scoping at all). This is the correct semantics and what 3.1/3.2/3.3 always intended ("current week marked done").
- This automatically completes the **defensive reads** in: Story 3.1 badge (`getWeekDeficit` → `cleared/marked-done`), Story 3.2 notification (gates on the same helper), and Story 3.3 banner (`getWeekHoursMissing` → SW `banner-state`). **No changes needed in 3.2/3.3 code** — they all funnel through `isCurrentWeekMarkedDone()`.

### Re-edit-after-done semantics (FR26 — locked default)

**Marking done does NOT auto-invalidate on subsequent edits.** Per FR26 and AC #8: mark-as-done is a *local-only ritual*; posting/editing a worklog in a done week leaves the flag in place — the week stays "done" until the worker explicitly clicks `Undo`. **Do not implement any dirty/auto-unmark logic** (that concept belongs to Epic 5's *manager* approval dirtiness, which is a separate Jira-comment mechanism — not this local flag). The grid still re-derives new entries via the existing `handleMutated` invalidation; only the *visual done overlay + badge suppression* persist.

### Gap-check is day-of-week-based, NOT today-aware (the subtle correctness point)

`computeDayStatuses` (4.2) only reds a Mon–Fri day if it is **past-or-today** (`iso <= today`) — so a fresh Monday shows Tue–Fri as `neutral`, not red, on the grid. **The mark-done gap-check is different:** it evaluates **all** Mon–Fri (epics.md#L1163 "across Mon–Fri (weekend not evaluated)"), independent of today. Marking a week done *is* an end-of-week act, so an empty future workday legitimately counts as a gap to acknowledge. **Build a separate pure `computeWeekGaps` in `lib/week-gaps.ts`** — do NOT overload `computeDayStatuses` or pass it a fake `today` (that would corrupt the grid coloring). Reuse only its PTO-day detection idea (pto-category row with `cellsSeconds[i] > 0`).

### Dialog — use the REAL shadcn Radix Dialog (this is its canonical use)

Unlike the lightweight *native* popovers (`PtoQuickAction`/`PtoPopover`/`RowActions` — built native to avoid `@radix-ui/react-popover`, which is **not** installed), `@radix-ui/react-dialog` **IS** installed and `components/ui/dialog.tsx` already exists and is exported (`Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, etc.). A destructive/gap confirmation that demands full attention is exactly what the UX spec mandates a modal `Dialog` for (ux-design-specification.md#L1667 "Confirmations that need full attention: gap acknowledgment…"). **Use the shadcn `Dialog` — do NOT build a native modal and do NOT add a new dialog dependency.** Radix handles focus-trap, Esc-to-close, and ARIA modal semantics; you only need to set the **default focus to `Submit anyway`** and render the `<ul>` gap list.

- `DialogContent` already renders the overlay (backdrop dims), a `✕` close button (calls Radix `Close` → triggers `onOpenChange(false)`), and the centered card. Map `onOpenChange(false)` → `onCancel` (AC #4).
- The `<ul>`/`<li>` list must be **semantic** (UX-DR32) so screen readers announce the count + items — do not use styled `<div>`s.

### Reuse map (do NOT reinvent)

- **Dialog primitive:** `components/ui/dialog.tsx` (Radix). Compose, don't rebuild. `DialogTitle` is required for a11y (Radix warns without it).
- **Button:** `components/ui/button.tsx` — `variant="primary"` = brand-purple (`accent.DEFAULT` `#6b5b95`) for `Mark week as done` + `Submit anyway`; `variant="secondary"` for `Cancel`; a ghost/tertiary `text-neutral-500` `<button>` for `Undo`.
- **Badge broadcast:** `void sendMessage('badge-update', { hoursMissing: 0 })` from `lib/messages.ts` after mark/undo — the SW (`entrypoints/background.ts` line 174, `onMessage('badge-update', () => updateBadge())`) recomputes authoritatively; the payload is a placeholder (every other surface uses `{ hoursMissing: 0 }` the same way — DayCell, PtoPopover, QuickLogForm, etc.).
- **Week model + PTO detection:** `lib/week-grid.ts` — `WeekGrid` (`days`, `rows[].category`, `cellsSeconds`, `dayTotalsSeconds`), `computeDayStatuses` (copy its `pto`-day detection; index 0 = Monday … 6 = Sunday). `hoursToSeconds`/`secondsToCellDisplay`/`secondsToHoursDisplay` from `lib/hours.ts` — **never inline `*3600`/`/3600`**.
- **Week-of Monday math:** extract `getCurrentWeekMonday()` from `App.tsx` (lines 140-152) into `lib/week-of.ts`; reuse for both `App.tsx` and `badge.ts`. Must agree with `currentCycleRange('weekly')` + `buildWeekGrid`'s `weekOf` (local-midnight Monday, never `toISOString()`).
- **Storage layer:** `lib/storage/view-state.ts` (`storage.defineItem`, WXT). Keep `PopupView`/`getPopupView`/`setPopupView`; add the mark-done item + getters/setters alongside.
- **Day names:** `STRINGS.dayNamesLong` already in `WeeklyGrid.tsx` (lines 24-40-ish: `Monday`…`Sunday`) — reuse for gap `<li>` labels (don't redefine).

### Architecture & convention guardrails (AR/UX-DR)

- **Storage at the I/O boundary** goes through `lib/storage/*` (WXT `storage.defineItem`) — one item per data class. Mark-done lives in `view-state.ts` (architecture.md FR20-26 mapping: *"lib/storage/view-state.ts (mark-as-done flag)"*).
- **ESLint (AR4):** kebab-case files (`week-gaps.ts`, `week-of.ts`), PascalCase components (`MarkAsDoneButton.tsx`, `GapAcknowledgmentDialog.tsx`), **named exports only**, no `any`, no `console.log` outside tests (use `lib/log.ts`), **no inline `*3600`/`/3600`**, import order.
- **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`): every `array[i]` is `T | undefined` — narrow (`grid.days[i] ?? ''`); spread optional props (`...(onMutated ? { onMutated } : {})`) exactly as `WeeklyGrid`/`WeekView` already do.
- **Semantic HTML + a11y (UX-DR32, NFR12/13):** the CTA, `Undo`, and dialog buttons are real `<button>`/shadcn `Button`s; the gap list is a real `<ul>`/`<li>`; `aria-label` on the icon-free-but-terse `Undo`; the dialog's modal/focus semantics come from Radix. Min tap target 32×32px in the 360px popup.
- **Motion (UX-DR33):** the shadcn Dialog already animates open at 150ms ease-out (`data-[state=open]:animate-in`); under `prefers-reduced-motion` Tailwind's `animate-*` should be gated — the existing `dialog.tsx` uses unconditional `animate-in`; if a reduced-motion reviewer flags it, gate with `motion-safe:` (note: out-of-scope to refactor the shared primitive unless trivial — document if deferred). The optional Mark-as-Done "relief" flourish (ux-design-specification.md#L196) is **nice-to-have, not required** — skip it for v1 or keep it `motion-safe:`-gated and ≤200ms.
- **Honest copy (UX-DR30):** no exclamation marks, factual. Exact strings: button `Mark week as done`; dialog body `<N> day(s) … not marked as PTO. Submit anyway?`; buttons `Cancel` / `Submit anyway`; chip `Week done`; `Undo`; gap `<li>` `<Weekday>: <Xh> logged / <T>h target, not marked PTO`.
- **Color tokens** are hyphenated Tailwind utilities in `styles/globals.css` `@theme`: `accent` (brand purple, primary Button), `bg-state-*` families. Do NOT use `state-warning`/amber (Epic 5). The grayed overlay = a neutral tint (`bg-neutral-*`/`opacity-*`), no new token required.

### Previous-story intelligence

- **Story 3.1 (badge.ts):** owns `getWeekDeficit`/`updateBadge`/`isCurrentWeekMarkedDone`. The `marked-done` branch (`WeeklyGrid`→`{ kind: 'cleared', reason: 'marked-done' }`) already clears the badge; you only swap the *read* (boolean → `{ weekOf }`-aware). The badge recomputes on the `badge-update` message (background.ts#L174) — same broadcast every Week mutation already uses.
- **Story 3.2/3.3 (notification + banner):** both gate on `isCurrentWeekMarkedDone()` (banner via `getWeekHoursMissing` → `getWeekDeficit`). Once the helper reads the real shape, they're correct with **zero** code changes — verify by reading the call sites, do not edit them.
- **Story 4.1 (shell):** `buildWeekGrid`, `WeekGrid.days` local-Monday ISO, `WeekView`/`WeeklyGrid` plumbing, `useWeekWorklogs(['week-worklogs', weekOf])`.
- **Story 4.2 (color):** `computeDayStatuses` → `DayStatus` (`complete`/`below-target`/`pto`/`neutral`), PTO-day detection (pto-category row, `cellsSeconds[i] > 0`). **Reuse the PTO idea in `computeWeekGaps`; do not modify `computeDayStatuses`.**
- **Story 4.3 (editable cells):** `DayCell` POST/PUT/DELETE, `WeekView.handleMutated` invalidation, `sendMessage('badge-update')` on success. Edits in a done week still invalidate/re-derive — they must NOT clear the done flag (AC #8).
- **Story 4.4 (PTO popover):** day-header `PtoPopover` (native, no Radix); confirms `@radix-ui/react-popover` is NOT installed — but `@radix-ui/react-dialog` IS, so **this** story uses the real Dialog. The disabled `Mark week as done` placeholder (lines 497-501) was added/preserved by 4.1-4.4 specifically for this story.
- Gate baseline after 4.4: `npm run test` 50 files / 617 passed / 1 skipped; `tsc --noEmit` 0 errors; `eslint .` exit 0 (53 pre-existing import/order warnings in untouched files; changed files warning-clean).

### Project Structure Notes

- **New:** `lib/week-gaps.ts` (+ `.test.ts`); `lib/week-of.ts` (+ `.test.ts`); `components/week/MarkAsDoneButton.tsx` (+ `.test.tsx`); `components/week/GapAcknowledgmentDialog.tsx` (+ `.test.tsx`). All match the architecture's listed `components/week/MarkAsDoneButton.tsx` + `GapAcknowledgmentDialog.tsx`.
- **Modified:** `lib/storage/view-state.ts` (add `MarkDoneState` item + getters/setters); `lib/badge.ts` (week-aware `isCurrentWeekMarkedDone`) + `lib/badge.test.ts`; `components/week/WeeklyGrid.tsx` (replace placeholder with `MarkAsDoneButton`, thread `weekOf`/`onMarkedDone`) + `WeeklyGrid.test.tsx`; `components/week/WeekView.tsx` (read flag, grayed state + `Week done · Undo` chip, thread props) + `WeekView.test.tsx`; `entrypoints/popup/App.tsx` (import shared `currentWeekMonday`).
- **Unchanged:** `lib/week-grid.ts` (`buildWeekGrid`/`computeDayStatuses` — read-only reuse), `lib/messages.ts` (`badge-update` already registered — NO new message kind needed), `lib/jira-client.ts`/`fetchCurrentUserWeekWorklogs`, `entrypoints/background.ts` (the `badge-update` handler already recomputes), 3.2 notification + 3.3 banner code, `components/ui/dialog.tsx`/`button.tsx` (compose, don't edit).
- **No new dependencies** (`@radix-ui/react-dialog` already installed). No manifest/permission/background changes.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5 (lines 1148-1197)] — full ACs: enabled primary CTA; Mon–Fri gap-check (complete = ≥target OR PTO; gap = <target & no PTO); zero gaps → mark immediately; ≥1 gap → `GapAcknowledgmentDialog` (`<ul>`/`<li>`, exact "X day(s)…Submit anyway?" copy, Cancel left / Submit-anyway right + default focus); Cancel/Esc no-op; Submit writes `{ weekOf, markedDoneAt }` via `view-state.ts`; grayed grid + `Week done · Undo` chip + badge→0; edits don't auto-unmark (FR26); Undo clears + badge re-renders; invisible to manager.
- [Source: _bmad-output/planning-artifacts/epics.md (lines 51-53, 301-304)] — Epic 4 framing; mark-as-done local-only ritual; UX-DR11/12/13.
- [Source: _bmad-output/planning-artifacts/epics.md (lines 182, 204, 209, 213)] — UX-DR13 (MarkAsDoneButton + GapAcknowledgmentDialog, shadcn `Dialog`, `<ul>` gap days, default focus Submit-anyway, "X days are below target and not marked as PTO. Submit anyway?", never preachy); UX-DR25 (button hierarchy/primary=brand-purple); UX-DR30 (honest copy, no `!`); UX-DR32 (semantic HTML/`<ul>`/aria/32px tap target).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 1485-1496)] — `GapAcknowledgmentDialog` spec: file `components/week/GapAcknowledgmentDialog.tsx`; shadcn `Dialog` primitive; states Open(focus Submit-anyway)/Submitting/Closed; Radix focus-trap+Esc+ARIA; gap list semantic `<ul>`; Cancel closes, Submit-anyway sets local flag + badge→0.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 1436-1445, 1507, 1541)] — `WeeklyGrid` Marked-done state ("week grayed out; 'Week done · Undo' affordance"); `MarkAsDoneButton.tsx` primary CTA bottom of grid; Phase-2 component set.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 201, 1294-1295, 964, 1561-1562, 1667, 1673-1678)] — copy examples; grid CTA brand-purple; primary/secondary button tiers (Mark-as-Done/Submit-anyway primary, Cancel secondary); modal Dialog "needs full attention" + destructive overlays require explicit cancel.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md (lines 69, 196)] — Friday "badge drops to zero" relief; optional Mark-as-Done flourish (nice-to-have).
- [Source: _bmad-output/planning-artifacts/architecture.md (lines 639-646, 837)] — `components/week/MarkAsDoneButton.tsx` (FR24, FR26) + `GapAcknowledgmentDialog.tsx` (FR25); FR20-26 → `lib/storage/view-state.ts (mark-as-done flag)`.
- [Source: _bmad-output/planning-artifacts/architecture.md (lines 180-182, 305-313, 624-631, 707-718)] — WXT `storage.defineItem('local:key')`; `PopupView`/view-state; shadcn `components/ui/dialog.tsx`; `lib/storage/*` one-file-per-data-class.
- [Source: lib/badge.ts (lines 56-75, 88-139)] — the boolean `weekMarkedDoneItem` stub + `isCurrentWeekMarkedDone` to refactor; `WeekDeficit` `cleared/marked-done` branch; `getWeekDeficit`/`updateBadge` gating order (disconnected → marked-done → fetch).
- [Source: lib/storage/view-state.ts] — current `PopupView` + `getPopupView`/`setPopupView`; add `MarkDoneState` item here.
- [Source: lib/week-grid.ts (lines 76-117, 199-258)] — `WeekGrid` shape, `WeekGridCategory` (`pto`), `computeDayStatuses` PTO detection (reuse), index 0 = Monday.
- [Source: lib/messages.ts (lines 36-64, 70-85)] — `badge-update` already registered (`BadgeUpdateSchema`); `sendMessage` fire-and-forget. NO new kind needed.
- [Source: entrypoints/background.ts (line 174)] — `onMessage('badge-update', () => updateBadge())` recomputes authoritatively.
- [Source: components/week/WeeklyGrid.tsx (lines 35-36, 497-501)] — `STRINGS.markWeekDone` + the disabled placeholder `Button` to wire up; `STRINGS.dayNamesLong` for gap labels.
- [Source: components/week/WeekView.tsx (lines 42-128)] — `weekOf`/`targetHours`/`grid`/`dayStatuses`/`handleMutated` plumbing to extend.
- [Source: components/ui/dialog.tsx] — exported shadcn Radix Dialog parts (compose, don't edit).
- [Source: entrypoints/popup/App.tsx (lines 140-152)] — `getCurrentWeekMonday()` to extract into `lib/week-of.ts`.
- [Source: _bmad-output/implementation-artifacts/4-4-click-cell-header-pto-popover.md] — no-Radix-popover decision (Dialog is the *exception* — it IS installed); `badge-update` pattern; scope-guard that 4.4 left `local:weekMarkedDone`/mark-as-done untouched for 4.5.
- [Source: _bmad-output/implementation-artifacts/3-1-toolbar-badge-counter.md] — badge deficit + `isCurrentWeekMarkedDone` defensive read this story makes real.

## Review Findings

_Code review (adversarial 3-layer: Blind Hunter / Edge Case Hunter / Acceptance Auditor), 2026-06-27. All 12 ACs verified MET by the Acceptance Auditor; reshape/no-migration claim holds; gap-check Mon–Fri-only and not today-aware confirmed; FR26 no-auto-unmark + no pointer-events-none confirmed; week-aware `isCurrentWeekMarkedDone()` confirmed._

- [x] [Review][Patch] Defensive boolean coercion in `getMarkDoneState()` [lib/storage/view-state.ts:35] — the key previously held a bare `boolean` stub; WXT's `null` fallback only applies to an absent key, so a stale boolean could survive the reshape. Coerce any non-`MarkDoneState` value to `null`. APPLIED.
- [x] [Review][Patch] `handleUndo` had no `.catch` — undo storage-write rejection left the week stuck "done" with an unhandled rejection [components/week/WeekView.tsx:89] — added `.catch` that logs `week.undo.failed`. APPLIED.
- [x] [Review][Defer] `targetHours === 0` bypasses the gap dialog [lib/week-gaps.ts] — deferred: pre-existing config concern (default is 8, options UI validates); a 0-target day legitimately meets a 0 target and the badge uses the same target. Out of scope.
- [x] [Review][Defer] `markDone()` write-failure closes the dialog with no user feedback [components/week/MarkAsDoneButton.tsx:56] — deferred: `chrome.storage.local` writes do not fail in practice and every other surface treats storage as reliable; error UI for a local-only flag is scope creep.
- Dismissed as noise (6): WeekView view-relative vs badge today-relative "done" (by design, AC #6/#7); double-click double-write (idempotent); frozen gap list if grid edited while dialog open (honesty already on grid); redundant `useEffect`+`onOpenAutoFocus` focus (harmless); undo async setState unmount guard (popup teardown, low impact, and now behind `.catch`); dialog title string "Submit week with gaps?" (spec grants latitude — only the body sentence is exact-copy).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story)

### Debug Log References

- Full suite after implementation: 54 files / 662 passed / 1 skipped.
- `tsc --noEmit`: 0 errors. `eslint .`: exit 0, 53 pre-existing import/order warnings (unchanged).

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Flag reshape (locked decision implemented):** Authoritative `local:weekMarkedDone` item moved to `lib/storage/view-state.ts` as `{ weekOf: ISODate; markedDoneAt: string } | null` (fallback `null`). `badge.ts` deleted its boolean stub and now reads via `getMarkDoneState()`. No migration — the old `false`/absent value resolves to `null`.
- **`isCurrentWeekMarkedDone()` is now WEEK-AWARE:** returns true only when `state.weekOf === currentWeekMonday()`. A stale mark-done from a previous week no longer suppresses the current week's badge/notification/banner. Verified Story 3.2 notification and 3.3 banner gate through this same helper with ZERO code changes (their tests were updated to the new `{ weekOf }` shape and pass).
- **Shared week-of helper:** `getCurrentWeekMonday()` extracted from `App.tsx` (two call sites) into `lib/week-of.ts` as `currentWeekMonday(reference?)`; reused by `App.tsx` and `badge.ts`. Same local-midnight Monday math (never `toISOString()`).
- **Gap-check is day-of-week-based, NOT today-aware:** `computeWeekGaps` is a SEPARATE pure function in `lib/week-gaps.ts` evaluating all Mon–Fri (indices 0–4) regardless of `today`. `computeDayStatuses` (4.2) was left completely unchanged.
- **Grammar micro-fix (UX-DR30):** the epic's literal `"<N> day(s) are below target…"` is ungrammatical for N=1. Implemented `${n === 1 ? 'is' : 'are'}` + `day`/`days` → renders `1 day is below target and not marked as PTO. Submit anyway?` / `2 days are below target…`. No exclamation marks.
- **Dialog uses the real shadcn Radix `Dialog`** (`components/ui/dialog.tsx`) — focus-trap, Esc, ARIA modal inherited. Default focus steered to `Submit anyway` (ref + `onOpenAutoFocus` preventDefault). Esc/✕/backdrop all route through `onOpenChange(false)` → `onCancel` (never `onConfirm`, AC #4). No new dependency added.
- **Re-edit-after-done (FR26):** NO auto-unmark logic added; `handleMutated` stays invalidation-only. The grayed wrapper deliberately does NOT use `pointer-events-none` so cells remain editable while done; only explicit `Undo` clears the flag.
- **`WeeklyGrid.weekOf` made optional (`= ''`)** so the many existing WeeklyGrid tests (which don't exercise mark-done) compile without churn; `WeekView` always passes the real `weekOf`.
- No new npm dependencies installed.

### File List

**New:**
- `lib/week-of.ts`
- `lib/week-of.test.ts`
- `lib/week-gaps.ts`
- `lib/week-gaps.test.ts`
- `components/week/GapAcknowledgmentDialog.tsx`
- `components/week/GapAcknowledgmentDialog.test.tsx`
- `components/week/MarkAsDoneButton.tsx`
- `components/week/MarkAsDoneButton.test.tsx`

**Modified:**
- `lib/storage/view-state.ts` (MarkDoneState item + get/set/clear)
- `lib/storage/view-state.test.ts` (mark-done flag tests)
- `lib/badge.ts` (week-aware `isCurrentWeekMarkedDone`)
- `lib/badge.test.ts` (`{ weekOf }`-shape + stale/null tests)
- `lib/notification.test.ts` (3.2 marked-done tests updated to new shape + stale-week test)
- `components/week/WeeklyGrid.tsx` (wired MarkAsDoneButton; `weekOf`/`isMarkedDone`/`onMarkedDone` props)
- `components/week/WeeklyGrid.test.tsx` (enabled CTA + hidden-when-done tests; view-state mock)
- `components/week/WeekView.tsx` (read flag, grayed state + `Week done · Undo` chip, thread props)
- `components/week/WeekView.test.tsx` (mark-done/undo tests)
- `entrypoints/popup/App.tsx` (import shared `currentWeekMonday`; removed inline helper)

### Change Log

- 2026-06-27: Story 4.5 implemented — Mark-week-as-done primary CTA, Mon–Fri gap-check, gap-acknowledgment Dialog (shadcn Radix), local-only `{ weekOf, markedDoneAt }` flag in view-state, week-aware `isCurrentWeekMarkedDone()` in badge.ts, grayed `Week done · Undo` chip, badge-update broadcast. All gates green (662 passed/1 skipped, tsc 0, eslint exit 0). Status → review.
