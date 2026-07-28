---
baseline_commit: dfccf5a
---

# Story 7.4: Search as the Browse Mechanism

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Priya logging against a teammate's ticket,
I want one search control that reaches every ticket in Jira,
So that there is no separate "add a ticket" flow to find.

## Context

Search is not a filter bolted onto a browse tree. **Search *is* the browse mechanism** — that is the whole
architectural claim of the popup redesign (`EXPERIENCE.md` lines 78–83). The popup will never render 55
rows again; it shows four recent tickets and hands everything else to this one control. It also solves
the teammate-ticket case for free, because Jira search is not scoped to the current user's assignments.

**What Stories 7.2 and 7.3 already give you (compose from these — do not re-derive, do not duplicate):**

| Seam | File | What it does for 7.4 |
|---|---|---|
| Popup shell / composition root | `entrypoints/popup/App.tsx` | Owns the **single scroll region** (`<main>`), the shared session-entry lists, the −10 px baseline boolean, and `connected`. 7.4 mounts into it. |
| **Today total** | `hooks/useTodayTotal.ts` | **The ONLY today-total seam.** A worklog logged from search must move the chrome figure through this hook's `sessionSeconds` — never a second counter. Its header comment (lines 13–31) carries the double-count hazard: **never** `invalidateQueries(['week-worklogs', …])`, never flip `staleTime` / `refetchOnWindowFocus` / `refetchOnReconnect`. |
| Session-entry ownership | `entrypoints/popup/App.tsx` lines 67–73, 101–139 | `ptoEntries` + `resumeEntries` as `LoggedEntry[]` **lists** (never monotonic counters — 7.2 Finding 3), derived seconds, and `externalEntries` routing for edit/delete. 7.4 adds a third list the same way. |
| Post seam | `components/today/ResumeCard.tsx` lines 163–232 (`submitSeconds`) | `postWorklog` → ok / outbox-enqueue (network + rate-limited) / error branching, `sendMessage('badge-update')`, `setLastLoggedTicket`, `formatStartedISO`. **Mirror it; do not re-invent it.** |
| Existing Jira search | `lib/ticket-search.ts` (whole file, 33 lines) | **The seam 7.4 reuses.** `searchTickets(query)` already does key-exact-vs-text JQL. 7.4 widens its field projection; it does not write a second search module. |
| Current user | `hooks/useCurrentUser.ts` | `['current-user']`, 24 h `staleTime`, resolves `accountId` from `rest/api/3/myself`. The **only** seam for "assigned to you". |
| Hours parsing | `lib/hours.ts` | `parseHours` / `hoursToSeconds` / `secondsToHoursDisplay` / `MAX_HOURS_PER_ENTRY`. |
| Tokens | `styles/globals.css` `@theme` | `ring-focus`, `tabular`, `animate-skeleton`, `animate-slide-in`, the `--text-*` scale, `--spacing: 4px` (**standard Tailwind spacing utilities are correct — use them normally**). |

**What this story is NOT.** It is not the "Logged today" / "Recently worked" rebuild and it is **not** the
removal of `TicketPicker` from the popup — **that is Story 7.5.** The body of the scroll region below the
search field stays exactly as 7.3 left it (`TodayView` with its `LoggedToday` + `TicketPicker`). 7.4 only
has to make that body *go away while a search is active* and *come back on `Esc`*. It is also not the
day-status vocabulary (7.6), not the full page (7.7), and not the offline/error banners (7.9).

**Orchestrator decisions carried by this story** (numbered per `epic-7-decision-log.md`, the canonical
registry — D-7.3-11): **D-7.4-17** (the `/` shortcut vs 7.3's autofocus), **D-7.4-18** (how the list swap
happens without wiping session state), **D-7.4-19** (the ARIA shape — the story's biggest a11y risk),
**D-7.4-20** (search returns non-subtask issues), **D-7.4-21** (reuse `JiraHierarchySearchSchema`; no new
schema), **D-7.4-22** (debounce, cancellation, rate-limit posture), **D-7.4-23** (AC5's promoted search
field — 7.3's named carry-forward), **D-7.4-24** (`Esc` must `preventDefault`, or Chrome closes the popup),
**D-7.4-25** (`LoaderCircle` here is not the thing 7.6 forbids), **D-7.4-26** (the `focusSearch` seam 7.5
calls).

### Inherited invariants this story must not break

1. **D-7.3-9 (owner decision) — nothing may change the resume card's write target while it is on screen.**
   Logging from search writes `lib/storage/last-logged.ts`, which is exactly the record the resume card
   reads. It is safe **only because** `useResumeTicket` reads storage once on mount and `ResumeCard`
   latches its identity at first `ready` paint (`ResumeCard.tsx` lines 118–132). 7.4 must not add a
   storage subscription, must not remount `ResumeCard`, and must **pin this with a test**.
2. **The popup has exactly one scroll region (7.2 AC2).** The results card must not introduce a nested
   one — no `max-h-*` + `overflow-y-auto` on the results container. This is the exact defect 7.2's
   Finding 2 was about; `TicketPicker`'s `unbounded` prop exists because of it.
3. **NFR1 — popup TTI ≤ 400 ms warm.** Nothing search-related may run on the first-paint path. No search
   query fires without a user query; `useCurrentUser()` must only mount once results exist (see D-7.4-21).
4. **Red only for a write Jira actually refused.** No results, an empty query, an unparseable hour value,
   and a rate-limited/failed *search* are all neutral or amber — **never** `text-state-danger` /
   `text-error-ink`.

---

## Acceptance Criteria

Transcribed verbatim from `epics.md` lines 1795–1822, with the story's resolutions appended beneath each.

### AC1 — Idle search field

**Given** the search field is idle
**When** the popup renders
**Then** the field shows "Search any ticket — key or text" with a `/` shortcut badge, at 36 px height with a hairline border

*Resolution:* placeholder string exactly `Search any ticket — key or text` (em dash). 36 px (`h-9`), 8 px
radius (`rounded-lg`), `border border-border` hairline, `bg-surface`, `shadow-hairline`-equivalent, with a
leading lucide `Search` icon (13 px, `aria-hidden="true"`) and a trailing `kbd` badge showing `/`
(`bg-neutral-100 border border-border rounded-sm`, `text-eyebrow`, `aria-hidden="true"` — it is decoration,
the shortcut is announced via `aria-keyshortcuts="/"` on the input).

### AC2 — `/` focuses search

**Given** the user presses `/` anywhere in the popup
**When** focus is not already in a text input
**Then** the search field takes focus, its border becomes 1.5 px primary with `ring-focus`, and the badge becomes `esc`

*Resolution:* see **ORCHESTRATOR DECISION D-7.4-17** below — the resume card's hour input is a text input,
so read literally this shortcut is dead on the popup's most common state. Resolved by narrowing what counts
as a `/`-consuming text input. The badge is derived from **focus state**, not from how focus arrived: focused
→ `esc`, blurred → `/`. The 1.5 px primary border + `ring-focus` are applied via `focus-within:` on the
field wrapper, never statically (D-7.3-15).

### AC3 — Results REPLACE the lists

**Given** the user types a query
**When** results resolve
**Then** the "Logged today" and "Recently worked" lists are **replaced** by a results card — not filtered alongside it
**And** exactly one list is on screen at a time

*Resolution:* see **ORCHESTRATOR DECISION D-7.4-18**. "Recently worked" does not exist yet (7.5); in 7.4 the
thing being replaced is the whole `TodayView` subtree (`LoggedToday` + `TicketPicker`). It is hidden with
the **HTML `hidden` attribute**, not unmounted and not a Tailwind `hidden` class. The swap is keyed on
"the trimmed query is non-empty" — **not** on "results have arrived", so the lists do not flicker back
during the in-flight window.

### AC4 — Ranking, pills, footnote

**Given** results render
**When** they are ranked
**Then** tickets assigned to the user sort first and carry an "assigned to you" pill; unassigned results show their assignee's name in a neutral pill
**And** a footnote reads "Searched live in Jira — includes tickets that aren't assigned to you."

*Resolution:* "assigned to the user" = `fields.assignee.accountId === useCurrentUser().data`. Stable sort:
assigned-to-you first, everything else in Jira's returned relevance order. "unassigned" in this AC means
*not assigned to you* (`EXPERIENCE.md` line 137: "each unassigned result showing its assignee") — the pill
carries `fields.assignee.displayName`, or the literal `Unassigned` when the issue genuinely has no
assignee. If `useCurrentUser` has not resolved or has failed, render results in Jira's order with **no**
pills at all rather than guessing — never block the list on it. Footnote string verbatim, with a lucide
`Search` icon (11–13 px, `aria-hidden="true"`).

### AC5 — Keyboard navigation and one-step logging

**Given** results are on screen
**When** the user navigates
**Then** `↑`/`↓` moves the selection, the first result is preselected with an inline hour input, `⏎` logs the selected result without a second step, and `Esc` clears the query and restores the lists
**And** the results container is a semantic list with `aria-activedescendant` tracking the selection

*Resolution:* see **ORCHESTRATOR DECISION D-7.4-19** for the exact ARIA shape and where the hour input
lives, and **D-7.4-24** for why `Esc` must call `preventDefault()`. "Without a second step" means no
`QuickLogForm` and no confirmation dialog — the hour value is already present and pre-filled at `1`.

### AC6 — In-flight indicator

**Given** the query is in flight
**When** Jira has not yet responded
**Then** a `LoaderCircle` in-flight indicator is shown — never a blocking spinner over the field

*Resolution:* the field stays fully editable at all times. `LoaderCircle` at 13 px with
`motion-safe:animate-spin`, `aria-hidden="true"`, in the results header strip. `aria-busy="true"` on the
results container while in flight. See **D-7.4-25** — this is *not* the `LoaderCircle` usage Story 7.6
forbids.

### AC7 — Story 7.3's carried-forward AC5 (D-7.3-1)

**Given** the user has no worklog history at all
**When** the popup opens
**Then** the resume card is replaced by the **search field promoted to primary position**, and no empty resume card renders

*This is not a new AC — it is the second half of Story 7.3's AC5, split by **D-7.3-1** with 7.4 named as
its owner.* 7.3 shipped only the "collapse cleanly" half and deliberately did not build a throwaway fake
search field. **7.4 closes it.** See **ORCHESTRATOR DECISION D-7.4-23**. This AC is a deliverable of this
story and must not be reduced to a footnote or deferred again.

### AC8 — No regressions; all gates green

**Given** this story is a popup-scoped addition
**When** `pnpm compile`, `pnpm build`, and `pnpm test` run
**Then** all three succeed with **no new failures** against the recorded baseline (Dev Notes > "Test baseline")
**And** `entrypoints/popup/App.a11y.test.tsx` reports zero Critical/Serious axe violations with the search panel mounted
**And** `components/week/*`, `components/manager/*` and `entrypoints/fullpage/*` are unchanged

---

## Orchestrator decisions

### ORCHESTRATOR DECISION D-7.4-17 — `/` reaches search even when the hour input has focus

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
`<textarea>`/`contenteditable` and the subtask-name input in `TicketPicker`.

**The second half of the collision — the reverse steal.** On a cold open the resume card may still be
`'loading'` (up to `COLD_START_SKELETON_BUDGET_MS` = 2000 ms, D-7.3-10). If the user presses `/` during
that window and starts typing, the card resolving to `'ready'` will fire its focus latch and **yank focus
out of the search field mid-query**. `ResumeCard`'s focus effect must therefore bail when focus has
already been claimed: guard it with `if (document.activeElement && document.activeElement !== document.body) return;`
*before* setting `focusedRef.current`. This is a one-line, dependency-free guard that also protects against
any future focus-claiming surface (7.9's banners). **Pin it with a test.**

**Why not the alternatives.** (a) *Take AC2 literally* — ships a dead primary shortcut and contradicts
Flow 2. (b) *Make `/` global with no exclusion at all* — breaks typing a slash into the query itself and
into `TicketPicker`'s create-subtask field, which is a real regression on shipped behaviour.

**D-7.3-9 is not violated.** Adding a `data-*` attribute and letting focus leave the card changes nothing
about the card's subtask, pre-fill, or write target. D-7.3-15 already anticipated this exact case: the
`focus-within:ring-focus` correctly stops glowing when `/` moves focus away, which is why it was applied
via `focus-within:` rather than statically.

### ORCHESTRATOR DECISION D-7.4-18 — the lists are hidden, not unmounted

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

### ORCHESTRATOR DECISION D-7.4-19 — the ARIA shape, and where the hour input lives

**This is the story's biggest accessibility risk. Read all of it before writing any markup.**

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

**Recorded deviation from the mockup (SD-4 — flagged, not silently taken).** The mockup's active row shows
an inline `1.0h` box and non-active rows show a `+` button. This story renders neither *inside* the rows.
The hour input moves up one level into the header strip; the `+` affordance is dropped in favour of
clicking the row. **This is an open escalation for the orchestrator** — see "Questions for the
orchestrator" below. The alternative that preserves the mockup's row anatomy exactly is
`role="combobox"` + `aria-controls` → **`role="grid"`** with `gridcell`s (ARIA permits focusable widgets
inside a `gridcell`), but AC5 says "a semantic list", and a grid is not a list.

### ORCHESTRATOR DECISION D-7.4-20 — search returns non-subtask issues; they are not filtered out

**The concern.** This product posts worklogs at **subtask** level (D-7.3-9 states it explicitly; the
manager matrix in Epic 5 rolls subtask → parent → epic). `lib/ticket-search.ts`'s JQL
(`summary ~ "…" AND statusCategory != Done AND updated >= -28d`, or `key = "X"`) returns **any** issue
type — Epics, Stories, Tasks and subtasks alike. So `⏎` on a search result can post a worklog directly to
a Task.

**Verdict for 7.4: no hard filter.** The story's premise is "one search control that reaches **every**
ticket in Jira"; silently dropping half of Jira's issues would make the field lie, and Jira accepts
worklogs on non-subtasks perfectly well. The projection **is** widened to include `issuetype` (free — see
D-7.4-21) so the data exists, and `isSubtask` is carried on the result model, but 7.4 adds **no** issue-type
pill (it would compete with the assignee pill, and the AC does not ask for one).

**Flagged, not hidden.** The consequence — a Task-level worklog rolls up differently on the manager matrix
than a subtask-level one — is a genuine product question. It is raised as an explicit escalation below
rather than settled by a story author.

### ORCHESTRATOR DECISION D-7.4-21 — reuse `JiraHierarchySearchSchema`; write no new schema

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
`JiraHierarchyIssue[]`.

**Shared-consumer check (the 7.2 Finding 2 lesson).** `TicketPicker` is used by **both** the popup and
`components/week/WeeklyGrid.tsx`, so this change reaches the week surface. It is **purely additive** — more
fields requested, all new ones optional, `fields.summary` still present, so `TicketPicker.tsx` line 218
(`i.fields.summary`) keeps compiling and behaving identically. Verify by running `WeeklyGrid`'s tests, and
say so in the Completion Notes. Do not touch `TicketPicker.tsx` otherwise; **do not** change its
`unbounded` prop or its default.

**"Assigned to you" needs an accountId.** Use `hooks/useCurrentUser.ts` — `['current-user']`, 24 h
`staleTime`, already deduped with the manager surfaces. **Mount it inside the results component only**, so
it cannot fire on the popup's first-paint path (NFR1). It is a single `rest/api/3/myself` GET, cached for
a day, and it happens while the user is typing — not while the popup is painting.

### ORCHESTRATOR DECISION D-7.4-22 — one 250 ms debounce, `useQuery` not `useMutation`, no retry

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

### ORCHESTRATOR DECISION D-7.4-23 — what "promoted to primary position" means (closes 7.3's AC5)

When `resume.status === 'none'`:

1. The search panel renders as the **first child of the scroll region**, in the slot the resume card would
   have occupied. When the card is present, search renders **below** it (`EXPERIENCE.md` IA lines 51–56).
2. The search field **takes the autofocus** the hour input would otherwise have had. There is no other
   focusable primary affordance, and the hot path must still start with a focused control.
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

### ORCHESTRATOR DECISION D-7.4-24 — `Esc` must `preventDefault()`, or Chrome closes the popup

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

### ORCHESTRATOR DECISION D-7.4-25 — this `LoaderCircle` is not the one Story 7.6 forbids

Recorded pre-emptively so a later agent does not "fix" a non-bug. `EXPERIENCE.md` line 206 states:
*"Neither `{icons.loading}` nor `{icons.restricted}` is a day status. `LoaderCircle` means the product is
still working."* Story 7.6 will forbid `LoaderCircle` **as a day status** in the five-state day vocabulary.
AC6 here uses it for **genuine in-flight work**, which is precisely the meaning `DESIGN.md` line 239
assigns it. **These are different contexts and there is no conflict.** Do not remove this usage when 7.6
lands; add a code comment saying so.

### ORCHESTRATOR DECISION D-7.4-26 — the seam Story 7.5 will call

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

---

## Tasks / Subtasks

- [x] **Task 1 — Record the baseline before touching anything** (AC8)
  - [x] Run `pnpm compile`, `pnpm test`, `pnpm build`. Record exact counts in the Dev Agent Record.
  - [x] Confirm the known non-zero exit is the `ManagerView.test.tsx` unhandled rejection and nothing else
        (Dev Notes > "Test baseline"). Any other failure is pre-existing only if you can prove it at `dfccf5a`.

- [x] **Task 2 — Widen the existing search seam** (AC4, D-7.4-21)
  - [x] `lib/ticket-search.ts`: `SEARCH_FIELDS = 'key,summary,issuetype,assignee'`; parse with
        `JiraHierarchySearchSchema`; return `JiraHierarchyIssue[]`. **No new schema, no new module.**
  - [x] Update `lib/ticket-search.test.ts`: the widened projection appears in the request URL; an issue
        with an assignee round-trips `accountId` + `displayName`; an issue **without** an assignee parses
        (the field is optional); `issuetype.subtask` round-trips.
  - [x] Confirm `components/today/TicketPicker.tsx` still compiles untouched and run its tests plus
        `components/week/WeeklyGrid.test.tsx` — the shared-consumer check (7.2 Finding 2).

- [x] **Task 3 — `hooks/useTicketSearch.ts`: debounced query + ranking** (AC4, AC6, D-7.4-22)
  - [x] `useQuery` keyed `['ticket-search', debouncedQuery]`, `enabled` at ≥ 2 trimmed chars,
        `staleTime: 30_000`, `retry: false`, `refetchOnWindowFocus: false`.
  - [x] Single 250 ms debounce. **Do not** copy `TicketPicker`'s chained-debounce + `useMutation` pattern.
  - [x] Rank: assigned-to-you first (stable), then Jira's order. Fall back to Jira's order with no pills
        when `useCurrentUser` is unresolved or errored.
  - [x] Return a discriminated shape covering: `idle` · `in-flight` · `results` · `empty` · `failed`
        (carrying `kind` so `rate-limited` can be worded distinctly). **No `red` anywhere in this hook's
        consumers.**
  - [x] `hooks/useTicketSearch.test.ts`: debounce collapses a burst to one request; a stale response for an
        older query cannot overwrite a newer one; assigned-first ordering; ordering is stable within each
        group; no request fires for a 1-char or whitespace query; `rate-limited` surfaces as its own state.

- [x] **Task 4 — `components/today/SearchPanel.tsx`: field, `/` shortcut, `Esc`** (AC1, AC2, AC6, D-7.4-17, D-7.4-24)
  - [x] Idle field per AC1 — 36 px, hairline `border-border`, lucide `Search` (13 px, `aria-hidden`),
        trailing `kbd` badge, `aria-keyshortcuts="/"`, placeholder verbatim.
  - [x] Badge derived from focus state (`/` ⇄ `esc`); 1.5 px primary border + `ring-focus` via
        `focus-within:` on the wrapper, **never static** (D-7.3-15).
  - [x] Document-level `keydown` listener for `/`, added and removed in one `useEffect`. Skip when the
        active element is a text-entry element **without** `data-slash-passthrough="true"`. `preventDefault()`
        so the slash is not typed into the newly-focused field.
  - [x] `Esc` handling exactly per D-7.4-24's table, including `preventDefault()` + `stopPropagation()`.
  - [x] `LoaderCircle` in-flight indicator in the results header strip; the field is never disabled,
        never overlaid. Add the D-7.4-25 comment.
  - [x] Expose `SearchPanelHandle` via `useImperativeHandle` (D-7.4-26) and export the type.

- [x] **Task 5 — The results card: ARIA, navigation, one-step log** (AC3, AC4, AC5, D-7.4-19)
  - [x] Combobox/listbox/option markup exactly as D-7.4-19 specifies. `aria-activedescendant` on the input;
        DOM focus never enters the list.
  - [x] Rows: Kanit `tabular` key + pill on line one, Noto summary ellipsised on line two, fixed height
        (`DESIGN.md` "List row", lines 461–464). Composed accessible name per D-7.4-19.
  - [x] Pills: `bg-primary-soft text-primary rounded-full` for "assigned to you";
        `bg-neutral-100 text-faint border border-border rounded-full` for the assignee name /
        `Unassigned`. **Zero new colour values.**
  - [x] Header strip: `Results` label, count in a `count-pill` with `tabular`, `↑↓ to move · ⏎ to log`
        hint, the `LoaderCircle` slot, and the single hour input (labelled `Hours for {activeKey}`,
        pre-filled `1`, decorative `CornerDownLeft` badge, `aria-hidden` badge).
  - [x] `↑`/`↓` wrap-around selection over the flat result array; `preventDefault()` so the caret does not
        move in the query field.
  - [x] Footnote verbatim with a lucide `Search` icon, `aria-hidden`.
  - [x] `role="status" aria-live="polite"` result-count announcement; `aria-busy` while in flight.
  - [x] **No `overflow-y-auto` and no `max-h-*` on the results container** — one scroll region (7.2 AC2).
  - [x] Empty results: neutral copy, no icon-free colour signalling, **never red**.

- [x] **Task 6 — The write path** (AC5)
  - [x] Mirror `ResumeCard.submitSeconds` (lines 163–232) exactly: `postWorklog` → ok /
        network|rate-limited → `enqueueOutbox` / else error; `sendMessage('badge-update')`;
        `setLastLoggedTicket`; `formatStartedISO(todayDateString())`.
  - [x] Validate the hour value with `parseHours` / `MAX_HOURS_PER_ENTRY`. Unparseable or over-limit →
        **amber** (`text-amber-ink`), no post (D-7.3-16). A refused write → red. Nothing else is red.
  - [x] On success: emit a `LoggedEntry` upward, clear the query, restore the lists, and return focus to
        the search field.

- [x] **Task 7 — Wire it into the shell** (AC3, AC7, D-7.4-18, D-7.4-23)
  - [x] `entrypoints/popup/App.tsx`: add `searchEntries: LoggedEntry[]` as a **third list** following the
        exact `ptoEntries` / `resumeEntries` pattern — derived `searchSeconds`, folded into
        `sessionSeconds`, appended to `externalEntries`, and routed in `handleExternalEntryEdited` /
        `handleExternalEntryDeleted`. **A list, never a counter** (7.2 Finding 3).
  - [x] Mount `<SearchPanel>` **below** `ResumeCard` when `resume.status !== 'none'`, and as the **first
        child of the scroll region** when it is `'none'` (AC7). Autofocus only in the promoted case.
  - [x] Wrap `<TodayView>` in a container carrying the **`hidden` attribute** while `searchActive`.
        `TodayView` is never unmounted.
  - [x] **Do not modify** `breaksHeaderBaseline` (D-7.4-23 item 4).
  - [x] Hold `searchPanelRef` for 7.5 (D-7.4-26).

- [x] **Task 8 — The focus-latch guard in `ResumeCard`** (AC2, D-7.4-17)
  - [x] Add `data-slash-passthrough="true"` to the hour input.
  - [x] Guard the focus effect: bail if `document.activeElement` is neither null nor `document.body`,
        **before** flipping `focusedRef.current`.
  - [x] Change nothing else in `ResumeCard.tsx`. **D-7.3-9's identity latch, pre-fill and write target are
        untouched.**

- [x] **Task 9 — Tests and gates** (AC8)
  - [x] Write every test in Dev Notes > "Testing".
  - [x] Prove teeth on the three that matter: the D-7.4-18 state-preservation test, the D-7.3-9
        no-retarget test, and the reverse focus-steal test. Break the fix, watch them go red, revert.
  - [x] Extend `entrypoints/popup/App.a11y.test.tsx` with the panel mounted in **both** states (results
        open, and promoted-to-primary) — zero Critical/Serious.
  - [x] Re-run all three gates; report exact counts against the baseline.

---

## Dev Notes

### Test baseline — record it before you touch anything

At `dfccf5a` (Story 7.3, the story immediately before this one):

- `pnpm compile` — clean.
- `pnpm test` — **86 test files, 1049 passed, 1 skipped.**
- **Known pre-existing oddity:** `pnpm test` **exits non-zero even though every test passes.** One
  unhandled promise rejection escapes `components/manager/ManagerView.test.tsx`:
  `TypeError: Cannot read properties of undefined (reading 'runtime')`, thrown inside `@wxt-dev/storage`'s
  `getStorageArea` — the fake browser environment is torn down while a storage read is still in flight.
  It is a test-harness race, not a product bug.

**This is the baseline.** Reporting *this* is reporting a pre-existing condition. A **new** failing test,
or **any** drop below 1049 passing, is a regression caused by this story and must be fixed — not labelled
pre-existing. Record your measured numbers verbatim in the Dev Agent Record.

### Existing code you are modifying — current state, change, and what must be preserved

| File | Current state | What 7.4 changes | Must be preserved |
|---|---|---|---|
| `lib/ticket-search.ts` (33 lines) | `searchTickets(query)`; key-exact JQL for `^[A-Za-z]+-\d+$`, else `summary ~ "q" AND statusCategory != Done AND updated >= -28d`; `maxResults=20`; `fields=key,summary`; parses `JiraSearchSchema` → `JiraIssue[]`. | Field projection widened to `key,summary,issuetype,assignee`; parses `JiraHierarchySearchSchema` → `JiraHierarchyIssue[]`. | The JQL itself, the key-vs-text branch, `MAX_RESULTS = 20`, the empty-query short-circuit, and the `Result` error contract. |
| `entrypoints/popup/App.tsx` (227 lines) | Owns `authState`, `targetHours`, three session contributions (`todayViewSeconds`, `ptoEntries`, `resumeEntries`), `externalEntries` merge + edit/delete routing, `useTodayTotal(sessionSeconds)`, `useResumeTicket()`, and `breaksHeaderBaseline`. Layout: `ChromeHeader` / `<main overflow-y-auto>` / `PopupActionBar`. | Fourth session contribution `searchEntries`; `<SearchPanel>` mounted (position depends on `resume.status`); `<TodayView>` wrapped in a `hidden`-attribute container; `searchPanelRef`. | `breaksHeaderBaseline` **verbatim**; the single `<main>` scroll region; the LIST (not counter) pattern; `useTodayTotal` as the only total seam; the disconnected branch. |
| `components/today/ResumeCard.tsx` (365 lines) | Identity latched at first `ready` paint (D-7.3-9); seed-once effect; focus latch at lines 152–160; shared `submitSeconds` write path. | Two additions only: `data-slash-passthrough="true"` on the hour input, and an "already-claimed" guard in the focus effect. | **Everything else.** Especially `latchedTicketRef`, `seededKeyRef`, and `submitSeconds` — D-7.3-9 is an owner ruling on the money path. |
| `components/today/TodayView.tsx` (220 lines) | Owns `loggedEntries` (`useState`), merges `externalEntries` for display, lifts `totalSeconds` via `onTotalChange`. | **Not modified.** It only gets hidden by its new parent wrapper. | Its state must survive a search — that is the whole point of D-7.4-18. |
| `components/today/TicketPicker.tsx` (789 lines) | 2-level browse tree; `unbounded` prop defaults `false` (7.2 Finding 2); the **only** `addPinnedTicket` writer (line 265); its own search mode via `useMutation`. | **Not modified.** 7.5 removes it from the popup. | The `unbounded` default — `WeeklyGrid` depends on the clamped behaviour. |

### `pinnedTickets` — deliberately not written by this story

`lib/storage/pinned-tickets.ts` (`local:pinnedTickets`) records tickets **reached via search**, not
tickets logged — D-7.3-2 established that it is "recently reached", carries no duration, and is **not** a
last-logged source. Its only writer is `TicketPicker.tsx:265`. **7.4's `SearchPanel` does not write it.**
Duplicating the write would give the popup two competing "recent" notions right before 7.5 rebuilds
"Recently worked" from worklog recency. Flagged for 7.5: removing `TicketPicker` from the popup leaves
`pinnedTickets` with no popup writer at all, so 7.5 must decide whether the key survives.

### Where "assigned to you" comes from, and why it is not on the first-paint path

`hooks/useCurrentUser.ts` → `rest/api/3/myself` → `accountId`, `staleTime` 24 h, key `['current-user']`.
Mount it **inside the results component**, which only exists once a query is active. Note that
`fetchCurrentUserWeekWorklogs` also calls `myself` internally (`lib/jira-client.ts` line 472) but under a
different query key, so the two do not dedupe — that is acceptable (24 h cache, one extra GET at most,
never on first paint) and is **not** a reason to refactor the week query in this story.

### Spec conflicts resolved (recorded, not silently taken)

1. **`EXPERIENCE.md` Flow 2 contradicts itself.** Line 290 says *"GAPI-330 is assigned to Anucha, so it
   isn't in her list at all"*, then line 294 tags GAPI-330 **"assigned to you"** in the results.
   **Follow the AC:** "assigned to you" means `assignee.accountId === currentUser.accountId`, full stop.
2. **"unassigned results show their assignee's name"** is self-contradictory on its face. `EXPERIENCE.md`
   line 137 disambiguates: it means *not assigned to you*. A genuinely unassigned issue gets the literal
   pill `Unassigned`.
3. **The mockup's `◐` before the footnote** is a retired text glyph (`DESIGN.md` iconography, lines
   414–441 — glyphs sat in the a11y tree and got announced ahead of the label). Use lucide `Search`,
   `aria-hidden="true"`.
4. **The mockup's in-row hour input and `+` buttons** are ARIA-invalid inside `role="option"` — see
   D-7.4-19. The spines and the Accessibility Floor win over the mockup.

### WCAG 2.1 AA — the hard gate

- **Status is never colour alone.** The two pills differ in colour *and* in text; delete the colour and
  "assigned to you" vs "Anucha P." still reads correctly. The active row must not be distinguished by
  background alone — pair the `bg-primary-soft` fill with the `border-l-2 border-primary` spine **and**
  `aria-selected="true"` so the state is programmatically and visually determinable.
- **Icons:** lucide only, 11–13 px, inline SVG, `aria-hidden="true"`. `Search`, `LoaderCircle`,
  `CornerDownLeft` are the only three this story needs.
- **Contrast:** `text-faint` (`#6B6B72`, 4.6:1) is the floor and must never be lightened.
  `text-primary` (`#594F74`) on `bg-primary-soft` (`#ECEBF3`) is the established pill pair from
  `DESIGN.md`'s `count-pill` (lines 166–172). `text-faint-decorative` (`#ADACB9`) is **non-text only**.
- **Focus:** every interactive element gets `ring-focus` + a 1.5 px primary border, applied via
  `focus-visible:` / `focus-within:`, never statically and never `outline: none` without a replacement.
- **Hit targets:** ≥ 24×24 px. Result rows exceed it comfortably; the hour input is 34 px per
  `DESIGN.md`'s `hour-input`.
- **Live regions:** the result count is `role="status" aria-live="polite"`. A write failure is
  `role="alert"`. Do not mount a live region with its content already inside — 7.2's minor finding was
  exactly that, and the first announcement was lost.
- **Reduced motion:** `motion-safe:` on the `LoaderCircle` spin and on any row entrance.

### No monospace, no new colours, no new tokens

Keys and counts use the `tabular` utility (Kanit + `font-variant-numeric: tabular-nums`). Every colour in
this story already exists in `styles/globals.css`: `#ECEBF3` = `primary-soft`, `#594F74` = `primary`,
`#F4F4F7` = `neutral-100` (the established kbd/chip surface — `DESIGN.md` `icons.kbd.background`),
`#E4E3EC` = `border`, `#6B6B72` = `faint`. **`styles/globals.css` must not change.** Prefer the semantic
name over the legacy alias wherever one exists (D-7.3's ruling against raw hex, 7.3 Finding 7's ruling
against unnecessary `neutral-*`).

### Project Structure Notes

**New files**
- `components/today/SearchPanel.tsx` + `components/today/SearchPanel.test.tsx`
- `hooks/useTicketSearch.ts` + `hooks/useTicketSearch.test.ts`

**Modified**
- `lib/ticket-search.ts` + `lib/ticket-search.test.ts` — widened projection only
- `entrypoints/popup/App.tsx` — fourth session list, mount, `hidden` wrapper, `searchPanelRef`
- `components/today/ResumeCard.tsx` — one `data-` attribute + one focus guard
- `entrypoints/popup/App.test.tsx`, `entrypoints/popup/App.a11y.test.tsx`,
  `entrypoints/popup/App.session-total.test.tsx`, `components/today/ResumeCard.test.tsx`

**Not modified**
- `styles/globals.css` — no new token, no new hex, no new `@utility`
- `components/today/TodayView.tsx`, `components/today/TicketPicker.tsx`,
  `components/today/LoggedToday.tsx`, `components/today/QuickLogForm.tsx`
- `components/shell/*`, `components/week/*`, `components/manager/*`, `entrypoints/fullpage/*`
- `hooks/useTodayTotal.ts`, `hooks/useResumeTicket.ts`, `hooks/useWeekWorklogs.ts`,
  `lib/storage/last-logged.ts`, `lib/storage/pinned-tickets.ts`

**Conventions (ESLint-enforced).** No default exports. No `any`. `import/order` alphabetised with no blank
lines between groups. `@/` path alias. WXT `outDir` is `output/`, **not** `.output/`.

### Files fenced off — Epic 6.3 in-flight CRX work

`scripts/pack-crx.mjs`, `scripts/derive-ext-key.mjs`, `scripts/lib/`, `package.json`, `docs/release.md`,
`wxt.config.ts`. Deliberately uncommitted (SD-5). **Do not stage, edit, or `git add -A` them.** Also
untouched: `_bmad-output/planning-artifacts/ux-designs/`, `public/fonts/`.

### Carried forward to Story 7.5

- **`searchPanelRef.current?.focus()`** is the seam for "N more assigned tickets · Search to find them →"
  (D-7.4-26). The type `SearchPanelHandle` is exported from `components/today/SearchPanel.tsx`.
- **`TicketPicker` removal from the popup is 7.5's, not 7.4's.** When it goes, `lib/storage/pinned-tickets.ts`
  loses its only popup writer — 7.5 must decide whether the key survives.
- **7.5 may lift `TodayView.loggedEntries` into the shell.** If it does, D-7.4-18's `hidden` wrapper stays
  correct and the state-loss hazard disappears entirely.

### Testing

Vitest + jsdom only — **no Playwright** in this repo. axe gate = `lib/test/axe.ts` (`scan` /
`criticalOrSerious`; `color-contrast` disabled because jsdom has no paint engine).
`entrypoints/options/App.a11y.test.tsx` is the entrypoint-level a11y template.

| File | Assertions |
|---|---|
| `lib/ticket-search.test.ts` | widened `fields=key,summary,issuetype,assignee` appears in the request URL; assignee `accountId` + `displayName` round-trip; an issue with **no** assignee parses; `issuetype.subtask` round-trips; the key-exact vs text JQL branch is unchanged; empty query still short-circuits without a request. |
| `hooks/useTicketSearch.test.ts` (new) | a typing burst collapses to **one** request (fake timers, 250 ms); a stale response to an older query **cannot** overwrite a newer one (the `useMutation` bug this replaces); assigned-to-you sorts first and ordering is stable within each group; no request for a 1-char or whitespace-only query; `rate-limited` surfaces as its own state and triggers **no** retry; `useCurrentUser` failure degrades to Jira order with no pills. |
| `components/today/SearchPanel.test.tsx` (new) | idle field: placeholder verbatim, `/` badge, `aria-keyshortcuts="/"`; `/` pressed on `document` focuses the field and does **not** insert a slash; `/` is **ignored** when focus is in a text input without `data-slash-passthrough`; `/` **is** honoured when focus is in the resume hour input (D-7.4-17); badge flips `/`⇄`esc` on focus/blur; `↑`/`↓` move `aria-activedescendant` and wrap; `⏎` posts exactly once for the active result with the header hour value; click-a-row logs it; unparseable hours render **amber** and do **not** post; a refused write renders red, a rate-limited **search** does not; `Esc` with a query clears + keeps focus, `Esc` with no query blurs, both `preventDefault`; `LoaderCircle` present while in flight and the input is **not** disabled; footnote verbatim; **no `overflow-y-auto` / `max-h-*` on the results container**; ARIA shape — `role="combobox"` on the input, `role="listbox"` on the `<ul>`, `role="option"` on rows, and **zero focusable descendants inside any option**. |
| `entrypoints/popup/App.test.tsx` | **D-7.4-18 teeth:** log an entry → type a query → `Esc` → the entry is still in "Logged today" **and** the chrome figure is unchanged (must go RED against a conditional-render implementation); `TodayView`'s wrapper carries the `hidden` attribute while searching and the logged list is absent from role queries; search renders **below** the resume card when `status: 'ready'` and as the **first child of `<main>`** when `'none'`, autofocused only in the latter (AC7); `<main>` still carries no `-mt-[10px]` when `'none'` (7.3 Finding 3 must not regress). |
| `entrypoints/popup/App.session-total.test.tsx` | **extend, do not replace.** A worklog logged from search moves the chrome figure **through `useTodayTotal`**, and **no `['week-worklogs', …]` invalidation fires**. This file is the only place the double-count guard has teeth (`useTodayTotal.ts` lines 13–31) — it must stay meaningful. |
| `components/today/ResumeCard.test.tsx` | **D-7.3-9 teeth:** logging from search writes `lastLoggedTicket` yet the on-screen card's subtask, pre-fill and write target are **unchanged** (RED without the latch); **reverse focus-steal:** with the card `'loading'`, focus the search field, then resolve the card to `'ready'` — focus **stays** in search (RED without Task 8's guard); the hour input carries `data-slash-passthrough="true"`. |
| `entrypoints/popup/App.a11y.test.tsx` | extend for **both** states — results open, and search promoted to primary. Zero Critical/Serious. |
| `components/week/WeeklyGrid.test.tsx`, `components/today/TicketPicker.test.tsx` | run unchanged — the shared-consumer regression check for Task 2 (7.2 Finding 2's lesson). |

**jsdom limits — be honest in the Completion Notes.** jsdom has no layout engine and no Tailwind, so it
cannot prove the 36 px height, the two-line clamp actually clipping, or real contrast. Assert the
*structural* facts (roles, `aria-*`, the `hidden` attribute, class presence, node counts) and record the
visual and contrast checks for the manual pass, exactly as Story 6.1's audit doc does. The `hidden`
**attribute** was chosen over a Tailwind class precisely so that one AC *is* machine-checkable.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#story-74-search-as-the-browse-mechanism (lines 1789–1822)] — AC1–AC6 verbatim
- [Source: _bmad-output/planning-artifacts/epics.md#story-73-resume-card--the-first-move (lines 1785–1787)] — the AC5 half this story inherits as AC7
- [Source: _bmad-output/planning-artifacts/epics.md#story-75 (lines 1837–1840)] — the "N more assigned tickets · Search to find them →" handoff D-7.4-26 serves
- [Source: _bmad-output/planning-artifacts/epics.md#epic-7 (lines 1673–1682)] — AA / lucide-only / no-monospace standing constraints
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md (lines 457–459)] — Search field: 36 px, hairline, `/` badge, focus border, "replaces the lists"
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md (lines 461–464)] — List row: key + pill on line one, summary on line two, fixed height
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md (lines 166–172)] — `count-pill` tokens (the "assigned to you" pill pair)
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md (lines 173–177)] — `hour-input`: 1.5 px primary border, 34 px, focus ring
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md (lines 232–262)] — icon map: `loading: LoaderCircle`, `search: Search`, `submit: CornerDownLeft`, `kbd` badge tokens
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md (line 139)] — `resume-card.offset: '-10px'` is granted to the card alone (D-7.4-23 item 4)
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md#information-architecture (lines 51–56, 78–83)] — search's slot in the IA; "search is the browse mechanism"
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md#component-patterns (lines 135–138)] — the Search behavioural contract
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md (line 119)] — the "Searched live in Jira…" string, verbatim
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md#state-patterns (line 188)] — **Searching**: "Lists replaced by results; first result preselected"
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md (line 206)] — `LoaderCircle` means in-flight, not a day status (D-7.4-25)
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md#interaction-primitives (lines 219–237)] — the `/` `Esc` `⏎` `↑↓` keyboard table and "affordances are visible"
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md#accessibility-floor (lines 244–270)] — status never colour alone, decorative icons, live regions, 24 px targets, `faint` floor
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md#key-flows (lines 287–301)] — Flow 2, the teammate-ticket climax (and its internal contradiction)
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/imports/jira-time-logger-round2.dc.html (lines 636–700)] — idle/active field, results card, pills, footnote; (lines 1174–1176) the `searchIdle` / `searchActive` / `showLists` state flags
- [Source: lib/ticket-search.ts (lines 1–33)] — the existing search seam this story reuses
- [Source: lib/jira-types.ts (lines 56–83, 163–192)] — `JiraIssueSchema` / `JiraSearchSchema` vs `JiraHierarchyIssueSchema` / `JiraHierarchySearchSchema` (D-7.4-21)
- [Source: lib/jira-client.ts (lines 49–132)] — `jiraGet`, the 429 → `rate-limited` mapping and `Retry-After` handling
- [Source: lib/jira-client.ts (lines 133–151)] — `postWorklog`
- [Source: hooks/useCurrentUser.ts (lines 1–31)] — the `accountId` seam for "assigned to you"
- [Source: hooks/useTodayTotal.ts (lines 13–31)] — the only today-total seam and its double-count hazard
- [Source: entrypoints/popup/App.tsx (lines 52–73, 109–139, 160–195)] — session-list pattern, external-entry routing, `breaksHeaderBaseline`, the single scroll region
- [Source: components/today/ResumeCard.tsx (lines 112–160, 163–232)] — the D-7.3-9 identity latch, the focus latch to guard, and the write path to mirror
- [Source: components/today/TodayView.tsx (lines 47–48, 140–157)] — `loggedEntries` state and `onTotalChange`; why D-7.4-18 forbids unmounting
- [Source: components/today/TicketPicker.tsx (lines 43–55, 207–239, 261–282)] — the `unbounded` prop boundary, the chained-debounce + `useMutation` anti-pattern, the only `addPinnedTicket` writer
- [Source: lib/hours.ts] — `parseHours` / `hoursToSeconds` / `secondsToHoursDisplay` / `MAX_HOURS_PER_ENTRY`
- [Source: lib/scheduler.ts] — the token-bucket used by the manager fan-out; deliberately **not** used here (D-7.4-22)
- [Source: _bmad-output/implementation-artifacts/epic-7-decision-log.md] — SD-1…SD-5, D-7.2-1…D-7.2-7, D-7.3-1…D-7.3-16
- [Source: _bmad-output/implementation-artifacts/7-3-resume-card-the-first-move.md] — the "Carried forward to Story 7.4" section, Findings 1–10 and their resolutions
- [Source: _bmad-output/planning-artifacts/architecture.md (lines 42, 239–263, 405–460)] — NFR1, the `Result` error contract, import/naming/format patterns

### Questions and escalations for the orchestrator

Raised explicitly rather than guessed at silently (SD-4).

1. **D-7.4-19 — the mockup deviation is a genuine design fork.** To keep `role="option"` valid, this story
   moves the hour input out of the active result row and into the results header strip, and drops the
   per-row `+` button in favour of clicking the row. The alternative that preserves the mockup's row
   anatomy exactly is a `combobox` + **`role="grid"`** popup, which is ARIA-valid with focusable cells but
   contradicts AC5's "semantic list". **Please rule.** The story is written to the listbox option.
2. **D-7.4-20 — should non-subtask issues be loggable from search?** Worklogs in this product are posted at
   subtask level, and Epic 5's matrix rolls subtask → parent → epic. Search returns Tasks, Stories and
   Epics too, and 7.4 as written lets a user log against them. Options: leave as-is; hard-filter to
   subtasks (which makes "reaches every ticket in Jira" false); or allow but show an issue-type pill /
   confirmation. **Please rule** — this is the money path.
3. **Search scope may be too narrow for the AC's promise.** `lib/ticket-search.ts`'s text JQL is
   `summary ~ "q" AND statusCategory != Done AND updated >= -28d`. A ticket untouched for 29 days, or one
   whose match is in the description rather than the summary, is unreachable — yet the field says
   "Search any ticket — key or text". Widening (e.g. `text ~`, dropping the 28-day window) is a one-line
   change with a real relevance/latency cost. **Left unchanged in 7.4**; flagging that AC1's copy
   overstates what the current JQL delivers.
4. **`maxResults=20` and no pagination.** Kept as-is. No AC asks for "showing 20 of N", but a user
   searching a common word will silently see a truncated list. Worth a one-line note in the results header
   if the owner wants it.
5. **`pinnedTickets` after 7.5.** 7.4 deliberately does not write it (Dev Notes above). Once 7.5 removes
   `TicketPicker` from the popup, the key has no popup writer. Should it be retired, or should search
   inherit the write? **A 7.5 input, flagged now.**
6. **`EXPERIENCE.md` Flow 2's internal contradiction** (line 290 vs 294) should be corrected in the spec by
   its owner, alongside the `/70` → `/85` chrome-eyebrow fix already outstanding from 7.2.

---

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (bmad-story-developer)

### Debug Log References

- Baseline re-verified before any change, at `dfccf5a`: `pnpm compile` clean; `pnpm test` — 86 files, 1049 passed, 1 skipped, exits non-zero only from the known `ManagerView.test.tsx` unhandled `@wxt-dev/storage` rejection.
- `pnpm vitest run lib/ticket-search.test.ts components/today/TicketPicker.test.tsx components/week/WeeklyGrid.test.tsx` — 61/61 green after widening `SEARCH_FIELDS`, confirming the D-7.4-21 shared-consumer check (7.2 Finding 2's lesson) holds: `TicketPicker` and `WeeklyGrid` are unaffected.
- `hooks/useTicketSearch.test.ts` — 10/10 green, including the stale-response and debounce-collapse tests that reproduce (and rule out) `TicketPicker`'s chained-debounce/`useMutation` bug.
- `components/today/SearchPanel.test.tsx` — 27/27 green, including the D-7.4-11 non-subtask-warning test and the D-7.4-17 `/`-collision tests (both directions).
- `components/today/ResumeCard.test.tsx` — RED-proven: removed the `document.activeElement` guard from the focus-latch effect, confirmed the new "reverse focus-steal" test fails (`AssertionError: expected <input inputmode="decimal"> to be <input>`), restored the guard, confirmed green (28/28).
- `entrypoints/popup/App.session-total.test.tsx` — RED-proven: swapped the `hidden`-attribute wrapper for `!searchActive && <TodayView/>`, confirmed the new D-7.4-18 test fails (`TestingLibraryElementError: Unable to find an element with the text: Worklog actions for PROJ-2`, proving the conditional-render unmount wipes `loggedEntries`), reverted, confirmed green (5/5).
- Full suite re-run 3× after the ARIA refactor (persistent `listbox` container for `aria-busy`) to confirm no residual flake: 88 files / 1099 passed / 1 skipped each time, exit non-zero only from the known baseline rejection.
- `pnpm build` — clean, 887.58 kB total.

### Completion Notes List

- **Task 1 — Baseline.** Confirmed at `dfccf5a`: `pnpm compile` clean; `pnpm test` 86 files / 1049 passed / 1 skipped with the single known `ManagerView.test.tsx` unhandled-rejection exit-code quirk (matches Dev Notes exactly).
- **Task 2 — Widened `lib/ticket-search.ts`.** `SEARCH_FIELDS` → `key,summary,issuetype,assignee,status,updated` (the last two are a deviation beyond D-7.4-21's own field list — see below), parses `JiraHierarchySearchSchema`, returns `JiraHierarchyIssue[]`, exports `MAX_RESULTS`. JQL widened per D-7.4-13 (owner decision, supplied by the orchestrator prompt): `text ~` replaces `summary ~`; `statusCategory != Done` and `updated >= -28d` both removed. `TicketPicker.test.tsx` and `WeeklyGrid.test.tsx` re-run green — the widened projection is purely additive (7.2 Finding 2's shared-consumer check).
- **Deviation, flagged not hidden:** `lib/jira-types.ts`'s `JiraHierarchyIssueSchema` gained two more optional fields (`fields.status.statusCategory.key`, `fields.updated`) beyond the `issuetype`/`assignee` pair D-7.4-21 named. This is a forced consequence of D-7.4-13's own text ("mitigate by ranking, not filtering: open before done, recent before stale") — that ranking needs data the original field list didn't carry. Both fields are optional and tolerant, so this stays additive to every other schema consumer (`lib/jira-client.ts`'s matrix/lookup schemas are untouched; only `JiraHierarchyIssueSchema` itself grew).
- **Task 3 — `hooks/useTicketSearch.ts`.** New hook: 250 ms single debounce, `useQuery` keyed `['ticket-search', debouncedQuery]`, `enabled` at ≥2 trimmed chars, `staleTime: 30_000`, `retry: false`, `refetchOnWindowFocus: false`. Ranking: assigned-to-you first (only when `useCurrentUser` has resolved), then open-before-done, then recent-before-stale, else Jira's own order (stable sort). `useCurrentUser` was given an optional `enabled` parameter (default `true`, so `ManagerMatrix`'s existing call site is unaffected) and is gated on the RAW query being non-empty — never fires on the popup's first paint (NFR1), starts resolving from the first keystroke rather than waiting out the debounce (AC4's "never block the list on it").
- **Tasks 4–6 — `components/today/SearchPanel.tsx`.** One new component covers the field, the `/`/`Esc` handling, the combobox/listbox/option results card, and the write path. `SearchPanelHandle` exported per D-7.4-26, `ref` accepted as a plain React 19 prop (no `forwardRef`). The write path mirrors `ResumeCard.submitSeconds` exactly (ok / outbox-enqueue for network+rate-limited / error), including the `lastLoggedTicket` write and `badge-update` broadcast.
- **D-7.4-19's ARIA shape, one refinement beyond the story's own draft:** the results `<ul role="listbox">` is now a **persistent** container whenever a search is active (across in-flight/empty/failed/results), not one that only mounts once results exist. An empty listbox (no `option` children) is valid ARIA, and this gives `aria-busy`, `aria-controls`, and `aria-activedescendant` one stable element to point at in every state — AC6 explicitly requires `aria-busy="true"` on "the results container while in flight," which has no honest home if the container itself only appears after results land. Pinned by a dedicated test (`aria-busy="true"` while in-flight, `"false"` once results arrive).
- **D-7.4-11 (non-subtask warning).** Implemented as real, always-visible row text (not a hover-only pill): amber `text-amber-ink`, a `TriangleAlert` icon (`aria-hidden`), and plain-language copy ("Hours logged here may not show up when your manager reviews approvals.") that never names "subtask" or "issue type". The warning also rides in the row's composed `aria-label`, so a keyboard user landing on a non-subtask row via `aria-activedescendant` has it in the row's accessible name before ever pressing `⏎` — satisfying "must appear at the point of the write, not only as a row pill." Pinned: a non-subtask result renders it, a subtask result does not (both in text content and in the accessible name).
- **Task 7 — Wired into `entrypoints/popup/App.tsx`.** Fourth session list `searchEntries` added following the exact `ptoEntries`/`resumeEntries` pattern (derived `searchSeconds`, folded into `sessionSeconds`, appended to `externalEntries`, routed in both edit/delete handlers). `<SearchPanel>` mounted unconditionally right after the conditional `ResumeCard` block — this single placement satisfies AC7 for free: when `resume.status !== 'none'` it renders below the card; when `'none'` the card block renders nothing and `SearchPanel` becomes the scroll region's first child, taking the autofocus. `<TodayView>` wrapped in a `<div hidden={searchActive}>` — the HTML attribute, not a Tailwind class. `breaksHeaderBaseline` left byte-identical (untouched). `searchPanelRef` held for Story 7.5.
- **Task 8 — `ResumeCard.tsx`.** Two additions only, exactly as scoped: `data-slash-passthrough="true"` on the hour input, and one guard line in the focus-latch effect (`if (document.activeElement && document.activeElement !== document.body) return;`) before flipping `focusedRef.current`. Nothing else in the file changed — `latchedTicketRef`, `seededKeyRef`, and `submitSeconds` (the D-7.3-9 write-target freeze) are untouched.
- **Task 9 — Tests and gates.** Every test named in Dev Notes > Testing was written. Three RED-proving tests were explicitly broken and restored (see Debug Log References): the reverse-focus-steal guard, and the D-7.4-18 `hidden`-vs-conditional-render hazard. The D-7.3-9-via-search invariant (a search-driven log must not retarget the on-screen resume card) is proven at the integration level in `App.session-total.test.tsx`, alongside a search-driven additivity test mirroring the existing resume-card one. `App.a11y.test.tsx` extended with both new states (search promoted to primary; search results open) — zero Critical/Serious in both.
- **Test-file placement deviation (flagged):** the story's Dev Notes table places the D-7.4-18 "log → search → Esc → entry survives" test under `App.test.tsx`. That file mocks `TodayView` down to a bare stub, which cannot observe a real `loggedEntries` survival hazard. `App.session-total.test.tsx` already drives the REAL `TodayView` through the real composition root for exactly this class of hazard (Story 7.2 Finding 1's header comment says as much), so the D-7.4-18 teeth test — and its sibling search-driven double-count/D-7.3-9 tests — were placed there instead. `App.test.tsx` itself was extended with the AC7 *structural* assertions (DOM order, autofocus, no `-mt-[10px]`) that don't need the real `TodayView`.
- **All three gates green:** `pnpm compile` clean; `pnpm test` 88 files / 1099 passed / 1 skipped (baseline 86/1049/1 + 50 new tests), exit non-zero only from the same pre-existing `ManagerView.test.tsx` rejection; `pnpm build` clean (887.58 kB); `pnpm lint` 0 errors (pre-existing `import/order` warnings only, none in any file this story touched or added).
- **Shared-consumer regression check (7.2 Finding 2's lesson):** `components/week/WeeklyGrid.test.tsx` and `components/today/TicketPicker.test.tsx` re-run green after the `lib/ticket-search.ts` widening — confirmed purely additive.

### File List

**New**
- `components/today/SearchPanel.tsx`
- `components/today/SearchPanel.test.tsx`
- `hooks/useTicketSearch.ts`
- `hooks/useTicketSearch.test.ts`
- `components/today/TicketPicker.search-jql.test.tsx` — finisher pass (Finding 1/D-7.4-15): drives `TicketPicker`'s real search path with `jiraGet` mocked (not `lib/ticket-search`), proving the exact request URL is byte-identical to `dfccf5a`.

**Modified**
- `lib/ticket-search.ts` — widened field projection + JQL (D-7.4-21, D-7.4-13); exports `MAX_RESULTS`. Finisher pass (Finding 1/D-7.4-15): the widened JQL is now an explicit opt-in `{ widen: true }` parameter — the default (and every unwidened call, including `TicketPicker`'s) is byte-identical to `dfccf5a`.
- `lib/ticket-search.test.ts` — updated/added assertions for the widened projection and JQL. Finisher pass: exact-JQL-string assertions for BOTH branches, plus a byte-identical-to-`dfccf5a` full-URL proof.
- `lib/jira-types.ts` — `JiraHierarchyIssueSchema` gained optional `fields.status.statusCategory.key` and `fields.updated` (D-7.4-13 ranking mitigation). Not touched by the finisher pass.
- `hooks/useCurrentUser.ts` — added an optional `enabled` parameter (default `true`). Not touched by the finisher pass.
- `hooks/useTicketSearch.ts` — finisher pass: opts in to `searchTickets(trimmed, { widen: true })` (Finding 1/D-7.4-15); ranking comparator guards against a `NaN` result when both compared issues lack `updated` (Finding 10).
- `hooks/useTicketSearch.test.ts` — finisher pass: updated the `searchTickets` call assertion for the new `{ widen: true }` argument; added the NaN-comparator regression test (Finding 10).
- `entrypoints/popup/App.tsx` — fourth session list (`searchEntries`), `<SearchPanel>` mount, `hidden`-attribute wrapper around `<TodayView>`, `searchPanelRef`. Not touched by the finisher pass beyond the `D-7.4-*` comment renumbering.
- `entrypoints/popup/App.test.tsx` — AC7 structural tests, updated the AC5-collapse test for the now-real search field, `useTicketSearch` mock. Not touched by the finisher pass beyond the `D-7.4-*` comment renumbering.
- `entrypoints/popup/App.a11y.test.tsx` — extended for both new SearchPanel states. Re-verified green with the finisher pass's markup changes (unchanged file).
- `entrypoints/popup/App.session-total.test.tsx` — search-driven additivity test, D-7.3-9-via-search test, D-7.4-18 RED-proven hazard test, `useTicketSearch` mock. Finisher pass (Finding 5): the D-7.3-9-via-search test was retitled and its comment rewritten to stop claiming it pins the identity-latch invariant, and to cite `ResumeCard.test.tsx`'s own RED-proven latch test as the real pin. No assertions changed.
- `components/today/ResumeCard.tsx` — `data-slash-passthrough="true"` on the hour input; one-line focus-latch guard (D-7.4-17). Not touched by the finisher pass beyond the `D-7.4-*` comment renumbering.
- `components/today/ResumeCard.test.tsx` — `data-slash-passthrough` test; RED-proven reverse-focus-steal test. Not touched by the finisher pass beyond the `D-7.4-*` comment renumbering.
- `components/today/SearchPanel.tsx` — finisher pass: reverse focus-steal guard on the autofocus effect (Finding 3); `scrollIntoView({ block: 'nearest' })` on the active option (Finding 2/D-7.4-16); the non-subtask warning duplicated into the always-visible header strip and wired into the hour input's `aria-describedby` (Finding 2/6); the `role="status"` region now announces `in-flight` and `failed` states (Finding 4); `data-slash-passthrough="true"` on the panel's own hour input (Finding 7); `text-royal-purple` → `text-primary` (Finding 8); an emptied hour field now renders amber helper text (Finding 9).
- `components/today/SearchPanel.test.tsx` — finisher pass: new tests for Findings 2, 3, 4, 6, 7, 9 (see above), plus the two updated rate-limited-announcement assertions needed once the same copy started rendering in both the visible paragraph and the sr-only live region.
- `_bmad-output/implementation-artifacts/epic-7-decision-log.md` — finisher pass: folded the story's local `D-7.4-1…10` into canonical `D-7.4-17…26` entries (D-7.3-11's fold-in pattern), and recorded the review findings' resolutions in summary.

**Not modified**
- `styles/globals.css`, `components/today/TodayView.tsx`, `components/today/TicketPicker.tsx`, `components/today/LoggedToday.tsx`, `components/today/QuickLogForm.tsx`, `components/shell/*`, `components/week/*`, `components/manager/*`, `entrypoints/fullpage/*`, `hooks/useTodayTotal.ts`, `hooks/useResumeTicket.ts`, `hooks/useWeekWorklogs.ts`, `lib/storage/last-logged.ts`, `lib/storage/pinned-tickets.ts`

---

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-07-26 | Story created at `ready-for-dev` from `epics.md` lines 1789–1822 at baseline `dfccf5a`. Inline investigation of `lib/ticket-search.ts`, `lib/jira-types.ts`, `lib/jira-client.ts`, `hooks/useCurrentUser.ts`, `entrypoints/popup/App.tsx`, `components/today/{ResumeCard,TodayView,TicketPicker}.tsx` and the round-2 mockup. Records ten orchestrator decisions D-7.4-17…D-7.4-26, closes Story 7.3's carried-forward AC5 half as AC7 (D-7.3-1), resolves the `/`-shortcut collision with 7.3's autofocus latch in both directions (D-7.4-17), identifies the unmount-wipes-session-state hazard in the AC3 list swap (D-7.4-18), specifies the combobox/listbox ARIA shape and moves the hour input out of `role="option"` (D-7.4-19), reuses `JiraHierarchySearchSchema` rather than adding one (D-7.4-21), and publishes the `SearchPanelHandle` seam Story 7.5 will call (D-7.4-26). Six escalations raised for the orchestrator. | bmad-story-creator |
| 2026-07-26 | Story implemented end to end: widened `lib/ticket-search.ts` (D-7.4-21, D-7.4-13); new `hooks/useTicketSearch.ts` (debounce, cancellation-safe ranking); new `components/today/SearchPanel.tsx` (field, `/`/`Esc`, combobox/listbox/option results, D-7.4-11 non-subtask warning, write path mirroring `ResumeCard.submitSeconds`); wired into `entrypoints/popup/App.tsx` as a fourth session list with a `hidden`-attribute wrapper around `TodayView` (D-7.4-18) and AC7's promoted-primary placement; `ResumeCard.tsx` gained `data-slash-passthrough` and the reverse-focus-steal guard (D-7.4-17, Task 8). Two deviations flagged: `JiraHierarchyIssueSchema` gained `status`/`updated` beyond D-7.4-21's own field list (forced by D-7.4-13's ranking mitigation), and the `listbox` container was made persistent across all search states (not results-only) so AC6's `aria-busy` has a stable home. The D-7.4-18 and D-7.3-9 hazard tests were placed in `App.session-total.test.tsx` rather than `App.test.tsx` (the latter mocks `TodayView` away entirely and cannot observe the hazard). Three tests explicitly proven RED then restored to green (reverse-focus-steal, D-7.4-18 hidden-vs-conditional-render). All gates green: compile clean, 88 files / 1099 passed / 1 skipped (baseline 86/1049/1 + 50 new), build clean, lint 0 errors. Status → `review`. | bmad-story-developer |
| 2026-07-26 | Code review: 0 Blockers / 3 Majors / 3 Minors / 4 Nits, with five reverted mutations proving test teeth (N1–N5) and a hand-computed contrast check. Two Majors escalated to the owner and ruled on as D-7.4-15 (scope the widened JQL to an opt-in) and D-7.4-16 (make the non-subtask warning unmissable). Status → `review` (Changes Requested). | bmad-code-reviewer |
| 2026-07-26 | All 10 findings triaged and resolved — 9 FIX outright, 1 FIX-with-a-deferred-sub-item (Finding 10's truncation off-by-one), 0 dismissed (see "Finding Resolutions" below). `searchTickets` gained an explicit `widen` opt-in; `TicketPicker`'s query proven byte-identical to `dfccf5a`; the active search option now scrolls into view and the non-subtask warning duplicated into the header strip; `SearchPanel`'s autofocus gained the reverse focus-steal guard (RED-proven); failure/in-flight states now announce; the toothless D-7.3-9-via-search test was reframed to cite its real pin instead of claiming one it didn't have; three Nits fixed outright (slash-passthrough, token discipline, empty-hour messaging) plus the NaN-comparator half of Finding 10. One new test file (`TicketPicker.search-jql.test.tsx`). Story creator's local `D-7.4-1…10` folded into `epic-7-decision-log.md` as canonical `D-7.4-17…26`; every citation repointed. Gates: compile clean; lint 0 errors/53 warnings (unchanged from the reviewer's baseline); test 89 files / 1115 passed / 1 skipped (delta +1 file / +16 tests over the reviewed baseline of 88/1099/1), exit non-zero only from the single known pre-existing `ManagerView.test.tsx` rejection; build clean (888.51 kB). Status → `done`. | bmad-story-finisher |

---

## Review Findings

## Review Summary

- **Reviewed by:** bmad-code-reviewer
- **Date:** 2026-07-26
- **Story Status Recommendation:** **Changes Requested**
- **Blockers:** 0
- **Majors:** 3
- **Minors:** 3
- **Nits:** 4

### Gates — re-measured by the reviewer, not taken on trust

| Gate | Dev claim | Reviewer-measured | Verdict |
|---|---|---|---|
| `pnpm test` | 88 files / 1099 passed / 1 skipped | **88 files / 1099 passed / 1 skipped**, exit 1 | ✅ exact match |
| Unhandled rejections | exactly 1, pre-existing | **exactly 1** — `TypeError: Cannot read properties of undefined (reading 'runtime')` in `@wxt-dev/storage` `getStorageArea`, originating in `components/manager/ManagerView.test.tsx` | ✅ matches the documented baseline; no new rejection |
| Delta vs baseline (86 / 1049 / 1) | +2 files / +50 tests | **+2 files / +50 passed / +0 skipped** | ✅ no drop below 1049 |
| `pnpm compile` | clean | exit 0, no output | ✅ |
| `pnpm lint` | 0 errors | **0 errors, 53 warnings** (all `import/order`, warn-level, none in files this story added) | ✅ |
| `pnpm build` | clean, 887.58 kB | exit 0 | ✅ |
| `breaksHeaderBaseline` byte-identical to `dfccf5a` | untouched | `diff` of the extracted line vs `dfccf5a` → **IDENTICAL** (`connected && resume.status !== 'none'`) | ✅ |
| `lib/hierarchy.ts` / `lib/manager-matrix.ts` unchanged (D-7.4-11) | unchanged | absent from `git status`; `git diff dfccf5a` empty | ✅ |
| `styles/globals.css`, `TodayView.tsx`, `TicketPicker.tsx` unchanged | unchanged | `git diff dfccf5a` empty for all three | ✅ |
| Fenced Epic 6.3 files | not this story's | untouched by review; excluded from all diffs | ✅ |

**Every headline number in the Dev Agent Record is accurate.** The findings below are not about the gates.

### Teeth verification — 5 mutations applied, run, and reverted

Every mutation was applied to the working tree, the relevant suite run, then reverted by inverse-edit and **md5-verified** against the pre-review hash. Final `git status --porcelain` matches the pre-review file set exactly; `components/today/ResumeCard.tsx` re-confirmed at `+16 / -0` vs `dfccf5a`.

| # | Mutation | Result | Meaning |
|---|---|---|---|
| N1 | `isNonSubtask()` → always `false` (kill the D-7.4-11 warning) | **RED** | ✅ the warning the developer did **not** list as RED-proved **does** have teeth (`SearchPanel.test.tsx` D-7.4-11 test fails on both the text and the `aria-label`) |
| N2 | `<div hidden={searchActive}>` → `{!searchActive && <div>}` | **RED** | ✅ D-7.4-2 pinned. `not.toBeVisible()` also pins the **attribute over a Tailwind class** — a class sets no `display:none` in jsdom, so a class-only build fails too |
| N3 | remove the `!latchedTicketRef.current` guard (re-latch every render) | **RED — but only in `ResumeCard.test.tsx`** | ⚠️ the D-7.3-9 invariant is protected, but by **Story 7.3's** test. 7.4's own new search-driven no-retarget test stayed **GREEN** → Finding 5 |
| N4 | remove the `document.activeElement` reverse-focus-steal guard | **RED** | ✅ D-7.4-1 Task 8 guard genuinely pinned (dev's claim confirmed) |
| N5 | (inspection, not mutation) stale-response + 429 tests | n/a | ✅ `useTicketSearch.test.ts` genuinely constructs the out-of-order case — `"aba"` held open, `"abacus"` resolves first, then `"aba"` lands with `SHOULD-NOT-APPEAR` and is correctly ignored. 429 asserts exactly 1 call after 5000 ms of fake time |

### Hand-computed contrast (the axe harness cannot catch this class — Story 7.2's lesson)

Relative luminance computed per WCAG 2.1 from the raw hex in `styles/globals.css`:

| Pair | Ratio | Verdict |
|---|---|---|
| `amber-ink #7a3e06` on `background #fafafb` (non-active row) | **7.99 : 1** | ✅ passes AA (and AAA) |
| `amber-ink #7a3e06` on `primary-soft #ecebf3` (**the active/preselected row**) | **7.04 : 1** | ✅ passes AA (and AAA) |
| `royal-purple #615b99` on `#fafafb` (LoaderCircle, non-text) | **5.81 : 1** | ✅ passes the 3:1 non-text floor |

**The warning is amber, never red** — pinned by an explicit `.text-state-danger` → `toBeNull()` assertion inside the row. Delete the icon and the colour and `"Hours logged here may not show up when your manager reviews approvals."` still reads correctly, names no issue type, and states the consequence. **D-7.4-11's copy, colour, icon-decoration and text-survivability requirements are met.**

---

### Finding 1: D-7.4-13's JQL widening leaks into `TicketPicker` (popup **and** week grid) with none of the owner's mitigations, and the shared-consumer check that cleared it is structurally blind

- **Severity**: Major
- **Category**: Correctness / Shared-seam regression
- **Location**: `lib/ticket-search.ts:40-44`; consumer `components/today/TicketPicker.tsx:214-218`; the blind tests at `components/today/TicketPicker.test.tsx:23` and `components/week/WeeklyGrid.test.tsx:11`
- **Observation**: D-7.4-13 changed the **JQL**, not only the field projection — `summary ~` → `text ~`, and both `statusCategory != Done` and `updated >= -28d` deleted. `searchTickets` has **two** consumers: the new `hooks/useTicketSearch.ts` and the pre-existing `components/today/TicketPicker.tsx:214`, which is mounted by the popup (`TodayView.tsx:214`) **and** by `components/week/WeeklyGrid.tsx`. The owner's required mitigations — open-before-done and recent-before-stale ranking, plus D-7.4-14's truncation line — live **only** in `useTicketSearch.ts:82-106`. `TicketPicker` maps the response straight into state in Jira's raw returned order (`TicketPicker.tsx:215-218`) and has no ranking and no truncation notice at all. The Completion Notes state the change is "purely additive" and cite green `TicketPicker.test.tsx` / `WeeklyGrid.test.tsx` runs as the 7.2-Finding-2 shared-consumer check. That claim is true of the *projection* and **false of the JQL**, and the cited tests cannot detect it: `TicketPicker.test.tsx:23` mocks `@/lib/ticket-search` wholesale, and `WeeklyGrid.test.tsx:11` mocks `TicketPicker` away entirely. Neither file contains a single JQL assertion. A green run of a mocked-away dependency is not proof of safety — this is the exact defect class Story 7.2's Finding 2 established.
- **Impact**: The week grid's "Search Jira" flow — a shipped Epic 2/4 surface this story lists under "Not modified" — now returns Done tickets and tickets untouched for years, matched on description text, in unranked relevance order with no truncation notice. `TicketPicker` is also the only `addPinnedTicket` writer, so a user picking a stale/closed ticket from a degraded result list pins it too. The owner accepted the reach/latency trade **on the basis of the ranking mitigation**; on this second surface that mitigation does not exist.
- **Suggested Resolution**: Do not fix by editing `TicketPicker`'s behaviour silently. Either (a) keep the old JQL for `TicketPicker` by giving `searchTickets` an explicit opt-in parameter for the widened query used only by `useTicketSearch`, or (b) accept the widening on both surfaces and say so in the Completion Notes — but in either case add a test that actually asserts the JQL string reaching `jiraGet` from `TicketPicker`'s path (`TicketPicker.test.tsx` currently cannot, because it mocks the module). **Escalate to the owner**: D-7.4-13 was written about the search surface; whether it was intended to change the week grid's picker is an owner call, not a story-author call.
- **Related AC**: AC8 (`components/week/*` unchanged — the *files* are unchanged, the *behaviour* is not), D-7.4-13

### Finding 2: `↑`/`↓` never scrolls the active option into view — the D-7.4-11 warning can be off-screen at the exact moment `⏎` writes

- **Severity**: Major
- **Category**: AC Conformance / Accessibility
- **Location**: `components/today/SearchPanel.tsx:297-306` (`handleArrow`), `:493-550` (the listbox)
- **Observation**: `handleArrow` mutates `activeIndex` only. There is **no** `scrollIntoView` call anywhere in `SearchPanel.tsx` or `useTicketSearch.ts` (grep-confirmed). DOM focus deliberately never leaves the search input (D-7.4-3), and both `ArrowDown` and `ArrowUp` call `preventDefault()`, so the browser's own caret-scroll is suppressed too — nothing scrolls the list. With `MAX_RESULTS = 20` two-line-plus rows inside the popup's single ~500 px scroll region, the active option leaves the viewport after roughly the eighth result.
- **Impact**: Two distinct failures. (1) AC5's "`↑`/`↓` moves the selection" is only nominally met — past the visible fold the user sees **no** highlighted row, cannot tell what is selected, and `⏎` logs a ticket they cannot see. (2) It directly undermines D-7.4-11: the owner required the warning to be present "at the point of the write … so a keyboard user pressing `⏎` on a preselected row cannot miss it", and the warning renders only inside the row. An off-screen active row means the entire safety mechanism for the money path is invisible at the moment of the write. The ARIA APG makes this explicit — the element owning `aria-activedescendant` is responsible for scrolling the active option into view.
- **Suggested Resolution**: In an effect keyed on `clampedActiveIndex`, call `document.getElementById(optionId(clampedActiveIndex))?.scrollIntoView({ block: 'nearest' })`. `block: 'nearest'` will not disturb the page when the row is already visible. Add a test asserting `scrollIntoView` is invoked for the newly-active option on `↑`/`↓` (jsdom does not implement it, so it needs a stub — which is exactly what makes it assertable).
- **Related AC**: AC5, D-7.4-11, D-7.4-12

### Finding 3: The new `SearchPanel` autofocus has no "focus already claimed" guard — it reintroduces the reverse focus-steal D-7.4-1 just fixed on `ResumeCard`

- **Severity**: Major
- **Category**: Correctness / Accessibility
- **Location**: `components/today/SearchPanel.tsx:164-169`; mount site `entrypoints/popup/App.tsx:255`
- **Observation**: `autoFocus={resume.status === 'none'}` is a **transition**, not a constant. `hooks/useResumeTicket.ts` returns `{ status: 'loading' }` (lines 155, 168) until the week query settles or `COLD_START_SKELETON_BUDGET_MS` (2000 ms) expires, and only then can return `{ status: 'none' }` (line 170). So on a cold open `autoFocus` flips `false → true` up to two seconds after mount, and the effect at `:164` fires and calls `inputRef.current.focus()` **unconditionally** — it checks only its own `autoFocusedRef` latch, never `document.activeElement`. Task 8 added exactly that guard to `ResumeCard.tsx:158`, and the D-7.4-1 rationale in that file's own comment says it "also protects against any future focus-claiming surface". `SearchPanel` is a new focus-claiming surface and did not get it.
- **Impact**: During the cold-start window the user can focus `TicketPicker`'s search or subtask-name field, or the PTO action-bar control, and begin typing. When `resume` resolves to `'none'`, `SearchPanel` yanks focus away mid-word and the remaining keystrokes land in the search field. This is the same defect class the story treated as important enough to warrant an owner decision and a dedicated RED-proved test — implemented in one direction only.
- **Suggested Resolution**: Mirror `ResumeCard.tsx:158` exactly — `if (document.activeElement && document.activeElement !== document.body) return;` before `autoFocusedRef.current = true;`. Pin it with the symmetric test: render with `resume.status: 'loading'`, focus another control, resolve to `'none'`, assert focus did not move.
- **Related AC**: AC7, D-7.4-1, D-7.4-7

### Finding 4: A failed or in-flight search is never announced — the live region emits the empty string, and the persistent empty listbox is all a screen-reader user gets

- **Severity**: Minor
- **Category**: Accessibility
- **Location**: `components/today/SearchPanel.tsx:358-363` (`announcement`), `:493-499` (persistent listbox), `:552-564` (the status paragraphs)
- **Observation**: `announcement` resolves to a string only for `kind: 'results'` and `kind: 'empty'`; every other state — including `in-flight` and **`failed` (rate-limited and network alike)** — yields `''`, so the `role="status"` region announces nothing. The "Searching…", "Jira is rate-limiting search — try again in a moment." and "Couldn't search Jira — try again." strings are plain `<p>` elements: not live regions, not inside the `<ul role="listbox">`, and not referenced by the combobox via `aria-describedby` or `aria-errormessage`. Because the listbox is now **persistent** across all states (the developer's flagged deviation), what a screen-reader user actually perceives in the failed state is a listbox with `aria-busy="false"` and zero options — indistinguishable from "no results". **Judgement on the persistent-listbox deviation itself:** it is valid ARIA, it genuinely gives `aria-busy` a stable home, and it is not a regression in the `in-flight` state (assistive tech suppresses `aria-busy` regions) or in the `empty` state (the `role="status"` says "No results"). It becomes a real gap only in the `failed` state, where nothing compensates — so the deviation is acceptable, but it must be paired with a failure announcement.
- **Impact**: D-7.4-13 explicitly makes 429s more likely ("429s appearing in normal single-user use" is the owner's own stated failure signal). A screen-reader user who hits one is told nothing, concludes their ticket does not exist, and searches again — straight back into the limiter.
- **Suggested Resolution**: Extend `announcement` to cover `failed` (distinguishing `rate-limited` from generic failure) and optionally `in-flight`. Assert it in `SearchPanel.test.tsx` alongside the existing neutral-colour assertion.
- **Related AC**: AC6, D-7.4-12

### Finding 5: The new D-7.3-9-via-search test has no independent teeth — it stays green under a full identity-latch neuter

- **Severity**: Minor
- **Category**: Tests
- **Location**: `entrypoints/popup/App.session-total.test.tsx:346-395`
- **Observation**: Mutation N3 removed the `!latchedTicketRef.current` guard from `ResumeCard.tsx:127`, making the card re-latch its identity on every render (full server-wins retargeting). Only Story 7.3's own `ResumeCard.test.tsx` test went red; **this story's new "a search-driven log does not change the on-screen resume card's subtask, pre-fill, or write target (D-7.3-9)" test stayed GREEN.** The reason is structural: `setLastLoggedTicket` is mocked, so no storage write actually occurs, and `useResumeTicket` reads storage once at mount with no subscription — the card can never be retargeted in this test regardless of whether the latch exists. The assertions are all absence-path (`expect(...).not.toHaveBeenCalledWith`, card still shows PROJ-9), which a totally neutered latch satisfies.
- **Impact**: Low — the invariant **is** protected, and my mutation confirmed it, but by 7.3's test. The story's own instruction ("7.4 … must **pin this with a test**") is met only nominally. The risk is that a future refactor which removes 7.3's test, or which adds a storage subscription in `useResumeTicket`, would find this test offers no backstop.
- **Suggested Resolution**: Give the test a mechanism it can actually observe — e.g. let the mocked `setLastLoggedTicket` feed a storage-change callback and assert the card still does not retarget; or drop the claim that this test pins D-7.3-9 and cite `ResumeCard.test.tsx` as the real pin in the Completion Notes.
- **Related AC**: D-7.3-9 (inherited invariant 1)

### Finding 6: D-7.4-11's warning does not reach the write control itself — only the row

- **Severity**: Minor
- **Category**: AC Conformance
- **Location**: `components/today/SearchPanel.tsx:428-456` (header strip / hour input), `:538-546` (the row warning)
- **Observation**: The owner required the warning "at the point of the write, not only as a row pill". The implementation puts it in the row as real amber text **and** in the row's composed `aria-label` (`optionAccessibleName`, `:105-107`) — which is materially more than a pill and is announced via `aria-activedescendant`, so the requirement is largely met. What is missing is the write control: the hour input's accessible name is just `Hours for {activeKey}` (`:439`), the header strip carries no warning, and the `CornerDownLeft` submit badge carries none. A user who tabs from the search field into the hour input and presses `⏎` there — an explicitly supported path (`handleHourKeyDown`, `:341-349`) — is on the control that performs the write with no warning in its accessible name or immediate vicinity.
- **Impact**: Partial. On its own this is a modest gap because the active row is normally adjacent and visible; combined with **Finding 2** (active row can be scrolled off-screen) it is how the warning becomes genuinely missable at the moment of the write.
- **Suggested Resolution**: When `isNonSubtask(activeItem.issue)`, append the warning to the hour input's `aria-label` (or wire `aria-describedby` to the active row's warning node), and consider surfacing it once in the header strip rather than only per row. Add an assertion that the warning is reachable from the hour input's accessible name for a non-subtask active item.
- **Related AC**: AC5, D-7.4-11

### Finding 7: `SearchPanel`'s own hour input lacks `data-slash-passthrough="true"`

- **Severity**: Nit
- **Category**: Convention
- **Location**: `components/today/SearchPanel.tsx:430-445`
- **Observation**: D-7.4-1's rule is that `/` is consumed only by "text inputs where `/` is a legitimate character", which is why `ResumeCard`'s hour input received `data-slash-passthrough="true"`. This story's own hour input accepts the identical hour syntax (`validateHours` → `parseHours`), where `/` is equally never valid, but did not get the attribute — so `/` types a stray slash there instead of returning focus to search.
- **Impact**: Trivial; a self-inflicted inconsistency with the rule the same story authored.
- **Suggested Resolution**: Add `data-slash-passthrough="true"` to the input at `:430`, and extend the existing D-7.4-1 test to cover it.
- **Related AC**: AC2, D-7.4-1

### Finding 8: `text-royal-purple` is the codebase's only usage of that token

- **Severity**: Nit
- **Category**: Convention (token discipline)
- **Location**: `components/today/SearchPanel.tsx:425`
- **Observation**: The `LoaderCircle` uses `text-royal-purple` (`#615b99`, `globals.css:105`). Grep confirms this is the **only** occurrence of `royal-purple` in any component. The story's own rule is "prefer the semantic name over the legacy alias wherever one exists"; the established semantic purple is `text-primary` (`#594f74`). No new colour value was introduced and contrast is fine (5.81:1, non-text floor is 3:1), so this is style only. For contrast, the `bg-state-info-subtle text-neutral-700` pending chip at `:480` is **not** a finding — it matches the established repo pattern used by `ResumeCard.tsx:372`, `QuickLogForm.tsx:290`, `PtoQuickAction.tsx:286`, `LoggedToday.tsx:812` and `TodayView.tsx:165`.
- **Suggested Resolution**: Use `text-primary`, or leave it and record the intent.
- **Related AC**: AC8 / Epic 7 token discipline

### Finding 9: An empty hour input silently does nothing

- **Severity**: Nit
- **Category**: Maintainability / UX
- **Location**: `components/today/SearchPanel.tsx:79-86` (`validateHours`), `:282-288` (`logItem`)
- **Observation**: `validateHours('')` returns `{ kind: 'empty' }`, which is neither `valid` (so `logItem` returns early and no post fires) nor amber (so `isAmber` is false and the message region at `:459-486` renders nothing). A user who clears the hour field and presses `⏎` gets no post, no message, and no explanation.
- **Impact**: Minor confusion only; correctly fails closed — no bad write.
- **Suggested Resolution**: Treat `empty` like `unparseable` for messaging (render `helperText` in amber), or pre-guard `⏎` so the field cannot be empty.
- **Related AC**: AC5

### Finding 10: `updatedMs` can make the ranking comparator return `NaN`, and `truncated` false-positives at exactly `MAX_RESULTS`

- **Severity**: Nit
- **Category**: Correctness (latent)
- **Location**: `hooks/useTicketSearch.ts:63-68`, `:104`, `:164`
- **Observation**: Two small edges. (1) `updatedMs` returns `-Infinity` for a missing/unparseable `updated`; when **both** items lack it, `updatedMs(b) - updatedMs(a)` evaluates `-Infinity - (-Infinity)` = **`NaN`**. ECMA-262 leaves a `NaN`-returning comparator implementation-defined; V8 happens to treat it as `0` (so the stable-sort tie-break survives today), but it is unspecified behaviour in a ranking path the owner made load-bearing under D-7.4-13. (2) `truncated: issues.length >= MAX_RESULTS` cannot distinguish "exactly 20 matches exist" from "more than 20 exist", so a search with exactly 20 real hits shows D-7.4-14's truncation line incorrectly.
- **Impact**: Negligible today. (1) is a latent portability hazard; (2) over-warns, which is the safe direction and consistent with D-7.4-14's intent that truncation is never *silent*.
- **Suggested Resolution**: (1) Return `Number.NEGATIVE_INFINITY` → use a sentinel of `0` instead, or guard: `const d = updatedMs(b) - updatedMs(a); return Number.isNaN(d) ? 0 : d;`. (2) Fetch `MAX_RESULTS + 1`, slice to `MAX_RESULTS`, and set `truncated` from the overflow — or leave as-is and note the conservative bias.
- **Related AC**: AC4, D-7.4-13, D-7.4-14

---

### Explicitly verified as correct — no finding

- **AC1** idle field: `h-9` (36 px), `rounded-lg`, `border border-border`, `bg-surface`, `shadow-hairline`, 13 px `Search` icon `aria-hidden`, trailing `kbd` badge `aria-hidden`, `aria-keyshortcuts="/"`, placeholder verbatim including the em dash. ✅
- **AC2** `/` both directions: document listener at `:176-191`; `/` types normally in a plain text input, **is** honoured from `ResumeCard`'s hour input via `data-slash-passthrough`, and types normally into the search field itself. Badge derives from focus state, not from how focus arrived. 1.5 px primary border + `ring-focus` applied via `focus-within:`, never static (D-7.3-15). ✅
- **AC3 / D-7.4-2**: HTML `hidden` attribute, keyed on the **raw** trimmed query; `TodayView` never unmounts. RED-proved by N2, which also pins attribute-over-class. ✅
- **AC4** ranking: `useTicketSearch.test.ts:170` and `:208` both assert an output order that is the **reverse** of the input order, so they fail if the ranking is reversed or removed. Degrades to Jira order with no pills when `useCurrentUser` is unresolved **or** errored (two separate tests). ✅
- **AC5 / D-7.4-12** ARIA: `role="combobox"` on the input, `role="listbox"` on the `<ul>`, `role="option"` on rows, exactly one `aria-activedescendant`, and a test explicitly asserting **zero focusable descendants inside any option**. `Esc` calls both `preventDefault()` and `stopPropagation()` and follows D-7.4-8's table exactly. ✅ (navigation caveat = Finding 2)
- **AC6**: `LoaderCircle` 13 px, `motion-safe:animate-spin`, `aria-hidden`; field never disabled or overlaid; `aria-busy` toggles `true`→`false`, pinned. D-7.4-9 comment present. ✅
- **AC7**: verified structurally at `App.test.tsx:283` and `:301`; `breaksHeaderBaseline` **byte-identical** to `dfccf5a`; no `-mt-[10px]` when `'none'`. ✅ (autofocus caveat = Finding 3)
- **D-7.4-6 debounce/cancellation**: single 250 ms debounce, `useQuery` keyed `['ticket-search', trimmed]`, `enabled` ≥ 2 trimmed chars, `staleTime: 30_000`, `retry: false`, `refetchOnWindowFocus: false`. The out-of-order race is genuinely constructed and genuinely ruled out (N5). 429 → neutral text, never red, never amber, exactly one call. No `['week-worklogs', …]` invalidation anywhere in the story's diff. ✅
- **D-7.4-14 truncation**: plain text, no pill, no icon; present when capped and absent when not, pinned at both the render layer (`SearchPanel.test.tsx:381`) and the computation layer (`useTicketSearch.test.ts:340`). ✅
- **Shared seam — `lib/jira-types.ts`**: `JiraHierarchyIssueSchema` gained only `status` and `updated`, both `.optional()`. Its other consumer, `lib/hierarchy.ts` (lines 111, 134, 150), requests neither field, and zod treats absent optionals as valid — genuinely additive. ✅
- **Shared seam — `hooks/useCurrentUser.ts`**: the sole other caller is `components/manager/ManagerMatrix.tsx:136`, which calls `useCurrentUser()` with no argument and therefore takes the `enabled = true` default. Behaviour unchanged. ✅
- **NFR1**: `useCurrentUser` is gated `enabled: query.trim().length > 0`, so no `myself` GET fires on the popup's first paint. The hook is mounted in `useTicketSearch` rather than "inside the results component" as the story's letter said, but `enabled: false` achieves the stated intent exactly. ✅
- **One scroll region (7.2 AC2)**: zero `overflow-*` and zero `max-h-*` in `SearchPanel.tsx`, asserted by a dedicated test. ✅
- **Write path**: line-by-line mirror of `ResumeCard.submitSeconds` (`:186-240`) — identical ok / network|rate-limited → `enqueueOutbox` / else error branching, identical `badge-update`, identical `setLastLoggedTicket`, identical "no stamp on outbox enqueue". Re-entrancy guarded by `isLogPending`. ✅
- **Scope discipline**: `TicketPicker` still mounted (`TodayView.tsx:214`), no "Recently worked", no "N more assigned tickets". `SearchPanelHandle` exported and used by the `/` listener and the ref alike — one focus path. ✅
- **D-7.4-11 containment**: `lib/hierarchy.ts` and `lib/manager-matrix.ts` confirmed unchanged. ✅

### Escalations needing an owner ruling

1. **Finding 1 — does D-7.4-13 apply to `TicketPicker`?** The decision was written about the popup's search surface, but the JQL lives in a module the week grid's picker also uses, and the ranking mitigation the owner made a condition of the widening does not exist there. Whether the week picker should keep the narrow JQL until Story 7.5, or adopt the widening unmitigated, is an owner call.
2. **Finding 2 is the practical limit of D-7.4-11's mitigation.** The owner accepted that "the only defence is a warning the user is free to ignore". A warning that can be scrolled out of view at the moment of the write is weaker than what was ruled. Worth confirming the fix is sufficient, or revisiting option (b) (`lib/create-subtask.ts` routing) sooner.

---

## Finding Resolutions

*Both escalations above (Finding 1 → D-7.4-15, Finding 2 → D-7.4-16) were ruled on by the owner before
this pass began; this finisher implemented the rulings rather than re-litigating them. The remaining
eight findings' triage below is this finisher's own judgement. All ten numbered findings were resolved
this pass — nine FIX outright, one (Finding 10) FIX on its primary sub-item with its secondary sub-item
DEFERRED with rationale. Zero findings were DISMISSED as incorrect. The "## Review Findings" section
above this one is the reviewer's frozen historical record and was not edited.*

### Finding 1 (Major) — FIX, per D-7.4-15

**Decision.** FIX, exactly as D-7.4-15 rules. `lib/ticket-search.ts`'s `searchTickets` now takes the
widened JQL as an explicit opt-in: `searchTickets(query, { widen: true })` for the new popup search
(`hooks/useTicketSearch.ts`), and `searchTickets(query)` — no options — for everything else, which
produces the byte-identical `dfccf5a` request (JQL, `maxResults`, and `fields` all unchanged).
`components/today/TicketPicker.tsx` was **not edited** — its existing call site (`searchTickets(q)`
with no second argument) automatically reverted to the conservative query once the default flipped.

**Verification.** `lib/ticket-search.test.ts` gained a `describe` block asserting the exact `jql=`
string for both branches, that the key-exact branch is identical in both, and a full-URL
byte-for-byte comparison against a `dfccf5a`-reconstructed URL for the default call.
`components/today/TicketPicker.search-jql.test.tsx` (new) mocks `@/lib/jira-client`'s `jiraGet`
instead of `@/lib/ticket-search` — the exact blind spot the reviewer identified — and drives
`TicketPicker`'s real search-Jira flow end to end, asserting the request URL it actually sends is
byte-identical to `dfccf5a`, for both a text query and a ticket-key query.

**Files changed:** `lib/ticket-search.ts`, `lib/ticket-search.test.ts`, `hooks/useTicketSearch.ts`
(explicit `{ widen: true }` opt-in), `hooks/useTicketSearch.test.ts` (updated call assertion),
`components/today/TicketPicker.search-jql.test.tsx` (new).

### Finding 2 (Major) — FIX, per D-7.4-16

**Decision.** FIX, both required parts. (1) `SearchPanel.tsx` gained a `useEffect` keyed on
`clampedActiveIndex` that calls `document.getElementById(optionId(...))?.scrollIntoView?.({ block:
'nearest' })` on every selection change, including the initial preselection. `block: 'nearest'` only
moves the popup's one existing scroll region (`<main>` in `App.tsx`) when the option isn't already
visible — no nested scroll region is introduced anywhere in `SearchPanel.tsx`. (2) The D-7.4-11
warning is now also rendered in the always-visible results header strip (not only the row), active
whenever the currently-selected result is a non-subtask.

**Verification.** RED-proved by temporarily neutering the `scrollIntoView` effect body — both new
tests (initial-preselection scroll, and scroll-on-arrow-move) failed as expected, then the effect was
restored and re-verified green, with an `md5`-equivalent `git diff --stat` check that the restoration
was exact. A structural test asserts the header-strip warning is reachable without scrolling: it is a
DOM sibling rendered before the `<ul role="listbox">`, not a descendant of it, so it can never be
scrolled off screen by the same interaction that could hide the row.

**Files changed:** `components/today/SearchPanel.tsx`, `components/today/SearchPanel.test.tsx`.

### Finding 3 (Major) — FIX

**Decision.** FIX. Mirrored `ResumeCard.tsx`'s own reverse focus-steal guard exactly:
`SearchPanel`'s autofocus effect now bails with `if (document.activeElement && document.activeElement
!== document.body) return;` before latching `autoFocusedRef.current = true`. This is the symmetric
fix the finding asked for — the same hazard D-7.4-1/D-7.4-17 fixed on `ResumeCard` existed, unfixed,
on `SearchPanel`'s own new autofocus path.

**Verification.** RED-proved: temporarily removed the guard line, confirmed the new test ("does not
steal focus once it has already been claimed elsewhere before autoFocus flips true") failed with
`expected <input role="combobox"> to be <input>`, restored the guard via the inverse edit, confirmed
green and `md5`-identical to the pre-mutation file.

**Files changed:** `components/today/SearchPanel.tsx`, `components/today/SearchPanel.test.tsx`.

### Finding 4 (Minor) — FIX

**Decision.** FIX. The `role="status" aria-live="polite"` region's `announcement` now also covers
`in-flight` ("Searching…") and `failed` (distinguishing `rate-limited` from a generic failure,
reusing the same copy already shown visibly) — previously both resolved to `''`.

**Verification.** Three new tests assert the exact announced text for `in-flight`, `rate-limited`, and
a generic `network` failure. Two pre-existing tests ("a rate-limited SEARCH renders a neutral note,
never red") needed updating once the visible paragraph and the sr-only region started sharing the
same copy — `getAllByText` scoped to the non-`sr-only` element, rather than a behaviour change.

**Files changed:** `components/today/SearchPanel.tsx`, `components/today/SearchPanel.test.tsx`.

### Finding 5 (Minor) — FIX (reframed, not re-taught teeth)

**Decision.** FIX, taking the reviewer's own second offered option: "drop the claim that this test
pins D-7.3-9 and cite `ResumeCard.test.tsx` as the real pin." Investigated giving the test real teeth
first and concluded it is not achievable *for this specific test* without contriving an unrelated
hazard: in this file (and in production) a search-driven log never causes `useResumeTicket`'s
underlying `['week-worklogs', …]` query to re-resolve — that non-invalidation is exactly what the
sibling "does not double-count" test in the same file already pins — so `resume`'s identity never
changes after mount in this scenario, and the identity latch (present or removed) never gets an
opportunity to fire twice regardless of test construction. `ResumeCard.test.tsx`'s own "freezes the
write target once the card is ready" test (RED-proven in Story 7.3) already exercises the actual
hazard directly, by re-rendering the component with a changed `resume` prop — cheaper and more
precise than reconstructing that inside the full composition root.

**What changed.** The test was retitled from a claim ("does not change the on-screen resume card's
subtask, pre-fill, or write target (D-7.3-9)") to an accurate description of what it verifies (writes
to the shared store under the search ticket's key, never the resume card's, and doesn't incidentally
disturb the on-screen card) and its comment now explicitly cites `ResumeCard.test.tsx` as the real
D-7.3-9 pin. No assertions were removed — they remain valid, just correctly scoped in what they claim
to prove.

**Files changed:** `entrypoints/popup/App.session-total.test.tsx` (comment + test title only).

### Finding 6 (Minor) — FIX

**Decision.** FIX, alongside Finding 2 (they share a fix). The header hour input's `aria-describedby`
now includes the new header-strip warning's id whenever the active result is a non-subtask, so a user
who tabs directly into the write control and presses `⏎` — an explicitly supported path — has the
warning in the control's own accessible description, not only in the (possibly off-screen) row.

**Verification.** A test asserts the warning element's id appears in the hour input's
`aria-describedby` when the active result is a non-subtask, and that no header-strip warning renders
(so nothing to describe) when it is a subtask.

**Files changed:** `components/today/SearchPanel.tsx`, `components/today/SearchPanel.test.tsx`.

### Finding 7 (Nit) — FIX

**Decision.** FIX. Added `data-slash-passthrough="true"` to `SearchPanel`'s own header hour input —
the same attribute `ResumeCard`'s hour input already carries for the identical reason (it accepts hour
syntax where `/` is never a legitimate character).

**Verification.** A test asserts the attribute is present on the input.

**Files changed:** `components/today/SearchPanel.tsx`, `components/today/SearchPanel.test.tsx`.

### Finding 8 (Nit) — FIX

**Decision.** FIX. `text-royal-purple` → `text-primary` on the `LoaderCircle`. No new colour value
introduced either way; this just follows the story's own stated rule ("prefer the semantic name over
the legacy alias wherever one exists") for a token that had exactly one call site in the whole repo.
Contrast is unaffected (`text-primary` is the same hex family used elsewhere at AA-passing ratios).

**Files changed:** `components/today/SearchPanel.tsx`.

### Finding 9 (Nit) — FIX

**Decision.** FIX. An emptied hour field (`validation.kind === 'empty'`) is now treated identically to
`'unparseable'` for messaging — it renders the same amber helper text and still fails closed (no
post). Previously it rendered neither a message nor a post, which was confusing but not unsafe.

**Verification.** A test clears the hour field, asserts the amber helper text renders, and asserts
`⏎` still does not call `postWorklog`.

**Files changed:** `components/today/SearchPanel.tsx`, `components/today/SearchPanel.test.tsx`.

### Finding 10 (Nit) — FIX (NaN-comparator guard), DEFER (truncation off-by-one)

**Decision, sub-item 1 (NaN comparator): FIX.** Extracted the comparator's tie-break into a
`compareUpdated` helper that guards `Number.isNaN(diff)` and returns `0` (a genuine tie, preserving
Jira's own stable order) instead of relying on V8's undocumented treatment of a `NaN`-returning
comparator. Cheap, real correctness fix on a ranking path the owner made load-bearing (D-7.4-13).

**Verification.** A new test constructs two issues that both lack `updated` and asserts the result
order is unchanged (Jira's own order preserved) rather than crashing or reordering.

**Decision, sub-item 2 (`truncated` exact-`MAX_RESULTS` false positive): DEFER.** The reviewer's own
impact assessment says this is "negligible... over-warns, which is the safe direction and consistent
with D-7.4-14's intent that truncation is never silent." Fixing it properly means over-fetching
`MAX_RESULTS + 1` in the widened branch and slicing — a real change to the wire contract for a
cosmetic edge case (a search that returns *exactly* 20 matches, no more, shows an unnecessary "showing
the first 20" line). Given the fix's cost is disproportionate to a Nit-severity, reviewer-acknowledged
safe-direction inaccuracy, this is deferred rather than fixed in this pass.
**Follow-up needed:** if `MAX_RESULTS` is ever raised or the over-fetch pattern is otherwise touched
in a later story, fetch `MAX_RESULTS + 1` and set `truncated` from whether the raw count exceeds
`MAX_RESULTS` after slicing to it for display — no story currently owns this; flagging for Story 7.5
or a dedicated follow-up if it becomes user-visible.

**Files changed:** `hooks/useTicketSearch.ts` (sub-item 1 only), `hooks/useTicketSearch.test.ts`
(sub-item 1's regression test).

### The two owner-ruled escalations (Major 1 → D-7.4-15, Major 2 → D-7.4-16)

Both are recorded above as Finding 1 and Finding 2's resolutions — the owner's rulings, not this
finisher's judgement calls. See `epic-7-decision-log.md`'s **D-7.4-15** and **D-7.4-16** for the
owner's full reasoning (situation / options considered / why it wins), preserved there verbatim.

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-07-26 — created (ready-for-dev)

Search as the browse mechanism, at baseline dfccf5a.
Carries ORCHESTRATOR DECISIONS D-7.4-1..D-7.4-10. Notably: D-7.4-1 resolves the `/`-shortcut
collision with 7.3's autofocus latch in BOTH directions (a `data-slash-passthrough` opt-in on
the hour input, plus an already-claimed guard so a late `'loading' → 'ready'` resolve cannot
steal focus back out of search); D-7.4-2 forbids unmounting `TodayView` for AC3's list swap
(unmounting wipes `loggedEntries` and re-fires `onTotalChange(0)`, corrupting the chrome
figure) — it is hidden with the HTML `hidden` attribute instead, which jsdom can actually
assert; D-7.4-3 fixes the ARIA shape as combobox + listbox + option and moves the inline hour
input OUT of `role="option"` (an ARIA-invalid mockup construction), recorded as a deviation;
D-7.4-5 reuses the existing `lib/ticket-search.ts` seam and `JiraHierarchySearchSchema`
rather than adding either; D-7.4-7 closes Story 7.3's carried-forward AC5 half as this
story's AC7. Six escalations raised for the orchestrator (mockup fork, non-subtask logging,
JQL scope, maxResults=20, pinnedTickets after 7.5, an EXPERIENCE.md self-contradiction).

### 2026-07-26 — review

Owner rulings applied exactly: D-7.4-11 (no issue-type filter, log
directly, amber plain-language warning at row + write point), D-7.4-12 (listbox not grid,
per-row inputs dropped), D-7.4-13 (JQL widened to `text ~`, statusCategory/updated filters
dropped, mitigated by ranking not filtering), D-7.4-14 (truncation stated in text, never
silent). Two deviations flagged: `JiraHierarchyIssueSchema` gained `status`/`updated` beyond
D-7.4-5's own field list (forced by D-7.4-13's ranking mitigation); the results `listbox` was
made a PERSISTENT container across every search state (not results-only) so AC6's
`aria-busy="true"` has a stable element to toggle on. Three tests explicitly proven RED then
restored green: the D-7.4-1 reverse-focus-steal guard and the D-7.4-2 hidden-vs-conditional-
render hazard. D-7.4-2/D-7.3-9 integration tests placed in `App.session-total.test.tsx`
instead of `App.test.tsx` (the latter mocks `TodayView` away and cannot observe the hazard).
Final gates: 88 files / 1099 passed / 1 skipped (baseline 86/1049/1 + 50 new tests, 2 new
files), lint 0 errors, build green.

### 2026-07-26 — done

Code review found 0 blockers / 3 majors / 3 minors / 4 nits; all 10
findings resolved (9 FIX outright, 1 FIX-with-a-deferred-sub-item, 0 dismissed) by the story
finisher. The two Major escalations were owner-ruled before this pass as D-7.4-15 (scope the
widened JQL to an opt-in — `searchTickets` now takes `{ widen: true }` explicitly; `TicketPicker`
proven byte-identical to dfccf5a via a new jiraGet-mocked test) and D-7.4-16 (scroll the active
option into view + duplicate the non-subtask warning into the always-visible header strip). The
finisher also fixed a reintroduced reverse focus-steal hazard on SearchPanel's own autofocus
(RED-proven), extended the failure/in-flight live-region announcements, reframed a toothless
D-7.3-9-via-search test to cite ResumeCard.test.tsx as its real pin instead of a claim it
couldn't back, and fixed four Nits (slash-passthrough parity, token discipline, empty-hour
messaging, a NaN-comparator guard — the matching truncation off-by-one was deferred as a
reviewer-acknowledged safe-direction inaccuracy, not worth the wire-contract change for a Nit).
The story creator's local D-7.4-1..10 were folded into epic-7-decision-log.md as canonical
D-7.4-17..26 (D-7.3-11's fold-in pattern); every citation in the story file and source comments
was repointed. Final gates: 89 files / 1115 passed / 1 skipped (delta +1 file / +16 tests over
the reviewed baseline of 88/1099/1), lint 0 errors/53 warnings (unchanged), build green.
