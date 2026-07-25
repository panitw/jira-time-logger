# Claude Design handoff — jira-time-logger UX revamp

**How to use this:** paste everything below the rule into Claude Design as a single prompt. Save whatever it
emits (HTML screens, tokens, notes) back into this folder — `.working/` for exploration, root for keepers.
Then come back and run `/bmad-ux` in **Update** mode to distil `DESIGN.md` + `EXPERIENCE.md` from the results.

Assembled 2026-07-25 from `.decision-log.md`. Decisions are Note's; nothing below was invented by the facilitator
except items marked `[ASSUMPTION]`, which you should override if wrong.

---

## What I need you to design

Redesign three surfaces of **jira-time-logger**, a Chrome/Edge Manifest V3 extension used by a ~10-person
internal engineering team at KKP (Kiatnakin Phatra, a Thai financial group).

The product turns Jira's worklog — a passive form people forget — into an ambient daily-logging tool plus a
monthly manager approval flow. It has two co-equal halves: **active reminders** (toolbar badge, inline banner,
daily notification) and **at-a-glance overview** (week grid, manager matrix).

Deliver, for each surface: a self-contained HTML mockup, all meaningful states, and the token set you used.

### Surface 1 — Toolbar popup (the one that matters most)

**Job: log time today. Nothing else.** This surface is opened daily, many times. Target interaction: under 30
seconds, keyboard-only if the user wants.

- Width **380px** `[ASSUMPTION — override if you have a better answer]`, height ≤ 560px. Chrome's hard ceiling
  is 800×600 and the current build hit it by accident, which is half the problem.
- **No horizontal scroll. No nested scroll regions.** The current build scrolls a 55-item list inside an
  already-scrolling popup; that must not survive.

Content, in the priority the user actually needs it:

1. **Chrome header** — KKP purple gradient. Product identity + today's date + today's progress (e.g. `2.5 / 8h`).
   This is also the depth anchor for the whole popup.
2. **Resume card (the primary move).** The most recently logged ticket, presented so the user can add hours to
   it immediately — no navigation, no search. Note asked for this explicitly. Hours entry should accept quick
   increments *and* an arbitrary value; Enter submits. This card is the answer to "I don't know what to do when
   the popup opens," so it must be unmistakably the loudest thing after the header.
3. **Search field.** Finds any ticket by key or text — including tickets **not** assigned to the user, searched
   live from Jira. Workers regularly log against a teammate's task or a project they were pulled into before
   assignments updated.
4. **Today's logged entries.** What's already on the clock today: ticket key, summary, hours, edit/delete.
5. **The assigned-ticket list — this is a design problem, not a spec.** The user has **55 assigned tickets**,
   grouped (`Your Tasks`, and a catch-all project `KNP` for meetings/standups/PTO). Today it's an
   undifferentiated 55-row scroll that eats the entire popup. I am deliberately not prescribing the fix — solve
   it. Ranking by recency, collapsing by default, capping with "show all," folding it entirely into search, are
   all fair game.
6. **Mark today as PTO** — a secondary action, currently a full-width primary-looking button competing with
   real work.
7. **A way out to the full page** — "Open week ↗".

Popup states to cover: nothing logged yet · some hours logged · at/over target · PTO day · loading (skeletons,
not spinners — time-to-interactive budget is 400ms warm) · offline with queued writes · Jira error ·
not-yet-connected.

### Surface 2 — Full page, week review

Opens in a browser tab, desktop width. Owns everything the popup gave up.

- Week header: `Week of Mon, Jul 20`, total against target (e.g. `28 / 40h`).
- Grid: **subtask rows × Mon–Sun columns**, cells editable in place. Weekend columns visually de-emphasised.
- A per-day totals row with status per day.
- Per-day PTO marking (full day / half day) from the day header.
- "Add a subtask to this week."
- **"Mark week as done"** — and when days are below target, a gap-acknowledgment dialog that makes the user
  read what's missing before confirming. This is deliberate friction protecting data integrity. It must be
  **honest without being preachy** — no "Don't forget!", no scolding.

**Critical:** the current build renders `below target` in red, five times in a row, across the whole week. It
reads as an alarm wall and it is the single most punishing thing in the UI. Below-target is the *normal*
state for a partially-filled week. Find a treatment that informs without accusing.

### Surface 3 — Full page, manager matrix

Marco, an engineering manager with 7 reports, approves monthly timesheets that feed accounting. He does this
12× a year and it currently costs him ~3 hours a month. Target: under 10 minutes total.

- 2D matrix: **reports × epics**, one cycle (calendar month) at a time, with a cycle selector.
- Up to 12 reports × 50 epics = 600+ cells, fetched client-side against a rate-limited API — so design a
  **progressive render**: first row useful within 2s, skeletons rather than a blocking spinner.
- Cell states: approved · clean · **dirty** (worklog edited after approval, needs re-approval) · missing ·
  **visibility-restricted** (the manager literally cannot see some worklogs, and the UI must say so rather
  than silently under-report).
- Drill-down panel for a single suspicious cell.
- Per-report approve, with a confirmation summarising what's being approved (X hours across Y epics for Z).

**The design insight to honour:** most cells are green most of the time. Marco's cognitive work is entirely in
the two cells that are wrong. Make exceptions pop without making the correct majority feel like noise.

---

## Visual direction

### Register

**Linear / Raycast** — tight, precise, engineered, keyboard-first, information-dense without feeling crowded.
Depth comes from layered surfaces, not decoration.

**But the palette and typography are KKP's, not Linear's.** Where they conflict: KKP wins on colour and type,
Linear wins on density, precision, and interaction feel. Do not make this cold and grey — make it a KKP product
built with Linear's discipline.

### The problem you're solving, stated plainly

The client's words: *"It's ugly"* and *"It looks flat and I don't know what to do when the popup opens."*

The flatness is **missing hierarchy, not missing shadows**. Every block in the current build — the date, the
PTO button, "Logged today", "Pick a ticket to log", the week grid — carries identical visual weight, so the eye
has nowhere to land and the user has no idea what the software wants them to do. Fix the hierarchy first;
elevation is a tool for that, not the goal.

### KKP design system — binding

The one idea: **distinctive shell, calm data.** Brand character lives in the *chrome* (headers, primary actions,
nav) — saturated purple, gradient, Kanit. The data stays calm — white surfaces, hairline borders, high legibility.
Purple + grey must cover **≥50% of any surface**, Legacy Purple **≥10%**; the chrome carries that so the data
canvas stays free.

```css
:root{
  /* brand */
  --legacy-purple:#594F74;   /* PRIMARY. Only brand colour. */
  --royal-purple:#615B99;    /* secondary — gradient top, hover, recomputing status */
  --grandeur-grey:#ADACB9;   /* NON-TEXT decoration only (dividers, guides) */
  --grandeur-lite:#E7E7ED;
  --purple-deep:#4A4163;     /* gradient floor, shadow tint */

  /* neutrals — warmed toward purple */
  --background:#FAFAFB;      /* app canvas */
  --surface:#FFFFFF;         /* cards, tables */
  --foreground:#1E1B2E;      /* primary text */
  --muted:#6B6678;           /* secondary text */
  --faint:#6B6B72;           /* a11y floor: 4.6:1 on white. LIGHTEST PERMISSIBLE TEXT GREY. Never lighten. */
  --border:#E4E3EC;          /* purple-tinted hairline */
  --primary:#594F74; --primary-foreground:#FFFFFF; --primary-soft:#ECEBF3;

  /* status — meaning is fixed, never remap */
  --status-clean:#15803D;        /* ✓ up to date */
  --status-dirty:#B45309;        /* ● changed / owed */
  --status-recomputing:#615B99;  /* ◐ recomputing */
  --status-error:#DC2626;        /* ✕ failed */

  --r-sm:4px; --r-md:6px; --r-lg:8px; --r-full:9999px;

  --font-chrome:'Kanit',system-ui,sans-serif;
  --font-data:'Noto Sans',system-ui,sans-serif;
  --font-num:'Kanit',system-ui,sans-serif;  /* + font-variant-numeric:tabular-nums */

  --chrome-gradient:linear-gradient(165deg,#615B99 0%,#594F74 42%,#4A4163 100%);
  --shadow-sm:0 1px 2px rgba(74,65,99,.05), 0 1px 3px rgba(74,65,99,.05);
  --shadow:0 1px 3px rgba(74,65,99,.07), 0 10px 26px rgba(74,65,99,.08);
}
```

**Typography — split by role:**

| Role | Family | Size | Weight | Line-height |
|---|---|---|---|---|
| display | Kanit | 22px | 600 | 1.3 |
| display-sm | Kanit | 13.5px | 600 | 1.4 |
| heading | Kanit | 16px | 500 | 1.5 |
| label | Kanit | 12px | 500 | 1.5, ls .01em |
| body / data | Noto Sans | 14px | 400 | 1.6 |
| numeric | Kanit + `tabular-nums` | 13px | 400/500 | — |

**KKP has no monospace and no serif.** Ticket keys, hour values, and totals use Kanit with
`font-variant-numeric: tabular-nums` so columns still align. The current build's monospace ticket keys are
being retired — do not reintroduce them.

**Signature devices available to you:**
- The **orbital motif** — thin concentric arcs + dot-nodes in white at ~14–16% opacity over the purple chrome
  gradient. Chrome only, never under data.
- The **section-header underline rule** — Kanit title in Legacy Purple over a 2px rule whose first ~64px is
  purple and the remainder `--border`.
- **Count pills** — `--primary-soft` background, Legacy Purple text, fully rounded; inverted to white-on-
  translucent when sitting on the purple chrome.

Spacing is 4-based (4 / 8 / 12 / 16 / 24 / 32); lean to the larger end *between* groups and tighter *within*
a list. Radius stays crisp — this is a tool, not a toy.

### Depth — explicitly relaxed

KKP's own spec says the data canvas must be *"flat, no elevation."* **The client has explicitly waived that
rule** for this project ("you can go off the track"). Use elevation wherever it builds hierarchy: purple chrome
as the primary layer, white cards floating on the `#FAFAFB` canvas, purple-tinted shadows with intent. Just
don't scatter it — depth should mean "this is more important," and if everything lifts, nothing does.

Everything else in KKP stays binding: Legacy Purple as the sole brand colour (no sub-brand greens, oranges, or
navies), the ≥50% purple+grey rule, no monospace, glyph-paired status, and the `#6B6B72` text-grey floor.

---

## Constraints you cannot design around

- **Chrome extension popup**: 800×600 absolute maximum. Design to 380×560.
- **No CDN.** Extension CSP blocks external font/style loads — Kanit ships bundled as local woff2. Keep the
  weight set small (300/400/500/600 at most, fewer if you can).
- **English only.** Thai support and Noto Sans Thai are dropped for this product; `--font-data` is Noto Sans
  Latin. (A deliberate, recorded deviation from KKP's bilingual mandate.)
- **Light mode only** this round. Keep tokens semantic so dark can be derived later without redesign.
- **Implementation stack is fixed**: React 19, Tailwind v4 (CSS-first `@theme`), shadcn/ui, Radix primitives
  (dialog, tabs, popover), lucide-react icons. Design things these can actually build.
- **WCAG 2.2 AA.** Visible focus rings. **Status is never colour alone** — every state pairs a colour with a
  glyph (`✓` clean, `●` dirty, `◐` recomputing, `✕` error) and an accessible label. Full keyboard operation,
  including the popup's entire hot path.
- **Performance is a UX constraint**: popup time-to-interactive ≤400ms warm. No heavy entrance animation on
  open. Reduced-motion must be honoured.

---

## Anti-patterns — observed in the current build, do not repeat

1. Two tabs' worth of content rendering simultaneously in one endless scroll.
2. A scroll region nested inside another scroll region.
3. `below target` repeated five times in red across one row — an alarm wall for what is a normal state.
4. `——` used as an empty-value glyph; it reads as broken rendering, not "nothing here."
5. Four section headings of equal weight with no primary action among them.
6. Monospace ticket keys colliding with proportional summaries, producing ragged, unscannable rows.
7. Sections floating on one flat background with no containment, grouping, or rhythm.
8. A 55-row list allowed to consume the entire viewport before the user can act.

---

## Realistic content for the mockups

Use these — they're real shapes from the actual instance, and they're deliberately awkward so the design has to
survive real data rather than tidy placeholders.

```
MBS-135   MBS1045 - DirectDebitListing
MBS-134   MBS1212 - BalanceBillingDetail
MBS-131   MBS1206 - SuspenseDetail
MBS-125   ALC301 - kkp-alc-queuing-collateral-info
MBS-110   MBS215 - BulkPayment
MBS-107   MBS301 kkp-mbs-contract-status-event
GAPI-348  SR-582505: ABACUS SRM101 - InquiryCarRegistrationBookStatus Assignment Ownership screen
GAPI-330  SR-582505: ABACUS ETL101 - NotifyBulkFiles (ETL) : (rundeck) seperate by ID file
KNP-12    Standup
KNP-99    PTO
```

Note the GAPI summaries: 80+ characters. Truncation behaviour is a real design decision here, not an edge case.

Users for the mockups: **Priya** (senior engineer, primary — logs sporadically, forgets for days, then guesses
at month end) and **Marco** (engineering manager, 7 reports, approves monthly; he is also a worker himself, so
he sees both the popup and the matrix).

Target values: 8h/day, 40h/week.

---

## What to give back

1. **Self-contained HTML mockup per surface** — inline CSS, no external requests, real content from above.
2. **Every state named in each surface section**, not just the happy path. The empty, loading, offline, and
   error states are where the current build fails hardest.
3. **The token set you actually used**, as CSS custom properties — including anything you added beyond the KKP
   block above, called out as an addition.
4. **A short note on the 55-ticket list problem** explaining the structural choice you made and why.
5. **Anywhere you deviated from KKP** — flag it and say what it bought.

Priority order if you can't do everything: **popup first**, then week review, then manager matrix. The popup is
opened daily; the matrix twelve times a year.
