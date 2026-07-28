---
baseline_commit: 2d1c30f
---

# Story 7.5: Logged Today, Recently Worked, and the 55-Ticket Handoff

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Priya scanning what I have already logged,
I want today's entries and a short list of what I actually touched,
So that I never scroll a 55-row tree to find a ticket.

---

## Context

This is the story that **finally deletes the 55-row browse tree from the popup**. Stories 7.2–7.4 built
everything needed to replace it: 7.2 gave the popup one job and one scroll region, 7.3 gave it a resume
card, 7.4 gave it search. `TicketPicker` — the 2-level tree — has been sitting in `TodayView` the whole
time as the last piece of the old information architecture. 7.5 removes it and puts a four-row
"Recently worked" list plus a handoff row to search in its place, and rebuilds "Logged today" to the
KKP list-row anatomy.

`EXPERIENCE.md` states the thesis directly (line 79):

> **The 55-ticket resolution.** The popup never renders 55 rows. It shows the four tickets actually
> touched this week, ranked by recency, and hands the other 51 to search — *"Search to find them →"*.
> Search is the browse mechanism, not a filter layered on top of one.

### The single most dangerous thing about this story

**`TicketPicker` is used by TWO surfaces.** `components/today/TodayView.tsx:214` (the popup — removed by
this story) and `components/week/WeeklyGrid.tsx:495` (the week grid's inline "add a subtask" picker —
**stays, unchanged, forever**).

This epic has been burned **three separate times** by a change leaking through a shared component
behind a mock:

1. **Story 7.2, Finding 2** — removing `max-h-64 overflow-y-auto` from `TicketPicker` to satisfy the
   popup's one-scroll-region rule silently changed the week grid's scrolling. Fixed with the
   `unbounded` prop.
2. **Story 7.3** — the same pattern flagged again.
3. **Story 7.4, D-7.4-15** — the widened JQL was applied to shared `searchTickets` itself and reached
   `TicketPicker`, so the week grid inherited every downside of the widening and none of the ranking.

Every one of those got through a **green test suite**, because:

- `components/today/TicketPicker.test.tsx:23` mocks `@/lib/ticket-search` **wholesale**.
- `components/week/WeeklyGrid.test.tsx:11` mocks `@/components/today/TicketPicker` **away entirely**.
- `components/today/TodayView.test.tsx:10` mocks `@/lib/storage/pinned-tickets`.

**A green suite is not proof in this story.** See AC8 and Task 9 for the specific proof obligations.
Do not report "all tests pass" as evidence that the week surface is unaffected — it is not evidence.

### What the popup loses (state it, do not discover it in review)

Removing `TicketPicker` from the popup removes, from the popup only:

- The 2-level assigned/manager/skip-level browse tree (the point of the story).
- `hooks/useHierarchyTickets` — **up to 3 sequential Jira searches on the popup's first-paint path.**
  This is a significant NFR1 **win** (see D-7.5-17).
- The `['catch-all', key]` query and the catch-all subtask group. Admin/Meetings catch-all subtasks
  become reachable from the popup only through **search** (which D-7.4-13 widened to `text ~` with no
  recency or status filter, so they are genuinely reachable) and through the action bar's time-off
  button. This is a real reduction in directness — flagged, not hidden (D-7.5-24).
- The in-picker "create my subtask under this Task" affordance (`lib/create-subtask.ts`). Still live on
  the week surface.

### Inherited invariants this story must not break

- **D-7.3-9** — nothing may change the resume card's subtask, pre-fill or write target while it is on
  screen. **This story contains a direct spec conflict with that invariant** — see D-7.5-19, which is an
  **escalation**, not a settled decision.
- **D-7.4-18** — `TodayView` stays MOUNTED and is hidden with the HTML `hidden` **attribute** while a
  search is active. The new "Recently worked" list must sit **inside** that wrapper (D-7.5-22).
- **D-7.2-2 / `useTodayTotal`** — never `invalidateQueries(['week-worklogs', …])`, never flip
  `staleTime` / `refetchOnWindowFocus` / `refetchOnReconnect`. Reading the week query is free; touching
  its cache is a double-count bug.
- **D-7.3-5** — the recency lookup was deliberately NOT widened beyond the current Monday–Sunday week,
  on NFR1 grounds. That ruling constrains this story too (D-7.5-16).
- **`App.tsx`'s `breaksHeaderBaseline` boolean stays exactly one line**, so Story 7.9 can append
  `&& !offlineBanner && !writeErrorBanner`. This story must not touch it.
- **Do NOT change `lib/hierarchy.ts` or `lib/manager-matrix.ts`.** Epic 5's approval rollup depends on
  them; any change is an escalation.

---

## Acceptance Criteria

Transcribed verbatim from `_bmad-output/planning-artifacts/epics.md` § Story 7.5 (lines 1824–1859),
then annotated with what "done" means concretely in this codebase.

### AC1 — The tree is gone; "Recently worked" replaces it

**Given** the existing `TicketPicker` renders a 2-level browse tree of all 55 assigned tickets
**When** this story lands
**Then** the popup no longer renders that tree
**And** a "Recently worked" section renders exactly four rows, ranked by recency of the user's own worklogs

**Concretely:**
- `components/today/TodayView.tsx` no longer imports or renders `TicketPicker`. The
  `<TicketPicker onSelect={handleSelect} unbounded />` call site at line 214 is deleted.
- `components/today/TicketPicker.tsx` itself is **NOT deleted and NOT edited** — `WeeklyGrid` still
  uses it. Its `unbounded` prop becomes vestigial (no caller passes `true` any more); **leave it**,
  removing it is a shared-component edit for zero gain (D-7.5-23).
- A new `components/today/RecentlyWorked.tsx` renders the section, fed by a new
  `hooks/useRecentlyWorked.ts` composing the **already-fetched** week query (D-7.5-15) — zero extra
  network calls.
- **Deviation to be aware of:** "exactly four rows" is not always satisfiable from the only free data
  source. See **D-7.5-16** — this is an escalation, and the recommended behaviour is *up to* four.

### AC2 — The handoff row

**Given** the user has more assigned tickets than are shown
**When** the "Recently worked" card renders
**Then** its final row reads "N more assigned tickets" with a "Search to find them →" affordance that focuses the search field
**And** that row is a handoff to search, not a "show all" that expands the list in place

**Concretely:**
- The row calls **`searchPanelRef.current?.focus()`** — the `SearchPanelHandle` seam 7.4 published
  specifically for this story (D-7.4-26). `entrypoints/popup/App.tsx:86` already holds the ref. **Do not
  invent a second focus path**; there is exactly one, and 7.4 built it for you.
- The ref lives in `App.tsx` and the row lives inside `TodayView`, so thread one new optional prop
  `onRequestSearchFocus?: () => void` down (D-7.5-22).
- It renders as a single interactive row (`<button type="button">`) spanning the whole final row, so
  the whole strip is the target — not a bare text link beside inert text.
- **Nothing expands in place.** No "show all", no accordion, no second list.
- **Where `N` comes from is an open escalation — see D-7.5-17.** Do not silently add a network call to
  the first-paint path to obtain it.

### AC3 — "Logged today" row anatomy

**Given** "Logged today" renders
**When** the user has entries
**Then** each row shows the ticket key in Kanit, the summary ellipsised on its own line, the hours in `tabular`, and 24 px edit and delete buttons
**And** rows are a fixed height so the list scans

**Concretely (see D-7.5-21 for the exact layout recipe):**
- Ticket key in **Kanit** — this replaces the current `font-mono` at `LoggedToday.tsx:661` and `:665`,
  which violates the standing "no monospace anywhere" constraint.
- Summary on its **own second line**, `truncate`, with `min-w-0` on the flex column or the ellipsis
  never engages.
- Hours in the `tabular` utility (`styles/globals.css:232`), Kanit, right-aligned.
- **24 px edit and delete buttons, rendered directly** — this replaces the current `MoreHorizontal`
  (`h-8 w-8`) popover menu at `LoggedToday.tsx:696-743`. Icons `Pencil` and `Trash2` from
  `lucide-react` (DESIGN.md line 250 names `delete: Trash2`), inline SVG **11–13 px**,
  `aria-hidden="true"`, each button carrying an `aria-label` naming the ticket and hours.
- Fixed row height — an explicit height utility, not one that happens to fall out of the content.

### AC4 — Delete is immediate, with undo, and no confirmation dialog

**Given** the user deletes an entry
**When** the delete completes
**Then** it is removed immediately with an undo affordance — no confirmation dialog
**And** `⌘/Ctrl+Z` triggers the undo while the affordance is present

**Concretely:**
- The existing `'confirming-delete'` row mode (`LoggedToday.tsx:177`, `:669-693` — "Delete this
  worklog?" + Cancel/Delete) is **removed**. That IS the confirmation dialog this AC forbids.
- **This writes to Jira.** The delete/undo semantics are settled in **D-7.5-18** — read it before
  writing a line of this. The short version: the delete is **deferred**, not optimistic-then-
  compensated, because a Jira worklog DELETE is irreversible.
- `⌘/Ctrl+Z` capture rules are settled in **D-7.5-20** — it collides with native text-editing undo in
  four different inputs in this popup.

### AC5 — The empty state

**Given** the user has logged nothing today
**When** the section renders
**Then** it shows a dashed-border card reading "Nothing on the clock yet today." / "Add hours above, or search for a ticket."
**And** no illustration, advice, or onboarding copy is shown

**Concretely:**
- The two strings are **exact**, in `STRINGS`, verbatim, including the full stops. They replace the
  current `STRINGS.empty` (`LoggedToday.tsx:30`), `'Nothing logged today yet. Pick a ticket below to
  start.'` — which after this story would be a **lie**, since there is no longer a ticket picker below.
- Dashed border: `border border-dashed border-border`. The mockup's literal `1px dashed #DEDCE9` is the
  same un-tokenised hex **D-7.3-14 already ruled against**; use the `border-border` token
  (`#E4E3EC`) for exactly the same reason. Epic 7 adds no new hex.
- **No illustration, no advice, no onboarding, no icon-with-encouragement.** `EXPERIENCE.md` line 184
  is explicit: *"Resume card is the only loud element. No illustration, no advice, no onboarding."*
  If you find yourself adding a third line of copy, you have broken this AC.

### AC6 — Key and summary on separate lines

**Given** any list row is rendered
**When** the key and summary are laid out
**Then** they occupy separate lines so an 80-character GAPI summary truncates without shoving the key

**Concretely:** applies to **both** new lists — "Logged today" rows and "Recently worked" rows. See
D-7.5-21. A test must drive a genuinely 80+ character summary and assert the key is still rendered
whole and the row height is unchanged.

### AC7 — No regressions; the week surface is provably untouched

Not in `epics.md`; added because this story's blast radius is the whole reason it is risky.

- `pnpm compile` clean. `pnpm test` at or above the recorded baseline.
- **`components/today/TicketPicker.tsx` and `lib/ticket-search.ts` are byte-identical to `2d1c30f`.**
  Prove it with `git diff 2d1c30f -- <path>` producing empty output, and paste that in the Completion
  Notes.
- `WeeklyGrid.test.tsx`, `TicketPicker.test.tsx` and `TicketPicker.search-jql.test.tsx` all pass
  **unmodified**. If you needed to edit any of them, you changed shared behaviour — stop and escalate.
- 7.4's search behaviour is unchanged: `SearchPanel`, `useTicketSearch` and the `hidden`-attribute
  swap all still work, and the "log an entry → search → Esc → entry still there, chrome figure
  unchanged" test (D-7.4-18) still passes.

---

## Resolved questions

These were investigated inline against source at `2d1c30f` before this file was written. Each records
what was actually found, not what was assumed.

### D-7.5-15 — `lib/storage/pinned-tickets.ts`: KEEP, unchanged, and do not repurpose it

**The orchestrator's premise was that this store "may lose its only popup writer". It does — but it
does not lose its only writer, and that changes the answer.**

**What the audit actually found** (`grep` across all `*.ts` / `*.tsx`, excluding `node_modules`):

| | Production call sites |
|---|---|
| `addPinnedTicket` (write) | **`TicketPicker.tsx:265`** — and nowhere else |
| `getPinnedTickets` (read) | **`TicketPicker.tsx:177`** — and nowhere else |
| `removePinnedTicket` | **none.** Only `lib/storage/pinned-tickets.test.ts` calls it |

So the store is **entirely internal to `TicketPicker`**: one component both writes and reads it, and
nothing else in the product touches it. And `TicketPicker` has two consumers, only one of which this
story removes. After 7.5, `WeeklyGrid → TicketPicker` still writes it and still reads it.

**Verdict: KEEP the module exactly as it is. Do not delete it, do not repurpose it, do not write to it
from any new 7.5 code.**

Three reasons:

1. **It is not orphaned.** Writer and reader both survive on the week surface. There is no dangling
   store and no stale-data hazard, because the only reader is the same component as the only writer.
2. **It is semantically wrong for "Recently worked".** `PinnedTicket` is `{ key, summary, pinnedAt }`.
   `pinnedAt` is *when you picked the ticket out of a search*, not when you logged against it, and
   there is **no duration at all**. AC1 requires ranking "by recency of the user's **own worklogs**".
   D-7.3-2 investigated and rejected this exact store for this exact reason: *"Its only writer records
   tickets arriving from search, and it stores no duration. It means 'recently reached', not 'recently
   logged'."* That finding still holds and 7.5 does not overturn it.
3. **Writing to it from 7.5 would be a fourth shared-seam leak.** `TicketPicker` renders its contents
   under a "Recently used" heading on the **week grid**. If new popup code started calling
   `addPinnedTicket`, the week grid's picker would silently start showing tickets the user reached
   through the popup — a change to a surface this story is not scoped to touch, invisible to
   `WeeklyGrid.test.tsx` because it mocks `TicketPicker` away. That is precisely the failure mode of
   7.2 Finding 2 and D-7.4-15.

**Consequence to state plainly (a real, minor behaviour change):** after 7.5 the popup no longer
contributes to `local:pinnedTickets`, so the week grid's "Recently used" list grows only from week-grid
usage. A popup-only user accumulates nothing there. Nobody sees a bug; the week list is just shorter for
some users. Accepted, recorded, no action.

**Follow-up for someone else, not this story:** `removePinnedTicket` has no production caller and is
dead code covered only by its own unit test. Deleting it means editing a module `TicketPicker` imports
from, on a story with this blast radius — **not worth it here.** Note it in `deferred-work.md`.

### D-7.5-16 — "Recently worked" reads the already-fetched week query; it costs ZERO extra network. But "exactly four" is not always satisfiable — **ESCALATION**

**The recency source is settled and it is free.**

`hooks/useWeekWorklogs.ts` runs `useQuery({ queryKey: ['week-worklogs', weekOf] })` and returns
`WeekIssueWorklogs[]`, which is exactly:

```ts
type WeekIssueWorklogs = { key: string; summary: string; worklogs: JiraWorklog[] };
```

Each worklog carries `started` and `timeSpentSeconds`. That is **precisely** the shape "Recently
worked" needs: per-issue key and summary, plus a per-worklog timestamp to rank by. And the query is
**already subscribed to twice** on the popup's first paint — by `useTodayTotal` (D-7.2-2) and by
`useResumeTicket` (D-7.3-2) — under the *identical* query key. Composing over it a third time costs
**zero additional network requests**. This is the same "free enrichment" pattern D-7.3-2 established.

So: a new `hooks/useRecentlyWorked.ts` that
- reads `useWeekWorklogs(currentWeekMonday())`,
- groups by issue, takes each issue's **newest** `started`,
- sorts descending, takes the top 4,
- **excludes the configured time-off subtask** (`ptoSubtaskKeyItem`) for consistency with **D-7.3-12** —
  time off is a settled state that "stops asking"; it should not appear in a list whose whole purpose is
  "here is what to log more time against". `useResumeTicket.ts:49-72` already does exactly this filter;
  mirror it.
- **Does not filter the catch-all project** — same rule as D-7.3-12: Admin/Meetings work under the
  catch-all is legitimately resumable.

**The escalation: AC1 says "exactly four rows", and the free source cannot always produce four.**

The week query's range is `currentCycleRange('weekly')` — the current **Monday–Sunday only**. So the
number of distinct issues available is however many the user has logged against *this week*. On a Monday
morning that is frequently **zero**. Mid-week it is often one or two. "Exactly four" is only reliably
satisfiable from Wednesday onward for a user who spreads work across tickets.

This is the **same boundary D-7.3-5 already ruled on**, for the resume card, on NFR1 grounds — and the
owner's ruling there was explicit that widening it costs *"a search call plus N per-issue GETs sitting on
the first-paint path"*, which NFR1's 400 ms budget cannot absorb. Note also that
`fetchCurrentUserWeekWorklogsByIssue` is **already** an N+1 fan-out (1 × `myself`, 1 × search, then one
`/worklog` GET **per issue**) — widening its window widens the fan-out too, so the cost grows with the
user's history rather than being a flat one-request add.

**Options:**

- **(a) Render *up to* four rows — RECOMMENDED.** Show what genuinely exists, ranked by recency; hide
  the whole section when there are zero. Zero cost, honest, and degrades to the state the popup is
  already designed for (the resume card and search are both still there). Deviates from AC1's literal
  "exactly four".
- **(b) Widen the recency window** to reach back beyond the current week so four rows are usually
  available. **This is a genuine new cost on the first-paint path**: at minimum one additional JQL
  search plus one `/worklog` GET per returned issue, on every cold popup open, to serve a cosmetic row
  count. This is the option D-7.3-5 explicitly rejected. If the owner takes it, note D-7.3-2's remark
  that a wider source *"could later serve the resume card too"* — so the cost would at least buy two
  things, and 7.3's accepted cold-start blind spot would close.
- **(c) Pad the list** from `pinnedTickets` or the hierarchy tree to reach four. Rejected on sight: it
  mixes "recently logged" with "recently reached" under one heading that claims worklog recency, which
  is a lie in the UI.

**Recommendation: (a).** Build the hook so that widening later is a change to *one* function's input
range and nothing else, so (b) stays cheap to adopt.

**7.5 carries no obligation to 7.3 either way.** D-7.3-5 states this explicitly: *"Story 7.5 carries
**no** obligation from this decision."* If (a) is taken, the resume card's cold-start blind spot simply
remains as accepted.

### D-7.5-17 — Where "N" in "N more assigned tickets" comes from — **ESCALATION**

**The finding that matters: removing `TicketPicker` from the popup takes up to THREE Jira searches OFF
the first-paint path. Re-adding a count gives some of that back.**

`TicketPicker.tsx:154` calls `useHierarchyTickets()`, which calls `lib/hierarchy.ts#fetchHierarchy()`.
That function issues **up to three sequential searches** (`hierarchy.ts:107`, `:130`, `:146`):

```
assignee = currentUser() AND statusCategory != Done AND updated >= -28d     (always)
assignee = "<managerAccountId>"   … AND issuetype != Sub-task               (if configured)
assignee = "<skipLevelAccountId>" … AND issuetype != Sub-task               (if configured)
```

each at `maxResults=100`. Because `TodayView` renders `TicketPicker` unconditionally on mount, **all of
that is on the popup's first-paint path today**. Deleting the picker from the popup is therefore a
meaningful NFR1 win, entirely for free.

**`fetchHierarchy`'s result cannot give you "N assigned" anyway.** It returns a *merged* task map
containing the user's tickets **plus their manager's plus their skip-level's** (`hierarchy.ts:118-159`),
with subtasks nested under parents. `hierarchyTasks.length` is not the assigned-ticket count — it
overcounts by everything your manager owns. Extracting a true "assigned to me" count from it means
re-deriving from the self-sourced subset, which is exactly the structure this story is deleting.

**Options:**

- **(a) Render the row without `N` — RECOMMENDED as the zero-cost default.** e.g. *"More assigned
  tickets"* + *"Search to find them →"*. Costs nothing, adds no request, and preserves AC2's actual
  substance — the row is a **handoff to search, not a show-all**. The number is decoration; the handoff
  is the requirement.
- **(b) A dedicated count-only query.** One request:
  `rest/api/3/search/jql?jql=assignee = currentUser() AND statusCategory != Done&maxResults=0`, reading
  only the response's `total`. `maxResults=0` returns the count with no issue payload, so this is far
  cheaper than `fetchHierarchy` — **one** request, no per-issue fan-out. Requires a small Zod schema
  carrying `total` (no existing schema projects it), which bends D-7.4-21's "reuse, never add a schema"
  rule — though that rule was specifically about the *hierarchy* schema. **If this is chosen it must be
  mounted so it is never awaited by first paint** (the D-7.4-21 precedent: `useCurrentUser` is mounted
  inside a lazily-rendered child for exactly this reason). Render the row immediately without the
  number and fill `N` in when it resolves; never block, never show a spinner in the row.
- **(c) Reuse `useHierarchyTickets`.** Rejected: 3 requests, and it does not answer the question asked.

**Recommendation: (a), unless the owner wants the literal AC copy honoured, in which case (b) with the
lazy-mount discipline.** Do not guess — this is the one place in the story where a wrong choice quietly
re-adds network cost to the hot path the story just cleaned up.

Whichever is chosen: the query key must be namespaced away from `['week-worklogs', …]`,
`['hierarchy-tickets']`, `['catch-all', …]`, `['ticket-search', …]` and `['current-user']` (D-7.4-22),
and it must **never** invalidate `['week-worklogs', …]`.

**Note the mockup's count pill** (round-2, line ~739) reads `55 assigned` beside the "Recently worked"
heading, and the final row reads `51 more assigned tickets` — i.e. total minus the four shown. If (a) is
taken, **both** the pill and the row lose their number; do not keep the pill and drop the row's number,
or the UI shows a total with no relationship to anything.

### D-7.5-18 — Delete is DEFERRED, not optimistic-then-compensated. This is the money-path decision of the story

**The constraint that settles it: a Jira worklog DELETE is irreversible.** There is no restore endpoint.
Once `deleteWorklog(issueKey, worklogId)` (`lib/jira-client.ts:437`) succeeds, that `worklogId` is gone
permanently.

**Options:**

- **(A) Deferred delete — CHOSEN.** On click the row disappears from the list **immediately** (satisfying
  "removed immediately") and an undo affordance appears. **The Jira DELETE is not sent until the undo
  window expires.** Undo cancels a timer; nothing was ever written; zero Jira traffic; perfectly
  reversible because nothing happened.
- **(B) Optimistic delete + compensating re-post.** Delete now, undo re-POSTs. **Rejected**, and it must
  stay rejected: the restored worklog gets a **new `worklogId`** and a new `created` timestamp, so it is
  not the same record — anything holding the old id (the outbox, an open edit) now points at a ghost.
  `postWorklog`'s body takes `comment` as a **plain string** while the stored entry's comment round-trips
  through ADF (`textToAdf`), so the restore is **lossy**. And it puts *two* writes on the money path where
  the user asked for zero, with a failure mode — undo itself fails — that leaves the user with neither the
  original nor the restoration, having been shown an "undo" that lied.

**The hard part of (A), stated honestly: the popup can close before the window expires.** A Chromium
extension popup is torn down on close and every timer dies with it. Naively, the user watches the row
vanish, closes the popup, and **the worklog is still in Jira** — the UI told them it was deleted and it
was not. That is a silent data-integrity lie and it is worse than any confirm dialog.

**The fix uses a seam this repo already has.** Story 2.7's durable outbox (`lib/storage/outbox.ts`)
exists precisely for "a write that must survive the popup". On teardown, **do not** race an async `fetch`
— an in-flight request started during `pagehide` is not guaranteed to complete. Instead **enqueue the
pending delete to the outbox** (`kind: 'delete'`), which is a `storage` write, and let the service
worker's `outbox-retry` alarm drain it independently of the popup. `LoggedToday.tsx:106-129`'s
`enqueueFailedWorklogMutation` already constructs exactly this entry shape
(`rest/api/3/issue/{key}/worklog/{worklogId}`, `kind: 'delete'`) — reuse it rather than hand-rolling
the endpoint string.

**Required specifics:**

- **Undo window: a named exported constant, not an inline literal** — following the
  `COLD_START_SKELETON_BUDGET_MS` precedent (D-7.3-10). Suggested `UNDO_WINDOW_MS = 5000`; the nearest
  in-repo precedent is `TOAST_DISMISS_MS = 4000` (`TodayView.tsx:20`). **Flag the exact value for the
  owner** — 5 s is a judgement call, not a derived number. Pin it with a fake-timer test.
- **Do not mutate the owner list during the window.** The row's entry may belong to `TodayView`'s own
  `loggedEntries` **or** to one of the shell's three lists (`ptoEntries` / `resumeEntries` /
  `searchEntries`, routed via `handleAnyDeleted` → `onExternalEntryDeleted`). Removing it and putting it
  back means guessing which list owned it. **Instead: keep the entry in its list and mark it
  pending-deletion, filtering it out of the render.** Undo is then a pure local flag flip with no list
  surgery, and the existing ownership routing is only invoked **once**, at commit. This is materially
  safer and keeps `App.tsx`'s handlers untouched.
- **The chrome header total must drop immediately** when the row is hidden, and come back on undo —
  otherwise the figure disagrees with the visible list. Because seconds are derived from the entry lists
  (`App.tsx:73-76`, `TodayView.tsx:151`), the pending-deletion filter must be applied to the **same**
  derivation, not only to the rendered rows. This is the easiest thing in the story to get half-right;
  test it explicitly.
- **A refused delete surfaces after the row is already gone.** With a deferred delete the failure lands
  when there is no row to attach the existing chip to. Required behaviour: **re-insert the row** (it is
  still in Jira — that is the honest state) and render the existing persistent error chip on it. Red is
  correct here and only here: this is *"a write Jira actually refused"*, the one case the standing Epic 7
  rule reserves red for.
- **Transient failures keep today's behaviour**: `network` / `rate-limited` → enqueue to the outbox +
  "Pending — will retry" chip (`LoggedToday.tsx:375-383`). Do not re-invent this path.
- **Only one pending delete at a time.** If a second delete starts while one is pending, **commit the
  first immediately**, then start the new window. Queuing multiple undos multiplies the states and the
  AC asks for one affordance.
- The undo affordance must satisfy the standing a11y rule: a **visible text label** ("Undo"), not an
  icon alone, announced via a `role="status" aria-live="polite"` region so a screen-reader user learns
  the row went away and that undo is available.

### D-7.5-19 — EXPERIENCE.md's "`+` that seeds the resume card" collides head-on with D-7.3-9 — **ESCALATION**

`EXPERIENCE.md` line 140 specifies the Recently-worked rows as: *"Four rows, ranked by recency of the
user's own worklogs, **each with a `+` that seeds the resume card**."* The round-2 mockup draws exactly
that — a bare 24 px `+` at the right of each row.

**D-7.3-9 forbids it in as many words:** *"nothing may change the resume card's subtask, pre-fill or
write target while it is on screen."* That was an **owner decision** on the money path, taken after a
reviewer reproduced hours landing on the wrong subtask, and it explicitly binds later stories: *"Story
7.9's banners and any future re-render source inherit this invariant."*

A `+` that seeds the resume card is a *user-initiated* retarget rather than an async one, which is less
dangerous — but it still moves the card's write target while the card is on screen, which is the literal
thing the invariant prohibits, and the card may already hold a typed value.

**Options:**

- **(a′) The `+` opens the existing `QuickLogForm` for that ticket — RECOMMENDED.** `TodayView` already
  owns `handleSelect` → `selectedTicket` → `<QuickLogForm>` (lines 79-87, 202-208); that is precisely
  the flow `TicketPicker` fed, and deleting the picker otherwise leaves it **unreachable dead code**. So
  this both satisfies the affordance and keeps a shipped, tested path alive. The user enters an explicit
  amount — no guessed hours on the money path — and the resume card is never touched. Note that
  `QuickLogForm` writes `local:lastLoggedTicket`, which changes the resume ticket for the **next**
  session only; `useResumeTicket` reads storage once on mount (`useResumeTicket.ts:124-135`), so nothing
  moves under the live card. **D-7.3-9 is not violated.**
- **(b) Seed the resume card, as `EXPERIENCE.md` literally says.** Requires the owner to amend D-7.3-9.
  Do not do this on a creator's judgement.
- **(c) Drop the `+`; rows are inert and the section is display-only.** Cheapest, but it removes the only
  reason to click a row, and leaves `QuickLogForm` dead.

**Recommendation: (a′).** It is the only option that satisfies the spec's intent, respects an owner
ruling on the money path, and avoids orphaning shipped code. **Flagged for the orchestrator to rule on
before development starts.**

### D-7.5-20 — `⌘/Ctrl+Z` capture: the polarity is the OPPOSITE of 7.4's `/`

This is the same class of problem as D-7.4-17's `/` collision, but the correct answer inverts.

**The collision surface.** While an undo affordance is present the popup may contain: the resume card's
hour input (7.3), `SearchPanel`'s query field **and** its header hour input (7.4), and — if another row
is being edited — `LoggedToday`'s edit-mode hours / comment / date inputs (2.6).

**Why the `/` solution does not transfer.** D-7.4-17 could narrow its exclusion to *"text inputs where `/`
is a legitimate character"*, because `/` is meaningless in an hours field. **`⌘Z` is meaningful in every
one of those inputs** — they all carry a native edit history. So the opt-in attribute pattern
(`data-slash-passthrough="true"`) inverts:

- **Default: let the event through.** If `document.activeElement` is a text-entry element —
  `<input>` of a text-ish type (`text`, `date`, `search`), `<textarea>`, or `contenteditable` — do
  **nothing**. The browser performs the native text undo the user meant.
- **Capture only otherwise** — focus on `document.body`, a button, or the row itself. Then
  `preventDefault()` and trigger the undo.
- **Bind the listener only while a pending delete exists.** No affordance, no listener. It cannot shadow
  anything the rest of the time, and this is also what makes the AC's *"while the affordance is
  present"* literally true rather than approximately true.
- Match on `(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey` — `⇧⌘Z` is redo and
  must fall through untouched.

**Do not refactor `SearchPanel`'s existing predicate.** `SearchPanel.tsx:196` has its own inline
text-entry check for the `/` handler. Extract a shared helper (e.g. `lib/dom/text-entry.ts`) and use it
in the **new** code only; leave `SearchPanel.tsx`'s inline check **byte-identical**. The duplication is
deliberate: touching 7.4's slash handler is a shared-seam edit on a surface this story has no business
changing, and this epic's entire injury history is shared-seam edits. Record the duplication in a code
comment citing this decision so a future reader does not "tidy" it.

**Focus after delete.** The delete button that was just clicked is removed with its row, so focus would
otherwise fall to `document.body`. Move focus deliberately to the undo affordance — which also makes
`⌘Z` capture work on the first press (body/button focus → captured) and makes the affordance reachable
for keyboard and screen-reader users without hunting.

### D-7.5-21 — The fixed-height two-line row, concretely

From `DESIGN.md` line 461: *"**List row.** Two-line: Kanit key + optional pill on line one, Noto summary
ellipsised on line two, with a right-aligned action (`+` for add, hours + edit/delete for logged
entries). **Fixed height so lists scan.** Separating key from summary onto its own line is what lets an
80-character summary truncate without shoving the key around."* And `DESIGN.md` line 145:
`list-row: padding: '9px 11px'; divider: '1px solid {colors.border-faint}'; hover: '{colors.background}'`.

Recipe (both lists):

- **Row:** `flex items-center gap-[10px] px-[11px] py-[9px]`, explicit fixed height, divider
  `border-b border-border-faint`, hover `hover:bg-background`.
- **Text column:** `flex min-w-0 flex-1 flex-col gap-px`. **`min-w-0` is load-bearing** — without it the
  flex child refuses to shrink below its content width and `text-ellipsis` never engages, which is
  exactly the AC6 failure mode. This is the single most likely way to ship AC6 broken while it "looks
  fine" with short summaries.
  - **Line 1:** ticket key, Kanit, `font-medium text-primary`, plus `tabular` (keys contain digits), and
    on Recently-worked rows an optional recency note ("2h ago") as a sibling span.
  - **Line 2:** summary, `truncate` (`overflow-hidden text-ellipsis whitespace-nowrap`), `text-muted`.
- **Right side:** Logged-today → hours (`tabular`, Kanit, `text-foreground`) then the two 24 px buttons
  (`h-6 w-6`, `shrink-0`). Recently-worked → the single 24 px action per D-7.5-19.
- **Card:** `rounded-lg border border-border bg-surface overflow-hidden` with the `data-card` shadow.
- **Section heading:** eyebrow-styled label + `count-pill` (`bg-primary-soft text-primary rounded-full
  px-[7px] py-px`, Kanit, `tabular`) + a hairline rule filling the remainder, per the mockup.
- **Focus rings** via `focus-visible:` on the buttons and `focus-within:` on the row — **never static**
  (D-7.3-15).
- **Zero new colour values.** Everything above resolves to tokens already in `styles/globals.css`.
- **No monospace anywhere** — this story actively removes the two existing `font-mono` usages.

### D-7.5-22 — Composition: `RecentlyWorked` lives inside `TodayView`, inside 7.4's `hidden` wrapper

- **`RecentlyWorked` renders inside `TodayView`**, below `LoggedToday`, matching `EXPERIENCE.md`'s IA
  order (Logged today → Recently worked). `TodayView` already owns `handleSelect`/`QuickLogForm`, which
  D-7.5-19's recommended option needs.
- **Therefore it is automatically inside `App.tsx:269`'s `<div hidden={searchActive}>`** — which is
  required, because 7.4's AC3 says search **replaces** *both* lists. **If you instead mount
  `RecentlyWorked` as a sibling in `App.tsx`, it will stay visible during a search and silently break a
  shipped Story 7.4 acceptance criterion.** A test must assert both lists are gone when a query is
  active.
- **Do NOT lift `loggedEntries` into the shell.** D-7.4-18's note says 7.5 *may* — it should not. The
  `hidden`-attribute wrapper already neutralises the unmount hazard, it is tested, and lifting is a
  large diff across four lists for no behavioural gain. Keep the blast radius small.
- **`App.tsx`'s only change** is threading `onRequestSearchFocus={() => searchPanelRef.current?.focus()}`
  into `TodayView`. **`breaksHeaderBaseline` (line 211) is not touched** — Story 7.9 still appends one
  condition to one line.

### D-7.5-23 — `TicketPicker`'s `unbounded` prop stays, vestigial

After this story no caller passes `unbounded` (the popup was its only opt-in; `WeeklyGrid` relies on the
`false` default). **Leave the prop, its default, its JSDoc and its tests exactly as they are.** Removing
it is an edit to a component whose other consumer this story must prove untouched — all cost, no gain.
Note it in `deferred-work.md` as post-Epic-7 cleanup.

### D-7.5-24 — The catch-all group leaves the popup; say so

`TicketPicker` was the popup's only route to catch-all subtasks (`['catch-all', key]`,
`lib/catch-all.ts`) for Admin/Meetings work. After 7.5 they are reachable from the popup only via
**search** — which D-7.4-13 widened to `text ~` with no recency and no `statusCategory` filter, so they
genuinely are reachable — and time off keeps its dedicated action-bar button.

Consequently `TodayView`'s catch-all-unconfigured notice (`TodayView.tsx:179-191`,
*"Catch-all not configured. Configure in Settings to log Admin/Meetings/PTO."*) now points at a
capability the popup no longer surfaces directly. **Recommendation: leave the notice** — the setting
still matters for time off — but do not extend it. Flagged so a reviewer does not read its survival as
an oversight.

### D-7.5-25 — Do NOT adopt 7.4's deferred truncation off-by-one

`deferred-work.md` carries an open item from 7.4: the *"showing the first N"* line renders when a search
returns **exactly** `MAX_RESULTS`, even though nothing was truncated. The prompt permits adopting it into
7.5 "if it fits naturally".

**It does not fit, and it is deliberately not adopted.** It lives in `hooks/useTicketSearch.ts:178` and
`components/today/SearchPanel.tsx:657` — the **search** surface, which this story does not otherwise
touch. A correct fix is a wire-contract change (over-fetch `MAX_RESULTS + 1`, then slice). Reaching into
the search seam from a story scoped to the lists is exactly the shape of D-7.4-15's regression, and the
defect fails in the **safe** direction (it over-warns; it never hides results silently, so D-7.4-14's
"never a silent cap" rule still holds). It stays in `deferred-work.md` for a dedicated follow-up.

---

## Tasks / Subtasks

- [x] **Task 1 — Remove the tree from the popup (AC1)**
  - [x] Delete the `TicketPicker` import and the `<TicketPicker onSelect={handleSelect} unbounded />`
        call site from `components/today/TodayView.tsx` (line 4, line 214), plus the now-unused
        `STRINGS.pickLabel` "Pick a ticket to log".
  - [x] Keep `handleSelect` / `selectedTicket` / `QuickLogForm` — they become the destination for the
        Recently-worked action (D-7.5-19, pending the orchestrator's ruling).
  - [x] **Do not open `components/today/TicketPicker.tsx`.** Not to delete it, not to remove
        `unbounded` (D-7.5-23), not to tidy it.
  - [x] Update `components/today/TodayView.test.tsx` for the removed picker. Its
        `@/lib/storage/pinned-tickets` mock (line 10) can go with it — the popup no longer reaches that
        store (D-7.5-15).

- [x] **Task 2 — `hooks/useRecentlyWorked.ts` (AC1, D-7.5-16)**
  - [x] Compose `useWeekWorklogs(currentWeekMonday())` — **the same query key** `useTodayTotal` and
        `useResumeTicket` already use. **Zero extra network.** No new `useQuery`.
  - [x] Group by issue, rank by newest `started` desc, cap at 4, exclude `ptoSubtaskKeyItem`
        (mirroring `useResumeTicket.ts:49-72`); do **not** exclude the catch-all project.
  - [x] Guard invalid/absent `started` exactly as `useResumeTicket` does (`Number.isFinite`).
  - [x] Isolate the range in one place so D-7.5-16 option (b) stays a one-function change.
  - [x] **Never** `invalidateQueries(['week-worklogs', …])`; never alter `staleTime` /
        `refetchOnWindowFocus` / `refetchOnReconnect` (D-7.2-2).
  - [x] Unit tests: ranking, the 4-cap, PTO exclusion, catch-all **not** excluded, fewer-than-four, and
        zero.

- [x] **Task 3 — `components/today/RecentlyWorked.tsx` (AC1, AC2, AC6)**
  - [x] Section heading + count pill + hairline rule; card per D-7.5-21.
  - [x] Up to four two-line rows (D-7.5-16 (a), confirmed by D-7.5-13), each with the row action settled
        by D-7.5-11 (opens `QuickLogForm`, never the resume card).
  - [x] Final handoff row calling `onRequestSearchFocus` → `searchPanelRef.current?.focus()`
        (D-7.4-26). One `<button>` spanning the row. **No expand-in-place.**
  - [x] Hide the whole section when there are zero rows.
  - [x] `N` dropped entirely per the owner's D-7.5-12 ruling — the row reads "More assigned tickets ·
        Search to find them →", no number, no new query.

- [x] **Task 4 — Rebuild the "Logged today" row (AC3, AC6)**
  - [x] Two-line anatomy; Kanit key; `truncate` summary on line 2 with `min-w-0` on the column;
        `tabular` hours; fixed row height.
  - [x] Replace the `MoreHorizontal` menu with direct 24 px `Pencil` / `Trash2` buttons, 11–13 px SVG,
        `aria-hidden="true"`, each with an `aria-label` naming ticket and hours.
  - [x] Remove both `font-mono` usages (`LoggedToday.tsx:661`, `:665`) — plus a third one in the
        editing-mode header that the story didn't cite by line but the standing "no monospace anywhere"
        rule (Dev Notes) still covers.
  - [x] Add the heading count pill.
  - [x] Keep the edit flow (Story 2.6, restored by 7.2 Finding 3) working for **both** ownership paths —
        `TodayView.handleAnyEdited` and the shell's `handleExternalEntryEdited`.

- [x] **Task 5 — Empty state (AC5)**
  - [x] Dashed-border card, `border-dashed border-border` (**not** `#DEDCE9` — D-7.3-14).
  - [x] Exactly the two specified strings, verbatim, in `STRINGS`. Deleted the old
        `'Nothing logged today yet. Pick a ticket below to start.'`.
  - [x] **No illustration, no advice, no onboarding, no third line.**
  - [x] Test asserting no `<svg>`/`<img>` inside the empty card and that only those two strings render.

- [x] **Task 6 — Deferred delete + undo (AC4, D-7.5-18)**
  - [x] Remove the `'confirming-delete'` row mode entirely.
  - [x] Pending-deletion flag; the entry stays in its owner list and is filtered out of **both** the
        render **and** the seconds derivation (threaded up via `onPendingDeletionChange` through
        `TodayView` to `App.tsx`, which filters `ptoSeconds`/`resumeSeconds`/`searchSeconds`).
  - [x] `UNDO_WINDOW_MS` as a **named exported constant** (5000, D-7.5-14); fake-timer test.
  - [x] Commit on expiry via the existing `deleteWorklog` path; undo cancels the timer with **zero**
        Jira traffic.
  - [x] Teardown flush: on `pagehide`/`visibilitychange`, enqueue the pending delete to the **outbox**
        (reuse `enqueueFailedWorklogMutation`'s shape) rather than racing a `fetch`.
  - [x] A second delete commits the first immediately.
  - [x] A **refused** delete re-inserts the row and shows the persistent red chip; transient failures
        keep the existing outbox + "Pending — will retry" path.
  - [x] `role="status" aria-live="polite"` announcement; move focus to the undo affordance (guarded by
        the same reverse focus-steal pattern as `ResumeCard`/`SearchPanel` — never yanks focus away from
        something already explicitly focused elsewhere).

- [x] **Task 7 — `⌘/Ctrl+Z` (AC4, D-7.5-20)**
  - [x] New `lib/dom/text-entry.ts` helper; used by **new code only**.
  - [x] **Leave `SearchPanel.tsx:196` byte-identical.** Comment the deliberate duplication.
  - [x] Listener bound only while a pending delete exists; falls through inside text-entry elements;
        `⇧⌘Z` untouched.
  - [x] Tests: undo fires from body/button focus; does **not** fire while focus is in an edit-mode field
        elsewhere in the list, in the resume card's hour input, or in the search field. **Correction
        (Review Finding 6, Nit):** the original wording here claimed these last two cases were
        "structurally impossible" because the `⌘Z` listener is "scoped to this component" — that is
        factually wrong. The listener is `document.addEventListener('keydown', ...)`
        (`LoggedToday.tsx`), which is NOT component-scoped and genuinely observes keystrokes from
        `ResumeCard`'s and `SearchPanel`'s inputs too. The real guarantee is `isTextEntryElement`
        (`lib/dom/text-entry.ts`), which returns `true` for every text-ish input type
        (`text`/`number`/`date`/`search`) and is what makes `⌘Z` correctly fall through in all of them.
        Both cases are now in the test table (`LoggedToday.test.tsx`), driven for real via the composition
        root in `entrypoints/popup/App.session-total.test.tsx`.

- [x] **Task 8 — Wiring (D-7.5-22)**
  - [x] `TodayView` gains `onRequestSearchFocus?: () => void`; `App.tsx` passes
        `() => searchPanelRef.current?.focus()`.
  - [x] `RecentlyWorked` mounts **inside** `TodayView`, hence inside the `hidden={searchActive}` wrapper.
  - [x] **`breaksHeaderBaseline` untouched** — confirmed line-for-line via `git diff`. `App.tsx`'s other
        change (`onPendingDeletionChange` + the `pendingDeletionId`-filtered `ptoSeconds`/
        `resumeSeconds`/`searchSeconds`) is Task 6's own explicit instruction to touch
        `App.tsx:73-76`'s seconds derivation, not a second undocumented change.

- [x] **Task 9 — Prove the week surface is untouched (AC7)** — *this is a deliverable, not a formality*
  - [x] `git diff 2d1c30f -- components/today/TicketPicker.tsx lib/ticket-search.ts` → **empty**. Pasted
        below in Completion Notes.
  - [x] `WeeklyGrid.test.tsx`, `TicketPicker.test.tsx`, `TicketPicker.search-jql.test.tsx` pass
        **unmodified** (55 tests, zero edits to any of the three files).
  - [x] Re-ran 7.4's D-7.4-18 test (log → search → `Esc` → entry present, chrome figure unchanged) —
        rewritten to log via `SearchPanel` (the surviving browse mechanism) instead of the deleted
        `TicketPicker`, since the ORIGINAL test's own logging step went through the picker.
  - [x] Stated in Completion Notes, in words, why a green suite alone is not the proof here.

- [x] **Task 10 — a11y and gates (AC7)**
  - [x] Extended the existing axe harness (`lib/test/axe.ts`, `scan` / `criticalOrSerious`) —
        `RecentlyWorked.test.tsx` and `TodayView.test.tsx` both carry a zero-Critical/Serious scan.
  - [x] Delete-the-icon-and-colour check: the undo affordance carries a visible "Undo" text label (not
        icon-only), and every new status string (empty state, handoff row, pending/refused chips) reads
        from text — colour is never the only signal.
  - [x] Confirmed **exactly one scroll region** — neither new list introduces `overflow-y-auto` /
        `overflow-auto` / `overflow-scroll`; `App.test.tsx`'s existing single-scroll-region assertion
        stays green untouched.
  - [x] `pnpm compile` clean; `pnpm test` at 92 files / 1169 passed / 1 skipped (above the 89/1115/1
        baseline); `pnpm build` green.

---

## Dev Notes

### Test baseline at `2d1c30f` — re-measured for this story, do not take it on trust later

```
Test Files  89 passed (89)
     Tests  1115 passed | 1 skipped (1116)
    Errors  1 error
```

`pnpm test` **exits non-zero even though every test passes.** Exactly **one** unhandled rejection escapes
`components/manager/ManagerView.test.tsx`:

```
TypeError: Cannot read properties of undefined (reading 'runtime')
  ❯ getStorageArea node_modules/…/@wxt-dev/storage/dist/index.mjs:348:15
```

The fake browser environment is torn down while a storage read is still in flight. It is a test-harness
race, not a product bug.

**This, and only this, is "pre-existing".** Any drop below **1115 passing**, or a **second** unhandled
rejection, is **the developer's regression** and must be fixed — not labelled pre-existing. Report the
actual numbers you measured, not these copied forward.

### Standing Epic 7 constraints (in force for this story)

- **No regression of WCAG 2.1 AA.** Status is never colour alone — colour **+** `lucide-react` icon **+**
  a visible text label. *Practical test: delete the icon and the colour, and the state must still read
  from the text.*
- **`lucide-react` only.** Inline SVG at **11–13 px**, `aria-hidden="true"`, so the screen reader
  announces the adjacent text and not the shape.
- **No monospace anywhere.** Numbers use the `tabular` utility (`styles/globals.css:232`). This story
  actively removes the last two `font-mono` usages in the popup lists.
- **Zero new colour values.** Semantic tokens over raw hex — an un-tokenised hex in the spec loses to the
  nearest token (D-7.3-14).
- **Exactly ONE scroll region in the popup** (7.2 AC). Neither new list may introduce a nested one.
- **NFR1: popup TTI ≤ 400 ms warm.** This story *improves* it by removing up to 3 searches from first
  paint (D-7.5-17). Do not spend that win without an explicit ruling.
- **Red fires ONLY for a write Jira actually refused.** In this story that is exactly one place: a
  refused delete (D-7.5-18). Everything else that needs attention goes amber (`text-amber-ink`).
- **`ring-focus` via `focus-within:` / `focus-visible:`, never static** (D-7.3-15).
- **Do NOT change `lib/hierarchy.ts` or `lib/manager-matrix.ts`** — Epic 5's approval rollup depends on
  them. Any change is an escalation.
- **Preserve D-7.3-9** — nothing may change the resume card's subtask, pre-fill or write target while it
  is on screen. See D-7.5-19, which is an open conflict with the UX spec.
- **Keep `App.tsx`'s `breaksHeaderBaseline` boolean intact** — Story 7.9 must be able to append one
  condition to one line.

### Repo traps (verified at `2d1c30f`)

- ESLint bans default exports and `any`, and enforces alphabetised `import/order` with **no blank lines**
  between import groups.
- Vitest + jsdom only; **no Playwright**. The axe gate is `lib/test/axe.ts`, with `color-contrast`
  disabled — contrast must be verified by computation, not by a green run (7.2's contrast finding).
- WXT `outDir` is `output/`, **not** `.output/`.
- **Fenced off by SD-5 — do not touch, do not stage:** `scripts/pack-crx.mjs`,
  `scripts/derive-ext-key.mjs`, `scripts/lib/`, `wxt.config.ts`, `package.json`, `docs/release.md`.
  These are Epic 6.3's in-flight work and are deliberately uncommitted. **Never `git add -A`.**

### Project Structure Notes

**New:**
- `hooks/useRecentlyWorked.ts` + test
- `components/today/RecentlyWorked.tsx` + test
- `lib/dom/text-entry.ts` + test

**Modified:**
- `components/today/TodayView.tsx` — remove `TicketPicker`; mount `RecentlyWorked`; new prop
- `components/today/LoggedToday.tsx` — row anatomy, empty state, delete/undo, `⌘Z`
- `entrypoints/popup/App.tsx` — **one** new prop; `breaksHeaderBaseline` untouched

**Must NOT be modified:**
- `components/today/TicketPicker.tsx`, `lib/ticket-search.ts` (byte-identical proof required)
- `lib/hierarchy.ts`, `lib/manager-matrix.ts`
- `lib/storage/pinned-tickets.ts` (D-7.5-15)
- `components/today/SearchPanel.tsx`, `hooks/useTicketSearch.ts` (D-7.5-20, D-7.5-25)
- `components/week/WeeklyGrid.tsx`

### References

- `[Source: _bmad-output/planning-artifacts/epics.md#story-75 (lines 1824–1859)]` — the ACs
- `[Source: …/ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md (lines 54–55, 79, 108, 140–145, 184)]`
- `[Source: …/ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md (lines 145–148, 191, 461–464)]`
- `[Source: …/ux-designs/…/imports/jira-time-logger-round2.dc.html (lines 702–760)]` — reference only
- `[Source: _bmad-output/implementation-artifacts/epic-7-decision-log.md]` — **canonical** (D-7.3-11):
  SD-1…SD-5, D-7.2-*, D-7.3-*, D-7.4-* all binding
- `[Source: components/today/TicketPicker.tsx (lines 145–200, 265)]` — the tree; `pinnedTickets`' only
  writer/reader
- `[Source: components/week/WeeklyGrid.tsx (line 495)]` — the surviving consumer
- `[Source: hooks/useWeekWorklogs.ts (lines 21–36)]` + `[lib/jira-types.ts (lines 125–129)]` — the free
  recency source
- `[Source: lib/hierarchy.ts (lines 100–160)]` — the 3-search cost behind any assigned count
- `[Source: components/today/LoggedToday.tsx (lines 106–129, 177, 364–366, 461–497, 654–745)]` — outbox
  seam, delete path, row markup
- `[Source: entrypoints/popup/App.tsx (lines 69–86, 211, 246–277)]` — lists, `searchPanelRef`,
  `breaksHeaderBaseline`, the `hidden` wrapper
- `[Source: components/today/SearchPanel.tsx (lines 57–59, 167–169, 196)]` — `SearchPanelHandle`,
  the slash predicate

---

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (bmad-story-developer)

### Debug Log References

- `git diff 2d1c30f -- components/today/TicketPicker.tsx lib/ticket-search.ts` → **empty output** (byte-identical, Task 9 proof):

  ```
  $ git diff 2d1c30f -- components/today/TicketPicker.tsx lib/ticket-search.ts
  (no output)
  ```

- `pnpm compile` → clean, zero errors.
- `pnpm lint` → 0 errors project-wide; the only warnings (`import/order`, 42 across 16 files) are all in
  files this story never touched (`QuickLogForm.tsx`, `PtoQuickAction.tsx`, `TicketPicker.tsx`, etc.) —
  pre-existing, confirmed via `git status` showing none of them as modified.
- `pnpm test` → **92 files / 1169 passed / 1 skipped**, exit non-zero from exactly **one** unhandled
  rejection (`ManagerView.test.tsx`, the documented baseline race), reproduced stable across 3 consecutive
  runs. Baseline was 89 files / 1115 passed / 1 skipped — net **+3 files / +54 tests**, zero regressions.
  - Mid-implementation this genuinely went to **2** unhandled rejections (a second one attributed to
    `TodayView.test.tsx`) — root-caused to a dropped `@/lib/storage/last-logged` mock in the rewritten
    `TodayView.test.tsx` (the real `QuickLogForm`, now reached via "Recently worked"'s `+`, calls the
    real, unmocked `setLastLoggedTicket` on a confirmed post, hitting real `@wxt-dev/storage` internals
    against this test file's minimal `chrome` stub). Restored the mock (mirroring the original file's own
    comment on exactly this hazard) and the count returned to 1. Recorded here because it is exactly the
    "any second unhandled rejection is the developer's regression" case the Dev Notes warn about.
- `pnpm build` → `wxt build` succeeds, `output/chrome-mv3/` produced, no warnings beyond the pre-existing
  Node `module.register()` deprecation notice.
- `components/today/TicketPicker.test.tsx` + `TicketPicker.search-jql.test.tsx` + `components/week/WeeklyGrid.test.tsx`
  → **55 tests, all pass, zero edits to any of the three files** (confirmed via `git diff 2d1c30f --stat`
  on all three, plus `SearchPanel.tsx`, `useTicketSearch.ts`, `lib/hierarchy.ts`, `lib/manager-matrix.ts`,
  `lib/storage/pinned-tickets.ts` — all empty diffs).

### Completion Notes List

- **AC1 (tree gone; Recently worked replaces it):** `TicketPicker` deleted from `TodayView.tsx` entirely
  (import + call site + `STRINGS.pickLabel`). `components/today/RecentlyWorked.tsx` + `hooks/useRecentlyWorked.ts`
  render up to 4 rows, ranked by recency, from the already-fetched `['week-worklogs', weekOf]` query — zero
  extra network (verified: `useRecentlyWorked.test.ts` composition tests assert `fetchByIssueMock` is
  called exactly once). Per D-7.5-13 (orchestrator), "up to four" is implemented literally, not "exactly
  four" — a forced consequence of the free data source, tested at 0/1/4+.
- **AC2 (handoff row):** implements the OWNER ruling D-7.5-12, not the AC's literal wording — the row reads
  **"More assigned tickets · Search to find them →"**, no number, no new query. Calls
  `searchPanelRef.current?.focus()` via the exact `SearchPanelHandle` seam Story 7.4 published
  (`onRequestSearchFocus`, threaded `App.tsx` → `TodayView` → `RecentlyWorked`). Single `<button>` spanning
  the row; nothing expands in place (tested).
- **AC3/AC6 (row anatomy):** both "Logged today" and "Recently worked" rows use the two-line
  key-then-summary anatomy with `min-w-0` on the flex column (load-bearing for `truncate` to engage —
  tested with a genuine 80+ character summary asserting the key renders whole and a fixed-height row
  utility is present). All three `font-mono` usages in `LoggedToday.tsx` (idle row ×2, editing-mode header
  ×1) are gone; keys/hours use `tabular` + `font-chrome` (Kanit) throughout. 24 px `Pencil`/`Trash2`
  buttons replace the `MoreHorizontal` popover menu entirely — there is no `role="menu"` left in
  `LoggedToday.tsx`.
- **AC4 (deferred delete + undo, D-7.5-18):** the `'confirming-delete'` mode is gone. Clicking delete hides
  the row IMMEDIATELY (zero Jira traffic, zero confirmation dialog) and starts a `UNDO_WINDOW_MS` (5000,
  D-7.5-14, exported named constant) timer, pinned by a fake-timer test asserting `deleteWorklog` is NOT
  called at `UNDO_WINDOW_MS - 1` and IS called at exactly `UNDO_WINDOW_MS`. Undo cancels the timer with
  zero Jira traffic (RED-proven: a test lets the ORIGINAL window fully elapse after Undo and asserts
  `deleteWorklog` was never called). A second delete commits the first immediately (tested). A refused
  delete (`forbidden`) re-inserts the row with the persistent red chip — the only legitimate red in this
  story; a transient failure (`network`/`rate-limited`) re-inserts the row with the existing "Pending —
  will retry" chip and enqueues to the outbox, reusing `enqueueFailedWorklogMutation`'s exact shape. On
  `pagehide`/`visibilitychange`(→hidden), a still-pending delete is enqueued to the Story 2.7 outbox
  instead of racing a `fetch` (tested by dispatching a real `pagehide` event and asserting
  `deleteWorklogMock` was never called while `enqueueOutboxMock` was). The pending id is reported upward
  via `onPendingDeletionChange` (`LoggedToday` → `TodayView` → `App.tsx`) so the chrome header's seconds
  derivation excludes it immediately regardless of which of the four entry lists (`loggedEntries`,
  `ptoEntries`, `resumeEntries`, `searchEntries`) actually owns it — this is the one piece the story
  itself flags as "easiest to get half-right", and it is exercised end-to-end (not just at the unit level)
  in `TodayView.test.tsx`.
- **AC4 (⌘/Ctrl+Z, D-7.5-20):** new `lib/dom/text-entry.ts` (`isTextEntryElement`), used only by
  `LoggedToday.tsx`. **Fixed a jsdom gap while writing its test**: jsdom does not implement the boolean
  `isContentEditable` IDL attribute (always reads back `undefined`), which would have made the predicate's
  contenteditable branch untestable and silently always-false; switched to the `contentEditable` STRING
  property (`'true'`/`'false'`/`'inherit'`), which jsdom does implement correctly. `SearchPanel.tsx:196` is
  confirmed byte-identical (empty diff) — the duplication is deliberate and commented in both files.
  `⌘Z`/`Ctrl+Z` fire undo only outside text-entry elements and only while a delete is pending (listener
  bound/unbound with `pending`); `⇧⌘Z` is untouched (tested). A dedicated test drives focus into a
  DIFFERENT row's active edit-mode hours field and confirms `⌘Z` falls through to native undo instead of
  cancelling the pending delete.
- **AC5 (empty state):** exact verbatim copy in two lines, `border-dashed border-border` (never the
  mockup's raw `#DEDCE9`, per the standing D-7.3-14 rule), zero `<svg>`/`<img>` inside the card (tested).
- **D-7.5-11 (owner ruling, the money-path decision):** the `+` on every "Recently worked" row opens the
  existing `QuickLogForm`, pre-targeted at that ticket, via `TodayView`'s pre-existing
  `handleSelect`/`selectedTicket` state — which has **no channel whatsoever** to the resume card (it lives
  entirely in `App.tsx`, two levels up, and `TodayView` never receives or touches `resume`/`ResumeCard`
  state). D-7.3-9 is therefore preserved **by construction**, not merely by convention. Verified with a
  REQUIRED integration test in `entrypoints/popup/App.session-total.test.tsx` (new describe block) that
  drives the real, unmocked composition root (`App` → `TodayView` → `RecentlyWorked` → `QuickLogForm`,
  alongside the real `ResumeCard`): clicking a **different** row's `+` (`PROJ-10`, not the resume card's
  `PROJ-9`) logs against `PROJ-10` and leaves the resume card's input value, ticket key, and
  `setLastLoggedTicket` target for `PROJ-9` completely untouched.
- **D-7.5-17 (NFR1 win, measured not assumed):** `entrypoints/popup/App.session-total.test.tsx` gained a
  dedicated test that `vi.spyOn`s the REAL (unmocked in that file) `lib/hierarchy.ts#fetchHierarchy` and
  renders the full connected popup, asserting the spy is never called. This is the direct measurement
  Task 9/D-7.5-17 ask for, rather than relying on the implicit proof that `fetchHierarchy` would otherwise
  crash against this file's `jiraGet`-less `@/lib/jira-client` mock.
- **Task 9 — why a green suite is not proof here:** `TicketPicker.test.tsx` mocks `@/lib/ticket-search`
  wholesale and `WeeklyGrid.test.tsx` mocks `TicketPicker` away entirely (both pre-existing, per the
  story's own investigation) — neither test suite would notice a change to the ACTUAL rendered behaviour
  of `TicketPicker` inside `WeeklyGrid`, only to their own mocked seams. The real proof used here is
  structural and additive: (1) `git diff 2d1c30f` on `TicketPicker.tsx`, `lib/ticket-search.ts`,
  `SearchPanel.tsx`, `useTicketSearch.ts`, `lib/hierarchy.ts`, `lib/manager-matrix.ts`, and
  `lib/storage/pinned-tickets.ts` all produce empty output — nothing on the week surface's dependency
  graph was edited at all, so there is nothing for a shared-seam regression to hide behind a mock in; (2)
  all three named week-surface test files pass **unmodified** (if any had needed editing to keep passing,
  that itself would be the signal of a leak, per the story's explicit "stop and escalate" instruction).
- **Deviation — `App.session-total.test.tsx`'s original "logging an entry does not double-count" and
  "D-7.4-18" tests both drove their log step through `TicketPicker` (`"Pick PROJ-2: Fix button"`), which
  this story deletes from the popup.** Rewrote both to log through the surviving mechanisms instead — the
  double-count test now uses "Recently worked"'s `+` (mirroring AC1's own replacement), and the D-7.4-18
  test now uses `SearchPanel` (since it specifically needs a ticket distinct from the already-shown
  "Recently worked"/resume ticket to avoid an unrelated text-collision risk). Both keep the SAME hazard
  coverage the original tests existed to guard (double-count / hidden-wrapper unmount), just via a
  different UI entry point. No `TicketPicker`-dependent mocks (`useHierarchyTickets`, `pinned-tickets`,
  `ticket-search`, `create-subtask`, `catch-all`) remain in this file — none of those modules are reachable
  from the real, unmocked `TodayView` any more.
- **No AC/task deviations beyond the above.** `D-7.5-15` through `D-7.5-25` (the creator's own investigated
  decisions) and `D-7.5-11` through `D-7.5-14` (the orchestrator/owner rulings in
  `epic-7-decision-log.md`) were all followed as written; none required a fresh escalation during
  implementation.

### File List

**New:**
- `hooks/useRecentlyWorked.ts`
- `hooks/useRecentlyWorked.test.ts`
- `components/today/RecentlyWorked.tsx`
- `components/today/RecentlyWorked.test.tsx`
- `lib/dom/text-entry.ts`
- `lib/dom/text-entry.test.ts`

**Modified:**
- `components/today/TodayView.tsx`
- `components/today/TodayView.test.tsx`
- `components/today/LoggedToday.tsx`
- `components/today/LoggedToday.test.tsx`
- `entrypoints/popup/App.tsx`
- `entrypoints/popup/App.session-total.test.tsx`

**Verified untouched (byte-identical to `2d1c30f`):**
- `components/today/TicketPicker.tsx`
- `lib/ticket-search.ts`
- `components/today/SearchPanel.tsx`
- `hooks/useTicketSearch.ts`
- `lib/hierarchy.ts`
- `lib/manager-matrix.ts`
- `lib/storage/pinned-tickets.ts`
- `components/today/TicketPicker.test.tsx`
- `components/today/TicketPicker.search-jql.test.tsx`
- `components/week/WeeklyGrid.test.tsx`

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-26 | 0.1 | Story created `ready-for-dev` at baseline `2d1c30f`. Investigated inline: `pinnedTickets` survives via `WeeklyGrid → TicketPicker` and is kept unchanged (D-7.5-15); "Recently worked" reads the already-fetched `['week-worklogs']` query at zero network cost (D-7.5-16); removing the picker takes up to 3 searches off first paint, so the assigned count is an escalation (D-7.5-17); delete is deferred-not-optimistic with an outbox teardown flush (D-7.5-18); `EXPERIENCE.md`'s "`+` seeds the resume card" conflicts with owner ruling D-7.3-9 and is escalated (D-7.5-19); `⌘Z` capture inverts 7.4's `/` polarity (D-7.5-20). Baseline re-measured: 89 files / 1115 passed / 1 skipped, exit non-zero from one known `ManagerView.test.tsx` unhandled rejection. IDs above D-7.5-10 were meant to be reserved for later orchestrator/owner rulings so the creator's own IDs could never collide (the defect D-7.3-11 had to clean up) — in the event, the owner rulings landed as D-7.5-11..14 anyway, and this file's own local D-7.5-1..10 (including this note's own now-stale "D-7.5-20" reference) were later folded into the canonical decision log as D-7.5-15..25 by the finisher, which is what every citation elsewhere in this file now points to. | bmad-story-creator |
| 2026-07-26 | 1.0 | Dev complete, status → `review`. Applied D-7.5-11..14 (owner/orchestrator rulings) exactly: the `+` opens `QuickLogForm` and never touches the resume card; the handoff row drops the count entirely; "Recently worked" renders up to 4 rows, never padded; `UNDO_WINDOW_MS = 5000`. All 10 tasks complete. `TicketPicker.tsx`/`lib/ticket-search.ts`/`SearchPanel.tsx`/`useTicketSearch.ts`/`lib/hierarchy.ts`/`lib/manager-matrix.ts`/`lib/storage/pinned-tickets.ts` byte-identical to baseline; `WeeklyGrid.test.tsx`/`TicketPicker.test.tsx`/`TicketPicker.search-jql.test.tsx` pass unmodified. New: `hooks/useRecentlyWorked.ts`, `components/today/RecentlyWorked.tsx`, `lib/dom/text-entry.ts` (+ tests). Rebuilt `LoggedToday.tsx`'s delete flow to deferred+undo and its row anatomy to the KKP two-line spec. `pnpm compile`/`lint`/`build` all clean; `pnpm test` 92 files / 1169 passed / 1 skipped (baseline 89/1115/1), same single pre-existing `ManagerView.test.tsx` unhandled rejection. One mid-implementation regression (a second unhandled rejection from a dropped `last-logged` mock in the rewritten `TodayView.test.tsx`) found and fixed before completion — see Debug Log References. | bmad-story-developer |
| 2026-07-26 | 1.1 | Review findings resolved, status → `done`. 6 findings (1 Blocker / 2 Major / 1 Minor / 2 Nit), all 6 FIX, 0 dismissed, 0 deferred — see "Finding Resolutions" below the frozen review section for the full triage and RED→GREEN proof for each. Headline fix: `LoggedToday.tsx`'s delete/undo now tracks in-flight DELETEs via a `committingIds` set (added synchronously before dispatch, cleared only on settle) so a row stays hidden — and its Undo affordance inert — for the ENTIRE Jira round-trip, not just the undo countdown; the same mechanism closes the teardown-flush gap (Finding 4). Both `App.tsx`'s and `TodayView.tsx`'s pending-deletion seconds filters were already correct and needed no production change — only real test teeth (Findings 2/3), proved by asserting the RENDERED chrome-header figure via the real composition root instead of a callback. Folded the story's own local `D-7.5-1..10`/`D-7.5-5a` into `epic-7-decision-log.md` as canonical `D-7.5-15..25` (D-7.3-11 pattern) and repointed every citation outside the reviewer's frozen section. `pnpm compile`/`lint`/`build` all clean; `pnpm test` 92 files / 1174 passed / 1 skipped (net +5 tests over the dev baseline of 92/1169/1, 0 new files), same single pre-existing `ManagerView.test.tsx` unhandled rejection and no second one introduced. Re-confirmed all 7 byte-identity claims (`TicketPicker.tsx`, `lib/ticket-search.ts`, `SearchPanel.tsx`, `useTicketSearch.ts`, `lib/hierarchy.ts`, `lib/manager-matrix.ts`, `lib/storage/pinned-tickets.ts`) plus `WeeklyGrid.tsx`/`WeeklyGrid.test.tsx`/`TicketPicker.test.tsx`/`TicketPicker.search-jql.test.tsx` — all still empty-diff against `2d1c30f`. | bmad-story-finisher |

---

## Review Findings

## Review Summary

- **Reviewed by:** bmad-code-reviewer
- **Date:** 2026-07-26
- **Story Status Recommendation:** **Changes Requested**
- **Blockers:** 1
- **Majors:** 2
- **Minors:** 1
- **Nits:** 2

### Gates — re-measured by the reviewer, not taken on trust

| Gate | Dev claim | Reviewer-measured | Verdict |
|---|---|---|---|
| `pnpm test` | 92 files / 1169 passed / 1 skipped | **92 files / 1169 passed / 1 skipped**, exit 1 (`ELIFECYCLE`) | ✅ exact match |
| Unhandled rejections | exactly 1, pre-existing | **exactly 1** — `TypeError: Cannot read properties of undefined (reading 'runtime')` at `@wxt-dev/storage` `getStorageArea`, originating in `components/manager/ManagerView.test.tsx` | ✅ the documented baseline race; **no second rejection**. The mid-implementation `last-logged` mock restoration did not paper over a product issue — the real `QuickLogForm` genuinely calls `setLastLoggedTicket`, and the mock mirrors the original file's own pre-existing mock |
| Delta vs baseline (89 / 1115 / 1) | +3 files / +54 tests | **+3 files / +54 passed / +0 skipped** | ✅ no drop below 1115 |
| `pnpm compile` | clean | `tsc --noEmit` exit 0, no output | ✅ |
| `pnpm lint` | 0 errors | **0 errors, 42 warnings** (all `import/order`, warn-level) | ✅ exact match |
| `breaksHeaderBaseline` untouched | untouched | line extracted at both revisions → **IDENTICAL** (`const breaksHeaderBaseline = connected && resume.status !== 'none';`), still exactly one line | ✅ |
| Byte-identity claims | 7 files empty-diff | `git diff 2d1c30f -- <path> \| wc -c` = **0** for all of `TicketPicker.tsx`, `lib/ticket-search.ts`, `SearchPanel.tsx`, `useTicketSearch.ts`, `lib/hierarchy.ts`, `lib/manager-matrix.ts`, `lib/storage/pinned-tickets.ts` — **plus** `TicketPicker.test.tsx`, `TicketPicker.search-jql.test.tsx`, `WeeklyGrid.test.tsx`, **and `WeeklyGrid.tsx`, `QuickLogForm.tsx`, `ResumeCard.tsx`, `lib/storage/outbox.ts`** which I checked in addition | ✅ every claim verified, none overstated |
| Fenced Epic 6.3 files | not this story's | untouched by review; excluded from every diff | ✅ |

**Every headline number in the Dev Agent Record is accurate.** The findings below are not about the gates.

### NFR1 first-paint claim — reviewer's own verdict: **the win is real, but the developer's proof of it is vacuous**

The claim is **TRUE**, and I verified it structurally rather than by test. I computed the popup entrypoint's full transitive import closure from `entrypoints/popup/main.tsx` (44 modules). `TicketPicker`, `hooks/useHierarchyTickets`, `lib/hierarchy`, `lib/catch-all`, `lib/create-subtask`, `lib/manager-matrix` and `lib/storage/pinned-tickets` are **all absent from it**. `useHierarchyTickets` is now imported by exactly one module (`TicketPicker.tsx`), which is imported by exactly one module (`WeeklyGrid.tsx`), which the popup never reaches. The three sequential `fetchHierarchy` searches are genuinely off the popup's first-paint path — directly and transitively. **D-7.5-12's "a story task should verify this rather than assume it" is satisfied.**

Correcting the review brief on one point: the developer **did** report an NFR1 measurement (Completion Notes, "D-7.5-3 (NFR1 win, measured not assumed)"). It is, however, **worth nothing as a proof**: `App.session-total.test.tsx:512` asserts `expect(fetchHierarchySpy).not.toHaveBeenCalled()` — a pure absence assertion, which is equally satisfied by a popup that renders nothing at all, by a spy that fails to intercept the direct ESM binding, or by any future refactor that reintroduces the call behind a lazy mount the test does not await. It cannot fail for the right reason. The import-closure check above is the proof; the test is not. Not filed as a finding (the underlying claim is true and I verified it independently), but do not treat that test as the guard.

### Teeth verification — 11 mutations + 2 hostile-case probes, applied, run, and reverted

Every mutation was applied to the working tree, the suite run, then restored from a pre-review scratchpad copy (never `git checkout`, which would have destroyed the story's uncommitted work) and **md5-verified** against the pre-review hash. Final `git status --porcelain` is **21 entries, byte-identical to the pre-review file set**.

| # | Mutation | Result | Meaning |
|---|---|---|---|
| A | strip the `pendingDeletionId` filter from **all three** shell sums in `App.tsx` | **GREEN — full 92-file suite, 1169 passed** | ❌ **zero teeth** → Finding 2 |
| B | strip the `pendingDeletionId` filter from `TodayView`'s `totalSeconds` | **GREEN — `TodayView.test.tsx` 16/16** | ❌ **zero teeth** → Finding 3 |
| C | `RecentlyWorked` renders an empty card at zero items | **RED** (2 files) | ✅ D-7.5-13 zero-case genuinely pinned |
| D | `MAX_RECENTLY_WORKED` 4 → 6 | **RED** | ✅ the 4-cap genuinely pinned |
| E | `UNDO_WINDOW_MS` 5000 → 3000 | **RED** | ✅ D-7.5-14 genuinely pinned (fake-timer test is real) |
| F | remove `clearTimeout` from `cancelPendingDeletion` | **GREEN — 31/31** | ⚠️ the *behaviour* is still pinned by the `pendingRef` guard; only the test's stronger claim is not → Nit 5 |
| G | `isTextEntryElement` → always `false` (⌘Z captures inside inputs) | **RED** (11 failures) | ✅ D-7.5-5a fall-through genuinely pinned |
| H | handoff-row `onClick` → no-op | **RED** (2 files) | ✅ the D-7.4-26 seam call genuinely pinned |
| I | the `+` retargets the write to the freshest (= resume card's) ticket | **RED** | ✅ **the D-7.5-11 test has real teeth** on the write target |
| J | drop `min-w-0` from **both** lists | **RED** (2 files) | ✅ AC6's load-bearing class genuinely pinned |
| K | drop the `h-[52px]` fixed row height from **both** lists | **RED** (2 files) | ✅ AC6 fixed-height genuinely pinned |
| P1 | **probe:** commit the delete against a `deleteWorklog` that never settles | row **re-appears**, delete button live, second click → **2 DELETE calls** | ❌ → **Finding 1 (Blocker)** |
| P2 | **probe:** `visibilitychange`→hidden (outbox flush) → visible → click Undo | undo still offered, row restored, outbox entry **still queued** | ❌ → Finding 4 |

**Contrast to Story 7.3 (5 toothless tests) and 7.4 (1):** 9 of the 11 mutations reddened. The teeth on this story are, on the whole, materially better — the failures are concentrated in exactly one place, the seconds derivation.

### Hand-computed contrast (the axe harness has `color-contrast` disabled — 7.2's lesson)

Relative luminance per WCAG 2.1 from the raw hex in `styles/globals.css`. Every text pair introduced or changed by this story:

| Pair | Ratio | Verdict |
|---|---|---|
| `muted #6b6678` on `surface #ffffff` (summary line, empty-state L1, handoff row) | **5.53 : 1** | ✅ AA |
| `muted #6b6678` on `background #fafafb` (row hover) | **5.30 : 1** | ✅ AA |
| `faint #6b6b72` on `surface #ffffff` (eyebrow heading, recency note, empty-state L2 — 11 px, so normal-text threshold applies) | **5.29 : 1** | ✅ AA |
| `faint #6b6b72` on `background #fafafb` | **5.07 : 1** | ✅ AA |
| `primary #594f74` on `surface #ffffff` (ticket key) | **7.51 : 1** | ✅ AA (and AAA) |
| `primary #594f74` on `primary-soft #ecebf3` (count pill) | **6.35 : 1** | ✅ AA |
| `foreground #1e1b2e` on `surface #ffffff` (hours) | **≈ 15.9 : 1** | ✅ AAA |
| `state-danger #dc2626` on `surface #ffffff` (refused-delete chip, `font-medium`) | **4.83 : 1** | ✅ AA (pre-existing token) |

**No contrast finding.** Status never reads from colour alone: the undo affordance carries the visible text "Undo" beside `Undo2`; the refused-delete and pending chips both carry full sentences; delete both the icon and the colour and every state still reads from text.

### Standing Epic 7 gates — measured

| Gate | Measured | Verdict |
|---|---|---|
| Exactly ONE scroll region | only `App.tsx:250` carries `overflow-y-auto`. Both new lists use `overflow-hidden` (clipping, not scrolling) | ✅ |
| No monospace anywhere | `grep font-mono` across all four story files → **zero hits**; all three baseline usages removed | ✅ |
| Zero new colour values | `grep -E '#[0-9A-Fa-f]{3,8}'` across all four story files → **zero raw hex**; every class resolves to an existing token | ✅ |
| `lucide-react` only, 11–13 px, `aria-hidden` | `Plus`/`Pencil`/`Trash2`/`Undo2` all `h-[13px] w-[13px] aria-hidden="true"` | ✅ |
| `ring-focus` via `focus-within:`/`focus-visible:`, never static | 7 occurrences, all prefixed; zero static | ✅ |
| Red fires only for a refused write | correct in the `commitDeletion` branch — **but see Finding 1**, which produces a red chip for a *duplicate* delete of a worklog that was in fact deleted successfully | ⚠️ |
| Scope discipline — no 7.6 vocabulary | `grep -i 'time off\|day status'` across story files → zero. PTO is not renamed | ✅ |
| Scope discipline — 7.4 truncation off-by-one not adopted | `SearchPanel.tsx` and `useTicketSearch.ts` byte-identical; D-7.5-10 honoured | ✅ |
| Shared-seam containment | `TicketPicker.tsx`, `lib/ticket-search.ts`, `WeeklyGrid.tsx`, `pinned-tickets.ts` all empty-diff; `lib/ticket-search.ts`'s conservative default branch (D-7.4-15) untouched; **no new code writes `addPinnedTicket`** | ✅ |

**On the week surface specifically:** the review brief is right that a green suite proves nothing here (`TicketPicker.test.tsx:23` mocks `@/lib/ticket-search` wholesale; `WeeklyGrid.test.tsx:11` mocks `TicketPicker` away). I did not rely on it. The proof is that **nothing on the week surface's dependency graph was edited at all** — `WeeklyGrid.tsx`, `TicketPicker.tsx`, `lib/ticket-search.ts`, `lib/hierarchy.ts`, `lib/manager-matrix.ts`, `lib/storage/pinned-tickets.ts`, `lib/create-subtask.ts` and `lib/catch-all.ts` are every one byte-identical to `2d1c30f`, so there is no changed behaviour for a mock to hide. This is the fourth epic-7 story at risk of the leak and the **first with a clean structural answer**.

---

### Finding 1: The deleted row re-appears for the whole in-flight DELETE, and a second click issues a duplicate irreversible DELETE

- **Severity**: **Blocker**
- **Category**: Correctness (money path)
- **Location**: `components/today/LoggedToday.tsx:298-304` (undo-window timer callback) with `:371-373` (`visibleEntries`)
- **Related AC**: AC4; D-7.5-4; standing "red only for a refused write" rule
- **Observation**: the timer callback calls `setPendingBoth(null)` **before** `commitDeletion(toCommit)`. `commitDeletion` dispatches an async `deleteWorklog` mutation, but `pending` is already `null`, so React re-renders with `visibleEntries` no longer filtering the entry. The row is therefore back on screen — with live Edit and Delete buttons and **no** undo affordance — for the entire duration of the Jira DELETE round-trip, and only vanishes when `onDeleted` fires in `onSuccess`. Proved with probe P1 (a `deleteWorklog` that never settles): `rowVisibleDuringFlight=true`, `deleteButtonClickableAgain=true`, and a second click on the re-appeared Delete button produced **`deleteWorklog` call count = 2** for the same `('PROJ-1', '10001')`. The whole suite is blind to this because every `deleteWorklogMock` resolves in the same tick, so React never commits an intermediate render.
- **Impact**: three separate failures on this story's headline feature, on **every real delete** (a Jira round-trip is never instantaneous). (1) AC4's *"it is removed immediately"* is broken — the user watches the row come back 5 s after deleting it. (2) The chrome header figure drops on click, **jumps back up at commit without any undo**, then drops again — the exact disagreement D-7.5-4 forbids in as many words (*"and come back on undo — otherwise the figure disagrees with the visible list"*). (3) A second click is the natural user response to a row that reappears; it issues a duplicate DELETE whose `not-found` result is mapped at `:266` to the **persistent red chip**, so red fires for a write Jira did **not** refuse — a direct breach of the standing Epic 7 red rule, on a worklog that was in fact deleted successfully.
- **Suggested Resolution**: hold the pending/hidden state until the mutation settles rather than clearing it at dispatch. Either keep `pending` set and clear it in `commitDeletion`'s `onSuccess`/`onError` (suppressing only the undo affordance once the window expires, so undo is no longer offered for an in-flight write), or add an explicit `committing` id that `visibleEntries` also filters on. Pin it with a test whose `deleteWorklog` returns a deferred promise, asserting the row is still absent between dispatch and resolution.

### Finding 2: The shell's pending-deletion seconds filter has zero test teeth — the entire 92-file suite passes without it

- **Severity**: **Major**
- **Category**: Tests
- **Location**: `entrypoints/popup/App.tsx:81-86` (`ptoSeconds` / `resumeSeconds` / `searchSeconds`)
- **Related AC**: AC4; D-7.5-4 ("the easiest thing in the story to get half-right; test it explicitly"); D-7.5-14 Consequences
- **Observation**: I removed the `.filter((e) => e.worklogId !== pendingDeletionId)` from **all three** shell sums and ran the full suite: **92 files / 1169 passed / 1 skipped** — completely green, identical to the unmutated run. No test anywhere exercises the chrome header figure while an *externally-owned* entry (a PTO, resume-card or search-driven row) is pending deletion. The tests that look like they cover this — `LoggedToday.test.tsx:506` and `TodayView.test.tsx:341` — assert only that the `onPendingDeletionChange` **callback** fires with the right id. That is a tooth on the wire, not on the consumer: both stay green while `App.tsx` receives the id and ignores it.
- **Impact**: the code is correct today — I read it and it is right — but the single clause that both D-7.5-4 and D-7.5-14 single out by name as the thing to test explicitly is entirely unguarded. Deleting a PTO or search-logged row and having the header keep counting its hours is a silent wrong-number bug on the chrome figure, and the next story to touch `App.tsx`'s sums will ship the regression green. Correct-but-unpinned on a named deliverable.
- **Suggested Resolution**: add one integration test in `entrypoints/popup/App.session-total.test.tsx` that logs an entry through a shell-owned list (the existing search-driven or PTO path), deletes it, and asserts the chrome header figure drops **immediately** (before the undo window elapses) and is restored by Undo. Assert on the rendered figure text, not on the callback.

### Finding 3: `TodayView`'s own pending-deletion filter is also unpinned — the test that claims to cover it is satisfied by the mount-time call

- **Severity**: **Major**
- **Category**: Tests
- **Location**: `components/today/TodayView.test.tsx:214`; guards `components/today/TodayView.tsx:193-195`
- **Related AC**: AC4; D-7.5-4
- **Observation**: the assertion is `expect(onTotalChange).toHaveBeenCalledWith(0)`, immediately after the delete click, under a comment reading *"the total drops IMMEDIATELY on delete-request"*. But `onTotalChange(0)` is **already called at mount**, before anything is logged (empty `loggedEntries` → `totalSeconds` 0 → the `useEffect` fires). `toHaveBeenCalledWith` matches **any** historical call, so the mount-time `0` satisfies it forever. I removed the `.filter((e) => e.worklogId !== pendingDeletionId)` from `TodayView`'s `totalSeconds` and `TodayView.test.tsx` stayed **green at 16/16** — the post-delete call was `28800`, not `0`, and no assertion noticed.
- **Impact**: combined with Finding 2, **both halves** of D-7.5-4's seconds-derivation requirement are unguarded, so the story's Completion Notes claim that it "is exercised end-to-end (not just at the unit level) in `TodayView.test.tsx`" is not true of either half. One character of test code separates a real guard from a vacuous one.
- **Suggested Resolution**: change to `expect(onTotalChange).toHaveBeenLastCalledWith(0)` (and audit the sibling `toHaveBeenCalledWith` assertions at `:191` and `:200` for the same trap, where a distinct non-zero value makes them safe). Confirm the fix by re-running the mutation — it must go RED.

### Finding 4: Undo stays offered and functional after the teardown flush has already committed the delete to the outbox

- **Severity**: **Minor**
- **Category**: Correctness
- **Location**: `components/today/LoggedToday.tsx:346-358` (`flush`)
- **Related AC**: AC4; D-7.5-4 (teardown flush)
- **Observation**: `flush()` clears the timeout and enqueues the delete to the Story 2.7 outbox, but never clears `pending`. If the document survives the `visibilitychange`→hidden that triggered the flush, the undo affordance is still on screen and still live. Probe P2: after hidden→visible, `undoStillOfferedAfterFlush=true`, clicking Undo gave `rowRestoredByUndo=true` while the outbox entry **remained queued** — the UI reports the delete undone and the service worker's `outbox-retry` alarm deletes the worklog anyway.
- **Impact**: this is precisely the *"silent data-integrity lie … worse than any confirm dialog"* D-7.5-4 was written to prevent, merely arrived at from the other direction. **Honest reachability assessment:** I could not find a production path. `openFullPage` opens `fullpage.html`, not `popup.html`, so the popup is only ever the action popup, where hidden effectively means teardown and the document does not come back. Hence Minor, not Blocker — a latent hazard, not a shipping bug. It becomes real the moment the popup surface is ever hosted somewhere that survives being hidden.
- **Suggested Resolution**: have `flush()` also call `setPendingBoth(null)` (or set a `flushed` flag that renders the undo affordance inert), so undo can never contradict a delete already handed to the outbox. `flushedForRef` already tracks which entry was flushed — gate `cancelPendingDeletion` on it.

### Finding 5: `LoggedToday.test.tsx:347` cannot distinguish "timer cancelled" from "timer fired but guarded"

- **Severity**: **Nit**
- **Category**: Tests
- **Location**: `components/today/LoggedToday.test.tsx:358-365`; guards `components/today/LoggedToday.tsx:314`
- **Observation**: the test comments that letting the window elapse after Undo proves *"the timer was genuinely cancelled, not merely hidden"*. Removing `clearTimeout(current.timeoutId)` from `cancelPendingDeletion` leaves `LoggedToday.test.tsx` **green at 31/31**, because the timer callback's own `pendingRef.current?.entry.worklogId === entry.worklogId` guard independently suppresses the delete.
- **Impact**: none to correctness — the safety property (undo ⇒ zero Jira traffic) genuinely holds, and is genuinely pinned, just by the ref guard rather than by `clearTimeout`. Only the comment's stronger claim is unsupported. Recorded so it is not mistaken for a proof that the cancellation path itself is guarded.
- **Suggested Resolution**: soften the comment, or add a `vi.spyOn(globalThis, 'clearTimeout')` assertion if the cancellation mechanism is worth pinning separately. No production change.

### Finding 6: Task 7's rationale for the ⌘Z text-entry cases is factually wrong (the code is correct)

- **Severity**: **Nit**
- **Category**: Maintainability (story/comment accuracy)
- **Location**: story Task 7 bullet 4; guards `components/today/LoggedToday.tsx:325-336`
- **Observation**: the story states the resume-hour-input and search-field cases are *"structurally impossible from `LoggedToday`, since its `⌘Z` listener is scoped to this component"*. The listener is **not** component-scoped — it is `document.addEventListener('keydown', onKeyDown)` at `:334`, so it does observe keystrokes originating in `ResumeCard`'s and `SearchPanel`'s inputs. The behaviour is nonetheless correct: `isTextEntryElement` returns `true` for `type="number"`, `"text"`, `"date"` and `"search"` alike (none are in `TEXT_INPUT_EXCLUDED_TYPES`), so ⌘Z correctly falls through in all of them.
- **Impact**: none functionally. But the stated reason is the kind a later reader relies on when deciding whether a new input needs consideration — and it would lead them to the wrong conclusion. The real guarantee is the predicate, not the listener's scope.
- **Suggested Resolution**: correct the wording to "the document-level listener does see these inputs; `isTextEntryElement` is what makes ⌘Z fall through in them", and consider adding the two missing cases (focus in `ResumeCard`'s hour input; focus in `SearchPanel`'s query field) to the ⌘Z test table, since the listener genuinely reaches them.

---

### Checked and explicitly NOT filed (recorded so they are not re-litigated)

- **`RecentlyWorked` is swapped out for `QuickLogForm` when a ticket is selected** (`TodayView.tsx:246-261`), which briefly hides the handoff row. This is **faithful to the baseline** — `git show 2d1c30f:components/today/TodayView.tsx` shows `TicketPicker` sat in the *identical* ternary against `QuickLogForm`. Not a regression, not a deviation from D-7.5-7.
- **`useRecentlyWorked`'s PTO flicker** — `ptoKey` starts `null` and resolves asynchronously, so the time-off subtask can appear for one tick before being filtered. `hooks/useResumeTicket.ts:121-129` uses the *identical* `useState<string|null>(null)` + `getValue().then` shape, so this is the established repo pattern D-7.5-2 told the dev to mirror, not a new defect.
- **Zero recent tickets removes the handoff row along with the section.** D-7.5-13 requires this case be *specified rather than left to fall out of the code*; Task 3 specifies it ("Hide the whole section when there are zero rows"), `RecentlyWorked.tsx:70-72` implements it with a decision-citing comment, and mutation C proves it is pinned. Search remains reachable via `SearchPanel`, so it is not a dead end. Satisfied.
- **Edit/delete buttons are `opacity-0` until hover/focus** — they remain hit-testable, screen-reader reachable, and `focus-visible:opacity-100` reveals them on keyboard focus. AC3 asks for them "rendered directly" (i.e. not behind the `MoreHorizontal` popover), which is satisfied. No WCAG 2.1 AA rule requires persistent visibility.
- **`expect(card?.className).not.toContain('#DEDCE9')`** (`LoggedToday.test.tsx`) is vacuous — a `className` can never contain a hex literal. Harmless; the meaningful assertions (`border-dashed`, `border-border`) sit beside it.
- **AC6 cannot be visually proved under jsdom** and the developer did not claim otherwise. Both AC6 tests assert the *CSS contract* (`min-w-0` on the flex column, `truncate` on the summary, a fixed `h-[…]` row) and say so in a comment. Mutations J and K prove both halves of that contract are pinned. Judged from the contract: with `min-w-0` present on the `flex-1 flex-col` column and `truncate` on the summary span, an 80-character summary will ellipsise without displacing the key. That is the strongest honest verdict available without a real layout engine; I make no claim of a visual proof.

### Escalations needing an owner ruling

**None.** All four owner/orchestrator rulings (D-7.5-11 … D-7.5-14) are implemented as written, and I found no place where the developer partially implemented the overruled `EXPERIENCE.md:140` behaviour:

- **D-7.5-11** — the `+` calls `onSelectTicket` → `TodayView.handleSelect` → `setSelectedTicket` → `QuickLogForm`. `TodayView` neither receives nor references any resume-card state; the card lives two levels up in `App.tsx` and `useResumeTicket` reads storage once on mount. **D-7.3-9 is preserved by construction**, the `+` cannot change the card's subtask, pre-fill or write target by any route including re-render or a `lastLoggedTicket` write, and mutation I confirms the guarding test has real teeth on the write target. This is *not* a repeat of 7.3's blocker or 7.4's near-miss.
- **D-7.5-12** — the row reads exactly `More assigned tickets · Search to find them →`, no number anywhere, no count pill on the heading carrying an assigned total, and no new query was added. It calls the 7.4 seam (`onRequestSearchFocus` → `App.tsx handleRequestSearchFocus` → `searchPanelRef.current?.focus()`); no second focus path was invented.
- **D-7.5-13** — up to four, never padded, no section at zero; 0 / 1 / 4+ all covered and all three proved to have teeth (mutations C and D).
- **D-7.5-14** — `UNDO_WINDOW_MS = 5000`, named and exported, pinned by a genuine fake-timer test (mutation E is RED).

---

## Finding Resolutions

Applied by the bmad-story-finisher. Everything above this line (from "## Review Findings" onward) is the
reviewer's own verbatim, frozen record — it is left untouched, including its citations of the story's
OLD local decision numbering (`D-7.5-1` … `D-7.5-10`, `D-7.5-5a`). Those numbers have since been folded
into `epic-7-decision-log.md` as canonical `D-7.5-15` … `D-7.5-25` (mapping table below) — everywhere
else in this file, and in every touched source file, now cites the canonical ID.

### Decision-ID renumbering (D-7.3-11 pattern)

| Story-local ID (as the reviewer's text above still shows it) | Canonical ID (used everywhere else) |
|---|---|
| D-7.5-1 | D-7.5-15 |
| D-7.5-2 | D-7.5-16 |
| D-7.5-3 | D-7.5-17 |
| D-7.5-4 | D-7.5-18 |
| D-7.5-5 | D-7.5-19 |
| D-7.5-5a | D-7.5-20 |
| D-7.5-6 | D-7.5-21 |
| D-7.5-7 | D-7.5-22 |
| D-7.5-8 | D-7.5-23 |
| D-7.5-9 | D-7.5-24 |
| D-7.5-10 | D-7.5-25 |

`D-7.5-11` … `D-7.5-14` (the owner/orchestrator rulings) were already canonical and are unchanged.

### Finding 1 — Blocker — FIX

**Decision: FIX.** A money-path correctness bug on the story's headline feature, proven with the
reviewer's own never-settling-promise probe. No plausible reading makes this DISMISS or DEFER.

**Fix**: `components/today/LoggedToday.tsx` — added a `committingIds: ReadonlySet<string>` state (plus a
ref mirror, `committingIdsRef`, for synchronous reads inside callbacks) tracking worklog ids whose DELETE
has been dispatched but not yet settled. `commitDeletion` now adds the id to `committingIds`
**synchronously, before** calling `deleteMutation.mutate`, and removes it only in `onSuccess`/`onError`
(clearing `pending` there too, guarded so a later, different pending entry is never disturbed).
`visibleEntries` filters on `pending?.entry.worklogId` **and** `committingIds`, so a row stays out of the
list for the entire in-flight period, not just the undo countdown. `cancelPendingDeletion` is now a no-op
once the entry is committing (nothing left to cancel), and the Undo button itself is hidden in that state
so there is no live-looking dead control.

**Proof**: `components/today/LoggedToday.test.tsx`, new test "the row stays hidden for the ENTIRE
in-flight DELETE, and a second DELETE of the same worklog is structurally impossible (Finding 1)" —
mocks `deleteWorklog` with a never-settling promise (the reviewer's exact P1 probe), advances past
`UNDO_WINDOW_MS`, and asserts the row is absent, the Delete button does not exist (so a second click is
structurally impossible, not merely discouraged), and `deleteWorklog` was called exactly once.
**RED-proved**: temporarily restored the pre-fix file (cp-backup swap, never `git checkout`, md5-verified
before/after) and confirmed the new test fails exactly as the reviewer described (`expected <span> to be
null`, i.e. the row is back); restored the fix and confirmed 32→33 tests green.

### Finding 2 — Major — FIX

**Decision: FIX.** The reviewer proved the shell's own `App.tsx` code is correct but entirely unguarded —
exactly the "correct-but-unpinned on a named deliverable" case this workflow treats as FIX, not DISMISS.

**Fix**: no production change — `entrypoints/popup/App.tsx`'s three `.filter((e) => e.worklogId !==
pendingDeletionId)` clauses were already correct (confirmed by re-reading them and by the RED-proof
below).

**Proof**: `entrypoints/popup/App.session-total.test.tsx`, new describe block "App — the shell seconds
filter drops the figure immediately on delete and restores on Undo (Review Finding 2)" — drives the real
composition root, logs a `searchEntries`-owned ticket via `SearchPanel`, deletes it, and asserts the
**rendered chrome-header figure text** (via the file's existing `figureText()` helper) drops immediately
and is restored by Undo — never the `onPendingDeletionChange` callback alone, which is exactly the trap
the reviewer named. **RED-proved**: stripped the three `.filter(...)` clauses from `App.tsx` (cp-backup,
md5-verified restore), confirmed the new test fails (`expected '2.5 / 8h' to match /^1\.0/`), restored and
confirmed 7→8 tests green.

### Finding 3 — Major — FIX

**Decision: FIX.** Same class as Finding 2 — a named deliverable ("test it explicitly", D-7.5-18) with a
test that could not fail for the right reason.

**Fix**: `components/today/TodayView.test.tsx:222` — `expect(onTotalChange).toHaveBeenCalledWith(0)` →
`toHaveBeenLastCalledWith(0)`. Audited the sibling assertions the reviewer flagged (now at lines ~198 and
~207, values `14400` and `28800`) — both are distinct non-zero values that only ever appear once in each
test's call history, so they are genuinely safe as `toHaveBeenCalledWith` and were left unchanged, per the
reviewer's own note.

**Proof**: **RED-proved** by stripping `.filter((e) => e.worklogId !== pendingDeletionId)` from
`TodayView.tsx`'s `totalSeconds` (cp-backup, md5-verified restore) — the corrected assertion failed
exactly as expected (`expected last "spy" call to have been called with [ +0 ], received [ 28800 ]`);
restored and confirmed 16/16 green.

### Finding 4 — Minor — FIX

**Decision: FIX**, not DEFER, despite the reviewer's own "latent hazard, not a shipping bug" framing. Per
this workflow's standing rule that a security/data-integrity finding defaults to FIX unless dismissing it
is clearly correct: the reviewer's own text calls this "precisely the silent data-integrity lie … D-7.5-4
[now D-7.5-18] was written to prevent, merely arrived at from the other direction" — that is a
data-integrity classification, not a cosmetic one, and the fix is cheap (it reuses the exact
`committingIds` mechanism Finding 1 already added) and reachability being currently unproven does not mean
reachability is impossible in a Chromium extension across manifest/host changes.

**Fix**: `components/today/LoggedToday.tsx`'s `flush()` (the `pagehide`/`visibilitychange` teardown
handler) now also adds the entry's worklog id to `committingIds` after enqueueing to the outbox — reusing
Finding 1's mechanism rather than inventing a second one. This keeps the row hidden and makes
`cancelPendingDeletion` a no-op (and hides the Undo button) if the popup ever survives being hidden,
without needing to clear `pending` (which would have let the row reappear while the outbox entry was
still queued — the same class of bug as Finding 1, from the other direction).

**Proof**: `components/today/LoggedToday.test.tsx`, new test "after the teardown flush, Undo is gone
(inert) — it can never contradict a delete already queued to the outbox" — reproduces probe P2, dispatches
`pagehide`, and asserts the Undo affordance and the row are both gone. **RED-proved**: temporarily removed
the `setCommittingIds` call from `flush()` (inverse-Edit, not a file swap this time), confirmed the new
test failed exactly as probe P2 described (Undo still rendered), restored and confirmed 33/33 green. Also
fixed an `act()` warning this change surfaced in the pre-existing "teardown (pagehide)" test — the raw
`window.dispatchEvent` there now needs an explicit `act()` wrapper since `flush()` performs a real state
update now.

### Finding 5 — Nit — FIX

**Decision: FIX.** Cheap, and the reviewer offered the exact remedy.

**Fix**: `components/today/LoggedToday.test.tsx`'s "clicking Undo cancels the timer" test — softened the
comment to state the safety-net property honestly (the `pendingRef` guard is a real, independent backstop,
not what the surrounding assertion proves) and added `vi.spyOn(globalThis, 'clearTimeout')` (installed
**after** `vi.useFakeTimers()`, since spying before would wrap the unused real implementation) asserting
`clearTimeout` is genuinely called by `cancelPendingDeletion`. Confirmed the spy assertion is itself real
teeth by the same file's Finding-1 RED-proof round-trip.

### Finding 6 — Nit — FIX

**Decision: FIX.** A factual correction plus the reviewer's own "consider adding" suggestion — both cheap.

**Fix**: story Task 7, bullet 4 — corrected the wrong claim that the resume-hour-input/search-field
`⌘Z` cases were "structurally impossible" (the listener is `document.addEventListener`, not
component-scoped, and genuinely observes those inputs; `isTextEntryElement` is what makes it fall
through). The frozen "## Review Findings" section, which quotes the original wrong wording verbatim, is
left untouched per this file's own convention. Added the two missing cases to the ⌘Z test table via the
real composition root (`LoggedToday.test.tsx` alone cannot reach `ResumeCard`/`SearchPanel`): new tests in
`entrypoints/popup/App.session-total.test.tsx` — "⌘Z pressed inside the resume card's hour input does not
cancel a pending deletion elsewhere" and the equivalent for the search field.

**Proof**: **RED-proved** both new tests together by temporarily neutering `isTextEntryElement` to always
return `false` (cp-backup, md5-verified restore) — both failed (`Undo` no longer found, i.e. the
keystroke wrongly cancelled the pending deletion), matching the reviewer's own mutation G. Restored and
confirmed 10/10 green in that file.

### Summary

**6 findings: 6 FIX, 0 DISMISS, 0 DEFER.** Every FIX was proved with a genuine RED→GREEN round-trip
(cp-backup / inverse-Edit, md5-verified restoration, never `git checkout` on uncommitted work). No finding
was dismissed — the Blocker and both Majors were correctness/test-integrity issues on the money path or a
named deliverable; the Minor was treated as a data-integrity issue per this workflow's default-to-FIX
heuristic; both Nits were cheap and directly actionable. No new escalations were raised — D-7.5-11 …
D-7.5-14 (the pre-ruled owner/orchestrator decisions) were implemented as written by the developer and are
unaffected by this pass. The "Checked and explicitly NOT filed" items and the "Escalations needing an
owner ruling: None" verdict both stand as the reviewer recorded them.

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-07-26 — created (ready-for-dev)

At baseline 2d1c30f — removes TicketPicker's 2-level
browse tree from the popup, replacing it with "Recently worked" + a handoff row to 7.4's
search. Investigated inline and recorded as D-7.5-1..10 in the story file:
(1) lib/storage/pinned-tickets.ts SURVIVES — TicketPicker is its ONLY writer AND reader,
and WeeklyGrid still renders TicketPicker, so the store keeps both. KEPT unchanged and
deliberately NOT repurposed (it means "recently reached via search", carries no duration;
D-7.3-2 already rejected it). Writing to it from popup code would be a 4th shared-seam leak.
(2) "Recently worked" ranks off the ALREADY-FETCHED ['week-worklogs', weekOf] query —
same key as useTodayTotal + useResumeTicket — so ZERO extra network.
(3) Removing the picker takes up to THREE Jira searches (lib/hierarchy.ts self/manager/
skip-level) OFF the popup's first-paint path — an NFR1 win.
THREE ESCALATIONS need an orchestrator/owner ruling BEFORE dev starts:
  E1 (D-7.5-2) AC1's "exactly four rows" is not always satisfiable from the current-week-only
     free source. Recommend "up to four"; widening = new first-paint network cost (D-7.3-5).
  E2 (D-7.5-3) AC2's "N more assigned tickets" needs an assigned COUNT that no longer exists
     on the hot path. Recommend dropping N (free) or a count-only maxResults=0 query mounted
     OFF first paint. Do not silently re-add network cost.
  E3 (D-7.5-5) EXPERIENCE.md:140 "each with a + that seeds the resume card" DIRECTLY conflicts
     with owner ruling D-7.3-9. Recommend the + open the existing QuickLogForm instead
     (also keeps QuickLogForm from becoming dead code once the picker goes).
D-7.5-4 settles delete/undo as DEFERRED (not optimistic + compensating re-post) because a
Jira worklog DELETE is irreversible; teardown flushes to the Story 2.7 outbox. D-7.5-5a
inverts 7.4's data-slash-passthrough polarity for Cmd/Ctrl+Z. 7.4's deferred truncation
off-by-one deliberately NOT adopted (D-7.5-10) — it lives in the search seam this story
must not touch. Baseline re-measured at 2d1c30f: 89 files / 1115 passed / 1 skipped,
exits non-zero from ONE known ManagerView.test.tsx unhandled rejection; any drop below
1115 or a second unhandled rejection is the developer's regression.

### 2026-07-26 — done

Code review found 1 blocker / 2 majors / 1 minor / 2 nits; all 6 FIXED
(0 dismissed, 0 deferred) by the story finisher. The Blocker: LoggedToday.tsx's delete/undo
timer cleared its `pending` state BEFORE dispatching the async DELETE, so the row (and the
chrome header total) visibly reappeared for the whole Jira round-trip and a second click
could issue a duplicate irreversible DELETE — reproduced with the reviewer's own
never-settling-promise probe, RED-proved, then fixed with a `committingIds` set that stays
populated from dispatch through settle. The same mechanism closed a related Minor (Undo
staying functional after a teardown flush had already queued the delete to the outbox). Both
Majors were "correct code, zero test teeth" on the App.tsx/TodayView.tsx pending-deletion
seconds filters — fixed with tests that assert the RENDERED chrome-header figure via the
real composition root (not the callback, which is exactly the trap the reviewer named) and a
`toHaveBeenCalledWith` → `toHaveBeenLastCalledWith` correction. Both Nits fixed: a
test-comment overclaim (given a `clearTimeout` spy instead) and a factually wrong story claim
about ⌘Z's listener scope (corrected, plus the two missing test cases the reviewer suggested,
added via the composition root). The story's own local D-7.5-1..10/D-7.5-5a were folded into
epic-7-decision-log.md as canonical D-7.5-15..25 (D-7.3-11 fold-in pattern); every citation
outside the reviewer's frozen section was repointed. Every FIX was proved with a genuine
RED→GREEN round-trip (cp-backup/inverse-Edit, md5-verified restoration, never `git
checkout` on uncommitted work). Final gates: 92 files / 1174 passed / 1 skipped (dev baseline
92/1169/1 + 5 tests, 0 new files), lint 0 errors/42 warnings (unchanged), build green, all 11
byte-identity claims on the untouched week surface re-confirmed empty-diff against 2d1c30f.
