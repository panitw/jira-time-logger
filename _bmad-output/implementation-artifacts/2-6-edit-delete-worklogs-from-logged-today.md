---
baseline_commit: fd4ef5a
---

# Story 2.6: Edit & Delete Worklogs from "Logged today"

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a connected worker,
I want to edit hours/date/comment or delete worklogs I posted via the extension,
so that I can correct mistakes without leaving the popup.

## Acceptance Criteria

1. **Hover-revealed `⋯` actions menu on each Logged-today row.** Given the Today view shows a "Logged today" list with at least one entry, when the user hovers a row (or focuses it via keyboard), a `⋯` (ellipsis) menu trigger appears at the row's right edge. The trigger is a real `<button>` (never a clickable `<div>`), is keyboard-reachable in DOM order, has `aria-label="Worklog actions for <ticketKey>, <hoursDisplay>"`, and meets the ≥ 32×32 px popup tap-target minimum. The icon is visually de-emphasized until row hover/focus but is always present for keyboard/AT users (do not rely on `:hover` alone for discoverability by keyboard — reveal on `:focus-within` too). (FR12, FR13)
   *[Source: epics.md § Story 2.6 AC 1; ux-design-specification.md § Inspiring Products "GitHub native UI" + Transferable UX Patterns "Hover-reveal of secondary actions"; § Accessibility "What we have to do ourselves" — "`aria-label` for icon-only buttons … ⋯ menu, hover-revealed Edit/Delete"; § Implementation Guidelines "Never make a clickable `<div>`"; § Tap target 32×32 px]*

   > **Anti-pattern guard (UX spec § Anti-Patterns #7):** "kebabs / more options without context" are called out as mystery-meat. Mitigate by (a) the descriptive `aria-label`, and (b) the menu items themselves being clearly labelled "Edit" / "Delete". This is acceptable because the row context (key + hours) is adjacent and the menu is labelled.

2. **`⋯` menu shows Edit + Delete as ghost-tier items.** Given the user opens the `⋯` menu on a worklog row, when the menu renders, exactly two actions appear: "Edit" and "Delete", both **Tertiary / Ghost tier** (`<Button variant="ghost">` — transparent bg, `neutral.500` text, no border). The menu is an inline popover anchored to the trigger: focus moves to the first item on open, `Esc` closes and returns focus to the trigger, click-outside closes, and items have `role="menuitem"` within a `role="menu"` container labelled `aria-label="Worklog actions"`. Only one row's menu is open at a time. (FR12, FR13)
   *[Source: epics.md § Story 2.6 AC 2; ux-design-specification.md § Button Hierarchy "Tertiary / Ghost … Inline / hover-revealed actions: Edit · Delete · Dismiss"; § Modal & Overlay Patterns "Popover — no backdrop, focus moves into popover, Esc closes; opens adjacent to trigger"; § Focus management "return focus to the triggering element"]*

3. **"Edit" enters inline edit mode (hours/date/comment) using the shared hours parser.** Given the user clicks "Edit", when the row enters edit mode, the hours, date, and comment fields become inline-editable **using the exact same hours parser and validation as `QuickLogForm`** (`lib/hours.ts` `parseHours`/`hoursToSeconds`, `MAX_HOURS_PER_ENTRY`, the same border colour live-validation and `> 24h` hard-block). The date selector offers Today/Yesterday/cycle-bounded custom (reuse `QuickLogForm`'s date control + `lib/cycle-range.ts`), and a comment text field is shown (defaults to the entry's current comment text, or empty). Pressing **Enter** or clicking **"Save"** calls `updateWorklog(issueKey, worklogId, body)` → `PUT /rest/api/3/issue/{key}/worklog/{id}` via `lib/jira-client.ts`. On `Result.kind === 'ok'`, the row updates in place (new hours/date/comment) and the "Logged today" total recalculates. Cancel/Esc exits edit mode without a call. (FR12)
   *[Source: epics.md § Story 2.6 AC 3; prd.md FR12; ux-design-specification.md § WeeklyGrid "Editing-cell (inline hours input)" inline-edit precedent, § Form Patterns validation timing; architecture.md § Format Patterns "one conversion utility … do not inline `* 3600`"]*

4. **"Delete" shows an inline confirmation chip, then calls DELETE.** Given the user clicks "Delete", when the confirmation appears, an **inline confirmation chip replaces the menu** reading "Delete this worklog?" with a "Cancel" (Secondary tier) and a "Delete" (destructive-confirm) button. Clicking "Delete" calls `deleteWorklog(issueKey, worklogId)` → `DELETE /rest/api/3/issue/{key}/worklog/{id}` via `lib/jira-client.ts`. On success the row animates out (200 ms slide; honor `prefers-reduced-motion`) and the total recalculates. "Cancel" or `Esc` reverts to the normal row. (FR13)
   *[Source: epics.md § Story 2.6 AC 4; prd.md FR13; ux-design-specification.md § Button Hierarchy "Destructive actions never get the primary tier in default state … primary inside the confirmation dialog only", § Form Patterns "Cancel … always to the left of the primary action", § Motion "List-item slide-in 200 ms ease-out"]*

   > **Documented deviation (binding decision for this story):** The epics AC mandates an **inline confirmation chip**, but the UX spec's canonical destructive-confirmation pattern is a modal `Dialog` (the disconnect-confirmation precedent). The AC is the more specific, intentional choice for a lightweight per-row action inside a 360 px popup (a full modal for a single-worklog delete is disproportionate). **Implement the inline chip per the AC.** The destructive "Delete" confirm button uses the **primary visual tier styled as danger** — there is **no `danger` button variant** in `components/ui/button.tsx`, so use `variant="ghost"` + `className` override with the `text-state-danger` token (the established convention; PtoQuickAction/QuickLogForm use `text-state-danger` for error text). Cancel is `variant="secondary"`, placed to the **left** of Delete per Form Patterns.

5. **4xx (non-401) failure → row reverts, inline status chip, no toast.** Given an edit or delete fails with a `Result.kind` of `forbidden` (403) or `not-found` (404 — e.g. worklog already deleted server-side), or `parse-error`, when the failure is observed, the row reverts to its prior state and a **status chip appears next to the row** reading "Couldn't update — <reason>" (edit) / "Couldn't delete — <reason>" (delete), where `<reason>` is a friendly, pre-written string keyed off `Result.kind` (never a raw exception). The chip **persists** until the user retries or dismisses it. **No toast, no alarm.** `auth-expired` (401) is handled by the client's silent-refresh path and is out of scope for this chip. (UX spec Feedback channel 2)
   *[Source: epics.md § Story 2.6 AC 5; ux-design-specification.md § Feedback Patterns "Channel 2 — Status chips next to actions … persist until the underlying state changes; they don't auto-dismiss"; architecture.md § Error handling "Errors shown to the user are never raw exception messages … pre-written, friendly strings keyed off the error kind"]*

6. **Network / rate-limit failure → "Pending — will retry" chip (outbox enqueue deferred to Story 2.7).** Given an edit or delete fails with `Result.kind` of `network` or `rate-limited`, when the failure is observed, a **"Pending — will retry" status chip** appears on the row (`state.info_subtle` bg + `Clock` icon, UX Feedback channel 2). **The actual outbox enqueue + retry-on-reconnect is Story 2.7** (`lib/storage/outbox.ts` does not exist yet). For Story 2.6, surface the pending chip and log the intent (`log.warn('worklog.edit.deferred-outbox', …)`); the row stays visible with its pre-failure data. Wire the enqueue call behind a thin seam so Story 2.7 can attach without restructuring (see Dev Notes "Outbox seam"). Do **not** lose the user's change silently. (FR43 forward-ref; carryover "no silent failure")
   *[Source: epics.md § Story 2.6 AC 6 + § Story 2.7; architecture.md § Caching topology "Outbox (pending worklog writes) … `lib/storage/outbox.ts`"; ux-design-specification.md § Color Usage "Pending worklog (outbox) — `state.info_subtle` bg + clock icon"; deferred-work.md "no user-visible feedback on failure" carryover]*

7. **`worklogId` is captured and carried on every Logged-today entry.** Given a worklog is posted via `QuickLogForm` or `PtoQuickAction`, when it succeeds, the returned `JiraWorklog.id` is stored on the resulting `LoggedEntry` so edit/delete can target `…/worklog/{id}`. `LoggedEntry` gains a `worklogId: string` field. Both `QuickLogForm` and `PtoQuickAction` read `result.value.id` (currently discarded) and set it on the entry. (enabler for FR12/FR13 — without it, edit/delete have no id to target)
   *[Source: architecture.md § Requirements to Structure Mapping "lib/jira-client.ts (worklog post/edit/delete)"; lib/jira-types.ts `JiraWorklogSchema.id`; existing QuickLogForm/PtoQuickAction onSuccess handlers discard `value`]*

8. **No silent failures; never throw; core log flow unaffected.** Given any edit/delete path errors, when the failure is observed, it surfaces via the inline chip (AC 5/6) AND a `log.warn`/`log.error`. The picker/log flow continues to work; a failed edit/delete never blocks logging new time. No `console.log`. (architecture binding)
   *[Source: architecture.md § Error handling "Never swallow an error silently", § Graceful Degradation "never block the core log-my-time flow"; deferred-work.md § 2.3/2.4/2.5 no-silent-failure carryover]*

9. **Gates pass.** `npm run lint` (0 errors), `npm run compile` / `tsc --noEmit` (0 errors), `npm run test --run`, and `npm run build` all pass. New `lib/jira-client` functions have co-located tests in `lib/jira-client.test.ts`; new/changed components have co-located `*.test.tsx`. (Project uses **npm**, not pnpm — no pnpm lockfile; see Story 2.5 completion notes.)
   *[Source: architecture.md § Enforcement Guidelines, § Testing standards "Tests are co-located"; 2-5 story § gates]*

## Tasks / Subtasks

- [x] **Task 1 — Add `jiraPut` + `jiraDelete` to `lib/jira-client.ts`** (AC: #3, #4)
  - [x] `jiraPut<T>(path, body, schema): Promise<Result<T, JiraError>>` — copy `jiraPost`'s full status-handling block verbatim, change `method: 'PUT'`. Log events `jira.put.request` / `jira.put.401-refreshing` / `jira.put.unexpected-error`.
  - [x] `jiraDelete(path): Promise<Result<void, JiraError>>` — DELETE returns **204 No Content (no JSON body)**. Copy the status-handling block but **do NOT call `res.json()`/schema-parse**. On `res.ok` (200/204) return `ok(undefined)`. Keep 401→refresh→retry, 429→`rateLimited`, 401→`authExpired`, 403→`forbidden`, 404→`notFound`, other `!res.ok`→`network(...)`, catch→`network(...)`. Log `jira.delete.request` / `jira.delete.401-refreshing` / `jira.delete.unexpected-error`.
  - [x] Both run inside `scheduler.acquire(...)` like the existing wrappers. Use `getAuth()`/`getBaseUrl`/`getAuthHeader` exactly as `jiraGet`/`jiraPost` do.

- [x] **Task 2 — Add `updateWorklog` + `deleteWorklog` helpers to `lib/jira-client.ts`** (AC: #3, #4)
  - [x] `updateWorklog(issueKey, worklogId, body: { timeSpentSeconds: number; started: string; comment?: unknown }): Promise<Result<JiraWorklog, JiraError>>` → `jiraPut(.../worklog/{id}, body, JiraWorklogSchema)`. Mirror `postWorklog`'s body shape (FLAT, not wrapped in `{ fields }`).
  - [x] `deleteWorklog(issueKey, worklogId): Promise<Result<void, JiraError>>` → `jiraDelete(.../worklog/{id})`.
  - [x] **Comment / ADF handling:** added `lib/adf.ts` with `textToAdf` / `adfToText` (best-effort, never throws). `updateWorklog` accepts an already-built ADF object; the UI omits `comment` entirely when blank. Co-located `lib/adf.test.ts`.
  - [x] Co-located tests in `lib/jira-client.test.ts`: added `jiraPut`/`jiraDelete`/`updateWorklog`/`deleteWorklog` describes — success, 401-refresh-retry, 429, 403, 404, parse-error (PUT), URL/method assertions; DELETE 204 asserts `ok` with no `json()` call.

- [x] **Task 3 — Extend `LoggedEntry` with `worklogId` + optional `comment`** (AC: #7, #3)
  - [x] In `components/today/LoggedToday.tsx`, added `worklogId: string` (required) and `comment?: string` to `LoggedEntry`.
  - [x] `QuickLogForm.tsx` onSuccess reads `result.value.id` → sets `worklogId` (comment omitted, optional).
  - [x] `PtoQuickAction.tsx` onSuccess reads `result.value.id` → sets `worklogId`.
  - [x] Updated `QuickLogForm.test.tsx` / `PtoQuickAction.test.tsx` to assert the emitted entry carries `worklogId`.

- [x] **Task 4 — Build the row actions menu + edit/delete UI in `LoggedToday`** (AC: #1, #2, #3, #4, #5, #6)
  - [x] Promoted `LoggedToday` to interactive; added optional `onEdited`/`onDeleted` props. Parent `TodayView` owns the entries list and applies patches.
  - [x] Extracted a `WorklogRow` sub-component with a local state machine: `idle` → `menu` → (`editing` | `confirming-delete`); plus per-row pending + error-chip + leaving state.
  - [x] **`⋯` menu (AC 1/2):** mirrors the `PtoQuickAction` inline-popover pattern (triggerRef/popoverRef/firstActionRef, capture-phase Esc, `pointerdown` click-outside, focus-first/restore-trigger, `aria-haspopup`/`aria-expanded`, `role=menu`/`menuitem`). Trigger is a `<button>` (`MoreHorizontal` icon) with `aria-label="Worklog actions for <key>, <hoursDisplay>"`, h-8/w-8 (≥32px), revealed on `group-hover:`/`group-focus-within:`/`focus-visible:`.
  - [x] **Edit mode (AC 3):** replicates the validated hours-input markup but imports the same `lib/hours.ts` (`parseHours`/`hoursToSeconds`/`MAX_HOURS_PER_ENTRY`), `lib/worklog-date.ts` (`formatStartedISO`), `lib/cycle-range.ts` — no re-implemented parsing/conversion math. Today/Yesterday/custom date control + `> 24h` block + border colour. Comment field wrapped via `textToAdf` only when non-empty. (Replication chosen over extraction; see Completion Notes.)
  - [x] **Delete confirm (AC 4):** menu "Delete" swaps to an inline chip "Delete this worklog?" + Cancel (secondary, left) + Delete (`variant="ghost"` + `text-state-danger`, right). On success the row plays `motion-safe:animate-slide-out` (200ms) before `onDeleted`; reduced-motion removes immediately.
  - [x] **Error chips (AC 5/6):** `Result.kind` → friendly STRINGS map. `forbidden`/`not-found`/`parse-error` → persistent "Couldn’t update/delete — <reason>" chip; `network`/`rate-limited` → "Pending — will retry" chip (`bg-state-info-subtle` + `Clock`) + outbox seam. Chip has a ✕ dismiss button with `aria-label`.
  - [x] `useMutation` per action; `badge-update` broadcast on success; double-submit guarded via `isPending`.
  - [x] `STRINGS` constant for all copy.
  - [x] Co-located `LoggedToday.test.tsx` upgraded to `renderWithProviders` with QueryClient: menu/aria-label/Edit-save/ADF-comment/Delete-confirm/Cancel/403-revert/network-pending/Esc-close/double-Save tests.

- [x] **Task 5 — Outbox seam (forward-ref to Story 2.7)** (AC: #6)
  - [x] Added `enqueueFailedWorklogMutation(...)` — a documented no-op that only `log.warn('worklog.mutation.deferred-outbox', …)`. `lib/storage/outbox.ts` deliberately NOT created.
  - [x] Seam commented to point at the Story 2.7 replacement.

- [x] **Task 6 — Wire edit/delete handlers into `TodayView`** (AC: #3, #4, #7)
  - [x] `TodayView` gains `handleEdited(worklogId, patch)` (map/replace) and `handleDeleted(worklogId)` (filter); header total recomputes automatically.
  - [x] Passed `onEdited`/`onDeleted` into `<LoggedToday>`.
  - [x] `TodayView.test.tsx`: log full-day PTO → edit to 4h (total recomputes) → delete (total drops); mocked `updateWorklog`/`deleteWorklog`; QueryClient now sets `mutations: { retry: false }`.

- [x] **Task 7 — Verify gates** (AC: #9)
  - [x] `eslint .` exits 0 (0 errors, 48 pre-existing `import/order` warnings), `tsc --noEmit` 0 errors, `vitest run` 38 files / 389 passed (1 skipped), `npm run build` succeeds.

## Dev Notes

### What this story adds (and what it deliberately reuses)

Story 2.6 makes the "Logged today" list **interactive**: each row gets a hover/focus-revealed `⋯` menu with **Edit** (inline hours/date/comment, PUT) and **Delete** (inline confirm chip, DELETE). It is the first story to use HTTP **PUT** and **DELETE** — both are greenfield in `lib/jira-client.ts`.

**Reuse aggressively. Do not reinvent:**
- The **inline-popover/menu mechanics** are already solved in `PtoQuickAction.tsx` (Esc capture-phase, click-outside `pointerdown`, focus-first/restore-trigger, `role=menu`/`menuitem`, `aria-haspopup`/`aria-expanded`). Copy that pattern — do NOT add `@radix-ui/react-popover` or `@radix-ui/react-dropdown-menu` (not installed; the project's ethos is lightweight native menus — see 2-5 Dev Notes "Popover decision").
- The **hours parser + validation + date control** live in `QuickLogForm.tsx` (`validateHours`, border colour, `> 24h` block) backed by `lib/hours.ts`, `lib/worklog-date.ts`, `lib/cycle-range.ts`. Edit mode reuses these — **never re-implement `parseHours` or inline `* 3600`** (architecture binding; `hoursToSeconds`/`secondsToHoursDisplay` only).
- `LoggedEntry`, `sendMessage('badge-update')`, the `Result<T, JiraError>` dispatch, and the `STRINGS` + `log.<level>` conventions all already exist.

### ⚠️ The `worklogId` enabler is the lynchpin (do this first conceptually)

`LoggedEntry` currently has **no worklog id**. `postWorklog`/PTO return `JiraWorklog` (which has `id`) but the onSuccess handlers **discard `result.value`**. Edit/delete target `…/worklog/{id}`, so you MUST:
1. Add `worklogId: string` to `LoggedEntry`.
2. In `QuickLogForm.onSuccess` and `PtoQuickAction.onSuccess`, read `result.value.id` and set it on the entry.

Without this, there is no id to PUT/DELETE against. This is AC #7 and it's a prerequisite for AC #3/#4.

### ⚠️ Comment / ADF decision (read this — it's a real gap)

Jira Cloud REST **v3** worklog `comment` is **Atlassian Document Format (ADF)** — an *object*, not a string. (The existing `LogWorklogSchema.comment` is typed `string` and `postWorklog`'s body types `comment?: string`, but **QuickLogForm/PTO never send a comment today**, so no live code exercises the string path against the v3 API.) For the edit form's comment field:
- Build `lib/adf.ts` with `textToAdf(text)` (wrap a non-empty string in a minimal ADF doc) and `adfToText(comment)` (best-effort extract for displaying the current comment in the edit field; return `''` on anything unexpected, never throw — `JiraWorklogSchema.comment` is `z.unknown().optional()`).
- `updateWorklog` body: include `comment: textToAdf(text)` only when the text is non-empty; **omit `comment` entirely when blank** (sending an empty ADF doc can error). If the worklog had a comment and the user clears it, sending an empty paragraph ADF is the documented best-effort (note: the v3 API may not delete a comment via empty body — acceptable v1 limitation; log it).
- This is the minimum that satisfies "comment becomes inline-editable" (AC 3) without a rich-text editor. Do not pull in an ADF library.

> **If the reviewer disagrees** about ADF scope: the conservative fallback is to make the comment field **read-only / display-only** in edit mode for v1 and only edit hours + date. Flag this as the design question (see Final Report). Default implementation = editable plain-text comment wrapped in minimal ADF.

### `lib/jira-client.ts` — adding PUT/DELETE (mirror `jiraPost` exactly)

The status-handling block is identical across `jiraGet`/`jiraPost`: 401-refresh-retry (oauth only) → 429 `rateLimited(retryAfterMs)` → 401 `authExpired()` → 403 `forbidden()` → 404 `notFound()` → `!res.ok` `network(...)` → null-json `parseError` → schema-fail `parseError(parsed.error.issues)` → success `ok(parsed.data)` → catch `network(String(e))`, all inside `scheduler.acquire(...)`.

```ts
// jiraDelete — 204 No Content path: NO res.json(), NO schema parse.
export async function jiraDelete(path: string): Promise<Result<void, JiraError>> {
  const bundle = await getAuth();
  if (!bundle) return authExpired();
  return scheduler.acquire(async () => {
    try {
      const url = `${getBaseUrl(bundle)}/${path}`;
      const headers: Record<string, string> = { Authorization: getAuthHeader(bundle), Accept: 'application/json' };
      log.debug('jira.delete.request', { path });
      let res = await fetch(url, { method: 'DELETE', headers });
      if (res.status === 401 && bundle.kind === 'oauth') {
        // …copy jiraPost's refresh-then-retry…
      }
      if (res.status === 429) { /* rateLimited */ }
      if (res.status === 401) return authExpired();
      if (res.status === 403) return forbidden();
      if (res.status === 404) return notFound();
      if (!res.ok) { const b = await res.text().catch(() => ''); return network(`HTTP ${res.status}: ${b.slice(0,200)}`); }
      return ok(undefined); // 204 — no body
    } catch (e) { log.error('jira.delete.unexpected-error', { path, cause: String(e) }); return network(String(e)); }
  });
}
```
`jiraPut` is `jiraPost` with `method: 'PUT'`. (`updateWorklog` parses the returned worklog with `JiraWorklogSchema`.)

> **Note (404-on-delete is success-adjacent):** AC 5 explicitly names "worklog already deleted server-side" as a 4xx case. A `404` (`not-found`) on DELETE means it's already gone — the UI can treat this as a benign outcome (remove the row) OR show the "Couldn't delete — already removed" chip. **Default:** show the friendly chip and revert per AC 5, but it's reasonable to instead remove the row (since the desired end-state — gone — is achieved). Pick one and note it; the AC's literal text says "row reverts … chip appears", so default to that.

### Error string table (friendly strings keyed off `Result.kind`)

| `Result.kind` | Edit chip | Delete chip | Channel |
|---|---|---|---|
| `forbidden` | "Couldn't update — you don't have permission" | "Couldn't delete — you don't have permission" | persistent (ch. 2), revert |
| `not-found` | "Couldn't update — worklog no longer exists" | "Couldn't delete — worklog no longer exists" | persistent, revert |
| `parse-error` | "Couldn't update — unexpected response" | "Couldn't delete — unexpected response" | persistent, revert |
| `network` | "Pending — will retry" | "Pending — will retry" | pending (ch. 2), `state.info_subtle` + Clock, outbox seam |
| `rate-limited` | "Pending — will retry" | "Pending — will retry" | pending, outbox seam |
| `auth-expired` | (out of scope — client refreshes) | (out of scope) | — |

Never show a raw exception message. Use a `STRINGS` map. Curly apostrophe `’` (`’`) matches the repo convention (QuickLogForm/PtoQuickAction).

### Reuse vs duplication (edit mode)

Edit mode needs the same validated-hours input + date selector as `QuickLogForm`. Two options:
- **(Preferred if clean)** Extract a small `HoursDateFields` piece (validated hours input + Today/Yesterday/custom date) shared by `QuickLogForm` and the edit row. Keep `QuickLogForm`'s public behaviour identical; only its internal markup moves.
- **(Acceptable)** Replicate the input markup in `WorklogRow` but import the same `validateHours`-equivalent logic and `lib/hours`/`lib/worklog-date`/`lib/cycle-range`. The hard rule: **one parser, one conversion utility, one date helper** — no copies of parsing/conversion math.

Don't over-engineer the extraction; if it forces awkward prop plumbing, replicate the markup and share only the `lib/` logic. Document whichever you choose in the File List/Completion Notes.

### UX tokens & behaviour (binding from ux-design-specification.md)

- **`⋯` trigger + Edit/Delete items:** Tertiary/Ghost tier = transparent bg, `neutral.500` text, no border (`<Button variant="ghost">`). (Minor spec inconsistency: the Color Usage table lists Edit/Delete as `neutral.700` text on `neutral.50` bg while Button Hierarchy says ghost/`neutral.500` — use the **Button Hierarchy ghost tier**; it's the more specific rule. Noted.)
- **Delete-confirm button:** primary-tier *position* but **danger colour** — no `danger` variant exists, so `variant="ghost"` + `className` adding `text-state-danger` (`#dc2626`). Cancel = `variant="secondary"`, to the **left**.
- **Pending chip:** `state.info_subtle` (`#cffafe`) bg + `Clock` icon (lucide `Clock`). Error chip: `text-state-danger`. Chips **persist** (channel 2), each ideally with a small tooltip/explanation; never a toast.
- **Motion:** new-entry slide-in is 200 ms ease-out (existing `animate-slide-in` in LoggedToday). Delete slide-out: reuse 200 ms ease-out; wrap in `motion-safe:`/`motion-reduce:` (replace ≥100 ms transitions with instant under reduced motion).
- **Popover surface:** `rounded-md`, `border border-neutral-200`, `bg-white`, `shadow-sm`/`shadow-md` (PtoQuickAction uses `shadow-md`). Width compact (popup is 360 px).
- **Accessibility:** every icon-only button is a `<button>` with `aria-label`; ≥ 32×32 px tap target; focus ring is 2 px `accent` (handled by `Button`); inline error chips use `aria-live="assertive"`, badge/total updates `aria-live="polite"` if added. Esc closes menu/confirm and never deletes. Keyboard: menu reachable, items in DOM order, Enter activates.

### Carryover from prior stories (apply, don't repeat the mistakes)

- **No silent failures** (deferred-work.md, repeated 2.3→2.5): every failure path surfaces an inline chip AND a `log.warn`/`log.error`. AC 5/6/8.
- **`formatStartedISO` 09:00 anchor** (deferred-work.md 2.4/2.5): edit-mode date changes reuse `formatStartedISO` — keep the 09:00 anchor consistent; do not "fix" it here.
- **Disabled/danger Button styling** (deferred-work.md 2.5): the shared `Button` has no danger variant and keeps `bg-accent` when disabled — that's an app-wide concern; deliver AC 4 with `ghost` + `text-state-danger`, don't refactor `Button`.
- **`badge-update` always `{ hoursMissing: 0 }`** (deferred-work.md 2.5): mirror the existing fire-and-forget convention; the SW recomputes the real number (Story 3.1). Broadcast after a successful edit/delete too.
- **Project uses npm** not pnpm (2.5 completion notes) — run `npm run lint|compile|test|build`.

### Current codebase state (read these files before modifying)

| File | Current state | What this story changes |
|---|---|---|
| `lib/jira-client.ts` | `jiraGet`, `jiraPost`, `postWorklog`; Result-typed; scheduler/refresh/zod | **Add** `jiraPut`, `jiraDelete`, `updateWorklog`, `deleteWorklog` |
| `lib/jira-client.test.ts` | mocks `fetch` via `vi.stubGlobal`, `@/lib/storage/tokens` (closure bundle), `@/lib/scheduler`, `@/lib/oauth/refresh`; SUT via top-level `await import` | **Add** update/delete describes mirroring `postWorklog` |
| `lib/jira-types.ts` | `JiraWorklogSchema` has `id: z.string()`, `comment: z.unknown().optional()` | NO change — reuse for PUT response; `id` is the worklog id |
| `lib/result.ts` | `JiraError` union incl. `forbidden`/`not-found`/`network`/`rate-limited`; `ok()` | NO change — `jiraDelete` returns `ok(undefined)` (`Result<void>`) |
| `components/today/LoggedToday.tsx` | pure presentational; exports `LoggedEntry` (`{ key, summary, hoursDisplay, started, seconds }`); rows have NO actions | **Add** `worklogId`+`comment?` to `LoggedEntry`; add `⋯` menu, edit mode, delete confirm, error chips; new `onEdited`/`onDeleted` props |
| `components/today/LoggedToday.test.tsx` | 3 pure tests, no QueryClient | **Upgrade** to `renderWithProviders`; add menu/edit/delete/error tests |
| `components/today/QuickLogForm.tsx` | onSuccess discards `result.value`; emits `LoggedEntry` | Read `result.value.id` → set `worklogId` on entry |
| `components/today/PtoQuickAction.tsx` | onSuccess discards `result.value`; emits `LoggedEntry` | Read `result.value.id` → set `worklogId` |
| `components/today/TodayView.tsx` | owns `loggedEntries`; `handleLogged` appends; header total | **Add** `handleEdited`/`handleDeleted`; pass to `LoggedToday` |
| `components/today/TodayView.test.tsx` | extensive mocks incl. `postWorklog`, settings, chrome stub | Add `updateWorklog`/`deleteWorklog` mocks + edit/delete flow tests |
| `lib/hours.ts` | `parseHours`, `hoursToSeconds`, `secondsToHoursDisplay`, `MAX_HOURS_PER_ENTRY` | NO change — reuse in edit mode |
| `lib/worklog-date.ts` | `formatStartedISO` (09:00), `formatDateForInput`, `todayDateString` | NO change — reuse |
| `lib/cycle-range.ts` | `currentCycleRange`, `isWithinCycle` | NO change — reuse for date bounds |
| `lib/messages.ts` | `sendMessage`; `badge-update` registered | NO change — reuse `badge-update` |
| `components/ui/button.tsx` | variants `primary`/`secondary`/`ghost` only; NO `danger` | NO change — Delete = `ghost` + `text-state-danger` |
| `lib/adf.ts` | **DOES NOT EXIST** | Create: `textToAdf` / `adfToText` (+ test) |
| `lib/storage/outbox.ts` | **DOES NOT EXIST (Story 2.7)** | Do NOT create — use the outbox seam stub |

### Testing strategy

- **`lib/jira-client.test.ts`:** add `updateWorklog` + `deleteWorklog` describes. Copy the `postWorklog` mock harness (`fetchMock`, tokens closure, scheduler/refresh mocks; `fetchMock.mockResolvedValueOnce({ ok, status, headers:{get}, json })`). Cases per the AC-2 list (success, 401-refresh-retry asserting `fetch` called twice, 429, 403, 404, parse-error for PUT). For DELETE assert `method === 'DELETE'`, URL contains `/worklog/<id>`, 204→`ok` with **no** `json()` invocation.
- **`lib/adf.test.ts`:** `textToAdf('hi')` shape; `adfToText` extracts text from a valid doc; `adfToText(undefined)`/garbage → `''` (never throws).
- **`components/today/LoggedToday.test.tsx`** (upgrade to QueryClient `renderWithProviders`, `mutations:{retry:false}`): menu opens (Edit+Delete present); trigger `aria-label`; Edit→Save calls `updateWorklog('PROJ-1','10001', { timeSpentSeconds, started })`, fires `onEdited`; Delete→confirm chip→Delete calls `deleteWorklog`, fires `onDeleted`, no call on Cancel; `forbidden`→revert + persistent chip, `onDeleted` not called; `network`→"Pending — will retry" chip; Esc closes menu; double-Save guarded; `badge-update` broadcast on success. Mock `@/lib/jira-client`, `@/lib/messages`, `@/lib/log`.
- **`QuickLogForm.test.tsx` / `PtoQuickAction.test.tsx`:** update mock `ok` values to include `id`; assert emitted entry has `worklogId`.
- **`TodayView.test.tsx`:** log → edit (total recomputes) → delete (total drops). Mock the two new client fns.

### Project Structure Notes

- New `lib/adf.ts`: kebab-case, framework-agnostic, named exports, co-located `lib/adf.test.ts`. ✅
- New client fns live in `lib/jira-client.ts` per architecture's FR6-14 mapping ("worklog post/edit/delete" → `lib/jira-client.ts`). No separate worklog-mutations module. ✅
- The interactive `WorklogRow` lives **inside `components/today/LoggedToday.tsx`** (or a co-located `WorklogRow.tsx` under `components/today/` if the file approaches ~300 lines — architecture's "one responsibility / split near 300 lines" rule). Either is fine; prefer splitting if it gets long.
- `lib/storage/outbox.ts` is **deliberately not created** — it's Story 2.7. AC 6's enqueue is a documented seam/stub here. **Variance:** Story 2.6 surfaces the "Pending — will retry" chip but does not implement durable queueing; full offline retry lands in 2.7. (This matches epics.md, which scopes the outbox to Story 2.7.)
- **Deviation (documented):** inline confirmation **chip** for delete instead of the UX spec's modal `Dialog` — per the epics AC, which is the more specific/intentional choice for a per-row action in a 360 px popup. See AC 4 note.

### References

- [Epics: Story 2.6](../planning-artifacts/epics.md) (§ Story 2.6 Edit & Delete Worklogs) and [Story 2.7 outbox](../planning-artifacts/epics.md)
- [PRD: FR12 (edit worklog), FR13 (delete worklog), FR43 (outbox)](../planning-artifacts/prd.md)
- [Architecture: API & Communication Patterns — single jira-client, Result<T, JiraError>, FR6-14 "worklog post/edit/delete"](../planning-artifacts/architecture.md)
- [Architecture: Error handling — "never raw exception messages … pre-written friendly strings keyed off error kind"; never swallow silently](../planning-artifacts/architecture.md)
- [Architecture: Format Patterns — one conversion utility, ISO dates between modules](../planning-artifacts/architecture.md)
- [Architecture: Caching topology / Data boundaries — Outbox `lib/storage/outbox.ts`, cleared on successful send](../planning-artifacts/architecture.md)
- [Architecture: Naming / Import / Structure / Enforcement / co-located tests](../planning-artifacts/architecture.md)
- [UX: Button Hierarchy (ghost tier Edit/Delete; destructive never primary in default state)](../planning-artifacts/ux-design-specification.md)
- [UX: Feedback Patterns — Channel 2 status chips (persist, no toast); "Pending — will retry"](../planning-artifacts/ux-design-specification.md)
- [UX: Modal & Overlay Patterns — Popover behaviour; Form Patterns — Cancel-left, Esc never destructive](../planning-artifacts/ux-design-specification.md)
- [UX: Accessibility — aria-label for ⋯/Edit/Delete, no clickable div, focus return-to-trigger, tap target 32px, reduced motion](../planning-artifacts/ux-design-specification.md)
- [UX: Color System / Color Usage — accent, state.danger #dc2626, state.info_subtle #cffafe, neutral scale; Motion 200ms slide](../planning-artifacts/ux-design-specification.md)
- [Previous story: 2.5 PtoQuickAction inline-popover pattern; "no @radix popover" decision; npm gates](./2-5-catch-all-picker-one-click-pto-action.md)
- [Previous story: 2.4 QuickLogForm (validateHours, postWorklog onSuccess, LoggedEntry, formatStartedISO)](./2-4-quicklogform-hours-input-with-jira-flexible-parser.md)
- [Deferred work: no-silent-failure, formatStartedISO 09:00, badge-update {0}, Button danger/disabled styling](./deferred-work.md)
- [Existing: lib/jira-client.ts (jiraGet/jiraPost/postWorklog to mirror)](../../lib/jira-client.ts)
- [Existing: lib/jira-types.ts (JiraWorklogSchema.id, comment unknown)](../../lib/jira-types.ts)
- [Existing: lib/result.ts (JiraError union, ok)](../../lib/result.ts)
- [Existing: components/today/LoggedToday.tsx (LoggedEntry, rows)](../../components/today/LoggedToday.tsx)
- [Existing: components/today/PtoQuickAction.tsx (inline popover/menu pattern to copy)](../../components/today/PtoQuickAction.tsx)
- [Existing: components/today/QuickLogForm.tsx (validateHours, date control, onSuccess)](../../components/today/QuickLogForm.tsx)
- [Existing: components/today/TodayView.tsx (owns loggedEntries + total)](../../components/today/TodayView.tsx)
- [Existing: lib/messages.ts (sendMessage, badge-update)](../../lib/messages.ts)

### Review Findings

Code review (2026-06-21, fresh adversarial reviewer): Blind Hunter + Edge Case Hunter + Acceptance Auditor. No HIGH/MEDIUM issues remain unresolved; all patches applied in the working tree and gates re-run green.

Patches applied (fixed):

- [x] [Review][Patch] Edit silently moved the worklog to today — `startEdit` always reset the date selector to `today` instead of seeding from `entry.started`, so editing hours/comment alone rewrote a past-dated worklog to the current date (data loss). Now seeds `dateSel`/`customDate` from `entry.started` (today / yesterday / custom, NaN-guarded). [components/today/LoggedToday.tsx:startEdit] (source: blind+edge)
- [x] [Review][Patch] Lossy hours seed on Edit — `startEdit` regex-parsed the rounded `hoursDisplay` (`/^([\d.]+)/`), so opening+saving an unchanged edit on a non-clean-decimal worklog (e.g. 8400s→"2.3h") silently changed the duration. Now seeds from the exact stored `entry.seconds` via `secondsToHoursDisplay`. [components/today/LoggedToday.tsx:startEdit] (source: blind+edge)
- [x] [Review][Patch] React list key included the array index (`${worklogId}-${i}`) — `worklogId` is already unique; the index suffix remounted every row below a deleted row, wiping their local state (mid-edit input, error chips). Now keys on `worklogId` alone. [components/today/LoggedToday.tsx:LoggedToday map] (source: edge)
- [x] [Review][Patch] Delete slide-out `setTimeout` had no cleanup — could fire `onDeleted` after unmount (stale closure), diverging from the established `successTimeoutRef` cleanup convention in QuickLogForm. Added `slideOutTimeoutRef` cleared on unmount. [components/today/LoggedToday.tsx:handleConfirmDelete] (source: blind+edge)
- [x] [Review][Patch] Menu and error chip share the same anchor (`absolute right-2 top-full z-10`) and overlapped when reopening the menu while a persistent chip showed. Reopening the menu now clears the chip. [components/today/LoggedToday.tsx:trigger onClick] (source: edge)
- [x] [Review][Patch] AC4 violation: `Esc` did not revert the delete-confirm chip (the dismissal effect only ran for `mode==='menu'`). Esc now reverts `confirming-delete` to the normal row; click-outside dismissal remains scoped to the menu only so the chip's own Cancel/Delete pointer events are not pre-empted. [components/today/LoggedToday.tsx:dismissal effect] (source: blind)
- [x] [Review][Patch] Error chip used contradictory `role="status"` + `aria-live="assertive"`. Changed to `role="alert"` to match the spec's assertive intent. [components/today/LoggedToday.tsx:errorChip] (source: auditor)

Regression test added: "Edit preserves the entry’s original date when only hours change" in `LoggedToday.test.tsx` (covers the date-loss fix).

Deferred (documented, within v1 scope — not regressions):

- [x] [Review][Defer] Comment round-trip incomplete: `adfToText` is built+tested but never wired into the edit form, and `LoggedEntry.comment` is only populated by an in-session edit — so a worklog with a pre-existing server-side ADF comment shows a blank comment field on Edit, and a previously-set comment cannot be cleared (omitting `comment` on PUT leaves it untouched). [components/today/LoggedToday.tsx:156,352 ; lib/adf.ts:adfToText] — deferred; explicitly an "acceptable v1 limitation" per Dev Notes (line 115/118). Wiring `adfToText` + server-comment hydration is follow-up work.
- [x] [Review][Defer] Unparseable hours in edit mode shows no explanatory text (only a red border); over-limit shows a message but unparseable does not. [components/today/LoggedToday.tsx:editing render] — deferred, low-value; border feedback present and roughly consistent with QuickLogForm.

Dismissed as noise / out of scope:

- `auth-expired` maps to the generic "unexpected response" message — out of scope per AC5 (401 is handled by the client's silent-refresh path; not a chip case).
- "Pending — will retry" with a no-op outbox — intentional Story 2.7 seam, explicitly excluded from this review.
- Enter on the date `<select>` submits the form — minor UX wrinkle, not an AC violation.

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — claude-opus-4-8[1m]

### Debug Log References

- All gates green: `tsc --noEmit` 0 errors; `vitest run` 38 files / 389 passed, 1 skipped; `eslint .` exit 0 (0 errors, 48 pre-existing import/order warnings); `npm run build` succeeds.

### Completion Notes List

- **PUT/DELETE wrappers**: `jiraPut` is a verbatim copy of `jiraPost` with `method: 'PUT'`. `jiraDelete` copies the status-handling block but skips `res.json()`/schema-parse and returns `ok(undefined)` on success (204). Both keep 401-refresh-retry, 429/403/404 mapping, and run inside `scheduler.acquire`.
- **ADF**: `lib/adf.ts` provides `textToAdf` (minimal single-paragraph doc) and `adfToText` (best-effort extraction, never throws). The edit-comment field wraps non-empty text via `textToAdf`; blank comments omit `comment` entirely (per Dev Notes — empty ADF can error). Default editable-plain-text behaviour implemented (not the read-only fallback).
- **404-on-delete**: implemented per the AC literal text — a 404 reverts and shows the persistent "Couldn’t delete — worklog no longer exists" chip (rather than silently removing the row).
- **Reuse vs duplication (edit mode)**: chose to **replicate the validated-hours-input + date-selector markup** inside `WorklogRow` rather than extract a shared `HoursDateFields` piece. Extraction would have forced awkward prop plumbing (QuickLogForm seeds from empty + onLogged flow; the row seeds from an existing entry + onEdited flow). The hard rule is honoured: one parser (`lib/hours.parseHours`), one conversion utility (`hoursToSeconds`/`secondsToHoursDisplay`), one date helper (`lib/worklog-date.formatStartedISO`), one cycle helper (`lib/cycle-range`) — no copies of parsing/conversion math.
- **Outbox seam**: `enqueueFailedWorklogMutation` is a documented no-op `log.warn`; `lib/storage/outbox.ts` intentionally not created (Story 2.7). The "Pending — will retry" chip is shown by the UI regardless; the user's pre-failure data stays on the row.
- **Delete slide-out**: added a `slide-out` keyframe + `animate-slide-out` utility to `styles/globals.css`. On successful delete the row plays `motion-safe:animate-slide-out` for 200ms then calls `onDeleted`; under `prefers-reduced-motion` (and in non-DOM test envs without `matchMedia`) it removes after the timeout / immediately.
- **Button danger styling**: per deferred-work carryover, the destructive Delete-confirm uses `variant="ghost"` + `text-state-danger` (no `Button` refactor). Cancel is `variant="secondary"` to the left.
- **badge-update**: fired as `{ hoursMissing: 0 }` after a successful edit and delete, matching the existing fire-and-forget convention.

### File List

- `lib/jira-client.ts` (modified — added `jiraPut`, `jiraDelete`, `updateWorklog`, `deleteWorklog`)
- `lib/jira-client.test.ts` (modified — added describes for the four new functions + `resetAuthBundle` helper)
- `lib/adf.ts` (new — `textToAdf` / `adfToText`)
- `lib/adf.test.ts` (new)
- `components/today/LoggedToday.tsx` (modified — `worklogId`/`comment` on `LoggedEntry`, `EditPatch` type, interactive `WorklogRow` with menu/edit/delete/error-chips, outbox seam)
- `components/today/LoggedToday.test.tsx` (modified — upgraded to QueryClient providers + full menu/edit/delete/error coverage)
- `components/today/QuickLogForm.tsx` (modified — onSuccess sets `worklogId` from `result.value.id`)
- `components/today/QuickLogForm.test.tsx` (modified — asserts emitted entry carries `worklogId`)
- `components/today/PtoQuickAction.tsx` (modified — onSuccess sets `worklogId`)
- `components/today/PtoQuickAction.test.tsx` (modified — asserts emitted entry carries `worklogId`)
- `components/today/TodayView.tsx` (modified — `handleEdited`/`handleDeleted`, passes `onEdited`/`onDeleted`)
- `components/today/TodayView.test.tsx` (modified — edit/delete flow tests, `updateWorklog`/`deleteWorklog` mocks, `mutations.retry:false`)
- `styles/globals.css` (modified — `slide-out` keyframe + `animate-slide-out` utility)

### Change Log

- 2026-06-21 — Implemented Story 2.6 (Edit & Delete Worklogs from "Logged today"): added PUT/DELETE Jira client wrappers + `updateWorklog`/`deleteWorklog`, minimal ADF helpers, `worklogId` enabler on `LoggedEntry`, interactive `WorklogRow` (⋯ menu, inline edit, inline delete-confirm chip, persistent/pending error chips), `TodayView` edit/delete wiring, and an outbox seam stub for Story 2.7. All gates green.
