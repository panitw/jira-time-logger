# Epic 7 — UX/UI Revamp (KKP Design System) — Decision Log

Orchestrated run started **2026-07-25**. This is the audit trail for every decision made while
driving Epic 7 through the BMAD pipeline (`bmad-story-creator` → `bmad-story-developer` →
`bmad-code-reviewer` → `bmad-story-finisher`), one story at a time.

**Who this is for.** Anyone picking up Epic 7 later — or reviewing why the code looks the way it
does — should be able to read this file alone and understand not just *what* was decided but
*why*, and what would have gone wrong under the alternative. Each entry states the problem in
plain terms, gives a concrete example where one helps, and records the reasoning.

**Authoritative specs:**
`_bmad-output/planning-artifacts/ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md`
(visual identity) and `EXPERIENCE.md` (information architecture, states, flows). Both win over
the reference mockups (`imports/jira-time-logger.dc.html`, `imports/jira-time-logger-round2.dc.html`)
whenever they disagree.

---

## What Epic 7 actually is

The shipped UI (Epics 1–6) was built to a design direction called "Quiet Density" — a flat data
canvas with no elevation, no brand chrome. That direction has been retired. Epic 7 replaces it
with the **KKP corporate design system**: purple chrome carrying the brand at the top of each
surface, a calm three-step neutral canvas underneath.

Three things change beyond paint:

1. **The popup gets narrowed to one job.** Today it renders a whole week grid *and* a manager
   matrix behind tabs. After Epic 7 it shows today and nothing else. Everything else moves to a
   new full-page browser-tab surface.
2. **Review work moves to that full page** — week grid, manager matrix, settings.
3. **The "below target" red goes away.** A half-logged day currently renders in danger red, which
   reads as *you did something wrong*. It gets replaced with an honest status vocabulary where a
   partly-logged day reads as *unfinished*, not *wrong*.

---

## Standing decisions (settled with the owner before the loop)

### SD-1 — Scope
**Originally:** stories 7.2 through 7.9 only. 7.10 (Settings) and 7.11 (inline Jira banner) were
blocked — neither surface had been designed, and their own acceptance criteria said the design had
to be resolved before development could start.

**AMENDED 2026-07-25 (during Story 7.2):** scope is now **7.2 through 7.11 — the whole epic.**

*What happened:* while Story 7.2 was being built, a `/bmad-ux` round-2 run ran concurrently and
designed both missing surfaces. Settings became a five-block reading column on the full page; the
Jira banner was redesigned as a 44 px "guest rail". Both stories gained full acceptance criteria.
The reason for excluding them — "no design exists" — simply stopped being true mid-run, so the
owner extended the scope. Epic 7 will now be completed rather than left with two stragglers.

*One caveat carried forward:* the round-2 Settings design includes a **"Re-authenticate" button
that has no implementation behind it**. The codebase has Connect, Disconnect and ApiTokenSetup —
there is no re-auth path. That is new functionality, not a restyle, and `EXPERIENCE.md` Open Item
3a explicitly puts it outside Epic 7. Story 7.10 must not silently grow a new auth flow.

### SD-2 — Build order: strict numeric, 7.2 → 7.3 → … → 7.11
**Decided by:** orchestrator (routine — `epics.md` recommends no alternative order).

Numeric order is already dependency-sound. Each story physically needs the one before it:

- 7.2 builds the popup shell → 7.3's resume card needs somewhere to mount.
- 7.4 builds search → 7.5's "51 more assigned tickets · Search to find them →" needs something to
  hand off *to*.
- 7.6 builds the shared day-status component → 7.7's week totals row and 7.8's matrix rows both
  consume it, and building it twice is exactly what its acceptance criteria forbid.
- 7.9 decorates surfaces that 7.2–7.6 create, so it must come after them.

Each story is driven **explicitly by number** so no agent auto-picks the next story by
sprint-status order and quietly reorders the run.

### SD-3 — Checkpoint cadence: run continuously
**Decided by:** owner. Report after each story but keep going; stop only for a genuinely
load-bearing decision.

### SD-4 — Decision-handling protocol
- **Escalate to the owner:** design/product forks, anything that would regress WCAG 2.1 AA,
  scope-vs-defer trade-offs, deviations from `DESIGN.md` / `EXPERIENCE.md`.
- **Decide and log:** naming, file placement, test shape, which existing seam to reuse, and
  forced consequences of decisions already settled.

### SD-5 — Working-tree hygiene
**Decided by:** owner.

The repository had uncommitted work from **two different epics** sitting in the tree when this run
started. That is a trap: an agent running `git add -A` would sweep another epic's half-finished
work into a Story 7.x commit, and nobody would notice until the CRX packaging work shipped inside
a UI commit.

So: Story 7.1's already-landed output plus the Epic 7 planning artifacts were committed as a
**baseline commit** (`36b5602`) before the loop began. Epic 6.3's in-flight CRX work
(`scripts/pack-crx.mjs`, `scripts/derive-ext-key.mjs`, `scripts/lib/`, `wxt.config.ts`,
`package.json`, `docs/release.md`) is **deliberately left uncommitted and untouched**.

Every finisher in this run receives an explicit list of files it may stage, and must confirm via
`git status` that nothing else got staged. **No `git add -A`, ever.**

---

## Baseline established before the loop (2026-07-25)

Recorded so that no agent can later mislabel a regression it caused as "pre-existing" — a failure
mode worth guarding against, because it is the single easiest way for a real bug to survive review.

- `pnpm compile` — **clean**.
- `pnpm test` — **76 test files, 961 passed, 1 skipped**.
- **Known pre-existing oddity:** `pnpm test` exits **non-zero even though every test passes.** One
  unhandled promise rejection escapes `components/manager/ManagerView.test.tsx`:
  `TypeError: Cannot read properties of undefined (reading 'runtime')`, thrown inside
  `@wxt-dev/storage`'s `getStorageArea`.

  *In plain terms:* the fake browser environment the tests run in is torn down while a storage read
  is still in flight, so the read reaches for `chrome.runtime` after it has been removed. It is a
  test-harness race, not a product bug — the extension itself is fine.

  **This is the baseline.** An agent reporting *this* is reporting a pre-existing condition. A
  *new* failing test, or any drop in the passing count, is **not** pre-existing and must be fixed.

### Constraints in force for every story in this epic

- **No story may regress WCAG 2.1 AA.** Status is never colour alone — always colour + icon +
  visible text label. The `docs/a11y-audit-2026-06-27.md` gate must still pass at the end.
  *Practical test:* delete the icon and the colour, and the state must still be fully readable
  from the text.
- **All icons come from `lucide-react`** (already a dependency, declared as the icon library in
  `components.json`). No second icon set, no icon font, no CDN. Icons render as inline SVG at
  11–13 px with `aria-hidden="true"`, so a screen reader announces the adjacent *text*, not the
  shape.
- **No monospace anywhere.** KKP has no monospace face. Numbers use the `tabular` utility, which
  is Kanit plus `font-variant-numeric: tabular-nums` — digits get equal widths so columns of
  figures line up without a monospace font.

---

## Story 7.2 — Popup Shell: One Job, One Scroll Region

**Shipped:** commit `53e6e44`. Tests went 961 → 998 passing (83 files). `pnpm build` green.

### D-7.2-1 — The full-page host shell ships in 7.2, not 7.7
*Orchestrator, routine (forced consequence).*

**The problem.** Story 7.2's first acceptance criterion says the popup's `Tabs` primitive is
"removed — not fixed, removed". But those tabs are the only way to reach `WeekView` and
`ManagerView`. Delete them and two whole features become unreachable — there is no other entry
point in the product. Meanwhile 7.2's own AC5 says "no manager affordance is orphaned in the
popup". You cannot satisfy both unless somewhere else exists for those views to live.

The full-page surface is *supposed* to be Story 7.7. But 7.7 is five stories away, and shipping a
build where the manager matrix is simply unreachable for five stories is not acceptable.

**The decision.** Story 7.2 adds the new WXT entrypoint (`entrypoints/fullpage/`) as a **thin host
shell only** — Week / Manager / Settings section routing that mounts the existing `WeekView` and
`ManagerView` **completely unchanged and unrestyled**. It is a container, not a redesign.

*Analogy:* 7.2 builds the empty rooms and the hallway between them, and moves the old furniture in
as-is. 7.7 redecorates the week room; 7.10 redecorates the settings room.

**Consequence for whoever writes 7.7.** Story 7.7's first acceptance criterion in `epics.md` is
word-for-word what this builds. Treat it as **already met** and scope 7.7 to the chrome header,
the semantic grid, cell anatomy, in-place editing, the totals row, and the gap dialog.

### D-7.2-2 — `useTodayTotal` is in scope, not over-reach
*Orchestrator, routine.*

The story creator flagged this as possibly exceeding the story's remit and offered to cut it.

**Verified against source before deciding.** `components/today/TodayView.tsx:29` reads
`const [loggedEntries, setLoggedEntries] = useState<LoggedEntry[]>([])` — an empty array on every
mount, with no load from storage or Jira.

*In plain terms:* the popup only remembered what you logged **while it was open**. Log five hours
in the morning, close the popup, reopen it after lunch, and it believed you had logged nothing.

The new chrome header's whole job is to show "logged / target" — e.g. `5.0 / 8h`. Against a
session-only list it would have displayed `0.0 / 8h` all afternoon. So a real data source is a
**forced consequence** of AC3, not a nice-to-have. Kept, with a guard against double-counting and
a test pinning it (see Finding 1 below for how that test had to be rebuilt).

### D-7.2-3 — Fix the spacing scale at the token layer (a Story 7.1 amendment, done inside 7.2)
*Orchestrator, routine — a defect against an authoritative spec.*

**The problem, plainly.** Story 7.1 set `html { font-size: 13.5px }` (`styles/globals.css:191`)
because the KKP body text size is 13.5 px. Reasonable on its own. But Tailwind v4 builds its
**spacing** scale out of `rem` units, and `1rem` equals whatever the root font-size is. 7.1 also
declared **zero** `--spacing-*` tokens, so Tailwind fell back to its default.

Result: every spacing utility silently came out at **0.84×** its intended size. `p-4` should be
16 px — `DESIGN.md`'s frontmatter says so explicitly (`spacing: {'4': 16px}`) — but it was
rendering at 13.5 px. Every margin, gap and padding in the entire shipped product had quietly
shrunk by about a sixth, and nothing failed, because nothing checks that kind of thing.

**Why it had to be fixed now rather than worked around.** The story creator's first instinct was
to write every spacing value as an explicit pixel arbitrary value (`p-[16px]` instead of `p-4`).
That works, but it means stories 7.3 through 7.11 each carry the workaround forever, and any
developer who forgets gets a silently wrong layout. Fixing the root cause once is strictly better.

**The fix.** Add `--spacing: 4px` to the `@theme` block. Tailwind v4 derives its whole scale as
`calc(var(--spacing) * n)`, so this yields `1`→4 px, `2`→8 px, `3`→12 px, `4`→16 px, `6`→24 px,
`8`→32 px — an exact match for DESIGN.md's spacing table, and permanently **decoupled from the
font size**. Also added the `--text-*` typography scale that 7.1 omitted (sizes, weights,
line-heights, letter-spacing only — **zero new colour values**). `html { font-size: 13.5px }` was
left alone; with spacing decoupled it is now purely a typographic anchor, which is what it was
meant to be.

**Expected side effect, flagged loudly so nobody calls it a bug:** this **restores** spacing across
the already-shipped Epic 1–6 surfaces back to their pre-7.1 absolute values. Existing components
visibly shift. That is the fix working, not a 7.2 regression.

*Outcome:* the developer ran this change in **isolation** before touching any component, precisely
so any test churn would be attributable to it. Zero tests needed updating.

### D-7.2-4 — The popup gets no manager affordance at all
*Settled by the spec, not by judgement.*

The creator flagged AC5 ("no manager affordance is orphaned in the popup") as genuinely ambiguous:
it could mean *the popup has no manager entry point at all*, or *the popup has a working one*.

Resolved by reading `EXPERIENCE.md` directly. Its information-architecture diagram enumerates the
popup as exactly six things — chrome header, resume card, search, logged today, recently worked,
action bar — and places the manager matrix under **"Full page (tab)"**. The manager's route is
full page → Manager nav. Not a judgement call; the spec answers it.

### D-7.2-5 — The Settings nav item is spec-mandated; only its body is provisional
*Orchestrator, routine.*

`EXPERIENCE.md` puts Settings in the full-page IA, so it cannot be dropped from the navigation
just because Story 7.10 hasn't run yet. The compromise: the nav item is real, and its body is a
thin panel with a single "Open settings" button that calls `chrome.runtime.openOptionsPage()` —
honest and functional rather than dead UI. Story 7.10 replaces the body in place.

### D-7.2-6 — Delete `components/ui/tabs.tsx`
*Orchestrator, routine.* A consumer audit (run twice, independently) found the popup's `App.tsx`
was its only importer anywhere in the repo. AC1 says "removed, not fixed". So the file goes.

`@radix-ui/react-tabs` **stays** in `package.json` — that file is part of Epic 6.3's uncommitted
work and must not be touched (SD-5). The dependency simply goes unused and tree-shakes out of the
bundle; removing it from the manifest is a post-6.3 follow-up.

### D-7.2-7 — `ManagerView.onSwitchToToday` keeps its name
*Orchestrator, routine.* There is no "Today" section on the full page, so the prop is wired to
`() => setSection('week')`. Renaming it is deferred to Story 7.8 to keep 7.2's diff scoped —
renaming a prop touches the component, its tests and its call sites for zero behavioural gain.

### Review findings and their resolutions

The reviewer ran independently, re-ran every gate rather than trusting the developer's numbers,
and **proved which tests had teeth by deliberately breaking the code and checking the tests went
red**. Three findings mattered:

**Finding 1 (Major) — a test that could never fail.** A test named
`'does not double-count (query is not refetched)'` looked like it guarded the hazard from D-7.2-2.
It did not. It only re-rendered a component with a new prop against a stable query key — and a
prop re-render *can never* cause a refetch, so its assertion was true no matter what the code did.

The reviewer proved this by injecting the exact forbidden call
(`invalidateQueries({ queryKey: ['week-worklogs'] })`) into `TodayView.handleLogged` — the one
thing the test existed to catch — and **all 988 tests still passed.**

*Why this matters:* the product was actually correct. The danger was that the *guard* was fake, so
the next person to touch that code would have been told "it's covered" by a green suite. Rewritten
as a real integration test driving the actual composition root; re-verified by re-running the
reviewer's sabotage — the suite now goes **red**, showing `5.0 / 8h` where the correct value is
`3.0 / 8h`, exactly the doubling predicted.

**Finding 2 (Major) — a change leaking through a shared component.** To satisfy the popup's
"exactly one scroll region" criterion, the developer removed `max-h-64 overflow-y-auto` from
`TicketPicker.tsx`. But `TicketPicker` is *also* used by `WeeklyGrid` on the week surface — a
component this story had explicitly fenced off. So a popup-scoped change silently altered the week
grid's scrolling.

Nothing caught it: `git status` looked clean (only the intended file changed), and
`WeeklyGrid.test.tsx` mocks `TicketPicker` away entirely, so its tests couldn't see it either.

Fixed by putting the change behind an `unbounded` prop that defaults to the old clamped behaviour,
so only the popup opts in. Regression tests added on both sides.

**Finding 3 (Major) — a user-visible regression: time off became uncorrectable.** Moving
`PtoQuickAction` into the new action bar meant time-off entries no longer reached the
"Logged today" list — and that list is where the edit and delete buttons live. So marking a day as
time off by mistake left no way to undo it from the popup, on hours that are written to Jira.

The running total was still correct (verified), which is why nothing looked broken. Fixed properly
rather than deferred: both producers now feed **one** shared entries list owned by the popup shell,
instead of one feeding a list and the other feeding a bare counter.

**Contrast finding (Minor) — AA outranks the styling spec.** The chrome eyebrow was specified as
`text-white/70`, which computes to roughly 4.0:1 against the top of the purple gradient. At 11 px
it counts as normal text, so WCAG AA requires **4.5:1**. The reviewer correctly declined to change
a spec'd value unilaterally and escalated.

**Orchestrator ruling: AA wins.** `epics.md` states as a standing constraint for *every* Epic 7
story that no story may regress WCAG 2.1 AA — that is a hard gate, and it outranks an opacity
detail. Raised to `/85`, computed at **4.91:1** against the worst-case gradient stop. Worth noting
that the automated axe harness **cannot** catch this (its `color-contrast` rule is disabled for
this kind of case), so it was verified by computation, not by a green test run.

*Action for the DESIGN.md owner:* fold the `/70` → `/85` change back into the spec so the next
surface doesn't reintroduce it.

Remaining minors and nits (live region mounted with its content so the first total went
unannounced; `refetchOnReconnect` as a third undocumented route to the double-count hazard; the
axe scan stubbing out real components) were all fixed. **Nothing was dismissed or deferred.**

---

## Story 7.3 — Resume Card: The First Move

*Story file written and `ready-for-dev`. Development paused at the owner's request before the
developer was launched.*

### D-7.3-1 — The empty-history acceptance criterion is split, with a named owner
*Orchestrator, routine.*

AC5 says that when the user has no worklog history, the resume card is replaced by "the search
field promoted to primary position". **Search is Story 7.4 and does not exist yet.**

Rather than let this sit as a quietly unmet criterion — or let 7.3 build a throwaway fake search
field it would immediately delete — the AC is split:

- **7.3 owns and must fully satisfy** the half that is satisfiable now: no empty resume card
  renders, and the slot collapses cleanly with no reserved dead space.
- **7.4 owns** the "search promoted to primary" half, recorded as an explicit named carry-forward.

The point of naming an owner is that "we'll get to it" is how acceptance criteria go missing.

### D-7.3-2 — The resume card needed a new data source; three candidates were investigated first
*Story creator, endorsed by orchestrator.*

The card needs two facts: **which ticket you last logged against**, and **what value you last
entered for it**. Neither existed. The creator checked all three plausible existing sources rather
than inventing one immediately:

- **`TodayView.loggedEntries`** — session-only, the exact defect D-7.2-2 had to work around. Dead
  end.
- **`lib/storage/pinned-tickets.ts`** — looks like the right thing but isn't. Its only writer
  records tickets arriving *from search*, and it stores no duration. It means "recently reached",
  not "recently logged".
- **`useWeekWorklogs`** — real data, already fetched by `useTodayTotal` under the same query key
  (so reusing it costs **zero extra network calls**). But its range is the current Monday–Sunday
  only, while `EXPERIENCE.md` requires the most recent worklog from **any day**.

**Resolution:** a new persisted `local:lastLoggedTicket` (`lib/storage/last-logged.ts`), written
only on confirmed successful posts, enriched for free by the already-fetched week query so a newer
server-side worklog can win. It is also the only *honest* source for "last-used value" — if a
worklog is later edited, scanning the week reports the edited duration rather than what the user
actually typed.

**Accepted limitation, written into the story rather than hidden:** on a fresh install whose first
popup open precedes any worklog in the current week, there is no resume card. It self-heals the
first time you log anything. Covering that case would cost a search plus N per-issue GETs on the
first-paint path — a direct violation of NFR1 (popup interactive within 400 ms) for a
first-run-only edge case. **This is an open question the owner may want to overturn** (see below).

### D-7.3-3 — The −10 px offset must live on the scroll container, not the card
*Story creator, endorsed.*

The resume card is meant to sit 10 px higher than normal so it visually breaks the chrome header's
baseline. The obvious implementation — a negative top margin on the card — **is silently broken**:
7.2's `<main>` has `overflow-y-auto`, and an element pulled outside its scroll container's bounds
gets **clipped**, not overhung. The offset has to go on `<main>` itself (the clip rectangle moves
with the box), and the card needs `relative z-[1]` or the chrome header paints over it.

Deliberately reduced to **one boolean** in `App.tsx`, because Story 7.9 requires the offset to drop
when an offline or error banner is present — so 7.9 appends one condition rather than rewriting the
layout. Confirmed correct against the round-2 mockup, which sets `resumeOffset: "0px"` in both the
offline and error states.

### D-7.3-4 — Autofocus is resolved from storage alone, never awaiting the network
*Story creator, endorsed.* The hour input must be focused when the popup opens (AC3), but the
chrome header has an `aria-live="polite"` region from 7.2. Because focus fires first and `polite`
*queues* rather than interrupts, the input's name is announced before the progress figure — no
timers or `aria-busy` juggling required. A `useRef` focus latch stops the later data-enrichment
re-render from stealing focus back. Flagged as colliding with 7.4's `/`-to-focus-search shortcut.

### Spec ambiguities resolved in 7.3

- **`+0.5` / `+1` / `+2` are post buttons, not steppers.** `epics.md` says "post immediately",
  which could mean either. Settled by `EXPERIENCE.md` ("write immediately"): they log that exact
  amount rather than incrementing the input.
- **`DESIGN.md` specifies `resume-card.border: #DEDCE9`, a raw hex with no matching token.** Ruled
  to use `border-border` (`#E4E3EC`) instead — the difference is imperceptible under `shadow-lift`
  and it preserves the token discipline 7.1 and 7.2 established. *Recorded as a deviation for the
  DESIGN.md owner.*
- **`ring-focus` is applied via `focus-within:`, not statically.** A static ring would keep glowing
  after focus moved away, which lies to sighted users — and will lie more once 7.4's `/` shortcut
  moves focus to search.
- **Unparseable input renders amber, not red.** The epic's constraint is that red fires only for a
  write Jira actually refused. (`QuickLogForm`'s existing red parse error is pre-existing Epic 2
  code and was left alone.)
- **A mockup self-contradiction was ignored in favour of the AC.** One `EXPERIENCE.md` flow shows a
  pre-fill of `1.0` after logging `1.5h`, contradicting both itself and AC3's "last-used value".
  Followed the AC.

### Verified: `shadow-lift` is genuinely exclusive
AC1 claims the resume card is the only element in the popup carrying `shadow-lift`. Checked:
declared in `styles/globals.css`, used by **zero** source files today. The claim holds, and a
source-level guard test pins it so a future story can't quietly add a second one.

---

## Open question awaiting the owner

**Should the resume card survive a cold start on a fresh install?** (Story 7.3, from D-7.3-2.)

The situation: a brand-new user, or anyone whose most recent worklog predates the current week,
opens the popup and sees no resume card — just the search field. It fixes itself the moment they
log anything.

Covering it properly means widening the recency lookup beyond the current week, which costs a Jira
search plus one GET per issue **on the first-paint path** — directly against NFR1's 400 ms
interactive budget, to serve a case that occurs once per user.

Current ruling is **no** — accept the limitation and state it honestly in the story. The cheaper
alternative, if the owner wants it covered: Story 7.5 already needs a wider "recently worked"
recency source, so `useResumeTicket` could compose over that instead, at no extra network cost.
Say the word and it becomes a named dependency rather than a documented limitation.
