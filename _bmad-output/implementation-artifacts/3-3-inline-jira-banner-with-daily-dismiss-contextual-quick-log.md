---
baseline_commit: 1bac1d2
---

# Story 3.3: Inline Jira Banner with Daily Dismiss & Contextual Quick-Log

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a worker who visits Jira pages many times a day,
I want a thin banner at the top of Jira showing my unlogged hours, with a one-click contextual quick-log when I'm on a subtask page,
so that discovery and resolution of gaps happen inside my existing workflow.

This is the LAST story of Epic 3. It delivers the third of the three coordinated daily-surface signals (badge + push + banner). It introduces the extension's FIRST content script — a vanilla-DOM, CSP-safe banner injected into `*.atlassian.net` pages.

## Acceptance Criteria

1. **Content script wakes & checks daily-dismiss (FR18, AR33).**
   Given the user has navigated to any `https://*.atlassian.net/*` page,
   When the content script (`entrypoints/content.ts`, registered via WXT `defineContentScript` with `matches: ['https://*.atlassian.net/*']`) runs,
   Then it reads today's dismissal state via `lib/storage/banner-dismiss.ts` (a date-keyed `string[]` of dismissed `YYYY-MM-DD` dates),
   And if today's date is in the dismissed list, NO banner is injected (and no `banner-state` request is sent).
   And the injection is IDEMPOTENT — running again (re-injection, multiple frames) never produces two banners (guard on a stable host-element id, e.g. `jira-time-logger-banner-root`).

2. **Request state from SW; no banner when caught up (FR17).**
   Given the banner is not dismissed today,
   When the content script requests current state from the service worker via a `banner-state` request,
   Then the SW returns `{ hoursMissing: number, currentTicket?: string }` where `hoursMissing` is the SAME current-week deficit the badge computes (reuse `lib/badge.ts`) and `currentTicket` is the issue key parsed from the page URL pattern `/browse/<KEY>` (undefined if not on a `/browse/` page),
   And if `hoursMissing <= 0` (rounds to 0 — same `Math.round(deficit) >= 1` threshold the badge uses), NO banner is injected.

3. **Collapsed banner rendering — non-subtask page (UX-DR19, UX-DR7, AR32, NFR11 CSP-safe).**
   Given `hoursMissing > 0` and the user is NOT on a specific subtask `/browse/<KEY>` page,
   When the banner is injected,
   Then a collapsed banner slides in from the top of Jira's content area (200 ms ease-out per UX-DR7), 100% width × ~56 px tall, anchored to the top, with:
   - a small brand-purple `●` dot (`accent.DEFAULT` `#6b5b95`) — the ONLY brand mark, no logo (UX-DR19, banner is a guest in Jira's UI),
   - banner background `accent.subtle` `#e9e6f3`,
   - "`<Xh>` unlogged this week." text in `neutral.700` `#334155` (X = rounded whole hours; honest past-tense register — never "You're behind!" UX-DR30),
   - an "Open extension" tertiary CTA on the right that opens the popup (`chrome.action.openPopup()` via an SW message; tertiary/ghost style `neutral.500` text, no border),
   - a `✕` dismiss icon with `aria-label="Dismiss for today"`,
   And ALL styling is applied as inline `style` properties sourced from `lib/banner-styles.ts` — NO Tailwind classes, NO external fonts, NO external loads (AR32 / CSP-safe; uses fixed pixel sizes).

4. **Contextual CTA appears on a subtask page (FR19, UX-DR19, UX-DR32).**
   Given `hoursMissing > 0` AND the user IS on a `/browse/<KEY>` page (and `currentTicket` is set),
   When the banner renders,
   Then an additional contextual CTA appears: "Log time on `<KEY>`" as a brand-purple (`accent.DEFAULT`) button,
   And the banner root has `role="region" aria-label="Time-tracking banner"` (UX-DR32).

5. **Contextual CTA expands an inline quick-log, posts via SW (FR14, FR19, UX-DR19).**
   Given the contextual CTA is visible,
   When the user clicks "Log time on `<KEY>`",
   Then the banner expands IN PLACE (~120 px tall) to show a pre-focused hours input (`aria-label="Hours to log on <KEY>"`) and a primary "Log" button,
   And the hours input uses the SAME Jira-flexible parser as Story 2.4 — reuse `parseHours` + `MAX_HOURS_PER_ENTRY` + `hoursToSeconds` from `lib/hours.ts` (formats `2.5`, `2.5h`, `2h 30m`, `2:30`, `150m`); on unparseable / `> 24h` show the inline error "Use formats like 2.5h, 2h 30m" / the over-limit message, reverting to collapsed after error display,
   And pressing Enter or clicking "Log" submits via a `log-worklog` request to the SW for the current ticket dated TODAY — the IDENTICAL write pathway as popup logging (the SW handler calls `postWorklog`, enqueues the outbox on `network`/`rate-limited`, and re-broadcasts `badge-update`),
   And on success the banner briefly shows a `✓` then collapses (200 ms slide-up); the page returns to normal; no popup opens.

6. **Daily dismiss (FR18, UX-DR30).**
   Given the user clicks the `✕` dismiss,
   When the dismiss handler runs,
   Then today's date (`YYYY-MM-DD`) is appended to `lib/storage/banner-dismiss.ts` (deduplicated; no confirmation dialog),
   And the banner slides up (200 ms) and is removed from the DOM,
   And the banner does NOT return for the rest of today on any Jira page, but returns automatically on the next calendar day's first Jira page visit (if hours are still owed).

7. **SPA-aware re-injection (AR33).**
   Given Jira's SPA router navigates in-tab (no full page reload),
   When the URL changes,
   Then a `popstate` listener AND a `MutationObserver` (idempotent) detect the navigation,
   And the banner re-evaluates: re-injects if today's dismissal state allows and `hoursMissing > 0`; updates the contextual ticket key if the new page is a different subtask; collapses/removes the contextual CTA if the new page is no longer a `/browse/<KEY>` page,
   And re-evaluation never stacks duplicate banners (idempotent guard, AC #1) and debounces rapid SPA mutations.

8. **Passive surface — auth-expired / disconnected = no banner.**
   Given the user is signed out of Jira or the token is revoked,
   When the content script requests state and the SW returns an `auth-expired` (or disconnected / no-data) result,
   Then NO banner is injected — the banner is a passive surface; it does NOT surface auth errors (re-auth UX is the popup's job per Story 2.1),
   And the SW attempts no fetch when disconnected (reuse the badge's disconnected gate).

9. **`prefers-reduced-motion` honored (UX accessibility).**
   Given the user's OS sets `prefers-reduced-motion: reduce`,
   When the banner is injected/dismissed/collapsed,
   Then all transitions ≥ 100 ms (the 200 ms slides) are replaced with instant changes (check `window.matchMedia('(prefers-reduced-motion: reduce)').matches`).

10. **Test coverage (cross-cutting modules + parseable content-script logic).**
    Given the banner introduces new cross-cutting modules,
    When the dev runs `npm run test` (`vitest`),
    Then co-located Vitest tests cover: `lib/storage/banner-dismiss.ts` (add today, isDismissedToday true/false, dedupe, cross-day rollover not dismissed, optional prune of stale dates), `lib/banner-styles.ts` (exports the documented token literals), the URL→`/browse/<KEY>` parser (subtask key extraction, non-browse URLs → undefined, query-string/anchor tolerance), and the SW `banner-state` handler (returns `{ hoursMissing, currentTicket }` reusing badge deficit; disconnected/auth-expired → no-banner signal). Vanilla-DOM render is hard to unit test under jsdom — keep DOM glue thin and extract all decision logic into pure, tested helpers.

## Tasks / Subtasks

- [x] **Task 1 — Create `lib/storage/banner-dismiss.ts` (date-keyed daily-dismiss store)** (AC: #1, #6, #10)
  - [x] Define `storage.defineItem<string[]>('local:bannerDismissedDates', { fallback: [] })` (per architecture L711 `storage.defineItem<DateString[]>`). Use the bare `wxt/utils/storage` import like `lib/storage/outbox.ts`.
  - [x] Export PURE-ish helpers: `isDismissedToday(reference?: Date): Promise<boolean>`, `dismissForToday(reference?: Date): Promise<void>` (append today's `YYYY-MM-DD`, deduped). Reuse `todayDateString()` from `lib/worklog-date.ts` for the local-date key (do NOT roll your own date formatting).
  - [x] Optionally prune dates older than ~7 days on write to bound storage growth (NFR storage quota). Keep it defensive — never throw; return `false` on read error (mirror `isCurrentWeekMarkedDone` in `lib/badge.ts`).
  - [x] Ensure disconnect clears it: it lives in `chrome.storage.local`, which `lib/disconnect.ts` already wipes via `chrome.storage.local.clear()`. Verify (read `lib/disconnect.ts`) — if it clears the whole `local` area, no change needed; if it clears specific keys, add this key.
  - [x] Co-located `lib/storage/banner-dismiss.test.ts` (AC #10): in-memory `Map` storage mock like `lib/storage/outbox.test.ts`.

- [x] **Task 2 — Create `lib/banner-styles.ts` (CSP-safe inline-style tokens)** (AC: #3, #4, #5, #9, #10)
  - [x] Export typed `CSSProperties`-shaped (or `Record<string, string>`) style objects mirroring the UX tokens as LITERAL CSS — NO Tailwind, NO CSS variables, NO `@/styles` imports (the content script cannot use Tailwind — UX L53, architecture L319). This file is the banner's "design system."
  - [x] Define the token constants once: `ACCENT = '#6b5b95'` (brand purple / dot / button bg), `ACCENT_SUBTLE = '#e9e6f3'` (banner bg), `NEUTRAL_700 = '#334155'` (primary text), `NEUTRAL_500 = '#64748b'` (tertiary CTA text — confirm hex in `styles/globals.css`), white `#ffffff` for button text. Source: UX L630–660 / L682–683.
  - [x] Export style objects for: banner container (100% width, ~56 px collapsed / ~120 px expanded, `position` anchored to top of Jira content, fixed px font sizes, z-index above Jira chrome), brand dot, primary text, "Open extension" tertiary CTA, "Log time on KEY" brand button, hours input, "Log" primary button, dismiss ✕, inline error text, the slide transition string (and a reduced-motion variant with no transition).
  - [x] Co-located `lib/banner-styles.test.ts` asserting the documented hex literals are present (AC #10) — cheap regression guard against silent token drift.

- [x] **Task 3 — Add a `currentTicketFromUrl` parser + reusable week-deficit getter** (AC: #2, #4, #7, #8, #10)
  - [x] Add a PURE `currentTicketFromUrl(url: string): string | undefined` (location: `lib/banner-styles.ts` is wrong — put it in a small `entrypoints/content.ts` helper export OR a new `lib/jira-url.ts`; prefer a tiny pure module so it's unit-testable). Match `/browse/<KEY>` where `<KEY>` is `[A-Z][A-Z0-9]+-\d+` (case-insensitive on the host but Jira keys are upper). Tolerate trailing `/`, `?query`, `#anchor`. Return `undefined` for non-`/browse/` paths.
  - [x] In `lib/badge.ts`, EXTRACT the auth-gate → fetch → compute-deficit logic (currently inline in `updateBadge`, lines 84–120) into a reusable exported async function, e.g. `getWeekHoursMissing(): Promise<number | null>` returning the rounded deficit (`>= 1` → the number, `<= 0` → `0`, disconnected/auth-expired/transient-fetch-error → `null`). Refactor `updateBadge` to call it (render `null`/`0` as cleared, `> 0` as the red badge) so the badge AND the banner share ONE deficit source. Do NOT duplicate the deficit math or the fetch in the content-script path. Keep `updateBadge` never-throws and its existing behavior/tests green.
  - [x] The banner-state handler must distinguish "no banner" (disconnected / auth-expired / 0 deficit → `null` or `0`) from a real positive deficit. `getWeekHoursMissing` returning `null` means "do not show" (AC #8); `0` also means "do not show" (AC #2).

- [x] **Task 4 — Add `banner-state` (request/response) + reuse `log-worklog` in `lib/messages.ts`** (AC: #2, #5, #8)
  - [x] The existing `lib/messages.ts` `sendMessage`/`onMessage` registry is FIRE-AND-FORGET — the listener returns `false`, never calls `sendResponse`. The `banner-state` message NEEDS a response (`{ hoursMissing, currentTicket? }`). Choose the smallest correct approach:
    - PREFERRED: add a separate request/response helper pair (e.g. `requestMessage<K>` / `onRequest<K>`) that keeps the channel open (`return true` in the listener and calls `sendResponse(result)`), OR have the content script use `chrome.runtime.sendMessage(envelope)` and `await` the returned promise while the SW listener responds. Do NOT break the existing fire-and-forget `sendMessage`/`onMessage` contract or its tests.
  - [x] Add a `banner-state` request schema. Request payload can carry `{ url: string }` (so the SW parses `currentTicket` server-side, or the content script parses it and the SW only computes `hoursMissing` — either is fine; pick one and keep it consistent). Response shape: `{ hoursMissing: number; currentTicket?: string }`. Add Zod schema(s) and register the kind in the `MessageRegistry`.
  - [x] REUSE the existing `log-worklog` kind (`LogWorklogSchema = { issueKey, timeSpentSeconds, started, comment? }`) for the banner's inline post — the SW already (Story 2.x) has the worklog-write pathway. CONFIRM whether the SW currently has an `onMessage('log-worklog')` consumer; if popup logging calls `postWorklog` directly in-page (it does — `QuickLogForm` calls `postWorklog` in the popup context), then the CONTENT SCRIPT cannot call `postWorklog` directly (it would run in the page's CSP/origin and lacks the popup's module graph guarantees + would not go through the SW scheduler the same way). Wire a SW-side `onMessage('log-worklog', ...)` (or request/response) handler that calls `postWorklog`, enqueues the outbox on transient failure (mirror `QuickLogForm` lines 134–150), and broadcasts `badge-update`. The banner posts via this message; it must NOT import `postWorklog` into the content-script bundle directly unless the team confirms the content script shares the SW scheduler (it does NOT — content scripts run in the page).
  - [x] Add/adjust co-located message tests if the request/response helper is new.

- [x] **Task 5 — Create `entrypoints/content.ts` (the banner content script)** (AC: #1–#9)
  - [x] `export default defineContentScript({ matches: ['https://*.atlassian.net/*'], main() { ... } })`. Vanilla DOM — NO React (architecture L778 "Content Script (vanilla DOM)", L1464). Build the banner with `document.createElement` + inline `style` from `lib/banner-styles.ts`.
  - [x] Idempotent injection (AC #1): mount into a single host element with a stable id (`jira-time-logger-banner-root`); if it already exists, reuse/update it rather than create a second. Consider attaching the host as a fixed/absolute element at the top of Jira's content area (do not break Jira's layout — prefer an overlay banner or push-down that respects `prefers-reduced-motion`).
  - [x] Flow on inject/re-eval: (a) `isDismissedToday()` → if true, ensure no banner, return (AC #1, #6); (b) request `banner-state` with the current URL; (c) if `hoursMissing <= 0` or disconnected/auth-expired (`null`) → ensure no banner, return (AC #2, #8); (d) render collapsed banner (AC #3); (e) if `currentTicket` set → add the "Log time on KEY" CTA (AC #4).
  - [x] Expand-in-place (AC #5): clicking the contextual CTA swaps the collapsed content for the hours input (auto-`focus()`) + Log button; validate via `parseHours`/`MAX_HOURS_PER_ENTRY`; on submit send `log-worklog` (today's `started` via `formatStartedISO(todayDateString())` from `lib/worklog-date.ts`); show ✓ then slide-up collapse on success; inline error then revert on parse/over-limit error. Enter submits, Escape collapses.
  - [x] Dismiss (AC #6): ✕ calls `dismissForToday()` then slide-up removes the host element.
  - [x] "Open extension" CTA (AC #3): send a message that asks the SW to `chrome.action.openPopup()` (the content script cannot call `chrome.action.openPopup` itself — it's not exposed to content scripts; route via the SW). Add a tiny `open-popup` fire-and-forget message kind, or reuse an existing one if present.
  - [x] SPA re-injection (AC #7): register a `popstate` listener and a `MutationObserver` (observe a stable Jira container or `document.title` / the `<title>` element) that, debounced (~150–300 ms), re-runs the inject/re-eval flow. Idempotent (AC #1). Clean up observers if the script is torn down.
  - [x] Reduced motion (AC #9): gate the transition style on `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
  - [x] The content script must NEVER throw uncaught — wrap the entry and async handlers in try/catch and `log` via `lib/log` (`banner.injected`, `banner.skipped` with reason `dismissed|caught-up|disconnected`, `banner.dismissed`, `banner.log.success|failed`, `banner.spa.reinjected`, `banner.error`). NOTE: `lib/log` must be importable in a content-script context (it is framework-agnostic `lib/*`); confirm it has no SW-only deps.

- [x] **Task 6 — Wire the SW side in `entrypoints/background.ts`** (AC: #2, #5, #8)
  - [x] Add the `banner-state` request handler: parse `currentTicket` from the request URL (or accept it from the content script), call `getWeekHoursMissing()` (Task 3), respond `{ hoursMissing, currentTicket }`. Disconnected/auth-expired/transient → respond a "no banner" signal (`hoursMissing: 0` or a null marker — keep consistent with AC #2/#8). Reuse the SW's existing alarm/message wiring; do NOT disturb `token-refresh`, `outbox-retry`, `badge-update`, `daily-reminder`, `notifications.onClicked`, `storage.onChanged`, boot `updateBadge`, or `onInstalled`.
  - [x] Add the `log-worklog` SW handler (Task 4): `postWorklog` → on `ok` broadcast `badge-update`; on `network`/`rate-limited` enqueue the outbox (`lib/storage/outbox.ts` `enqueue`, endpoint `rest/api/3/issue/${key}/worklog`) and signal "pending" back to the banner; on other errors signal error. Mirror `QuickLogForm` onSuccess branch logic (lines 117–155).
  - [x] Add the `open-popup` handler if introduced (calls `chrome.action.openPopup()` guarded in try/catch — it can reject when no window is focused; log and do not throw, same pattern as `handleNotificationClick` in `lib/notification.ts`).

- [x] **Task 7 — Verify manifest / WXT content-script registration** (AC: #1)
  - [x] `host_permissions` already includes `https://*.atlassian.net/*` (`wxt.config.ts:15-19`) — NO host-permission change needed. WXT auto-derives the `content_scripts` manifest entry from `entrypoints/content.ts`'s `defineContentScript({ matches })`. Run `npm run build` and inspect `output/.../manifest.json` to confirm the `content_scripts` block + `matches` are present.
  - [x] Confirm no new `permissions` entry is required (the banner uses `storage` (already present) + messaging; `action.openPopup` is gated by the existing `action` default). Do NOT add `scripting`/`tabs` unless build proves it necessary.

- [x] **Task 8 — Tests + gates** (AC: #10)
  - [x] Add the co-located unit tests listed in AC #10 (`banner-dismiss`, `banner-styles`, URL parser, SW `banner-state`/`log-worklog` handler logic, `getWeekHoursMissing`). Follow existing mocking patterns: `vi.stubGlobal('chrome', {...})` (`lib/disconnect.test.ts`, `lib/badge.test.ts`), in-memory `Map` storage + `vi.mock('@/lib/jira-client'|'@/lib/storage/tokens'|'@/lib/log')` (`lib/storage/outbox.test.ts`, `lib/notification.test.ts`).
  - [x] Vanilla-DOM rendering: keep DOM glue thin; if you test any DOM, use jsdom (vitest default) and assert structure/aria/idempotency. Do not over-invest in brittle DOM tests — push logic into pure helpers.
  - [x] Run `npm run test` (vitest), `npm run compile` (tsc --noEmit), `npm run lint` (eslint), and `npm run build` (confirms WXT registers the content script). All green; no `console.log` outside tests; no `any`; no default exports except the `defineContentScript`/`defineBackground` entrypoint defaults.

## Dev Notes

### What already exists — REUSE, do not reinvent

- **`host_permissions` (DONE):** `wxt.config.ts:15-19` already grants `https://*.atlassian.net/*`, `https://api.atlassian.com/*`, `https://auth.atlassian.com/*`. The banner needs only the `*.atlassian.net` host (already present). NO manifest host change. WXT derives `content_scripts` from the `defineContentScript` entrypoint automatically (architecture L122, L166).
- **`lib/badge.ts` (UPDATE — extract a shared deficit getter):** `updateBadge()` (lines 84–135) already does auth-gate (`getAuth`/`hasValidAuth`) → marked-done skip → `currentCycleRange('weekly')` + `workdaysSoFar()` → `fetchCurrentUserWeekWorklogs(range)` → `computeHoursMissing(...)` → render with the `Math.round(deficit) >= 1` threshold. EXTRACT lines 84–120 into `getWeekHoursMissing(): Promise<number | null>` and have both `updateBadge` and the `banner-state` handler call it. The banner's `hoursMissing` MUST equal the badge's number (single source). `BADGE_DANGER_COLOR`, `computeHoursMissing`, `isCurrentWeekMarkedDone` already exported.
- **`lib/jira-client.ts` (REUSE — read-only):** `fetchCurrentUserWeekWorklogs(range)` (Story 3.1, line 441) returns `Result<JiraWorklog[], JiraError>`, user+range filtered, routed through `jiraGet` (scheduler + auth + 401-refresh). `postWorklog(issueKey, { timeSpentSeconds, started, comment? })` (line 125) for the inline log — but call it from the SW, not the content script (see "Content-script constraints" below).
- **`lib/hours.ts` (REUSE):** `parseHours(input)` (Jira-flexible: `2.5`, `2.5h`, `2h 30m`, `2:30`, `150m`, `1d 1h`), `MAX_HOURS_PER_ENTRY = 24`, `hoursToSeconds`, `secondsToHours`, `secondsToHoursDisplay`. The banner's hours input MUST use these — identical validation to `QuickLogForm` (`lib/hours.ts`; Story 2.4). NEVER inline `* 3600` / `/ 3600`.
- **`QuickLogForm.tsx` (REFERENCE — replicate the post pathway, NOT the React component):** `components/today/QuickLogForm.tsx` shows the canonical log flow — `validateHours` (lines 50–57), `postWorklog` mutation (107–116), onSuccess: `badge-update` broadcast + success state (117–133), transient → `enqueueOutbox` with endpoint `rest/api/3/issue/${key}/worklog` + "Pending — will retry" (134–150), other errors → error state (147–149). The banner reuses this LOGIC but as vanilla DOM + via the SW (see Task 4/6). Do NOT mount this React component in the content script.
- **`lib/worklog-date.ts` (REUSE):** `formatStartedISO(dateStr)`, `todayDateString()`, `formatDateForInput(date)`. Use `formatStartedISO(todayDateString())` for the banner's "today" `started`. Use `todayDateString()` for the dismiss date key.
- **`lib/storage/outbox.ts` (REUSE):** `enqueue({ kind: 'post', endpoint, issueKey, body })` for transient post failures (same shape `QuickLogForm` uses). The outbox-retry alarm (`entrypoints/background.ts:84`) already drains it and re-broadcasts `badge-update`.
- **`lib/messages.ts` (UPDATE — add request/response + `banner-state`):** existing `sendMessage`/`onMessage` are FIRE-AND-FORGET (listener `return false`, never `sendResponse`). `log-worklog` (`LogWorklogSchema = { issueKey, timeSpentSeconds, started, comment? }`) and `badge-update` kinds already registered. ADD a request/response capability for `banner-state` without breaking the existing contract (Task 4).
- **`lib/storage/tokens.ts` (REUSE):** `getAuth()`, `hasValidAuth(bundle)` — the disconnected gate (already used inside `updateBadge` / `getWeekHoursMissing`). The content script never reads auth directly; it gets a "no banner" signal from the SW (AC #8).
- **`lib/disconnect.ts` (VERIFY):** disconnect clears `chrome.storage.local`; confirm the new `local:bannerDismissedDates` key is wiped on disconnect (it will be if disconnect does a full `local` clear — read the file to confirm; otherwise add the key).
- **`lib/log.ts` (REUSE):** framework-agnostic dotted `noun.verb` events, flat payloads, no PII. Confirm it imports nothing SW-only so it works in the content-script bundle.
- **`entrypoints/background.ts` (UPDATE):** the SW dispatcher (alarms `token-refresh`/`outbox-retry`/`badge-update`/`daily-reminder`, `onMessage('badge-update')`, `notifications.onClicked`, `storage.onChanged`, boot `updateBadge`, `onInstalled`). ADD the `banner-state` request handler, the `log-worklog` handler, and (if introduced) the `open-popup` handler. PRESERVE everything else — the SW must stay working end-to-end.

### Content-script constraints (CRITICAL — these prevent the most likely failures)

- **Vanilla DOM, NOT React (architecture L778, L1464; UX L1464).** The banner is `entrypoints/content.ts` built with `document.createElement` + inline styles. Do NOT import React, Tailwind, the `components/ui/*` library, or `styles/globals.css` into the content-script bundle.
- **Inline styles only / CSP-safe (architecture L80, L319, L618; NFR11; UX L53, L1061, L1791).** Jira's CSP forbids injected `<style>`/external loads; apply every style as an inline `style` property from `lib/banner-styles.ts`. Use fixed pixel sizes. No external fonts.
- **The content script runs in the PAGE, not the SW.** It does NOT share the SW's `lib/scheduler.ts` rate-limit singleton, and `chrome.action.openPopup()` is NOT available to content scripts. Therefore: post worklogs and open the popup VIA messages to the SW (Tasks 4/6), not by importing `postWorklog`/calling `chrome.action` directly. (Calling `postWorklog` from the page would bypass the SW scheduler that NFR4/rate-limiting relies on.)
- **Idempotency + SPA re-injection (architecture L112, L617, L784; AR33).** Jira is an SPA; a single navigation does not reload the page. Use a stable host-element id guard so re-injection never stacks banners; detect in-tab navigation with `popstate` + a debounced `MutationObserver`. The risk register rates this LOW-MED, mitigated by exactly this idempotent + observer approach.
- **Graceful degradation (architecture L997, L1079).** If state is unavailable, render nothing — never throw, never block Jira's page. The banner is a passive guest.

### Does NOT exist yet — create here / handle defensively

- **`entrypoints/content.ts`** — does NOT exist (only `entrypoints/options/` and `entrypoints/popup/` + `background.ts`). This story creates the extension's FIRST content script.
- **`lib/storage/banner-dismiss.ts`** — does NOT exist (architecture L711 specifies it). Create it (Task 1).
- **`lib/banner-styles.ts`** — does NOT exist (UX L398–400, L1464 specify it). Create it (Task 2).
- **`banner-state` / request-response message** — does NOT exist; the bus is fire-and-forget only. Add it (Task 4).
- **SW `log-worklog` consumer** — confirm whether one exists; popup logging calls `postWorklog` in-page (`QuickLogForm`), so a SW-side `log-worklog` handler likely does NOT exist yet and must be added for the banner (Task 4/6).
- **Story 4.5 marked-done flag** — read-only via `isCurrentWeekMarkedDone()` (already wired in `getWeekHoursMissing`'s source). Do NOT build Story 4.5.

### Current state of files this story UPDATES

- `entrypoints/background.ts`: `defineBackground(async () => {...})` — alarms (`token-refresh`/`outbox-retry`/`badge-update`/`daily-reminder`), one `onAlarm` dispatcher, `onMessage('badge-update')`, `notifications.onClicked`, `storage.onChanged` (reminderTime), boot `void updateBadge()` + `registerDailyReminderAlarm(true)`, `onInstalled`. ADD `banner-state` + `log-worklog` (+ optional `open-popup`) handlers; PRESERVE all existing wiring.
- `lib/badge.ts`: `updateBadge` (84–135) inlines the deficit pipeline; refactor to extract `getWeekHoursMissing()` and call it. Keep `updateBadge` behavior + tests green.
- `lib/messages.ts`: add request/response helper + `banner-state` schema/kind; do not alter existing fire-and-forget `sendMessage`/`onMessage` or their tests.
- `wxt.config.ts`: NO change expected (host permission already present; WXT auto-derives `content_scripts`).
- `lib/disconnect.ts`: read to confirm `local:bannerDismissedDates` is cleared on disconnect (likely no edit if it clears the whole `local` area).

### Project Structure Notes

- Architecture maps the banner to `entrypoints/content.ts (banner FR16-18)` + `lib/storage/banner-dismiss.ts` (L836), with the contextual log `entrypoints/content.ts (FR14 contextual log)` (L835) and `content.ts` tagged `(FR16-19, NFR11)` (L616). Build sequence places the content-script banner LAST in Epic 3 (L352, L1097) — this story is correctly sequenced.
- New files: `entrypoints/content.ts`, `lib/storage/banner-dismiss.ts` (+ `.test.ts`), `lib/banner-styles.ts` (+ `.test.ts`), optional `lib/jira-url.ts` (+ `.test.ts`) for the URL parser.
- Cross-cutting `lib/*` modules are framework-agnostic (no React imports) and unit-tested with co-located Vitest (architecture L194, L237, L903).

### Testing standards

- Vitest, co-located `*.test.ts`. `chrome.*` mocked via `vi.stubGlobal('chrome', {...})` (`lib/disconnect.test.ts`, `lib/badge.test.ts`); wxt storage + `@/lib/jira-client` + `@/lib/storage/tokens` + `@/lib/log` via top-level `vi.mock(...)` with in-memory `Map` (`lib/storage/outbox.test.ts`, `lib/notification.test.ts`); pure logic (URL parser, dismiss date math) needs no mocks. `afterEach(() => vi.unstubAllGlobals())`.
- Scripts are **npm**: `npm run test`, `npm run compile` (tsc --noEmit), `npm run lint` (eslint), `npm run build` (WXT — also proves the content-script manifest entry). Confirm exact names in `package.json`. No `console.log` outside tests (ESLint).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3: Inline Jira Banner with Daily Dismiss & Contextual Quick-Log] (lines 946–996) — user story, all 8 AC clusters (dismiss check, banner-state, collapsed banner, contextual CTA, expand+log, dismiss, SPA re-injection, auth-expired passivity).
- [Source: _bmad-output/planning-artifacts/epics.md] lines 290–298 (Epic 3 overview; FR14/17/18/19, NFR4/9, UX-DR19, AR32 CSP-safe inline styles, AR33 SPA re-injection).
- [Source: _bmad-output/planning-artifacts/architecture.md] L80 (CSP-safe inline styles only), L112/L617/L784 (SPA re-injection: MutationObserver + popstate, idempotent), L122/L166 (WXT auto-derives manifest/content_scripts), L170/L616/L835/L836 (content.ts owns banner FR16-19 + contextual log, paired with banner-dismiss.ts), L279–290 (message bus: `log-worklog` Popup/Banner→SW, `banner-state` SW→Content `{ hoursMissing, currentTicket? }`, `dismiss-banner-today`), L319 (Tailwind forbidden in banner; inline styles the exception), L605/L769 (SW routes inter-surface messages), L711 (`banner-dismiss.ts` = `storage.defineItem<DateString[]>`), L778 (content script = vanilla DOM, NOT React), L822 (dismissals in chrome.storage.local, cleared next day), L997/L1079 (graceful degradation — render placeholder, never block), L1097 (banner sequenced last).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] L1046–1070 (collapsed + expanded banner wireframes), L779/L788/L1791 (dimensions 100% × ~56 px collapsed / ~120 px expanded, top-anchored, fixed-px CSP-safe), L1057–1061 (brand dot, accent.subtle bg, neutral.700 text, ✕ dismiss, inline styles), L554–565 (contextual quick-log: focused hours field, Enter, slide-up 200 ms), L1246–1257/L1466 (banner states + flow: expand→post→✓→collapse, inline error, outbox pending), L823/L840/L1843 (200 ms ease-out slide; prefers-reduced-motion replaces ≥100 ms transitions with instant), L1468/L1844 (a11y: role="region" aria-label="Time-tracking banner", hours input aria-label="Hours to log on PROJ-455", ✕ aria-label="Dismiss for today", no auto-focus-grab), L201/L1605 (honest past-tense copy "6h unlogged this week"), L630–660/L682–683 (tokens: accent.DEFAULT #6b5b95, accent.subtle #e9e6f3, neutral.700 #334155), L101/L1244/L1372 (one-click daily dismiss, no confirm), L1659 ("Open extension" affordance opens popup).
- Existing code: `entrypoints/background.ts` (SW dispatcher / alarm + message patterns), `lib/badge.ts:84-135` (`updateBadge` deficit pipeline to extract), `lib/jira-client.ts:125`/`:441` (`postWorklog`, `fetchCurrentUserWeekWorklogs`), `lib/hours.ts` (`parseHours`/`MAX_HOURS_PER_ENTRY`/`hoursToSeconds`), `components/today/QuickLogForm.tsx:107-155` (post + outbox + badge-broadcast pathway to replicate), `lib/worklog-date.ts` (`formatStartedISO`/`todayDateString`), `lib/storage/outbox.ts` (`enqueue`), `lib/messages.ts` (fire-and-forget bus + `log-worklog`/`badge-update`), `lib/storage/tokens.ts` (`getAuth`/`hasValidAuth`), `lib/disconnect.ts` (local clear), `wxt.config.ts:15-19` (host_permissions present), `lib/storage/outbox.test.ts` + `lib/disconnect.test.ts` + `lib/notification.test.ts` (mocking patterns).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8)

### Debug Log References

- `npm run test` → 45 files / 539 passing, 1 skipped (baseline 41/478+1; +4 new test files, +61 tests, no regressions).
- `npm run compile` (tsc --noEmit) → clean.
- `./node_modules/.bin/eslint .` → 0 errors, 54 pre-existing `import/order` warnings (none in new files).
- `npm run build` (WXT chrome-mv3) → success; emits `content-scripts/content.js` and a `content_scripts` manifest entry with `matches: ["https://*.atlassian.net/*"]`. No new `permissions` (no `scripting`/`tabs`); `host_permissions` unchanged.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Task 1** — `lib/storage/banner-dismiss.ts`: date-keyed `string[]` daily-dismiss store (`local:bannerDismissedDates`), reuses `todayDateString()`/`formatDateForInput`, dedupes, prunes >7-day-old dates, defensive (never throws; read error → `false`). Verified `lib/disconnect.ts` does a full `chrome.storage.local.clear()` — key is wiped on disconnect with no extra wiring.
- **Task 2** — `lib/banner-styles.ts`: CSP-safe inline-style tokens (literal hex, no Tailwind/CSS-vars/external fonts, fixed px). Exports token literals + style objects for every banner element + a `styleString()` serializer and a reduced-motion `NO_TRANSITION` variant.
- **Task 3** — `lib/jira-url.ts` `currentTicketFromUrl()` (pure, `/browse/<KEY>`, tolerates `/`,`?`,`#`, upper-cases). In `lib/badge.ts` extracted `getWeekDeficit()` (discriminated `cleared`/`unknown`/`deficit` to preserve the badge's distinct "clear vs leave-untouched" semantics) + `getWeekHoursMissing(): number | null`; `updateBadge` now calls the shared source. Badge behavior + tests unchanged.
- **Task 4** — `lib/messages.ts`: added a parallel request/response channel (`sendRequest`/`onRequest`, `reqKind` envelope, `return true` + `sendResponse`) WITHOUT touching the fire-and-forget `sendMessage`/`onMessage` contract. Schemas: `banner-state` (`{url}` → `{hoursMissing, currentTicket?}`) and `log-worklog-request` (reuses `LogWorklogSchema` → `{status: ok|pending|error}`). Added fire-and-forget `open-popup` kind.
- **Task 5** — `entrypoints/content.ts`: the first content script. `defineContentScript` vanilla DOM, single host id `jira-time-logger-banner-root` (idempotent), `role=region`/`aria-label`, collapsed → contextual CTA → inline quick-log (parseHours/MAX_HOURS_PER_ENTRY, Enter submit / Escape collapse, ✓ then slide-up), ✕ dismiss → `dismissForToday()`, "Open extension" → `open-popup`, posts via `log-worklog-request` (never imports `postWorklog` in-page), SPA re-eval via `popstate` + debounced `MutationObserver`, `prefers-reduced-motion` gate, all wrapped try/catch + `lib/log`. Also tears down on the SW's `disconnect` broadcast.
- **Task 6** — SW logic extracted to `lib/banner-sw.ts` (`handleBannerStateRequest`/`handleLogWorklogRequest`/`handleOpenPopup`) and wired into `entrypoints/background.ts` via `onRequest('banner-state')`, `onRequest('log-worklog-request')`, `onMessage('open-popup')`. The log handler mirrors `QuickLogForm` exactly (post → badge-update / outbox-enqueue+pending / error). All existing SW wiring preserved.
- **Task 7** — manifest verified (see Debug Log); no `wxt.config.ts` change needed.
- **Task 8** — co-located tests: `banner-dismiss.test.ts` (9), `banner-styles.test.ts` (15), `jira-url.test.ts` (11), `banner-sw.test.ts` (11), plus `getWeekHoursMissing`/`getWeekDeficit` (7) added to `badge.test.ts` and request/response bus (10) added to `messages.test.ts`. DOM glue kept thin per guidance; decision logic lives in tested pure helpers.
- **Design note (banner-state response shape):** AC #2/#8 are honored by collapsing the badge's `null` (disconnected/auth-expired/transient) to `hoursMissing: 0` in the response — the content script hides on `<= 0`, so it never needs to distinguish *why* there's no banner (it never surfaces auth errors). The `log-worklog-request` response adds a `pending` status (not in the original `log-worklog` fire-and-forget kind) so the banner can show the outbox "pending" outcome; on pending the banner still shows ✓ then collapses (the write is durably queued).

### File List

**New**
- `lib/storage/banner-dismiss.ts`
- `lib/storage/banner-dismiss.test.ts`
- `lib/banner-styles.ts`
- `lib/banner-styles.test.ts`
- `lib/jira-url.ts`
- `lib/jira-url.test.ts`
- `lib/banner-sw.ts`
- `lib/banner-sw.test.ts`
- `entrypoints/content.ts`

**Modified**
- `lib/badge.ts` (extracted `getWeekDeficit`/`getWeekHoursMissing`; `updateBadge` now calls the shared source)
- `lib/badge.test.ts` (added shared-deficit tests)
- `lib/messages.ts` (request/response channel + `banner-state`/`log-worklog-request` schemas + `open-popup` kind)
- `lib/messages.test.ts` (request/response bus + schema tests)
- `entrypoints/background.ts` (wired `banner-state`/`log-worklog-request`/`open-popup` handlers)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (3-3 → in-progress → review)

## Review Findings

_Code review 2026-06-27 (3 parallel adversarial layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor). Baseline `1bac1d2`._

- [x] [Review][Patch] Double-submit: Enter key bypasses the disabled-button guard → duplicate worklog posts [entrypoints/content.ts:209-251] — the `keydown` Enter handler calls `submit()` unconditionally; `logBtn.disabled = true` only blocks the button click path, so two rapid Enters both reach `sendRequest('log-worklog-request')` and the SW posts twice (no write idempotency). Added an in-flight re-entrancy guard. (blind)
- [x] [Review][Patch] SPA re-eval fires on every `document.body`/`<title>` mutation, not on URL change; the two `scheduleReeval` branches are dead-equivalent [entrypoints/content.ts:289-302,315-320] — on Jira's busy SPA this triggers a storage read + `banner-state` SW round-trip continuously, and the banner's own `appendChild`/`remove` self-triggers it. Gated re-eval on an actual `location.href` change and removed the dead branch. (blind+edge+auditor)
- [x] [Review][Patch] `removeBanner()` deferred `host.remove()` (220 ms) races a re-render and can delete a freshly re-rendered live banner [entrypoints/content.ts:84-94] — cancel the pending removal timer on any re-render/remove and guard the deferred removal on the host still being slid-up. (blind)
- [x] [Review][Patch] Log-failure path shows the parse-format error copy for a network/server failure [entrypoints/content.ts:235-238] — replaced with a generic "Couldn't log time — try again" message. (blind+edge+auditor)
- [x] [Review][Patch] `dismissForToday()` is not awaited before re-eval-able paths run [entrypoints/content.ts:157-160] — await the write so a subsequent re-eval reliably sees the dismissal. (edge)
- [x] [Review][Defer] SW cold-start can yield no banner on the first Jira page load until the next navigation [entrypoints/content.ts] — deferred: graceful degradation (never crashes), AC #8 permits "no banner", recovery is navigation-gated; adding a content-side retry is out of scope. (edge)
- [x] [Review][Defer] Pressing Escape during an in-flight submit re-renders the banner and drops the ✓ confirmation (the worklog still posts) [entrypoints/content.ts:248-250] — deferred: minor UX only; the in-flight guard (patch #1) prevents the double-post hazard, and the write is durable. (edge)

_Dismissed as noise (3): prune window keeps 8 calendar days instead of 7 (benign +1 storage row); `<title>` observer captured once (redundant detectors + URL-gating cover it); auth-expired on the active log path surfaces a generic banner error (AC #8 scopes passivity to the state path, not the user-initiated log path; copy fixed by patch #4). Several verified-safe boundaries (jira-url regex, timezone key agreement, single-letter keys, empty input, MV3 multi-listener port) raised no findings._

## Change Log

| Date | Change |
|---|---|
| 2026-06-22 | Story 3.3 created — Inline Jira banner with daily dismiss + contextual quick-log (FR14/17/18/19, NFR9/11, UX-DR19/7/30/32, AR32/33). Introduces the extension's first content script (`entrypoints/content.ts`, vanilla DOM, CSP-safe inline styles). Adds `lib/storage/banner-dismiss.ts`, `lib/banner-styles.ts`, a URL→ticket parser, a `banner-state` request/response message, and SW `log-worklog`/`open-popup` handlers; extracts a shared `getWeekHoursMissing()` from `lib/badge.ts` so banner + badge share one deficit. Status → ready-for-dev. |
| 2026-06-27 | Story 3.3 implemented. Added `lib/storage/banner-dismiss.ts`, `lib/banner-styles.ts`, `lib/jira-url.ts`, `lib/banner-sw.ts`, `entrypoints/content.ts` (the first content script). Extracted `getWeekDeficit`/`getWeekHoursMissing` in `lib/badge.ts`; added a request/response channel + `banner-state`/`log-worklog-request` schemas + `open-popup` to `lib/messages.ts`; wired the three SW handlers in `entrypoints/background.ts`. All co-located tests added (AC #10). Gates green: test 539 pass/1 skip, tsc clean, eslint 0 errors, WXT build emits the `content_scripts` manifest entry. Status → review. |
| 2026-06-27 | Code review (3 adversarial layers). 5 patches applied to `entrypoints/content.ts`: (1) in-flight re-entrancy guard against Enter-key double-submit (duplicate worklog posts); (2) gated SPA re-eval on actual URL change so Jira's busy DOM no longer triggers continuous storage/SW round-trips, removed the dead-equivalent branch; (3) cancel/guard the deferred `removeBanner` timer so a re-render can't be deleted out from under the user; (4) generic "Couldn't log time — try again" copy for log failures (was reusing the parse-error string); (5) await `dismissForToday()` before removing. 2 deferred (SW cold-start no-banner; Escape-during-submit lost ✓), 3 dismissed as noise. Gates re-run green: 539 pass/1 skip, tsc clean, eslint 0 errors, build emits content script + manifest entry. Status → done. |
