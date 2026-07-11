# Edge (Chromium) Browser Validation — Release Gate

**Date:** 2026-06-27
**Story:** 6.2 — Edge Browser Validation
**Scope:** Verify the single MV3 codebase's Edge (Chromium) build/config, audit
`chrome.*` API usage for Edge compatibility, and stand up a documented human
Edge smoke-test gate.
**Target browser:** Microsoft Edge (Chromium) stable.

> **Status of manual checks (read first):** The Edge **build/zip verification**,
> the **manifest/permission compatibility check**, and the **static `chrome.*`
> API audit** below are COMPLETE and PASS — they are verifiable by an automated
> agent and were actually run. The **human Edge smoke test** (Part B: installing
> the produced `.zip` in a real `edge://extensions`, completing OAuth, watching
> the banner/notification/badge render, exercising every flow) has **NOT** been
> performed. An automated implementation agent has **no real Microsoft Edge
> browser** and cannot sideload an extension, click through OAuth, or observe
> live rendering. Every row of the Human Edge Smoke-Test Checklist is marked
> `PENDING HUMAN VERIFICATION`. No Part B item was performed or claimed by the
> implementation agent. This gate is **NOT GREEN until a human completes Part B.**

---

## Part A — Automated verification (complete, passes)

### A1. Edge build (AC1)

Command (run from repo root):

```
npm run build:edge        # = wxt build -b edge
```

**Result: SUCCESS.** Emits `output/edge-mv3/` containing `manifest.json`,
`background.js`, `popup.html`, `options.html`, `content-scripts/content.js`,
the `chunks/` bundles, `assets/globals-*.css`, and `icon/*`.

**Warning diff vs Chrome build.** `npm run build` (chrome-mv3) and
`npm run build:edge` (edge-mv3) were both run on the same source. Both complete
cleanly with WXT 0.20.26 / Vite 8.0.12 and emit an **identical** file/bundle set
(same chunk hashes, same total size 787.11 kB). The Edge target introduces **no
new build errors or warnings** unique to Edge beyond the Chrome baseline. AC1 PASS.

### A2. Edge zip artifact (AC2)

Command:

```
npm run zip:edge          # = wxt zip -b edge
```

**Result: SUCCESS.** Produces `output/jira-time-logger-0.1.0-edge.zip`
(version `0.1.0` read from `package.json`; 224.02 kB).

**Sideload shape.** `unzip -l output/jira-time-logger-0.1.0-edge.zip` confirms
`manifest.json` is at the **archive root** (not nested under a subdirectory),
alongside `background.js`, `popup.html`, `options.html`, `content-scripts/`,
`chunks/`, `assets/`, and `icon/`. The archive is therefore directly
sideloadable via `edge://extensions` → enable Developer Mode → "Load unpacked"
(on the unzipped folder) or drag-drop the unzipped directory. AC2 PASS.

> Note: `edge://extensions` "Load unpacked" takes an **unzipped folder**. The
> `.zip` is the distributable artifact; the human tester unzips it (or points
> Load-unpacked at `output/edge-mv3/`) before loading.

### A3. Manifest & permission compatibility (AC3)

Inspected `output/edge-mv3/manifest.json` (byte-identical to the Chrome manifest):

| Check | Result |
| --- | --- |
| `manifest_version` | `3` (MV3) — Edge-supported |
| Background | `{"service_worker":"background.js"}` — MV3 service worker, **not** a background page. Edge-supported |
| `key` (forces a Chrome ID) | **absent** — good (letting Edge assign its own ID) |
| `update_url` (Chrome-store pin) | **absent** — good |
| `minimum_chrome_version` (would gate Edge) | **absent** — good |
| `externally_connectable` | **absent** |
| Permissions | `identity`, `storage`, `alarms`, `notifications` — all Edge-Chromium supported |
| Host permissions | `https://*.atlassian.net/*`, `https://api.atlassian.com/*`, `https://auth.atlassian.com/*` — all valid Edge match patterns |
| `action.default_popup` | `popup.html` — Edge-supported |
| `options_ui.open_in_tab` | `true` — Edge-supported |
| `content_scripts` | one entry, `matches: ["https://*.atlassian.net/*"]` — Edge-supported |

**No Chrome-Web-Store-only or Chrome-only manifest keys present.** No finding to
mitigate. AC3 PASS.

### A4. Static `chrome.*` API audit (AC4)

Enumerated every distinct `chrome.*` API call site across `entrypoints/`,
`lib/`, `components/` (excluding test files). **No `browser.*` usage and no
`webextension-polyfill` dependency** anywhere in the source — the codebase uses
the `chrome.*` namespace exclusively, which Edge (Chromium) implements natively,
so no polyfill is needed.

| `chrome.*` API | Edge (Chromium) supported? | Notes |
| --- | --- | --- |
| `chrome.storage.local` | Yes | Standard MV3 storage. |
| `chrome.storage.session` | Yes | Session storage area — Chromium-standard. |
| `chrome.storage.onChanged` | Yes | Cross-context change events. |
| `chrome.identity.launchWebAuthFlow` | Yes | See risk #2 (Edge-ID redirect URI). |
| `chrome.identity.getRedirectURL` | Yes | Returns `https://<EDGE_EXT_ID>.chromiumapp.org/` — see risk #2. |
| `chrome.alarms.create` / `.get` / `.clear` / `.onAlarm` | Yes | See risk #4 (timing variance). |
| `chrome.notifications.create` / `.clear` / `.onClicked` | Yes | See risk #4 (render/timing). |
| `chrome.action.setBadgeText` / `.setBadgeBackgroundColor` | Yes | Toolbar badge — Edge-supported. |
| `chrome.action.openPopup` | Yes (version-sensitive) | **Risk #1** — programmatic popup open; behavior varies by Chromium version. |
| `chrome.runtime.onMessage` / `.sendMessage` / `.onInstalled` / `.lastError` / `.getURL` / `.getManifest` / `.openOptionsPage` | Yes | Core messaging/runtime — Edge-supported. |
| `chrome.tabs.query` / `.sendMessage` | Yes | Used to reach the content script. |

**Conclusion:** All `chrome.*` APIs used are Edge-Chromium supported; no
`browser.*` usage and no polyfill needed. **4 runtime areas are flagged below**
for the human smoke pass (Part B). No genuine Edge-incompatible code was found,
so **no app-logic change was made** for this story. AC4 PASS.

#### Flagged Edge runtime risk areas (for the human tester — NOT code defects)

1. **`chrome.action.openPopup()` — programmatic popup open (HIGH-attention).**
   Call sites: `lib/notification.ts:190` (notification-click path) and
   `lib/banner-sw.ts:102` (banner-CTA path, routed via the SW because a content
   script cannot call `openPopup` itself — see `entrypoints/background.ts:188`).
   Chromium's support for programmatically opening the action popup is
   **version-sensitive**; on some builds it may silently no-op or reject when no
   window is focused (the code already `try/catch`es the rejection and continues
   — `lib/notification.ts:183,192`). Both call sites have unit tests that mock
   the call; the *real-browser* behavior is what the human must confirm. **This
   is a smoke item, not a code defect.**

2. **OAuth redirect URI / extension-ID divergence (CONFIG DEPENDENCY — read this).**
   `chrome.identity.getRedirectURL()` (`lib/oauth/flow.ts:111`,
   `entrypoints/background.ts:202`) returns
   `https://<EXTENSION_ID>.chromiumapp.org/`. **Edge assigns a DIFFERENT
   extension ID than Chrome** for the same unpacked build, so the redirect URI
   differs. Before OAuth can complete in Edge, the **Atlassian OAuth app's
   allowed callback/redirect URIs must include the Edge build's
   `chromiumapp.org` URL** (or the OAuth client must be configured to allow it).
   This is a **deployment/configuration dependency, not a code change.** The
   human tester should read the Edge extension's ID from `edge://extensions`,
   derive the redirect URI, and confirm it is registered with the Atlassian app
   before running the OAuth flow — otherwise the connect step will fail with a
   redirect-mismatch error that is expected and not a code regression.
   `launchWebAuthFlow` itself is `chrome.identity.launchWebAuthFlow` at
   `lib/oauth/flow.ts:256`.

3. **Content-script injection + CSP on `*.atlassian.net`.**
   `entrypoints/content.ts` is vanilla DOM with **inline styles only** (to satisfy
   Jira's CSP), performs **SPA-aware re-injection** (`popstate` +
   debounced `MutationObserver`), and persists **daily-dismiss** state in
   `chrome.storage.local`. Edge's CSP / injected-style handling is
   Chromium-identical in principle, but banner render, SPA re-injection, and
   daily-dismiss persistence are primary human smoke items.

4. **Notifications + alarms timing/rendering.** The brand-logo notification
   (`chrome.notifications.create`) and the daily-reminder alarm timing
   (`chrome.alarms`) can have subtle cross-Chromium rendering/timing differences.
   Flag for smoke.

### A5. Gates (AC5)

Run from repo root on this story's working tree (no app-logic changes made):

| Gate | Command | Result |
| --- | --- | --- |
| Type-check | `npm run compile` (`tsc --noEmit`) | **PASS** (exit 0) |
| Lint | `npm run lint` (`eslint .`) | **PASS** (0 errors; pre-existing import/order warnings only) |
| Tests | `npm test` (`vitest run`) | **PASS** — 76 suites / 961 passed / 1 skipped (matches Story 6.1 baseline; no new failures) |

No regressions. AC5 PASS.

---

## Part B — Human Edge Smoke-Test Checklist (PENDING HUMAN VERIFICATION)

> **Every row below is `PENDING HUMAN VERIFICATION`.** The implementation agent
> did NOT perform any of these; it has no real Edge browser. A human installs
> `output/jira-time-logger-0.1.0-edge.zip` (unzipped) in `edge://extensions`
> with Developer Mode enabled, then exercises each flow and records pass/fail +
> notes + the Edge version tested. **Before OAuth**, confirm the Edge extension
> ID's `chromiumapp.org` redirect URI is registered with the Atlassian OAuth app
> (risk #2 above).

**Edge version tested:** ________________  **Tester / date:** ________________

| # | Flow / ambient surface | What to verify | Status | Pass/Fail + notes |
| --- | --- | --- | --- | --- |
| 1 | First-run OAuth connect | `launchWebAuthFlow` opens Atlassian auth; redirect returns to the Edge `chromiumapp.org` URI; tokens persist across SW restart. (Risk #2.) | PENDING HUMAN VERIFICATION | |
| 2 | Today log | Log time on the Today view; worklog posts to Jira; UI reflects it. | PENDING HUMAN VERIFICATION | |
| 3 | Week submit + gap dialog | Submit the week; gap-acknowledgment dialog appears and submits correctly. | PENDING HUMAN VERIFICATION | |
| 4 | Manager approve | Approve a report from the Manager matrix. | PENDING HUMAN VERIFICATION | |
| 5 | Manager drill-down | Drill into a report member's detail from the matrix. | PENDING HUMAN VERIFICATION | |
| 6 | Toolbar badge update | `chrome.action.setBadgeText`/color reflects state on the toolbar. | PENDING HUMAN VERIFICATION | |
| 7 | Daily notification | `chrome.notifications.create` renders with the brand logo at the reminder time. (Risk #4.) | PENDING HUMAN VERIFICATION | |
| 8 | Notification click → opens popup | Clicking the notification calls `chrome.action.openPopup()` and the pre-warmed popup opens. (Risk #1 — version-sensitive.) | PENDING HUMAN VERIFICATION | |
| 9 | Banner inject on `*.atlassian.net` | Content-script banner injects with correct inline styles under Jira CSP. (Risk #3.) | PENDING HUMAN VERIFICATION | |
| 10 | Banner SPA re-injection | Navigate within the Jira SPA; banner re-injects (popstate + MutationObserver). (Risk #3.) | PENDING HUMAN VERIFICATION | |
| 11 | Banner daily-dismiss persistence | Dismiss the banner; it stays dismissed for the day (`chrome.storage.local`). (Risk #3.) | PENDING HUMAN VERIFICATION | |
| 12 | Banner contextual quick-log | Quick-log from the banner; CTA "opens popup" path works (`openPopup` via SW). (Risk #1.) | PENDING HUMAN VERIFICATION | |
| 13 | Daily alarm timing | `chrome.alarms` daily reminder fires at the configured time. (Risk #4.) | PENDING HUMAN VERIFICATION | |

**Acceptance for Part B (AC7):** every flow works identically to Chrome stable;
no Edge-specific regression (CSP, alarm timing, injection, programmatic-popup
behavior). Any discrepancy is filed as a bug and resolved before release.

### Sign-off (to be completed by a human tester)

- [ ] All 13 rows exercised on real Edge stable — name / date / Edge version:
- [ ] OAuth redirect URI (Edge ext ID) registered with Atlassian app — confirmed by:
- [ ] Any Edge discrepancy filed + resolved — reference:

---

## Gate status

- `npm run build:edge`: **PASS** → `output/edge-mv3/`
- `npm run zip:edge`: **PASS** → `output/jira-time-logger-0.1.0-edge.zip` (manifest at root)
- Manifest/permission Edge-compatibility (AC3): **PASS** (clean MV3, no Chrome-only keys)
- `chrome.*` API audit (AC4): **PASS** (all Edge-supported; no `browser.*`/polyfill; 4 runtime areas flagged)
- `npm run compile` / `npm run lint` / `npm test`: **PASS** (no regressions)

**Automated Edge gate (Part A): GREEN.**

**Release Edge gate: NOT YET GREEN** — blocked on the Part B human smoke pass
above. Every checklist row is `PENDING HUMAN VERIFICATION`; no Part B item was
performed by the implementation agent. A human must install the zip in real Edge,
exercise each flow, and sign off before the Edge validation gate is GREEN.
