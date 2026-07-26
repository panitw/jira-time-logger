## Deferred from: code review of 5-8-non-canonical-manager-read-only-mode (2026-06-27)

- Canonical-manager fetch fires for empty (zero-hours) rows whose Approve is already disabled by `isEmpty` — N extra `GET /rest/api/3/user?expand=manager` calls per popup open with no UI effect. Spec Task 3 prescribes the unconditional `useCanApprove(report.accountId, managerAccountId)` call; row emptiness is only known after the per-row epics query resolves. Pure efficiency; no correctness impact; out of scope for this story. [components/manager/ManagerMatrix.tsx:478]
- Transient canonicality lookup error renders the definitive non-canonical tooltip (with the "their manager" fallback) to what may be the real canonical manager, rather than a "couldn't verify" message. Behavior (disabled) is safe and spec-mandated fail-closed (AC5); distinguishing the error case from a true permission denial is a product/UX copy decision and a spec deviation. Revisit if users report confusion. [components/manager/ManagerMatrix.tsx:634]

## Deferred from: code review of 5-2-modetoggle-worker-manager-tab-in-popup (2026-06-27)

- `isCachedShape` validates only `Array.isArray(reports)`, not element shape, so a malformed/legacy cache entry could pass through junk `DirectReport` objects. No impact today (only writer is the typed `setCachedDirectReports`; `hasDirectReports` reads only `.length`). Add element-shape validation when Story 5.3's matrix consumes `accountId`/`displayName`. [lib/storage/direct-reports.ts:33]
- `findDirectReports` does not dedupe by `accountId`; a federated/duplicate directory entry would yield duplicate report rows (and cache them for 24h). `hasDirectReports` is unaffected (length only); matters for Story 5.3's matrix rows. [lib/manager-resolution.ts]
- `Promise.all([approvalCycleItem.getValue(), hasDirectReports()])` couples a cadence-read failure to Manager-tab visibility — an unrelated storage hiccup on the cadence item hides the tab. Low value to decouple: `hasDirectReports` never rejects and the cadence read has a fallback; worst case still fails closed to worker mode. [entrypoints/popup/App.tsx:87]
- Redundant `as JiraUser` cast on an already-typed `jiraGet` result; cosmetic, matches the existing `resolveReportingLine` style in the same module. [lib/manager-resolution.ts:165]
- OPEN ENDPOINT DECISION (from the story's own "DECISION REQUIRED"): `findDirectReports` via `GET /rest/api/3/user/search?query=` + per-candidate `?expand=manager` may reject an empty query, returns only the first ~50 directory users (so reports outside that window silently hide the tab), and can issue ~50 serial scheduler calls on a cold cache. Accepted as best-available REST v3 fail-soft, isolated in one swappable Zod-validated function. Revisit with a Teams/org-directory endpoint. [lib/manager-resolution.ts:131]

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

## Deferred from: code review of story-5.3 (2026-06-27)

- Pagination cap: `fetchReportCycleWorklogsByEpic` issues the report-scoped search with `maxResults=100` and no `startAt` loop; a report logging on >100 distinct subtasks in a cycle is silently truncated, undercounting that report's matrix totals. Identical to the sibling `fetchCurrentUserWeekWorklogsByIssue` the spec mandated cloning — a project-wide pre-existing pattern. Fix cross-cutting (both fetchers + the per-issue `/worklog` page) rather than in 5.3. [lib/jira-client.ts:633]
- Worklog with a missing `started` field is retained unconditionally (the date-window guard is skipped), so a record lacking date proof could enter a cycle total. Cloned faithfully from the sibling fetcher; backstopped only by the JQL `worklogDate` filter and the endpoint `startedAfter/Before` params. Pre-existing pattern. [lib/jira-client.ts:681-686]
- Subtask→Epic rollup walks exactly ONE level up (parent→grandparent = Epic), ignoring the fetched `issuetype`. Deeper or mixed-depth hierarchies (Epic→Initiative→Story→Subtask, or worklogs logged directly on a Story) bucket under the wrong key and can fragment one Epic's hours across multiple columns. This is the documented DECISION-REQUIRED "bucket don't drop" tradeoff — hours are never lost, audit integrity holds — but a column may be an Initiative/Story rather than a true Epic. Confirm intended hierarchy depth before Story 5.4 consumes these columns. [lib/jira-client.ts:599]

## Deferred from: code review of story-5.7 (2026-06-27)

- Supersede line picks the FIRST non-empty approval anchor among touched Epics, not the newest, when multiple dirty Epics carry different `at` values. Cosmetic + spec-sanctioned (Dev Notes accept "any dirty cell's `approvalAt`"; the line never blocks re-approval). The displayed timestamp is informational only. [components/manager/ManagerMatrix.tsx:540-544]
- A partial re-approve renders the terminal "Approval partial — N of M" chip and removes the re-approve button until the subject (user/cycle) changes, even though the no-retry tooltip advises re-approving. Pre-existing Story 5.6 partial-chip behavior; AC5 mandates reusing 5.6 handling unchanged. Recovery-affordance ergonomics are a 5.6 concern. [components/manager/ApproveButton.tsx:232-244]
- `cellStatuses`/`cellAnchors` lift maps are set-only and never prune entries for Epics that leave the union columns. 5.7 only mirrored the pre-existing `cellStatuses` set-only pattern into a new `cellAnchors` map; derivations read only `touchedEpics` keys. A stale anchor could resurface only via a column-shrink-then-regrow-before-remount race — theoretical, not introduced by this change. [components/manager/ManagerMatrix.tsx:491-507]

## Deferred from: code review of story-6.1 (2026-06-27)

- TicketPicker `tree` role is structurally valid but keyboard-incomplete: no Left/Right arrow collapse-expand and no `aria-level`/`aria-setsize`/`aria-posinset` on treeitems. Not a regression — the listbox→tree remodel preserved the existing roving Up/Down navigation and Enter-to-select. Full WAI-ARIA tree keyboard semantics are an accessibility enhancement beyond Story 6.1's gate scope. [components/today/TicketPicker.tsx]

## Deferred from: code review of story-7.4 (2026-07-26)

- Truncation line off-by-one: when a search returns *exactly* `MAX_RESULTS` matches, the "showing the first N" line renders even though nothing was actually truncated. Fails in the safe direction (over-warns rather than silently hiding results, so D-7.4-14's "never a silent cap" rule still holds). A correct fix means over-fetching `MAX_RESULTS + 1` and slicing — a wire-contract change judged not worth reopening the story for. **No story owns this**; pick it up in 7.5 or a dedicated follow-up if it becomes user-visible. [hooks/useTicketSearch.ts, components/today/SearchPanel.tsx]

## Deferred from: code review of story-7.6 (2026-07-26)

### `status-clean` and `state-success` are the same hex — a latent trap for any future story composing a `status-*` token inside a `state-*` surface

**Where:** `styles/globals.css` — `--color-status-clean: #15803d;` and
`--color-state-success: #15803d;` are byte-identical.

**What happened because of it (Blocker 1/2, this story):** `ManagerMatrix.tsx`
routed `approved`/`on-target` cells through `DayStatusIndicator`, whose
`text-status-clean` collided with the `<td>`'s own `bg-state-success` at a
measured **1.00:1** — invisible white-on-green text. Fixed by reverting those
cells to a bare number (D-7.6-41/42) rather than by deduplicating the tokens,
per that decision's explicit instruction.

**Why not deduplicated here:** `status-clean` and `state-success` are two
different AXES (day-status vocabulary vs. matrix `CellStatus`) that happen to
share a value today. Merging them into one token would be a `styles/`
foundation change affecting every consumer of either name, which is out of
this story's scope (a copy-and-vocabulary story, not a token-layer
refactor).

**Recommended follow-up:** the next story that composes a `status-*` token
inside a `state-*`-coloured surface (or vice versa) should check contrast by
hand first — the axe harness cannot catch this class of failure (jsdom has no
`color-contrast` rule support), and a shared hex behind two differently-named
tokens is exactly the trap that produced this story's Blocker.

### `restricted` on an `approved` cell measured ~1.05:1 — **RESOLVED, D-7.6-49** (was recorded here as deferred; the deferral was overruled)

**Where:** `components/manager/ManagerMatrix.tsx` — `MatrixCell`'s `locked`
branch renders `<DayStatusIndicator variant="inline" status="restricted" />`,
which unconditionally used `text-faint` (`#6B6B72`). This rendered correctly
against every OTHER cell background (`bg-state-success-subtle`,
`bg-state-warning-subtle`, plain white) but is independent of `status` — so
an `approved` cell (`bg-state-success`, `#15803D`) that ALSO had
`restrictedCount > 0` paired `text-faint` on `#15803D`, hand-computed at
**~1.05:1** — essentially invisible, the same failure class as Blocker 1.

**Why this was originally deferred, and why that was wrong:** the finisher's
first pass reasoned this needed either a new on-dark-surface token or a
structural change belonging to Story 7.8's chip restyle, and deferred it
rather than guess. **D-7.6-49 overruled the deferral**: this is a regression
Story 7.6 itself introduced (pre-story the overlay was a bare, `aria-hidden`
`Lock` icon inheriting the `<td>`'s ambient `text-white`, at **5.02:1**), and
the epic's standing constraint — no story may regress WCAG 2.1 AA — is a hard
gate that cannot ship deferred, regardless of which future story "owns" the
eventual, fuller redesign.

**The fix, in 7.6 (D-7.6-49 part 1):** `DayStatusIndicator` gained a third
`tone` value, `'chrome-solid'` (full-opacity `text-white` — the SAME white
already used throughout `ChromeHeader.tsx`, zero new hex/token; distinct from
`tone="chrome"`'s 85%-opacity variant, which was calibrated for the purple
gradient and measures only ≈4.09:1 against this much darker green — not
enough). `ManagerMatrix.tsx`'s restricted overlay now passes
`tone={status === 'approved' ? 'chrome-solid' : 'data'}` — scoped to the one
cell background (`approved`, the only DARK fill in the matrix) that actually
needs it; every other cell's `text-faint` default already clears AA there.
Restored to **5.02:1** (hand-computed, full white on `#15803D`), matching the
pre-story value exactly. Pinned by two new `ManagerMatrix.test.tsx` tests
(approved+restricted renders `text-white`, not `text-faint`; a non-approved
restricted cell keeps the default `text-faint`) — both RED-proved by
reverting the `tone` override and confirming the pinning test fails.

**Still owned by Story 7.8 (D-7.6-49 part 2, unchanged from the original
note):** the DESIGNED restricted chip, per `imports/jira-time-logger.dc.html:534`
— its own `#F4F4F7` background, `#E4E3EC` border, `#6B6B72` text,
`border-radius:5px`, `padding:3px 7px`. That chip carries its own light
background, so it never sits directly on the cell fill and the `tone`
workaround becomes unnecessary — 7.8 should remove
`tone="chrome-solid"`/the `status === 'approved'` conditional once the real
chip ships. **Also noted for 7.8 from the same design source:** approval is a
row-level property there (`:571`, a green `✓ approved` label) and matrix
cells are plain numbers (`:852-858`) — there is no green cell fill for
`approved` at all in the design. The current `bg-state-success` fill is
pre-existing Epic 5 code for 7.8's restyle to reconcile.

**The underlying cause remains open:** the duplicate-hex trap above
(`status-clean` == `state-success` == `#15803D`) is still what makes ANY
`text-status-clean`/AC3-vocabulary colour collide with this cell's fill.

### `variant="stacked"` (Finding 11) — two shape defects — **RESOLVED, Story 7.7 / D-7.7-29**

Story 7.7 gave `variant="stacked"` its first real call site (`WeeklyGrid.tsx`'s
`TotalsCell`, D-7.7-23's 104px column) and fixed both defects against it: the
wrapper is now `flex w-full` (container-relative, not siblings-relative), and
`pctToWidthClass` uses `Math.floor` + a non-zero floor (97.6% no longer reads
`w-full`; 2.4% no longer reads `w-0`). Both RED-proved live. The story's own
finisher pass additionally caught and fixed a THIRD copy of the exact same
quantisation defect, freshly introduced in the same story's new
`WeekChromeHeader.tsx` (review Finding 1 / D-7.7-21c) — see that entry below.

Original deferral text, kept for history:

**Where:** `components/shared/DayStatusIndicator.tsx`'s `stacked` branch.

1. **Bar width is siblings-relative, not container-relative.** The wrapper is
   `inline-flex flex-col items-end`, so `w-full` on the bar resolves to the
   width of the widest sibling LINE (value+icon, or the note text) — the
   same `percent` renders a different pixel length depending on how long the
   note is that render.
2. **Quantisation rounds to the extremes too eagerly.** `Math.round(pct / 5)`
   maps 97.6% → `w-full` (looks done) and 2.4% → `w-0` (looks empty).

**Why not fixed here:** `WeeklyGrid.tsx`'s `TotalsCell` uses `variant="inline"`
exclusively — `stacked` is exercised only by this story's own unit tests, not
by any real layout. Fixing the width defect blind, without Story 7.7's actual
totals-cell container to lay it out against, risks guessing wrong and
shipping a DIFFERENT bug into the "frozen" D-7.6-3 contract. The fix is
cheap (a definite width on the wrapper; `Math.floor` + a non-zero floor
instead of `Math.round`) but needs a real consumer to verify against.

**Recommended follow-up:** Story 7.7, which is the first real consumer of
`variant="stacked"`, must give it a real call site early and verify the bar
renders a consistent, correctly-quantised length before treating the
contract as final.

### No `size` prop (Finding 17) — **RESOLVED, Story 7.7 / D-7.7-30**

Story 7.7's AC4 pinned the concrete value (11px, the time-off/totals-row
glyph): `size?: 11 | 12 | 13` was added to `DayStatusIndicatorProps`
(`ICON_SIZE = 12` stays the default) AND to D-7.6-3's canonical block in
`epic-7-decision-log.md`, per the obligation D-7.7-30 itself states. Verified
by the code review: the log and the code no longer disagree.

Original deferral text, kept for history:

**Where:** `components/shared/DayStatusIndicator.tsx` — `ICON_SIZE = 12` is a
module constant, not a prop.

Story 7.7's AC requires an 11px filled `Diamond` for time-off cells; Story
7.8 needs its own chip geometry. Not added speculatively in this pass — the
concrete sizes needed aren't yet pinned down by an AC this story owns, and
guessing a `size?: 11 | 12 | 13` union without a confirmed consumer risks
picking the wrong shape for the "frozen" contract twice.

**Recommended follow-up:** add `size` to `DayStatusIndicatorProps` (and to
D-7.6-3's canonical block in `epic-7-decision-log.md`) the moment 7.7 or 7.8
needs it, with the real value pinned by that story's own AC.

### `categorize()`'s prefix match (Finding 25) — pre-existing, unrelated to this story's scope

**Where:** `lib/week-grid.ts`'s `categorize()` —
`key.startsWith(ptoSubtaskKey)` is a PREFIX match, not equality. A time-off
subtask `KKP-123` would also swallow ordinary work logged to `KKP-1234` as
`'pto'` category.

**Why not fixed here:** pre-existing (not introduced by Story 7.6), and this
story's `dayStatusFor` now gives `timeOffSeconds > 0` absolute precedence
(D-7.6-6), which makes the existing bug's blast radius larger than before —
a suppressed `attention` status and a false "time off" claim on a day that
was actually just mis-categorised work. Still out of scope: fixing a
categorisation bug inside a copy-and-vocabulary story is exactly the kind of
scope leak this epic has been burned by (see `epic-7-decision-log.md`'s
Story 7.4 `TicketPicker` scrolling regression, and the JQL-widening leak).

**Recommended follow-up:** change the match to `key === ptoSubtaskKey` or
`key.startsWith(ptoSubtaskKey + '-')`. Cheap, but needs its own story/PR so
the fix is attributable and tested in isolation.

### `lib/week-gaps.ts:61` — a half-day-off week can be marked done while genuinely short — **RESOLVED, Story 7.7 / D-7.7-27/D-7.7-19/D-7.7-20**

Closed by deleting the `if (ptoDays[i]) continue` guard (D-7.7-27/D-7.7-19):
`dayTotalsSeconds` already sums time-off seconds with no category filter, so
the guard was redundant for a full day off and actively wrong for a half day
off. RED-proved against all three truth-table cases (full day off → not a
gap; half day off → a gap, 4h short; half day off + work → not a gap). The
fix newly surfaced a SECOND, more subtle defect the code review caught: a
near-full time-off booking under target (e.g. 7.5h against an 8h target)
printed the false "Half-day time off" note. Closed by an owner ruling,
D-7.7-20 — the GAP rule stays uniform (any day below target is a gap, no
exemption), but `dayStatusNote`'s time-off branch gained a fourth arm so
"half-day" is reserved for an actual half booking and any other under-target
amount states the real hours + shortfall. See `lib/day-status.ts`'s
`dayStatusNote` for the code.

Original deferral text, kept for history:

**Where:** `lib/week-gaps.ts`'s `computeWeekGaps` — `if (ptoDays[i]) continue`
treats ANY time-off seconds that day as "not a gap," so a 4-hour half-day off
(with nothing else logged) lets the week be marked done while genuinely 4
hours short of target.

**Why not fixed here:** D-7.6-38 (owner/orchestrator ruling) explicitly
assigned this to Story 7.7, which owns the gap dialog and the mark-done write
path — a write-path change inside a copy-and-vocabulary story is out of
scope by design. Recorded here again as the consolidated deferred-work
tracking point; the code-level pointer lives in `lib/week-gaps.ts`'s own
comment above `ptoDays`.

**Owner:** Story 7.7 — must close it or explicitly re-defer with a reason.

## Deferred from: code review of story-7.7 (2026-07-26)

- **Three copies of the chrome progress-bar quantisation logic, one shared helper needed.** `ChromeHeader.tsx` (popup, pre-existing), `WeekChromeHeader.tsx` (new this story), and `DayStatusIndicator.tsx`'s `stacked` branch each keep their own `pctToWidthClass`/width-table pair. This story's finisher pass fixed the `WeekChromeHeader.tsx` copy's quantisation defect (review Finding 1) but deliberately did NOT extract a shared helper or touch the popup's `ChromeHeader.tsx:50-53`, which carries the identical latent `Math.round` bug — per owner ruling D-7.7-21c, a shared-seam refactor at finisher stage is how this epic got burned three times (7.2 TicketPicker, 7.4 JQL leak, 7.6 over-applied indicator). **Owner: Story 7.9**, which already owns the popup chrome states — it is hereby obliged to extract the shared helper and fix the popup's pre-existing instance as part of that work, so a fourth uncoordinated copy never appears. **UPDATE (Story 7.8):** a FOURTH copy now exists, `lib/progress-width.ts` (D-7.8-19a) — created deliberately, per an explicit owner ruling, as the module the other three should migrate ONTO rather than a new uncoordinated copy. Story 7.9's obligation is therefore "migrate all three existing copies onto `lib/progress-width.ts`" (already tested, already correct — `Math.floor` + non-zero floor), not "extract a new helper from scratch." [components/shell/ChromeHeader.tsx:50-53, components/week/WeekChromeHeader.tsx, components/shared/DayStatusIndicator.tsx, lib/progress-width.ts]

## Deferred from: code review of story-7.8 (2026-07-26/27)

### The per-issue `/worklog` page cap — a THIRD sibling of the D-7.8-20 pagination fix, not yet closed

**Where:** `rest/api/3/issue/{key}/worklog?startedAfter=…&startedBefore=…` — called with no `maxResults`/`startAt` loop from THREE call sites: `fetchCurrentUserWeekWorklogs` (`lib/jira-client.ts`, badge/banner), `fetchCurrentUserWeekWorklogsByIssue` (week grid), and `fetchReportCycleWorklogsByEpic` (manager matrix).

**What D-7.8-20 fixed and what it didn't.** The review's Blocker was the OUTER `/search/jql` page cap silently undercounting which subtasks a report touched — fixed by real token-pagination (`fetchAllSearchPages`, shared by the week-grid and matrix fetchers). This INNER endpoint — the per-issue worklog list for each of those subtasks — is a **different, unpaged** endpoint. Jira's default page size here is large (thousands), so a single subtask with an implausibly high worklog count in one cycle window could still silently truncate. Judged genuinely trivial to leave unfixed for THIS story (D-7.8-20's explicit instruction: fix it "only if genuinely trivial; otherwise record it in `deferred-work.md` with a named owner") because it is a SECOND pagination shape (offset `startAt`/`total`, not token `nextPageToken`) that doesn't fit the same shared helper, and a per-issue worklog count anywhere near the default page size in one cycle is far less likely than the outer search hitting 100 distinct subtasks — but it is the same CLASS of silent-undercount risk the review was about, so it is not waved away either.

**Owner:** the next story that touches `lib/jira-client.ts` — it MUST be paged before the product's manager-matrix / week-grid totals are considered fully correct, mirroring how D-7.8-20 paged the outer search. [lib/jira-client.ts — three call sites of the per-issue `/worklog` GET]

### `fetchCurrentUserWeekWorklogs` (the flat badge/banner sibling) still carries the SAME `/search/jql` cap D-7.8-20 fixed on its two siblings

**Where:** `lib/jira-client.ts#fetchCurrentUserWeekWorklogs` — used by the toolbar badge (Story 3.1) and the inline Jira banner (Story 3.3).

**Why not fixed here.** D-7.8-20's explicit scope was `fetchReportCycleWorklogsByEpic` and `fetchCurrentUserWeekWorklogsByIssue` — the two fetchers whose disagreement would show up as the week grid and the manager matrix reporting different hours for the same person. The flat sibling was deliberately left out to keep the change scoped to those two named consumers; it does not feed either surface that story's Blocker was about. It is, however, the SAME defect (`maxResults=100`, no `nextPageToken` follow-up) and could now silently undercount a badge/banner figure the OTHER two surfaces (post-7.8) get right.

**Owner:** the next story touching `lib/jira-client.ts` — page it onto the SAME `fetchAllSearchPages` helper the other two now use; do not write a third bespoke loop. [lib/jira-client.ts#fetchCurrentUserWeekWorklogs]

### D-7.8-3's verdict, updated: the duplicate-hex trap survives Story 7.8 but loses its only live victim

**Where:** `styles/globals.css` — `--color-status-clean: #15803d;` and `--color-state-success: #15803d;` remain two tokens with the same value. This is the SAME trap recorded under "code review of story-7.6" above; recording the Story 7.8 update here rather than re-litigating it.

**What changed in Story 7.8.** The trap only bites when a `status-*` token composes INSIDE a `state-*`-coloured surface — and Story 7.8 deleted the only such surface. `ManagerMatrix.tsx`'s `STATUS_CLASSES`/cell fills are gone entirely; no matrix cell has a `state-*` background any more (D-7.8-4: `lib/manager-matrix.ts` stayed frozen; the collapse was a render-layer-only change). The row-level `✓ Approved` label sits on white (5.02:1, hand-computed); the restricted chip sits on its own `#F4F4F7` (4.81:1) regardless of what's behind it. **The trap survives in `globals.css` but has no live victim today.**

**Owner:** still open — the next story that composes a `status-*` token inside a `state-*`-coloured surface (or vice versa) must hand-compute contrast first; the axe harness cannot catch this class of failure. No target story identified yet; flag it the moment one appears rather than waiting for a dedicated token-dedup story.
