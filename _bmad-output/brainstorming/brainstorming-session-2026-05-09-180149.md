---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Personal Jira worklog management Chrome extension (inspired by jira-assistant)'
session_goals: 'Define MVP scope for a Chrome extension that helps a small dev team (me + teammates) avoid forgetting to log, reduce click friction vs native Jira, and surface weekly/monthly reporting & insights'
selected_approach: 'ai-recommended'
techniques_used: ['First Principles Thinking', 'Reverse Brainstorming', 'Resource Constraints']
ideas_generated: 30
context_file: ''
technique_execution_complete: true
---

# Brainstorming Session Results

**Facilitator:** Note
**Date:** 2026-05-09

## Session Overview

**Topic:** Personal Jira worklog management Chrome extension (inspired by [jira-assistant](https://github.com/shridhar-tl/jira-assistant))

**Goals:** Define MVP scope for a Chrome extension that helps a small dev team (me + teammates) solve three specific pains:
1. Forgetting to log time
2. Too many clicks in native Jira worklog UI
3. Hard to see weekly/monthly reporting & insights

**Audience:** Me + dev teammates (shareable, not a public Web Store launch)

### Session Setup

- **Approach selected:** AI-Recommended Techniques
- **Facilitator strategy:** Use 2-3 complementary techniques — start divergent to generate breadth, then converge toward MVP candidates. Push past the obvious "clone jira-assistant" ideas into truly differentiated MVP territory.

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** MVP scoping for a developer-audience Jira worklog Chrome extension targeting three specific pains.

**Recommended Techniques:**
- **Phase 1 — First Principles Thinking:** Strip "Jira worklog" to fundamentals so we don't reflexively inherit Jira's or jira-assistant's UX baggage.
- **Phase 2 — Reverse Brainstorming:** Deliberately design the *worst* worklog tool to surface real friction points; invert each anti-feature into an MVP requirement.
- **Phase 3 — Resource Constraints:** "One weekend / two weekends" forcing function to land a v0.1 / v1 / later cut.

**AI Rationale:** Convergent goal (MVP) requires divergent prep to escape obvious clones. Phase 1 establishes a clean problem model, Phase 2 provides an orthogonal pivot to surface friction-driven requirements, Phase 3 forces brutal prioritization.

---

## Technique Execution Results

### Phase 1 — First Principles Thinking

**Interactive Focus:** Strip "Jira worklog management" down to its irreducible parts, free of jira-assistant's or Jira's UX baggage. Surface the bedrock problem the tool solves.

**Key Breakthroughs:**
- The product centers on a *roll-up report*, not on individual entries.
- The natural review cadence is **weekly retrospective**, not real-time logging — but daily presence still matters to prevent deferral.
- "Tickets assigned to me" is the sole memory-aid signal a dev consults — collapsing the integration surface dramatically.
- The *killer differentiator* is **pre-fill**: turning the user's job from "reconstruct" into "review/adjust."
- Approval is a **non-negotiable compliance gate** (accounting + capacity planning), with manager visibility shaped as a **person × Epic matrix**.

#### Foundations Locked

**[Foundation #1] — Work-to-Initiative Roll-up**
The atomic purpose of all logging is one report: hours per Epic. Entries are votes; the roll-up is the product.

**[Foundation #2] — The 8-Hour Daily Floor**
A logged day is "complete" only when ≥8 hours are accounted for. This is a target the tool can *evaluate*, not just record.

**[Foundation #3] — Monthly Approval as a State Machine**
Time entries have a lifecycle: Logged → Submitted → Approved → Closed. The month is the batch boundary.

**[Foundation #4] — Subtask = Person's Slice of a Task**
Subtasks are not bureaucratic plumbing; they're the meaningful unit of "my work in this shared bucket." The UI should make creating a subtask feel like *claiming a slice*.

**[Foundation #5] — The Cadence is Weekly Retrospective**
The hero screen is a 7-day grid showing per-day hours and gaps, not a "what are you doing now" timer. Filling happens retroactively.

**[Foundation #6] — Approval is Non-Negotiable**
Hard requirement. Data feeds accounting (cost) and resource monitoring (capacity). Manager view is MVP, not v2.

**[Foundation #7] — The Memory Aid is Jira Itself**
The single signal a dev consults to reconstruct the week is "tickets assigned to me / my team." No git, calendar, or Slack integration needed for MVP. Massive simplification.

**[Foundation #8] — Pre-Fill is the Killer Feature**
The user's job becomes review-and-adjust, not reconstruct-from-scratch. Verbs change from "log" to "confirm/adjust."

**[Foundation #9] — Manager View = Person × Project Matrix**
Manager's mental model: of each person's hours, how were they distributed across Epics, and does that match expectations? 2D dashboard with drill-down to ticket evidence.

**[Foundation #10] — Two Logging Lanes**
All time fits into (1) project work → subtask under a real Task, or (2) non-project overhead → subtask under a designated catch-all (admin, meetings, PTO). Code review = subtask under the coding task being reviewed (not catch-all).

**[Foundation #11] — Org Hierarchy as Pre-Fill Heuristic**
Default ownership: Department → Epic, Manager/Squad Lead → Task, Staff → Subtask. But not strict — Tasks can be assigned directly to staff. Pre-fill candidate set = union of (my tasks/subtasks) ∪ (manager's tasks) ∪ (skip-level's tasks) ∪ (tasks I have a subtask under), filtered to active/recent.

**[Foundation #12] — Approval Drill-Down = Per-Ticket Evidence**
Manager UI is two screens: (1) Person × Project matrix → (2) Ticket list with hours. No third drill-down for MVP.

**[Foundation #13] — Cadence = Daily Logging + Weekly Review**
Two distinct UI surfaces, one product. Daily nudges (badge + notification) keep logging a daily habit; weekly review surface (the grid) is for clean-up and submission. Daily reminder reframes logging as "a daily task, not a Friday chore."

**[Foundation #14] — Serverless. Chrome Extension + Jira Only. No Backend. Ever.** ⚡⚡⚡
The **defining architectural constraint** of the entire system. Each user's browser holds their credentials; Jira is the only shared store. Zero ops, zero PII outside Jira, trivial install, no reliability question. Implication: anything shared between users must live inside Jira (approval state, gap acknowledgments, audit trail).

**[Foundation #15] — Day Complete = ≥8h OR PTO-Marked**
Minimum viable rule. PTO marking is a one-click affordance that posts a worklog to a designated PTO Task.

**[Foundation #16] — The Badge is the Single Source of Truth**
Badge color, weekly grid cell color, and submission button must always agree. No silent submission — gap acknowledgment dialog if any day < 8h and not PTO.

**[Foundation #17] — Approval = Comment-on-Epic with Timestamp Anchor** ⚡
No new issues, no anchor subtasks, no Confluence dependency. Approval is a special-format comment posted by the extension on each Epic that received hours that cycle (Option (c): per-Epic fan-out, only Epics with hours). The comment's native Jira timestamp **is** the approval anchor: any worklog with `created/updated > approval_timestamp` is dirty/unapproved. Backdated logging "just works." Manager identity = comment author. Audit trail = Epic's comment thread. This is the cleanest serverless-approval pattern in the design.

**[Foundation #18] — Auth = OAuth 2.0 (3LO + PKCE) for Cloud**
Primary path: `chrome.identity.launchWebAuthFlow` + PKCE → polished one-click "Connect to Jira" UX. Tokens in `chrome.storage.local`, refresh-token rotation handled silently. Site picker via `accessible-resources`. PAT/basic-auth fallback for Jira Server/DC is post-MVP (this team is on Cloud).

---

### Phase 2 — Reverse Brainstorming

**Interactive Focus:** Design the worst possible Jira worklog extension, then invert each "evil" feature into a real MVP requirement that we'd otherwise have missed.

**Key Breakthroughs:**
- The most dangerous failure mode is **The Silent Extension** — no badge, no notification, requires user-initiated action. Inversion → persistent glanceable presence is a hard MVP requirement.
- Daily push notifications are a **feature, not a nag**, for this audience — they reframe logging as a daily task and prevent Friday-defer-forget.
- Inline injection into Jira itself is a powerful surface (Anti-Feature #4 inversion), but must be polite (daily-dismissible).
- "Looks Fine" Dashboard taught us: **submission must require explicit gap acknowledgment** — silent submission of incomplete data is the worst design sin.

#### Anti-Features → MVP Inversions

**Anti-Feature #1: The Silent Extension** (no badge, no notification, never speaks)
- ✅ **MVP-Inversion #1.A — Live Badge Counter:** Toolbar icon always shows hours missing this week (e.g., `12`). Recalculated continuously. The deficit is visible every time the user looks at their browser.
- ✅ **MVP-Inversion #1.D — Inline Jira Banner:** When user lands on `*.atlassian.net`, a thin banner appears: *"Xh unlogged this week — log now."* Default-on, dismissible per day, returns the next day. Polite but persistent.
- 🟡 *Nice-to-have (post-MVP):* Color-graded badge (green/yellow/red), "Last logged X days ago" staleness indicator, pre-deadline notification escalation.

**Anti-Feature #2: The Friday Surprise** (data unrecoverable by Friday)
- ✅ **Solved by Foundations #13 + Inversion #1.A** — daily presence + always-visible badge.

**Anti-Feature #3: The Auth Wall of Shame** (re-prompt for credentials)
- ✅ **MVP-Inversion #3 — One-Time Auth, Silent Refresh:** OAuth 2.0 connect button on first run; tokens in `chrome.storage.local`; refresh tokens rotate silently. Never re-prompted unless revoked.

**Anti-Feature #4: The Tab Tax** (force a competing pinned tab)
- ✅ **MVP-Inversion #4 — Popup + Banner, Never a Tab:** Three surfaces only — toolbar popup (daily/weekly), injected Jira banner, push notifications. No "open this app in a tab" mental model.

**Anti-Feature #5: The "Looks Fine" Dashboard** (green checkmarks on incomplete days)
- ✅ **MVP-Inversion #5 — Honest Status Everywhere:** Badge, grid cells, and submission button must agree on the same truth. Submission requires explicit gap acknowledgment if any day < 8h and not PTO. Daily notification settles the cadence: log every day, not "I'll catch up Friday."

---

### Phase 3 — Resource Constraints (MVP Cut)

**Interactive Focus:** Brutal prioritization. The user opted for a single-shot v1.0 MVP rather than phased v0.1 → v0.5 → v1.0 releases.

**Key Breakthrough:** Single unified MVP scope, with disciplined "OUT" list to prevent feature creep during build.

---

## 🚀 FINAL MVP SCOPE — v1.0 Single-Shot Cut

### Architecture

- **Stack:** Chrome Extension (Manifest V3) + Jira Cloud REST API. **No backend.**
- **Auth:** OAuth 2.0 (3LO + PKCE) via `chrome.identity.launchWebAuthFlow`. Tokens in `chrome.storage.local`. PAT fallback deferred (team is Cloud-only).
- **Storage:**
  - Local (per-user, per-browser): `chrome.storage.local` — tokens, settings, transient UI state.
  - Shared (across users via Jira): worklogs (native Jira), approval markers (Epic comments per Foundation #17).

### Setup & Configuration (one-time)

- One-click "Connect to Jira" → OAuth flow → site picker if multiple Jira sites
- Settings on a separate Chrome **options page** (separate tab, not inline in popup)
- Configurable: my manager username, my skip-level username, catch-all Task IDs (Admin, Meetings, PTO), notification time (default 5 PM), work-day target (default 8h), approval cycle (default calendar month)

### Daily Surface (always-on, glanceable)

- **Toolbar badge counter:** hours missing from current week (single number, no color grading in MVP)
- **Inline Jira banner:** appears on `*.atlassian.net` pages — *"Xh unlogged this week — log now"* — default-on, daily-dismissible
- **Daily push notification** at configured time → "Log today's time" — clicks open the popup

### Logging Surface (toolbar popup)

- **Today view:** today's logged entries + total + remaining-to-target
- **Quick-log action:** pick ticket → enter hours → post worklog
- **Pre-fill ticket picker (Foundation #11):** 2-level browse tree — Tasks (from hierarchy walk: my + manager's + skip-level's, filtered to active/in-progress, recently updated) → Subtasks (mine, plus a "spawn my subtask" affordance under any Task)
- **Catch-all picker:** separate column for Admin / Meetings / PTO buckets
- **One-click PTO mark on a day** → posts an 8h worklog to the configured PTO Task

### Weekly Review Surface (toolbar popup, separate tab/view)

- **7-day grid:** rows = tickets touched this week, columns = Mon–Sun, cells = hours
- **Per-day total row** at bottom
- **Per-day cell color:** green (≥8h or PTO) / red (<8h)
- **Inline edits:** change hours, add/remove tickets
- **"Submit Week" button:** opens gap-acknowledgment dialog if any day < 8h and not PTO; otherwise marks week submitted (pure local UX flag — no server-side state, no Jira mutation; manager view reads live data anyway)

### Approval — Manager Side

- **Manager view (toolbar popup, separate route):** Person × Epic matrix for current month
  - Rows: each direct report (configured one-time via Jira user search)
  - Columns: each Epic with hours from any report this month
  - Cells: total hours per (person, Epic)
  - Cell coloring: red if any day in that person's month is below target (and not PTO)
- **Drill-down:** click cell → per-ticket list with hours per ticket (Foundation #12)
- **"Approve [Person]'s [Cycle]" action:** fan-out — posts a special-format approval comment to each Epic that person logged hours against during the cycle (Foundation #17 Option (c))
- **Approval comment format (machine-parseable):** `[approval:user=<id>,cycle=YYYY-MM,by=<manager-id>]` — Jira's native comment timestamp = the anchor

### Dirty-Detection

- Any worklog with `updated > approval_comment_timestamp` (within the cycle) flagged dirty
- Worker view: shows "needs re-approval" indicator on dirty cells
- Manager view: cells turn yellow/striped when previously-approved cycle has been edited

### Month Boundary Behavior

- Worklogs grouped by **worklog date** (not submission date). A week spanning April 28 – May 4 splits cleanly: April 28–30 counts toward April approval, May 1–4 toward May approval.

---

### ❌ Explicitly Out of MVP (Post-MVP / v1.x+)

- Color-graded badge (yellow/red levels) — MVP shows the number only
- Pre-approval deadline escalation (notification cadence ramp-up)
- "Last logged: X days ago" staleness indicator
- Friday-specific push notification (the daily covers it)
- Smart hour-suggestion heuristics (MVP suggests tickets, leaves hours blank — user fills hours)
- Confluence export of approved months (beautiful but Confluence-license-dependent)
- PAT / basic-auth fallback for Jira Server / DC
- Multi-Jira-instance support
- Personal monthly summary export
- Per-day budget detection from calendar/holidays (auto-detect non-work days)
- Auto-detect manager from Jira user fields
- Color-coded badge polish, animation, etc.

---

## 🪨 Key Open Considerations / Implementation Notes

1. **Pre-fill candidate noise filter (Foundation #11):** "Tasks assigned to my manager" can be huge over time. Filter rule (recommend): `status ∈ {To Do, In Progress, In Review} AND updated within last 30 days`. Fine-tune in implementation.

2. **OAuth refresh-token rotation:** Atlassian rotates refresh tokens. Extension must always store the new one returned with each refresh. Single-flight refresh logic to avoid race conditions when multiple background tasks need a fresh token.

3. **`accessible-resources` site picker:** OAuth callback returns multiple cloud sites if user has access to many. First-run UX: "Pick the Jira site you want to use" → store cloudId in settings.

4. **Badge counter recompute trigger:** Use `chrome.alarms` to recompute every ~30 minutes, plus on popup-open and on detected Jira-page-visit. Don't poll continuously.

5. **Inline banner injection:** Use a content script matched against `*.atlassian.net/*`. Banner insertion must be idempotent (don't double-inject on SPA route changes). Daily dismiss state stored in `chrome.storage.local` with date key.

6. **Comment permissions (Foundation DD):** Manager has access to comment on Epics their reports touch — confirmed by user.

7. **Approval comment parser:** Must be tolerant of manual edits — if someone hand-edits the comment, the parser should fail safely (treat as non-approval) rather than misinterpret.

8. **Worklog "createdAt" vs "started":** Jira worklogs have both `started` (the work date) and `created` (the post-time). Use `started` for grouping in the grid and matrix. Use `created/updated` for dirty-detection vs approval timestamp.

---

## 🎯 Idea Categorization Summary

### Mature Concepts (Ready for Implementation)
- All 18 Foundations are locked
- All MVP-Inversions (1.A, 1.D, 3, 4, 5) are scoped and concrete
- Final MVP scope (above) is implementation-ready

### Innovations (Notable, Differentiated)
- **Pre-fill from hierarchy walk** (Foundation #11) — most worklog tools make you type or scroll a flat list; the hierarchy-walk picker is genuinely novel for this niche.
- **Approval-by-Epic-comment-with-timestamp-anchor** (Foundation #17) — *the strongest design idea in the session.* Uses Jira's append-only comment timeline as an immutable approval ledger. Zero schema changes, zero new artifacts, naturally handles backdating and dirty-edits.
- **Serverless architecture with Jira as sole shared store** (Foundation #14) — collapses entire ops/hosting/security surface; turns a "small team tool" into a genuinely shareable artifact with no central infrastructure.
- **Inline banner-in-Jira with daily dismiss** (MVP-Inversion #1.D) — most extensions stay in their own surface; injecting into Jira itself converts the user's existing Jira traffic into a logging trigger.

### Future Explorations (Post-MVP)
- Confluence-page export for human-readable monthly archives
- Smart hour-suggestion heuristics (last-week pattern, comment/transition-weighted)
- Auto-detect manager from Jira fields, eliminating one-time config
- Pre-deadline escalation cadence
- Per-day budget detection from calendar (Foundation #15 option c)
- PAT fallback for Server/DC users (if anyone outside this team adopts)

### Moonshots (Possibly Never)
- Cross-app integration (git/calendar/Slack) for richer pre-fill — explicitly rejected as out-of-scope per Foundation #7
- Multi-Jira-instance support
- Public Web Store launch (out of audience scope)

---

## Creative Facilitation Narrative

This session was a strong example of **rapid first-principles convergence** with one major mid-flight architectural pivot. The user came in with a clear concrete inspiration (jira-assistant) and an MVP-scoping goal. Phase 1 stripped the problem to bedrock fast — by question 4 (the "retroactive memory" prompt), we'd identified pre-fill as the killer feature. By question 9, we'd locked in the manager view shape.

The session's real **breakthrough moment** was Phase 2 Question O, where the user dropped the **"serverless: extension + Jira only"** constraint. This was not just a preference but a deep design requirement that retroactively forced re-evaluation of approval state, team configuration, and notification mechanisms. From that point, every decision had to pass the "where does this live without a server?" test — which led directly to Foundation #17's elegant comment-with-timestamp-anchor pattern.

Phase 3 was unusually fast because the user opted out of phased rollout ("I'll do this all in one go") and instead drove a single-shot MVP cut. The OAuth pushback (EE) is worth flagging — the user correctly challenged my conservative API-token recommendation, and the resulting OAuth + PKCE design is meaningfully better UX for the small-team audience.

### Session Highlights

**User Creative Strengths:**
- Strong constraint-naming: dropped the serverless requirement at exactly the right moment to reshape the architecture
- Correct pushback on facilitator caution (OAuth recommendation)
- Clean refinement instinct — when the facilitator's "anchor subtask" pattern felt heavy, the user proposed the lighter "comment with timestamp" alternative which was strictly better
- Crisp answer style: directive, decision-ready, unhesitant under multi-question prompts

**AI Facilitation Approach:**
- Started divergent (First Principles), forced orthogonal pivot to friction (Reverse Brainstorming), converged on prioritization (Resource Constraints)
- Used the IDEA FORMAT TEMPLATE consistently to capture each foundation/inversion with novelty notes
- Pushed back on user answers when they'd inherited assumptions, especially during Phase 1
- Cut my own staged release plan when the user said "all in one go" — followed user's energy rather than the playbook

**Breakthrough Moments:**
- Foundation #11 v2 refinement (org hierarchy as pre-fill heuristic, walking up the reporting line)
- Foundation #14 (serverless constraint) — reshaped entire architecture
- Foundation #17 (approval-by-Epic-comment-with-timestamp-anchor) — the single best idea in the session
- OAuth pushback (EE) — correct user challenge improved the MVP scope

**Energy Flow:**
- Sustained focus throughout, no fatigue dips
- Convergent style — short directive answers (often single-letter responses) rather than wandering exploration
- Quality-over-quantity ideation; user prioritized making decisions over enumerating options

---

## 🚦 Recommended Next Steps

1. **Architecture spike (½ day):** Verify the OAuth 2.0 + PKCE flow with `chrome.identity.launchWebAuthFlow` against Atlassian Cloud. Confirm `accessible-resources`, scope grants, refresh-token rotation. This is the highest technical risk in the MVP — de-risk first.

2. **Data-layer prototype (1 day):** Write the Jira API wrapper that:
   - Walks the hierarchy (my + manager + skip-level tasks, filtered)
   - Lists worklogs for a user / cycle
   - Posts worklog to subtask
   - Posts approval comment to Epic
   - Parses approval comments back
   This module is the entire backend; nail it standalone with tests.

3. **UI scaffolding (2 days):** Manifest V3 setup, popup shell with three views (Today, Week, Manager-Matrix), badge updater background, content-script banner injection.

4. **First end-to-end flow (2 days):** Connect → log time → see badge update → see banner on Jira pages. Validate the daily loop works on yourself for one week before adding the weekly grid and manager view.

5. **Weekly grid + submission (2 days)**, then **manager view + approval (2 days)**, then **dirty-detection + polish (1–2 days)**.

6. **Internal alpha:** invite 2 teammates, iterate on the picker / banner / notification cadence based on real friction.

7. **Internal v1.0 release** to your immediate team + manager.

### Suggested follow-up artifacts

- **`/bmad-create-prd`** — Convert this session into a formal PRD for sprint planning
- **`/bmad-create-architecture`** — Deeper technical architecture document for the OAuth flow, hierarchy walk algorithm, and approval state machine
- **`/bmad-create-epics-and-stories`** — Break this MVP into shippable stories with acceptance criteria

---

_End of session._
