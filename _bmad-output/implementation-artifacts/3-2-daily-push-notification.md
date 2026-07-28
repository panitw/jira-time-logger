---
baseline_commit: da96fcc
---

# Story 3.2: Daily Push Notification

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a worker who could forget to log,
I want a single daily notification at my configured time that opens the popup pre-warmed,
so that I'm reminded without needing to remember.

## Acceptance Criteria

1. **Daily-reminder alarm fires → suppress-or-show decision (FR16, UX-DR30).**
   Given the `daily-reminder` alarm (registered in Story 1.6 via `chrome.alarms.create('daily-reminder', { when: nextOccurrence })`) fires at the configured time,
   When the service worker's `daily-reminder` alarm branch runs,
   Then the handler checks two suppression conditions: (a) is the worker already "logged today" — i.e. has the worker any worklog with `started` on today's date in the current week's worklog set? AND (b) is the current week marked-as-done?
   And if EITHER condition is true, NO notification is created (no end-of-day nag once the worker is done),
   And the alarm is re-registered for the next day's configured time regardless of the suppression outcome (AC #6).

2. **Notification shown with honest past-tense copy (FR16, UX-DR30, UX-DR36).**
   Given neither suppression condition holds (worker has NOT logged today AND week is not marked done) and the worker is connected,
   When the handler proceeds,
   Then `chrome.notifications.create` displays a single notification with `type: 'basic'`, title `"Log today's time"`, message `"<Xh> / <Yh> logged today"` where `X` = hours the worker has logged today (rounded, from the same worklog set) and `Y` = `targetHoursItem` value, and `iconUrl` = the brand logo (`chrome.runtime.getURL('icon/96.png')`, the 96 px notification-size icon per UX-DR36 / UX spec line 850),
   And the copy is strictly past-tense factual — never "Don't forget!", "You should…", or any aspirational/pushy phrasing (UX-DR30).

3. **Click notification body → open pre-warmed popup (FR16, NFR1).**
   Given the notification is shown,
   When the user clicks the notification body,
   Then `chrome.action.openPopup()` is called so the popup opens to the Today view,
   And the popup mounts within 400 ms p95 because the service worker pre-fetched Today data when the alarm fired (the `fetchCurrentUserWeekWorklogs` call made for the suppression check primes the data path / warms the SW),
   And the notification is cleared after the click.

4. **Dismiss / ignore → no popup, badge persists (UX-DR30).**
   Given the notification is shown,
   When the user dismisses it (Chrome's native close) or ignores it until it auto-times-out,
   Then the popup is NOT opened,
   And the toolbar badge (Story 3.1) remains visible/unchanged — the notification is informational, not pushy.

5. **Disconnected = no notification, no fetch.**
   Given the worker is disconnected (no auth or auth expired) when the `daily-reminder` alarm fires,
   When the handler runs,
   Then no Jira fetch is attempted and no notification is created,
   And the alarm is still re-registered for the next day (AC #6) so reminders resume automatically once the worker reconnects.

6. **Reminder-time change re-registers the alarm (FR16, Story 1.6 integration).**
   Given the user changes "Daily reminder time" in the options page (Story 1.6 `ReminderTimeField`, which writes `reminderTimeItem` = `local:reminderTime`),
   When the new value is persisted to `chrome.storage.local`,
   Then the service worker clears the existing `daily-reminder` alarm and re-registers it at the new next-occurrence wall-clock time,
   And after the alarm fires each day, the handler re-registers the next day's alarm at the (current, freshly-read) configured time — preserving the DST-safe `when`-only (no `periodInMinutes`) pattern established in Story 1.6.

7. **SW-restart resilient — no in-memory state.**
   Given Chrome has killed the service worker and the `daily-reminder` alarm later fires (or the SW boots),
   When the handler wakes,
   Then it reads `reminderTimeItem`, `targetHoursItem`, auth, and worklog data fresh from `chrome.storage.local` / Jira — it assumes NO in-memory state,
   And the alarm registration remains idempotent (`chrome.alarms.get` before `create`) so a wake/boot never duplicates or resets a still-valid alarm.

8. **Test coverage (cross-cutting notification module).**
   Given the notification logic is extracted into a testable module,
   When the dev runs `npm run test` (`vitest`),
   Then co-located Vitest tests cover: suppression when logged-today, suppression when week marked-done, suppression when disconnected (no fetch), notification shown with correct title/message/icon when not suppressed, "logged today" detection across the today-date boundary, copy is past-tense (asserts exact strings, no "forget"/"should"), click handler calls `openPopup` + clears notification, and re-registration computes the next-occurrence timestamp correctly.

## Tasks / Subtasks

- [x] **Task 1 — Add a "logged today" / today-hours helper** (AC: #1, #2, #8)
  - [x] Reuse the existing `fetchCurrentUserWeekWorklogs(range)` from `lib/jira-client.ts` (DO NOT add a new fetcher). It returns `Result<JiraWorklog[], JiraError>` for the current week, already filtered to the current user and the week range, routed through `jiraGet` (scheduler + auth + 401-refresh).
  - [x] Add a small PURE helper (in the new notification module, see Task 2) that, given a `JiraWorklog[]` and a reference `Date`, returns `{ loggedTodaySeconds: number; hasLoggedToday: boolean }` by summing `timeSpentSeconds` for worklogs whose `started` calendar date equals the reference's local date. A worklog "counts as today" when `new Date(worklog.started)` falls on the same Y-M-D as the reference. Worklogs with absent `started` are ignored (mirrors the badge's defensive filter).
  - [x] Convert seconds→hours ONLY via `secondsToHours` from `lib/hours.ts` — NEVER inline `/ 3600` (architecture rule, enforced in `lib/hours.ts` / `lib/badge.ts`).

- [x] **Task 2 — Create `lib/notification.ts` (notification compose + show + suppression)** (AC: #1, #2, #3, #4, #5, #8)
  - [x] Export a PURE copy composer, e.g. `composeReminderBody({ loggedTodaySeconds, targetHours }): string` returning the exact string `"<X>h / <Y>h logged today"` (round `X` to whole hours via `Math.round(secondsToHours(...))`; `Y` is `targetHours`). Keep the title as an exported constant `REMINDER_TITLE = "Log today's time"`. Past-tense only.
  - [x] Export an orchestrator, e.g. `maybeShowDailyReminder(): Promise<void>` that: (a) checks auth via `getAuth()` + `hasValidAuth()` — if disconnected, return without fetching or notifying (AC #5); (b) reads the marked-done flag via the SAME defensive optional read used by the badge (reuses the now-exported `isCurrentWeekMarkedDone` from `lib/badge.ts`; do NOT build Story 4.5) — if true, return without notifying (AC #1); (c) fetches the week worklogs via `fetchCurrentUserWeekWorklogs(currentCycleRange('weekly'))`; on a `Result` error, log and return without notifying (transient — do not crash); (d) computes `hasLoggedToday` / `loggedTodaySeconds` (Task 1) — if `hasLoggedToday`, return without notifying (AC #1); (e) otherwise reads `targetHoursItem.getValue()`, composes copy, and calls `chrome.notifications.create(NOTIFICATION_ID, {...})`.
  - [x] Use a stable notification id constant, e.g. `export const REMINDER_NOTIFICATION_ID = 'daily-reminder'` so only a single notification ever exists (clicking/dismissing/re-firing replaces it, never stacks — matches UX "one daily push, that's it", UX spec line 328).
  - [x] Notification options: `{ type: 'basic', iconUrl: chrome.runtime.getURL('icon/96.png'), title: REMINDER_TITLE, message: composeReminderBody(...) }`. The 96 px icon already exists at `public/icon/96.png`.
  - [x] Export a click handler, e.g. `handleNotificationClick(notificationId: string): Promise<void>` that returns early unless `notificationId === REMINDER_NOTIFICATION_ID`, then calls `await chrome.action.openPopup()` (guard in try/catch — `openPopup` can reject if no window is focused; log `notification.open-popup.failed` and do not throw) and `await chrome.notifications.clear(REMINDER_NOTIFICATION_ID)` (AC #3).
  - [x] `maybeShowDailyReminder` and `handleNotificationClick` must NEVER throw (top-level try/catch) — the SW alarm/notification listeners must not crash. Log via `lib/log` with dotted events: `notification.shown`, `notification.suppressed` (reason: `disconnected` | `marked-done` | `logged-today` | `fetch-failed`), `notification.clicked`, `notification.error`.

- [x] **Task 3 — Add a next-occurrence helper + wire the `daily-reminder` alarm handler in `entrypoints/background.ts`** (AC: #1, #6, #7)
  - [x] Extracted the next-occurrence math into the pure exported `nextReminderOccurrence(time, reference = new Date()): number` in `lib/notification.ts` (plus a `nextReminderOccurrenceFromSettings()` wrapper that reads `reminderTimeItem`). The boot block now calls the shared helper — behaviour identical (DST-safe, `when` only).
  - [x] Added `registerDailyReminderAlarm(idempotent = false)` in `entrypoints/background.ts` that computes `nextReminderOccurrenceFromSettings` and `chrome.alarms.create('daily-reminder', { when })`. Reused for boot (idempotent: `chrome.alarms.get` first), re-registration after fire, and the settings-change watcher.
  - [x] Added the `daily-reminder` branch to `chrome.alarms.onAlarm`: `await maybeShowDailyReminder(); await reRegisterDailyReminder();` (show/suppress first, then unconditionally re-register the next day's alarm).
  - [x] PRESERVED all existing SW wiring: `token-refresh`, `outbox-retry`, `badge-update` alarms + their `onAlarm` branches, `onMessage('badge-update')`, boot `void updateBadge()`, `handleOutboxRetry`/`handleTokenRefresh`, and `onInstalled`.

- [x] **Task 4 — Re-register on reminder-time change (AC: #6)**
  - [x] Added a `chrome.storage.onChanged` listener: when `areaName === 'local'` and `'reminderTime' in changes`, clears the existing `daily-reminder` alarm and calls `registerDailyReminderAlarm()`. No change to the Story 1.6 `ReminderTimeField`; no new message kind.
  - [x] Confirmed the WXT `storage.defineItem('local:reminderTime')` round-trips under the bare key `reminderTime` in the `local` area (existing tests mock the literal key; badge.test stores `local:targetHours` analogously). Gated on the bare `reminderTime` key; a spurious re-register is harmless (idempotent/cheap).

- [x] **Task 5 — Register the notification click listener (AC: #3, #4)**
  - [x] Added `chrome.notifications.onClicked.addListener((id) => { void handleNotificationClick(id); })`. No `onClosed` listener — AC #4 requires no action on dismiss (Chrome auto-clears); the badge is untouched on dismiss.
  - [x] Confirmed `notifications` permission present in `wxt.config.ts` (`['identity', 'storage', 'alarms', 'notifications']`). No manifest change; permissions unchanged.

- [x] **Task 6 — Tests** (AC: #8)
  - [x] Created `lib/notification.test.ts` (co-located) following `lib/badge.test.ts` mocking patterns: `vi.stubGlobal('chrome', { notifications, action.openPopup, runtime.getURL })` + `afterEach(() => vi.unstubAllGlobals())`; in-memory `Map` wxt storage; mocked `@/lib/jira-client`, `@/lib/storage/tokens`, `@/lib/log`.
  - [x] Tested pure `composeReminderBody`, `computeLoggedToday`, `nextReminderOccurrence` directly; orchestration + click handler with mocks. Explicit assertion that copy contains neither "forget"/"should"/"don't" and is the exact past-tense string.
  - [x] Ran `npm run test` (475 pass / 1 skip), `npm run compile` (tsc clean), `eslint .` (0 errors). No `console.log` outside tests.

## Dev Notes

### What already exists — REUSE, do not reinvent

- **`daily-reminder` alarm (Story 1.6, DONE):** `entrypoints/background.ts` (lines ~115-130) already registers `chrome.alarms.create('daily-reminder', { when: next })` idempotently (`chrome.alarms.get` first), reading `reminderTimeItem` and computing the next `HH:MM` occurrence with a DST-safe `when`-only registration (NO `periodInMinutes` — this was a Story 1.6 code-review fix to avoid DST drift). There is currently NO `onAlarm` branch for `daily-reminder` and NO notification — that is exactly what this story adds. Extract the inline next-occurrence math (Task 3) and reuse it; do not duplicate it.
- **`fetchCurrentUserWeekWorklogs(range)` (Story 3.1, `lib/jira-client.ts:441`):** Returns `Result<JiraWorklog[], JiraError>` for the current user's current-week worklogs, already user-filtered + range-filtered, routed through `jiraGet` (scheduler + auth + 401-refresh). REUSE for the suppression check AND the today-hours sum — do NOT add a per-day fetcher. The notification needs only "did I log anything today + how much" which is a sub-filter of this set.
- **`lib/cycle-range.ts` (REUSE):** `currentCycleRange('weekly')` → `{ start: Monday 00:00, end: Sunday 23:59:59.999 }`. Use for the fetch range. (Story 3.1 added `workdaysSoFar` here too; not needed for this story.)
- **`lib/hours.ts` (REUSE):** `secondsToHours(seconds)`. NEVER inline `/ 3600`.
- **`lib/storage/settings.ts` (REUSE):** `reminderTimeItem` = `defineItem<string>('local:reminderTime', { fallback: '17:00' })`; `targetHoursItem` = `defineItem<number>('local:targetHours', { fallback: 8 })`. Use `await ...getValue()`.
- **`lib/storage/tokens.ts` (REUSE):** `getAuth(): Promise<AuthBundle | null>`, `hasValidAuth(bundle): boolean`. Same disconnected-gate pattern as `lib/badge.ts:87-92`.
- **Marked-done flag (forward-compat, Story 4.5 — does NOT exist yet):** Story 3.1 added a defensive optional read in `lib/badge.ts:64-75` via `storage.defineItem<boolean>('local:weekMarkedDone', { fallback: false })` and an `isCurrentWeekMarkedDone()` helper that returns `false` on any error. REUSE the SAME key `local:weekMarkedDone`. Prefer importing/exporting a shared `isCurrentWeekMarkedDone` from `lib/badge.ts` (export it there if not already exported) rather than redefining the storage item twice — defining the same `defineItem` key in two modules is allowed but duplicates the literal. If you cannot cleanly export it, re-declare the item with the IDENTICAL key/fallback and document why. Do NOT build the Story 4.5 storage module or UI.
- **`lib/log.ts` (REUSE):** `import { log } from '@/lib/log';` Dotted `noun.verb` events, flat payloads, no PII.
- **`lib/messages.ts` (REFERENCE):** Existing Zod-validated message bus. This story does NOT need a new message kind (reminder-time re-register uses `chrome.storage.onChanged`; click uses `chrome.notifications.onClicked`). Do not add a kind unless a cleaner approach genuinely requires it.
- **Icon asset:** `public/icon/96.png` exists (the notification-size icon, UX spec line 850 / DR36). Reference via `chrome.runtime.getURL('icon/96.png')`. Do NOT add a new asset.
- **`notifications` permission:** Already declared in `wxt.config.ts:14`. No manifest change required.

### Does NOT exist yet — handle defensively / do NOT build here

- **Story 4.5 marked-done module/UI** — only READ the `local:weekMarkedDone` flag defensively (defaults `false`).
- **Today-data pre-warm cache** — there is no separate SW-side Today cache. The "pre-warmed popup" / NFR1 ≤400 ms is satisfied because the suppression fetch (`fetchCurrentUserWeekWorklogs`) wakes the SW and exercises the scheduler/auth path right before the click; the popup's own TanStack Query fetch is then fast. Do NOT build a bespoke cache — just ensure the alarm handler does the fetch before the user is likely to click.

### Current state of files this story UPDATES

- `entrypoints/background.ts`: `defineBackground(async () => {...})` registers `token-refresh` (1 min), `outbox-retry` (1 min), `badge-update` (30 min), and `daily-reminder` (`when`-only) alarms; one `onAlarm` dispatcher (branches for token-refresh/outbox-retry/badge-update); `onMessage('badge-update')`; boot `void updateBadge()`; `onInstalled` (first-install opens options + logs redirect URL). ADD: the `daily-reminder` onAlarm branch (+ re-register), `chrome.notifications.onClicked` listener, `chrome.storage.onChanged` listener for `reminderTime`, and the `registerDailyReminderAlarm`/`reRegisterDailyReminder` helpers. PRESERVE everything else — the SW must remain working end-to-end.
- `lib/jira-client.ts`, `lib/cycle-range.ts`, `lib/hours.ts`, `lib/storage/settings.ts`: REUSE only (read), no edits expected. Possible additive export of `isCurrentWeekMarkedDone` from `lib/badge.ts` if sharing it (otherwise no edit).

### Project Structure Notes

- New module location: `lib/notification.ts` + `lib/notification.test.ts` (cross-cutting `lib/*` module, co-located Vitest test — architecture.md). Architecture maps "Daily push notification (FR16)" to `entrypoints/background.ts` (line 602) within "Daily Awareness & Reminders" (FR15-19) owned by `entrypoints/background.ts` + `lib/badge.ts` (architecture.md line 836). The SW owns notifications (architecture.md line 768: "Owns scheduler, OAuth refresh, alarms, notifications"; line 771: "Wakes on: alarm, message, notification click, install").
- Notification rendering is Chrome-native (no Tailwind/CSS tokens) — set only `type`/`title`/`message`/`iconUrl`.
- No default exports, no `any`, no `console.log` outside tests (project ESLint).

### Testing standards

- Vitest, co-located `*.test.ts`. `chrome.*` mocked via `vi.stubGlobal('chrome', {...})` (see `lib/disconnect.test.ts` / `lib/badge.test.ts`); wxt storage + `@/lib/jira-client` + `@/lib/storage/tokens` + `@/lib/log` mocked via top-level `vi.mock(...)` with in-memory `Map` (see `lib/storage/outbox.test.ts`); pure logic needs no mocks. `afterEach(() => vi.unstubAllGlobals())`.
- Scripts are **npm**, not pnpm: `npm run test`, `npm run compile` (tsc --noEmit), `npm run lint`, `npm run build`. Confirm exact names in `package.json`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2: Daily Push Notification] (lines 911-944) — user story, ACs, suppression logic, copy, re-register, SW-restart resilience.
- [Source: _bmad-output/planning-artifacts/epics.md] line 231 (FR15/FR16 → Epic 3); line 209 (honest copy register — notification "Log today's time", not "Don't forget"); line 221 (96 px notification icon asset); lines 536-539 (Story 1.6 alarm registration, notification deferred to Epic 3); line 90 (NFR1 popup TTI ≤400 ms from notification).
- [Source: _bmad-output/planning-artifacts/architecture.md] lines 602 (background.ts owns daily push FR16), 768/771 (SW owns notifications; wakes on notification click), 836 (Daily Awareness & Reminders → background.ts + lib/badge.ts).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] lines 569-577 (notification mock: title "Log today's time", body "5h / 8h logged today", Open→popup pre-warmed), 610/850 (logo as notification icon, 96 px), 163/313/328 (mild-prompt tone, Vercel past-tense register, one daily push only), 473 (notification click → Today view, 400 ms NFR1), 1273-1278 (Flow 3 mermaid: logged-today/week-complete → no notification; Dismiss → cleared, badge persists; Click → pre-warmed popup), 1605/1696 (past-tense factual copy).
- Existing code: `entrypoints/background.ts` (daily-reminder alarm lines 115-130, alarm/onMessage patterns), `lib/jira-client.ts:441` (`fetchCurrentUserWeekWorklogs`), `lib/badge.ts:64-75` (`weekMarkedDone` defensive read + `isCurrentWeekMarkedDone`), `lib/cycle-range.ts` (`currentCycleRange`), `lib/hours.ts` (`secondsToHours`), `lib/storage/settings.ts` (`reminderTimeItem`, `targetHoursItem`), `lib/storage/tokens.ts` (`getAuth`/`hasValidAuth`), `lib/jira-types.ts` (`JiraWorklog`), `components/settings/ReminderTimeField.tsx` (writes `reminderTimeItem` on blur — Story 1.6), `wxt.config.ts:14` (`notifications` permission), `public/icon/96.png` (notification icon).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- Initial test for the "shows notification" case incorrectly used a today-dated worklog; corrected to a prior-day worklog because AC #1 suppresses the already-logged-today path, so the shown message is always `0h / <Y>h logged today`.
- `tsc --noEmit` flagged the test worklog object literals (typed via `computeLoggedToday(worklogs: JiraWorklog[])`) as missing the required `id` field; added a small `wl()` factory + `import type { JiraWorklog }`.
- Fixed an `import/order` warning on the new `@/lib/badge` import in `lib/notification.ts` (alphabetized before `@/lib/cycle-range`).

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- New module `lib/notification.ts` houses all pure logic + the orchestrator/click handler. Pure exports: `composeReminderBody`, `computeLoggedToday`, `nextReminderOccurrence`. Orchestration: `maybeShowDailyReminder` (never throws), `handleNotificationClick` (never throws), `nextReminderOccurrenceFromSettings`.
- Reused, not reinvented: Story 1.6 `daily-reminder` alarm (DST-safe `when`-only, no `periodInMinutes`), `reminderTimeItem`/`targetHoursItem`, Story 3.1 `fetchCurrentUserWeekWorklogs`, `currentCycleRange('weekly')`, `secondsToHours`, `getAuth`/`hasValidAuth`. Exported `isCurrentWeekMarkedDone` from `lib/badge.ts` (additive, one-word change) and imported it rather than redeclaring the `local:weekMarkedDone` storage item — single source for the marked-done read.
- Did NOT build the Epic 4 Story 4.5 marked-done module/UI, no Today pre-warm cache (NFR1 satisfied by the suppression fetch waking the SW), no new message kind, no new npm dependency, no manifest/permission change.
- Suppression order is disconnected → marked-done → fetch-failed → logged-today, with dotted log events `notification.suppressed` (reason), `notification.shown`, `notification.clicked`, `notification.open-popup.failed`, `notification.error`.
- Gates: `npm run test` → 41 files, 475 passed / 1 skipped (baseline 40/451+1skip; +1 suite, +24 tests, no regressions); `npm run compile` (tsc --noEmit) clean; `eslint .` → 0 errors (only pre-existing import/order warnings; none in the new/edited files).

### File List

- `lib/notification.ts` (new) — pure helpers + `maybeShowDailyReminder`/`handleNotificationClick`/`nextReminderOccurrenceFromSettings`.
- `lib/notification.test.ts` (new) — co-located Vitest coverage (24 tests).
- `entrypoints/background.ts` (modified) — `registerDailyReminderAlarm`/`reRegisterDailyReminder` helpers, `daily-reminder` onAlarm branch, `chrome.notifications.onClicked` listener, `chrome.storage.onChanged` reminder-time watcher; boot block refactored to the shared helper.
- `lib/badge.ts` (modified) — exported `isCurrentWeekMarkedDone` (additive; shared marked-done read).

## Review Findings

Fresh adversarial code review (BMad code-review workflow, 2026-06-22) — parallel Blind Hunter / Edge Case Hunter / Acceptance Auditor layers against `git diff HEAD` (baseline `da96fcc`) plus untracked `lib/notification.{ts,test.ts}`. All 8 ACs assessed MET. No HIGH/MEDIUM left open. Patches applied in the working tree (not committed).

### Applied (patch)

1. **Alarm re-registration resilience (MEDIUM, `entrypoints/background.ts`).** `reRegisterDailyReminder` and the `storage.onChanged` watcher previously did `chrome.alarms.clear('daily-reminder')` then an async `registerDailyReminderAlarm()`. If the SW were terminated in that gap (after the fired/cleared alarm is gone, before `create` resolves), the only armed reminder would be lost until a cold boot. Fixed by dropping the `clear` and relying on `chrome.alarms.create` with the same name to atomically overwrite — single call, no gap. DST-safe `when`-only and idempotent boot path unchanged.

2. **`nextReminderOccurrence` range validation (HIGH/MEDIUM, `lib/notification.ts`).** The parser guarded only NaN, so finite-but-invalid stored values would schedule at a bogus wall-clock time: `''` → midnight (not the 17:00 default), `'-5:30'` → a past epoch (risking an immediate-fire), `'24:00'`/`'17:60'` → wrong hour. Replaced with an `HH:MM` regex + `0–23 / 0–59` range check that falls back to the 17:00 default on any malformed/out-of-range input. The only legitimate writer (Story 1.6 `ReminderTimeField`) already validates, so this is defense-in-depth against corrupt storage / a future writer. Added 4 tests (empty, out-of-range/negative set, single-digit hour).

3. **DST doc accuracy (LOW, `lib/notification.ts`).** Softened the "DST-safe by construction" comment to note the residual spring-forward-gap caveat (a configured time inside the skipped hour fires ~1h off that one day) — an accepted once-a-year skew.

### Deferred (with reason)

- **Unhandled-rejection / error isolation in the shared `onAlarm` async listener** (MEDIUM, Blind Hunter): `handleTokenRefresh` and `updateBadge` branches are not individually try/catch-wrapped. PRE-EXISTING (Stories 1.2 / 3.1), out of scope for 3.2 — the `daily-reminder` branch added here is fully guarded (`maybeShowDailyReminder`/`reRegisterDailyReminder` never throw). Recommend a follow-up to wrap each `onAlarm` branch.
- **Fractional/negative `targetHours`, `Math.round` half-up, negative `timeSpentSeconds`** (LOW): moot — the shown body's `X` is always 0 (see design note below) and `Y`/seconds come from trusted Jira/typed-storage data.
- **No automated test of the `background.ts` SW wiring** (LOW): AC8 is scoped to the notification module; the pure `nextReminderOccurrence` re-register math is well covered. Out of scope.
- **Cross-midnight-offset `computeLoggedToday` test with pinned TZ** (LOW): behavior is correct (local-day attribution is intended); a hardening test only.

### Design question surfaced (not a defect)

**The shown notification body is always `"0h / Yh logged today"`.** `maybeShowDailyReminder` suppresses whenever `hasLoggedToday` (i.e. `loggedTodaySeconds > 0`), so by the time `composeReminderBody` runs, `X` is provably 0. The Acceptance Auditor ruled this MET / acceptable: it is a contradiction *within the spec* (AC1 suppression makes AC2's `<X>` non-zero branch unreachable), not between spec and code — the implementation is internally consistent and faithful to AC1, and keeping `composeReminderBody` parameterized/pure is the correct engineering call. The open question is product/UX-level: whether an always-"0h" body should keep the `<X>h /` prefix or be simplified (e.g. "No time logged today"). Surfaced for the PM/UX owner; no code change made.

### Gates after patches

- `npm run test` → 41 files, **478 passed / 1 skipped** (notification suite 27 tests; +3 vs review baseline).
- `npm run compile` (tsc --noEmit) → **clean**.
- `eslint .` → **0 errors** (54 pre-existing import/order warnings, none in the edited files).

## Change Log

| Date | Change |
|---|---|
| 2026-06-22 | Story 3.2 created — Daily Push Notification (FR16). Reuses Story 1.6 `daily-reminder` alarm + `reminderTimeItem`/`targetHoursItem`, Story 3.1 `fetchCurrentUserWeekWorklogs` + `weekMarkedDone` defensive read. Adds `lib/notification.ts` + SW onAlarm/onClicked/storage.onChanged wiring. Status → ready-for-dev. |
| 2026-06-22 | Story 3.2 implemented — added `lib/notification.ts` (+ tests), wired `daily-reminder` onAlarm branch, `notifications.onClicked`, and `storage.onChanged` reminder-time re-register in `entrypoints/background.ts`; exported `isCurrentWeekMarkedDone` from `lib/badge.ts`. All gates green (475 pass/1 skip, tsc clean, eslint 0 errors). Status → review. |
| 2026-06-22 | Code review (adversarial 3-layer). Applied patches: removed the clear-then-create alarm re-register gap (single atomic `create`); added `HH:MM` range validation to `nextReminderOccurrence` (no midnight/past-epoch fire on bad storage) + 4 tests; softened DST comment. Deferred pre-existing `onAlarm` error-isolation (out of scope). Surfaced the always-"0h" body as a product/UX question. Gates: 478 pass/1 skip, tsc clean, eslint 0 errors. Status → done. |

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-06-22 — created (ready-for-dev)


