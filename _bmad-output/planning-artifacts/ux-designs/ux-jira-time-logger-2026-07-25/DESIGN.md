---
name: jira-time-logger
description: KKP-branded Chrome extension for daily Jira time logging and monthly manager approval. Inherits the KKP corporate design system; shadcn/ui + Tailwind v4 provide the component substrate. This file specifies the KKP layer and the product's deltas.
status: final
updated: 2026-07-25
colors:
  # KKP brand — Legacy Purple is the ONLY brand colour. No sub-brand accents.
  legacy-purple: '#594F74'
  royal-purple: '#615B99'
  purple-deep: '#4A4163'
  grandeur-grey: '#ADACB9'
  grandeur-lite: '#E7E7ED'

  # Data canvas — neutrals warmed toward purple
  background: '#FAFAFB'
  surface: '#FFFFFF'
  surface-sunk: '#FCFCFD'
  foreground: '#1E1B2E'
  muted: '#6B6678'
  faint: '#6B6B72'
  faint-decorative: '#ADACB9'
  border: '#E4E3EC'
  border-faint: '#F0EFF5'
  border-hairline: '#F4F3F8'
  weekend: '#F1F0F6'

  primary: '#594F74'
  primary-foreground: '#FFFFFF'
  primary-soft: '#ECEBF3'

  # Status — meaning is fixed, never remapped
  status-clean: '#15803D'
  status-dirty: '#B45309'
  status-recomputing: '#615B99'
  status-error: '#DC2626'

  # Amber tints — derived from status-dirty, no new hue introduced
  amber-soft: '#FFF8EC'
  amber-border: '#EDD3A6'
  amber-ink: '#7A3E06'

  # Error tints — used ONLY for failed writes, never for below-target
  error-soft: '#FEF2F2'
  error-border: '#F3C9C9'
  error-ink: '#991B1B'

  # Success outline button border. status-clean on white is 4.9:1.
  status-clean-border: '#BFE0C8'
  # status-clean has no contrast on the purple gradient — chrome-only variant.
  status-clean-on-chrome: '#8FE0A8'
typography:
  display:
    fontFamily: Kanit
    fontSize: 26px
    fontWeight: '600'
    lineHeight: '1.15'
  display-sm:
    fontFamily: Kanit
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.15'
  heading:
    fontFamily: Kanit
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '1.5'
  subheading:
    fontFamily: Kanit
    fontSize: 13.5px
    fontWeight: '600'
    lineHeight: '1.4'
  label:
    fontFamily: Kanit
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.5'
    letterSpacing: 0.01em
  eyebrow:
    fontFamily: Kanit
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.1em
  body:
    fontFamily: Noto Sans
    fontSize: 13.5px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Noto Sans
    fontSize: 12.5px
    fontWeight: '400'
    lineHeight: '1.5'
  caption:
    fontFamily: Noto Sans
    fontSize: 11.5px
    fontWeight: '400'
    lineHeight: '1.45'
  num:
    fontFamily: Kanit
    fontSize: 13px
    fontWeight: '500'
    note: 'Always font-variant-numeric: tabular-nums. KKP has no monospace.'
  guest:
    # The banner cannot load the bundled faces — see § The Guest Surface.
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: 13px
    fontWeight: '400'
    note: 'tabular-nums still applies; it works on any system face.'
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 10px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '6': 24px
  '8': 32px
  popup-gutter: 14px
  page-gutter: 26px
  section-gap: 18px
components:
  chrome-header:
    background: 'linear-gradient(165deg, {colors.royal-purple} 0%, {colors.legacy-purple} 42%, {colors.purple-deep} 100%)'
    color: '{colors.primary-foreground}'
    padding-popup: '14px 16px 20px'
    padding-page: '18px 26px 20px'
    motif: 'concentric rings, 1.5px, rgba(255,255,255,.12–.15), anchored off the top-right corner'
  resume-card:
    background: '{colors.surface}'
    border: '1px solid #DEDCE9'
    radius: '{rounded.lg}'
    padding: 14px
    shadow: '{elevation.lift}'
    offset: '-10px — deliberately breaks the chrome baseline'
  data-card:
    background: '{colors.surface}'
    border: '1px solid {colors.border}'
    radius: '{rounded.lg}'
    shadow: '0 1px 2px rgba(74,65,99,.05)'
  list-row:
    padding: '9px 11px'
    divider: '1px solid {colors.border-faint}'
    hover: '{colors.background}'
  button-primary:
    background: '{colors.primary}'
    color: '{colors.primary-foreground}'
    hover: '{colors.royal-purple}'
    radius: '{rounded.md}'
    font: '{typography.label}'
    padding: '9px 16px'
  button-secondary:
    background: '{colors.surface}'
    color: '{colors.primary}'
    border: '1px solid {colors.border}'
    hover: '{colors.primary-soft}'
    radius: '{rounded.md}'
  button-ghost:
    background: transparent
    color: '{colors.muted}'
    hover-color: '{colors.primary}'
  count-pill:
    background: '{colors.primary-soft}'
    color: '{colors.primary}'
    radius: '{rounded.full}'
    padding: '1px 7px'
    font: '{typography.eyebrow}'
    on-chrome: 'background rgba(255,255,255,.16), color #fff'
  hour-input:
    border: '1.5px solid {colors.primary}'
    radius: '{rounded.md}'
    height: 34px
    ring: '{elevation.focus-ring}'
  progress-bar:
    track: 'rgba(255,255,255,.2) on chrome, {colors.border-faint} on data'
    fill: '#FFFFFF on chrome, per day-status on data'
    height: '4px chrome / 3px data'
    radius: '{rounded.full}'
  status-chip-dirty:
    background: '{colors.amber-soft}'
    border: '1px solid {colors.amber-border}'
    color: '{colors.amber-ink}'
    icon: '{icons.attention}'
    radius: 5px
  status-chip-missing:
    background: '{colors.surface}'
    border: '1px dashed #CFCDDE'
    color: '{colors.muted}'
    label: 'no hours'
  status-chip-restricted:
    background: '#F4F4F7'
    border: '1px solid {colors.border}'
    color: '{colors.faint}'
    icon: '{icons.restricted}'
    label: hidden
  status-chip-timeoff:
    background: '#F6F5FA'
    border: '1px solid #E2E0EE'
    color: '{colors.legacy-purple}'
    icon: '{icons.time-off}'
    label: time off
  guest-rail:
    # The banner inside Jira. Owns no chrome, so it carries brand with hue,
    # geometry and number discipline instead. See § The Guest Surface.
    height: 44px
    background: '{colors.surface}'
    spine: '3px solid {colors.legacy-purple}' # left edge, decorative
    border-bottom: '1px solid {colors.border}' # purple-tinted, NOT Jira's #DFE1E6
    mark: '18px rounded-5px {colors.legacy-purple} square with a 5px white dot'
    font: '{typography.guest}'
    control-height: 28px
    radius: '{rounded.md}'
icons:
  # lucide-react (already a project dependency; components.json sets it as THE icon
  # library). No second icon set enters the product. Rendered as inline SVG — no
  # icon font, no CDN, tree-shaken per import.
  #
  # EXCEPTION — the guest rail is vanilla DOM under Jira's CSP and cannot import
  # React components. It uses HAND-INLINED lucide SVG paths: same shapes, no
  # dependency, no font. Never a text glyph.
  library: lucide-react
  defaults:
    size: 13
    strokeWidth: 2
    aria-hidden: true # always decorative; the adjacent text carries the meaning

  # Day status — the five-state vocabulary
  met: CircleCheck # was ✓
  partial: ChartPie # was ◔ — partially logged, the state red used to occupy
  attention: Circle # was ● — fill="currentColor"; nothing logged, or edited after approval
  time-off: Diamond # was ◆ — fill="currentColor"; settled and intentional
  weekend: Minus # column recedes; no status of its own

  # In-flight and unknowable — deliberately NOT one icon
  loading: LoaderCircle # spins; replaces ◐ for genuine in-flight work
  restricted: EyeOff # replaces ◐ for "you aren't permitted to see these worklogs"

  # Failure — the only place red appears
  error: CircleX # was ✕

  # Interface
  search: Search # was ⌕
  submit: CornerDownLeft # was ⏎
  add: Plus # was +
  edit: Pencil # was ✎
  delete: Trash2 # was ✕ in row actions
  open-external: ArrowUpRight # was ↗
  disclosure: ChevronDown # was ▾
  prev: ChevronLeft
  next: ChevronRight
  offline: WifiOff
  undo: Undo2
  kbd:
    background: '#F4F4F7'
    border: '1px solid {colors.border}'
    radius: '{rounded.sm}'
    font: '{typography.eyebrow}'
    on-primary: 'background {colors.primary}, color #fff'
elevation:
  flat: none
  hairline: '0 1px 2px rgba(74,65,99,.05)'
  raised: '0 1px 3px rgba(74,65,99,.07), 0 10px 26px rgba(74,65,99,.08)'
  lift: '0 1px 3px rgba(74,65,99,.07), 0 18px 40px rgba(74,65,99,.12)'
  overlay: '0 1px 3px rgba(74,65,99,.07), 0 24px 50px rgba(74,65,99,.16)'
  focus-ring: '0 0 0 3px rgba(89,79,116,.13)'
---

# DESIGN.md — jira-time-logger

Visual identity. Behaviour, states, and flows live in [EXPERIENCE.md](./EXPERIENCE.md).
**This file wins over any mockup, wireframe, or import on conflict.**

Reference mockup: [imports/jira-time-logger.dc.html](./imports/jira-time-logger.dc.html) — all three surfaces, nine popup states.

## Brand & Style

**Distinctive shell, calm data.**

Brand character lives entirely in the *chrome*: a saturated Legacy-Purple gradient field carrying a faint
orbital motif, Kanit display type, and white-on-purple numerals. The *data* underneath stays quiet — white
surfaces, purple-tinted hairlines, Noto Sans, and numbers that don't shout. This is KKP's own system
(purple covers, calm content spreads) applied at product scale, and it satisfies KKP's hard rule that
purple and grey cover ≥50% of any surface: the chrome carries the ratio so the data canvas never has to.

The posture is **Linear's discipline in KKP's clothes**. Dense but never crowded; tabular, precise,
keyboard-first. Every surface should feel like an instrument a working engineer reaches for without
thinking — not a dashboard that wants to be admired.

The register the product must never hit is **scolding**. This tool watches how much time someone has
logged, which makes it structurally capable of nagging. It doesn't. A half-filled day is *unfinished*, not
*wrong*. That single idea governs more visual decisions here than any token below.

## Colors

**{colors.legacy-purple} — Legacy Purple.** The only brand colour in the product. It carries the chrome
gradient, every primary action, active states, focus rings, section-title text, and the underline rule.
It is *not* used to tint data rows, fill cells, or indicate status. KKP sub-brand palettes (Better green,
Edge orange, Wealth navy) never appear.

**{colors.royal-purple} — Royal Purple.** Secondary. The top stop of the chrome gradient, the hover state
of primary buttons, and the `{icons.loading}` in-flight status. It is the only status colour that is also a
brand colour, deliberately: work-in-progress belongs to the brand, not to a warning.

**{colors.purple-deep}.** Gradient floor and the tint inside every shadow. All elevation in this product is
purple-tinted — never neutral black — so depth reads as part of the brand rather than a generic drop shadow.

**{colors.background} / {colors.surface} / {colors.surface-sunk}.** The three-step data canvas: the app
sits on `background`, cards are `surface`, and inset regions (table headers, footers, totals rows) drop to
`surface-sunk`. This three-step ladder is what replaces the old build's single flat plane.

**{colors.foreground} / {colors.muted} / {colors.faint}.** Text ramp. `foreground` for values a user reads,
`muted` for supporting prose, `faint` for meta. **{colors.faint} is the lightest permissible text grey at
4.6:1 and must never be lightened.** {colors.faint-decorative} is Grandeur Grey — non-text decoration only
(dividers, tree guides, the empty-cell dot).

**{colors.border} / {colors.border-faint} / {colors.border-hairline}.** Three weights of purple-tinted
hairline: card edges, row dividers inside a card, and grid cell separators respectively. Hierarchy in the
data canvas is carried by these three weights plus the surface ladder — not by colour.

**Status colours — meaning is fixed.**
`{colors.status-clean}` {icons.met} target met · `{colors.status-dirty}` {icons.attention} changed after
approval, or a workday with nothing logged · `{colors.status-recomputing}` {icons.loading} in flight ·
`{colors.faint}` {icons.restricted} not permitted to see · `{colors.legacy-purple}` {icons.time-off} time
off · `{colors.status-error}` {icons.error} a write that actually failed. Every one of them pairs with its
icon and a text label. Never colour alone.

**Time off, in-flight, and restricted are three different icons, deliberately.** Time off is a *settled,
intentional* state — the day is finished and correct, so it takes a filled `{icons.time-off}` in Legacy
Purple: a marked, deliberate day owned by the brand rather than by a status. In-flight
(`{icons.loading}`) means the product is still working. Restricted (`{icons.restricted}`) means the product
*cannot* resolve something because the viewer isn't permitted to see it. The producer's draft collapsed all
three into one half-filled circle, which let a booked holiday read as "still calculating" and made
"you aren't allowed to see this" indistinguishable from "wait a moment."

**{colors.amber-soft} / {colors.amber-border} / {colors.amber-ink}.** Added tints derived from
`{colors.status-dirty}` — no new hue enters the system. `amber-ink` clears AA at 5.9:1 on `amber-soft`.
Used for the offline banner, dirty matrix cells, and the "needs re-approval" chip.

**Red is not a hierarchy colour here.** `{colors.status-error}` and its tints fire on exactly one thing: a
worklog Jira refused to accept. Being below target — the most common state in the entire product — never
renders red. The old build painted five red "below target" chips across a normal week; that is the single
worst thing this redesign removes.

## Typography

Two families, split by role, and **no monospace or serif anywhere** — KKP has neither.

**Kanit is the chrome voice.** Every heading, label, eyebrow, button, ticket key, and number. It carries
brand recognition, so it appears wherever the product is speaking as itself.

**Noto Sans is the data voice.** Ticket summaries, prose, captions, explanatory text — anything written by
Jira or by a human rather than by the product. It's quieter than Kanit by design, which is what lets an
80-character GAPI summary sit next to a key without competing with it.

**Numbers are Kanit with `tabular-nums`, always.** `{typography.num}` applies to hours, totals, ticket keys,
dates, and percentages. Tabular figures are what make the week grid and the manager matrix scannable in
columns; without them the whole tabular argument of this design collapses. This replaces the previous
spec's "mono-typed numerics" rule, which is retired along with monospace itself.

**Ship weights 400/500/600 only.** Kanit 300 goes unused — three woff2 files, bundled locally.
Noto Sans ships Latin-only (400/500/600); the Thai subset is dropped, as is Thai UI support.

The ramp compresses hard at the top: `{typography.display}` at 26px is the largest type in the product and
appears once per surface, in the chrome. Below it everything lives between 10.5px and 16px. Hierarchy comes
from weight, colour, and family — not from size jumps.

## Layout & Spacing

Four-based scale throughout. Tight *within* a group (list rows at 9–10px vertical), generous *between*
groups (`{spacing.section-gap}` = 18px between popup sections, `{spacing.6}` = 24px on the full pages).

**The popup is 380 × 560 with exactly one scroll region.** The chrome header is fixed at the top, an action
bar is fixed at the bottom, and only the middle scrolls. There are no nested scroll regions anywhere in the
product — a scrolling list inside a scrolling panel is the defect this constraint exists to prevent.

**The full pages are 1180px content width** with a companion rail (400–440px) for drill-downs, dialogs, and
legends. Grid columns are fixed-width (104px per day in the week grid; 124px per epic in the matrix) so
figures align down the column regardless of content.

Weekend columns tint to `{colors.weekend}` at the header, cell, and totals level — the full column
recedes as one object rather than being dimmed cell by cell.

## Elevation & Depth

KKP's own spec mandates a flat data canvas. **That rule is explicitly waived for this product** by the
project owner, because flatness — specifically, the absence of any hierarchy — was the originating complaint.

The waiver is spent carefully. **Three levels, no more:**

1. **Chrome** — the purple gradient. The only saturated field, and the primary depth anchor on every surface.
2. **Cards** — white on `{colors.background}`, carrying `{elevation.hairline}` or `{elevation.raised}`.
3. **Rows** — flat inside their card, separated by `{colors.border-faint}` hairlines only.

Above those sit `{elevation.overlay}` for dialogs and drill-down panels, and `{elevation.lift}` for the two
elements allowed to break the plane: the **resume card**, which is pulled up 10px so it overlaps the chrome
baseline, and the surface frames in the mockup.

Every shadow is purple-tinted (`rgba(74,65,99,·)`). If everything lifts, nothing does — elevation in this
product means *"this is the thing to act on,"* and the resume card is the clearest expression of that rule.

## Shapes

`{rounded.sm}` inputs and chips · `{rounded.md}` buttons and cells · `{rounded.lg}` cards and panels ·
`{rounded.xl}` surface frames · `{rounded.full}` pills, dots, and progress bars.

Crisp, not soft. These radii say *tool*, not *toy* — an 8px card in a 380px popup reads as a precise object,
where a 16px one would read as a consumer app. The one place fully-round appears is status: pills and dots,
where roundness signals "this is a token, not a container."

## Iconography

**lucide-react, and nothing else.** It is already the project's icon library (`components.json`), ships as
inline SVG, tree-shakes per import, and needs no font file or network request — which matters on a surface
governed by extension CSP. A second icon set does not enter this product.

Icons replace the geometric text glyphs the design was originally drafted with (`✓ ◔ ● ◆ ◐ ✕`). Three
reasons that swap is an upgrade rather than a restyle:

1. **Accessibility.** A text glyph sits in the accessibility tree and gets announced — a screen reader
   reading "black diamond" before "time off" is noise. Icons are `aria-hidden` SVG with the adjacent text
   carrying the meaning, so the announcement is just "time off".
2. **Rendering.** Glyph coverage varies by platform font; `◔` in particular renders inconsistently and has
   no guaranteed presence in a bundled Latin subset. SVG renders identically everywhere.
3. **It de-overloads the last shared symbol.** With one geometric family we had to reuse `◐` for both
   in-flight and restricted-visibility. Icons let restricted become `{icons.restricted}` — literally an eye
   with a line through it — which says "you aren't permitted to see this" far better than any circle can.

**Sizing.** Default {icons.defaults.size}px at stroke {icons.defaults.strokeWidth}. Lucide's 24px default is
far too large for this product; icons sit inline with 11–13.5px type and must optically match the cap height
of the text beside them, not tower over it. In dense grid cells drop to 11px. Never exceed 16px outside the
chrome.

**Fill.** `{icons.attention}` and `{icons.time-off}` take `fill="currentColor"` — they replace *solid*
glyphs and must read as solid marks, not outlines. Everything else stays stroked.

**Colour** comes from `currentColor`, so an icon inherits its status colour from the element that owns it.
Never hard-code a hex on an icon.

## Components

**Chrome header.** Gradient field with concentric ring motif anchored off the top-right corner at 12–15%
white. Carries an eyebrow (product + user), the surface title in `{typography.display}`, the headline figure
(logged / target) in white tabular Kanit, and a 4px progress bar. On the popup it also holds a 22px avatar.
The motif is chrome-only and never appears under data.

**Resume card.** The product's primary affordance. White, `{elevation.lift}`, pulled up 10px into the chrome
so it visually breaks the header line. Anatomy: eyebrow "CONTINUE LOGGING" in `{colors.primary}` + a
right-aligned recency note; ticket key in Kanit 600 `{colors.primary}`; summary in Noto clamped to two lines;
then a row of three quick-increment buttons (+0.5 / +1 / +2) beside a focused hour input carrying
`{elevation.focus-ring}` and an inline `{icons.submit}` key badge. Nothing else in the popup may carry this
weight.

**Search field.** 36px, hairline by default with a `/` shortcut badge; on focus it takes a 1.5px
`{colors.primary}` border and `{elevation.focus-ring}`, and the badge becomes `esc`. Active search
**replaces** the lists below it rather than filtering beside them — one list on screen at a time.

**List row.** Two-line: Kanit key + optional pill on line one, Noto summary ellipsised on line two, with a
right-aligned action (`+` for add, hours + edit/delete for logged entries). Fixed height so lists scan.
Separating key from summary onto its own line is what lets an 80-character summary truncate without
shoving the key around.

**Grid cell (week).** 34px, `{rounded.md}`, white fill with a `#EDECF2` border when it holds a value;
transparent with a `{colors.faint-decorative}` middot when empty. The focused cell takes a
`{colors.primary}` border plus `{elevation.focus-ring}`. Time-off cells fill `#F6F5FA` with
`{colors.legacy-purple}` text and carry `{icons.time-off}` at 11px.

**Totals cell (week).** Value + target + status icon on line one, a 3px progress bar on line two, and a
plain-language note on line three ("2.5h short", "full-day time off", "weekend"). The bar colour follows day
status. This three-part anatomy is what replaced the red "below target" chip.

**Matrix cell.** Correct cells are *near-silent*: a bare tabular number, no fill, no border, no icon.
Only exceptions get a chip — `{components.status-chip-dirty}`, `{components.status-chip-missing}`,
`{components.status-chip-restricted}`. Empty is a single `{colors.faint-decorative}` middot. In a 600-cell
grid, decoration must be reserved for the two cells that are wrong.

**Buttons.** One primary per view. `{components.button-primary}` on the data canvas; inverted to white-on-
purple when it sits on the chrome. Secondary is hairline-bordered white; ghost is text-only for tertiary
actions like "Mark today as PTO".

**Dialogs.** `{rounded.xl}`, `{elevation.overlay}`, 20–22px padding, title in Kanit 600 at 18px, body in
Noto. Evidence (the list of gaps, the list of changed worklogs) sits in `{colors.surface-sunk}` rows between
title and actions, so the user reads facts before deciding.

## The Guest Surface

One surface owns no chrome: the banner injected into Jira's own page. It runs under Jira's CSP as vanilla
DOM with inline styles only — **no gradient, no orbital motif, no Kanit, no Noto.** Three of the four things
that carry brand identity everywhere else are unavailable there.

What remains is **hue, geometry, and number discipline** — and it is enough, because those are the three
things the popup and the banner can share pixel for pixel.

- **The exact purple, in a tiny dose.** A 3px spine on the left edge and an 18px mark: under 2% of the bar's
  area. Recognition doesn't need coverage; it needs the *right* `{colors.legacy-purple}` beside the right
  neutral.
- **Purple-tinted neutrals.** Borders are `{colors.border}` `#E4E3EC`, deliberately not Jira's `#DFE1E6`.
  Sitting directly against Jira's own chrome, the rail reads as a different object — warmer, quieter —
  without a single saturated pixel.
- **Geometry, carried verbatim.** `{rounded.md}` radii, 28px control height, 1px dividers, the same button
  proportions as the popup's quick-increment row. Shape is the most CSP-proof brand asset there is.
- **Tabular numerals.** `font-variant-numeric: tabular-nums` works on any system face, so the product's
  numbers look like the product's numbers even in a system font.

**It is a rail, not a bar.** White ground, 44px, one purple spine, one purple mark, a hairline beneath. It
sits above Jira the way a browser's bookmarks bar does — structurally present, chromatically quiet, and
never mistakable for a warning or an ad. A full-bleed purple bar pinned over Jira's blue chrome would read
as something wrong with the page.

**Do not ship Kanit here.** It costs a `web_accessible_resources` entry and a permission-warning risk at
install, and any Jira instance with a strict `font-src` falls back silently — so the surface you would
actually be designing for is the fallback. A 44px rail is not where anyone reads type.

**Icons are hand-inlined lucide SVG paths**, never text glyphs and never the React components. Same shapes
as everywhere else, no dependency, no font file.

**Expansion must not change the rail's height.** It stays 44px and swaps its right-hand contents — the hours
field appears in the space the contextual action vacated. The rail's height is a layout contract with Jira's
page: the `body padding-top` the content script sets is written once, and the page never reflows twice for
one interaction.

**Restraint is the design.** The rail states a number and stops. No icon parade, no progress bar, and no
colour that escalates as the week slips — an amber rail on Thursday would be a scold, which the rest of this
system forbids. It asks for something exactly once, on a `/browse/<KEY>` page, where the ask is specific and
almost always right. Everywhere else it is a fact you can ignore, which is the only thing that survives
being seen fifty times a day.

## Do's and Don'ts

**Do**
- Put every saturated pixel in the chrome and leave the data quiet.
- Pair every status colour with its lucide icon and a visible text label.
- Render icons at 11–13px, `aria-hidden`, with the meaning carried by the text beside them.
- Fill `{icons.attention}` and `{icons.time-off}` with `currentColor`; leave every other icon stroked.
- Use Kanit + `tabular-nums` for every number, key, and date so columns align.
- Give the empty value a single middot `·`.
- Let the resume card be the loudest thing under the header, always.
- Keep one scroll region per surface.
- Say what a state *is* in plain language ("2.5h short", "in progress", "weekend").

**Don't**
- Render red for anything except a write that actually failed.
- Repeat a status label across a row — one icon per day beats five chips.
- Use `——` for an empty value; it reads as broken rendering.
- Introduce monospace, serif, a second brand colour, or a second icon library.
- Ship a status as a bare text glyph — screen readers announce it, and glyph coverage varies by platform.
- Reuse `{icons.loading}` for a settled state, or for something the viewer simply isn't allowed to see.
- Let an icon carry meaning on its own — if the text beside it were deleted, the state must still be readable.
- Lighten `{colors.faint}` below 4.6:1, or use `{colors.faint-decorative}` for text.
- Put the orbital motif, the gradient, or a purple tint under data.
- Pin a full-bleed purple bar over Jira — on the guest surface that reads as a warning, not a tool.
- Let the guest rail change height when it expands; its height is a layout contract with Jira's page.
- Escalate the guest rail's colour as the week slips. An amber bar on Thursday is a scold.
- Let elevation appear on more than one element per group — if everything lifts, nothing does.
- Show 55 rows when four and a search field will do.
