---
baseline_commit: a8980f02a00bc7aad153e94cfac6010fa41adb35
---

# Story 3.1: Toolbar Badge Counter

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a worker with browsers open all day,
I want a number on the toolbar icon showing hours I still owe this week,
so that I'm reminded ambiently without opening the popup.

## Acceptance Criteria

1. **Badge alarm registered & computes deficit (FR15, NFR4).**
   Given the worker is connected and the current week has worklogs (or doesn't),
   When the service worker's badge-update alarm fires (registered via `chrome.alarms.create('badge-update', { periodInMinutes: 30 })`),
   Then `lib/badge.ts` computes hours missing for the current week = `(workdaysSoFar * targetHours) − sum(worklogs.timeSpentSeconds / 3600)` where `workdaysSoFar` counts Mon–Fri through "today" inclusive,
   And the result is rendered on the toolbar icon via `chrome.action.setBadgeText({ text: '<N>h' })` (N = rounded whole hours) and `chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })` (`state.danger`).

2. **Caught-up = invisible badge (UX-DR15 relief moment).**
   Given the computed deficit is 0 or negative (worker is caught up or over),
   When the badge update runs,
   Then the badge text is cleared (`chrome.action.setBadgeText({ text: '' })`),
   And no color is applied — the badge is invisible in the caught-up state.

3. **Marked-done week clears badge (FR24, forward-compatible with Epic 4 Story 4.5).**
   Given the user has marked the current week as done (Epic 4 Story 4.5 — local-only flag, not yet implemented),
   When the badge update runs,
   Then the badge text is cleared regardless of computed deficit.
   Implementation note: read the marked-done flag defensively via an optional helper that returns `false` when the flag/module does not exist yet, so this AC is wired now and "just works" when Story 4.5 lands. Do NOT create the Story 4.5 storage module here.

4. **Immediate re-render on local action (NFR4 ≤30s, typically immediate).**
   Given the worker posts a worklog from the popup or banner,
   When the local action completes and broadcasts the existing `badge-update` message,
   Then the service worker's `badge-update` message handler recomputes and re-renders the badge within 30 seconds (typically immediate).
   Note: the broadcast already exists in the codebase (QuickLogForm, PtoQuickAction, LoggedToday, outbox drain) but currently has NO service-worker consumer — this story adds that consumer. The `hoursMissing` value carried in the message payload is a placeholder (`0`) and MUST be ignored; the handler recomputes authoritatively via `lib/badge.ts`.

5. **Remote changes reflected within 2 minutes (NFR4).**
   Given another team member's worklog or a Jira-side change updates the worker's worklog data,
   When the next badge alarm fires,
   Then the badge re-renders to reflect the live remote state within 2 minutes (bounded by the 30-min alarm period for normal cadence and by the rate-limit scheduler that already wraps every Jira call).

6. **Disconnected = blank badge, no fetch.**
   Given the worker is disconnected (no auth, or auth expired),
   When the badge update runs,
   Then the badge text is cleared,
   And no fetch is attempted.

7. **Cross-cutting module test coverage.**
   Given `lib/badge.ts` is a cross-cutting module,
   When the dev runs `pnpm test` (`vitest`),
   Then co-located Vitest tests cover: deficit math across week boundaries, PTO entries counted as logged hours (full target on a PTO day), current-week marked-done returns 0, no-worklogs case, week-rollover behavior (Monday morning resets to full deficit for that single workday), deficit ≤ 0 → blank text, disconnected → blank text + no fetch.

## Tasks / Subtasks

- [x] **Task 1 — Add `workdaysSoFar` helper to `lib/cycle-range.ts`** (AC: #1, #7)
  - [x] Add an exported pure function (e.g. `workdaysSoFar(reference: Date = new Date()): number`) returning the count of Mon–Fri days from the current week's Monday through `reference` inclusive. Saturday/Sunday `reference` returns 5. Monday returns 1.
  - [x] Anchor the week to the same Monday boundary that `currentCycleRange('weekly')` produces (Monday 00:00 → Sunday 23:59:59.999) so badge math and week range stay consistent.
  - [x] Add cases to the existing `lib/cycle-range.test.ts`: Monday→1, Friday→5, Saturday/Sunday→5, mid-week values.

- [x] **Task 2 — Add a current-week worklog fetcher in `lib/jira-client.ts`** (AC: #1, #5, #6)
  - [x] Add a function (e.g. `fetchCurrentUserWeekWorklogs(range: CycleRange): Promise<Result<JiraWorklog[], JiraError>>`) that returns the current user's worklogs for the given week range. Route ALL HTTP through the existing `jiraGet` (which already wraps `scheduler.acquire` + auth + 401-refresh + `Result`). Do not call `fetch` directly.
  - [x] Strategy: JQL `worklogAuthor = currentUser() AND worklogDate >= "<start>" AND worklogDate <= "<end>"` via `rest/api/3/search/jql` to find issues, then read `/rest/api/3/issue/{key}/worklog` per issue, filtering to the current user (`author.accountId`) and to `started` within the range. Add a new Zod schema for the worklog-list response (e.g. `JiraWorklogListSchema = z.object({ worklogs: z.array(JiraWorklogSchema), total: z.number().optional() })`) in `lib/jira-types.ts` reusing the existing `JiraWorklogSchema`.
  - [x] Resolve the current user's `accountId` — reuse whatever the codebase already uses for "current user" (check `lib/manager-resolution.ts` / hierarchy walk for `myself`/`currentUser`); do NOT add a new auth concept.
  - [x] PTO worklogs are ordinary worklogs posted to the catch-all PTO subtask — they require NO special handling and count toward logged hours like any other worklog. Do not filter them out.

- [x] **Task 3 — Create `lib/badge.ts` (badge computation + render)** (AC: #1, #2, #3, #6, #7)
  - [x] Export the deficit computation as a PURE function for testability, e.g. `computeHoursMissing({ workdaysSoFar, targetHours, totalLoggedSeconds }): number` using `secondsToHours` from `lib/hours.ts` (NEVER inline `/ 3600`).
  - [x] Export an orchestrator, e.g. `updateBadge(): Promise<void>`, that: (a) checks auth via `getAuth()` + `hasValidAuth()` — if disconnected, clear badge and return without fetching (AC #6); (b) checks the optional marked-done flag — if true, clear badge and return (AC #3); (c) reads `targetHoursItem.getValue()` and `approvalCycleItem` if needed; (d) computes the week range (`currentCycleRange('weekly')`) and `workdaysSoFar()`; (e) fetches worklogs (Task 2), summing `timeSpentSeconds`; (f) computes deficit; (g) renders.
  - [x] Render helper: deficit > 0 → `setBadgeText({ text: '<N>h' })` (round to whole hours) + `setBadgeBackgroundColor({ color: '#dc2626' })`; deficit ≤ 0 → `setBadgeText({ text: '' })` (no color). Reuse the badge-clear shape already used in `lib/disconnect.ts:40`.
  - [x] On a fetch `Result` error (auth-expired / network / rate-limited): log via `lib/log` and do NOT crash the alarm handler. Leave the previous badge state untouched on transient errors (do not blank it on a single failed remote fetch). `updateBadge` must never throw.
  - [x] Reference the danger color from a single shared constant (define `BADGE_DANGER_COLOR = '#dc2626'` in `lib/badge.ts`); do not duplicate the literal.

- [x] **Task 4 — Wire the alarm + message handler in `entrypoints/background.ts`** (AC: #1, #4, #5)
  - [x] Register the badge alarm idempotently following the existing `token-refresh` / `outbox-retry` pattern: `chrome.alarms.get('badge-update')` → if absent `chrome.alarms.create('badge-update', { periodInMinutes: 30 })`.
  - [x] In the existing `chrome.alarms.onAlarm` listener, add `if (alarm.name === 'badge-update') await updateBadge();`.
  - [x] Add `onMessage('badge-update', () => updateBadge())` so popup/banner/outbox-drain broadcasts trigger an immediate authoritative recompute (AC #4). Ignore the message payload's `hoursMissing`.
  - [x] Optionally trigger one `updateBadge()` on service-worker boot (inside `defineBackground`) so the badge is correct after the SW wakes; guard so a disconnected boot is a no-op.

- [x] **Task 5 — Tests** (AC: #7)
  - [x] Create `lib/badge.test.ts` (co-located). Follow `lib/storage/outbox.test.ts` for `vi.mock('wxt/utils/storage', ...)` (in-memory Map for `targetHours`/`approvalCycle`), `vi.mock('@/lib/jira-client', ...)`, `vi.mock('@/lib/storage/tokens', ...)`, `vi.mock('@/lib/log', ...)`; and `lib/disconnect.test.ts` for `vi.stubGlobal('chrome', { action: { setBadgeText, setBadgeBackgroundColor }, alarms: {...} })` + `afterEach(vi.unstubAllGlobals)`.
  - [x] Cover every bullet in AC #7. Test the pure `computeHoursMissing` directly (no mocks) and the `updateBadge` orchestration with mocks.
  - [x] Run `pnpm test`, `pnpm lint`, `pnpm typecheck` (or the project equivalents — see package.json scripts) and ensure green. Do not introduce `console.log` (ESLint forbids it outside tests). [Project uses npm: `npm run test` / `npm run lint` / `npm run compile`.]

### Review Findings

Code review 2026-06-22 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). All patch findings applied in the working tree; gates re-run green (451 tests pass / 1 skipped, tsc 0 errors, eslint 0 errors).

Patches applied (fixed):

- [x] [Review][Patch] HIGH — `&fields=key` search request fails Zod parse, silently breaking the badge in production [lib/jira-client.ts:453] — `JiraSearchSchema`/`JiraIssueSchema` require `fields.summary`; `&fields=key` returns `fields: {}` so `safeParse` fails → `parseError` → `updateBadge` treats it as a transient error and leaves the badge permanently stale whenever the user has logged any time. Unit tests masked it by hardcoding `fields: { summary: 'A' }`. Fix: request `&fields=key,summary` (mirrors `lib/ticket-search.ts`). Added regression tests asserting the requested fields and that a summary-less response yields `parse-error`. (Found by all three layers.)
- [x] [Review][Patch] MEDIUM — Per-issue worklog page-1-only read undercounts on long-lived subtasks [lib/jira-client.ts:467] — Jira returns worklogs oldest-first; on a long-lived catch-all/PTO subtask the current week's worklogs land on a later page, so reading only page 1 misses them → overstated deficit. Fix: scope the per-issue worklog read with `startedAfter`/`startedBefore` (epoch ms) so the server returns only the week's worklogs in one page. Added a test asserting the params are present. (blind+edge)
- [x] [Review][Patch] LOW — Deficit in (0, 0.5) renders a contradictory red "0h" badge [lib/badge.ts:122] — `deficit > 0` is true but `Math.round` yields 0. Fix: render only when `Math.round(deficit) >= 1`, else clear. Added orchestration test (23.7h logged vs 24h expected → cleared). (blind+edge)
- [x] [Review][Patch] LOW — AC#7 "deficit math across week boundaries" not explicitly covered [lib/badge.test.ts] — added a Sun→Mon adjacent-week-boundary test. (auditor)

Deferred (real but out-of-scope / low value):

- [x] [Review][Defer] MEDIUM — Timezone mismatch between JQL `worklogDate` (Jira-server day) and the client-side `started` epoch filter (SW-local day) [lib/jira-client.ts] — deferred: only affects worklogs within hours of the week boundary for users whose SW timezone differs from their Jira timezone; correcting it needs the Jira user timezone which is not currently fetched.
- [x] [Review][Defer] LOW — No mutex across concurrent `updateBadge` calls (alarm + message + boot) can cause last-writer-wins flicker [entrypoints/background.ts] — deferred: low impact on a 30-min cadence; the badge converges on the next update.
- [x] [Review][Defer] LOW — `workdaysSoFar` counts the current weekday as a full day and ignores public holidays [lib/cycle-range.ts] — deferred: this is the spec-defined behavior (Monday → 1, full target); holiday-awareness is out of scope for this story.

Dismissed as noise / false positives: `timeSpentSeconds` NaN (schema mandates a non-optional `number`); worklog with absent `started` (JQL pre-filters to the week, `started` practically always present); `author?.accountId` over-exclusion (intentional defensive filter, JQL already restricts to current user); boot-time `void updateBadge()` race (auth-gated, target has a fallback, benign); "disconnect does not clear badge text" (false — `lib/disconnect.ts:46` already clears it; the Blind Hunter had no project access).

## Dev Notes

### What already exists — REUSE, do not reinvent

- **`badge-update` message bus (DONE):** `lib/messages.ts` already defines `BadgeUpdateSchema = z.object({ hoursMissing: z.number() })` and registers the `'badge-update'` kind. `sendMessage`/`onMessage` are the typed, Zod-validated transport. Four call sites already broadcast it: `components/today/QuickLogForm.tsx:122`, `components/today/PtoQuickAction.tsx:119`, `components/today/LoggedToday.tsx:417,468`, and the outbox drain in `entrypoints/background.ts:52`. **None of these has a service-worker consumer yet — that is precisely what this story adds.** The payload they send is hardcoded `{ hoursMissing: 0 }` (a placeholder); the new handler MUST ignore it and recompute via `lib/badge.ts`.
- **`entrypoints/background.ts` (UPDATE):** Currently registers `token-refresh` (1 min) and `outbox-retry` (1 min) alarms and a single `chrome.alarms.onAlarm` listener that dispatches on `alarm.name`. The file header already lists "badge update alarm (Story 3.1)" as owned-here. Add the `badge-update` alarm (idempotent get-then-create) + the `onAlarm` branch + the `onMessage('badge-update')` handler. PRESERVE the existing token-refresh, outbox-retry, daily-reminder alarm setup and the `onInstalled` first-install options-page logic.
- **`lib/cycle-range.ts` (UPDATE, untracked/new):** `currentCycleRange(cycle, reference?)` returns `{ start, end }`. For `'weekly'`: start = Monday 00:00:00.000, end = Sunday 23:59:59.999. `isWithinCycle(date, cycle, reference?)`. There is NO Mon–Fri "workdays so far" counter — add one (Task 1).
- **`lib/hours.ts` (REUSE, untracked/new):** `SECONDS_PER_HOUR = 3600`, `secondsToHours(seconds)`, `hoursToSeconds(hours)`. Architecture rule (stated in `hours.ts`/`pto.ts`): **never inline `* 3600` or `/ 3600`** — always use these helpers.
- **`lib/jira-client.ts` (UPDATE):** `jiraGet<T>(path, schema)` already routes through `scheduler.acquire()` (rate limiting) + auth header + 401-then-refresh + returns `Result<T, JiraError>`. Build the week-worklog fetch on top of `jiraGet`. There is NO existing worklog-by-range fetcher and NO `getWorklogs` — you are adding it.
- **`lib/jira-types.ts` (UPDATE):** `JiraWorklogSchema` exists with `timeSpentSeconds: z.number()` (the field to sum), optional `started`, optional `author.accountId`. Add a worklog-list response schema reusing it. There is NO worklog-list schema yet.
- **`lib/storage/settings.ts` (REUSE):** `targetHoursItem` = `storage.defineItem<number>('local:targetHours', { fallback: 8 })` — this IS the daily target (no separate "daily target"). `approvalCycleItem` = `'local:approvalCycle'` fallback `'calendar-month'` (values: `'calendar-month' | 'weekly'`). Use `await targetHoursItem.getValue()`.
- **`lib/storage/tokens.ts` (REUSE):** `getAuth(): Promise<AuthBundle | null>` and `hasValidAuth(bundle): boolean`. Disconnected check pattern is already used in `background.ts:18-29`. (`getTokens`/`hasValidTokens` are deprecated aliases — use `getAuth`/`hasValidAuth`.)
- **`lib/disconnect.ts` (REFERENCE):** Line 40 already clears the badge with `await chrome.action.setBadgeText({ text: '' })` and logs `disconnect.badge-clear-failed` on failure. Mirror this clear-shape; disconnect already keeps the badge blank after a reset, so the badge-clear path is consistent.
- **`lib/scheduler.ts` (REUSE, transparent):** Already wraps every Jira call inside `jira-client`. You get rate limiting (NFR4 "bounded by ... rate-limit scheduler") for free — do not add your own throttling.
- **`lib/log.ts` (REUSE):** `import { log } from '@/lib/log';` Event names are dotted `noun.verb` strings, flat payloads, no PII. Use e.g. `badge.update.success`, `badge.update.skipped` (disconnected/marked-done), `badge.update.failed`.

### Does NOT exist yet — handle defensively / do NOT build here

- **Marked-as-done week flag (Epic 4 Story 4.5):** No `markDone`/`marked-done`/`weekDone` storage exists. AC #3 must be wired via an optional read that returns `false` when absent (e.g. a small helper, or an optional storage item that defaults `false`). Do NOT implement the Story 4.5 storage module or UI here — just make the badge skip when the flag is `true` so 4.5 integrates cleanly later.
- **Worklog read-back aggregation:** The Today view (`components/today/TodayView.tsx`) only sums optimistic React state (`loggedEntries`), it does NOT read worklogs back from Jira. There is nothing to reuse for badge aggregation — the badge owns its own fetch+sum.

### Current state of files this story UPDATES

- `entrypoints/background.ts`: `defineBackground(async () => {...})` sets up alarms (`token-refresh`, `outbox-retry`, `daily-reminder`), one `onAlarm` dispatcher, `handleOutboxRetry` (broadcasts `badge-update` on drain), and `onInstalled`. Must remain working end-to-end after edits.
- `lib/jira-client.ts`: GET/POST/PUT/DELETE wrappers + `postWorklog`/`updateWorklog`/`deleteWorklog`, all via `scheduler.acquire`. Add the read-only week-worklog fetch; do not alter existing exports.
- `lib/cycle-range.ts`, `lib/hours.ts`, `lib/jira-types.ts`, `lib/storage/settings.ts`: additive changes only.

### Project Structure Notes

- New module location is fixed by architecture: `lib/badge.ts` + `lib/badge.test.ts` (architecture.md lines 736–737: "Badge counter computation (FR15)"). Service worker wiring lives in `entrypoints/background.ts` (architecture.md line 963: "FR15 Badge counter → `lib/badge.ts` + `entrypoints/background.ts` (alarm)").
- Cross-cutting `lib/*` modules are unit-tested with co-located Vitest tests (architecture.md line 194/237). E2E is deferred.
- Tailwind/CSS tokens do NOT apply to the badge — Chrome renders the badge; we set only text + background color. The color is the literal `#dc2626` (the `state.danger` token; styles/globals.css line 37, UX spec line 655/684).

### Testing standards

- Vitest, co-located `*.test.ts`. chrome.* mocked via `vi.stubGlobal('chrome', {...})` (see `lib/disconnect.test.ts`); wxt storage + `@/lib/jira-client` + `@/lib/log` mocked via top-level `vi.mock(...)` with an in-memory `Map` (see `lib/storage/outbox.test.ts`); pure logic modules need no mocks (see `lib/cycle-range.test.ts`, `lib/hours.test.ts`). `afterEach(() => vi.unstubAllGlobals())`.
- Run `pnpm test` / `pnpm lint` / `pnpm typecheck` (confirm exact script names in `package.json`) before marking done. No `console.log` outside tests (ESLint).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1: Toolbar Badge Counter] (lines 872–909) — user story, ACs, deficit formula, test coverage list.
- [Source: _bmad-output/planning-artifacts/epics.md] line 259 — NFR4 badge cadence (≤30s local / 2min remote); line 231 — FR15.
- [Source: _bmad-output/planning-artifacts/architecture.md] lines 736–737 (`lib/badge.ts`), 963 (FR15 → badge.ts + background alarm), 87 (`chrome.alarms` 1-min min bounds cadence), 288 (`badge-update` SW→Popup broadcast), 862–875 (log-worklog data flow incl. badge broadcast).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] line 684 (toolbar badge `state.danger` when deficit > 0; nothing at 0), line 655 (`danger: '#dc2626'`), DR15 relief-moment / "discovery-of-gap → instant relief" (lines 47, 222).
- [Source: styles/globals.css line 37] `#dc2626`.
- Existing code: `lib/messages.ts` (badge-update schema), `entrypoints/background.ts` (alarms/onMessage pattern), `lib/disconnect.ts:40` (badge clear), `lib/storage/settings.ts` (targetHoursItem), `lib/storage/tokens.ts` (getAuth/hasValidAuth), `lib/jira-client.ts` (jiraGet + scheduler), `lib/cycle-range.ts`, `lib/hours.ts`, `lib/jira-types.ts` (JiraWorklogSchema), `lib/storage/outbox.test.ts` + `lib/disconnect.test.ts` (test mocking patterns).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- All 5 tasks implemented and verified. Badge deficit math is a pure, separately-tested `computeHoursMissing`; `updateBadge` orchestrates auth-check → marked-done-check → fetch → compute → render and is guaranteed never to throw (top-level try/catch).
- AC #3 (marked-done week) wired defensively via `storage.defineItem<boolean>('local:weekMarkedDone', { fallback: false })` — reads false until Epic 4 Story 4.5 starts writing the key. Story 4.5 storage module/UI intentionally NOT built here.
- AC #6 disconnected path clears the badge and returns before any fetch; transient fetch errors (rate-limited/network/auth-expired) leave the previous badge state untouched (not blanked).
- `fetchCurrentUserWeekWorklogs` routes 100% through `jiraGet` (scheduler + auth + 401-refresh + Result); resolves accountId via `rest/api/3/myself`, JQL-searches `worklogAuthor = currentUser()` for the week, then reads per-issue worklog lists and filters to the current user + `started` within range. PTO worklogs counted like any other.
- `entrypoints/background.ts`: idempotent `badge-update` alarm (30-min), `onAlarm` branch, `onMessage('badge-update')` consumer (ignores placeholder `hoursMissing` payload, recomputes authoritatively), and a boot-time `updateBadge()` (no-op when disconnected).
- Gates: `npm run test` → 40 files / 446 passed, 1 skipped; `npm run compile` (tsc --noEmit) → 0 errors; `npm run lint` (eslint) → exit 0 (54 pre-existing import/order warnings, none in story-3-1 files; 0 errors).

### File List

- lib/badge.ts (new)
- lib/badge.test.ts (new)
- lib/cycle-range.ts (modified — added `workdaysSoFar`)
- lib/cycle-range.test.ts (modified — added `workdaysSoFar` cases)
- lib/jira-client.ts (modified — added `fetchCurrentUserWeekWorklogs` + `toJqlDate`)
- lib/jira-client.test.ts (modified — added week-worklog fetcher tests)
- lib/jira-types.ts (modified — added `JiraWorklogListSchema` / `JiraWorklogList`)
- entrypoints/background.ts (modified — badge alarm + onAlarm branch + onMessage handler + boot recompute)
- lib/disconnect.ts (modified)
- lib/disconnect.test.ts (modified)

## Change Log

- 2026-06-22: Story 3.1 implemented — toolbar badge counter (FR15). Added `lib/badge.ts` (pure `computeHoursMissing` + `updateBadge` orchestrator), `workdaysSoFar` helper, current-week worklog fetcher (`fetchCurrentUserWeekWorklogs`) + worklog-list Zod schema, and service-worker wiring (30-min alarm, `badge-update` message consumer, boot recompute). Status → review.

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-06-21 — created (ready-for-dev)

; Epic 3 → in-progress
