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

## Run resumed 2026-07-26

The run was paused after Story 7.3's file was written (`ready-for-dev`) and before the developer was
launched. It resumes here at **Develop 7.3**, with the same standing decisions SD-1 … SD-5 in force.

**Baseline re-verified at resume**, at commit `5fd70a1`, before any new work:

- `pnpm test` — **83 test files, 998 passed, 1 skipped**, and the same known pre-existing
  `ManagerView.test.tsx` unhandled rejection (`Cannot read properties of undefined (reading
  'runtime')` inside `@wxt-dev/storage`) still makes the command exit non-zero with every test
  passing.

This is now the baseline that "pre-existing" means for stories 7.3 → 7.11. It is identical to the
post-7.2 numbers recorded above, which confirms nothing drifted while the run was paused. Any *new*
failure, or any drop below 998 passing, is a regression and must be fixed — not labelled pre-existing.

### D-7.3-5 — The resume card accepts the cold-start blind spot; the lookup is not widened
**Owner decision** (asked, because it is a product trade-off between a real user-visible gap and a
hard performance NFR — the kind of fork where reasonable engineers disagree).

**Verdict.** `useResumeTicket` keeps the data sources settled in D-7.3-2 — the persisted
`local:lastLoggedTicket` record, enriched by the already-fetched current-week worklog query. The
recency lookup is **not** widened beyond the current Monday–Sunday week, and Story 7.3 does **not**
gain a dependency on Story 7.5. The gap is documented in the story as an accepted limitation rather
than left implicit.

**The situation.** The resume card needs to know which ticket you last logged against. It learns that
one of two ways: from a small record the extension writes locally every time a worklog post
succeeds, or by reading back the worklogs Jira already returned for the current week (which the
popup fetches anyway for the chrome header's "logged / target" figure, so it is free). Both sources
are silent for a user who has never logged anything through the extension *and* has no worklog inside
the current week. For that user the popup opens with no resume card at all.

**In simple terms.** Two people open the popup for the first time on a Monday morning. Ravi installed
the extension last month and logged four hours on Friday — Friday is in the previous week, and he has
never posted through the extension, so neither source knows anything about him. Priya installed it
this morning and has logged nothing anywhere. Both see the same thing: no resume card, just the
search field, which is exactly what the "no history" branch of AC5 already specifies. The moment
either of them logs one hour, the local record is written and the card appears on the next open and
every open after. So the blind spot is one popup open, once, per user — and the fallback it degrades
to is a designed state, not a broken one.

**Options considered.** (a) *Widen the lookup inside 7.3* — query Jira for the user's most recent
worklog across all time, then GET each matching issue for its summary. Rejected: that is a search
call plus N per-issue GETs sitting **on the first-paint path**, and NFR1 budgets the popup at 400 ms
to interactive. Paying that on every cold open to serve a once-per-user case inverts the cost. (b)
*Make it a named dependency on Story 7.5* — 7.5 must build a wider "recently worked" recency source
anyway, so `useResumeTicket` could compose over it later at no extra network cost. Genuinely cheap,
and it stays available if the owner reverses this. Rejected for now on the owner's instruction: it
would leave 7.3 shipping a knowingly unmet criterion and hand 7.5 an obligation it did not ask for,
to close a gap that self-heals. (c) *Accept and document* — chosen.

**Why this wins.** The failure mode is benign and self-correcting, and the alternative charges every
user on every cold open for it. The accepted downside, stated plainly: a returning user whose last
worklog fell in a previous week gets no resume card on their first open of the week — they see the
search field and must find their ticket manually that once. That is a real, if small, cost, and it is
being accepted deliberately rather than overlooked.

**Consequences.** `useResumeTicket` must not add a network call of its own — it composes only over
`useWeekWorklogs` (same query key, zero extra requests) and `lib/storage/last-logged.ts`. A test must
pin the empty case so it renders the AC5 no-history branch cleanly rather than an empty card or
reserved dead space. Story 7.5 carries **no** obligation from this decision. If option (b) is ever
taken up, it belongs in 7.5's own acceptance criteria, not as a silent change to 7.3's hook.

**How we'd know it was wrong.** Users reporting "the card is never there for me" rather than "it
wasn't there the first time" — that would mean the local record is failing to persist, which is a
different bug in the write path, not this trade-off. A steady trickle of first-open confusion would
be the signal to take option (b) in 7.5.

### D-7.3-9 — The server-wins override is frozen at first paint; it may never retarget a live card
**Owner decision** (asked — this is a write-correctness fork on the money path, and the owner
reframed the question in a way that improved the answer; see below).

**Verdict.** The server-wins override survives, but it may only decide which subtask the resume card
shows **before the card first renders `ready`**. Once the card is on screen with a resolved identity,
that identity is **fixed for the remainder of the popup session** — no enrichment re-render may change
the card's subtask, its pre-fill, or its write target. Across sessions the override remains free to
correct a stale local record, which is the whole reason it exists.

**Situation.** The card answers one question — *what did you last log against?* — and two sources
disagree about the answer. The local record (`local:lastLoggedTicket`) knows only what **this
extension** posted. Jira's own worklogs know what you logged **anywhere**: the Jira web UI, a phone,
another browser profile. The local record is therefore blind to worklogs made outside the extension,
and D-7.3-2 added the override to reconcile that staleness.

Nothing is wrong with the correction itself. The defect is **timing**: storage resolves in single-digit
milliseconds, the network in hundreds. So the card paints with the stored answer, the user starts
typing, and the corrected answer lands underneath them. `useResumeTicket.ts:166-178` returned a new
`key`, and `ResumeCard.tsx:112-117` re-seeded the input on any identity change — its comment claimed it
"never re-seeds on an enrichment re-render", which held only for the *same*-subtask case. The override
is precisely the case that changes identity, so the guard was scoped to the wrong branch.

**In simple terms.** Both keys here are **subtasks** — this product posts worklogs at subtask level
(confirmed at `useResumeTicket.ts:46`, which compares `issue.key` against the configured time-off
*subtask* key). The reviewer's probe named them `PROJ-1`/`PROJ-9`, which made them look like top-level
projects; they are not.

So: you open the popup, the card offers subtask **MBS-135**, you type `3` meaning three hours on
MBS-135. A few hundred milliseconds later the week query answers, and the override notices a fresher
worklog on subtask **MBS-142** — picked from anywhere in the week, with no parent affinity, so it may
sit under an entirely different parent epic. The card silently re-seeds to MBS-142 with *its* last
duration, `2`. You press Enter. Jira receives **2 hours against MBS-142**. You intended three against
MBS-135. Nothing warned you, and this is the product's primary affordance. Because Epic 5 rolls
approvals up per epic, the misattributed subtask also lands those hours under the wrong epic on a
manager's approval matrix.

**Options considered.** (a) *Freeze at first paint* — chosen. (b) *Swap only while the input is
pristine* — freeze on first keystroke or quick-post click. Better than the status quo, but leaves a
window where the subtask changes under someone who is about to press Enter on the pre-filled value
without typing anything; the pre-fill is a fully valid input, so "hasn't typed" does not mean "isn't
about to submit". (c) *Drop the override entirely* — safest and simplest, and genuinely on the table:
the owner was asked directly whether time is ever logged outside the extension, because if it never is,
the local record is never stale and the override is pure risk for zero benefit. The owner confirmed
outside logging **does** happen sometimes, which is exactly what the override is for — so removing it
would trade a real correctness win for a timing bug that has a cheaper fix. (d) *Swap but preserve the
typed value and signal the change* — still moves the write target under the user and relies on them
noticing a change they did not ask for.

**Why this wins.** It keeps the correction where it is safe (choosing what to show) and forbids it
where it is dangerous (changing what is about to be written). The cost is close to zero in practice:
the week query shares its `['week-worklogs', weekOf]` key with Story 7.2's `useTodayTotal`, so on a
warm open it is frequently already in cache and the override still wins **before** first paint. The
accepted downside, stated plainly: on a cold open where the network is slow, a worklog you made in
Jira web will not be reflected until your *next* popup open. Stale for one session, never wrong.

**The owner's reframing, which is why this entry exists.** The question was first put as a straight
three-way choice between freezing, pristine-only swapping, and signalling. The owner did not pick from
the menu — they asked *why the server suggests a different ID at all*, and *whether the card should
simply always be the same ID*. That reframing is what surfaced option (c) and forced the override to
justify itself on evidence rather than be tuned by default. The resulting rule — **stable within a
session, free to correct between sessions** — is a cleaner statement of the intent than any of the
original options, and it is the rule the implementation must encode.

**Consequences.** `ResumeCard`'s seed effect must not key off identity changes alone; identity must be
latched once `status` first becomes `ready` (a ref, in the same spirit as the existing focus latch) and
the latched value used for both the pre-fill and the write target. A test must pin the exact reproduced
hazard — type a value, land an enrichment swap, submit, and assert the write goes to the **original**
subtask with the **typed** amount. That test must be proven to go red without the fix. Story 7.9's
banners and any future re-render source inherit this invariant: **nothing may change the resume card's
write target while it is on screen.**

**How we'd know it was wrong.** Users reporting hours appearing against a subtask they did not choose,
or a manager's matrix showing time under an unexpected epic. Conversely, if users start reporting that
worklogs made in Jira web "never show up" in the card, the freeze is too aggressive and the pristine
window (option b) becomes the compromise.

### D-7.3-10 — The cold-start skeleton stays, but is time-bounded
**Owner decision.**

**Verdict.** The no-stored-record branch of `useResumeTicket` keeps returning `'loading'` (rendering a
skeleton) while the week query is in flight, but that state is **bounded**: if the query has not settled
within a short named budget, the hook falls through to `'none'` and the card slot collapses per AC5.

**Situation.** The developer fixed a genuine pop-in — the branch used to report `'none'` immediately,
rendering nothing, then flip to `'ready'` and shove the card in once data landed. The fix made it wait.
But *every existing user* hits this branch on their first open after rollout, because the
`local:lastLoggedTicket` seam is new and nobody has a record yet. The reviewer flagged this as an NFR1
(400 ms popup TTI) regression on the primary affordance.

**In simple terms.** Neither option actually gets a focusable input on screen any sooner — in the
`'none'` branch there is no card at all, so there is no input to focus either. The real choice is
between showing a placeholder in the card's shape while the answer is fetched, or showing empty space
that later jumps as a card drops in. Meanwhile Story 7.2's chrome header still paints instantly in both
cases, so the popup as a whole is never blocked. The only new risk the skeleton introduces is an
*unbounded* one: on a stalled or retrying query, the slot could show a shimmer forever.

**Options considered.** (a) *Bounded skeleton* — chosen. (b) *Unbounded skeleton* — the developer's fix
as built; rejected only for the hang case. (c) *Revert to no-card-then-pop-in* — reintroduces the exact
defect the developer correctly identified and fixed.

**Why this wins.** It keeps the honest loading shape and the absence of a layout jump, and removes the
one failure mode the skeleton added. The accepted cost is a magic number.

**Consequences.** The budget is a **named exported constant**, not an inline literal, set at **2000 ms**
and pinned by a fake-timer test asserting the fall-through to `'none'`. It applies **only** to the
no-stored-record branch — the common path (a stored record exists) resolves from storage alone and must
never be delayed by it. This state is transitional and self-heals the first time a user logs anything.

**How we'd know it was wrong.** Reports of the resume slot shimmering and then emptying on a normal
connection would mean 2000 ms is too tight.

### D-7.3-11 — The decision log is the canonical `D-7.3-*` numbering
**Orchestrator decision** (routine — a documentation defect, no behaviour attached).

**Verdict.** This file is authoritative for `D-7.3-*` identifiers. The story file and the code comments
in `ResumeCard.tsx` / `useResumeTicket.ts` are reconciled **to it**, not the other way round.

**Situation.** The reviewer found the numbering has diverged: the story file and this log disagree from
`-3` onward, `ResumeCard.tsx` cites `D-7.3-4` for two different decisions 104 lines apart, and
`D-7.3-7` / `D-7.3-8` are cited in code but defined in neither document. A code comment pointing at a
decision ID that does not exist is worse than no comment — it sends the next reader looking for a
rationale they will never find, and it makes this log look unreliable when it is the audit trail.

**Why it matters enough to fix now.** Six more stories in this epic will cite these IDs. Divergence
compounds silently and is far cheaper to correct while the story is still open.

**Consequences.** The finisher audits every `D-7.3-*` citation in the story file and in source comments,
repoints each to the correct entry here, and for any citation with no matching entry either repoints it
or deletes the reference. Note the authoritative meanings that were being misquoted: **D-7.3-3** is the
−10 px offset living on the scroll container, and **D-7.3-5** is the owner's accepted cold-start
limitation. No behaviour changes.

### D-7.3-12 through D-7.3-16 — folding the "Spec ambiguities resolved in 7.3" bullets and the PTO-exclusion rule into numbered entries
**Finisher, per D-7.3-11's consequence** ("preferably fold the log's unnumbered 'Spec ambiguities'
bullets into numbered entries so the log becomes the superset, then renumber the story file's citations
to match"). These five decisions already existed as prose — four as unnumbered bullets under "Spec
ambiguities resolved in 7.3" below D-7.3-5, one (PTO exclusion) only in the story file's own numbering,
nowhere in this log. Numbered here, continuing after D-7.3-11, so every `D-7.3-*` citation in code and
the story file resolves to exactly one entry. No behaviour changed by this entry — documentation only.

### D-7.3-12 — Time off never becomes the resume ticket

**Verdict.** `PtoQuickAction` writes no `last-logged` record, and `useResumeTicket`'s week-worklog
enrichment excludes the configured PTO subtask (`ptoSubtaskKeyItem`, `lib/storage/settings.ts`). Time
off can never become the resume card's ticket.

**Why.** If a time-off post stamped the last-logged record, the popup's primary affordance would open
pre-loaded with "log more time off" — wrong on its own terms, and directly at odds with 7.6's
day-status vocabulary where time off is a *settled* state that "stops asking" (EXPERIENCE.md line 187).
The catch-all project itself is **not** filtered — Admin/Meetings work under the catch-all is
legitimately resumable; only the configured PTO subtask is excluded.

**Consequences.** Pinned by a source-level guard (`PtoQuickAction.test.tsx`) proving the component never
imports `setLastLoggedTicket`, and by `useResumeTicket.test.ts` proving the PTO key is excluded from
both the plain enrichment scan and the server-wins override.

### D-7.3-13 — `+0.5`/`+1`/`+2` post that amount; they do not increment the input

**Verdict.** The quick-post buttons log exactly the labelled amount immediately, and never mutate the
hour input's value.

**Why.** `epics.md` AC3 ("post immediately without a confirmation step") is genuinely ambiguous — a
developer could reasonably build either a stepper (buttons increment the input; Enter posts the running
total) or three independent one-tap log actions. Settled by `EXPERIENCE.md` line 130: *"`+0.5 / +1 / +2`
**write immediately** without a confirm step."* They read as "add to my day," not "add to this field."

**Consequences.** Pinned by `ResumeCard.test.tsx` — each button posts the exact labelled seconds and the
input's value is unchanged before and after.

### D-7.3-14 — `border-border`, not the spec's un-tokenised `#DEDCE9`

**Verdict.** The resume card's border uses the `border-border` token (`#E4E3EC`), not `DESIGN.md`'s
literal `components.resume-card.border: 1px solid #DEDCE9`.

**Why.** `#DEDCE9` is a raw hex with no matching design token. Introducing a fourth border hex for one
component breaks the token discipline D-7.2-3 established, for a difference imperceptible under
`shadow-lift`. Recorded as a deliberate, minor deviation for the DESIGN.md owner to fold back in.

**Consequences.** No change to `styles/globals.css` — no new token, no new hex, no new `@utility`.

### D-7.3-15 — `ring-focus` via `focus-within:`, not statically

**Verdict.** The hour input's focus ring is applied as `focus-within:ring-focus` on the input wrapper,
not as a static class.

**Why.** AC3 says the input "carries a 1.5 px primary border plus `ring-focus`". Applied statically, the
ring would keep glowing after focus moved elsewhere (e.g. 7.4's `/`-to-search), lying to sighted users
about where focus actually is. `focus-within:` is on exactly when AC3's "When the popup opens" condition
holds, and stays honest afterwards. The 1.5 px primary border stays unconditional, per DESIGN.md's
`hour-input` component.

**Consequences.** Pinned by `ResumeCard.test.tsx`'s class-presence guard (Finding 6 fix).

### D-7.3-16 — Unparseable input is amber, not red

**Verdict.** Unparseable or over-limit hour input renders amber (`text-amber-ink`); red is reserved for
a write Jira actually refused.

**Why.** Standing Epic 7 constraint: red only for a write Jira actually refused. `QuickLogForm` currently
uses `text-state-danger` for parse errors — pre-existing Epic 2 code, out of scope for this story to
change — so the two surfaces intentionally differ until a future story reconciles them.

**Consequences.** Pinned by `ResumeCard.test.tsx` (unparseable/over-limit render amber and do not post;
a refused write renders red).

### D-7.3-6 — Cadence unchanged for the remaining nine stories
**Owner decision.** Continue running 7.3 → 7.11 continuously: a report after each story lands, with
a pause only for a genuinely load-bearing decision. Confirms SD-3 rather than replacing it. The two
heaviest upcoming stories were offered as explicit checkpoints and declined — so 7.6 (the shared
day-status component that 7.7 and 7.8 both consume) and 7.10 (which carries the "Re-authenticate"
scope trap from SD-1) will be flagged in-flight if they fork, not stopped for pre-emptively.

---

## Story 7.4 — Search as the Browse Mechanism

*Story file written and `ready-for-dev` (`7-4-search-as-the-browse-mechanism.md`, baseline commit
`dfccf5a`). The creator recorded its own `D-7.4-1 … D-7.4-10` inside the story file; per D-7.3-11
those are folded into this log when the story finishes, and **this file stays canonical**. D-7.4-11
through D-7.4-16 below are the orchestrator/owner rulings made before development began and during
review, numbered from `D-7.4-11` so they could not collide with the creator's original `D-7.4-1…10`.
Per the finisher pass (D-7.3-11's fold-in pattern), the creator's `D-7.4-1…10` are folded in below as
`D-7.4-17…26` — continuing after `D-7.4-16` rather than reusing `1…10`, which stayed reserved for the
duration of the story to avoid exactly the numbering collision `D-7.3-11` had to clean up. Every
`D-7.4-1…10` citation in the story file and in source comments has been repointed to its `D-7.4-17…26`
equivalent; none were left dangling.*

### D-7.4-11 — Search shows every issue type, allows logging directly to a non-subtask, and warns
**Owner decision** (asked — this is the money path: it decides whether hours can land somewhere the
approval matrix will never look).

**Verdict.** Search applies **no issue-type filter**. Tasks, Stories and Epics appear alongside
subtasks. Selecting a non-subtask result and pressing `⏎` **logs directly to it in one step**, exactly
as AC5 specifies for any result — but the result row and the write path both carry a visible,
plain-language warning that hours logged there may not appear in manager approval.

**Situation.** This product posts worklogs at **subtask** level everywhere else. `lib/hierarchy.ts:45`
filters `issue.fields.issuetype?.subtask === true`, and only subtasks are grouped under a parent
(`hierarchy.ts:161-179`, which even logs `hierarchy.fetch.subtask-missing-parent` when a subtask has no
parent). Epic 5's manager matrix is built per **epic** column (`lib/manager-matrix.ts` keys everything
off `epicKey`). The JQL behind search, however, returns whatever matches — including issue types that
never enter that subtask→parent→epic walk. So an hour logged straight onto a Story is a real worklog in
Jira, correctly recorded against that issue, that may simply never appear in the grid a manager
approves from.

**In simple terms.** Priya searches "payment gateway" and picks the Story `GAPI-330` rather than one of
its subtasks. She logs 3 hours. In Jira those 3 hours exist and are hers. But when Marco opens the
approval matrix on Friday, his grid is assembled by walking subtasks up to their parent epic — and
`GAPI-330` was never a subtask, so it has no parent to roll into. Her 3 hours are invisible to him. She
believes she logged them; he believes she is 3 hours short. Neither is lying, and nothing in the
product tells either of them what happened.

**Options considered.** (a) *Hard-filter to subtasks only* — every result would be loggable and would
roll up correctly, but it makes the story's own premise ("one search control that reaches every ticket
in Jira") false, and re-creates the dead end the browse tree already had: a Story with no subtask yet
becomes unreachable. (b) *Show all; route non-subtasks through the existing `lib/create-subtask.ts`
flow* — the orchestrator's recommendation. It preserves both reach and roll-up correctness, at the cost
of a second step for non-subtask results. **Rejected on the owner's instruction.** (c) *Show all, log
directly, warn* — chosen by the owner.

**Why this one wins, and what it costs.** It honours AC5's "logs the selected result without a second
step" literally and uniformly — every result behaves the same way, and the user is never blocked from
logging against something they can see. The accepted downside is stated plainly and must not be
softened: **hours can be written where the approval matrix will not find them**, and the only defence is
a warning the user is free to ignore. This is a deliberate trade of guaranteed correctness for reach and
uniformity. Because the sole mitigation is the warning, the warning is not decoration — it is the entire
safety mechanism, and it must be treated as a first-class requirement.

**Consequences.** The warning must satisfy the epic's own a11y rule: colour is never the signal — it
pairs a `lucide-react` icon (`aria-hidden="true"`) with a **visible text label** that survives deleting
both the icon and the colour. It renders **amber, never red** (red is reserved for a write Jira actually
refused). It must state the consequence in plain language rather than naming an issue type — something a
user who has never heard the word "subtask" can act on. It must appear **at the point of the write**, not
only as a row pill, so a keyboard user pressing `⏎` on a preselected row cannot miss it. A test must pin
that a non-subtask result renders the warning and that a subtask result does not. `hierarchy.ts` and
`manager-matrix.ts` are **not** changed by this story — this is a search-surface decision only.

**How we'd know it was wrong.** A worker and their manager disagreeing about the same week's hours, or
support reports of "I logged it and it's not in the matrix". That is the signal to revisit option (b) —
which stays available and cheap, because `lib/create-subtask.ts` already exists from Story 2.3.

### D-7.4-12 — Results are a listbox; the mockup's per-row inputs are dropped
**Owner decision** (asked because it removes an affordance the mockup draws).

**Verdict.** The results container is `combobox` + `listbox` + `option`, per AC5's "semantic list" and
its `aria-activedescendant` requirement. The hour input moves **up into a results header strip**; the
per-row hour input and `+` buttons drawn in the round-2 mockup are **not built**. A row is actioned by
clicking it or pressing `⏎` on the active option.

**Situation.** `aria-activedescendant` roving selection forces the combobox/listbox/option pattern, and
`role="option"` **may not contain interactive descendants** — a focusable input inside an option is
invalid ARIA and breaks screen-reader navigation. The mockup draws exactly that. The only way to keep
per-row controls is `role="grid"`, which is valid but contradicts AC5's wording and is materially harder
to get right for keyboard and screen-reader users.

**Why this wins.** The standing Epic 7 rule already settles it — `DESIGN.md` / `EXPERIENCE.md` and the
ACs win over the reference mockups on conflict — and this is the simpler, more accessible build. The
accepted cost: logging a non-preselected result takes an extra keystroke to move the selection first.

**Consequences.** Exactly one `aria-activedescendant` tracks the active option; options are not
focusable and contain no interactive descendants. *Action for the DESIGN.md owner:* the round-2 mockup's
result rows should be redrawn to match, alongside the still-outstanding `/70` → `/85` chrome-eyebrow fix
from Story 7.2.

### D-7.4-13 — The JQL is widened to match the promise, rather than the copy narrowed to match the JQL
**Owner decision** (asked — the orchestrator recommended the opposite).

**Verdict.** The idle field keeps its spec'd copy, "Search any ticket — key or text", and the **query is
widened to make that true**: text matching moves from `summary ~` to Jira's `text ~` operator (which
covers summary and description), and the `updated >= -28d` recency clause is **removed**.

**Situation.** The shipped `lib/ticket-search.ts` runs `summary ~ "q" AND statusCategory != Done AND
updated >= -28d`. So a ticket untouched for 29 days, or one whose match lives only in its description,
simply cannot be found — while the field above it promises "any ticket". The orchestrator proposed
rewording the placeholder to describe the real reach, on latency and rate-limit grounds. The owner chose
to fix the product instead of the sentence.

**Why this wins.** The alternative asks the user to absorb a limitation the tool could remove, and this
epic's whole premise is that the tool should be honest *and* useful rather than merely honest about being
less useful. The accepted cost is real: a broader query is slower and touches more of Jira's index on a
control that fires as the user types.

**Consequences and the required mitigations** — these are not optional, because they are what makes the
widening affordable:
- The single 250 ms debounce and `useQuery`-keyed cancellation the story already mandates stay, and are
  now load-bearing rather than nice-to-have.
- `statusCategory != Done` is **also dropped** — a forced consequence, since a ticket closed yesterday is
  still a ticket you may need to log against, and leaving the clause in would keep "any ticket" false.
  Mitigated by **ranking**: open tickets rank above done ones, and recently-updated above stale, so
  removing the filters changes what is *reachable* without changing what surfaces first.
- A 429 renders the existing neutral `rate-limited` state and is **never auto-retried**.
- If measured latency makes this untenable in practice, the fallback is to reinstate the recency clause
  *and* reword the copy — but that reopens this decision rather than being done silently.

**How we'd know it was wrong.** Search latency that makes typing feel laggy, or 429s appearing in normal
single-user use. Either would mean the index cost is real and the copy-narrowing option should return.

### D-7.4-14 — Result truncation is stated, never silent
**Orchestrator decision** (routine — a standing quality rule, and a forced consequence of D-7.4-13).

**Verdict.** Search keeps a bounded `maxResults`, but when the result set is truncated the UI **says so**
in words rather than silently showing the first N.

Widening the query (D-7.4-13) makes truncation more likely, not less, so a silent cap would now actively
mislead: a user searching an old ticket could see twenty unrelated rows and conclude their ticket does not
exist. Bounded fetch, stated truncation, no pagination in this story.

**Consequences.** The truncation line is plain text, not a pill or an icon-only hint. No auto-paging and
no "load more" — if that is wanted it belongs in its own story. A test pins that the line appears when the
result set is capped and is absent when it is not.

### D-7.4-15 — The widened JQL is scoped to the new search field; `TicketPicker` keeps the old query
**Orchestrator decision** (routine — this restores D-7.4-13 to the scope the owner actually decided,
rather than extending it to a surface nobody asked about. Flagged here so the owner can overturn it).

**Verdict.** `lib/ticket-search.ts` must take the widened behaviour as a **parameter**, not as a change
to its default. The new popup `SearchPanel` opts in to `text ~`, no recency clause and no
`statusCategory` clause. **`TicketPicker` keeps the query it had at `dfccf5a`, byte-for-byte.**

**Situation.** The reviewer found the developer widened the shared `searchTickets` function itself, so
the new JQL silently reached **`TicketPicker`** — which is used by the popup *and* by `WeeklyGrid` on
the week surface. Worse, D-7.4-13's mitigation did not follow it: the ranking lives only in the new
`useTicketSearch`, while `TicketPicker.tsx:214-218` maps results in raw Jira order. So the week grid's
picker inherited every downside of the widening (done tickets, stale tickets, a broader index hit) and
none of the compensating ranking.

The developer's "purely additive" claim was true of the **field projection** and false of the **JQL**.
Neither test suite could catch it: `TicketPicker.test.tsx:23` mocks `@/lib/ticket-search` wholesale and
`WeeklyGrid.test.tsx:11` mocks `TicketPicker` away, and neither asserts anything about the query. This
is the **third** time this epic that a change leaked through a shared seam behind a mock — see Story
7.2's `TicketPicker` scrolling regression and the same pattern flagged in 7.3.

**In simple terms.** The owner agreed to widen *one* search box — the popup's, whose placeholder
promises "Search any ticket". A different, older picker on the week screen quietly started running the
same broader query, but sorts its results in whatever order Jira returns them. So a week-grid user who
previously saw a short list of recent open tickets now sees closed and long-dormant ones mixed in, in no
particular order, with no ranking to push the likely one to the top. Nobody asked for that, and no test
would have shown it.

**Options considered.** (a) *Scope the widening to the new search* — chosen. (b) *Keep it global and
port the ranking into `TicketPicker` too* — defensible, and it would make both surfaces consistent, but
it changes a shipped week-surface behaviour that this story was never scoped to touch, on the last day of
a story that is already at review. (c) *Keep it global and accept raw order in `TicketPicker`* — this is
simply the bug as found; rejected.

**Why this wins.** D-7.4-13 was a decision about the popup search field's promise; applying it elsewhere
is scope the owner did not grant. Restricting it is also the lowest-risk correction — it returns an
untouched surface to a known-good state rather than asking a finisher to design ranking for a component
outside the story. The accepted cost is a temporary inconsistency: two search paths with different reach
until someone decides otherwise.

**Consequences.** `searchTickets` gains an explicit opt-in parameter; the widened branch is **not** the
default, so any future caller gets the conservative query unless it asks. A test must assert the **exact
JQL** for both branches — the absence of any JQL assertion is what let this through. `TicketPicker`'s
query must be diffed against `dfccf5a` and proven identical. Option (b) remains available as a
follow-up if the owner wants both surfaces to reach equally.

**How we'd know it was wrong.** Week-grid users reporting they cannot find a ticket the popup search
finds. That inconsistency is the accepted cost, and it is the signal to take option (b).

### D-7.4-16 — The non-subtask warning must be unmissable, not merely present
**Orchestrator decision** (routine — a forced consequence of D-7.4-11's own wording, which already
requires the warning "at the point of the write, not only as a row pill").

**Verdict.** Two fixes, both required. The active option must be scrolled into view as the selection
moves, **and** the warning must render in the always-visible write area (the results header strip that
D-7.4-12 created), not only on the result row.

**Situation.** The reviewer found no `scrollIntoView` on the active option. `↑`/`↓` move `activeIndex`
only, both handlers `preventDefault()`, and focus never leaves the input — so the browser never scrolls
for us. With up to 20 results inside the popup's single scroll region, the active row can sit entirely
outside the viewport.

**In simple terms.** You arrow down eight times and press Enter. The row you just logged against has been
off-screen for the last four presses — and so was the amber warning telling you these hours may never
reach your manager's approval matrix. You have written to a ticket you cannot see, having been warned in
a place you could not look. D-7.4-11 accepted a real correctness risk on the explicit basis that the
warning is "the entire safety mechanism"; a safety mechanism that can scroll out of view is not one.

**Why this wins.** It is what D-7.4-11 already said, made literal. Neither fix trades anything away:
scrolling the active option into view is standard listbox behaviour users expect, and duplicating the
warning into the header strip costs a few lines.

**Consequences.** Scroll the active option into view on every selection change, including the initial
preselection, using nearest-edge scrolling so the list does not jump. Because the popup has **exactly
one scroll region** (7.2 AC), verify the scrolling targets that container and does not introduce a nested
one. A test must assert the warning is reachable **without scrolling** when a non-subtask option is
active — pinning the guarantee, not the pixel.

**How we'd know it was wrong.** Any report of hours logged against a ticket the user says they never
selected would mean the selection is still not visible enough.

### D-7.4-17 through D-7.4-26 — folding the story creator's `D-7.4-1…10` into numbered canonical entries
**Finisher, per D-7.3-11's fold-in pattern** ("the finisher audits every `D-7.x-*` citation in the
story file and in source comments, repoints each to the correct entry here"). The story creator wrote
ten fully-formed decisions directly into `7-4-search-as-the-browse-mechanism.md` as
`### ORCHESTRATOR DECISION D-7.4-1` through `D-7.4-10`, before the owner's later review-time rulings
(`D-7.4-11…16`) existed. Continuing the numbering at `D-7.4-17` (rather than reusing `1…10`) avoids
colliding with `11…16`. No behaviour changes — documentation only. The full original reasoning
(situation / options considered / why it wins) is preserved verbatim below; only the header IDs and
in-text self-citations were renumbered.

### D-7.4-17 — `/` reaches search even when the hour input has focus

**The collision.** D-7.3-4 focuses the resume card's hour input on popup open via a `useRef` focus latch
(`ResumeCard.tsx` lines 152–160). AC2 says `/` focuses search "when focus is not already in a text input".
The hour input **is** a text input. Read literally, `/` is inert in the popup's single most common opening
state — and `EXPERIENCE.md`'s own Flow 2 opens with *"She opens the popup and presses `/`"* (line 293).
The spec contradicts itself if "text input" is read as `tagName === 'INPUT'`.

**Verdict.** The exclusion is narrowed to **text inputs where `/` is a legitimate character**. The resume
card's hour input accepts only hour syntax (`2.5h`, `2h 30m`, `2:30` — `lib/hours.ts`); `/` is never valid
there, so it does not consume the shortcut.

**Implementation, concretely.** The document-level `keydown` handler ignores `/` when
`document.activeElement` is a text-entry element **unless** that element carries
`data-slash-passthrough="true"`. `ResumeCard`'s hour input gains that one attribute. The search field
itself is of course excluded (typing `/` into a query must insert a slash), as is any
`<textarea>`/`contenteditable` and the subtask-name input in `TicketPicker`. (Finisher note: `SearchPanel`'s
own header hour input gained the same attribute at review time — Finding 7.)

**The second half of the collision — the reverse steal.** On a cold open the resume card may still be
`'loading'` (up to `COLD_START_SKELETON_BUDGET_MS` = 2000 ms, D-7.3-10). If the user presses `/` during
that window and starts typing, the card resolving to `'ready'` will fire its focus latch and **yank focus
out of the search field mid-query**. `ResumeCard`'s focus effect must therefore bail when focus has
already been claimed: guard it with `if (document.activeElement && document.activeElement !== document.body) return;`
*before* setting `focusedRef.current`. This is a one-line, dependency-free guard that also protects against
any future focus-claiming surface (7.9's banners). **Pin it with a test.** (Finisher note: the review found
`SearchPanel`'s own new autofocus effect needed the symmetric guard too — Finding 3.)

**Why not the alternatives.** (a) *Take AC2 literally* — ships a dead primary shortcut and contradicts
Flow 2. (b) *Make `/` global with no exclusion at all* — breaks typing a slash into the query itself and
into `TicketPicker`'s create-subtask field, which is a real regression on shipped behaviour.

**D-7.3-9 is not violated.** Adding a `data-*` attribute and letting focus leave the card changes nothing
about the card's subtask, pre-fill, or write target. D-7.3-15 already anticipated this exact case: the
`focus-within:ring-focus` correctly stops glowing when `/` moves focus away, which is why it was applied
via `focus-within:` rather than statically.

### D-7.4-18 — the lists are hidden, not unmounted

**The hazard, concretely.** `TodayView` owns `loggedEntries` in `useState` (`TodayView.tsx` line 48) and
lifts its total to the shell via `onTotalChange` (lines 155–157). If AC3's "replaced" is implemented as
`{searchActive ? <SearchResults/> : <TodayView/>}`, then typing one character **unmounts** `TodayView`:
every worklog logged this session disappears from "Logged today", `onTotalChange` is never called again
with the old value, and — worse — on remount the fresh `useState([])` fires `onTotalChange(0)`, silently
dropping those seconds out of the chrome header's figure. Search would corrupt the running total.

**Verdict.** `TodayView` stays mounted for the whole popup session. It is wrapped in a container that
carries the **HTML `hidden` attribute** while a search is active.

- Use the **`hidden` attribute**, not a Tailwind `hidden` class. The UA stylesheet gives it
  `display: none`, so it leaves the accessibility tree and satisfies "exactly one list on screen at a
  time" — and, unlike a Tailwind class, **jsdom honours it**, so `toBeVisible()` and Testing Library's
  default role queries can actually assert the AC. A class-only implementation would be untestable in
  this repo (there is no paint engine and no Tailwind at test time).
- The trigger is `query.trim().length > 0`, evaluated on the **raw** query, not the debounced one — so the
  lists vanish on the first keystroke and do not flicker back while a request is in flight
  (`EXPERIENCE.md` line 188: "Search focused with a query → lists replaced").
- The resume card is **not** hidden. `EXPERIENCE.md`'s IA (lines 51–56) places search *below* the resume
  card, and only *Logged today* and *Recently worked* are named as replaced. The card is the primary
  affordance and stays put — which also keeps D-7.3-9's "frozen while on screen" invariant trivially true.

**Test teeth required (this is the finding a reviewer will hunt for):** log an entry, type a query, press
`Esc`, and assert the entry is **still** in "Logged today" **and** the chrome figure is unchanged. Prove it
goes red against a conditional-render implementation.

*Note for 7.5:* 7.5 rebuilds "Logged today" and may lift `loggedEntries` into the shell alongside
`ptoEntries` / `resumeEntries` / `searchEntries`. If it does, the `hidden` wrapper stays correct and this
hazard disappears. 7.4 does **not** do that lift — it is 7.5's diff.

### D-7.4-19 — the ARIA shape, and where the hour input lives

**This is the story's biggest accessibility risk.**

AC5 mandates `aria-activedescendant`. That attribute is only valid on an element with a **composite
widget** role, and the element it names must be an owned descendant. So the only conforming construction is
the ARIA 1.2 **combobox with listbox popup**:

```
<input role="combobox" aria-expanded={hasResults} aria-controls="search-results"
       aria-activedescendant={activeId} aria-autocomplete="list" aria-keyshortcuts="/" />
<ul id="search-results" role="listbox" aria-label="Search results" aria-busy={inFlight}>
  <li id="search-result-0" role="option" aria-selected={i === activeIndex}> … </li>
</ul>
```

DOM focus **never leaves the search input** while results are on screen. `↑`/`↓` move `activeIndex` only.

**The trap.** `role="option"` **must not contain interactive descendants.** The round-2 mockup draws a
real hour input and a `+` button inside the result rows (lines 660–690) — that markup is ARIA-invalid and
will read as a broken listbox to a screen reader. `imports/*.dc.html` is reference-only and loses to the
spines, and the spines' own Accessibility Floor (lines 244–269) demands full keyboard operation with
correct semantics.

**Verdict.**

1. **Result rows carry zero interactive descendants.** Each `<li role="option">` contains only text and
   `aria-hidden` decoration. Its accessible name is composed as
   `"{KEY}. {summary}. {assigned to you | assignee name | Unassigned}"` — so the pill's meaning survives
   with colour and icon deleted (the epic's practical AA test).
2. **The hour input is a single, real `<input>` rendered once, in the results header strip**, directly
   above the list — the strip the mockup already uses for `Results · 3 · ↑↓ to move · ⏎ to log`. It is
   labelled `Hours for {activeKey}` (updating as the selection moves), pre-filled `1`, styled per
   `DESIGN.md`'s `hour-input` (1.5 px primary border, `rounded-md`, `focus-within:ring-focus`), with the
   same decorative `CornerDownLeft` badge the resume card uses. It is reachable by `Tab` from the search
   field.
3. **`⏎` in the search field logs the active result immediately**, using the hour input's current value.
   No second step, exactly as AC5 requires. `⏎` in the hour input does the same thing.
4. **Clicking a row** sets it active **and** logs it with the current hour value (the row is the affordance;
   there is no separate `+` button, because a button inside an option is the thing we just ruled out).
5. **A `role="status" aria-live="polite"` region** announces the result count (`"3 results"` / `"No
   results"`). Cheap, and it is what makes an `aria-activedescendant` list comprehensible when it appears.
   (Finisher note: this region's coverage was extended to the `in-flight` and `failed` states at review
   time — Finding 4.)

**Recorded deviation from the mockup, resolved as D-7.4-12.** The mockup's active row shows an inline
`1.0h` box and non-active rows show a `+` button. This story renders neither *inside* the rows — see
D-7.4-12 for the owner's ruling and its reasoning.

### D-7.4-20 — search returns non-subtask issues; they are not filtered out

**The concern.** This product posts worklogs at **subtask** level (D-7.3-9 states it explicitly; the
manager matrix in Epic 5 rolls subtask → parent → epic). `lib/ticket-search.ts`'s JQL
(`summary ~ "…" AND statusCategory != Done AND updated >= -28d`, or `key = "X"`) returns **any** issue
type — Epics, Stories, Tasks and subtasks alike. So `⏎` on a search result can post a worklog directly to
a Task.

**Verdict (creator's original, before the owner ruled on the safety mechanism as D-7.4-11): no hard
filter.** The story's premise is "one search control that reaches **every** ticket in Jira"; silently
dropping half of Jira's issues would make the field lie, and Jira accepts worklogs on non-subtasks
perfectly well. The projection **is** widened to include `issuetype` (free — see D-7.4-21) so the data
exists, and `isSubtask` is carried on the result model, but 7.4 adds **no** issue-type pill (it would
compete with the assignee pill, and the AC does not ask for one).

**Flagged, not hidden.** The consequence — a Task-level worklog rolls up differently on the manager matrix
than a subtask-level one — is a genuine product question. It was raised as an explicit escalation, and
the owner's ruling (allow, log directly, and warn) is recorded as **D-7.4-11** above — the canonical
verdict for this question.

### D-7.4-21 — reuse `JiraHierarchySearchSchema`; write no new schema

**Investigated before proposing anything new.** `lib/ticket-search.ts` already exists and is the only
ticket-search seam in the repo (its sole consumer is `TicketPicker.tsx` line 214). But it projects
`fields=key,summary` and parses with `JiraSearchSchema`, which is
`{ issues: [{ id, key, fields: { summary } }] }` — **no assignee, no issuetype**, so AC4 cannot be
satisfied from it as-is.

`lib/jira-types.ts` already declares exactly the shape needed: `JiraHierarchyIssueSchema` (lines 163–186)
extends `JiraIssueSchema` with optional `issuetype` (including `subtask: boolean`), `parent`, and
`assignee` (`accountId` + `displayName`), and `JiraHierarchySearchSchema` wraps it. **Reuse it.** No new
schema, no new type.

**Change to `lib/ticket-search.ts`:** widen `SEARCH_FIELDS` from `'key,summary'` to
`'key,summary,issuetype,assignee'`, parse with `JiraHierarchySearchSchema`, and return
`JiraHierarchyIssue[]`. (Finisher note: at review time this field list grew further, and the widened JQL
itself became an opt-in parameter rather than the module's default — see D-7.4-13 and D-7.4-15.)

**Shared-consumer check (the 7.2 Finding 2 lesson).** `TicketPicker` is used by **both** the popup and
`components/week/WeeklyGrid.tsx`, so this change reaches the week surface. It is **purely additive** — more
fields requested, all new ones optional, `fields.summary` still present, so `TicketPicker.tsx` line 218
(`i.fields.summary`) keeps compiling and behaving identically. Verify by running `WeeklyGrid`'s tests, and
say so in the Completion Notes. Do not touch `TicketPicker.tsx` otherwise; **do not** change its
`unbounded` prop or its default. (Finisher note: the field-projection widening held up under this check;
the JQL widening did not — see D-7.4-15's own account of how this check was structurally blind to it.)

**"Assigned to you" needs an accountId.** Use `hooks/useCurrentUser.ts` — `['current-user']`, 24 h
`staleTime`, already deduped with the manager surfaces. **Mount it inside the results component only**, so
it cannot fire on the popup's first-paint path (NFR1). It is a single `rest/api/3/myself` GET, cached for
a day, and it happens while the user is typing — not while the popup is painting.

### D-7.4-22 — one 250 ms debounce, `useQuery` not `useMutation`, no retry

`TicketPicker`'s existing search is the anti-pattern to avoid: **two** chained debounces (100 ms
`query → debouncedQuery` at line 210, then 300 ms before firing at line 235 = ~400 ms), fired through
`useMutation`, whose `onSuccess` writes into `useState`. `useMutation` has **no request identity and no
cancellation**, so a slow response to `"aba"` can land after a fast response to `"abacus"` and clobber the
newer results. That bug is real in the shipped picker; do not copy it.

**Verdict for 7.4:**

- **One** debounce, **250 ms**, `query → debouncedQuery`.
- `useQuery({ queryKey: ['ticket-search', debouncedQuery], … })`. Keying by query means a stale response
  can never overwrite a newer one, and re-typing a previous query is served from cache.
- `enabled: debouncedQuery.trim().length >= 2` — a one-character query is not worth a Jira round trip.
- `staleTime: 30_000`, `retry: false`, `refetchOnWindowFocus: false`.
- **Rate limiting.** `jiraGet` already maps HTTP 429 to `{ kind: 'rate-limited', retryAfterMs }`
  (`lib/jira-client.ts` lines 83–90). Render it as a neutral inline note ("Jira is rate-limiting search —
  try again in a moment"), **never red**, and **never auto-retry** into the limiter. `lib/scheduler.ts`
  (the token-bucket used by the manager fan-out) is **not** used here: this is one debounced request per
  typing burst, not a fan-out.
- **Query keys are namespaced away from everything else.** `['ticket-search', …]` must not collide with
  `['week-worklogs', …]`, `['hierarchy-tickets']`, `['catch-all', …]`, `['current-user']`. **Never**
  invalidate `['week-worklogs', …]` from this story — `useTodayTotal.ts` lines 13–31.

### D-7.4-23 — what "promoted to primary position" means (closes 7.3's AC5)

When `resume.status === 'none'`:

1. The search panel renders as the **first child of the scroll region**, in the slot the resume card would
   have occupied. When the card is present, search renders **below** it (`EXPERIENCE.md` IA lines 51–56).
2. The search field **takes the autofocus** the hour input would otherwise have had. There is no other
   focusable primary affordance, and the hot path must still start with a focused control. (Finisher note:
   this autofocus effect needed the same reverse focus-steal guard as D-7.4-17 — Finding 3.)
3. Because it is focused, its badge reads `esc` and it carries the 1.5 px primary border + `ring-focus`
   from `focus-within:` — this falls out of AC2's rule for free, with no special case.
4. **The −10 px baseline offset does not move to search.** `DESIGN.md` grants `offset: '-10px'` to
   `components.resume-card` alone (line 139), and the round-2 mockup sets `resumeOffset: "0px"` in every
   state without a card. So `App.tsx`'s existing boolean
   `breaksHeaderBaseline = connected && resume.status !== 'none'` is **left exactly as it is** — one line,
   untouched, still ready for 7.9 to append `&& !offlineBanner && !writeErrorBanner`.
5. **No empty resume card renders and no dead space is reserved** — that half is already shipped and pinned
   by `App.test.tsx` (7.3 Finding 3); 7.4 must not regress it. The promoted search field is the *content*
   of that slot, not a re-inflation of the card.

### D-7.4-24 — `Esc` must `preventDefault()`, or Chrome closes the popup

In a Chromium extension popup, an unhandled `Escape` **closes the popup window**. AC5 says `Esc` clears the
query and restores the lists; if the handler does not call `preventDefault()` **and** `stopPropagation()`,
the user's popup vanishes instead. Semantics:

| State when `Esc` is pressed | Behaviour |
|---|---|
| Query non-empty | Clear the query, restore the lists, **keep focus in the field** (badge stays `esc`). `preventDefault()`. |
| Query empty, field focused | Blur the field (badge returns to `/`). `preventDefault()`. |
| Field not focused | Do nothing — let the event through, so `Esc` still closes the popup as users expect. |

`TicketPicker.tsx` line 286 already handles `Escape` without `preventDefault` — that is pre-existing Epic 2
behaviour and is **out of scope** to change here (and 7.5 removes that component from the popup anyway).

### D-7.4-25 — this `LoaderCircle` is not the one Story 7.6 forbids

Recorded pre-emptively so a later agent does not "fix" a non-bug. `EXPERIENCE.md` line 206 states:
*"Neither `{icons.loading}` nor `{icons.restricted}` is a day status. `LoaderCircle` means the product is
still working."* Story 7.6 will forbid `LoaderCircle` **as a day status** in the five-state day vocabulary.
AC6 here uses it for **genuine in-flight work**, which is precisely the meaning `DESIGN.md` line 239
assigns it. **These are different contexts and there is no conflict.** Do not remove this usage when 7.6
lands; add a code comment saying so.

### D-7.4-26 — the seam Story 7.5 will call

Story 7.5's final "Recently worked" row reads `"N more assigned tickets · Search to find them →"` and must
**focus this search field**. So 7.4 publishes the seam rather than making 7.5 invent one:

`SearchPanel` accepts a `ref` (React 19 ref-as-prop — no `forwardRef`) and exposes, via
`useImperativeHandle`, a handle typed:

```ts
export type SearchPanelHandle = { focus: () => void };
```

`entrypoints/popup/App.tsx` holds `const searchPanelRef = useRef<SearchPanelHandle>(null)`. 7.5's handoff
row calls `searchPanelRef.current?.focus()`. The same handle is what the document-level `/` listener calls
internally, so there is exactly **one** focus path and 7.5 cannot drift from it. Export the type from
`SearchPanel.tsx` and name it in this story's File List so 7.5's author finds it.

### Review findings and their resolutions

The reviewer re-measured every gate independently and proved test teeth with five reverted mutations
(N1–N5). 0 Blockers, 3 Majors, 3 Minors, 4 Nits. All ten numbered findings were resolved — see the story
file's "Finding Resolutions" section (below its frozen "## Review Findings" record) for the full
FIX/DISMISS/DEFER rationale per finding. In summary:

- **Finding 1 (Major) → D-7.4-15.** `searchTickets` gained an explicit `widen` opt-in parameter;
  `TicketPicker`'s call site (unchanged) now gets the byte-identical `dfccf5a` query by default. Both
  branches gained exact-JQL-string assertions (`lib/ticket-search.test.ts`), plus a dedicated end-to-end
  test (`TicketPicker.search-jql.test.tsx`) that does not mock `lib/ticket-search` away.
- **Finding 2 (Major) → D-7.4-16.** The active option is now scrolled into view (`block: 'nearest'`) on
  every selection change, and the D-7.4-11 warning was duplicated into the always-visible results header
  strip (not only the row).
- **Finding 3 (Major).** `SearchPanel`'s autofocus effect gained the same reverse focus-steal guard
  `ResumeCard` already had (D-7.4-17), RED-proven by temporarily removing it.
- **Finding 4 (Minor).** The `role="status"` region now announces the `in-flight` and `failed` (rate-limited
  vs. generic) states, not only `results`/`empty`.
- **Finding 5 (Minor).** The `App.session-total.test.tsx` "D-7.3-9 via search" test was reframed — it no
  longer claims to pin the identity-latch invariant (structurally, a search-driven log never causes
  `useResumeTicket`'s data to change in this test or in production, so the latch never gets a chance to
  fire twice here); `ResumeCard.test.tsx`'s own RED-proven latch test is cited as the real pin.
- **Finding 6 (Minor).** The header hour input's `aria-describedby` now references the header-strip
  warning (Finding 2's fix) when the active result is a non-subtask.
- **Finding 7 (Nit).** `SearchPanel`'s own hour input gained `data-slash-passthrough="true"`.
- **Finding 8 (Nit).** `text-royal-purple` → `text-primary` (the established semantic token).
- **Finding 9 (Nit).** An emptied hour field now renders the same amber helper text as an unparseable one.
- **Finding 10 (Nit).** The ranking comparator guards against a `NaN` result when both compared issues lack
  `updated`; the truncation off-by-one (exactly `MAX_RESULTS` matches) was reviewed and left as documented,
  conservative-direction behaviour rather than fixed — see the story file's Finding Resolutions for why.
