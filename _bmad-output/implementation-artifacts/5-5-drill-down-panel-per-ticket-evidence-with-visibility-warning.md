---
baseline_commit: 548c557e5c3d879f5c07f51d1e271143f289fb5a
---

# Story 5.5: Drill-Down Panel — Per-Ticket Evidence with Visibility Warning

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a manager spotting an anomaly,
I want to click a matrix cell and see the report's exact subtasks and hours within that Epic for the cycle,
so that I can investigate the evidence behind a number without leaving the matrix.

## Acceptance Criteria

**Cell click-affordance → open the panel (UPDATE `components/manager/ManagerMatrix.tsx`)**

1. The `MatrixCell` (`components/manager/ManagerMatrix.tsx:488`) becomes an interactive trigger that opens a slide-in drill-down panel for that `(report, Epic, cycle)`. The trigger must be a real `<button>` (keyboard-operable: Enter/Space activate; visible `focus-visible:ring-2 focus-visible:ring-accent` ring) wrapped so the cell's existing color/icon/stripe/lock treatment is preserved. The cell's existing `aria-label` (status + restricted suffix) is retained; the button is the accessible name source — do NOT double-announce (the `<td>` keeps `aria-label`; the inner button uses `aria-label` or wraps the same content — pick one, no duplicate labels). **Empty `──` cells are still neutral but ARE clickable** (they open a panel showing the empty state, AC 6). (epics §5.5; UX-DR16; UX-DR32)

2. Clicking a cell sets the open panel target to `{ report, epicKey, cycle }` lifted to a single panel-state owner (the `ManagerMatrix` component owns ONE `<DrillDownPanel>` instance + `selectedCell` state — do NOT mount one panel per cell). The panel reads the already-resolved per-row data for that report+Epic from the matrix's `resolved` map (the same `ReportCycleWorklogs` the row lifted via `onResolved`) — it MUST NOT issue a new Jira fetch. (epics §5.5 "the per-row matrix query already has the worklog records — the panel filters them client-side"; FR31)

**Panel surface — slide-in from right (NEW `components/manager/DrillDownPanel.tsx`)**

3. A NEW `components/manager/DrillDownPanel.tsx` renders a slide-in panel built on the in-repo shadcn Radix `Dialog` primitive (`components/ui/dialog.tsx` — already installed, `@radix-ui/react-dialog`). The panel uses the Radix `Dialog` for focus management (focus trap, Esc-to-close, ARIA modal semantics, focus return to the originating cell), but is styled as a **right-anchored slide-in** (NOT the centered default `DialogContent`): position `fixed right-0 top-0 h-full`, a constrained width that fits within / overlays part of the 360 px popup, entering with a right-to-left slide (200 ms ease-out, `motion-safe:`; instant under `prefers-reduced-motion: reduce`, UX-DR7/UX-DR33). The matrix stays visible behind a dimming overlay (UX-DR16 — "parent context stays visible behind", no navigation away). Provide a custom `className`/variant on `DialogContent` (or a local `DialogPrimitive.Content` styled inline) rather than editing the shared centered `DialogContent` — do NOT regress `GapAcknowledgmentDialog` / `MarkAsDoneButton` which use the default centered modal. (epics §5.5; UX-DR16; UX Modal & Overlay Patterns "Slide-in panel")

4. The panel **header** (a `DialogTitle` for a11y) reads `"<Person> · <EpicKey> · <Cycle>"` (cycle rendered with the same `formatCycleTitle`/month form the matrix header uses — reuse, do NOT re-implement). Directly **below the header**, show the cell's **total hours** for that Epic (e.g. `"64 hours"`) computed from the same `ReportEpicWorklogs.totalSeconds` via `secondsToHours` (NEVER inline `/3600`). (epics §5.5; FR31)

**Ticket evidence list — client-side filter of preserved records (NO fetch)**

5. The panel body renders a **semantic `<ul>`** of the subtasks the report logged against **within this Epic this cycle**: one `<li>` per worklog record showing `<ticketKey> <ticketSummary>` and the per-ticket hours (e.g. `12.0h`). The records come from the chosen Epic's `ReportEpicWorklogs.worklogs[]` (preserved by Story 5.3: `{ ticketKey, ticketSummary, seconds, started?, updated? }`). Aggregate by `ticketKey` (a ticket may have multiple worklog records in-window — sum their `seconds` per ticket so each ticket appears once with its total). Sort ticket rows by descending hours (largest contribution first) so the manager sees the dominant tickets at the top; tie-break by `ticketKey` ascending for determinism. **No `GET /rest/api/3/issue/<epicKey>?expand=...` — the data is already in memory.** (epics §5.5; FR31; UX-DR16/UX-DR32)

6. **Empty state:** when the chosen `(report, Epic, cycle)` has no ticket records (e.g. an empty `──` cell was clicked, or the Epic resolved with zero retained worklogs), the panel body shows `"No tickets in <EpicKey> for <Person> this cycle."` instead of the list. (epics §5.5; UX-DR27)

**Per-ticket hours format**

7. Per-ticket hours render as **one decimal with an `h` suffix** to match the wireframe (`12.0h`, `32.0h`, `0.5h`). Use a single shared formatter — prefer extending/using `lib/hours.ts`. NOTE: the existing `secondsToHoursDisplay` strips the trailing `.0` (yields `12h`, not `12.0h`); the wireframe keeps the `.0`. Add a small `lib/hours.ts` formatter (e.g. `secondsToFixedHoursDisplay` → always one decimal + `h`) OR document the chosen format and keep it consistent — do NOT inline `toFixed(1)` + `'h'` in the component. The header total ("64 hours") uses the spelled-out "hours" word, NOT the `h` suffix (matches the wireframe). (epics §5.5; UX-DR11)

**Visibility warning — reuse `restrictedCount`, never fetch (NEW `components/manager/VisibilityWarning.tsx`)**

8. When the chosen Epic's `ReportEpicWorklogs.restrictedCount > 0` (computed in Story 5.4 — the count of visibility-restricted worklogs the manager cannot see, derived from the worklog endpoint `total` minus returned length), the panel renders a **`VisibilityWarning` chip at the bottom of the panel body**: `"⚠ N worklog(s) with restricted visibility were excluded from this view."` (singular/plural N correctly). The chip carries an explanatory long-form message (via `<title>` + `aria-label`, and a Radix `Tooltip` if/when the primitive exists — see Dev Notes; `title`+`aria-label` is the accepted a11y-equivalent fallback, matching how Story 5.4 shipped the lock/chip): `"<Person> has worklogs with team-restricted visibility on this Epic that you don't have permission to see. This may make the totals appear lower than reality."` The warning must clearly tell the manager their view may be incomplete. (epics §5.5; FR34; UX-DR16) Extract the chip as `components/manager/VisibilityWarning.tsx` (the UX component map names it) so Story 5.6 can reuse the same copy if it surfaces restriction in the approve flow.

9. When `restrictedCount === 0` the `VisibilityWarning` does NOT render (no chip, no empty container). The warning is per-`(report, Epic)` — use the chosen Epic's own `restrictedCount`, NOT the row-summed total (the row chip beside the name is Story 5.4's and stays; this panel scopes to one Epic).

**Open / close / focus (a11y — Radix-managed)**

10. The panel is dismissable via: (a) Esc, (b) clicking outside / the dimming overlay (drill-down is non-destructive → backdrop click closes, per the UX "Universal rules for overlays"), and (c) an explicit visible **"Close"** affordance (a `<button>` and/or the corner `✕`). All three route through `onOpenChange(false)` to clear `selectedCell`. On close the panel slides out (200 ms ease-out, `motion-safe:`) and **focus returns to the originating cell button** (Radix `Dialog` returns focus to the trigger automatically — preserve that; if the panel is controlled rather than trigger-driven, ensure the focus return still lands on the clicked cell, e.g. by storing/restoring the trigger ref). The matrix remains visible throughout — no navigation away. (epics §5.5; UX-DR16/UX-DR32)

11. While open, focus is trapped inside the panel; Tab / Shift+Tab cycle the panel's interactive content; the ticket list rows are not focus targets unless they carry an action (they do not in 5.5 — they are read-only evidence). (epics §5.5; UX-DR32 — inherited from Radix `Dialog`)

**Loading skeleton (degenerate — data is usually already present)**

12. The wireframe/epic call for a 3–5 row skeleton list "while the panel data is fetched". Since the panel filters in-memory records (no fetch), the skeleton applies only to the rare case where a cell is clicked **before its row's query has resolved** (the matrix would normally show a skeleton row, but defensively): if the row's `ReportCycleWorklogs` is not yet in `resolved` when the panel opens, show a **3-row skeleton list** (reuse the matrix's existing `motion-safe:animate-pulse` shimmer block; static under `prefers-reduced-motion: reduce`, no spinners) until the data arrives, then replace it with the list. In practice cells only become clickable on resolved rows, so this is a defensive path — keep it minimal. (epics §5.5; UX-DR26)

**Scope guardrails — leave 5.6 / 5.7 seams clean**

13. This story is **READ + DISPLAY only**. Do NOT add any Approve / Re-approve / ✓ Done action inside the panel; do NOT POST any comment; do NOT add the "X of N done" progress chip; do NOT alter approval fetching, dirty detection, `restrictedCount` computation, or the cell coloring (Stories 5.1/5.4 own those — consume their outputs). The row-end action area stays empty exactly as 5.3/5.4 left it. (Scope guardrails — see Dev Notes)

**Tests (`*.test.tsx` co-located)**

14. `components/manager/DrillDownPanel.test.tsx` (NEW): renders the header `"<Person> · <EpicKey> · <Cycle>"` + the total-hours line; renders a semantic `<ul>` with one `<li>` per ticket (`ticketKey` + summary + `Nh`), aggregated-per-ticket and sorted by descending hours; shows the empty state `"No tickets in <EpicKey> for <Person> this cycle."` when records are empty; renders the `VisibilityWarning` chip with the correct N (and singular/plural) when `restrictedCount > 0` and OMITS it when `0`; the panel does NOT trigger any Jira/network call (assert no fetcher/`jiraGet` mock is invoked — the panel takes records as props). Pure-ish component test (props in, no query mocks needed if the panel receives records as props).

15. `components/manager/ManagerMatrix.test.tsx` (UPDATE): clicking a data cell opens the panel (panel header text appears) populated from the resolved row records; the panel closes on Esc / on the Close affordance and the panel content disappears; clicking an empty `──` cell opens the panel in its empty state; **no Approve/Re-approve/✓ Done button or POST is present** (regression guard against 5.6/5.7 scope leak); the existing 5.4 cell coloring/lock/chip assertions still pass (no regression). Reuse the existing `useManagerRow` / `useEpicApprovals` / `useManagerReports` mocks already in the file.

16. `components/manager/VisibilityWarning.test.tsx` (NEW): renders the `"⚠ N worklog(s) …"` chip with correct singular ("1 worklog") vs plural ("3 worklogs"); the long-form explanatory text is present in `title`/`aria-label`; renders nothing (or a stable empty) when given `0`.

**Gates**

17. `npm run lint` (0 errors), `npm run compile` (`tsc --noEmit`, 0 errors), `npm run test --run` (all green; record before/after counts), `npm run build` (popup entrypoint builds). No `any`; named exports only; no barrel files; `@/` alias for cross-module imports; `lib/` modules React-free; no inline `*3600`/`/3600` (use `lib/hours.ts`); no `console.log` (use `lib/log.ts`); use the **hyphenated** `state-*` Tailwind utilities (Story 4.2/5.4 trap). (AR4, AR29)

## Tasks / Subtasks

- [x] **Task 1 — `components/manager/VisibilityWarning.tsx` (NEW): the restricted-visibility chip** (AC: 8, 9, 16)
  - [x] Props `{ restrictedCount: number; personName: string; epicKey: string }`. Renders nothing when `restrictedCount <= 0`.
  - [x] Chip copy `⚠ {n} worklog{n === 1 ? '' : 's'} with restricted visibility {n === 1 ? 'was' : 'were'} excluded from this view.` in `STRINGS`; long-form explanatory text in `title` + `aria-label` (the manager-incomplete-view message). Use a Radix `Tooltip` ONLY if the primitive exists in `components/ui/` — otherwise `title`+`aria-label` (matches Story 5.4's lock/chip fallback). Honest copy, no exclamation beyond the ⚠ glyph (UX-DR30/31).
  - [x] Co-located `components/manager/VisibilityWarning.test.tsx` (AC 16).

- [x] **Task 2 — `components/manager/DrillDownPanel.tsx` (NEW): the slide-in panel** (AC: 3, 4, 5, 6, 7, 10, 11, 12, 14)
  - [x] Build on the in-repo shadcn `Dialog` (`components/ui/dialog.tsx`). Controlled: `open` + `onOpenChange`. Right-anchored slide-in via a custom-styled `DialogPrimitive.Content` (or a `side="right"` variant of `DialogContent` with `fixed right-0 top-0 h-full` + slide animation) — do NOT mutate the shared centered `DialogContent` used by `GapAcknowledgmentDialog`.
  - [x] Props: the resolved `ReportEpicWorklogs | undefined` for the chosen Epic (or the records + total + restrictedCount), `personName`, `epicKey`, `cycle`. Header `DialogTitle` = `"<Person> · <EpicKey> · <Cycle>"` (reuse `formatCycleTitle`); total-hours line below from `secondsToHours(totalSeconds)`.
  - [x] Body: aggregate `worklogs[]` by `ticketKey` (sum seconds), sort desc by hours, tie-break `ticketKey` asc; render a semantic `<ul>`/`<li>` with `ticketKey` + `ticketSummary` + per-ticket hours (`12.0h` format — Task 4). Empty → the "No tickets in …" state (AC 6).
  - [x] `VisibilityWarning` at the bottom of the body, fed the Epic's `restrictedCount` (AC 8/9).
  - [x] Defensive skeleton (AC 12): if the row data is not yet resolved, show a 3-row pulse skeleton (`motion-safe:`), no spinner.
  - [x] Close: Esc / overlay click / visible "Close" button all → `onOpenChange(false)`. Slide-out 200 ms `motion-safe:`. Focus returns to the originating cell (Radix default; preserve it). All copy in `STRINGS`; `React.ReactElement` return type.
  - [x] Co-located `components/manager/DrillDownPanel.test.tsx` (AC 14) — pass records as props; assert NO network call.

- [x] **Task 3 — `components/manager/ManagerMatrix.tsx` (UPDATE): wire the click + one panel instance** (AC: 1, 2, 13, 15)
  - [x] Make `MatrixCell` an interactive trigger: wrap the cell content in a real `<button>` (Enter/Space/click; `focus-visible:ring-2 focus-visible:ring-accent`). Preserve the existing color/icon/stripe/lock treatment and the `<td>` `aria-label`; avoid double accessible-name announcement. Empty `──` cells are clickable too (open → empty state).
  - [x] Lift ONE `selectedCell: { report: DirectReport; epicKey: string } | null` state to `ManagerMatrix`. On cell click, set it (the cell needs an `onOpen(report, epicKey)` callback threaded from `ManagerMatrix` → row → cell; `report` is already in row props, `epicKey` is the column). Render ONE `<DrillDownPanel open={selectedCell !== null} … />` at the matrix level, fed the resolved `ReportEpicWorklogs` for `selectedCell` from the existing `resolved` map (no new fetch). `onOpenChange(false)` → `setSelectedCell(null)`.
  - [x] **Do NOT** add Approve/Re-approve/✓ Done buttons, POST anything, add the "X of N done" chip, or touch approval/dirty/restricted/coloring logic (5.6/5.7 seams clean; 5.1/5.4 outputs consumed read-only).
  - [x] Update `components/manager/ManagerMatrix.test.tsx` (AC 15) — reuse existing mocks; add open/close/empty-cell + scope-leak regression assertions.

- [x] **Task 4 — `lib/hours.ts` (UPDATE, pure): one-decimal `h` formatter for ticket rows** (AC: 7, 17)
  - [x] Add a tiny `secondsToFixedHoursDisplay(seconds): string` → always one decimal + `h` (`12.0h`, `0.5h`; `──` or `0.0h` for ≤0 — match the existing `──` convention or document the choice). Reuse `secondsToHours`; NEVER inline `/3600`. Co-located test in `lib/hours.test.ts` if that file exists (otherwise add a focused case where hours formatters are tested). If a suitable formatter already fits, reuse it and document — do NOT add a redundant one.

- [x] **Task 5 — Verify all gates** (AC: 17)
  - [x] `./node_modules/.bin/eslint .` (0 errors), `./node_modules/.bin/tsc --noEmit` (0 errors), `npm run test --run` (all green; record before/after), `npm run build` (popup builds). (`npx` is intercepted by the `rtk` proxy — run binaries via `./node_modules/.bin/*`; the project uses **npm** scripts.)

## Dev Notes

### What this story IS (scope guardrails — read first)

This is the **read-only drill-down panel** layered onto the matrix Stories 5.3 (neutral grid + preserved per-ticket records) and 5.4 (cell coloring + per-Epic `restrictedCount`) already built. Deliver: (1) make each `MatrixCell` a keyboard-operable trigger; (2) ONE slide-in `DrillDownPanel` (Radix `Dialog`, right-anchored) owned by `ManagerMatrix`; (3) a per-ticket evidence `<ul>` filtered **client-side** from the already-fetched `ReportEpicWorklogs.worklogs[]` (NO new Jira fetch); (4) the `VisibilityWarning` chip driven by the Epic's `restrictedCount`; (5) Radix-managed focus trap / Esc / backdrop / focus-return. The panel must clearly tell the manager their view may be incomplete when worklogs are hidden.

**Explicitly DEFER — leave clean seams, do NOT build:**
- **Story 5.6 / 5.7** — the Approve / Re-approve / ✓ Done actions, the per-Epic fan-out POSTING of versioned approval comments, and the "X of N done" progress chip. **This story READS the matrix data + approvals only — it never POSTs.** Do NOT add any action button inside the panel; the panel is pure evidence display. Leave the row-end action area empty as 5.3/5.4 left it.
- **Story 5.8** — non-canonical-manager read-only mode. Out of scope.
- Do NOT recompute `restrictedCount`, dirty status, approval anchors, or cell coloring — consume Stories 5.4/5.1 outputs as-is.

### The data is ALREADY fetched — the panel filters in memory (the load-bearing decision)

Story 5.3 deliberately preserved per-ticket records so this panel needs **zero network**. The matrix's per-row query (`useManagerRow` → `fetchReportCycleWorklogsByEpic`) resolves a `ReportCycleWorklogs = { epics: ReportEpicWorklogs[]; restrictedCount }`, and `ManagerMatrix` already lifts each into a `resolved: Map<accountId, ReportCycleWorklogs>` (`components/manager/ManagerMatrix.tsx:143`). The chosen Epic's `ReportEpicWorklogs` (`lib/jira-types.ts:256-268`) carries:
- `totalSeconds` — the header total ("64 hours").
- `worklogs: Array<{ ticketKey, ticketSummary, seconds, started?, updated? }>` — the evidence list (filter/aggregate client-side).
- `restrictedCount` (per-Epic, Story 5.4) — drives the `VisibilityWarning`.

So the panel takes the resolved `ReportEpicWorklogs` (or `undefined` while the row loads) + `personName` + `epicKey` + `cycle` as **props**. **Do NOT** call `fetchReportCycleWorklogsByEpic`, `jiraGet`, or `GET …/issue/<epicKey>?expand=…` — the epic AC explicitly forbids it. This keeps the panel a pure presentational component (easy to test, instant to open).

Aggregation note: a single ticket can appear as multiple `worklogs[]` records (multiple worklog entries on the same subtask in-window). Sum `seconds` per `ticketKey` so each ticket is one `<li>` with its total; `ticketSummary` is stable per ticket (take any). Sort desc by summed hours, tie-break `ticketKey` asc, for a deterministic, manager-useful order.

### The cell click seam (left clean by 5.3/5.4)

Story 5.4's `MatrixCell` (`components/manager/ManagerMatrix.tsx:488-567`) renders a `<td>` with the color/icon/stripe/lock treatment and a per-cell `aria-label`, and the 5.4 dev notes record: *"cells remain click-affordance-ready but the drill-down panel is 5.5 (NOT built)."* No click handler exists yet — this story adds it. Make the cell's inner content a real `<button>` (semantic, keyboard-operable, focus-ring) so it is reachable by Tab and announces correctly. Keep the `<td>`'s color classes / dirty stripe / lock overlay intact — wrap, don't replace. Avoid duplicating the accessible name: the `<td>` currently owns `aria-label`; if you put the button inside, either move the label to the button or keep it on the `<td>` and leave the button unlabeled-but-described — pick one path and assert it in the test (no double announcement). The row already has `report` in scope and the column map gives `epicKey`, so threading an `onOpen(report, epicKey)` callback down is straightforward.

### Panel primitive — reuse the installed Radix `Dialog` (not a new dependency)

`@radix-ui/react-dialog` is installed and `components/ui/dialog.tsx` is the shadcn wrapper (focus-trap, Esc, ARIA modal, `DialogClose`, backdrop overlay, focus-return-to-trigger — all free). The UX spec's component table lists `popover` for the drill-down (line 367), but the **Modal & Overlay Patterns** table (lines ~1660-1680) describes a "Slide-in panel: Slides in from right, parent context stays visible behind, Esc closes" with "Focus management via Radix primitives (already correct by default)" — the `Dialog` primitive satisfies all of this and is already in-repo, so **reuse `Dialog`** rather than installing Radix Popover/Sheet. The only deviation from the shared `DialogContent` is positioning: render a **right-anchored, full-height** content (`fixed right-0 top-0 h-full`, slide-in-from-right animation) instead of the centered modal. Implement this as a NEW styled `DialogPrimitive.Content` inside `DrillDownPanel` (or a `side`-variant), **without editing the shared `DialogContent`** (don't regress `GapAcknowledgmentDialog`/`MarkAsDoneButton`, which rely on the centered default — see `components/week/GapAcknowledgmentDialog.tsx` for the canonical `Dialog` usage pattern: controlled `open`, `onOpenChange(false)` → cancel, `onOpenAutoFocus` to steer initial focus). The dimming overlay keeps the matrix faintly visible behind (UX-DR16); since drill-down is non-destructive, backdrop click closes (unlike the destructive dialogs, which require explicit cancel).

Animation: Tailwind `tailwindcss-animate` data-state classes are already used by `dialog.tsx` (`data-[state=open]:animate-in` etc.). For the right slide use `data-[state=open]:slide-in-from-right` / `data-[state=closed]:slide-out-to-right` (or an equivalent translate transition) gated by `motion-safe:`; ensure it is instant / non-animated under `prefers-reduced-motion: reduce` (UX-DR33). Confirm the slide-* utilities exist (tailwindcss-animate provides them); if not, fall back to a `motion-safe:transition-transform translate-x` approach.

### Tooltip primitive status (consistent with Story 5.4)

There is **no Radix/shadcn `tooltip` primitive in `components/ui/`** (Story 5.4 confirmed this and shipped the lock/row-chip with `title` + `aria-label` as the a11y-equivalent fallback). The `VisibilityWarning` chip's long explanatory text uses the same fallback: `title` + `aria-label`. Do NOT add a tooltip dependency for this story; Epic 6's a11y audit owns final tooltip polish. (UX names a `Tooltip` for the warning, but the fallback is explicitly accepted in-repo.)

### Hours formatting (subtle — the wireframe wants `12.0h`)

- Per-ticket rows: the wireframe shows `12.0h`, `32.0h` — **one decimal, `h` suffix, `.0` retained**. `lib/hours.ts`'s `secondsToHoursDisplay` strips `.0` (→ `12h`) and `secondsToCellDisplay` has no `h` suffix (→ `12.0`). Add a small `secondsToFixedHoursDisplay` (always one decimal + `h`) or document the chosen variant; never inline `toFixed(1)`+`'h'`. Decide the `≤0` rendering (a ticket with 0s should not appear after aggregation, but be defensive).
- Header total: spelled-out — `"64 hours"` (NOT `64h`), from `secondsToHours(totalSeconds)` rounded sensibly (whole when whole, else one decimal — mirror `formatCellHours` for the number, append " hours"). Singular/plural ("1 hour" vs "N hours") is a nice-to-have; the wireframe always shows plural — keep it simple but honest.

### Files to read before coding

- **`components/manager/ManagerMatrix.tsx`** — `MatrixCell` (lines 488-567, the click seam to wire); `ManagerMatrix` owns `resolved: Map<accountId, ReportCycleWorklogs>` (line 143) — the panel's data source; `formatCycleTitle` (line 122) — reuse for the panel header; `ManagerMatrixRow` (line 348) threads `report`/`columns` you need for `onOpen`.
- **`components/ui/dialog.tsx`** — the shadcn Radix `Dialog` wrapper (`Dialog`, `DialogContent`, `DialogTitle`, `DialogClose`, overlay). Build the right slide-in on this; do NOT edit the shared `DialogContent`.
- **`components/week/GapAcknowledgmentDialog.tsx`** — the canonical in-repo `Dialog` usage: controlled `open`, `onOpenChange(next => { if (!next) onCancel() })`, `onOpenAutoFocus` to steer focus, `STRINGS`. Mirror this shape.
- **`lib/jira-types.ts:256-280`** — `ReportEpicWorklogs` (`totalSeconds`, `restrictedCount`, `worklogs[]` with `ticketKey/ticketSummary/seconds/started?/updated?`) and the `ReportCycleWorklogs` wrapper. The panel's prop contract.
- **`lib/hours.ts`** — `secondsToHours`, `secondsToHoursDisplay` (`12h`), `secondsToCellDisplay` (`12.0`); add/choose the `12.0h` formatter. Never inline `/3600`.
- **`_bmad-output/implementation-artifacts/5-3-…md`** (Completion Notes) — the per-ticket records preserved (the panel's source); the data-contract intent for THIS story.
- **`_bmad-output/implementation-artifacts/5-4-…md`** (Dev Notes + Completion Notes) — `restrictedCount` semantics, the lock/chip `title`+`aria-label` fallback pattern (no tooltip primitive), the "drill-down is 5.5, cells click-affordance-ready" seam note, the hyphenated-token gotcha.
- **`_bmad-output/planning-artifacts/ux-design-specification.md`** — drill-down wireframe (lines ~1022-1044), Modal & Overlay "Slide-in panel" rules (~1660-1680), `DrillDownPanel`/`VisibilityWarning` component specs (~1500-1526), UX-DR16/UX-DR7/UX-DR26/UX-DR32.

### Architecture & convention guardrails (binding — AR/UX-DR)

- **NO new Jira fetch** — the panel is pure presentation over already-resolved query data (epics §5.5; architecture "server state through TanStack Query, never copy into local React state" — here the panel READS the resolved query data passed as props, it does not duplicate or re-fetch it). Do NOT call `jiraGet` / any fetcher / `GET …/issue?expand`.
- **Reuse the installed Radix `Dialog`** — no new dependency (no Popover/Sheet/vaul). Focus trap, Esc, ARIA modal, focus-return are inherited; don't hand-roll them.
- **`lib/` stays React-free** — the only `lib/` change is the optional pure `secondsToFixedHoursDisplay` in `lib/hours.ts` (+ its test). All panel logic lives in `components/`.
- **Semantic HTML + a11y (NFR12/13, UX-DR32):** the trigger is a real `<button>`; the panel uses `DialogTitle`/`DialogDescription` for the accessible name; the evidence list is a semantic `<ul>`/`<li>`; the warning carries `title`+`aria-label`. Visible `focus-visible:ring-2 focus-visible:ring-accent` on the cell button and the Close button. Focus returns to the originating cell on close.
- **Motion (UX-DR7/UX-DR33):** slide-in/out 200 ms ease-out under `motion-safe:`; instant under `prefers-reduced-motion: reduce`. No spinners (skeleton is a pulse block).
- **STRINGS co-located (UX-DR31):** all new copy in a `STRINGS` const; honest, no exclamation marks beyond the ⚠ glyph (UX-DR30).
- **Popup width 360 px:** the panel overlays part of the popup — constrain its width (e.g. ~300-320 px) so it fits and the matrix stays partly visible behind; do not overflow.
- **ESLint (AR4):** `PascalCase.tsx` components; kebab-case `lib/`; named exports only; no `any`; no `console.log` (use `lib/log.ts`); no inline `*3600`/`/3600`; import order; no barrel files; `@/` alias.
- **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`): guard array indexing; spread optional props conditionally.

### Previous-story intelligence

- **Story 5.3 (done):** preserved per-ticket `worklogs[]` (with `ticketSummary`/`seconds`/`updated`) **specifically so this panel can filter client-side** — confirmed in its Completion Notes ("5.5 drill-down filters records client-side"). The `resolved` map + `ReportCycleWorklogs` wrapper are the data source. Subtask→Epic rollup walks one grandparent level; the panel consumes whatever Epic groups 5.3 produced (orthogonal to 5.5).
- **Story 5.4 (done):** added per-Epic `restrictedCount` (the `VisibilityWarning` driver) and the cell coloring/icons/stripe/lock; `MatrixCell` left click-affordance-ready (no handler) for THIS story. Shipped the lock/row-chip with `title`+`aria-label` (no tooltip primitive in-repo) — reuse that fallback for the warning chip. The hyphenated `state-*` token gotcha (4.2/5.4) still applies if the warning chip reuses `state-warning-subtle`.
- **Story 4.5 (done):** `GapAcknowledgmentDialog` is the in-repo `Dialog` usage template (controlled, `onOpenChange`, `onOpenAutoFocus`, `STRINGS`).
- **Gate baseline (after 5.4):** 66 suites / 838 passed / 1 skipped; tsc 0; eslint 0 errors / 57 pre-existing import/order warnings. Keep new files warning-clean; record before/after.

### What NOT to do (disaster prevention)

1. Do **NOT** fetch anything — no `jiraGet`, no `fetchReportCycleWorklogsByEpic`, no `GET …/issue/<epicKey>?expand`. Filter the already-resolved `ReportEpicWorklogs.worklogs[]` in memory (epics §5.5 forbids the fetch explicitly).
2. Do **NOT** install a new dependency — reuse the installed Radix `Dialog`. No Popover/Sheet/vaul.
3. Do **NOT** edit the shared centered `DialogContent` in `components/ui/dialog.tsx` — add a right-anchored variant inside `DrillDownPanel` so `GapAcknowledgmentDialog`/`MarkAsDoneButton` don't regress.
4. Do **NOT** mount one panel per cell — `ManagerMatrix` owns ONE `<DrillDownPanel>` + `selectedCell` state.
5. Do **NOT** add any Approve/Re-approve/✓ Done action or POST inside the panel, nor the "X of N done" chip — those are 5.6/5.7. The panel is evidence-only.
6. Do **NOT** recompute `restrictedCount`, dirty status, approval anchors, or cell coloring — consume 5.4/5.1 outputs.
7. Do **NOT** double-announce the cell (avoid `aria-label` on both `<td>` and the inner button).
8. Do **NOT** inline `toFixed(1)`+`'h'` or `/3600` — use a `lib/hours.ts` formatter.
9. Do **NOT** hand-roll focus trap / Esc / backdrop — Radix `Dialog` provides them; ensure focus returns to the clicked cell on close.
10. Do **NOT** use the underscore/dot token names from planning docs (`state.warning_subtle`); use hyphenated `bg-state-warning-subtle` if reusing the warning color (4.2/5.4 trap).
11. Do **NOT** make the warning preachy — it states the fact ("This may make the totals appear lower than reality."), no accusation, no exclamation beyond the ⚠ glyph (UX-DR30, the "Curiosity, not suspicion" tone).

### Project Structure Notes

All locations match `architecture.md` / the UX component map: `components/manager/DrillDownPanel.tsx` (UX line ~1508) + co-located test; `components/manager/VisibilityWarning.tsx` (UX line ~1519) + test; `components/manager/ManagerMatrix.tsx` (UPDATE — wire the click + one panel instance). The only `lib/` touch is the optional pure `secondsToFixedHoursDisplay` in `lib/hours.ts`. No new dependencies (React 18, TanStack Query v5, date-fns v4, Zod v3, Tailwind v4, lucide-react, `@radix-ui/react-dialog` all present). No manifest/permission changes. No service-worker changes (no fetch).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5 (lines 1358-1392)] — full ACs: click cell → right slide-in panel (200 ms, matrix visible behind, UX-DR16); header "<Person> · <EpicKey> · <Cycle>" + total hours; NO `?expand` fetch — filter the per-row records client-side; semantic `<ul>` of `<ticketKey> <summary> + <hours>h`; `VisibilityWarning` chip "⚠ N worklog(s) … excluded" + tooltip explanation (FR34); empty state "No tickets in <EpicKey> for <Person> this cycle."; Esc / outside-click / Close all dismiss; Radix focus management + focus-return.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3 (1284-1322) / 5.4 (1324-1356) / 5.6 (1393-1438)] — the matrix this drills into; preserved per-ticket records + `restrictedCount` it consumes; deferred approve fan-out POST (5.6 seam).
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 + FR31/FR34] — per-ticket evidence drill-down; visibility-restriction warning.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Drill-down wireframe (lines ~1022-1044)] — header `Sarah · PROJ-A · May`, `64 hours`, ticket rows `PROJ-A-101 Epic planning` / `12.0h`, `⚠ 1 worklog with restricted visibility was excluded`, `[Close]`.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Modal & Overlay Patterns (lines ~1660-1680)] — "Slide-in panel (drill-down): Slides in from right, parent context stays visible behind, Esc closes"; universal overlay rules (always Esc-dismissable, visible close, backdrop-click closes non-destructive overlays, focus via Radix).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component specs (lines ~1456, ~1508-1526)] — `DrillDownPanel.tsx` (loading / loaded / has-visibility-warning), `VisibilityWarning.tsx` (shown when restricted entries detected); "Click cell → opens DrillDownPanel (slides in from right)".
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR16 / UX-DR7 / UX-DR26 / UX-DR32 / UX-DR30-31] — drill-down keeps parent visible; 200 ms ease-out motion; skeleton 3-5 rows; semantic table/list + Radix focus; honest non-preachy copy.
- [Source: components/manager/ManagerMatrix.tsx:122,143,488-567] — `formatCycleTitle` (reuse), `resolved` map (data source), `MatrixCell` (click seam to wire).
- [Source: components/ui/dialog.tsx] — the installed shadcn Radix `Dialog` to build the slide-in on (do NOT edit the shared centered `DialogContent`).
- [Source: components/week/GapAcknowledgmentDialog.tsx] — canonical in-repo `Dialog` usage (controlled open, `onOpenChange`, `onOpenAutoFocus`, `STRINGS`).
- [Source: lib/jira-types.ts:256-280] — `ReportEpicWorklogs` (`totalSeconds`, `restrictedCount`, `worklogs[]`) + `ReportCycleWorklogs` — the panel's prop contract.
- [Source: lib/hours.ts:76-98] — `secondsToHours` / `secondsToHoursDisplay` / `secondsToCellDisplay`; add/choose the `12.0h` formatter; never inline `/3600`.
- [Source: _bmad-output/implementation-artifacts/5-4-…md (Dev Notes "Tooltip primitive note", "Leave clean seams for 5.5")] — no tooltip primitive → `title`+`aria-label` fallback; the cell click-affordance seam.
- [Source: _bmad-output/implementation-artifacts/5-3-…md (Completion Notes "Data contract preserved")] — per-ticket records preserved expressly for this panel.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8)

### Debug Log References

- Initial `DrillDownPanel.test.tsx` run surfaced an unhandled `@wxt-dev/storage` rejection because the panel imported `formatCycleTitle` from `ManagerMatrix.tsx`, which transitively loads the storage boundary at module init. Resolved by extracting `formatCycleTitle` into a React-free `lib/cycle-title.ts` that both the matrix and the panel import (no heavyweight cross-component import).
- ESLint `import/order` initially flagged the new sibling imports: in this repo's config the `@/` alias resolves to the `external` group, so relative (`./`) sibling imports must be ordered BEFORE the `@/` imports. Reordered the three touched files accordingly; new files are warning-clean (total warnings back to the 57 baseline).

### Completion Notes List

- **Task 4 — `lib/hours.ts`:** Added pure `secondsToFixedHoursDisplay(seconds)` → always one decimal + `h` (`12.0h`, `0.5h`), defensive `0.0h` for ≤0 (chosen over the `──` glyph because the panel only renders aggregated tickets with >0 seconds; documented in the JSDoc). Reuses `secondsToHours`; no inline `/3600`. Six co-located tests in `lib/hours.test.ts`.
- **Task 1 — `VisibilityWarning.tsx`:** Renders nothing for `restrictedCount <= 0` (AC 9). Chip copy + long-form explanation in a co-located `STRINGS`; correct singular/plural ("1 worklog … was" vs "3 worklogs … were"). Long-form message carried via `title` + `aria-label` (the in-repo a11y fallback Story 5.4 established — no tooltip primitive exists in `components/ui/`). Uses the hyphenated `bg-state-warning-subtle` / `text-state-warning` tokens (4.2/5.4 trap avoided). `epicKey` kept in the prop contract per the story (scopes the warning per-Epic for 5.6 reuse). 5 tests.
- **Task 2 — `DrillDownPanel.tsx`:** Right-anchored slide-in built on a NEW styled `DialogPrimitive.Content` (`fixed right-0 top-0 h-full w-[300px] max-w-[85%]`, `motion-safe:slide-in-from-right` / `slide-out-to-right` via the in-repo `tw-animate-css`, 200 ms) — the shared centered `DialogContent` is NOT touched (no `GapAcknowledgmentDialog`/`MarkAsDoneButton` regression). Controlled `open` + `onOpenChange`. Header `DialogTitle` = `"<Person> · <EpicKey> · <Cycle>"` (reuses `formatCycleTitle`); total-hours line "N hours" from `secondsToHours(totalSeconds)` (whole when whole, else one decimal). Body aggregates `worklogs[]` by `ticketKey` (sums seconds → one `<li>` per ticket), sorts desc by hours with `ticketKey` asc tie-break; semantic `<ul>`/`<li>` with `ticketKey` + `ticketSummary` + `secondsToFixedHoursDisplay`. Empty state "No tickets in <EpicKey> for <Person> this cycle." (AC 6). `VisibilityWarning` at the bottom fed the Epic's own `restrictedCount`. Defensive 3-row pulse skeleton (`data-testid="drilldown-skeleton"`) when `epic === undefined` (AC 12). Esc / backdrop / visible ✕ Close (`aria-label="Close"`) all route through `onOpenChange(false)`; Radix focus-trap + focus-return-to-trigger inherited. **No fetch** — records arrive as props; a `globalThis.fetch` spy asserts zero calls. 14 tests.
- **Task 3 — `ManagerMatrix.tsx`:** `MatrixCell` content is now a real `<button>` (Enter/Space/click, `focus-visible:ring-2 focus-visible:ring-accent`); the `<td>` keeps its color/icon/stripe/lock treatment. **Accessible-name decision:** moved the `aria-label` from the `<td>` ONTO the button (the interactive element) and made the inner lock glyph `aria-hidden` so the cell is announced exactly once (AC 1 explicitly allows either path; the button-as-name-source avoids double announcement). One `selectedCell` state + ONE `<DrillDownPanel>` lifted to `ManagerMatrix`; `onOpen(report, epicKey)` threaded matrix → row → cell. The selected Epic is read from the existing `resolved` map (no fetch); a resolved row with no matching Epic yields a synthetic empty group (→ empty state), an unresolved row yields `undefined` (→ skeleton). Empty `──` cells are clickable. No approve/re-approve/done action, no POST, no "X of N done" chip added — 5.6/5.7 seams left clean; 5.1/5.4 outputs consumed read-only. Added 6 ManagerMatrix tests (open populated from records, close via Close, close via Esc, empty-cell empty state, scope-leak regression guard, per-Epic warning in panel); all 16 prior 5.3/5.4 assertions still pass.
- **Scope guardrails honored:** READ + DISPLAY only — no Jira fetch, no new dependency, no `DialogContent` mutation, one panel instance, no approval/dirty/restricted/coloring recompute.
- **Gates (Task 5):** vitest 68 suites / 869 passed / 1 skipped (baseline 66 / 838 / 1 → +2 suites, +31 tests, 0 regressions); `tsc --noEmit` 0 errors; `eslint .` 0 errors / 57 warnings (all pre-existing import/order; baseline 57 — new files clean); `wxt build` succeeds (popup + all entrypoints).

### File List

- `lib/hours.ts` (UPDATE) — added pure `secondsToFixedHoursDisplay`.
- `lib/hours.test.ts` (UPDATE) — added `secondsToFixedHoursDisplay` cases.
- `lib/cycle-title.ts` (NEW) — extracted React-free `formatCycleTitle` (shared by matrix + panel).
- `components/manager/VisibilityWarning.tsx` (NEW) — restricted-visibility chip.
- `components/manager/VisibilityWarning.test.tsx` (NEW).
- `components/manager/DrillDownPanel.tsx` (NEW) — right-anchored slide-in drill-down panel.
- `components/manager/DrillDownPanel.test.tsx` (NEW).
- `components/manager/ManagerMatrix.tsx` (UPDATE) — cell `<button>` trigger, `selectedCell` state, one `DrillDownPanel`; `formatCycleTitle` now imported from `lib/cycle-title`.
- `components/manager/ManagerMatrix.test.tsx` (UPDATE) — open/close/Esc/empty-cell + scope-leak + per-Epic-warning tests.
- `_bmad-output/implementation-artifacts/5-5-…md` (UPDATE) — status, frontmatter, tasks, Dev Agent Record.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE) — 5-5 → review.

## Review Findings

_Code review 2026-06-27 (3 parallel layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor). Baseline `548c557`. 3 patches applied, 3 deferred, 8 dismissed as noise/false-positive._

- [x] [Review][Patch] Header total showed bare "0 hours" for a tiny-but-nonzero Epic total [components/manager/DrillDownPanel.tsx:59] — `formatTotalHours` stripped `.0` like `formatCellHours` but lacked the latter's `display === '0'` guard, so an Epic with `1 ≤ totalSeconds < 108s` (matrix cell renders `──`) opened a panel reading "0 hours" above a populated ticket list. Fixed: keep the one-decimal form (e.g. "0.0 hours") when the total is >0 but rounds to "0". Test added.
- [x] [Review][Patch] Focus not returned to the originating cell on close [components/manager/ManagerMatrix.tsx:138] — the panel is controlled + conditionally unmounted (no `DialogTrigger`), so Radix's focus-return-to-trigger cannot run against the torn-down tree (AC 10 risk). Fixed: `ManagerMatrix` captures the active cell button on open and refocuses it (deferred a frame) on close via `handleClosePanel`. Test added asserting `document.activeElement` returns to the cell.
- [x] [Review][Patch] Radix `Dialog.Content` missing Description → console warning [components/manager/DrillDownPanel.tsx:110] — the panel has a `Title` but no `Description`; Radix logs a "Missing Description or aria-describedby" warning on every open. Fixed: added `aria-describedby={undefined}` (the Title is the accessible name).
- [x] [Review][Defer] "No tickets…" empty copy co-renders with the VisibilityWarning for a restricted-only Epic [components/manager/DrillDownPanel.tsx:144] — when every worklog is visibility-restricted (`totalSeconds 0`, `worklogs []`, `restrictedCount > 0`) the panel shows "No tickets…" then the ⚠ warning. Deferred: coherent — the warning directly below explains the absence; copy polish is Epic 6's a11y/copy audit. Low value.
- [x] [Review][Defer] Backdrop/overlay click-to-close (AC 10b) not covered by a test [components/manager/DrillDownPanel.tsx:105] — Esc and Close are tested; outside-click is Radix-default but its `DismissableLayer` pointer semantics don't fire reliably under jsdom (a synthetic `pointerDown` does not close). Deferred to E2E/manual; behavior is inherited from Radix and works in-browser.
- [x] [Review][Defer] Open panel mutates live / can show a removed report on background refetch [components/manager/ManagerMatrix.tsx:277] — `selectedEpic` recomputes from the live `resolved` map; a background refetch updates the open panel and a removed report leaves a stale `selectedCell.report` snapshot. Deferred: low-likelihood edge, not introduced as a defect; panels are short-lived.
- [x] [Review][Dismiss] `aggregateTickets` keeps first-seen `ticketSummary` on duplicate keys — false positive: the resolver sets `ticketSummary` from `issue.fields.summary`, identical for every worklog of the same `ticketKey`; divergent summaries are not reachable.
- [x] [Review][Dismiss] `localeCompare` tie-break not numeric (`PROJ-10` before `PROJ-2`) — only on exact-seconds ties; deterministic; matches the repo-wide column sort convention. Cosmetic, out of scope.
- [x] [Review][Dismiss] Negative seconds row/total divergence — `timeSpentSeconds` is non-negative from Jira; not reachable.
- [x] [Review][Dismiss] `secondsToFixedHoursDisplay` shows `0.0h` for <180s tickets — matches the repo-wide `toFixed(1)` rounding convention (`secondsToCellDisplay`/`formatCellHours`); consistent, not a defect.
- [x] [Review][Dismiss] `VisibilityWarning` Props includes unused `epicKey` — intentional: the spec mandates `epicKey` in the contract for Story 5.6 reuse; it is not destructured in params so no lint error.
- [x] [Review][Dismiss] `formatCycleTitle` weekly/out-of-range edge — byte-identical extraction of pre-existing matrix logic; not changed by this story.
- [x] [Review][Dismiss] `formatTotalHours` regex brittle if `toFixed` arg changes — correct as written; speculative.
- [x] [Review][Dismiss] Errored-row → infinite skeleton in panel — cells on unresolved/error rows are not clickable (skeleton rows render no buttons); defensive-only path.

## Change Log

| Date       | Change                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| 2026-06-27 | Story 5.5 implemented: read-only drill-down panel (right-anchored Radix `Dialog` slide-in) with per-ticket evidence list (client-side aggregate of preserved `worklogs[]`, no fetch), header total, defensive skeleton, and the `VisibilityWarning` chip driven by per-Epic `restrictedCount`. `MatrixCell` made a keyboard-operable `<button>` trigger; `ManagerMatrix` owns one panel + `selectedCell`. Added `secondsToFixedHoursDisplay` + extracted `formatCycleTitle` to `lib/cycle-title.ts`. Status → review. |
| 2026-06-27 | Code review (3 layers): 3 patches applied — header "0 hours" guard for tiny-nonzero totals, focus-return-to-cell on panel close (`handleClosePanel` + `requestAnimationFrame`), `aria-describedby={undefined}` to silence the Radix Description warning; +2 tests. 3 deferred, 8 dismissed. Gates green (68 suites / 871 passed / 1 skipped; tsc 0; eslint 0 errors / 57 baseline warnings; build ok). Status → done. |
