## Deferred from: code review of 4-1-week-view-shell-7-day-grid-with-subtask-rows (2026-06-27)

- `fetchCurrentUserWeekWorklogsByIssue` does not paginate the JQL search (`maxResults=100`, no `nextPageToken`/`startAt` follow-up). A user who logged against >100 distinct issues in one week loses the overflow rows from the grid and their hours from the week total, with no error shown. Faithfully mirrors the pre-existing flat sibling `fetchCurrentUserWeekWorklogs`; should be fixed in both fetchers together (out of scope for the 4.1 shell). [lib/jira-client.ts:528]

## Deferred from: code review of 3-1-toolbar-badge-counter (2026-06-22)

- Timezone mismatch between JQL `worklogDate` (Jira-server day) and the client-side `started` epoch filter (SW-local day). Only affects worklogs within hours of the week boundary for users whose SW timezone differs from their Jira timezone; correcting it needs the Jira user timezone which is not currently fetched. [lib/jira-client.ts]
- No mutex across concurrent `updateBadge` calls (alarm + message + boot) — last-writer-wins can briefly flicker the badge. Low impact on a 30-min cadence; converges on the next update. [entrypoints/background.ts]
- `workdaysSoFar` counts the current weekday as a full day and ignores public holidays — this is the spec-defined behavior (Monday → 1, full target); holiday-awareness is out of scope. [lib/cycle-range.ts]

## Deferred from: code review of 2-7-outbox-queue-failed-writes-retry-on-reconnect (2026-06-21)

- Failed `post`-kind outbox entries have no Retry-now/Discard surface — a failed POST never produces a `LoggedEntry` row, so the AC5 failed-row UI (put/delete-scoped by design) has nowhere to attach. Entry stays durable (not lost). Needs a new UI affordance the spec does not define — product-design decision, out of scope. [components/today/LoggedToday.tsx:207]
- Transient `post` failure leaves no visible row in the Today list — inherent to the AC2 binding variance (posts enqueue popup-side; `onLogged` not called on failure). Durable in storage. Same root as the failed-post-UI item. [components/today/QuickLogForm.tsx:134, components/today/PtoQuickAction.tsx:135]
- Disconnect does not abort an in-flight drain pass — `chrome.alarms.clear` cancels future fires, but a pass already executing could write `local:outbox`/`local:outbox-drained` after `storage.local.clear()`. Narrow MV3 timing window; clean fix needs a cancellation token threaded through `runOutboxRetryPass`. [lib/disconnect.ts:19, entrypoints/background.ts:48]
- Cross-context read-modify-write of `local:outbox` has no compare-and-set — `enqueue`/`remove`/`update` each `list()`-then-`setValue()`; a concurrent write from another JS context could clobber. Established `lib/storage/*` pattern; `chrome.storage.local` has no transaction primitive. (Same-context double-drain is now guarded.) [lib/storage/outbox.ts:100]
- `outboxDrainedItem` counter read-add-write / read-clear race — cosmetic; affects only the "Synced N" toast count under concurrent drain/mount or multiple popups; no data loss. [lib/storage/outbox.ts:252, components/today/TodayView.tsx:46]

## Deferred from: code review of 2-6-edit-delete-worklogs-from-logged-today (2026-06-21)

- Comment round-trip is incomplete: `adfToText` (lib/adf.ts) is built and tested but never wired into the edit form, and `LoggedEntry.comment` is only set by an in-session edit — so a worklog that already has a server-side ADF comment shows a blank comment field on Edit, and a previously-set comment cannot be cleared (omitting `comment` on PUT leaves it untouched). Within the story's "acceptable v1 limitation" envelope. Follow-up: hydrate `entry.comment` from the worklog's ADF comment via `adfToText`, and decide on a comment-clear strategy. [components/today/LoggedToday.tsx:156,352; lib/adf.ts:adfToText]
- Unparseable hours in edit mode shows no explanatory text (only a red border); over-limit shows a message but unparseable does not. Low-value; border feedback present and roughly consistent with QuickLogForm. [components/today/LoggedToday.tsx editing render]

## Deferred from: code review of 1-1-project-scaffold-and-oauth-connect (2026-06-20)

- shadcn/ui only shipped `Button` (10 primitives deferred) — acknowledged in dev notes; add via `pnpm dlx shadcn@latest add` when needed.
- Design tokens in CSS `@theme` vs `tailwind.config.ts` — Tailwind v4 CSS-first pattern, functionally equivalent.
- Disconnect clears tokens instead of no-op stub — dev convenience, documented in completion notes.
- Atlassian client ID committed to repo — PKCE makes client_id public; story already addresses this.
- `parseError` stores `issue: unknown` — API design choice; consumers narrow via runtime checks.
- `jsdom` environment set globally in Vitest — performance optimization, not a bug.
- `postinstall: "wxt prepare"` may fail in CI — no CI configured yet; address when CI is set up.

## Deferred from: code review of 1-2-silent-token-refresh-30-day-auth-survival (2026-06-20)

- `handleTokenRefresh` ignores the rate-limit `Retry-After` backoff and emits no re-auth signal on `auth-expired` — UI fallback is out of scope per the story's UX-DR note; rate-limit-aware backoff scheduling belongs to a later story. [entrypoints/background.ts:28-36]
- Expiry math depends on wall-clock `Date.now()`; a backward clock jump (sleep/resume, NTP correction) can misjudge token validity despite the 60s/120s buffers — inherent limitation, not introduced by this change. [lib/oauth/refresh.ts:69; lib/storage/tokens.ts:73-75]
- (round 2) Waiter misclassifies a holder's terminal failure (auth-expired / network) as `lock-contention` and does not self-retry once the lock frees — best-effort contention path the spec treats as rare; next alarm retries within 1 min, UI re-auth signalling out of scope. [lib/oauth/refresh.ts:79-92]
- (round 2) `chrome.alarms.get` rejection only logs with no fallback create; `onAlarm` listener registered after `await`s can miss an alarm firing in the SW-wake window — low likelihood, bounded by the 2-min pre-expiry margin. [entrypoints/background.ts:44-57]
- (round 3) Storage mutex keys on `Date.now()`; two callers with an identical timestamp could both pass read→set→verify. Unreachable today (single-flight + single SW instance), but a `crypto.randomUUID()` nonce would harden it. [lib/storage/refresh-mutex.ts:6-26]

## Deferred from: code review of 2-1-popup-shell-view-router-tanstack-query-setup (2026-06-21)

- getAuth() catch conflates all errors with "disconnected" — storage I/O errors, quota errors, and missing tokens all show same "Connect to Jira" UI; acceptable for Story 2.1 shell since auth-expired is the dominant case. [entrypoints/popup/App.tsx:40-44]
- fire-and-forget setPopupView drops storage write failures — view-state persistence errors are silently swallowed; non-critical since worst case is seeing Today instead of last view. [entrypoints/popup/App.tsx:70]
- getCurrentWeekMonday uses local Date without timezone handling — local Date may differ from Jira timezone; acceptable for v1.0 internal tool. [entrypoints/popup/App.tsx:131-136]
- No auth-change subscription while popup open — token may expire during long popup session; no impact until stories add Jira API calls. [entrypoints/popup/App.tsx:30-47]

## Deferred from: code review of 2-2-hierarchy-walk-build-pre-fill-ticket-source (2026-06-21)

- `maxResults=100` with no pagination silently truncates large reporting lines (senior managers with >100 open issues) and logs no truncation warning. 100 is spec-specified; pagination is future work — at least log when the page is full. [lib/hierarchy.ts:36]
- Parent stubs for cross-source subtasks hardcode `source:'self'` + `assigneeDisplayName:null` even when the parent belongs to the manager/skip-level. `source:'self'` is spec-mandated and the Jira `parent` object has no assignee, so null is inherent. [lib/hierarchy.ts:170-177]
- Account IDs interpolated into JQL without escaping — Jira-controlled safe values, colon-quoting per spec is followed; low-risk hardening only. [lib/hierarchy.ts:132,148]
- (round 2) PRE-EXISTING test failure unrelated to 2.2: `lib/storage/view-state.test.ts` fails on baseline `c3ef3d6` too (vitest mock-hoisting / Zod error at module load). Means AC #8 "all gates pass" is not literally true repo-wide. Track as its own defect from Story 2.1. [lib/storage/view-state.test.ts]

## Deferred from: code review of 2-3-ticketpicker-2-level-browse-tree-with-search-create-subtask (2026-06-21)

- JQL injection / breakage via unescaped search text in `summary ~ "<query>"` (key branch is regex-guarded) — low risk, escape `"`/`\` when hardening. [lib/ticket-search.ts:25]
- Minor UX polish: ~400ms search latency from chained 100ms+300ms debounces; create-affordance predicate conflates "no subtask exists" vs "no subtask assigned to me" for manager/skip Tasks; Esc from a non-form element leaves an open create affordance dangling. [components/today/TicketPicker.tsx]
- (still open) `lib/storage/view-state.test.ts` keeps Story 2.3's AC #8 gate red — pre-existing from Story 2.1; fix or quarantine it repo-wide.
- (round 2) No user-visible feedback on create-subtask failure — only `log.warn`; inline form stays open with no message. Revisit with the log flow in Story 2.4. [components/today/TicketPicker.tsx:212-214]
- (round 2) PRODUCT DECISION: Pinned & Search-Jira results let a non-sub-task (Task/Story/Epic) be logged directly, inconsistent with the hierarchy tree's "sub-task is the only log unit" rule. Confirm whether to constrain search/pin to sub-tasks or document the escape-hatch exception. [components/today/TicketPicker.tsx:357-371,428-436]
- (round 2) Create-subtask under a manager/skip-level (possibly cross-project) Task assumes create permission + an issue type named `Sub-task`; failures surface only as a logged warning. [lib/create-subtask.ts:9-12]

## Deferred from: code review of 2-4-quicklogform-hours-input-with-jira-flexible-parser (2026-06-21)

- `formatStartedISO` hardcodes 09:00 time — backdated worklogs always have `started` at 09:00 regardless of actual time. For "Today" the current time would be more accurate. Acceptable for v1. [components/today/QuickLogForm.tsx:60-63]

## Deferred from: code review of 2-5-catch-all-picker-one-click-pto-action (2026-06-21)

- `formatStartedISO` (now in `lib/worklog-date.ts`) anchors 09:00 local then `toISOString()` — worklog day-bucketing can drift vs the Jira account timezone. Pre-existing 09:00 limitation, now also the timestamp for one-click PTO. [lib/worklog-date.ts:12]
- `badge-update` always broadcasts `{ hoursMissing: 0 }` for both full- and half-day PTO; mirrors the `QuickLogForm` fire-and-forget convention (background recomputes the badge). [components/today/PtoQuickAction.tsx:113]
- No validation of `targetHours` (zero/negative → failed Jira post; non-integer → button-label vs posted-seconds display mismatch). Cross-cutting; settings layer and QuickLogForm don't validate either. [lib/storage/settings.ts:91]
- Disabled primary `Button` keeps the full `bg-accent` purple with only `text-neutral-300` muted text — reads as low-contrast active rather than clearly disabled. App-wide Button concern; AC7's literal tokens are present. [components/ui/button.tsx:13]
- Catch-all `useQuery` retries non-retriable errors (403/404/parse-error) up to 3× in prod via the project-wide default retry policy. Shared by hierarchy/search queries. [entrypoints/popup/main.tsx:12]
- Successful PTO worklog is recorded into the logged-today list only inside a cancellable 200ms `setTimeout`; latent risk if a parent ever unmounts `PtoQuickAction` (currently always rendered). [components/today/PtoQuickAction.tsx:122]
- Half-day PTO button lacks the spinner/✓ in-flight feedback the Full-day button shows (both are disabled during the post, so no correctness impact). [components/today/PtoQuickAction.tsx:236]
## Deferred from: code review of story-3.3 (2026-06-27)

- SW cold-start can yield no banner on the first Jira page load until the next navigation. Graceful (never crashes), AC #8 permits "no banner", recovery is navigation-gated; a content-side retry is out of scope. [entrypoints/content.ts]
- Pressing Escape (or an SPA re-render) during an in-flight submit re-renders the banner and drops the ✓ confirmation, though the worklog still posts. Minor UX only; the in-flight guard prevents the double-post hazard and the write is durable. [entrypoints/content.ts:248-250]

## Deferred from: code review of story-4.4 (2026-06-27)

- Day-scoped "Add a worklog…" editor-open relies on a 2×requestAnimationFrame race against the freshly-mounted DayCell's registration effect; a missed lookup is swallowed by `?.()` with no retry. AC #5 date-correctness still holds (DayCell POST dates to grid.days[dayIndex]); the editor-open is a focus convenience. Harden if intermittent open failures are observed. [components/week/WeeklyGrid.tsx:339-347]
- TicketPicker is rendered with no onCancel; opening the picker (plain or day-scoped) and never selecting leaves `picking` set with no dismiss UI. Pre-existing 4.1/4.3 behavior — TicketPicker has no cancel prop; the day-scoped dayIndex self-heals when "+ Add a subtask" resets picking=true. [components/week/WeeklyGrid.tsx:484-485, components/today/TicketPicker.tsx]
