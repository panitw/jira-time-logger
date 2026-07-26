---
name: jira-time-logger
description: How the extension behaves — information architecture, states, interactions, accessibility, and the flows Priya and Marco actually walk. Visual identity lives in DESIGN.md.
status: final
updated: 2026-07-25
design_reference: ./DESIGN.md
sources:
  - ../../prd.md
  - ../../epics.md
  - ../../architecture.md
  - ../../ux-design-specification.md  # superseded on visual direction; personas and FRs still valid
  - ../../../../docs/a11y-audit-2026-06-27.md
  - ../../../../docs/a11y-deviations.md
---

# EXPERIENCE.md — jira-time-logger

Behaviour and structure. Visual tokens are referenced as `{path.to.token}` and resolve against
[DESIGN.md](./DESIGN.md). **Both spines win over any mockup on conflict.**

Reference mockup: [imports/jira-time-logger.dc.html](./imports/jira-time-logger.dc.html).

## Foundation

**Form factor:** Chromium browser extension (Manifest V3), Chrome and Edge, desktop only. Keyboard and mouse;
no touch, no mobile. Two designed surfaces plus two ambient ones:

| Surface | Contract | Status |
|---|---|---|
| Toolbar popup, 380×560 | Ephemeral. One job: log time today. | Redesigned |
| Full page (browser tab) | Patient. Week review, manager matrix, settings. | Redesigned |
| Toolbar badge | Ambient. A number, always visible. | Unchanged |
| Inline Jira banner (content script) | Guest inside Jira's UI, inline styles only (CSP). | Redesigned as the **guest rail** |

**UI system:** shadcn/ui on React 19 + Tailwind v4 (CSS-first `@theme`), Radix primitives (dialog, tabs,
popover), lucide-react icons. DESIGN.md tokens override shadcn's neutral defaults wholesale; component
behaviour inherits from Radix unless specified below.

**Fonts are bundled, not fetched.** Extension CSP forbids the Google Fonts CDN. Kanit 400/500/600 and
Noto Sans (Latin) 400/500/600 ship as local woff2 in `public/fonts/` with `@font-face` in `styles/globals.css`.

**Light mode only.** Tokens are semantic so a dark theme can be derived later without redesign.

## Information Architecture

The governing rule: **the popup does one job.** Everything the popup used to hold and couldn't serve has
moved to the full page.

```
Toolbar popup (380×560) ─ "log time today"
├── Chrome header — date · logged/target · progress
├── Resume card — last-logged ticket, quick hours        ← the first move
├── Search — any ticket, live from Jira                  ← the browse mechanism
├── Logged today — what's on the clock
├── Recently worked — 4 rows + "51 more · Search to find them →"
└── Action bar — "Mark today as time off" · "Open week ↗"

Full page (tab)
├── Week review — grid, totals, time off, mark-week-done + gap dialog
├── Manager matrix — reports × epics, approve, drill-down   (only if the user has reports)
└── Settings — five blocks, weighted by what they are:
    ├── Connection ......... facts, no input affordance
    ├── Reporting line ..... facts, read-only, resolved from Jira
    ├── Logging defaults ... the ONLY place anything can be typed
    ├── Diagnostics ........ facts + one safe action
    └── Disconnect ......... separated, grey rule, error ink, confirm dialog

Guest rail (inside Jira, 44px) ─ "you have unlogged time, and here's the ticket you're looking at"
├── Mark · "Time Logger" · "3.5h unlogged this week"
├── Contextual action — ONLY on /browse/<KEY> — expands in place
└── Open extension ↗ · Dismiss for today
```

**Closure check.** Log today → popup. See the week → week review. Fix a forgotten day → week review grid.
Approve the month → matrix. Configure once → settings. Discover a gap without opening anything → badge and
banner. Every stated need has a surface; every surface has a flow that lands there.

**The 55-ticket resolution.** The popup never renders 55 rows. It shows the four tickets actually touched
this week, ranked by recency, and hands the other 51 to search — *"Search to find them →"*. Search is the
browse mechanism, not a filter layered on top of one. This also solves logging against a teammate's ticket
for free: search queries Jira live, so unassigned tickets are reachable through the same control. One list,
one scroll region, no tabs.

## Voice and Tone

The product's hardest copy problem is that it measures people. Every string is written to inform without
judging.

**Rules:**
- State the fact, not the verdict. *"2.5h short"* — never *"below target"*, never *"incomplete"*.
- Never use the imperative about the user's own diligence. No *"Don't forget!"*, no *"You should log…"*.
- Name what happened and where things went. *"Your 1.5h is saved locally."*
- Say what the software cannot do, plainly. *"1 epic has worklogs you can't see. Approving does not cover them."*
- Time is written in hour-decimals — `1.5h`, not `1h 30m`.
- Sentence case everywhere except eyebrows, which are uppercase with letter-spacing.
- **"Time off", never "PTO".** The acronym is HR jargon that not everyone parses the same way (and reads as
  US-specific). "Time off" is unambiguous to every reader. This applies to all user-facing copy, labels, and
  accessible names. Internal identifiers may stay `pto` — see Open Items.

**Strings never contain their icon.** The icon is a sibling element, not a character in the string — so
these values go into `STRINGS` maps verbatim and the icon is composed alongside. This also keeps the string
readable to a screen reader, which never receives the icon at all.

**Reference strings:**

| Situation | Copy |
|---|---|
| Nothing logged yet | "Nothing on the clock yet today." / "Add hours above, or search for a ticket." |
| Progress, mid-day | "5.5h to go today" |
| Target met | "Target met — 8h logged" |
| Time-off day | "Time off — counted as a full day" |
| Time-off card | "Marked as time off" / "8h logged to KNP-99 · Time off. This day counts toward your week and needs nothing else from you." |
| Undo | "Undo time off" |
| Day under target | "2.5h short" |
| Workday with nothing | "Workday with nothing logged" |
| Partially logged, in legend | "Partially logged — normal, not an error" |
| Offline | "Offline — 2 entries queued" / "They'll sync to Jira automatically when you're back." |
| Write rejected | "Jira didn't accept that worklog" / "GAPI-348 · 403, you may not have Work On Issues permission. Your 1.5h is saved locally." |
| Search scope | "Searched live in Jira — includes tickets that aren't assigned to you." |
| Closing an incomplete week | "Close the week at 28 of 40h?" / "Three days are under 8h. That's fine if it's accurate — accounting reads these numbers as final once the week is closed." |
| Gap checkbox | "These hours are correct. I'm not missing time." |
| Approval confirm | "You're approving 158.5h across 5 epics for the June cycle. Accounting uses this figure." |
| Connect | "Sign in once with your KKP Jira account." / "Nothing is sent anywhere except your Jira instance." |

## Component Patterns

Visual specs in {components}; these are the behavioural contracts.

**Resume card.** Populated from the most recently logged worklog (any day, not just today). The hour input
is focused on popup open and pre-filled with the last-used value for that ticket. `+0.5 / +1 / +2` write
immediately without a confirm step. `⏎` submits. On success the entry animates into *Logged today*, the
chrome figure and progress bar update, and focus returns to the input. The popup does not close.
When no worklog history exists, the card is replaced by the search field promoted to primary.

**Search.** `/` focuses from anywhere in the popup; `Esc` clears and restores the lists. Typing replaces
*Logged today* and *Recently worked* with a results card. Results are debounced against Jira, ranked
assigned-first (an "assigned to you" pill) then by relevance, each unassigned result showing its assignee.
The first result is preselected with a hour input inline — `⏎` logs it without a second step. `↑↓` moves.

**Recently worked.** Four rows, ranked by recency of the user's own worklogs, each with a `+` that seeds the
resume card. Terminates in a row reading "51 more assigned tickets · Search to find them →" — a handoff, not
a "show all" that would reintroduce the 55-row scroll.

**Logged today.** One row per worklog: key, summary, hours, edit and delete. Delete is immediate with an
undo affordance rather than a confirm dialog. Editing opens the hours inline, not in a modal.

**Week grid.** Cells are editable in place. `Tab` moves across the day, `Enter` saves and drops focus to the
next row, `Esc` reverts. Empty cells accept a value without any "add" ceremony. Day headers open a popover
for full-day or half-day time off.

**Matrix.** Rows stream in as Jira responds — a report appears the moment its data lands, with a progress
line reading "Loading 2 of 7 reports — rows appear as Jira responds (rate-limited, ~600 cells)." Clicking
any exception cell opens the drill-down rail. Approve is per-report; "Approve remaining" batches the
untouched ones behind a single confirm.

**Settings blocks.** Grouping is by *what a thing is*, not by topic. Facts (connection, reporting line,
diagnostics) render as hairline row tables with no input affordance at all — you can see immediately that
there is nothing to fill in. Choices live in a single padded card, so there is exactly one region on the page
where typing happens. Disconnect sits apart under a grey rule rather than a purple one, in a sunk card with
an error-ink outline button, reachable by scrolling and never adjacent to anything clicked routinely. It
keeps its confirm dialog because it is irreversible in a way Clear cache is not.

**Catch-all validation.** Four states across the key field and its dependent time-off select: idle ·
**validating (neutral — never red)** · valid, showing the project name and subtask count · invalid, amber,
stating what it did to the dependent field. Mid-typing must never look like failure; the select simply
waits. Only a settled, wrong key earns amber.

**Guest rail.** Appears only when the user has unlogged time, hasn't dismissed today, is connected, and has
valid auth. Collapsed it states a number and stops. On a `/browse/<KEY>` page it adds one contextual action,
which expands **in place without changing the rail's height** — the hours field takes the space the action
vacated. `Enter` logs, `Esc` closes. On success the button confirms, then the rail slides away after 600ms.
Dismissal lasts for the day. It never blocks, never throws, and never asks twice.

**Dialogs.** Two exist, both deliberate friction: gap acknowledgment and approval confirm. Each presents
evidence rows before its actions, and each requires an explicit affirmative — a checked statement or a
figure-bearing button ("Approve 158.5h"). Neither can be dismissed by clicking the backdrop.

## State Patterns

Every surface resolves to exactly one of these. The popup's nine states are all rendered in the mockup.

| State | Trigger | Treatment |
|---|---|---|
| **Empty** | Nothing logged today | Resume card is the only loud element. No illustration, no advice, no onboarding. |
| **Partial** | Some hours logged | Default case. Progress stated in the chrome; entries listed. Never scolded. |
| **Target met** | ≥ target hours | A quiet green `{icons.met}` in the progress note. No celebration, no confetti. |
| **Time off** | Day marked as time off | Settled `{icons.time-off}` card with an Undo. Logging stays *available* but stops asking. |
| **Searching** | Search focused with a query | Lists replaced by results; first result preselected. |
| **Loading** | Cold open, data in flight | Skeletons in the real layout shape. Chrome paints instantly. Never a spinner. |
| **Offline** | Network unavailable | Amber banner above the resume card; writes queue; hot path still works. |
| **Write error** | Jira rejected a worklog | Red banner naming ticket, reason, and where the hours went. Retry + "Log elsewhere" inline. |
| **Disconnected** | No valid auth | Chrome still identifies the product; one action; no dead UI behind it. |

**Day status vocabulary** — five states, each with a lucide icon, and only one of them is a warning:

| Glyph | State | Colour | Meaning |
|---|---|---|---|
| Icon | State | Colour | Meaning |
|---|---|---|---|
| `{icons.met}` CircleCheck | Met | `{colors.status-clean}` | 8h or more |
| `{icons.partial}` ChartPie | Partial | `{colors.foreground}` | Partially logged — normal, not an error |
| `{icons.attention}` Circle *(filled)* | None | `{colors.amber-ink}` | A workday with nothing logged at all |
| `{icons.time-off}` Diamond *(filled)* | Time off | `{colors.legacy-purple}` | Settled and correct; counts toward the week |
| `{icons.weekend}` Minus | Weekend | `{colors.faint}` | Column recedes; no target, no status |

Neither `{icons.loading}` nor `{icons.restricted}` is a day status. `LoaderCircle` means the product is
still working; `EyeOff` means the viewer isn't permitted to see something. Time off gets its own filled
`Diamond` because it is the opposite of both: a finished, intentional day. The original draft collapsed all
three into a single half-filled circle, which let a booked holiday read as "still calculating."

**Partial is the new state.** It's what the old build had no vocabulary for and therefore rendered as red —
the root cause of the five-red-chips row. Amber appears **once** in a normal week, on a workday with
genuinely zero hours. Red never appears for time at all.

**Matrix cell states:** clean (bare number, no decoration) · approved (`{icons.met}` on the row total) ·
dirty (`{icons.attention}` amber chip, edited after approval) · missing (dashed "no hours" chip) ·
restricted (`{icons.restricted}` "hidden" chip — worklogs the manager cannot see) · empty (`·`).

## Interaction Primitives

**Keyboard is the primary input for the popup.** The entire hot path is reachable without a mouse:
open → hours are already focused → type → `⏎`. Nothing else is required.

| Key | Action |
|---|---|
| `/` | Focus search |
| `Esc` | Clear search / revert a cell edit / close a dialog |
| `⏎` | Submit hours · log the preselected result · save a cell |
| `↑ ↓` | Move through search results |
| `Tab` | Move across the day in the week grid |
| `⌘/Ctrl + Z` | Undo a delete, while the undo affordance is present |

Keyboard affordances are **visible**, not hidden: a `{icons.submit}` badge sits inside the hour input, `/`
sits in the search field, and the week grid states "Tab moves across the day, Enter saves" under the table.
The badge is decorative — `aria-hidden`, so it is never announced as part of the input's value.

**Motion.** Entrances 120ms ease-out, list changes 200ms. Skeletons pulse at 1.4s. No entrance animation on
popup open — the TTI budget is 400ms warm and animation would spend it. `prefers-reduced-motion: reduce`
disables all of it.

**Feedback.** Writes are optimistic: the entry appears immediately, reconciling when Jira confirms. A
failure demotes it to the error banner with the hours preserved locally — never silently dropped.

## Accessibility Floor

WCAG 2.2 AA. Existing audit: [a11y-audit-2026-06-27.md](../../../../docs/a11y-audit-2026-06-27.md);
approved deviations: [a11y-deviations.md](../../../../docs/a11y-deviations.md).

- **Status is never colour alone.** Every state pairs colour + icon + visible text label. This is enforced
  by the icon vocabulary above, not left to implementers.
- **Icons are decorative, always.** Every lucide icon carries `aria-hidden="true"`, and the meaning lives in
  the text beside it. Delete the icon and the state must still read correctly — which is also the test for
  whether the label is doing its job. This is strictly better than the text glyphs the design was drafted
  with, which sat in the accessibility tree and got announced ("black diamond") ahead of the actual label.
- **Full keyboard operation** of every flow, including the entire popup hot path and week-grid cell editing.
  Focus order follows visual order.
- **Visible focus** on every interactive element: `{elevation.focus-ring}` plus a 1.5px
  `{colors.primary}` border. Never `outline: none` without a replacement.
- **Text contrast** — `{colors.faint}` at 4.6:1 is the floor and must never be lightened.
  `{colors.faint-decorative}` is non-text only. `{colors.amber-ink}` on `{colors.amber-soft}` is 5.9:1.
  White on the chrome gradient clears AA at every stop.
- **Live regions.** The progress figure, queue count, and matrix streaming line are
  `role="status" aria-live="polite"`. Write failures are `role="alert"`.
- **Dialogs** trap focus, are labelled by their title, restore focus on close, and cannot be dismissed by
  backdrop click — both carry consequences.
- **Tables** use real semantics: the week grid and matrix are `<table>` with scoped headers, so a screen
  reader announces "Wednesday, MBS-135, 4 hours" rather than reading a wall of numbers.
- **Reduced motion** is honoured globally.
- **Hit targets** are ≥24×24px (the `+`, edit, and delete buttons sit exactly at 24px).

## Key Flows

### 1. Priya logs an hour between meetings

Priya has 90 seconds before her next call. She logged 1.5h against MBS-135 two days ago and has just spent
the morning on it again.

1. She clicks the toolbar icon. The chrome paints instantly — `Fri, Jul 24`, `2.5 / 8h`, `5.5h to go today`.
2. The resume card is already showing **MBS-135 · MBS1045 - DirectDebitListing**, "logged 1.5h today", with
   the hour field focused and holding `1.0`.
3. **The climax:** she types `2`, presses `⏎`, and it's done. The entry slides into *Logged today*, the
   chrome figure ticks to `4.5 / 8h`, the bar grows, and focus returns to the input. She never touched the
   mouse, never read a list, never made a decision. Total elapsed: under four seconds.
4. She closes the popup. The badge drops by two.

*What makes this work:* the product guessed correctly, and made the guess editable rather than automatic.

### 2. Priya logs against a ticket that isn't hers

Wednesday, she spent two hours helping Anucha debug an ETL job. GAPI-330 is assigned to Anucha, so it isn't
in her list at all.

1. She opens the popup and presses `/`. The lists vanish; the search field takes the purple border.
2. She types `abacus etl`. Three results appear — GAPI-330 first, tagged "assigned to you"; below it
   GAPI-348; below that GAPI-361 tagged **"Anucha P."**
3. She reads *"Searched live in Jira — includes tickets that aren't assigned to you"* and understands
   immediately that the third result is reachable.
4. **The climax:** GAPI-361 is what she wants. She presses `↓↓`, types `2.0`, hits `⏎`. A ticket she was
   never assigned, logged in one control, without leaving the popup or visiting Jira.

*What makes this work:* search is the browse mechanism, so there is no separate "add a ticket" flow to find.

### 3. Priya closes a week she knows is imperfect

Friday, 5pm. She opens the week review from the popup's "Open week ↗".

1. The grid shows five subtask rows across seven columns. Wednesday is a purple time-off column at 8.0h
   marked with a filled diamond. Three days carry the partial pie icon and quiet notes: "2.5h short",
   "1.5h short", "in progress".
2. Nothing is red. Nothing accuses her. She reads the shape of her week in about two seconds.
3. She clicks into Monday's MBS-135 cell, types `2.5`, hits `⏎` — she'd forgotten a deployment. Monday's
   total flips to `8.0` with the met check, and the bar goes green.
4. She hits **Mark week as done**. The gap dialog appears: *"Close the week at 30.5 of 40h?"* with the two
   remaining short days listed as evidence.
5. **The climax:** she reads *"That's fine if it's accurate — accounting reads these numbers as final once
   the week is closed."* She pauses — genuinely considers it — ticks *"These hours are correct. I'm not
   missing time,"* and clicks **Close the week**. The friction did its job without making her feel policed.

### 4. Marco approves the month

First Tuesday of July. Marco has seven reports and a calendar full of one-on-ones.

1. He opens the matrix. The chrome reads `June 2026`, `5 of 7 approved`, and "2 need attention" behind a
   filled amber dot. Rows stream in.
2. The grid is 42 cells of plain, silent tabular numbers — and exactly three that aren't: an amber dirty
   chip reading `6.5` under Anucha, a dashed "no hours" under Nara, and an eye-with-a-slash "hidden" chip
   beside it.
3. **The climax:** he doesn't scan. His eye goes straight to the three decorated cells, because they are the
   only decorated things on the screen. He clicks the amber one.
4. The drill-down rail names it: *"Anucha P. · GAPI-330 — 6.5h · edited 4 days after approval"*, four
   worklogs listed with the two changed ones flagged, and a plain summary: *"Two entries changed since you
   approved on 3 Jul: +1.5h on 12 Jun, and a note edit on 18 Jun."* He clicks **Re-approve 6.5h**.
5. Nara's row: he clicks Approve, and the confirm warns *"1 epic has worklogs you can't see. Approving does
   not cover them."* He approves anyway, and the caveat is recorded in the approval comment.
6. Elapsed: six minutes, against the half-day this used to cost him.

*What makes this work:* correctness is silent, so exceptions don't have to compete for attention.

## Inspiration & Anti-patterns

**Inherited posture:** Linear and Raycast — density without crowding, keyboard-first, precise. Adopted as
*behaviour and rhythm*; the palette and type are KKP's.

**Anti-patterns — all observed in the shipped build this replaces, all now structurally prevented:**

| Defect | Prevention |
|---|---|
| Two tabs' content rendered at once in one endless scroll | Popup does one job; tabs eliminated, not fixed |
| Scroll region nested inside a scroll region | Exactly one scroll region per surface, stated in Layout |
| `below target` five times in red across one row | Partial-state vocabulary + per-day notes; red reserved for failed writes |
| `——` as the empty value | `·`, or a dashed "no hours" chip where emptiness is meaningful |
| Status carried by a bare text glyph, announced by screen readers | `aria-hidden` lucide SVG + a visible text label |
| Four equal-weight headings, no primary action | Resume card owns `{elevation.lift}`; one primary per view |
| Monospace keys colliding with proportional summaries | Kanit + `tabular-nums` throughout; key and summary on separate lines |
| Sections floating on one flat plane | Three-step surface ladder + three hairline weights |
| 55 rows consuming the viewport | Four recent + search handoff |

## Responsive & Platform

Fixed-size surfaces, not responsive ones. The popup is 380×560 and never reflows; Chrome's hard ceiling is
800×600 and this design deliberately sits well inside it. The full pages target 1180px content plus a rail
and degrade by letting the rail wrap below the grid under ~1600px viewport width.

**Platform constraints that shape behaviour:**
- MV3 service worker: data is pre-warmed so the popup can hit its 400ms TTI budget.
- `chrome.storage.local` holds the outbox queue, recent-ticket ranking, and view state.
- The content-script banner cannot use Tailwind classes — Jira's CSP forces inline styles.
- No CDN of any kind: fonts, icons, and styles are all bundled.

## The Guest Rail — platform behaviour

Behaviour that only exists because this surface lives inside someone else's page.

- **Inline styles only.** No stylesheet, no class names, no keyframes, no media queries, no pseudo-elements.
- **Motion is one property.** Entry, expand, and exit are all `transform: translateY()` with `transition`
  set in the inline style string. No keyframes are required anywhere.
- **Hover and focus are JS.** `mouseenter`/`mouseleave` write `el.style.background`; `focus`/`blur` write
  `boxShadow`. Reduced motion is read via `matchMedia` and applied by setting `transition: 'none'` and
  jumping to the end state.
- **Height is a contract.** 44px, always. The `body padding-top` the content script sets is written once,
  and the page never reflows twice for a single interaction.
- **Narrow viewports (<~860px):** the eyebrow and "Open extension" drop, the state line truncates with an
  ellipsis, and the contextual action keeps its full width. **The action never wraps to a second line** —
  wrapping would change the height and break the contract above.
- **Fonts are the system stack.** The bundled Kanit and Noto files are not web-accessible, and Jira's
  `font-src` may reject them even if declared. `tabular-nums` still applies and still works.
- **Icons are hand-inlined lucide SVG paths** — the React components can't be imported into vanilla DOM,
  and a text glyph would be announced by a screen reader.

## Open Items

0. **"Time off" is a copy change, not a code rename.** All user-facing strings, labels, and accessible names
   drop "PTO". Internal identifiers (`ptoSubtask`, `PtoQuickAction`, `PtoPopover`, storage keys) stay as-is —
   renaming them buys nothing for users and would churn a large test surface. The Jira subtask itself
   (`KNP-99 PTO`) is customer data and cannot be renamed from here; where its summary is displayed verbatim,
   show it verbatim.

1. ~~Inline Jira banner unreconciled~~ — **resolved** in round 2 as the guest rail.
2. ~~First-run / connect flow~~ — **resolved**: settings first-run shows a connect card with the logging
   defaults dimmed behind it. *Check that the dimmed controls still clear AA — halving the opacity of a
   compliant control usually doesn't.*
3. ~~Settings never designed~~ — **resolved** in round 2.
3a. **"Re-authenticate" is new functionality, not a restyle.** Round 2 put a Re-authenticate button in the
   Connection block; no such path exists in the codebase (Connect, Disconnect, and ApiTokenSetup only).
   Out of scope for Epic 7 — needs its own story if wanted.
4. **Stakes assumed** internal tool, ~10 users. `[ASSUMPTION]` — never explicitly confirmed.
5. **Popup at 380px** was a facilitator recommendation the producer adopted, not a Note decision. `[ASSUMPTION]`
