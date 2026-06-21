---
baseline_commit: 6f77d95
---

# Story 2.5: Catch-All Picker & One-Click PTO Action

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a connected worker,
I want to log time against shared catch-all subtasks (Admin / Meetings) and mark today as full or half PTO with one click,
so that non-project time has a fast path.

## Acceptance Criteria

1. **Catch-all group lists project subtasks as a flat list.** Given the catch-all project is configured (Story 1.5 — `catchAllProjectKeyItem`, default `KNP`), when the Today picker renders, a catch-all group ("▾ Catch-all (`<projectKey>`)") appears in the picker tree listing **all sub-tasks within that project as a flat list** (no Task→Subtask nesting). Each row renders the key in `font-mono text-sm font-medium neutral-900` + summary in `text-sm neutral-700`, identical to other picker rows. (FR10)
   *[Source: epics.md § Story 2.5 AC 1; prd.md FR10; ux-design-specification.md § Component Strategy "TicketPicker" anatomy + Experience Mechanics Phase 2 — catch-all section]*

2. **Catch-all selection hands off to the same QuickLogForm.** Given the catch-all group is rendered, when the worker clicks any catch-all sub-task row, the picker calls the **same `onSelect(key, summary)` handoff** as a hierarchy ticket — `TodayView` swaps to the existing `QuickLogForm` unchanged. The worker **cannot create new catch-all subtasks from this UI** (catch-all subtasks are pre-existing shared subtasks managed at the project level — no "+ Create my subtask" affordance in the catch-all group). (FR10)
   *[Source: epics.md § Story 2.5 AC 1; prd.md FR10 "workers do not create their own catch-all subtasks"]*

3. **Catch-all unconfigured → group hidden, non-blocking placeholder, project work still works.** Given the catch-all project key resolves to empty/unset, when the Today picker renders, the catch-all group is **hidden entirely** and a non-blocking placeholder appears above the picker reading `Catch-all not configured. Configure in Settings to log Admin/Meetings/PTO.` where "Settings" is a link that opens the options page via `chrome.runtime.openOptionsPage()`. The hierarchy picker continues to work — the worker can still log project subtasks. Never throw, never block the core log flow. (FR10; graceful degradation — binding)
   *[Source: epics.md § Story 2.5 AC 2; architecture.md § Graceful Degradation Behavior "Catch-all project not configured" row + binding implementation rule; ux-design-specification.md § Experience Principle 7 "If catch-all is not configured, hide the catch-all column"]*

   > **Note on "unconfigured":** `catchAllProjectKeyItem` has a non-null fallback `'KNP'`, so it is rarely literally empty. Treat the catch-all group as hidden when the project key is blank/whitespace OR when the live sub-task fetch returns zero issues (e.g., bad project key). Show the placeholder only when the key is blank; if the key is set but the fetch fails or is empty, render the group with a small empty/error state inside it (do not block).

4. **"Mark today as PTO" affordance with Full/Half popover.** Given the Today view is open and a PTO subtask is configured (`ptoSubtaskKeyItem` is non-null), when the page renders, a **primary-tier "Mark today as PTO" affordance is visible near the top of the Today view** (below the header, above or beside the picker). Clicking it opens a small inline popover containing two buttons: **"Full day (Xh)"** using the configured `targetHoursItem` (default 8), and **"Half day (X/2 h)"** showing half the target (e.g. `Half day (4h)`). The popover is dismissable via Esc and by clicking outside; focus moves into the popover on open and returns to the trigger on close. (FR11)
   *[Source: epics.md § Story 2.5 AC 3; prd.md FR11; ux-design-specification.md § Button Hierarchy "Primary" tier, § Modal & Overlay Patterns "Popover" rules, § Roadmap Phase 1 "PtoQuickAction"]*

5. **Full-day PTO posts one worklog at target hours.** Given the PTO popover is open, when the user clicks "Full day", a single worklog is posted via `lib/pto.ts` → `jira-client.postWorklog` to the configured PTO subtask (`ptoSubtaskKeyItem`) with `timeSpentSeconds = hoursToSeconds(targetHours)` and `started = <today ISO>`. On success the entry appears in the "Logged today" list (via the same `LoggedEntry` shape / `onLogged` path as `QuickLogForm`), the header total increments, and a `badge-update` message is broadcast. No inline `* 3600` — use `lib/hours.ts` `hoursToSeconds`. (FR11)
   *[Source: epics.md § Story 2.5 AC 4; prd.md FR11; architecture.md § "Hours format" one-conversion-utility rule, § lib/pto.ts]*

6. **Half-day PTO posts one worklog at half target.** Given the PTO popover is open, when the user clicks "Half day", the worklog is posted with `timeSpentSeconds = hoursToSeconds(targetHours / 2)` (everything else identical to AC 5). (FR11, FR23 half-day semantics)
   *[Source: epics.md § Story 2.5 AC 5; prd.md FR11]*

7. **PTO unconfigured (but catch-all configured) → disabled affordance with tooltip + deep link.** Given the PTO subtask is unconfigured (`ptoSubtaskKeyItem` is `null`) while the catch-all project IS configured, when the Today view renders, the "Mark today as PTO" affordance renders **disabled** (same primary visual but `neutral.300` text + `cursor-not-allowed`) with a tooltip/helper reading `PTO subtask not configured. Configure in Settings.` linking to the options page (`chrome.runtime.openOptionsPage()`). The worker can still log project hours and non-PTO catch-all work. Never a mystery-disabled button. (FR11; graceful degradation — binding)
   *[Source: epics.md § Story 2.5 AC 6; architecture.md § Graceful Degradation Behavior "PTO subtask not configured" row; 1-5 AC 5; ux-design-specification.md § Button Hierarchy "Disabled buttons … always paired with an explanation … never a mystery-disabled button"]*

8. **PTO post failure shows inline error, does not crash.** Given a PTO worklog post returns a non-`ok` `Result` (rate-limited / network / forbidden / parse-error / auth-expired), when the failure is observed, the popover shows an inline error (`Couldn't mark PTO — try again`) and the affordance is re-enabled for retry. No entry is added to "Logged today". No toast, no throw. (carryover from Story 2.3/2.4 "no silent failure" — deferred-work.md)
   *[Source: deferred-work.md § Story 2.3 "no user-visible feedback on create-subtask failure"; Story 2.4 error-feedback pattern; architecture.md § Result<T, JiraError> consumer dispatch]*

9. **Gates pass.** `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test --run`, and `pnpm build` all pass. New `lib/` modules have co-located `*.test.ts`; new components have co-located `*.test.tsx`.
   *[Source: architecture.md § Enforcement Guidelines, § Testing standards (co-located Vitest tests)]*

## Tasks / Subtasks

- [x] **Task 1 — Create `lib/catch-all.ts` (fetch catch-all subtasks)** (AC: #1, #3)
  - [x] `export async function fetchCatchAllSubtasks(projectKey: string): Promise<Result<{ key: string; summary: string }[], JiraError>>`
  - [x] JQL pattern (reuse Story 1.5's established pattern): `project=<KEY> AND issuetype=Sub-task`, `maxResults=50`. Build the URL the same way `lib/ticket-search.ts` does — `rest/api/3/search/jql?jql=<encoded>` via `jiraGet(url, JiraSearchSchema)`. (Verified endpoint `/rest/api/3/search/jql` against `ticket-search.ts`.)
  - [x] Trim/uppercase + blank-guard: if `projectKey.trim()` is empty, return `{ kind: 'ok', value: [] }` without an HTTP call.
  - [x] **Escape the project key** in JQL — `encodeURIComponent` the full JQL string (matches `ticket-search.ts`).
  - [x] Map `JiraSearch.issues[]` → `{ key, summary: fields.summary }`.
  - [x] Co-located `lib/catch-all.test.ts`: success returns mapped subtasks; empty project key short-circuits to `[]` (asserts `jiraGet` not called); 429 → `rate-limited`; parse-error; empty issues array → `[]`; URL-shape assertion.

- [x] **Task 2 — Create `lib/pto.ts` (PTO worklog helpers)** (AC: #5, #6)
  - [x] `export async function logFullDayPto(...)` → `postWorklog(ptoSubtaskKey, { timeSpentSeconds: hoursToSeconds(targetHours), started })`
  - [x] `export async function logHalfDayPto(...)` → `hoursToSeconds(targetHours / 2)`
  - [x] Use `hoursToSeconds` from `lib/hours.ts` — NO inline `* 3600`.
  - [x] Extracted `formatStartedISO` to new `lib/worklog-date.ts` (shared by `QuickLogForm` and `PtoQuickAction`); also `formatDateForInput`/`todayDateString`. `pto.ts` takes `started` as a param (stays time-pure).
  - [x] No React imports — framework-agnostic.
  - [x] Co-located `lib/pto.test.ts`: full-day posts `targetHours*3600`; half-day posts `(targetHours/2)*3600`; odd target (7); `started` passthrough; non-ok Result surfaced. Plus `lib/worklog-date.test.ts`.

- [x] **Task 3 — Build `CatchAllGroup` rendering inside `TicketPicker`** (AC: #1, #2)
  - [x] Added a catch-all group below the hierarchy source groups (above the no-results block and Search-Jira footer), using `Disclosure` + `TicketRow` (label `Catch-all (<projectKey>)`, flat list — no `TaskDisclosure`, no create-subtask affordance).
  - [x] Fetch via `useQuery` keyed `['catch-all', projectKey]` calling `fetchCatchAllSubtasks`, `staleTime: 5 min`, `enabled` only when key non-blank. Reads `catchAllProjectKeyItem`.
  - [x] Rows reuse `TicketRow` (role/data-attr/aria-label/keyboard nav free).
  - [x] Catch-all rows participate in `matchesFilter` and arrow-key navigation.
  - [x] Group hidden when project key blank; inside-group loading/empty/error states (non-blocking).
  - [x] `onSelect(key, summary)` contract unchanged — catch-all selection flows through `handleSelect`.

- [x] **Task 4 — Add catch-all-unconfigured placeholder to `TodayView`** (AC: #3)
  - [x] `TodayView` reads `catchAllProjectKeyItem`; when blank/whitespace, renders a non-blocking placeholder with a "Settings" `<button>` calling `chrome.runtime.openOptionsPage()`.
  - [x] `text-sm text-neutral-500`, centered, no icon. Does not block the picker.

- [x] **Task 5 — Build `PtoQuickAction` component** (AC: #4, #5, #6, #7, #8)
  - [x] Created `components/today/PtoQuickAction.tsx`.
  - [x] Props `{ onLogged: (entry: LoggedEntry) => void }` reusing `LoggedEntry` from `LoggedToday`.
  - [x] Reads `ptoSubtaskKeyItem`/`ptoSubtaskSummaryItem`/`targetHoursItem` on mount.
  - [x] Primary-tier `Button` trigger "Mark today as PTO".
  - [x] Disabled state (PTO `null`): disabled primary button + `aria-disabled` + discoverable helper text with a Settings link to the options page.
  - [x] Lightweight inline popover (no `@radix-ui/react-popover`): `aria-haspopup`/`aria-expanded`, `role="menu"`/`menuitem`, Esc + click-outside dismissal, focus first action on open, restore focus to trigger on close.
  - [x] `useMutation` → `logFullDayPto`/`logHalfDayPto`; on ok builds `LoggedEntry`, calls `onLogged`, `sendMessage('badge-update', { hoursMissing: 0 })`, brief ✓; on non-ok inline error `Couldn't mark PTO — try again`, re-enabled, no entry.
  - [x] Both buttons disabled while in-flight (no double-post).
  - [x] `STRINGS` named constant for all copy.
  - [x] Co-located `components/today/PtoQuickAction.test.tsx` (7 cases): trigger, disabled+explanation, popover Full/Half hours, Full posts target, Half posts half, success onLogged+badge, error inline, Esc closes.

- [x] **Task 6 — Wire `PtoQuickAction` + catch-all into `TodayView`** (AC: #3, #4, #5, #6)
  - [x] Renders `<PtoQuickAction onLogged={handleLogged} />` near the top of `TodayView`.
  - [x] Renders the catch-all-unconfigured placeholder above the picker/list.
  - [x] No change to `QuickLogForm` swap logic.
  - [x] Updated `TodayView.test.tsx`: PTO action renders; full-day PTO appends entry + total increments; catch-all placeholder when key blank. Added mocks for new settings items, `lib/pto`, `lib/catch-all`, `lib/messages`, chrome stub.

- [x] **Task 7 — (Optional) Options-page deep-link anchor** (AC: #3, #7) — Deliberately not done. `CatchAllProjectField` is not wrapped in its own `<section>` in `entrypoints/options/App.tsx` (it shares a section with other fields), so adding an `id` anchor would require restructuring, which is beyond "only if trivial". `chrome.runtime.openOptionsPage()` satisfies the AC.

- [x] **Task 8 — Verify gates** (AC: #9)
  - [x] `npm run lint` (0 errors), `npm run compile` / `tsc --noEmit` (0 errors), `npm run test` (353 passed, 1 skipped), `npm run build` (success). Project uses npm, not pnpm.

## Dev Notes

### What this story adds (and what it deliberately reuses)

Story 2.5 adds two **fast paths** on top of the now-complete 30-second log flow (Stories 2.1–2.4):
1. A **catch-all subtask group** in the existing `TicketPicker` (flat list, hands off to the existing `QuickLogForm` — minimal new surface).
2. A **one-click PTO action** (`PtoQuickAction`) that posts a worklog directly without the form.

**Reuse aggressively. Do not reinvent.** The log-flow, hours conversion, `LoggedEntry` shape, `postWorklog`, settings storage, and picker primitives all already exist. This story is mostly composition + two thin `lib/` modules.

### ⚠️ Documentation-vs-reality reconciliation (read this — it will save you a review cycle)

The epics.md ACs reference IDs (`AR28`, `UX-DR8/9/10/25/27/29/31/32`) that **do not literally exist** in `architecture.md` or `ux-design-specification.md`. They are shorthand. The real anchors:
- **`AR28` / graceful degradation** → architecture.md § "Graceful Degradation Behavior" (the catch-all and PTO rows are quoted in the ACs). Binding rule: *"Any feature whose precondition is missing renders a non-blocking placeholder with a deep link to the relevant settings field. Never throw, never block the core log-my-time flow."*
- **`UX-DR25` (button hierarchy)** → ux-design-specification.md § "Button Hierarchy": Primary = `accent.DEFAULT` bg + white text + `font-semibold`; disabled = same tier visual but `neutral.300` text + `cursor-not-allowed`, **always paired with an explanation**.
- **`UX-DR27` (empty states)** → § "Empty States": descriptive (not aspirational) copy, offer the next action, `text-sm neutral.500`, no icons.
- **Popover** → § "Modal & Overlay Patterns": *"No backdrop, focus moves into popover, Esc closes; opens adjacent to trigger."*
- The exact placeholder/tooltip strings in the ACs are **authored by this story** (the specs mandate the pattern, not verbatim strings) — use the strings given in the ACs above.

### ⚠️ Popover decision — DO NOT add `@radix-ui/react-popover`

`components/ui/popover.tsx` does **not** exist and `@radix-ui/react-popover` is **not** in `package.json` (only `@radix-ui/react-dialog` and `@radix-ui/react-tabs` are installed). The architecture lists `popover` as a future shadcn primitive **for the Week-view `PtoPopover` (FR23)** — that is a different, later component (Epic 4). For this Today-view `PtoQuickAction`, build a **lightweight inline popover** (a positioned `<div>` toggled by the trigger button, with manual Esc + click-outside handlers and focus management) — consistent with the project's "native `<details>` is lighter than a component" ethos (see `TicketPicker`'s `Disclosure`). This avoids a new dependency for a 2-button menu. Implement:
- Open state toggled by the trigger button (`aria-expanded`, `aria-haspopup="true"`).
- `Esc` keydown closes; a `pointerdown`/`click` listener on `document` closes when clicking outside (clean it up on unmount).
- On open, focus the first action button; on close, return focus to the trigger.
- `role="menu"` / action buttons `role="menuitem"` (or a simple labelled group) — keep it accessible. Each button gets a clear `aria-label` (e.g. `Mark today as full-day PTO (8h)`).

> **If the reviewer disagrees** and wants the shared shadcn `popover` primitive, that's a small follow-up — but adding a dependency is out of scope for a one-click action. Documented decision.

### Key patterns from previous stories (do not deviate)

- **Named exports only.** No `export default`. `export function X()`.
- **No direct `console.log`.** Use `lib/log.ts` (`log.info('pto.posted', { key })`, `log.warn('catchall.fetch.failed', { kind })`).
- **Co-located `*.test.ts`/`*.test.tsx`** beside every new module/component (binding — architecture Enforcement Guidelines).
- **`lib/` modules are framework-agnostic** — no React imports in `lib/catch-all.ts` or `lib/pto.ts`.
- **No barrel files.** Import directly: `import { logFullDayPto } from '@/lib/pto'`.
- **`Result<T, JiraError>` at every I/O boundary.** `fetchCatchAllSubtasks` and the `pto.ts` helpers return `Result`; consumers dispatch on `.kind`.
- **`@/` path alias** — never `../../`.
- **`STRINGS` constants** for all UI copy (forward-compat i18n; English-only v1).
- **shadcn `Button`** from `components/ui/button.tsx` — `variant="primary"` for the PTO trigger + actions; `variant="ghost"` for cancel/dismiss.
- **One conversion utility.** `hoursToSeconds` / `secondsToHoursDisplay` from `lib/hours.ts`. **NEVER inline `* 3600`** (architecture binding; Story 2.4 enforced this).
- **Jira worklog POST body is FLAT** — `postWorklog(key, { timeSpentSeconds, started, comment? })`, NOT wrapped in `{ fields }`. (Story 2.4 trap — already handled by `postWorklog`.)

### Current codebase state (read these files before modifying)

| File | Current state | What this story changes |
|---|---|---|
| `components/today/TodayView.tsx` | Header + total; `LoggedToday` list; picker↔`QuickLogForm` swap; `handleSelect`/`handleLogged`/`handleCancel`; reads `targetHoursItem` | Add `<PtoQuickAction onLogged={handleLogged}>` near top; add catch-all-unconfigured placeholder; read `catchAllProjectKeyItem` |
| `components/today/TicketPicker.tsx` | 2-level hierarchy tree + pinned + Search-Jira; `Disclosure`/`TaskDisclosure`/`TicketRow` helpers; `onSelect(key, summary)` handoff; arrow-key nav over `button[data-picker-row][role=option]` | Add a flat **catch-all group** (`Disclosure` + `TicketRow`, NO nesting, NO create-subtask) below source groups, above Search-Jira footer; fetch via new `useQuery` |
| `components/today/QuickLogForm.tsx` | Hours input + date + Log; `formatStartedISO` (date `T09:00:00`); `LoggedEntry` handoff via `onLogged` | NO functional change — catch-all selections reuse it as-is. Optionally extract `formatStartedISO` for `pto.ts` to share |
| `components/today/LoggedToday.tsx` | Exports `LoggedEntry` type (`{ key, summary, hoursDisplay, started, seconds }`); renders list with slide-in | NO change — `PtoQuickAction` and catch-all both produce `LoggedEntry` |
| `lib/jira-client.ts` | `jiraGet`, `jiraPost`, `postWorklog(issueKey, { timeSpentSeconds, started, comment? })` (Result-typed) | NO change — `lib/pto.ts` calls `postWorklog`; `lib/catch-all.ts` calls `jiraGet` |
| `lib/ticket-search.ts` | `buildSearchUrl` → `rest/api/3/search/jql?jql=<encoded>`; `searchTickets` via `jiraGet(url, JiraSearchSchema)` | NO change — **copy its URL-building pattern** in `lib/catch-all.ts` (note: `/search/jql`, not `/search`) |
| `lib/jira-types.ts` | `JiraIssueSchema` (`{ id, key, fields: { summary } }`), `JiraSearchSchema` (`{ issues: [] }`), `JiraWorklogSchema`/`JiraWorklog` | NO change — reuse `JiraSearchSchema` for catch-all fetch; `JiraWorklog` is `postWorklog`'s return |
| `lib/hours.ts` | `parseHours`, `hoursToSeconds`, `secondsToHoursDisplay`, `MAX_HOURS_PER_ENTRY` | NO change — `pto.ts` imports `hoursToSeconds`/`secondsToHoursDisplay` |
| `lib/storage/settings.ts` | `catchAllProjectKeyItem` (fallback `'KNP'`), `ptoSubtaskKeyItem` (`string\|null`, fallback `null`), `ptoSubtaskSummaryItem` (`string\|null`), `targetHoursItem` (number, fallback `8`) | NO change — consume all four |
| `lib/messages.ts` | `sendMessage` (fire-and-forget); `badge-update` kind registered | NO change — `PtoQuickAction` calls `sendMessage('badge-update', { hoursMissing: 0 })` like `QuickLogForm` |
| `lib/pto.ts` | **DOES NOT EXIST** | Create: `logFullDayPto`, `logHalfDayPto` |
| `lib/catch-all.ts` | **DOES NOT EXIST** | Create: `fetchCatchAllSubtasks` |
| `components/today/PtoQuickAction.tsx` | **DOES NOT EXIST** | Create: one-click PTO trigger + inline popover |
| `components/ui/popover.tsx` | **DOES NOT EXIST** (and `@radix-ui/react-popover` not installed) | Do NOT create / do NOT add the dep — build a lightweight inline popover (see decision above) |
| `entrypoints/options/App.tsx` | Renders `<CatchAllProjectField />` inside `<section>` (no `id` anchor) | Optional: add `id="catch-all"` to that section (only if trivial) |

### `lib/catch-all.ts` — fetch pattern (mirror `ticket-search.ts`)

```ts
// lib/catch-all.ts  (framework-agnostic; named exports; Result at boundary)
import { jiraGet } from '@/lib/jira-client';
import { JiraSearchSchema } from '@/lib/jira-types';
import type { Result } from '@/lib/...'; // use the project's Result type location
import type { JiraError } from '@/lib/...';

export async function fetchCatchAllSubtasks(
  projectKey: string,
): Promise<Result<{ key: string; summary: string }[], JiraError>> {
  const key = projectKey.trim();
  if (!key) return { kind: 'ok', value: [] };
  const jql = `project=${key} AND issuetype=Sub-task`;
  const url = `rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50`;
  const res = await jiraGet(url, JiraSearchSchema);
  if (res.kind !== 'ok') return res; // surface rate-limited/parse-error/etc.
  return {
    kind: 'ok',
    value: res.value.issues.map((i) => ({ key: i.key, summary: i.fields.summary })),
  };
}
```

> **Verify** the exact `Result`/`JiraError` import paths and the `jiraGet` signature against `lib/jira-client.ts` and `lib/ticket-search.ts` before writing — match whatever those files import. `ticket-search.ts` is the closest template (same JQL-search shape).

### `lib/pto.ts` — worklog helpers

```ts
// lib/pto.ts  (framework-agnostic)
import { postWorklog } from '@/lib/jira-client';
import { hoursToSeconds } from '@/lib/hours';
// reuse the shared started-ISO helper (see Task 2 — extract from QuickLogForm)

export async function logFullDayPto(ptoSubtaskKey: string, targetHours: number, started: string) {
  return postWorklog(ptoSubtaskKey, { timeSpentSeconds: hoursToSeconds(targetHours), started });
}
export async function logHalfDayPto(ptoSubtaskKey: string, targetHours: number, started: string) {
  return postWorklog(ptoSubtaskKey, { timeSpentSeconds: hoursToSeconds(targetHours / 2), started });
}
```

The `started` value: today's date at `T09:00:00` → ISO (matches `QuickLogForm.formatStartedISO`). The hardcoded 09:00 is an accepted v1 limitation (deferred-work.md) — keep it consistent with `QuickLogForm`.

### `PtoQuickAction` — placement & shape

Place near the top of the Today view (the UX spec's "Effortless Interactions" describes one-click PTO as a top-of-surface fast path; the Roadmap names a `PtoQuickAction` Today-view component). Suggested layout in `TodayView`: header → `PtoQuickAction` row → catch-all placeholder (if unconfigured) → `LoggedToday` → picker/form.

```
type PtoQuickActionProps = { onLogged: (entry: LoggedEntry) => void };
```

States: **disabled** (PTO unset → tooltip/helper + deep link) · **idle** (trigger button) · **open** (popover with Full/Half) · **posting** (buttons disabled, spinner) · **success** (✓ then close) · **error** (inline message, re-enabled).

`LoggedEntry` for PTO:
```ts
{ key: ptoSubtaskKey, summary: ptoSubtaskSummary ?? 'PTO',
  hoursDisplay: secondsToHoursDisplay(seconds), started, seconds }
```

### Graceful degradation matrix (binding — architecture.md)

| Condition | Catch-all group | "Mark today as PTO" |
|---|---|---|
| Catch-all key blank | hidden + placeholder above picker | (PTO also effectively unusable — see below) |
| Catch-all set, PTO subtask unset | shown (project subtasks listed) | **disabled** + tooltip "PTO subtask not configured. Configure in Settings." + deep link |
| Both set | shown | enabled (Full/Half popover) |

Worker can **always** log their own assigned subtasks via the hierarchy picker regardless of catch-all/PTO config. Never throw; never block.

### Carryover from prior stories (apply, don't repeat the mistakes)

- **No silent failures.** Story 2.3 shipped create-subtask with only a `log.warn` and no user-visible feedback (deferred-work.md) — Story 2.4 fixed its own flow with an inline error. **Do the same here:** PTO post failure and catch-all fetch failure must surface inline (AC #8), not just log.
- **Subtask-only logging.** FR6/FR10 require time logged at the **sub-task** level. The catch-all JQL filters `issuetype=Sub-task`, so the catch-all group is inherently subtask-only. (The open product question about Pinned/Search-Jira allowing non-subtasks — deferred-work.md — does **not** apply to catch-all and is out of scope here.)
- **`formatStartedISO` 09:00 limitation** is accepted for v1 — reuse it; don't try to "fix" it in this story.

### Testing strategy

- **`lib/catch-all.test.ts`:** mock `jiraGet`. Cases: success → mapped `{key,summary}[]`; blank key → `[]` (no HTTP call — assert `jiraGet` not called); 429 → `rate-limited`; parse-error; empty `issues` → `[]`.
- **`lib/pto.test.ts`:** mock `postWorklog`. Cases: full-day → `timeSpentSeconds = targetHours*3600` to the right key; half-day → `(targetHours/2)*3600`; `started` passed through; non-ok Result surfaced. Test a couple of target values (8 → 28800/14400; odd target like 7 → 25200/12600).
- **`components/today/PtoQuickAction.test.tsx`** (Testing Library): trigger renders; PTO-unset → disabled + explanation visible (queryable); enabled → click opens popover with `Full day (8h)` / `Half day (4h)`; Full click calls `logFullDayPto` and on success calls `onLogged` + broadcasts `badge-update`; Half click calls `logHalfDayPto`; error Result → inline error, no `onLogged`; Esc closes popover. Mock `lib/pto.ts`, settings items, `lib/messages.sendMessage`.
- **`components/today/TodayView.test.tsx`** (update): PTO action present; logging PTO appends an entry + total increments; catch-all placeholder shown when key blank. Add mocks for new settings items + `lib/pto.ts` + the catch-all query.
- **`TicketPicker` tests:** add a case for the catch-all group rendering when the query returns subtasks (mock the catch-all hook/`fetchCatchAllSubtasks`), and that selecting a catch-all row calls `onSelect`. Match the existing test style in `TicketPicker.test.tsx`.

### UX constraints

- **Popup width 360px.** PTO trigger + popover must fit. The popover is a small 2-item menu — keep it compact.
- **Colors:** Primary = `bg-accent` (`accent.DEFAULT` brand purple) + white text + `font-semibold` (matches `Button variant="primary"`). Disabled = `neutral.300` text + `cursor-not-allowed`. Error text = `text-xs text-state-danger font-medium` (the `state-danger` Tailwind token exists and is used in `QuickLogForm`). Placeholder/empty = `text-sm text-neutral-500`.
- **Motion:** new "Logged today" entries already get the 200ms `animate-slide-in` (in `LoggedToday`). No spinners as loading states except the transient button spinner (≤200ms) on post — `prefers-reduced-motion` already handled globally. No popover entrance animation needed.
- **Accessibility:** icon-only/short buttons get `aria-label`. Trigger `aria-haspopup`/`aria-expanded`. Esc closes popover; focus returns to trigger. Disabled affordance has a discoverable explanation (not `title`-only).

### Project Structure Notes

- New `lib/` modules (`catch-all.ts`, `pto.ts`): kebab-case filenames, framework-agnostic, named exports, co-located `*.test.ts`. ✅ aligns with `lib/` conventions.
- New component `components/today/PtoQuickAction.tsx`: PascalCase, lives under `components/today/` (the Today-view group), co-located `*.test.tsx`. ✅ matches `architecture.md` directory structure (`components/today/PtoQuickAction.tsx` is explicitly listed).
- Catch-all subtask **list is not persisted** — Story 1.5 only stored the project key + PTO subtask key/summary. The flat list is fetched live (TanStack Query, 5-min staleTime). No new storage item needed.
- No conflicts with the unified structure. The architecture's `components/today/CatchAllPicker.tsx` is satisfied by rendering the catch-all group **inside `TicketPicker`** (the UX spec's `TicketPicker` anatomy explicitly includes the catch-all section as part of the picker) — a separate `CatchAllPicker.tsx` is not required and would duplicate the picker's row/keyboard plumbing. **Documented variance:** catch-all group lives in `TicketPicker`, not a standalone `CatchAllPicker.tsx`, to reuse the picker's search/filter/arrow-key infrastructure.

### References

- [Epics: Story 2.5](../planning-artifacts/epics.md) (§ Story 2.5 Catch-All Picker & One-Click PTO Action)
- [PRD: FR10 catch-all, FR11 PTO, FR6 subtask-only, FR47/FR48 settings](../planning-artifacts/prd.md)
- [Architecture: Graceful Degradation Behavior (catch-all & PTO rows, binding rule)](../planning-artifacts/architecture.md)
- [Architecture: API & Communication Patterns, Result<T, JiraError>, postWorklog data flow](../planning-artifacts/architecture.md)
- [Architecture: Hours format — one conversion utility, no inline * 3600](../planning-artifacts/architecture.md)
- [Architecture: Project structure — components/today/PtoQuickAction.tsx, CatchAllPicker.tsx, lib/pto.ts](../planning-artifacts/architecture.md)
- [Architecture: Naming / Import / Structure patterns; co-located Vitest tests](../planning-artifacts/architecture.md)
- [UX: Button Hierarchy (primary tier, disabled-must-explain)](../planning-artifacts/ux-design-specification.md)
- [UX: Empty States copy rules](../planning-artifacts/ux-design-specification.md)
- [UX: Modal & Overlay Patterns — Popover behavior](../planning-artifacts/ux-design-specification.md)
- [UX: Color System (accent.DEFAULT, state.danger, neutral scale)](../planning-artifacts/ux-design-specification.md)
- [UX: Experience Mechanics Phase 2 (catch-all section), Roadmap Phase 1 (PtoQuickAction)](../planning-artifacts/ux-design-specification.md)
- [Previous story: 2.4 QuickLogForm (LoggedEntry, postWorklog, formatStartedISO, settings pattern)](./2-4-quicklogform-hours-input-with-jira-flexible-parser.md)
- [Previous story: 1.5 Catch-all & PTO config (settings items, JQL pattern)](./1-5-catch-all-project-pto-subtask-configuration.md)
- [Deferred work: no-silent-failure, formatStartedISO 09:00, JQL escaping](./deferred-work.md)
- [Existing: lib/jira-client.ts (postWorklog, jiraGet)](../../lib/jira-client.ts)
- [Existing: lib/ticket-search.ts (JQL search URL template to mirror)](../../lib/ticket-search.ts)
- [Existing: lib/storage/settings.ts (catchAll/pto/target items)](../../lib/storage/settings.ts)
- [Existing: components/today/TicketPicker.tsx (Disclosure/TicketRow, onSelect)](../../components/today/TicketPicker.tsx)
- [Existing: components/today/TodayView.tsx (handleLogged, LoggedToday, total)](../../components/today/TodayView.tsx)
- [Existing: components/today/LoggedToday.tsx (LoggedEntry type)](../../components/today/LoggedToday.tsx)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context) — `claude-opus-4-8[1m]`

### Debug Log References

- `tsc` initially flagged `TS2556` in `TodayView.test.tsx` because `vi.fn(async () => …)` mocks inferred a fixed-arity (no-arg) signature while the mock wrappers spread `(...args)`. Fixed by declaring those mocks as plain `vi.fn()` and setting resolved values in `beforeEach`.
- First catch-all TicketPicker test wrongly asserted "no create-subtask affordance" against a hierarchy that itself contains a no-subtask Task (which legitimately shows that affordance). Isolated the catch-all group by using an empty hierarchy for that case.

### Completion Notes List

- Reused everything possible: `LoggedEntry`, `postWorklog`, `hoursToSeconds`/`secondsToHoursDisplay`, `Button`, `Disclosure`/`TicketRow`, settings items, `sendMessage('badge-update')`. The story is composition + two thin `lib/` modules + one component.
- **Variance (documented in Dev Notes):** the catch-all group lives **inside `TicketPicker`** rather than a standalone `CatchAllPicker.tsx`, to reuse the picker's search/filter/arrow-key infrastructure. No separate component created.
- **Shared `started` helper extracted** to `lib/worklog-date.ts` (`formatStartedISO`, `formatDateForInput`, `todayDateString`); `QuickLogForm` now imports it instead of defining its own — prevents the 09:00 anchor from diverging between QuickLogForm and PTO.
- **Popover decision honored:** lightweight inline popover (positioned `<div>` + manual Esc/click-outside/focus management); no `@radix-ui/react-popover` dependency added.
- **No silent failures:** PTO post failure surfaces an inline `Couldn't mark PTO — try again` and re-enables; catch-all fetch failure renders an inline non-blocking error inside the group. Both also `log.warn`.
- **AC #3 nuance implemented:** placeholder shows only when the project key is blank/whitespace; when the key is set but the live fetch is empty/fails, the group renders with a small empty/error state (never blocks the core log flow).
- **Task 7 not done** (see Tasks): `CatchAllProjectField` shares a `<section>` so an `id` anchor isn't trivial; `openOptionsPage()` satisfies the AC.
- Gates run via **npm** (project has no pnpm lockfile; `npm run` scripts are the real commands). Lint passes with 0 errors; the remaining `import/order` warnings are pre-existing repo-wide style warnings (also present on baseline files like `QuickLogForm.tsx`, `App.tsx`), not regressions, and `eslint .` exits 0.
- Test delta: baseline 33 suites / 327 passing → now 37 suites / 353 passing (+1 skipped unchanged). +4 new test files, +26 tests.

### File List

**Created:**
- `lib/catch-all.ts`
- `lib/catch-all.test.ts`
- `lib/pto.ts`
- `lib/pto.test.ts`
- `lib/worklog-date.ts`
- `lib/worklog-date.test.ts`
- `components/today/PtoQuickAction.tsx`
- `components/today/PtoQuickAction.test.tsx`

**Modified:**
- `components/today/TicketPicker.tsx` (catch-all group + `useQuery`)
- `components/today/TicketPicker.test.tsx` (catch-all mocks + 3 tests)
- `components/today/TodayView.tsx` (`PtoQuickAction` + catch-all placeholder)
- `components/today/TodayView.test.tsx` (PTO/catch-all mocks + 3 tests)
- `components/today/QuickLogForm.tsx` (use shared `lib/worklog-date` helpers)

## Change Log

| Date | Change |
|---|---|
| 2026-06-21 | Story 2.5 implemented: `lib/catch-all.ts` (catch-all subtask fetch), `lib/pto.ts` (full/half-day PTO worklog helpers), `lib/worklog-date.ts` (shared `started` ISO helper), `components/today/PtoQuickAction.tsx` (one-click PTO trigger + inline popover). Catch-all flat group added inside `TicketPicker`; catch-all-unconfigured placeholder + `PtoQuickAction` wired into `TodayView`; `QuickLogForm` refactored to use the shared date helper. All gates pass (lint/compile/test/build); tests 327→353 passing. Status → review. |
| 2026-06-21 | Code review (adversarial: Blind Hunter + Edge Case Hunter + Acceptance Auditor). 3 patches applied, 7 deferred, 1 dismissed. Gates re-run green (353 tests pass / 1 skipped, tsc 0 errors, eslint 0 errors). Status → done. |

## Review Findings

_Code review 2026-06-21 — adversarial three-layer (Blind Hunter / Edge Case Hunter / Acceptance Auditor). Diff vs `6f77d95` (uncommitted working tree)._

### Patches applied

- [x] [Review][Patch] PTO double-post in the 200ms post-success window [components/today/PtoQuickAction.tsx:141] — After a successful post the popover lingers ~200ms showing ✓ but `isPending` is already `false`, so a fast second click on "Full day" re-fired `mutate` → duplicate worklog. Added `showSuccess` to the `handleSubmit` guard.
- [x] [Review][Patch] Empty-string `ptoSubtaskKey` rendered an enabled-but-no-op trigger [components/today/PtoQuickAction.tsx:160] — Disabled branch checked `ptoKey === null` while `handleSubmit` guarded `!ptoKey`; an `''` key showed an enabled button that silently did nothing. Changed the disabled branch to `!ptoKey` and added an `undefined` "loading" sentinel so the "not configured" state no longer flashes on every mount before settings resolve.
- [x] [Review][Patch] Catch-all JQL did not quote the project key [lib/catch-all.ts:18] — `project=${key}` (unquoted) breaks on keys with spaces/reserved words; the sibling `lib/ticket-search.ts` quotes its values. Now emits `project = "<escaped>" AND issuetype = Sub-task` with quote/backslash escaping. Test assertion updated.

### Deferred (pre-existing or out of scope)

- [x] [Review][Defer] `formatStartedISO` anchors 09:00 local then `toISOString()` → possible day-bucketing drift vs the Jira account timezone [lib/worklog-date.ts:12] — pre-existing (moved verbatim from `QuickLogForm`); the 09:00 anchor is an accepted v1 limitation per deferred-work.md. Now also affects PTO.
- [x] [Review][Defer] `badge-update` always sends `{ hoursMissing: 0 }` even for half-day PTO [components/today/PtoQuickAction.tsx:113] — mirrors the existing `QuickLogForm` fire-and-forget nudge convention; the background listener recomputes the badge. Not a 2.5 regression.
- [x] [Review][Defer] No validation of `targetHours` (0 / negative / non-integer) before posting [lib/storage/settings.ts:91] — neither the settings layer nor `QuickLogForm` validate this today; cross-cutting, out of scope for 2.5.
- [x] [Review][Defer] Disabled primary `Button` keeps full `bg-accent` purple (only `text-neutral-300` muted) [components/ui/button.tsx:13] — AC7's literal tokens (`text-neutral-300` + `cursor-not-allowed`) ARE delivered by the shared Button; muting the background is an app-wide Button-component concern, not 2.5-specific.
- [x] [Review][Defer] Catch-all `useQuery` retries non-retriable errors (403/404/parse) up to 3× in prod [components/today/TicketPicker.tsx:178] — inherited from the project-wide `QueryClient` default retry policy (`entrypoints/popup/main.tsx`); shared by hierarchy/search queries too.
- [x] [Review][Defer] Successful PTO worklog is "committed" to the logged list only inside a cancellable 200ms timer [components/today/PtoQuickAction.tsx:122] — latent only if a parent ever conditionally unmounts `PtoQuickAction`; `TodayView` always renders it, so no live bug.
- [x] [Review][Defer] Half-day button lacks the spinner/✓ feedback the Full button shows [components/today/PtoQuickAction.tsx:236] — minor affordance asymmetry; both buttons are disabled during the in-flight post, so no correctness impact.

### Dismissed

- [x] [Review][Dismiss] Error string uses a curly apostrophe (`Couldn’t mark PTO — try again`) vs the AC's straight apostrophe — matches the existing repo convention (`QuickLogForm`); Dev Notes explicitly authorize the story to author exact strings. Cosmetic.
