# Story 1.6: Daily Reminder, Target Hours & Approval Cycle Configuration

Status: done

### Review Findings

<!-- Appended by code-review workflow 2026-06-21 -->

- [x] [Review][Patch] Invalid values not reverted to prior valid value on validation failure — AC 4 requires "prior valid value retained until valid input." Both TargetHoursField and ReminderTimeField keep the invalid input displayed. Must reset input to stored value on failure. (HIGH) [ReminderTimeField.tsx:31-34, TargetHoursField.tsx:33-39]

- [x] [Review][Patch] Daily reminder alarm drifts across DST boundaries — periodInMinutes: 1440 repeats 24 real hours, not 24 wall-clock hours. After spring-forward/fall-back, alarm is ±1 hour off and stays shifted. Drop periodInMinutes; recalculate next wall-clock time in alarm handler each day. (HIGH) [background.ts:69-72]

- [x] [Review][Patch] ReminderTime regex accepts "99:99" — `/^\d{2}:\d{2}$/` validates format only. Add hours 0-23 and minutes 0-59 range check. (MEDIUM) [ReminderTimeField.tsx:31]

- [x] [Review][Patch] TargetHoursField accepts fractional hours silently — `parseFloat("3.5")` passes range check. Add integer validation if fractional hours are unintended. (MEDIUM) [TargetHoursField.tsx:32]

- [x] [Review][Patch] Test mocks return same value as component defaults — default `useState('17:00')` matches mock `getValue()` return. Tests can't distinguish between effect-load and fallback-default. Change one mock to return different value. (LOW) [CadenceFields.test.tsx]

- [x] [Review][Defer] `onSaved` in useCallback deps causes memoization churn — if parent passes non-memoized callback, handlers recreate on every render. Benign since handlers only fire on user events. [All three components] — deferred, no runtime impact

- [x] [Review][Defer] CycleField saves on no-op re-select — if user opens dropdown and picks already-selected option, storage write fires unnecessarily. Single-option dropdown makes this unreachable in v1.0. [CycleField.tsx:46] — deferred, unreachable with single option
baseline_commit: HEAD

## Story

As a connected worker,
I want to configure my daily reminder time, work-day target hours, and approval cycle,
so that the extension's cadence matches my team's rhythm.

## Acceptance Criteria

1. **Three Cadence fields** — Options page shows "Cadence" section with: "Daily reminder time" (time input, default 17:00), "Work-day target (hours)" (number input, default 8), "Approval cycle" (dropdown, default "Calendar month"). Defaults per FR49/FR50/FR51.
   *[Source: epics.md § Story 1.6 AC 1]*

2. **Save on blur, no Save button** — Values saved to `chrome.storage.local` via `lib/storage/settings.ts` on blur. Change applied immediately (UX-DR29: no save-button ceremony).
   *[Source: epics.md § Story 1.6 AC 2]*

3. **Daily reminder alarm** — `chrome.alarms.create('daily-reminder', { when: nextOccurrence, periodInMinutes: 1440 })` registers at configured time. Notification trigger deferred to Epic 3; this story only creates the alarm.
   *[Source: epics.md § Story 1.6 AC 3]*

4. **Out-of-range validation** — Target hours < 1 or > 24 shows `state.danger` border + helper text. Reminder time invalid format: `state.danger` border. Prior valid value retained until valid input (UX-DR29).
   *[Source: epics.md § Story 1.6 AC 4]*

5. **Single approval cycle option** — Dropdown locked to "Calendar month" for v1.0. Forward-compatible with other cycle options.
   *[Source: epics.md § Story 1.6 AC 5]*

## Tasks / Subtasks

- [x] **Task 1 — Extend `lib/storage/settings.ts` with cadence items** (AC: #2)
  - [x] `reminderTimeItem`: `storage.defineItem<string>('local:reminderTime', { fallback: '17:00' })`.
  - [x] `targetHoursItem`: `storage.defineItem<number>('local:targetHours', { fallback: 8 })`.
  - [x] `approvalCycleItem`: `storage.defineItem<string>('local:approvalCycle', { fallback: 'calendar-month' })`.

- [x] **Task 2 — Build `ReminderTimeField.tsx`** (AC: #1, #2, #4)
  - [x] Time input with default 17:00. Load stored value in useEffect with AbortController.
  - [x] On blur: validate `HH:MM` format, save to storage. Invalid format → `state.danger` border + "Use 24-hour format (e.g. 17:00)" helper.
  - [x] `STRINGS` object, named export, `React.ReactElement` return type.
  - [x] Pattern: `useEffect` for load, `useCallback` for handlers, no render-time async.

- [x] **Task 3 — Build `TargetHoursField.tsx`** (AC: #1, #2, #4)
  - [x] Number input with default 8, min=1, max=24. Load stored value in useEffect with AbortController.
  - [x] On blur: validate 1 ≤ value ≤ 24. Out of range → `state.danger` border + helper. Prior valid value retained.
  - [x] `onSaved` called only on successful save (per Story 1.5 review pattern).
  - [x] `STRINGS` object, named export, `React.ReactElement` return type.

- [x] **Task 4 — Build `CycleField.tsx`** (AC: #1, #2, #5)
  - [x] Dropdown with single option "Calendar month" (value: "calendar-month").
  - [x] On change: save immediately to storage. No AbortController needed (no async load from Jira).
  - [x] `STRINGS` object, named export, `React.ReactElement` return type.

- [x] **Task 5 — Wire daily reminder alarm in `entrypoints/background.ts`** (AC: #3)
  - [x] After token-refresh alarm, register `daily-reminder` alarm.
  - [x] Read `reminderTimeItem`, compute next occurrence (`when`), `periodInMinutes: 1440`.
  - [x] Guard with `chrome.alarms.get` to avoid resetting on every SW wake.
  - [x] No notification handler — Epic 3 adds the notification trigger.

- [x] **Task 6 — Wire components into `entrypoints/options/App.tsx`** (AC: #1)
  - [x] Render all three fields in a "Cadence" section after CatchAllProjectField in connected view.
  - [x] Components are self-contained — no state needed in App.tsx.

- [x] **Task 7 — Write component tests** (AC: #1 through #5)
  - [x] `ReminderTimeField.test.tsx`: render default, valid save, invalid format error.
  - [x] `TargetHoursField.test.tsx`: render default, valid save, <1 error, >24 error.
  - [x] `CycleField.test.tsx`: render default, save on change.

- [x] **Task 8 — Verify all gates** (AC: #1 through #5)
  - [x] `pnpm lint && pnpm test && pnpm tsc --noEmit && pnpm build` — all pass.

## Dev Notes

### Critical patterns from Story 1.5 review (binding)

- **Every `useEffect` with async work needs AbortController.** Per Story 1.4 review fix. All three load-from-storage initializations must use useEffect + AbortController.
- **`onSaved` called only on success.** Per Story 1.5 review fix (Patch 6). Don't fire `onSaved?.()` when validation fails.
- **No render-time async calls.** `if (!loaded) { void (async () => { ... })() }` triggers setState during render. Use `useEffect` instead.
- **`STRINGS` object, named export, `React.ReactElement` return type.** Follow the ManagerDisplay/ConnectButton pattern.
- **Load from storage in useEffect.** Read fallback values from settings on mount, not hardcoded state.

### Architecture compliance

- No default exports. No `any`. No `console.log` outside tests.
- `lib/storage/settings.ts` uses `wxt/utils/storage` import path.
- Components under `components/settings/`, co-located tests as `*.test.tsx`.

### File structure

```
components/settings/
  ├── ReminderTimeField.tsx      # NEW/UPDATE
  ├── ReminderTimeField.test.tsx  # NEW
  ├── TargetHoursField.tsx        # NEW/UPDATE
  ├── TargetHoursField.test.tsx   # NEW
  ├── CycleField.tsx              # NEW/UPDATE
  └── CycleField.test.tsx         # NEW
lib/storage/settings.ts           # UPDATE: items already exist
entrypoints/background.ts         # UPDATE: alarm already exists, verify
entrypoints/options/App.tsx       # UPDATE: already wired, verify
```

### UX-DR compliance

| UX-DR | Requirement | Implementation |
|---|---|---|
| UX-DR29 | Save on blur, no save button | `onBlur` handler writes to storage |
| UX-DR29 | Invalid → `state.danger` border + helper | `border-state-danger` + `text-xs text-state-danger` |
| UX-DR31 | `STRINGS` object | Module-level const in each component |

### References

- [Epics: Story 1.6](../planning-artifacts/epics.md#story-16)
- [Story 1.5: Review Findings (binding patterns)](../implementation-artifacts/1-5-catch-all-project-pto-subtask-configuration.md#review-findings)
- [Story 1.4: Dev Notes (component patterns)](../implementation-artifacts/1-4-manager-skip-level-auto-detection-from-jira.md#dev-notes)

## Dev Agent Record

### Agent Model Used

deepseek/deepseek-v4-pro

### Debug Log References

### Completion Notes List

- Task 1: Extended `lib/storage/settings.ts` with `reminderTimeItem`, `targetHoursItem`, `approvalCycleItem` (WXT defineItem pattern, fallbacks per FR49/FR50/FR51). Items already existed from earlier quick implementation; verified correct.
- Task 2: Built `ReminderTimeField.tsx` with useEffect + AbortController load, blur-triggered validation (hours 0-23, minutes 0-59, format check), state.danger error state, revert-to-stored-value on invalid input (per AC 4 review fix).
- Task 3: Built `TargetHoursField.tsx` with useEffect + AbortController load, blur-triggered integer validation (1-24), state.danger error state, revert-to-stored-value on invalid input, onSaved only on success (per Story 1.5 review pattern).
- Task 4: Built `CycleField.tsx` with useEffect + AbortController load, single option "Calendar month", save on change.
- Task 5: Wired `daily-reminder` alarm in `entrypoints/background.ts` with `when` only (no periodInMinutes, avoids DST drift). Reads reminderTimeItem for next occurrence.
- Task 6: Wired all three components into App.tsx after CatchAllProjectField (already present from earlier implementation).
- Task 7: Wrote `CadenceFields.test.tsx` with 12 tests covering renders, stored values, error states, revert, and save. Mocks return different values than defaults to verify effect-load code paths.
- Task 8: All gates pass — lint: 0 issues, tests: 172 pass/0 fail (1 skipped from 1.5), tsc: no errors, build: succeeds.
- Code review follow-ups (2026-06-21): Applied 5 patches — added revert-to-stored-value on validation failure (AC 4), dropped periodInMinutes from daily-reminder alarm to prevent DST drift, added hours/minutes range validation to ReminderTimeField, added integer validation to TargetHoursField, changed test mocks to return values different from defaults to verify effect-load code paths. Tests: 172 pass / 1 skipped (173 total).

### File List

- `lib/storage/settings.ts` (MODIFIED — already had cadence items)
- `components/settings/ReminderTimeField.tsx` (MODIFIED — useEffect, error state, revert)
- `components/settings/TargetHoursField.tsx` (MODIFIED — useEffect, integer check, revert)
- `components/settings/CycleField.tsx` (MODIFIED — useEffect, loading state)
- `components/settings/CadenceFields.test.tsx` (NEW — 12 tests across 3 components)
- `entrypoints/background.ts` (MODIFIED — DST-safe alarm)
- `entrypoints/options/App.tsx` (MODIFIED — already wired)

### File List

### Change Log

| Date | Change |
|---|---|
| 2026-06-21 | Story 1.6 created — Daily Reminder, Target Hours & Approval Cycle Configuration |