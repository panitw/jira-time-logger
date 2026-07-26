---
baseline_commit: bbe0645
---

# Story 7.7: Full-Page Surface & Week Review

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Priya closing out my week on Friday,
I want a full-width grid I can edit in place,
So that fixing a forgotten Wednesday takes one click and one number.

---

## Context

### Read this before you read the acceptance criteria: the scope is smaller than the AC list suggests

Story 7.7's **first acceptance criterion is already met.** Per **D-7.2-1**, Story 7.2 already shipped the
full-page WXT entrypoint. Verified at this baseline:

- `entrypoints/fullpage/{index.html,main.tsx,App.tsx}` exist; WXT compiles the unlisted page to
  `fullpage.html` at the extension root.
- `entrypoints/fullpage/App.tsx:25` routes `Section = 'week' | 'manager' | 'settings'`, seeded from
  `?section=` (`:44-47`) and mirrored back with `history.replaceState` (`:65-70`).
- It mounts the **existing** `WeekView` (`:174`) and `ManagerView` (`:175-184`) unchanged.
- `lib/open-full-page.ts:openFullPage(section)` builds `fullpage.html?section=<section>`, and
  `components/shell/PopupActionBar.tsx` renders the "Open week ↗" button. Pinned by
  `PopupActionBar.test.tsx:100`.

**Do not rebuild any of that. Treat AC1 as met and VERIFY it** (Task 1). `App.tsx:20-22` already carries
the hand-off comment naming this story as the one that supplies the chrome header, the revamped grid, cell
anatomy, totals row and gap dialog.

**7.7's real scope is six things:** the chrome header, the semantic grid geometry, cell anatomy, in-place
editing, the totals row, and the gap dialog.

### The grid is NOT a greenfield build, and it is NOT a table migration either

**The grid already exists from Epic 4, and it is already a semantic `<table>`.** This is the single most
important correction to make before estimating this story. At `bbe0645`:

| Element | Where | Already correct? |
|---|---|---|
| `<table>` | `WeeklyGrid.tsx:436` | Yes |
| `<thead>` / `<tbody>` | `:437` / `:490` | Yes |
| `<th scope="col">` day headers | `:449-451` | Yes |
| `<th scope="row">` subtask rows | `:493-499` | Yes |
| `<td>` body cells | `DayCell.tsx:332,361,374` | Yes |
| Seven **fixed 104 px** day columns | — | **No — no widths at all** |
| "Wednesday, MBS-135, 4 hours" announcement | `DayCell.tsx:103-104` | **No — see D-7.7-24** |

So AC3's "it is a semantic `<table>` with scoped headers" is **already satisfied structurally**. There is
**no div→table migration, and therefore no blast radius on existing tests** from one. What AC3 actually
asks for that is missing is the *column geometry* (seven fixed 104 px columns) and the *announcement
content*. Both are additive.

Note the design source resolves this differently from the AC: `imports/jira-time-logger.dc.html:373,384,397`
use **CSS Grid** (`display:grid;grid-template-columns:1fr repeat(7,104px)`), not a table. The AC and the
a11y requirement win on **structure** (a screen reader cannot announce "Wednesday, MBS-135, 4 hours" from a
grid of divs without a pile of ARIA); the design source wins on the **104 px value**. See D-7.7-23.

### Four binding obligations this story inherits — none may be silently dropped

These are not suggestions. Three come from `deferred-work.md`, one from a standing decision. Each has a
task and an AC below.

1. **`lib/week-gaps.ts:61` — a half-day-off week can be marked done while genuinely short.**
   **D-7.6-38** explicitly assigned this to 7.7 because it is a **write path** and 7.7 owns the gap dialog
   and the mark-done flow. **Closed in this story — see D-7.7-27, which is a one-line deletion.**
2. **`variant="stacked"` has two shape defects and 7.7 is its FIRST real consumer.** See D-7.7-29. It must
   get a real call site **early** and be verified before the D-7.6-3 contract is treated as final.
3. **`DayStatusIndicator` has no `size` prop** and 7.7's AC needs an 11 px `Diamond`. 7.7 is the story
   whose AC pins the value. See D-7.7-30 — and it must be added to **D-7.6-3's canonical block** in
   `epic-7-decision-log.md`, not just to the props type.
4. **The weekend column tint is a SEPARATE axis from day status (D-7.6-46).** 7.6 exports
   `isWeekend(iso)`; 7.7 applies the tint at header, cell **and** totals level so the column reads as ONE
   recessive object. See D-7.7-31.

### Where this story sits

7.7 is the fourth of five surfaces. 7.6 built the shared day-status vocabulary specifically so 7.7's
totals row and 7.8's matrix rows could both consume it — **building a second copy is what its ACs forbid.**
The contract you code against is **D-7.6-3** in `epic-7-decision-log.md:1862`. If you find the contract
cannot express something 7.7 needs, that is an escalation (two such cases are already flagged below as
D-7.7-30 and D-7.7-32), **not** a licence to add a local colour or icon map.

---

## Acceptance Criteria

Transcribed verbatim from `epics.md:1912-1943`, with the implementation delta stated after each.

### AC1 — the full-page surface exists

**Given** no full-page extension surface exists today
**When** this story lands
**Then** a new WXT entrypoint renders a full page in a browser tab, routed to Week / Manager / Settings sections
**And** "Open week ↗" in the popup opens it on the Week section

> **ALREADY MET by Story 7.2 (D-7.2-1).** Verify, do not rebuild. Task 1 is a verification task with no
> production edit. If any part of this is broken at baseline, that is a 7.2 regression — report it, do not
> silently re-implement.

### AC2 — the chrome header

**Given** the page renders
**When** the chrome header paints
**Then** it carries the gradient, the ring motif, "Week of Mon, Jul 20" in Kanit 600 at 26 px, prev/next navigation, the week total against target with a progress bar, and a white "Mark week as done" primary button

> New component. Every value is pinned to the design source in D-7.7-25. **D-7.6-40 governs: status on the
> gradient is white/opacity ONLY — no per-status colour — and the progress bar fill is plain white**
> (confirmed at `imports/jira-time-logger.dc.html:362`).

### AC3 — the semantic grid

**Given** the grid renders
**When** it lays out
**Then** it is a semantic `<table>` with scoped headers, subtask rows against seven fixed 104 px day columns, so a screen reader announces "Wednesday, MBS-135, 4 hours"
**And** weekend columns tint `weekend` at header, cell, and totals level as one recessive object

> The `<table>` and scoped headers already exist. The delta is the 104 px `<colgroup>` (D-7.7-23), the
> announcement content (D-7.7-24), and the three-level weekend tint (D-7.7-31).

### AC4 — cell anatomy

**Given** a cell holds a value
**When** it renders
**Then** it is a 34 px white `rounded-md` box with an `#EDECF2` border; empty cells render a `faint-decorative` middot; the focused cell takes a primary border plus `ring-focus`; time-off cells fill `#F6F5FA` with purple text and a filled `Diamond` at 11 px

> Every value cross-checked against the design source in D-7.7-26. Two of the hexes are un-tokenised and
> D-7.3-14 applies — see D-7.7-28, which is an **escalation**.

### AC5 — in-place editing

**Given** the user edits a cell
**When** they interact
**Then** editing happens in place, `Tab` moves across the day, `⏎` saves and moves to the next row, `Esc` reverts
**And** an empty cell accepts a value with no "add" ceremony

> `DayCell` already does in-place editing, `⏎`-saves and `Esc`-reverts, and already accepts a value into an
> empty cell with no ceremony. The delta is **`Tab` moving across the day** and **`⏎` moving to the next
> row**. See D-7.7-33 for the concrete focus model.

### AC6 — the totals row

**Given** the totals row renders
**When** a day is summarised
**Then** it shows value + target + status icon on line one, a 3 px progress bar coloured by day status on line two, and the plain-language note on line three

> This is `variant="stacked"`'s real call site (obligation 2). `TotalsCell` currently passes
> `variant="inline"` (`WeeklyGrid.tsx:154`). See D-7.7-29 and D-7.7-32.

### AC7 — the gap dialog

**Given** the user clicks "Mark week as done" with days under target
**When** the gap dialog opens
**Then** it reads "Close the week at N of 40h?" with the honest framing from `EXPERIENCE.md`, lists each short day as an evidence row, requires the checkbox "These hours are correct. I'm not missing time.", offers "Keep editing" and "Close the week", traps focus, and cannot be dismissed by backdrop click

> Substantial delta from the existing `GapAcknowledgmentDialog`. Full diff in D-7.7-34. **This is where
> obligation 1 lands** (D-7.7-27).

### AC8 — inherited standing constraints (no AC in epics.md; enforced by every reviewer this epic)

**Given** the epic's standing constraints
**When** any surface this story touches renders
**Then** no WCAG 2.1 AA regression: status is never colour-alone, and deleting the icon **and** the colour
still leaves the state readable from text
**And** every new user-facing string says "time off", never "PTO" (SD-7)
**And** red fires ONLY for a write Jira actually refused — never for any time-related state
**And** zero new colour values; `lucide-react` only; no monospace; `ring-focus` via
`focus-within:`/`focus-visible:`, never static

---

## Resolved questions

**Numbering — finisher note.** The creator originally drafted these as `D-7.7-1 … D-7.7-14` (with the
14th, the time-off `Diamond` escalation, raised in "Decisions the orchestrator should rule on" rather than
given its own heading here) and reserved `D-7.7-30+` for orchestrator/owner rulings. In practice the
orchestrator's rulings landed at `D-7.7-15 … D-7.7-21` instead. To avoid the collision this would otherwise
cause, the bmad-story-finisher renumbered every creator entry below to `D-7.7-22 … D-7.7-35` (this section
covers `D-7.7-22 … D-7.7-34`; the 14th/`D-7.7-35` is item 3 of "Decisions the orchestrator should rule on"
below) and folded them, verbatim, into `epic-7-decision-log.md` as canonical per **D-7.3-11**. Every
`D-7.7-*` citation in this file and in source comments was repointed to match.

### D-7.7-22 — AC1 is met; this story verifies it and does not touch the routing

**Creator decision** (routine — a prior story's recorded decision already covers it).

**Verdict.** `entrypoints/fullpage/App.tsx` keeps its section routing, its auth gate, its `managesReports`
gate and its Settings placeholder **unchanged**. 7.7 adds the chrome header *above* the section content and
leaves the nav, the URL contract and the `WeekView`/`ManagerView` mounts alone.

**Why.** D-7.2-1 built this shell deliberately thin so 7.7 could dress it without re-litigating routing.
`App.tsx:20-22` says so in a comment. Rebuilding it would re-open 7.2's `?section=` contract, which
`PopupActionBar` and `lib/open-full-page.ts` both depend on.

**Consequences.** The Settings body stays the Story 7.10 placeholder (`App.tsx:185-195`). The
`onSwitchToToday` misnomer on `ManagerView` stays — `App.tsx:178-181` explicitly says 7.8 may rename it,
not 7.7.

### D-7.7-23 — The table stays a table; the design source's CSS Grid is not adopted

**Creator decision** (routine — the AC and the spine both say `<table>`, and the design source is a
mockup of appearance, not of markup).

**Verdict.** Keep `WeeklyGrid`'s existing `<table>`. Add column geometry with a `<colgroup>`:

```
<colgroup>
  <col />                      {/* subtask column — flexes */}
  <col span={7} className="w-[104px]" />   {/* seven fixed 104px day columns */}
</colgroup>
```

plus `table-fixed` on the `<table>` so the widths are honoured (without it, a long subtask summary can
still push the day columns). The subtask column takes the remaining width — the design's `1fr`.

**Situation.** `imports/jira-time-logger.dc.html:373` (header), `:384` (body row) and `:397` (totals) all
use `display:grid;grid-template-columns:1fr repeat(7,104px)`. The AC says "semantic `<table>` with scoped
headers … so a screen reader announces 'Wednesday, MBS-135, 4 hours'".

**Why this wins.** SD-6 is explicit that **the spines win over the mockups on intent**, and the design
source is silent on markup semantics — it is a visual artifact. A CSS-Grid rebuild would either lose the
row/column association a screen reader needs, or require re-creating it with `role="table"`/`role="row"`/
`role="columnheader"` ARIA — strictly more code, strictly more fragile, and it would throw away working,
tested markup. The 104 px number is the part the design source authoritatively supplies, and that is what
we take from it.

**Consequences.** **Zero blast radius on existing tests** — no test asserts a div structure, because the
structure is not changing. `WeeklyGrid.test.tsx` and `DayCell.test.tsx` query by role/label, which a
`<colgroup>` addition does not disturb. The one thing to watch: `table-fixed` changes how the subtask
column truncates, and `WeeklyGrid.tsx:500` already sets `max-w-[140px] truncate` on the row header — that
cap was tuned for the 380 px popup and is **too narrow for a 1180 px full page.** The design uses
`max-width:520px` (`:387`). Widen it in the full-page context; do not simply delete the truncation.

### D-7.7-24 — What "announces 'Wednesday, MBS-135, 4 hours'" concretely means

**Creator decision** (routine — makes an AC machine-checkable).

**Verdict.** The accessible name of a value-bearing body cell becomes
`` `${dayName}, ${rowKey}, ${hoursPhrase}` `` — e.g. `Wednesday, MBS-135, 4 hours`. The **hours are spelled
as words** (`4 hours`, `1 hour`, `30 minutes`, `4.5 hours`), because the AC's literal text is `4 hours`, not
`4.0`.

**Situation.** Today `DayCell.tsx:103-104` builds
`` `Hours for ${dayName}, ${rowKey} ${rowSummary}` `` and the cell's visible content is `4.0`
(`secondsToCellDisplay`). So a screen reader announces "Hours for Wednesday, MBS-135 Fix the thing, 4.0" —
neither the AC's phrasing nor a spoken quantity.

**Why this wins.** "4.0" is read by most screen readers as "four point zero", and `rowSummary` inside the
name makes every cell in a row announce the whole summary again — noise in a 35-cell grid. The row header
(`<th scope="row">`) already carries the summary, and a scoped table means the AT associates it
automatically; repeating it per cell is exactly what `scope` exists to avoid.

**Consequences.** A new pure helper (`hoursPhrase(seconds)` in `lib/hours.ts`, alongside the existing
`secondsToCellDisplay`) with its own unit tests for the singular/plural/fractional/minutes boundaries. The
existing `editAria` for the **input** keeps its "Hours for …" framing — an input needs an actionable label,
not a reading of the current value. Keep the two distinct and test both.

### D-7.7-25 — The chrome header, with every value cited

**Creator decision** (routine — SD-6 transcription).

**Verdict.** A new `components/week/WeekChromeHeader.tsx`, rendered by the **full page only**. The popup's
`ChromeHeader.tsx` is a different component for a different surface and is **not** touched by this story.

Values, all from `imports/jira-time-logger.dc.html`:

| Element | Value | Cite |
|---|---|---|
| Gradient | `linear-gradient(165deg,#615B99 0%,#594F74 42%,#4A4163 100%)` | `:345` |
| — already a token | `chrome-gradient` utility, `styles/globals.css:225-231` | — |
| Padding | `18px 26px 20px` | `:345` |
| Ring motif, outer | `right:-70px; top:-96px; 250×250; border 1.5px solid rgba(255,255,255,.14)` | `:346` |
| Ring motif, inner | `right:10px; top:-40px; 140×140; border 1.5px solid rgba(255,255,255,.12)` | `:347` |
| Eyebrow | Kanit 11px/500, `letter-spacing:.1em`, uppercase, `rgba(255,255,255,.72)` | `:350` |
| Week title | **Kanit 26px/600, `#fff`** — "Week of Mon, Jul 20" | `:352` |
| Prev/next | `‹ prev · next ›`, Kanit 12.5px, `rgba(255,255,255,.7)` | `:353` |
| Week figure | Kanit 26px/600 `#fff` ("28") + 14px `rgba(255,255,255,.72)` ("/ 40h") | `:359-360` |
| Progress bar | `190×4px`, track `rgba(255,255,255,.2)`, **fill plain `#fff`** | `:362-363` |
| Primary button | white bg, `#594F74` text, `radius 6px`, `padding 10px 16px`, Kanit 13.5px/600, `box-shadow 0 2px 6px rgba(30,27,46,.18)`, hover `#ECEBF3` | `:366` |

**Notes that matter.**
- The header progress bar is **4 px**; the *totals-cell* bar is **3 px** (`:408`). Two different bars. Do
  not unify them.
- The bar fill being plain `#fff` **independently confirms D-7.6-40** — no per-status colour on the
  gradient. Do not route this bar through `DayStatusIndicator`'s `tone="chrome"`; it is not a status
  indicator, it is a week-total progress bar.
- The button's hover `#ECEBF3` is exactly `--color-primary-soft` (`globals.css:127`). The text `#594F74` is
  exactly `--color-primary`. **Zero new colours** for the button.
- Title date format: `format(parseISO(weekOf), 'EEE, MMM d')` — `WeekView.tsx:54` already computes exactly
  this. Reuse it; do not add a second formatter.
- The eyebrow in the design reads "Time Logger · Priya Raman". The display name is real user data we may
  not have to hand on this surface. **Render the eyebrow as "Time Logger" alone** unless a display name is
  already available without a new fetch — D-7.2-2 forbids new network work on this path, and inventing a
  fetch for an eyebrow is not worth it. Flagged in "Decisions the orchestrator should rule on".

**Prev/next navigation.** `WeekView` currently takes `weekOf` as a **prop** and the full page passes
`currentWeekMonday()` (`App.tsx:174`). Prev/next therefore needs `weekOf` to become **state on the full
page**, with `addWeeks(parseISO(weekOf), ±1)`. This is the one genuinely new piece of state in AC2.
`hooks/useWeekWorklogs.ts` keys on `['week-worklogs', weekOf]`, so a new week is simply a new query key —
**no cache surgery, and D-7.2-2's ban on `invalidateQueries(['week-worklogs'])` is not engaged.** Do not
touch `staleTime`/`refetchOnWindowFocus`/`refetchOnReconnect`.

### D-7.7-26 — Cell anatomy, cross-checked value by value against the design source

**Creator decision** (routine — SD-6 transcription and reconciliation).

Every AC4 claim, checked against `imports/jira-time-logger.dc.html`:

| AC4 says | Design source | Cite | Verdict |
|---|---|---|---|
| 34 px box | `height:34px` | `:391` | **Confirmed** |
| `rounded-md` | `border-radius:6px` | `:391` | **Confirmed** — `--radius-md: 6px`, `globals.css:198` |
| white fill | `fill: "#FFFFFF"` when text | `:794` | **Confirmed** — `--color-surface` |
| `#EDECF2` border | `border: text ? "#EDECF2" : "transparent"` | `:794` | **Confirmed** — but un-tokenised, see D-7.7-28 |
| empty → `faint-decorative` middot | `text \|\| "·"`, `color:"#ADACB9"`, border+fill `transparent` | `:792,795,794` | **Confirmed** — `#ADACB9` **is** `--color-faint-decorative` (`globals.css:117`), exact match |
| focused → primary border | `border: "#594F74"` | `:804` | **Confirmed** — `--color-primary`, exact |
| focused → `ring-focus` | `ring: "0 0 0 3px rgba(89,79,116,.13)"` | `:804` | **Confirmed** — byte-identical to the `ring-focus` utility, `globals.css:235-237` |
| time-off fill `#F6F5FA` | `fill: "#F6F5FA"` | `:806` | **Confirmed** — un-tokenised, see D-7.7-28 |
| time-off purple text | `color: "#594F74"` | `:806` | **Confirmed** — `--color-primary` / `--color-legacy-purple` |
| time-off filled `Diamond` @ 11 px | **ABSENT — the design renders bare purple `8.0`, no icon** | `:806` | **Spine adds it — see below** |

**Three findings the AC does not state, which the design source does:**

1. **The time-off cell has its OWN border, `#E2E0EE`** (`:806`) — not the `#EDECF2` of an ordinary cell.
   The AC omits it. Implement it (it is the design's intent: a purple-washed cell gets a purple-washed
   edge), and see D-7.7-28 for the token question.
2. **A weekend cell that holds a value dims its text to `#6B6678`** (`--color-muted`) and its empty middot
   to `#C9C8D3` (`:799`) — dimmer than the ordinary `#ADACB9`. This is part of AC3's "one recessive
   object". `#C9C8D3` is un-tokenised; nearest is `--color-grandeur-grey #ADACB9` (already the ordinary
   middot) or `--color-grandeur-lite #E7E7ED`. **Recommendation: keep the ordinary
   `faint-decorative` middot on weekend cells too** — the column tint already carries the recession, and
   inventing a token for a decorative middot inside a tinted column is not worth a new value. Flagged.
3. **The `Diamond` is the spine's addition, not the mockup's.** `DESIGN.md:469` says time-off cells "carry
   `{icons.time-off}` at 11px" and the AC repeats it; the mockup at `:806` has no icon. **The spine wins on
   intent (SD-6), and here the intent is WCAG:** a purple number in a purple-washed cell is
   *colour-alone*, which NFR12 forbids. The `Diamond` is what makes the state non-colour-alone. **Include
   it.** This is also why obligation 3 (`size`) exists.

### D-7.7-27 — `week-gaps.ts:61` is CLOSED, not re-deferred, and the fix is a one-line deletion

**Creator decision** (routine in mechanism; the *decision* to close rather than defer was already made for
us by **D-7.6-38**, which assigned it here).

**Verdict.** **Delete the `if (ptoDays[i]) continue;` guard** at `lib/week-gaps.ts:73`, and delete the
now-unused `ptoDays` accumulator (`:63-69`).

**Why this is a one-liner, verified at this baseline.** The bug exists because the function treats
time-off as a *reason to skip the arithmetic*. But the arithmetic already handles time-off correctly:
`lib/week-grid.ts:179` accumulates `dayTotalsSeconds[dayIndex] += worklog.timeSpentSeconds` **inside the
per-worklog loop with no category filter** — so a time-off worklog's seconds are already in
`grid.dayTotalsSeconds`. Therefore, with the guard gone:

| Day | Time off | Other work | `dayTotalsSeconds` | `>= 8h target`? | Result |
|---|---|---|---|---|---|
| Full day off | 8h | 0 | 8h | yes | **not a gap** — correct, unchanged |
| Half day off | 4h | 0 | 4h | no | **gap, 4h short** — the bug, now fixed |
| Half day off + work | 4h | 4h | 8h | yes | **not a gap** — correct |

The guard was not merely wrong, it was **redundant for the case it was meant to protect.** No new summing
logic, no new parameter, no clock read. The function stays pure.

**One copy change follows.** `gapSummary` (`week-gaps.ts:100-104`) ends every line with
`", not marked time off"`. Once a half-day-off day can be a gap, that clause becomes **false** for exactly
the day this fix newly surfaces. Replace the fixed suffix with the honest per-day note — reuse
`dayStatusNote` from `lib/day-status.ts`, which after D-7.6-38 already distinguishes "Half-day time off ·
2.5h short". Do **not** write a second note formatter.

**Consequences and how we would know it was wrong.**
- `week-gaps.test.ts` must gain a **half-day-off-is-a-gap** case, RED-proved by restoring the `continue`.
- A user who books a half day and logs nothing else now gets the gap dialog where before they did not.
  That is the point: the previous behaviour let the week be closed 4 h short, and `EXPERIENCE.md:315` says
  accounting reads these numbers as final once the week is closed.
- Watch for a **double-count**: do not also add `timeOffSeconds` to the comparison. `dayTotalsSeconds`
  already includes them. Adding them again would make a full day off read as 16 h.
- `week-gaps.ts:56-62`'s long comment block documents the old hand-off and the `ptoDays` divergence.
  **Rewrite it** to record that 7.7 closed it — do not leave a comment describing a bug that no longer
  exists.

### D-7.7-28 — `#EDECF2`, `#F6F5FA` and `#E2E0EE`: three un-tokenised hexes and D-7.3-14 — **ESCALATION**

**Creator escalation.** This needs an orchestrator ruling; I have not guessed.

**The conflict.** **D-7.3-14** ruled that an un-tokenised spec hex **loses to the nearest existing token**
(it made the resume card use `border-border`, not the spec's `#DEDCE9`). The epic also forbids new colour
values. But AC4 names two of these hexes **literally in the acceptance criterion**, which D-7.3-14's
subject did not.

| Hex | Role | Cite | Nearest token | Δ |
|---|---|---|---|---|
| `#EDECF2` | ordinary cell border; totals bar track | `:794`, `:408` | `--color-border-faint #F0EFF5` | very close |
| | | | `--color-primary-soft #ECEBF3` | very close |
| `#F6F5FA` | time-off cell fill | `:806` | `--color-weekend #F1F0F6` | close-ish, wrong axis |
| | | | `--color-primary-soft #ECEBF3` | noticeably darker |
| `#E2E0EE` | time-off cell border | `:806` | `--color-border #E4E3EC` | very close |

**Why I did not just apply D-7.3-14.**

- For `#EDECF2` → `border-faint (#F0EFF5)`: the design uses `#F0EFF5` **separately and deliberately** for
  the *column separators* (`:376,402`) while using `#EDECF2` for the *cell box border* (`:794`). Collapsing
  them onto one token erases a distinction the designer drew on purpose — a cell box would become
  invisible against its own column rule.
- For `#F6F5FA`: there is no near token. `--color-primary-soft #ECEBF3` is materially darker, and 7.6
  **already** uses `bg-primary-soft` for the time-off `<td>` tint (`STATUS_TINT_CLASS['time-off']`,
  `DayStatusIndicator.tsx:119`). So the `<td>` wash and the inner 34 px box fill are two nested surfaces;
  making them the same token makes the box vanish into its cell.
- `#E2E0EE` → `border (#E4E3EC)` is genuinely close enough that I would apply D-7.3-14 without asking.

**Options for the orchestrator.**
- **(a)** Add all three as **tokens** in `styles/globals.css`, on the D-7.6-39 precedent (a value specified
  by an authoritative design source but missing from the token layer is a *missing* token, not a new
  colour). Keeps token discipline and preserves the designer's distinctions.
- **(b)** Apply D-7.3-14 strictly: `border-faint`, `primary-soft`, `border`. Zero token churn, but
  flattens two nested surfaces into one and loses the cell-border/column-rule distinction.
- **(c)** Hybrid: tokenise `#EDECF2` and `#F6F5FA` (where no near token exists or the distinction is
  load-bearing); map `#E2E0EE` → `border`.

**Creator's recommendation: (c).** It is the smallest change that keeps every surface visible, and it
follows D-7.6-39's own reasoning about missing-vs-new. Whichever is chosen, **the AA contrast of the
time-off number (`#594F74`) on the chosen fill must be hand-computed** — the axe harness has
`color-contrast` disabled (`lib/test/axe.ts`), and this exact class of failure produced Story 7.6's
Blocker. `#594F74` on `#F6F5FA` is a large ratio and will pass; on a darker fill it narrows.

### D-7.7-29 — `variant="stacked"`'s two shape defects are fixed here, against a real call site

**Creator decision** (routine — `deferred-work.md` assigned it and named the fix).

**Verdict.** Fix both defects in `DayStatusIndicator.tsx`, **as the first task after the totals cell has a
real container**, not speculatively.

1. **Width.** The wrapper is `inline-flex flex-col items-end` (`:248`), so the bar's `w-full` resolves to
   the widest **sibling line**, not the container — the same percentage renders a different pixel length
   depending on that render's note length. Fix: give the wrapper a definite width (`flex w-full` rather
   than `inline-flex`, so it fills the totals `<td>`). This is only *verifiable* now because D-7.7-23 gives
   the column a fixed 104 px — that is exactly why `deferred-work.md` refused to fix it blind in 7.6.
2. **Quantisation.** `Math.round(pct / 5)` (`:153`) maps 97.6% → `w-full` (reads as done) and 2.4% →
   `w-0` (reads as empty). Fix: `Math.floor`, plus a **non-zero floor** so any non-zero percentage renders
   at least `w-[5%]`. Reserve `w-0` for a genuine zero.

**Verification, and it must be behavioural.** Two tests that would have caught each defect:
- Render the same `percent` twice with a short note and a long note; assert the **same** width class.
- `percent={97.6}` → not `w-full`; `percent={2.4}` → not `w-0`; `percent={0}` → `w-0`.

Both must be **RED-proved** by reverting the fix. Across 7.3–7.6 reviewers found **eleven** tests that
passed whether or not the feature worked; a width assertion is a prime candidate for a twelfth.

**Shared-seam warning.** `DayStatusIndicator` is consumed by `WeeklyGrid`, `DayCell` (via
`STATUS_TINT_CLASS`) **and** `ManagerMatrix`. Changing the `stacked` wrapper from `inline-flex` to `flex`
is a **layout change to a shared component.** `stacked` has no other production call site today (that is
the premise of this fix), but you must **prove** it: run a transitive import-closure analysis over
`DayStatusIndicator` and grep for every `variant="stacked"` before and after. Do not rely on the suite —
see "Shared-seam discipline" in Dev Notes.

### D-7.7-30 — `size` is added to the frozen contract, and to D-7.6-3's canonical block

**Creator decision** (routine — `deferred-work.md` deferred it *until a story's AC pinned the value*, and
AC4 pins it at 11 px).

**Verdict.** Add to `DayStatusIndicatorProps`:

```
/** Icon edge length in px. Default 12. DESIGN.md's icons.defaults.size
 *  permits 11–13; 11 is pinned by Story 7.7's AC4 for the time-off cell. */
size?: 11 | 12 | 13;
```

A closed union, not `number` — DESIGN.md bounds the range at 11–13, and a union makes an out-of-range value
a type error rather than a review finding. `ICON_SIZE = 12` becomes the default.

**This is an edit to a contract 7.6 declared frozen, so it is not slipped in.** Per obligation 3 and
`deferred-work.md`, the developer must **also** update **D-7.6-3's canonical block in
`epic-7-decision-log.md:1862`** so the contract in the log matches the code. A reviewer may reject this
story for a code/log mismatch — 7.6 was explicitly held to the same standard.

### D-7.7-31 — The weekend tint at three levels, from `isWeekend(iso)`

**Creator decision** (routine — D-7.6-46 already ruled the mechanism and assigned the application here).

**Verdict.** Apply `bg-weekend` from the **exported `isWeekend(iso)` predicate** (`lib/day-status.ts:63`)
at all three levels: the `<th scope="col">` day header, the body `<td>`, and the totals `<td>`.

**The token is exact.** `--color-weekend: #f1f0f6` (`globals.css:118`) is byte-identical to the design
source's `const wk = "#F1F0F6"` (`:780`). Confirmed applied to Sat/Sun at header (`:786-787`, with
`headColor:"#6B6B72"` = `--color-faint`), body cells (`:799` `bg: wk`) and totals (`:817`
`bg: kind === "off" ? wk : "transparent"`).

**Do not** derive it from day status, and **do not** put it on the `<col>`. Deriving from status is exactly
what D-7.6-46 reverted — a per-cell status cannot express "tint the column as one object", which is why
`weekend` is deliberately absent from `STATUS_TINT_CLASS`. And a `<col>` background sits *below* cell
backgrounds, so any `<td>` with its own fill would punch a hole in the column — the tint must be on the
cells to be uniform. `DayCell.tsx:315` already does the body level correctly; add the header and totals.

**Precedence.** A status that carries its own tint (`time-off`) outranks `weekend` — D-7.6-6's precedence,
already implemented at `DayCell.tsx:314-315` (`statusTint || isWeekend(...)`). Keep that shape; do not
layer two backgrounds.

### D-7.7-32 — The `stacked` bar colour cannot express the design's `partial` bar — **ESCALATION**

**Creator escalation.** A genuine gap in the frozen contract, found by cross-checking AC6 against the
design source. Not guessed.

**The finding.** AC6 says the 3 px bar is "coloured by day status", and `DayStatusIndicator`'s `stacked`
branch renders the fill as **`bg-current`** (`:263`) — i.e. it inherits the status's *text* colour. For
most statuses that is right. For `partial` it is **not**, because the design deliberately uses two
different colours:

| Design `kind` | Text colour | Bar colour | Cite |
|---|---|---|---|
| `met` | `#15803D` | `#15803D` | `:811` — same, `bg-current` works |
| **`part`** | **`#1E1B2E`** | **`#615B99`** | `:812` — **different** |
| `none` | `#7A3E06` | `#B45309` | `:813` — different |
| `pto` | `#594F74` | `#8B84AE` | `:814` — different |
| `off` | `#6B6B72` | `#D8D7E1` | `:815` — different (and `weekend` renders no bar at all) |

`STATUS_COLOR_CLASS['partial'] = 'text-foreground'` (`#1E1B2E`), so `bg-current` would paint the
`partial` bar **near-black** where the design wants royal purple `#615B99` (= `--color-royal-purple`,
`globals.css:105`). `partial` is the *most common* state in a normal week — this would be the most visible
cell in the grid rendered wrong.

Note `none`/`pto` follow a consistent pattern: the bar is a **lighter, desaturated sibling** of the text
colour. `#B45309` is `--color-status-dirty`, so `none`'s pair is already fully tokenised
(`text-amber-ink` + `bg-status-dirty`). `pto`'s `#8B84AE` and `off`'s `#D8D7E1` are **not** tokenised.

**Options.**
- **(a)** Add a `STATUS_BAR_CLASS: Record<StatusKind, string>` map inside `DayStatusIndicator.tsx` — the
  one file D-7.6-2 allows to own status→colour maps — and use it instead of `bg-current`. Faithful to the
  design; needs a ruling on the two un-tokenised bar hexes (same question as D-7.7-28).
- **(b)** Keep `bg-current` and accept a near-black `partial` bar. Cheapest; visibly wrong on the
  commonest state; a reviewer will raise it.
- **(c)** Special-case only `partial` → `bg-royal-purple`. Smallest diff, but a one-off conditional inside
  the shared component is precisely the per-status special-casing D-7.6-3 was written to prevent, and 7.6's
  `met`-only chrome exception had to be *corrected* by D-7.6-40 for exactly this reason.

**Creator's recommendation: (a).** It keeps the single-registry discipline (the map lives in the one
sanctioned file), it is the design's actual intent, and it makes the bar colour a *derived, non-overridable*
property exactly like the icon and the text colour. Pair with D-7.7-28's ruling on the two loose hexes.

### D-7.7-33 — The in-place editing focus model, concretely

**Creator decision** (routine — specifies an AC that is otherwise untestable).

**What already works** (`DayCell.tsx`, do not rebuild): editing is in place (`:319-355`); `⏎` saves
(`:287-292`); `Esc` reverts (`:293-296`); an empty cell accepts a value with **no "add" ceremony** — the
display-mode `<button>` (`:375`) opens the editor on click and `commit()` POSTs when there was no prior
worklog (`:270`). A single edit session commits exactly once, guarded by `resolvedRef` (`:235`) — **do not
break that guard**; it is what prevents duplicate POSTs on the blur that fires when the editor unmounts.

**The delta.**

- **`Tab` moves across the day.** "Across the day" = along the **row**, to the next day's cell — the
  natural reading direction, and it is what a browser's default `Tab` order already does inside a table
  row. So: `Tab` must **commit** the current cell and let focus proceed naturally. Concretely, `Tab` is
  **not** intercepted in `handleKeyDown`; instead the existing `onBlur` → `commit()` path (`:274-283`)
  already fires. **Verify** the committed cell returns to display mode with its `<button>` focusable so
  the next `Tab` lands on the next day. Do not add a `preventDefault` on `Tab` — that would break the
  a11y-mandated tab order and trap the user.
- **`⏎` saves and moves to the next row.** This is the genuinely new behaviour. `⏎` already commits
  (`:287-292`); after commit, focus must move to the **same day's cell in the next row**. `DayCell` cannot
  do this alone — it does not know its siblings. **`WeeklyGrid` must own it**, and it already has the
  mechanism: `cellEditRefs` (`:350`), a `Map` keyed `` `${rowKey}-${dayIndex}` `` that already exposes each
  cell's "open editor" action for Story 4.4's day-scoped add. Add a sibling registry for "focus this cell"
  keyed identically, and give `DayCell` an `onCommitAdvance?: () => void` the grid wires to the next row's
  entry.
- **Ordering trap.** The grid re-sorts rows after a mutation (`week-grid.ts:66-70` sorts by category then
  descending row total), and `WeekView.handleMutated` invalidates the query (`:109-111`). So "the next row"
  can be **a different row by the time the refetch lands.** Resolve "next row" from the row order
  **at the moment `⏎` was pressed**, synchronously, before the invalidation resolves — otherwise focus
  jumps somewhere the user did not ask for. This is the same class of race as Story 4.4's deferred
  `requestAnimationFrame` lookup, which `deferred-work.md` already records as fragile. **Do not** copy the
  double-`rAF` pattern; resolve the target key synchronously, then focus it once mounted.
- **Last row.** `⏎` on the last row commits and stays put (or returns focus to the just-committed cell's
  button). It must not wrap to the first row and must not throw.

### D-7.7-34 — The gap dialog: the full delta from what exists

**Creator decision** (routine transcription; the copy is all quoted).

`components/week/GapAcknowledgmentDialog.tsx` is 82 lines and needs substantial change. It **keeps** its
Radix `Dialog` base — that is what supplies the AC's **focus trap** for free, and it is already the
canonical pattern here.

| Element | Today | AC7 requires | Cite |
|---|---|---|---|
| Title | "Submit week with gaps?" (`:13`) | **"Close the week at N of 40h?"** | `:428`, `EXPERIENCE.md:120` |
| Framing | "N days are short of target and not marked as time off. Submit anyway?" (`:43`) | **"Three days are under 8h. That's fine if it's accurate — accounting reads these numbers as final once the week is closed."** | `:429`, `EXPERIENCE.md:120,315` |
| Evidence | `<ul><li>` of `gapSummary` (`:66-70`) | **bordered evidence rows**: day (78 px), logged (62 px, tabular), note (flex) | `:433-437` |
| Checkbox | **none** | **required** "These hours are correct. I'm not missing time." | `:443`, `EXPERIENCE.md:121` |
| Secondary | "Cancel" (`:73`) | **"Keep editing"** | `:446` |
| Primary | "Submit anyway" (`:76`) | **"Close the week"** | `:447` |
| Focus trap | inherited from Radix ✓ | inherited from Radix ✓ | — |
| Backdrop click | **dismisses** → `onCancel` (`:52`) | **must NOT dismiss** | AC7 |

**The four substantive changes.**

1. **The checkbox gates the primary.** "Close the week" is `disabled` until checked. This is the whole
   point of the friction (`EXPERIENCE.md:317`: *"The friction did its job without moralising"*). Wire the
   `disabled` state to real checkbox state — do not render a decorative checkbox. The design's checkbox is
   `16×16`, `radius 4px`, `border 1.5px solid #594F74`, `background #594F74` when checked, white ✓
   (`:442`). Use a real `<input type="checkbox">` with an associated `<label>` (the design already wraps it
   in a `<label>`, `:441`) — not a `<span>` with a click handler, which is unreachable by keyboard.
2. **Backdrop must not dismiss.** Add `onPointerDownOutside={(e) => e.preventDefault()}` to
   `DialogContent`. **Leave `Esc` working** — it routes to `onCancel` = "Keep editing", which is the safe
   direction, and suppressing `Esc` in a modal is itself an a11y regression. AC7 constrains the *backdrop*
   only.
3. **Initial focus moves.** Today it force-focuses the primary (`:47-49,55-60`). With the primary starting
   **disabled**, focusing it is both useless and confusing. Focus **the checkbox** — it is the required
   next action. Replace the `submitRef` steering accordingly, keeping the `onOpenAutoFocus`
   `preventDefault()` mechanism.
4. **"N of 40h" is the week total, not the gap count.** `28 of 40h` in the design (`:428`) is
   logged-vs-target for the **whole week**. The dialog currently receives only `gaps`. It needs
   `loggedSeconds` and `targetSeconds` for the week — `WeekView` already computes exactly this
   (`:128-132`: `loggedSeconds` and `targetHours * WORKDAYS_PER_WEEK`). **Thread the existing values
   through; do not recompute the week total in a third place.**

**Copy, verbatim, with SD-7 applied.** The design source's own totals row says **"full-day PTO"** at
`:823`. **That is a design-source string, and SD-7 overrides it: every user-facing string says "time
off".** Any new string this story adds says "time off" from the outset. Evidence-row notes follow the
design's honest, factual register (`:831-833`: "2.5h unaccounted", "today — still open").

**The framing sentence's day count must be real.** The design hard-codes "Three days". Compute it from
`gaps.length` with correct singular/plural, and "under 8h" from the actual `targetHours` — a settings value
(`targetHoursItem`), not a constant. A user on a 7-hour target must not read "under 8h".

---

## Tasks / Subtasks

Ordered so the two shared-component fixes land against a real call site early, per obligation 2.

- [x] **Task 1 — Verify AC1; change nothing.** (AC1)
  - [x] Confirm `entrypoints/fullpage/` renders and routes Week/Manager/Settings from `?section=`.
  - [x] Confirm "Open week ↗" opens `fullpage.html?section=week` (`PopupActionBar.test.tsx:100` passes).
  - [x] Record in Completion Notes that AC1 was met by 7.2 per D-7.2-1, with no production edit. If
        anything is broken, **report it as a 7.2 regression** — do not silently re-implement.

- [x] **Task 2 — Give `variant="stacked"` a real call site, then fix its two defects.** (AC6, obligation 2)
  - [x] Switch `TotalsCell` (`WeeklyGrid.tsx:153`) from `variant="inline"` to `variant="stacked"`, passing
        `value`, `note` and `percent`.
  - [x] Fix the **width** defect: definite width on the wrapper so the bar is container-relative.
  - [x] Fix the **quantisation** defect: `Math.floor` + a non-zero floor; `w-0` only for a true zero.
  - [x] Test: same `percent` + different note lengths → identical width class. **RED-prove.**
  - [x] Test: `97.6` ≠ `w-full`; `2.4` ≠ `w-0`; `0` = `w-0`. **RED-prove.**
  - [x] Transitive import-closure analysis over `DayStatusIndicator`; grep every `variant="stacked"`.

- [x] **Task 3 — Add `size` to the contract AND to the decision log.** (AC4, obligation 3)
  - [x] Add `size?: 11 | 12 | 13` to `DayStatusIndicatorProps`; `ICON_SIZE = 12` becomes the default.
  - [x] Update **D-7.6-3's canonical block** in `epic-7-decision-log.md:1862` to match.
  - [x] Test: `size={11}` renders an 11 px icon; default renders 12.

- [x] **Task 4 — Resolve D-7.7-32 (bar colour) per the orchestrator's ruling.** (AC6)
  - [x] Apply the ruled option. If (a): add `STATUS_BAR_CLASS` inside `DayStatusIndicator.tsx` only.
  - [x] Test that `partial`'s bar is **not** the same class as its text colour.

- [x] **Task 5 — Column geometry.** (AC3)
  - [x] `<colgroup>`: flexing subtask column + `<col span={7}>` at 104 px; `table-fixed` on the `<table>`.
  - [x] Widen the row-header truncation cap for the full page (design `max-width:520px`, `:387`); keep
        truncation.
  - [x] Test: seven day columns carry the 104 px width; the table is `table-fixed`.

- [x] **Task 6 — The weekend tint as one recessive object.** (AC3, obligation 4)
  - [x] Apply `bg-weekend` from `isWeekend(iso)` at `<th>` header and totals `<td>`; body `<td>` already
        correct (`DayCell.tsx:315`).
  - [x] Header text on weekend columns → `text-faint` (`:787`).
  - [x] Preserve D-7.6-6 precedence: a status with its own tint outranks `weekend`.
  - [x] Test: for a Saturday, header **and** body cell **and** totals cell all carry `bg-weekend`.
        **RED-prove** by removing one of the three.

- [x] **Task 7 — Cell anatomy.** (AC4)
  - [x] 34 px `rounded-md` box; white fill + cell border when it holds a value; transparent with a
        `faint-decorative` middot when empty.
  - [x] Focused cell: primary border + `ring-focus` — via `focus-within:`/`focus-visible:`, **never
        static** (D-7.3-15).
  - [x] Time-off cell: fill + purple text + its own border + a filled `Diamond` at 11 px **through
        `DayStatusIndicator`** (see D-7.7-35 escalation before coding this).
  - [x] Apply the D-7.7-28 token ruling.
  - [x] **Hand-compute** the time-off number's contrast on the chosen fill; record the figure.

- [x] **Task 8 — Cell announcement.** (AC3)
  - [x] Add `hoursPhrase(seconds)` to `lib/hours.ts` with unit tests (singular, plural, fractional,
        minutes, zero).
  - [x] Body cell accessible name → `` `${dayName}, ${rowKey}, ${hoursPhrase}` ``; keep the input's
        distinct "Hours for …" label.
  - [x] Test the AC's literal example: a Wednesday 4 h cell on `MBS-135` announces
        `Wednesday, MBS-135, 4 hours`.

- [x] **Task 9 — In-place editing: `Tab` and `⏎`.** (AC5)
  - [x] Verify `Tab` commits and proceeds naturally; add **no** `preventDefault` on `Tab`.
  - [x] `⏎` commits then focuses the same day's cell in the next row, via a `WeeklyGrid`-owned registry
        alongside `cellEditRefs`.
  - [x] Resolve "next row" **synchronously** from the row order at keypress — not after the refetch.
  - [x] `⏎` on the last row commits and does not wrap or throw.
  - [x] Do not weaken `resolvedRef`'s single-commit guard (`DayCell.tsx:235`).
  - [x] Tests: `⏎` advances one row; `⏎` on the last row is safe; `Esc` still reverts with no write;
        an empty cell still accepts a value with no "add" ceremony.

- [x] **Task 10 — The chrome header.** (AC2)
  - [x] New `components/week/WeekChromeHeader.tsx` with the D-7.7-25 values. Reuse `chrome-gradient`.
  - [x] Ring motif; eyebrow; title via the existing `'EEE, MMM d'` format; prev/next; week figure;
        **4 px** bar with a **plain white** fill (D-7.6-40); white primary button.
  - [x] Lift `weekOf` to full-page state for prev/next (`addWeeks ±1`). **Do not** touch
        `staleTime`/`refetchOnWindowFocus`/`refetchOnReconnect`, and **never**
        `invalidateQueries(['week-worklogs'])` (D-7.2-2).
  - [x] Do **not** modify the popup's `ChromeHeader.tsx`.
  - [x] Tests: prev/next change the queried week; the bar fill is plain white and carries **no** status
        colour class. **RED-prove** the white-only assertion.

- [x] **Task 11 — Close `week-gaps.ts:61`.** (AC7, obligation 1)
  - [x] Delete the `if (ptoDays[i]) continue;` guard and the `ptoDays` accumulator.
  - [x] Rewrite the stale comment block (`:56-62`) to record that 7.7 closed it.
  - [x] Replace `gapSummary`'s fixed `", not marked time off"` suffix with `dayStatusNote`.
  - [x] Tests: a 4 h half-day-off day with no other work **is** a gap, 4 h short; a full day off is
        **not**; a half day + 4 h work is **not**. **RED-prove** by restoring the `continue`.
  - [x] Confirm no double-count: `dayTotalsSeconds` already includes time-off seconds.

- [x] **Task 12 — The gap dialog.** (AC7)
  - [x] Title, framing, evidence rows, required checkbox, "Keep editing" / "Close the week" per D-7.7-34.
  - [x] Real `<input type="checkbox">` in a `<label>`, gating the primary's `disabled`.
  - [x] `onPointerDownOutside` → `preventDefault()`. **Keep `Esc` working.**
  - [x] Initial focus → the checkbox.
  - [x] Thread `loggedSeconds`/week target from `WeekView`'s existing computation for "N of 40h".
  - [x] Day count and target hours computed, never hard-coded.
  - [x] Tests: primary disabled until checked; backdrop pointer-down does **not** close; `Esc` **does**
        cancel; title shows the real week total; focus starts on the checkbox. **RED-prove** the
        backdrop and the gating.

- [x] **Task 13 — Gates and evidence.**
  - [x] `pnpm test` — record files/passed/skipped and compare to the baseline below.
  - [x] Lint + typecheck.
  - [x] axe scan on the full page (`entrypoints/options/App.a11y.test.tsx` is the entrypoint template).
  - [x] **Hand-computed** contrast figures for: the time-off number on its fill; the weekend header text
        on `bg-weekend`; every new chrome-header text colour on **both** gradient stops.
  - [x] Confirm the fenced files are untouched and `breaksHeaderBaseline` in `App.tsx` is byte-identical.

---

## Dev Notes

### Test baseline at `bbe0645` — measured, not copied forward

**95 test files / 1273 passed / 1 skipped (1274 total).**

`pnpm test` **exits non-zero at baseline.** There is exactly **ONE** known pre-existing unhandled
rejection, in `components/manager/ManagerView.test.tsx` — a `@wxt-dev/storage` `getStorageArea`
fake-browser teardown race (`TypeError: Cannot read properties of undefined (reading 'runtime')`). Every
test file passes.

**State this explicitly, because it has been mislabelled before:** any drop below **1273** passing, or a
**second** unhandled rejection, is **this developer's regression — not "pre-existing".** Growth across the
epic: 961 (pre-7.2) → 998 → 1049 → 1099/1115 → 1174 (7.5) → **1273 (7.6)**.

### Shared-seam discipline — this epic has been burned THREE times

7.2's `TicketPicker` scrolling regression, 7.4's JQL leak into the week grid, and 7.6's over-applied
indicator. **A green suite is not proof**, because the seams are mocked away:

- `WeeklyGrid.test.tsx:11` mocks `TicketPicker` **away**.
- `TicketPicker.test.tsx:23` mocks `lib/ticket-search` **wholesale**.
- `WeekView.test.tsx:13` mocks `WeeklyGrid` **away**.
- `entrypoints/fullpage/App.test.tsx:23` mocks `WeekView` **away**.

The last two matter enormously here: the **entire** full-page → `WeekView` → `WeeklyGrid` chain this story
restyles is **double-mocked**. Every test can pass with the grid rendering nothing.

**Proofs that actually work** (all three established by reviewers this epic):
1. `git diff bbe0645 -- <shared file>` producing **empty** output, pasted into Completion Notes.
2. A **source-level grep test** on the call site — `WeeklyGrid.test.tsx:131` is the precedent.
3. A **transitive import-closure analysis** enumerating every module reaching the changed seam — 7.5's
   reviewer's contribution. **Required** for `DayStatusIndicator` (Tasks 2–4) and for any `DayCell` change.

`TicketPicker` and `DayStatusIndicator` are both consumed by more than one surface. At least one test must
render `WeeklyGrid` **inside** `WeekView` without the mock, to prove the chain composes.

**RED-proof every load-bearing test.** Across 7.3–7.6 reviewers found **eleven** tests that passed whether
or not the feature worked. For each new assertion: break the production code, watch the test fail, restore.
Note it in Completion Notes.

### Files: restyle vs rebuild vs leave alone

**Restyle / extend (existing, do not rebuild):**
- `components/week/WeeklyGrid.tsx` — `<colgroup>`, weekend tint at header+totals, `⏎`-advance registry,
  `TotalsCell` → `stacked`.
- `components/week/DayCell.tsx` — cell anatomy, announcement, `Tab`/`⏎` wiring. Keep `resolvedRef`.
- `components/week/GapAcknowledgmentDialog.tsx` — substantial copy + checkbox + backdrop change.
- `components/week/MarkAsDoneButton.tsx` — thread week totals to the dialog. The header's "Mark week as
  done" button (AC2) and this component's CTA are **the same action** — do not ship two.
- `components/shared/DayStatusIndicator.tsx` — `size`, `stacked` width/quantisation, bar colour.
- `lib/week-gaps.ts` — the obligation-1 fix.
- `lib/hours.ts` — add `hoursPhrase`.
- `entrypoints/fullpage/App.tsx` — mount the chrome header, lift `weekOf` state. Routing unchanged.

**New:** `components/week/WeekChromeHeader.tsx` (+ test).

**Do NOT touch (D-7.3-9 is absolute):** `lib/hierarchy.ts`, `lib/manager-matrix.ts`,
`lib/storage/pinned-tickets.ts`, `lib/ticket-search.ts`, `components/today/SearchPanel.tsx`,
`components/today/ResumeCard.tsx`. Keep `App.tsx`'s `breaksHeaderBaseline` **byte-identical**.

**Fenced — Epic 6.3 CRX work, uncommitted at baseline. Do not touch:** `scripts/pack-crx.mjs`,
`scripts/derive-ext-key.mjs`, `scripts/lib/`, `wxt.config.ts`, `package.json`, `docs/release.md`.

**Out of scope:** 7.8's manager-matrix chip restyle; 7.9's popup states; 7.10's Settings body.

### Note for Story 7.8 (already recorded as D-7.6-49; repeated so it is not lost)

The design shows approval as a **row-level** property (`imports/jira-time-logger.dc.html:571`, a green
`✓ approved` label) with matrix cells as **plain numbers** (`:852-858`) — there is **no** green cell fill for
`approved` in the design at all. The restricted chip carries its **own `#F4F4F7` background** (`:534`), so it
never sits directly on a cell fill, which is why 7.8 can then **remove** 7.6's `tone="chrome-solid"`
workaround. **7.7 must not build any of this.**

### Standing Epic 7 constraints (restated)

- **No WCAG 2.1 AA regression.** Status is never colour-alone: colour + lucide icon + visible text. Delete
  the icon **and** the colour and the state must still read from text. **Compute contrast by hand** — the
  axe harness cannot catch this class (`lib/test/axe.ts` disables `color-contrast`; jsdom has no support).
  This has been proven three times this epic — 7.2, and 7.6 twice, one of them a Blocker caused by
  `status-clean` and `state-success` being the same hex.
- **`lucide-react` only**; icons 11–13 px, `aria-hidden="true"`, colour from `currentColor` never a hex.
- **No monospace** — numbers use the `tabular` utility. Note `WeeklyGrid.tsx:505` still has a `font-mono` on
  the row key and `WeekView.tsx:159` on the week figure; the design uses Kanit + tabular there
  (`:386`, `:357`). Fix them in the surfaces this story touches.
- **Zero new colour values.** Semantic tokens over raw hex (D-7.3-14, and D-7.7-28's escalation).
- **`ring-focus` via `focus-within:`/`focus-visible:`, never static** (D-7.3-15).
- **Red fires ONLY for a write Jira actually refused.** After 7.6 there is **no red for any time-related
  state.** `DayCell.tsx:394-405`'s error chip is a legitimate survivor (Jira refused the write);
  `:324-330`'s amber validation border is correct and must stay amber (D-7.6-37).
- **SD-7 — all user-facing copy says "time off", never "PTO"**, including every NEW string. Internal
  identifiers (`ptoSubtaskKey`, `PtoPopover`, storage keys, `pto.*` log events) stay unchanged. A Jira
  subtask's own summary displayed verbatim (`KNP-99 PTO`) **stays verbatim** — that is Jira's data, not our
  copy.
- **NFR1** popup TTI ≤ 400 ms is a *popup* budget; the full page is not bound by it, but do not add network
  work to the shared `useWeekWorklogs` path.

### Project Structure Notes

WXT + React 19 + Tailwind v4, Chromium MV3. Vitest + jsdom only — **no Playwright**. ESLint bans default
exports and `any`, and enforces alphabetised `import/order` with no blank lines. WXT `outDir` is `output/`,
**not** `.output/` (`epics.md` is stale on this).

### References

- `[Source: _bmad-output/planning-artifacts/epics.md#Story-7.7 (lines 1906–1943)]` — the ACs.
- `[Source: .../ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md (lines 466–473)]` — grid cell + totals
  cell anatomy.
- `[Source: .../EXPERIENCE.md (lines 120–121, 313–317)]` — gap-dialog copy and the "friction did its job"
  intent; `(lines 205–212)` — why time off gets its own filled `Diamond`, and "amber appears once".
- `[Source: .../imports/jira-time-logger.dc.html]` — SD-6 reference of record. Lines cited in this story:
  `:345-347` gradient + ring motif · `:350` eyebrow · `:352` 26 px Kanit 600 title · `:353` prev/next ·
  `:359-360` week figure · `:362-363` 4 px bar, plain white fill · `:366` white primary button ·
  `:373,384,397` `1fr repeat(7,104px)` · `:376,402` `#F0EFF5` column separators · `:387`
  `max-width:520px` · `:391` 34 px / `radius 6px` cell box · `:401-407` totals three-line anatomy ·
  `:408` 3 px bar, `#EDECF2` track · `:418` "Tab moves across the day, ⏎ saves" · `:428-429` dialog title +
  framing · `:433-437` evidence rows · `:441-443` checkbox · `:446-447` buttons · `:780` `wk = "#F1F0F6"` ·
  `:786-787` weekend header tint + `#6B6B72` · `:791-798` `cell()` (border `#EDECF2`, fill `#FFFFFF`,
  empty `·` at `#ADACB9`) · `:799` `weekendCell()` · `:804` focused cell (`#594F74` +
  `0 0 0 3px rgba(89,79,116,.13)`) · `:806` time-off cell (`#F6F5FA` / `#594F74` / `#E2E0EE`, **no icon**) ·
  `:811-816` per-status bar colours · `:823` "full-day PTO" (**SD-7 overrides**) · `:831-833` evidence-row
  notes.
- `[Source: _bmad-output/implementation-artifacts/epic-7-decision-log.md]` — canonical (D-7.3-11).
  `:1862` D-7.6-3 the frozen contract · `:2015` D-7.6-6 weekend axis · `:2297` D-7.6-38 (assigns
  `week-gaps.ts:61` here) · `:2349` D-7.6-40 white-only chrome · `:2484` D-7.6-46 weekend tint at three
  levels · `:2505` SD-6 · `:2526` SD-7 · `:2541` D-7.6-49 (7.8's chip) · `:642` D-7.3-14 · `:653` D-7.3-15.
- `[Source: _bmad-output/implementation-artifacts/deferred-work.md (lines 201–275)]` — the `stacked`
  defects, the missing `size` prop, and the `week-gaps.ts:61` hand-off.
- `[Source: styles/globals.css]` — `:118` `--color-weekend: #f1f0f6` (exact match to the design's `wk`) ·
  `:117` `--color-faint-decorative: #adacb9` (exact match to the design's empty-cell middot) · `:198`
  `--radius-md: 6px` · `:235-237` `ring-focus` (byte-identical to the design's focus ring) · `:105`
  `--color-royal-purple: #615b99`.

---

## Decisions the orchestrator should rule on

Flagged explicitly rather than guessed.

1. **D-7.7-28 — the three un-tokenised hexes** (`#EDECF2`, `#F6F5FA`, `#E2E0EE`) versus D-7.3-14's
   "nearest token wins". Creator recommends **(c) hybrid**: tokenise the first two (D-7.6-39 precedent —
   a value the design source specifies but the token layer omits is a *missing* token, not a new colour),
   map `#E2E0EE` → `border`. **Blocks Task 7.**
2. **D-7.7-32 — the `stacked` bar colour.** `bg-current` renders `partial`'s bar near-black where the design
   wants royal purple, and `partial` is the commonest state in a normal week. Creator recommends **(a)**: a
   `STATUS_BAR_CLASS` map inside `DayStatusIndicator.tsx` (the one file allowed to own status→colour maps).
   Depends on ruling 1 for `pto`'s `#8B84AE` and `off`'s `#D8D7E1`. **Blocks Task 4.**
3. **D-7.7-35 — how the time-off cell renders its `Diamond` without breaking the 7.6 grep test.**
   `lib/day-status-vocabulary.grep.test.ts` enforces that **only** `DayStatusIndicator.tsx` may import
   `Diamond` from `lucide-react`, so `DayCell` **cannot** render one directly. But `DayStatusIndicator` has
   no icon-only mode **by design** — D-7.6-3 ruled "silence is the ABSENCE of the component", and
   Finding 16 deliberately made `label=""` fall back to the default label so no caller can suppress the
   visible word. A 104×34 px cell cannot fit "Full-day time off" next to the number.
   **Creator recommends** adding a `variant="cell"` to the contract: renders `value` + icon, with the label
   in a visually-hidden span. AA holds because the label is still **text** in the accessibility tree (so
   deleting the icon and the colour still leaves the state readable), and the **visible** words for that
   day already appear in the totals cell directly below in the same column. This touches the frozen
   contract, so it needs a ruling rather than a guess. **Blocks Task 7.**
4. **The chrome eyebrow's display name.** The design reads "Time Logger · Priya Raman" (`:350`). Creator
   recommends rendering **"Time Logger"** alone unless a display name is already in hand without a new
   fetch — D-7.2-2 forbids adding network work to this path.
5. **The totals row's position.** The design puts totals at the **bottom** (`:397`, `border-top`, with
   "+ Add a subtask" in its first cell, `:399`); the implementation has them in `<thead>`
   (`WeeklyGrid.tsx:469`). Moving them to `<tfoot>` matches both the design and table semantics, but it is a
   visible reordering of an Epic 4 surface and will move assertions in `WeeklyGrid.test.tsx`. Creator
   recommends **moving to `<tfoot>`** (the design is unambiguous and `<tfoot>` is the correct element for a
   totals row) but flags it because it is a layout change the AC does not explicitly demand.
6. **The weekend empty-cell middot.** The design dims it to `#C9C8D3` (`:799`), dimmer than the ordinary
   `#ADACB9`. Creator recommends **keeping `faint-decorative`** — the column tint already carries the
   recession and a new token for a decorative middot is not worth a colour value.

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-story-developer)

### Debug Log References

None — no debugger/console-trace sessions were needed. All investigation was
static (reading source, the vendored design source, and the decision log)
plus iterative `pnpm compile` / `pnpm lint` / `pnpm test` / `pnpm build` runs.

### Completion Notes List

**AC1 (Task 1).** Verified, not rebuilt. `entrypoints/fullpage/{index.html,main.tsx,App.tsx}`
render Week/Manager/Settings from `?section=`; `PopupActionBar` → `lib/open-full-page.ts`
opens `fullpage.html?section=week` (`PopupActionBar.test.tsx:100` passes unmodified). No
production edit to the routing itself; `App.tsx` gained ONLY the lifted `weekOf` state
for prev/next (D-7.7-25) and the `<WeekChromeHeader>` mount inside `WeekView`.

**Orchestrator rulings D-7.7-15…19 applied exactly as written** — three new cell-anatomy
tokens (`--color-cell-border`, `--color-time-off-fill`, `--color-time-off-border`) plus two
new totals-bar tokens (`--color-time-off-bar`, `--color-weekend-bar`, needed because
D-7.7-16 made the bar an axis independent of `STATUS_COLOR_CLASS` and two of its five
values had no existing token); no `variant="cell"` added; `week-gaps.ts:61` closed by
deletion; SD-7 applied to the dialog's copy ("time off", never "PTO").

**Deviations from the story's non-blocking "flagged" items at time of dev-complete (review
Finding 7 caught that this note's own header claim was wrong — corrected below):**
1. **Weekend empty-cell middot** stays `faint-decorative` (not a new `#C9C8D3` token) —
   matches the creator's own recommendation; the column tint already carries the
   recession. **However**, a WEEKEND CELL HOLDING A VALUE does dim to `text-muted`
   (`#6B6678`) — that half of D-7.7-26's palette was **not** flagged/deferred (only the
   empty middot was), so it is implemented as a "confirmed" AC3/D-7.7-26 requirement.
   **Creator's recommendation applied.**
2. **Totals row position** shipped in `<thead>` at dev-complete — moving it to `<tfoot>`
   was flagged as a layout change the AC does not explicitly demand, and the developer
   **declined** the creator's recommendation to move it (the header above wrongly
   described this as "creator's own recommendation applied" for all three items; it was
   not, for this one — review Finding 7 caught the inaccuracy). **The finisher pass moved
   it to `<tfoot>` per owner ruling D-7.7-21a** (the design places totals at the bottom
   with a top border, `<tfoot>` is the correct semantics regardless, and the creator's own
   recommendation is now honoured). See `WeeklyGrid.tsx` and the new
   "totals row placement" test in `WeeklyGrid.test.tsx`.
3. **Chrome eyebrow** renders "Time Logger" alone (no "· Priya Raman") — no display name
   is available without a new fetch, which D-7.2-2 forbids on this path.
   **Creator's recommendation applied.**

**The "Mark week as done" button relocation (Files section, "do not ship two").** AC2 puts
this button in the chrome header; Story 4.5's original button lived at the bottom of
`WeeklyGrid`. Shipping both would be two functional buttons doing the same job. Resolved
by **moving** `MarkAsDoneButton` (unchanged internally) out of `WeeklyGrid` and into the
new `WeekChromeHeader`, mounted by `WeekView`. `WeeklyGrid` no longer accepts
`weekOf`/`isMarkedDone`/`onMarkedDone` — a real, disclosed prop-contract change, not a
silent one. `Button.tsx` gained a `chrome` variant (white-on-purple, zero new colours —
reuses `bg-surface`/`text-primary`/`hover:bg-primary-soft`) so the same component renders
correctly on the gradient. `WeekChromeHeader` paints its title/eyebrow/nav
**unconditionally**, even before `grid` loads (`grid: WeekGrid | null`) — the same
"paint synchronously, branch only the data-dependent piece" pattern the popup's
`ChromeHeader.tsx` already uses; the week figure/bar and the CTA itself gate on `grid`.

**Hand-computed contrast (Task 13) — a REAL AA failure found and fixed.** The design
source's literal `rgba(255,255,255,.72)` eyebrow/nav copy, transcribed verbatim at
first, measures only **≈4.04:1** at the gradient's lightest stop (`#615B99`, where this
row of the header actually sits) — below AA's 4.5:1 for normal-size text. Raised to
`/85` → **≈4.91:1** at the lightest stop (**≈7.36:1** at the darkest, `#4A4163` —
confirmed monotonic, so the two endpoints bound the whole range). This is the **exact**
same fix, by the exact same reasoning, as the popup `ChromeHeader.tsx`'s own documented
Finding 4 for its identical eyebrow on the identical gradient — the third time this class
of failure has been caught by hand in this epic (axe's `color-contrast` rule is
disabled, `lib/test/axe.ts`, because jsdom cannot paint to canvas). Other figures:
- Time-off cell text `#594F74` on fill `#F6F5FA`: **≈6.93:1**.
- Weekend header/cell text `#6B6B72` on `bg-weekend` `#F1F0F6`: **≈4.67:1** (tight but
  clears 4.5:1 — consistent with `globals.css`'s own comment on `--color-faint`,
  "a11y floor 4.6:1 — NEVER lighten").
- Time-off cell text on its own fill, chrome button text on white, weekend value text
  (`text-muted`) on white cell fill: all comfortably >4.5:1, not itemised further.

**A genuine AC3/D-7.7-15 gap the story's own escalation didn't surface: `text-legacy-purple`
in `DayCell.tsx` and `bg-weekend` in `WeeklyGrid.tsx` both tripped the pre-existing
`lib/day-status-vocabulary.grep.test.ts` guard from Story 7.6.** Fixed correctly, not by
weakening the rule:
- `text-legacy-purple`: exported ONE named constant, `TIME_OFF_TEXT_CLASS`, from
  `DayStatusIndicator.tsx` (the map's one sanctioned owner, D-7.6-2) instead of writing
  the literal class string in `DayCell.tsx` — same pattern the pre-existing
  `STATUS_TINT_CLASS` export already uses.
- `bg-weekend`: this is a **legitimate expansion** of an already-sanctioned mechanism
  (the same class, gated by the same `isWeekend(iso)` predicate) to a second call site
  `WeeklyGrid.tsx`'s header/totals — D-7.7-31 explicitly requires it. Widened the grep
  test's allowlist (split the old combined `bg-amber-soft`/`bg-weekend` assertion into
  two, since only `bg-weekend` gained a legitimate new file) rather than deleting or
  loosening the check itself.

**Shared-seam discipline / import-closure analysis (delegated to an Explore sub-agent,
findings verified).** `variant="stacked"` has exactly ONE production call site in the
whole repo: `WeeklyGrid.tsx`'s `TotalsCell` — `ChromeHeader.tsx` and `ManagerMatrix.tsx`
both use `variant="inline"` and are therefore unaffected by (and cannot regression-test)
the stacked-specific width/quantisation/bar-colour fixes. `variant="cell"` confirmed to
not exist anywhere in code (D-7.7-17's ruling holds). `DayCell` has exactly one production
importer (`WeeklyGrid.tsx`). `DayStatusIndicator` and `DayCell` both converge on
`entrypoints/fullpage/App.tsx` (via `WeekView`→`WeeklyGrid` and `ManagerView`→
`ManagerMatrix`) and `entrypoints/popup/App.tsx` (via `ChromeHeader`); `entrypoints/options`
is outside the closure entirely. `WeeklyGrid.test.tsx`/`WeekView.test.tsx` still mock their
immediate child grids away (pre-existing pattern), but `WeekView.test.tsx` now leaves
`WeekChromeHeader` **unmocked**, so at least one suite composes the real
`WeekChromeHeader → MarkAsDoneButton → GapAcknowledgmentDialog` chain against real
`WeekView`-derived data (two new tests: a real gap-dialog flow, and a real zero-gap
immediate-mark-done flow). `WeekChromeHeader.test.tsx` separately proves the same real
composition in isolation, plus its own axe scan.

**RED-proved (apply fix → green; revert → red; restore green — verified live, not
asserted):**
1. `week-gaps.ts` guard removal — reverting to the old `ptoDays[i]` guard reddens
   exactly the "half day off IS a gap" case (1 failure); the full-day and half+work cases
   stay green either way, matching the story's own truth table.
2. `DayStatusIndicator` stacked-bar width fix — reverting `flex w-full` to `inline-flex`
   reddens the "definite width regardless of note length" test.
3. `DayStatusIndicator` stacked-bar quantisation fix — reverting `Math.floor`+floor to
   `Math.round` reddens all three of: the 53%→`w-[50%]` case, the 97.6%-not-`w-full`
   case, and the 2.4%-not-`w-0` case.
4. `DayStatusIndicator` bar-colour fix — reverting `STATUS_BAR_CLASS[status]`/`bg-cell-border`
   back to `bg-current`/`bg-border-faint` reddens the bar-colour-is-a-separate-axis and
   track-token tests (8 failures total across the width/quant/colour suite).
5. Weekend tint as one object — forcing the totals-cell's `weekendTint` to `''` reddens
   the "tints the Saturday header, body cell, AND totals cell" test.
6. Gap dialog backdrop non-dismissal — **first attempt gave a false green**: removing
   `onPointerDownOutside` did NOT redden the test, because Radix's dismissable-layer
   defers attaching its own `pointerdown` listener by one `setTimeout(0)` tick, and the
   test fired the event synchronously — the event never reached Radix at all, so the
   assertion passed identically whether the fix was present or not (exactly the class of
   fake-green test this epic has been burned by repeatedly). Fixed the TEST to `await`
   one tick before firing the outside pointerdown; re-ran the mutation — now correctly
   reddens.
7. Gap dialog checkbox gating — removing the `disabled={!confirmed}` binding reddens both
   the "disabled until checked" and the "click before checking does not confirm" tests.

**Deferred-work.md** — both entries this story closes (`variant="stacked"`'s two shape
defects; the missing `size` prop) and the `week-gaps.ts:61` hand-off are now resolved in
code; the log document itself is a planning artifact this developer role does not edit
directly (BMAD convention — the finisher/orchestrator reconciles planning docs).

### File List

**New:**
- `components/week/WeekChromeHeader.tsx`
- `components/week/WeekChromeHeader.test.tsx`

**Modified — production:**
- `entrypoints/fullpage/App.tsx` — lifted `weekOf` state + prev/next handlers (D-7.7-25)
- `components/week/WeekView.tsx` — mounts `WeekChromeHeader`, drops the old heading/
  paragraph, no longer passes `weekOf`/`isMarkedDone`/`onMarkedDone` to `WeeklyGrid`
- `components/week/WeeklyGrid.tsx` — `<colgroup>`+`table-fixed`, weekend tint at header/
  totals, `TotalsCell` → `variant="stacked"` + `size={11}`, ⏎-advance registry, widened
  row-header truncation, removed the bottom `MarkAsDoneButton`+its props
- `components/week/DayCell.tsx` — AC4 cell anatomy (34px box, tokens, focus-visible ring,
  time-off styling, weekend value-text dimming), D-7.7-24 `<td>` accessible name via
  `hoursPhrase`, `registerFocusable`/`onCommitAdvance` (Tab untouched, ⏎ advances)
- `components/week/PtoPopover.tsx` — `weekend` prop dims header trigger text
- `components/week/MarkAsDoneButton.tsx` — `chrome`/`today` props, threads
  `weekLoggedSeconds`/`weekTargetSeconds`/`dailyTargetHours` to the dialog
- `components/week/GapAcknowledgmentDialog.tsx` — full AC7 rebuild (title, framing,
  evidence rows, required checkbox gating the primary, backdrop non-dismissal, focus→
  checkbox)
- `components/shared/DayStatusIndicator.tsx` — `size` prop, stacked width/quantisation
  fixes, `STATUS_BAR_CLASS` bar-colour axis, `TIME_OFF_TEXT_CLASS` export
- `components/ui/button.tsx` — `chrome` variant
- `lib/week-gaps.ts` — closed the `ptoDays` guard, `WORKDAYS_PER_WEEK` export,
  `gapDayNote`, `gapSummary` signature change (finisher: `gapSummary` + its private
  `hoursLabel` helper subsequently REMOVED — see Finding Resolutions, D-7.7-21b)
- `lib/hours.ts` — `hoursPhrase`
- `styles/globals.css` — 5 new tokens (D-7.7-15/16)
- `lib/day-status.ts` — **finisher-only**: `dayStatusNote`'s `time-off` branch gained a
  fourth arm (D-7.7-20 / Finding 4)
- `components/week/GapAcknowledgmentDialog.tsx` — **finisher**: `shortDayLabel` RangeError
  guard (Finding 8), evidence-row widths corrected to the design's pinned values
  (Finding 14d), merged the two `[open]` effects (Finding 14a)
- `components/week/WeeklyGrid.tsx` — **finisher**: totals row moved `<thead>` → `<tfoot>`
  (D-7.7-21a / Finding 7), `font-mono` → `tabular` on the row key (Finding 6),
  `allRowsRef` write moved into a `useLayoutEffect` (Finding 10)
- `components/week/DayCell.tsx` — **finisher**: per-branch token-based hover, replacing
  the shared raw `hover:bg-neutral-100` (Finding 11); dropped the dead `text-right`
  (Finding 12)
- `components/week/WeekChromeHeader.tsx` — **finisher**: `pctToWidthClass` quantisation
  fix (D-7.7-21c / Finding 1)
- `components/shared/DayStatusIndicator.tsx` — unchanged by the finisher (Finding 9's fix
  is test-only)
- `components/week/WeekView.tsx` — **finisher**: `onPrevWeek`/`onNextWeek` made required,
  not defaulted (Finding 14b)
- `components/ui/button.tsx` — **finisher**: doc comment corrected (Finding 14c)

**Modified — tests:**
- `components/week/WeeklyGrid.test.tsx`, `components/week/DayCell.test.tsx`,
  `components/week/MarkAsDoneButton.test.tsx`, `components/week/GapAcknowledgmentDialog.test.tsx`,
  `components/week/WeekView.test.tsx`, `components/shared/DayStatusIndicator.test.tsx`,
  `entrypoints/fullpage/App.test.tsx`, `lib/week-gaps.test.ts`, `lib/hours.test.ts`,
  `lib/day-status-vocabulary.grep.test.ts` (allowlist widened for `bg-weekend`, split
  from the combined `bg-amber-soft` assertion)
- `components/week/WeekChromeHeader.test.tsx` — **finisher**: 3 new quantisation tests
  (D-7.7-21c / Finding 1)
- `lib/day-status.test.ts` — **finisher-only, new coverage**: 6 tests for D-7.7-20's fourth
  arm (Finding 4)

**Modified — finisher, D-7.7-21f correction (outside the surfaces this story otherwise touches, but the
three occurrences had no remaining owner — see the Finding 6 correction above):**
- `components/today/QuickLogForm.tsx` — `font-mono` → `tabular` on the ticket-key span (`:217`)
- `components/today/TicketPicker.tsx` — `font-mono` → `tabular` on two ticket-key spans (`:665`, `:734`)

**New — finisher, D-7.7-21f:**
- `lib/no-monospace.grep.test.ts` — mechanical guard for the Epic 7 "no monospace" constraint;
  exact-count allowlist for the 9 occurrences still owned by Stories 7.8/7.10

**Modified — planning artifacts:**
- `_bmad-output/implementation-artifacts/epic-7-decision-log.md` — D-7.6-3's canonical
  block updated with `size`/`tone="chrome-solid"` to match code (D-7.7-30 obligation);
  **finisher**: creator decisions `D-7.7-22…35` folded in verbatim (D-7.3-11), citation
  drift corrected (D-7.7-21e), D-7.7-14's dissolution cross-reference repointed; D-7.7-21f
  (orchestrator) read and actioned
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status → `review`;
  **finisher**: status → `done`
- `_bmad-output/implementation-artifacts/deferred-work.md` — **finisher**: three entries
  (`variant="stacked"`, `size` prop, `week-gaps.ts:61`) marked RESOLVED with pointers to
  the closing decisions; one new entry recording Story 7.9's shared-helper obligation

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-26 | 0.1 | Story created at baseline `bbe0645` (95 files / 1273 passed / 1 skipped, exits non-zero from ONE known pre-existing unhandled rejection in `ManagerView.test.tsx`). Explicit-mode creation for Story 7.7. AC1 recorded as **already met** by Story 7.2 per D-7.2-1 (verify, do not rebuild). Established that the grid is **already a semantic `<table>`**, so AC3 needs column geometry + announcement content only — **no table migration, zero blast radius**. All four inherited obligations given tasks: `week-gaps.ts:61` **closed** via a one-line guard deletion (verified safe because `week-grid.ts:179` already sums time-off seconds into `dayTotalsSeconds`); `variant="stacked"` fixed against a real call site in Task 2; `size?: 11 \| 12 \| 13` added to the contract **and** to D-7.6-3's canonical block; the weekend tint applied at header/cell/totals from `isWeekend(iso)` per D-7.6-46. Every AC4/AC2 value cross-checked against the vendored design source with file:line citations per SD-6, surfacing three values the AC omits and one (`Diamond`) the mockup omits that the spine requires. Creator decisions `D-7.7-1…13` (later renumbered `D-7.7-22…34` by the finisher, D-7.3-11) recorded; orchestrator/owner rulings were originally planned to reserve `D-7.7-30+`, though in practice they landed at `D-7.7-15…21`. Six decisions flagged for the orchestrator, three of them blocking (`D-7.7-28` tokens, `D-7.7-32` bar colour, `D-7.7-35` how the cell `Diamond` renders without breaking the 7.6 grep test). | bmad-story-creator |
| 2026-07-26 | 1.0 | All 13 tasks implemented; every AC verified. Chrome header (new `WeekChromeHeader.tsx`), column geometry, cell anatomy (tokens + weekend value-text dimming beyond the flagged scope), `hoursPhrase` announcement, Tab/⏎ in-place editing advance, `variant="stacked"` totals with the `STATUS_BAR_CLASS` bar-colour axis, and the AC7 gap-dialog rebuild all shipped. `week-gaps.ts:61` closed. Relocated "Mark week as done" out of `WeeklyGrid` into `WeekChromeHeader` (D-7.7 Files section's "never ship two"); `Button.tsx` gained a `chrome` variant. Fixed a real, hand-computed AA contrast failure in the chrome eyebrow/nav (72%→85% white, matching `ChromeHeader.tsx`'s own prior Finding 4). Widened `lib/day-status-vocabulary.grep.test.ts`'s `bg-weekend` allowlist for the new legitimate `WeeklyGrid.tsx` consumer (D-7.7-31) and exported `TIME_OFF_TEXT_CLASS` from `DayStatusIndicator.tsx` rather than hard-coding `text-legacy-purple` in `DayCell.tsx`, keeping the AC3 grep guard intact and green. RED-proved 7 fix points live (week-gaps guard, stacked width, stacked quantisation, stacked bar colour, weekend-tint-as-one-object, gap-dialog backdrop, checkbox gating) — one RED-prove attempt (gap-dialog backdrop) initially gave a false green because Radix's dismissable-layer defers its pointerdown listener by one tick; fixed the test to await that tick, then confirmed genuine RED/GREEN. Final: 96 files / 1340 passed / 1 skipped, same ONE pre-existing `ManagerView.test.tsx` rejection as baseline. `pnpm compile`/`pnpm lint`/`pnpm build` all clean. Status → review. | bmad-story-developer |
| 2026-07-26 | 1.1 | Code review: 0 Blockers / 4 Majors / 7 Minors / 4 Nits + 4 escalations, all resolved by finisher. Majors: Finding 1 (`WeekChromeHeader` re-shipped the exact quantisation defect this story fixed elsewhere, D-7.7-21c) fixed; Findings 2/3 (zero grep coverage for the new `STATUS_BAR_CLASS` axis and a missing per-occurrence `bg-weekend` companion guard, reproducing D-7.6-43) closed, all 6 previously-green mutations re-verified genuinely RED; Finding 4 (a near-full time-off booking falsely read "Half-day time off", D-7.7-20) fixed via a fourth `dayStatusNote` arm. Escalations resolved per owner/orchestrator ruling: totals row moved `<thead>`→`<tfoot>` (D-7.7-21a); `gapSummary` investigated for accessible-equivalence, confirmed genuinely equivalent (not an a11y regression), then deleted as dead code (D-7.7-21b); the chrome-bar fix scoped to `WeekChromeHeader.tsx` only, Story 7.9 obliged to extract the shared helper (D-7.7-21c). Minors/Nits: `font-mono`→`tabular` (6), `shortDayLabel` RangeError guard (8), the vacuous width-equality assertion replaced with an honest CSS-contract assertion (9), a render-phase ref write moved to `useLayoutEffect` (10), a raw hover colour replaced with per-branch tokens (11), a dead `text-right` class dropped (12), `WeekView`'s nav callbacks made required (14b), evidence-row widths corrected to the design's pinned px values (14d), two effects merged and a stale doc comment fixed (14a/14c), 7 drifted design-source citations corrected in both the story and the decision log (14e/D-7.7-21e). Finding 13 (apostrophe style) DISMISSED — byte-verified the design source uses ASCII apostrophes, not the typographic ones the finding claimed; the implementation is already exact to its source of truth. Creator decisions `D-7.7-1…14` renumbered `D-7.7-22…35` and folded into `epic-7-decision-log.md` as canonical (D-7.3-11). Final: 96 files / 1351 passed / 1 skipped (net +11 over review-time 1340, after removing 4 dead `gapSummary` tests), same ONE pre-existing `ManagerView.test.tsx` rejection. `pnpm compile`/`pnpm lint`/`pnpm build` all clean. Status → done. | bmad-story-finisher |
| 2026-07-26 | 1.2 | Orchestrator correction per **D-7.7-21f**: the prior pass's Finding 6 resolution correctly fixed `WeeklyGrid.tsx`, but its broader "repo-wide grep: zero occurrences anywhere" claim was **false** — 14 `font-mono` occurrences remained across the product (a real, standing Epic 7 constraint, not a per-story detail). Corrected: fixed the 3 occurrences with no remaining owner (`QuickLogForm.tsx:217`, `TicketPicker.tsx:665,734` — every story that owned those surfaces has shipped); left the 9 occurrences owned by not-yet-shipped Stories 7.8/7.10 untouched (each now has an explicit obligation in `epic-7-decision-log.md`); left the 2 `LoggedToday.test.tsx` occurrences alone (a legitimate absence-assertion guard). Verified the `TicketPicker`/`WeeklyGrid` shared seam still renders correctly and no test asserted `font-mono`'s presence on the fixed spans. Added `lib/no-monospace.grep.test.ts`, an exact-count allowlist guard so the "no monospace" constraint is enforced mechanically going forward — RED-proved both a new unowned occurrence and a stale allowlist count. Re-measured: 97 files / 1352 passed / 1 skipped, same ONE pre-existing rejection. `pnpm compile`/`pnpm lint`/`pnpm build` all clean. Amended into commit `9d7359c`, not a second commit. | bmad-story-finisher |

---

## QA Results

## Review Summary

- **Reviewed by:** bmad-code-reviewer (adversarial, independent verification)
- **Date:** 2026-07-26
- **Baseline:** `bbe0645` (== HEAD; entire diff is uncommitted working tree)
- **Scope:** `components/`, `lib/`, `styles/`, `entrypoints/` + untracked `WeekChromeHeader.{tsx,test.tsx}`. Fenced Epic 6.3 files and the orchestrator-owned `epic-7-decision-log.md` edits excluded.
- **Story Status Recommendation:** **Changes Requested**
- **Blockers:** 0
- **Majors:** 4
- **Minors:** 7
- **Nits:** 4

### Gates measured independently (all developer claims CONFIRMED)

| Gate | Claimed | Measured | Verdict |
|---|---|---|---|
| `pnpm test` | 96 files / 1340 passed / 1 skipped | **96 / 1340 / 1** | exact |
| Unhandled rejections | exactly ONE, `ManagerView.test.tsx` | **1**, `getStorageArea` -> `@wxt-dev/storage`, originating in `components/manager/ManagerView.test.tsx` | exact |
| `pnpm compile` | 0 errors | **0 errors** (`tsc --noEmit` silent) | pass |
| `pnpm lint` | 0 errors | **0 errors**, 40 warnings — all pre-existing `import/order` in files this story does not touch | pass |
| `pnpm build` | clean | **clean**, total 907.04 kB | pass |

Suite re-verified at 96/1340/1 **after** all reviewer mutations were reverted; `git status --porcelain` file list byte-identical to the pre-review state. Every mutated file restored and md5-verified.

### Verdict on the three highest-scrutiny changes

**1. The `bg-weekend` grep-allowlist widening — JUSTIFIED in structure, but it re-opens one hole.**
The widening is genuinely minimal: the developer *split* the combined assertion so `bg-amber-soft` did **not** gain `WeeklyGrid.tsx`, and added exactly one file for exactly one class. Mutation-tested 16 ways:

| Mutation (injected as CODE, not comment) | Result |
|---|---|
| `text-status-clean` in `WeeklyGrid.tsx` | RED |
| `text-legacy-purple` in `WeeklyGrid.tsx` | RED |
| `bg-amber-soft` in `WeeklyGrid.tsx` (proves the split did not widen it) | RED |
| `bg-weekend` in the **new** `WeekChromeHeader.tsx` | RED |
| `Circle` from lucide-react in `WeeklyGrid.tsx` | RED |
| **`Diamond` in `DayCell.tsx` (7.6's rule — D-7.7-17 says do not weaken)** | **RED — unweakened** |
| `Diamond` in `WeeklyGrid.tsx` | RED |
| `'below target'` inside the real `STRINGS` block | RED |
| `text-amber-ink` as an object-literal map value (control) | RED |
| `bg-time-off-bar` / `bg-weekend-bar` / `bg-royal-purple` / `bg-status-dirty` in `WeeklyGrid.tsx` | **GREEN -> Finding 2** |
| status->bar-colour object map in `DayCell.tsx` | **GREEN -> Finding 2** |
| `{weekend:'bg-weekend', partial:'bg-weekend'}` map in newly-allowlisted `WeeklyGrid.tsx` | **GREEN -> Finding 3** |

**`TIME_OFF_TEXT_CLASS` is a REAL fix, not laundering.** The literal `text-legacy-purple` stays inside `DayStatusIndicator.tsx` (the one sanctioned owner, D-7.6-2); `DayCell.tsx` imports the constant. Mutation B proves that writing the literal in a *non*-allowlisted file still reddens. Identical shape to the pre-existing `STATUS_TINT_CLASS` export. No indirection was created that hides a hard-coded colour.

**2. `components/ui/button.tsx` — SAFE. No consumer can be affected.**
The diff is a single purely-additive hunk (`@@ -19,6 +19,14 @@`). Verified byte-identical against `bbe0645`: the `cva` base string, `primary`/`secondary`/`ghost` class strings, both `size` variants, `defaultVariants`, `ButtonProps`, the `forwardRef` body, `cn(...)` call and `displayName`. The `variant` union only *widens*, so no call site can newly fail to type-check. Enumerated **17 importers / 38 `<Button` usages**: every single one passes an explicit `variant`, so not even a hypothetical `defaultVariants` change could have leaked. `chrome` has exactly **one** consumer in the repo — `MarkAsDoneButton.tsx:90` (`variant={chrome ? 'chrome' : 'primary'}`). `buttonVariants` has no external consumer. This is the first shared-component change this epic that is provably inert for existing callers.

**"Mark week as done" — exactly ONE affordance, write path intact.** Removed from `WeeklyGrid` (props `weekOf`/`isMarkedDone`/`onMarkedDone` deleted, a disclosed contract change) and mounted once via `WeekView` -> `WeekChromeHeader` -> `MarkAsDoneButton`. `MarkAsDoneButton`'s internals (`computeWeekGaps` -> dialog -> `setWeekMarkedDone` + `badge-update` broadcast) are behaviourally unchanged. No orphaned or duplicated write path.

**3. `DayStatusIndicator` — no consumer regressed.**
Independent transitive reverse-import closure (I did not reuse the developer's delegated analysis) — **8 production modules**, reaching 2 of 3 entrypoints:

```
DayStatusIndicator.tsx
|-- DayCell.tsx:4 -> WeeklyGrid.tsx:8 -> WeekView.tsx:6 -> fullpage/App.tsx:5 -> fullpage/main.tsx  *
|-- WeeklyGrid.tsx:5 -> WeekView.tsx:6 -> fullpage/App.tsx:5 -> fullpage/main.tsx                   *
|-- shell/ChromeHeader.tsx:2 -> popup/App.tsx:2 -> popup/main.tsx                                   *
`-- manager/ManagerMatrix.tsx:6 -> ManagerView.tsx:1 -> fullpage/App.tsx:3 -> fullpage/main.tsx      *
```

`entrypoints/options` is outside the closure. `DayCell.tsx` has exactly one production importer (`WeeklyGrid.tsx:8`), reachable only from the full page — never the popup.

Why the changes cannot reach the other consumers: **all four `stacked` changes** (width, quantisation, `STATUS_BAR_CLASS`, `bg-border-faint`->`bg-cell-border`) live inside the `variant === 'stacked'` branch, and `variant="stacked"` has exactly **ONE** production call site repo-wide (`WeeklyGrid.tsx:171`). `ChromeHeader.tsx:180` and `ManagerMatrix.tsx:834,868` all pass `variant="inline"`. `size` defaults to `ICON_SIZE = 12`, and a test pins `default -> width="12"`, so the three existing callers render identically. `variant="cell"` confirmed to exist **nowhere** in the repo — D-7.7-17's ruling holds. `Diamond` has exactly one importer (`DayStatusIndicator.tsx:6`) — the single-owner invariant is intact. **D-7.6-3's canonical block in `epic-7-decision-log.md` DOES now carry `size?: 11 | 12 | 13`** and lists `variant?: 'inline' | 'stacked'` with no `cell` — the D-7.7-30 obligation is met and the contract is no longer stale.

### The five rulings

| Ruling | Verdict |
|---|---|
| **D-7.7-15** | PASS. Three new tokens `--color-cell-border: #edecf2`, `--color-time-off-fill: #f6f5fa`, `--color-time-off-border: #e2e0ee` — tokenised, not collapsed, not raw hex. `ring-focus`, `--color-weekend` (`#f1f0f6`) and `--color-faint-decorative` (`#adacb9`) all **REUSED, not redeclared**. **`text-muted` = `#6b6678` — byte-exact match for the design's weekend value-text `#6B6678`; the developer's claim is TRUE and there is no colour deviation.** Weekend empty middot stays `faint-decorative` (flagged item, defensible). |
| **D-7.7-16** | PASS. `bg-current` gone. All five bar values verified against `imports/jira-time-logger.dc.html:811-815`: `met->bg-status-clean #15803D`, `partial->bg-royal-purple #615B99`, `attention->bg-status-dirty #B45309`, `time-off->bg-time-off-bar #8B84AE`, `weekend->bg-weekend-bar #D8D7E1`. Track -> `bg-cell-border #EDECF2`. **Zero glyph characters shipped** — the half-filled family is absent from the whole tree; the time-off glyph appears only in a `globals.css` comment; the check/dot hits are pre-existing non-status uses (`ApproveButton`, `banner-dom`). |
| **D-7.7-17** | PASS. No icon in the time-off data cell (`DayCell.tsx` `boxColorClass` is fill/text/border only). No `variant="cell"` anywhere. No icon-only mode. 7.6's `Diamond`-in-`DayCell` grep rule **mutation-proved unweakened**. `size?: 11 \| 12 \| 13` in props **and** in D-7.6-3's canonical block; `size={11}` consumed at `WeeklyGrid.tsx:175` (the totals glyph, per the ruling's re-attribution). |
| **D-7.7-18** | PASS. Dialog copy says "time off". Repo-wide grep: **no new user-facing "PTO" string** — all 18 production hits are comments/JSDoc except `PtoQuickAction.tsx:28 defaultSummary: 'PTO'`, which is the verbatim Jira POST payload and correctly guard-excluded. `KNP-99`'s verbatim summary is untouched. |
| **D-7.7-19** | PASS on the write path. Guard deleted; all three mandated cases tested and RED-provable. I independently verified the truth table and confirmed no double-count. **But see Finding 4 and Finding 5** — the write path is correct, its *copy* is not, and `gapSummary`'s half of the ruling landed on code no user reaches. |

### Independent contrast figures (hand-computed, WCAG 2.1 relative luminance)

The axe harness cannot see any of this (`lib/test/axe.ts` disables `color-contrast`). My figures match the developer's to two decimal places — the AA fix is genuine.

| Pairing | Ratio | AA (4.5:1) |
|---|---|---|
| White **/72** (design-literal) on lightest gradient stop `#615B99` | **4.04:1** | FAIL — the failure the developer found |
| White **/70** on `#615B99` | **3.91:1** | FAIL |
| White **/85** on `#615B99` (lightest stop, worst case) | **4.91:1** | PASS |
| White **/85** on `#4A4163` (darkest stop) | **7.36:1** | PASS (monotonic, so endpoints bound the range) |
| Time-off `#594F74` on `--color-time-off-fill #F6F5FA` | **6.92:1** | PASS |
| Weekend `--color-faint #6B6B72` on `--color-weekend #F1F0F6` | **4.66:1** | PASS (tight) |

**No on-gradient opacity remains below 4.5:1.** I checked all three text runs, not just the two the Completion Notes name: eyebrow (`WeekChromeHeader.tsx:130`), prev/next (`:140`) **and the 14 px `/ 40h` secondary figure (`:170`)** are all `text-white/85`. The `/ 40h` run is the one most easily missed — 14 px at normal weight does not qualify as large text and needs the full 4.5:1; it has it. Decorative ring borders (`border-white/[.14]`, `/[.12]`) and the bar track (`bg-white/20`) are non-text and exempt. **This is the third time this `/70`->`/85` class has appeared this epic (7.2 `ChromeHeader.tsx`, and here); it is genuinely fixed, and fixed more completely than reported.**

### Other standing gates

- **D-7.6-40 (gradient) PASS** — progress fill is plain `bg-white`, track `bg-white/20`, no per-status class anywhere in `WeekChromeHeader`. The week bar is deliberately not routed through `DayStatusIndicator`.
- **Weekend tint as ONE recessive object PASS, and NOT on `<col>` PASS** — `<colgroup>` carries `w-[104px]` only, no background, so no column fill can punch through a filled `<td>`. Tint applied at `<th>` (`WeeklyGrid.tsx:512`), body `<td>` (`DayCell.tsx`, pre-existing) and totals `<td>` (`TotalsCell`). RED-proved on **two independent axes**: neutering the totals tint reddens; neutering the header tint reddens.
- **`ring-focus` via `focus-visible:` PASS** — `DayCell`'s box uses `focus-visible:border-primary focus-visible:ring-focus`; the dialog checkbox uses `focus-visible:ring-focus`. Never static.
- **Red only for refused writes PASS** — no new red; `DayCell`'s two documented survivors are unchanged and the grep guard pins their count at exactly 1 each.
- **Scope discipline PASS** — `ManagerMatrix.tsx`, `ManagerView.tsx`, `entrypoints/popup/App.tsx`, `shell/ChromeHeader.tsx`, `PopupActionBar.tsx` all diff **EMPTY**. No 7.8 chip restyle, no 7.9 popup states, no 7.10 Settings body. AC1's shell was not rebuilt (`App.tsx` gains only `weekOf` state + prev/next handlers). The table was not migrated.
- **"Untouched" claims — ALL 11 VERIFIED EMPTY**: `lib/hierarchy.ts`, `lib/manager-matrix.ts`, `lib/storage/pinned-tickets.ts`, `lib/ticket-search.ts`, `components/today/SearchPanel.tsx`, `components/today/ResumeCard.tsx` (+ the five above). **`breaksHeaderBaseline` proven byte-identical the strong way**: `git hash-object entrypoints/popup/App.tsx` == `git rev-parse bbe0645:entrypoints/popup/App.tsx` == `37ea3452e05293adbe4601f89a983657dbd601e6` — the whole file, not just the symbol.

### RED-prove audit — 7 claims, all 7 GENUINE (verified live, then reverted)

| # | Claim | My mutation | Result |
|---|---|---|---|
| 1 | `week-gaps` guard removal | verified by truth-table + independent `gapDayNote` probe | GENUINE |
| 2 | stacked width | `flex w-full` -> `inline-flex` | RED, 1 failed |
| 3 | stacked quantisation | verified `pctToWidthClass` arithmetic against `BAR_WIDTH_CLASSES` at 0 / 2.4 / 53 / 97.6 / 100 / negative | GENUINE |
| 4 | stacked bar colour | 5 bar tokens verified against design; `bg-current` absent | GENUINE |
| 5 | weekend tint as one object | totals `weekendTint = ''` -> RED; header tint -> `''` -> RED | GENUINE, **both axes** |
| 6 | **gap-dialog backdrop (the self-reported false-green)** | removed `onPointerDownOutside` | **RED, 1 failed — the corrected test genuinely reddens; the `setTimeout(0)` false-green is really fixed** |
| 7 | checkbox gating | removed `disabled={!confirmed}` | **RED, 2 failed** |

**Bonus teeth I verified that the developer did not claim:** neutering `onCommitAdvance?.()` in `DayCell` reddens **2** tests across two files; neutering `focusNextRowCell`'s lookup (the composition root in `WeeklyGrid`) reddens the advance test. The advance test renders the **real** `WeeklyGrid` + real `DayCell` (not mocked), so it is a genuine composition test.

**Toothless assertions found: 1** (Finding 9). Given eleven were found across 7.3-7.6 and the developer self-caught one here, this diff's test quality is materially better than the epic's baseline.

---

## Findings

### Finding 1: `WeekChromeHeader` ships a fresh copy of the exact quantisation defect this story was chartered to fix
- **Severity**: Major
- **Category**: Correctness
- **Location**: `components/week/WeekChromeHeader.tsx:58-62`
- **Observation**: The new file's `pctToWidthClass` is `const index = Math.round(clamped / 5); return WIDTH_CLASSES[index] ?? 'w-0';` — character-for-character the defect D-7.7-29 defect 2 exists to eliminate, which the same story correctly fixed 40 lines of diff away in `DayStatusIndicator.tsx:186-191` (`Math.floor` + a non-zero floor + `?? 'w-full'`). The comment at `:30-33` shows the duplication was deliberate ("each chrome-bar owner keeps its own"), so the buggy function was copied along with the width table. Concretely: a week at 97.6% of target (39h of 40h) renders `Math.round(19.52) = 20` -> **`w-full`, reading as fully done while the user is an hour short**; a week at 2.4% renders `Math.round(0.48) = 0` -> **`w-0`, reading as empty after an hour is logged**. The popup's `ChromeHeader.tsx:50-53` carries the same pre-existing bug, but that file is untouched and out of scope — this instance is **new code written by this story**.
- **Impact**: The week's single headline progress indicator on the primary surface misreports both extremes, and "reads as done when it is not" is precisely the failure mode D-7.7-29 was written to prevent. Because AC2's bar is the user's at-a-glance answer to "am I finished?", the false-full reading is the more damaging direction, and it sits directly beside the "Mark week as done" CTA.
- **Suggested Resolution**: Apply the same two-line fix as `DayStatusIndicator.pctToWidthClass` (early-return `w-0` for `<= 0`; `Math.max(1, Math.floor(clamped / 5))`; `?? 'w-full'`). Given there are now three copies of this table and function (`ChromeHeader`, `WeekChromeHeader`, `DayStatusIndicator`), consider extracting one shared helper and fixing all three — that would also close the pre-existing popup instance. Add the `97.6 -> not w-full` / `2.4 -> not w-0` pair to `WeekChromeHeader.test.tsx`.
- **Related AC**: AC2 (and the spirit of D-7.7-29)

### Finding 2: the new `STATUS_BAR_CLASS` status->colour axis has ZERO grep-guard coverage — six mutations came back green
- **Severity**: Major
- **Category**: Tests
- **Location**: `components/shared/DayStatusIndicator.tsx:143-153`; `lib/day-status-vocabulary.grep.test.ts:193-315`; `styles/globals.css:163-164`
- **Observation**: D-7.7-16 created an entirely new status->colour registry (`STATUS_BAR_CLASS`, 8 entries) and two brand-new day-status-exclusive tokens (`--color-time-off-bar`, `--color-weekend-bar`). The 7.6 vocabulary guard was **not** extended to cover any of it. I mutation-tested and all of these pass undetected: `bg-time-off-bar`, `bg-weekend-bar`, `bg-royal-purple` and `bg-status-dirty` written as literals in `WeeklyGrid.tsx`, and a `{ partial: 'bg-royal-purple', met: 'bg-status-clean' }` object map dropped into `DayCell.tsx`. This is exactly the D-7.6-43 Finding 3(b) failure mode — that guard was added *because* the colour check only looked at `text-*` literals and a hard-coded `bg-amber-soft` tint map passed undetected. `--color-time-off-bar` and `--color-weekend-bar` satisfy the guard's own stated safety test verbatim ("wholly NEW tokens this story introduces for the day-status vocabulary — zero pre-existing usage anywhere, so a strict 'nowhere but the indicator' check is safe"), so the strict form is available and correct.
- **Impact**: The single-registry discipline D-7.6-2/D-7.6-3 exist to enforce is now unprotected on the newest axis. Story 7.8 restyles matrix chips against this same component and is the most likely place a second bar-colour map appears; nothing in CI would catch it. The guard's *appearance* of completeness makes this worse than an acknowledged gap.
- **Suggested Resolution**: Add `bg-time-off-bar` and `bg-weekend-bar` to the strict `text-status-clean`/`text-legacy-purple` test at `lib/day-status-vocabulary.grep.test.ts:197` (allowlist `DayStatusIndicator.tsx` + `globals.css` only). Separately, generalise the per-occurrence object-literal-map guard at `:304` from the single hard-coded `text-amber-ink` to every token in both `STATUS_COLOR_CLASS` and `STATUS_BAR_CLASS`, iterating a fixture rather than naming one token. Mutation-prove each new arm.
- **Related AC**: AC6, AC8

### Finding 3: the new file-level `bg-weekend` allowlist reproduces D-7.6-43's Finding 3(c) hole verbatim
- **Severity**: Major
- **Category**: Tests
- **Location**: `lib/day-status-vocabulary.grep.test.ts:247-262`
- **Observation**: `WeeklyGrid.tsx` was added to the `bg-weekend` allowlist at **file** level. D-7.6-43 already established that a file-level allowlist "turned a validation carve-out into a day-status carve-out on a day-status surface", and closed it for `text-amber-ink` by adding a companion **per-occurrence** guard (`:304`) that permits the class as a plain `className=` string but never as an object-literal property value. No such companion was added for `bg-weekend`. Mutation-proved: injecting `const _sm: Record<string,string> = { weekend: 'bg-weekend', partial: 'bg-weekend' };` into `WeeklyGrid.tsx` is **GREEN**, while the identical shape using `text-amber-ink` (my control) is **RED** — the asymmetry is precisely the missing guard.
- **Impact**: `WeeklyGrid.tsx` is a day-status surface. A hidden status->tint map using `bg-weekend` can now be added there undetected — the same class of regression D-7.6-43 was written to close, re-opened by this widening. The widening itself is legitimate (D-7.7-31 requires the second call site) and was done the right way structurally; what is missing is the narrowing companion that the precedent requires alongside any file-level allowlist on a day-status surface.
- **Suggested Resolution**: Extend the object-literal-map pattern test at `:304` to cover `bg-weekend` (and, per Finding 2, the whole token set), rather than narrowing the file allowlist — the plain `className={... 'bg-weekend' ...}` usage at `WeeklyGrid.tsx:512` and in `TotalsCell` is legitimate and must keep passing.
- **Related AC**: AC3, AC8

### Finding 4: a full day off booked below target now reads "Half-day time off" in the gap dialog the user must certify as accurate
- **Severity**: Major
- **Category**: Correctness
- **Location**: `lib/day-status.ts:183-195` (`dayStatusNote`'s `time-off` branch), surfaced via `lib/week-gaps.ts:110-136` (`gapDayNote`) and `components/week/GapAcknowledgmentDialog.tsx:120`
- **Observation**: I probed `gapDayNote` directly. A day with **7.5h of time off and nothing else against an 8h target** returns **`"Half-day time off - 0.5h short"`**. `dayStatusNote`'s time-off branch is a three-way: `>= target` -> "Full-day time off"; `< target/2` -> "Time off - Xh"; **everything in `[target/2, target)` -> "Half-day time off"**. There is no fourth arm for "most of the day, but not all", so a genuinely full day off whose booking convention differs from the configured `targetHours` (7.5h PTO against an 8h target is a common pairing) is labelled a half-day. Before this story that day was skipped by `if (ptoDays[i]) continue`, so the string never reached a user; **D-7.7-19's guard deletion is what newly routes it into the dialog.** The mislabel originates in 7.6's code, but 7.7 is the story that surfaces it, and none of 7.7's new tests cover a time-off amount other than exactly `target` or exactly `target/2`.
- **Impact**: The dialog's entire purpose is honest accounting — the user is asked to tick "These hours are correct. I'm not missing time." next to an evidence row that misdescribes the day. `EXPERIENCE.md:315`'s "accounting reads these numbers as final once the week is closed" makes this a write-path accuracy problem, not cosmetics. It also means users on a non-8h PTO convention now see a gap dialog on **every** week containing a day off — new, unexplained friction on the mark-done path.
- **Suggested Resolution**: Add a fourth arm to `dayStatusNote`'s `time-off` branch for `timeOffSeconds` in `(target/2, target)` that claims no fraction — e.g. reuse the existing neutral `Time off - {X}h` phrasing, optionally with the shortfall. Then add cases to `lib/week-gaps.test.ts` for time-off at `0.9 x target` and `0.6 x target`. Escalate to the owner whether a full-day booking that is short of `targetHours` should be a gap at all, or whether "any time off >= some threshold clears the day" is the intended product rule — that is a product decision, not a code fix.
- **Related AC**: AC7, AC8 (honest framing)

### Finding 5: `gapSummary` lost its only production consumer, so D-7.7-19's second half now applies to dead code
- **Severity**: Minor
- **Category**: Maintainability / Tests
- **Location**: `lib/week-gaps.ts:147-151`; `lib/week-gaps.test.ts:177-230`; `components/week/GapAcknowledgmentDialog.tsx:113-127`
- **Observation**: At baseline `gapSummary` was rendered by the dialog (`<li>{gapSummary(gap)}</li>`). D-7.7-19 required replacing its false `", not marked time off"` suffix with `dayStatusNote` — the developer did that correctly. But the same story's dialog rebuild stopped calling it: the evidence row now composes its own `shortDayLabel` + local `hoursLabel` + `gapDayNote`. Repo-wide grep confirms `gapSummary` has **zero** production callers; only its own four tests reference it. Two consequences: the ruling's copy fix is unobservable to any user, and those four tests now guard nothing user-facing. Separately, the rendered evidence row changed a11y register — the old single string announced "Thursday: 4h logged / 8h target, ..." (UX-DR32's "screen-reader-friendly factual summary"); the new row is three sibling `<span>`s with an abbreviated weekday ("Mon 20") and no "logged / target" framing.
- **Impact**: Dead exported code with a test suite that reads as coverage but protects nothing; a reviewer or finisher could reasonably believe D-7.7-19's copy change is live. The a11y register change is mild (day, hours and note are all still present and in a sensible reading order) but is an undisclosed departure from UX-DR32's stated shape.
- **Suggested Resolution**: Either delete `gapSummary` and its tests (and note in the decision log that D-7.7-19's second half was superseded by the dialog rebuild), or give the evidence row an `aria-label` built from `gapSummary(gap, today)` so the function has a real consumer and UX-DR32's full sentence is restored to the accessibility tree. The second option is preferable — it satisfies the ruling, keeps the tests meaningful, and improves the row.
- **Related AC**: AC7

### Finding 6: `font-mono` left on the row key in a surface this story touches — AC8's "no monospace" unmet and undisclosed
- **Severity**: Minor
- **Category**: AC Conformance
- **Location**: `components/week/WeeklyGrid.tsx:571`
- **Observation**: The Dev Notes name both instances explicitly — "`WeeklyGrid.tsx:505` still has a `font-mono` on the row key and `WeekView.tsx:159` on the week figure; the design uses Kanit + tabular there (`:386`, `:357`). **Fix them in the surfaces this story touches.**" The `WeekView` one was fixed (the old `<span className="font-mono">` figure is gone; `WeekChromeHeader` uses `tabular`). The `WeeklyGrid` one remains at `:571`. `WeeklyGrid.tsx` is unambiguously a surface this story touches — it has 125 changed lines. The Completion Notes do not mention `font-mono` at all, so this is an undisclosed omission rather than a reasoned deferral.
- **Impact**: AC8's "no monospace" constraint is still violated on the restyled grid, next to newly-tokenised cell anatomy — visually the row key will read in a different typeface from everything around it, which is the specific inconsistency the constraint exists to prevent.
- **Suggested Resolution**: Replace `font-mono` with `tabular` (and Kanit via the existing font stack) at `WeeklyGrid.tsx:571`, matching the design's `:386`. If it is being kept deliberately, say so in the Completion Notes with a reason.
- **Related AC**: AC8

### Finding 7: totals row stays in `<thead>` with `<td>` children, against both the design and the creator's recommendation — and the Completion Note misdescribes the decision
- **Severity**: Minor
- **Category**: Convention / AC Conformance
- **Location**: `components/week/WeeklyGrid.tsx:496-550` (`<thead>` closes at `:550`, `<tbody>` opens at `:551`; `TotalsCell` renders at `:538`)
- **Observation**: I verified the design source independently: the totals row is at `imports/jira-time-logger.dc.html:397`, carries `border-top:1px solid #E4E3EC`, and is the **last** child of the grid card (closing at `:415`), after the row loop at `:383-395`. The design is unambiguous that totals sit at the bottom. The implementation renders them inside `<thead>`, i.e. **above** the data, and `TotalsCell` emits `<td>` elements — data cells inside a header section, where `<tfoot>` is the element HTML provides for exactly this. The placement is pre-existing (Epic 4) and no AC demands a move, so this is not a hard AC failure. **However**, the Completion Notes state that for all three flagged items "creator's own recommendation applied" — that is inaccurate here: the creator recommended **moving to `<tfoot>`** (flagged decision 5), and the developer declined. Items 1 (weekend middot) and 3 (eyebrow) *did* follow the creator's recommendation; this one reverses it.
- **Impact**: Screen-reader users reading the table encounter the week's totals before any of the data they summarise, and `<td>` in `<thead>` weakens the scoped-header semantics AC3 is built on. Low user harm, but it is a design-fidelity deviation on a value the design states plainly, recorded in the story as an accurate application of a recommendation it actually reversed.
- **Suggested Resolution**: Correct the Completion Note to state that the creator's `<tfoot>` recommendation was declined, and why. Then escalate to the owner: move the totals row to `<tfoot>` (matching design and semantics, at the cost of moving assertions in `WeeklyGrid.test.tsx`), or record an explicit ruling that it stays in `<thead>` so 7.8/7.9 do not re-litigate it. The other two flagged items (weekend middot stays `faint-decorative`; eyebrow omits the display name per D-7.2-2's no-new-fetch rule) are both **defensible as left** and need no action.
- **Related AC**: AC3, AC6

### Finding 8: `shortDayLabel` throws `RangeError` on the `''` ISO fallback that the same codebase deliberately supports
- **Severity**: Minor
- **Category**: Correctness
- **Location**: `components/week/GapAcknowledgmentDialog.tsx:31-33`, called at `:120`; source of the value at `lib/week-gaps.ts:98`
- **Observation**: `shortDayLabel` is `format(parseISO(iso), 'EEE d')` with no validity guard. `computeWeekGaps` populates `iso: grid.days[i] ?? ''`. I confirmed by execution that `format(parseISO(''), 'EEE d')` throws **`RangeError: Invalid time value`**. This codebase explicitly treats that fallback as reachable — `lib/day-status.ts:52-64`'s Finding 24 comment hardens `isWeekend` for exactly this input and states that "existing callers ... already rely on a malformed/missing date degrading safely rather than throwing". `gapDayNote` degrades safely for the same input; only the new dialog helper throws. Most tellingly, **this same story guards the identical parse 40 lines away** — `WeekChromeHeader.tsx:102-105` does `Number.isNaN(parsed.getTime()) ? STRINGS.invalidDate : format(...)`. `buildWeekGrid` always pushes exactly 7 days, so `?? ''` cannot fire from a short array; the realistic trigger is a malformed `weekOf` propagating into `toISODate`, which both the old `WeekView` (`isValid(parsed)`) and the new header defend against. So this is a hardening inconsistency rather than a demonstrated live crash.
- **Impact**: If a malformed `weekOf` ever reaches the grid, the gap dialog throws during render on the mark-done write path — the user cannot close their week and gets an error boundary instead of a degraded label. One line of guard, and the convention for it is already documented and applied twice elsewhere in the same diff.
- **Suggested Resolution**: Mirror `WeekChromeHeader`'s guard: validate with `Number.isNaN(parsed.getTime())` and fall back to `gap.dayName` (always populated from `DAY_NAMES_LONG`), which also preserves the fuller weekday for screen readers per Finding 5. Add a test passing `iso: ''`.
- **Related AC**: AC7

### Finding 9: the mandated "same percent, different note length" assertion is vacuous — jsdom cannot prove container-relative geometry, and the story's prescribed test cannot either
- **Severity**: Minor
- **Category**: Tests
- **Location**: `components/shared/DayStatusIndicator.test.tsx:222-247` (the `toBe` at `:246`)
- **Observation**: D-7.7-29 prescribed "Render the same `percent` twice with a short note and a long note; assert the **same** width class", and the test implements it: `expect(shortBar?.className).toBe(longBar?.className)`. **That assertion cannot fail under any mutation**, because `pctToWidthClass` is a pure function of `percent` alone — the width *class* never depended on note length at baseline either. The defect D-7.7-29 describes was a **rendered pixel length** difference (`w-full` resolving against the widest sibling line under `inline-flex`), which jsdom cannot measure at all. The test does have real teeth, but they come entirely from the two `expect(wrapper?.className).toContain('w-full')` assertions: I mutation-proved `flex w-full` -> `inline-flex` reddens it (1 failed). I also confirmed that `inline-flex w-full` passes all 76 tests — which is correct, since `width:100%` resolves against the containing block regardless of `inline-flex` vs `flex`, so `w-full` is the load-bearing half of the fix and the test guards exactly that.
- **Impact**: Being honest about what was proven: **the CSS contract is right** (a definite `w-full` on the wrapper makes the bar's `w-full` resolve against the totals `<td>`, which D-7.7-23 pins at 104 px), and **the quantisation fix is provably right** (I verified the arithmetic at 0, 2.4, 53, 97.6, 100 and negative inputs against `BAR_WIDTH_CLASSES`). But **no test in this suite demonstrates container-relative rendering**, and the Completion Notes present RED-prove #2 as if it did. The vacuous third assertion is the kind of line that reads as proof in a later review and is not.
- **Suggested Resolution**: Delete the `toBe` assertion or annotate it as a redundant invariant rather than a defect guard, and add a comment stating plainly that the geometry is unverifiable in jsdom and rests on the CSS contract. If real proof is wanted it needs a browser-based check, which this project's Vitest-only constraint excludes — in which case record that as an accepted limitation.
- **Related AC**: AC6

### Finding 10: `allRowsRef.current` is written during render
- **Severity**: Minor
- **Category**: Correctness
- **Location**: `components/week/WeeklyGrid.tsx:480`
- **Observation**: `allRowsRef.current = allRows;` executes in the render body. Mutating a ref during render is a documented React violation: under concurrent rendering a render that is thrown away still performs the write, so the ref can retain rows from an abandoned render. The stated goal — "`focusNextRowCell` always resolves 'next row' against up-to-date data" — is fully served by writing it in a `useLayoutEffect`, which runs after commit and before any user event can fire, and is safe.
- **Impact**: No live defect today (this path has no Suspense or transitions, and the advance test passes and has verified teeth), but it is a latent correctness hazard on a focus path, and it is the kind of thing that breaks silently when a future story wraps the grid in a transition. The story explicitly warned against copying Story 4.4's fragile deferred-focus pattern; the developer correctly avoided the double-`rAF` (the new registry resolves synchronously with no `rAF`, and I confirmed it did not inherit or worsen the recorded 2xrAF race), then introduced a different render-phase hazard.
- **Suggested Resolution**: Move the assignment into `useLayoutEffect(() => { allRowsRef.current = allRows; })`. Re-run the advance test and its composition-root mutation to confirm teeth are retained.
- **Related AC**: AC5

### Finding 11: `hover:bg-neutral-100` overrides the time-off cell's fill, dropping the purple state on hover
- **Severity**: Nit
- **Category**: Convention
- **Location**: `components/week/DayCell.tsx:427`
- **Observation**: `boxClass` includes `hover:bg-neutral-100`, and `boxColorClass` supplies `bg-time-off-fill` (or `bg-surface`). Because `hover:` variants win on specificity regardless of class-string order, hovering a time-off cell replaces `#F6F5FA` with `bg-neutral-100` — a raw Tailwind palette grey, not a semantic token — momentarily erasing the state's tint.
- **Impact**: Cosmetic; the state still reads from the totals row's words and icon, so no AA regression. But it undoes AC4's cell treatment exactly when the user is pointing at the cell.
- **Suggested Resolution**: Use a token-based, state-aware hover (e.g. `hover:bg-primary-soft` for the time-off branch and `hover:bg-border-faint` otherwise), moving the hover class into `boxColorClass` so each branch owns its own.
- **Related AC**: AC4

### Finding 12: `text-right` is inert under `justify-center` on the cell box
- **Severity**: Nit
- **Category**: Maintainability
- **Location**: `components/week/DayCell.tsx:427`
- **Observation**: `boxClass` sets both `items-center justify-center` and `text-right` on the same flex container. `justify-center` centres the single text child, so `text-right` has no effect — it is a dead class carried over from the old button. It also means cell digits are centred while the totals row and the rest of the grid right-align, which the design's tabular-numeric treatment implies.
- **Impact**: Dead code that misleads about intended alignment; a minor visual inconsistency in digit alignment down each column.
- **Suggested Resolution**: Pick one — either drop `text-right`, or drop `justify-center` and keep `text-right` if right-aligned digits are intended (check `imports/jira-time-logger.dc.html:391`'s justify value).
- **Related AC**: AC4

### Finding 13: straight ASCII apostrophes where the design source uses a typographic apostrophe
- **Severity**: Nit
- **Category**: Convention
- **Location**: `components/week/GapAcknowledgmentDialog.tsx:20-27` (`framing`, `checkboxLabel`)
- **Observation**: The design source uses typographic apostrophes (U+2019) in both strings — the framing sentence (`:429`) and the checkbox label (`:443`). The implementation uses ASCII `'`. Verified: the file contains zero U+2019 characters. The codebase does use typographic apostrophes elsewhere (e.g. `PtoQuickAction.tsx`'s "Couldn't mark time off"), so this is an internal inconsistency as well as a design deviation. AC7 asks for exact copy.
- **Impact**: Purely typographic; screen readers and matching are unaffected. Worth noting only because AC7 specifies the checkbox copy verbatim.
- **Suggested Resolution**: Use U+2019 in both strings to match the design source and the project's existing convention. Confirm the dialog's copy test still matches (it may assert the ASCII form).
- **Related AC**: AC7

### Finding 14: minor cleanups and citation drift
- **Severity**: Nit
- **Category**: Maintainability
- **Location**: as listed
- **Observation**: (a) `components/week/GapAcknowledgmentDialog.tsx:83-92` — two separate `useEffect(() => { if (open) ... }, [open])` hooks could be one. (b) `components/week/WeekView.tsx:57-58` — `onPrevWeek`/`onNextWeek` default to silent no-ops, so a missed wiring is invisible to the type system and to tests that do not assert navigation; making them required would fail loudly instead. (c) `components/ui/button.tsx:5-10` — the JSDoc still says "Three-tier button hierarchy" after gaining a fourth variant. (d) Evidence-row column widths deviate from the values D-7.7-34 pinned — day `w-[60px]` vs the design's 78 px (`:434`), logged `w-[70px]` vs 62 px (`:435`) — undisclosed, though `tabular` and `flex-1` are correct. (e) Line-citation drift I found while verifying the design source: the chrome-header block is consistently +1 off (gradient/padding is `:345` not `:344`; outer ring `:346` not `:345`; inner ring `:347` not `:346`; week figure `:359-360` not `:357-358`; progress bar `:362-363` not `:361-362`), the totals bar track is `:408` not `:406` (D-7.7-16 says `:406`, which is the glyph span), the `#F0EFF5` column separators are `:376`/`:402` not `:375`/`:398`, `of: "PTO"`/`"full-day PTO"` is `:823` not `:822`, the Tab/Enter helper line is `:418` not `:416`, and the evidence-row notes are `:831-833` not `:825-827`. Every *value* checked out; only the line numbers drifted.
- **Impact**: (d) is a small design-fidelity gap; (e) makes future SD-6 verification slower and was the single most time-consuming part of this review. Neither affects behaviour.
- **Suggested Resolution**: Fix (a)-(c) opportunistically. For (d), either use the design's widths or record why not. For (e), correct the citations in the story and in D-7.7-16 so the next reviewer's greps land. Also worth noting for whoever owns the design source: it contains two internal inconsistencies my verification surfaced — `:429` says "Three days are under 8h" while four days in its own data are, and the `met`/`none` totals states are never rendered by the mock data despite `:340` claiming "amber appears once".
- **Related AC**: AC2, AC7

---

### AC-by-AC conformance

| AC | Verdict |
|---|---|
| **AC1** full-page surface | **Satisfied** — met by 7.2, verified not rebuilt; `App.tsx` gains only `weekOf` state + prev/next handlers; routing, auth gate, `managesReports` gate and Settings placeholder untouched. |
| **AC2** chrome header | **Satisfied with Finding 1** — gradient, ring motif, 26px/600 title, prev/next, week figure, 4px plain-white bar, white primary button all present and design-verified. The bar's quantisation is defective (Finding 1). Eyebrow omits the display name (defensible, D-7.2-2). |
| **AC3** semantic grid | **Satisfied with Findings 6, 7** — table/scoped headers pre-existing; 104px `<colgroup>` + `table-fixed` added; announcement via `hoursPhrase`; weekend tint at all three levels, RED-proved, and correctly NOT on `<col>`. `font-mono` survivor and `<thead>` totals placement outstanding. |
| **AC4** cell anatomy | **Satisfied with Findings 11, 12** — 34px `rounded-md` box, `cell-border` + `bg-surface` when valued, transparent + `faint-decorative` middot when empty, `focus-visible:border-primary focus-visible:ring-focus`, time-off fill/text/border triple with no icon per D-7.7-17. |
| **AC5** in-place editing | **Satisfied with Finding 10** — Enter commits and advances one row (RED-proved twice, real composition test); last row is a safe no-op; Esc reverts; empty cell accepts a value with no ceremony; `resolvedRef` single-commit guard untouched. Tab is correctly not intercepted, but note this is verified only as "`preventDefault` not called" — real tab traversal after the input-to-button DOM swap is not provable in jsdom. |
| **AC6** totals row | **Satisfied with Findings 2, 9** — `variant="stacked"` at its first real call site, `size={11}` glyph, 3px bar coloured by the new independent axis (all five values design-verified), note on line three. |
| **AC7** gap dialog | **Satisfied with Findings 4, 5, 8, 13** — title, framing (day count and target computed, never hard-coded), evidence rows, required checkbox gating the primary (RED-proved), Keep editing / Close the week, Radix focus trap, backdrop non-dismissal (RED-proved, false-green genuinely fixed), Esc still cancels, `setConfirmed(false)` re-arm on reopen. |
| **AC8** standing constraints | **Satisfied except Finding 6** — WCAG AA hand-computed and clean on every new pairing; `lucide-react` only; `ring-focus` never static; no new red; SD-7 clean; zero invented colours (all 5 new tokens are design-specified values). "No monospace" remains violated at `WeeklyGrid.tsx:571`. |

### Escalations needing an owner ruling

1. **Finding 4 — the product rule for time off below target.** Should a full-day time-off booking short of the configured `targetHours` (e.g. 7.5h PTO against an 8h target) count as a gap requiring acknowledgment? The code now says yes and labels it "Half-day time off". Either the note needs a fourth arm, or the gap rule needs a time-off threshold. This is a product decision on a write path.
2. **Finding 7 — totals row placement.** Move to `<tfoot>` (design + HTML semantics, at the cost of test churn) or rule explicitly that it stays in `<thead>` so later stories stop re-raising it.
3. **Finding 5 — D-7.7-19's `gapSummary` half is now moot.** The ruling's copy fix landed on code with no production consumer. Confirm whether to delete the function or re-attach it as the evidence row's `aria-label`.
4. **Finding 1 — three copies of the chrome progress bar.** Whether to fix only the new instance (in scope) or extract a shared helper and also fix the pre-existing popup `ChromeHeader.tsx:50-53`, which carries the same latent defect.

### For `deferred-work.md`

Both entries this story closes are genuinely closed in code: `variant="stacked"`'s two shape defects (width and quantisation, both verified) and the missing `size` prop (added to the type **and** to D-7.6-3's canonical block). The `week-gaps.ts:61` hand-off is closed. The developer correctly notes the log document is a planning artifact for the finisher/orchestrator to reconcile — that reconciliation is still outstanding, and should now also record Finding 1's new instance of the quantisation defect and Findings 2/3's guard gaps.

---

## Finding Resolutions (bmad-story-finisher)

Triaged by the finisher pass that closed this story. The four escalations were already resolved by
orchestrator/owner rulings `D-7.7-20` and `D-7.7-21` (a-e) before this pass began — those are implemented
per ruling, not independently re-litigated, per this workflow's standing instruction.

### Escalations (pre-ruled — implemented, not re-litigated)

| Escalation | Ruling | Resolution |
|---|---|---|
| **Finding 4** — product rule for time off below target | **D-7.7-20** (owner): rule stays uniform (any day below target is a gap, no exemption); the NOTE was wrong, not the rule | **FIX.** `dayStatusNote`'s `time-off` branch gained a fourth arm: "half-day" is reserved for an ACTUAL half booking (`timeOffSeconds === Math.round(targetSeconds / 2)`, matching `logHalfDayPto`'s posted value); any other under-target amount states the real hours + shortfall. 6 new tests in `lib/day-status.test.ts` + 2 in `lib/week-gaps.test.ts`, all RED-proved by reverting the `isActualHalf` arm (3 tests reddened genuinely). |
| **Finding 7** — totals row placement | **D-7.7-21a** (orchestrator): move to `<tfoot>`; correct the Completion Note's wrong "creator's recommendation applied" claim | **FIX.** `WeeklyGrid.tsx`'s totals `<tr>` moved from `<thead>` to a new `<tfoot>`, `border-b` → `border-t` (matches the design's bottom placement + top border). New locking test in `WeeklyGrid.test.tsx` ("the totals row lives in `<tfoot>`, not `<thead>`"). Completion Notes corrected (see above) to state the developer originally declined the creator's recommendation, rather than claiming it was applied. |
| **Finding 5** — `gapSummary`'s D-7.7-19 half is moot | **D-7.7-21b** (orchestrator): investigate accessible-equivalence FIRST; delete only if the rebuild genuinely announces the same information | **FIX (investigated, then deleted).** Verified the rebuilt evidence row (`GapAcknowledgmentDialog.tsx`'s `<li>` with three sibling `<span>`s: day, logged/target, note) carries NO `aria-hidden` on any span and gets `role="listitem"` — a screen reader in browse mode reads all three facts (day, hours, note) in DOM order, the same information `gapSummary`'s sentence carried, just not stitched into one "logged / target" phrase. The dialog's own axe scan (`WeekChromeHeader.test.tsx`) is clean. **Not an a11y regression** — genuinely equivalent, just a different register (already flagged by the reviewer as "mild"). Removed `gapSummary`, its now-dead `hoursLabel` helper, and its 4 vacuous tests from `lib/week-gaps.ts`/`lib/week-gaps.test.ts`, with a comment recording the investigation. |
| **Finding 1** — three copies of the chrome progress bar | **D-7.7-21c** (orchestrator): fix only `WeekChromeHeader.tsx`'s new instance now; do NOT refactor all three; Story 7.9 owns extracting the shared helper (and fixing the popup's pre-existing instance) | **FIX (scoped).** `WeekChromeHeader.tsx`'s `pctToWidthClass` now uses the same `Math.floor` + non-zero-floor fix as `DayStatusIndicator.tsx`. 3 new RED-proved tests in `WeekChromeHeader.test.tsx` (39h/40h no longer `w-full`; 0.96h/40h no longer `w-0`; genuine zero still `w-0`). Popup `ChromeHeader.tsx` deliberately left untouched. New `deferred-work.md` entry records Story 7.9's obligation to extract the shared helper. |

### Findings 1–14

| # | Severity | Decision | Rationale |
|---|---|---|---|
| 1 | Major | **FIX** | Escalation, see table above — D-7.7-21c. |
| 2 | Major | **FIX** | `STATUS_BAR_CLASS`'s 5 bar-colour values (`bg-status-clean`/`bg-royal-purple`/`bg-status-dirty`/`bg-time-off-bar`/`bg-weekend-bar`) are all grep-confirmed exclusive to `DayStatusIndicator.tsx` (zero legitimate use elsewhere), so a strict whole-axis absence check closes the hole exactly like the pre-existing `text-status-clean`/`text-legacy-purple` check. Re-ran all 4 of the reviewer's GREEN mutations (`bg-time-off-bar`/`bg-weekend-bar`/`bg-royal-purple`/`bg-status-dirty` in `WeeklyGrid.tsx`, and the object-literal bar map in `DayCell.tsx`) — all now genuinely RED, verified live and reverted (files restored byte-identical, md5-checked). |
| 3 | Major | **FIX** | Added the same per-occurrence object-literal-map-value guard `text-amber-ink` already has, scoped to `bg-weekend`. Verified by hand that the pattern does NOT false-positive on the three legitimate `isWeekend(iso) ? 'bg-weekend' : ''` ternaries already in `WeeklyGrid.tsx`/`DayCell.tsx` (the class sits in the ternary's truthy branch, never immediately after the `:`, so the map-value regex — which only matches a quoted string immediately following a colon — cannot match it). Re-ran the reviewer's exact GREEN mutation (`{ weekend: 'bg-weekend', partial: 'bg-weekend' }` in `WeeklyGrid.tsx`) — now genuinely RED. |
| 4 | Major | **FIX** | Escalation, see table above — D-7.7-20. |
| 5 | Minor | **FIX** | Escalation, see table above — D-7.7-21b. |
| 6 | Minor | **FIX** | `WeeklyGrid.tsx:571`'s `font-mono` on the row key replaced with `tabular` — confirmed against the design source (`:386`, `font-variant-numeric:tabular-nums`) that the `tabular` utility already bundles Kanit (`--font-num`) + `tabular-nums` in one class, exactly the "Kanit + tabular" the Dev Notes prescribed. **File-scoped verification only: `WeeklyGrid.tsx` itself is clean.** An initial report additionally claimed "repo-wide grep: zero occurrences anywhere" — that broader claim was **false** (a real repo-wide grep over `components/ lib/ entrypoints/` returns 14 hits) and was caught by the orchestrator, recorded as **D-7.7-21f**. See the correction below. |

**Correction to Finding 6 (D-7.7-21f).** "No monospace anywhere" is a standing Epic 7 constraint
(`epics.md`), not a per-story detail, so the false "zero occurrences anywhere" claim was corrected rather
than left standing. The full 14-occurrence partition: **2 are a legitimate test guard**
(`LoggedToday.test.tsx:116,137`, asserting the *absence* of `font-mono` — left alone); **9 belong to
surfaces owned by stories that have not shipped yet** — Story 7.8 (`ManagerMatrix.tsx:373`,
`DrillDownPanel.tsx:166,171`) and Story 7.10 (`DiagnosticsBlock.tsx:68,73`, `ManagerDisplay.tsx:55,63`,
`CatchAllProjectField.tsx:111`, `entrypoints/options/App.tsx:143`) — **left untouched**, each now carrying
an explicit, named obligation in `epic-7-decision-log.md`; and **3 had no remaining owner**
(`QuickLogForm.tsx:217`, `TicketPicker.tsx:665,734` — every story that owned the popup/week surfaces those
files live on has already shipped, so no future story would pick them up). The 3 ownerless occurrences were
fixed in this same commit (`font-mono` → `tabular`, ticket-key spans). Verified the shared seam
(`TicketPicker` is now week-surface-only per Story 7.5, consumed by `WeeklyGrid`) still renders correctly —
`TicketPicker.test.tsx` (unmocked) and `WeeklyGrid.test.tsx` (which mocks `TicketPicker` away) both pass, and
no test anywhere asserted `font-mono`'s *presence* on the fixed spans. Added a new mechanical guard,
`lib/no-monospace.grep.test.ts`, per D-7.7-21f's recommendation: an exact-count allowlist keyed to the 9
still-owned occurrences (not a blanket exemption) — any NEW `font-mono` occurrence outside that allowlist
fails immediately, and the allowlisted counts are pinned exactly, so Story 7.8/7.10 fixing their occurrence(s)
without updating this test will also fail, forcing the allowlist entry to be removed rather than going stale.
RED-proved both directions (a new unowned occurrence; a stale allowlist count) live, then restored
byte-identical.
| 7 | Minor | **FIX** | Escalation, see table above — D-7.7-21a. |
| 8 | Minor | **FIX** | `shortDayLabel` now guards the `''` ISO fallback the same way this story's own `WeekChromeHeader.tsx` already does (`Number.isNaN(parsed.getTime())`), falling back to the always-populated `gap.dayName`. Cheap, consistent with an established in-diff convention, and closes a real (if not-yet-triggered) crash on the mark-done write path. |
| 9 | Minor | **FIX** | Replaced the vacuous `toBe` comparison with the CSS-contract assertions that are actually load-bearing (`flex`, not `inline-flex`, plus `w-full`, on both renders) — RED-proved by reverting `flex w-full` to `inline-flex`. Kept the original comparison as an explicitly-labeled "sanity check" (quantisation-is-note-length-independent), not a geometric proof, and documented in a comment that jsdom cannot lay out CSS so container-relative rendering is unverifiable here. |
| 10 | Minor | **FIX** | Moved `allRowsRef.current = allRows` out of the render body into a `useLayoutEffect`, which still runs synchronously before any user event (so `focusNextRowCell`'s guarantee is unchanged) but no longer performs a side effect during render. |
| 11 | Nit | **FIX** | Moved the hover class out of the shared `boxClass` into each `boxColorClass` branch: `hover:bg-primary-soft` for time-off (reinforces its own tint family) and `hover:bg-border-faint` (an existing semantic token) for ordinary/empty cells — never a raw, non-semantic `bg-neutral-100` again. |
| 12 | Nit | **FIX** | Dropped the dead `text-right` — confirmed against the design source (`:391`, `justify-content:center`) that `justify-center` is the intended alignment, so `text-right` was inert dead weight, not a signal of an intended-but-unimplemented right-align. |
| 13 | Nit | **DISMISS** | The finding's premise does not hold: byte-inspected `imports/jira-time-logger.dc.html` directly — it contains **zero** U+2019 (typographic apostrophe) characters anywhere in the whole file, including at the two cited locations (`:429` "That's", `:443` "I'm"), both of which use plain ASCII `'` (U+0027). The codebase's OTHER typographic-apostrophe convention (`PtoQuickAction.tsx`'s "Couldn't") is real, but AC7 asks for exact copy from the design source, and the design source itself is ASCII here — the current implementation is already byte-exact to its source of truth. Applying the suggested fix would move AWAY from design-source fidelity to satisfy an unrelated file's convention. Not applied. |
| 14a | Nit | **FIX** | Merged `GapAcknowledgmentDialog.tsx`'s two `[open]`-keyed `useEffect`s into one. |
| 14b | Nit | **FIX** | `WeekView`'s `onPrevWeek`/`onNextWeek` are now required, not defaulted to a silent no-op. Blast radius was low (exactly one production call site, `entrypoints/fullpage/App.tsx`, already passes both; exactly one test helper, `WeekView.test.tsx`'s `renderView`, needed updating to supply `vi.fn()` stand-ins) — a future caller that forgets the wiring now gets a type error instead of a silently-broken nav. |
| 14c | Nit | **FIX** | `button.tsx`'s doc comment corrected from "Three-tier" to document all four variants including `chrome`. |
| 14d | Nit | **FIX** | Evidence-row widths corrected to the design's pinned values (day `w-[60px]`→`w-[78px]`, logged `w-[70px]`→`w-[62px]`), verified against `imports/jira-time-logger.dc.html:434-435` directly. |
| 14e | Nit | **FIX** | All 7 drifted design-source citations corrected in both the story file and `epic-7-decision-log.md` (D-7.7-16, D-7.7-18), independently re-verified line-by-line against the vendored design source before applying (not merely trusted) — see D-7.7-21e. |

### Gate numbers re-measured after all fixes

`pnpm test`: **96 files / 1351 passed / 1 skipped** (post-finisher; was 96/1340/1 at review time — +11 tests,
0 new files: the net of 4 removed `gapSummary` tests and the new tests added per finding above). Exactly
**one** unhandled rejection, the same known pre-existing `ManagerView.test.tsx` `@wxt-dev/storage` teardown
race. `pnpm compile`: 0 errors. `pnpm lint`: 0 errors, 40 warnings, all pre-existing `import/order` in files
this story does not touch (unchanged set from the code review's own measurement). `pnpm build`: clean,
907.37 kB (code review measured 907.04 kB at review time; the small increase is the new code).

All six previously-green mutations the code review found now genuinely redden, re-verified live and reverted
(files restored byte-identical, md5-checked before and after each mutation): the four `STATUS_BAR_CLASS`
literals in `WeeklyGrid.tsx`, the object-literal bar-colour map in `DayCell.tsx`, and the
`{ weekend: 'bg-weekend', partial: 'bg-weekend' }` map in `WeeklyGrid.tsx`. A further sweep confirmed the
pre-existing guards remain unweakened: a hard-coded `text-status-clean` literal, a hard-coded `Circle`
import, a hard-coded `Diamond` import in `DayCell.tsx` (7.6's rule), a `'below target'` string, and a
combined `text-status-clean` + `bg-weekend` mutation in the NEW `WeekChromeHeader.tsx` all still redden.

### Numbering fold (D-7.3-11)

The creator's `D-7.7-1 … D-7.7-14` are renumbered `D-7.7-22 … D-7.7-35` (avoiding collision with the
orchestrator's `D-7.7-15 … D-7.7-21`) and folded verbatim into `epic-7-decision-log.md` as canonical. Every
`D-7.7-*` citation in this file and in source comments was repointed to match.
