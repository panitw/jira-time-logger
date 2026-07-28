---
baseline_commit: 53e6e44dda1029b76a8e4a4970ab2dff955f0f4c
---

# Story 7.3: Resume Card — The First Move

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Priya between meetings,
I want the ticket I last logged against already on screen with the hours field focused,
So that adding an hour takes one keystroke and no decisions.

## Context

This is the **product's primary affordance** — DESIGN.md calls it exactly that (line 450). Everything in
Epic 7 up to now built the room; this story puts the one thing you came for in the middle of it.

**What Story 7.2 already gives you (compose from it — do not re-derive, do not duplicate):**

| Seam | File | What it does for 7.3 |
|---|---|---|
| Popup chrome | `components/shell/ChromeHeader.tsx` | The fixed gradient header the card must break the baseline of. Its figure/bar live inside one `role="status" aria-live="polite"` region (lines 125–158). |
| **Today total** | `hooks/useTodayTotal.ts` | **The ONLY today-total seam.** AC4's "chrome figure and progress bar update" is satisfied by feeding this hook's `sessionSeconds` — never by a second counter. |
| Session-entry ownership | `entrypoints/popup/App.tsx` lines 50–65, 93–105 | `ptoEntries: LoggedEntry[]` + derived `ptoSeconds`. **The pattern 7.3's resume entries must copy** — a LIST, never a monotonic counter (7.2 Finding 3). |
| External-entry routing | `components/today/TodayView.tsx` lines 27–38, 113–157 | `externalEntries` / `onExternalEntryEdited` / `onExternalEntryDeleted` — renders a foreign-owned entry in "Logged today" with working edit/delete. |
| Slide-in animation | `components/today/LoggedToday.tsx` line 658 | `motion-safe:animate-slide-in` already fires for every newly-rendered entry. AC4's "animates into Logged today" is satisfied **by reuse**, not by a new animation. |
| Post seam | `components/today/QuickLogForm.tsx` lines 107–186 | `postWorklog` → ok / outbox-enqueue / error branching, `sendMessage('badge-update')`, `formatStartedISO`. Mirror it; do not re-invent it. |
| Action bar | `components/shell/PopupActionBar.tsx` | Holds the relocated `PtoQuickAction`. Untouched by this story except for one guard test (D-7.3-12). |
| Tokens | `styles/globals.css` `@theme` | `--shadow-lift`, `ring-focus`, `tabular`, `animate-skeleton`, `animate-slide-in`, the full `--text-*` scale, and `--spacing: 4px` (so **standard Tailwind spacing utilities are correct — use them normally**). |

**What this story is NOT.** It is not search (7.4), not the "Logged today" / "Recently worked" rebuild or
the 55-ticket handoff (7.5), not the day-status vocabulary (7.6), not the offline/error banners (7.9).
The body of the scroll region below the card stays exactly as 7.2 left it — the existing `TodayView` with
its `TicketPicker`. 7.5 replaces that body.

**Orchestrator decisions carried by this story** (numbered per `epic-7-decision-log.md`, the canonical
`D-7.3-*` registry — D-7.3-11): D-7.3-1 (AC5 is split; the search half is a named carry-forward to 7.4),
D-7.3-2 (resume data source), D-7.3-3 (the −10 px offset lives on the scroll container), D-7.3-4
(autofocus resolved from storage alone), D-7.3-5 (the cold-start blind spot; the lookup is not widened),
D-7.3-9 (the server-wins override is frozen at first paint — Blocker fix), D-7.3-10 (the cold-start
skeleton is bounded, not unbounded — Major fix), D-7.3-12 (time off never becomes the resume ticket),
D-7.3-13 (`+0.5/+1/+2` post that amount, they do not increment), D-7.3-14 (`border-border`, not the
spec's un-tokenised `#DEDCE9`), D-7.3-15 (`ring-focus` via `focus-within:`), D-7.3-16 (unparseable input
is amber, not red).

### ORCHESTRATOR DECISION D-7.3-1 — AC5 is split; 7.3 owns the satisfiable half

`epics.md` AC5 reads: *"the resume card is replaced by the search field promoted to primary position, and
no empty resume card renders."* **The search field is Story 7.4 and does not exist yet.**

- **7.3 owns and must fully satisfy:** *no empty resume card renders*, and the slot **collapses cleanly** —
  no placeholder card, no reserved dead space, no `min-h-*` holding the gap open, and the chrome baseline
  offset drops so the scroll region sits flush against the header.
- **7.4 owns the remainder:** promoting the search field into the vacated primary position. This is an
  **explicit, named carry-forward**, recorded below under "Carried forward to Story 7.4". It is not a
  silently-unmet AC.
- **Do NOT build a throwaway placeholder search field** to close the gap. A fake control in the primary
  slot is worse than an honest collapse, and 7.4 would have to delete it.

## Acceptance Criteria

AC1–AC5 are transcribed verbatim from `epics.md` lines 1756–1787. AC6 is the standing regression gate for
this epic.

### AC1 — The card renders, breaks the header baseline, and owns `shadow-lift`
**Given** the user has at least one prior worklog
**When** the popup opens
**Then** a resume card renders directly under the chrome header, offset upward by 10 px so it breaks the
header baseline
**And** it carries `shadow-lift` — and is the only element in the popup that does

### AC2 — Card anatomy
**Given** the resume card renders
**When** it is populated
**Then** it shows an eyebrow "CONTINUE LOGGING" in primary purple, a right-aligned recency note ("last
logged 2 days ago"), the ticket key in Kanit 600 primary with `tabular`, and the summary in Noto Sans
clamped to two lines
**And** the summary truncates without displacing the key, at any summary length up to 200 characters

### AC3 — Hour entry row
**Given** the hour entry row renders
**When** the popup opens
**Then** the hour input is focused, pre-filled with the last-used value for that ticket, and carries a
1.5 px primary border plus `ring-focus`
**And** `+0.5`, `+1`, and `+2` buttons sit beside it and post immediately without a confirmation step
**And** a `CornerDownLeft` badge is rendered inside the input as decoration with `aria-hidden="true"` so
it is not announced as content

### AC4 — Enter to log
**Given** the user types a value and presses Enter
**When** the write succeeds
**Then** the entry animates into "Logged today", the chrome figure and progress bar update, and focus
returns to the hour input
**And** the popup does not close

### AC5 — No worklog history (SPLIT — see ORCHESTRATOR DECISION D-7.3-1)
**Given** the user has no worklog history at all
**When** the popup opens
**Then** the resume card is replaced by the search field promoted to primary position, and no empty
resume card renders

> **7.3's owned half:** no empty resume card renders; the slot collapses with **no reserved dead space**
> and the baseline offset drops. **7.4's half:** the search field promoted to primary position.

### AC6 — No regressions; all gates green
**Given** the resume card and its data seam are complete
**When** `pnpm compile`, `pnpm lint`, and `pnpm test` run
**Then** all pass with no new failures against the recorded baseline (Dev Notes > "Test baseline")
**And** `pnpm build` succeeds
**And** no WCAG 2.1 AA regression: the axe gate stays at zero Critical/Serious on the popup, every status
stays colour + icon + visible text label, and every new interactive element has a visible focus indicator
**And** no file belonging to Epic 6.3's in-flight CRX work is touched (Dev Notes > "Files fenced off")

## Tasks / Subtasks

- [x] **Task 1 — Persistent last-logged record (AC2, AC3; the data seam)** — *DO THIS FIRST*
  - [x] New `lib/storage/last-logged.ts`, modelled on `lib/storage/pinned-tickets.ts` (same
        `storage.defineItem` shape, same module layout).
  - [x] `export type LastLoggedTicket = { key: string; summary: string; seconds: number; startedAt: string; recordedAt: string }`
        — `seconds` is **the duration the user last entered against this ticket** (the AC3 pre-fill value);
        `startedAt` is the worklog's `started` (drives the AC2 recency note); `recordedAt` is when the
        record was written (tiebreak only).
  - [x] `export const lastLoggedTicketItem = storage.defineItem<LastLoggedTicket | null>('local:lastLoggedTicket', { fallback: null })`.
  - [x] `getLastLoggedTicket()` **must defensively coerce a malformed stored value to `null`** — WXT's
        `fallback` only applies to an *absent* key, so a partial/legacy value would survive a reshape.
        Copy the guard shape from `lib/storage/view-state.ts` lines 46–56.
  - [x] `setLastLoggedTicket(record)` overwrites unconditionally (last write wins — it is a
        "most recent", not a history).
  - [x] **Writers — only on a CONFIRMED write** (`result.kind === 'ok'`). A post that fell to the outbox
        or was refused is not something to resume from.
    - [x] `components/today/QuickLogForm.tsx` — in the existing `onSuccess` ok-branch (line 118), beside
          the existing `sendMessage('badge-update', …)`. `void`-fire; a storage failure must never break
          the log.
    - [x] The new `ResumeCard`'s own post path (Task 4).
    - [x] **NOT** `components/today/PtoQuickAction.tsx` — see D-7.3-12.

- [x] **Task 2 — `hooks/useResumeTicket.ts` (AC1, AC2, AC3, AC5)**
  - [x] Returns a discriminated status so the caller never has to guess:
        `{ status: 'loading' } | { status: 'none' } | { status: 'ready'; key; summary; prefillSeconds; startedAt }`.
  - [x] **Primary source = `lastLoggedTicketItem`** (storage, single-digit ms). Resolve `status` from
        storage ALONE — **do not await the week query**, or focus lands late and NFR1 slips (Dev Notes >
        "Autofocus, NFR1, and the aria-live region").
  - [x] **Enrichment = `useWeekWorklogs(currentWeekMonday())`** — the *same* TanStack query
        `useTodayTotal` already subscribes to (identical `queryKey: ['week-worklogs', weekOf]`), so this
        costs **zero additional network**. Use it for two things only:
    - [x] Refine the recency note to the true freshest `started` for that ticket.
    - [x] **Server-wins override:** if the week data contains a worklog with a `started` strictly newer
          than the stored record's `startedAt`, on a *different* issue (logged from Jira web or another
          device), that issue becomes the resume ticket and its newest worklog's `timeSpentSeconds`
          becomes the pre-fill.
  - [x] Enrichment must **never** flip `status: 'ready'` → `'none'`, and must never change the identity
        of the card in a way that moves focus (Task 3's focus latch covers the second half).
  - [x] **Exclude the configured PTO subtask** from the enrichment scan — read `ptoSubtaskKeyItem`
        (`lib/storage/settings.ts`, already consumed by `PtoQuickAction`). D-7.3-12.
  - [x] `status: 'none'` when storage is empty **and** the week scan yields no non-PTO worklog. The
        known cold-start limitation is documented in Dev Notes > D-7.3-2 — do not widen the fetch window
        to paper over it.

- [x] **Task 3 — `components/today/ResumeCard.tsx` — shell, anatomy, offset (AC1, AC2, AC5)**
  - [x] Root: `relative z-[1] rounded-lg border border-border bg-surface p-[14px] shadow-lift`
        + `flex flex-col gap-[11px]`. `relative z-[1]` is **load-bearing** — without it the `relative`
        chrome header paints on top of the card (Dev Notes > "The −10 px offset").
  - [x] `shadow-lift` appears **exactly once in the whole popup source tree**. Verified at story time:
        `--shadow-lift` is declared at `styles/globals.css:197` and used by **no** source file. This
        story is its first consumer. A guard test pins it (Task 7).
  - [x] Row 1 — `flex items-center justify-between gap-2`:
    - [x] Eyebrow `CONTINUE LOGGING`: `font-chrome text-eyebrow uppercase text-primary`. Use the
          `text-eyebrow` token (11px/500/0.1em) — DESIGN.md typography wins over the mockup's `.08em`.
    - [x] Recency note, right-aligned: `tabular text-[11.5px] text-faint`. Copy table in Dev Notes.
  - [x] Row 2 — `flex flex-col gap-[3px]`. **The key and the summary are separate block children.** This
        is what makes AC2's "truncates without displacing the key" structurally true, per DESIGN.md
        lines 461–464. Never put them on one line, never `truncate` the key's row.
    - [x] Key: `tabular text-subheading text-primary` (`tabular` already applies Kanit — no `font-chrome`).
    - [x] Summary: `text-body text-foreground line-clamp-2` (Tailwind v4 core utility; **no CSS change
          needed**). Must hold at 200 chars.
  - [x] Row 3 — the hour entry row (Task 4).
  - [x] **`status: 'loading'`** → render an `animate-skeleton` block **in the card's real layout shape**
        (same height, same offset), never a spinner — EXPERIENCE.md line 189 and the `ChromeHeader`
        precedent. D-7.3-10 (also: time-bounded past `COLD_START_SKELETON_BUDGET_MS` so a stalled
        query cannot shimmer forever — Finding 2/D-7.3-10 fix).
  - [x] **`status: 'none'`** → render `null`. No wrapper, no `min-h-*`, no spacer, no placeholder border.
        AC5's owned half.
  - [x] **The −10 px offset lives in `entrypoints/popup/App.tsx`, not here** — see Task 5. Read Dev Notes
        > "The −10 px offset" before writing any of it; the naive `-mt-[10px]` on the card is clipped by
        7.2's `overflow-y-auto` scroll region.

- [x] **Task 4 — Hour entry row + the write path (AC3, AC4)**
  - [x] Input assembly: a wrapper `<div>` carries the border/ring, a real `<input>` sits inside it with
        an `h` suffix span and the `CornerDownLeft` badge.
    - [x] Wrapper: `flex h-[34px] flex-1 items-center gap-1.5 rounded-md border-[1.5px] border-primary px-[9px] focus-within:ring-focus`.
          `focus-within:` — D-7.3-15.
    - [x] `<input type="text" inputMode="decimal">`, `tabular text-[14px]`, `focus:outline-none`
          (the wrapper ring is the replacement indicator — never bare `outline: none`).
    - [x] `aria-label={`Hours for ${key}`}` and `aria-keyshortcuts="Enter"`. Do **not** stuff the Enter
          hint into the label prose.
    - [x] Badge: `<CornerDownLeft aria-hidden="true" className="h-[13px] w-[13px]" />` inside a
          `ml-auto rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground` chip. `lucide-react`,
          13 px, `aria-hidden` — DESIGN.md `icons.submit` and `icons.defaults`. **No text glyph `⏎`**
          (the mockup uses one; the icon vocabulary supersedes it, DESIGN.md lines 420–431).
  - [x] **Pre-fill** = `secondsToHoursDisplay(prefillSeconds)` from `lib/hours.ts`. Fall back to `'1'`
        when the resolved record carries no usable duration.
  - [x] **Focus on open**: one `useEffect`, `inputRef.current?.focus({ preventScroll: true })`, guarded
        by a `useRef` **latch so it fires at most once per popup session**. Read Dev Notes > "Autofocus,
        NFR1, and the aria-live region" — the latch is not optional, it is what stops the Task 2
        enrichment re-render from yanking focus back out of wherever the user moved it.
  - [x] **`+0.5` / `+1` / `+2`**: `flex-0 h-[33px] rounded-md border border-border bg-surface tabular text-[12.5px]`,
        `aria-label={`Log ${n} hours to ${key}`}`, hit target ≥ 24×24 px. Each **posts that exact amount
        immediately, with no confirmation and without touching the input value** — D-7.3-13.
  - [x] **Write path — mirror `QuickLogForm.tsx` lines 107–156 exactly; do not invent a parallel one:**
    - [x] `parseHours` → `hoursToSeconds` → `postWorklog(key, { timeSpentSeconds, started })`.
          **Never inline `* 3600`** (architecture binding rule).
    - [x] `started` = `formatStartedISO(todayDateString())` (`lib/worklog-date.ts`) — the resume card
          always logs against **today**. No date picker; that is `QuickLogForm`'s job.
    - [x] `result.kind === 'ok'` → `sendMessage('badge-update', …)`, write the Task 1 record, emit a
          `LoggedEntry` upward, reset the input to the just-logged value and `select()` it, return focus
          to the input. **The popup does not close** — no `<form>`, no default submit; use `onKeyDown`
          with `e.preventDefault()` on Enter, as `QuickLogForm` does.
    - [x] `network` / `rate-limited` → `enqueueOutbox(...)` and show the existing "Pending — will retry"
          chip shape. **Do not** write the Task 1 record.
    - [x] any other kind → the error state. **Do not** write the Task 1 record.
    - [x] Unparseable / over-`MAX_HOURS_PER_ENTRY` input → **amber** (`text-amber-ink`), not red, and
          Enter is a no-op. D-7.3-16.
  - [x] **Do NOT call `invalidateQueries(['week-worklogs', …])` anywhere in this story.** Read the
        hazard block at `hooks/useTodayTotal.ts` lines 13–31 in full before writing the success handler.

- [x] **Task 5 — Mount into the popup shell (AC1, AC4, AC5)** — `entrypoints/popup/App.tsx`
  - [x] Add a **third** session contribution, modelled on `ptoEntries` (lines 63–64) — a
        `resumeEntries: LoggedEntry[]` **list**, never a monotonic counter (7.2 Finding 3: a counter
        cannot be decremented, which silently kills the edit/delete correction path).
  - [x] `sessionSeconds = todayViewSeconds + ptoSeconds + resumeSeconds`, still fed to the single
        `useTodayTotal(sessionSeconds)` call at line 120. **This is AC4's "chrome figure and progress bar
        update", in full.** No second total, no direct `ChromeHeader` prop.
  - [x] Pass `[...ptoEntries, ...resumeEntries]` as `TodayView`'s `externalEntries`, and extend the
        existing `onExternalEntryEdited` / `onExternalEntryDeleted` handlers to route by which list owns
        the `worklogId`. The entry then lands in `LoggedToday` with `motion-safe:animate-slide-in`
        already applied — **AC4's "animates into Logged today", satisfied by reuse.**
  - [x] Render `<ResumeCard>` as the **first child of the `<main>` scroll region**, above `TodayView`,
        only when `connected`.
  - [x] **The baseline offset — one boolean, one place:**
        ```
        // 7.9 extends this expression with `&& !offlineBanner && !writeErrorBanner`.
        // Mockup states `offline` and `error` both set resumeOffset: "0px".
        const breaksHeaderBaseline = connected && resume.status === 'ready';
        ```
        applied as `-mt-[10px]` on `<main>`. **Nothing else changes for 7.9.** Read Dev Notes >
        "The −10 px offset" for why it is on `<main>` and not on the card.

- [x] **Task 6 — D-7.3-12 guard: time off never becomes the resume ticket**
  - [x] Confirm `PtoQuickAction.tsx` writes **no** last-logged record (it should need no edit — verify,
        do not assume).
  - [x] `useResumeTicket` filters the configured PTO subtask key out of the week-worklog enrichment.
  - [x] Add the guard test (Task 7). Rationale in Dev Notes > D-7.3-12.

- [x] **Task 7 — Tests (AC1–AC6)** — see Dev Notes > "Testing" for the full file-by-file list and the
      jsdom limits that shape what can honestly be asserted.

- [x] **Task 8 — Gates**
  - [x] `pnpm compile`, `pnpm lint`, `pnpm test`, `pnpm build`.
  - [x] Record the exact `pnpm test` file/pass counts in the Dev Agent Record and compare them against the
        recorded baseline **before** calling anything pre-existing.
  - [x] `git status` must show **none** of the Epic 6.3 files staged (Dev Notes > "Files fenced off").
        **No `git add -A`, ever.**

## Dev Notes

### Test baseline — record it before you touch anything

Verified on this story's baseline commit (`53e6e44`):

- `pnpm compile` — **clean**.
- `pnpm test` — **83 test files, 998 passed, 1 skipped**.
- **Known pre-existing failure mode:** `pnpm test` exits **non-zero even at baseline**. One unhandled
  rejection escapes `components/manager/ManagerView.test.tsx` — `TypeError: Cannot read properties of
  undefined (reading 'runtime')` inside `@wxt-dev/storage`'s `getStorageArea`, a fake-browser teardown
  race, not a product bug. **That specific one is pre-existing.** A *new* failing test, or any drop from
  83/998/1, is a real regression — do not mislabel it.

### The −10 px offset — read this before writing any of it (AC1)

This is the one genuinely tricky piece of layout in the story, and the obvious implementation is wrong.

7.2's shell is three flex children of an `overflow-hidden` root: a `shrink-0` header, a
`min-h-0 flex-1 overflow-y-auto` `<main>`, and a `shrink-0` action bar (`entrypoints/popup/App.tsx`
lines 124–159).

**Why `-mt-[10px]` on the card alone does not work:** the card lives inside `<main>`, and `<main>` is an
`overflow-y-auto` box. A negative top margin pulls the card's top edge *above* `<main>`'s content-box top,
where `overflow-y-auto` clips it. You get a card with its top 10 px sliced off, not a card breaking the
baseline.

**Why the offset must go on `<main>`:** shifting the scroll box itself up by 10 px moves its clip
rectangle with it, so the card sits flush at the box's top edge and nothing is cut.

**Why the card still needs `relative z-[1]`:** `<header>` is `position: relative`
(`ChromeHeader.tsx:95`), so it paints in the positioned layer; an unpositioned `<main>` paints *below*
it and the card would be hidden behind the gradient. Making the card `relative` puts it in the same
layer, and DOM order (later) wins. `z-[1]` makes that explicit rather than incidental.

**Shadow clipping is expected and acceptable.** `--shadow-lift` is
`0 1px 3px rgba(74,65,99,.07), 0 18px 40px rgba(74,65,99,.12)` — both offsets cast *downward*. The ~22 px
of upward blur that `<main>`'s overflow clips falls on the purple chrome, where it is invisible. Do not
add `overflow-visible` to `<main>` to "fix" this — that would break 7.2 AC2's single-scroll-region
contract.

**Designed for Story 7.9, as required.** The offset is one boolean expression in `App.tsx`
(Task 5). 7.9 turns it off by appending `&& !offlineBanner && !writeErrorBanner` — one line, no rewrite,
no change to `ResumeCard`. This matches the mockup exactly: both the `offline` and `error` popup states
set `resumeOffset: "0px"`
([Source: imports/jira-time-logger-round2.dc.html lines 1195, 1204]), because the banner takes the slot
that would otherwise break the baseline. The same boolean already handles AC5's collapse for free.

### D-7.3-2 — Where "last logged ticket" and "last-used value for that ticket" come from

Investigated against source. The short answer: **a new persisted record is required — nothing in the repo
carries this today.** The three candidates and why the first two fail:

1. **`TodayView.loggedEntries`** (`TodayView.tsx:48`) — session-only, starts `[]` every popup open. This
   is the exact defect D-7.2-2 already worked around for the chrome figure. Useless here.
2. **`lib/storage/pinned-tickets.ts`** (`local:pinnedTickets`) — looks close, is not. It is written only
   by `TicketPicker.tsx:265`, and only when a ticket arrives from *search*; picking a ticket from the
   browse tree and logging against it never touches it. It records "recently *reached*", not "last
   *logged*", and it carries no duration at all. Do not repurpose it. Do not extend it either — it has
   its own Epic 2 semantics and consumers.
3. **`useWeekWorklogs`** (`hooks/useWeekWorklogs.ts:21`) — real worklog data, with issue `key`, `summary`,
   and per-worklog `started` + `timeSpentSeconds` (`lib/jira-types.ts:87–129`). **Already fetched** by
   `useTodayTotal` under the identical `queryKey: ['week-worklogs', currentWeekMonday()]`, so composing
   over it is free. But its range is `currentCycleRange('weekly')` — **Monday 00:00 to Sunday 23:59 of
   the current week only** (`lib/cycle-range.ts:16–27`), while EXPERIENCE.md line 129 requires "the most
   recently logged worklog (**any day, not just today**)".

**So: two tiers.**

- **Tier 1 (authoritative, persistent): `local:lastLoggedTicket`** — new, Task 1. Survives popup close,
  week rollover, and browser restart, and is the only honest source of "last-used **value**": once a
  worklog is edited, the week scan reports the *edited* duration, not the value the user last *typed*.
  Written on every confirmed post from `QuickLogForm` and from the card itself.
- **Tier 2 (free enrichment): the existing week query** — refines the recency note and lets a worklog
  made elsewhere (Jira web, another device) win on `started`. Zero extra network.

**Known limitation, deliberately accepted:** on a *fresh install* whose first popup open happens before
any worklog exists in the current week (e.g. Monday morning), both tiers are empty and the card
correctly reports `status: 'none'`. It self-heals the first time the user logs anything. **Do not widen
the fetch window to close it** — `fetchCurrentUserWeekWorklogsByIssue` fans out one search plus one
`GET /worklog` per issue (`lib/jira-client.ts:536–581`); a 14-day window on the popup's first-paint path
is a direct NFR1 (TTI ≤ 400 ms warm) violation for a first-run-only edge. Story 7.5 ranks "Recently
worked" by the same recency data; if 7.5 lands a wider recency source, `useResumeTicket` composes over it
then.

### D-7.3-12 — Time off never becomes the resume ticket

`PtoQuickAction` posts to the configured PTO subtask (`lib/pto.ts`, `ptoSubtaskKeyItem`). If that stamped
the last-logged record, the popup's **primary affordance** would open pre-loaded with "log more time
off" — wrong on its own terms, and directly at odds with 7.6's day-status vocabulary where time off is a
*settled* state that "stops asking" (EXPERIENCE.md line 187).

So: `PtoQuickAction` writes no record, and `useResumeTicket` filters the PTO subtask key out of the
week-worklog enrichment. **The catch-all project is NOT filtered** — Admin/Meetings work under the
catch-all is legitimately resumable; only the PTO subtask itself is excluded.

### D-7.3-13 — `+0.5` / `+1` / `+2` post that amount; they do not increment the input

Genuinely ambiguous in `epics.md` AC3 ("post immediately without a confirmation step") — a developer
could reasonably build either. Settled by EXPERIENCE.md line 130: *"`+0.5 / +1 / +2` **write
immediately** without a confirm step."* They are three one-tap log actions, not steppers. The `+` reads
as "add to my day", not "add to this field". They must not mutate the input value.

### Autofocus, NFR1, and the aria-live region (AC3, AC4)

Three constraints intersect here. Getting any one wrong is a real defect, not a polish item.

1. **NFR1 (TTI ≤ 400 ms warm).** Focusing an already-mounted input costs ~0 ms; the risk is *when* the
   card mounts. `useResumeTicket` therefore resolves `status` from **storage alone** — a
   `chrome.storage.local` read — and never awaits the week query. The week enrichment lands later and
   only refines text.
2. **Screen-reader behaviour vs 7.2's live region.** `ChromeHeader` mounts a
   `role="status" aria-live="polite"` region from first paint, whose `isPending → resolved` swap fires an
   announcement (`ChromeHeader.tsx:125–158`). Because the focus event fires first (storage beats the
   network) and `aria-live="polite"` **queues rather than interrupts**, the natural order is: input name
   announced, then the progress figure. **This requires no timer, no `requestAnimationFrame`, and no
   `aria-busy` juggling** — just do not delay the focus. Use `focus({ preventScroll: true })` so mounting
   never scrolls the single scroll region.
3. **The focus latch.** Task 2's enrichment re-renders the card after the week query resolves. Without a
   `useRef` latch, that re-render re-runs the focus effect and **steals focus back** from wherever the
   user has moved it — including 7.4's `/`-to-search, which lands directly on top of this. Focus is set
   **at most once per popup session**.

Keep the accessible name short: `aria-label="Hours for MBS-135"`, plus `aria-keyshortcuts="Enter"` for
the keyboard contract. The `CornerDownLeft` badge stays `aria-hidden="true"` per AC3, so it contributes
nothing to the announcement — which is exactly why `aria-keyshortcuts` carries that meaning instead.

### Recency note copy (AC2)

Derived from the mockup's `resumeWhen` values and EXPERIENCE.md's voice. Format with `date-fns`
(already a dependency, already used by `ChromeHeader`). The note is `tabular` (Kanit + tabular-nums),
11.5 px, `text-faint`.

| Condition (relative to the resolved worklog's `started`) | Copy |
|---|---|
| Same local day | `logged {h}h today` |
| Previous local day | `last logged yesterday` |
| 2–6 days ago | `last logged {n} days ago` |
| 7+ days ago, same year | `last logged {MMM d}` |

`last logged Fri` appears in the mockup's `empty` state; it is the 2–6-day case rendered as a weekday.
Either phrasing satisfies AC2 — pick the day-count form for consistency and note the choice.

**Do not implement** `queued {h}h` or `failed {n} min ago` (mockup `offline` / `error` states) — those are
Story 7.9's, and they arrive with the banners that also drop the baseline offset.

### D-7.3-14 — `border-border`, not `#DEDCE9`

DESIGN.md `components.resume-card.border` is `1px solid #DEDCE9` (line 135) — a **raw hex with no token**.
The nearest token is `--color-border: #E4E3EC`. Introducing a fourth border hex for one component
breaks the token discipline 7.1/7.2 established, for a difference that is imperceptible under
`shadow-lift`. **Use `border-border`.** Recorded here as a deliberate, minor deviation for DESIGN.md's
owner to fold back in. No change to `styles/globals.css` — this story adds **no new token, no new hex, no
new `@utility`**.

### D-7.3-15 — `ring-focus` via `focus-within:`, not statically

AC3 says the input "carries a 1.5 px primary border plus `ring-focus`". Applied as a static class, the
ring would keep glowing after focus moves elsewhere (7.4's `/`), which lies to sighted users about where
focus is. Applied as `focus-within:ring-focus` on the wrapper, it is **on at popup open** — exactly the
"When the popup opens" condition AC3 states — and it stays honest afterwards. The 1.5 px primary border
is unconditional, per the spec's `hour-input` component (DESIGN.md lines 173–177).

### D-7.3-16 — Unparseable input is amber, not red

Epic 7 standing constraint: **red only for a write Jira actually refused.** `QuickLogForm` currently uses
`text-state-danger` for parse errors — pre-existing Epic 2 code, out of scope to change here. The new
card uses `text-amber-ink` (5.9:1 on `amber-soft`, AA-clear) for unparseable / over-limit input, and
reserves red for a refused write.

### WCAG 2.1 AA — the hard gate outranks styling

Standing epic rule, restated because 7.2 hit it: when a spec'd value fails AA, **AA wins and the
deviation is recorded**. In 7.2 the chrome eyebrow's spec'd `text-white/70` computed ~4.0:1 and was
raised to `/85` (~4.91:1) on the orchestrator's ruling (`ChromeHeader.tsx:104–111`). Apply the same
principle here.

Values checked at story time against `styles/globals.css`:

| Element | Colour on white | Ratio | Verdict |
|---|---|---|---|
| Eyebrow `CONTINUE LOGGING` | `--color-primary` `#594F74` on white | 7.5:1 | pass |
| Recency note | `--color-faint` `#6B6B72` on white | ~5.3:1 | pass — **the documented floor; never lighten** |
| Ticket key | `--color-primary` `#594F74` on white | 7.5:1 | pass |
| Summary | `--color-foreground` `#1E1B2E` on white | ~15:1 | pass |
| Input text | `--color-foreground` on white | ~15:1 | pass |
| Badge glyph | `#fff` on `--color-primary` | 7.5:1 | pass |
| Amber error text | `--color-amber-ink` `#7A3E06` on `bg-surface` (white) — the card never renders it on `amber-soft` | 8.3:1 | pass |

*Corrected 2026-07-26 by the finisher (Finding 9): the original table's `--color-primary` figure and the
amber row's background were both wrong (recomputed against the real hex values and the real rendered
background). No AA failure resulted either way — every pair clears 4.5:1 with margin — but this table is
the story's stated evidence record for a hard gate, so the numbers now match what actually renders.*

Also: hit targets ≥ 24×24 px on `+0.5`/`+1`/`+2` (EXPERIENCE.md line 269); every icon `aria-hidden`
with meaning in adjacent text; visible focus on every interactive element, never bare `outline: none`.

### Icons (epic-wide constraint)

`lucide-react` only. `CornerDownLeft` is `icons.submit` (DESIGN.md line 247). Inline SVG at 13 px,
`strokeWidth` 2, `aria-hidden="true"`. **The mockup's `⏎` text glyph is superseded** — DESIGN.md lines
420–431 explain exactly why (text glyphs get announced; SVG renders identically everywhere). No second
icon set, no icon font, no CDN.

### No monospace

Ticket key, recency note, hour value, and the `+0.5/+1/+2` labels all use the `tabular` utility
(`styles/globals.css:232–235` — Kanit + `font-variant-numeric: tabular-nums`). `font-mono` must not
appear in any new code. Note `QuickLogForm.tsx:200` still carries a legacy `font-mono` on its ticket key;
that is Story 7.5's to remove when it replaces that surface — **do not touch it here.**

### Spacing

`--spacing: 4px` landed in 7.2 (D-7.2-3), so **standard Tailwind spacing utilities are correct and should
be used normally** (`p-3` = 12 px, `gap-2` = 8 px). Reach for px arbitrary values only for typography and
non-multiple-of-4 dimensions: the card's `p-[14px]` and `gap-[11px]`, the input's `h-[34px]` and
`px-[9px]`, the `-mt-[10px]` offset, and the 11.5/12.5/14 px type sizes.

### Project Structure Notes

**New files**
- `lib/storage/last-logged.ts` + `lib/storage/last-logged.test.ts`
- `hooks/useResumeTicket.ts` + `hooks/useResumeTicket.test.ts`
- `components/today/ResumeCard.tsx` + `components/today/ResumeCard.test.tsx`

**Modified**
- `entrypoints/popup/App.tsx` — mount, third session contribution, baseline-offset boolean
- `components/today/QuickLogForm.tsx` — one `void`-fired record write in the existing ok-branch
- `entrypoints/popup/App.test.tsx`, `entrypoints/popup/App.a11y.test.tsx`,
  `entrypoints/popup/App.session-total.test.tsx`
- `components/today/QuickLogForm.test.tsx`, `components/today/PtoQuickAction.test.tsx`

**Not modified**
- `styles/globals.css` — no new token, no new hex, no new utility
- `components/shell/ChromeHeader.tsx`, `components/shell/PopupActionBar.tsx`
- `components/today/TicketPicker.tsx` — respect the `unbounded` prop boundary 7.2 established; the popup
  passes it, `WeeklyGrid` does not
- `components/week/*`, `components/manager/*`, `entrypoints/fullpage/*`

### Files fenced off — Epic 6.3 in-flight CRX work

`scripts/pack-crx.mjs`, `scripts/derive-ext-key.mjs`, `scripts/lib/`, `package.json`, `docs/release.md`,
`wxt.config.ts`. Deliberately uncommitted (SD-5). Do not stage, edit, or `git add -A` them. Also
untouched: `_bmad-output/planning-artifacts/ux-designs/`, `public/fonts/`.

### Carried forward to Story 7.4 (from ORCHESTRATOR DECISION D-7.3-1)

**7.4 must complete AC5's second half:** when `useResumeTicket` reports `status: 'none'`, the search
field is promoted to the primary position the resume card would have occupied. 7.3 leaves that slot
cleanly empty and exposes the status the promotion keys off. 7.4 is the story that closes this AC.

7.4 also inherits: `/`-to-focus must not fight 7.3's focus latch (Task 4), and the search field replaces
the lists rather than filtering beside them (EXPERIENCE.md line 135).

### Testing

Vitest + jsdom only — **no Playwright** in this repo. axe gate = `lib/test/axe.ts` (`scan` /
`criticalOrSerious`, `color-contrast` disabled because jsdom has no paint engine). ESLint bans default
exports and `any`, and enforces alphabetised `import/order` with no blank lines.

| File | Assertions |
|---|---|
| `lib/storage/last-logged.test.ts` (new) | round-trip set/get; last-write-wins; **malformed stored value coerces to `null`** (mirrors `view-state.ts` lines 46–56). |
| `hooks/useResumeTicket.test.ts` (new) | resolves from storage without the week query; week worklog strictly newer on a different issue **overrides** the stored record; **PTO subtask excluded** (D-7.3-12); `status: 'none'` when both sources are empty; enrichment never flips `ready → none`; cold-start skeleton falls through to `'none'` past `COLD_START_SKELETON_BUDGET_MS` (D-7.3-10). |
| `components/today/ResumeCard.test.tsx` (new) | anatomy (eyebrow / recency / key / summary); **200-char summary** — key and summary are separate nodes and the summary carries `line-clamp-2`; input pre-filled and focused on mount; `CornerDownLeft` badge is `aria-hidden`; `+0.5/+1/+2` each post exactly 0.5/1/2 h **with no confirmation step and without mutating the input**; Enter posts, focus returns and the value is selected; unparseable input is amber and does not post; **focus latch** — a re-render after focus has moved does not steal it back; **`shadow-lift` exclusivity guard** (below); **identity latch (D-7.3-9, Finding 1 fix)** — an enrichment identity swap mid-type does not retarget the write, proven RED without the fix; class-presence guards for `relative z-[1]`, the 1.5px primary border, `focus-within:ring-focus`, and `aria-keyshortcuts="Enter"` (Finding 6 fix). |
| `entrypoints/popup/App.test.tsx` | card mounts as the first child of the scroll region when `status: 'ready'`; **collapses to nothing** with no history — `<main>` carries no `-mt-[10px]` **and contributes no element at all** (`main.children.length`, Finding 3 fix — AC5's owned "no reserved dead space" half); the `'loading'` skeleton now shares the ready card's `-mt-[10px]` offset (Finding 5 fix). |
| `entrypoints/popup/App.session-total.test.tsx` | **extend, do not replace.** A resume-card log must move the chrome figure **through `useTodayTotal`**, and **no `['week-worklogs', …]` invalidation may fire**. This file drives the real composition root and is the only place the double-count guard is pinned — it must stay meaningful (`useTodayTotal.ts` lines 13–31). |
| `entrypoints/popup/App.a11y.test.tsx` | extend with the card mounted: zero Critical/Serious. Entrypoint-level a11y coverage is the established pattern here (`entrypoints/options/App.a11y.test.tsx` is the template). |
| `components/today/QuickLogForm.test.tsx` | stamps the record on `ok`; **does not** stamp on a queued (network/rate-limited) or refused post. |
| `components/today/PtoQuickAction.test.tsx` | **does not** stamp the record (D-7.3-12 guard). |

**`shadow-lift` exclusivity guard (AC1).** Verified at story-authoring time: `--shadow-lift` is declared
at `styles/globals.css:197` and used by **zero** source files — the only greps outside `globals.css` hit
built CSS under `output/`. So the claim holds today and `ResumeCard` is its first consumer. Pin it with a
source-level test that reads `components/` and `entrypoints/` and asserts `shadow-lift` appears in
exactly one file. Cheap, and it is the only way to keep an "only element in the popup" claim true as
7.4–7.9 land.

**jsdom limits — be honest in the Completion Notes.** jsdom has no layout engine, so it cannot prove the
10 px overlap, the two-line clamp actually clipping, or real contrast. Assert the *structural* facts
(classes present, nodes separate, offset boolean applied) and record the visual/contrast checks for the
manual pass, exactly as Story 6.1's audit doc does.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#story-73-resume-card--the-first-move (lines 1756–1787)] — AC1–AC5 verbatim
- [Source: _bmad-output/planning-artifacts/epics.md#epic-7 (lines 1673–1682)] — AA / icon / no-monospace standing constraints
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md#components (lines 450–455)] — Resume card anatomy, "nothing else in the popup may carry this weight"
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md (lines 133–139)] — `components.resume-card` tokens, `offset: '-10px'`
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md (lines 173–177)] — `components.hour-input`: 1.5 px primary border, 34 px, focus ring
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md#elevation (lines 392–403)] — the elevation waiver; lift means "this is the thing to act on"
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md#components (lines 461–464)] — key and summary on separate lines is what lets a long summary truncate without shoving the key
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md#iconography (lines 414–441)] — lucide-only, 13 px, `aria-hidden`, why glyphs were retired
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md (line 247)] — `icons.submit: CornerDownLeft`
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md#component-patterns (lines 129–133)] — resume-card behavioural contract, "any day, not just today"
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md#state-patterns (lines 184–192)] — Empty / Loading / Offline treatments
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md#accessibility-floor (lines 246–269)] — live regions, visible focus, `faint` floor, 24 px hit targets
- [Source: ux-designs/ux-jira-time-logger-2026-07-25/EXPERIENCE.md#key-flows (lines 273–286)] — Flow 1, the four-second hot path
- [Source: imports/jira-time-logger-round2.dc.html (lines 615–632)] — card markup; (lines 1128–1132) default values; (lines 1195, 1204–1205) `resumeOffset: "0px"` in the offline/error states
- [Source: hooks/useTodayTotal.ts (lines 1–31, 53–82)] — the today-total seam and its double-count hazard
- [Source: entrypoints/popup/App.tsx (lines 50–65, 117–159)] — session-seconds composition, shell layout
- [Source: components/shell/ChromeHeader.tsx (lines 95, 104–111, 125–158)] — `relative` header, the AA deviation precedent, the live region
- [Source: components/today/TodayView.tsx (lines 27–38, 113–157)] — `externalEntries` routing
- [Source: components/today/LoggedToday.tsx (lines 74–82, 658)] — `LoggedEntry`, `motion-safe:animate-slide-in`
- [Source: components/today/QuickLogForm.tsx (lines 107–186)] — the post seam to mirror
- [Source: components/today/TicketPicker.tsx (line 265)] — the only `addPinnedTicket` writer, why pinned ≠ last-logged
- [Source: lib/storage/pinned-tickets.ts (lines 1–37)] — module shape to model `last-logged.ts` on
- [Source: lib/storage/view-state.ts (lines 46–56)] — defensive coercion pattern for a reshaped storage key
- [Source: hooks/useWeekWorklogs.ts (lines 21–36)] + [Source: lib/cycle-range.ts (lines 16–33)] — the query key and its Monday–Sunday range limit
- [Source: lib/jira-client.ts (lines 536–581)] — the fan-out cost of widening the worklog window
- [Source: lib/hours.ts (lines 33–96)] — `parseHours` / `hoursToSeconds` / `secondsToHoursDisplay`, `MAX_HOURS_PER_ENTRY`
- [Source: styles/globals.css (lines 60–98, 192–200, 224–235)] — spacing + type scale, elevation, `ring-focus` / `tabular`
- [Source: _bmad-output/implementation-artifacts/epic-7-decision-log.md] — SD-1…SD-5, D-7.2-1…D-7.2-7
- [Source: _bmad-output/implementation-artifacts/7-2-popup-shell-one-job-one-scroll-region.md] — Findings 1–6, the AA deviation ruling

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5) — bmad-story-developer

### Debug Log References

- `pnpm compile` — clean (one pre-fix TS2556 error in `App.session-total.test.tsx` from an
  under-typed mock spread — fixed by typing `setLastLoggedTicketMock` with a rest parameter
  matching the codebase's established `(..._args: unknown[]) => Promise.resolve()` pattern).
- `pnpm lint` — 0 errors, 53 warnings (all pre-existing `import/order`, all warn-level; one new
  warning in `ResumeCard.tsx`, same class as the rest of the codebase).
- `pnpm test` — see "Test baseline" comparison in Completion Notes below.
- `pnpm build` — clean, `output/chrome-mv3/*` produced, no new warnings.
- One real defect caught and fixed during Task 7: `ResumeCard`'s Enter-to-log "reset + select the
  input" step used a `[hoursInput]`-keyed `useEffect` to run `select()` after the just-logged reset.
  When the just-logged value is textually IDENTICAL to what was already typed (e.g. type "3", log
  it, see "3" again), React bails out of the state update (`Object.is` on the primitive), so the
  effect never re-ran and `select()` never fired. Fixed by driving that effect off a monotonically
  bumped `selectTick` counter instead of the value itself — `ResumeCard.test.tsx`'s "Enter posts…"
  test pins this (it uses exactly this identical-value case: input "3" → post 3h → input shows "3").
- One design gap caught and fixed in `useResumeTicket`: the naive implementation reported
  `status: 'none'` the instant storage resolved to `null`, before the week-scan enrichment (the only
  other source when there is no stored record) had settled — then flipped to `'ready'` once the week
  query resolved. That is a pop-in, which D-7.3-10 explicitly rules out. Fixed by returning
  `status: 'loading'` in that specific sub-case until the week query has settled (`weekQuery.data`
  present or `weekQuery.isError`); the common case (a stored record exists) is completely unaffected
  and still never waits on the network. Pinned by
  `useResumeTicket.test.ts` > "does not flash 'none' before the week scan settles…".
- One test-suite side effect caught and fixed: `@wxt-dev/storage`'s `defineItem` fires an unawaited
  background read (`migrationsDone.then(getOrInitValue)`) the instant a module calls it — merely
  *importing* a module that calls `storage.defineItem` is enough to trigger it, independent of
  whether `.getValue()`/`.setValue()` is ever explicitly invoked. `ResumeCard.tsx` (imported for
  real by `App.test.tsx`/`App.a11y.test.tsx`) and the new `setLastLoggedTicket` import in
  `QuickLogForm.tsx` (imported for real by `TodayView.test.tsx`) both pull in the real
  `lib/storage/last-logged` module in three files that didn't previously need to mock it, which
  briefly turned the suite's ONE documented pre-existing unhandled rejection
  (`components/manager/ManagerView.test.tsx`) into four. Fixed by mocking
  `@/lib/storage/last-logged` (and, where `postWorklog` was also newly reachable unmocked,
  `@/lib/jira-client`) in `App.test.tsx`, `App.a11y.test.tsx`, and `TodayView.test.tsx` — matching
  every other storage/network boundary already mocked in those files. Re-verified the suite back
  down to exactly one unhandled rejection (the documented baseline) across two consecutive full runs.

### Completion Notes List

**Summary.** All 8 tasks complete. The resume card — the product's primary affordance — is built end
to end: a new persisted `local:lastLoggedTicket` data seam (Task 1), a hook that composes it with the
already-fetched week-worklogs query at zero extra network cost (Task 2), the card's anatomy/skeleton/
collapse states (Task 3), the hour-entry row and its write path including the `+0.5/+1/+2` quick-post
buttons (Task 4), full wiring into the popup shell including the one-boolean baseline offset (Task 5),
the D-7.3-12 time-off exclusion guard (Task 6), and tests throughout (Task 7).

**AC verification:**
- **AC1** (renders, breaks baseline, `shadow-lift` exclusive) — `App.test.tsx` "AC1: mounts as the
  first child…" proves the card is first inside `<main>`, `<main>` carries `-mt-[10px]` only when
  `resume.status === 'ready'`. `ResumeCard.test.tsx`'s source-level guard proves `shadow-lift`
  appears in exactly one file (`components/today/ResumeCard.tsx`) across `components/` and
  `entrypoints/`.
- **AC2** (anatomy) — `ResumeCard.test.tsx` covers the eyebrow, right-aligned recency note, key
  (`tabular text-subheading`), and a 200-char summary on its own `line-clamp-2` node, structurally
  separate from the key node (never displaced). `recencyNote`'s copy-table branches (today /
  yesterday / 2–6 days / 7+ days) are each pinned directly.
- **AC3** (hour entry row) — pre-filled from `prefillSeconds`, focused on mount (both pinned in
  `ResumeCard.test.tsx`), 1.5px primary border unconditional + `focus-within:ring-focus` (D-7.3-15),
  `CornerDownLeft` badge `aria-hidden`, `+0.5/+1/+2` present and independently pinned to post exactly
  1800/3600/7200s without touching the input.
- **AC4** (Enter to log) — Enter posts, the entry is emitted via `onLogged` (routed through
  `App.tsx`'s `resumeEntries` list into "Logged today", which already carries
  `motion-safe:animate-slide-in`), the chrome figure updates through the existing `useTodayTotal`
  seam (real composition-root proof in the new `App.session-total.test.tsx` test), and focus returns
  to the input with the just-logged value selected. Popup does not close (no `<form>`, no default
  submit — pinned).
- **AC5** (no worklog history, 7.3's owned half) — `App.test.tsx` "AC5: collapses to nothing…" proves
  zero DOM for the card and no `-mt-[10px]` on `<main>` when `status: 'none'`. The search-field half
  is explicitly NOT built here — carried forward to 7.4 per D-7.3-1, unchanged from the story file.
- **AC6** (no regressions, all gates green) — see gate results below. axe scan extended
  (`App.a11y.test.tsx`) with the real card mounted: zero Critical/Serious. Every new interactive
  element has a visible focus indicator (`focus-within:ring-focus` / `focus-visible:ring-focus`,
  never bare `outline: none`). No status is colour-alone (amber/red messages carry text, not just
  colour). No Epic 6.3 fenced file touched (verified via `git status`, see below).

**Test baseline comparison.** Recorded baseline (Dev Notes, re-verified at story resume,
commit `5fd70a1`): 83 files / 998 passed / 1 skipped, exits non-zero due to ONE documented
pre-existing unhandled rejection in `components/manager/ManagerView.test.tsx`.
**After this story:** **86 files / 1042 passed / 1 skipped** (net +3 files, +44 tests), and — after
the mocking fix described in the Debug Log above — the suite is back down to **exactly the same one**
pre-existing unhandled rejection, re-confirmed across two consecutive `pnpm test` runs. No test that
existed before this story lost coverage or changed its assertion; every extension added coverage
(`App.test.tsx`, `App.a11y.test.tsx`, `App.session-total.test.tsx`, `QuickLogForm.test.tsx`,
`PtoQuickAction.test.tsx`, `TodayView.test.tsx` — the last of these only for the mocking fix, no new
tests). `pnpm compile`, `pnpm lint` (0 errors), and `pnpm build` all pass.

**Finisher validation (2026-07-26, after Finding Resolutions below).** Re-measured all four gates from a
clean run, comparing against the 86/1042/1 figure above as the new baseline:
- `pnpm compile` — clean.
- `pnpm lint` — **0 errors, 53 warnings** (identical count and rule mix to the pre-review baseline —
  no new warnings from any finisher change).
- `pnpm test` — **86 files / 1049 passed / 1 skipped** (net **+7 tests, 0 new files** — every fix landed
  in an already-existing test file, matching the "no new files" File List note above). The **same single**
  pre-existing `ManagerView.test.tsx` unhandled rejection, and no other. The +7 breaks down exactly:
  1 (Finding 1's RED-proven Blocker regression test) + 1 (Finding 2/D-7.3-10's fake-timer budget test) +
  3 (Finding 6's class-presence guards) + 2 (Finding 8's aria-describedby/aria-invalid/role="alert"
  tests) = 7. Findings 3 and 5 strengthened existing assertions in place rather than adding new tests, so
  they contribute 0 to this count despite each having an independently-confirmed RED-proof.
- `pnpm build` — clean, `output/chrome-mv3/*` produced, Σ 874 kB (873.54 kB at review time — the ~0.5 kB
  delta is the new test-only code contributing nothing to the bundle plus the few bytes of new production
  code in `ResumeCard.tsx`/`App.tsx`/`useResumeTicket.ts`).

Every one of the reviewer's 14 mutations (N1–N14) was either already RED (10 of them, unaffected by this
pass) or has now been independently reproduced and re-confirmed RED by the finisher for the 4 that were
GREEN (N1, N9, N12+N14 combined, N13), each restored from a pre-made file backup afterward (never
`git checkout --`, since the working tree carries other stories' uncommitted files this story must not
disturb).

**Deviations recorded (routine, not escalated — SD-4 "decide and log"):**
- The `+0.5/+1/+2` buttons use `shrink-0` rather than the story text's literal `flex-0` (not a real
  Tailwind utility — clearly the intent, "don't let this shrink in the row," which `shrink-0` is).
- The hour input's bare (unit-less) pre-fill value is derived via
  `secondsToHoursDisplay(seconds).replace(/h$/, '')` rather than calling `secondsToHoursDisplay`
  literally as the input's displayed text — necessary so the separate decorative "h" suffix span the
  same task bullet calls for doesn't produce a doubled "2.5hh". Falls back to `'1'` for a
  non-positive duration, per the task bullet.
- `App.tsx` wraps `<ResumeCard>` in a `<div className="mb-3">`, gated on `resume.status !== 'none'`
  (so it contributes zero DOM/zero space in the 'none' case, preserving AC5) — a small, undocumented-
  by-the-story visual spacing choice so the card doesn't visually touch "Logged today" beneath it.
- ~~Task 5's literal `breaksHeaderBaseline` formula (`connected && resume.status === 'ready'`) was
  followed exactly as given, even though it means the brief `'loading'` skeleton state does not carry
  the baseline offset despite Task 3's looser prose ("same offset" as the ready card). Since Task 5
  hands over literal copy-paste code and the loading window is normally single-digit-ms, the literal
  formula was treated as authoritative over the descriptive text.~~ **Superseded by Finding 5's fix.**
  D-7.3-10 made the `'loading'` window last up to `COLD_START_SKELETON_BUDGET_MS` (2000 ms) on a cold
  start, invalidating the "normally single-digit-ms" rationale this deviation was logged against. The
  formula is now `connected && resume.status !== 'none'` — the skeleton and the resolved card share one
  offset (and, per the skeleton's added message-region block, one height) — matching Task 3's prose
  after all. See `entrypoints/popup/App.tsx`'s `breaksHeaderBaseline` comment.

**jsdom limits, stated rather than hidden (per Dev Notes > Testing):** the 10px visual overlap, the
two-line clamp actually clipping paint, and real contrast ratios cannot be asserted from jsdom (no
layout/paint engine). Structural facts are asserted instead (the offset class is present, the key and
summary are separate DOM nodes, `line-clamp-2` is applied) and the contrast table already checked in
Dev Notes stands as the manual-pass record — no new colour values were introduced by this story, so
no new contrast check was needed.

### File List

**New:**
- `lib/storage/last-logged.ts`
- `lib/storage/last-logged.test.ts`
- `hooks/useResumeTicket.ts`
- `hooks/useResumeTicket.test.ts`
- `components/today/ResumeCard.tsx`
- `components/today/ResumeCard.test.tsx`

**Modified:**
- `entrypoints/popup/App.tsx` — mount `ResumeCard`, third session contribution (`resumeEntries`),
  merged external-entry edit/delete routing, the baseline-offset boolean on `<main>`.
- `components/today/QuickLogForm.tsx` — one `void`-fired `setLastLoggedTicket` write in the existing
  `onSuccess` ok-branch.
- `entrypoints/popup/App.test.tsx` — `useResumeTicket` mock + storage/jira-client boundary mocks;
  new "resume card (Story 7.3)" describe block (AC1 mount/offset, AC5 collapse, loading skeleton).
- `entrypoints/popup/App.a11y.test.tsx` — `useResumeTicket` mock + storage/jira-client boundary
  mocks; new axe scan with the real card mounted.
- `entrypoints/popup/App.session-total.test.tsx` — `lib/storage/last-logged` + `ptoSubtaskKeyItem`
  mocks; new real-composition-root test proving a resume-card log is additive with no extra
  `week-worklogs` fetch.
- `components/today/QuickLogForm.test.tsx` — `lib/storage/last-logged` mock; three new tests
  (stamps on ok, does not stamp on queued, does not stamp on refused).
- `components/today/PtoQuickAction.test.tsx` — one new source-level D-7.3-12 guard test.
- `components/today/TodayView.test.tsx` — `lib/storage/last-logged` mock (no assertion changes;
  required because `QuickLogForm` now imports the real module).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-26 | 0.1 | Story created from `epics.md` lines 1756–1787 at baseline `53e6e44`. Records ORCHESTRATOR DECISION D-7.3-1 (AC5 split; search half carried forward to 7.4 by name) and — per the canonical numbering in `epic-7-decision-log.md` (D-7.3-11) — D-7.3-2 through D-7.3-5 and D-7.3-12 through D-7.3-16. Data seam investigated against source: `pinnedTickets` and `TodayView.loggedEntries` both rejected with reasons; new `local:lastLoggedTicket` + free `useWeekWorklogs` enrichment specified, with the fresh-install cold-start limitation stated rather than papered over. The −10 px offset specified on `<main>` (not on the card) because 7.2's `overflow-y-auto` scroll region clips a negative margin, with the card's `relative z-[1]` called out as load-bearing against the `relative` chrome header, and the whole thing reduced to one boolean so Story 7.9 can drop it in one line. Autofocus specified against NFR1 and 7.2's `aria-live` region, including the focus latch that stops the week-query re-render from stealing focus. `shadow-lift` verified unused in source — this story is its first consumer, pinned by a guard test. | bmad-story-creator |
| 2026-07-26 | 1.0 | Story implemented end to end: `lib/storage/last-logged.ts` data seam, `hooks/useResumeTicket.ts`, `components/today/ResumeCard.tsx`, full popup-shell wiring in `App.tsx`, D-7.3-12 guard, and tests across 9 files (3 new, 6 extended). Fixed two real defects found while writing tests (a stale-select bug from an identical-value `useEffect` dependency, and a `useResumeTicket` pop-in the naive implementation would have produced) and one test-suite side effect (three files needed `lib/storage/last-logged` mocked once `ResumeCard`/`QuickLogForm` pulled it in for real). `pnpm test` 83→86 files, 998→1042 passed, same single pre-existing unhandled rejection. `pnpm compile`/`lint`/`build` all clean. Status: ready-for-dev → review. | bmad-story-developer |
| 2026-07-26 | 1.1 | Review findings resolved (1 Blocker, 3 Majors, 4 Minors, 2 Nits — all FIX, 0 dismissed/deferred except Finding 10's 4 individually-dismissed sub-items). Implemented the owner/orchestrator's three escalation rulings (D-7.3-9 identity latch, D-7.3-10 bounded cold-start skeleton, D-7.3-11 canonical `D-7.3-*` numbering with 5 new decision-log entries D-7.3-12…D-7.3-16). Full triage and RED-proof record in "Finding Resolutions" below. No new files — all fixes landed in the 9 files already listed in File List. Exact post-pass `pnpm test` counts recorded in Dev Agent Record > "Finisher validation". `pnpm compile`/`lint`/`build` all clean. Status: review → done. | bmad-story-finisher |

## Review Findings

## Review Summary

- **Reviewed by:** bmad-code-reviewer
- **Date:** 2026-07-26
- **Story Status Recommendation:** **Changes Requested**
- **Blockers:** 1
- **Majors:** 3
- **Minors:** 4
- **Nits:** 2

### Gates — re-measured by the reviewer, not taken on trust

| Gate | Dev claim | Reviewer-measured | Verdict |
|---|---|---|---|
| `pnpm test` | 86 files / 1042 passed / 1 skipped | **86 files / 1042 passed / 1 skipped**, exit 1 | ✅ exact match |
| Unhandled rejections | exactly 1, pre-existing (`ManagerView.test.tsx`) | **exactly 1**, `TypeError: Cannot read properties of undefined (reading 'runtime')` in `@wxt-dev/storage` `getStorageArea`, originating in `components/manager/ManagerView.test.tsx` | ✅ matches the documented baseline; no new rejection |
| `pnpm compile` | clean | exit 0, no output | ✅ |
| `pnpm lint` | 0 errors, 53 warnings | **0 errors, 53 warnings** (all `import/order`, warn-level) | ✅ |
| `pnpm build` | clean | exit 0, `output/chrome-mv3/*` produced, Σ 873.54 kB | ✅ |
| Fenced Epic 6.3 files | untouched | diffs of `scripts/pack-crx.mjs`, `wxt.config.ts`, `package.json`, `docs/release.md` contain **zero** story-related content; `scripts/derive-ext-key.mjs` + `scripts/lib/` still untracked | ✅ |
| `styles/globals.css` | not modified | `git status` clean for that path | ✅ |

**Every headline number the Dev Agent Record claims is accurate.** The findings below are not about the gates.

### Teeth verification — 14 mutations applied, run, and reverted

Each mutation was applied to the working tree, the relevant test file(s) run, then the file byte-restored and md5-verified against the pre-review hash. Final `git status --porcelain` count is unchanged at 23 entries; all four touched source files hash-match their pre-review state.

| # | Mutation | Result | Meaning |
|---|---|---|---|
| N1 | render the resume slot wrapper unconditionally (leave an empty `mb-3` div when `status: 'none'`) | **GREEN** | ❌ **AC5's "no reserved dead space" has NO teeth** → Finding 3 |
| N2 | give `useResumeTicket` its own distinct query key | RED | ✅ zero-extra-network guard is real, at the real composition root |
| N3 | remove the `focusedRef` focus latch | RED | ✅ focus latch pinned |
| N4 | revert `selectTick` to a `[hoursInput]` dependency | RED | ✅ the stale-`select()` bug the dev found **is** genuinely pinned |
| N5 | report `'none'` before the week scan settles | RED | ✅ the `'loading'`-vs-`'none'` pop-in fix **is** genuinely pinned |
| N6 | add `shadow-lift` to `ChromeHeader` | RED | ✅ AC1 exclusivity guard pinned |
| N7 | force `breaksHeaderBaseline = false` | RED | ✅ −10 px offset boolean pinned |
| N8 | drop the PTO-key filter from enrichment | RED | ✅ D-7.3-12 PTO exclusion pinned |
| N9 | remove `relative z-[1]` from the card root | **GREEN** | ❌ the story's own "load-bearing" class is unpinned → Finding 6 |
| N10 | remove `line-clamp-2` from the summary | RED | ✅ AC2 clamp pinned |
| N11 | make `+0.5/+1/+2` mutate the input value | RED | ✅ D-7.3-13 non-mutation pinned |
| N12 | remove `focus-within:ring-focus` from the input wrapper | **GREEN** | ❌ AC3 ring unpinned → Finding 6 |
| N13 | remove `aria-keyshortcuts="Enter"` | **GREEN** | ❌ unpinned (incl. the axe scan) → Finding 6 |
| N14 | downgrade `border-[1.5px] border-primary` to a plain border | **GREEN** | ❌ AC3 border unpinned → Finding 6 |

### AC-by-AC verdict

- **AC1** — SATISFIED. Card renders first inside `<main>` (inside a `mb-3` wrapper — see Finding 10), `-mt-[10px]` correctly on the **scroll container** not the card, `shadow-lift` exclusivity source-guarded and proven RED under mutation. `relative z-[1]` present but unpinned (Finding 6).
- **AC2** — SATISFIED. Eyebrow / right-aligned recency note / key / summary are four separate nodes; key and summary are structurally separate children so a 200-char summary cannot displace the key; `line-clamp-2` pinned. Recency copy table implemented and each branch pinned.
- **AC3** — SATISFIED IN CODE, PARTIALLY UNPINNED. Pre-fill, focus-on-mount, `aria-hidden` badge, and the three quick-post buttons are all correct and pinned. The literal AC clause "carries a 1.5 px primary border plus `ring-focus`" has zero coverage (Finding 6). **First-open focus is delayed by a full network round-trip on the cold-start path (Finding 2).**
- **AC4** — SATISFIED. Enter posts, entry routes through `resumeEntries` → `externalEntries` → `LoggedToday`'s existing `motion-safe:animate-slide-in`, chrome figure moves through the single `useTodayTotal` seam, focus returns and the value is selected, no `<form>` so the popup cannot close. Proven additive with exactly one week-query fetch at the real composition root.
- **AC5 (7.3's owned half)** — SATISFIED IN CODE, **the named deliverable is UNPINNED** (Finding 3). The 7.4 carry-forward is correctly and explicitly recorded — not a silently-unmet AC.
- **AC6** — SATISFIED. All gates green and re-measured above; axe stays at zero Critical/Serious with the **real** card mounted; no fenced file touched; no colour-alone status.

### Hazards checked and cleared (recorded so they are not re-litigated)

- **Shared-component leakage (the Story 7.2 Finding 2 repeat).** `QuickLogForm` is imported by exactly one consumer (`TodayView`), which is imported by exactly one consumer (`entrypoints/popup/App.tsx`). The new `setLastLoggedTicket` write therefore cannot reach `components/week/*`, `components/manager/*`, or `entrypoints/fullpage/*`. **No leak.**
- **The three new `lib/storage/last-logged` mocks are legitimate harness hygiene, not hollowing-out.** `App.test.tsx` and `App.a11y.test.tsx` mock the **hook** (`useResumeTicket`), not the component — the **real** `ResumeCard` renders and is axe-scanned in both. Mocking the hook is also what pins the `App.tsx` → `useResumeTicket` wiring (N7 went RED through it). `TodayView.test.tsx` asserts nothing about the record, and the write is pinned three ways in `QuickLogForm.test.tsx`. Critically, the **real** data path is still exercised end-to-end at the real composition root in `App.session-total.test.tsx`, which uses the real `App`, real `useResumeTicket`, real `ResumeCard` and real `useTodayTotal`. Nothing was hollowed out.
- **Exactly one scroll region (7.2 AC2).** `ResumeCard.tsx` contains no `overflow-*` or `scroll` utility at all; `line-clamp-2` is `overflow: hidden`, not a scroll box. The existing `App.test.tsx` invariant test still passes.
- **`externalEntries` identity.** `App.tsx` now builds `[...ptoEntries, ...resumeEntries]` fresh each render, but `TodayView`'s only effect keys on `totalSeconds` (a number derived from `loggedEntries` alone), never on `externalEntries`/`allEntries`. No render loop, no repeated `onTotalChange`. Not a defect.
- **Scope discipline.** No search field built (7.4's). The recency lookup is not widened beyond the current week (D-7.3-5 honoured). No new token, hex, or `@utility` in `styles/globals.css`. No monospace in new code. Icons are `lucide-react` only.
- **Contrast.** Every colour pair the card actually renders clears AA: `text-amber-ink` #7A3E06 on white **8.3:1**; `text-neutral-700` #1E1B2E on `bg-state-info-subtle` #ECEBF3 **14.2:1**; `text-faint` #6B6B72 on white **~5.3:1**; `text-primary` #594F74 on white **7.5:1**; `text-foreground` #1E1B2E on white **16.8:1**; `text-state-danger` #DC2626 on white **4.83:1**. **No AA failure.** (The recorded table has arithmetic drift — Finding 9.)

---

### Finding 1: A week-enrichment ticket swap silently retargets the write and overwrites the value the user typed

- **Severity**: **Blocker**
- **Category**: Correctness
- **Location**: `components/today/ResumeCard.tsx:112-117` (the seed effect) together with `hooks/useResumeTicket.ts:166-178` (the server-wins override)
- **Related AC**: AC3, AC4

**Observation.** `useResumeTicket`'s "server-wins override" is a designed, first-class code path: when the week query resolves and contains a worklog on a *different* issue with a `started` strictly newer than the stored record, the resolved ticket identity changes. `ResumeCard`'s seed effect re-seeds the hour input on any identity change:

```ts
useEffect(() => {
  if (resume.status !== 'ready') return;
  if (seededKeyRef.current === resume.key) return;
  seededKeyRef.current = resume.key;
  setHoursInput(prefillDisplayValue(resume.prefillSeconds));   // unconditional
}, [resume]);
```

The `focusedRef` latch (lines 122-127) protects **focus**. Nothing protects the **input value** or the **write target**. The re-seed fires regardless of whether the user has already typed.

**Reproduced.** A probe rendered the real `ResumeCard` with the stored ticket `PROJ-1` (pre-fill `2.5`), typed `3`, then re-rendered with the server-wins result `PROJ-9` (pre-fill `2`) exactly as the resolved week query would, then pressed Enter:

```
PROBE: input value after enrichment swap = "2"
PROBE: postWorklog called with = ["PROJ-9",{"timeSpentSeconds":7200,...}]
```

The user typed `3` against `PROJ-1`. The extension posted **2 hours to PROJ-9**. Both the amount and the destination issue differ from what the user entered and from what was on screen when they started typing. The probe file was deleted after the run.

**Impact.** This writes real worklog data to the wrong Jira issue with the wrong duration, on the surface DESIGN.md designates the product's *primary affordance*, with no user-visible warning. The window is the gap between the storage read (single-digit ms) and the week query resolving (a full Jira round-trip, comfortably hundreds of ms) — which is precisely the window EXPERIENCE.md's four-second hot path asks the user to type in. No test covers this; the story's Testing table pins "enrichment never flips `ready → none`" and the focus latch, but never the input value or the write target across an identity change.

**Suggested Resolution.** Needs an owner ruling on the intended behaviour, then one of:
1. Latch identity the same way focus is latched — once a ticket has been presented to the user, enrichment refines only the recency note and never changes `key`/`prefillSeconds`; or
2. Keep the override but make it non-destructive — skip the re-seed when the input is dirty (user has typed since mount), and do not swap identity once the user has interacted with the card; or
3. Keep the override but require an explicit user confirmation before the target changes.

Whichever is chosen, add a test that types a value, applies an identity-swapping enrichment re-render, and asserts the posted `(key, timeSpentSeconds)` still matches what the user entered.

---

### Finding 2: On the cold-start path the card awaits the network before it can autofocus — inverting the NFR1 constraint the story is built around

- **Severity**: **Major**
- **Category**: Correctness / AC Conformance
- **Location**: `hooks/useResumeTicket.ts:136-146`; `components/today/ResumeCard.tsx:233-241`
- **Related AC**: AC3, NFR1

**Observation.** Dev Notes > "Autofocus, NFR1, and the aria-live region" is explicit: *"`useResumeTicket` therefore resolves `status` from **storage alone** — a `chrome.storage.local` read — and never awaits the week query."* Task 2 repeats it: *"Resolve `status` from storage ALONE — **do not await the week query**, or focus lands late and NFR1 slips."*

The pop-in fix recorded in the Debug Log changes exactly that for the `stored === null` branch:

```ts
if (stored === null) {
  if (!weekSettled) return { status: 'loading' };   // waits on the network
  ...
}
```

and `ResumeCard`'s `'loading'` branch renders a skeleton containing **no `<input>` at all** — so there is no focus target until the week query settles. The focus effect (`resume.status !== 'ready'` guard) cannot fire.

**Impact.** Every user has an empty `local:lastLoggedTicket` the first time this ships. On that first popup open, AC3's *"When the popup opens / Then the hour input is focused"* is not met until a full Jira round-trip completes — the precise NFR1 (TTI ≤ 400 ms warm) violation the story spent a whole Dev Notes section preventing. It recurs on any fresh profile or cleared storage. The fix is correct about the pop-in it was solving; it just traded away the constraint the story ranked higher, and the Debug Log records the fix without noting the inversion.

**Suggested Resolution.** Owner ruling required — the two constraints (no pop-in vs. do not await the network for focus) are in direct conflict on this branch and the story asserts both. Options: render the real card shell with a focusable, empty-but-enabled hour input during the cold-start `'loading'` state so focus lands immediately and only the ticket text fills in later; or accept the pop-in for the no-stored-record branch only and record it as a deviation; or seed the record at connect time so the branch is rare. Whichever is chosen, update the Dev Notes NFR1 section so it no longer states something the code does not do.

---

### Finding 3: AC5's named deliverable — "no reserved dead space" — has zero test teeth

- **Severity**: **Major**
- **Category**: Tests
- **Location**: `entrypoints/popup/App.tsx:200`; `entrypoints/popup/App.test.tsx:239-248` ("AC5: collapses to nothing…")
- **Related AC**: AC5

**Observation.** D-7.3-1 defines 7.3's owned half of AC5 with unusual precision: *"the slot **collapses cleanly** — no placeholder card, **no reserved dead space**, no `min-h-*` holding the gap open."* The guarding test asserts only two things:

```ts
expect(main.className).not.toContain('-mt-[10px]');
expect(main.querySelector('.shadow-lift')).toBeNull();
```

Neither can observe reserved space. Mutation **N1** changed `App.tsx:200` from `{connected && resume.status !== 'none' && (` to `{connected && (`, which leaves an empty `<div className="mb-3">` — 12 px of reserved dead space — sitting in the primary slot in the no-history state. `ResumeCard` still returns `null`, so `.shadow-lift` is still absent and `-mt-[10px]` is still off. **The entire `App.test.tsx` suite stayed GREEN.**

**Impact.** The implementation is correct today. But the one clause D-7.3-1 singles out as 7.3's deliverable is unguarded, and the collapse is exactly what Story 7.4 will edit when it promotes the search field into this slot. A 7.4 regression that reintroduces dead space would ship green. The Completion Notes state *"`App.test.tsx` 'AC5: collapses to nothing…' proves zero DOM for the card and no `-mt-[10px]`"* — accurate as written, but it does not prove the "no reserved dead space" half it is offered as evidence for.

**Suggested Resolution.** Assert that the resume slot contributes no element at all in the `'none'` state — e.g. that `<main>`'s first element child is the `TodayView` node, or that `main.children.length` equals its no-card value, or that no element matching the slot wrapper is present. Re-run N1 and confirm it goes RED.

---

### Finding 4: Two incompatible `D-7.3-*` numbering schemes are live at once, and `ResumeCard.tsx` cites `D-7.3-4` for two different decisions

- **Severity**: **Major**
- **Category**: Maintainability / Convention
- **Location**: `_bmad-output/implementation-artifacts/epic-7-decision-log.md:313-476` vs `7-3-resume-card-the-first-move.md:40-44`; citations at `components/today/ResumeCard.tsx:119` and `:223`, `entrypoints/popup/App.tsx:164`, `hooks/useResumeTicket.ts:37,105,141`, `hooks/useResumeTicket.test.ts:185`, `components/today/PtoQuickAction.test.tsx:184,191`, `entrypoints/popup/App.session-total.test.tsx:45`, `components/today/ResumeCard.test.tsx:188`

**Observation.** The decision log's own headings are `D-7.3-1` … `D-7.3-6`, with `D-7.3-3` = *"The −10 px offset must live on the scroll container, not the card"* and `D-7.3-4` = *"Autofocus is resolved from storage alone, never awaiting the network"*. The story file (lines 40-44) promotes the log's **unnumbered** "Spec ambiguities resolved in 7.3" bullets (log lines 377-394) into numbered decisions, shifting everything from 3 onward: its `D-7.3-3` = *"time off never becomes the resume ticket"*, its `D-7.3-4` = *"`+0.5/+1/+2` post that amount, they do not increment"*. Verified against both documents:

| Citation | Meaning used | Matches |
|---|---|---|
| `App.tsx:164` "the −10 px offset (D-7.3-3)" | offset | decision log |
| `useResumeTicket.ts:37` "Excludes `ptoKey` per D-7.3-3" | PTO filter | story file only |
| `ResumeCard.tsx:119` "Focus latch (D-7.3-4 / AC3)" | autofocus | decision log |
| `ResumeCard.tsx:223` "they never touch the input value (D-7.3-4)" | quick buttons | story file only |
| `useResumeTicket.ts:13,105` vs `:141` — `D-7.3-5` | cold-start blind spot **and** the pop-in rule | both, in one file |
| `ResumeCard.tsx:149`, `ResumeCard.test.tsx:188` — `D-7.3-7`, `D-7.3-8` | — | **absent from the decision log entirely** |

`ResumeCard.tsx` uses the identifier `D-7.3-4` to mean two different decisions 104 lines apart. `useResumeTicket.ts` does the same with `D-7.3-5`.

**Impact.** SD-4 makes the decision log the audit trail for exactly these calls. As it stands a reader cannot resolve any `D-7.3-3/4/5` citation without guessing which of two documents the comment intended, and two cited IDs resolve to nothing at all. This is the artifact future stories (7.4 and 7.9 both inherit named carry-forwards from here) will consult.

**Suggested Resolution.** Documentation only; zero behavioural change. Reconcile onto a single scheme — preferably fold the log's unnumbered "Spec ambiguities" bullets into numbered entries so the log becomes the superset, then renumber the story file's citations to match — and sweep the code citations listed above. Do not renumber only one side.

---

### Finding 5: The `'loading'` state renders the card without the −10 px offset and at the wrong height, producing a double layout shift on the primary affordance

- **Severity**: Minor
- **Category**: AC Conformance / Convention
- **Location**: `entrypoints/popup/App.tsx:170`; `components/today/ResumeCard.tsx:233-241`
- **Related AC**: AC1

**Observation.** Task 3 requires the loading state to render *"an `animate-skeleton` block **in the card's real layout shape** (same height, same offset)"*, and EXPERIENCE.md:189 requires *"Skeletons in the real layout shape."* Neither holds:

1. **Offset.** `breaksHeaderBaseline = connected && resume.status === 'ready'` — so the skeleton card renders at offset `0`, then the whole scroll region jumps 10 px upward when the status flips to `'ready'`.
2. **Height.** The skeleton emits four blocks (11 + [18 + 3 + 14] + 34 px plus gaps). The real card additionally renders the `min-h-[1.25rem]` (20 px) message region and its preceding `gap-[11px]`, and its skeleton row for the input spans full width where the real row is input + three buttons. The skeleton is roughly 31 px shorter than the card it stands in for.

**Impact.** Two stacked layout shifts on the element the design calls the product's primary affordance. The Dev Agent Record logs the offset deviation and justifies it as acceptable because *"the loading window is normally single-digit-ms"* — but that rationale is invalidated by this story's own D-7.3-5 pop-in fix (Finding 2), which makes `'loading'` last a **full network round-trip** on the cold-start path, i.e. for every user on first open. The deviation was logged against a duration that the same commit changed.

**Suggested Resolution.** Either extend the offset boolean to cover `'loading'` (`resume.status !== 'none'`) so the skeleton and the card share a position, or stop rendering a skeleton in a slot whose geometry differs from the resolved card. Add the missing recency-note and quick-button skeleton blocks and the message-region reserve so the two shapes match. Re-check against Finding 2's resolution, since the two interact.

---

### Finding 6: AC3's border/ring clause, `aria-keyshortcuts`, and the "load-bearing" `relative z-[1]` are all unpinned

- **Severity**: Minor
- **Category**: Tests
- **Location**: `components/today/ResumeCard.tsx:232` (`relative z-[1]`), `:259` (`border-[1.5px] border-primary … focus-within:ring-focus`), `:276` (`aria-keyshortcuts="Enter"`); `components/today/ResumeCard.test.tsx`
- **Related AC**: AC1, AC3

**Observation.** Four mutations were applied and the suite stayed **GREEN** every time:

- **N14** — replacing `border-[1.5px] border-primary` with a plain `border border-border`. AC3's literal text is *"carries a 1.5 px primary border plus `ring-focus`"*.
- **N12** — deleting `focus-within:ring-focus`, the mechanism D-7.3-7 was written to settle. Removing it silently removes the visible focus indicator AC6 requires on every new interactive element.
- **N13** — deleting `aria-keyshortcuts="Enter"`. Dev Notes call this out as *"exactly why `aria-keyshortcuts` carries that meaning instead"* of the `aria-hidden` badge — it is the only thing conveying the Enter contract to a screen reader. The axe scan does not catch its absence either.
- **N9** — deleting `relative z-[1]`, which Task 3 flags in bold as **load-bearing** (without it the `relative` chrome header paints over the card).

**Impact.** Four requirements the story argues for at length, none of which any test can observe being removed. The story's own Testing note anticipates this — *"Assert the **structural** facts (classes present, nodes separate, offset boolean applied)"* — and these are precisely the class-presence assertions jsdom **can** make. The Completion Notes list the border and ring under "AC3 … verified" without evidence behind them.

**Suggested Resolution.** Add class-presence assertions in `ResumeCard.test.tsx` for the card root (`relative`, `z-[1]`) and the input wrapper (`border-[1.5px]`, `border-primary`, `focus-within:ring-focus`), plus an attribute assertion for `aria-keyshortcuts="Enter"`. Re-run N9/N12/N13/N14 and confirm each goes RED.

---

### Finding 7: `bg-neutral-200` is introduced with zero precedent, when a semantic synonym is already used three lines above

- **Severity**: Minor
- **Category**: Convention
- **Location**: `components/today/ResumeCard.tsx:235, 237, 238, 240`

**Observation.** `styles/globals.css:145-158` defines `neutral-*` as **legacy aliases** under a header that reads *"Remove each alias as its component migrates to the semantic tokens above."* `--color-neutral-200` resolves to `#e4e3ec` — byte-identical to `--color-border`, which this same file already uses as `border-border` at line 232. A repo-wide sweep of source files finds **zero** pre-existing uses of `bg-neutral-200`; `ResumeCard.tsx` is the first and only consumer. There is also no repo precedent for it as a skeleton fill: `ChromeHeader.tsx:136-140` (the Story 7.2 precedent the story cites) uses `bg-white/20` / `bg-white/40`, and the older Epic 1-6 skeletons use `bg-neutral-100` with `motion-safe:animate-pulse`. This story introduces a third skeleton fill value.

By contrast `hover:bg-neutral-100` (7 pre-existing uses, including Story 7.2's own `PopupActionBar.tsx:31`) and `text-neutral-700` (54 pre-existing uses; the pending chip is copied verbatim from `QuickLogForm.tsx:290`) are established reuse and are **not** findings.

**Impact.** New token debt in a brand-new file, in an epic whose D-7.2-3 precedent was to fix token debt at the token layer rather than propagate it, and against this story's own "zero new colour values" discipline. Cosmetically identical, so no visual risk.

**Suggested Resolution.** Use `bg-border` (identical hex, semantic) for the skeleton blocks, or introduce/reuse a semantic skeleton-fill token if the epic wants one.

---

### Finding 8: Invalid hour input is never announced — no programmatic association and Enter is a silent no-op

- **Severity**: Minor
- **Category**: Security & Data Handling / Accessibility
- **Location**: `components/today/ResumeCard.tsx:260-278` (input), `:304-312` (message region)
- **Related AC**: AC3, AC6

**Observation.** When `validateHours` returns `unparseable` or `over-limit`, an amber `<p>` renders in the message region. It carries no `id`, the `<input>` has no `aria-describedby` and no `aria-invalid`, and the region is not a live region. `handleEnter` returns early, so pressing Enter changes nothing in the DOM and moves no focus.

**Impact.** A screen-reader user types an unparseable value into the popup's primary affordance, presses Enter, and receives **no feedback of any kind** — no announcement, no focus move, no state change. That is WCAG 3.3.1 Error Identification (Level A) territory. The axe gate cannot detect it (it is a valid-markup omission, not a violation), so AC6's automated check passes.

**Not a regression**, and therefore not a Blocker: `QuickLogForm.tsx:275-284` has the same shape today, so this mirrors the sibling rather than degrading it. But `aria-describedby` is a well-established pattern in this repo (`ApiTokenSetup.tsx:209`, `CatchAllProjectField.tsx:113`, `PtoQuickAction.tsx:200`, `ApproveButton.tsx:294`, and others), and this is a brand-new surface the design calls the primary affordance.

**Suggested Resolution.** Give the message region a stable `id`, point `aria-describedby` at it when a message is present, set `aria-invalid` on the input when validation fails, and consider `role="alert"` (or `aria-live="polite"`) on the amber message so an Enter that refuses to post is not silent.

---

### Finding 9: The Dev Notes contrast table — offered as the manual-pass AA record — does not reconcile with the tokens' actual values

- **Severity**: Nit
- **Category**: AC Conformance
- **Location**: `7-3-resume-card-the-first-move.md:440-450`; `styles/globals.css:116, 125, 138`

**Observation.** The Completion Notes state *"the contrast table already checked in Dev Notes stands as the manual-pass record."* Recomputed against the tokens' real hex values:

- `--color-primary` `#594F74` on white computes **7.5:1**, not the recorded *"~8.9:1"*.
- `--color-faint` `#6B6B72` on white computes **~5.3:1**, not the recorded *"4.6:1 — the documented floor"* (the table is conservative here).
- `--color-amber-ink` is justified as *"5.9:1 on `amber-soft`"* — but the card never renders amber text on `amber-soft`; `ResumeCard.tsx:306, 309` render it on `bg-surface` white, where it computes **8.3:1**.

**Impact.** **No AA failure results** — every value clears 4.5:1 with margin, and the real ratios are equal to or better than claimed. The issue is that the table is the story's stated evidence record for a hard gate, and at least one figure and one background are wrong. A future story reusing the table (e.g. 7.9's banners on `amber-soft`) would be reasoning from bad numbers.

**Suggested Resolution.** Recompute the table against the actual rendered pairs and the actual background each token is used on, and correct the `--color-primary` figure.

---

### Finding 10: Assorted spec drift — none individually load-bearing

- **Severity**: Nit
- **Category**: Convention
- **Location**: as listed

1. **`components/today/ResumeCard.tsx:297`** — the quick buttons are `h-[33px]` while the input beside them in the same flex row is `h-[34px]`. A 1 px mismatch with no spec basis for either the difference or the 33.
2. **`components/today/ResumeCard.tsx:220-227`** — `handleQuick` passes no `resetInputTo`, so after clicking `+0.5/+1/+2` focus stays on the button and never returns to the hour input. EXPERIENCE.md:131-132 puts *"focus returns to the input"* in a sentence spanning both paths; epics.md AC4 scopes it to Enter only. Genuinely under-determined by the spec — flagged, not asserted. The keyboard hot path is unaffected.
3. **`components/today/ResumeCard.tsx:322`** — `Clock` is not in DESIGN.md's authoritative `icons:` map (epics.md:1681 makes that map authoritative), which covers this state with `LoaderCircle`/`WifiOff`. Strongly mitigated: the chip is copied verbatim from five pre-existing sites (`QuickLogForm.tsx:292`, `PtoQuickAction.tsx:288`, `PtoPopover.tsx:295`, `LoggedToday.tsx:817`, `DayCell.tsx:379`) at the identical `h-3 w-3`. Not a second icon library; consistency with the epic's own surfaces arguably outranks the map here.
4. **`components/today/ResumeCard.tsx:284`** — DESIGN.md's `icons.kbd` specifies `border: '1px solid {colors.border}'`; the badge has no border. Plausibly subsumed by the on-primary variant, but dropped without a note.
5. **`entrypoints/popup/App.tsx:200-203`** — Task 5 says render `<ResumeCard>` as *"the **first child** of the `<main>` scroll region"*; it is wrapped in `<div className="mb-3">`. The Dev Agent Record logs this deviation explicitly and it is harmless (AC5 is preserved because the wrapper is gated too) — recorded only for completeness.

---

### Escalations requiring an owner ruling

1. **Finding 1 (Blocker).** Should the server-wins override be allowed to change the write target after the card has been presented to the user? The story mandates the override *and* mandates that enrichment must not disturb the user, and those two cannot both hold as written. A ruling is needed before a fix can be chosen.
2. **Finding 2 (Major).** "No pop-in" (D-7.3-5 / story) vs "never await the network before focus" (D-7.3-4 / decision log, NFR1). The current code satisfies the first at the cost of the second on the cold-start path, which is every user's first open. Which constraint wins?
3. **Finding 4 (Major).** Which `D-7.3-*` numbering is canonical — the decision log's or the story file's? Both are in active use in shipped code comments.

**All three escalations were ruled on by the owner/orchestrator before this pass — see
`epic-7-decision-log.md` D-7.3-9 (Escalation 1), D-7.3-10 (Escalation 2), and D-7.3-11 (Escalation 3).
The finisher implemented exactly those rulings; none were re-litigated.** Details below.

---

## Finding Resolutions

Every numbered finding triaged below. Decision key: **FIX** = code/test/doc change applied this pass,
**DISMISS** = investigated and not acted on, with rationale, **DEFER** = valid but out of this story's
scope, logged as a follow-up. 10 findings, 0 dismissed, 0 deferred, 4 sub-items of Finding 10 dismissed
individually (Finding 10 itself has no single verdict — it's an "assorted" bucket).

### Finding 1 (Blocker) — FIX, per D-7.3-9

**What shipped.** `ResumeCard` now latches the entire resolved ticket (`key`, `summary`,
`prefillSeconds`, `startedAt`) into a `useRef` the first render `resume.status` is `'ready'`, and reads
from that latch — never from the live `resume` prop — for the displayed subtask, the recency note, the
input pre-fill, and the `postWorklog`/`setLastLoggedTicket` write target. `useResumeTicket` itself is
unchanged: the server-wins override still runs and can still change what `resume` reports; the card
simply stops listening to it after first paint. Across popup sessions (a fresh mount) the latch resets
and the override is free to correct a stale record again, exactly as D-7.3-9 requires.

**Files changed.** `components/today/ResumeCard.tsx` (the `latchedTicketRef` / `ticket` derivation
replacing direct `resume.key`/`resume.summary`/`resume.prefillSeconds`/`resume.startedAt` reads
throughout render and the write path).

**RED-proof (explicitly confirmed).** Added `ResumeCard.test.tsx` > "freezes the write target once the
card is ready — an enrichment identity swap does not retarget an in-progress edit (D-7.3-9)", which
reproduces the reviewer's exact repro: render `READY` (`PROJ-1`, pre-fill 2.5h), type `3`, `rerender`
with a swapped `ready` ticket (`PROJ-9`, pre-fill 2h, simulating the server-wins override landing
mid-type), assert the card's own label is still `Hours for PROJ-1` (not `PROJ-9`), press Enter, and
assert `postWorklog` is called with `('PROJ-1', { timeSpentSeconds: 10800, … })` — the original ticket,
the typed amount — and never with `'PROJ-9'`. Verified the full revert/confirm/restore cycle by hand:
temporarily replaced `const ticket = latchedTicketRef.current;` with
`const ticket = resume.status === 'ready' ? resume : null;` (defeating the latch, reproducing the
pre-fix behaviour exactly), ran the new test — **RED**, failing at `getByLabelText('Hours for PROJ-1')`
because the card had already retargeted to `PROJ-9`, matching the reviewer's measured hazard — then
restored the fix from a pre-made backup and reran — **GREEN**, along with the rest of the file (24/24 at
that point, 26/26 after Finding 8's tests were added later in this pass).

### Finding 2 (Major) — FIX, per D-7.3-10

**What shipped.** `useResumeTicket` exports a named constant `COLD_START_SKELETON_BUDGET_MS = 2000`. The
no-stored-record branch still returns `'loading'` while the week query is in flight, but a `useEffect`
starts a `setTimeout(COLD_START_SKELETON_BUDGET_MS)` the moment storage confirms there is no record and
the week query has not yet settled; if the timer fires first, the branch falls through to `'none'` and
the slot collapses per AC5. The budget effect's own guard (`if (stored !== null || weekSettled) return;`)
means it never starts for the common path (a stored record exists), matching D-7.3-10's "applies ONLY to
the no-stored-record branch" requirement exactly — that path still resolves synchronously from storage
with no timer involved at all.

**Files changed.** `hooks/useResumeTicket.ts` (`COLD_START_SKELETON_BUDGET_MS` export, `budgetExpired`
state + effect, the `!weekSettled && !budgetExpired` condition).

**Tests.** `useResumeTicket.test.ts` > "falls through to 'none' once COLD_START_SKELETON_BUDGET_MS
elapses without the week query settling (D-7.3-10)" — fake timers (`vi.useFakeTimers()` +
`vi.advanceTimersByTimeAsync`, wrapped in `act()`), asserting `'loading'` just under the budget and
`'none'` exactly at it, with a never-resolving week query throughout. **Confirmed RED**: reverted the
`!budgetExpired` guard (`if (!weekSettled) return { status: 'loading' };`) and reran — failed with
`expected 'loading' to be 'none'` — then restored and reran the full file green (10/10).

**Why this also resolves Finding 5's offset/height concerns.** See Finding 5 below — the two are coupled
because D-7.3-10 is what makes the `'loading'` window long enough (up to 2s) for the layout-shift bug to
actually matter to a user.

### Finding 3 (Major) — FIX

**What shipped.** No production-code change was needed — the reviewer's own verdict was "the
implementation is correct today," only the test was toothless. `App.test.tsx`'s "AC5: collapses to
nothing…" test now additionally asserts `main.children.length` equals `1` and
`main.firstElementChild === screen.getByTestId('today-view')` — i.e. the resume slot contributes **no
element at all**, not merely "no `-mt-[10px]` and no `.shadow-lift`" (which an empty reserved-space
wrapper would also satisfy).

**Files changed.** `entrypoints/popup/App.test.tsx` (assertion added, no other change).

**RED-proof (explicitly confirmed).** Reproduced the reviewer's mutation N1 by hand — changed
`{connected && resume.status !== 'none' && (` to `{connected && (` in `App.tsx`, leaving an empty
`<div className="mb-3" />` in the `'none'` state — reran the AC5 test: **RED**,
`expected 2 to be 1`. Reverted from backup and reran the full `App.test.tsx`/`App.a11y.test.tsx`/
`App.session-total.test.tsx` set green (18/18).

### Finding 4 (Major) — FIX, per D-7.3-11

**What shipped.** `epic-7-decision-log.md` gained five new canonical entries, **D-7.3-12** through
**D-7.3-16**, folding the four previously-unnumbered "Spec ambiguities resolved in 7.3" bullets
(`+0.5/+1/+2` non-increment, `border-border`, `focus-within:ring-focus`, amber-not-red) plus the
PTO-exclusion rule (previously undocumented in the log at all, only in the story file's own now-defunct
local numbering) into the log itself, which D-7.3-11 designates as the superset. Every `D-7.3-*` citation
in the story file (outside the reviewer's own verbatim Review Findings text, which is left untouched as
the historical record) and in every source file was then audited and repointed:
- `D-7.3-3` (offset) and `D-7.3-4` (autofocus) already matched the canonical log — left as-is.
- The story-file-local `D-7.3-3` (PTO), `D-7.3-4` (quick buttons), `D-7.3-6` (border), `D-7.3-7`
  (ring-focus), `D-7.3-8` (amber) headings and every citation of them were renumbered to
  `D-7.3-12`/`D-7.3-13`/`D-7.3-14`/`D-7.3-15`/`D-7.3-16` respectively.
- `ResumeCard.tsx`'s two different `D-7.3-4` citations 104 lines apart (the reviewer's specific
  complaint) are now `D-7.3-4` (focus latch, correctly matching the canonical meaning) and `D-7.3-13`
  (quick-button non-mutation) — no longer the same number for two different things.
- `D-7.3-7`/`D-7.3-8`, cited in code but defined nowhere, now resolve to `D-7.3-15`/`D-7.3-16`.
- The two loading/pop-in-avoidance citations that predate D-7.3-10's existence (in `useResumeTicket.ts`'s
  code comment and the Debug Log's historical narrative) were repointed to `D-7.3-10`, since that is now
  the precise canonical entry for exactly that rule.

Verified via `grep -rn "D-7\.3-"` across the story file and every touched source file after the pass:
every remaining citation resolves to exactly one entry in the canonical log, with zero stale references
outside the reviewer's own frozen Review Findings text. No behaviour changed by this finding.

**Files changed.** `_bmad-output/implementation-artifacts/epic-7-decision-log.md` (5 new entries),
`_bmad-output/implementation-artifacts/7-3-resume-card-the-first-move.md` (headings + citations
throughout Tasks/Dev Notes/Testing table/Debug Log/Completion Notes/Change Log — NOT the Review Findings
section itself), `components/today/ResumeCard.tsx`, `hooks/useResumeTicket.ts`,
`hooks/useResumeTicket.test.ts`, `components/today/ResumeCard.test.tsx`,
`components/today/PtoQuickAction.test.tsx`, `entrypoints/popup/App.session-total.test.tsx` (comment-only
citation repoints).

### Finding 5 (Minor) — FIX

**What shipped.** `App.tsx`'s `breaksHeaderBaseline` is now `connected && resume.status !== 'none'`
(was `=== 'ready'`), so the `'loading'` skeleton and the resolved `'ready'` card share one offset.
`ResumeCard`'s skeleton gained a fourth block — an empty `<div className="min-h-[1.25rem]" />` — matching
the real card's message-region reserve exactly, so the skeleton and the resolved card are now the same
total height too. The reviewer's own point that the original "single-digit-ms" justification was
invalidated by the SAME commit's D-7.3-10 fix (which can make `'loading'` last up to 2s on a cold start)
is exactly why this needed a real fix rather than another logged deviation.

**Files changed.** `entrypoints/popup/App.tsx` (`breaksHeaderBaseline` formula + comment),
`components/today/ResumeCard.tsx` (skeleton's fourth block).

**Tests.** `App.test.tsx`'s "renders a skeleton…" test now asserts `-mt-[10px]` **is** present during
`'loading'` (inverted from the prior assertion, which asserted its absence — the prior assertion was
correct for the prior, now-superseded behaviour).

### Finding 6 (Minor) — FIX

**What shipped.** Four class-presence / attribute assertions added to `ResumeCard.test.tsx`: the card
root carries `relative` and `z-[1]`; the input wrapper carries `border-[1.5px]`, `border-primary`, and
`focus-within:ring-focus`; the input carries `aria-keyshortcuts="Enter"`. No production code changed —
the reviewer's own verdict was that the underlying behaviour is correct, only unpinned.

**Files changed.** `components/today/ResumeCard.test.tsx` (3 new tests).

**RED-proof (explicitly confirmed).** Reproduced the reviewer's N9 (`relative z-[1]` removed), N14
(`border-[1.5px] border-primary` downgraded to a plain border), N12 (`focus-within:ring-focus` removed),
and N13 (`aria-keyshortcuts="Enter"` removed) simultaneously by hand. All three new tests failed:
`expected '...' to contain 'relative'`, `expected '...' to contain 'border-[1.5px]'` (the same assertion
also covers N12 since both classes were removed together), and `expected null to be 'Enter'`. Restored
from backup; full file reran green (24/24 at that point).

### Finding 7 (Minor) — FIX

**What shipped.** `bg-neutral-200` (a legacy alias explicitly marked "remove each alias as its component
migrates to the semantic tokens above" in `styles/globals.css`) replaced with `bg-border` — byte-identical
hex (`#e4e3ec`), semantic, and already used by this same file for `border-border`. All 4 pre-existing
occurrences plus the 1 new occurrence added by Finding 5's fourth skeleton block use `bg-border`.

**Files changed.** `components/today/ResumeCard.tsx` (5 class-name substitutions).

### Finding 8 (Minor) — FIX

**What shipped.** The message region gained a stable `id` (`resume-card-message`); the input gains
`aria-describedby` pointing at it whenever a message is visible (amber validation error or a refused-write
red error — not the pending chip, which already has its own `role="status" aria-live="polite"`), and
`aria-invalid="true"` specifically when the *value itself* is invalid (unparseable/over-limit) — not for
a refused write, where the typed value was valid and the server refused the write, a different kind of
error. Each amber/red message `<p>` gained `role="alert"` so a screen-reader user gets an announcement
even though `handleEnter` is a silent no-op in the DOM sense.

**Files changed.** `components/today/ResumeCard.tsx` (`MESSAGE_ID` constant, `aria-describedby`/
`aria-invalid` on the input, `role="alert"` on the three message `<p>` elements).

**Tests.** Two new tests in `ResumeCard.test.tsx`: one confirms `aria-invalid`/`aria-describedby`/
`role="alert"` appear together when the input holds an unparseable value (and are absent when it
doesn't); one confirms a refused write is `aria-describedby`-linked and `role="alert"` but does **not**
set `aria-invalid` (the value was valid; the server refused it — a different failure class per the
distinction above).

### Finding 9 (Nit) — FIX

**What shipped.** Recomputed the Dev Notes contrast table against the real WCAG relative-luminance
formula and the real rendered backgrounds (verified independently with a Node one-liner, not just
trusting the reviewer's numbers): `--color-primary` on white is 7.5:1 (not the previously-recorded
~8.9:1); `--color-faint` on white is ~5.3:1 (not 4.6:1 — the table had been conservative there); the
amber row now states its real background (`bg-surface`/white, not `amber-soft`, which the card never
renders amber text on) at 8.3:1. No AA failure resulted from the correction either way — every pair
clears 4.5:1 with comfortable margin — this was purely a documentation-accuracy fix on the story's own
stated evidence record for a hard gate.

**Files changed.** `_bmad-output/implementation-artifacts/7-3-resume-card-the-first-move.md` (table
correction + a dated note explaining the correction).

### Finding 10 (Nit) — mixed, all 4 numbered sub-items DISMISSED with rationale

1. **33px vs 34px button/input height mismatch — DISMISSED.** Task 4's own bullet text specifies
   `h-[33px]` for the quick buttons and `h-[34px]` for the input wrapper as two separate literal values —
   the developer implemented exactly what the story specified, byte for byte. This is a spec artifact,
   not an implementation bug; a 1px difference is imperceptible and changing it unilaterally would be
   scope creep on a value the story author, not the developer, chose. Would need a DESIGN.md-owner ruling
   to change, which this finding doesn't rise to given the reviewer's own "none individually load-bearing"
   framing.
2. **Quick buttons don't return focus to the input — DISMISSED.** The reviewer's own text calls this
   "genuinely under-determined by the spec — flagged, not asserted," and epics.md's AC4 (the story's
   binding acceptance criterion, not the EXPERIENCE.md prose that inspired it) scopes "focus returns to
   the input" to the **Enter** path only, which the code satisfies. D-7.3-13 additionally establishes that
   `+0.5/+1/+2` "never touch the input" — extending that to include focus is a plausible but unstated
   widening of that rule, not a defect against it. The keyboard hot path (type → Enter) is unaffected.
3. **`Clock` icon not in DESIGN.md's authoritative `icons:` map — DISMISSED.** The reviewer's own text:
   "consistency with the epic's own surfaces arguably outranks the map here." Verified: the identical
   `Clock` chip at the identical `h-3 w-3` is already used at five existing call sites
   (`QuickLogForm.tsx`, `PtoQuickAction.tsx`, `PtoPopover.tsx`, `LoggedToday.tsx`, `DayCell.tsx`). Making
   `ResumeCard` the one surface that diverges would introduce the first inconsistency rather than remove
   one, for a component this story explicitly mirrors (Task 4: "mirror `QuickLogForm.tsx`'s onSuccess
   branching exactly").
4. **Badge missing the `icons.kbd` 1px border — DISMISSED.** DESIGN.md's `icons.kbd` border spec has no
   stated precedent in this codebase for a kbd icon embedded inside a solid-colour (`bg-primary`) chip
   rather than free-standing — every other `border: 1px solid {colors.border}` icon token use in this
   repo is on a light/neutral background, where the border is visually load-bearing (it separates the
   icon from the page). On this badge, `bg-primary` already provides the visual separation from
   `bg-surface` (the card). Adding a light `border-border` ring around a small dark chip risks looking
   like an accidental artifact rather than an intentional outline. Genuinely a visual judgement call with
   no functional stakes either way (the badge is `aria-hidden`); left as shipped rather than guessing at a
   visual change with no design review available to confirm it.
   Sub-item 5 (the `<div className="mb-3">` wrapper around `ResumeCard`) required no action — the
   reviewer's own text says it's "recorded only for completeness" and the Dev Agent Record already
   discloses it; unrelated to Finding 3's fix (Finding 3 concerns test coverage of the wrapper's
   *conditional*, not the wrapper's existence, which the reviewer confirmed is harmless).

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-07-26 — done

Code review found 1 blocker / 3 majors / 4 minors / 2 nits. The owner and
orchestrator ruled on the three escalations before this pass (epic-7-decision-log.md
D-7.3-9 froze the server-wins override's identity at first paint; D-7.3-10 time-bounded the
cold-start skeleton at a named 2000ms constant; D-7.3-11 made the decision log canonical
D-7.3-* numbering, folding 5 new entries D-7.3-12..16). The finisher implemented all three
rulings plus every other finding (all FIX; only 4 sub-items of the catch-all Finding 10 were
dismissed, each with recorded rationale). The Blocker's write-target-retargeting regression
test and all 4 previously-toothless class-presence tests were proven RED without their fixes
and green with them, by hand, before commit. Final gates: 86 files / 1049 passed / 1 skipped
(net +7 tests, 0 new files), lint 0 errors/53 warnings (unchanged), build green.
