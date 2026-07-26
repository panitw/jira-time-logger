---
baseline_commit: 53e6e44dda1029b76a8e4a4970ab2dff955f0f4c
---

# Story 7.3: Resume Card — The First Move

Status: ready-for-dev

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
| Action bar | `components/shell/PopupActionBar.tsx` | Holds the relocated `PtoQuickAction`. Untouched by this story except for one guard test (D-7.3-3). |
| Tokens | `styles/globals.css` `@theme` | `--shadow-lift`, `ring-focus`, `tabular`, `animate-skeleton`, `animate-slide-in`, the full `--text-*` scale, and `--spacing: 4px` (so **standard Tailwind spacing utilities are correct — use them normally**). |

**What this story is NOT.** It is not search (7.4), not the "Logged today" / "Recently worked" rebuild or
the 55-ticket handoff (7.5), not the day-status vocabulary (7.6), not the offline/error banners (7.9).
The body of the scroll region below the card stays exactly as 7.2 left it — the existing `TodayView` with
its `TicketPicker`. 7.5 replaces that body.

**Orchestrator decisions carried by this story:** D-7.3-1 (AC5 is split; the search half is a named
carry-forward to 7.4), D-7.3-2 (resume data source), D-7.3-3 (time off never becomes the resume ticket),
D-7.3-4 (`+0.5/+1/+2` post that amount, they do not increment), D-7.3-5 (skeleton, not a pop-in),
D-7.3-6 (`border-border`, not the spec's un-tokenised `#DEDCE9`), D-7.3-7 (`ring-focus` via
`focus-within:`), D-7.3-8 (unparseable input is amber, not red).

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

- [ ] **Task 1 — Persistent last-logged record (AC2, AC3; the data seam)** — *DO THIS FIRST*
  - [ ] New `lib/storage/last-logged.ts`, modelled on `lib/storage/pinned-tickets.ts` (same
        `storage.defineItem` shape, same module layout).
  - [ ] `export type LastLoggedTicket = { key: string; summary: string; seconds: number; startedAt: string; recordedAt: string }`
        — `seconds` is **the duration the user last entered against this ticket** (the AC3 pre-fill value);
        `startedAt` is the worklog's `started` (drives the AC2 recency note); `recordedAt` is when the
        record was written (tiebreak only).
  - [ ] `export const lastLoggedTicketItem = storage.defineItem<LastLoggedTicket | null>('local:lastLoggedTicket', { fallback: null })`.
  - [ ] `getLastLoggedTicket()` **must defensively coerce a malformed stored value to `null`** — WXT's
        `fallback` only applies to an *absent* key, so a partial/legacy value would survive a reshape.
        Copy the guard shape from `lib/storage/view-state.ts` lines 46–56.
  - [ ] `setLastLoggedTicket(record)` overwrites unconditionally (last write wins — it is a
        "most recent", not a history).
  - [ ] **Writers — only on a CONFIRMED write** (`result.kind === 'ok'`). A post that fell to the outbox
        or was refused is not something to resume from.
    - [ ] `components/today/QuickLogForm.tsx` — in the existing `onSuccess` ok-branch (line 118), beside
          the existing `sendMessage('badge-update', …)`. `void`-fire; a storage failure must never break
          the log.
    - [ ] The new `ResumeCard`'s own post path (Task 4).
    - [ ] **NOT** `components/today/PtoQuickAction.tsx` — see D-7.3-3.

- [ ] **Task 2 — `hooks/useResumeTicket.ts` (AC1, AC2, AC3, AC5)**
  - [ ] Returns a discriminated status so the caller never has to guess:
        `{ status: 'loading' } | { status: 'none' } | { status: 'ready'; key; summary; prefillSeconds; startedAt }`.
  - [ ] **Primary source = `lastLoggedTicketItem`** (storage, single-digit ms). Resolve `status` from
        storage ALONE — **do not await the week query**, or focus lands late and NFR1 slips (Dev Notes >
        "Autofocus, NFR1, and the aria-live region").
  - [ ] **Enrichment = `useWeekWorklogs(currentWeekMonday())`** — the *same* TanStack query
        `useTodayTotal` already subscribes to (identical `queryKey: ['week-worklogs', weekOf]`), so this
        costs **zero additional network**. Use it for two things only:
    - [ ] Refine the recency note to the true freshest `started` for that ticket.
    - [ ] **Server-wins override:** if the week data contains a worklog with a `started` strictly newer
          than the stored record's `startedAt`, on a *different* issue (logged from Jira web or another
          device), that issue becomes the resume ticket and its newest worklog's `timeSpentSeconds`
          becomes the pre-fill.
  - [ ] Enrichment must **never** flip `status: 'ready'` → `'none'`, and must never change the identity
        of the card in a way that moves focus (Task 3's focus latch covers the second half).
  - [ ] **Exclude the configured PTO subtask** from the enrichment scan — read `ptoSubtaskKeyItem`
        (`lib/storage/settings.ts`, already consumed by `PtoQuickAction`). D-7.3-3.
  - [ ] `status: 'none'` when storage is empty **and** the week scan yields no non-PTO worklog. The
        known cold-start limitation is documented in Dev Notes > D-7.3-2 — do not widen the fetch window
        to paper over it.

- [ ] **Task 3 — `components/today/ResumeCard.tsx` — shell, anatomy, offset (AC1, AC2, AC5)**
  - [ ] Root: `relative z-[1] rounded-lg border border-border bg-surface p-[14px] shadow-lift`
        + `flex flex-col gap-[11px]`. `relative z-[1]` is **load-bearing** — without it the `relative`
        chrome header paints on top of the card (Dev Notes > "The −10 px offset").
  - [ ] `shadow-lift` appears **exactly once in the whole popup source tree**. Verified at story time:
        `--shadow-lift` is declared at `styles/globals.css:197` and used by **no** source file. This
        story is its first consumer. A guard test pins it (Task 7).
  - [ ] Row 1 — `flex items-center justify-between gap-2`:
    - [ ] Eyebrow `CONTINUE LOGGING`: `font-chrome text-eyebrow uppercase text-primary`. Use the
          `text-eyebrow` token (11px/500/0.1em) — DESIGN.md typography wins over the mockup's `.08em`.
    - [ ] Recency note, right-aligned: `tabular text-[11.5px] text-faint`. Copy table in Dev Notes.
  - [ ] Row 2 — `flex flex-col gap-[3px]`. **The key and the summary are separate block children.** This
        is what makes AC2's "truncates without displacing the key" structurally true, per DESIGN.md
        lines 461–464. Never put them on one line, never `truncate` the key's row.
    - [ ] Key: `tabular text-subheading text-primary` (`tabular` already applies Kanit — no `font-chrome`).
    - [ ] Summary: `text-body text-foreground line-clamp-2` (Tailwind v4 core utility; **no CSS change
          needed**). Must hold at 200 chars.
  - [ ] Row 3 — the hour entry row (Task 4).
  - [ ] **`status: 'loading'`** → render an `animate-skeleton` block **in the card's real layout shape**
        (same height, same offset), never a spinner — EXPERIENCE.md line 189 and the `ChromeHeader`
        precedent. D-7.3-5.
  - [ ] **`status: 'none'`** → render `null`. No wrapper, no `min-h-*`, no spacer, no placeholder border.
        AC5's owned half.
  - [ ] **The −10 px offset lives in `entrypoints/popup/App.tsx`, not here** — see Task 5. Read Dev Notes
        > "The −10 px offset" before writing any of it; the naive `-mt-[10px]` on the card is clipped by
        7.2's `overflow-y-auto` scroll region.

- [ ] **Task 4 — Hour entry row + the write path (AC3, AC4)**
  - [ ] Input assembly: a wrapper `<div>` carries the border/ring, a real `<input>` sits inside it with
        an `h` suffix span and the `CornerDownLeft` badge.
    - [ ] Wrapper: `flex h-[34px] flex-1 items-center gap-1.5 rounded-md border-[1.5px] border-primary px-[9px] focus-within:ring-focus`.
          `focus-within:` — D-7.3-7.
    - [ ] `<input type="text" inputMode="decimal">`, `tabular text-[14px]`, `focus:outline-none`
          (the wrapper ring is the replacement indicator — never bare `outline: none`).
    - [ ] `aria-label={`Hours for ${key}`}` and `aria-keyshortcuts="Enter"`. Do **not** stuff the Enter
          hint into the label prose.
    - [ ] Badge: `<CornerDownLeft aria-hidden="true" className="h-[13px] w-[13px]" />` inside a
          `ml-auto rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground` chip. `lucide-react`,
          13 px, `aria-hidden` — DESIGN.md `icons.submit` and `icons.defaults`. **No text glyph `⏎`**
          (the mockup uses one; the icon vocabulary supersedes it, DESIGN.md lines 420–431).
  - [ ] **Pre-fill** = `secondsToHoursDisplay(prefillSeconds)` from `lib/hours.ts`. Fall back to `'1'`
        when the resolved record carries no usable duration.
  - [ ] **Focus on open**: one `useEffect`, `inputRef.current?.focus({ preventScroll: true })`, guarded
        by a `useRef` **latch so it fires at most once per popup session**. Read Dev Notes > "Autofocus,
        NFR1, and the aria-live region" — the latch is not optional, it is what stops the Task 2
        enrichment re-render from yanking focus back out of wherever the user moved it.
  - [ ] **`+0.5` / `+1` / `+2`**: `flex-0 h-[33px] rounded-md border border-border bg-surface tabular text-[12.5px]`,
        `aria-label={`Log ${n} hours to ${key}`}`, hit target ≥ 24×24 px. Each **posts that exact amount
        immediately, with no confirmation and without touching the input value** — D-7.3-4.
  - [ ] **Write path — mirror `QuickLogForm.tsx` lines 107–156 exactly; do not invent a parallel one:**
    - [ ] `parseHours` → `hoursToSeconds` → `postWorklog(key, { timeSpentSeconds, started })`.
          **Never inline `* 3600`** (architecture binding rule).
    - [ ] `started` = `formatStartedISO(todayDateString())` (`lib/worklog-date.ts`) — the resume card
          always logs against **today**. No date picker; that is `QuickLogForm`'s job.
    - [ ] `result.kind === 'ok'` → `sendMessage('badge-update', …)`, write the Task 1 record, emit a
          `LoggedEntry` upward, reset the input to the just-logged value and `select()` it, return focus
          to the input. **The popup does not close** — no `<form>`, no default submit; use `onKeyDown`
          with `e.preventDefault()` on Enter, as `QuickLogForm` does.
    - [ ] `network` / `rate-limited` → `enqueueOutbox(...)` and show the existing "Pending — will retry"
          chip shape. **Do not** write the Task 1 record.
    - [ ] any other kind → the error state. **Do not** write the Task 1 record.
    - [ ] Unparseable / over-`MAX_HOURS_PER_ENTRY` input → **amber** (`text-amber-ink`), not red, and
          Enter is a no-op. D-7.3-8.
  - [ ] **Do NOT call `invalidateQueries(['week-worklogs', …])` anywhere in this story.** Read the
        hazard block at `hooks/useTodayTotal.ts` lines 13–31 in full before writing the success handler.

- [ ] **Task 5 — Mount into the popup shell (AC1, AC4, AC5)** — `entrypoints/popup/App.tsx`
  - [ ] Add a **third** session contribution, modelled on `ptoEntries` (lines 63–64) — a
        `resumeEntries: LoggedEntry[]` **list**, never a monotonic counter (7.2 Finding 3: a counter
        cannot be decremented, which silently kills the edit/delete correction path).
  - [ ] `sessionSeconds = todayViewSeconds + ptoSeconds + resumeSeconds`, still fed to the single
        `useTodayTotal(sessionSeconds)` call at line 120. **This is AC4's "chrome figure and progress bar
        update", in full.** No second total, no direct `ChromeHeader` prop.
  - [ ] Pass `[...ptoEntries, ...resumeEntries]` as `TodayView`'s `externalEntries`, and extend the
        existing `onExternalEntryEdited` / `onExternalEntryDeleted` handlers to route by which list owns
        the `worklogId`. The entry then lands in `LoggedToday` with `motion-safe:animate-slide-in`
        already applied — **AC4's "animates into Logged today", satisfied by reuse.**
  - [ ] Render `<ResumeCard>` as the **first child of the `<main>` scroll region**, above `TodayView`,
        only when `connected`.
  - [ ] **The baseline offset — one boolean, one place:**
        ```
        // 7.9 extends this expression with `&& !offlineBanner && !writeErrorBanner`.
        // Mockup states `offline` and `error` both set resumeOffset: "0px".
        const breaksHeaderBaseline = connected && resume.status === 'ready';
        ```
        applied as `-mt-[10px]` on `<main>`. **Nothing else changes for 7.9.** Read Dev Notes >
        "The −10 px offset" for why it is on `<main>` and not on the card.

- [ ] **Task 6 — D-7.3-3 guard: time off never becomes the resume ticket**
  - [ ] Confirm `PtoQuickAction.tsx` writes **no** last-logged record (it should need no edit — verify,
        do not assume).
  - [ ] `useResumeTicket` filters the configured PTO subtask key out of the week-worklog enrichment.
  - [ ] Add the guard test (Task 7). Rationale in Dev Notes > D-7.3-3.

- [ ] **Task 7 — Tests (AC1–AC6)** — see Dev Notes > "Testing" for the full file-by-file list and the
      jsdom limits that shape what can honestly be asserted.

- [ ] **Task 8 — Gates**
  - [ ] `pnpm compile`, `pnpm lint`, `pnpm test`, `pnpm build`.
  - [ ] Record the exact `pnpm test` file/pass counts in the Dev Agent Record and compare them against the
        recorded baseline **before** calling anything pre-existing.
  - [ ] `git status` must show **none** of the Epic 6.3 files staged (Dev Notes > "Files fenced off").
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

### D-7.3-3 — Time off never becomes the resume ticket

`PtoQuickAction` posts to the configured PTO subtask (`lib/pto.ts`, `ptoSubtaskKeyItem`). If that stamped
the last-logged record, the popup's **primary affordance** would open pre-loaded with "log more time
off" — wrong on its own terms, and directly at odds with 7.6's day-status vocabulary where time off is a
*settled* state that "stops asking" (EXPERIENCE.md line 187).

So: `PtoQuickAction` writes no record, and `useResumeTicket` filters the PTO subtask key out of the
week-worklog enrichment. **The catch-all project is NOT filtered** — Admin/Meetings work under the
catch-all is legitimately resumable; only the PTO subtask itself is excluded.

### D-7.3-4 — `+0.5` / `+1` / `+2` post that amount; they do not increment the input

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

### D-7.3-6 — `border-border`, not `#DEDCE9`

DESIGN.md `components.resume-card.border` is `1px solid #DEDCE9` (line 135) — a **raw hex with no token**.
The nearest token is `--color-border: #E4E3EC`. Introducing a fourth border hex for one component
breaks the token discipline 7.1/7.2 established, for a difference that is imperceptible under
`shadow-lift`. **Use `border-border`.** Recorded here as a deliberate, minor deviation for DESIGN.md's
owner to fold back in. No change to `styles/globals.css` — this story adds **no new token, no new hex, no
new `@utility`**.

### D-7.3-7 — `ring-focus` via `focus-within:`, not statically

AC3 says the input "carries a 1.5 px primary border plus `ring-focus`". Applied as a static class, the
ring would keep glowing after focus moves elsewhere (7.4's `/`), which lies to sighted users about where
focus is. Applied as `focus-within:ring-focus` on the wrapper, it is **on at popup open** — exactly the
"When the popup opens" condition AC3 states — and it stays honest afterwards. The 1.5 px primary border
is unconditional, per the spec's `hour-input` component (DESIGN.md lines 173–177).

### D-7.3-8 — Unparseable input is amber, not red

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
| Eyebrow `CONTINUE LOGGING` | `--color-primary` `#594F74` | ~8.9:1 | pass |
| Recency note | `--color-faint` `#6B6B72` | 4.6:1 | pass — **the documented floor; never lighten** |
| Ticket key | `--color-primary` `#594F74` | ~8.9:1 | pass |
| Summary | `--color-foreground` `#1E1B2E` | ~15:1 | pass |
| Input text | `--color-foreground` | ~15:1 | pass |
| Badge glyph | `#fff` on `--color-primary` | ~8.9:1 | pass |
| Amber error text | `--color-amber-ink` on white | > 5.9:1 | pass |

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
| `hooks/useResumeTicket.test.ts` (new) | resolves from storage without the week query; week worklog strictly newer on a different issue **overrides** the stored record; **PTO subtask excluded** (D-7.3-3); `status: 'none'` when both sources are empty; enrichment never flips `ready → none`. |
| `components/today/ResumeCard.test.tsx` (new) | anatomy (eyebrow / recency / key / summary); **200-char summary** — key and summary are separate nodes and the summary carries `line-clamp-2`; input pre-filled and focused on mount; `CornerDownLeft` badge is `aria-hidden`; `+0.5/+1/+2` each post exactly 0.5/1/2 h **with no confirmation step and without mutating the input**; Enter posts, focus returns and the value is selected; unparseable input is amber and does not post; **focus latch** — a re-render after focus has moved does not steal it back; **`shadow-lift` exclusivity guard** (below). |
| `entrypoints/popup/App.test.tsx` | card mounts as the first child of the scroll region when `status: 'ready'`; **collapses to nothing** with no history and `<main>` carries no `-mt-[10px]` (AC5's owned half). |
| `entrypoints/popup/App.session-total.test.tsx` | **extend, do not replace.** A resume-card log must move the chrome figure **through `useTodayTotal`**, and **no `['week-worklogs', …]` invalidation may fire**. This file drives the real composition root and is the only place the double-count guard is pinned — it must stay meaningful (`useTodayTotal.ts` lines 13–31). |
| `entrypoints/popup/App.a11y.test.tsx` | extend with the card mounted: zero Critical/Serious. Entrypoint-level a11y coverage is the established pattern here (`entrypoints/options/App.a11y.test.tsx` is the template). |
| `components/today/QuickLogForm.test.tsx` | stamps the record on `ok`; **does not** stamp on a queued (network/rate-limited) or refused post. |
| `components/today/PtoQuickAction.test.tsx` | **does not** stamp the record (D-7.3-3 guard). |

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-26 | 0.1 | Story created from `epics.md` lines 1756–1787 at baseline `53e6e44`. Records ORCHESTRATOR DECISION D-7.3-1 (AC5 split; search half carried forward to 7.4 by name) and D-7.3-2…D-7.3-8. Data seam investigated against source: `pinnedTickets` and `TodayView.loggedEntries` both rejected with reasons; new `local:lastLoggedTicket` + free `useWeekWorklogs` enrichment specified, with the fresh-install cold-start limitation stated rather than papered over. The −10 px offset specified on `<main>` (not on the card) because 7.2's `overflow-y-auto` scroll region clips a negative margin, with the card's `relative z-[1]` called out as load-bearing against the `relative` chrome header, and the whole thing reduced to one boolean so Story 7.9 can drop it in one line. Autofocus specified against NFR1 and 7.2's `aria-live` region, including the focus latch that stops the week-query re-render from stealing focus. `shadow-lift` verified unused in source — this story is its first consumer, pinned by a guard test. | bmad-story-creator |
