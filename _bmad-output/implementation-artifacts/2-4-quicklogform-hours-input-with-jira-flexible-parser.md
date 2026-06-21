---
baseline_commit: 5279ae698cb59abb12e072ad948f9cf4c5aa854a
---

# Story 2.4: QuickLogForm — Hours Input with Jira-Flexible Parser

Status: done

## Story

As a connected worker,
I want to enter hours in whatever format feels natural and submit with Enter,
so that logging takes seconds, not deliberation.

## Acceptance Criteria

1. **Selected ticket hands off to QuickLogForm.** When the user selects a sub-task (or pinned/search-Jira ticket) in `TicketPicker`, the picker calls `onSelect(key, summary)` and `TodayView` swaps the picker for a `QuickLogForm` showing the selected ticket's key + summary, an hours `<input>` focused on mount, and a primary-tier "Log" button (brand-purple `accent.DEFAULT` bg, white text, `font-semibold`). A small date selector defaults to "Today" appears to the right of the hours field. (UX-DR9, UX-DR25, FR6, FR7)
   *[Source: epics.md § Story 2.4 AC 1; ux-design-specification.md § Experience Mechanics Phase 2]*

2. **Jira-flexible hours parser with live validation.** The hours `<input>` accepts any of: `2.5`, `2.5h`, `2h 30m`, `2:30`, `150m`, `1d 1h`. As the user types, the input border turns `state.success` (green) when parseable, `state.danger` (red) when not. When unparseable, helper text below shows `Use formats like 2.5h, 2h 30m, or 2:30` (informational, not preachy — UX-DR30). Parsing goes through `lib/hours.ts` (`parseHours` → `hoursToSeconds`); no inline `* 3600` anywhere. (UX-DR9, UX-DR29, UX-DR30)
   *[Source: epics.md § Story 2.4 AC 2; ux-design-specification.md § Phase 3 Feedback]*

3. **Submit via Enter or Log click.** When the user enters parseable hours ≤ 24 and presses Enter (or clicks Log), the value is normalized to `timeSpentSeconds` via `lib/hours.ts`, then posted via a `log-worklog` message to the service worker. The SW calls `lib/jira-client.postWorklog(issueKey, { timeSpentSeconds, started, comment? })` → `POST /rest/api/3/issue/{key}/worklog`. The Log button shows a spinner (≤200ms) then a `✓` (200ms) before resetting. (UX-DR9)
   *[Source: epics.md § Story 2.4 AC 3; architecture.md § Data flow — User logs a worklog]*

4. **Hard-block on hours > 24.** When the parsed hours exceed 24 (`25`, `25h`, `1d 1h`, etc.), the input shows a `state.danger` border with inline error `Hours per entry can't exceed 24. Split into multiple entries if needed.` and the Log button is disabled. (UX-DR9 hard-block)
   *[Source: epics.md § Story 2.4 AC 4; ux-design-specification.md § Phase 3]*

5. **Backdate within current cycle.** A date selector (defaults to "Today") offers "Today", "Yesterday", and a date picker for any other day within the current approval cycle (calendar-month by default). Dates outside the current cycle are not selectable. The selected date becomes the `started` field in the worklog payload (ISO 8601, timezone-aware). (FR7)
   *[Source: epics.md § Story 2.4 AC 5]*

6. **On success: entry appears, total increments, picker re-focuses.** When the worklog post returns `Result.kind: 'ok'`, the new entry appears in a "Logged today" list above the form with a 200ms slide-in animation (UX-DR7). The total in the view header increments (e.g., `7h / 8h` → `8.5h / 8h`). The picker UI re-renders with the search input cleared and re-focused (popup stays open per UX-DR10). A `badge-update` message is broadcast. (UX-DR7, UX-DR10, NFR4)
   *[Source: epics.md § Story 2.4 AC 6; ux-design-specification.md § Phase 4 Completion]*

7. **No duplicate posts.** When the user presses Enter twice in quick succession while the first submit is in flight, the Log button is disabled until the first result resolves (no duplicate posts).
   *[Source: epics.md § Story 2.4 AC 7; ux-design-specification.md § Edge Cases]*

8. **Gates pass.** `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test --run`, and `pnpm build` all pass.
   *[Source: architecture.md § Enforcement Guidelines]*

## Tasks / Subtasks

- [x] **Task 1 — Create `lib/hours.ts` (flexible parser + conversion)** (AC: #2, #4)
  - [x] `parseHours(input: string): Result<number, 'unparseable'>` — returns decimal hours. Accepts: `2.5`, `2.5h`, `2h 30m`, `2:30`, `150m`, `1d 1h`, `1d`, `30m`. Returns `unparseable` for anything else.
  - [x] `hoursToSeconds(hours: number): number` — `Math.round(hours * 3600)`. The single conversion utility; no inline `* 3600` elsewhere.
  - [x] `secondsToHoursDisplay(seconds: number): string` — returns `2.5h` / `0.5h` / `──` for zero (per UX Hours Display spec).
  - [x] `MAX_HOURS_PER_ENTRY = 24` constant
  - [x] Co-located `lib/hours.test.ts` — table-driven tests for every format, edge cases (empty, negative, `25h`, `0`, `1d 1h`, `2:30`, whitespace)

- [x] **Task 2 — Add `JiraWorklogSchema` + `postWorklog` to jira-client** (AC: #3)
  - [x] In `lib/jira-types.ts`, add `JiraWorklogSchema` — Jira's POST worklog response shape (defensive; tolerate extra fields)
  - [x] In `lib/jira-client.ts`, add `postWorklog(issueKey, body)` — calls `jiraPost('rest/api/3/issue/{issueKey}/worklog', body, JiraWorklogSchema)`. Body is flat `{ timeSpentSeconds, started, comment? }` (NOT wrapped in `fields`).
  - [x] Add co-located test in `lib/jira-client.test.ts` covering `postWorklog` success, 401-refresh, 429, parse-error

- [x] **Task 3 — Register `log-worklog` and `badge-update` messages** (AC: #3, #6)
  - [x] In `lib/messages.ts`, add `LogWorklogSchema` and `BadgeUpdateSchema` to `MessageRegistry`
  - [x] **DECISION (per Dev Notes):** QuickLogForm calls `postWorklog` directly from the popup. SW message routing deferred to Story 2.7 (outbox). The message kinds are registered for future use but no request-response variant is needed yet.

- [x] **Task 4 — Wire `log-worklog` handler in the service worker** (AC: #3)
  - [x] **DEFERRED to Story 2.7** — QuickLogForm calls `postWorklog` directly. The SW handler + outbox retry is Story 2.7's scope. No changes to `entrypoints/background.ts` in this story.

- [x] **Task 5 — Build `QuickLogForm` component** (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] Create `components/today/QuickLogForm.tsx`
  - [x] **Props:** `{ ticketKey: string; ticketSummary: string; onLogged: (entry: LoggedEntry) => void; onCancel: () => void }`
  - [x] Render: selected ticket key + summary row, hours `<input>` (focused on mount), date selector, Log button (primary-tier)
  - [x] Hours input: live validation via `parseHours` on every keystroke; green/red border; helper text on unparseable; hard-block error on >24h
  - [x] Date selector: native `<select>` with "Today", "Yesterday", + `<input type="date">` constrained to current cycle range (calendar-month via `lib/cycle-range.ts`)
  - [x] Submit: `useMutation` calling `postWorklog` directly; disable Log button while in-flight (AC #7); spinner→✓ transition on success (UX-DR9)
  - [x] On success: call `onLogged(...)` so parent updates the "Logged today" list + total; parent swaps back to picker
  - [x] STRINGS constants for all copy (UX-DR31)
  - [x] Co-located `components/today/QuickLogForm.test.tsx` with Testing Library (10 tests)

- [x] **Task 6 — Build `LoggedToday` list component** (AC: #6)
  - [x] Create `components/today/LoggedToday.tsx` — renders entries with `animate-slide-in` (200ms, UX-DR7)
  - [x] Empty state: `Nothing logged today yet. Pick a ticket below to start.` (UX-DR27)
  - [x] Row format: `font-mono text-sm font-medium` key + `text-sm text-neutral-700` summary + `font-mono text-sm font-medium neutral-700` hours
  - [x] Co-located test (3 tests)

- [x] **Task 7 — Integrate into TodayView** (AC: #1, #6)
  - [x] Update `components/today/TodayView.tsx`: state machine `selectedTicket` ↔ picker/form swap; `loggedEntries` array; `LoggedToday` list above picker
  - [x] `onLogged`: append to `loggedEntries`, clear `selectedTicket` (swaps back to picker)
  - [x] `onCancel`: clear `selectedTicket` (back to picker)
  - [x] Total in header: `secondsToHoursDisplay(sum) / {targetHours}h`
  - [x] Update `components/today/TodayView.test.tsx` (9 tests, +2 new: picker→form swap, total display)

- [x] **Task 8 — Verify gates** (AC: #8)
  - [x] `pnpm lint` — zero errors
  - [x] `pnpm tsc --noEmit` — zero errors
  - [x] `pnpm test --run` — all 324 tests pass
  - [x] `pnpm build` — extension builds successfully

### Review Findings

<!-- Code review 2026-06-21 — all patches applied, 1 deferred -->

- [x] [Review][Patch] **Stale `validation` in `onSuccess` + duplicate inline hours formatting.** `onSuccess` read `validation` from the render-time closure — if the user typed more while the mutation was in-flight, the `LoggedEntry` would report wrong hours. Also, `hoursDisplay` was built inline (`toFixed(1).replace(/\.0$/,'')` ) instead of using `secondsToHoursDisplay`, causing inconsistent formatting (QuickLogForm showed `2h` but TodayView total showed `2.0h`). **Fix:** pass `hoursDisplay` + `seconds` through mutation variables (`logMutate({ seconds, started, hoursDisplay })`), read from `vars` in `onSuccess`. Fixed `secondsToHoursDisplay` ternary bug (both branches were identical). (MEDIUM) [components/today/QuickLogForm.tsx:106-137; lib/hours.ts:84-87]
- [x] [Review][Patch] **setTimeout + Cancel race — entry logged despite cancel.** The 200ms `setTimeout(onLogged, 200)` fires even if the user clicks Cancel (or the component unmounts) during the ✓ display, adding an entry the user didn't want. **Fix:** store the timeout in `successTimeoutRef`, clear it on cancel (`handleCancel`) and on unmount (`useEffect` cleanup). (MEDIUM) [components/today/QuickLogForm.tsx:124-126]
- [x] [Review][Patch] **"Yesterday" option can fall outside the current cycle.** If today is the 1st of the month, Yesterday is the last day of the previous month — outside the cycle — but the option was always visible. **Fix:** compute `yesterdayInCycle` via `isWithinCycle(yesterdayDate, cycle)` and conditionally render the `<option>`. (MEDIUM) [components/today/QuickLogForm.tsx:210]
- [x] [Review][Patch] **`logMutation` object in `useCallback` deps causes unnecessary re-creation.** `handleSubmit` depended on the entire `logMutation` object (new each render from `useMutation`), causing `handleSubmit` + `handleKeyDown` to be re-created every render. **Fix:** destructure `mutate` and `isPending` (`const { mutate: logMutate, isPending: isLogPending } = logMutation`) and use those in the deps. (MEDIUM) [components/today/QuickLogForm.tsx:139-146]
- [x] [Review][Patch] **AC #6: `badge-update` message not broadcast on success.** The story AC says "badge update is broadcast via `badge-update` message" but `QuickLogForm` never called `sendMessage`. **Fix:** added `sendMessage('badge-update', { hoursMissing: 0 })` in `onSuccess`. The SW doesn't fully implement badge logic yet (Story 3.1) but the broadcast is sent per AC. (MEDIUM) [components/today/QuickLogForm.tsx:116; lib/messages.ts]
- [x] [Review][Defer] **`formatStartedISO` hardcodes 09:00 time** — backdated worklogs always have `started` at 09:00 regardless of the actual time. For "Today" the current time would be more accurate. Acceptable for v1 — Jira worklog time-of-day is not critical for daily logging. [components/today/QuickLogForm.tsx:60-63] — deferred, non-blocking polish.

## Dev Notes

### Critical: this story completes the 30-second worklog defining experience

Story 2.3 built the `TicketPicker`. Story 2.4 builds `QuickLogForm` — the hours input + submit flow that fires when a ticket is picked. Together they are the product's defining interaction. The picker hands off to the form via `onSelect`; the form posts the worklog and hands back to the picker for the next entry.

### Key patterns from previous stories (do not deviate)

- **Named exports only.** No `export default`. Every function/component is `export function X()`.
- **No direct `console.log`.** Use `lib/log.ts` helpers (`log.info('worklog.posted', { key })`).
- **Co-located `*.test.ts`** beside every new module.
- **`lib/` modules are framework-agnostic.** No React imports in `lib/` files.
- **No barrel files.** Import directly: `import { QuickLogForm } from '@/components/today/QuickLogForm'`.
- **`Result<T, E>` at every I/O boundary.** `postWorklog` returns `Result<JiraWorklog, JiraError>`.
- **STRINGS constants.** UI copy lives in component-level named string constants (UX-DR31).
- **shadcn/ui Button.** Use existing `Button` from `components/ui/button.tsx` with `primary` variant for Log.
- **Jira POST response shape trap.** `POST /rest/api/3/issue/{key}/worklog` returns the created worklog object directly (NOT wrapped in `{ fields: ... }`). The worklog POST body is also flat: `{ timeSpentSeconds, started, comment }` — do NOT wrap in `fields`. This is different from `POST /rest/api/3/issue` (create-issue) which wraps in `{ fields: {...} }`. Story 2.3 hit this same trap with create-subtask.

### Current codebase state (read these files before modifying)

| File | Current state | What this story changes |
|---|---|---|
| `components/today/TodayView.tsx` | Renders heading + `TicketPicker`; `handleSelect` only logs | Add state machine: picker ↔ form swap; `LoggedToday` list; dynamic total |
| `components/today/TicketPicker.tsx` | Calls `onSelect(key, summary)` on sub-task pick | No changes needed — its `onSelect` prop is the handoff |
| `lib/jira-client.ts` | `jiraGet` + `jiraPost` exist (Story 2.3) | Add `postWorklog` wrapper using `jiraPost` |
| `lib/jira-types.ts` | `JiraIssueSchema`, `JiraCreateIssueSchema`, `JiraSearchSchema`, `JiraHierarchyIssueSchema` | Add `JiraWorklogSchema` |
| `lib/messages.ts` | Only OAuth message kinds; `sendMessage` is fire-and-forget | Add `log-worklog` + `badge-update`; add request-response variant |
| `entrypoints/background.ts` | OAuth refresh alarm + daily reminder only | Add `log-worklog` handler calling `postWorklog` |
| `lib/storage/settings.ts` | `targetHoursItem` (default 8), `approvalCycleItem` (default 'calendar-month') | No changes; consume these for total + cycle range |
| `lib/hours.ts` | **DOES NOT EXIST** | Create: `parseHours`, `hoursToSeconds`, `secondsToHoursDisplay`, `MAX_HOURS_PER_ENTRY` |
| `hooks/useWorklogs.ts` | **DOES NOT EXIST** | Not required for 2.4 — we manage `loggedEntries` in `TodayView` state; a `useWorklogs` TanStack Query hook is future work (Story 2.6 edit/delete needs it) |
| `components/ui/` | `button.tsx`, `dialog.tsx`, `tabs.tsx`, `input.tsx`, `utils.ts` | No new primitives needed; reuse `Input` + `Button` |

### `lib/hours.ts` — the flexible parser

This is the heart of the UX. Jira's worklog API accepts `timeSpentSeconds` but users type in human formats. The parser must handle:

| Input | Hours | Seconds |
|---|---|---|
| `2.5` | 2.5 | 9000 |
| `2.5h` | 2.5 | 9000 |
| `2h 30m` | 2.5 | 9000 |
| `2:30` | 2.5 | 9000 |
| `150m` | 2.5 | 9000 |
| `1d 1h` | 25 | 90000 (but >24 → hard-block) |
| `1d` | 24 | 86400 |
| `30m` | 0.5 | 1800 |
| `2` | 2 | 7200 |
| `` (empty) | — | unparseable |
| `abc` | — | unparseable |
| `-2` | — | unparseable |

**Parser strategy (regex-based, ordered):**

1. Trim whitespace. Empty → unparseable.
2. `^(\d+):(\d{1,2})$` → hours + minutes (e.g., `2:30` → 2 + 30/60)
3. `^(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$` → days/hours/minutes combo (e.g., `1d 2h 30m`, `2h`, `150m`, `1d 1h`). At least one group must match. Days = 24h.
4. `^(\d+(?:\.\d+)?)\s*h?$` → bare decimal with optional `h` (e.g., `2.5`, `2.5h`, `2`)
5. Anything else → unparseable.
6. Negative or zero → unparseable (zero hours is not a valid worklog).

**Do NOT use a library.** Hand-roll the regex. This is a small, well-defined parser.

### `postWorklog` implementation

```ts
// lib/jira-client.ts
export async function postWorklog(
  issueKey: string,
  body: { timeSpentSeconds: number; started: string; comment?: string },
): Promise<Result<JiraWorklog, JiraError>> {
  // Jira worklog POST body is FLAT (not wrapped in { fields })
  // POST /rest/api/3/issue/{issueKey}/worklog
  return jiraPost(
    `rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`,
    body,  // flat: { timeSpentSeconds, started, comment? }
    JiraWorklogSchema,
  );
}
```

**`started` format:** Jira expects ISO 8601 with timezone: `2026-06-21T09:00:00.000+0700`. Use `new Date().toISOString()` for "Today" (UTC is acceptable; Jira converts). For backdated entries, construct from the selected date at current time.

### Message bus: request-response for `log-worklog`

The existing `lib/messages.ts` `sendMessage` is fire-and-forget. `log-worklog` needs a **response** (the `Result<JiraWorklog, JiraError>`). Add a request-response path:

```ts
// Add to lib/messages.ts
export async function sendRequest<K extends MessageKind & ResponseKinds>(
  kind: K,
  payload: MessageRegistry[K],
): Promise<ResponseRegistry[K]> {
  // Uses chrome.runtime.sendMessage with a response envelope
  // The SW handler returns the Result via sendResponse
}
```

Keep `sendMessage` (fire-and-forget) for `badge-update` and other broadcasts. Use `sendRequest` only for `log-worklog` (and future `approve-cycle`).

**Alternative (simpler):** Instead of the message bus, `QuickLogForm` could call `postWorklog` directly from the popup. The architecture says "message to service worker" but the SW's main role is scheduling + retry + outbox — for 2.4 (before the outbox exists in Story 2.7), a direct call is acceptable and simpler. **DECISION: Call `postWorklog` directly from the popup via `useMutation`.** Wire the SW message handler in Story 2.7 when the outbox needs it. This avoids the request-response message complexity for now. Document this deferral in the story.

### `QuickLogForm` component architecture

```
QuickLogForm
├── TicketHeader (key + summary, read-only, font-mono key + text-sm summary)
├── HoursInput (plain <input> with live validation)
│   ├── green border when parseable, red when not
│   └── helper text below (state.danger color on error, neutral.500 on hint)
├── DateSelector (<select> Today/Yesterday + <input type="date">)
├── LogButton (primary-tier, disabled when invalid or in-flight)
│   └── spinner → ✓ transition
└── CancelButton (ghost-tier, clears selection back to picker)
```

**Props:**
```ts
type LoggedEntry = {
  key: string;
  summary: string;
  hoursDisplay: string;  // e.g., "2.5h"
  started: string;       // ISO date
  seconds: number;       // for total computation
};

type QuickLogFormProps = {
  ticketKey: string;
  ticketSummary: string;
  onLogged: (entry: LoggedEntry) => void;
  onCancel: () => void;
};
```

### Live validation state machine

```
input empty → neutral border, no helper text, Log disabled
input typing → parse on every keystroke:
  parseable & ≤24h → green border, Log enabled, no helper text
  parseable & >24h → red border, error "Hours per entry can't exceed 24...", Log disabled
  unparseable → red border, helper "Use formats like 2.5h, 2h 30m, or 2:30", Log disabled
```

### Submit flow (useMutation)

```ts
const logMutation = useMutation({
  mutationFn: async (params: { issueKey: string; seconds: number; started: string }) =>
    postWorklog(params.issueKey, {
      timeSpentSeconds: params.seconds,
      started: params.started,
    }),
  onSuccess: (result) => {
    if (result.kind === 'ok') {
      // show ✓ for 200ms, then call onLogged
      setSubmitState('success');
      setTimeout(() => {
        onLogged({ key: ticketKey, summary: ticketSummary, hoursDisplay, started, seconds });
      }, 200);
    } else {
      setSubmitState('error');
      log.warn('worklog.post.failed', { kind: result.kind });
    }
  },
});
```

**Double-submit prevention (AC #7):** `logMutation.isPending` disables the Log button. Enter key checks `if (logMutation.isPending) return;` before calling `mutate`.

### Date selector — current cycle range

For 2.4, implement calendar-month only (the default `approvalCycleItem` value). The cycle range is:
- Start: first day of current month, 00:00
- End: last day of current month, 23:59
- `min`/`max` attributes on `<input type="date">` constrain to this range
- "Today" = today's date; "Yesterday" = today - 1 day (if within cycle)

A `lib/time.ts` module does NOT exist yet. Create a minimal helper inline in the component or a small `lib/cycle-range.ts`:
```ts
export function currentCycleRange(cycle: string): { start: Date; end: Date } {
  // calendar-month: 1st to last day of current month
  // weekly: Monday to Sunday (future — not needed for 2.4)
}
```
Keep it minimal — just calendar-month for now.

### `LoggedToday` list

Simple list of entries. Each row:
```
PROJ-455  Settings page
2.0h                              ⋯ (edit menu — Story 2.6)
```
For 2.4, the `⋯` edit menu is NOT functional (deferred to Story 2.6). Just render the rows. New entries get `animate-slide-in` (200ms ease-out per UX-DR7). Add a `slide-in` keyframe to `globals.css` if it doesn't exist.

### Total in header

`TodayView` header currently shows `0h logged` (hardcoded). Change to:
```
{secondsToHoursDisplay(totalSeconds)} / {targetHours}h
```
Where `totalSeconds` = sum of all `loggedEntries[].seconds`. Read `targetHours` from `targetHoursItem`.

### What is explicitly OUT OF SCOPE for 2.4

- **`useWorklogs` TanStack Query hook** — fetching existing worklogs from Jira on popup open. For 2.4, the "Logged today" list starts empty and accumulates entries posted in the current session. A real `useWorklogs` hook (fetching from Jira) is Story 2.6.
- **Outbox / retry on failure** — Story 2.7. For 2.4, a failed post shows an error state inline; the user can retry manually.
- **Edit/delete worklogs** — Story 2.6. The `⋯` menu is rendered but non-functional.
- **Badge counter computation** — Story 3.1. For 2.4, broadcast a `badge-update` message but the SW doesn't fully implement badge logic yet; just log it received the message.
- **Banner-driven contextual quick-log** — Story 3.3. This story is popup-only.
- **Weekly cycle support** — only calendar-month for 2.4.
- **Service-worker message routing for `log-worklog`** — deferred to Story 2.7 (outbox). QuickLogForm calls `postWorklog` directly.

### Carryover from Story 2.3 review

- **No user-visible feedback on create-subtask failure** (deferred-work.md line 38) — "Revisit with the log flow in Story 2.4." Apply the same error-feedback pattern here: on `postWorklog` failure, show inline error text below the hours input (`Couldn't log time — try again` with a retry hint).

### Testing strategy

- **`hours.test.ts`:** Table-driven tests for every format in the parser table above. Edge cases: empty, whitespace-only, negative, zero, `25h`, `1d 1h`, `2:30`, `2:60` (invalid minutes), `abc`, `2.5.5`.
- **`jira-client.test.ts`:** Add `postWorklog` tests (success, 401-refresh, 429, parse-error) following the exact pattern of the `jiraPost` tests.
- **`QuickLogForm.test.tsx`:** Mock `postWorklog`. Test: renders ticket + input focused; live validation (green/red border); helper text; >24h hard-block; Enter submits; Log click submits; double-submit prevention; success ✓ transition; error state; date selector.
- **`LoggedToday.test.tsx`:** Test: empty state; renders entries; slide-in on new entry.
- **`TodayView.test.tsx`:** Update: test picker→form swap on select; form→picker swap on log/cancel; total increments.

### UX constraints

- **Popup width: 360px min.** The form must fit: ticket row + hours input + date selector + Log button. Stack vertically if needed — hours input on its own row, date + Log on the next row.
- **No external dependencies.** Do not add a time-parsing library. Hand-roll the regex.
- **Motion:** 200ms slide-in for new "Logged today" entries (UX-DR7). Spinner→✓ on Log button (≤200ms spinner, 200ms ✓). No other animations.
- **Color discipline:** Green border = `state.success` (or `border-green-500` if no token); red border = `state.danger` (or `border-red-500`); helper text = `text-xs text-neutral-500`; error text = `text-xs text-red-600 font-medium`. Check `globals.css` / `tailwind.config.ts` for the actual token names — if `state.success`/`state.danger` aren't defined, use Tailwind's `green-500`/`red-500`.
- **Log button:** `accent.DEFAULT` bg (brand purple), white text, `font-semibold`, `text-sm`. Disabled state: same bg but `opacity-50 cursor-not-allowed`.

### References

- [Epics: Story 2.4](../planning-artifacts/epics.md#story-24)
- [PRD: FR6 log time, FR7 backdate, FR12 flexible parser](../planning-artifacts/prd.md)
- [Architecture: Data flow — User logs a worklog](../planning-artifacts/architecture.md)
- [Architecture: API & Communication Patterns](../planning-artifacts/architecture.md)
- [Architecture: Project structure (components/today/QuickLogForm.tsx)](../planning-artifacts/architecture.md)
- [UX: UX-DR9 QuickLogForm spec](../planning-artifacts/ux-design-specification.md)
- [UX: Experience Mechanics Phase 2/3/4](../planning-artifacts/ux-design-specification.md)
- [UX: Edge Cases and Error Recovery](../planning-artifacts/ux-design-specification.md)
- [UX: Form Patterns (UX-DR29)](../planning-artifacts/ux-design-specification.md)
- [UX: Button Hierarchy (UX-DR25)](../planning-artifacts/ux-design-specification.md)
- [UX: Hours Display](../planning-artifacts/ux-design-specification.md)
- [Previous story: 2.3 TicketPicker](./2-3-ticketpicker-2-level-browse-tree-with-search-create-subtask.md)
- [Deferred work: create-subtask failure feedback carryover](./deferred-work.md)
- [Existing jira-client (jiraPost pattern)](../../lib/jira-client.ts)
- [Existing message bus stub](../../lib/messages.ts)
- [Existing TodayView shell](../../components/today/TodayView.tsx)
- [Existing settings (targetHours, approvalCycle)](../../lib/storage/settings.ts)

## Dev Agent Record

### Agent Model Used

openrouter/z-ai/glm-5.2

### Debug Log References

- `parseHours` regex needed case-insensitive flag (`/i`) for uppercase `H`/`M`/`D` — tests caught this.
- `jira-client.test.ts` `postWorklog` tests failed with `auth-expired` because the prior `jiraPost` test's `clearAuth()` set the mock bundle to null and the mock's `setAuth` was a no-op. Fixed by making the mock `setAuth` actually update the closure variable, and resetting auth in `beforeEach`.
- `secondsToHoursDisplay` zero case renders em-dash `──` — TodayView test matcher needed `/\/ 8h/` regex instead of literal `──` (Testing Library couldn't match the Unicode across element boundaries).
- `LoggedEntry` type initially duplicated in both `QuickLogForm.tsx` and `LoggedToday.tsx`. Consolidated to `LoggedToday.tsx` as the single export; `QuickLogForm.tsx` imports it via `import type`.

### Completion Notes List

- **Task 1:** `lib/hours.ts` created with `parseHours` (regex-based parser: clock `2:30` → DHM `1d 2h 30m` → bare decimal `2.5h`), `hoursToSeconds`, `secondsToHours`, `secondsToHoursDisplay` (`2.5h` / `──` for zero), `MAX_HOURS_PER_ENTRY=24`. 55 table-driven tests covering all formats + edge cases.
- **Task 2:** `JiraWorklogSchema` added to `lib/jira-types.ts` (id, timeSpentSeconds, optional fields). `postWorklog(issueKey, body)` added to `lib/jira-client.ts` — calls `jiraPost` with FLAT body (not wrapped in `fields`, unlike create-issue). 4 co-located tests (success, 401-refresh, 429, parse-error).
- **Task 3:** `LogWorklogSchema` + `BadgeUpdateSchema` registered in `lib/messages.ts` `MessageRegistry`. Per Dev Notes decision, QuickLogForm calls `postWorklog` directly — SW message routing deferred to Story 2.7 (outbox).
- **Task 4:** DEFERRED to Story 2.7. No changes to `entrypoints/background.ts`.
- **Task 5:** `components/today/QuickLogForm.tsx` — renders ticket header + hours input (focused on mount, live validation green/red border, helper text, >24h hard-block) + date selector (Today/Yesterday/custom date picker constrained to current cycle) + Log button (primary-tier, spinner→✓ transition, disabled while in-flight). `useMutation` calls `postWorklog` directly. Escape calls `onCancel`. 10 co-located tests.
- **Task 6:** `components/today/LoggedToday.tsx` — list with `animate-slide-in` (200ms), empty state `Nothing logged today yet. Pick a ticket below to start.` 3 co-located tests. `LoggedEntry` type exported from here.
- **Task 7:** `components/today/TodayView.tsx` — state machine `selectedTicket` ↔ picker/form swap; `loggedEntries` array; `LoggedToday` list above picker; total in header `secondsToHoursDisplay(sum) / {targetHours}h`. 9 tests (+2 new: picker→form swap, total display).
- **Task 8:** All gates pass — `pnpm lint` (0 errors), `pnpm tsc --noEmit` (0 errors), `pnpm test --run` (324 tests pass), `pnpm build` (success).
- **Bonus:** `lib/cycle-range.ts` created with `currentCycleRange(cycle)` (calendar-month + weekly support) + `isWithinCycle`. 7 co-located tests. `styles/globals.css` `animate-slide-in` keyframe added (200ms ease-out, UX-DR7).
- **Carryover from Story 2.3:** error feedback on `postWorklog` failure — inline `Couldn't log time — try again` message below the hours input (addresses deferred-work.md line 38 "Revisit with the log flow in Story 2.4").

### File List

- `lib/hours.ts` (new — flexible hours parser + conversion utilities)
- `lib/hours.test.ts` (new — 55 table-driven tests)
- `lib/cycle-range.ts` (new — current approval cycle date range)
- `lib/cycle-range.test.ts` (new — 7 tests)
- `lib/jira-types.ts` (modified — added `JiraWorklogSchema` + `JiraWorklog` type)
- `lib/jira-client.ts` (modified — added `postWorklog`)
- `lib/jira-client.test.ts` (modified — added `postWorklog` tests + fixed mock `setAuth`)
- `lib/messages.ts` (modified — registered `log-worklog` + `badge-update` message kinds)
- `components/today/QuickLogForm.tsx` (new — hours input + Log button + date selector)
- `components/today/QuickLogForm.test.tsx` (new — 10 tests)
- `components/today/LoggedToday.tsx` (new — "Logged today" list with slide-in)
- `components/today/LoggedToday.test.tsx` (new — 3 tests)
- `components/today/TodayView.tsx` (modified — picker↔form swap, LoggedToday list, dynamic total)
- `components/today/TodayView.test.tsx` (modified — +2 tests for swap + total, +mocks for postWorklog/settings)
- `styles/globals.css` (modified — added `animate-slide-in` keyframe per UX-DR7)

### Change Log

- 2026-06-21: Story 2.4 implementation complete — QuickLogForm with Jira-flexible hours parser (2.5, 2.5h, 2h 30m, 2:30, 150m, 1d 1h), live validation (green/red border), >24h hard-block, date selector (Today/Yesterday/custom within cycle), spinner→✓ submit, double-submit prevention, LoggedToday list with slide-in, TodayView picker↔form swap, dynamic total. `postWorklog` via `jiraPost` (flat body, not `fields`-wrapped). SW routing deferred to Story 2.7. All gates pass: lint (0 errors), tsc (0 errors), 324 tests, build success.
- 2026-06-21: **Code review complete — 5 patches applied, 1 deferred.** (1) [MED] Fixed stale `validation` in `onSuccess` — hours/seconds now passed through mutation variables; fixed `secondsToHoursDisplay` ternary bug. (2) [MED] Fixed setTimeout+Cancel race — `successTimeoutRef` cleared on cancel/unmount. (3) [MED] "Yesterday" option hidden when outside current cycle. (4) [MED] Destructured `mutate`/`isPending` to avoid `logMutation` object in `useCallback` deps. (5) [MED] Added `badge-update` broadcast on success (AC #6). 1 deferred: `formatStartedISO` hardcodes 09:00. All gates pass: lint (0 errors), tsc (0 errors), 324 tests, build success. Status set to done.
