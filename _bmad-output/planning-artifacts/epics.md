---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'complete'
completedAt: 2026-05-11
inputDocuments:
  - '{project-root}/_bmad-output/planning-artifacts/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-design-specification.md'
---

# jira-time-logger - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for jira-time-logger, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Authentication & Connection**
- FR1: Worker can connect their Jira Cloud account via a single OAuth 2.0 (3LO + PKCE) connect action.
- FR2: Worker can pick which Jira Cloud site to connect to when they have access to more than one site.
- FR3: Worker remains authenticated across browser sessions without re-entering credentials, until the OAuth grant is revoked or expires.
- FR4: Worker's access tokens are refreshed automatically and silently before expiry; rotated refresh tokens are persisted atomically.
- FR5: Worker can disconnect their Jira account and clear all locally stored credentials and cached data from the options page.

**Time Logging**
- FR6: Worker can log time against any Jira **subtask** they have permission to log against. Worklogs against tasks/stories/Epics directly are not supported.
- FR7: Worker can log time for the current day or any past day within the current approval cycle.
- FR8: Worker can pick a subtask from a 2-level browse tree (Task → Subtask) populated by walking their reporting hierarchy: their own subtasks/Tasks, their canonical manager's Tasks, their skip-level's Tasks — filtered to active/recently-updated.
- FR9: When a worker selects a Task in the picker without a subtask assigned to them, the picker offers "+ Create my subtask under this Task" that prompts for a name and creates the subtask via the Jira API (assigned to the worker).
- FR10: Worker can log time against subtasks in the designated **catch-all project** (default `KNP`). The catch-all picker presents a flat list of pre-existing shared subtasks; workers do not create their own catch-all subtasks.
- FR11: Worker can mark a day as full-day PTO (configured target hours) or half-day PTO (half of configured target) with a single action that posts the appropriate worklog to a designated PTO subtask in the catch-all project.
- FR12: Worker can edit the hours, date, or comment of any worklog they previously posted via the extension.
- FR13: Worker can delete a worklog they previously posted via the extension.
- FR14: Worker can log time against the specific Jira subtask they are currently viewing, directly from an inline action surface on the Jira page.

**Daily Awareness & Reminders**
- FR15: Worker sees an always-visible badge counter on the extension's toolbar icon showing the number of hours missing from the current week relative to their configured target.
- FR16: Worker receives a daily reminder at a configurable time prompting them to log the day's time.
- FR17: Worker sees an inline banner at the top of any Jira page indicating unlogged hours for the current week, when there are any.
- FR18: Worker can dismiss the inline banner for the current day; the banner returns the next day.
- FR19: Worker sees a contextual quick-log option in the inline banner when viewing a specific Jira subtask page (banner offers to log against *that* subtask).

**Weekly Review & Mark-as-Done**
- FR20: Worker sees a 7-day grid view of the current week showing per-day logged hours and per-subtask breakdown for each day.
- FR21: Worker sees per-day color coding (green when day is complete or PTO-marked; red when day is below target and not PTO).
- FR22: Worker can edit hours, add subtasks, or remove subtasks from the weekly grid.
- FR23: Worker can mark any day in the weekly grid as full-day or half-day PTO via a click-cell-header popover.
- FR24: Worker can **mark the current week as done** — a local-only ritual confirming "I'm finished logging this week." The week appears visually completed in the worker's view, and the week's contribution to the badge counter is cleared.
- FR25: When the worker attempts to mark a week as done with one or more days below target and not marked as PTO, the system requires explicit acknowledgment of the gap before accepting the mark-as-done action.
- FR26: Mark-as-done state is local-only — not posted to Jira and not visible to the manager. Manager view always reads live data.

**Manager Approval**
- FR27: Manager can switch between worker mode and manager mode in the same extension surface.
- FR28: Manager sees a person × Epic matrix for the current approval cycle, with rows for each direct report and columns for each Epic that received hours from any report.
- FR29: Manager view renders rows progressively as data fetches complete (first row visible quickly; full matrix within acceptable bound).
- FR30: Manager sees per-cell color coding reflecting the report's per-day target adherence and dirty status for that `(user, cycle)`.
- FR31: Manager can drill down into any cell to see the report's specific subtasks within that Epic with hours per subtask.
- FR32: Manager can approve a single direct report's entire cycle with one action.
- FR33: The approve action posts a versioned, checksummed approval comment tagged `(user, cycle, by)` to each Epic the report logged hours against during the cycle.
- FR34: Manager view explicitly warns when worklogs with restricted visibility are excluded from a cell's totals (count surfaced; rationale tooltip available).
- FR35: Approval comment metadata captures the count of restricted-visibility worklogs at the time of approval, so audit trails reflect what data was visible to the approver.
- FR36: Non-canonical managers can open the manager view and read the matrix, but the approve action is disabled for them with an explanatory tooltip.
- FR37: Manager can re-approve a cycle previously approved if the worker has edited worklogs after the original approval (dirty cells); re-approval posts a new comment that supersedes the prior one for the same `(user, cycle)`.

**Audit & Data Integrity**
- FR38: Approval state is stored entirely in Jira (as Epic comments and worklog timestamps); no cross-user state lives in the extension's local storage.
- FR39: A worklog whose `updated` timestamp is later than the matching `(user, cycle)` approval comment's timestamp is automatically flagged as dirty for both worker and manager views.
- FR40: Approval-comment parser fails closed: any comment whose format or checksum does not validate is treated as non-approval and surfaces a "comment corrupted" warning rather than silently misclassifying worklogs.
- FR41: Multiple managers can independently approve different users on the same Epic without conflict; each `(user, cycle)`'s approval state is independent of others on the same Epic.
- FR42: The extension never deletes worklogs or comments in Jira. Locally cached data may be cleared by user action from the options page.
- FR43: When the worker is unable to reach Jira (network or auth error), the extension surfaces an explicit error state and does not silently lose data the worker is trying to post.

**Settings & Configuration**
- FR44: Worker's canonical manager is **read automatically from Jira's built-in user-directory manager field**. The worker cannot override this in the extension.
- FR45: Worker's skip-level is derived by reading the canonical manager's *own* manager field in Jira (recursive resolution; the extension performs both lookups on first sync).
- FR46: When the manager field is not populated for a worker in Jira, the extension surfaces a clear non-blocking "manager not set in Jira — please contact your admin" notice rather than silently failing or asking the worker to type a name.
- FR47: Worker can configure the **catch-all project key** (default `KNP`).
- FR48: Worker can configure the **PTO subtask** within the catch-all project.
- FR49: Worker can configure the daily reminder time.
- FR50: Worker can configure the work-day target hours (default 8).
- FR51: Worker can configure the approval cycle (default monthly aligned to calendar month).
- FR52: Worker can view the extension's last data-sync time and current local storage usage from the options page.

### NonFunctional Requirements

**Performance**
- NFR1: Popup time-to-interactive ≤ **400 ms** (p95) when opened from a daily-reminder notification (data pre-warmed); ≤ **800 ms** (p95) cold.
- NFR2: Manager matrix renders progressively — first row within **2 s**, full matrix within **15 s** for a typical team (≤ 12 reports, ≤ 50 Epics).
- NFR3: Single worklog post completes within **2 s** (p95).
- NFR4: Badge counter updates within **30 s** of any local action; within **2 minutes** of any remote action.

**Reliability**
- NFR5: Auth survives ≥ 30 days without user-visible re-auth (token refresh handles the lifecycle).
- NFR6: When offline or rate-limited, the extension surfaces a clear error state and does not silently drop user actions; failed posts are retried on reconnect.
- NFR7: Approval-comment parser is fail-closed: malformed comments produce a "comment corrupted" warning, never silent misclassification.
- NFR8: A v(N) extension can read approval comments written by v(N-1) — schema migration at parse time.

**Security & Privacy**
- NFR9: All data stays between the user's browser and Jira/Atlassian. No third-party telemetry, analytics, or external services.
- NFR10: OAuth uses PKCE; no client secret in the extension. Tokens stored only in `chrome.storage.local`.
- NFR11: OAuth scopes requested are the minimum needed: `read:jira-work`, `write:jira-work`, `read:me`, `offline_access`.

**Accessibility**
- NFR12: All meaningful color signaling (red/green/yellow cells, badge color) is paired with a non-color signal (text label, icon, pattern).
- NFR13: All interactive elements are keyboard-reachable and have visible focus indicators.

### Additional Requirements

**Project Initialization & Tooling**
- AR1: Initialize project with WXT v0.20.25 React template via `pnpm dlx wxt@latest init`; TypeScript default; pnpm as package manager.
- AR2: Configure `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- AR3: Pin library versions: TanStack Query v5, Zod v3, Tailwind CSS v4, shadcn/ui, date-fns v4, WXT v0.20.25.
- AR4: Configure ESLint with custom rules — naming convention, import order, no default exports, no `any`, no direct `console.log` outside tests, no raw `Promise<T>` from `jira-client.ts`, warn on `Date` parameter types in cross-module signatures.
- AR5: Configure manifest permissions exactly: `identity`, `storage`, `alarms`, `notifications`, `host_permissions: https://*.atlassian.net/*`, `host_permissions: https://api.atlassian.com/*` — no `tabs`/`webRequest`/`cookies`/`history`/`bookmarks`/`downloads`.

**Cross-Cutting Foundation Modules**
- AR6: Build `lib/result.ts` — discriminated-union `Result<T, E>` returned at all I/O boundaries (cases: `Ok`, `RateLimited`, `AuthExpired`, `Network`, `ParseError`, `Forbidden`, `NotFound`).
- AR7: Build `lib/log.ts` — in-house console logger with verbosity levels (`debug`/`info`/`warn`/`error`); structured `noun.verb` event names; no PII in payloads; no third-party telemetry per NFR9.
- AR8: Build `lib/storage/*` — typed WXT `storage.defineItem` wrappers for tokens, settings, view-state, banner-dismiss, refresh-mutex, cycle-cache, outbox; plus `quota.ts` (quota check + TTL eviction of oldest closed-cycle data first).
- AR9: Build `lib/messages.ts` — WXT `defineMessage<Zod>` registry for typed inter-surface messages (`refresh-badge`, `current-week`, `manager-matrix-row`, `log-worklog`, `approve-cycle`, `badge-update`, `banner-state`, `dismiss-banner-today`).
- AR10: Build `lib/time.ts` + `lib/hours.ts` — date-fns wrappers; ISO-date types (`ISODate`, `ISODateTime`); `secondsToHours`/`hoursToSeconds` (no inline `*3600`).

**OAuth & Jira Client**
- AR11: Build `lib/oauth/*` — `pkce.ts` (code_verifier/challenge gen), `flow.ts` (launchWebAuthFlow + PKCE + accessible-resources), `refresh.ts` (refresh state machine + `chrome.alarms`-driven refresh + session-scoped `refreshInFlight` mutex + atomic rotated refresh token write).
- AR12: Build `lib/jira-client.ts` — ALL Jira API calls flow through this single wrapper, returns `Result<T>`, scheduler-gated, Zod-validated responses; OAuth header injection; 401 triggers refresh.
- AR13: Build `lib/jira-types.ts` — Zod schemas for Jira API response shapes used in: `/myself`, `/user/search`, `/search`, `/issue/{key}/worklog` (GET/POST/PUT/DELETE), `/issue/{key}/comment` (GET/POST), `/accessible-resources`.

**Approval Protocol**
- AR14: Build `lib/comment-schema.ts` — Zod `discriminatedUnion('v', [v1Schema])` for versioned approval-comment parsing; fail-closed on any deviation.
- AR15: Build `lib/checksum.ts` — comment body checksum computation.
- AR16: Build `lib/parser.ts` — find + parse approval comments on Epic with "newest wins per (user, cycle)" rule; comment-id secondary lookup for manual-edit detection.
- AR17: Build `lib/approval.ts` — fan-out Epic comment poster for cycle approval (sequential through scheduler); captures visibility-warning count in metadata.
- AR18: Build `lib/dirty-detect.ts` — per (user, cycle) dirty detection (worklog.updated > approval.timestamp).
- AR19: Author `PROTOCOL.md` documenting versioned approval-comment schema, dirty-detection semantics, parser contract — the contract between extension versions.

**Reliability & Performance Patterns**
- AR20: Build `lib/scheduler.ts` — client-side token-bucket rate-limit scheduler (~40 LOC) respecting `Retry-After` headers; singleton in service worker.
- AR21: Implement outbox/retry pattern — pending worklog writes persistent in `chrome.storage.local`, retried by service worker via `chrome.alarms` on connectivity recovery.
- AR22: Implement closed-cycle aggressive cache — TTL-keyed in `chrome.storage.local` with quota-aware eviction.
- AR23: Configure TanStack Query — per-query `staleTime` (5 min hierarchy, 1 min current week, infinite for closed cycles), `Retry-After`-aware `retry` callback, per-row queries for manager-matrix progressive render.

**Hierarchy & Settings Logic**
- AR24: Build `lib/hierarchy.ts` — manager+skip-level Task discovery via Jira issue search.
- AR25: Build `lib/manager-resolution.ts` — read manager from Jira user-directory `manager` field; recursive read for skip-level.
- AR26: Build `lib/badge.ts` — badge counter computation from current-week worklogs vs target.
- AR27: Build `lib/pto.ts` — PTO subtask logging helpers (full-day, half-day).

**Graceful Degradation**
- AR28: Implement graceful-degradation behavior — manager-not-set, skip-level-not-set, catch-all-unconfigured, PTO-subtask-unconfigured, offline/rate-limited all render non-blocking placeholders with deep links to settings; never block the core "log my time" flow.

**Testing & Distribution**
- AR29: Establish co-located `*.test.ts` Vitest unit tests for every module under `lib/`; tests required for any new `lib/` module.
- AR30: Build CRX distribution script `pnpm pack:crx` — convert WXT .zip output to `.crx` via Chrome's `--pack-extension` flag; signing `.pem` stored in private team vault for identity continuity.
- AR31: Author `README.md` — install instructions, settings reference, top-3 troubleshooting.

**Content-Script Constraints**
- AR32: Implement CSP-safe content-script — inline `style={{...}}` only (no class-based Tailwind, no external fonts, no `blob:` URLs); style tokens from `lib/banner-styles.ts` mirroring Tailwind theme as literal CSS.
- AR33: Implement SPA-aware re-injection — content script listens to `popstate` events and uses MutationObserver on Jira's title bar to re-evaluate injection context across single-page navigations.

### UX Design Requirements

**Design System Foundation**
- UX-DR1: Implement design token system in `tailwind.config.ts` — neutral scale (50/100/200/300/500/700/900), brand accent (DEFAULT `#6b5b95`, hover `#5a4d7e`, subtle `#e9e6f3`, deep `#4a4570`), brand gradient (from `#4a4570` to `#7a719b`), state colors (success `#16a34a`, warning `#ca8a04`, danger `#dc2626`, info `#0891b2`, each with `_subtle` variant). All pairings WCAG AA verified.
- UX-DR2: Implement system-font typography — system-ui stack for sans, ui-monospace for ticket keys/hours; type scale `text-xs` (12px) → `text-3xl` (28px) anchored on 14px body; three weights only (400/500/600); no italic.
- UX-DR3: Configure 4px-base spacing scale with documented density rules — popup `p-4` outer, `space-y-3` section gap, `py-2 px-3` list items, `space-y-8` options-page sections, `p-6` dialog.
- UX-DR4: Install shadcn/ui primitives via CLI: `button`, `input`, `label`, `dialog`, `popover`, `select`, `tooltip`, `toast`, `skeleton`, `tabs`, `table`. Customize each (`components/ui/*.tsx`) toward Linear-grade restraint (e.g., trim default shadows on buttons, simplify dialog backdrop).
- UX-DR5: Implement "Quiet Density" visual direction — flat hierarchy (no shadows on cards/lists; only on overlays), brand purple rationed to primary CTAs/active states/hero gradients, mono-typed numerics, dense lists with generous between-section spacing.
- UX-DR6: Configure `lucide-react` icon library — 16px default in popup, 14px metadata, 20px options headers; state icons paired with state colors: `Check`/`AlertCircle`/`XCircle`/`Clock`/`Lock`/`Plus`/`Search`/`Settings`/`RefreshCw`.
- UX-DR7: Implement motion system — popup mount fade-in (120ms ease-out), cell color change (200ms ease-in-out), banner slide-in/out (200ms ease-out), list-item slide-in (200ms ease-out), skeleton shimmer (1500ms loop linear), manager-row stagger reveal (~100ms per row), dialog open (150ms ease-out), hover (100ms linear), instant focus ring. No parallax/hero/scroll-triggered animations/spinners.

**Today / Logging Surface**
- UX-DR8: Build `TicketPicker` component — 2-level browse tree (Task → Subtask) using native `<details>/<summary>` for collapsible groups; shadcn `Input` for search with 100ms debounce real-time filter; "+ Search Jira for a ticket…" affordance for tickets outside hierarchy walk; recent/pinned tickets persisted in `chrome.storage.local`; "+ Create my subtask under this Task" affordance (FR9); `aria-label` per row; default focus on search input.
- UX-DR9: Build `QuickLogForm` component — appears after picking a ticket; hours input with Jira-flexible parser accepting `2.5`, `2.5h`, `2h 30m`, `2:30`, `150m`; live green/red border validation; Enter submits; hard-block on hours > 24 ("Hours per entry can't exceed 24. Split into multiple entries if needed."); spinner-to-check transition on submit (≤200ms).
- UX-DR10: Implement Today view layout — view title with date + total hours (`7h / 8h`), "Logged today" list with row-hover-revealed `⋯` edit menu, "Pick a ticket to log" section with `TicketPicker` and `CatchAllPicker`. Popup stays open after successful submit for multi-log sessions; search input clears and re-focuses.

**Weekly Review Surface**
- UX-DR11: Build `WeeklyGrid` component — semantic `<table>` with `<th scope="col">` day headers and `<th scope="row">` subtask names; per-day status header (✓ green / ⚠ red / PTO badge); inline cell editing with tab-to-next-cell; "+ Add a subtask to this week" affordance; `aria-label="Hours for [day], [subtask]"` per cell; em-dash `──` for zero-hour cells.
- UX-DR12: Build `DayCellHeader` + `PtoPopover` — click day-cell column header opens shadcn `Popover` with three actions: "Mark full-day PTO" / "Mark half-day PTO" / "Add a worklog…"; popover announces currently-logged hours via `aria-describedby`; closes on action; cell turns green; weekly grid re-renders.
- UX-DR13: Build `MarkAsDoneButton` + `GapAcknowledgmentDialog` — primary CTA at bottom of WeeklyGrid; clicking triggers gap-check; if any day below target & not PTO, open shadcn `Dialog` listing gap days as `<ul>`; default focus on "Submit anyway"; "Cancel" closes; "Submit anyway" sets local-only mark-as-done flag and badges → 0. Copy: "X days are below target and not marked as PTO. Submit anyway?" — never preachy.

**Manager View Surface**
- UX-DR14: Build `ManagerMatrix` component — semantic `<table>` with sticky first column (person name) and horizontal scroll when Epic columns > 4; progressive per-row stagger render (~100ms apart) via per-row TanStack queries; row-end Approve/Re-approve CTA; `aria-label="[Person], [Epic], [hours], [status]"` per cell. Cycle title + "X of 7 done" progress chip.
- UX-DR15: Build `MatrixCell` + `DirtyIndicator` — cell with hours + status icon (✓ green ≥ target, ⚠ red < target, ↻ yellow-stripe dirty, 🔒 visibility-restricted, ✓ dark green approved); yellow-stripe pattern is diagonal lines + warning_subtle bg + warning text + tooltip "needs re-approval"; never color-only.
- UX-DR16: Build `DrillDownPanel` — slide-in panel from right (does NOT navigate away); semantic `<ul>` of ticket-row evidence with hours per ticket; embedded `VisibilityWarning` chip + tooltip when restricted entries detected; Esc closes; parent matrix stays visible behind.
- UX-DR17: Build `ApproveButton` + `ReApproveButton` + `ApproveDisabledTooltip` — primary CTA with brand-purple bg; approve-confirm dialog with one-line summary; non-canonical managers see disabled button with tooltip explaining why; success state shows ✓ briefly then resets; partial-fan-out shows status chip "Approval partial — N of M Epics confirmed".
- UX-DR18: Build `ModeToggle` — worker ↔ manager tab switcher in popup top; manager tab hidden if user has no reports; worker mode is default for new users; popup remembers last view across opens via `chrome.storage.local`.

**Content-Script Banner**
- UX-DR19: Build `Banner` (vanilla DOM in `entrypoints/content.ts`) — inline styles only from `lib/banner-styles.ts`; collapsed state: small brand-purple dot + "Xh unlogged this week" + "Log time on PROJ-XXX" CTA (when on subtask page) + `✕` dismiss; expanded state: hours field focused inline, Log button; 200ms slide animations; SPA-aware re-injection via MutationObserver + popstate; daily-dismiss persistence (date-keyed in `chrome.storage.local`); `role="region" aria-label="Time-tracking banner"`; banner does not auto-grab focus.

**Options Page & First-Run**
- UX-DR20: Build first-run hero — brand-gradient full-width header, centered 64px logo, "Welcome to jira-time-logger" (text-3xl white semibold) headline, supporting paragraph, "Connect to Jira" primary CTA. Triggered via `chrome.runtime.onInstalled` opening options page in new tab.
- UX-DR21: Build options page layout — brand-gradient header band with 32px logo + wordmark, `max-w-2xl` centered content, thematic sections (Connection, Reporting line, Catch-all project, Cadence, Diagnostics) separated by `space-y-8`.
- UX-DR22: Build settings components: `ConnectButton`, `DisconnectAction` (with confirmation), `ManagerDisplay` (read-only Jira-derived; shows non-blocking "not set" notice per FR46/AR28), `CatchAllProjectField` (default `KNP`), `PtoSubtaskField` (dropdown of subtasks within catch-all), `ReminderTimeField` (default 17:00), `TargetHoursField` (default 8), `CycleField` (default monthly), `DiagnosticsBlock` (last sync + storage usage + "Clear local cache").

**Cross-Cutting UX Components**
- UX-DR23: Build `ErrorBoundary` (React error boundary catching uncaught errors), `ErrorState` (user-facing error UI keyed off error kind; never raw exception messages), `LoadingSkeleton` (1500ms shimmer; respects `prefers-reduced-motion`).

**Patterns & Discipline**
- UX-DR24: Implement four-channel feedback discipline — (1) inline state on affected element (default — cell color, list row appears, input border), (2) status chips next to actions (durable info like "Pending — will retry"), (3) toast for background actions only when affected element is no longer visible (max 1, 4s auto-dismiss; e.g., "Synced N pending worklogs", "Can't reach Jira" once per session), (4) honest error UI when user must act (replace popup content with "Connect to Jira" CTA on revoked OAuth).
- UX-DR25: Implement button hierarchy — at most one primary button per visible surface; primary = brand-purple bg + white text + `font-semibold`; secondary = transparent bg + `neutral.700` + 1px border; tertiary/ghost = transparent + `neutral.500`; disabled keeps tier visual + `neutral.300` text + `cursor-not-allowed` + paired explanation (tooltip/helper/inline error — never mystery-disabled).
- UX-DR26: Implement skeleton-loading discipline — skeletons (not spinners) for fetches > 200ms in TicketPicker, WeeklyGrid, ManagerMatrix, DrillDownPanel; spinners reserved for ≤200ms button-press contexts.
- UX-DR27: Implement empty states across all data surfaces — TicketPicker no-results, ManagerMatrix no-reports-configured, ManagerMatrix reports-but-no-hours, DrillDownPanel no-tickets, Logged-today nothing-yet. All `text-sm neutral.500` centered, past-tense or descriptive copy, link to next action when possible. No generic "No data" anywhere.
- UX-DR28: Implement view persistence — popup remembers last view (Today / Week / Manager) across opens via `chrome.storage.local`; Today is default for new users only.
- UX-DR29: Implement form patterns — labels above input, `font-medium text-sm`, focused inputs use 2px `accent.DEFAULT` ring with 2px outline-offset, invalid inputs use `state.danger` border + helper text, Enter submits, Esc closes, first input focused on surface mount, Cancel placed to the left of primary action.
- UX-DR30: Implement honest copy register — notification "Log today's time" (not "Don't forget!"); banner "6h unlogged this week" (not "You're behind!"); error "Can't reach Jira right now — your worklog will post when we're back online" (no apology theatre); past-tense factual toasts; no exclamation marks; no aspirational empty states.
- UX-DR31: Implement co-located `STRINGS` constants — UI copy lives in component-level named string constants rather than hardcoded JSX, for mechanical future i18n extraction. v1.0 English only; no `i18next` setup.

**Accessibility (WCAG 2.1 AA)**
- UX-DR32: Implement WCAG AA accessibility floor — semantic HTML (no clickable `<div>`s; `<button>`/`<a>` for actions; `<table>` with `scope` for grids); `aria-label` on every icon-only affordance (✕, ⋯, hover-revealed icons); `aria-live="polite"` for badge updates, `aria-live="assertive"` for errors; `aria-describedby` linking helper/error text to inputs; min tap target 32×32px in popup, 44×44px on options page.
- UX-DR33: Implement reduced-motion accessibility — respect `prefers-reduced-motion: reduce` by replacing all transitions ≥100ms with instant changes; replace skeleton shimmer with static neutral fill; use Tailwind `motion-safe:` / `motion-reduce:` variants throughout.
- UX-DR34: Author Phase-6 accessibility audit gate — automated `@axe-core` scan, keyboard-only nav, screen reader (NVDA/VoiceOver) for major flows, color-blindness simulation, high-contrast mode, reduced-motion, browser zoom 200%. Non-negotiable before v1.0 release.

**Browser Targets**
- UX-DR35: Implement Chrome + Edge pre-release validation gate — every release validated on Chrome stable and Edge stable; Chrome Beta best-effort; Firefox/Safari out of scope.

**Brand & Icons**
- UX-DR36: Generate extension icon set (16/32/48/128 px) from source logo; provide 96 px notification icon (Chrome notification standard); 64 px first-run hero logo. Configure auto-generation from a single high-res source via `wxt.config.ts`.

### FR Coverage Map

| FR | Epic | Capability |
|---|---|---|
| FR1, FR2, FR3, FR4, FR5 | Epic 1 | OAuth connect, site picker, session persistence, silent refresh, disconnect+clear |
| FR6, FR7, FR8, FR9, FR10 | Epic 2 | Subtask-only logging, current-day + backdated, hierarchy-walk picker, +create subtask, catch-all picker |
| FR11, FR12, FR13 | Epic 2 | Full/half PTO action, edit & delete worklogs |
| FR14 | Epic 3 | Contextual log via inline banner |
| FR15, FR16 | Epic 3 | Toolbar badge counter, daily push notification |
| FR17, FR18, FR19 | Epic 3 | Inline Jira banner + daily-dismiss + contextual subtask quick-log |
| FR20, FR21, FR22 | Epic 4 | 7-day grid view, per-day color coding, inline edit/add/remove |
| FR23 | Epic 4 | Click-cell-header PTO popover (full/half) |
| FR24, FR25, FR26 | Epic 4 | Mark-as-done with gap-acknowledgment, local-only flag |
| FR27 | Epic 5 | Worker ↔ Manager mode switch |
| FR28, FR29, FR30 | Epic 5 | Person × Epic matrix + progressive row render + cell coloring |
| FR31 | Epic 5 | Drill-down per-ticket evidence |
| FR32, FR33 | Epic 5 | Approve action + per-Epic fan-out with versioned-checksum comments |
| FR34, FR35 | Epic 5 | Visibility-restriction warnings + approval-comment metadata capture |
| FR36 | Epic 5 | Non-canonical manager read-only (Approve disabled with tooltip) |
| FR37 | Epic 5 | Re-approval flow for dirty cycles |
| FR38, FR39, FR40, FR41 | Epic 5 | Jira-as-state, dirty-detect, fail-closed parser, multi-manager-per-Epic independence |
| FR42 | Epic 1 | Never-deletes policy; local-cache clear from options page |
| FR43 | Epic 2 | Explicit offline error state + outbox queueing |
| FR44, FR45, FR46 | Epic 1 | Manager auto-read from Jira directory + recursive skip-level + non-blocking unset notice |
| FR47, FR48, FR49, FR50, FR51 | Epic 1 | Catch-all project / PTO subtask / reminder time / target hours / approval cycle settings |
| FR52 | Epic 1 | Diagnostics: last sync + local storage usage |

**Status:** All 52 FRs mapped across 6 epics; no gaps.

### NFR Coverage Map

| NFR | Primary Epic | How it lands |
|---|---|---|
| NFR1 (popup TTI ≤400ms warm / 800ms cold) | Epic 2 | Service-worker pre-warm + deferred-render + popup-bundle budget |
| NFR2 (manager matrix progressive) | Epic 5 | Per-row TanStack queries + ~100ms stagger reveal |
| NFR3 (worklog post ≤2s p95) | Epic 2 | jira-client.postWorklog through scheduler |
| NFR4 (badge update ≤30s local / 2min remote) | Epic 3 | Badge alarm cadence (chrome.alarms 1-min floor) |
| NFR5 (auth survives 30 days) | Epic 1 | OAuth refresh state machine + session mutex + atomic refresh-token rotation |
| NFR6 (offline-tolerant, retries on reconnect) | Epic 2 | Outbox + service-worker retry alarm |
| NFR7 (fail-closed parser) | Epic 5 | Zod `discriminatedUnion('v', [v1])` + checksum verify + corrupted-comment UI |
| NFR8 (vN reads v(N-1)) | Epic 5 | Versioned comment schema; PROTOCOL.md as contract |
| NFR9 (no third-party telemetry) | Epic 1 | Architectural compliance from project init; in-house log.ts only |
| NFR10 (PKCE, no client secret) | Epic 1 | OAuth flow uses chrome.identity + PKCE; tokens only in chrome.storage.local |
| NFR11 (minimum scopes) | Epic 1 | Manifest config: read:jira-work, write:jira-work, read:me, offline_access |
| NFR12 (color-not-sole-signal) | Epics 1–5 build + Epic 6 verify | Icon+label paired with every state color per-component; @axe-core gate in Epic 6 |
| NFR13 (keyboard-reachable, visible focus) | Epics 1–5 build + Epic 6 verify | Radix primitives + focus rings per Visual Foundation; keyboard-only pass in Epic 6 |

## Epic List

### Epic 1: Foundation, Connect & Configure

The worker can install the extension, complete OAuth 2.0 (3LO + PKCE) setup against Jira Cloud (with multi-site picker), see their canonical manager and skip-level auto-detected from Jira's user-directory field, configure the catch-all project / PTO subtask / daily reminder time / work-day target / approval cycle, view a diagnostics block (last sync + local-storage usage), and disconnect to clear all local credentials and cached data. By the end of this epic the extension is fully set up, auth survives ≥ 30 days without re-prompt, and the cross-cutting library layer (Result, log, typed storage, messaging, scheduler, jira-client, jira-types) is in place for subsequent epics. Graceful-degradation principle applies — missing manager/skip-level/catch-all/PTO config surfaces non-blocking notices, never blocks future logging flows.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR42, FR44, FR45, FR46, FR47, FR48, FR49, FR50, FR51, FR52
**NFRs anchored:** NFR5, NFR9, NFR10, NFR11
**Key UX-DRs:** UX-DR1–7 (design tokens, typography, spacing, shadcn install, Quiet Density direction, icons, motion), UX-DR20–22 (first-run hero, options page, settings components), UX-DR23 (ErrorBoundary/ErrorState/LoadingSkeleton scaffold), UX-DR30 (honest copy register), UX-DR31 (co-located STRINGS), UX-DR36 (icon set)
**Key ARs:** AR1–13 (project init, foundation libs, OAuth, jira-client), AR23 (manifest permissions), AR25 (manager-resolution), AR28 (graceful degradation), AR31 (README)

### Epic 2: Log Time (Today View)

The worker can open the popup and post a worklog in under 30 seconds — pick a subtask from the hierarchy-walked pre-fill picker, or search Jira for any ticket, or use "+ Create my subtask under this Task", or pick from the catch-all (default `KNP`) — enter hours using Jira's flexible parser (`2.5`, `2.5h`, `2h 30m`, `2:30`, `150m`), submit with Enter, and see the entry appear in "Logged today." They can backdate within the current cycle, edit or delete previously-posted worklogs, and mark a day as full or half PTO from the Today view. Offline writes queue in the outbox and retry on reconnect; the worker never silently loses data. By the end of this epic the popup shell + TanStack Query setup are live and the 30-second worklog defining experience works end-to-end.

**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR43
**NFRs anchored:** NFR1, NFR3, NFR6
**Key UX-DRs:** UX-DR8 (TicketPicker w/ search-Jira + pinned + create-subtask), UX-DR9 (QuickLogForm w/ hours parser + hard-block >24h), UX-DR10 (Today view layout), UX-DR24 (4-channel feedback), UX-DR25 (button hierarchy), UX-DR26 (skeleton discipline), UX-DR27 (empty states), UX-DR29 (form patterns)
**Key ARs:** AR12 (jira-client worklog methods), AR21 (outbox/retry), AR24 (hierarchy walk), AR27 (PTO helpers)

### Epic 3: Daily Awareness — Badge, Reminder, Banner

The tool reaches the worker ambiently. A single-integer badge counter on the toolbar icon shows hours missing from the current week. A daily push notification fires at the configured time and opens the popup pre-warmed with Today data (≤400ms TTI per NFR1). An inline banner injects into any `*.atlassian.net` page showing unlogged-hours signal; on a specific subtask page it offers a contextual "Log time on PROJ-XXX" quick-log directly inside the banner; the worker can dismiss the banner for the rest of the day with one click. SPA-aware re-injection handles Jira's in-tab navigation. By the end of this epic the three coordinated daily-surface signals (badge + push + banner) all fire correctly and never become annoying.

**FRs covered:** FR14, FR15, FR16, FR17, FR18, FR19
**NFRs anchored:** NFR4
**Key UX-DRs:** UX-DR19 (Banner with inline-styles CSP-safe + SPA re-injection + contextual quick-log)
**Key ARs:** AR26 (badge.ts), AR32 (CSP-safe content-script inline styles), AR33 (SPA-aware re-injection)

### Epic 4: Weekly Review & Mark-as-Done

The worker can switch to the Week tab and see a 7-day grid showing per-day totals + per-subtask breakdown, with per-day color coding (green = complete or PTO, red = below target & not PTO). They can edit hours inline (tab-to-next-cell), add or remove subtasks for the week, and mark any day as full or half-day PTO via a click-cell-header popover. They can mark the entire week as done — a local-only ritual that grays out the week visually and clears its contribution to the badge — and if any day is below target and not PTO, the gap-acknowledgment dialog appears and requires explicit "Submit anyway." Mark-as-done is never posted to Jira; the manager view always reads live data.

**FRs covered:** FR20, FR21, FR22, FR23, FR24, FR25, FR26
**Key UX-DRs:** UX-DR11 (WeeklyGrid semantic table), UX-DR12 (DayCellHeader + PtoPopover), UX-DR13 (MarkAsDoneButton + GapAcknowledgmentDialog with honest "Submit anyway?" copy)

### Epic 5: Manager Approval & Approval Protocol

A manager (with at least one direct report configured in Jira) can switch to Manager mode in the popup and see a person × Epic matrix for the current approval cycle. Rows render progressively (first row ≤2s, full matrix ≤15s for 12 reports × 50 Epics) with cell-level color coding (green=approved/on-target, red=gap, yellow-stripe=dirty/re-approval-needed, lock=visibility-restricted). They can drill into any cell via a slide-in panel showing per-ticket evidence with hours per subtask; visibility-warning chips surface when restricted entries are excluded from the totals. One click approves a single report's entire cycle — the service worker fans out, posting a versioned + checksummed approval comment scoped `(user, cycle, by)` to each Epic the report touched. Dirty cells can be re-approved (posts a new "newest wins" comment). Non-canonical managers (e.g., matrixed project managers) can read the matrix but the Approve button is disabled with an explanatory tooltip. The approval-comment parser is fail-closed and the `(user, cycle)` scoping ensures cross-team Epics with multiple approvers work without conflict. By the end of this epic the entire audit-integrity backbone — versioned schema, checksum, parser, dirty-detect, multi-manager independence — is delivered.

**FRs covered:** FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR41
**NFRs anchored:** NFR2, NFR7, NFR8
**Key UX-DRs:** UX-DR14 (ManagerMatrix sticky + progressive), UX-DR15 (MatrixCell + DirtyIndicator), UX-DR16 (DrillDownPanel slide-in), UX-DR17 (ApproveButton + ReApproveButton + ApproveDisabledTooltip), UX-DR18 (ModeToggle hidden if no reports)
**Key ARs:** AR14 (comment-schema Zod discriminated union), AR15 (checksum), AR16 (parser w/ newest-wins per `(user, cycle)`), AR17 (approval fan-out), AR18 (dirty-detect), AR19 (PROTOCOL.md)

### Epic 6: Release Polish — Accessibility Audit, Edge Validation, Distribution

The extension is ready to ship internally. The Phase-6 accessibility audit gate (UX-DR34) is executed end-to-end: automated `@axe-core` scan, keyboard-only navigation of every flow, screen-reader pass (NVDA on Windows / VoiceOver on macOS) for the major flows (Today log, Week submit, Manager approve), color-blindness simulation, high-contrast OS mode, `prefers-reduced-motion: reduce` verification, and browser zoom 200%. Edge stable validation pass confirms no Edge-specific regressions on the same MV3 codebase (UX-DR35). The `pnpm pack:crx` script + signing-key vault setup produces a versioned `.crx` ready to post to the Microsoft Teams channel. The README is finalized with install instructions, settings reference, and the top-3 troubleshooting entries. This epic does NOT retrofit accessibility — every component built in Epics 1–5 already targets WCAG AA via Radix primitives + per-component a11y discipline; Epic 6 is the verification gate.

**NFRs anchored:** NFR12, NFR13 (end-to-end verification)
**Key UX-DRs:** UX-DR34 (Phase-6 audit gate), UX-DR35 (Chrome + Edge validation)
**Key ARs:** AR30 (CRX packaging + signing key vault), AR31 (README finalization)

## Epic 1: Foundation, Connect & Configure

The worker can install the extension, complete OAuth 2.0 (3LO + PKCE) setup against Jira Cloud (with multi-site picker), see their canonical manager and skip-level auto-detected from Jira's user-directory field, configure the catch-all project / PTO subtask / daily reminder time / work-day target / approval cycle, view a diagnostics block (last sync + local-storage usage), and disconnect to clear all local credentials and cached data. By the end of this epic the extension is fully set up, auth survives ≥30 days without re-prompt, and the cross-cutting library layer is in place for subsequent epics.

### Story 1.1: Project Scaffold, Design System & First-Run OAuth Connect

As a worker installing the extension for the first time,
I want to see a welcome screen and connect my Jira Cloud account via OAuth in one click,
So that the extension can read and write my worklogs without me re-entering credentials.

**Acceptance Criteria:**

**Given** the project repo does not yet exist
**When** the dev initialises the project
**Then** the codebase is scaffolded with WXT v0.20.25 React template, TypeScript strict mode (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), pnpm as package manager, Tailwind CSS v4, and shadcn/ui primitives `button input label dialog popover select tooltip toast skeleton tabs table` installed via `pnpm dlx shadcn@latest add`
**And** `tailwind.config.ts` exposes the design tokens per UX-DR1 (neutrals, accent purple `#6b5b95` + hover/subtle/deep, brand gradient `#4a4570→#7a719b`, state success/warning/danger/info each with subtle variant)
**And** ESLint config enforces: kebab-case files, named exports only, no `any`, no direct `console.log` outside tests, import order, naming conventions
**And** the cross-cutting foundation modules `lib/result.ts`, `lib/log.ts`, `lib/messages.ts`, `lib/storage/tokens.ts`, `lib/oauth/pkce.ts`, `lib/oauth/flow.ts` exist with co-located Vitest tests that pass

**Given** the extension is installed in Chrome for the first time
**When** the `chrome.runtime.onInstalled` event fires
**Then** the options page opens automatically in a new tab
**And** the page renders the first-run hero — full-width brand-gradient header, 64 px logo centered, "Welcome to jira-time-logger" headline (text-3xl, white, semibold), supporting paragraph, and a "Connect to Jira" primary CTA in brand-purple (UX-DR20)

**Given** the welcome screen is visible
**When** the user clicks "Connect to Jira"
**Then** `chrome.identity.launchWebAuthFlow` opens an Atlassian OAuth window using PKCE (code_verifier generated locally; code_challenge sent)
**And** the requested scopes are exactly `read:jira-work`, `write:jira-work`, `read:me`, `offline_access` — no broader scopes (NFR11)

**Given** the user signs in to Atlassian and approves the requested scopes
**When** the OAuth callback returns with an authorization code
**Then** the extension exchanges the code for tokens using the stored PKCE code_verifier
**And** the token-exchange response is parsed via a Zod schema (defensive parsing returns `Result.kind: 'parse-error'` on schema drift)

**Given** the user has access to exactly one accessible Jira Cloud site
**When** `GET https://api.atlassian.com/oauth/token/accessible-resources` returns one entry
**Then** the extension auto-selects that site's `cloudId` without prompting the user

**Given** the user has access to multiple Jira Cloud sites
**When** `accessible-resources` returns more than one entry
**Then** the options page renders a site-picker list inline showing each site's name and URL
**And** the user clicks one; the chosen `cloudId` is persisted

**Given** valid tokens and a chosen `cloudId` are obtained
**When** persistence runs
**Then** `{access_token, refresh_token, expires_at, cloudId}` are written atomically to `chrome.storage.local` via `lib/storage/tokens.ts`
**And** the options page replaces the welcome hero with a connection indicator showing `✓ Connected as <email> (<site-domain>)` (UX-DR22)

**Given** the user cancels the OAuth window, or Atlassian sign-in fails, or the user denies scopes
**When** the flow exits without valid tokens
**Then** no partial state is persisted to `chrome.storage.local`
**And** the options page remains in the "Connect to Jira" first-run state ready for retry (no apology theatre, no error modal — UX-DR30)

### Story 1.2: Silent Token Refresh & 30-Day Auth Survival

As a connected worker,
I want my session to stay authenticated silently across browser restarts and time,
So that I never have to re-connect during normal use.

**Acceptance Criteria:**

**Given** a stored token bundle exists in `chrome.storage.local`
**When** `expires_at` is within 2 minutes of the current time
**Then** the service worker triggers a token refresh by exchanging the refresh token at the Atlassian token endpoint
**And** the refresh runs proactively via `chrome.alarms` (1-minute minimum interval honored)

**Given** a refresh is in flight
**When** a second refresh attempt is triggered concurrently (e.g., from a parallel API call)
**Then** a `refreshInFlight` mutex in `chrome.storage.session` prevents the second attempt from issuing a duplicate exchange
**And** the second caller awaits the in-flight result

**Given** the refresh succeeds
**When** the new tokens are persisted
**Then** the rotated `refresh_token` and updated `access_token` + `expires_at` are written to `chrome.storage.local` in a single atomic write (no half-state where one token is updated and the other isn't)

**Given** the refresh fails with a 4xx auth error (refresh token revoked, scope removed, etc.)
**When** the failure is observed
**Then** the token bundle is cleared from `chrome.storage.local`
**And** subsequent API calls return `Result.kind: 'auth-expired'` so UI surfaces can fall back to the "Connect to Jira" state

**Given** a 30-day rolling window of normal use (browser restarts, service-worker restarts, periodic API activity)
**When** the user opens the popup or options page at the end of the window
**Then** the user has not seen a re-auth prompt at any point in the window (NFR5 — verified by observing 30 days of no `auth-expired` Result emission in test scenarios)

**Given** the service worker is killed by Chrome between alarm fires (MV3 lifecycle)
**When** the next alarm fires
**Then** the service worker wakes, reads tokens from `chrome.storage.local`, and refresh logic continues correctly without losing state

### Story 1.3: Disconnect & Clear Local Data

As a connected worker,
I want to disconnect my Jira account and have all local data cleared,
So that I can hand the device off, reset state, or remove the extension cleanly.

**Acceptance Criteria:**

**Given** the user is connected and on the options page
**When** the user clicks "Disconnect"
**Then** a confirmation dialog appears with one-line summary "This will clear your local extension data. Your Jira worklogs and comments remain untouched."
**And** the dialog has Cancel (secondary, left) and "Disconnect" (primary, right) buttons (UX-DR25)

**Given** the confirmation dialog is open
**When** the user clicks Cancel or presses Esc
**Then** the dialog closes and no state changes

**Given** the confirmation dialog is open
**When** the user clicks "Disconnect"
**Then** all `chrome.storage.local` keys owned by this extension are cleared: tokens, settings, view-state, banner-dismissals, cycle cache, outbox, recent/pinned tickets
**And** the `refreshInFlight` flag in `chrome.storage.session` is cleared
**And** any active content-script banners are notified via `chrome.tabs.sendMessage` to dismiss themselves
**And** the toolbar badge is cleared (set to empty)

**Given** disconnect has completed
**When** the user re-opens the options page or popup
**Then** the options page shows the first-run welcome hero again with the "Connect to Jira" CTA
**And** the popup (if opened) shows a "Connect to Jira" fallback state

**Given** disconnect is in progress
**When** any code path tries to call the Jira API
**Then** `jira-client` returns `Result.kind: 'auth-expired'` because the token bundle is absent
**And** under no circumstances does the extension call any DELETE endpoint on Jira (worklogs and comments in Jira are never touched — FR42)

### Story 1.4: Manager & Skip-Level Auto-Detection from Jira

As a connected worker,
I want my manager and skip-level to be read automatically from Jira's user directory,
So that I don't have to type names and risk typos.

**Acceptance Criteria:**

**Given** the extension just completed OAuth connect
**When** the initial sync fires
**Then** `lib/jira-client.ts` makes an authenticated request to `GET /rest/api/3/myself` to obtain the worker's `accountId`
**And** all requests flow through `lib/scheduler.ts` (token-bucket rate-limit scheduler) and `lib/jira-client.ts` (single API wrapper returning `Result<T, JiraError>`)
**And** responses are Zod-validated via `lib/jira-types.ts`

**Given** the worker's `accountId` is known
**When** `lib/manager-resolution.ts` runs
**Then** it reads the `manager` field from Jira's user-directory record for that user
**And** if the manager is set, it makes a second request to read the manager's own `manager` field (recursive lookup for the skip-level)
**And** both resolved users' display names are persisted to `chrome.storage.local` via `lib/storage/settings.ts`

**Given** the manager and skip-level have been resolved
**When** the user opens the options page
**Then** the "Reporting line" section shows two read-only rows: "Manager (read from Jira): <display name>" and "Skip-level (read from Jira): <display name>" (UX-DR22)
**And** the section does NOT offer an editable input — the user cannot override

**Given** the worker's `manager` field is unset in Jira's user directory
**When** `lib/manager-resolution.ts` resolves the manager
**Then** instead of throwing, it returns a "manager not set" result
**And** the options page "Reporting line" section shows a non-blocking notice "Manager not set in Jira — please contact your admin to configure it for richer pre-fill suggestions" (FR46, AR28 — graceful degradation)
**And** the user is NOT blocked from completing OAuth setup or using any subsequent feature

**Given** the manager is set but the skip-level (manager's manager) is unset
**When** the resolution runs
**Then** the manager row is populated and the skip-level row shows the same non-blocking notice
**And** the worker can still configure all other settings and proceed

**Given** `lib/manager-resolution.ts` is a cross-cutting module
**When** the dev runs `pnpm test`
**Then** co-located Vitest tests cover: manager-set-and-skip-set, manager-set-skip-unset, manager-unset, network-error-from-Jira, and a malformed-response case that returns `Result.kind: 'parse-error'`

### Story 1.5: Catch-All Project & PTO Subtask Configuration

As a connected worker,
I want to configure my catch-all project key (default `KNP`) and pick a PTO subtask within it,
So that the extension knows where to post my Admin/Meetings/PTO worklogs.

**Acceptance Criteria:**

**Given** the user is on the options page after OAuth connect
**When** the page renders
**Then** the "Catch-all project" section shows a text input labelled "Project key" pre-filled with the default `KNP` and the helper text "(default)"
**And** below it, a "PTO subtask" dropdown appears once a valid project key resolves

**Given** the user edits the project key field
**When** the field blurs
**Then** the value is normalised (trim, uppercase) and saved to `chrome.storage.local` settings
**And** the PTO subtask dropdown re-fetches its options from `GET /rest/api/3/search` (JQL: subtasks within the configured project key)

**Given** a valid catch-all project key is configured
**When** the PTO subtask dropdown opens
**Then** it lists all subtasks within that project (key + summary, monospace key)
**And** the user picks one; the selection is saved to `chrome.storage.local` settings

**Given** the configured catch-all project key resolves to no project (typo, no access)
**When** the validation fires
**Then** the field shows a `state.danger` border and helper text "Project key not found or no access — check the key and your permissions" (UX-DR29)
**And** the PTO subtask dropdown is hidden until a valid key is entered

**Given** the user has not configured a PTO subtask yet
**When** subsequent flows that depend on it run (PTO action in Today view, PTO popover in Week view — both built in later epics)
**Then** those flows degrade gracefully per AR28: render disabled action with tooltip "PTO subtask not configured. Configure in [Settings]" deep-linking to this options-page section
**And** the worker can still log project hours and even non-PTO catch-all entries

### Story 1.6: Daily Reminder, Target Hours & Approval Cycle Configuration

As a connected worker,
I want to configure my daily reminder time, work-day target hours, and approval cycle,
So that the extension's cadence matches my team's rhythm.

**Acceptance Criteria:**

**Given** the user is on the options page
**When** the page renders the "Cadence" section
**Then** three fields are visible: "Daily reminder time" (time input, default `17:00`), "Work-day target (hours)" (number input, default `8`), "Approval cycle" (dropdown, default "Calendar month")
**And** all three values default per FR49 (17:00), FR50 (8 h), FR51 (monthly calendar-aligned)

**Given** the user changes any cadence value
**When** the input blurs
**Then** the new value is saved to `chrome.storage.local` settings via `lib/storage/settings.ts`
**And** the change is applied immediately — no "Save" button required (UX-DR29: no save-button ceremony)

**Given** a daily reminder time has been saved
**When** the service worker's daily-reminder alarm registration runs
**Then** `chrome.alarms.create('daily-reminder', { when: nextOccurrenceOfConfiguredTime, periodInMinutes: 1440 })` registers a recurring alarm at the configured local time
**And** the alarm handler is wired in `entrypoints/background.ts` but the user-facing notification trigger is deferred to Epic 3 (FR16) — Story 1.6 sets up the alarm only

**Given** the user enters an out-of-range value (target hours < 1 or > 24; reminder time in invalid format)
**When** the input blurs
**Then** the field shows a `state.danger` border with helper text explaining the valid range
**And** the prior valid value is retained until the user enters a valid one

**Given** the approval cycle field defaults to "Calendar month"
**When** the dropdown is opened
**Then** the only option visible in v1.0 is "Calendar month" (other cycle options are deferred to future versions)
**And** the dropdown is functional but locked to this single value (forward-compatibility — schema accommodates other cycles, UI exposes only one)

### Story 1.7: Diagnostics Block & Cache-Clear Action

As a connected worker,
I want to see the extension's last-sync time and storage usage and have a way to clear my cache,
So that I can diagnose issues and recover space without disconnecting entirely.

**Acceptance Criteria:**

**Given** the user is on the options page
**When** the page renders the "Diagnostics" section
**Then** two lines are shown: "Last sync: <relative time, e.g., '2 minutes ago' via date-fns `formatDistanceToNow`>" and "Local storage used: X.X MB / 10 MB" (FR52)
**And** the storage-used line includes a "Clear local cache" tertiary-tier button (UX-DR25)

**Given** the dev has written `lib/storage/quota.ts`
**When** any code path writes to `chrome.storage.local` (worklog cache, settings, view-state, etc.)
**Then** a quota-check wrapper runs first, querying `chrome.storage.local.getBytesInUse()`
**And** if the write would exceed the 10 MB ceiling, eviction runs first: closed-cycle cache entries are removed oldest-first until under 80% of quota
**And** the eviction logic has co-located Vitest tests covering: under-quota write (no eviction), exactly-at-quota write (eviction triggers), no-evictable-data scenario (logs warning and proceeds with best-effort)

**Given** the user clicks "Clear local cache"
**When** the action confirms (via a small inline tooltip "Cleared" — no dialog needed for a non-destructive action)
**Then** the closed-cycle cache, recent/pinned tickets, view-state cache, and outbox state are cleared
**And** tokens, settings, and the user's connection are NOT cleared (this is different from Disconnect — Story 1.3 is the full nuclear option)
**And** the "Local storage used" line refreshes to reflect the new lower value

**Given** the last-sync timestamp has never been set (fresh install, before first API call)
**When** the Diagnostics section renders
**Then** the last-sync line shows "Last sync: never" rather than throwing or showing "NaN" / "Invalid Date"

## Epic 2: Log Time (Today View)

The worker can open the popup and post a worklog in under 30 seconds — pick a subtask from the hierarchy-walked pre-fill picker, search Jira for any ticket, use "+ Create my subtask under this Task", or pick from the catch-all — enter hours with Jira's flexible parser, submit with Enter, and see the entry appear. Edit/delete previous worklogs and mark a day full/half PTO from the popup. Offline writes queue in the outbox and retry on reconnect.

### Story 2.1: Popup Shell, View Router & TanStack Query Setup

As a connected worker,
I want to open the toolbar popup and see a tabbed shell with a Today view by default,
So that I have a working surface for daily logging.

**Acceptance Criteria:**

**Given** the user is connected (token bundle exists in `chrome.storage.local`)
**When** the user clicks the extension's toolbar icon
**Then** the popup opens at 360 px wide with a `p-4` outer padding (UX-DR3)
**And** the popup mounts via a React entrypoint at `entrypoints/popup/main.tsx` wrapped in a TanStack Query `QueryClientProvider` and a top-level `ErrorBoundary` (UX-DR23)
**And** the popup shows a tab bar at the top: `[Today] [Week]` with an active-tab underline in `accent.DEFAULT` (UX-DR4 tabs primitive; UX-DR18 — Manager tab is added in Epic 5)

**Given** the popup has a view-state machine
**When** the dev defines the router
**Then** `PopupView` is a discriminated union (`{ kind: 'today' } | { kind: 'week', weekOf: ISODate }`) stored in `chrome.storage.local` via `lib/storage/view-state.ts`
**And** the popup remembers the last-used view across opens; new users default to `kind: 'today'` (UX-DR28)

**Given** the popup mounts
**When** the user has no valid token bundle (disconnected)
**Then** the popup falls back to a "Connect to Jira" CTA that opens the options page on click (Story 1.3 fallback path) — does not throw, does not show a generic error

**Given** the popup mounts on the Today view
**When** the page begins to render
**Then** within 120 ms a fade-in completes (UX-DR7 motion)
**And** TanStack Query is configured with `queryFn` that calls `lib/jira-client.ts`, a `retry` callback that honors `Retry-After`, and `staleTime` per query type (5 min hierarchy, 1 min current-week, infinite for closed cycles — AR23)

**Given** the popup has been opened from a daily-reminder notification (Epic 3, deferred wiring)
**When** the popup mounts
**Then** the service worker has pre-warmed the Today-view query cache so the popup hits a warm TanStack Query cache
**And** time-to-interactive is ≤ 400 ms p95 (NFR1 — measured by performance.now() instrumentation)

**Given** the popup is open
**When** the user clicks outside it
**Then** the popup closes (Chrome's native behavior)
**And** the current view-state has already been persisted to `chrome.storage.local` so re-opening restores it without loss (UX-DR28)

### Story 2.2: Hierarchy Walk — Build Pre-Fill Ticket Source

As a connected worker,
I want the extension to discover Tasks I'm likely to work on by walking my reporting line,
So that the Today picker can suggest tickets without me searching.

**Acceptance Criteria:**

**Given** the worker is connected and manager + skip-level are resolved (Story 1.4)
**When** the hierarchy-walk query runs
**Then** `lib/hierarchy.ts` issues JQL queries via `GET /rest/api/3/search` to fetch:
  - Tasks/Subtasks where `assignee = currentUser()` AND `statusCategory != Done` AND `updated >= -28d`
  - Tasks where `assignee = <managerAccountId>` AND same filters
  - Tasks where `assignee = <skipLevelAccountId>` AND same filters
**And** all requests flow through `lib/scheduler.ts` (token-bucket) and `lib/jira-client.ts` (Result<T> return)

**Given** the JQL responses return
**When** the hierarchy results are assembled
**Then** each Task is shaped as `{ key, summary, assigneeDisplayName, source: 'self'|'manager'|'skip-level' }`
**And** subtasks the worker owns are nested under their parent Task to form a 2-level browse tree (FR8)

**Given** the manager or skip-level is unset (Story 1.4 graceful-degradation path)
**When** the hierarchy walk runs
**Then** the corresponding JQL query is skipped silently
**And** the worker's own assigned tasks/subtasks still populate the picker (AR28: degraded but functional)

**Given** the hierarchy results are computed
**When** they are returned to the popup
**Then** the result is cached in TanStack Query with `staleTime: 5 min` and the `chrome.storage.local` durable cache backing closed-cycle data does not apply (hierarchy is live)

**Given** the hierarchy walk encounters a rate-limit response (429)
**When** the scheduler honors the `Retry-After` header
**Then** the query waits and retries up to 3 times before surfacing `Result.kind: 'rate-limited'`
**And** the picker UI shows a skeleton until results resolve, then a graceful "Couldn't load suggestions — try again" empty state if all retries fail (UX-DR27)

**Given** `lib/hierarchy.ts` is a cross-cutting module
**When** the dev runs `pnpm test`
**Then** co-located Vitest tests cover: all three lookups succeed, only self-lookup succeeds (manager unset), skip-level-only-unset, JQL syntax errors handled, malformed response returns `parse-error`

### Story 2.3: TicketPicker — 2-Level Browse Tree with Search & Create Subtask

As a connected worker,
I want a fast picker that shows my likely tickets and lets me search Jira or create a subtask when needed,
So that I can find the right ticket in under 2 seconds.

**Acceptance Criteria:**

**Given** the Today view is rendered
**When** the picker mounts
**Then** the picker displays a search input (with 🔍 icon, focused on mount) and a collapsible 2-level tree using native `<details>/<summary>` elements (UX-DR8)
**And** Tasks appear at level 1 ("▾ Tasks (N)"); subtasks the worker owns appear nested at level 2; the catch-all section appears as a separate top-level group ("▾ Catch-all (KNP)")
**And** ticket keys render in `font-mono text-sm font-medium neutral.900`; summaries render in `font-sans text-sm font-normal neutral.700` (UX-DR2)

**Given** the picker is rendered with hierarchy data
**When** the user types in the search input
**Then** the picker filters Task and subtask rows in real time with a 100 ms debounce against a case-insensitive substring match on key + summary (UX-DR8)
**And** rows that don't match are hidden; `<details>` groups whose children all match expand automatically

**Given** the user selects a Task that has no subtask assigned to them
**When** the user clicks the Task row
**Then** a "+ Create my subtask under this Task" affordance replaces the inline hours field (FR9)
**And** clicking the affordance opens an inline name input; submitting calls `POST /rest/api/3/issue` with `issueType: Subtask`, `parent: <taskKey>`, `assignee: <currentUser>`, `summary: <typed name>`
**And** on success the new subtask appears in the tree under that Task and is auto-selected

**Given** no ticket in the hierarchy matches the user's search query
**When** the picker shows zero results
**Then** an empty state appears: "No matching tickets. [Search Jira] for a specific key." (UX-DR27)
**And** the "Search Jira" link is also always available at the bottom of the picker as "+ Search Jira for a ticket…" (UX-DR8)

**Given** the user clicks "Search Jira"
**When** the picker enters Search-Jira mode
**Then** the input placeholder changes to "Type a ticket key (e.g., OTHER-789) or text"
**And** typing triggers `GET /rest/api/3/search` with a JQL query searching by key or text (debounced 300 ms)
**And** results appear below; selecting one adds it to the worker's "Recent / Pinned" list in `chrome.storage.local` (UX-DR8) and surfaces it alongside hierarchy results on subsequent picker opens

**Given** the worker has previously pinned tickets
**When** the picker mounts on a fresh open
**Then** a "▾ Recently used (N)" group appears at the top of the tree above "Tasks" (UX-DR8)

**Given** the picker is keyboard-navigated
**When** the user presses arrow keys
**Then** focus moves between rows in DOM order; Enter selects the focused row; Esc clears the search input or closes a Search-Jira mode (UX-DR29)
**And** each row has `aria-label="Pick <ticketKey>: <summary>"` and rows are `<button>` elements — no clickable `<div>` (UX-DR32)

### Story 2.4: QuickLogForm — Hours Input with Jira-Flexible Parser

As a connected worker,
I want to enter hours in whatever format feels natural and submit with Enter,
So that logging takes seconds, not deliberation.

**Acceptance Criteria:**

**Given** the user has selected a ticket from the picker
**When** the picker hands off to `QuickLogForm`
**Then** the selected ticket replaces the picker row showing key + summary
**And** an hours `<input>` appears immediately to the right, focused, alongside a primary-tier "Log" button (UX-DR9, UX-DR25)

**Given** the hours field is focused
**When** the user types
**Then** the field accepts any of these formats: `2.5`, `2.5h`, `2h 30m`, `2:30`, `150m` (the same flexible parser Jira's worklog API accepts)
**And** as the user types, the input's border turns `state.success` color when parseable, `state.danger` when not (live validation per UX-DR29)
**And** when the input is unparseable, helper text below shows "Use formats like `2.5h`, `2h 30m`, or `2:30`" (UX-DR30 — informational, not preachy)

**Given** the user enters parseable hours
**When** the user presses Enter (or clicks Log)
**Then** the value is normalised to `timeSpentSeconds` via `lib/hours.ts` (`hoursToSeconds`; no inline `* 3600`)
**And** the worklog is posted via a `log-worklog` message to the service worker which calls `lib/jira-client.postWorklog(issueKey, { timeSpentSeconds, started: <today ISO>, comment? })`
**And** the Log button briefly shows a spinner (≤ 200 ms) then a `✓` (200 ms) before resetting (UX-DR9)

**Given** the user enters hours > 24 (`25`, `25h`, `1d 1h`, etc.)
**When** the field validates
**Then** the parsed value is rejected with an inline `state.danger` error "Hours per entry can't exceed 24. Split into multiple entries if needed." (UX-DR9 hard-block per Phase-3 spec)
**And** the Log button is disabled

**Given** the user wants to backdate a worklog within the current approval cycle
**When** the QuickLogForm renders
**Then** a small date selector (defaults to "Today") is visible to the right of the hours field
**And** the dropdown offers "Today", "Yesterday", and a date picker for any other day within the current cycle (FR7)
**And** dates outside the current cycle are not selectable

**Given** the worklog post succeeds (`Result.kind: 'ok'`)
**When** the form completes
**Then** the new entry appears in the "Logged today" list above with a 200 ms slide-in animation (UX-DR7)
**And** the total in the view header increments (e.g., `7h / 8h` → `8.5h / 8h`)
**And** the picker UI re-renders with the search input cleared and re-focused so the worker can log another entry (popup stays open per UX-DR10)
**And** the badge update is broadcast via `badge-update` message and toolbar badge re-renders within 30 s (NFR4)

**Given** the user presses Enter twice in quick succession
**When** the first submit is still in flight
**Then** the Log button is disabled until the first result resolves (no duplicate posts)

### Story 2.5: Catch-All Picker & One-Click PTO Action

As a connected worker,
I want to log time against shared catch-all subtasks (Admin / Meetings) and mark today as full or half PTO with one click,
So that non-project time has a fast path.

**Acceptance Criteria:**

**Given** the catch-all project is configured (Story 1.5) and a PTO subtask is set
**When** the Today picker renders
**Then** the catch-all group ("▾ Catch-all (<projectKey>)") lists all subtasks within that project as a flat list (FR10)
**And** clicking any catch-all subtask hands off to the same `QuickLogForm` as a hierarchy ticket would
**And** the worker cannot create new catch-all subtasks from this UI (those are pre-existing shared subtasks managed at the project level per FR10)

**Given** the catch-all project key is unconfigured
**When** the Today picker renders
**Then** the catch-all group is hidden entirely
**And** a non-blocking empty-state placeholder above the picker reads "Catch-all not configured. [Configure in Settings] to log Admin/Meetings/PTO." (AR28, UX-DR27)
**And** the worker can still log project work via the hierarchy picker

**Given** the Today view is open and a PTO subtask is configured
**When** the page renders
**Then** a primary "Mark today as PTO" affordance is visible near the top of the Today view (UX-DR10)
**And** clicking it opens a small inline popover with two buttons: "Full day (Xh)" using the configured target, and "Half day (X/2 h)"

**Given** the PTO popover is open
**When** the user clicks "Full day"
**Then** a single worklog is posted via `lib/pto.ts` to the configured PTO subtask with `timeSpentSeconds = targetHours * 3600` and `started = <today ISO>` (FR11)
**And** the entry appears in "Logged today" and the badge ticks down accordingly

**Given** the PTO popover is open
**When** the user clicks "Half day"
**Then** the worklog is posted with `timeSpentSeconds = (targetHours / 2) * 3600` (FR11)

**Given** the PTO subtask is unconfigured but catch-all is configured
**When** the Today view renders
**Then** the "Mark today as PTO" affordance is rendered in a disabled state with a tooltip "PTO subtask not configured. [Configure in Settings]." deep-linking to Story 1.5's options field (UX-DR25 disabled buttons paired with explanation)

### Story 2.6: Edit & Delete Worklogs from "Logged today"

As a connected worker,
I want to edit hours/date/comment or delete worklogs I posted via the extension,
So that I can correct mistakes without leaving the popup.

**Acceptance Criteria:**

**Given** the Today view shows a "Logged today" list with at least one entry
**When** the user hovers a row
**Then** a `⋯` menu icon appears at the row's right edge (hover-revealed, UX-DR8 pattern from GitHub)
**And** the icon has `aria-label="Worklog actions for <ticketKey>, <hours>h"` for keyboard users (UX-DR32)

**Given** the user opens the `⋯` menu on a worklog row
**When** the menu renders
**Then** two actions are visible: "Edit" and "Delete" as ghost-tier (tertiary) items (UX-DR25)

**Given** the user clicks "Edit"
**When** the row enters edit mode
**Then** the hours, date, and comment fields become inline-editable using the same hours parser as `QuickLogForm`
**And** pressing Enter or clicking "Save" calls `PUT /rest/api/3/issue/{key}/worklog/{id}` via `lib/jira-client.ts` (FR12)
**And** on success the row updates in place and the "Logged today" total recalculates

**Given** the user clicks "Delete"
**When** the confirmation appears
**Then** an inline confirmation chip replaces the menu reading "Delete this worklog?" with "Cancel" (secondary) and "Delete" (primary danger) buttons (UX-DR25, UX-DR30)
**And** clicking "Delete" calls `DELETE /rest/api/3/issue/{key}/worklog/{id}` via `lib/jira-client.ts` (FR13)
**And** on success the row slides out and the total recalculates

**Given** an edit or delete fails with a 4xx other than 401 (e.g., permission denied, worklog already deleted server-side)
**When** the failure is observed
**Then** the row reverts to its prior state and a status chip appears next to the row: "Couldn't update — <reason from server>" (UX-DR24 channel 2)
**And** no toast or alarm — the chip persists until the user retries or dismisses

**Given** an edit or delete fails with a network or rate-limit error
**When** the failure is observed
**Then** the change is enqueued in the outbox (Story 2.7) and a "Pending — will retry" chip appears on the row
**And** the change retries on connectivity recovery

### Story 2.7: Outbox — Queue Failed Writes & Retry on Reconnect

As a worker who briefly loses connectivity,
I want my worklog writes to queue and retry automatically,
So that I never lose data the tool said it was sending.

**Acceptance Criteria:**

**Given** the user submits a worklog and the request fails with a network error or rate-limit (after the scheduler's in-call retries are exhausted)
**When** the failure is observed in the service worker
**Then** the pending write (POST/PUT/DELETE with its full payload) is appended to `lib/storage/outbox.ts` in `chrome.storage.local` as `{ id, kind: 'post'|'put'|'delete', endpoint, body, attemptCount, lastError, enqueuedAt }` (FR43, AR21, NFR6)
**And** the worklog row in "Logged today" appears with a `Clock` icon + "Pending — will retry" status chip in `state.info_subtle` (UX-DR15 icon + UX-DR24)

**Given** the outbox has pending entries
**When** the service worker is alive
**Then** a `chrome.alarms` alarm named `outbox-retry` fires every 60 seconds
**And** the retry handler attempts each entry through the scheduler; entries that succeed are removed from the outbox; entries that fail again have `attemptCount` incremented and `lastError` updated

**Given** an outbox entry succeeds on retry
**When** the success result arrives
**Then** the entry is removed from `chrome.storage.local`
**And** if the popup is open, the corresponding "Pending" chip is cleared and the row appears with normal styling
**And** if the popup is closed and the user has multiple successful retries in one alarm fire, a single toast appears on next popup open: "Synced N pending worklogs" (UX-DR24 channel 3)

**Given** an outbox entry has retried 10 times without success
**When** the next retry attempt fails
**Then** the entry is moved into a "failed" sub-state (not deleted) so the worker doesn't silently lose it
**And** the popup's Logged-today row shows a `state.danger` chip "Couldn't post after multiple tries — <last error reason>" with a "Retry now" tertiary action
**And** the user can click "Retry now" to attempt again or "Discard" to remove the entry (Discard requires a confirmation chip)

**Given** the user disconnects (Story 1.3)
**When** disconnect clears `chrome.storage.local`
**Then** the outbox is also cleared (consistent with full reset)

**Given** `lib/storage/outbox.ts` is a cross-cutting module
**When** the dev runs `pnpm test`
**Then** co-located Vitest tests cover: enqueue + dequeue, retry-success path, retry-fail-then-success path, retry-exceeds-max path, disconnect clears outbox

## Epic 3: Daily Awareness — Badge, Reminder, Banner

The tool reaches the worker ambiently. A single-integer badge counter on the toolbar icon shows hours missing from the current week. A daily push notification fires at the configured time and opens the popup pre-warmed with Today data. An inline banner injects into any Jira page showing unlogged-hours signal; on a specific subtask page it offers a contextual quick-log directly inside the banner; the worker can dismiss the banner for the rest of the day.

### Story 3.1: Toolbar Badge Counter

As a worker with browsers open all day,
I want a number on the toolbar icon showing hours I still owe this week,
So that I'm reminded ambiently without opening the popup.

**Acceptance Criteria:**

**Given** the worker is connected and the current week has worklogs (or doesn't)
**When** the service worker's badge-update alarm fires (registered as `chrome.alarms.create('badge-update', { periodInMinutes: 30 })`)
**Then** `lib/badge.ts` computes hours missing for the current week = `(workdaysSoFar * targetHours) − sum(worklogs.timeSpentSeconds / 3600)` where `workdaysSoFar` counts Mon–Fri through "today" inclusive
**And** the result is rendered on the toolbar icon via `chrome.action.setBadgeText({ text: '<N>h' })` and `chrome.action.setBadgeBackgroundColor` set to `state.danger` color (FR15, NFR4)

**Given** the computed deficit is 0 or negative (worker is caught up or over)
**When** the badge update runs
**Then** the badge text is cleared (`chrome.action.setBadgeText({ text: '' })`)
**And** no color is applied — the badge is invisible in the caught-up state (UX-DR15 — relief moment)

**Given** the user has marked the current week as done (Epic 4 Story 4.5 — local-only flag)
**When** the badge update runs
**Then** the badge text is cleared regardless of computed deficit (FR24: mark-as-done clears the week's contribution to the badge)

**Given** the worker posts a worklog from the popup or banner
**When** the local action completes
**Then** the badge re-renders within 30 seconds (NFR4 — typically immediate via the `badge-update` broadcast message from `log-worklog` handler)

**Given** another team member's worklog or a Jira-side change updates the worker's worklog data
**When** the next badge alarm fires
**Then** the badge re-renders to reflect the live remote state within 2 minutes (NFR4 — bounded by alarm period and rate-limit scheduler)

**Given** the worker is disconnected
**When** the badge runs
**Then** the badge text is cleared (no number shown when there's no authoritative data)
**And** no fetch is attempted

**Given** `lib/badge.ts` is a cross-cutting module
**When** the dev runs `pnpm test`
**Then** Vitest tests cover: deficit math across week boundaries, PTO entries counted as full target, current-week mark-as-done returns 0, no-worklogs case, week-rollover behavior (Monday morning resets to full deficit)

### Story 3.2: Daily Push Notification

As a worker who could forget to log,
I want a single daily notification at my configured time that opens the popup pre-warmed,
So that I'm reminded without needing to remember.

**Acceptance Criteria:**

**Given** the daily-reminder alarm is registered (Story 1.6) and the configured time is reached
**When** the alarm fires
**Then** the service worker checks: is the worker logged today (any worklog with `started == <today ISO date>`)? AND is the current week marked-as-done?
**And** if either is true, the notification is suppressed (no badge nag at end-of-day if already done)
**And** otherwise, `chrome.notifications.create` displays a notification with title "Log today's time", body "<Xh / targetHours> logged today", and the brand logo as the icon (UX-DR36)

**Given** the notification is shown
**When** the user clicks the notification body
**Then** `chrome.action.openPopup()` is called and the popup opens pre-warmed with today's data
**And** the popup mounts within 400 ms p95 because the service worker had already pre-fetched Today data when the alarm fired (NFR1)

**Given** the notification is shown
**When** the user clicks "Dismiss" (Chrome's native action) or ignores it
**Then** the notification is cleared without opening the popup; the badge remains visible (UX-DR30 — informational, not pushy)

**Given** the notification copy is generated
**When** the notification body is composed
**Then** the copy is past-tense factual ("<Xh / Yh> logged today") — never "Don't forget!" or "You should…" (UX-DR30)

**Given** the user changes the daily reminder time in settings (Story 1.6)
**When** the settings save fires
**Then** the existing `daily-reminder` alarm is cleared and re-registered with the new time

**Given** the service worker has been killed by Chrome and an alarm fires
**When** the worker wakes
**Then** the daily-reminder handler runs correctly using `chrome.storage.local` to retrieve the current settings — no in-memory state assumed

### Story 3.3: Inline Jira Banner with Daily Dismiss & Contextual Quick-Log

As a worker who visits Jira pages many times a day,
I want a thin banner at the top of Jira showing my unlogged hours, with a one-click contextual quick-log when I'm on a subtask page,
So that discovery and resolution of gaps happen inside my existing workflow.

**Acceptance Criteria:**

**Given** the user has navigated to any `*.atlassian.net` page
**When** the content script (`entrypoints/content.ts`) wakes
**Then** it checks `chrome.storage.local` for today's dismissal state via `lib/storage/banner-dismiss.ts` (date-keyed)
**And** if the user has dismissed the banner today, no banner renders (FR18)

**Given** the banner is not dismissed today
**When** the content script requests current state from the service worker via `banner-state` message
**Then** the service worker returns `{ hoursMissing, currentTicket? }` (currentTicket parsed from URL pattern `/browse/<KEY>`)
**And** if `hoursMissing == 0`, no banner renders (FR17)

**Given** `hoursMissing > 0` and the user is not on a specific subtask page
**When** the banner is injected
**Then** a collapsed banner slides in from the top of Jira's content area (200 ms ease-out per UX-DR7), 100% width × ~56 px tall, with:
  - a small brand-purple `●` dot (UX-DR19 — no logo intrusion into Jira's UI)
  - "<Xh> unlogged this week." text in `neutral.700`
  - "Open extension" tertiary CTA on the right that opens the popup
  - a `✕` dismiss icon with `aria-label="Dismiss for today"` (UX-DR32)
**And** all styles are applied as inline `style={{...}}` attributes sourced from `lib/banner-styles.ts` — no Tailwind classes, no external fonts (AR32, NFR9 CSP-safe)

**Given** `hoursMissing > 0` AND the user is on a specific subtask page (URL matches `/browse/<KEY>` where KEY refers to a subtask issue type)
**When** the banner renders
**Then** an additional contextual CTA appears: "Log time on <KEY>" as a brand-purple button (FR19, UX-DR19)
**And** the banner has `role="region" aria-label="Time-tracking banner"` (UX-DR32)

**Given** the contextual CTA is visible
**When** the user clicks "Log time on <KEY>"
**Then** the banner expands in place to show an hours input (focused) and a primary "Log" button — using the same Jira-flexible parser as Story 2.4 (FR14, UX-DR19)
**And** submission posts via `log-worklog` message to the service worker, identical pathway to popup-driven logging
**And** on success the banner briefly shows a `✓` then collapses (200 ms slide-up); the page returns to normal

**Given** the user clicks the `✕` dismiss
**When** the dismiss handler runs
**Then** today's date is appended to `lib/storage/banner-dismiss.ts` and the banner slides up and is removed from the DOM (FR18)
**And** the banner returns automatically on the next Jira page visit on the next calendar day

**Given** Jira's SPA router navigates in-tab (no full page reload)
**When** the URL changes
**Then** a `popstate` listener and a MutationObserver on Jira's title bar detect the navigation (AR33)
**And** the banner re-evaluates: re-injects if dismissal state allows; updates the contextual ticket key if the new page is a different subtask; collapses contextual CTA if the new page is not a subtask

**Given** the user is signed out of Jira or token is revoked
**When** the content script requests state and the service worker returns an `auth-expired` result
**Then** no banner renders (banner is a passive surface — it doesn't surface auth errors; the popup handles re-auth UX per Story 2.1)

## Epic 4: Weekly Review & Mark-as-Done

The worker can switch to the Week tab and see a 7-day grid showing per-day totals + per-subtask breakdown, with per-day color coding. They can edit hours inline, add or remove subtasks for the week, mark any day as full or half PTO via a click-cell-header popover, and mark the entire week as done — with explicit gap-acknowledgment for any sub-target day not marked PTO. Mark-as-done is a local-only flag never posted to Jira.

### Story 4.1: Week View Shell — 7-Day Grid with Subtask Rows

As a worker on Friday afternoon,
I want to switch to the Week tab and see my entire week as a grid,
So that I can review what I've logged and spot gaps in seconds.

**Acceptance Criteria:**

**Given** the popup is open and the user clicks the Week tab
**When** the view-state changes to `{ kind: 'week', weekOf: <current Monday ISO date> }`
**Then** the Week view renders with a header showing "Week of <Mon, MMM d>" and the week total (e.g., `28 / 40h`) (UX-DR11)
**And** the view title uses `text-lg font-semibold` per UX-DR2

**Given** the Week view is rendering for the first time
**When** the data is being fetched
**Then** a skeleton grid appears immediately: 7 day-column headers + 4–6 skeleton rows (UX-DR26, UX-DR23 `LoadingSkeleton`)
**And** skeletons use the 1500 ms shimmer in `state.warning_subtle → neutral.100` (UX-DR7)

**Given** worklog data for the current week resolves from TanStack Query
**When** the grid renders
**Then** the grid is a semantic `<table>` with `<th scope="col">` for each day (Mon–Sun) and `<th scope="row">` for each subtask the worker logged against this week (UX-DR11, UX-DR32)
**And** each row's cells contain either a monospace decimal hours value (`4.0`, `0.5`) or `──` em-dash for empty cells (UX-DR2 typography; UX-DR pattern: hours display)
**And** a "+ Add a subtask to this week" tertiary affordance appears at the bottom of the grid (UX-DR11; uses TicketPicker from Story 2.3)

**Given** worklogs for the week are loaded
**When** the row order is determined
**Then** subtasks are listed in order: hierarchy-derived Tasks first (sorted by total hours descending), catch-all subtasks below, PTO subtasks last
**And** each row shows `<ticketKey> <summary>` truncated to fit the 360 px popup width

**Given** the user navigates from Today tab to Week tab and back
**When** the tab changes
**Then** TanStack Query data persists; the Today view re-renders without re-fetching (within the 1-min `staleTime` per AR23)
**And** the popup's `view-state` is updated to remember the last view (UX-DR28)

### Story 4.2: Per-Day Color Coding & Status Icons

As a worker scanning the week grid,
I want each day's status to be obvious at a glance with colors and icons,
So that gaps and PTO days stand out without my having to read numbers.

**Acceptance Criteria:**

**Given** the grid has rendered and per-day totals are computed
**When** each day's status is evaluated
**Then** the day's column-header cell is colored:
  - **Green** (`state.success_subtle` bg + `state.success` text + `Check` icon) when day total ≥ target hours OR day has a PTO worklog (FR21, UX-DR15)
  - **Red** (`state.danger_subtle` bg + `state.danger` text + `AlertCircle` icon) when day total < target AND no PTO (FR21)
  - **Green with PTO label** when day has a PTO worklog (full or half day)
**And** the column-header shows the day total below the day name (`text-sm font-mono`)

**Given** color signaling is used
**When** a color appears
**Then** it is always paired with an icon (`Check`, `AlertCircle`) and an `aria-label` on the column header reading "<day name>, <complete|below target|PTO>" (NFR12, UX-DR32)
**And** the yellow-stripe pattern (used elsewhere for dirty) is NOT used here — yellow stripe is a manager-view concept (Epic 5)

**Given** future days in the current week (e.g., Thursday viewing means Fri/Sat/Sun are future)
**When** the grid renders
**Then** future workdays show as neutral (`neutral.50` bg + `neutral.500` text + `──` em-dashes) without a red status — incomplete is not "below target" for days that haven't happened yet
**And** weekends (Sat/Sun) are also rendered neutral by default

**Given** `prefers-reduced-motion: reduce` is set
**When** a cell's color changes (e.g., from red to green when the user fills in a gap)
**Then** the transition is instant rather than the 200 ms ease-in-out fade (UX-DR33)

### Story 4.3: Inline Cell Editing — Add / Remove / Edit Hours

As a worker reviewing the week,
I want to edit a cell's hours directly in the grid or add a new subtask to the week,
So that I can fix gaps without leaving the grid view.

**Acceptance Criteria:**

**Given** the week grid is rendered
**When** the user clicks any data cell (not a column-header)
**Then** the cell enters inline edit mode with a focused number `<input>` showing the current value (UX-DR11)
**And** the input has `aria-label="Hours for <day>, <subtask>"` (UX-DR32)
**And** Tab moves focus to the next cell in DOM order (left-to-right, then next row); Shift+Tab moves back

**Given** a cell is in edit mode
**When** the user types a parseable hours value (same Jira-flexible parser as QuickLogForm — Story 2.4) and presses Enter or blurs
**Then** if no worklog exists for that (subtask, day) yet, `POST /rest/api/3/issue/<key>/worklog` is called with `started = <that day ISO>` (FR22)
**And** if a worklog exists, `PUT /rest/api/3/issue/<key>/worklog/<id>` updates the existing entry
**And** the same 24-hour hard-block applies per UX-DR9; over-limit values are rejected with the same inline error

**Given** a cell is in edit mode with an existing value
**When** the user clears the input (empty string) and presses Enter
**Then** the existing worklog is deleted via `DELETE /rest/api/3/issue/<key>/worklog/<id>` (FR22 — remove subtask hours from a day)
**And** the cell returns to `──` em-dash

**Given** the user clicks "+ Add a subtask to this week" affordance
**When** the picker mounts
**Then** a compact `TicketPicker` opens inline (same component as Story 2.3) (UX-DR11)
**And** selecting a ticket adds it as a new row in the grid with all `──` cells; the user can then click any cell to add hours
**And** if the chosen ticket is already in the grid, nothing is added — focus jumps to that existing row

**Given** the user wants to remove a subtask row from this week's grid
**When** the user hovers the row, a `⋯` menu reveals with a "Remove from week" tertiary action
**Then** clicking "Remove from week" hides the row from the grid view (a local UI affordance — the worklogs themselves are deleted only via the Today-view `⋯` flow in Story 2.6, not from here, to keep delete actions deliberate)
**Note:** The grid row hides locally if all cells are empty; if any cell has hours, "Remove from week" instead deletes all worklogs in that row after a confirmation chip (similar to Story 2.6 delete)

**Given** an edit fails with a network/rate-limit error
**When** the failure is observed
**Then** the change enqueues in the outbox (Story 2.7); the cell shows a `Clock` icon and "Pending — will retry" chip; the change retries on connectivity recovery

### Story 4.4: Click-Cell-Header PTO Popover

As a worker who took an afternoon off,
I want to click on a day's column header and mark it half-day PTO in one click,
So that gap doesn't trigger a red status without my having to log a worklog manually.

**Acceptance Criteria:**

**Given** the week grid is rendered and the PTO subtask is configured (Story 1.5)
**When** the user clicks any day's column header
**Then** a shadcn `Popover` opens anchored to the column header (UX-DR12)
**And** the popover shows three actions as buttons: "Mark full-day PTO (<targetHours>h)", "Mark half-day PTO (<targetHours/2>h)", "Add a worklog…"
**And** the popover header announces "Currently: <Xh> logged" via `aria-describedby` (UX-DR32)

**Given** the popover is open
**When** the user clicks "Mark full-day PTO"
**Then** a single worklog is posted via `lib/pto.ts` to the configured PTO subtask with `timeSpentSeconds = targetHours * 3600` and `started = <that day ISO>` (FR23)
**And** the popover closes; the day's column header turns green with a "PTO" label; the cell in the PTO row for that day shows the hours value

**Given** the popover is open
**When** the user clicks "Mark half-day PTO"
**Then** a single worklog is posted with `timeSpentSeconds = (targetHours / 2) * 3600` (FR23)
**And** the column header turns green with "PTO ½" label

**Given** the popover is open
**When** the user clicks "Add a worklog…"
**Then** the popover closes and a compact `TicketPicker` opens inline below the grid, scoped to add a worklog with `started = <that day ISO>`
**And** the picker behaves identically to Story 2.3 but the resulting worklog targets the clicked day's date

**Given** the PTO subtask is unconfigured (Story 1.5 graceful-degradation path)
**When** the popover opens
**Then** the two PTO buttons are disabled with a tooltip "PTO subtask not configured. [Configure in Settings]" (UX-DR25, AR28)
**And** the "Add a worklog…" action remains enabled

**Given** the popover is open
**When** the user presses Esc or clicks outside
**Then** the popover closes; focus returns to the column header trigger (UX-DR32 — Radix Popover focus management)

**Given** `prefers-reduced-motion: reduce` is set
**When** the popover opens
**Then** the open animation is instant rather than the 150 ms ease-out (UX-DR33)

### Story 4.5: Mark-as-Done Button with Gap-Acknowledgment Dialog

As a worker finishing the week,
I want to click "Mark week as done" and have the badge drop to zero, with an honest gap-acknowledgment if I'm leaving days short,
So that I close out the week deliberately.

**Acceptance Criteria:**

**Given** the Week view is rendered
**When** the page renders the bottom CTA
**Then** a primary-tier "Mark week as done" button appears centered at the bottom of the grid in brand-purple (UX-DR13, UX-DR25)
**And** the button is enabled regardless of grid state (the gap-check happens on click)

**Given** the user clicks "Mark week as done"
**When** the grid is evaluated
**Then** a gap-check runs across Mon–Fri (weekend not evaluated) computing per-day status: "complete" (≥ target or has PTO worklog) or "gap" (< target and no PTO)
**And** if zero gaps, the local mark-as-done state is set immediately (no dialog)
**And** if one or more gaps, a `GapAcknowledgmentDialog` opens (UX-DR13)

**Given** the gap-acknowledgment dialog opens
**When** the dialog renders
**Then** it lists each gap day as an `<li>` in a semantic `<ul>` with the day name and short summary, e.g., "Thursday: 4h logged / 8h target, not marked PTO" (UX-DR13, UX-DR32 screen-reader friendly)
**And** the dialog text reads exactly: "<N> day(s) are below target and not marked as PTO. Submit anyway?" (UX-DR30 — informational, not preachy)
**And** the two buttons are "Cancel" (secondary, left) and "Submit anyway" (primary, right); focus defaults to "Submit anyway" because the worker has already seen the gaps on the grid (UX-DR13)

**Given** the dialog is open
**When** the user clicks "Cancel" or presses Esc
**Then** the dialog closes and no state changes — the worker can return to the grid and fill gaps

**Given** the dialog is open
**When** the user clicks "Submit anyway"
**Then** the local mark-as-done state is set in `chrome.storage.local` via `lib/storage/view-state.ts` as `{ weekOf: <ISO>, markedDoneAt: <ISO timestamp> }` (FR24, FR26)
**And** the dialog closes
**And** the grid visually grays out / receives a faint banded overlay (UX-DR13)
**And** a "Week done" status chip appears at the top of the Week view with an "Undo" tertiary affordance
**And** the toolbar badge clears (Story 3.1: badge ignores marked-done weeks)

**Given** the user has marked the week done
**When** the worker posts or edits a worklog in this week (from Today, Week, or banner)
**Then** the mark-as-done flag remains in place (per FR26, mark-as-done is local-only and doesn't auto-invalidate from edits)
**And** the user can still see the new entries in the Week grid

**Given** the user clicks the "Undo" affordance on the "Week done" chip
**When** the action runs
**Then** the local mark-as-done flag is cleared; the grid returns to normal; the badge re-renders to the live deficit

**Given** the user is the manager viewing a report's data
**When** any manager-side query reads worklog data
**Then** the mark-as-done state is NOT visible to the manager — it lives only in the worker's local `chrome.storage.local` (FR26)
**And** the manager view always reads live worklog data from Jira (Epic 5)

## Epic 5: Manager Approval & Approval Protocol

A manager can switch to Manager mode, see a person × Epic matrix render progressively, drill into cells via slide-in panel for ticket-level evidence with visibility-warning chips, approve a report's cycle with one click (per-Epic fan-out posts versioned-checksum comments), and re-approve dirty cycles. The audit-integrity layer — fail-closed comment parser, "newest wins per (user, cycle)" rule, dirty detection per `(user, cycle)`, multi-manager-per-Epic independence — is delivered here.

### Story 5.1: Approval-Comment Schema, Checksum & Parser (`comment-schema.ts`, `checksum.ts`, `parser.ts`)

As an architect protecting the audit-integrity contract,
I want the versioned approval-comment schema, checksum computation, and a fail-closed parser implemented as standalone modules with full test coverage,
So that every subsequent approval feature can rely on a single canonical contract.

**Acceptance Criteria:**

**Given** `lib/comment-schema.ts` is being authored
**When** the dev defines the schema
**Then** the module exports a Zod `discriminatedUnion('v', [V1Schema])` where V1Schema has fields `{ v: 1, user: string (accountId), cycle: string (e.g., "2026-05"), by: string (manager accountId), at: ISODateTime, restrictedCount: number, checksum: string }` (AR14, NFR7, NFR8)
**And** a `serializeApproval` function converts a typed payload into a deterministic plaintext block prefixed with a machine-marker `[[JIRA-TIME-LOGGER:APPROVAL:v=1]]` so the comment is unambiguously identifiable
**And** a `parseApprovalComment(body: string): Result<Approval, ParseError>` function fails closed: any deviation from schema OR an invalid checksum returns `Result.kind: 'parse-error'`

**Given** `lib/checksum.ts` is being authored
**When** the dev defines the checksum
**Then** the function computes a stable hash (e.g., a short SHA-256 hex truncated to 8 chars) over the canonical-form `{v, user, cycle, by, at, restrictedCount}` payload (AR15)
**And** the same payload always produces the same checksum across extension versions
**And** `verifyChecksum(payload, claimedChecksum): boolean` returns false for any tampered field

**Given** `lib/parser.ts` is being authored
**When** the dev implements approval discovery
**Then** `findApprovalComments(epicKey: string): Promise<Result<Approval[], JiraError>>` fetches all comments on the Epic via `GET /rest/api/3/issue/<key>/comment`, applies `parseApprovalComment` to each body, and returns successfully-parsed approvals (AR16)
**And** the "newest wins per (user, cycle)" rule is applied: when multiple successfully-parsed approvals share the same `(user, cycle)` pair, only the comment with the latest Jira-native `created` timestamp is kept
**And** approvals for different `(user, cycle)` pairs on the same Epic are kept as separate records — multiple managers' approvals coexist (FR41)

**Given** a comment body matches the machine-marker but its checksum is invalid (e.g., a human edited the comment)
**When** `parseApprovalComment` runs
**Then** the parser returns `Result.kind: 'parse-error', reason: 'checksum-mismatch'` (NFR7, FR40)
**And** the calling code (UI) surfaces a "comment corrupted" warning for that approval rather than misclassifying worklogs as approved

**Given** a future extension version writes a v=2 comment
**When** the current v=1 extension parses it
**Then** the parser returns `Result.kind: 'parse-error', reason: 'unknown-version'` (graceful) rather than crashing (NFR8 forward-compat)
**And** the comment is treated as "not an approval I can verify" — the cycle is treated as unapproved

**Given** the three modules are cross-cutting
**When** the dev runs `pnpm test`
**Then** co-located Vitest tests cover (table-driven where helpful):
  - serialize → parse round-trip preserves all fields exactly
  - checksum verify accepts canonical payload, rejects each tampered field
  - parser returns `parse-error` for missing marker, missing fields, wrong types, bad checksum, unknown version
  - newest-wins resolution across 2, 3, 5 duplicate comments for same `(user, cycle)`
  - multi-user comments on the same Epic coexist (Note's v=1 + Sarah's v=1 both returned)

**Given** the schema is the contract between extension versions
**When** the dev authors `PROTOCOL.md`
**Then** `PROTOCOL.md` exists at the repo root documenting: the machine-marker format, the v=1 payload schema, checksum algorithm, newest-wins rule, dirty-detection rule, parser fail-closed contract (AR19)

### Story 5.2: ModeToggle — Worker ↔ Manager Tab in Popup

As a manager who is also a worker,
I want a clearly-labeled tab to switch to Manager mode,
So that I can review and approve my reports' worklogs without leaving the popup.

**Acceptance Criteria:**

**Given** the popup's tab bar is rendered
**When** the popup mounts and the worker's reports are resolved
**Then** if the worker has at least one direct report (any other user has this worker's `accountId` set as their manager field in Jira), a third tab labelled "Manager" appears: `[Today] [Week] [Manager] ⚙ ⓘ` (FR27, UX-DR18)
**And** if the worker has zero reports, the Manager tab is hidden entirely (UX-DR18)

**Given** the manager-tab visibility depends on a Jira directory lookup
**When** the popup mounts
**Then** `lib/manager-resolution.ts` exposes a `findDirectReports(currentUserAccountId)` function that runs a JQL/user-directory query for users whose `manager` field == this user's accountId
**And** the result is cached in `chrome.storage.local` (refreshed on a 24-hour TTL — direct-report sets change infrequently)

**Given** the user clicks the Manager tab
**When** the view-state changes
**Then** the popup's view-state machine transitions to `{ kind: 'manager-matrix', cycle: <currentCycleId> }` and persists to `chrome.storage.local` (UX-DR28)
**And** the active-tab underline moves to "Manager" in `accent.DEFAULT` (UX-DR4)

**Given** the user has reports and is in Manager mode
**When** the user clicks "Today" or "Week" to switch back
**Then** the tab change is immediate (no loading state, no transition delay — UX-DR principle: simple toggle)
**And** the previous Worker-mode view-state is restored (per UX-DR28)

**Given** the manager-tab visibility could change (e.g., a report is added in Jira)
**When** the user re-opens the popup after the cache's 24-hour TTL
**Then** `findDirectReports` re-fetches and the tab visibility adjusts accordingly

### Story 5.3: Manager Matrix — Person × Epic Grid with Progressive Per-Row Render

As a manager on Day 1 of the month,
I want to see all my direct reports as rows and the Epics they touched as columns, rendering progressively so I can start reviewing immediately,
So that approval feels fast even when there's a lot of data.

**Acceptance Criteria:**

**Given** the user has clicked the Manager tab and view-state is `manager-matrix`
**When** the view mounts
**Then** the view renders a semantic `<table>` with a sticky first column containing direct-report person names (UX-DR14, UX-DR32)
**And** the column header row shows the cycle title (e.g., "May 2026" via `MMMM yyyy`) plus an "X of N done" progress chip (UX-DR14)

**Given** the matrix is being built
**When** the data fetch sequence runs
**Then** the service worker, for each direct report, issues a per-row TanStack Query — `useQuery({ queryKey: ['manager-row', reportAccountId, cycleId] })` (FR29, AR23, UX-DR14)
**And** each per-row query fetches the report's worklogs in the cycle via JQL and groups them by Epic
**And** rows are rendered as skeletons immediately; each row resolves independently and replaces its skeleton with data — staggered ~100 ms apart (UX-DR14 + UX-DR7)
**And** the first row is visible within 2 s; full matrix within 15 s for ≤ 12 reports × ≤ 50 Epics (NFR2)

**Given** rows have resolved with worklog data
**When** the column set is determined
**Then** the columns are the union of all Epics that received hours from any report in this cycle (FR28)
**And** the column ordering is alphabetical by Epic key
**And** if more than 4 Epic columns exist, horizontal scroll is enabled on the data region; the sticky person-name column remains fixed (UX-DR14)

**Given** the matrix is rendered
**When** the user looks at a cell
**Then** each cell shows the total hours the report logged on that Epic in this cycle (e.g., `64`), with no decimal if it's a whole number, or one decimal otherwise
**And** empty cells (report did not log on this Epic) show `──` em-dash; rows are sorted by person name

**Given** scheduler-gated fan-out is in progress
**When** rate-limit responses (429) are received
**Then** the scheduler honors `Retry-After` and queues; the affected per-row queries appear as skeletons longer rather than failing (NFR2 — never throws to the user; degraded experience always recovers within 60 s)
**And** if a row's data fails after retries, that row shows an inline status chip "Couldn't load — retry" (UX-DR24 channel 2) with a tertiary "Retry" action

**Given** the user has no direct reports
**When** they somehow navigate to the Manager view (e.g., via a stale persisted view-state)
**Then** the matrix shows the empty state "You're not configured as anyone's manager in Jira. Switch to Worker view." with an inline link/button to flip to Today view (UX-DR27)

### Story 5.4: Cell Coloring, Dirty Detection & Visibility Warnings

As a manager scanning the matrix,
I want each cell's status (on-target, gap, dirty, restricted, approved) to pop visually with icons backing the color,
So that I find exceptions in seconds and approve the rest with confidence.

**Acceptance Criteria:**

**Given** the matrix is rendered and approval-comment data is fetched (via `lib/parser.ts` from Story 5.1)
**When** each cell's status is computed
**Then** the cell is rendered with status icon + color (UX-DR15, NFR12):
  - **Approved** (dark green `state.success` bg + white text + `Check` icon + dark-green border) when an approval comment exists for `(report.accountId, cycle)` with checksum-valid v=1, and no worklog in this cell has `updated > approval.at` (FR30, FR39)
  - **Green / on-target** (`state.success_subtle` bg + `state.success` text + `Check` icon) when total hours / workdays ≥ targetHours per day across the cycle (the report met or exceeded target each workday)
  - **Red / gap** (`state.danger_subtle` bg + `state.danger` text + `AlertCircle` icon) when one or more workdays in the cycle have < targetHours and no PTO worklog
  - **Yellow-stripe / dirty** (`state.warning_subtle` bg with diagonal-line pattern + `state.warning` text + `RefreshCw` icon) when an approval exists but at least one worklog in that `(report, Epic, cycle)` has `updated > approval.at` (FR37, FR39)
  - **Locked / visibility-restricted** (`Lock` icon overlay on top of the cell's normal status color) when the per-row Jira query reported one or more worklogs with restricted visibility excluded from the totals (FR34)
**And** every state color is paired with an icon and a tooltip describing the status verbally; nothing communicates state by color alone (NFR12, UX-DR15, UX-DR32)

**Given** dirty detection is implemented in `lib/dirty-detect.ts`
**When** the function runs over a `(user, cycle)` worklog set
**Then** it iterates all worklogs and returns `dirty: true` if any worklog has `updated` timestamp strictly later than the matched approval comment's `at` field
**And** it considers ONLY the approval comment matching this specific `(user, cycle)` — other approvals on the same Epic for different users are ignored (FR41)
**And** if no matching approval exists, the cycle is "unapproved" (not dirty), not red-by-default

**Given** the row has visibility-restricted worklogs that the manager can't see
**When** the row data is fetched
**Then** the row's TanStack Query result carries a `restrictedCount` field
**And** a row-level chip appears next to the person's name: "⚠ N restricted" if any cell has a restricted lock icon
**And** each affected cell shows the lock icon overlay (UX-DR15, FR34)

**Given** `lib/dirty-detect.ts` is a cross-cutting module
**When** the dev runs `pnpm test`
**Then** Vitest tests cover: clean cycle (no dirty), single edited worklog after approval (dirty), worklog created before approval (clean), no-approval-yet (not dirty, unapproved), multi-user worklogs scoped per (user, cycle), partial-cycle approval edge cases

### Story 5.5: Drill-Down Panel — Per-Ticket Evidence with Visibility Warning

As a manager spotting an anomaly,
I want to click a cell and see the report's exact subtasks and hours within that Epic for the cycle,
So that I can investigate without leaving the matrix.

**Acceptance Criteria:**

**Given** the matrix is rendered
**When** the user clicks any data cell
**Then** a slide-in panel enters from the right (200 ms ease-out, UX-DR7) overlaying part of the popup but keeping the matrix visible behind (UX-DR16)
**And** the panel header reads "<Person> · <EpicKey> · <Cycle>" with the cell's total hours below (e.g., "64 hours")

**Given** the drill-down panel is opening
**When** the panel data is fetched
**Then** the panel shows a skeleton list of 3–5 ticket rows initially (UX-DR26)
**And** `GET /rest/api/3/issue/<epicKey>?expand=...` is NOT used; instead, the per-row matrix query already has the worklog records — the panel filters them client-side to the chosen Epic
**And** the resolved data shows a semantic `<ul>` of `<ticketKey> <summary>` + `<hours>h` per subtask the report logged against within this Epic (FR31, UX-DR16, UX-DR32)

**Given** the per-row query detected visibility-restricted worklogs
**When** the panel renders for this Epic and there are restricted entries
**Then** a `VisibilityWarning` chip appears at the bottom of the panel: "⚠ N worklog(s) with restricted visibility were excluded from this view." with a `Tooltip` explaining "<Person> has worklogs with team-restricted visibility on this Epic that you don't have permission to see. This may make the totals appear lower than reality." (FR34, UX-DR16)

**Given** the panel has no tickets for this (Person, Epic, Cycle) combination
**When** the panel renders an empty state
**Then** it shows "No tickets in <EpicKey> for <Person> this cycle." (UX-DR27)

**Given** the panel is open
**When** the user clicks outside the panel OR presses Esc OR clicks the panel's "Close" affordance
**Then** the panel slides out (200 ms ease-out) and the matrix remains visible (UX-DR16 — no navigation away)

**Given** Radix Popover/Dialog primitives are used for focus management
**When** the panel opens
**Then** focus moves into the panel; Tab/Shift+Tab navigate panel content; Esc closes; focus returns to the originating cell on close (UX-DR32 — accessibility)

### Story 5.6: Approve Cycle — Per-Epic Fan-Out Posting of Versioned Comments

As a manager confident in a report's cycle,
I want to click "Approve [Person]" and have versioned-checksum approval comments fan out to every Epic they touched,
So that the cycle is approved atomically without my having to click N times.

**Acceptance Criteria:**

**Given** the matrix is rendered and at least one row has hours
**When** that row's right-side action is rendered
**Then** a row-end primary-tier "Approve <Person>" button appears in brand-purple (FR32, UX-DR17)
**And** the button is disabled if the row is currently approving (in-flight) or if the row is fully empty (no Epics to fan out to)

**Given** the user clicks "Approve <Person>"
**When** an approve-confirm dialog opens
**Then** it shows a one-line summary: "Approve <Person>'s <Cycle>: <H>h across <N> Epics" (UX-DR17, UX-DR30 — informational)
**And** if the row has any restricted-visibility worklogs, an additional line: "⚠ N restricted-visibility worklog(s) excluded from your view; their count will be captured in the approval metadata for audit." (FR35)
**And** the dialog has Cancel (secondary, left) and "Approve" (primary, right) buttons

**Given** the user confirms approval
**When** `lib/approval.ts` runs the fan-out (FR33, AR17)
**Then** for each Epic the report logged hours against during the cycle, a versioned-checksum approval comment is posted via `POST /rest/api/3/issue/<epicKey>/comment` with body produced by `comment-schema.serializeApproval({ v: 1, user: <reportAccountId>, cycle: <cycleId>, by: <currentUserAccountId>, at: <ISO now>, restrictedCount: <count>, checksum: <computed> })`
**And** each comment is posted sequentially through the scheduler (`scheduler.acquire`) to honor rate limits
**And** each post is a separate retryable unit — if Epic 3 of 5 fails, Epic 4 still attempts

**Given** all fan-out posts succeed
**When** the fan-out result is finalized
**Then** the row's cells re-render with "Approved" dark-green status
**And** the matrix progress chip increments ("X of N done")
**And** the "Approve" button is replaced with a small `✓ Done` indicator (UX-DR17)

**Given** some posts fail (e.g., 2 of 5 Epics returned 4xx)
**When** the partial-success result is finalized
**Then** a row-level status chip appears: "Approval partial — N of M Epics confirmed" (UX-DR24 channel 2)
**And** the failed Epic posts enqueue in the outbox (Story 2.7) and retry on connectivity recovery
**And** the cells corresponding to confirmed Epics show "Approved"; cells for failed Epics retain prior state

**Given** the worker has marked the cycle as "PTO" days
**When** the approval fan-out runs
**Then** the catch-all project Epic (parent of the PTO subtask, if any) is included in the fan-out target set if any PTO worklog falls within the cycle (PTO hours are approved like any other hours)

**Given** approval is the same `(user, cycle)` as a prior approval (re-approval; see Story 5.7)
**When** the new comment posts
**Then** the new comment's Jira-native `created` timestamp becomes the new approval anchor by the parser's "newest wins" rule (Story 5.1)
**And** the old approval comment is NOT deleted (FR42 — never deletes); it remains in Jira's timeline for audit

### Story 5.7: Re-Approve Dirty Cycles

As a manager whose report edited a worklog after I approved,
I want a "Re-approve" affordance that supersedes the prior approval with a new comment,
So that the audit timeline reflects the latest approved state.

**Acceptance Criteria:**

**Given** a row has at least one cell in yellow-stripe (dirty) status (Story 5.4)
**When** the row's action area renders
**Then** the row-end action is "Re-approve <Person>" (secondary-tier, not primary, because re-approval is a deliberate corrective action) — replacing the regular Approve button (UX-DR17, FR37)
**And** the button label distinguishes it from initial approval visually

**Given** the user clicks "Re-approve <Person>"
**When** the same approve-confirm dialog opens
**Then** it includes a "Re-approving — supersedes prior approval from <previous approval's `at` ISO>" line in the summary so the manager knows what they're doing (UX-DR17)
**And** the confirmation proceeds identically to Story 5.6

**Given** the re-approval fan-out runs
**When** the new approval comment posts to each touched Epic
**Then** the parser's "newest wins per (user, cycle)" rule (Story 5.1) makes the new comment the authoritative approval anchor on subsequent reads
**And** the dirty-detection re-computes — any worklogs whose `updated` is later than the new `at` would re-flag dirty (typically zero immediately after re-approval)

**Given** the prior approval comment had a different `restrictedCount` than the new one
**When** the new comment is serialized
**Then** the new payload reflects the current `restrictedCount` (audit captures what data was visible at THIS approval moment, not the prior)

**Given** the row has dirty status on some cells but the report has also added new Epics since prior approval (e.g., logged hours on a new Epic)
**When** re-approval fans out
**Then** the new approval comments are posted to ALL Epics the report touched during the cycle — both previously-approved Epics AND new ones (FR33)
**And** the fan-out target set is recomputed at re-approval time, not copied from the prior approval

### Story 5.8: Non-Canonical Manager Read-Only Mode

As a project manager with read access to a teammate's data but no approval authority,
I want to read the manager matrix for them but be told clearly that I cannot approve,
So that I don't accidentally try to approve and so the canonical manager can do their job.

**Acceptance Criteria:**

**Given** the user is viewing the manager matrix
**When** any row is rendered for a report whose canonical manager (their Jira `manager` field) is NOT the current user
**Then** the row's right-side Approve button is rendered in a disabled state in primary-tier visual (`neutral.300` text, `cursor-not-allowed`) (UX-DR17, UX-DR25)
**And** the disabled button has a `Tooltip` (hover-revealed) reading: "Only <Person>'s canonical manager (<Manager-Name>) can approve their cycle. You can read but not approve here." (FR36)

**Given** the current user is the canonical manager of some reports AND a non-canonical reader of others
**When** the matrix renders
**Then** rows where the user IS canonical show enabled Approve / Re-approve buttons
**And** rows where the user is non-canonical show disabled Approve with the tooltip
**And** the matrix as a whole still loads all visible rows; the user reads all freely (FR36)

**Given** a non-canonical reader clicks a cell
**When** the drill-down panel opens
**Then** the drill-down behavior is identical to canonical-manager flow (FR36 — read full evidence)
**And** any "Approve this person's cycle" action inside the drill-down (if such CTAs exist) is similarly disabled with the same tooltip

**Given** `lib/canonical-manager.ts` (or equivalent check inside `manager-resolution.ts`) determines canonicality
**When** the check runs
**Then** for each report's accountId, the check reads the report's `manager` field from Jira's user directory and compares to the current user's accountId
**And** the canonicality result is cached in TanStack Query for the session (refreshes on the same 24-hour TTL as the directory data)

**Given** the user is canonical at the time of matrix load but the report's manager field changes mid-session
**When** the cache refreshes on next popup open after TTL expires
**Then** the canonicality re-evaluates and Approve buttons update accordingly

## Epic 6: Release Polish — Accessibility Audit, Edge Validation, Distribution

The extension is ready to ship internally. The Phase-6 accessibility audit gate (UX-DR34) is executed end-to-end. Edge stable validation pass confirms no Edge-specific regressions on the same MV3 codebase. The `pnpm pack:crx` script + signing-key vault setup produces a versioned `.crx` ready to post to the Microsoft Teams channel. The README is finalized with install + settings reference + troubleshooting.

### Story 6.1: Accessibility Audit Gate — WCAG 2.1 AA End-to-End

As the dev releasing v1.0,
I want every flow audited against WCAG 2.1 AA with the formal Phase-6 checklist passing,
So that we ship without accessibility debt.

**Acceptance Criteria:**

**Given** the codebase has implemented all Epic 1–5 components
**When** the dev runs the automated accessibility scan
**Then** `@axe-core/playwright` (or equivalent CI-suitable harness) runs against the popup, options page, and a mock-injected banner DOM
**And** the scan reports zero violations of WCAG 2.1 AA at the Critical or Serious severity (NFR12, NFR13, UX-DR34)
**And** any Moderate/Minor violations are triaged: each one is either fixed or has a documented justification in `docs/a11y-deviations.md`

**Given** the manual keyboard-only navigation pass is run
**When** the dev unplugs the mouse and executes each major flow
**Then** every interactive element is reachable via Tab in sensible order; Enter activates buttons; Esc closes overlays; arrow keys navigate within Radix primitives (tabs, popovers, selects)
**And** the visible focus ring (2 px `accent.DEFAULT` with 2 px outline-offset) is visible on every focusable element (NFR13)
**And** the major flows covered are: First-run OAuth connect → Today log → Week submit (with gap dialog) → Manager approve → Manager drill-down → Banner contextual log

**Given** the manual screen-reader pass is run
**When** the dev exercises the major flows with NVDA on Windows and VoiceOver on macOS
**Then** popup/dialog open/close events are announced; tab changes are announced; badge updates are announced via `aria-live="polite"`; errors are announced via `aria-live="assertive"` (UX-DR32)
**And** every icon-only button has an `aria-label`; every state cell has an `aria-label` that includes the status verbally; every list is semantic `<ul>` / `<ol>`; every grid is semantic `<table>` with `scope` attributes

**Given** color-blindness simulation is run
**When** Chrome DevTools "Emulate vision deficiencies" cycles through Protanopia, Deuteranopia, Tritanopia, and Achromatopsia
**Then** every state cell (red/green/yellow-stripe/lock/approved) remains distinguishable via icon + label even when color is fully suppressed (NFR12, UX-DR15)

**Given** reduced-motion is emulated
**When** DevTools rendering settings → `prefers-reduced-motion: reduce` is enabled
**Then** all transitions ≥ 100 ms collapse to instant changes (popup mount fade, cell color, banner slide, list-item slide, dialog open, matrix-row stagger)
**And** the skeleton shimmer becomes a static neutral fill (UX-DR33)

**Given** browser zoom is set to 200% in Chrome
**When** the dev navigates the popup and options page
**Then** no layout breaks; popup may need vertical scroll (acceptable); options page content remains within `max-w-2xl` and readable; all interactive elements remain reachable

**Given** high-contrast OS mode is enabled (macOS "Increase contrast" / Windows "High contrast")
**When** the dev opens the extension surfaces
**Then** focus indicators remain visible (not suppressed by the OS-level high-contrast theme)
**And** all body text remains readable

**Given** the full audit checklist from the UX spec (UX-DR34) is executed
**When** all items in the Accessibility Review Checklist pass
**Then** a release-gate document `docs/a11y-audit-<date>.md` is committed marking pass / fail per item with notes

### Story 6.2: Edge Browser Validation

As the dev releasing v1.0,
I want every flow validated on Edge stable in addition to Chrome stable,
So that Edge users (a primary target) get the same experience.

**Acceptance Criteria:**

**Given** the codebase produces a `.output/edge-mv3/` build via `pnpm build --browser edge`
**When** the build runs
**Then** the build succeeds with no Edge-specific errors or warnings
**And** the resulting `.output/edge-mv3.zip` is sideloadable in `edge://extensions` with Developer Mode enabled

**Given** the Edge build is installed
**When** the dev exercises each major flow (same set as Story 6.1)
**Then** every flow works identically to Chrome stable — OAuth, popup rendering, content-script banner injection on `*.atlassian.net` pages, daily notification, badge update
**And** no Edge-specific regressions are observed (e.g., subtle CSP differences, alarm timing variances, content-script injection differences)
**And** any discrepancies are filed as bugs and resolved before release

**Given** the dev validates the inline banner on Edge
**When** the banner is injected into Jira pages on Edge
**Then** the banner renders correctly with inline styles (no external font loads, no `blob:` URLs), SPA-aware re-injection works on Jira's router navigation, daily-dismiss persists across page reloads

**Given** notifications fire on Edge
**When** the daily reminder alarm runs
**Then** the notification renders with the brand logo and clicking opens the popup pre-warmed (identical to Chrome behavior)

**Given** OAuth runs on Edge
**When** `chrome.identity.launchWebAuthFlow` (Edge's `browser.identity` equivalent) opens
**Then** the flow completes successfully and tokens persist to `chrome.storage.local`

### Story 6.3: CRX Packaging Script & Signing Key Vault

As the dev distributing v1.0,
I want a `pnpm pack:crx` script that converts the WXT output to a signed `.crx` ready for Microsoft Teams,
So that releases take one command and the signing key stays safe.

**Acceptance Criteria:**

**Given** the team has set up a signing key for the extension (one-time)
**When** the key is generated
**Then** a `jira-time-logger.crx.pem` file is created via Chrome's `--pack-extension` flag (one-line) on the dev's local machine
**And** the `.pem` is stored in a private team vault (1Password vault, private team-only repo, or equivalent) — NEVER committed to the public source repo (AR30)
**And** `docs/release.md` documents where the key lives and how to retrieve it for a release

**Given** the dev wants to package a release build
**When** the dev runs `pnpm pack:crx`
**Then** the script (a Node script declared under `scripts` in `package.json`) runs `pnpm build`, then invokes Chrome (located via env var `CHROME_PATH` or platform-typical paths) with `--pack-extension=.output/chrome-mv3 --pack-extension-key=<path-to-signing-pem>` to produce `jira-time-logger-<version>.crx`
**And** the same flow runs for Edge: `jira-time-logger-edge-<version>.crx` (Edge supports the same `.crx` format)
**And** `<version>` is read from `package.json` so each release artifact is uniquely named

**Given** the signing key is missing or unreadable
**When** the pack:crx script runs
**Then** it fails fast with a clear message: "Signing key not found at <path>. Retrieve from the team vault before packaging — see docs/release.md."
**And** does not produce an unsigned `.crx`

**Given** subsequent releases use the same key
**When** the team upgrades from v1.0 to v1.1
**Then** Chrome recognizes the v1.1 `.crx` as an update to the existing extension (same key → same extension ID) and users do not see a duplicate install

**Given** the dev wants to verify the produced `.crx`
**When** the script completes
**Then** it prints the file size, extension ID (derived from the public key), and version
**And** the dev can sideload the produced `.crx` into Chrome / Edge developer mode and verify the extension loads correctly

### Story 6.4: README & Release Documentation Finalization

As a team member installing v1.0,
I want a clean README with install instructions, settings reference, and a top-3 troubleshooting list,
So that I can get up and running without asking the author.

**Acceptance Criteria:**

**Given** the repo has implemented all features
**When** the dev finalizes `README.md` at the repo root
**Then** the README contains these sections in order (AR31):
  1. **What it is** — one-paragraph elevator pitch (lifted from PRD's Executive Summary)
  2. **Install (Chrome & Edge)** — step-by-step: download `.crx` from Teams, enable Developer Mode in `chrome://extensions` (or `edge://extensions`), drag-and-drop the `.crx`, accept the install prompt
  3. **First-run setup** — click "Connect to Jira", complete OAuth, set catch-all project + PTO subtask + reminder time + target hours (links to relevant Settings sections)
  4. **Settings reference** — a table of every settings field with its purpose, default, and where it appears (manager auto-detection note: read-only from Jira)
  5. **Troubleshooting** — top 3 issues: (a) "Manager not set in Jira" notice → contact admin; (b) badge not updating → check connectivity and last-sync diagnostic; (c) approval comment looks corrupted → fail-closed parser behavior + how to recover (re-approve)
  6. **For developers** — link to architecture.md + PROTOCOL.md + the WXT/Vitest/ESLint/build commands
  7. **Privacy & data** — one paragraph: no third-party telemetry, data lives only between browser and Jira/Atlassian (NFR9)

**Given** `PROTOCOL.md` was authored in Story 5.1
**When** the README references it
**Then** the README links directly to `PROTOCOL.md` and indicates it is the authoritative cross-version contract for approval comments

**Given** the docs directory contains the audit artifacts
**When** the README links to `docs/release.md`, `docs/a11y-audit-<date>.md`, and `docs/a11y-deviations.md`
**Then** all referenced files exist and contain the documented content

**Given** the readme is finalized
**When** the dev posts the v1.0 `.crx` to the Microsoft Teams channel
**Then** the Teams message includes: the `.crx` attachment, a one-line description, and a link to the README in the source repo for install steps
**And** at least one teammate validates the install path by following the README from scratch on their machine
