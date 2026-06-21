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