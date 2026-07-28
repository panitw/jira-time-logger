---
baseline_commit: 36b5602ebeeb0d2f6ba0948b5a155ebdced6bb53
---

# Story 7.2: Popup Shell — One Job, One Scroll Region

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Priya opening the popup,
I want a fixed-size surface that shows me today and nothing else,
So that I am not scrolling past a week grid to log an hour.

## Context

This is the **first Epic 7 story with a story file**. Story 7.1 (token foundation + bundled fonts) landed
during the `/bmad-ux` run itself and was committed as the baseline (`36b5602`) — there is no 7.1 story file.

**What 7.1 already gives you (compose from it; do not re-derive):**
`styles/globals.css` carries the full KKP `@theme` block — palette (`primary`, `muted`, `border-faint`,
`status-*`, `amber-*`, `error-*`, `weekend`, `surface`/`surface-sunk`/`background`), the legacy
`neutral-*`/`accent-*`/`state-*` aliases remapped onto KKP values, font families (`font-chrome` = Kanit,
`font-data` = Noto Sans, `font-num`), radii `--radius-sm|md|lg|xl`, elevation
`--shadow-hairline|raised|lift|overlay`, and the custom utilities `bg-chrome-gradient`, `ring-focus`,
`tabular`, `animate-skeleton`, `animate-fade-in`, `animate-slide-in`, `animate-slide-out`.
Fonts are bundled at `public/fonts/` (Kanit 400/500/600 + Noto Sans variable). **No new hex value and no
new colour token may be introduced by this story** — see the one declared exception in Dev Notes >
"The one token gap 7.1 left".

**What this story is.** It rebuilds the popup as a *single-job* surface: fixed 380×560, chrome header on
top, exactly one scroll region in the middle, fixed action bar at the bottom, and the Radix `Tabs`
primitive gone. It also builds the **thin full-page host shell** that the removed Week/Manager tabs now
live in, and lands a **labelled amendment to Story 7.1's token layer** (Task 0 / D-7.2-3).

**Orchestrator decisions carried by this story:** D-7.2-1 (full-page host shell in scope — below),
D-7.2-2 (the chrome figure gets a real today-total — Task 3), D-7.2-3 (fix 7.1's spacing + type-scale gap
at the token layer — Task 0).

**What this story is NOT.** It does not build the resume card (7.3), search (7.4), the Logged-today /
Recently-worked lists and the 55-ticket handoff (7.5), the day-status vocabulary (7.6), the *revamped*
week grid (7.7), the revamped matrix (7.8), or the full popup state set (7.9). The body of the scroll
region in 7.2 is **the existing `TodayView`, minus the two pieces that move into the chrome header and the
action bar**. 7.3–7.5 replace that body.

### ORCHESTRATOR DECISION D-7.2-1 — the full-page host shell is in scope for this story

Removing the popup `Tabs` orphans `WeekView` and `ManagerView`, and AC5 below requires that "the manager
reaches the matrix through the full page instead". Story 7.2 therefore includes a **new WXT full-page
entrypoint that is a thin host shell only**: Week / Manager / Settings section routing, mounting the
**existing `WeekView` and `ManagerView` completely unchanged and unrestyled**, and "Open week ↗" opening
it in a new tab on the Week section.

**The boundary is unmistakable: 7.2 builds the container and the routing, not the revamped week grid.**
Do NOT restyle `WeekView` / `WeeklyGrid` / `ManagerView` / `ManagerMatrix` in this story. Do NOT give the
full page its KKP chrome header, prev/next week navigation, the 104 px day columns, or the totals-row
anatomy — all of that is Story 7.7.

**Consequence for Story 7.7:** 7.2 satisfies 7.7's *first* acceptance criterion verbatim ("a new WXT
entrypoint renders a full page in a browser tab, routed to Week / Manager / Settings sections **And**
'Open week ↗' in the popup opens it on the Week section"). Whoever writes 7.7 must treat that AC as
already met and scope 7.7 to the chrome header, the semantic grid, cell anatomy, in-place editing, the
totals row, and the gap dialog.

## Acceptance Criteria

AC1–AC6 are transcribed verbatim from `epics.md` lines 1719–1755. AC7 is derived from D-7.2-1 (and is
7.7's first AC pulled forward). AC8 is the standing regression gate.

### AC1 — Tabs removed, only today's content renders
**Given** the popup currently renders `TodayView` and `WeekView` simultaneously via `forceMount` tabs
**When** the shell is rebuilt
**Then** the `Tabs` primitive is removed from the popup entirely — not fixed, removed
**And** only today's content renders

### AC2 — Fixed 380×560 surface with exactly one scroll region
**Given** the popup opens
**When** it mounts
**Then** the surface is 380 px wide and at most 560 px tall
**And** it contains exactly one scroll region, between a fixed chrome header and a fixed action bar
**And** no nested scroll region exists anywhere in the popup

### AC3 — Chrome header composition
**Given** the chrome header renders
**When** the user is connected
**Then** it carries `bg-chrome-gradient` with the concentric ring motif, an eyebrow with the product name
and user, today's date in Kanit 600 at 22 px, the logged/target figure in white tabular Kanit, and a 4 px
progress bar
**And** the progress figure and bar are wrapped in `role="status" aria-live="polite"`

### AC4 — Action bar
**Given** the action bar renders
**When** the popup is in any connected state
**Then** it contains a ghost "Mark today as time off" action and a secondary "Open week ↗" action
**And** "Open week ↗" opens the full-page surface in a new tab

### AC5 — No orphaned manager affordance
**Given** the manager previously reached the matrix through a popup tab
**When** the tabs are removed
**Then** the manager reaches the matrix through the full page instead, and no manager affordance is
orphaned in the popup

### AC6 — NFR1 TTI ≤ 400 ms warm
**Given** NFR1 requires popup TTI ≤ 400 ms warm
**When** the popup opens
**Then** the chrome header paints before data resolves, and no entrance animation delays interactivity

### AC7 — Full-page host shell (DERIVED — ORCHESTRATOR DECISION D-7.2-1)
**Given** no full-page extension surface exists today and AC4/AC5 both depend on one
**When** this story lands
**Then** a new WXT entrypoint renders a full page in a browser tab, routed to Week / Manager / Settings
sections
**And** "Open week ↗" in the popup opens it in a **new tab** on the Week section
**And** the Week section mounts the existing `WeekView` **unchanged and unrestyled**
**And** the Manager section mounts the existing `ManagerView` **unchanged and unrestyled**, and appears in
the section nav only when `hasDirectReports()` resolves `true` (fail-closed to hidden on error, exactly as
the removed popup tab behaved — UX-DR18, never rendered disabled)
**And** the Settings section is a thin slot that hands off to the existing options page
(`chrome.runtime.openOptionsPage()`) — the **nav item is spec-mandated** (EXPERIENCE.md lines 60–62 place
Settings in the full-page IA), only its **body** is provisional; Story 7.10 replaces the body in place
**And** no KKP restyle of the week grid or the matrix happens in this story

### AC8 — No regressions; all gates green
**Given** the shell rewrite and the new entrypoint are complete
**When** `pnpm compile`, `pnpm lint`, and `pnpm test` run
**Then** all pass with no new failures against the recorded baseline (see Dev Notes > "Test baseline")
**And** `pnpm build` succeeds and emits the new full-page HTML into `output/chrome-mv3/`
**And** no WCAG 2.1 AA regression: the axe gate stays at zero Critical/Serious on every surface, and every
status remains colour + icon + visible text label
**And** the spacing shift produced by Task 0 (D-7.2-3) across the already-shipped Epic 1–6 surfaces is
recorded as **expected and intended**, not reported as a 7.2 regression — see Dev Notes > D-7.2-3

## Tasks / Subtasks

- [x] **Task 0 — Token-layer amendment to Story 7.1 (ORCHESTRATOR DECISION D-7.2-3) — DO THIS FIRST**
  - [x] Everything in this task lands in the **existing `@theme` block** in `styles/globals.css`.
        **Sizes, weights, leading, tracking only — zero new hex, zero new colour tokens, zero new `@utility`.**
  - [x] Add `--spacing: 4px;`. Tailwind v4 derives the whole scale as `calc(var(--spacing) * n)`, so this
        yields `1`=4px, `2`=8px, `3`=12px, `4`=16px, `6`=24px, `8`=32px — an exact match for DESIGN.md
        frontmatter `spacing:`, and it decouples spacing from the root font-size permanently.
  - [x] Add the DESIGN.md `typography:` scale as Tailwind v4 `--text-*` tokens with their
        `--line-height` / `--font-weight` / `--letter-spacing` companions: `display` 26/600/1.15,
        `display-sm` 22/600/1.15, `heading` 16/500/1.5, `subheading` 13.5/600/1.4, `label` 12/500/1.5/0.01em,
        `eyebrow` 11/500/1.4/0.1em, `body` 13.5/400/1.6, `body-sm` 12.5/400/1.5, `caption` 11.5/400/1.45,
        `num` 13/500.
  - [x] **Leave `html { font-size: 13.5px }` exactly as-is.** With spacing decoupled it is now purely a
        typographic anchor, which is what it was always meant to be.
  - [x] Run `pnpm test` immediately after this task alone, before touching any component. Any test that
        encodes a spacing pixel value will move here — fix those in this task so the diff attributes them
        to D-7.2-3 rather than to the shell rewrite.
  - [x] Nothing else may be added to `globals.css` in this story except the one
        `body[data-surface="popup"]` rule from Task 1.

- [x] **Task 1 — Popup surface sizing + the single scroll region (AC2)**
  - [x] Add `data-surface="popup"` to `<body>` in `entrypoints/popup/index.html`.
  - [x] Add ONE scoped rule to `styles/globals.css`:
        `body[data-surface="popup"] { width: 380px; height: 560px; margin: 0; overflow: hidden; }`.
        Scoped by attribute so the options page and the new full page are untouched. Do NOT size `html`
        or bare `body` globally.
  - [x] `entrypoints/popup/App.tsx` root becomes `flex h-full w-full flex-col overflow-hidden`.
  - [x] Three children: header `shrink-0`, scroll region `min-h-0 flex-1 overflow-y-auto overflow-x-hidden`,
        action bar `shrink-0`.
  - [x] Audit every descendant for a second scroll container: grep the popup subtree for
        `overflow-y-auto`, `overflow-auto`, `overflow-scroll`, `max-h-` + `overflow` pairs and remove them
        (`TicketPicker` is the likely offender). Nested scrolling is the defect this AC exists to prevent.

- [x] **Task 2 — Chrome header component (AC3, AC6)**
  - [x] New `components/shell/ChromeHeader.tsx`. Props keep it reusable by the full page in 7.7 but this
        story only needs the popup shape.
  - [x] Gradient field: `bg-chrome-gradient relative overflow-hidden shrink-0` with padding
        `pt-[14px] px-[16px] pb-[20px]` (DESIGN.md `components.chrome-header.padding-popup`).
  - [x] Concentric ring motif, absolutely positioned off the top-right, `aria-hidden="true"`, composed
        from `border-[1.5px] border-white/15` / `border-white/[.13]` circles + one 6 px `bg-white/50` dot.
        Exact geometry in Dev Notes. No new utility, no new hex.
  - [x] Eyebrow row: product name `Time Logger` in `font-chrome text-eyebrow uppercase text-white/70`
        plus a 22 px round avatar chip carrying the user's initial (`bg-white/[.18] border-white/25`).
  - [x] Date line: `format(new Date(), 'EEE, MMM d')` in `font-chrome text-display-sm text-white` (Kanit
        600 / 22 px / 1.15). Computed synchronously — never awaits storage or network.
  - [x] Progress figure + 4 px bar + progress note, wrapped in a single
        `<div role="status" aria-live="polite">`. Bar track `bg-white/20`, fill `bg-white`,
        `h-[4px] rounded-full`, `aria-hidden="true"` (the figure text carries the meaning).
  - [x] Progress note copy from EXPERIENCE.md > Reference strings: `"{n}h to go today"` mid-day,
        `"Target met — {target}h logged"` at/above target. Never "below target", never an imperative.
  - [x] While the total is still resolving, the figure/bar area renders `animate-skeleton` placeholders in
        the real layout shape — the header itself is already painted (AC6). Never a spinner.
  - [x] Disconnected: header renders eyebrow + date only, no figure, no bar, no live region.

- [x] **Task 3 — Today total data source (AC3, AC6)**
  - [x] New `hooks/useTodayTotal.ts`: composes the existing `useWeekWorklogs(currentWeekMonday())` and
        sums the seconds of worklogs whose `started` falls on today's **local** day.
  - [x] Returns `{ seconds, isPending, isError }`. On error/absent auth it returns `seconds: 0` with
        `isError` set — the header must never throw or blank.
  - [x] The shell adds an in-session delta: `displaySeconds = serverSeconds + sessionSeconds`, where
        `sessionSeconds` is the sum of entries logged in this popup session (`TodayView` already tracks
        exactly this list; lift the total up via an `onTotalChange` callback).
  - [x] **Double-count hazard — must be handled and tested:** do NOT invalidate or refetch
        `['week-worklogs', …]` after a successful log in this story. The popup `QueryClient` already sets
        `staleTime: 60_000` and `refetchOnWindowFocus: false`, so the server total stays fixed for the
        session and the delta is additive. If a later story adds invalidation, the delta must be dropped
        in the same change.
  - [x] Format the figure with `secondsToHours(...).toFixed(1)` (bare one-decimal, e.g. `2.5`, `0.0`).
        **Do NOT use `secondsToHoursDisplay`** — it emits `——` at zero, which DESIGN.md explicitly
        forbids ("Use `——` for an empty value; it reads as broken rendering").
  - [x] Target from the existing `targetHoursItem` (default 8); render as `/ {target}h`.

- [x] **Task 4 — Action bar (AC4)**
  - [x] New `components/shell/PopupActionBar.tsx`: `shrink-0 border-t border-border bg-surface`,
        `px-[12px] py-[9px]`, `flex items-center justify-between gap-2`.
  - [x] Left: the relocated `PtoQuickAction`. Right: the "Open week ↗" secondary button.
  - [x] Move `<PtoQuickAction />` out of `TodayView` and into the action bar (it is the only consumer, so
        move it rather than duplicating).
  - [x] In `components/today/PtoQuickAction.tsx`: change the trigger `Button` to `variant="ghost"` and
        rename `STRINGS.trigger` → `'Mark today as time off'` and `STRINGS.menuLabel` → `'Time off options'`.
        **Scope guard:** the remaining `PTO` strings inside that file (`notConfiguredPrefix`, `postError`,
        `defaultSummary`) belong to Story 7.6's rename sweep — leave them. Internal identifiers
        (`ptoSubtaskKeyItem`, `PtoQuickAction`, storage keys) stay as-is per EXPERIENCE.md Open Item 0.
  - [x] **Flip the popover placement:** the menu currently opens `absolute left-0 top-full`. In a bottom
        action bar that is clipped by the 560 px surface. Change to `bottom-full mb-1` so it opens upward.
        Keep Esc / click-outside / focus-first-item / focus-restore behaviour exactly as-is.
  - [x] Make sure the transient status lines PtoQuickAction renders (pending / error / not-configured
        helper text) cannot grow the action bar past its fixed height — render them absolutely positioned
        above the bar, or clamp the bar height. The action bar must stay fixed.
  - [x] "Open week ↗": secondary button (white, `border-border`, `text-primary`, `rounded-md`,
        `font-chrome text-label`) with a lucide `ArrowUpRight` at 13 px, `aria-hidden="true"`; the visible
        text "Open week" carries the meaning. Accessible name must state the new-tab behaviour
        (e.g. `aria-label="Open week review in a new tab"`).
  - [x] Action bar is NOT rendered in the disconnected state (AC4 scopes it to connected states).

- [x] **Task 5 — Full-page host shell (AC5, AC7)**
  - [x] New WXT unlisted page: `entrypoints/fullpage/index.html`, `entrypoints/fullpage/main.tsx`,
        `entrypoints/fullpage/App.tsx`. WXT compiles `entrypoints/<name>/index.html` → `<name>.html`;
        **no `wxt.config.ts` change is expected**. If WXT does require one, keep it minimal and additive
        and never revert the uncommitted Epic 6.3 CRX lines already in that file.
  - [x] `main.tsx` mirrors `entrypoints/popup/main.tsx`: `StrictMode` → `ErrorBoundary` →
        `QueryClientProvider` (same retry/`staleTime` options — extract the shared config only if it can
        be done without touching popup behaviour; duplicating it is acceptable and lower risk) → `App`.
        Import `@/styles/globals.css`.
  - [x] `App.tsx` routing: a `Section = 'week' | 'manager' | 'settings'` union in `useState`, seeded from
        `?section=` on the URL and written back with `history.replaceState` on change. **No router
        library** (architecture.md > View routing: "No router; discriminated-union view state").
  - [x] Section nav: plain buttons with `aria-current="page"` on the active one. Manager nav item renders
        only when `hasDirectReports()` resolves `true` (fail-closed to hidden). **Do not reuse
        `components/ui/tabs.tsx`** — it is being deleted in Task 6.
  - [x] Week section: `<WeekView weekOf={currentWeekMonday()} />` — unchanged, unrestyled.
  - [x] Manager section: `<ManagerView cycle={getCurrentCycleId(approvalCycle)} onSwitchToToday={() => setSection('week')} />`.
        There is no Today on the full page, so the defensive no-reports fallback lands on Week. Note in a
        comment that the prop name is now a misnomer inherited from the popup; **do not rename it here**
        (7.8 may).
  - [x] Settings section: a short panel with a single "Open settings" action calling
        `chrome.runtime.openOptionsPage()`. Explicitly commented as the Story 7.10 slot.
  - [x] Disconnected on the full page: reuse the same connect affordance shape the popup uses
        (`chrome.runtime.openOptionsPage()`); do not build a new first-run treatment.
  - [x] **Unstyled is fine here.** The full page gets its KKP chrome in 7.7. Give it a neutral container
        (`min-h-screen bg-background`, a max-width content column) and nothing more.

- [x] **Task 6 — Remove the tabs (AC1, AC5)**
  - [x] Rewrite `entrypoints/popup/App.tsx`: delete the `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`
        import and every use, delete `handleTabChange`, `activeTab`, the `managesReports` state and its
        effect, the persisted-view read/write (`getPopupView`/`setPopupView`), the stale-state guard, and
        the `WeekView` / `ManagerView` imports.
  - [x] **Delete `components/ui/tabs.tsx`.** Consumer audit performed at story creation:
        `entrypoints/popup/App.tsx` is its *only* importer in the entire repo. The AC says "removed — not
        fixed, removed"; deleting the primitive is what makes reintroduction a deliberate act. It is
        recoverable via `npx shadcn@latest add tabs` if ever needed.
  - [x] **Leave `@radix-ui/react-tabs` in `package.json`.** `package.json` carries uncommitted Epic 6.3
        work and is off-limits (see "Files you must NOT touch"). The dependency becomes unused and
        tree-shakes out of the bundle; dropping it is a follow-up once 6.3 lands.
  - [x] **Leave `lib/storage/view-state.ts` untouched.** `ISODate`, `CycleId`, `MarkDoneState`,
        `getMarkDoneState` and friends are used across the week grid and the badge. The `PopupView`
        `week` / `manager-matrix` variants simply stop being written; a stale persisted value is now
        ignored, which is harmless. Its own test suite must keep passing unmodified.
  - [x] The popup no longer needs `getCurrentCycleId`, `hasDirectReports`, `approvalCycleItem`,
        `currentWeekMonday` — those imports move to the full page.

- [x] **Task 7 — Trim `TodayView` to the scroll-region body (AC1, AC2, AC3, AC6)**
  - [x] Remove the `<h2>Today</h2>` heading and the `{today} · {total} / {target}h` line — both now live
        in the chrome header. Removing them is what prevents the date/figure appearing twice.
  - [x] Remove `<PtoQuickAction />` (moved to the action bar in Task 4).
  - [x] Remove `motion-safe:animate-fade-in` from the `TodayView` root — EXPERIENCE.md > Motion: "No
        entrance animation on popup open — the TTI budget is 400 ms warm and animation would spend it"
        (AC6).
  - [x] Add an `onTotalChange?: (seconds: number) => void` prop so the shell can add the session delta
        (Task 3). Keep it optional so the component stays independently testable.
  - [x] Everything else in `TodayView` (`TicketPicker`, `QuickLogForm`, `LoggedToday`, the synced-outbox
        notice, the catch-all-unconfigured notice) **stays** — 7.3/7.4/7.5 replace it.

- [x] **Task 8 — TTI / paint order (AC6)**
  - [x] The current shell returns a bare "Loading…" div until `getAuth()` resolves, so nothing paints
        before data. Restructure: the chrome header (eyebrow, date, motif) renders **synchronously on
        first paint, unconditionally**; only the scroll-region body and the action bar branch on auth
        state.
  - [x] Do not add any entrance animation to the popup root, the header, or the action bar.
        `animate-skeleton` on placeholders is allowed (it does not gate interactivity) and is already
        `prefers-reduced-motion`-guarded by the global rule in `styles/globals.css`.
  - [x] No new blocking `await` on the popup's first render path.

- [x] **Task 9 — Tests (AC1–AC8)**
  - [x] Rewrite `entrypoints/popup/App.test.tsx` (see "Testing standards" for the required cases).
  - [x] New `entrypoints/popup/App.a11y.test.tsx` — axe gate on the popup shell. **Note:** this file does
        NOT exist today; `entrypoints/options/App.a11y.test.tsx` is the only entrypoint-level axe suite
        and is the template to copy.
  - [x] New `components/shell/ChromeHeader.test.tsx`, `components/shell/PopupActionBar.test.tsx`,
        `entrypoints/fullpage/App.test.tsx`, `hooks/useTodayTotal.test.tsx`, `lib/open-full-page.test.ts`.
  - [x] Update `components/today/TodayView.test.tsx` (heading / date-total / PtoQuickAction assertions at
        lines ~119–128, ~278–280, ~283–304 no longer apply) and
        `components/today/PtoQuickAction.test.tsx` (trigger label at lines ~67, 75, 86, 97, 128, 152, 166, 184).
  - [x] `pnpm compile`, `pnpm lint`, `pnpm test`, `pnpm build` all green against the recorded baseline.

## Dev Notes

### Scope boundary — read this before writing any CSS

| Concern | Owner |
|---|---|
| Popup frame, one scroll region, chrome header, action bar | **7.2 (this story)** |
| Full-page entrypoint + section routing + "Open week ↗" | **7.2 (this story, D-7.2-1)** |
| Resume card, hour input, `+0.5/+1/+2`, `CornerDownLeft` badge | 7.3 |
| Search field, `/` shortcut, results replacing the lists | 7.4 |
| Logged today / Recently worked / "51 more · Search to find them →" | 7.5 |
| Day-status icon vocabulary + the full "time off" rename sweep | 7.6 |
| Full-page chrome header, week grid, cell anatomy, totals row, gap dialog | 7.7 |
| Matrix restyle (silent correctness, loud exceptions) | 7.8 |
| Loading / offline / error / time-off / disconnected state treatments | 7.9 |
| Settings on the full page | 7.10 (out of scope for this run) |

The scroll region in 7.2 renders the *existing, unrestyled* `TodayView` body. It will look
half-transitional. That is correct and intended.

### The single-scroll-region contract (AC2) — how to guarantee it

```
body[data-surface="popup"]        380 × 560, overflow hidden, margin 0
└── #root  →  App root            flex h-full w-full flex-col overflow-hidden
    ├── ChromeHeader              shrink-0                       ← fixed
    ├── main                      min-h-0 flex-1 overflow-y-auto overflow-x-hidden
    │                                                            ← THE one scroll region
    └── PopupActionBar            shrink-0                       ← fixed
```

`min-h-0` on the scroll region is load-bearing: without it a flex child refuses to shrink below its
content and the *body* scrolls instead, producing exactly the "two tabs in one endless scroll" defect
this AC removes. The scroll region needs the horizontal gutter (`px-[14px] pb-[14px]`,
`spacing.popup-gutter` = 14 px) — the chrome header owns its own 16 px gutter.

Then **prove no nested scroll region exists**: sweep the popup subtree for `overflow-y-auto` /
`overflow-auto` / `overflow-scroll` / `max-h-*` used as a scroll clamp and remove each one. A test asserts
this structurally (see Testing standards).

### Chrome header anatomy — exact values

Source: DESIGN.md `components.chrome-header` + the reference mockup's popup frame
(`imports/jira-time-logger.dc.html` lines 53–95). Where they conflict, DESIGN.md wins; here they agree.

- Field: `bg-chrome-gradient` (already a 7.1 utility → `linear-gradient(165deg,#615B99 0%,#594F74 42%,#4A4163 100%)`),
  `position: relative`, `overflow: hidden`, padding `14px 16px 20px`.
- Ring motif — three absolutely positioned, `aria-hidden="true"`, decoration only:
  - circle A: `right:-46px; top:-58px; 170×170; border 1.5px rgba(255,255,255,.15); rounded-full`
  - circle B: `right:-14px; top:-26px; 104×104; border 1.5px rgba(255,255,255,.13); rounded-full`
  - dot:      `right:36px; top:8px; 6×6; background rgba(255,255,255,.5); rounded-full`
  Express as `border-white/15`, `border-white/[.13]`, `bg-white/50` — Tailwind opacity modifiers on
  `white`, so **no new hex enters the codebase**. Every child of the header that carries content needs
  `relative` so it stacks above the motif.
- Eyebrow row: `flex items-center justify-between`. Left: `Time Logger` — Kanit 500, 11 px,
  `letter-spacing .1em`, uppercase, `text-white/70`. Right: 22 px avatar chip, `rounded-full`,
  `bg-white/[.18]`, `border border-white/25`, Kanit 500 11 px white, containing the user's first initial.
  Resolve the initial from the connected account (`getAuth()` → email/display name); render the chip
  empty-but-present while it resolves so the header never reflows. The chip is decoration + identity, not
  a control — no click handler in this story.
- Date: `mt-[12px]`, Kanit 600, **22 px**, `line-height 1.15`, white. `format(new Date(), 'EEE, MMM d')`
  — `date-fns` is already a dependency and `TodayView` already used this exact format string.
- Optional sub-line under the date (Kanit 400, 12 px, `text-white/70`) carrying the week note — the
  mockup has it; it is not required by AC3. Include it only if you can source the string honestly.
- Figure: baseline-aligned row, `font-chrome tabular` — logged value at 26 px Kanit 600 white, then
  `/ {target}h` at 14 px Kanit 400 `text-white/70`.
- Bar: `mt-[12px] h-[4px] rounded-full bg-white/20 overflow-hidden`, fill `h-full rounded-full bg-white`
  with `width: {pct}%` clamped to `0–100`.
- Progress note: `mt-[7px]`, Kanit 500, 11.5 px, `text-white/85`.

**Live region (AC3):** one wrapper around figure + bar + note:

```tsx
<div role="status" aria-live="polite" className="relative">
  {/* figure, bar (aria-hidden), note */}
</div>
```

The date and eyebrow stay **outside** the live region — they do not change, and announcing them on every
update is noise. The bar is `aria-hidden="true"`: DESIGN.md's rule is that meaning is carried by text, and
"2.5 / 8h · 5.5h to go today" already says everything the bar says. Do not add a second
`role="progressbar"` name inside a `role="status"` — it double-announces.

### D-7.2-3 — Story 7.1 token amendment: the spacing scale and the type scale (Task 0)

**This is an explicitly-labelled amendment to Story 7.1, not new 7.2 design.** Two things DESIGN.md
specifies that 7.1 did not emit. Both verified against `styles/globals.css` at the baseline commit.

**1. The spacing scale is silently 0.84× too small.** `styles/globals.css:189–191` sets
`html { font-size: 13.5px }`, and the `@theme` block declares **zero** `--spacing*` tokens. Tailwind v4
(`^4.3.0`) therefore falls back to its default `--spacing: 0.25rem`, which against a 13.5 px root makes
**`p-4` = 13.5 px** where DESIGN.md frontmatter `spacing:` explicitly says `'4': 16px`. Every spacing
utility in the product is off by a factor of 0.84.

The fix is one line — `--spacing: 4px;` in `@theme`. Tailwind v4 derives the whole scale as
`calc(var(--spacing) * n)`, so `1`=4px … `8`=32px lands exactly on DESIGN.md's frontmatter and spacing is
permanently decoupled from the root font-size. This is strictly better than having 7.2–7.9 each paper
over the discrepancy with px arbitrary values.

**Expect existing surfaces to shift, and do not report it as a 7.2 regression.** Task 0 *restores*
spacing to its correct absolute values across the already-shipped Epic 1–6 surfaces — 7.1 had silently
shrunk them. Run Task 0 in isolation and run `pnpm test` before touching any component, so the diff and
any test updates attribute cleanly to D-7.2-3. Any test that encodes a spacing pixel value may need
updating; that is expected.

**2. The type scale was never emitted.** 7.1 shipped the font *families*
(`--font-chrome` / `--font-data` / `--font-num`) but no `--text-*` token exists in the file, while
DESIGN.md frontmatter `typography:` specifies a full scale. This story needs `text-display-sm` (the 22 px
date) and `text-eyebrow` directly; 7.3–7.9 need the rest. Tailwind v4 form:

```css
--text-display: 26px;
--text-display--line-height: 1.15;
--text-display--font-weight: 600;
--text-display-sm: 22px;
--text-display-sm--line-height: 1.15;
--text-display-sm--font-weight: 600;
/* … heading, subheading, label, eyebrow (+ --letter-spacing: 0.1em), body, body-sm, caption, num */
```

`--text-*` sets size/leading/weight/tracking only — the family still comes from `font-chrome` /
`font-data`. **No colour, no hex, no new `@utility`.** If you find yourself wanting anything else in
`globals.css`, stop and escalate.

### Which dimensions use the scale, and which use px arbitrary values

**After Task 0 the standard Tailwind spacing utilities are correct — use them normally** (`p-4` = 16 px,
`gap-2` = 8 px, `mt-3` = 12 px, and the 14 px `spacing.popup-gutter` as `px-[14px]` since 14 is not on the
4-step scale).

Keep explicit px arbitrary values for **typography and component dimensions** that DESIGN.md states in px
and that are not multiples of 4: the 4 px progress bar, the 34 px hour input / 36 px search field, the
380×560 frame, the `14px 16px 20px` header padding, the 22 px avatar chip, the 11–13 px icon sizes. Do
not "round" any of these onto the spacing scale.

### D-7.2-2 — Today total: data source and the double-count hazard (Task 3)

There is no today-scoped worklog fetch today. `TodayView`'s `loggedEntries` starts `[]` and only ever holds
worklogs posted in the current popup session, so a naive header would read `0.0 / 8h` even when 5 h were
logged this morning. AC3 (a real figure) and AC6 ("the chrome header paints **before data resolves**")
together require a real, asynchronously-resolved total.

Compose over what exists — `hooks/useWeekWorklogs.ts` already fetches the current user's week worklogs via
`fetchCurrentUserWeekWorklogsByIssue(currentCycleRange('weekly'))`, keyed `['week-worklogs', weekOf]` with
`staleTime: 60_000`. `hooks/useTodayTotal.ts` filters that result to today's local day and sums
`timeSpentSeconds`. Bucket by **local** day the same way `lib/week-grid.ts` does (`startOfLocalDay` on
`new Date(started)`), not by UTC or by `started.slice(0,10)` — the popup renders in local time and
`lib/worklog-date.ts` anchors worklogs at 09:00 local.

Session delta: `display = serverSeconds + sessionSeconds`. The double-count risk is real — if the week
query ever refetches mid-session it will already contain the session's writes and the delta would count
them twice. Guarded by three facts that must all stay true within this story: `staleTime: 60_000`,
`refetchOnWindowFocus: false` (both already set in `entrypoints/popup/main.tsx`), and **7.2 adds no
`invalidateQueries(['week-worklogs'])`**. Write a test that pins the additive behaviour and a comment that
names the hazard, so whoever adds invalidation later is forced to remove the delta in the same change.

Failure/absent-auth path: the hook returns `seconds: 0, isError: true`. The header then shows the figure
with the server contribution at zero rather than blanking — it must never throw into the `ErrorBoundary`.
The richer offline/error treatments are 7.9.

### "Open week ↗" and the full-page URL

New `lib/open-full-page.ts`:

```ts
export type FullPageSection = 'week' | 'manager' | 'settings';
export function openFullPage(section: FullPageSection): void { /* chrome.tabs.create({ url: chrome.runtime.getURL(`fullpage.html?section=${section}`) }) */ }
```

- `chrome.tabs.create` needs **no new permission** and no `web_accessible_resources` entry — an extension
  may always open its own pages in a tab. Do not add a `tabs` permission to `wxt.config.ts`.
- One helper so the popup, and any later caller, share a single URL construction; it is also the only
  thing that needs a `chrome` mock in tests.
- WXT compiles `entrypoints/fullpage/index.html` → `fullpage.html` at the extension root (this is WXT's
  "unlisted page" convention; the popup and options pages get their manifest entries from the
  `<meta name="manifest.*">` tags in their own HTML, which an unlisted page deliberately omits). Verify
  the file lands in `output/chrome-mv3/fullpage.html` after `pnpm build` — that check is part of AC8.

### AC5, precisely: what "no orphaned manager affordance" means here — settled, do not relitigate

The popup gets **no manager button at all.** This is not a judgment call; the spec settles it.
**EXPERIENCE.md lines 55–63** enumerate the popup as exactly six things — chrome header, resume card,
search, logged today, recently worked, action bar — with no manager affordance among them, and place the
matrix under "Full page (tab)". AC4 independently fixes the action bar at exactly two actions (ghost
time-off + secondary "Open week ↗"), so there is no third slot either.

The manager's path is: popup → "Open week ↗" → full page → **Manager** in the section nav. That path must
genuinely close, which is why AC7 requires the Manager nav item to appear whenever `hasDirectReports()` is
`true`. Reproduce the removed tab's exact semantics:
hidden while resolving, hidden when false, hidden on error (`hasDirectReports` fails closed) — **never
rendered disabled** (UX-DR18).

### Icons (epic-wide constraint)

`lucide-react` only — already a dependency and declared as the icon library in `components.json`. This
story needs at most one: `ArrowUpRight` for "Open week ↗" (DESIGN.md `icons.open-external`). Render inline
at 11–13 px with `aria-hidden="true"`; the adjacent text carries the meaning. Do not render the literal
`↗` character — DESIGN.md > Don't: "Ship a status as a bare text glyph". The AC's `"Open week ↗"` names the
affordance, not the character to type.

### Accessibility floor (must not regress)

- Focus order follows visual order: chrome header (no controls) → scroll region → action bar.
- Visible focus everywhere: `ring-focus` + a 1.5 px `primary` border. Never `outline: none` without a
  replacement.
- `role="status" aria-live="polite"` on the progress figure/bar wrapper (AC3). No `aria-live` on the
  action bar.
- Every icon `aria-hidden="true"`; every icon-only control keeps an `aria-label`.
- The full page's section nav uses real buttons + `aria-current="page"`; do not hand-roll `role="tablist"`
  (that would smuggle the tab pattern back in through the side door).
- Keep the axe gate at **zero Critical/Serious** on the popup, the new full page, the options page, and
  the banner. `lib/test/axe.ts` (`scan`, `criticalOrSerious`, `color-contrast` disabled — jsdom cannot
  paint) is the shared harness; `entrypoints/options/App.a11y.test.tsx` is the working template.
- Contrast is verified manually, not by axe: white on the chrome gradient clears AA at every stop
  (DESIGN.md); `text-white/70` on the gradient is the marginal case — keep the eyebrow at `/70` or above
  and do not lighten it.

### Files to CREATE

- `components/shell/ChromeHeader.tsx`
- `components/shell/PopupActionBar.tsx`
- `hooks/useTodayTotal.ts`
- `lib/open-full-page.ts`
- `entrypoints/fullpage/index.html`
- `entrypoints/fullpage/main.tsx`
- `entrypoints/fullpage/App.tsx`
- Test files listed under "Testing standards"

### Files to TOUCH

- `entrypoints/popup/App.tsx` — full rewrite of the shell
- `entrypoints/popup/index.html` — add `data-surface="popup"` to `<body>`
- `components/today/TodayView.tsx` — trim (Task 7)
- `components/today/PtoQuickAction.tsx` — ghost variant, upward popover, two string renames
- `styles/globals.css` — Task 0's `--spacing: 4px` + the `--text-*` scale, plus the one
  `body[data-surface="popup"]` rule. Nothing else.

### Files to DELETE

- `components/ui/tabs.tsx` — zero remaining importers after the popup rewrite (audited at story creation)

### Files you must NOT touch (Epic 6.3 in-flight, uncommitted)

`scripts/pack-crx.mjs`, `scripts/derive-ext-key.mjs`, `scripts/lib/`, `package.json`, `docs/release.md`,
and the CRX-related content of `wxt.config.ts`. **No `git add -A`, ever.** If `wxt.config.ts` genuinely
needs an entrypoint line, add exactly that line and leave every other line — including the uncommitted
ones — byte-identical.

Also do not touch in this story: `components/week/*`, `components/manager/*`, `lib/storage/view-state.ts`,
`entrypoints/options/*`, `entrypoints/content.ts`, `entrypoints/background.ts`, `lib/badge.ts`.

### Anti-patterns to avoid

- Rebuilding the tab bar as a segmented control, a `role="tablist"`, or a `<select>`. The tabs are gone.
- Keeping `components/ui/tabs.tsx` "just in case" — the AC says removed, not deprecated.
- Any `overflow-y-auto` inside the popup's scroll region. One scroll region, whole surface.
- Restyling `WeekView` / `WeeklyGrid` / `ManagerView` / `ManagerMatrix` "while you're in there". 7.7/7.8.
- Adding a colour, a hex, or a `@utility` to `globals.css`. Only Task 0's `--spacing` + `--text-*` tokens
  and the one `body[data-surface="popup"]` rule.
- Changing `html { font-size: 13.5px }`, or "fixing" the spacing anywhere except Task 0's single
  `--spacing` token.
- Papering over the 0.84× spacing discrepancy with px arbitrary values on spacing utilities — Task 0
  fixes it at the token layer precisely so nobody has to.
- Rendering `——` for a zero total (`secondsToHoursDisplay`) — DESIGN.md forbids it.
- An entrance animation on popup mount (AC6 / EXPERIENCE.md > Motion).
- Red anywhere. Below target is *unfinished*, not wrong; red is reserved for a write Jira refused.
- A `tabs` permission, a `web_accessible_resources` entry, or a router library for the full page.
- Renaming internal `pto` identifiers or storage keys (EXPERIENCE.md Open Item 0).

### Test baseline (pre-existing — do NOT mislabel as a regression)

Verified on the baseline commit `36b5602`:

- `pnpm compile` — clean.
- `pnpm test` — **76 test files, 961 passed, 1 skipped (962 total)**.
- `pnpm test` **exits non-zero at baseline.** One unhandled rejection escapes
  `components/manager/ManagerView.test.tsx`: `TypeError: Cannot read properties of undefined (reading
  'runtime')` inside `@wxt-dev/storage`'s `getStorageArea` — a fake-browser teardown race, not a product
  bug. **That is the baseline.** A *new* failing test, or a drop in the passing count, is a real
  regression; this specific unhandled rejection is not.

Your file/test counts will rise (new suites) and the popup/TodayView/PtoQuickAction suites will change
shape. State the new numbers explicitly in Completion Notes and account for each delta.

**Two expected, non-regression deltas to call out separately in Completion Notes:**
1. Any test that encodes a spacing pixel value moves because of Task 0 / D-7.2-3 (the 0.84× correction).
   Fix those inside Task 0 so they are attributable.
2. The `TodayView` and `PtoQuickAction` suites change shape because content moved into the chrome header
   and the action bar (Tasks 4 and 7), not because behaviour broke.

### Testing standards

`vitest` + `jsdom` + `@testing-library/react`, `globals: true`, `vitest.setup.ts` registers jest-dom and
the `vitest-axe` matchers globally. Tests colocate with their source. Mock the storage/network boundary
(`vi.mock` on `@/lib/storage/*`, `@/lib/jira-client`, `@/lib/manager-resolution`) and render the real
component — `entrypoints/popup/App.test.tsx` and `entrypoints/options/App.a11y.test.tsx` are the working
patterns to copy.

Required coverage:

- **`entrypoints/popup/App.test.tsx` (rewrite)** — AC1: no tab list, no `TabsTrigger`, `WeekView` and
  `ManagerView` are never rendered (assert their test IDs are absent even when `hasDirectReports()` is
  `true`). AC2: the root is a column flex with exactly one element carrying `overflow-y-auto` (query the
  container and assert the count is 1 — this is the structural guarantee against nested scrolling). AC3:
  the header renders the date and a `role="status"` region. AC4: both action-bar actions render; clicking
  "Open week" calls `chrome.tabs.create` with a `fullpage.html?section=week` URL. AC5: no element with an
  accessible name matching `/manager|matrix/i` exists in the popup with reports present. AC6: the date
  renders on the *first* render pass, before the auth/total promises settle (assert synchronously after
  `render()`, without `await`).
- **`entrypoints/popup/App.a11y.test.tsx` (new)** — axe scan, connected and disconnected, zero
  Critical/Serious.
- **`components/shell/ChromeHeader.test.tsx`** — live-region wiring (`role="status"`, `aria-live="polite"`
  wrapping figure + bar); the bar is `aria-hidden`; the motif is `aria-hidden`; figure formats `0` seconds
  as `0.0` and never `——`; progress note copy switches to "Target met" at/above target; skeleton renders
  while pending; disconnected renders no figure and no live region.
- **`components/shell/PopupActionBar.test.tsx`** — both actions present; "Mark today as time off" is the
  ghost variant; the time-off popover opens **upward** and is reachable by keyboard with Esc/focus-restore
  intact; "Open week" has an accessible name naming the new tab.
- **`hooks/useTodayTotal.test.tsx`** — sums only today's local-day worklogs from a week fixture that spans
  a week boundary; returns 0 + `isError` on a failed query; **the additive session delta does not
  double-count** (log an entry, assert the total moves by exactly that amount and the query is not
  refetched).
- **`lib/open-full-page.test.ts`** — builds the right URL per section; calls `chrome.tabs.create` once.
- **`entrypoints/fullpage/App.test.tsx`** — defaults to Week; `?section=manager` selects Manager; the
  Manager nav item is absent while `hasDirectReports()` is pending, absent when `false`, absent when it
  rejects, present when `true`; `WeekView`/`ManagerView` are mounted (mock them, as the current popup test
  does) with the expected props; the Settings section's action calls `chrome.runtime.openOptionsPage`;
  plus an axe scan at zero Critical/Serious.
- **`components/today/TodayView.test.tsx` (update)** — drop the heading / `/ 8h` / "Mark today as PTO"
  assertions; add one asserting `onTotalChange` fires with the summed seconds after a log.
- **`components/today/PtoQuickAction.test.tsx` (update)** — retarget every `'Mark today as PTO'` lookup to
  `'Mark today as time off'`; keep every behavioural assertion (double-post guard, outbox fallback,
  Esc/click-outside, focus restore) unchanged.

### Project Structure Notes

- `components/shell/` is a new directory. It exists because `ChromeHeader` is shared with the full page in
  7.7; `PopupActionBar` is popup-only but belongs beside it.
- `hooks/` and `lib/` already exist with the naming conventions used here; ESLint enforces named exports
  only (no default exports), no `any`, `camelCase`/`PascalCase` naming, and alphabetised `import/order`
  with no blank lines between groups.
- Architecture rule: "All Tailwind classes; no inline styles in popup/options (only allowed in the
  content-script banner due to CSP)". The `data-surface` attribute + one scoped CSS rule respects this —
  do not reach for a `<style>` block or a `style={{}}` prop in the React tree.
- `output/` (not `.output/`) is this project's WXT `outDir`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.2 (lines 1719–1755)] — AC1–AC6 verbatim.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7 (lines 1673–1682)] — epic framing + the standing
  WCAG-2.1-AA and `lucide-react`-only constraints.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.7 (lines 1906–1944)] — the full-page AC that
  7.2 pulls forward (D-7.2-1), and everything 7.2 must NOT build.
- [Source: styles/globals.css @36b5602 (`@theme` block; `html` rule at line 191)] — verified at story
  creation: **zero** `--spacing*` tokens and **zero** `--text-*` tokens; `html { font-size: 13.5px }`.
  With `tailwindcss@^4.3.0` the default `--spacing: 0.25rem` therefore resolves to 3.375 px/step (0.84×).
  Basis for D-7.2-3 / Task 0.
- [Source: .../ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md frontmatter] — `colors`, `typography`,
  `rounded`, `spacing` (`popup-gutter: 14px`), `components.chrome-header` (gradient, `padding-popup:
  14px 16px 20px`, motif), `components.button-secondary` / `button-ghost`, `components.progress-bar`
  (4 px chrome / white fill / `rgba(255,255,255,.2)` track), `icons.open-external: ArrowUpRight`,
  `icons.defaults` (13 px, `aria-hidden`), `elevation`.
- [Source: .../DESIGN.md > Layout & Spacing] — "The popup is 380 × 560 with exactly one scroll region…
  There are no nested scroll regions anywhere in the product."
- [Source: .../DESIGN.md > Components > Chrome header] — eyebrow + surface title + headline figure +
  4 px bar + 22 px avatar; "The motif is chrome-only and never appears under data."
- [Source: .../DESIGN.md > Do's and Don'ts] — no `——` for empty; no bare text glyph; no red except a
  failed write; one scroll region per surface.
- [Source: .../EXPERIENCE.md > Information Architecture (lines 55–63)] — the popup is exactly six things
  (chrome header / resume card / search / logged today / recently worked / action bar) with **no manager
  affordance**; the matrix and Settings are listed under "Full page (tab)". This settles AC5 and mandates
  the Settings nav item.
- [Source: .../EXPERIENCE.md > Voice and Tone] — "Time off", never "PTO"; "5.5h to go today";
  "Target met — 8h logged"; strings never contain their icon.
- [Source: .../EXPERIENCE.md > Interaction Primitives > Motion] — "No entrance animation on popup open —
  the TTI budget is 400 ms warm and animation would spend it."
- [Source: .../EXPERIENCE.md > Accessibility Floor] — live regions, decorative icons, visible focus,
  contrast floors.
- [Source: .../EXPERIENCE.md > Open Items #0] — "Time off" is a copy change, not a code rename.
- [Source: .../imports/jira-time-logger.dc.html (lines 53–95, 320–327)] — reference-only: exact motif
  geometry, header figure sizes, and the action-bar composition. DESIGN.md/EXPERIENCE.md win on conflict.
- [Source: _bmad-output/planning-artifacts/architecture.md (line 42)] — NFR1: popup TTI ≤ 400 ms warm /
  800 ms cold; forces pre-warming and deferred-render patterns.
- [Source: _bmad-output/planning-artifacts/architecture.md (lines 303–320)] — "No router; discriminated-union
  view state"; "All Tailwind classes; no inline styles in popup/options".
- [Source: entrypoints/popup/App.tsx @36b5602] — the `Tabs` + `forceMount` shell being removed; the
  `hasDirectReports` fail-closed pattern to reproduce on the full page.
- [Source: entrypoints/popup/main.tsx @36b5602] — `QueryClient` options (`staleTime: 60_000`,
  `refetchOnWindowFocus: false`) that the session-delta guard depends on; the provider stack to mirror on
  the full page.
- [Source: components/today/TodayView.tsx @36b5602] — the heading/date/total block and the
  `PtoQuickAction` mount that move out; `loggedEntries` is session-only.
- [Source: components/today/PtoQuickAction.tsx @36b5602] — `STRINGS.trigger`, `STRINGS.menuLabel`, the
  `absolute left-0 top-full` popover to flip, the `variant="primary"` trigger to make ghost.
- [Source: hooks/useWeekWorklogs.ts + lib/jira-client.ts#fetchCurrentUserWeekWorklogsByIssue] — the
  existing week-worklog seam `useTodayTotal` composes over.
- [Source: lib/week-grid.ts#startOfLocalDay] — the local-day bucketing convention to reuse.
- [Source: lib/hours.ts] — `secondsToHours`; `secondsToHoursDisplay` returns `——` at zero (do not use for
  the chrome figure).
- [Source: lib/test/axe.ts + entrypoints/options/App.a11y.test.tsx] — the axe gate harness and its
  working template (the popup has no a11y suite yet).
- [Source: components/ui/tabs.tsx @36b5602] — the primitive being deleted; sole importer is the popup App.
- [Source: docs/a11y-audit-2026-06-27.md, docs/a11y-deviations.md] — the release gate that must still pass.
- [Source: _bmad-output/implementation-artifacts/epic-7-decision-log.md] — SD-1…SD-5 (scope, build order,
  checkpoint cadence, decision handling, working-tree hygiene) and the recorded test baseline.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `pnpm test` after Task 0 alone (token-layer amendment, before touching any component): **76 test files,
  961 passed, 1 skipped (962 total)** — identical to the recorded baseline. Zero tests encoded a spacing
  pixel value that broke, so no test updates were attributable to D-7.2-3.
- `pnpm compile` — clean throughout (zero TS errors at every checkpoint).
- `pnpm lint` — 0 errors. Pre-existing `import/order` warnings in files this story did not reorder imports
  in (`PtoQuickAction.tsx`, `TicketPicker.tsx`, `LoggedToday.tsx`, `QuickLogForm.tsx`, and their test files,
  plus `entrypoints/popup/main.tsx`) are unchanged from baseline and were left as-is (out of scope). New/
  touched files with import-order warnings introduced by this story (`TodayView.tsx`,
  `components/shell/PopupActionBar.tsx`, `entrypoints/popup/App.tsx`, `entrypoints/fullpage/App.tsx`) were
  fixed; `entrypoints/fullpage/main.tsx`'s one warning mirrors the identical pre-existing pattern in
  `entrypoints/popup/main.tsx` (CSS side-effect import before the sibling `./App` import) and was left
  consistent with that precedent.
- Final `pnpm test`: **82 test files passed, 988 passed, 1 skipped (989 total)**. Same single pre-existing
  unhandled rejection from `components/manager/ManagerView.test.tsx` (`@wxt-dev/storage` fake-browser
  teardown race) causes the non-zero exit — not a new failure, not chased, per Dev Notes > "Test baseline".
- `pnpm build` — succeeded; `output/chrome-mv3/fullpage.html` emitted (663 B) alongside `popup.html` and
  `options.html`; `output/chrome-mv3/manifest.json` carries no new entry for it (confirms the WXT
  unlisted-page convention needed zero `wxt.config.ts` edit, as the story predicted). `wxt.config.ts` was
  not touched.

### Completion Notes List

- **Task 0 (D-7.2-3) run and tested in isolation, as instructed.** Added `--spacing: 4px` and the full
  `--text-*` scale (display/display-sm/heading/subheading/label/eyebrow/body/body-sm/caption/num, each with
  their line-height/font-weight/letter-spacing companions) to the existing `@theme` block in
  `styles/globals.css`. `html { font-size: 13.5px }` left untouched. `pnpm test` immediately after this task
  alone reproduced the exact baseline (76/961/1 skipped) — **zero tests needed updating**, so there is no
  spacing-pixel-value test delta to call out separately as D-7.2-3 fallout; the spacing-scale correction is
  a pure token-layer fix that happened not to be pinned by any existing pixel-literal assertion.
- **Task 1 (AC2):** `data-surface="popup"` added to `<body>` in `entrypoints/popup/index.html` (plus
  `class="h-full w-full"` on the `#root` mount div — required so the App root's `h-full` has a definite
  parent height to resolve against; a plain HTML/Tailwind-class change, not a new `globals.css` rule, so it
  does not count against Task 0's "nothing else may be added to globals.css" constraint). One scoped rule
  added to `globals.css`: `body[data-surface="popup"] { width: 380px; height: 560px; margin: 0; overflow:
  hidden; }`. `entrypoints/popup/App.tsx` root is `flex h-full w-full flex-col overflow-hidden` with exactly
  three children (header `shrink-0`, `<main>` `min-h-0 flex-1 overflow-y-auto overflow-x-hidden`, action bar
  `shrink-0`). Audited the popup subtree for a second scroll region: found and removed
  `max-h-64 overflow-y-auto` from `TicketPicker.tsx`'s tree container (the predicted offender) — no other
  `overflow-y-auto`/`overflow-auto`/`overflow-scroll` remains in the popup's component tree (confirmed by
  a repo-wide grep; the only other hit, `components/manager/DrillDownPanel.tsx`, is now full-page-only
  since the popup no longer mounts `ManagerView` at all).
- **Task 2 (AC3, AC6):** New `components/shell/ChromeHeader.tsx`. Ring motif expressed as three
  `aria-hidden="true"` absolutely-positioned circles/dot using `border-white/15`, `border-white/[.13]`,
  `bg-white/50` (no new hex). Progress figure/bar/note wrapped in one `role="status" aria-live="polite"`
  div; the bar itself is `aria-hidden="true"`; the date/eyebrow live outside the live region. Figure formats
  via `secondsToHours(...).toFixed(1)` (never `secondsToHoursDisplay`, so `0.0` renders instead of `——`).
  Skeleton placeholders (`animate-skeleton`) render in the figure/bar/note's real layout shape while
  pending; disconnected renders eyebrow + date only. The progress-bar fill width is a computed percentage,
  which Tailwind cannot express as a literal static class — solved by quantizing to the nearest 5% and
  indexing into a fixed array of 21 literal `w-[N%]` classes written directly in source (satisfies
  "all Tailwind classes; no inline styles in popup/options" without an inline `style` attribute).
- **Task 3 (AC3, AC6):** New `hooks/useTodayTotal.ts` composes `useWeekWorklogs(currentWeekMonday())` and
  buckets by local day via the same `startOfLocalDay` convention as `lib/week-grid.ts`. Signature is
  `useTodayTotal(sessionSeconds = 0)`: it adds the caller-supplied in-session delta to the server-fetched
  total itself (rather than the shell doing the addition externally), which is what makes the "does not
  double-count" behaviour directly pinnable in the hook's own test — the popup shell (`entrypoints/popup/
  App.tsx`) supplies `sessionSeconds` as the sum of two independently-tracked contributions (see next bullet).
  No `invalidateQueries(['week-worklogs', …])` is called anywhere in this story; the hazard is documented in
  a code comment in the hook.
- **Task 4 (AC4):** New `components/shell/PopupActionBar.tsx`. `PtoQuickAction` relocated out of `TodayView`
  into the action bar (its sole consumer). In `PtoQuickAction.tsx`: both trigger `Button`s (enabled and
  disabled states) changed to `variant="ghost"`; `STRINGS.trigger` → `'Mark today as time off'`;
  `STRINGS.menuLabel` → `'Time off options'`; `notConfiguredPrefix`/`postError`/`defaultSummary` and all
  internal identifiers left untouched per the scope guard. Popover flipped from `absolute left-0 top-full`
  to `absolute left-0 bottom-full mb-1` (opens upward); the always-visible "not configured" helper text is
  now `absolute bottom-full` too, so neither it nor the popover can grow the action bar's fixed height.
  Esc/click-outside/focus-first-item/focus-restore behaviour is untouched. "Open week" is a secondary button
  with an inline `ArrowUpRight` (13px, `aria-hidden`) and `aria-label="Open week review in a new tab"`,
  calling `openFullPage('week')`. The action bar is only rendered by the popup shell when connected.
- **Task 5 (AC5, AC7):** New unlisted WXT page `entrypoints/fullpage/{index.html,main.tsx,App.tsx}`.
  `main.tsx` duplicates the popup's `QueryClient` options verbatim (per the story's explicit
  lower-risk-than-extraction guidance). `App.tsx` holds `Section = 'week' | 'manager' | 'settings'` in
  `useState`, seeded from `?section=` and written back via `history.replaceState` — no router library. The
  Manager nav button (real `<button aria-current="page">`, not `role="tablist"`) renders only when
  `hasDirectReports()` resolves `true`, fails closed to hidden on `false`/rejection/pending, mirroring the
  removed popup tab's exact semantics (never rendered disabled, UX-DR18). A defensive effect flips back to
  Week if a stale `?section=manager` URL is loaded and reports later resolve false. `WeekView` and
  `ManagerView` are mounted completely unchanged (only `weekOf`/`cycle`/`onSwitchToToday` props wired);
  `onSwitchToToday` is wired to `() => setSection('week')` with the prop kept as-is (commented as a
  popup-inherited misnomer, per the story's explicit instruction not to rename it here). Settings section is
  a thin placeholder with one "Open settings" button calling `chrome.runtime.openOptionsPage()`, commented
  as the Story 7.10 slot. No `wxt.config.ts` edit was needed or made — confirmed by `pnpm build` emitting
  `output/chrome-mv3/fullpage.html` with no corresponding `manifest.json` entry.
- **Task 6 (AC1, AC5):** `entrypoints/popup/App.tsx` fully rewritten — the `Tabs` import/usage,
  `handleTabChange`, `activeTab`, `managesReports` state/effect, `getPopupView`/`setPopupView` read-write,
  the stale-state guard, and the `WeekView`/`ManagerView` imports are all gone; the popup renders only the
  chrome header, `TodayView` (when connected), and the action bar. `components/ui/tabs.tsx` deleted
  (confirmed zero remaining importers repo-wide via grep). `@radix-ui/react-tabs` left in `package.json`
  untouched (off-limits, Epic 6.3 in-flight). `lib/storage/view-state.ts` untouched; its own test suite
  still passes unmodified.
- **Task 7 (AC1, AC2, AC3, AC6):** `TodayView.tsx` trimmed — the `<h2>Today</h2>` heading, the
  `{today} · {total} / {target}h` line, and `<PtoQuickAction />` are removed;
  `motion-safe:animate-fade-in` removed from the root (no entrance animation, AC6). New optional
  `onTotalChange?: (seconds: number) => void` prop fires (via a `useEffect` keyed on the summed
  `loggedEntries` total) whenever the session's own `TicketPicker`/`QuickLogForm`-originated total changes;
  the component still renders standalone with no `onTotalChange` supplied (verified by a dedicated test).
  `TicketPicker`, `QuickLogForm`, `LoggedToday`, the synced-outbox notice, and the catch-all-unconfigured
  notice are all unchanged in place.
- **Task 8 (AC6):** The popup shell renders `ChromeHeader` unconditionally on first render — `authState`
  starts `'loading'` but the header (eyebrow, avatar chip, date, ring motif) never awaits `getAuth()` or the
  today-total query; only the `<main>` body content and the action bar branch on `authState`/`connected`.
  Pinned by a synchronous (no `await`/`waitFor`) assertion in `entrypoints/popup/App.test.tsx` that the
  header/date are present immediately after `render()` while `getAuth()` is deliberately left permanently
  pending.
- **Task 9 (AC1–AC8):** All required test files created/updated (see File List). Two two-contribution
  session-seconds sources in the popup shell (`TodayView`'s own reducer via `onTotalChange`, plus a running
  `ptoSeconds` accumulator fed by the relocated `PtoQuickAction`'s `onLogged`) are summed into the single
  `sessionSeconds` value passed to `useTodayTotal` — this is a design decision made where the story's Task 3
  prose ("TodayView already tracks exactly this list") and Task 4's physical relocation of `PtoQuickAction`
  out of `TodayView` would otherwise be in tension; documented in code comments in
  `entrypoints/popup/App.tsx`. One accepted, scoped trade-off: a PTO entry logged via the action bar no
  longer appears in `TodayView`'s (still-present, pre-7.5) "Logged today" list, since `PtoQuickAction` is no
  longer a child of `TodayView` and lifting the whole entries list up was out of scope for this story's
  explicit `onTotalChange`-only contract; the session total itself still counts it correctly and
  double-count-safely. `LoggedToday`/"Logged today" itself is explicitly 7.5's to rebuild per the Dev Notes
  scope table.
- **Test baseline deltas** (Dev Notes > "Test baseline"): after Task 0 alone, zero deltas (see Debug Log).
  `TodayView.test.tsx` and `PtoQuickAction.test.tsx` changed shape as predicted — heading/date-total/PTO-in-
  TodayView assertions removed or retargeted; new assertions added for `onTotalChange` wiring (via a real
  `QuickLogForm` flow rather than the now-relocated `PtoQuickAction`, since seeding through the trigger
  actually resident in `TodayView` is what's under test) and for the `'Mark today as time off'` label.
- **AC verification:**
  - AC1 — pinned by `entrypoints/popup/App.test.tsx` ("renders no tab list / TabsTrigger anywhere, and
    WeekView/ManagerView are never rendered"); `components/ui/tabs.tsx` deleted.
  - AC2 — pinned structurally: exactly one `.overflow-y-auto` element in the popup DOM
    (`entrypoints/popup/App.test.tsx`), 380×560 fixed via the scoped CSS rule.
  - AC3 — `components/shell/ChromeHeader.test.tsx` pins the live-region wiring, bar `aria-hidden`, motif
    `aria-hidden`, `0.0` (never `——`) formatting, and the "Target met"/"h to go today" copy switch.
  - AC4 — `components/shell/PopupActionBar.test.tsx` + `entrypoints/popup/App.test.tsx` pin both actions,
    the ghost variant, the upward popover, and the `chrome.tabs.create` call with
    `fullpage.html?section=week`.
  - AC5 — `entrypoints/popup/App.test.tsx` asserts no `/manager|matrix/i`-named element exists in the
    popup; the full page's Manager nav-item visibility contract is pinned in
    `entrypoints/fullpage/App.test.tsx`.
  - AC6 — pinned by the synchronous first-render assertion (Task 8 note above); no entrance animation
    anywhere in the new shell/header/action bar.
  - AC7 — `entrypoints/fullpage/App.test.tsx` pins the default-to-Week routing, `?section=` selection, the
    fail-closed Manager nav visibility (pending/false/rejected/true), `WeekView`/`ManagerView` mounted
    unchanged with the right props, and the Settings action calling `openOptionsPage`.
  - AC8 — `pnpm compile`/`pnpm lint`/`pnpm test`/`pnpm build` all green against the recorded baseline (see
    Debug Log); `output/chrome-mv3/fullpage.html` confirmed emitted; axe gate at zero Critical/Serious on
    the popup (connected + disconnected, `App.a11y.test.tsx`) and the full page
    (`entrypoints/fullpage/App.test.tsx`); the Task 0 spacing shift is recorded as expected, not a
    regression (no test needed updating for it in practice).

### File List

**Created:**
- `components/shell/ChromeHeader.tsx`
- `components/shell/ChromeHeader.test.tsx`
- `components/shell/PopupActionBar.tsx`
- `components/shell/PopupActionBar.test.tsx`
- `hooks/useTodayTotal.ts`
- `hooks/useTodayTotal.test.tsx`
- `lib/open-full-page.ts`
- `lib/open-full-page.test.ts`
- `entrypoints/fullpage/index.html`
- `entrypoints/fullpage/main.tsx`
- `entrypoints/fullpage/App.tsx`
- `entrypoints/fullpage/App.test.tsx`
- `entrypoints/popup/App.a11y.test.tsx`
- `entrypoints/popup/App.session-total.test.tsx` (Finisher, Finding 1 — drives the real composition root to give the double-count guard genuine teeth)

**Modified:**
- `styles/globals.css` (Task 0's `--spacing`/`--text-*` tokens; Task 1's one `body[data-surface="popup"]` rule)
- `entrypoints/popup/index.html` (`data-surface="popup"` on `<body>`; `class="h-full w-full"` on `#root`)
- `entrypoints/popup/App.tsx` (full shell rewrite; Finisher Finding 3 — `ptoEntries` list replaces the `ptoSeconds` accumulator)
- `entrypoints/popup/App.test.tsx` (full rewrite; Finisher Findings 7/8 — broadened scroll selector, CSS dimension source-guard test)
- `entrypoints/popup/main.tsx` (Finisher Finding 6 — `refetchOnReconnect: false`)
- `entrypoints/fullpage/main.tsx` (Finisher Finding 6 — `refetchOnReconnect: false`, kept in sync)
- `hooks/useTodayTotal.ts` (Finisher Findings 1/6 — hazard comment now enumerates all three preconditions and points at the new integration test)
- `hooks/useTodayTotal.test.tsx` (Finisher Finding 1 — honest-ified the additive-only test; the guard itself moved to `App.session-total.test.tsx`)
- `components/today/TodayView.tsx` (trimmed; `onTotalChange` prop; Finisher Finding 3 — `externalEntries`/`onExternalEntryEdited`/`onExternalEntryDeleted` props and merge/routing logic; Finisher Finding 2 — passes `unbounded` to `TicketPicker`)
- `components/today/TodayView.test.tsx` (updated; Finisher Finding 3 — 4 new tests for external-entries render/edit-routing/delete-routing/no-double-count)
- `components/today/PtoQuickAction.tsx` (ghost variant, string renames, upward popover)
- `components/today/PtoQuickAction.test.tsx` (label retarget)
- `components/today/TicketPicker.tsx` (Finisher Finding 2 — scroll clamp scoped behind a new `unbounded` prop instead of being removed from the shared component; default stays clamped)
- `components/today/TicketPicker.test.tsx` (Finisher Finding 2 — 2 new tests for the default-clamped and `unbounded` shapes)
- `components/week/WeeklyGrid.test.tsx` (Finisher Finding 2 — source-guard test: `WeeklyGrid.tsx`'s `<TicketPicker` call site never opts into `unbounded`)
- `components/shell/ChromeHeader.tsx` (Finisher Finding 4 — eyebrow `text-white/70` → `text-white/85`; Finisher Finding 5 — live region hoisted to wrap both the pending and resolved branches)
- `components/shell/ChromeHeader.test.tsx` (Finisher Finding 5 — new test pinning the live region present-before-content)
- `entrypoints/popup/App.a11y.test.tsx` (Finisher Finding 9 — comment scoping the axe coverage to the chrome shell)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status → in-progress, then review, then done)

**Deleted:**
- `components/ui/tabs.tsx`

## Change Log

| Date       | Change                                                          |
| ---------- | --------------------------------------------------------------- |
| 2026-07-25 | Story 7.2 created (ready-for-dev). Scope: rebuild the popup as a fixed 380×560 single-job surface — Radix `Tabs` removed from the popup AND `components/ui/tabs.tsx` deleted (sole importer audited); one scroll region between a fixed `bg-chrome-gradient` chrome header (ring motif, eyebrow + avatar, 22 px Kanit 600 date, white tabular logged/target figure, 4 px bar, all wrapped in `role="status" aria-live="polite"`) and a fixed action bar (ghost "Mark today as time off" + secondary "Open week ↗"); chrome paints before data resolves and no entrance animation (NFR1). Includes ORCHESTRATOR DECISION **D-7.2-1**: a new WXT full-page entrypoint (`entrypoints/fullpage/`) as a THIN HOST SHELL only — Week/Manager/Settings routing mounting the EXISTING `WeekView`/`ManagerView` unchanged and unrestyled — because removing the tabs orphans them; this satisfies Story 7.7's first AC, and 7.7 keeps the chrome header, grid, cell anatomy, totals row and gap dialog. Declared token exception: DESIGN.md's `typography:` size/weight scale was NOT emitted by 7.1, so 7.2 adds the `--text-*` tokens to `@theme` (sizes/weights only, zero new hex). Confirmed at creation: `components/ui/tabs.tsx` has exactly one importer; `getPopupView`/`setPopupView` are used only by the popup; `chrome.tabs.create` needs no new permission; WXT unlisted pages need no `wxt.config.ts` edit; `entrypoints/popup/App.a11y.test.tsx` does NOT exist (only the options one does). Baseline recorded: 76 files / 961 passed / 1 skipped, `pnpm test` exits non-zero at baseline due to a pre-existing `ManagerView.test.tsx` fake-browser teardown race. |
| 2026-07-25 | Amended after orchestrator review. **D-7.2-2** (confirmed): Task 3's real today-total via `hooks/useTodayTotal.ts` stays — `TodayView.tsx:29` `loggedEntries` is session-only, so AC3 has no truthful data source without it and AC6's "chrome paints before data resolves" would be vacuous; the double-count guard and its pinning test are retained. **D-7.2-3** (NEW — added as **Task 0**, ahead of everything else): fix Story 7.1's token-layer gap rather than papering over it per-story. `@theme` declares zero `--spacing*` tokens, so Tailwind v4's default `--spacing: 0.25rem` against `html{font-size:13.5px}` makes every spacing utility **0.84×** (`p-4` = 13.5 px where DESIGN.md `spacing:` says `'4': 16px`) — add `--spacing: 4px` (Tailwind derives the scale as `calc(var(--spacing) * n)`, giving an exact DESIGN.md match and decoupling spacing from the root font-size permanently), plus the full `--text-*` scale; `html{font-size:13.5px}` stays as a purely typographic anchor. Dev Notes now warn that this **restores** spacing across the shipped Epic 1–6 surfaces (7.1 had silently shrunk them) — the shift and any pixel-encoding test updates are **expected, not a 7.2 regression** — and Task 0 must be run and tested in isolation so the diff is attributable. Guidance recut: standard spacing utilities are correct after Task 0; px arbitrary values remain only for typography and non-multiple-of-4 component dimensions. Also: Settings nav item noted as spec-mandated (EXPERIENCE.md 60–62) with only its body provisional; AC5's "no manager affordance in the popup" now cites EXPERIENCE.md 55–63 as settling it (marked do-not-relitigate); `components/ui/tabs.tsx` deletion and leaving `@radix-ui/react-tabs` in the untouched `package.json` confirmed; `ManagerView.onSwitchToToday` → `setSection('week')` with no rename confirmed. Old Task 9 (tokens) folded into Task 0; old Task 10 renumbered to Task 9. |
| 2026-07-25 | **Dev implementation complete — Status → review.** All 10 tasks (0–9) implemented and checked off. Task 0 run in isolation first: `pnpm test` reproduced the exact recorded baseline (76/961/1 skipped) with zero spacing-pixel-value test deltas. Built `components/shell/ChromeHeader.tsx` + `PopupActionBar.tsx`, `hooks/useTodayTotal.ts` (signature `useTodayTotal(sessionSeconds = 0)` — the additive session delta is computed inside the hook, pinned by its own double-count-guard test), `lib/open-full-page.ts`, and the new `entrypoints/fullpage/` unlisted WXT page (Week/Manager/Settings routing, `WeekView`/`ManagerView` mounted unchanged). Rewrote `entrypoints/popup/App.tsx` (Tabs gone, chrome header paints synchronously and unconditionally, one scroll region, action bar). Relocated `PtoQuickAction` into the action bar (ghost variant, `'Mark today as time off'`/`'Time off options'` renames, popover flipped upward); trimmed `TodayView` (heading/date-total/PtoQuickAction removed, `onTotalChange` prop added, fade-in removed). Deleted `components/ui/tabs.tsx` (zero remaining importers). Removed the one nested scroll region found in the popup subtree (`TicketPicker`'s `max-h-64 overflow-y-auto`). One documented design resolution: the popup shell sums two independent session-seconds contributions (TodayView's own `onTotalChange` total + a running PTO-entries accumulator) since `PtoQuickAction` physically moved out of `TodayView`; accepted trade-off is that a PTO entry logged via the action bar no longer appears in `TodayView`'s pre-7.5 "Logged today" list (session total still counts it correctly). Final gates: `pnpm compile` clean, `pnpm lint` 0 errors, `pnpm test` **82 files / 988 passed / 1 skipped** (same single pre-existing `ManagerView.test.tsx` unhandled rejection as baseline — not new), `pnpm build` succeeded with `output/chrome-mv3/fullpage.html` emitted and no `wxt.config.ts` edit. All 8 ACs verified (see Dev Agent Record > Completion Notes). |
| 2026-07-26 | **Story Finisher — all 9 review findings FIXED, Status → done.** See "Finding Resolutions (Story Finisher)" below for full per-finding rationale. Headline changes: (1) Major 1's double-count guard got real teeth via a new `entrypoints/popup/App.session-total.test.tsx` that drives the real composition root — verified by literally injecting the reviewer's exact hazard (`invalidateQueries(['week-worklogs'])` in `TodayView.handleLogged`), confirming the suite went RED, then reverting; (2) Major 2's `TicketPicker` scroll-clamp leak into `WeeklyGrid` fixed with a scoped `unbounded` prop (default clamped, popup opts in) plus two independent regression tests; (3) Major 3's lost time-off correction path fixed with the clean fix — `PtoQuickAction`'s entries are now a lifted `ptoEntries` list merged into `TodayView`'s "Logged today" (working edit/delete), not just a seconds accumulator; (4) eyebrow contrast raised `/70` → `/85` per the orchestrator's AA-wins ruling, with the DESIGN.md deviation recorded for its owner; (5) the chrome header's live region now mounts before its content; (6) `refetchOnReconnect: false` closes the third double-count door; (7)–(9) the three nits (broadened scroll selector, a CSS source-guard test, and an axe-scope-limitation comment) all landed as cheap fixes. Final gates: `pnpm compile` clean, `pnpm lint` 0 errors (no new warnings), `pnpm test` **83 files / 998 passed / 1 skipped** (same single pre-existing `ManagerView.test.tsx` unhandled rejection, not new), `pnpm build` succeeded with `output/chrome-mv3/fullpage.html` emitted and no `wxt.config.ts` edit. |

## Review Findings

## Review Summary

- **Reviewed by**: bmad-code-reviewer (adversarial pass — code re-read fresh, all gates re-run independently, teeth of 5 named tests verified by neutering)
- **Date**: 2026-07-25
- **Story Status Recommendation**: **Changes Requested**
- **Blockers**: 0
- **Majors**: 3
- **Minors**: 4
- **Nits**: 3

### Independently re-run gates

| Gate | Result | vs. Dev Record |
|---|---|---|
| `pnpm compile` | exit 0, clean | matches |
| `pnpm test` | **82 files, 988 passed, 1 skipped (989)**, exit 1 | **matches exactly** |
| `pnpm build` | exit 0; `output/chrome-mv3/fullpage.html` emitted (663 B); `manifest.json` carries no entry for it and no `tabs` permission | matches |

The non-zero `pnpm test` exit is the single pre-existing unhandled rejection from
`components/manager/ManagerView.test.tsx` (`@wxt-dev/storage` `getStorageArea` fake-browser teardown race).
Confirmed identical to the recorded baseline — **not** a regression. Baseline 76/961/1 → 82/988/1 reconciles
exactly: +6 new test files (`ChromeHeader`, `PopupActionBar`, `useTodayTotal`, `open-full-page`,
`fullpage/App`, `popup/App.a11y`), +27 tests. No package lost tests.

### Teeth verification (implementation neutered, test observed, then reverted)

| # | Guarantee | Mutation applied | Result |
|---|---|---|---|
| 1 | Single scroll region | `overflow-hidden` → `overflow-y-auto` on the chrome header | **RED** — `expected 2 to be 1` |
| 2 | `role="status" aria-live="polite"` wrapper | attributes stripped from the figure wrapper | **RED** — in `ChromeHeader.test.tsx` *and* `App.test.tsx` |
| 3 | No tabs in the popup | injected `<div role="tablist">` + Week/Manager buttons | **RED** — AC1 *and* AC5 assertions both fired |
| 4 | "Open week ↗" opens the Week section | `openFullPage('week')` → `openFullPage('manager')` | **RED** — in `PopupActionBar.test.tsx` *and* `App.test.tsx` |
| 5a | Session delta is additive | dropped `+ sessionSeconds` from the hook's return | **RED** — `expected 3600 to be 5400` |
| 5b | **Double-count guard** | injected the forbidden `invalidateQueries(['week-worklogs'])` into `TodayView.handleLogged` | **GREEN — 988/988 still passed. No teeth.** See Finding 1. |

Teeth 1–4 and 5a are genuine. Teeth 5b is the one that fails, and it is the guarantee the story called out
by name as the hazard to pin.

### Verified clean (no finding)

- **Epic 6.3 isolation** — `git diff HEAD` on `scripts/pack-crx.mjs`, `scripts/derive-ext-key.mjs`,
  `scripts/lib/`, `package.json`, `docs/release.md`, `wxt.config.ts` contains **only** CRX work (`ext:id`
  script, the `key`-pinning comment, release docs). Zero 7.2 content. No `wxt.config.ts` edit was needed —
  the WXT unlisted-page convention held exactly as the story predicted.
- **Task 0 token amendment** — `--spacing: 4px` + the full `--text-*` scale land in the existing `@theme`
  block. **Zero new hex** in the diff (verified by grep over added lines). `html { font-size: 13.5px }`
  byte-identical. Every emitted `--text-*` size/weight/leading/tracking matches DESIGN.md frontmatter
  `typography:` exactly (display 26/600/1.15 … num 13/500). The Epic 1–6 spacing restoration is expected
  per D-7.2-3 and is **not** reported as a regression.
- **AC1 residue sweep** — `components/ui/tabs.tsx` deleted; zero `Tabs`/`TabsList`/`TabsTrigger`/
  `TabsContent` imports and zero `role="tablist"` remain in source repo-wide.
- **Scope discipline** — `components/week/*` and `components/manager/*` are untouched in `git status`.
  `WeekView`/`ManagerView` are mounted on the full page with props only. (But see Finding 2 — the
  restyle leaked in through a *shared* component.)
- **Icon discipline** — `lucide-react` is the only icon import repo-wide; `ArrowUpRight` at 13 px with
  `aria-hidden="true"`; no icon font, no CDN, no second set. **No `font-mono`/monospace anywhere** in
  application source; the figure uses `font-chrome tabular`.
- **Double-count guard is correct in production today** (only its test is absent):
  `useWeekWorklogs` sets `staleTime: 60_000` **on the query itself**, so the guard travels with the hook
  rather than depending on the popup `QueryClient` default; and the only
  `invalidateQueries(['week-worklogs', …])` in the repo is `components/week/WeekView.tsx:110`, which the
  popup no longer mounts.
- **PTO double-post guard** — `handleSubmit` bails on `isPending || showSuccess || !ptoKey`, and `onLogged`
  fires exactly once inside the success timeout, so the shell's `ptoSeconds` accumulator cannot
  double-increment. The outbox fallback path correctly does **not** call `onLogged`.
- **AC6** — `ChromeHeader` is rendered unconditionally by the shell and awaits nothing; pinned by a
  genuinely synchronous assertion with `getAuth()` left permanently pending. No entrance animation on the
  popup root, header, or action bar.
- **Contrast that passes** — "Open week" `text-primary` `#594f74` on `bg-surface` `#ffffff` = **7.5:1**
  (AAA). Ghost trigger `text-neutral-500` `#6b6678` on white = **5.5:1** (AA).

---

### Finding 1: The double-count guard has zero test teeth — the test that names it cannot fail

- **Severity**: Major
- **Category**: Tests
- **Location**: `hooks/useTodayTotal.test.tsx:83–112` (test `'the additive session delta does not double-count (query is not refetched)'`)
- **Observation**: I injected the exact hazard the story forbids —
  `void queryClient.invalidateQueries({ queryKey: ['week-worklogs'] })` inside
  `TodayView.handleLogged` — and ran the full suite. **All 988 tests still passed.** The test's assertion
  `expect(fetchByIssueMock).toHaveBeenCalledTimes(1)` is vacuous: the test never logs an entry, it only
  calls `rerender({ sessionSeconds: 1800 })` with a stable query key, and a prop rerender can never
  trigger a refetch in TanStack Query. So the "query is not refetched" half asserts a property of
  react-query, not of any guard. What the test *does* pin is the addition itself (removing
  `+ sessionSeconds` correctly goes red) — but that is Finding-free behaviour, not the guard.
  Compounding it, the test's own `QueryClient` wrapper sets only `retry: false`; it reproduces neither
  `staleTime: 60_000` nor `refetchOnWindowFocus: false`, the two preconditions the guard is documented as
  resting on.
- **Impact**: The story's Task 3 required this test specifically so that *"whoever adds invalidation later
  is forced to remove the delta in the same change."* As written, a future story can add
  `invalidateQueries(['week-worklogs'])` and ship a silently inflated today total — the header would
  double-count every entry logged in the session — with a fully green suite. The Completion Notes' claim
  that the total is *"double-count-safely"* pinned is not supported by the test. Note the **product is
  correct today** (see "Verified clean"), which is why this is Major and not a Blocker: the defect is in
  the regression net, not the behaviour.
- **Suggested Resolution**: Make the test exercise the hazard rather than assert around it. Render the hook
  against a `QueryClient` configured like the popup's (`staleTime: 60_000`,
  `refetchOnWindowFocus: false`), let the query settle, then call
  `queryClient.invalidateQueries({ queryKey: ['week-worklogs'] })` directly and assert the reported total
  does **not** grow by the session delta twice — i.e. assert the invariant, so that adding invalidation
  anywhere makes this test red. Alternatively add a guard the test can remove: have `useTodayTotal` accept
  the session entries' worklog IDs and subtract any that already appear in the fetched week data, which
  turns the absence-of-invalidation convention into an actual, testable mechanism.
- **Related AC**: AC3, AC6 (D-7.2-2)

### Finding 2: Removing `TicketPicker`'s scroll clamp silently changes `WeeklyGrid`, a surface this story was forbidden to touch

- **Severity**: Major
- **Category**: Convention / Scope
- **Location**: `components/today/TicketPicker.tsx:386–388` (`className="mt-2 max-h-64 overflow-y-auto"` → `className="mt-2"` on the `role="tree"` container); consumer at `components/week/WeeklyGrid.tsx:495`
- **Observation**: `TicketPicker` has **two** consumers, not one. Besides `TodayView`, it is rendered inline
  by `components/week/WeeklyGrid.tsx:495` (the week grid's "add subtask" picker). The clamp was removed
  unconditionally from the shared component, so the week grid's ticket tree — previously bounded to 16 rem
  with its own internal scroll — now expands to its full natural height. The story's Dev Notes list
  `components/week/*` under "Files you must NOT touch" and the Anti-patterns section forbids *"Restyling
  `WeekView` / `WeeklyGrid` … while you're in there"*. The letter of that rule was kept (no file under
  `components/week/` was edited) but the effect landed there anyway, through the shared dependency.
  Nothing catches it: `components/week/WeeklyGrid.test.tsx:9` mocks `TicketPicker` out entirely.
- **Impact**: A shipped Epic 1–6 surface changes layout as a side effect of a popup-scoped AC. With a large
  ticket hierarchy the week grid's picker now grows without bound and pushes the rest of the page down,
  losing the compact, self-scrolling affordance it was designed with. It is invisible to the suite and was
  not declared in the Completion Notes, so it will surface as a surprise during 7.7.
- **Suggested Resolution**: Scope the change to the consumer that needs it rather than the shared component
  — e.g. restore `max-h-64 overflow-y-auto` as the `TicketPicker` default and let the popup's `TodayView`
  opt out via a prop (`unbounded` / `clamp={false}`), or move the clamp onto `WeeklyGrid`'s own wrapper at
  line 493–496. Either way AC2 stays satisfied for the popup while the week grid keeps its current
  behaviour. If the finisher judges the week-grid change acceptable, it must at minimum be recorded
  explicitly as a deliberate cross-surface change and handed to 7.7.
- **Related AC**: AC2 (and the story's scope boundary / Anti-patterns)

### Finding 3: Time-off entries logged from the action bar vanish from "Logged today", losing in-session edit/delete — and no story owns the fix

- **Severity**: Major
- **Category**: AC Conformance / Maintainability
- **Location**: `entrypoints/popup/App.tsx:85–87` (`handlePtoLogged` accumulates seconds only) and `components/shell/PopupActionBar.tsx:26`; contrast `components/today/TodayView.tsx:67–70` (`handleLogged`, which still feeds `LoggedToday`)
- **Observation**: This is the trade-off the Completion Notes disclose, and the total half of it is handled
  correctly — I verified the session sum is genuinely double-count-safe (single-fire `onLogged`, guarded
  against double-post, no invalidation). But the disclosed consequence is understated. At baseline,
  `PtoQuickAction` fed `TodayView.handleLogged`, so a time-off entry landed in `loggedEntries` and
  therefore rendered in `LoggedToday` **with working edit and delete controls**. After the relocation it
  only increments the shell's `ptoSeconds`, which is a monotonic accumulator that can never be decremented.
  The user's only feedback is a ~200 ms ✓ in the popover and the header figure moving.
- **Impact**: A user who posts a full day of time off by mistake had a one-click in-popup correction path
  and now has none — they must go to the week grid or Jira. That is a loss of existing functionality, not
  merely deferred styling. The Dev Notes scope table assigns 7.5 the *rebuild of the list*, not the
  re-wiring of a producer that 7.2 moved out from under it, so as written nothing in the plan restores
  this. It is a real risk of falling through the crack between 7.2 and 7.5.
- **Suggested Resolution**: Prefer the small fix now: lift the entries **list** rather than just the total —
  have `PopupActionBar`'s `onLogged` push into a shell-owned array that is passed down to `TodayView` and
  concatenated into `loggedEntries`, which restores the row plus edit/delete and makes `ptoSeconds`
  decrementable for free. If the finisher instead keeps the interim, it must be recorded as an explicit,
  named carry-in on Story 7.5's scope ("re-attach action-bar time-off entries to the rebuilt Logged today
  list") rather than left implicit in 7.2's Completion Notes.
- **Related AC**: AC4, AC1

### Finding 4: Chrome header eyebrow at `text-white/70` falls below WCAG AA contrast on the top of the gradient

- **Severity**: Minor
- **Category**: Security & Data Handling / Accessibility
- **Location**: `components/shell/ChromeHeader.tsx:104` (`font-chrome text-eyebrow uppercase text-white/70`) against `styles/globals.css:205–210` (`linear-gradient(165deg, #615b99 0%, #594f74 42%, #4a4163 100%)`)
- **Observation**: The eyebrow sits in the header's first row (`pt-[14px]`), i.e. in the region rendered
  from the gradient's **lightest** stop. Computing the composited colour: white at 70 % over `#615b99`
  yields ≈ **3.91:1**; at the eyebrow's actual y-position (~20 % down, ≈ `#5d5587`) it is ≈ **4.25:1**.
  WCAG 2.1 AA requires **4.5:1** for normal-size text, and `text-eyebrow` is 11 px / weight 500 — well
  below the large-text threshold. It only clears AA further down the gradient (≈ 4.66:1 at the 42 % stop),
  which is where the figure and note sit — those are fine. axe cannot see this: `lib/test/axe.ts` disables
  `color-contrast` because jsdom cannot paint, so the green a11y gate is not evidence either way.
- **Impact**: A new AA shortfall on new chrome, on the surface AC8 gates as "no WCAG 2.1 AA regression".
  Low functional impact — the affected string is the product name "TIME LOGGER", the least meaning-bearing
  text on the surface — but it is a real conformance gap that the automated gate structurally cannot catch.
- **Suggested Resolution**: **Do not fix unilaterally.** The developer followed the story exactly: Dev Notes
  > Accessibility floor instructs *"keep the eyebrow at `/70` or above and do not lighten it"*, and
  DESIGN.md's claim that "white on the chrome gradient clears AA at every stop" is true of full white, not
  of white at 70 %. The defect lives in the spec, so escalate to the UX spec owner. The cheap remedies are
  `text-white/80` (≈ 5.0:1 at the top stop, still visibly subordinate) or darkening the gradient's 0 % stop.
- **Related AC**: AC3, AC8

### Finding 5: The live region is mounted together with its content, so the first resolved total is never announced

- **Severity**: Minor
- **Category**: Accessibility
- **Location**: `components/shell/ChromeHeader.tsx:117–140`
- **Observation**: While `isPending` the header renders the skeleton branch, which contains **no**
  `role="status"` element; when the total resolves the entire `<div role="status" aria-live="polite">` is
  inserted into the DOM already populated. Assistive technology only announces changes to live regions that
  were **already present** in the accessibility tree — a region added simultaneously with its content is
  generally not announced.
- **Impact**: The pending → resolved transition, which is the one moment the figure appears, is silent.
  The live region still works for its main case (logging an entry mutates `seconds` while the region is
  mounted, which does announce), so impact is limited — and announcing the total the instant the popup
  opens is arguably noise anyway. AC3's literal wording ("the progress figure and bar are wrapped in
  `role="status" aria-live="polite"`") is satisfied.
- **Suggested Resolution**: Hoist the `<div role="status" aria-live="polite">` so it wraps **both** branches
  and is present from first paint, with the skeleton and the resolved figure swapping inside it. That is a
  small refactor of the `connected && (isPending ? … : …)` ternary and preserves every existing assertion.
- **Related AC**: AC3

### Finding 6: The guard's documented preconditions omit `refetchOnReconnect`, which defaults to `true`

- **Severity**: Minor
- **Category**: Correctness
- **Location**: `hooks/useTodayTotal.ts:14–24` (hazard comment); `entrypoints/popup/main.tsx:8–38` and `entrypoints/fullpage/main.tsx:12–43` (QueryClient defaults)
- **Observation**: The hazard comment and the story both enumerate exactly two preconditions —
  `staleTime: 60_000` and `refetchOnWindowFocus: false` — plus the absence of invalidation. TanStack Query
  also refetches stale queries on network reconnect, and `refetchOnReconnect` is left at its default
  `true` in both `QueryClient` configs. A popup left open past the 60 s `staleTime` that then sees a
  reconnect event will refetch `['week-worklogs']`; the refreshed server total already contains the
  session's own writes, and `sessionSeconds` is added on top.
- **Impact**: A narrow but genuine double-count window (popup open > 60 s **and** a reconnect **and** an
  entry logged in that session) producing an inflated header figure until the popup is reopened. Narrow
  enough to be Minor, and it fails safe on close.
- **Suggested Resolution**: Either set `refetchOnReconnect: false` alongside `refetchOnWindowFocus: false`
  in the popup `QueryClient`, or add it to the enumerated precondition list in the hook's hazard comment so
  the next author inherits the complete set. Folding this into Finding 1's invariant-style test covers it
  permanently.
- **Related AC**: AC3, AC6 (D-7.2-2)

### Finding 7: The single-scroll-region test only counts `.overflow-y-auto`

- **Severity**: Nit
- **Category**: Tests
- **Location**: `entrypoints/popup/App.test.tsx:93–94`
- **Observation**: `container.querySelectorAll('.overflow-y-auto')` catches the exact class the current code
  uses (teeth-verified RED above), but a nested scroll region introduced as `overflow-auto`,
  `overflow-scroll`, `overflow-y-scroll`, or a `max-h-*` clamp paired with overflow would slip through.
  The repo is clean of all of these today, so this is purely about future-proofing the AC.
- **Impact**: The structural guarantee AC2 exists to protect is narrower than the AC's wording ("no nested
  scroll region exists **anywhere** in the popup").
- **Suggested Resolution**: Broaden the selector to
  `'[class*="overflow-y-auto"],[class*="overflow-auto"],[class*="overflow-scroll"],[class*="overflow-y-scroll"]'`
  and keep the `toBe(1)` assertion.
- **Related AC**: AC2

### Finding 8: The 380 × 560 half of AC2 is not pinned by any test

- **Severity**: Nit
- **Category**: Tests
- **Location**: `styles/globals.css:247–252` (`body[data-surface="popup"]`); no corresponding assertion in `entrypoints/popup/App.test.tsx`
- **Observation**: The scroll-region *structure* is well covered, but the fixed surface dimensions live
  purely in CSS and nothing asserts them — jsdom has no layout engine, and the popup test renders `<App />`
  without the `data-surface` body attribute at all.
- **Impact**: Accepted limitation rather than a defect; worth recording so the gap is deliberate. A silent
  removal of the scoped rule would not be caught.
- **Suggested Resolution**: Optionally assert the rule's presence at the source level (a small test reading
  `styles/globals.css` and matching `body[data-surface="popup"]` with `380px`/`560px`), or note the gap in
  the manual release-gate checklist alongside the other manually-verified visual criteria.
- **Related AC**: AC2

### Finding 9: Popup axe scan stubs out `TodayView` and `PtoQuickAction`, so it covers the shell only

- **Severity**: Nit
- **Category**: Tests / Accessibility
- **Location**: `entrypoints/popup/App.a11y.test.tsx:22–34`
- **Observation**: Both the connected and disconnected axe scans mock `TodayView` and `PtoQuickAction` to
  bare `<div>`s. The scan therefore covers the chrome header, the "Open week" button and the disconnected
  panel — not the popup body a user actually sees. There is no `TodayView` a11y suite either
  (`entrypoints/options/App.a11y.test.tsx` and this file are the only two in the repo).
- **Impact**: AC8's "the axe gate stays at zero Critical/Serious on every surface" reads stronger than the
  evidence supports for the popup. Mitigated by the fact that the mocked subtrees are pre-existing,
  previously-audited Epic 1–6 components that 7.2 only relocated.
- **Suggested Resolution**: Leave the mocks (they keep the shell test fast and focused) but consider a
  single additional scan that renders the real `TodayView` with its storage/network boundary mocked, or
  record the scope limitation next to the AC8 claim so it is not read as full-surface coverage.
- **Related AC**: AC8

### AC-by-AC verdict

| AC | Verdict | Note |
|---|---|---|
| **AC1** — Tabs removed, only today's content renders | **Satisfied** | `components/ui/tabs.tsx` deleted, zero importers/`role="tablist"` repo-wide; teeth-verified |
| **AC2** — 380×560, exactly one scroll region | **Satisfied** | Structure teeth-verified; dimensions unpinned (Finding 8), selector narrow (Finding 7), and the fix leaked into `WeeklyGrid` (Finding 2) |
| **AC3** — Chrome header composition | **Satisfied with defects** | All required parts present and teeth-verified; live-region timing (Finding 5) and eyebrow contrast (Finding 4) |
| **AC4** — Action bar, exactly two actions | **Satisfied** | Ghost time-off + secondary "Open week ↗", `ArrowUpRight` 13 px `aria-hidden`, popover flipped upward, new-tab accessible name; teeth-verified. See Finding 3 for the relocation's side effect |
| **AC5** — No orphaned manager affordance | **Satisfied** | No `/manager|matrix/i` element in the popup; the manager path closes via the full page's fail-closed nav item |
| **AC6** — NFR1 TTI ≤ 400 ms warm | **Satisfied** | Header paints unconditionally, pinned synchronously with `getAuth()` permanently pending; no entrance animation |
| **AC7** — Full-page host shell | **Satisfied** | Default Week, `?section=` seeding, `history.replaceState`, no router; Manager nav hidden while pending / false / rejected and shown only on `true`; `WeekView`/`ManagerView` mounted unchanged; Settings slot calls `openOptionsPage` |
| **AC8** — No regressions; all gates green | **Partially met** | `compile`/`test`/`build` independently reproduced and green against baseline, `fullpage.html` emitted, Task 0 shift correctly recorded as expected. Held back by the unpinned double-count guard (Finding 1), the AA contrast gap (Finding 4), and overstated axe coverage (Finding 9) |

**Bottom line.** The shell rewrite is well built and the structural ACs are real — four of the five named
guarantees have genuine teeth, the Epic 6.3 files are untouched, Task 0 is exactly the token amendment it
claims to be with zero new hex, and my gate numbers reproduce the Dev Record exactly. Three things need
attention before this closes: the double-count guard is documented and asserted but not actually tested
(Finding 1), a shared-component edit reached a surface this story was fenced off from (Finding 2), and the
accepted time-off trade-off costs a real correction affordance with no story currently owning its return
(Finding 3).

---

## Finding Resolutions (Story Finisher)

All 9 numbered findings (Findings 1–9, as severity-tagged in the body: 3 Major, 3 Minor, 3 Nit — the Review
Summary's header tally of "Majors: 3, Minors: 4, Nits: 3" totals 10, one more than the 9 items actually
listed; not corrected here since it doesn't change the triage below) were triaged **FIX**. None dismissed,
none deferred. Rationale per finding:

### Finding 1 (Major) — double-count guard test had no teeth — **FIX**

The reviewer's own experiment was re-run verbatim as the acceptance bar for the fix: injected
`void queryClient.invalidateQueries({ queryKey: ['week-worklogs'] })` into `TodayView.handleLogged`
(temporarily, on top of a `useQueryClient()` import), ran `entrypoints/popup/App.session-total.test.tsx`,
and confirmed **RED** — the header showed `5.0 / 8h` where the correct additive total is `3.0 / 8h`,
exactly the doubled value the hazard predicts. The injected hazard was then fully reverted
(`components/today/TodayView.tsx` is byte-identical to its pre-verification state; confirmed via `git diff`
showing only the intended Finding 3 changes).

The fix has two parts:
1. **New `entrypoints/popup/App.session-total.test.tsx`** — drives the real composition root (`App` →
   real `TodayView` → real `useTodayTotal`, with a `QueryClient` configured exactly like
   `entrypoints/popup/main.tsx`) instead of a hand-rolled harness, per the reviewer's own diagnosis that a
   hook-only rerender can never observe a refetch. The mocked `fetchCurrentUserWeekWorklogsByIssue` returns
   the pre-log server total on its first call and the post-log (already-inflated, as a real backend would
   report) total on any subsequent call — so the test is a genuine regression net for any future
   `invalidateQueries` call reachable from logging an entry, not just the one line I injected to prove it.
2. **`hooks/useTodayTotal.test.tsx`** — the old test's name and its `toHaveBeenCalledTimes(1)` framing were
   honest-ified rather than deleted: it now documents that it pins only the additive math (a real, useful
   fact) and points to the new integration test for the actual guard.

Also folded in **Finding 6** (see below) since both concern the guard's precondition list.

### Finding 2 (Major) — `TicketPicker`'s scroll clamp leaked into `WeeklyGrid` — **FIX**

Added an `unbounded?: boolean` prop to `components/today/TicketPicker.tsx`, defaulting to `false` (clamped
— `WeeklyGrid.tsx:495`'s existing call site is untouched, byte-for-byte, so its picker keeps the 16rem
self-scrolling behaviour it always had). `components/today/TodayView.tsx` passes `unbounded` explicitly for
the popup's single-scroll-region contract (AC2). Two regression tests added:
`components/today/TicketPicker.test.tsx` pins both the default-clamped and `unbounded` shapes directly;
`components/week/WeeklyGrid.test.tsx` adds a source-level grep (`WeeklyGrid.tsx`'s own `<TicketPicker`
call site does not contain `unbounded`) as a second, independent guard, since that file mocks `TicketPicker`
away entirely and cannot otherwise observe a future accidental opt-in.

### Finding 3 (Major) — time-off entries lost their in-popup correction path — **FIX (the "clean fix", not the carry-in)**

Attempted the clean fix first, per the finding's own preference, and it worked within scope: lifted the PTO
contribution from a monotonic `ptoSeconds` accumulator to a full `ptoEntries: LoggedEntry[]` list owned by
`entrypoints/popup/App.tsx`. `TodayView` gained three new optional props (`externalEntries`,
`onExternalEntryEdited`, `onExternalEntryDeleted`) and merges `externalEntries` into what it renders via
`LoggedToday`, routing an edit/delete of a given row to whichever owner (its own reducer or the external
callback) actually holds that `worklogId`. `ptoSeconds` for the header total is now derived
(`ptoEntries.reduce(...)`), so editing/deleting a time-off entry is reflected in the chrome header for free
— no separate accounting path to keep in sync. `onTotalChange` stays scoped to `TodayView`'s own entries
only (verified by a dedicated test) so the shell's separate `ptoSeconds` tracking is never double-folded in.
Four new tests in `components/today/TodayView.test.tsx` cover: rendering, edit-routing, delete-routing, and
the no-double-count-via-onTotalChange invariant. No carry-in note to Story 7.5 is needed — the correction
path is restored in this story, not deferred.

### Finding 4 (Minor) — eyebrow contrast below AA — **FIX (per orchestrator ruling: AA wins)**

Raised `components/shell/ChromeHeader.tsx`'s eyebrow from `text-white/70` to `text-white/85`. Computed
(not axe-verified, per the finding's own note that `color-contrast` is disabled in the harness) against the
gradient's lightest (0%) stop `#615b99`: `/70` ≈ 3.91:1 (fails AA), `/80` ≈ 4.57:1 (clears AA by only ~1.5%
margin — too close to the boundary to trust across rendering/rounding variance), `/85` ≈ 4.91:1 (clears
with real margin, still visibly subordinate to the full-white date/figure). `/85` was chosen over the
reviewer's suggested `/80` for that safety margin. **Deviation recorded for the UX/DESIGN.md owner:** the
Dev Notes' original instruction ("keep the eyebrow at `/70` or above and do not lighten it") is superseded
by this story's WCAG 2.1 AA gate (a standing Epic 7 constraint per `epics.md`) — DESIGN.md's chrome-header
opacity value should be updated to `/85` (or higher) to match.

### Finding 5 (Minor) — live region mounted together with its content — **FIX**

Hoisted the `<div role="status" aria-live="polite">` wrapper in `components/shell/ChromeHeader.tsx` to wrap
**both** the `isPending` skeleton branch and the resolved figure branch, so the region exists from first
paint and the pending → resolved swap happens inside an already-present region (which assistive tech does
announce), rather than the region itself appearing simultaneously with its resolved content. New test in
`components/shell/ChromeHeader.test.tsx` asserts the region is present while pending and is the *same*
DOM node after the total resolves.

### Finding 6 (Minor) — `refetchOnReconnect` was an un-enumerated third door to the hazard — **FIX**

Added `refetchOnReconnect: false` to both `entrypoints/popup/main.tsx` and `entrypoints/fullpage/main.tsx`
`QueryClient` defaults (the full page doesn't read today-total, but kept in sync since both mirror each
other by design per Task 5's Dev Notes). Updated the hazard comment in `hooks/useTodayTotal.ts` to
enumerate all three preconditions (`staleTime`, `refetchOnWindowFocus`, `refetchOnReconnect`) plus the
absence of invalidation, and to point at the new `App.session-total.test.tsx` for the guard's actual test
coverage.

### Finding 7 (Nit) — scroll-region selector only counted `.overflow-y-auto` — **FIX**

Broadened the `querySelectorAll` in `entrypoints/popup/App.test.tsx`'s AC2 test to also match
`overflow-auto`, `overflow-scroll`, and `overflow-y-scroll` (attribute-substring selectors), keeping the
`toBe(1)` assertion. Cheap, and directly closes the gap between the AC's wording ("no nested scroll region
exists **anywhere**") and what the old selector could see.

### Finding 8 (Nit) — 380×560 not pinned by any test — **FIX**

Added a source-level test to `entrypoints/popup/App.test.tsx` that reads `styles/globals.css` and asserts
the `body[data-surface="popup"]` rule contains `width: 380px` and `height: 560px`. jsdom still can't verify
actual rendered layout, but a silent removal or edit of the scoped rule now fails a test instead of only a
manual release-gate check.

### Finding 9 (Nit) — popup axe scan stubs out `TodayView`/`PtoQuickAction` — **FIX (documentation only)**

Per the finding's own suggested resolution ("record the scope limitation... so it is not read as
full-surface coverage"), left the mocks in `entrypoints/popup/App.a11y.test.tsx` as-is (they keep that
suite fast and shell-focused) and added a comment explicitly scoping AC8's axe claim to the chrome shell for
this file, pointing at `components/today/TodayView.test.tsx`'s own pre-existing "a11y scan (Story 6.1 AC1)"
suite as the coverage for the body these mocks hollow out.

### Summary

**9 findings, 9 FIX, 0 dismissed, 0 deferred.**

Final validation (re-run in full after all fixes): `pnpm compile` clean; `pnpm lint` 0 errors (same
pre-existing `import/order` warnings as the Dev Record, no new ones); `pnpm test` **83 files, 998 passed, 1
skipped (999 total)**, non-zero exit from the same single pre-existing `ManagerView.test.tsx` unhandled
rejection (not new); `pnpm build` succeeded, `output/chrome-mv3/fullpage.html` emitted, no `wxt.config.ts`
edit. Baseline reconciliation: 82 files/988 passed/1 skipped (reviewed) → 83 files/998 passed/1 skipped —
+1 new test file (`App.session-total.test.tsx`) and +10 tests across `TicketPicker.test.tsx` (+2),
`components/week/WeeklyGrid.test.tsx` (+1), `TodayView.test.tsx` (+4), `ChromeHeader.test.tsx` (+1),
`App.test.tsx` (+1), `App.session-total.test.tsx` (+1, new file) — no test lost, no package regressed.

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-07-25 — created (ready-for-dev)

Popup shell, one job / one scroll region. Includes
ORCHESTRATOR DECISION D-7.2-1: the full-page host shell (new WXT entrypoint, Week/Manager/
Settings routing, mounting WeekView + ManagerView UNCHANGED) ships in 7-2 because removing
the popup Tabs orphans them. This satisfies Story 7-7's first AC; 7-7 keeps the full-page
chrome header, week grid, cell anatomy, totals row and gap dialog.

### 2026-07-26 — done

Code review found 0 blockers / 3 majors / 4 minors / 3 nits; all 9 findings
FIXED (0 dismissed, 0 deferred) by the story finisher, including giving the double-count
guard real test teeth (verified by injecting the reviewer's exact hazard, confirming RED,
then reverting) and restoring the time-off in-popup edit/delete correction path the review
caught as lost. Final gates: 83 files / 998 passed / 1 skipped, build green.
