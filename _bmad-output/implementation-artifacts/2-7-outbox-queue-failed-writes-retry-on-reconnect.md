---
baseline_commit: 5279ae6
---

# Story 2.7: Outbox — Queue Failed Writes & Retry on Reconnect

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a worker who briefly loses connectivity,
I want my worklog writes (post / edit / delete) to queue and retry automatically,
so that I never lose data the tool said it was sending.

## Acceptance Criteria

1. **Durable outbox module: `lib/storage/outbox.ts`.** Given a worklog write fails with a `network` or `rate-limited` `Result`, when the failure is observed, the pending write is appended to a durable outbox persisted in `chrome.storage.local` (WXT `storage.defineItem`, key `local:outbox`, `fallback: []`). Each entry is `{ id: string; kind: 'post' | 'put' | 'delete'; endpoint: string; body?: unknown; issueKey: string; worklogId?: string; attemptCount: number; status: 'pending' | 'failed'; lastError?: string; enqueuedAt: string }`. `id` is a stable client-generated id (e.g. `crypto.randomUUID()`); `status` starts `'pending'`. The module exposes typed helpers: `enqueue(entry)`, `list()`, `remove(id)`, `update(id, patch)`, `markFailed(id, lastError)`, `clearOutbox()`. A Zod schema validates entries on read (fail-closed: drop a single corrupt entry, never throw). The module never imports React. (FR43, AR21, NFR6) *[Source: epics.md § Story 2.7 AC1; architecture.md § Directory structure "outbox.ts # Pending worklog writes queue (FR43)", § Data boundaries "Pending worklog outbox → chrome.storage.local (via lib/storage/outbox.ts)"; architecture.md § Storage layer "storage.defineItem<T>('local:key', { fallback })"; existing lib/storage/pinned-tickets.ts pattern]*

   > **Path is canonical: `lib/storage/outbox.ts`** (NOT `lib/outbox.ts`). The architecture's Implementation-Sequence step 7 says `lib/outbox.ts`, but the Directory-Structure, Data-Boundaries, and FR-mapping sections all say `lib/storage/outbox.ts` — the latter is canonical and matches every existing `lib/storage/*` sibling. The quota helper already references the `local:outbox` key prefix (`lib/storage/quota.ts:clearCache`), so use `local:outbox`.

2. **Enqueue + "Pending — will retry" chip on failure (replaces the 2.6 seam).** Given a worklog post (`QuickLogForm` / `PtoQuickAction`) or edit/delete (`LoggedToday` `WorklogRow`) fails with `Result.kind` of `network` or `rate-limited` (after the scheduler's in-call gating), when the failure is observed, the write is enqueued via `lib/storage/outbox.ts` and the affected row shows the existing `Clock` icon + "Pending — will retry" chip (`bg-state-info-subtle`, UX channel 2). The current no-op seam `enqueueFailedWorklogMutation` in `components/today/LoggedToday.tsx` is **replaced** with a real call into the outbox module (keep the same call-site signature so the surrounding `WorklogRow` failure handling does not restructure). The user's pre-failure data stays visible on the row; no data is lost. (FR43, AR21, NFR6, UX-DR15, UX-DR24) *[Source: epics.md § Story 2.7 AC1; 2-6 story § Task 5 "Outbox seam", AC6; components/today/LoggedToday.tsx:83 `enqueueFailedWorklogMutation`, :255 call-site; ux-design-specification.md § Color Usage "Pending worklog (outbox) — state.info_subtle bg + clock icon", § Feedback Patterns "#2 Status chips … 'Pending — will retry' … persist until the underlying state changes"]*

   > **DESIGN DECISION (binding for this story) — enqueue runs popup-side, retry runs in the service worker.** The epics AC1 says the failure is "observed in the service worker," but in the *current* codebase every worklog write (`postWorklog` / `updateWorklog` / `deleteWorklog`) executes **popup-side** through `lib/jira-client` (the `log-worklog` SW message is registered in `lib/messages.ts` but writes are not yet routed through the SW). Re-routing all writes through the SW is out of scope and would churn three components. **Therefore:** enqueue at the existing popup call-sites (where the `Result` is observed), and run the durable **retry loop in the service worker** via a `chrome.alarms` alarm (AC3). The outbox is `chrome.storage.local`, so both surfaces share it. When writes are later moved into the SW (a future refactor), the enqueue call simply moves with them — the outbox module API is unchanged. Note this variance in Completion Notes.

3. **Retry alarm in the service worker (`outbox-retry`, every 60s).** Given the outbox has ≥1 `pending` entry, when the service worker is alive, a `chrome.alarms` alarm named `outbox-retry` (`periodInMinutes: 1` — Chrome's minimum) drives a retry handler in `entrypoints/background.ts`. The handler reads the outbox, and for each `pending` entry replays the write through `lib/jira-client` (which already runs through `lib/scheduler`): `post` → `postWorklog`-equivalent, `put` → `updateWorklog`-equivalent, `delete` → `deleteWorklog`. On `Result.kind === 'ok'` the entry is removed from the outbox; on `network` / `rate-limited` failure `attemptCount` is incremented and `lastError` updated (entry stays `pending`); on a non-retryable `Result` (`forbidden` / `not-found` / `parse-error` / `auth-expired`) the entry is moved to `status: 'failed'` (it is a real error, not a transient one — do not retry forever). The alarm is created idempotently on SW boot (mirror the existing `token-refresh` / `daily-reminder` `chrome.alarms.get`-then-`create` guard) and the `onAlarm` listener gains an `alarm.name === 'outbox-retry'` branch. Process entries sequentially (the scheduler throttles to ~2 req/s); never throw out of the listener. (AR21, NFR6, AR20 scheduler) *[Source: epics.md § Story 2.7 AC2; architecture.md § Service worker "Outbox retry alarm (FR43)", § Alarms "1-min minimum interval"; entrypoints/background.ts existing alarm pattern; lib/scheduler.ts]*

4. **Success on retry → remove + single summary toast.** Given outbox entries succeed during an alarm fire, when each success result arrives, the entry is removed from `chrome.storage.local`. After the alarm handler finishes a pass, if ≥1 entry was drained successfully, the SW broadcasts a `badge-update` (so the badge re-syncs) and records the drained count so that **one** toast — "Synced N pending worklogs" (or "Synced 1 pending worklog" for N=1) — appears on next popup open (or immediately if the popup is open). If the popup is open and a row's entry drains, its "Pending" chip clears and the row returns to normal styling. Use a single toast per drain pass; never one-toast-per-entry. (UX channel 3) *[Source: epics.md § Story 2.7 AC3; ux-design-specification.md § Other Critical Flows "Outbox retry on connectivity recovery: background flow, no UI surface beyond a brief toast: 'Synced N pending worklogs.'", § Feedback Patterns "#3 Toast … 'Synced N pending worklogs' after outbox drain on reconnect … Maximum one toast on screen", § Loading States "Async non-blocking action (outbox retry) | No UI; status chip on the affected row"]*

   > Toasts auto-dismiss after 4s, max one on screen, factual past-tense tone (no "Success!"). If no toast component exists yet, surface the count via a minimal inline notice on popup mount and note the limitation — do not block. The toast string is the only success surface; **no per-row success animation** on background drain (the chip simply clears).

5. **Max retries (10) → `failed` sub-state with Retry-now / Discard.** Given a `pending` entry has `attemptCount` reach 10 without success, when the next transient retry fails, the entry is moved to `status: 'failed'` (NOT deleted — the worker must not silently lose it). When the popup is open, the affected Logged-today row shows a `state.danger` chip "Couldn't post after multiple tries — <lastError-derived friendly reason>" with a **"Retry now"** tertiary action and a **"Discard"** action; "Discard" requires an inline confirmation chip (reuse the 2.6 delete-confirm chip pattern). "Retry now" sets the entry back to `pending` with `attemptCount` reset (or appends a fresh attempt) and triggers an immediate retry pass; "Discard" calls `outbox.remove(id)`. The `<lastError reason>` is a pre-written friendly string keyed off the stored failure kind — never a raw exception. (UX-DR24 channel 2 danger) *[Source: epics.md § Story 2.7 AC4; ux-design-specification.md § Color System "danger #dc2626", § Iconography "XCircle (error)", "RefreshCw (sync, retry)"; 2-6 story AC4 inline-confirm-chip + ghost+text-state-danger pattern; architecture.md § Error handling "pre-written friendly strings keyed off the error kind"]*

   > **Variance vs UX spec (document it):** the UX spec frames network/auth deferral as indefinite "Pending" and does not define a "give up" UI for worklog writes — but **the epics AC4 explicitly mandates** the 10-retry → `failed` sub-state with Retry-now/Discard. The epics AC is the more specific, intentional requirement; implement it. There is no `danger` Button variant — use `variant="ghost"` + `text-state-danger` (the established 2.5/2.6 convention). The chip pairs `XCircle` (icon) with text (color-not-sole-signal).

6. **Disconnect (Story 1.3) clears the outbox.** Given the user disconnects, when `disconnectAll()` runs, the outbox is cleared along with the rest of `chrome.storage.local`, AND the `outbox-retry` alarm is cleared. `chrome.storage.local.clear()` already wipes the `local:outbox` key, so AC6 is satisfied for storage by the existing call; this story's *additive* requirement is to also `chrome.alarms.clear('outbox-retry')` inside `disconnectAll` (next to the existing `chrome.alarms.clear('token-refresh')`), so no orphaned alarm keeps firing post-disconnect. (consistent with full reset) *[Source: epics.md § Story 2.7 AC5; lib/disconnect.ts:13,25 existing `chrome.alarms.clear('token-refresh')` + `chrome.storage.local.clear()`; lib/storage/quota.ts:clearCache already lists `local:outbox`]*

7. **No silent failures; core log flow never blocked.** Given any outbox enqueue, retry, or drain path errors, when the failure is observed, it surfaces via the row chip (AC2/AC5) AND a `log.warn`/`log.error` with a `noun.verb` event (`outbox.enqueued`, `outbox.retry.start`, `outbox.retry.succeeded`, `outbox.retry.failed`, `outbox.entry.failed`, `outbox.drained`). A failed enqueue or retry never throws out of the alarm listener and never blocks logging new time. No `console.log`. Payloads are flat, no PII (no token contents). (architecture binding) *[Source: architecture.md § Logging "log.<level>(eventName, payload) … noun.verb … no PII", § Error handling "Never swallow an error silently"; deferred-work.md no-silent-failure carryover; ESLint forbids console.log outside *.test.ts]*

8. **Tests (cross-cutting module requirement).** Given `lib/storage/outbox.ts` is a cross-cutting module, when the dev runs `npm run test`, co-located Vitest tests cover: enqueue + list + remove + update; Zod fail-closed (corrupt entry dropped, not thrown); retry-success path (entry removed); retry-fail-then-success path (attemptCount increments, then drains); retry-exceeds-max path (status → `failed` at attempt 10, not deleted); non-retryable kind → immediate `failed`; disconnect clears outbox + alarm. The alarm handler logic is unit-testable (extract the drain function so it can be called directly with mocked `lib/jira-client`); the `WorklogRow` `failed`-state UI (Retry-now / Discard) has component tests in `LoggedToday.test.tsx`. (AR29 co-located tests) *[Source: epics.md § Story 2.7 AC6; architecture.md § Testing "Tests are co-located as *.test.ts", "new modules in lib/ require co-located unit tests"; lib/jira-client.test.ts mock harness precedent]*

9. **Gates pass.** `npm run lint` (0 errors), `npm run compile` / `tsc --noEmit` (0 errors), `npm run test` (`vitest run`), and `npm run build` all pass. New `lib/storage/outbox.ts` has a co-located `lib/storage/outbox.test.ts`; changed components keep their co-located `*.test.tsx` green. (Project uses **npm**, not pnpm.) *[Source: architecture.md § Enforcement; 2-6 story § gates; package.json scripts: test = "vitest run", compile = "tsc --noEmit", lint = "eslint ."]*

## Tasks / Subtasks

- [x] **Task 1 — Create `lib/storage/outbox.ts` (durable queue + Zod schema)** (AC: #1, #7)
  - [x] `storage.defineItem<OutboxEntry[]>('local:outbox', { fallback: [] })` (mirror `lib/storage/pinned-tickets.ts`).
  - [x] Define `OutboxEntry` type + `OutboxEntrySchema` (Zod). Fields: `id`, `kind: 'post'|'put'|'delete'`, `endpoint`, `body?`, `issueKey`, `worklogId?`, `attemptCount: number`, `status: 'pending'|'failed'`, `lastError?`, `enqueuedAt`.
  - [x] Helpers: `enqueue(...)` generating `id`/`enqueuedAt`/`attemptCount:0`/`status:'pending'`; `list()` (read + Zod-validate per entry, drop corrupt ones, never throw); `remove(id)`; `update(id, patch)`; `markFailed(id, lastError)`; `clearOutbox()`.
  - [x] `MAX_ATTEMPTS = 10` constant.
  - [x] Framework-agnostic (no React import). `log.warn`/`log.info` with `outbox.*` events. Co-located `lib/storage/outbox.test.ts`.

- [x] **Task 2 — Replace the popup-side seam with a real enqueue** (AC: #2, #7)
  - [x] In `components/today/LoggedToday.tsx`, replaced the no-op `enqueueFailedWorklogMutation` body with `outbox.enqueue(...)` building the PUT/DELETE entry (`kind`, `endpoint`, `body` for edit, `issueKey`, `worklogId`). Kept the function name + the single call-site in `handleEditFailure`; enriched the argument with `issueKey`/`editBody` (no `WorklogRow` restructure). The "Pending — will retry" chip still renders on `network`/`rate-limited`.
  - [x] In `QuickLogForm.tsx` + `PtoQuickAction.tsx`: on a `network`/`rate-limited` post failure, enqueue a `post` entry and surface a "Pending — will retry" chip (previously these silently showed a generic error / dropped the post).
  - [x] `log.warn('outbox.enqueued', { kind, issueKey })` (no PII) — emitted inside `outbox.enqueue`.

- [x] **Task 3 — Service-worker retry alarm + drain function** (AC: #3, #4, #7)
  - [x] In `entrypoints/background.ts`: create `outbox-retry` alarm idempotently (`chrome.alarms.get` → `create({ periodInMinutes: 1 })`); added `alarm.name === 'outbox-retry'` branch in `onAlarm`.
  - [x] Extracted the drain into `runOutboxRetryPass(client)` in `lib/storage/outbox.ts`: replays `pending` entries sequentially; `ok` → `remove`; transient → `update(attemptCount+1)` (or `markFailed` at `MAX_ATTEMPTS`); non-retryable kind → `markFailed`. Returns `{ drained }`.
  - [x] After a pass with `drained > 0`: SW broadcasts `badge-update { hoursMissing: 0 }`; drained count persisted to `local:outbox-drained` (accumulated in `runOutboxRetryPass`).
  - [x] `log.info('outbox.drained', { count })`; the alarm handler wraps the pass in try/catch and never throws.

- [x] **Task 4 — Popup "Synced N pending worklogs" toast + `failed`-state row UI** (AC: #4, #5)
  - [x] On `TodayView` mount, reads `outboxDrainedItem`; if ≥1, shows one notice "Synced N pending worklog(s)" (4s auto-dismiss, dismiss button) then clears the counter. (No dedicated toast component exists — minimal inline notice; noted.)
  - [x] `WorklogRow` watches the outbox and renders the `failed`-state chip (`text-state-danger` + `XCircle`) "Couldn’t post after multiple tries — <reason>" with **Retry now** (`RefreshCw`) and **Discard** (inline-confirm chip reusing the 2.6 delete-confirm pattern). Retry now → reset entry to `pending` (attemptCount 0) + immediate `runOutboxRetryPass`; Discard → `outbox.remove(id)`. Esc reverts the Discard confirm.
  - [x] Friendly `<reason>` STRINGS map keyed off the stored failure kind (curly apostrophes).

- [x] **Task 5 — Disconnect clears alarm** (AC: #6)
  - [x] `lib/disconnect.ts` now `await chrome.alarms.clear('outbox-retry')` (try/catch + `log.warn`, mirroring token-refresh). Storage clear already removes `local:outbox`.
  - [x] `lib/disconnect.test.ts` asserts `outbox-retry` alarm is cleared.

- [x] **Task 6 — Tests** (AC: #8)
  - [x] `lib/storage/outbox.test.ts` (17 tests): enqueue/list/remove/update/markFailed/clearOutbox; Zod fail-closed (corrupt entry dropped, never throws); `runOutboxRetryPass` success / put+delete replay / fail-then-success / exceeds-max (→`failed` at attempt 10, not removed) / non-retryable→`failed` / pending-only / drained counter / never-throws-on-rejection. Mocks `wxt/utils/storage` (in-memory) + `@/lib/jira-client`.
  - [x] `components/today/LoggedToday.test.tsx`: enqueue called on `network` delete + edit failures; `failed`-state chip renders Retry-now/Discard; Discard confirm → `remove`; Retry-now → reset+drain.
  - [x] `QuickLogForm.test.tsx` + `PtoQuickAction.test.tsx`: network → enqueue post + pending chip; non-retryable → generic error, no enqueue.
  - [x] `lib/disconnect.test.ts`: `outbox-retry` cleared on disconnect.

- [x] **Task 7 — Verify gates** (AC: #9)
  - [x] `npm run lint` (0 errors, 54 import/order warnings pre-existing), `npm run compile` (0 errors), `npm run test` (414 passed / 1 skipped), `npm run build` (success) all green.

## Dev Notes

### What this story adds (this completes Epic 2)

Story 2.7 turns the documented **no-op outbox seam** from Story 2.6 into a real durable queue. Today, when a worklog post/edit/delete fails with `network` or `rate-limited`, the UI shows a "Pending — will retry" chip but the write is **lost** (`enqueueFailedWorklogMutation` only `log.warn`s). This story makes the write durable in `chrome.storage.local`, retries it on a service-worker alarm, drains it on reconnect, and escalates to a user-actionable `failed` state after 10 attempts.

**Consume the 2.6 seam cleanly — do not restructure `WorklogRow`:**
- The seam is `enqueueFailedWorklogMutation(info: { worklogId; kind: 'edit'|'delete'; resultKind })` at `components/today/LoggedToday.tsx:83`, called at `:255` inside `handleEditFailure` (only on `err.kind === 'network' || 'rate-limited'`). **Replace the body** with a real `outbox.enqueue(...)`; keep the name/signature so the surrounding failure handler and the chip rendering stay intact.
- The post-side (`QuickLogForm`, `PtoQuickAction`) does NOT yet have an outbox seam — verify their `onSuccess`/network-failure branches and add enqueue + the pending chip there (a failed POST must not silently vanish).

### ⚠️ The enqueue-location decision (read AC2's note)

All worklog writes currently run **popup-side** via `lib/jira-client` (`postWorklog`/`updateWorklog`/`deleteWorklog`), even though `lib/messages.ts` registers a `log-worklog` SW message. The epics says "observed in the service worker"; we **enqueue popup-side** (where the `Result` is seen) and **retry in the SW** (durable alarm). Both share `chrome.storage.local:outbox`. This is the pragmatic wiring that matches the actual codebase — do not re-route all writes through the SW (out of scope). Note this in Completion Notes.

### Reuse aggressively — do not reinvent

- **Storage module shape:** copy `lib/storage/pinned-tickets.ts` almost verbatim (`storage.defineItem<T[]>('local:key', { fallback: [] })` + array-mutating helpers). Keep one file per data class.
- **Alarm pattern:** copy the `token-refresh` / `daily-reminder` idempotent `chrome.alarms.get`→`create` guard and the `onAlarm` `if (alarm.name === …)` branch in `entrypoints/background.ts`. The `alarms` permission is already in `wxt.config.ts`.
- **Jira write path:** retries replay through the existing `postWorklog`/`updateWorklog`/`deleteWorklog` in `lib/jira-client.ts`, which already run inside `scheduler.acquire(...)` and return `Result<T, JiraError>`. Do NOT build a parallel fetch path. The `Result.kind` union: `ok` / `rate-limited` / `auth-expired` / `network` / `parse-error` / `forbidden` / `not-found` — only `network`/`rate-limited` are transient/retryable.
- **Disconnect:** `disconnectAll()` (`lib/disconnect.ts`) already `chrome.storage.local.clear()`s (wipes `local:outbox`). Only add the `chrome.alarms.clear('outbox-retry')` line.
- **Inline-confirm chip** for Discard: reuse the 2.6 delete-confirm chip pattern (Cancel-left, ghost + `text-state-danger`).
- **`badge-update` broadcast:** fire-and-forget `{ hoursMissing: 0 }` (the SW recomputes the real number — 2.5/2.6 convention).

### UX tokens & copy (binding from ux-design-specification.md)

- **Pending chip (already exists):** `Clock` icon + `bg-state-info-subtle` (`#cffafe`), text "Pending — will retry", persists (channel 2, no auto-dismiss).
- **Failed chip (new, AC5):** `XCircle` icon + `text-state-danger` (`#dc2626`), "Couldn't post after multiple tries — <reason>", with **Retry now** + **Discard**. Color is never the sole signal — always icon + text.
- **Reconnect toast (AC4):** exactly "Synced N pending worklogs" (singular "Synced 1 pending worklog"); 4s auto-dismiss, max one on screen, factual past-tense. This is the **only** success surface for background drain — no per-row success animation.
- **`RefreshCw`** is the designated retry/sync icon (use for Retry-now if an icon is wanted).
- **Accessibility:** error chip `role="alert"` / `aria-live="assertive"` (2.6 precedent); Retry-now/Discard are real `<button>`s with `aria-label`s, ≥32×32px; Esc on the Discard-confirm reverts (never discards).

### Service-worker / MV3 reality

The SW sleeps and restarts unpredictably (MV3). Make alarm creation idempotent on every boot. The 60s alarm is the retry cadence; there is **no `navigator.onLine` / `'online'` listener** specified in architecture — the alarm-driven loop is the connectivity-recovery mechanism (a pending entry that was offline simply succeeds on the next pass once the network is back). Do not add an online-event listener unless trivially additive; it's not required. Process entries **sequentially** so the scheduler's ~2 req/s throttle isn't overwhelmed; never throw out of `onAlarm`.

### Current codebase state (read these before modifying)

| File | Current state | What this story changes |
|---|---|---|
| `lib/storage/outbox.ts` | **DOES NOT EXIST** | **Create** — durable queue + Zod schema + helpers + `runOutboxRetryPass` |
| `lib/storage/pinned-tickets.ts` | `storage.defineItem<T[]>('local:pinnedTickets',{fallback:[]})` + helpers | NO change — copy as the pattern template |
| `lib/storage/quota.ts` | `clearCache` already lists `local:outbox` prefix | NO change — confirms key name `local:outbox` |
| `components/today/LoggedToday.tsx` | `enqueueFailedWorklogMutation` no-op (`:83`), called `:255` in `handleEditFailure` (network/rate-limited only); pending chip + STRINGS | **Replace** seam body with `outbox.enqueue`; add `failed`-state chip + Retry-now/Discard UI |
| `components/today/QuickLogForm.tsx` | posts via `postWorklog`; onSuccess sets `worklogId`; double-submit guard | Add enqueue + pending chip on `network`/`rate-limited` post failure |
| `components/today/PtoQuickAction.tsx` | posts via PTO path; onSuccess sets `worklogId` | Add enqueue + pending chip on `network`/`rate-limited` failure |
| `components/today/TodayView.tsx` | owns `loggedEntries`, handleEdited/handleDeleted, total | Read drained-count signal on mount → "Synced N" toast |
| `entrypoints/background.ts` | `token-refresh` + `daily-reminder` alarms; idempotent create; `onAlarm` listener; opens options on install | **Add** `outbox-retry` alarm create + `onAlarm` branch calling the drain |
| `lib/disconnect.ts` | `chrome.alarms.clear('token-refresh')`, `chrome.storage.local.clear()` | **Add** `chrome.alarms.clear('outbox-retry')` |
| `lib/disconnect.test.ts` | asserts `token-refresh` cleared | **Add** assert `outbox-retry` cleared |
| `lib/jira-client.ts` | `postWorklog`, `updateWorklog`, `deleteWorklog`; Result-typed; scheduler+refresh | NO change — replay through these |
| `lib/scheduler.ts` | `scheduler.acquire(fn)` token-bucket singleton (2 req/s) | NO change — writes already use it |
| `lib/log.ts` | `log.<level>(event, payload)`; redacts tokens; no console.log | NO change — use `outbox.*` events |
| `lib/messages.ts` | `sendMessage`/`onMessage`; `badge-update` registered | NO change — reuse `badge-update` (consider a `outbox-synced` msg only if needed) |
| `wxt.config.ts` | `permissions: ['identity','storage','alarms','notifications']` | NO change — `alarms` already granted |

### Testing strategy

- **`lib/storage/outbox.test.ts`:** Follow the `lib/storage/*.test.ts` pattern (in-memory storage mock) for enqueue/list/remove/update + Zod fail-closed. For `runOutboxRetryPass`, mock `lib/jira-client` (`vi.mock('@/lib/jira-client')`) returning `ok` / `network` / `forbidden` to drive: success-drain, fail-then-success (attemptCount increments), exceeds-max (→`failed` at attempt 10, not removed), non-retryable→immediate `failed`. Use the `lib/jira-client.test.ts` harness as the mocking reference.
- **`components/today/LoggedToday.test.tsx`:** upgrade existing QueryClient `renderWithProviders` tests — assert `outbox.enqueue` called on a `network` edit/delete failure (mock `@/lib/storage/outbox`); render a `failed`-state row → Retry-now triggers retry, Discard→confirm→`remove`.
- **`lib/disconnect.test.ts`:** assert `chrome.alarms.clear` called with `'outbox-retry'` (the file already mocks `chrome.alarms.clear`).

### Carryover from prior stories (apply, don't repeat mistakes)

- **No silent failures** (deferred-work.md, 2.3→2.6): every failure path surfaces a chip AND a `log.warn`/`log.error`. AC2/AC5/AC7.
- **`badge-update` always `{ hoursMissing: 0 }`** (2.5/2.6): the SW recomputes the real number (Story 3.1). Broadcast after a successful drain.
- **No `danger` Button variant** (2.5/2.6): use `variant="ghost"` + `text-state-danger`; do not refactor `Button`.
- **Project uses npm** not pnpm — run `npm run lint|compile|test|build`.
- **Curly apostrophe `’`** in user-facing STRINGS (QuickLogForm/PtoQuickAction/LoggedToday convention).
- **One conversion utility** — outbox `body` for posts/edits carries `timeSpentSeconds` already-converted (do not inline `* 3600`); replays send the stored body as-is.

### Project Structure Notes

- New `lib/storage/outbox.ts` + `lib/storage/outbox.test.ts` — kebab-case, one data class per file, named exports, co-located test. ✅ Matches `lib/storage/*` siblings.
- The drain function is testable in isolation (called by the SW alarm handler) — keep SW-only Chrome API access (`chrome.alarms`) in `entrypoints/background.ts`; keep storage + replay logic in `lib/storage/outbox.ts` so it unit-tests without a SW.
- **Path canonical:** `lib/storage/outbox.ts` (architecture Implementation-Sequence typo `lib/outbox.ts` overridden by Directory-Structure/Data-Boundaries/FR-map — see AC1 note).
- **Documented variance (binding):** enqueue runs popup-side, retry runs in the SW (see AC2 note) — because writes are not yet SW-routed. **Documented variance:** the 10-retry `failed` state implements the epics AC4 over the UX spec's "indefinite pending" framing (AC5 note).

### References

- [Epics: Story 2.7 Outbox — Queue Failed Writes & Retry on Reconnect](../planning-artifacts/epics.md) (§ Story 2.7, AC1–AC6); [Epic 2 objective](../planning-artifacts/epics.md) (FR43, NFR6, AR21)
- [PRD: FR43 (explicit offline error state + no silent data loss), NFR6 (offline-tolerant, retries on reconnect)](../planning-artifacts/prd.md)
- [Architecture: Caching topology / Data boundaries — "Pending worklog outbox → chrome.storage.local (via lib/storage/outbox.ts), Cleared on successful send"](../planning-artifacts/architecture.md)
- [Architecture: Directory structure — "lib/storage/outbox.ts # Pending worklog writes queue (FR43)" + outbox.test.ts](../planning-artifacts/architecture.md)
- [Architecture: Service worker — "Outbox retry alarm (FR43)"; Alarms "1-min minimum interval"; "Owns the scheduler instance"](../planning-artifacts/architecture.md)
- [Architecture: Storage layer — storage.defineItem<T>('local:key', { fallback }); quota wrapper](../planning-artifacts/architecture.md)
- [Architecture: API patterns — single lib/jira-client.ts, Result<T, JiraError>, scheduler gating; Logging noun.verb no-PII; Error handling never-silent + friendly strings; Discriminated unions](../planning-artifacts/architecture.md)
- [Architecture: Testing — co-located *.test.ts; new lib/ modules require unit tests](../planning-artifacts/architecture.md)
- [UX: Feedback Patterns — Channel 2 status chips ("Pending — will retry", persist), Channel 3 toast ("Synced N pending worklogs", 4s, max one)](../planning-artifacts/ux-design-specification.md)
- [UX: Color Usage — "Pending worklog (outbox) — state.info_subtle bg + clock icon"; Color System danger #dc2626, info_subtle #cffafe; Iconography Clock/XCircle/RefreshCw; color-not-sole-signal; aria-live](../planning-artifacts/ux-design-specification.md)
- [UX: Other Critical Flows — "Outbox retry on connectivity recovery: background flow … brief toast"; Loading States "Async non-blocking action (outbox retry) | No UI; status chip on the affected row"](../planning-artifacts/ux-design-specification.md)
- [Previous story: 2.6 — outbox seam (Task 5), pending/error chip + STRINGS, inline-confirm-chip + ghost+text-state-danger, badge-update convention](./2-6-edit-delete-worklogs-from-logged-today.md)
- [Deferred work: no-silent-failure, badge-update {0}, Button danger styling, npm gates](./deferred-work.md)
- [Existing: components/today/LoggedToday.tsx — enqueueFailedWorklogMutation seam (:83) + call-site (:255), pending chip](../../components/today/LoggedToday.tsx)
- [Existing: lib/storage/pinned-tickets.ts — storage.defineItem array pattern to copy](../../lib/storage/pinned-tickets.ts)
- [Existing: lib/storage/quota.ts — clearCache lists local:outbox (key name)](../../lib/storage/quota.ts)
- [Existing: entrypoints/background.ts — idempotent alarm create + onAlarm pattern to copy](../../entrypoints/background.ts)
- [Existing: lib/disconnect.ts — chrome.alarms.clear + storage.local.clear (AC6)](../../lib/disconnect.ts)
- [Existing: lib/jira-client.ts — postWorklog/updateWorklog/deleteWorklog (replay target); lib/scheduler.ts (acquire)](../../lib/jira-client.ts)
- [Existing: lib/log.ts (noun.verb, redaction); lib/messages.ts (sendMessage, badge-update)](../../lib/log.ts)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context) — claude-opus-4-8[1m]

### Debug Log References

- `npm run test` → 39 files, 414 passed / 1 skipped (baseline 38 / 390 / 1; +1 file, +24 tests).
- `npm run compile` (tsc --noEmit) → 0 errors. Fixed two `exactOptionalPropertyTypes` issues: derived `OutboxEntry` from `z.infer` (optional fields → `T | undefined`) and split the replay body cast into `PostBody`/`PutBody` since `postWorklog` types `comment` as `string` while edits carry an ADF object.
- `npm run lint` → 0 errors, 54 warnings (all pre-existing `import/order`). Reordered the new `wxt/utils/storage` import in `outbox.ts` to clear the one new warning.
- `npm run build` → chrome-mv3 built successfully (background.js includes the outbox drain).

### Completion Notes List

- **Durable outbox (`lib/storage/outbox.ts`)** mirrors `pinned-tickets.ts`: `storage.defineItem<OutboxEntry[]>('local:outbox', { fallback: [] })`, a Zod-validated `list()` that drops corrupt rows fail-closed (never throws), and `enqueue`/`remove`/`update`/`markFailed`/`clearOutbox` helpers. `MAX_ATTEMPTS = 10`. Framework-agnostic (no React import). The drain is `runOutboxRetryPass(client = defaultClient)` — the client is injectable so it unit-tests with a mocked `lib/jira-client`. A `local:outbox-drained` counter (`outboxDrainedItem`) carries the success count to the popup.
- **Variance #1 (documented, binding from AC2):** enqueue runs **popup-side** (where the `Result` is observed in `LoggedToday`/`QuickLogForm`/`PtoQuickAction`) and the **retry loop runs in the service worker** via the `outbox-retry` `chrome.alarms` alarm (`periodInMinutes: 1`). Writes are not yet SW-routed; when they later move into the SW the enqueue call moves with them and the outbox API is unchanged.
- **Variance #2 (documented, binding from AC4/epics):** implemented the 10-retry → `failed` sub-state with Retry-now / Discard (epics AC4) over the UX spec's "indefinite pending" framing. `failed` entries are never silently deleted.
- **2.6 seam consumed cleanly:** `enqueueFailedWorklogMutation` keeps its name and single call-site inside `handleEditFailure`; only its body (now a real `outbox.enqueue`) and argument shape (added `issueKey` + `editBody`) changed. `WorklogRow` failure handling was not restructured.
- **No toast component exists yet** — the "Synced N pending worklogs" surface is a minimal inline notice on `TodayView` mount (role="status", 4s auto-dismiss, single instance). Limitation noted per AC4's fallback clause.
- **No-silent-failure / no-PII:** every path logs a `noun.verb` `outbox.*` event with flat payloads (`kind`, `issueKey`, `count`, `attempt`, `reason`) — no token contents, no `console.log`. The alarm handler and every replay are wrapped so nothing throws out of `onAlarm`.
- **Retry-now** triggers an immediate `runOutboxRetryPass()` from the popup (the framework-agnostic drain runs in either surface, both sharing `chrome.storage.local`), so the user does not wait up to 60s for the alarm.
- No new npm dependencies.

### File List

**Created**
- `lib/storage/outbox.ts` — durable queue, Zod schema, helpers, `runOutboxRetryPass`.
- `lib/storage/outbox.test.ts` — 17 co-located unit tests.

**Modified**
- `components/today/LoggedToday.tsx` — real `outbox.enqueue` in the seam; `failed`-state chip + Retry-now / Discard (inline-confirm); friendly-reason STRINGS; `XCircle`/`RefreshCw` icons.
- `components/today/LoggedToday.test.tsx` — outbox mock; updated network test to assert enqueue; new edit-enqueue + failed-state (chip / Discard / Retry-now) tests.
- `components/today/QuickLogForm.tsx` — enqueue `post` + "Pending — will retry" chip on transient post failure; `pending` submit substate.
- `components/today/QuickLogForm.test.tsx` — outbox mock; non-retryable→error test; new network→enqueue+pending test.
- `components/today/PtoQuickAction.tsx` — enqueue `post` + pending chip on transient PTO failure.
- `components/today/PtoQuickAction.test.tsx` — outbox mock; non-retryable→error test; new network→enqueue+pending test.
- `components/today/TodayView.tsx` — read `outboxDrainedItem` on mount → single "Synced N" inline notice; clear counter.
- `components/today/TodayView.test.tsx` — outbox mock (`outboxItem`/`outboxDrainedItem`).
- `entrypoints/background.ts` — idempotent `outbox-retry` alarm create + `onAlarm` branch calling `handleOutboxRetry` (drain → `badge-update` on `drained > 0`).
- `lib/disconnect.ts` — `chrome.alarms.clear('outbox-retry')` (try/catch + `log.warn`).
- `lib/disconnect.test.ts` — assert `outbox-retry` alarm cleared.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `2-7` → `review`.

### Review Findings

Code review (2026-06-21, adversarial 3-layer: Blind Hunter / Edge Case Hunter / Acceptance Auditor). Triage outcome: 3 patch (applied), 5 defer, 4 dismissed.

- [x] [Review][Patch] Failed-row match ignores `issueKey` — wrong-row mis-attribution [components/today/LoggedToday.tsx:207] — `sync()` matched only on `worklogId`; Jira worklog IDs are not globally unique, so a `failed` put/delete could render its danger chip on a different issue's row. Added `e.issueKey === entry.key` to the match predicate.
- [x] [Review][Patch] Malformed outbox entries fired at Jira / TypeError swallowed into infinite retry [lib/storage/outbox.ts:156] — a `put`/`delete` with a missing `worklogId` was replayed as `…/worklog/` (empty id); a `post` with `undefined` body was cast `as PostBody` and threw a TypeError caught into a forever-retry. `replay()` now returns a synthetic non-retryable `not-found` Result for these so the entry is marked `failed` immediately instead of looping to MAX_ATTEMPTS.
- [x] [Review][Patch] No drain-in-progress guard → concurrent `runOutboxRetryPass` double-posts a worklog [lib/storage/outbox.ts:188] — popup Retry-now and the SW 60s alarm (or two overlapping >60s passes) could both replay the same `pending` entry → duplicate worklog in Jira. Added a module-level in-flight guard so a second concurrent pass in the same context short-circuits (`{ drained: 0 }`).
- [x] [Review][Defer] Failed `post`-kind entries have no Retry-now/Discard surface [components/today/LoggedToday.tsx:207] — deferred: a failed POST (QuickLogForm/PtoQuickAction) never produces a `LoggedEntry` row, so the AC5 failed-row UI (which is `put`/`delete`-scoped by design) has nowhere to attach. The entry stays durable (not lost) per AC5's "never silently delete." Surfacing it needs a new UI affordance that the spec does not define — product-design decision, out of scope for this story.
- [x] [Review][Defer] Transient `post` failure leaves no visible row in Today list [components/today/QuickLogForm.tsx:134, components/today/PtoQuickAction.tsx:135] — deferred: inherent to the AC2 binding variance (posts enqueue popup-side, `onLogged` is not called on failure). Write is durable; "stays visible on the row" wording is satisfied for edit/delete. Same root as the failed-post-UI item.
- [x] [Review][Defer] Disconnect does not abort an in-flight drain pass [lib/disconnect.ts:19, entrypoints/background.ts:48] — deferred: `chrome.alarms.clear` cancels future fires; a pass already executing when disconnect runs could write `local:outbox` / `local:outbox-drained` after `storage.local.clear()`. Narrow MV3 timing window; a clean fix needs a cancellation token threaded through `runOutboxRetryPass`. Low probability, documented.
- [x] [Review][Defer] Cross-context read-modify-write of `local:outbox` has no compare-and-set [lib/storage/outbox.ts:100] — deferred: `enqueue`/`remove`/`update` each `list()`-then-`setValue()` with no transaction; a concurrent write from another JS context could clobber. This is the established `lib/storage/*` pattern (pinned-tickets etc.) and `chrome.storage.local` offers no transaction primitive. Pre-existing architectural constraint.
- [x] [Review][Defer] `outboxDrainedItem` counter read-add-write / read-clear race [lib/storage/outbox.ts:252, components/today/TodayView.tsx:46] — deferred: cosmetic — affects only the "Synced N" toast count under concurrent drain/mount or multiple popups; no data loss.

## Change Log

| Date       | Change                                                                                                  |
|------------|---------------------------------------------------------------------------------------------------------|
| 2026-06-21 | Implemented Story 2.7: durable outbox (`lib/storage/outbox.ts`) replacing the 2.6 no-op seam; popup-side enqueue on transient worklog post/edit/delete failures; service-worker `outbox-retry` alarm + `runOutboxRetryPass` drain; "Synced N" popup notice; 10-retry `failed` state with Retry-now/Discard; disconnect clears the alarm. Gates green (tests 414/1-skip, tsc 0, lint 0 errors, build ok). Status → review. |
