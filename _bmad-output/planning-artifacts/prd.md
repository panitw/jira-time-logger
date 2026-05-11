---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
status: 'complete'
completedDate: 2026-05-10
releaseMode: 'single-release'
vision:
  tagline: 'Stop forgetting. See the week. Approve the month. All inside Jira, no server.'
  ahaMoment: 'Tool surfaces a gap the user did not realize they had (badge counter showing missing hours, or inline Jira banner on a ticket page) — immediately followed by the popup making catch-up trivially fast. Discovery-of-gap → instant relief. Active reminder leads the journey; overview/grid is the payoff that makes catch-up effortless.'
  whyUsNotSaaS: 'In-house tool tailored to exactly what our org needs — our Jira hierarchy, our catch-all task pattern, our approval cycle, our cadence rules. Off-the-shelf SaaS must be generic; this is bespoke and fits our process glove-tight.'
  primaryInstallTarget: 'worker'
  primaryInstallRationale: 'No worker adoption means no data for manager to approve. Manager view is downstream of worker value. Vision sounds like a worker tool first, manager tool second.'
  futureState: 'Devs log daily reflexively in <60s. Managers approve a month in ~5 min. Accounting gets clean data automatically. Tool is invisible-but-present like email.'
  whyNow: 'MV3 + chrome.identity make extension OAuth a solved pattern (jira-assistant proves it). Jira Cloud OAuth + REST API are stable. Concrete unmet pain (forgetting + accounting feed + manager approval) is not solved by either native Jira or jira-assistant. Serverless means shippable without ops or admin sign-off.'
  coreInsight: 'Logging fails because the tool is silent and the data lives only at the entry level. Make the tool ambient (badge + banner + push) and surface the roll-up (week grid + manager matrix), and the same Jira data becomes both a behavior-change instrument and an approval surface — without a backend.'
inputDocuments:
  - '{project-root}/_bmad-output/brainstorming/brainstorming-session-2026-05-09-180149.md'
referenceProjects:
  - url: 'https://github.com/shridhar-tl/jira-assistant'
    notes: 'React + SCSS Chrome/Firefox/Edge extension with Electron desktop. Validates serverless architecture (database-service + storage-service, no backend) and OAuth 2.0 in a Chrome extension (jira-oauth-service.js). Broader feature set than our MVP (worklog timer, Outlook calendar auto-import, Report Builder, dashboards, widgets, backup). Lacks the four areas we differentiate on: org-hierarchy-walked pre-fill, daily/weekly cadence enforcement (badge + daily nudge + 8h floor), approval workflow, manager/team matrix view.'
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 1
  projectDocs: 0
classification:
  projectType: 'developer_tool'
  projectTypeNote: 'Manifest V3 Chrome extension. web_app tech stack but chrome_extension interaction model — architectural decisions must be made per-surface (toolbar popup, content-script banner, options page), not globally. Three surfaces are distinct interaction contracts.'
  domain: 'general'
  domainFraming: 'Internal productivity tool with accounting-adjacent data sensitivity. Audit integrity is a first-class requirement; formal regulatory compliance is out of scope for v1 but the data model must not foreclose it.'
  complexity: 'high'
  complexityRationale: 'Two structurally-unmitigable risks (approval-comment protocol fragility, manager-view client-side fan-out vs Jira rate limits) plus MV3 service worker lifecycle (OAuth 2.0+PKCE token refresh across worker restarts). Three coordinated UI surfaces with distinct interaction contracts add UX design weight.'
  projectContext: 'greenfield'
  coreValueProps:
    - 'Active reminders (badge counter + daily push + inline Jira banner) — finds the user instead of waiting'
    - 'Overview (weekly grid + manager person×Epic matrix) — what Jira lacks'
  bothLoadBearing: 'Both are core. Removing either reduces the tool to "just use Jira directly."'
partyModeInsights:
  auditFloor:
    - 'Immutable audit trail (who logged what, when, edits with timestamps)'
    - 'Explicit access control statement in PRD (who can read/edit/delete worklogs)'
    - 'Data retention scope: tool will not auto-delete records; formal retention policy deferred'
  highRiskComponents:
    - 'Approval-comment protocol: bespoke state machine in user-editable plaintext. Mitigation: versioned schema with checksum, comment-id secondary lookup, "newest wins" duplication rule, fail-closed parser, PROTOCOL.md in repo'
    - 'OAuth 2.0 + PKCE in MV3 service worker: token refresh must survive worker restarts. Mitigation: persist {access_token, refresh_token, expires_at, cloudId} to chrome.storage.local; refreshInFlight flag in chrome.storage.session; chrome.alarms (not setTimeout); atomic write of rotated refresh token'
    - 'Manager view fan-out: 12 reports × ~50 Epics × paginated worklog calls. Jira Cloud rate limit ~10 req/s, no bulk worklog endpoint. Mitigation: client-side token-bucket scheduler (~40 LOC), respect Retry-After, aggressive cache for closed cycles, progressive row-by-row UI render'
  additionalRisksFlaggedByAmelia:
    - 'chrome.storage.local 10MB quota — need quota check + eviction strategy'
    - 'Content-script SPA navigation — banner survives Jira router; need popstate + MutationObserver to re-evaluate injection context'
    - 'chrome.alarms minimum interval 1 minute — sub-minute polling blocked'
    - 'Jira worklog visibility field can silently restrict manager fetches — document gap or warn when present'
    - 'Jira Cloud strict CSP — inline styles only for injected banner; no external fonts/blob URLs'
  uxMandates:
    - 'Treat each of the three surfaces as its own design brief, not sub-sections of one interface'
    - 'Dual-persona role-switching (worker vs manager in same extension) needs explicit context-switch UX in first 200ms of popup open'
    - 'Notification-to-action pipeline: popup must open pre-loaded with data when triggered by push'
    - 'Content-script banner on a Jira ticket page is a high-signal moment — design contextual pre-fill ("Log time for THIS ticket") rather than generic reminder'
    - 'Gap acknowledgment dialog deserves its own micro-interaction design — not punitive, not too-easy-to-dismiss'
---

# Product Requirements Document - jira-time-logger

**Author:** Note
**Date:** 2026-05-09

## How to read this PRD

This document is the binding spec for v1.0 of an internal Chrome extension that fixes Jira worklog management for a small dev team. It progresses from **vision and classification** (what we're building and why) through **success criteria, user journeys, domain and innovation patterns** (what winning looks like and what makes it special), into **scoping, functional requirements, and non-functional requirements** (the testable contracts downstream UX/architecture/dev work must honor). The Functional Requirements section (FR1–FR52) is the capability contract — anything not listed there will not exist in v1.0. Cross-references between sections are intentional; the PRD is best read top-to-bottom on first pass and consulted by section thereafter.

## Executive Summary

**jira-time-logger** is a Manifest V3 Chrome extension that turns Jira's worklog from a passive form people forget into an ambient, behavior-changing tool that small dev teams can use to log time daily and approve it monthly — all without operating a backend.

The product targets two co-equal personas inside the same organization:

- **Workers** (developers) need to log time accurately and consistently. Today they forget for days at a stretch, then guess at end of month. Native Jira hides daily totals, requires too many clicks, and never reaches out.
- **Managers** approve their reports' monthly timesheets so the data can feed accounting and resource planning. Today they have no aggregated view; they spot-check entries one at a time, and approval drags the entire month-end.

The extension solves both jobs with one cohesive product:

- An **always-visible badge counter** showing hours missing from the current week, an **inline banner injected into Jira pages** with daily-dismiss, and a **daily push notification** at a configurable time — collectively forcing daily attention without nagging.
- A **fast popup** that opens to a pre-filled ticket picker built by walking the user's reporting hierarchy in Jira (their tasks + their manager's tasks + skip-level's tasks, filtered to active/recent), so logging is review-and-adjust rather than reconstruct-from-scratch.
- A **weekly grid review surface** with red/green per-day cells, one-click PTO marking, and a submission flow that requires explicit gap acknowledgment.
- A **manager dashboard** rendering a person × Epic matrix for the cycle, with drill-down to per-ticket evidence and a one-click "Approve this person's cycle" action.

The architecture is **deliberately serverless**: the extension talks only to Jira Cloud via OAuth 2.0 (3LO + PKCE). Approval state is encoded as machine-format timestamped comments on the relevant Epics — Jira's own append-only comment timeline becomes the immutable approval ledger. No new schema, no central database, no ops burden.

This is an internal team tool, not a public Web Store launch. It assumes audit integrity is required (the data feeds accounting) but defers formal regulatory compliance to organizational governance — the data model must not foreclose those controls, but they are out of scope for v1.

### What Makes This Special

The product's moat is not any single feature — it's the **deliberate pairing of active reminder with at-a-glance overview**, both load-bearing. Removing either reduces the tool to "just use Jira directly."

Three concrete differentiators distinguish this from native Jira and from broader extensions like jira-assistant:

1. **Org-hierarchy-walked pre-fill.** The ticket picker is not a flat search; it's a 2-level browse tree built from the user's reporting line. This reflects the org's actual ownership pattern (Department → Epic, Manager → Task, Staff → Subtask) and turns blank-slate logging into one-click confirmation.
2. **Daily-cadence enforcement via three coordinated surfaces.** Badge counter + inline Jira banner + daily push notification together create ambient pressure that no passive logging tool can match. The user cannot forget for long; the deficit is always visible somewhere they're already looking.
3. **Approval-by-Epic-comment with timestamp anchor.** A novel serverless pattern: the manager's approval action posts a machine-format comment on each Epic that received hours that cycle, and the comment's native Jira timestamp *is* the approval anchor. Worklogs created or updated after that timestamp are automatically dirty/unapproved. Backdated logging works correctly. No new issues, no Confluence dependency, no schema changes, and no central state to maintain.

Beyond the feature set, two strategic factors make this the right build for this team at this time:

- **Bespoke fit.** Off-the-shelf SaaS (Tempo, Clockify, Toggl) must be generic; this tool fits the team's specific Jira hierarchy, catch-all task pattern, approval cycle, and cadence rules glove-tight. The team customizing for itself produces a better-fit tool than a vendor with 100× engineers.
- **Zero org-IT involvement.** Serverless means no procurement, no security review of a new vendor, no PII leaving Jira. A small team can install in 60 seconds and be operational the same day.

The future state when this succeeds: developers log daily in under a minute without being chased; managers approve a month in roughly five minutes by scanning the matrix and clicking once; accounting receives clean, on-time data automatically; the tool fades into invisible-but-present infrastructure, like email.

## Project Classification

| Dimension | Value |
|---|---|
| **Project Type** | `developer_tool` — Manifest V3 Chrome extension. Web tech stack but chrome_extension interaction model. Architectural decisions must be made per-surface (toolbar popup, content-script banner, options page), not globally. |
| **Domain** | `general` — internal productivity tool with accounting-adjacent data sensitivity. Audit integrity is a first-class requirement; formal regulatory compliance is out of scope for v1 but the data model must not foreclose it. |
| **Complexity** | `high` — two structurally-unmitigable risks (approval-comment protocol fragility, manager-view client-side fan-out vs Jira rate limits) plus MV3 service worker lifecycle complexity (OAuth 2.0+PKCE token refresh across worker restarts). Three coordinated UI surfaces with distinct interaction contracts add UX design weight. |
| **Project Context** | `greenfield` — no existing codebase. Brand-new build inspired by jira-assistant but architecturally distinct (no calendar integration, no report builder; has approval workflow + manager matrix + hierarchy pre-fill that jira-assistant lacks). |
| **Audience** | Small internal dev team (the author + teammates + their manager). Shareable but **not** intended for public Chrome Web Store launch. |
| **Primary Install Target** | The **worker** persona. Manager value is downstream of worker adoption; the vision sounds like a worker tool first, manager tool second. |

## Success Criteria

### User Success

**Worker persona — winning looks like:**

| What "winning" looks like | Measurable indicator |
|---|---|
| Logging becomes a daily reflex, not a Friday scramble | ≥ 80% of working days have time logged before EOD that day (rolling 4-week avg per user), measurable from worklog `created` vs `started` timestamps |
| Catch-up flow is faster than native Jira | Median **time-to-log** (popup open → worklog posted) ≤ **30 seconds** for a single ticket entry |
| Pre-fill carries the load | ≥ 70% of worklogs are posted against a ticket the **pre-fill picker surfaced** (vs typed/searched manually) |
| Gap discovery, not gap surprise | Worker discovers each week's gaps **at least 2 calendar days before submission deadline** (measurable from week-grid open events) |
| The "ah-ha" moment fires within first week | New worker installs the extension and within 7 days has had a "discovered gap → caught up in <2 minutes" sequence at least once |

**Manager persona — winning looks like:**

| What "winning" looks like | Measurable indicator |
|---|---|
| Approval becomes a 5-minute task, not a half-day chore | Median time from **opening manager dashboard → posting approval comments for one report** ≤ **5 minutes** |
| Approval done on time | ≥ 95% of reports' cycles approved within **3 working days** of cycle close |
| Confidence in the matrix | Manager opens drill-down evidence on ≤ 1 in 10 cells (most cells inspire enough trust to skip drill-in) |

### Business Success

| What "winning" looks like | Measurable indicator |
|---|---|
| The tool is adopted, not abandoned | ≥ 80% of team members are still actively using the extension **8 weeks** after install (active = ≥ 1 worklog posted via extension that week) |
| Accounting gets clean, on-time data | ≥ 95% of team-member-cycles approved before the **5th business day** of the following month |
| Forgetting drops materially | After 4 weeks of usage, **monthly logged-hours / expected-hours** ratio improves by ≥ 15 percentage points vs the 4 weeks before adoption |
| Zero org-IT involvement required to deploy | Tool is installed by all team members **without** going through procurement, security review, or enterprise extension-management. Validated by: zero IT tickets opened during rollout. |

### Technical Success

| What "winning" looks like | Measurable indicator |
|---|---|
| Popup feels instant | Popup p95 **time-to-interactive** ≤ **400 ms** when triggered from a daily-push notification (data must be pre-warmed by service worker) |
| Manager view scales to 12 reports / 50 Epics each | Full month manager matrix renders **first row within 2 s**, full matrix within **15 s**, even with cold cache |
| Auth survives MV3 worker restarts | Zero re-auth prompts in a 30-day continuous-use window, given a single OAuth grant |
| Approval-comment integrity | Versioned schema + checksum prevents 100% of misclassified worklogs in synthetic test set; manual comment edit triggers visible "corrupted comment" UI rather than silent miscount |
| Rate-limit resilience | Manager view never throws an unhandled rate-limit error to user; degraded experience (slower load, partial render) on rate-limit surge, full recovery within 60 s |
| Audit floor (Mary's commitments) | (a) Every worklog, edit, and approval has a queryable timestamp + actor in Jira; (b) tool itself never deletes user data; (c) access control documented in PRD (worker sees own only; manager sees direct reports only via Jira's permission model) |

### Measurable Outcomes

The headline North Star metric is **monthly logged-hours / expected-hours ratio** at the team level, measured before and after adoption. A successful v1.0 lifts this ratio by ≥ 15 percentage points within 4 weeks of full team rollout.

Secondary outcomes that confirm the vision is being delivered:

- **Median worker time-to-log ≤ 30 s** (proves the catch-up flow is faster than native Jira)
- **≥ 80% of working days logged before EOD** (proves the daily-cadence enforcement is working)
- **≥ 95% of cycles approved by 5th business day of following month** (proves the manager view collapses approval time)
- **Zero IT tickets during rollout** (proves the serverless / zero-org-friction architecture pays off)
- **Zero re-auth prompts in 30-day window** (proves the OAuth + MV3 lifecycle is stable)

## Product Scope

### MVP — Minimum Viable Product (v1.0)

**Auth & Setup:**
- OAuth 2.0 (3LO + PKCE) "Connect to Jira" with Atlassian Cloud `accessible-resources` site picker
- Settings on a separate Chrome options page: manager username, skip-level username, catch-all task IDs (Admin / Meetings / PTO), notification time, work-day target (default 8 h), approval cycle (default monthly)
- Token lifecycle persisted in `chrome.storage.local`; refresh proactively via `chrome.alarms`; concurrency guard via `chrome.storage.session`

**Daily Surfaces (always-on, glanceable):**
- Toolbar **badge counter** showing hours-missing-this-week (single integer)
- **Inline Jira banner** on `*.atlassian.net` pages with daily-dismiss; contextual pre-fill if user is on a specific ticket page
- **Daily push notification** at configured time → opens pre-warmed popup

**Logging Surface (popup):**
- Today view: today's entries + total + remaining
- Quick-log: pre-fill ticket picker (2-level browse tree from hierarchy walk: my + manager + skip-level tasks, filtered to active/in-progress, recently updated)
- Catch-all picker (Admin / Meetings / PTO)
- One-click PTO mark on a day

**Weekly Review Surface (popup):**
- 7-day grid with red/green per-day cells
- Inline edit hours, add/remove tickets
- Submit Week button → gap-acknowledgment dialog if any day < 8 h and not PTO; otherwise marks week submitted (pure local UX flag)

**Manager View (popup, separate route):**
- Person × Epic matrix for current cycle
- Cell coloring (red if any day below target & not PTO)
- Drill-down → per-ticket evidence list with hours
- "Approve [Person]'s [Cycle]" → fan-out: posts versioned-checksum approval comment (tagged `user=<person>, by=<this manager>, cycle=<cycle>`) to each Epic that *this person* logged hours against during the cycle. Other people's worklogs on the same Epics are untouched and remain the responsibility of their own managers.
- Dirty-detection (worklog `updated > approval_ts`)

**Reliability & Audit (party-mode-derived):**
- Versioned approval-comment schema (`v=1`) with checksum, comment-id secondary lookup, "newest wins" duplication rule, fail-closed parser
- Client-side token-bucket rate-limit scheduler (~40 LOC) with progressive row-by-row UI render, respect `Retry-After`
- Aggressive cache for closed cycles (TTL-keyed in `chrome.storage.local`)
- Storage quota check + eviction strategy on write
- CSP-safe banner injection (inline styles only; no external fonts / blob URLs)
- SPA navigation re-injection via `popstate` + MutationObserver
- Worklog visibility-field warning when restricted entries are silently omitted from manager view

### Growth Features (Post-MVP, ~v1.1–v1.5)

- Color-graded badge (yellow/red ramp before deadline)
- Pre-deadline notification escalation
- "Last logged X days ago" staleness indicator
- Smart hour-suggestion heuristics (last-week pattern, time spent on ticket pages, comment-activity-weighted)
- PAT / basic-auth fallback for Jira Server / Data Center users
- Auto-detect manager from Jira user fields (eliminate one-time config)
- Per-day budget detection (auto-detect non-work days from holidays)
- Personal monthly summary export (CSV/PDF for the worker's records)
- Re-approval flow when manager edits past cycle

### Vision (Future)

- Confluence-page export of approved months for human-readable archive
- Cross-app pre-fill enrichment (git commits, calendar events, Slack mentions)
- Multi-Jira-instance support
- Public Chrome Web Store launch
- Mobile companion (PWA) for "log on the go"
- Anonymized team-level analytics (most logged Epics, average daily hours, etc.)

## User Journeys

### Personas

- **Worker — Priya:** Senior engineer, 4 years at the org. Logs time in Jira sporadically. Cares about getting it done fast and not being chased.
- **Manager — Marco:** Engineering manager, 7 direct reports (including Priya). Approves monthly timesheets that feed accounting. Currently spends ~3 hours every month chasing people and spot-checking entries one at a time.

### Journey 1 — Priya's First Install (Worker, Onboarding Happy Path)

**Opening scene:** Tuesday, 2:14 PM. Priya is between meetings, has 16 minutes. She clicks the install link a teammate sent in Slack (sideloaded CRX file). Chrome warns her about an unpacked extension; she shrugs and accepts.

**Rising action:** The extension's options page opens automatically in a new tab. There's one big button: **"Connect to Jira."** She clicks it. A Jira OAuth window pops up — she's already logged into Jira Cloud, so it's two clicks: "Allow access" and a site picker (her org has only one site). Window closes. Back on the options page, four small dropdowns ask: *who's your manager?*, *who's their manager?*, *which Jira task is your "Admin" bucket?*, *which is your "Meetings" bucket?*. She fills them — autocomplete helps. The form saves automatically.

**Climax:** A notification slides in from Chrome: *"You're set up. Here's where things stand."* She clicks. The popup opens. The badge on her toolbar reads `24h` in red — that's the deficit since Monday morning. The popup shows a 7-day grid with Mon/Tue mostly empty. Below the grid: "Tickets you might have worked on this week" — a list of 6 of her assigned subtasks plus 3 of her manager's tasks, all with one-click "Add to today" buttons.

**Resolution:** Priya logs 4h on PROJ-123 and 4h on PROJ-455 for Monday in under 30 seconds. The badge drops to `16h`. She closes the popup. She'll deal with the rest tomorrow. Tomorrow she will, because the badge is staring at her.

**Capabilities revealed:** OAuth setup with site picker · options page (manager / skip-level / catch-all task IDs) · badge counter on first sync · weekly grid pre-populated from hierarchy walk · quick-log via pre-fill picker · welcome notification on first connect.

### Journey 2 — Priya's "Ah-Ha" Moment (Worker, Daily Discovery)

**Opening scene:** Thursday, 11:47 AM. Priya is opening Jira ticket PROJ-789 — a teammate's PR she's been asked to review. As the page loads, a thin teal banner slides in at the top of the Jira UI: *"📊 6 hours unlogged this week — log now."* On the right side of the banner: *"Log review time on PROJ-789?"* (because the extension noticed she's looking at this ticket).

**Rising action:** Priya pauses. She didn't realize she was 6 hours behind. *"Oh — I haven't logged Wednesday at all."* She clicks the contextual button: "Log review time on PROJ-789." A small inline panel expands inside the banner with two fields: hours, date. She types `1h`, picks "Yesterday" from the date dropdown, hits Enter. Panel closes. Banner now says: *"📊 5 hours unlogged this week."*

**Climax:** *"Might as well finish Wednesday."* She clicks the toolbar icon — popup opens *immediately*, pre-populated with Wednesday's view. Her assigned subtasks for the week are listed; she taps three of them, distributing 7 more hours across them. The badge drops to `0h`. She closes the popup.

**Resolution:** Total time: 90 seconds. Wednesday is now whole. Priya feels something rare — *relieved* about a timesheet. She goes back to reviewing PROJ-789, the banner now collapsed (it auto-dismisses after action and stays hidden for the rest of the day).

**Capabilities revealed:** inline Jira banner with daily-dismiss + context-aware ticket pre-fill · banner-embedded quick-log (no popup needed) · popup pre-warms data via service-worker background sync · backdated entry flow (date picker on logging surface) · badge recomputes in real time · banner auto-collapses after action.

### Journey 3 — Priya's Friday Weekly Review (Worker, Submission)

**Opening scene:** Friday, 4:22 PM. Daily push notification fires: *"Log today's time."* Priya clicks it. Popup opens to the daily logger. She logs today's 7 hours quickly. Badge drops to `1h` — she's a little under target.

**Rising action:** She switches to the **Week** tab in the popup. The 7-day grid shows Mon=8, Tue=8, Wed=8, Thu=4 (red), Fri=7 (red). Thursday is half logged. She remembers — Thursday afternoon she was at a dental appointment. She **clicks Thursday's column header**; a small popover opens with three actions: *Mark full-day PTO (8h)*, *Mark half-day PTO (4h)*, *Add a worklog*. She picks **half-day PTO**. The cell turns green. Friday is at 7h; she shrugs and clicks **Submit Week**.

**Climax:** A confirmation dialog appears: *"Friday is 1 hour below your 8h target and not marked as PTO. Submit anyway?"* Priya thinks. The team's culture is that occasional 7h Fridays are fine. She clicks **Yes, submit anyway**. The grid grays out, a small confirmation chip says *"Week submitted."* The badge drops to `0h`.

**Resolution:** Priya closes Chrome, leaves for the weekend. The data is now sitting in Jira awaiting Marco's monthly approval. She doesn't think about it again until next Tuesday morning when the badge ticks up to `8h` for the new week.

**Capabilities revealed:** daily push notification → popup · weekly grid view with per-day red/green coloring · **click-cell-header → popover with PTO/log actions** (no right-click; explicit and discoverable) · half-day PTO support (4h) · Submit Week with **gap acknowledgment dialog** (cannot silently submit incomplete data) · submission as pure local UX flag (week grays out client-side; no Jira mutation) · badge resets and re-arms for next week.

### Journey 4 — Marco's Monthly Approval (Manager, End of Cycle)

**Opening scene:** Monday, 1st of the month. Marco gets the same daily push notification all his reports get — log your time. He logs his own week first (the popup default-opens to worker mode). Then he switches to the **Manager** view via a clearly labeled tab in the popup.

**Rising action:** A grid renders progressively: rows are his 7 reports, columns are the 4 Epics that received hours from anyone last month. Rows render as data fetches complete; first row shows in 1.4 seconds, full grid in 9 seconds. Most cells are green. Two are red — Sarah has a partial Tuesday in week 3, and Vinod has a fully empty Friday. One cell has a yellow striped pattern — Priya's row × PROJ-455 column shows *"approved last cycle, but worklogs edited since."*

**Climax:** Marco clicks Sarah's red cell. Drill-down opens: list of every ticket Sarah logged hours against last month, with hours per ticket. He sees Tuesday's gap is ½ day; Sarah's pattern across the rest of the week is normal. He decides to ping her on Slack quickly: *"Tuesday — vacation? PTO?"* Sarah replies in 2 minutes — yes, she forgot to mark it. She marks it from her popup; Marco refreshes; cell turns green. He repeats for Vinod's empty Friday (also unmarked PTO). Then for Priya's striped cell — he clicks "Re-approve," confirms the new totals match expectations, posts the updated approval comment.

**Resolution:** Marco clicks **"Approve [Sarah]'s [Cycle]"** — fan-out happens, comments post to all relevant Epics, the row turns dark green ("approved"). He repeats for the other 6 reports. Total elapsed time: 11 minutes (he was fast; the slow part was waiting for Sarah's Slack reply). Accounting receives clean data on Day 1 instead of Day 12. Marco's calendar regains 2.5 hours.

**Capabilities revealed:** manager view as a separate tab/route in the same popup as worker view · person × Epic matrix with progressive row-by-row render · cell coloring: green / red / yellow-striped (re-approval needed) · drill-down to per-ticket evidence list with hours · Approve action: per-Epic fan-out of versioned-checksum comments · re-approval flow for dirty (post-approval-edited) cells · Day-1-of-month workflow timing.

### Journey 5 — Marco's Spot-Check Spiral (Manager, Edge Case)

**Opening scene:** Same monthly review session. Marco opens drill-down on Vinod × PROJ-789 cell — looks high (45h) compared to the team's pattern.

**Rising action:** Drill-down list shows 6 Vinod subtasks under PROJ-789, totaling 45h. At the top of the drill-down panel, a small warning chip: *"⚠ 1 worklog with restricted visibility was excluded from this view."* Marco hovers — tooltip explains: *"Vinod has a worklog with team-restricted visibility on PROJ-789-SUB-44 that you don't have permission to see. This may make the totals appear lower than reality."* He thinks for a moment.

**Climax:** Marco decides this isn't worth blocking the approval on. He clicks "Approve Vinod's cycle" — the fan-out posts comments to PROJ-789 and the other Epics, the row turns dark green. The warning chip is captured in the approval comment metadata so any future audit can reconstruct what data Marco saw vs. didn't see at the time of approval.

**Resolution:** Approval proceeds; the audit trail is honest about the visibility limitation. If accounting later spots a discrepancy, the comment metadata makes it traceable.

**Capabilities revealed:** **worklog visibility-field handling** — detect restricted entries, warn the manager rather than silently omit · approval comment metadata captures "data integrity caveats at time of approval" (which entries were visible / restricted / dirty) · visible degradation — tool admits what it doesn't know rather than pretending omniscience.

### Journey Requirements Summary

| Capability area | Driving journeys |
|---|---|
| OAuth setup & options page | J1 |
| Hierarchy-walk pre-fill picker | J1, J2 |
| Toolbar badge counter (live deficit) | J1, J2, J3 |
| Inline Jira banner with context-aware quick-log | J2 |
| Popup quick-log with backdating | J1, J2 |
| Weekly grid review with per-day coloring | J3, J4 (manager variant) |
| **Click-cell-header popover** for PTO marking and per-day actions | J3 |
| Half-day PTO (4h) and full-day PTO (8h) | J3 |
| Submit Week with gap acknowledgment | J3 |
| Daily push notification → pre-warmed popup | J3 |
| Manager view: person × Epic matrix, progressive render | J4 |
| Drill-down: per-ticket evidence list | J4, J5 |
| Approve action: per-Epic comment fan-out (versioned schema + checksum) | J4 |
| Dirty-detection (yellow-stripe) + re-approval flow | J4 |
| Worklog visibility-field warning + audit-honest approval metadata | J5 |
| Worker/Manager mode-switching in same popup | J4 |

## Domain-Specific Requirements

This is an internal team tool. The data it produces eventually feeds accounting, so we care about it being trustworthy — but this is not a compliance product, and the requirements below stay deliberately practical.

### Audit & Trust Basics

The team needs to trust the data. These are baseline behaviors, not formal compliance commitments:

- **Trust Jira's history, don't reinvent it.** The extension never keeps a separate audit log. Every worklog, edit, and approval lives in Jira's native timeline (worklogs and Epic comments), which is append-only. If someone needs to know "who logged what, when," Jira already has the answer.
- **Approval comments are versioned and checksummed.** A future extension release shouldn't accidentally misread an older comment, and a manual edit to an approval comment shouldn't silently change history. The parser detects format drift and surfaces a "this comment was modified" warning rather than misinterpreting it.
- **The tool never deletes user data.** No worklogs, no comments. If a user wants to clean up local cache, they can do it from the options page; Jira-side data is theirs to manage in Jira.

### Access Control

Access control is **inherited from Jira** — the extension never elevates, aggregates, or bypasses anything:

- A worker reads and modifies only their own worklogs (Jira-enforced).
- A manager reads worklogs of users they have permission to view in Jira, and posts approval comments on Epics they have comment permission for.

Our org uses **company-managed Jira projects**, so a manager normally has visibility into all their direct reports' work by default. In the rare case where a project's permissions are tighter than expected, the manager can request access through normal Jira channels. The extension surfaces the gap honestly (see "Worklog visibility handling" below) so it's clear *why* a number looks low, rather than silently showing wrong totals.

**Canonical manager per user (v1.0 assumption).** The org has matrixed reporting (a worker may have both a people manager and a project manager), but v1.0 assumes **exactly one canonical manager per user** — the one set in that user's options page. Only the canonical manager can post approval comments for that user. Other "managers" who happen to have visibility into the worker's data can open the manager view and *read* the matrix, but the "Approve" action is disabled for them with an explanatory tooltip. Matrixed approval (multiple legitimate approvers per user-cycle) is deferred to a future release; if it becomes necessary, the existing `(user, cycle)` "newest wins" rule already resolves duplicate comments deterministically and provides a forward-compatible fallback.

### Data Integrity Patterns

These are practical behaviors that keep the data honest:

- **Worklog visibility handling.** Jira worklogs may carry a `visibility` field restricting them to a project role or group. When the manager view encounters a restricted worklog the manager can't see, it warns explicitly ("⚠ N worklog(s) with restricted visibility were excluded from this view") rather than silently omit. The count is captured in the approval-comment metadata so the audit trail reflects what data was actually visible at approval time.
- **Dirty-data semantics (per-user, per-cycle).** Any worklog whose `updated` timestamp is later than the matching approval comment's timestamp is automatically flagged as dirty. The match is on `(user, cycle)` — Note's worklogs are evaluated against the comment tagged `user=note, cycle=Y`, Sarah's against `user=sarah, cycle=Y`. Other approval comments on the same Epic are ignored when evaluating a given user's status. Manager view paints dirty cells with yellow striping; worker view shows the same. Approval is never silently invalidated — it's explicitly re-required.
- **Backdated logging is a feature.** A worklog logged Friday for Tuesday uses Jira's `started` field for date attribution and the native `created` field for posting time. The approval anchor compares against `created`/`updated`, so backdated worklogs posted before approval count toward the cycle, and backdated worklogs posted after approval are correctly flagged dirty.

### Forward-Compatibility

These are out of scope for v1.0 but the data model should not foreclose adding them later:

- HR system integration (export to HRIS, sync with leave management)
- Multi-team rollup reporting for senior leadership
- Worker self-service data export (CSV/PDF of approved cycles)
- Future timesheet-format export for payroll systems

The approval-comment schema includes a `v` (version) field from day one so the format can evolve while keeping older comments parseable. v1.0 will not write data into Jira in any way that a future version can't read or migrate.

### Explicit Non-Goals (v1.0)

To keep scope tight, the tool deliberately does **not**:

- Act as a system of record for time-and-pay data — Jira is the record; this is a UX layer over Jira's worklogs
- Generate payroll-format timesheets (deferred to v2+)
- Enforce time-tracking policies beyond the per-day target and the gap-acknowledgment dialog
- Detect or prevent fraudulent time entries — the manager's approval step is the fraud-prevention surface
- Replace or augment Jira's permission model

## Innovation & Novel Patterns

The product as a whole is an excellent-execution play, not a research project. One mechanism, however, is genuinely novel for this problem class and deserves explicit attention because it carries both the greatest leverage and the greatest fragility.

### Detected Innovation Area: Approval-by-Epic-Comment with Timestamp Anchor

Most timesheet-approval systems store approval state in a dedicated state field on a dedicated record — a "timesheet" row with a status enum, a "submission" entity, an "approval workflow" engine. All of those require either (a) a backend service that owns the state machine, or (b) a custom data structure inside the host system (custom Jira fields, a Confluence page, a dedicated `TIMESHEET` project, etc.).

This product introduces a different pattern: **approval state is encoded as a machine-format comment on the relevant Epic, and the comment's own native timestamp is the approval anchor.** Worklogs created or updated after the anchor are dirty; worklogs created or updated before are approved. The state machine is implicit in time itself.

**Approval scope is `(user, cycle)`, not `(Epic, cycle)`.** This is critical: a single Epic can host work from people across multiple teams reporting to multiple managers. The same Epic therefore carries multiple approval comments concurrently — one per `(user, cycle)` pair — each anchored by its own posting manager's timestamp. Manager-X's approval of Note's May covers only Note's worklogs on this Epic; Sarah's hours on the same Epic remain unapproved until Manager-Y posts her approval comment. No cross-team coordination is required, and cross-team Epics work naturally without special handling.

This pattern enables three things that the conventional approach can't:

1. **True serverlessness.** The extension and Jira are the only two systems involved. There is no third place that holds approval state.
2. **Backdated logging works correctly without special handling.** A worklog logged Friday for Tuesday counts toward the cycle if posted before approval, and is automatically dirty if posted after. The logic is the same comparison either way.
3. **Zero schema changes to Jira.** No custom fields, no admin configuration, no project setup. The extension can be installed by a user who has no admin privileges on the Jira instance.

### Validation Approach

The pattern is novel, which means it has not been battle-tested at scale. v1.0 validates it through three mechanisms:

- **Versioned, checksummed comment schema** so format drift between extension versions is detectable, not silent.
- **Comment-id secondary lookup** so a manually-edited comment body is detectable by re-fetching by ID and comparing.
- **"Newest wins" duplication rule** explicitly documented in a `PROTOCOL.md` so duplicate or out-of-order writes resolve deterministically. The rule is scoped to the same `(user, cycle)` pair: two comments on one Epic for *different* users are not duplicates and must coexist.

Beyond the technical safeguards, the v1.0 rollout is to a single small team (the author + teammates + their manager). This deliberately keeps blast radius small while the pattern proves itself in real use.

### Risk Mitigation

The pattern's main fragility is that it stores machine-state in user-editable plaintext. Three mitigations:

- **Fail-closed parser.** Any comment that doesn't match the schema is treated as non-approval, surfacing an explicit "comment corrupted" warning rather than silently misclassifying worklogs.
- **Manual deletion is detectable, not catastrophic.** If a user deletes the approval comment, the next manager view shows the cycle as unapproved. Recovery is to re-approve. No data is lost — only the approval marker is.
- **Fallback path exists.** If the pattern proves too fragile in practice, the architecture cleanly accommodates migration to either (a) a dedicated `TIMESHEET` Jira project with anchor issues per person per cycle (state machine via Jira workflow transitions), or (b) a Confluence-page-per-cycle approach. Both were considered and rejected for v1.0 in favor of the lighter pattern, but neither is precluded.

### Market Context

The reference project (jira-assistant) provides extensive worklog management features but does not implement an approval workflow at all. Other Jira time-tracking tools (Tempo, Clockify integrations) implement approval via dedicated backends and custom fields. To the team's knowledge, no existing tool encodes approval state purely as Jira comments with timestamp anchoring — the pattern is a deliberate trade-off for serverless deployment in a small-team context, not a universally-better approach.

## Chrome Extension Specific Requirements

This product is a Manifest V3 Chrome extension. The CSV-default `developer_tool` template targets SDKs and libraries; the requirements below are adapted to the actual project shape — a browser extension whose users are developers.

### Browser Support Matrix (v1.0)

| Browser | Status | Notes |
|---|---|---|
| Chrome (stable) | ✅ Primary target | Manifest V3, all features |
| Edge (Chromium) | ✅ Primary target | Same MV3 codebase; explicit test pass before each release |
| Chrome (beta/canary) | 🟡 Best-effort | No regressions accepted but not actively tested |
| Firefox | ❌ Out of v1.0 | MV3 partial support; uses different `browser.*` namespace |
| Safari | ❌ Out of v1.0 | Different extension architecture entirely |

Rationale: the team is on Chrome and Edge. Both ship the same MV3 codebase but Edge gets explicit pre-release validation because it is a primary target, not a happy accident. Firefox/Safari are growth-phase considerations.

### Manifest V3 Surface Inventory

The extension has **four** runtime surfaces, each with its own interaction contract:

| Surface | Purpose | Lifecycle |
|---|---|---|
| **Toolbar popup** | Daily/weekly logging UI; manager view | Ephemeral — opened on click or notification, closed on blur |
| **Content script** | Inline banner injected into `*.atlassian.net` pages | Lives as long as the host Jira tab; re-injects on SPA navigation |
| **Options page** | First-run setup; ongoing settings | Tab-based; user-initiated, patient context |
| **Background service worker** | Badge counter updates, OAuth refresh, push-notification scheduling, popup data pre-warm | Wakes on alarms/events, killed by Chrome between events |

Each surface communicates via the extension's standard message-passing APIs. There is **no shared in-memory state** — anything that needs to persist across surfaces lives in `chrome.storage.local` (durable) or `chrome.storage.session` (cleared on browser close, used for things like the OAuth `refreshInFlight` mutex).

### Required Permissions (with justification)

Each permission in the manifest must justify itself; no "just-in-case" permissions:

| Permission | Why it's needed |
|---|---|
| `identity` | OAuth 2.0 flow via `chrome.identity.launchWebAuthFlow` |
| `storage` | Token, settings, cache persistence |
| `alarms` | Scheduled badge refresh, daily push notification, OAuth proactive refresh |
| `notifications` | Daily push notification → opens popup |
| `host_permissions: ["https://*.atlassian.net/*"]` | Content script injection (banner) and Jira API calls |
| `host_permissions: ["https://api.atlassian.com/*"]` | OAuth token exchange and `accessible-resources` lookup |

Permissions explicitly **not** requested: `tabs`, `webRequest`, `cookies`, `bookmarks`, `history`, `downloads`. The extension does not need broad browsing context — only its specific Jira surface.

### Distribution & Update Model

**v1.0 distribution:** sideloaded `.crx` file shared in the team's internal **Microsoft Teams** channel. Each user installs by enabling Developer Mode in `chrome://extensions` (or `edge://extensions`) and dropping in the file.

**Update mechanism for v1.0:** manual. When a new version is released, the team posts the new `.crx` to Teams and users re-install. Acceptable for ~10 internal users; not scalable.

**Update mechanism for v1.x+:** consider hosting the extension via a private update URL in the manifest (self-hosted update XML) or via Microsoft Edge / Google Chrome Enterprise managed-extension policies. Deferred from v1.0 because manual works for the launch audience and avoids any infrastructure beyond a Teams file share.

**Schema migration discipline:** because users may run different extension versions concurrently during a rollout window, the approval-comment schema's version field (`v=1`, `v=2`, ...) is the contract. A v2 extension must read v1 comments correctly; a v1 extension must reject (not crash on) v2 comments. Migration logic lives in a single `comment-schema.ts` module with explicit version-handling tests.

### External API Contract Stability (Jira Cloud)

The extension depends on Jira Cloud's REST API v3 — specifically:

- `GET /rest/api/3/myself` (current user)
- `GET /rest/api/3/user/search` (user lookup for manager configuration)
- `GET /rest/api/3/search` (issue search via JQL for hierarchy walk)
- `GET /rest/api/3/issue/{issueIdOrKey}/worklog` (paginated worklog read)
- `POST /rest/api/3/issue/{issueIdOrKey}/worklog` (create worklog)
- `PUT /rest/api/3/issue/{issueIdOrKey}/worklog/{id}` (edit worklog)
- `GET /rest/api/3/issue/{issueIdOrKey}/comment` (read approval comments)
- `POST /rest/api/3/issue/{issueIdOrKey}/comment` (post approval comment)
- `GET /accessible-resources` on api.atlassian.com (cloudId picker)

These endpoints are stable and documented. Atlassian provides a deprecation policy; the extension's wrapper module isolates API calls so that a future API version migration is a single-file change.

**Rate limit handling:** Jira Cloud uses a cost-budget model with `X-RateLimit-*` and `Retry-After` headers. The extension implements a client-side token-bucket scheduler (~40 LOC) that respects these headers. No request fires that would predictably exhaust the budget; Retry-After is always honored.

### Inter-Surface Messaging Architecture

| From → To | Channel | Use case |
|---|---|---|
| Popup → Service Worker | `chrome.runtime.sendMessage` | "Refresh badge", "Fetch this week's data" |
| Service Worker → Popup | `chrome.runtime.sendMessage` (when popup open) | Push fresh data after refresh |
| Content Script → Service Worker | `chrome.runtime.sendMessage` | Banner action: "Log time on this ticket" |
| Service Worker → Content Script | `chrome.tabs.sendMessage` | Update banner state (e.g., new deficit) |
| Options Page → Service Worker | `chrome.runtime.sendMessage` | Save settings, trigger initial sync |
| Notification click → Popup | `chrome.action.openPopup()` | Daily push opens popup |

All messages use a tagged-union type system in TypeScript so the sender and receiver share a strict contract. Messages are fire-and-forget where possible; request/response messages use a correlation ID and timeout.

### Documentation Expectations (v1.0)

For an internal team of ~10 users, documentation is intentionally minimal:

- **README.md** in the source repo: install instructions, settings reference, troubleshooting top-3 issues
- **PROTOCOL.md** in the source repo: approval-comment schema spec (versioned), dirty-detection semantics, parser contract
- **Inline UI help**: tooltips on settings page, brief intro screen on first-run
- **No standalone user manual, no video walkthroughs, no public docs site** — these are growth-phase artifacts

### Implementation Considerations Already Locked

The following implementation patterns were established in the brainstorming and party-mode sessions and are non-negotiable for v1.0:

- **OAuth 2.0 + PKCE** via `chrome.identity.launchWebAuthFlow` for Jira Cloud auth; PAT fallback explicitly deferred to v1.x
- **Token lifecycle**: persist `{access_token, refresh_token, expires_at, cloudId}` in `chrome.storage.local`; refresh proactively via `chrome.alarms` (1-min minimum interval acceptable); `refreshInFlight` mutex flag in `chrome.storage.session`
- **CSP-safe banner injection**: inline styles only; no external fonts, no `blob:` URLs (Jira's CSP blocks them)
- **SPA-aware re-injection**: content script listens to `popstate` events and uses a MutationObserver on Jira's title bar to re-evaluate injection context across single-page navigations
- **Storage quota awareness**: `chrome.storage.local` 10 MB ceiling enforced via a quota check on every cache write, with eviction of oldest closed-cycle data first
- **Versioned comment schema with checksum**: every approval comment carries `v=1` and a checksum; parser fails closed on any deviation

## Project Scoping

This product ships as a **single release (v1.0)** rather than a phased rollout. The brainstorming session explicitly rejected staged delivery ("I'll do this all in one go") because the value proposition has two load-bearing halves — active reminder and weekly/monthly overview — that must both work for the tool to outperform native Jira. Shipping half the product early would not deliver early value; it would deliver no value.

### Strategy & Philosophy

**Approach:** Single-release MVP optimized for **internal team validation**.

The chosen MVP philosophy is *experience MVP* rather than problem-solving or platform MVP — the tool's whole job is to change worker behavior (from forgetting to logging) and collapse manager approval time. That requires the full daily/weekly/monthly loop to be present from day one, not just a single feature surfaced in isolation.

**Resource Requirements:** The work is sized for a small dev effort (roughly four weeks of evening / weekend work by the primary author, with optional teammate support). The high-complexity classification is absorbed by tight scope and disciplined cuts already documented in the "Explicitly Out of MVP" list.

### Complete Feature Set (v1.0)

The full v1.0 feature inventory is documented above under **Product Scope > MVP** — auth, daily surfaces, logging surface, weekly review, manager view, and reliability/audit patterns. Rather than duplicate that list, this section calls out the **must-have / nice-to-have within v1.0** priority split:

**Must-have for v1.0 (the tool fails without these):**

- OAuth 2.0 connect flow (without it, no data access)
- Toolbar badge counter (without it, no ambient reminder; loses half the value prop)
- Quick-log via pre-fill picker (without it, the tool is slower than Jira itself)
- Weekly grid review with red/green coloring (without it, no overview value prop)
- Daily push notification (without it, the daily-cadence enforcement collapses)
- Manager view: person × Epic matrix + drill-down (without it, the approval flow has nowhere to live)
- Approval-by-Epic-comment with timestamp anchor, scoped per `(user, cycle)` (without it, no approval workflow; per-user scoping is what makes cross-team Epics work)
- Submit Week with gap acknowledgment (audit floor — must not silently submit incomplete data)
- Versioned + checksummed approval-comment schema (data-integrity floor)
- Token-bucket rate-limit scheduler (without it, manager view is unreliable on real-world data)

**Nice-to-have within v1.0 (ship if time permits, defer if not):**

- Inline Jira banner on `*.atlassian.net` pages
  - *Defer trigger:* if MV3 content-script CSP / SPA re-injection prove harder than scoped, ship without the banner; the badge + push still cover daily presence, just less visibly.
- Click-cell-header popover for half-day PTO marking
  - *Defer trigger:* if the popover UX needs more iteration, ship full-day-only PTO and add half-day in a v1.0.x patch.
- Worklog visibility-field warning + audit-honest approval metadata
  - *Defer trigger:* if no team member has restricted-visibility worklogs in practice, ship without the warning surface and add when first needed.

The "must-have" list is intentionally aggressive because cutting any of those items would reduce the tool to "just use Jira directly." The "nice-to-have within v1.0" list is the realistic cut surface during build if estimates prove optimistic.

**Beyond-v1.0 features** are documented above under **Product Scope > Growth Features (Post-MVP)** and **Product Scope > Vision (Future)**. They are not "phase 2" of a phased rollout — they are explicit deferrals that may or may not ever be built, depending on how v1.0 lands.

### Risk Mitigation Strategy

**Technical Risks:**

1. **Approval-comment protocol fragility (Risk: HIGH).** Mitigation: versioned-checksum schema from day one, fail-closed parser, "newest wins" duplication rule **scoped to `(user, cycle)` pair** so cross-team Epics with multiple managers' approval comments coexist correctly. Comment-id secondary lookup so manual edits are detectable. Architectural fallbacks (dedicated TIMESHEET project, Confluence per-cycle page) are documented but not built — they exist as migration paths if the primary pattern proves untenable in real use.

2. **Manager view fan-out vs Jira rate limits (Risk: HIGH).** Mitigation: client-side token-bucket scheduler (~40 LOC) honoring `Retry-After` headers, aggressive caching of closed-cycle data (immutable, cache-once), progressive row-by-row UI render so partial data is visible while remaining rows fetch. Acceptance criterion: manager view never throws an unhandled rate-limit error to the user; degraded experience always recovers within 60 s.

3. **OAuth in MV3 service worker lifecycle (Risk: MEDIUM).** Mitigation: persist `{access_token, refresh_token, expires_at, cloudId}` to `chrome.storage.local` on every write; proactive refresh via `chrome.alarms`; `refreshInFlight` mutex flag in `chrome.storage.session` to prevent concurrent refresh races; atomic write of rotated refresh token.

**Adoption / "Market" Risks (internal team adoption):**

The tool is for an internal team, not a market launch. The relevant risks are about adoption inside the team:

- *Will workers actually use it daily?* Mitigation: badge counter + inline banner make non-use visible; daily push reframes logging as a daily task. Validated by the success criterion: ≥ 80% of working days logged before EOD by week 4.
- *Will the manager actually use the matrix view?* Mitigation: the approval workflow only works through the matrix view, so any cycle that gets approved validates manager engagement. If managers approve via raw Jira instead, the tool has failed; success criterion catches this (≥ 95% of cycles approved within 3 working days through the extension).
- *Will the team's Jira admin push back on approval comments?* Mitigation: the comments are scoped to Epics already part of the team's normal workflow, are clearly machine-format, and are auditable. If admin pushback occurs, the fallback architectures (TIMESHEET project, Confluence) exist.
- *Matrixed reporting confusion.* Mitigation: v1.0 assumes one canonical manager per user (configured in settings); other managers can read but not approve. The constraint is explicit in the Domain section. If matrixed approval becomes necessary, the `(user, cycle)` "newest wins" rule provides a forward-compatible fallback.

**Resource Risks:**

- *Author becomes unavailable mid-build:* the project should remain comprehensible to a teammate via README + PROTOCOL + tagged-union message-passing types. No tribal knowledge required to pick up partial work.
- *Estimate overrun:* the "nice-to-have within v1.0" list is the pre-agreed cut surface. The "must-have" list is non-negotiable; cutting from it would invalidate the v1.0 value proposition.
- *Rollout overrun:* manual `.crx` distribution via Microsoft Teams is acceptable for ≤ 10 users. If the tool grows beyond that scale, invest in a private update URL or managed-extension policy *before* expanding the user base, not after.

## Functional Requirements

The capabilities below are the binding contract for v1.0. They are implementation-agnostic — each can be tested as "exists" or "does not exist" by observable behavior. UX, architecture, and story breakdown work downstream of this list.

### Authentication & Connection

- **FR1:** Worker can connect their Jira Cloud account via a single OAuth 2.0 (3LO + PKCE) connect action.
- **FR2:** Worker can pick which Jira Cloud site to connect to when they have access to more than one site.
- **FR3:** Worker remains authenticated across browser sessions without re-entering credentials, until the OAuth grant is revoked or expires.
- **FR4:** Worker's access tokens are refreshed automatically and silently before expiry; rotated refresh tokens are persisted atomically.
- **FR5:** Worker can disconnect their Jira account and clear all locally stored credentials and cached data from the options page.

### Time Logging

- **FR6:** Worker can log time against any Jira **subtask** they have permission to log against. Worklogs against tasks/stories/Epics directly are not supported — this enforces the org-wide agreement that all time is recorded at the subtask level.
- **FR7:** Worker can log time for the current day or any past day within the current approval cycle.
- **FR8:** Worker can pick a subtask from a 2-level browse tree (Task → Subtask) populated by walking their reporting hierarchy: Tasks/subtasks they own, Tasks owned by their canonical manager, and Tasks owned by their skip-level — filtered to active/recently-updated.
- **FR9:** When a worker selects a Task in the picker that does not yet have a subtask assigned to them, the picker offers a "+ Create my subtask under this Task" action that prompts for a name and creates the subtask via the Jira API (assigned to the worker).
- **FR10:** Worker can log time against subtasks in the designated **catch-all project** (default project key: `KNP`). The catch-all picker presents a flat list of pre-existing shared subtasks (e.g., "Meetings", "Support Production Incidents") configured at the project level — workers do not create their own catch-all subtasks.
- **FR11:** Worker can mark a day as full-day PTO (configured target hours) or half-day PTO (half of configured target) with a single action that posts the appropriate worklog to a designated PTO subtask in the catch-all project.
- **FR12:** Worker can edit the hours, date, or comment of any worklog they previously posted via the extension.
- **FR13:** Worker can delete a worklog they previously posted via the extension.
- **FR14:** Worker can log time against the specific Jira subtask they are currently viewing, directly from an inline action surface on the Jira page.

### Daily Awareness & Reminders

- **FR15:** Worker sees an always-visible badge counter on the extension's toolbar icon showing the number of hours missing from the current week relative to their configured target.
- **FR16:** Worker receives a daily reminder at a configurable time prompting them to log the day's time.
- **FR17:** Worker sees an inline banner at the top of any Jira page indicating unlogged hours for the current week, when there are any.
- **FR18:** Worker can dismiss the inline banner for the current day; the banner returns the next day.
- **FR19:** Worker sees a contextual quick-log option in the inline banner when viewing a specific Jira subtask page (i.e., the banner offers to log against *that* subtask).

### Weekly Review & Mark-as-Done

- **FR20:** Worker sees a 7-day grid view of the current week showing per-day logged hours and per-subtask breakdown for each day.
- **FR21:** Worker sees per-day color coding (green when day is complete or PTO-marked; red when day is below target and not PTO).
- **FR22:** Worker can edit hours, add subtasks, or remove subtasks from the weekly grid.
- **FR23:** Worker can mark any day in the weekly grid as full-day or half-day PTO via a click-cell-header popover.
- **FR24:** Worker can **mark the current week as done** — a local-only ritual confirming "I'm finished logging this week." The week appears visually completed (grayed/banded) in the worker's view, and the week's contribution to the badge counter is cleared.
- **FR25:** When the worker attempts to mark a week as done with one or more days below target and not marked as PTO, the system requires explicit acknowledgment of the gap before accepting the mark-as-done action.
- **FR26:** Mark-as-done state is local-only — it is not posted to Jira and is not visible to the manager. Manager view always reads live data.

### Manager Approval

- **FR27:** Manager can switch between worker mode and manager mode in the same extension surface.
- **FR28:** Manager sees a person × Epic matrix for the current approval cycle, with rows for each direct report and columns for each Epic that received hours from any report.
- **FR29:** Manager view renders rows progressively as data fetches complete (first row visible quickly; full matrix visible within acceptable bound).
- **FR30:** Manager sees per-cell color coding reflecting the report's per-day target adherence and dirty status for that `(user, cycle)`.
- **FR31:** Manager can drill down into any cell to see the report's specific subtasks within that Epic with hours per subtask.
- **FR32:** Manager can approve a single direct report's entire cycle with one action.
- **FR33:** The approve action posts a versioned, checksummed approval comment tagged `(user, cycle, by)` to each Epic the report logged hours against during the cycle.
- **FR34:** Manager view explicitly warns when worklogs with restricted visibility are excluded from a cell's totals (count surfaced; rationale tooltip available).
- **FR35:** Approval comment metadata captures the count of restricted-visibility worklogs at the time of approval, so audit trails reflect what data was visible to the approver.
- **FR36:** Non-canonical managers (e.g., project managers in a matrixed reporting structure) can open the manager view and read the matrix, but the approve action is disabled for them with an explanatory tooltip.
- **FR37:** Manager can re-approve a cycle previously approved if the worker has edited worklogs after the original approval (dirty cells); re-approval posts a new comment that supersedes the prior one for the same `(user, cycle)`.

### Audit & Data Integrity

- **FR38:** Approval state is stored entirely in Jira (as Epic comments and worklog timestamps); no cross-user state lives in the extension's local storage.
- **FR39:** A worklog whose `updated` timestamp is later than the matching `(user, cycle)` approval comment's timestamp is automatically flagged as dirty for both worker and manager views.
- **FR40:** Approval-comment parser fails closed: any comment whose format or checksum does not validate is treated as non-approval and surfaces a "comment corrupted" warning rather than silently misclassifying worklogs.
- **FR41:** Multiple managers can independently approve different users on the same Epic without conflict; each `(user, cycle)`'s approval state is independent of others on the same Epic.
- **FR42:** The extension never deletes worklogs or comments in Jira. Locally cached data may be cleared by user action from the options page.
- **FR43:** When the worker is unable to reach Jira (network or auth error), the extension surfaces an explicit error state and does not silently lose data the worker is trying to post.

### Settings & Configuration

- **FR44:** Worker's canonical manager is **read automatically from Jira's built-in user-directory manager field**. The worker cannot override this in the extension; changes flow through the Jira admin who maintains the directory.
- **FR45:** Worker's skip-level is derived by reading the canonical manager's *own* manager field in Jira (recursive resolution; the extension performs both lookups on first sync).
- **FR46:** When the manager field is not populated for a worker in Jira, the extension surfaces a clear "manager not set in Jira — please contact your admin" setup error rather than silently failing or asking the worker to type a name.
- **FR47:** Worker can configure the **catch-all project key** (default `KNP`).
- **FR48:** Worker can configure the **PTO subtask** within the catch-all project (the destination for one-click PTO marking).
- **FR49:** Worker can configure the daily reminder time.
- **FR50:** Worker can configure the work-day target hours (default 8).
- **FR51:** Worker can configure the approval cycle (default monthly aligned to calendar month).
- **FR52:** Worker can view the extension's last data-sync time and current local storage usage from the options page.

## Non-Functional Requirements

This is an internal team tool with ~10 users. We keep NFRs minimal — only the ones that genuinely shape implementation decisions or prevent the tool from being unusable.

### Performance

- **NFR1:** Popup feels snappy. Time-to-interactive ≤ **400 ms** (p95) when opened from a daily-reminder notification (data pre-warmed by service worker), ≤ **800 ms** (p95) cold.
- **NFR2:** Manager matrix renders progressively — first row visible within **2 s**, full matrix within **15 s** for a typical team (≤ 12 reports, ≤ 50 Epics).
- **NFR3:** Single worklog post completes within **2 s** (p95).
- **NFR4:** Badge counter updates within **30 s** of any local action; within **2 minutes** of any remote action.

### Reliability — don't lose data, don't silently miscount

- **NFR5:** Auth survives ≥ 30 days without user-visible re-auth (token refresh handles the lifecycle).
- **NFR6:** When offline or rate-limited, the extension surfaces a clear error state and does not silently drop user actions; failed posts are retried on reconnect.
- **NFR7:** Approval-comment parser is fail-closed: malformed comments produce a "comment corrupted" warning, never silent misclassification.
- **NFR8:** A v(N) extension can read approval comments written by v(N-1) — schema migration at parse time.

### Security & Privacy — serverless model boundaries

- **NFR9:** All data stays between the user's browser and Jira/Atlassian. No third-party telemetry, analytics, or external services.
- **NFR10:** OAuth uses PKCE; no client secret in the extension. Tokens stored only in `chrome.storage.local`.
- **NFR11:** OAuth scopes requested are the minimum needed: `read:jira-work`, `write:jira-work`, `read:me`, `offline_access`.

### Accessibility — basic decency

- **NFR12:** All meaningful color signaling (red/green/yellow cells, badge color) is paired with a non-color signal (text label, icon, pattern). Colorblind teammates are not excluded.
- **NFR13:** All interactive elements are keyboard-reachable and have visible focus indicators.

That's it. WCAG AA, internationalization, formal HA/DR, observability dashboards, etc. are out of scope — appropriate for the audience and distribution model.
