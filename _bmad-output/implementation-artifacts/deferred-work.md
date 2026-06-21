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