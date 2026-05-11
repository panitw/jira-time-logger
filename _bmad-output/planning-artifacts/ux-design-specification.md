---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-core-experience', 'step-04-emotional-response', 'step-05-inspiration', 'step-06-design-system', 'step-07-defining-experience', 'step-08-visual-foundation']
inputDocuments:
  - '{project-root}/_bmad-output/planning-artifacts/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture.md'
  - '{project-root}/_bmad-output/brainstorming/brainstorming-session-2026-05-09-180149.md'
workflowType: 'ux-design'
project_name: 'jira-time-logger'
user_name: 'Note'
date: '2026-05-10'
---

# UX Design Specification jira-time-logger

**Author:** Note
**Date:** 2026-05-10

---

<!-- UX design content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

### Project Vision

**jira-time-logger** is a Manifest V3 Chrome extension that transforms Jira's worklog from a passive form people forget into an ambient, behavior-changing tool. It serves a small dev team (~10 users) with two co-equal value propositions: **active reminders** (badge counter + inline Jira banner + daily push notification) and **at-a-glance overview** (weekly grid + monthly manager matrix). Removing either half collapses the product back to "just use Jira directly."

The product is bespoke for the team's specific workflow — subtask-only logging, KNP catch-all project, monthly manager approval feeding accounting — and ships serverless (Chrome extension + Jira Cloud only, no backend).

### Target Users

**Worker — Priya (primary user):** Senior engineer, 4 years at the org. Logs sporadically today; forgets for days, then guesses at month end. The native Jira worklog UI is too click-heavy and hides her daily totals. She's tech-savvy, lives in Chrome on a desktop, opens Jira many times a day, and wants the timesheet ritual to take seconds, not minutes. Her relief moment is *"oh, I haven't logged Wednesday — wait, the tool already knows the tickets, I just confirm."*

**Manager — Marco (secondary user):** Engineering manager with 7 direct reports (including Priya). Approves monthly timesheets that feed accounting. Today spends ~3 hours each month chasing people and spot-checking individual entries. He's the same tech-savvy as Priya but values speed-to-decide more than visual depth. He needs a 2D matrix with red/green cells he can scan quickly; he drills down *only* on cells that look wrong.

**Dual-persona reality:** Marco is also a Worker — he logs his own time. The same extension serves both modes for him; the popup must make the role-switch obvious within the first 200 ms of opening.

### Key Design Challenges

1. **Three coordinated surfaces, three different interaction contracts.** The toolbar popup is *ephemeral* (60-second tasks; no onboarding, no settling-in time). The content-script banner is a *guest* inside Jira's UI (must respect Jira's visual language; can be dismissed; cannot be ignored permanently). The options page is the only *patient* surface. Each surface needs its own design vocabulary.

2. **Dual-persona role switching in the popup.** Worker mode and manager mode are different jobs with different information density. The mode switch must be unmissable but not annoying. Worker mode is the default; manager mode is opt-in (only visible to users with reports).

3. **Discovery-of-gap → instant relief.** The product's "ah-ha" moment is the user discovering they're behind (badge or banner) and immediately resolving it (popup pre-filled). The transition from gap-discovered to gap-resolved must feel like one fluid action, not two. Total time from notification-tap to worklog-posted should target <60 s.

4. **Gap acknowledgment dialog without making the user feel judged.** When a worker marks a sub-target day as "done," they acknowledge the gap. This is a moment of friction with outsized emotional weight. Too punitive → users resent the tool. Too easy → meaningless rubber-stamp. Must be honest but not preachy.

5. **Manager matrix progressive render.** Up to 12 reports × 50 Epics = 600+ data points fetched client-side over Jira's rate-limited API. The UI must render *useful information first* (first row in 2 s) without waiting for the full grid. Loading skeletons, not spinners.

6. **Accessibility floor (NFR12-13).** Keyboard navigation, visible focus, color-not-sole-signal — all baked into shadcn/ui Radix primitives by default but require discipline in our own compositions. The banner specifically uses inline styles only (Jira's CSP), so we can't lean on Tailwind's auto-extracted classes for that surface.

7. **Performance constraint as a UX constraint.** Popup time-to-interactive ≤ 400 ms (warm) / 800 ms (cold). This forbids large client-side animations on popup open and pushes us toward pre-warmed data and minimal initial render trees.

8. **Logging against tickets *outside* the hierarchy walk.** The pre-fill picker (FR8) shows tickets assigned via the worker's reporting line, but workers regularly need to log against tickets *not yet assigned* to them — a teammate's task they helped with, a new project they were pulled into mid-week before assignments updated, a code-review subtask under a peer's task. The picker must accommodate **search-and-add**: the worker can find any Task by key or text, add it to their personal picker, and from then on it's surfaced alongside hierarchy-walked tickets. Once added, the worker uses the standard "+ Create my subtask under this Task" affordance to log against it. *Implementation note — this is a UX-driven extension to FR8: add a "Search Jira" entry point in TicketPicker, and a personal "recently used / pinned tickets" list in `chrome.storage.local`.*

### Design Opportunities

1. **The badge is the canvas for ambient awareness.** A single number on the toolbar icon, visible every time the user looks at the browser. Its design budget is ~10 px square but its impact is constant. Treat it as the most important pixel in the product.

2. **The inline Jira banner converts already-visited Jira pages into logging triggers.** When a worker is looking at the very ticket they worked on this morning, the banner can offer "log time on THIS ticket" — collapsing intent and action. This is the one place the tool reaches into the user's existing workflow rather than asking them to switch context.

3. **The weekly grid as a visual diary.** Color-coded per-day cells with hours showing make the week scannable in one glance. Red Monday, green Tuesday — Priya can see the shape of her week without reading numbers. This is a primary mental model the tool can make better than Jira ever has.

4. **The manager matrix as a calm dashboard.** Most cells are green most of the time. The cognitive work for the manager is in the exceptions — the 2 cells that are red, the 1 that is yellow-striped. Design the matrix so the exceptions visually pop without making the greens feel ignored.

5. **The "Mark as Done" button as a relief moment.** Friday afternoon, the worker confirms the week is whole, hits Mark as Done, and the badge drops to zero. That moment of "I'm good for the week" is satisfying — design the button affordance and the post-action confirmation to honor it.

## Core User Experience

### Defining Experience

The product has **two co-equal core actions**, each owned by a different persona:

**Worker core action — "log time without thinking":** Open the popup (or click the inline banner), pick a subtask from the pre-filled list, type hours, hit Enter. Median time: ≤ 30 seconds. The worker does this many times per week and must never feel friction beyond what the task strictly requires.

**Manager core action — "approve the month":** Open the manager view, scan the matrix for red/yellow cells, drill into anomalies, click "Approve" for each report. Median time per report: ≤ 5 minutes. The manager does this 12× per year and must feel they made an informed decision, not a rubber-stamp.

The product's **core loop binding both** is *discovery → resolution*: the user discovers a gap (badge, banner, push notification, or open matrix cell) and resolves it (pre-filled form, one-click approve) within one tight session. Friction in either half — discovery or resolution — collapses the loop.

### Platform Strategy

**Single platform: Chromium browser extension (Manifest V3).**

- Targets: Chrome (primary), Edge (primary). Firefox/Safari deferred.
- Input: keyboard + mouse. No touch, no voice, no gesture.
- Form factors: desktop only (the popup is sized for a 360×600 px toolbar dialog; the options page is desktop-width). No responsive mobile scaling — the extension simply doesn't run on mobile Chrome.
- Offline: graceful degradation only. The tool surfaces an explicit offline state; outbox queues writes; nothing silently fails.
- Network: assume corporate network with low-latency Jira Cloud access; design for the case where Jira is occasionally rate-limited but not unreachable.
- Browser storage: `chrome.storage.local` (10 MB) and `chrome.storage.session` (cleared on browser close).

### Effortless Interactions

These must feel like nothing — zero conscious thought required:

1. **Opening the popup from a daily reminder.** Notification → click → popup is *already loaded* with today's view. Pre-warmed by the service worker; no spinner, no "loading…" text. Target: TTI ≤ 400 ms.
2. **Picking a ticket from the pre-fill list.** The list is sorted by likelihood (most-recently-touched first). The worker recognizes the right ticket within 2 seconds without reading every line. Search is available but rarely needed.
3. **Typing hours and submitting.** Number input with hour-decimal defaults (1.5, not 1h 30m). Enter submits. No "Save" button ceremony.
4. **Dismissing the inline banner.** Single click on an X icon. The banner stays gone for the day; reappears tomorrow. No confirmation dialog, no "Are you sure?".
5. **Marking a day as PTO.** Click the day-cell header in the weekly grid → popover with two buttons (Full / Half) → click → cell turns green. No modal, no form, no settling-in.
6. **Switching between worker and manager modes.** A clearly-labeled tab/toggle near the top of the popup. One click; no transition, no loading state. Worker mode is the default; manager mode is only visible to users who actually have reports.
7. **Reading the badge counter.** The number on the toolbar icon tells the worker "you owe X hours this week." No interpretation, no decoding.

These should NOT be effortless — they're allowed to be deliberate:

- **First-time setup.** Connect to Jira (OAuth), pick a Jira site if multiple, configure the catch-all project. This is a one-time patient-mode experience on the options page; full keyboard nav, clear field labels, no time pressure.
- **Marking a week as done with gaps.** Gap acknowledgment dialog forces the worker to read what's missing and confirm. This is intentional friction protecting data integrity.
- **Approving a cycle as a manager.** A confirmation step with a summary of what's being approved (X hours across Y Epics for person Z). This is the moment that feeds accounting; deliberate is correct.
- **Approving a cycle that has visibility-restricted worklogs.** Manager sees the warning, must explicitly proceed. Captured in approval comment metadata for audit.

### Critical Success Moments

These are the make-or-break moments that determine whether the user adopts the tool or abandons it:

1. **First successful log within 60 seconds of install.** From "I just installed this" to "I logged my first hour" — if this isn't under a minute, the tool feels like overhead. Onboarding is the options-page configuration plus the first popup opening; the pre-fill list must be populated by then.
2. **The first banner-driven log.** The first time the worker is on a Jira ticket they actually worked on, the banner offers contextual quick-log, and the worker uses it. This is the ah-ha moment that makes the tool feel intelligent rather than intrusive.
3. **The first weekly review that catches a gap.** Friday afternoon, the worker opens the week view, sees a red Wednesday they'd forgotten about, fills it in 30 seconds. This validates the review-tool half of the value proposition.
4. **The first manager approval that takes < 10 minutes total.** The manager opens the matrix, sees most cells green, drills into 1-2 outliers, clicks Approve for each report. Comparing to their previous half-day chore, this is the ROI moment for the manager.
5. **The 30-day mark with no re-auth.** OAuth refresh has worked silently; the worker has not been prompted to reconnect once. This is the trust moment that makes the tool feel reliable.
6. **The first dirty-edit detection.** A worker edits a worklog after the cycle was approved; the manager view shows the yellow-stripe; re-approval works. This validates the audit-integrity backbone.

### Experience Principles

These principles guide every UX decision in this spec:

1. **Frictionless on the hot path; deliberate on the cold path.** Logging time (frequent) must be friction-free. Approving a cycle (rare, high-stakes) is allowed to be deliberate. Setup (one-time) is allowed to be patient.
2. **The tool reaches the user, not the other way around.** Badge, banner, push — the tool surfaces itself. The user should never need to remember to open the popup. (Inverse: don't be annoying; one daily push, one daily-dismissable banner, an always-visible but quiet badge.)
3. **Show the gap, don't lecture about it.** Red cells, missing numbers, an honest acknowledgment dialog — these communicate the gap without judgment. Avoid copy that sounds preachy ("Don't forget!", "You should…").
4. **Honest data over polished data.** When the manager view can't see all worklogs (visibility restrictions), say so. When the parser can't read a comment, say so. When the network is down, say so. Never silently misrepresent.
5. **The manager's time is the most expensive.** Every manager interaction is paid in skipped engineering work. Optimize the manager view for fewest-clicks-to-confidence above all else.
6. **Worker mode is the default; manager mode is the modifier.** When in doubt about what to show on popup open, show the worker view. Manager mode is opt-in via a clearly-labeled toggle, only visible when the user actually has reports configured in Jira.
7. **Graceful degradation, not blocking errors.** If catch-all is not configured, hide the catch-all column. If manager isn't set in Jira, the picker shows fewer suggestions but still works. If Jira is unreachable, queue and retry. Never block the core "log my time" flow.

## Desired Emotional Response

### Primary Emotional Goals

The product targets **two primary emotions per persona**, plus a shared **dominant tone** across all surfaces.

**Worker (Priya) should feel:**

- **Relief.** "I was behind, and now I'm not." This is the discovery → resolution loop's emotional payoff. The badge dropping from `12h` to `0h`, the red Wednesday turning green — these are not decorative state changes, they are emotional rewards.
- **Quiet competence.** "I'm on top of my work." Not pride, not achievement — just the absence of the low-grade anxiety that comes from suspecting you're behind on logging.

**Manager (Marco) should feel:**

- **Confidence in the data.** "I know what I'm approving and I know it's accurate." The honesty principle (visibility warnings, dirty-detection, fail-closed parser) earns this; the matrix visual hierarchy reinforces it.
- **Efficient ownership.** "I made informed decisions in 11 minutes, not three hours." Time saved is the primary emotional ROI for the manager — and the matrix design must constantly signal "you are being respected."

**Shared dominant tone — across both personas, every surface:**

- **Calm, honest, quietly competent.** Like a good colleague who hands you a complete report and steps out without commentary. Not cheerful, not stern, not corporate. Just present, accurate, and tastefully out of your way.

### Emotional Journey Mapping

| Moment | Worker emotional state | Manager emotional state |
|---|---|---|
| First install / OAuth connect | Slight curiosity, mild suspicion ("is this going to work?") | Same |
| First popup open after install | Pleasant surprise — "oh, it already knows my tickets" | Same |
| Daily badge glance (everyday) | Background awareness — quiet "how am I doing?" check | Same |
| Daily push notification fires | Mild prompt — "right, I should look at this" — NOT guilt | Same |
| Banner appears on Jira ticket page | Helpful nudge — "and I'm on the right ticket already" | Same |
| Logging a single worklog | Frictionless — should feel like nothing happened, no friction-tax | Same |
| Friday weekly review | Mild satisfaction reviewing the week visually | Same |
| Mark-as-done with a complete week | Quiet relief, small reward — "good week, done" | Same |
| Mark-as-done with gaps acknowledged | Honest reckoning — neither congratulated nor scolded | Same |
| Manager opens monthly matrix Day 1 | (n/a) | Slight focus shift — "this is the part of the month I do this" |
| Manager scans matrix and sees mostly green | (n/a) | Confidence — "team is mostly fine; let me look at exceptions" |
| Manager drills into a red cell | (n/a) | Curiosity, not suspicion — "let me see what happened here" |
| Manager clicks Approve | (n/a) | Brief moment of weight ("this feeds accounting") then satisfaction |
| Something goes wrong (auth expired, Jira down) | Inconvenience — but trust survives because the error is honest and the retry happens | Same |
| 30 days in, no re-auth | Background trust — "this just works" | Same |

### Micro-Emotions

These subtle states are what we deliberately design for or against:

| Promote | Suppress |
|---|---|
| Confidence (in the data) | Anxiety (about whether logging is right) |
| Trust (in the tool) | Skepticism (about whether the tool helps) |
| Quiet accomplishment | Performative achievement (no badges, no streaks in v1.0) |
| Calm focus | Distraction (animations should add polish, not steal attention) |
| Honest acknowledgment | Judgment (no "you forgot!" copy) |
| Efficient closure | Decision fatigue (one big approve button, not 12 small confirms) |
| Mild relief at gap-resolved | Guilt at gap-discovered |

### Design Implications

How emotional goals translate to specific UX choices:

| Emotion | UX choice |
|---|---|
| **Relief** | Badge counter visibly drops to 0 when the user catches up. The grid cell flips from red to green with a satisfying ~200 ms transition. The full-week-clean state can be celebrated with a subtle moment (a small chip animation, a soft confirmation flourish on Mark-as-Done). |
| **Quiet competence** | No streaks, no badges, no XP in v1.0. The badge counter shows missing hours, not "current streak" or "logged days this month." Achievement is internal, not surfaced. *(See post-MVP gamification note below.)* |
| **Confidence in data (manager)** | Visibility warnings always shown when applicable. Dirty cells visually distinct from clean cells. Approve dialog summarizes exactly what's about to be approved. |
| **Efficient ownership (manager)** | Matrix renders progressively (first row in 2 s); rows can stagger-fade in as data resolves (~150 ms per row) for visual rhythm. Approve is a single click; confirmation is a one-line summary, not a multi-step wizard. |
| **Calm tone everywhere** | Color palette skews neutral (see Visual Foundation step). Red cells use a desaturated red, not alarming red. Greens are sage, not Slack-mention green. Whitespace is generous. |
| **Honest, not preachy copy** | Notification copy: *"Log today's time"* — not *"Don't forget!"*. Banner copy: *"6h unlogged this week"* — not *"You're behind!"*. Gap acknowledgment dialog: *"3 days are below 8h and not marked as PTO. Submit anyway?"* — not *"Are you sure you want to submit incomplete data?"*. |
| **Polished but quiet animations** | Tasteful motion is welcome where it helps — popup-open fade (≤ 150 ms), cell color transitions (≤ 200 ms), banner slide-in on Jira page load, button hover states, matrix-row stagger reveal. Animations must respect the popup TTI budget (NFR1: 400 ms warm); nothing blocks first paint or first interaction. |
| **No gamification in v1.0; revisit post-MVP** | Streaks, achievement badges, "X weeks on time" markers, etc. are deferred. Once v1.0 is in real use, we'll see what natural success feels like to the team and design gamification around that signal — see Post-MVP Gamification note below. |
| **Errors feel like the tool admitting limits, not failing** | Error copy: *"Can't reach Jira right now — your worklog will post when we're back online."* Past-tense and active voice ("will post"), no apology theatre. |

### Post-MVP Gamification (deferred)

Gamification is interesting for this product but should not be designed before we have evidence of how teammates *naturally* feel about adoption. Candidates to revisit in v1.x once v1.0 is in real use:

- **Streak counters** — "logged on time 8 weeks in a row" — surfaced in options page or a small persistent badge in the popup, not pushed to the user
- **Quiet milestone markers** — "first month with all reports approved by day 3" — a discrete chip, not a fanfare
- **Team-level signals (opt-in)** — "your team's average days-to-log this month" without naming individuals
- **Manager-side completion indicator** — "X of Y reports approved; Z remaining" with a quiet progress bar

The principle when we add these: gamification must amplify the *quiet competence* emotion already designed for. Never "you're behind your team" framings; never leaderboards; never anything that could create cross-team comparison anxiety.

### Emotional Design Principles

These are the binding emotional rules for every UX decision in v1.0:

1. **The tool's emotional posture is colleague, not coach.** It provides information; it doesn't motivate, congratulate, or admonish. It treats the user as a competent adult.
2. **Relief beats reward.** Users feel good because a problem went away, not because the tool gave them a sticker. (Until post-MVP gamification, where any reward we add must amplify relief, not replace it.)
3. **Honesty earns trust; politeness erodes it.** "Can't reach Jira" is more reassuring than "Oops! Something went wrong. We're sorry!" because it tells the user what's actually happening. Apology theatre suggests the tool is hiding something.
4. **Friction is a respect signal, not a punishment.** The gap acknowledgment dialog has friction because the data matters, not because we're scolding the worker. Frame all friction as "the tool is treating this as serious because you should too."
5. **The manager's confidence is purchased with the worker's honesty.** Every visibility warning, every dirty indicator, every fail-closed comment parser exists so the manager can approve confidently. This earns the manager's trust in the tool, which earns their adoption, which makes the tool useful to the worker. The chain of trust matters.
6. **Tasteful motion that earns its weight.** Animations are welcome where they add polish or convey meaning (cell color transitions, badge updates, banner slide-in, popup fade-in). They must never block first paint, never exceed ~200 ms unless triggered by deliberate user action (e.g., a Mark-as-Done confirmation flourish), and never run while the user is trying to act on the surface.
7. **No surface speaks unless it has something to say.** Empty states are honest empty states ("No tickets in your hierarchy. Search Jira to add one."). Loading states are skeletons, not spinners. Success states are absence (the form closes, the badge drops). Quiet beats noisy on every surface.

## UX Pattern Analysis & Inspiration

### Inspiring Products Analysis

**1. Linear (web app + extension)**
- *What they nail:* Calm visual register; honest dense typography; the "command-K" muscle memory for power users; status pills that communicate state without color alone (icon + label + color); fast list/table interactions; quiet success states (item disappears rather than green-checks at you).
- *What we borrow:* The whole calm-utilitarian register. Dense information hierarchy without clutter. Minimal use of gradients, shadows, decorative imagery.
- *What we don't borrow:* Linear's keyboard-first density would be too much for a 60-second popup task; we still need clear visual affordances for mouse users.

**2. Raycast (macOS launcher + extension store)**
- *What they nail:* Popup-style ephemeral UI that feels powerful without being overwhelming. Per-row color accents that read as metadata, not decoration. Excellent empty states. Fast keyboard nav with visible mouse fallback.
- *What we borrow:* Popup interaction model — focus on first input immediately, ESC to close, Enter to submit. Per-row affordances that reveal on hover but don't require it.
- *What we don't borrow:* Raycast's deep-keyboard ethos; our users are mouse-first.

**3. Stripe Dashboard (web)**
- *What they nail:* Tabular financial data presented honestly. Clear loading skeletons. Row-level state (paid / pending / failed) with icon + color + text label combined. Drill-down panels that slide in rather than navigating away.
- *What we borrow:* Manager matrix design language — financial-grade clarity for the cells, drill-down panel pattern, skeleton loading, honest empty states ("No reports found in this cycle").
- *What we don't borrow:* Stripe's full-page web density; we're constrained to a 360 px popup width.

**4. GitHub native UI (issue/PR pages, action runs)**
- *What they nail:* Inline status indicators (green check / red X / yellow dot) that work for color-blind users via shape difference. Honest progressive load (rows render as data arrives). Quiet hover-reveals.
- *What we borrow:* Status-icon language for the matrix cells. Progressive row-by-row render pattern. Hover-reveal of secondary actions on cells.

**5. Notion Web Clipper (Chrome extension popup)**
- *What they nail:* Popup pre-warmed with relevant context (current page title pre-filled). Lives entirely inside the popup — one-and-done, no follow-up tab. Visible OAuth status indicator with one-click reconnect.
- *What we borrow:* Pre-warmed popup pattern; one-and-done interaction; OAuth-status indicator in popup.
- *What we don't borrow:* Their over-reliance on cloud sync for state (we're serverless).

**6. The Vercel deploy notification (browser-system notification)**
- *What they nail:* Notification copy is informational, not alarming. "Deployment ready" is past-tense action. Click to open the relevant surface, no other interaction needed.
- *What we borrow:* Notification copy register — past-tense, no exclamation marks, no apology theatre. Single-click takes the user to the actionable surface.

**7. jira-assistant (the reference project itself)**
- *What they get right:* Multi-surface extension architecture works in production over years. Calendar integration is genuinely powerful for users who have it.
- *What we deliberately don't borrow:* The kitchen-sink feature surface. jira-assistant tries to do everything; we do five things well. Their dashboard customization is a UX and maintenance burden we explicitly avoid.

### Transferable UX Patterns

**Navigation Patterns:**

- *Tab-based primary navigation in popup* (Linear, Raycast) — Today / Week / (Manager) tabs at the top, persistent across popup opens.
- *Drill-down sliding panel for detail* (Stripe Dashboard) — manager drill-down doesn't navigate away; it overlays.
- *No back button needed inside popup* — the dialog is small enough that browsers/users use the close button.

**Interaction Patterns:**

- *Pre-warmed popup with focus on first input* (Raycast, Notion) — cursor is in the hours field on Today view open; user can type immediately.
- *Enter to submit, ESC to close, no Save button ceremony* (Linear, Raycast) — frictionless for power users.
- *Click-cell-header popover* (custom pattern; close to GitHub's date-picker overlay) — better than right-click for discoverability.
- *Inline edit of grid cells* (Stripe, Linear) — click cell to edit hours; tab to next cell.
- *Ghost-prefilled context* (Notion clipper) — banner detects which Jira ticket page you're on and offers it as the default.
- *Hover-reveal of secondary actions* (GitHub, Linear) — drill-down caret, edit icons appear on row hover.

**Visual Patterns:**

- *Status pills with icon + label + color* (Linear, GitHub) — cell coloring backed up by a small icon indicator + tooltip. Solves NFR12 (color-not-sole-signal).
- *Skeleton loaders with row-level granularity* (Stripe, GitHub Actions) — matrix renders empty rows immediately, fills row by row.
- *Honest empty states* (Linear, Raycast) — text explaining what to do next, optionally a link.
- *Generous whitespace; quiet typography hierarchy* (Linear, Stripe) — text-size differences carry hierarchy more than color or weight.
- *Single accent color used sparingly* (Linear's purple, Raycast's red) — most of the UI is grayscale; the one accent color marks primary actions.

### Anti-Patterns to Avoid

These come up repeatedly in productivity-tool design and we explicitly reject them:

1. **Apology-theatre error states.** "Oops! Something went wrong!" with a sad face. Treats users as fragile. Hide the actual error. We use honest copy: "Can't reach Jira right now."
2. **Spinning loading wheels for everything.** Spinners say "I don't know how long this will take" — fine for a 200 ms button click, terrible for a 9-second matrix load. We use skeletons that hint at the eventual structure.
3. **Confetti / celebration animations.** Users logging time don't want a party. They want to be done. (Reserved for post-MVP gamification, where it would be discrete and contextual.)
4. **Multi-step modal wizards for simple actions.** "Step 1 of 3: Choose project. Step 2 of 3: Enter hours. Step 3 of 3: Confirm." We do one form, all fields visible, Enter submits.
5. **Persistent toast notifications that pile up.** Toasts for every successful action, especially from a popup that closes anyway, are noise. We use absence (form closes, badge drops) to signal success.
6. **Color-only state communication.** Red cell + nothing else excludes color-blind users. Every colored signal is accompanied by an icon, label, or pattern. (NFR12.)
7. **Hidden / mystery-meat navigation.** Hamburgers, kebabs, "more options" without context. In a 360 px popup, every navigation element has a label or an obvious icon.
8. **Onboarding tours / coachmarks on every screen.** Users will figure it out from clear empty states and field labels. We do one welcome notification on first install, then nothing.
9. **Forced opinions about layout.** Manager view doesn't let users choose between "compact" and "comfortable" density. One well-considered density. Less to maintain, less for users to decide.
10. **Background polling that wakes the device.** `chrome.alarms` is for scheduled work, not constant heartbeat. We poll only when the popup opens, when the badge cadence fires, and when a Jira page is visited.

### Design Inspiration Strategy

**What to Adopt (use as-is):**

- *Linear's calm typography hierarchy* — type-size + weight differences drive structure; minimal color usage.
- *Stripe Dashboard's drill-down panel pattern* — manager matrix drill-in is a slide-in panel.
- *Notion Web Clipper's pre-warmed popup with focused-on-open pattern* — popup opens with cursor in the hours field.
- *GitHub's progressive row render with skeleton placeholders* — manager matrix renders row by row.
- *Vercel notification copy register* — past-tense, informational.

**What to Adapt (modify for our context):**

- *Raycast's keyboard-first ethos → mouse-friendly with keyboard support* — our users are mouse-primary; keyboard is enhancement.
- *Linear's command-K → simple search input in TicketPicker* — same mental model, simpler implementation.
- *Stripe's wide tabular layout → 360 px-constrained matrix with horizontal scroll if needed* — we may need to constrain Epic count visible by default (top-N) with a "show all" affordance.
- *Notion Clipper's cloud-sync indicator → local OAuth status chip* — same affordance, no cloud.

**What to Avoid (explicit non-adoptions):**

- *jira-assistant's customizable dashboard widgets* — out of scope; one well-designed matrix beats N user-arranged views.
- *Notion's database UI complexity* — way too dense for our 60-second popup task.
- *Stripe's marketing-grade visual polish* — we aim utilitarian; no hero illustrations, no gradient backgrounds.
- *Linear's heavy keyboard-shortcut surface* — discoverable mouse affordances first; shortcuts are a power-user enhancement.
- *Slack's notification volume* — one daily push, that's it.

## Design System Foundation

### Design System Choice

**Tailwind CSS v4 + shadcn/ui**, with **Radix UI primitives** as the accessibility backbone. Categorically a *Themeable System* — strong foundation, full customization control, no runtime dependency on a component library.

### Rationale for Selection

The choice is locked at the architecture level (Step 4 of the Architecture document). Restated here from the UX perspective:

1. **shadcn/ui is not a dependency — it's a code generator.** We `pnpm dlx shadcn@latest add <component>` and own the source. No library lock-in, no runtime overhead, no breaking-change migrations from upstream. We can edit each component freely.
2. **Radix UI primitives ship accessibility by default.** Focus trapping, keyboard navigation, ARIA roles, screen-reader semantics — all built in. NFR12 (color-not-sole-signal) and NFR13 (keyboard-reachable, visible focus) are largely satisfied by defaults rather than discipline.
3. **Tailwind v4 keeps the bundle tight and the styling fast.** Class-based, statically extracted at build time → CSP-safe in the popup and options page surfaces (we use inline styles only for the content-script banner).
4. **The combination matches the inspiration strategy.** Linear's calm typography and Stripe's honest tabular density are both achievable with Tailwind utilities; shadcn/ui's primitives handle the interaction patterns (Popover, Dialog, Tooltip, Select) we need.
5. **No brand to honor.** This is an internal team tool, not a branded product. We're not constrained by a corporate visual identity, which means the calm-utilitarian register from the inspiration step can flow directly into design tokens.

### Implementation Approach

**Initial component install (post-`wxt init`):**

```bash
pnpm dlx shadcn@latest init
# Choose: TypeScript, default style, neutral base color,
#         CSS variables for theming, Tailwind config

pnpm dlx shadcn@latest add button input label dialog popover \
  select tooltip toast skeleton tabs table
```

These 11 primitives cover the v1.0 component surface:

| Primitive | Used in |
|---|---|
| `button` | Connect, Submit, Approve, Mark-as-Done, all CTAs |
| `input` | Hours field, settings fields, search-tickets field |
| `label` | All form labels |
| `dialog` | Gap-acknowledgment dialog, approve-confirm dialog |
| `popover` | PTO popover (FR23), drill-down panel (FR31), cell-context menu |
| `select` | Cycle field, manager mode toggle if dropdown |
| `tooltip` | Visibility-warning hover, approve-disabled (non-canonical), help icons |
| `toast` | Worklog posted, approval comment posted (sparingly — only for delayed actions) |
| `skeleton` | Manager matrix row placeholders, weekly grid load |
| `tabs` | Today / Week / Manager view switcher in popup |
| `table` | Manager matrix grid; weekly grid; drill-down ticket list |

**Components NOT installed (not needed for v1.0):** install on demand if a future feature genuinely needs one. Resist scope creep here — every component installed is a maintenance surface.

### Customization Strategy

**Token-level customization (in `tailwind.config.ts`):**

- Color palette overrides — see Visual Foundation step for specifics. We override shadcn's default neutral palette with our own calm-utilitarian register.
- Font family — system stack (no web-font HTTP requests; CSP-safe and fast).
- Border radii, spacing scale — inherit shadcn defaults.
- One accent color (`accent-primary`) used sparingly for primary CTAs and active-state indicators.

**Component-level customization (in `components/ui/*.tsx`):**

- We own these files. Edit freely to match the calm-utilitarian register — typically simplifying, not adding. shadcn defaults err toward "modern SaaS" polish; we trim where we want Linear-grade restraint.
- Examples: `button.tsx` may lose its default shadow; `dialog.tsx` may lose its overlay backdrop blur; `popover.tsx` may use a thinner border.

**Domain-component composition (in `components/<view>/`):**

- All higher-level components (WeeklyGrid, ManagerMatrix, TicketPicker) compose shadcn primitives. They never reach for raw HTML form elements when a primitive exists.
- This is the layer where the inspiration patterns live — Linear list rows are built from `Button` + custom row layout; Stripe drill-down is `Popover` + custom content; etc.

**Content-script banner exception (CSP constraint):**

- The content-script banner is **NOT** styled with Tailwind classes. Jira's CSP can interfere with class-based styling that relies on a stylesheet load order we don't control inside the host page.
- Banner uses inline `style={{ ... }}` attributes built from static design tokens defined in `lib/banner-styles.ts`. The tokens reference the same color values as Tailwind theme but are emitted as literal CSS values, not classes.
- Banner gets its own design pass in the Component Strategy step to ensure it visually harmonizes with the popup despite the styling-system divergence.

**Dark mode:** **Not in v1.0.** Adding dark mode requires maintaining two color scales for every token; for an internal ~10-user tool, the marginal value isn't worth the maintenance. Documented as a v1.x candidate — shadcn supports dark mode out of the box via CSS variables, so the future cost is moderate (rebuild color tokens, audit per-component visual regressions).

## Defining Core Experience

### The Defining Experience: The 30-Second Worklog

The single interaction that defines jira-time-logger:

> **From "I notice I owe time" → "worklog posted in Jira" in under 30 seconds, with no thinking required beyond what to log.**

If we get this one interaction right, every other UX decision in the product gets easier. If we get it wrong, no amount of polish elsewhere recovers it.

This is the equivalent of Tinder's swipe, Spotify's Play, or Notion Web Clipper's Save: the canonical action the user does many times a day, without thinking.

### User Mental Model

**How users currently solve this problem in raw Jira:**

1. Switch to a Jira tab.
2. Search or navigate to the right ticket. (10–30 s of friction.)
3. Click "Log work" in the side panel.
4. A modal appears. Fill in date, time spent, optional comment.
5. Click "Save."
6. Confirm the modal closes.

**Time:** 60–120 s per worklog. Cognitive load: high (find the ticket from memory). Failure modes: forget the ticket key; pick wrong ticket; abandon halfway because Slack pinged.

**Our mental model upgrade:**

The user no longer has to *find* the ticket. The tool surfaces **candidate tickets the user is likely to have worked on** based on the hierarchy walk and any contextual signal (e.g., the Jira page the user was just viewing). The user's job collapses to *recognize and confirm*, not *recall and search*.

The mental shift:
- **Before:** "What ticket did I work on? Let me think… search… click… type hours… save."
- **After:** "Oh, I owe time. Tool's already showing me 4 likely tickets. That one. 2 hours. Done."

### Success Criteria for the Core Experience

The defining interaction is successful when:

1. **The right ticket is in the candidate list.** The pre-fill picker presents the ticket the user actually worked on, in the first 1–4 visible items, ≥ 70% of the time (success criterion from PRD).
2. **The user recognizes their ticket within 2 seconds.** Visual hierarchy makes ticket key + summary scannable; no need to read every word of every row.
3. **Submission requires no confirmation.** Pressing Enter posts the worklog and either closes the popup (banner-driven) or updates the Today view in place (popup-driven).
4. **Median time is ≤ 30 seconds** from popup-open (or banner-click) to worklog-posted, including a typical hierarchy fetch.
5. **The user feels like nothing happened.** No celebration, no confirmation modal, no "Thanks for logging!" toast. Just the absence of friction. The badge updating from `8h` to `7h` is the only feedback.
6. **Failure feels survivable.** If Jira is unreachable, the worklog enters the outbox and the user sees "Will post when Jira is reachable" — they continue with their day, the tool resolves it later.

### Novel vs. Established Patterns

The defining experience composes **established patterns** in a specific arrangement; nothing about it is novel-for-its-own-sake:

| Element | Pattern source | Why this pattern |
|---|---|---|
| Popup pre-warmed with focused-on-open input | Notion Web Clipper, Raycast | Established expectation for browser-extension popups |
| Pre-filled candidate list ranked by relevance | Spotify search, GitHub repo switcher | Established "smart suggest" pattern |
| Single-form layout, all fields visible, Enter-to-submit | Linear's create-issue, GitHub's quick-PR | Established for power-user-targeted forms |
| Skeleton loaders during cold sync | Stripe Dashboard, GitHub Actions | Established for progressive load |
| Outbox/queue for offline writes | Slack message-send, Twitter draft auto-save | Established for "feels reliable even offline" |

The novelty (per PRD's Innovation section) is at the **system level** — the approval-by-Epic-comment pattern, the serverless architecture — not at the defining-interaction level. The defining interaction is deliberately conservative; it should feel familiar.

### Experience Mechanics

The full step-by-step of the 30-second worklog, broken into the four phases.

**Phase 1 — Initiation (3 paths)**

The user can enter the defining flow from three places:

| Trigger | Initial state | Time budget to popup-open |
|---|---|---|
| Toolbar icon click | Popup opens to last-used view (Today by default) | 200 ms |
| Daily push notification click | Popup opens to Today view | 400 ms (NFR1, warm) |
| Inline Jira banner "Log time on this ticket" | Banner expands inline; popup not opened | 100 ms |

In all three cases, **focus is in the hours field on open** (popup) or in the inline form (banner). Cursor is ready; no click needed.

**Phase 2 — Interaction**

Within Today view (popup):

```
┌─────────────────────────────────────┐
│ Today (Mon, May 12)        7h / 8h ⓘ│  ← header: total + target
├─────────────────────────────────────┤
│ Logged today                        │
│ ─────────────────────────────────── │
│ ▣ PROJ-456 Client portal redesign   │
│   2.0h                       ⋯ edit │  ← already-logged entries
│ ▣ KNP-12  Standup                   │
│   0.5h                       ⋯ edit │
│                                     │
│ Pick a ticket to log:               │
│ ┌─────────────────────────────────┐ │
│ │ Search or pick…              🔍 │ │  ← cursor here, ready
│ └─────────────────────────────────┘ │
│ ─────────────────────────────────── │
│ ▸ Tasks (4)                         │  ← collapsible groups
│   ▸ PROJ-455 Settings page          │
│   ▸ PROJ-789 Auth review            │
│   ▸ TEAM-12  Onboarding doc         │
│   ▸ TEAM-44  Sprint planning        │
│                                     │
│ ▸ Catch-all (KNP)                   │
│   ▸ KNP-12   Standup                │
│   ▸ KNP-99   PTO                    │
│                                     │
│ + Search Jira for a ticket…         │  ← challenge #8 affordance
└─────────────────────────────────────┘
```

User flow:

1. Cursor blinks in the search/pick input.
2. User clicks a ticket from the list (or types to filter, or uses arrow keys).
3. The selected ticket replaces the search input; an hours field appears immediately to its right.

```
┌─────────────────────────────────────┐
│ ▣ PROJ-455 Settings page            │
│   Hours: [_____]              [Log]│  ← hours field focused
└─────────────────────────────────────┘
```

4. User types hours. **Hours field follows Jira's flexible parser** — accepts `2.5`, `2.5h`, `2h 30m`, `2:30`, `150m`. The displayed-value-as-typed is preserved; underlying storage normalizes to `timeSpentSeconds` for the Jira API.
5. Hits Enter. Or clicks Log.
6. `[Log]` button briefly shows a spinner (≤ 200 ms typically), replaced by a check.
7. The new entry appears in "Logged today" above; the search input clears and refocuses; the badge ticks down. **Popup stays open** so the user can log another worklog without re-opening.

**Phase 3 — Feedback**

| Phase | Feedback signal |
|---|---|
| User typed hours | Format validation: green border on parseable input; red border + tiny inline message ("Use formats like `2.5h`, `2h 30m`, or `2:30`") on unparseable |
| User pressed Enter | Button → spinner (≤ 200 ms) → check (200 ms) |
| Worklog posted to Jira | Entry appears in "Logged today" list with subtle 200 ms slide-in; total updates; badge updates within 30 s (NFR4) |
| Failure (network / auth) | Entry shows a small clock icon + "Pending — will retry"; toast appears once per session: "Can't reach Jira; your worklog will post when we're back online" |
| Hours unparseable | Submit blocked; helper text: "Use formats like `2.5h`, `2h 30m`, or `2:30`" |
| Hours > 24 | **Submit hard-blocked.** Inline error: "Hours per entry can't exceed 24. Split into multiple entries if needed." (Hard block prevents typo errors entirely; legitimate >24h sessions are rare and split-able.) |

**Phase 4 — Completion**

The user knows they're done when:
- The new worklog entry is visibly in the "Logged today" list with hours.
- **The popup remains open** in case they want to log another. (Per Q4 — staying open serves the common case where the worker logs 2–3 things in one session.)
- The total hours number in the header has incremented.
- The badge counter on the toolbar icon (visible if the user looks) has decremented.
- The pick-a-ticket input has cleared and refocused, ready for the next entry.

**No success modal. No toast. No congratulations.** The state update is the success.

### Mechanics Variants for the Other Two Initiation Paths

**Banner-driven (FR19, contextual quick-log):**

When the worker is on a Jira subtask page (e.g., `/browse/PROJ-455`), the banner shows:

```
┌──────────────────────────────────────────────────────────┐
│ 📊 6h unlogged this week.                                │
│ Log time on PROJ-455? [hours___] [Log]      ✕ dismiss   │
└──────────────────────────────────────────────────────────┘
```

The hours field is pre-focused. User types `1.5`, hits Enter, banner collapses (slides up over 200 ms). No popup opens. Banner re-appears on the next Jira page visit if hours are still owed.

**Notification-driven (FR16):**

```
┌──────────────────────────┐
│ 🕐 Log today's time      │
│ 5h / 8h logged today     │
│        [Open] [Dismiss]  │
└──────────────────────────┘
```

User clicks Open → popup opens to Today view, pre-warmed, focused on the search/pick input. Identical flow from there.

### Edge Cases and Error Recovery

| Edge case | Behavior |
|---|---|
| User types a ticket key not in the picker (e.g., `OTHER-789`) | Search Jira on the key; if found, offer "Add this ticket" — see Challenge #8 in Discovery |
| Hours field is empty when Enter pressed | Submit blocked; subtle nudge "Enter hours" |
| Hours unparseable (text in number field, malformed) | Submit blocked with helper text |
| Hours > 24 in a single entry | **Submit hard-blocked** with inline error; user must split into multiple entries |
| User hits Enter twice quickly | Second submit ignored (button disabled while first is in flight) |
| Network drops mid-submit | Entry queued in outbox; user sees pending indicator; service worker retries |
| OAuth token expired silently | API returns 401; service worker triggers refresh; user sees no interruption |
| OAuth grant revoked at Atlassian | API returns 401 even after refresh; popup falls back to "Connect to Jira" CTA; previously-pending outbox items wait for reconnect |
| User picks a Task with no subtask assigned to them (FR9) | "+ Create my subtask under this Task" affordance appears in place of the hours field; click prompts for name; on confirm, subtask is created and the hours field appears |

## Visual Design Foundation

### Brand Identity

The product uses the **company logo** (provided) as its visual anchor:

- A stylized character set in **white** against a **muted indigo-violet gradient** (approximately `#4a4570` → `#7a719b`).
- Conveys calm, distinctive, organizational identity. The logo's mid-tone purple becomes the product's **accent color** (replacing what would have been a generic blue).
- The logo is the source for the extension's toolbar icon (rendered at 16, 32, 48, and 128 px sizes in `public/`).

**Logo placement across surfaces:**

| Surface | Logo treatment |
|---|---|
| Toolbar icon (Chrome / Edge) | Logo as the action icon, with the badge counter overlay |
| Options page header | Logo at 32 px height, top-left, alongside "jira-time-logger" wordmark |
| First-run Connect screen | Logo at 64 px, centered above the "Connect to Jira" CTA |
| Notification icon (daily push) | Logo as the notification's app icon |
| Popup | **No logo** — the popup is dense and 360 px wide; visible-at-all-times badge is the brand presence |
| Content-script banner | **No logo** — the banner is a guest in Jira's UI; no brand intrusion |

### Color System

The palette is **neutral-first, state-driven, single-accent (brand purple)** — mirroring Linear and Stripe's restraint while honoring the company's brand identity. Most surfaces are grayscale; color appears only to communicate state or to mark the product's identity moments.

#### Semantic Color Tokens

```ts
// tailwind.config.ts excerpt
const colors = {
  // Neutrals — the dominant palette (Tailwind's slate scale)
  neutral: {
    50:  '#f8fafc',  // page bg, popup bg
    100: '#f1f5f9',  // subtle row hover
    200: '#e2e8f0',  // borders, dividers
    300: '#cbd5e1',  // disabled text, skeletons
    500: '#64748b',  // secondary text
    700: '#334155',  // primary text
    900: '#0f172a',  // headings
  },

  // Brand accent — derived from the company logo's mid-tone purple
  // Used sparingly for primary CTAs, active states, and brand moments
  accent: {
    DEFAULT: '#6b5b95',  // logo midpoint — calm muted purple
    hover:   '#5a4d7e',  // darker for hover/pressed
    subtle:  '#e9e6f3',  // very light tint — selected-row bg, banner bg
    deep:    '#4a4570',  // darkest from logo gradient — for headings on accent bg
  },

  // Brand gradient (for hero moments — first-run, options page header)
  brand_gradient: {
    from: '#4a4570',  // dark indigo-purple (top of logo gradient)
    to:   '#7a719b',  // light mauve (bottom of logo gradient)
  },

  // State — desaturated, never alarming
  state: {
    success:        '#16a34a',  // sage green (Tailwind green-600)
    success_subtle: '#dcfce7',  // green-100 cell bg
    warning:        '#ca8a04',  // muted amber (yellow-600)
    warning_subtle: '#fef9c3',  // yellow-100
    danger:         '#dc2626',  // honest red (red-600)
    danger_subtle:  '#fee2e2',  // red-100
    info:           '#0891b2',  // cyan-600 — for "pending" states
    info_subtle:    '#cffafe',  // cyan-100
  },
};
```

#### Color Usage Rules

| Use | Token |
|---|---|
| Popup background | `neutral.50` |
| Popup primary text | `neutral.700` |
| Popup secondary text (timestamps, hints) | `neutral.500` |
| Popup borders, dividers | `neutral.200` |
| Primary CTA (Connect, Approve, Mark-as-Done) | `accent.DEFAULT` background + white text |
| Secondary action (Edit, Delete) | `neutral.700` text on `neutral.50` bg |
| Active tab / selected row | `accent.subtle` background |
| Active tab indicator (underline) | `accent.DEFAULT` |
| First-run hero / options page header bg | `brand_gradient` (linear, top-left to bottom-right) |
| Day-cell green (≥ target or PTO) | `state.success_subtle` bg + `state.success` text |
| Day-cell red (< target, not PTO) | `state.danger_subtle` bg + `state.danger` text |
| Matrix cell yellow-stripe (dirty / re-approval needed) | `state.warning_subtle` bg with diagonal stripe pattern + `state.warning` text |
| Matrix cell approved (dark green) | `state.success` bg + white text |
| Pending worklog (outbox) | `state.info_subtle` bg + clock icon |
| Error border (invalid hours input) | `state.danger` border |
| Inline Jira banner background | `accent.subtle` (purple-tinted, harmonizes with Jira's blue palette without competing) |
| Inline Jira banner accent (logo dot, button bg) | `accent.DEFAULT` |
| Toolbar badge background (Chrome handles this; we set color only) | `state.danger` text on Chrome's default badge bg when deficit > 0; nothing when deficit = 0 |

#### Color Accessibility

Per NFR12 (color-not-sole-signal):
- **Every state color is paired with an icon and a text label.** Red day cells include `⚠` icon + small text "below target". Yellow stripe includes `↻` icon + tooltip "needs re-approval". Green cells include `✓` icon when actively marked done.
- **Contrast ratios verified WCAG AA:**
  - `neutral.700` text on `neutral.50` bg: 9.7:1 ✓
  - White text on `accent.DEFAULT` bg: 5.2:1 ✓
  - `accent.DEFAULT` text on white bg: 5.2:1 ✓
  - `state.danger` on `state.danger_subtle`: 6.2:1 ✓
- **Focus rings use `accent.DEFAULT` at 2 px width** (NFR13: visible focus indicator).

### Typography System

#### Font Family

**System font stack** (per Q3 — try system-ui first; fallback to a web font like Inter only if cross-machine inconsistency becomes a real problem):

```css
font-family:
  ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

/* Monospace for ticket keys and hour values */
font-mono:
  ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
  "Liberation Mono", "Courier New", monospace;
```

#### Type Scale

Anchored on a **14 px body** (per Q2 — confirmed; matches Linear / Stripe Dashboard density).

| Token | Size | Line height | Use |
|---|---|---|---|
| `text-xs`   | 12 px | 16 px | Timestamps, helper text, table-cell numbers |
| `text-sm`   | 14 px | 20 px | **Body default** — list items, form fields, button labels |
| `text-base` | 15 px | 22 px | Section labels, secondary headings |
| `text-lg`   | 17 px | 24 px | View titles ("Today", "Week", "Manager") |
| `text-xl`   | 20 px | 28 px | Total hours in header (e.g., `7h / 8h`) |
| `text-2xl`  | 24 px | 32 px | Options page section headings |
| `text-3xl`  | 28 px | 36 px | First-run "Connect to Jira" headline only |

#### Font Weight

Three weights total; no italic.

- `font-normal` (400) — body text
- `font-medium` (500) — subtle emphasis (ticket keys, form labels)
- `font-semibold` (600) — primary action labels, view titles, total hours

#### Typographic Patterns

| Pattern | Treatment |
|---|---|
| Ticket key (`PROJ-455`) | `font-mono`, `text-sm`, `font-medium`, `neutral.900` |
| Ticket summary | `font-sans`, `text-sm`, `font-normal`, `neutral.700` |
| Hours in row (`2.0h`) | `font-mono`, `text-sm`, `font-medium`, `neutral.700` |
| Hours in header (`7h / 8h`) | `font-mono`, `text-xl`, `font-semibold` (hours) + `text-base`, `font-normal` (target) |
| Form labels | `font-sans`, `text-sm`, `font-medium`, `neutral.700` |
| Helper text below input | `font-sans`, `text-xs`, `font-normal`, `neutral.500` |
| Error messages | `font-sans`, `text-xs`, `font-medium`, `state.danger` |
| Empty states | `font-sans`, `text-sm`, `font-normal`, `neutral.500`, centered |
| First-run headline | `font-sans`, `text-3xl`, `font-semibold`, white (on brand gradient) |
| Options page wordmark | `font-sans`, `text-lg`, `font-semibold`, `neutral.900` |

### Spacing & Layout Foundation

#### Spacing Scale

**4 px base unit.** Tailwind's default scale (1=4px, 2=8px, 3=12px, 4=16px, 6=24px, 8=32px). No custom spacing tokens — the default is comprehensive enough.

#### Layout Density Principle

Popup is **dense but not crowded** — closer to Linear or Notion than to Material Design's airy defaults. Density rationale: a 360 px popup viewing 5–10 list items must show enough metadata to scan without scrolling.

| Element | Padding/spacing |
|---|---|
| Popup outer padding | `p-4` (16 px) — slightly tight |
| Section vertical gap | `space-y-3` (12 px) |
| List item vertical padding | `py-2` (8 px) |
| List item horizontal padding | `px-3` (12 px) |
| Form field gap | `gap-2` (8 px) between input and adjacent button |
| Button padding (sm) | `px-3 py-1.5` |
| Button padding (default) | `px-4 py-2` |
| Dialog padding | `p-6` (24 px) — more breathing room for modal contexts |
| Options page max-width | `max-w-2xl` (672 px), centered |
| Options page section gap | `space-y-8` (32 px) — patient context allows generosity |

#### Surface Dimensions

| Surface | Dimensions |
|---|---|
| Popup | 360 px × auto-grow (max 600 px height; scrolls past) |
| Banner | 100 % width × ~56 px tall (collapsed); ~120 px (expanded with quick-log form) |
| Options page | Browser tab; content max-width 672 px, generous vertical scroll |
| Brand-gradient hero region (first-run, options page header) | Full surface width × 120 px tall |

#### Layout Patterns

- **Popup is single-column.** Tabs at top; one content area below. No sidebars (insufficient horizontal space).
- **Manager matrix uses horizontal scroll** when Epics > 4 visible columns. First column (person name) is sticky.
- **Options page is single-column** with a `max-w-2xl` constraint. Settings group into thematic sections separated by `space-y-8`.
- **Banner is full-width within Jira's content area**, anchored to the top of the page; height collapses when no expanded form is visible.

### Iconography

- **Library:** [`lucide-react`](https://lucide.dev) (per Q4 — confirmed). Clean line icons, ships with shadcn/ui, no extra dependency.
- **Default size:** 16 px in popup; 14 px in compact metadata contexts (badges, helper text); 20 px on options page section headers.
- **Color:** inherits from text color (`currentColor`).
- **State icons** (paired with state colors per NFR12):
  - `Check` (success / approved)
  - `AlertCircle` (warning / dirty)
  - `XCircle` (error)
  - `Clock` (pending / outbox)
  - `Lock` (visibility-restricted)
  - `Plus` (add / create subtask)
  - `Search` (search Jira)
  - `Settings` (cog, opens options)
  - `RefreshCw` (sync, retry)

### Border & Shadow

- **Border radius:** `rounded-md` (6 px) for buttons and inputs; `rounded-lg` (8 px) for popovers and cards.
- **Borders:** `1px solid neutral.200` for separators and input borders.
- **Shadows used sparingly:**
  - `shadow-sm` on popovers and tooltips (subtle elevation over the popup background)
  - `shadow-md` on dialogs (modal elevation)
  - **No shadows on cards or list items** (Linear-style flat hierarchy; rely on borders and spacing)

### Motion

Per principle #6 (Tasteful motion that earns its weight). Allowed transitions:

| Transition | Duration | Easing | Where |
|---|---|---|---|
| Popup mount fade-in | 120 ms | ease-out | Popup open (within NFR1 budget) |
| Cell color change (red ↔ green) | 200 ms | ease-in-out | Day cell, matrix cell |
| Banner slide in/out | 200 ms | ease-out | Inline banner on Jira |
| List-item slide-in | 200 ms | ease-out | New "Logged today" entry |
| Skeleton shimmer | 1500 ms loop | linear | Loading rows in matrix / weekly grid |
| Manager-row stagger reveal | 100 ms per row | ease-out | Matrix progressive render |
| Dialog open | 150 ms | ease-out | Gap acknowledgment dialog |
| Hover state | 100 ms | linear | Buttons, list rows |
| Focus ring | instant | none | Accessibility — instant focus indication |

**No** parallax, hero animations, scroll-triggered animations, loading spinners (use skeletons instead).

### Accessibility Considerations

- **WCAG AA contrast** verified for all text/background pairings.
- **Focus indicator** uses `accent.DEFAULT` 2 px ring; `outline-offset: 2px` for clarity on dense lists.
- **Color-not-sole-signal** every state color is accompanied by an icon, label, or pattern (yellow stripe uses diagonal lines, not just yellow bg).
- **Keyboard navigation** through Radix primitives; `Tab` order follows DOM order; `Esc` closes popovers and dialogs; `Enter` submits forms.
- **Screen reader semantics** inherited from Radix primitives; custom components use proper `aria-label`, `aria-live` (`polite` for badge updates, `assertive` for errors), and semantic HTML (`<table>`, `<button>`, `<form>`).
- **Reduced motion** — respect `prefers-reduced-motion: reduce` by replacing all transitions ≥ 100 ms with instant changes. Skeleton shimmer becomes a static neutral fill.
- **Font sizing** respects browser zoom; we use `rem` for type sizes (Tailwind default).
- **Tap targets** minimum 32 × 32 px on the popup; 44 × 44 px on options page (we have the room).

### Asset Inventory (for implementation handoff)

| Asset | Source | Format | Sizes |
|---|---|---|---|
| Brand logo (raster) | Provided by user | PNG | 16, 32, 48, 128 px (extension icon set), plus 64 px (first-run hero) and original (options page) |
| Brand logo (preferred future asset) | TBD | SVG | Single source-of-truth; rasterize per build for icon set if needed |
| Notification icon | Same as brand logo | PNG | 96 px (Chrome notification standard) |

**Note for implementation:** the WXT build can auto-generate the icon set from a single source PNG via `wxt.config.ts` icon configuration. Provide the highest-resolution logo source available; WXT handles per-size optimization.
