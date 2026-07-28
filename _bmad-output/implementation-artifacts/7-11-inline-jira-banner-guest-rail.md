---
story_id: 7.11
story_key: 7-11-inline-jira-banner-guest-rail
epic: 7
title: Inline Jira Banner — the Guest Rail
status: done
baseline_commit: f7740bc
created: 2026-07-27
---

# Story 7.11: Inline Jira Banner — the Guest Rail

Status: done

## Story

As Priya on a Jira ticket I worked on this morning,
I want a quiet rail that offers to log against exactly this ticket,
So that the tool reaches me where I already am without ever looking like something is wrong with the page.

## Context

**This is the FINAL story of Epic 7.** When it lands, the epic's last unreconciled surface is done and the
epic-close checks in `### Epic-Close Gate` below become due.

**This story is unlike every other story in Epic 7.** The banner is a guest inside Jira's own page, running
under Jira's Content Security Policy as a content script. Almost none of the epic's machinery reaches it:

| Epic-7 mechanism | Available on the guest rail? |
| --- | --- |
| Tailwind classes / `styles/globals.css` tokens | **NO** — no stylesheet is injected |
| `lucide-react` components | **NO** — React component library, vanilla DOM here |
| The bundled Kanit / Noto faces | **NO** — not `web_accessible_resources`, and Jira `font-src` may reject them |
| `DayStatusIndicator` / the shared status registry | **NO** — it is a React component |
| `ring-focus`, `motion-safe:`, `@media` | **NO** — no stylesheet, no pseudo-classes, no media queries |
| Raw hex literals | **YES — and they are CORRECT here.** See D-7.11-35. |

**This is a RESTYLE of a working feature, not a greenfield build.** Story 3.3 shipped the inline banner with
SPA-aware re-injection, daily-dismiss persistence, an hours parser, an outbox-backed write path and a
`role="region"` host. All of that is preserved. See `### What Changes vs What Is Preserved`.

**Story 3.3's own design is the exact failure mode the KKP design forbids.** Today the banner is a
**56 px full-bleed `#e9e6f3` (light purple) fixed bar** (`lib/banner-styles.ts:52-74`) that **expands to
120 px** (`EXPANDED_HEIGHT`, `:73`). `DESIGN.md:554` — *"Pin a full-bleed purple bar over Jira — on the guest
surface that reads as a warning, not a tool"* — and `DESIGN.md:555` — *"Let the guest rail change height when
it expands; its height is a layout contract with Jira's page"*. The current banner does both.

## Acceptance Criteria

Transcribed verbatim from `_bmad-output/planning-artifacts/epics.md:2086-2149`.

### AC1 — CSP: vanilla DOM, inline styles, no external request

**Given** the banner is a guest inside Jira's UI under Jira's CSP
**When** it is built
**Then** it uses vanilla DOM with inline styles only — no stylesheet, no class names, no keyframes, no media queries, no pseudo-elements
**And** it makes no external request of any kind

### AC2 — It is a rail, not a bar

**Given** a full-bleed purple bar over Jira's blue chrome would read as a browser warning
**When** the rail renders
**Then** it is a **44 px white rail** with a 3 px `legacy-purple` left spine, one 18 px purple mark, and a `border` hairline beneath
**And** it uses the purple-tinted `#E4E3EC` border rather than Jira's own `#DFE1E6`, so it reads as a distinct object without a saturated pixel
**And** it carries neither the chrome gradient nor the orbital motif

### AC3 — Type is the system stack

**Given** the bundled Kanit and Noto files are not web-accessible and Jira's `font-src` may reject them anyway
**When** the rail renders type
**Then** it uses the `{typography.guest}` system font stack
**And** `font-variant-numeric: tabular-nums` is applied to every figure, which works on any system face
**And** no `web_accessible_resources` entry is added for fonts

### AC4 — Identity without gradient, motif or brand fonts

**Given** brand identity must survive without gradient, motif, or brand fonts
**When** the rail renders
**Then** identity is carried by the exact `legacy-purple` in a small dose, purple-tinted neutrals, `rounded-md` radii, 28 px control height, and tabular figures — the same geometry as the popup's quick-increment row

### AC5 — Height is a layout contract

**Given** the rail's height is a layout contract with Jira's page
**When** the contextual action is expanded into the quick-log
**Then** the rail **stays 44 px** and swaps its right-hand contents; the hours field appears in the space the action vacated
**And** the `body padding-top` the content script sets is written exactly once
**And** the page never reflows twice for a single interaction

### AC6 — Motion, hover and focus without CSS

**Given** inline styles cannot express `:hover`, `:focus`, or keyframes
**When** interactivity is wired
**Then** entry, expand, and exit are all `transform: translateY()` with `transition` set in the inline style string — no keyframes anywhere
**And** hover is `mouseenter`/`mouseleave` writing `el.style.background`; focus rings are `focus`/`blur` writing `boxShadow`
**And** reduced motion is read via `matchMedia` and applied by setting `transition: 'none'` and jumping to the end state

### AC7 — The contextual ask, and everywhere else

**Given** the user is on a `/browse/<KEY>` page
**When** the rail renders
**Then** the contextual action "Log time on \<KEY\>" is the only emphasised element, as a filled primary button
**And** on any other Jira page the rail shows only the state line, "Open extension ↗", and dismiss

### AC8 — Narrow viewport

**Given** the viewport is narrower than ~860 px
**When** the rail renders
**Then** the eyebrow and "Open extension" drop, the state line truncates with an ellipsis, and the contextual action keeps its full width
**And** the action **never wraps to a second line**, because wrapping would change the height and break the layout contract

### AC9 — Icons are hand-inlined lucide paths

**Given** icons are required and `lucide-react` cannot be imported into vanilla DOM
**When** the rail renders an icon
**Then** it uses **hand-inlined lucide SVG paths** — the same shapes as the rest of the product
**And** no text glyph is used as an icon, since a screen reader would announce it

### AC10 — The colour never escalates

**Given** the rail appears on every Jira page the user visits, all day
**When** the week slips further behind
**Then** the rail's colour **never escalates** — no amber, no red, no progress bar, no icon parade
**And** it states a number and stops

### AC11 — When there is no rail

**Given** the user is caught up, dismissed it today, is disconnected, or their auth expired
**When** the page loads
**Then** no rail is rendered at all
**And** the rail never blocks, never throws, and never asks twice

### AC12 — Story 3.3 behaviour is preserved

**Given** the existing behaviour from Story 3.3 must be preserved
**When** the rail is rebuilt
**Then** SPA-aware re-injection, daily-dismiss persistence, the hours parser and its three error strings, the success confirmation followed by slide-away at 600 ms, and `role="region"` with an accessible name all still work

---

## The Central Tension: lucide, fonts and tokens under Jira's CSP

The task framing asks how three "impossible" constraints resolve. **All three resolve cleanly. None is a
genuine escalation.** Record these so a reviewer does not file them as violations.

### D-7.11-35 — Raw hex is CORRECT here. D-7.3-14 and D-7.7-15 do NOT apply.

**The rule being set aside.** D-7.3-14 ("un-tokenised spec hex loses to the nearest token") and D-7.7-15's
"tokenise it" ruling both presuppose that a *token* is reachable from the call site. On the guest rail it is
not: `styles/globals.css` is never injected into Jira's page, so `var(--color-legacy-purple)` would resolve
to nothing and the element would render unstyled.

**Therefore:** every value in `lib/banner-styles.ts` is a **literal hex string**, exactly as it is today
(`:22-30`). This is the ONE place in Epic 7 where raw hex is the correct output. The discipline is preserved
by a different mechanism: **`lib/banner-styles.ts` is the single source of literals** (a "design system of
one file", as its own header at `:6-8` already says), every literal carries a comment naming the
`DESIGN.md` token it mirrors, and a **new test pins each literal to the token value** so a drift in
`globals.css` is caught (see `### Testing`).

**Reviewer note:** do NOT file "raw hex in `banner-styles.ts`" as a D-7.3-14 violation. Do file "a raw hex
that does not equal its named `DESIGN.md` token", and do file "a raw hex introduced anywhere *other than*
`lib/banner-styles.ts`".

### D-7.11-36 — The 18 px mark is NOT an icon. It is geometry. The lucide constraint is satisfiable.

The task framing worried that "one 18 px purple mark" could not be met because `lucide-react` is
unavailable. **It can, because the mark was never specified as an icon.**

`DESIGN.md:213` specifies it literally:

> `mark: '18px rounded-5px {colors.legacy-purple} square with a 5px white dot'`

The design source draws exactly that, three times — `round2.dc.html:54`, `:99`, `:150`:

```
width:18px;height:18px;border-radius:5px;background:#594F74
  └─ <span> width:5px;height:5px;border-radius:9999px;background:#FFFFFF
```

So the mark is **two nested `<span>`s with inline styles** — no SVG, no icon, no font. It is `aria-hidden`
and decorative (it replaces today's `dot.textContent = '●'` at `lib/banner-dom.ts:84`, which is a **text
glyph** and therefore an AC9 violation).

**The genuine icons on this surface are a different, smaller set**, and for those `DESIGN.md:222-224` gives
the explicit exception:

> `# EXCEPTION — the guest rail is vanilla DOM under Jira's CSP and cannot import`
> `# React components. It uses HAND-INLINED lucide SVG paths: same shapes, no`
> `# dependency, no font. Never a text glyph.`

**Hand-inlining is mechanical and offline.** `lucide-react@^0.460.0` is already a dependency
(`package.json:33`); its icon paths ship in `node_modules/lucide-react/dist/`. Copy the `<path>`/`<circle>`
`d` attributes into a `createElementNS('http://www.w3.org/2000/svg', …)` builder. **No external request
is made** (AC1) — the paths become source code at build time.

**NOT AN ESCALATION.** The constraint is met as written.

### D-7.11-37 — The icon set the rail needs, and the ONE genuine gap

| Where | `DESIGN.md` `icons:` key | lucide component | Status |
| --- | --- | --- | --- |
| "Open extension **↗**" (`round2:60,106`) | `open-external` (`:251`) | `ArrowUpRight` | Mapped |
| Success "**✓** Logged 2.5h" (`round2:131`) | `met` (`:232`) | `CircleCheck` | Mapped |
| Format-error glyph `●` (`bannerNotes`, `round2:1328`) | `attention` (`:234`) | `Circle`, `fill="currentColor"` | Mapped |
| Write-failed glyph `✕` (`round2:1335`) | `error` (`:243`) | `CircleX` | Mapped |
| "**⏎** to log · esc to close" (`round2:121`) | `submit` (`:247`) | `CornerDownLeft` | Mapped |
| **Dismiss `✕`** (`round2:61,107,123,153`) | **NONE** | — | **ESCALATION E-1** |

**E-1 (open):** `DESIGN.md`'s `icons:` block has **no key for a close/dismiss affordance.** `error: CircleX`
is the failure glyph and `delete: Trash2 # was ✕ in row actions` is destructive-delete — neither means
"dismiss this for today". The design source draws a bare `✕` text glyph, which `DESIGN.md:224`
("Never a text glyph") and AC9 both forbid. **The spine and the mockup contradict each other and neither
supplies the answer.** Creator's recommendation: use lucide **`X`** (the plain glyph-shaped icon, which is
what `CircleX` is built from) and add `close: X` to `DESIGN.md`'s `icons:` block. Flagged for the
orchestrator rather than guessed — see `### Escalations`.

### D-7.11-38 — `{typography.guest}` resolves; the current stack is WRONG and must change

AC3's `{typography.guest}` is an unresolved template reference. It resolves at
`DESIGN.md:104-109`:

```yaml
guest:
  # The banner cannot load the bundled faces — see § The Guest Surface.
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  fontSize: 13px
  fontWeight: '400'
  note: 'tabular-nums still applies; it works on any system face.'
```

`round2.dc.html:53`, `:98` and `:149` render the identical stack, confirming it.

**The value shipped today is different** — `lib/banner-styles.ts:38-39`:

```
'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
```

It omits the leading `system-ui` and appends `BlinkMacSystemFont`, `Helvetica`, `Arial`. **`SYSTEM_FONT`
must be replaced with the `{typography.guest}` stack exactly.** This is a real, checkable delta, not a
formality.

**`tabular-nums` is currently applied NOWHERE in the banner.** AC3 requires it on every figure. The design
source applies `font-variant-numeric:tabular-nums` at `round2:57` (state line), `:104`, `:111`, `:113`,
`:129`, `:151` and even on the primary button `:59`. **No `web_accessible_resources` entry is added**
(AC3) — `wxt.config.ts` is a FENCED Epic 6.3 file and must not be touched for any reason.

---

## What Changes vs What Is Preserved

### PRESERVED — do not regress any of these (AC12)

| Behaviour | Where it lives | Note |
| --- | --- | --- |
| SPA-aware re-injection (`popstate` + debounced `MutationObserver`, URL-gated) | `entrypoints/content.ts:248-263, 272-281` | The URL gate at `:259` is load-bearing — it stops a re-eval storm and stops clobbering an in-flight quick-log. **Keep it.** |
| Daily-dismiss persistence | `lib/storage/banner-dismiss.ts`, called `content.ts:122-128, 218` | Dismissal is persisted **before** removal (`:123-126`) so a re-eval reliably sees it. **Keep that ordering.** |
| Hours parser + its three error strings | `lib/hours.ts` via `content.ts:167-177`; `STRINGS` `:42-44` | Strings are **restyled and two are re-worded** (D-7.11-41), but the parse/limit/failure branches stay. |
| Success confirmation then slide-away at 600 ms | `content.ts:186-192` | Both `ok` and `pending` show the confirmation. **Keep both branches.** |
| `role="region"` + accessible name | `lib/banner-dom.ts:56-65` | `BANNER_STRINGS.bannerRegionLabel = 'Time-tracking banner'`. |
| The idempotent single host (`BANNER_HOST_ID`) | `lib/banner-styles.ts:33`, `banner-dom.ts:56-65` | Re-render reuses the element. |
| The deferred-removal cancel guard | `content.ts:65-93` | `removeTimer` + the `translateY(-100%)` re-check at `:91` prevents a re-rendered banner being deleted. **Subtle and correct — keep.** |
| The re-entrancy `inflight` guard | `content.ts:163, 178, 197` | Prevents a double-post; the SW write is not idempotent. **Keep.** |
| SW messaging + write path | `lib/banner-sw.ts` **(entirely unchanged)** | `banner-state` → `getWeekHoursMissing()`; `log-worklog-request` → `postWorklog` → outbox on `network`/`rate-limited`. |
| Disconnect teardown | `content.ts:285-295` | SW broadcasts `disconnect`; banner tears down. |
| Never throws | `content.ts:243-245, 296-298` | Both the flow and `main()` are wrapped. |

**`lib/banner-sw.ts` is NOT modified by this story.** The write path, the outbox enqueue and the
`badge-update` broadcast are untouched. Its 14 tests must still pass unchanged.

### CHANGES

| # | Today | Becomes | Source |
| --- | --- | --- | --- |
| C1 | Full-bleed `#e9e6f3` background, 56 px | **White `#FFFFFF`, 44 px** | `round2:53`; `DESIGN.md:209-210` |
| C2 | No left spine | **`border-left: 3px solid #594F74`** | `round2:53`; `DESIGN.md:211` |
| C3 | `boxShadow: 0 1px 3px rgba(15,23,42,.12)` | **`border-bottom: 1px solid #E4E3EC`**, no shadow | `round2:53`; `DESIGN.md:212` |
| C4 | `dot.textContent = '●'` (text glyph) | **18 px rounded-5px `#594F74` square + 5 px white dot**, two nested spans | `round2:54`; `DESIGN.md:213` |
| C5 | No eyebrow | **"Time Logger" eyebrow**, 10px/600/`.11em`/uppercase/`#6B6B72`, + 1×16 px `#E4E3EC` divider | `round2:55-56` |
| C6 | `"{N}h unlogged this week."` | **`"{N}h unlogged this week"`** — no trailing period; the number is `font-weight:600`, the rest 400 | `round2:57` |
| C7 | Expands to 120 px | **Stays 44 px**, right-hand contents swap | `round2:1320`; `DESIGN.md:520-523` |
| C8 | No `body padding-top` — a fixed OVERLAY | **`document.body.style.paddingTop = '44px'`, written once** | `round2:50, 180`; AC5 |
| C9 | No hover, no focus ring | **`mouseenter`/`mouseleave` → `style.background`; `focus`/`blur` → `boxShadow`** | `round2:59-61, 181`; AC6 |
| C10 | No narrow-viewport behaviour | **<860 px: eyebrow + divider + "Open extension" drop; state line ellipsis-truncates; action shortens to "Log on \<KEY\>"** | `round2:144-153` |
| C11 | Parse + limit errors render **RED** | **AMBER** (`#7A3E06` ink, `#EDD3A6` field border) | `round2:1327-1328`; D-7.11-40 |
| C12 | Write failure: `"Couldn't log time — try again"`, red text, auto-clears | **`"Couldn't log time — nothing was saved"`, `#991B1B`, PERSISTS, button becomes `"Try again"` on `#991B1B`** | `round2:1332-1335` |
| C13 | Parse error calls `reevaluate()` after 1.5 s, **destroying the typed value** | **Auto-clears the error after 1.5 s and KEEPS the value for editing** | `round2:1325` |
| C14 | `logBtn.textContent = '✓'` (text glyph) | **`CircleCheck` inline SVG + "Logged {N}h"**, outline style `#15803D` on `#BFE0C8` border | `round2:131` |
| C15 | `'Open extension'` plain text | **"Open extension" + `ArrowUpRight` inline SVG**; ghost on a ticket page, **outline button** on a non-ticket page | `round2:60` vs `:106` |
| C16 | Dismiss `✕` text glyph | **Inline SVG** (E-1 pending), 26×26, radius 5, hover `#F4F4F7`/`#1E1B2E` | `round2:61` |
| C17 | Hours input 32 px, `#64748b` border | **30 px, `1.5px solid #594F74`, ring `0 0 0 3px rgba(89,79,116,.13)`, `min-width:150px`** | `round2:112, 1310` |
| C18 | No keyboard hint | **"⏎ to log · esc to close"** with `⏎` as a `CornerDownLeft` inline SVG, 11.5px `#6B6B72` | `round2:121` |
| C19 | `SYSTEM_FONT` stack is wrong | **`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`** | `DESIGN.md:106` |
| C20 | No `tabular-nums` anywhere | **On every figure** | `DESIGN.md:109`; AC3 |

---

## Verified Design-Source Values

Every value below was read line-by-line from
`_bmad-output/planning-artifacts/ux-designs/ux-jira-time-logger-2026-07-25/imports/jira-time-logger-round2.dc.html`.

**Surface 4 spans lines 38–192.** (`<h2>Surface 4 — Inline Jira banner</h2>` at `:38`;
`<h2>Surface 5 — Settings…</h2>` at `:197`.) The per-state values live in the `bannerNotes` /
`bannerBase` JS block at `:1310-1342` — **grep the data block, not the markup**, which carries only
`{{ }}` placeholders.

### The collapsed rail — `round2.dc.html:53`

```
height:44px; background:#FFFFFF; border-bottom:1px solid #E4E3EC;
border-left:3px solid #594F74; padding:0 12px 0 13px; gap:12px;
font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif
```

Note `padding: 0 12px 0 13px` — the left is **13 px** so that 3 px spine + 13 px padding = the same 16 px
optical inset as the right's 12 px + the mark's edge.

| Element | Value | Line |
| --- | --- | --- |
| Mark (outer) | `width:18px;height:18px;border-radius:5px;background:#594F74` | `:54`, `:99`, `:150` |
| Mark (inner dot) | `width:5px;height:5px;border-radius:9999px;background:#FFFFFF` | `:54`, `:99`, `:150` |
| Eyebrow | `font-size:10px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:#6B6B72` · text `Time Logger` | `:55`, `:100` |
| Divider | `width:1px;height:16px;background:#E4E3EC` | `:56`, `:101` |
| State line | `font-size:13px;color:#1E1B2E;font-variant-numeric:tabular-nums`; the figure `font-weight:600` | `:57`, `:104` |
| Spacer | `flex:1 1 auto` | `:58`, `:105` |
| Primary action | `background:#594F74;color:#fff;border:none;border-radius:6px;height:28px;padding:0 12px;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums` · hover `background:#615B99` | `:59` |
| "Open extension ↗" (ticket page, ghost) | `background:transparent;border:none;padding:0 6px;height:28px;font-size:12.5px;font-weight:500;color:#6B6678` · hover `color:#594F74` | `:60` |
| "Open extension ↗" (non-ticket, outline) | `background:#fff;border:1px solid #E4E3EC;border-radius:6px;height:28px;padding:0 11px;font-size:12.5px;font-weight:500;color:#594F74` · hover `background:#ECEBF3` | `:106` |
| Dismiss | `width:26px;height:26px;border:none;background:transparent;border-radius:5px;color:#6B6B72;font-size:13px` · hover `background:#F4F4F7;color:#1E1B2E` · `title="Dismiss for today"` | `:61`, `:107` |

**`round2:60` vs `:106` is a real fork, not noise.** On a `/browse/<KEY>` page the contextual action is the
only emphasis (AC7), so "Open extension" recedes to a ghost. On any other page there is no contextual
action, so "Open extension" becomes the outline button — the rail's only control. Implement both.

### The expanded quick-log — `round2:110-124`, defaults at `:1310`

`bannerBase` (`:1310`):
```js
{ markBg:"#594F74", fieldBorder:"#594F74", fieldRing:"0 0 0 3px rgba(89,79,116,.13)",
  valueColor:"#1E1B2E", ctaBg:"#594F74", cta:"Log", noError:true }
```

| Element | Value | Line |
| --- | --- | --- |
| Label | `font-size:13px;color:#1E1B2E;tabular-nums` · `Hours to log on <b>GAPI-330</b>` | `:111` |
| Field | `height:30px;border:1.5px solid {fieldBorder};border-radius:6px;padding:0 10px;box-shadow:{fieldRing};background:#fff;min-width:150px` | `:112` |
| Submit | `background:{ctaBg};color:#fff;border-radius:6px;height:30px;padding:0 14px;font-size:12.5px;font-weight:600` | `:115` |
| Error slot | `font-size:12.5px;color:{errorInk};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`, glyph at `font-size:11px`, `gap:6px` | `:117` |
| Keyboard hint | `font-size:11.5px;color:#6B6B72;white-space:nowrap` · `⏎ to log · esc to close` | `:121` |

**The field and submit are 30 px, not 28 px.** AC4 and `DESIGN.md:215` say `control-height: 28px`, and the
collapsed row's controls are 28 px (`:59`, `:60`, `:106`). The expanded row's field and CTA are **30 px**
(`:112`, `:115`, `:128`, `:131`). Both fit inside 44 px. See **E-2**.

### The four states — `bannerNotes`, `round2:1312-1342`

| State | Field border | Ring | CTA | Error ink | Glyph | Copy |
| --- | --- | --- | --- | --- | --- | --- |
| Expanded (idle) `:1318-1322` | `#594F74` | `0 0 0 3px rgba(89,79,116,.13)` | `#594F74` "Log" | — | — | value `2.5h` |
| **Format error** `:1323-1329` | **`#EDD3A6`** (amber-border) | `none` | `#594F74` "Log" | **`#7A3E06`** (amber-ink) | `●` → `Circle` | `Use formats like 2.5h, 2h 30m` |
| **Write failed** `:1330-1336` | `#E4E3EC` | `none` | **`#991B1B`** "**Try again**" | **`#991B1B`** (error-ink) | `✕` → `CircleX` | `Couldn't log time — nothing was saved` |
| Success `:1337-1341` | `#E4E3EC` on `#FCFCFD`, value `#6B6B72` | — | `#fff` bg, `#15803D` text, `1px solid #BFE0C8`, `cursor:default` | — | `✓` → `CircleCheck` | `Logged 2.5h` + `Closing…` |

Captions carry the intent verbatim:
- `:1325` — *"Field goes amber, not red: the entry isn't wrong yet, it's unparsed. Auto-clears after 1.5s and the value stays for editing."*
- `:1332` — *"The only red on this surface, and only for a failed write. Persists until retried; the button becomes the retry."*
- `:1339` — *"Confirmation in place for 600ms, then the rail slides up and the page reclaims its 44px."*

### Narrow viewport — `round2:147-154`

```
width:620px; height:44px; background:#FFFFFF; border-left:3px solid #594F74;
padding:0 10px 0 11px; gap:10px
```
- Mark **stays** (`:150`).
- Eyebrow and divider **absent**.
- State line gains `flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis` (`:151`).
- Action **stays 28 px full width**, label shortens to `Log on GAPI-330` (`:152`).
- "Open extension" **absent**. Dismiss stays (`:153`).
- Caption `:145` restates AC8 verbatim.

### `body padding-top` — the AC5 requirement that does NOT exist today

`round2:50` — *"Jira's page is pushed down 44px, nothing overlaps."*
`round2:180` — *"…the `body padding-top` the content script sets is written once."*

**Grep-verified: `padding-top` / `paddingTop` / `body.style` appear NOWHERE in `entrypoints/content.ts`,
`lib/banner-dom.ts`, `lib/banner-styles.ts` or `lib/banner-sw.ts`.** Today the banner is a
`position:fixed` overlay (`banner-styles.ts:53-56`) that **covers** Jira's own header. AC5 is therefore
**new behaviour, not a restyle** — the one place in this story where that is true. See **E-3**.

---

## Escalations — decide these, do not guess

**E-1 — `DESIGN.md` has no icon key for "dismiss".** (See D-7.11-37.) The spine bans text glyphs; the mockup
draws `✕`; the `icons:` block offers only `error: CircleX` (wrong meaning) and `delete: Trash2` (wrong
meaning). **Creator recommends lucide `X`**, adding `close: X` to `DESIGN.md`. Needs a ruling.

**E-2 — 28 px vs 30 px control height.** AC4 and `DESIGN.md:215` say 28 px; the design source draws the
*expanded* field and CTA at 30 px (`round2:112,115,128,131`) while the *collapsed* controls are 28 px
(`:59,60,106`). **Creator recommends following the source** (28 px collapsed / 30 px expanded) since both
fit in 44 px and the 30 px field reads as the focused element. Under "spines win on intent" the 28 px
reading is defensible. Needs a ruling.

**E-3 — `body padding-top` is new behaviour that mutates Jira's page.** AC5 and `round2:50` require it;
nothing like it ships today. Risks: (a) Jira's own `position:fixed` header is *not* moved by
`body padding-top`, so the rail may still overlap it on some Jira layouts; (b) the padding must be
**removed** on dismiss/teardown/disconnect or Jira keeps a 44 px gap forever; (c) an existing
`body padding-top` set by Jira or another extension would be clobbered. **Creator recommends** shipping it
with: read-and-store the prior value once, write once, restore on every removal path, and never re-write on
re-render or expand. Needs confirmation that mutating the host page is acceptable.

**E-4 — Story 3.3's two deferred items.** See `### Deferred-Item Decisions` — creator's proposal is
**close one, re-defer one with a named owner**. Needs endorsement.

**E-5 — the "red survivor" audit entry is partly WRONG and this story corrects it.** See D-7.11-40. The
correction is required by AC10 + the standing "one legitimate red" rule and by the design source, so the
creator has ruled it in scope; flagged so the orchestrator can overrule.

---

## Creator Decisions

**Numbering:** creator decisions are `D-7.11-35 … D-7.11-46`. **Orchestrator / owner rulings must start at
`D-7.11-30`** to avoid the collision this epic hit twice (7.7, 7.10).

`D-7.11-35` — Raw hex is correct here; D-7.3-14 / D-7.7-15 do not apply. *(above)*
`D-7.11-36` — The 18 px mark is geometry, not an icon. *(above)*
`D-7.11-37` — Icon mapping table; dismiss is the one gap (E-1). *(above)*
`D-7.11-38` — `{typography.guest}` resolves to `DESIGN.md:106`; the shipped stack is wrong. *(above)*

### D-7.11-39 — `lib/banner-styles.ts` stays the single source of literals; no new file is created

The restyle is large but the seam is already right: `banner-styles.ts` (literals + style objects) →
`banner-dom.ts` (structure + ARIA) → `content.ts` (behaviour). Keep it. **Add one new module,
`lib/banner-icons.ts`**, holding the hand-inlined lucide path data and an `svg(name)` builder, so the SVG
strings have one home and one test. Do not scatter `createElementNS` calls through `banner-dom.ts`.

### D-7.11-40 — The red survivors: the 7.6 audit's line refs have DRIFTED and its verdict is PARTLY WRONG

**Verification performed at `f7740bc`, as instructed.**

- **`lib/banner-dom.ts:154` — CONFIRMED.** `:154` is `applyStyle(error, errorTextStyle);`. Correct ref.
- **`lib/banner-styles.ts:27` — CONFIRMED as the comment.** `:27-29` is the "AC4 survivor" comment;
  the constant is `:30` (`export const DANGER = '#dc2626';`).
- **`lib/banner-styles.ts:154` — STALE.** `:154` is `};` closing `dismissButtonStyle`. The red is at
  **`:157`** (`color: DANGER` inside `errorTextStyle`, `:156-160`).

**The verdict "legitimate (refused writes)" is only ONE-THIRD true.** There is exactly one `error` span,
styled once with `errorTextStyle` (DANGER `#dc2626`), and `content.ts` feeds it **three** strings:

| String | `content.ts` | A write Jira refused? |
| --- | --- | --- |
| `parseError` — "Use formats like 2.5h, 2h 30m" | `:169` | **NO** — client-side parse, nothing was sent |
| `overLimitError` — "Hours per entry can't exceed 24" | `:174` | **NO** — client-side limit, nothing was sent |
| `logFailedError` — "Couldn't log time — try again" | `:195` | **YES** |

Two of the three render red for input that was never sent to Jira. That violates the epic's standing rule
and `DESIGN.md:545`. The 7.6 audit treated the *style object* as one usage; it has three.

**This is not a new judgement call — three independent sources already decided it:**
- **D-7.3-16**: unparseable input is amber, not red (applied in `ResumeCard`, *"explicitly deferred
  elsewhere until a future story reconciles them"*). **This story is that future story for the banner.**
- **D-7.10-34**: red for a genuine rejection, amber for transient/our-problem.
- **The design source**: `round2:1327-1328` gives the format error `#EDD3A6` border + `#7A3E06` ink.

**Resolution:** split `errorTextStyle` into `errorTextAmberStyle` (`#7A3E06`) and `errorTextRedStyle`
(`#991B1B`). `DANGER = '#dc2626'` is **deleted** and replaced by `ERROR_INK = '#991B1B'` — the same
substitution D-7.9-18(b) and D-7.10-34 already made twice this epic. **After this story the banner surface
has exactly ONE red, on exactly one branch: `logFailedError`.**

### D-7.11-41 — The three error strings: two are re-worded, all three keep their trigger

AC12 requires "the hours parser and its three error strings" to still work — it does not freeze the copy.
The design source re-words the failure and changes its behaviour:

| # | Today | After |
| --- | --- | --- |
| 1 | `Use formats like 2.5h, 2h 30m` | **unchanged** (`round2:1328` is byte-identical) |
| 2 | `Hours per entry can't exceed 24` | **unchanged** — not drawn in the source; keep verbatim |
| 3 | `Couldn't log time — try again` | **`Couldn't log time — nothing was saved`** (`round2:1335`) |

#3's re-word is load-bearing: the button now *is* the retry ("Try again", `:1334`), so "try again" in the
message became redundant, and "nothing was saved" is the honest fact the user needs. Note that on the
`pending` (outbox) path the write **was** durably queued, so #3 must NOT be shown there — `content.ts:189`
already treats `pending` as success. Preserve that.

### D-7.11-42 — The rail states a number and stops (AC10), enforced by a test

AC10 forbids escalation. The amber of D-7.11-40 is **not** an escalation: it is bound to a *parse failure*,
never to `hoursMissing`. Make this machine-checkable: a test that renders the collapsed rail at
`hoursMissing` = 1, 6, 40 and asserts the serialized style of every element is **byte-identical** across all
three. That is a real invariant, not a class assertion.

### D-7.11-43 — SD-7 ("time off", never "PTO") — this surface is CLEAN, and must stay clean

**Grep-verified at `f7740bc`:** neither `entrypoints/content.ts` nor any `lib/banner-*.ts` contains "PTO",
"pto" or a time-off string. The banner's copy is: the eyebrow, the state line, "Open extension", "Dismiss
for today", "Log time on \<KEY\>", "Hours to log on \<KEY\>", "Log", the three errors, "Logged {N}h",
"Closing…", and "⏎ to log · esc to close".

**The trap SD-7 warns about does not arise here, and the new strings must not create it.** The rail never
renders a Jira subtask summary — it renders only an issue **key** from
`currentTicketFromUrl` (`lib/jira-url.ts`), which is `/browse/([A-Za-z][A-Za-z0-9]+-\d+)` upper-cased. **A
key is Jira data and is rendered verbatim** (including a `KNP-99` time-off key). Do not special-case,
re-label or suppress any key. **No new string may say "PTO".**

### D-7.11-44 — Motion: reuse the existing `matchMedia` guard, extend it to hover/focus

`content.ts:49-59` already implements `prefersReducedMotion()` + `transitionFor()`. Keep it. AC6's
`transition:'none'` + jump-to-end-state is already the behaviour at `:81-84` and `:137-144`. **What is new:**
hover and focus handlers (C9). Reduced motion does **not** disable hover/focus feedback — those are state
changes, not motion; only their *transition* is suppressed.

### D-7.11-45 — The expand is a content swap, not a height change (AC5)

`renderExpandedQuickLog` currently sets `host.style.height = EXPANDED_HEIGHT` (`banner-dom.ts:132`).
**Delete that line and delete `EXPANDED_HEIGHT`** (`banner-styles.ts:73`). The host height is constant
44 px. `COLLAPSED_HEIGHT` should be renamed `RAIL_HEIGHT = '44px'` — one height, one contract. Both
renderers call `host.replaceChildren()`, which already swaps contents in place; keeping the height fixed is
what makes "the page never reflows twice" true.

### D-7.11-46 — Escape during an in-flight submit: fix the confirmation drop (E-4)

See `### Deferred-Item Decisions`.

---

## Deferred-Item Decisions (E-4)

`_bmad-output/implementation-artifacts/deferred-work.md:91-94` carries Story 3.3's two items. **Neither
names an owner**, so this story must decide both — and it is the last chance, because Epic 7 closes here.

### Item 1 — SW cold-start yields no banner until the next navigation (`deferred-work.md:93`)

> *"Graceful (never crashes), AC #8 permits 'no banner', recovery is navigation-gated; a content-side retry
> is out of scope."*

**RE-DEFER, with a named owner.** Rationale: this is a **service-worker lifecycle** defect, not a design
defect. Nothing in AC1–AC12 touches it — AC11 explicitly blesses "no rail" as a valid outcome, and the
`sendRequest` timeout path already funnels into `state === null` → `removeBanner()` (`content.ts:224-231`).
Fixing it means a retry/backoff in the content script or SW warm-up, which is behaviour change with its own
test surface, in a story whose scope is already the epic's largest restyle. **Owner: a future Phase-2
reliability story.** Update the `deferred-work.md` entry to name that owner explicitly — the epic has been
bitten repeatedly by unowned items, and D-7.10-30 cites exactly this risk.

### Item 2 — Escape during an in-flight submit drops the ✓ confirmation (`deferred-work.md:94`)

> *"Minor UX only; the in-flight guard prevents the double-post hazard and the write is durable."*

**CLOSE IT IN THIS STORY.** Rationale: unlike Item 1, this **is** in scope. AC12 names "the success
confirmation followed by slide-away at 600 ms" as behaviour that must work, and this defect is precisely
that confirmation being dropped. The cause is one line: `content.ts:207-209` calls `reevaluate()` on
Escape unconditionally, including while `inflight === true`. The fix is to gate it:

```
if (e.key === 'Escape') { if (inflight) return; void reevaluate(); }
```

This is a **two-token change to a guard that already exists** (`inflight`, `:163`) and it removes a state
where the user is told nothing after a successful write. C13 touches the same handler region anyway. Remove
the entry from `deferred-work.md` and record the closure.

---

## Accessibility

The rail sits in **someone else's page**. Four things must hold.

### A11y-1 — It must not trap focus or disrupt Jira's tab order

The host is appended to `document.body` **last** (`content.ts:108`), so it lands at the **end** of the DOM
order while being visually **first**. That is a known, accepted reading-order divergence (not a violation —
2.4.3 is about a *meaningful* sequence, and the rail is a self-contained region). **Requirements:**
- **No focus trap.** There is no `keydown` handler on the host, no `Tab` interception, no `tabindex` other
  than the natural order of the `<button>`s. **Do not add one.**
- **No autofocus on render.** `input.focus()` (`content.ts:212`) fires only after the user clicks the
  contextual action — a user-initiated expand. **That is correct; keep it.** The collapsed rail must never
  steal focus on page load.
- **No positive `tabindex`** anywhere, which would corrupt Jira's whole tab order.
- Escape closes the quick-log (`:207`) and never destroys data — AC-consistent with the a11y audit's row 8.

### A11y-2 — It must announce itself sanely

- `role="region"` + `aria-label="Time-tracking banner"` (`banner-dom.ts:61-62`) — preserved.
- The error slot is `role="alert"` (`banner-dom.ts:156`). **Note the 7.9 finding**: a `role="alert"`
  populated *at first paint* is generally not announced. Here the slot is created **empty** and populated
  later by `showError` (`content.ts:156-157`), which is the correct shape — **preserve it**. Do not
  pre-populate.
- **Every inline SVG is `aria-hidden="true"` and `focusable="false"`.** `focusable="false"` matters
  specifically here: without it, IE/legacy-Edge-style behaviour and some AT put SVGs in the tab order, which
  would disrupt Jira's tab order (A11y-1). The meaning is carried by adjacent text in every case.
- The dismiss button keeps `aria-label="Dismiss for today"` (`banner-dom.ts:115`) — it is icon-only.
- **The success state must be announced.** Today `logBtn.textContent = '✓'` changes a button's label
  silently. With C14 the button becomes "Logged {N}h"; route the confirmation through the existing
  `role="alert"` slot (or a polite live region) so a screen-reader user learns the write succeeded before
  the rail slides away at 600 ms.

### A11y-3 — Status is never colour-alone

Every state pairs colour + icon + text: format error = `Circle` + amber + "Use formats like…"; write failure
= `CircleX` + red + "Couldn't log time — nothing was saved"; success = `CircleCheck` + green + "Logged
{N}h". **AC10 means the collapsed rail has no status colour at all** — it is one neutral state line, so
there is nothing to encode.

### A11y-4 — Contrast, hand-computed against JIRA's actual background

Computed with the WCAG 2.x relative-luminance formula. **The rail's own ground is `#FFFFFF`; Jira's page
chrome behind and below it is `#F7F8F9`** (`round2:64, 97, 137, 148` — the mockup's Jira stand-in).

| Foreground | Background | Ratio | Verdict |
| --- | --- | --- | --- |
| `#1E1B2E` state line | `#FFFFFF` rail | **16.63:1** | PASS |
| `#6B6B72` eyebrow (10 px) / dismiss | `#FFFFFF` | **5.21:1** | PASS |
| `#6B6678` "Open extension" ghost | `#FFFFFF` | **5.52:1** | PASS |
| `#FFFFFF` on `#594F74` primary action | — | **7.54:1** | PASS |
| `#594F74` outline-button text | `#FFFFFF` | **7.54:1** | PASS |
| `#7A3E06` amber error ink | `#FFFFFF` | **8.46:1** | PASS |
| `#991B1B` red error ink | `#FFFFFF` | **8.27:1** | PASS |
| `#FFFFFF` on `#991B1B` "Try again" | — | **8.27:1** | PASS |
| `#15803D` success text | `#FFFFFF` | **5.02:1** | PASS |
| `#6B6B72` success field value | `#FCFCFD` | **5.08:1** | PASS |
| **`#594F74` 3 px spine** | **Jira `#F7F8F9`** | **7.11:1** | PASS |
| `#E4E3EC` bottom hairline | `#FFFFFF` rail | **1.27:1** | *see below* |
| `#FFFFFF` rail ground | Jira `#F7F8F9` | **1.06:1** | *see below* |

**Two honest non-passes, both correct by design.** The rail's white ground against Jira's `#F7F8F9` is
**1.06:1** and its hairline is **1.27:1** — neither meets 1.4.11's 3:1. **This is the design's stated
intent**, not a defect: `DESIGN.md:500-502` requires the rail to read as a distinct object *"without a
single saturated pixel"*. 1.4.11 applies to boundaries that are **the only means** of identifying a
control; the rail is identified by its content (mark, eyebrow, state line, buttons) and by the **3 px spine
at 7.11:1**, which is the high-contrast edge that does the separating. Every **interactive control inside**
the rail meets AA on its own. **Record this reasoning in Completion Notes** so a reviewer does not file the
1.27:1 as a violation — and do not "fix" it by darkening the border, which would break AC2.

**Caveat the developer must state honestly:** `#F7F8F9` is the *mockup's* Jira stand-in. Real Jira surfaces
vary (`#FFFFFF` content, `#F4F5F7`/`#F7F8F9` chrome, and dark-mode instances). The rail's own contrasts are
**self-contained** — every ratio in the PASS rows is against the rail's own `#FFFFFF`/`#FCFCFD` ground and
is therefore **independent of what Jira renders**. Only the last two rows depend on Jira, and both are the
decorative-boundary case. **Do not claim the rail was verified against a real Jira instance** — it cannot be
in this environment (see `### Testing`).

**Nine mockup-opacity/colour contrast failures have been found this epic and axe caught none of them**
(`color-contrast` is disabled in `lib/test/axe.ts`). The rail introduces **no `rgba()` text colour and no
`opacity` on text**, which is why this table has no new failure. **Keep it that way** — if a hover state is
implemented as `opacity`, recompute.

---

## Tasks / Subtasks

- [x] **T1 — Rebuild `lib/banner-styles.ts` as the rail's literal set (AC1, AC2, AC3, AC4, AC10)**
  - [x] Replace `SYSTEM_FONT` with `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (D-7.11-38).
  - [x] Replace the token block: `LEGACY_PURPLE #594F74`, `ROYAL_PURPLE #615B99`, `FOREGROUND #1E1B2E`,
        `MUTED #6B6678`, `FAINT #6B6B72`, `BORDER #E4E3EC`, `PRIMARY_SOFT #ECEBF3`, `SURFACE #FFFFFF`,
        `SURFACE_SUNK #FCFCFD`, `HOVER_NEUTRAL #F4F4F7`, `AMBER_BORDER #EDD3A6`, `AMBER_INK #7A3E06`,
        `ERROR_INK #991B1B`, `STATUS_CLEAN #15803D`, `STATUS_CLEAN_BORDER #BFE0C8`. Each with a comment
        naming its `DESIGN.md` token (D-7.11-35).
  - [x] **Delete `DANGER = '#dc2626'`**, `ACCENT`, `ACCENT_SUBTLE`, `NEUTRAL_700`, `NEUTRAL_500` (D-7.11-40).
  - [x] Rename `COLLAPSED_HEIGHT` → `RAIL_HEIGHT = '44px'`; **delete `EXPANDED_HEIGHT`** (D-7.11-45).
  - [x] Rewrite `bannerContainerStyle`: white ground, 44 px, `border-left:3px solid #594F74`,
        `border-bottom:1px solid #E4E3EC`, `padding:0 12px 0 13px`, `gap:12px`, **no `boxShadow`**.
  - [x] Add `markOuterStyle` / `markInnerStyle`, `eyebrowStyle`, `dividerStyle`, `stateLineStyle`
        (+ `stateFigureStyle` at weight 600), `spacerStyle`, `primaryActionStyle`,
        `openExtensionGhostStyle`, `openExtensionOutlineStyle`, `dismissStyle`, `hoursFieldStyle`,
        `submitStyle`, `errorTextAmberStyle`, `errorTextRedStyle`, `keyboardHintStyle`,
        `successButtonStyle`, and the hover/focus value maps for T5.
  - [x] `font-variant-numeric: tabular-nums` on every style carrying a figure (AC3).

- [x] **T2 — New `lib/banner-icons.ts`: hand-inlined lucide paths (AC9)**
  - [x] Export path data for `ArrowUpRight`, `CircleCheck`, `Circle` (filled), `CircleX`,
        `CornerDownLeft`, and the dismiss icon (**pending E-1**), copied from `lucide-react@^0.460.0`.
  - [x] `svg(name, {size})` builder using `createElementNS`; sets `aria-hidden="true"`,
        `focusable="false"`, `stroke="currentColor"`, `stroke-width="2"`, `fill="none"`
        (`fill="currentColor"` for `Circle`), `viewBox="0 0 24 24"` (`DESIGN.md:226-229`).
  - [x] **No network fetch, no `<img>`, no data-URI font** (AC1).

- [x] **T3 — Rebuild `lib/banner-dom.ts` structure (AC2, AC4, AC7, AC9, AC12)**
  - [x] `renderCollapsedBanner`: mark (two spans, `aria-hidden`) → eyebrow → divider → state line →
        spacer → [contextual action] → "Open extension" + `ArrowUpRight` → dismiss.
  - [x] **Remove all three text glyphs**: `dot.textContent='●'` (`:84`), `dismiss.textContent='✕'`
        (`:114`), `BANNER_STRINGS.check='✓'` (`:38`) (AC9).
  - [x] State-line copy: drop the trailing period; wrap the figure in a weight-600 span (C6).
  - [x] "Open extension" is the **ghost** variant when `currentTicket` is set, the **outline** variant
        when it is not (`round2:60` vs `:106`).
  - [x] `renderExpandedQuickLog`: **delete the `host.style.height` write** (D-7.11-45); render label,
        30 px field, submit, error slot (empty, `role="alert"`), keyboard hint with `CornerDownLeft`.
  - [x] Preserve `ensureBannerHost`'s `role="region"` + `aria-label`, and the input's `aria-label`.

- [x] **T4 — `body padding-top`, written exactly once (AC5) — pending E-3**
  - [x] On first mount only: store the prior `document.body.style.paddingTop`, then write `'44px'`.
  - [x] **Never re-write** on re-render, expand, collapse or SPA re-eval.
  - [x] **Restore the stored value** on every removal path: dismiss, caught-up, disconnect broadcast,
        and the deferred `host.remove()`.
  - [x] Guard: if the host already exists, do not touch padding.

- [x] **T5 — Hover and focus in JS (AC6)**
  - [x] `mouseenter`/`mouseleave` → `el.style.background` (and `el.style.color` where the source
        specifies it): primary `#594F74`→`#615B99`; ghost colour `#6B6678`→`#594F74`; outline
        `#fff`→`#ECEBF3`; dismiss `transparent`→`#F4F4F7` with colour `#6B6B72`→`#1E1B2E`.
  - [x] `focus`/`blur` → `el.style.boxShadow` = `0 0 0 3px rgba(89,79,116,.13)` (`round2:1310`), cleared
        on blur. **Every interactive control gets a visible focus ring** — D-7.9-17 made missing focus
        rings BLOCKERS.
  - [x] No `:hover`, no `:focus`, no `:focus-visible`, no pseudo-element anywhere (AC1).

- [x] **T6 — Expand/collapse is a content swap at constant height (AC5)**
  - [x] Verify no code path writes `host.style.height` after mount.
  - [x] The page must not reflow twice: padding written once (T4) + height constant.

- [x] **T7 — Narrow viewport <860 px (AC8)**
  - [x] Read `window.innerWidth` in JS — **no media query** (AC1).
  - [x] Below 860: omit eyebrow + divider + "Open extension"; state line gets
        `flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`; action label
        shortens to `Log on {KEY}`; padding `0 10px 0 11px`, gap `10px` (`round2:149-153`).
  - [x] Action must **never wrap**: `white-space:nowrap` + `flex:0 0 auto`.
  - [x] Re-evaluate on `resize` (debounced), reusing the existing render path.

- [x] **T8 — Error, success and retry states (AC10, AC12, D-7.11-40, D-7.11-41)**
  - [x] Parse + over-limit errors → `errorTextAmberStyle` + `Circle` glyph + field border `#EDD3A6`,
        ring `none`.
  - [x] Write failure → `errorTextRedStyle` + `CircleX` + submit becomes `#991B1B` / "Try again";
        **persists** (no auto-clear), field border `#E4E3EC`.
  - [x] Copy #3 → `Couldn't log time — nothing was saved`. **`pending` still counts as success.**
  - [x] **C13:** the amber error auto-clears after 1.5 s **without destroying the typed value** — clear the
        error slot and restore the field border in place; **do not call `reevaluate()`**.
  - [x] Success → outline `#15803D` / `#BFE0C8`, `CircleCheck` + "Logged {N}h", `Closing…` hint, then
        `removeBanner()` at 600 ms (unchanged timing).
  - [x] Announce success via the live region (A11y-2).

- [x] **T9 — Close deferred Item 2; re-defer Item 1 with an owner (E-4)**
  - [x] Gate the Escape handler on `inflight` (`content.ts:207-209`) (D-7.11-46).
  - [x] Remove `deferred-work.md:94`; reword `:93` to name a future reliability-story owner.

- [x] **T10 — Tests (see `### Testing` — RED-prove every load-bearing one)**

- [x] **T11 — Epic-close gate (`### Epic-Close Gate`)**

---

## Testing

### The test-quality bar for this story

Reviewers have found **fourteen-plus** toothless tests in Epic 7. Story 7.8's review ran 47 mutations with
**26 GREEN**. Story 7.9's found the D-7.3-9 invariant pin vacuous. Story 7.10's found the Settings surface
had lost **100 % of its axe coverage** because a test was *retargeted* rather than replaced.

- **RED-prove every load-bearing test.** For each, record in Completion Notes: the mutation applied, and
  that the test failed before the fix and passes after. A test that never went red proves nothing.
- **Coverage that is retargeted is coverage removed** (D-7.10-36). The banner has **four existing axe
  scans** (`lib/banner-dom.test.ts:36, 44, 64` plus the structural test at `:17`). Those scans must still
  exist and still scan a **rendered rail** afterwards. If a builder's signature changes, **update the
  scan**; never delete or re-point it at something smaller.
- **Never claim coverage that does not exist.** A widened summary claim has outrun what was verified in
  four separate stories this epic.

### `lib/banner-styles.test.ts` is currently near-tautological — replace, do not extend

Nine of its assertions read a property off a style object and compare it to the constant that object was
built from (e.g. `:42` "brand dot is brand purple", `:73` "error text is a **danger-ish** color string").
These cannot fail for any wrong value. **Rewrite them** to assert against the **`DESIGN.md` /
`round2.dc.html` literal**, quoted in the test as a comment with its file:line. That version genuinely goes
red when a hex drifts.

### How to test a vanilla-DOM surface — the component patterns do NOT transfer

The rest of Epic 7 tests React components with Testing Library. **None of that applies here.** This surface
is `document.createElement` + `setAttribute('style', …)`. Test it as:

1. **Builder tests (jsdom).** Call `renderCollapsedBanner(host, state, handlers)` on a jsdom document and
   assert on the resulting tree: element order, `role`/`aria-label`/`aria-hidden`, `<button type=button>`,
   and **the serialized `style` attribute string**. `styleString` (`banner-styles.ts:167`) makes this exact
   and greppable — assert on substrings like `height:44px` and `border-left:3px solid #594F74`.
2. **Literal-pin tests.** Each exported constant equals its design-source value, with the file:line in a
   comment.
3. **Behaviour tests via the builders' returned handles.** `renderExpandedQuickLog` returns
   `{input, logBtn, error}`; dispatch real `click`/`keydown`/`focus`/`mouseenter` events at them.
4. **A source-level grep test** for the AC1 and AC9 invariants — the precedent is
   `WeeklyGrid.test.tsx:131` and `lib/day-status-vocabulary.grep.test.ts`.
5. **axe** via `lib/test/axe.ts` on the rendered host, exactly as `banner-dom.test.ts` does today.

### What CANNOT be verified here — state this honestly, do not dress it up

- **jsdom does not lay out.** It computes no geometry: `offsetHeight`, `getBoundingClientRect()` and
  `getComputedStyle` widths are all zero/empty. Therefore **"the rail is 44 px tall", "the action never
  wraps", "the page never reflows twice" and "the state line truncates with an ellipsis" cannot be proved
  by test.** What CAN be proved is the **declared style**: that `height:44px` is the only height written,
  that no code path assigns `host.style.height` after mount, that `white-space:nowrap` and `flex:0 0 auto`
  are present on the action, and that `text-overflow:ellipsis` is present on the state line. **Assert the
  declaration and say plainly that the rendered geometry is unverified.**
- **Playwright is not installed** in this environment, and the built pages carry no `chrome.*` context, so
  a real-browser check is **not feasible**. Do not add it; do not claim it.
- **No real Jira page is available.** Behaviour against Jira's actual CSP, its real header, its own
  `body` styles, and its SPA router is **unverified by construction**. The `body padding-top` interaction
  (E-3) in particular is a real-browser risk that testing here cannot retire — say so.
- **`color-contrast` is disabled in the axe gate** (`lib/test/axe.ts`), so axe will not catch a contrast
  regression. The hand-computed table in `### Accessibility` is the only contrast evidence, and it is
  arithmetic, not a measurement.

### Required new tests

| # | Test | Must go RED when… |
| --- | --- | --- |
| TT1 | Container style contains `height:44px`, `background:#ffffff`, `border-left:3px solid #594f74`, `border-bottom:1px solid #e4e3ec`; contains **no** `box-shadow` and **no** `#e9e6f3` | any of C1–C3 is reverted |
| TT2 | No module under `lib/banner-*` or `entrypoints/content.ts` writes `style.height` other than the single `RAIL_HEIGHT` assignment (source-level grep) | D-7.11-45 is reverted |
| TT3 | `SYSTEM_FONT` **exactly equals** `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | the old stack returns (C19/D-7.11-38) |
| TT4 | Every style object carrying a figure includes `font-variant-numeric:tabular-nums` | AC3 regresses |
| TT5 | **AC10 invariant:** serialized styles of every collapsed-rail element are byte-identical at `hoursMissing` 1 / 6 / 40 | any escalation-by-deficit is introduced (D-7.11-42) |
| TT6 | **AC9 glyph ban:** no `lib/banner-*.ts` or `entrypoints/content.ts` source contains `●`, `✕`, `✓`, `⚠`, `◆`, `◔`, `↗`, `⏎` | any text glyph returns. **Extend `day-status-vocabulary.grep.test.ts`'s `BANNED_GLYPHS` (`:663`) to the banner files** — today it is scoped to the manager surface only (`:659`), which is why `BANNER_STRINGS.check='✓'` has survived. Add `↗` and `⏎`. |
| TT7 | **AC1 CSP:** no banner source contains `<style`, `classList`, `className`, `@keyframes`, `@media`, `::before`, `::after`, `fetch(`, `XMLHttpRequest`, `new Image`, `url(http` | a CSP-illegal construct is introduced |
| TT8 | Every inline SVG carries `aria-hidden="true"` and `focusable="false"` | A11y-2 regresses |
| TT9 | Parse error and over-limit error render `#7a3e06`, **not** `#dc2626`; write failure renders `#991b1b`; `DANGER`/`#dc2626` appears in **no** banner file | D-7.11-40 is reverted |
| TT10 | Amber error auto-clear preserves `input.value` after the 1.5 s timer (fake timers) | C13 regresses |
| TT11 | `body.style.paddingTop` is written once across mount + re-render + expand, and restored to its prior value on dismiss / disconnect / caught-up | AC5 / T4 regresses |
| TT12 | Escape while `inflight` does **not** re-render; Escape while idle does | D-7.11-46 regresses |
| TT13 | Focus on each control sets a non-empty `boxShadow`; blur clears it | D-7.9-17's blocker class returns |
| TT14 | Non-ticket page renders the **outline** "Open extension" and **no** contextual action; ticket page renders the filled action and the **ghost** variant | AC7 regresses |
| TT15 | Below 860 px: no eyebrow, no divider, no "Open extension"; action label is `Log on {KEY}`; state line style contains `text-overflow:ellipsis` | AC8 regresses |
| TT16 | The four existing axe scans still pass on the **rebuilt** rail, plus a new scan for the narrow and error states | any a11y regression |

### Baseline

**Baseline at `f7740bc`: 117 files / 1567 passed / 0 skipped.** `pnpm test` **exits non-zero** from ONE
known pre-existing unhandled rejection in `components/manager/ManagerView.test.tsx`
(`@wxt-dev/storage` `getStorageArea` fake-browser teardown race). **Any drop below 1567, or a SECOND
rejection, is the developer's regression.** Re-measure and record the actual numbers in Completion Notes;
never copy this line forward without re-running.

Fixing the known rejection is a **bonus that can never excuse a new one**.

---

## Epic-Close Gate

**This is the last story of Epic 7.** Before the epic is marked done, verify:

1. **`docs/a11y-audit-2026-06-27.md` is an epic-end gate.** Its "Release gate: **NOT YET GREEN**"
   (`:130-133`) is blocked on **human manual passes** — rows 2, 5, 6, 11, 12, 13, 14 and the keyboard-only
   flow (`:94` names *"Manager drill-down → Banner contextual log"*, which this story rebuilds). The
   automated gate must stay GREEN and the document must be **updated to reflect the rebuilt rail** — its
   banner row (`:35`) and rows 3, 7, 8, 9, 10 all cite banner behaviour that this story changes. **A stale
   audit is worse than none.** The human sign-off remains outstanding and must be reported as outstanding,
   not quietly marked done.
2. **`lib/no-monospace.grep.test.ts`'s `ALLOWLIST` is `{}`** (`:89`) — D-7.7-21f's stated precondition.
   Verify it is still empty and that this story adds no entry.
3. **`lib/day-status-vocabulary.grep.test.ts` allowlists have not widened.**
4. **The Epic 6.3 fenced files are still untouched and still uncommitted** — they are not this epic's work.
5. **`deferred-work.md`**: every Epic-7 item has a named owner (T9).

---

## Dev Notes

### Project Structure Notes

**Files this story MODIFIES:**
- `lib/banner-styles.ts` — literal set + style objects (T1)
- `lib/banner-dom.ts` — structure + ARIA (T3)
- `entrypoints/content.ts` — behaviour: padding, hover/focus, narrow, states, Escape guard (T4–T9)
- `lib/banner-styles.test.ts`, `lib/banner-dom.test.ts` — rewritten/extended (T10)
- `lib/day-status-vocabulary.grep.test.ts` — extend `BANNED_GLYPHS` scope to the banner (TT6)
- `_bmad-output/implementation-artifacts/deferred-work.md` — T9
- `docs/a11y-audit-2026-06-27.md` — epic-close item 1

**Files this story CREATES:**
- `lib/banner-icons.ts` + `lib/banner-icons.test.ts`

**Files this story MUST NOT TOUCH:**
- **Fenced Epic 6.3 (uncommitted, not this epic's work):** `scripts/pack-crx.mjs`,
  `scripts/derive-ext-key.mjs`, `scripts/lib/`, `wxt.config.ts`, `package.json`, `docs/release.md`.
  **`wxt.config.ts` is also how AC3's "no `web_accessible_resources` entry" is satisfied — by not editing
  it at all.**
- **Money path (D-7.3-9 absolute):** `lib/approval.ts`, `lib/comment-schema.ts`, `lib/checksum.ts`,
  `lib/adf.ts`, `lib/manager-matrix.ts`, `lib/hierarchy.ts`, `lib/storage/pinned-tickets.ts`,
  `lib/manager-resolution.ts`, popup `App.tsx`'s `breaksHeaderBaseline`.
- **`lib/banner-sw.ts`** — the SW write path is unchanged by this story (D-7.11-39 scope note).
- `lib/badge.ts`, `lib/jira-url.ts`, `lib/hours.ts`, `lib/storage/banner-dismiss.ts`,
  `lib/storage/outbox.ts` — all consumed as-is.

**Working-tree hygiene (SD-5):** do not commit; never `git add -A`; **do NOT `git stash`** — use
`git show f7740bc:<path>` to inspect baseline content. The Epic 6.3 files are already dirty at HEAD;
that is **pre-existing, not yours** — check `git status` before blaming your own run.

### The shared-component leak risk is LOW here — but verify it, do not assume

Epic 7's recurring injury is changes leaking through shared components behind mocks (7.2, 7.3, 7.4, 7.5).
**The banner tree is unusually well isolated:** `lib/banner-styles.ts` and `lib/banner-dom.ts` are imported
**only** by `entrypoints/content.ts` and their own tests; `lib/banner-icons.ts` will be new. Confirm with a
grep and paste the result into Completion Notes. The one genuinely shared dependency is `lib/hours.ts`
(`parseHours`, `hoursToSeconds`, `MAX_HOURS_PER_ENTRY`), also used by the popup — **it must not change.**
Prove it with `git diff f7740bc -- lib/hours.ts` producing empty output.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 7.11` (lines 2078–2149)] — authoritative ACs
- [Source: `.../ux-designs/ux-jira-time-logger-2026-07-25/DESIGN.md#The Guest Surface` (lines 488–529)]
- [Source: `.../DESIGN.md` frontmatter `typography.guest` (lines 104–109)] — the AC3 stack
- [Source: `.../DESIGN.md` frontmatter `components.guest-rail` (lines 206–216)] — 44px/spine/mark/border
- [Source: `.../DESIGN.md` frontmatter `icons:` (lines 217–256)] — incl. the CSP exception at 222–224
- [Source: `.../DESIGN.md` frontmatter `colors:` (lines 6–50)] — every literal in T1
- [Source: `.../DESIGN.md#Do's and Don'ts` (lines 544–556)] — the four rail-specific Don'ts
- [Source: `.../EXPERIENCE.md#The Guest Rail — platform behaviour` (lines 370–388)]
- [Source: `.../EXPERIENCE.md#Open Items` item 0 (lines 392–396)] — SD-7 "time off"/verbatim rule
- [Source: `.../imports/jira-time-logger-round2.dc.html` **Surface 4, lines 38–192**] — SD-6 source of record
- [Source: `.../jira-time-logger-round2.dc.html` `bannerBase`/`bannerNotes` (lines 1310–1342)] — state values
- [Source: `_bmad-output/implementation-artifacts/epic-7-decision-log.md#SD-6` (lines 2528–2547)]
- [Source: `...#SD-7` (lines 2549–2562)]
- [Source: `...#D-7.10-34` (lines 4527–4537)] — red-vs-amber precedent + the `#991B1B` substitution
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` (lines 91–94)] — Story 3.3's two items
- [Source: `docs/a11y-audit-2026-06-27.md` (lines 35, 63, 67–70, 94, 121–133)] — the epic-end gate
- [Source: `entrypoints/content.ts` (lines 1–300)] — preserved behaviour
- [Source: `lib/banner-dom.ts` (lines 29–160)] — builders, ARIA, the three text glyphs
- [Source: `lib/banner-styles.ts` (lines 22–171)] — current literals; the red at `:30`/`:157`
- [Source: `lib/banner-sw.ts` (lines 42–107)] — unchanged write path
- [Source: `lib/day-status-vocabulary.grep.test.ts` (lines 653–680)] — `BANNED_GLYPHS`, manager-scoped
- [Source: `lib/no-monospace.grep.test.ts` (line 89)] — `ALLOWLIST = {}`

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-sonnet-5, via bmad-story-developer)

### Debug Log References

- Probed whether `entrypoints/content.ts` can be imported under this project's vitest config: it cannot (`ReferenceError: defineContentScript is not defined` — `defineContentScript` is a WXT build-time global with no `WxtVitest` plugin wired into `vitest.config.ts`). Confirmed by a throwaway `entrypoints/__probe.content.test.ts` (deleted after confirming). This is pre-existing (also true of `entrypoints/background.ts`, which has no test file either) and drove the decision to extract testable behaviour into `lib/banner-interactions.ts`.
- `pnpm compile`: clean (0 errors) after the rewrite.
- `pnpm lint`: 0 errors, 12 warnings — all pre-existing `import/order` warnings in files this story did not touch (identical count/class to the story's stated baseline).
- `pnpm test`: 120 files / 1677 tests passed (baseline 117 files / 1567 tests), exiting non-zero from the SAME ONE pre-existing `ManagerView.test.tsx` unhandled rejection (`@wxt-dev/storage` `getStorageArea` fake-browser teardown race) — no second rejection introduced.
- `pnpm build`: clean; `output/chrome-mv3/manifest.json` has no `web_accessible_resources` key (AC3 verified directly in the build artifact, not just by omission in source).

### Completion Notes List

**Summary of the restyle.** `lib/banner-styles.ts` was rewritten as the rail's single literal set (T1): every DESIGN.md `colors:` hex is a named, commented constant pinned by a test; `DANGER`/`ACCENT`/`ACCENT_SUBTLE`/`NEUTRAL_700`/`NEUTRAL_500` are deleted; `SYSTEM_FONT` now matches `{typography.guest}` exactly; `RAIL_HEIGHT = '44px'` replaces `COLLAPSED_HEIGHT`/`EXPANDED_HEIGHT`; `tabular-nums` is declared on every figure-bearing style. A new `lib/banner-icons.ts` (T2) hand-inlines the six lucide shapes this surface needs (`ArrowUpRight`, `CircleCheck`, `Circle`, `CircleX`, `CornerDownLeft`, `X`), copied from `node_modules/lucide-react@0.460.0`'s own icon source — no runtime dependency, no network. `lib/banner-dom.ts` was rebuilt (T3): the 18px mark is two nested spans (D-7.11-36, not an icon); all three Story-3.3-era text glyphs (`●`/`✕`/`✓`) are gone; `renderCollapsedBanner` now returns handles (`primaryButton`/`openExtensionButton`/`dismissButton`) so the caller can wire hover/focus; `renderExpandedQuickLog` never writes `host.style.height` (D-7.11-45). `entrypoints/content.ts` gained the `body padding-top` push/restore (T4), JS hover/focus wiring (T5), the narrow-viewport re-render path (T7), the amber/red error split with C13's non-destructive auto-clear and the success/retry states (T8), and the Escape/in-flight gate (T9, closing the Story 3.3 deferred item).

**Deviation — a new module, `lib/banner-interactions.ts`, was added beyond the story's named file list.** `entrypoints/content.ts` cannot be imported under this project's current vitest config (see Debug Log). To make TT10-TT13 (body-padding save/restore + re-entrancy, the Escape/in-flight gate, focus-ring wiring, hover-colour wiring, the amber-clear primitive) genuinely RED-provable rather than asserted-but-untested, those five behaviours were extracted into a small, dependency-free `lib/banner-interactions.ts` that `content.ts` imports and composes. This keeps `content.ts` as "thin DOM + behaviour glue" (its own docstring's claim) and mirrors the existing `banner-sw.ts` precedent (SW-side logic extracted from the SW entrypoint for the same reason). `content.ts`'s own submit/error/success orchestration (the closures that call `sendRequest` and choose which tone/copy to show) is NOT exercised by any automated test — this is a real, honestly-stated gap, not a hidden one; it exists because `content.ts` itself cannot be imported, and fixing that (wiring `WxtVitest` into `vitest.config.ts`) is a test-infrastructure change no task in this story names and was judged out of scope for a story already the epic's largest restyle.

**D-7.11-31(b) applied literally, overruling the story's own T3/`### Verified Design-Source Values` text.** The story file's own "Verified Design-Source Values" section (and E-2) argued for 30px on the expanded field/submit, following the mockup. The orchestrator ruling in `epic-7-decision-log.md` (D-7.11-31b) explicitly overrules that: "use 28px, NOT the source's 30px... this overrules the creator's recommendation." Implemented literally: `hoursFieldStyle`/`submitStyle` are 28px, matching `primaryActionStyle`/`openExtensionGhostStyle`/`openExtensionOutlineStyle`/`successButtonStyle` — one control height everywhere except the dismiss icon's own 26×26 footprint (which was never a control-height case).

**D-7.11-30 (body padding-top) — what was implemented and what could not be verified.** `lib/banner-interactions.ts#createPageShift` reads `document.body.style.paddingTop` (the inline value — '' when Jira/nothing has set one, faithfully preserved as '' on restore, not coerced to some other "unset" representation) before writing `'44px'`, and restores the exact saved value on every removal path (dismiss, caught-up/disconnected via `removeBanner`, teardown, and a new catch-block rollback if `renderCollapsedBanner` itself throws mid-mount). Re-entrancy is a single `owned` boolean: `push()` is a no-op while owned, `restore()` is a no-op once not owned, so double-add and double-restore (or restoring a value this instance already gave back) are impossible by construction — proven by `lib/banner-interactions.test.ts` (7 tests), including the case where a host page had already set its own `paddingTop` before the rail mounted. **What is NOT verified, and cannot be verified here:** whether pushing the padding actually moves real Jira page content out from under the rail. No real Jira page exists in this environment; jsdom performs no layout. The accepted risk named in D-7.11-30 stands as recorded: if Jira's own header is also `position:fixed`, `body padding-top` will not move it and the rail may still overlap. `docs/a11y-audit-2026-06-27.md`'s keyboard-only flow note was updated to name this as something the eventual human pass must check.

**D-7.11-40 (red-survivor correction) — implemented as specified, contrast re-verified.** `errorTextStyle` is now two objects: `errorTextAmberStyle` (`#7A3E06`) for `parseError`/`overLimitError` (client-side validation that never reached Jira), and `errorTextRedStyle` (`#991B1B`, `ERROR_INK`) for `logFailedError` alone — the one write Jira actually refused. `DANGER`/`#dc2626` is deleted and its absence is grep-proven repo-wide across every banner file (`lib/banner-source.grep.test.ts`).

**Contrast — hand-computed against Jira's `#F7F8F9` (mockup stand-in), not this product's own tokens.** All literals in `lib/banner-styles.ts` are unchanged from the story's own pre-verified table (Accessibility § A11y-4), since no colour value was altered during implementation beyond what the story already specified: state line `#1E1B2E`/white **16.78:1** (corrected per Finding 8's recomputation, finisher pass; was recorded as 16.63:1), eyebrow/dismiss `#6B6B72`/white **5.29:1** (was 5.21:1), ghost "Open extension" `#6B6678`/white **5.53:1** (was 5.52:1), primary action white/`#594F74` **7.51:1** (was 7.54:1), outline text `#594F74`/white **7.51:1** (was 7.54:1), amber ink `#7A3E06`/white **8.34:1** (was 8.46:1), red ink `#991B1B`/white **8.31:1** (was 8.27:1), "Try again" white/`#991B1B` **8.31:1** (was 8.27:1), success text `#15803D`/white 5.02:1 (unchanged — not flagged by Finding 8), success field value `#6B6B72`/`#FCFCFD` 5.08:1 (unchanged — not flagged), spine `#594F74`/Jira `#F7F8F9` **7.07:1** (was 7.11:1). Every row still passes; the largest gap was 0.12 and the verdict is unchanged — see Finding Resolutions, Finding 8. **Two honest non-passes, both correct by design and NOT fixed:** the white rail on Jira's `#F7F8F9` (1.06:1) and the `#E4E3EC` hairline on white (1.27:1) — `DESIGN.md:500-502` requires the rail read as distinct "without a single saturated pixel," 1.4.11 governs boundaries that are the ONLY means of identifying a control (this rail is identified by its mark/eyebrow/state-line/buttons and the 7.11:1 spine, not by this hairline), and darkening the border would break AC2's stated intent. **Caveat stated honestly:** `#F7F8F9` is the mockup's Jira stand-in, not a measurement against a real Jira instance — no real Jira page exists in this environment. Every PASS row above is self-contained (measured against the rail's own `#FFFFFF`/`#FCFCFD` ground) and therefore independent of what Jira actually renders; only the two by-design non-pass rows depend on Jira's background at all.

**What could NOT be verified, stated plainly (per the story's own "What CANNOT be verified here"):**
- **Rendered geometry.** jsdom performs no layout: "the rail is 44px tall," "the action never wraps," "the page never reflows twice," and "the state line truncates with an ellipsis" are unprovable as geometry here. What IS proven: the *declared* styles — `height:44px` is the only height ever written to the host (grep-proven, `lib/banner-source.grep.test.ts`), no code path assigns `.style.height =` directly, `white-space:nowrap`+`flex:0 0 auto` are present on the contextual action, and `text-overflow:ellipsis` is present on the narrow-mode state line (all asserted in `lib/banner-dom.test.ts`).
- **Real-browser behaviour.** Playwright is not installed in this environment; there is no real Jira page. Behaviour against Jira's actual CSP, its real header, its own body styles, and its SPA router is unverified by construction — same limitation the story itself names.
- **`entrypoints/content.ts`'s own orchestration** (submit flow, which tone/copy to show, the `sendRequest` calls) — see the `lib/banner-interactions.ts` deviation note above.

**RED-proof record (mutation applied → test failed before the fix → passed after):**
- Body-padding save/restore + re-entrancy (`lib/banner-interactions.test.ts`, `createPageShift` describe block): reverted `push()`'s `if (owned) return` guard → the "push() is written EXACTLY ONCE" and "two independent instances" tests both went red (padding got clobbered / re-saved). Reverted `restore()`'s `if (!owned) return` guard → the "restore() is a no-op once already restored" test went red (a stray second `restore()` call clobbered a value set after ours was returned). Restored both guards → green.
- Escape/in-flight gate (`shouldReevaluateOnEscape`): changed the implementation to `return true` unconditionally (the pre-7.11 bug) → both tests in that describe block went red. Reverted → green.
- Glyph guard widening (`day-status-vocabulary.grep.test.ts`'s new Story 7.11 describe block): temporarily reintroduced `dot.textContent = '●'` into `lib/banner-dom.ts` → the new whole-file banner glyph scan went red (and `lib/banner-source.grep.test.ts`'s independent CSP/AC9 checks did not, confirming the two guards are complementary, not duplicates). Reverted → green.
- Amber/red split (`lib/banner-styles.test.ts`'s D-7.11-40 describe block, and `lib/banner-source.grep.test.ts`'s DANGER/#dc2626 scan): temporarily restored `export const DANGER = '#dc2626'` and set `errorTextAmberStyle.color = DANGER` → both the styles-pin test and the source-grep test went red. Reverted → green.
- `clearAmberError` non-destructive contract (`lib/banner-interactions.test.ts`): temporarily added `input.value = ''` inside `clearAmberError` (reproducing the pre-7.11 `reevaluate()`-destroys-the-value bug in miniature) → the "leaves input.value untouched" assertion went red. Reverted → green.
- D-7.11-45 single-height contract (`lib/banner-source.grep.test.ts`): temporarily reintroduced `host.style.height = EXPANDED_HEIGHT` into `renderExpandedQuickLog` → the "never assigns `.style.height =` directly" test went red. Reverted → green; also confirmed `lib/banner-dom.test.ts`'s "expansion NEVER writes host.style.height" test independently catches the same mutation (container `style` attribute before/after expansion no longer byte-identical).

**Shared-dependency verification (Dev Notes' "leak risk is LOW — verify it"):** `grep -rln` for importers of `@/lib/banner-dom`, `@/lib/banner-styles`, `@/lib/banner-icons`, `@/lib/banner-interactions` (excluding test files) returns only `lib/banner-dom.ts` (self) and `entrypoints/content.ts` — confirmed isolated. `git diff f7740bc -- lib/hours.ts` is empty — confirmed unchanged, as required.

**Epic-close gate (`### Epic-Close Gate`), verified:**
1. `docs/a11y-audit-2026-06-27.md` updated to reflect the rebuilt rail (scan-count row, rows 3/7/8/9/10, the row-94 keyboard-only flow note, and a new "Gate status" re-verification paragraph). **The human sign-off remains explicitly OUTSTANDING** — this story did not and could not close it (no real browser/Jira page available here); the doc says so in three places now rather than being silently marked done.
2. `lib/no-monospace.grep.test.ts`'s `ALLOWLIST` — confirmed still `Record<string, {...}> = {}` at line 89; this story adds no entry.
3. `lib/day-status-vocabulary.grep.test.ts`'s pre-existing allowlists — unchanged; only a new, additive describe block was added (the manager-surface `BANNED_GLYPHS`/`MANAGER_SURFACE_FILES` block itself is untouched).
4. Epic 6.3 fenced files (`scripts/pack-crx.mjs`, `scripts/derive-ext-key.mjs`, `scripts/lib/`, `wxt.config.ts`, `package.json`, `docs/release.md`) — confirmed untouched: `git status` shows the identical pre-existing dirty/untracked state this story started with (verified by comparing against the conversation's initial `git status` snapshot); no Edit/Write tool call in this session targeted any of them.
5. `deferred-work.md` — Story 3.3's Escape/in-flight item is removed (closed here, D-7.11-46). The SW cold-start item is reworded to name an explicit owner ("the next Phase-2 reliability story that touches SW wake/cold-start timing"). Spot-checked the rest of the Epic-7 sections (stories 7.4-7.10): every entry carries either an explicit `**Owner:**` line or a `RESOLVED`/`CLOSED` marker, **with one pre-existing exception noted here rather than silently left**: the `categorize()`-prefix-match entry under story-7.6 (a bug pre-dating Epic 7 entirely) has a "Recommended follow-up" but no `**Owner:**` tag. Not fixed — it is outside this story's scope (not the banner surface, not introduced or touched by Story 7.11) and re-scoping an unrelated pre-existing item this late risks exactly the kind of scope leak this epic's decision log repeatedly warns against.

**Not implemented / explicitly deferred by this Completion Notes entry, not silently dropped:** `DESIGN.md`'s `icons:` block was NOT edited to add `close: X` (D-7.11-31a names this as "Action for the DESIGN.md owner," and `DESIGN.md` is not in this story's "Files this story MODIFIES" list) — the code uses lucide `X` for dismiss regardless; only the design-doc bookkeeping is left for its own owner.

### File List

**Modified:**
- `lib/banner-styles.ts` — rebuilt as the rail's single literal set (T1)
- `lib/banner-dom.ts` — rebuilt structure + ARIA (T3)
- `entrypoints/content.ts` — behaviour: padding push/restore, hover/focus, narrow, states, Escape gate (T4-T9)
- `lib/banner-styles.test.ts` — rewritten (tautological assertions replaced with literal pins)
- `lib/banner-dom.test.ts` — rewritten/extended (structure, narrow, AC10 invariant, glyph ban, 2 new axe scans)
- `lib/day-status-vocabulary.grep.test.ts` — extended `BANNED_GLYPHS` coverage to the banner surface (TT6)
- `_bmad-output/implementation-artifacts/deferred-work.md` — Escape/in-flight item closed; SW cold-start item re-deferred with a named owner (T9)
- `docs/a11y-audit-2026-06-27.md` — updated to reflect the rebuilt rail; human sign-off explicitly still outstanding (epic-close gate item 1)

**Created:**
- `lib/banner-icons.ts` + `lib/banner-icons.test.ts` — hand-inlined lucide paths (T2)
- `lib/banner-interactions.ts` + `lib/banner-interactions.test.ts` — extracted, tested behaviour primitives (page-shift push/restore + re-entrancy, Escape/in-flight gate, focus-ring wiring, hover-colour wiring, amber-clear) that `entrypoints/content.ts` composes — see Completion Notes' deviation entry for why
- `lib/banner-source.grep.test.ts` — source-level grep tests for AC1 (CSP), D-7.11-45 (single-height contract), D-7.11-40 (DANGER/#dc2626 absence)

## Review Summary

- **Reviewed by:** bmad-code-reviewer · **Date:** 2026-07-27 · **Baseline:** `f7740bc`, uncommitted working tree (Epic 6.3 fenced files and `epic-7-decision-log.md` excluded from scope).
- **Story Status Recommendation: Changes Requested**
- **Blockers 0 · Majors 2 · Minors 4 · Nits 2**
- **Suite:** clean tree, `pnpm vitest run` → **120 files / 1677 passed**, exactly one known pre-existing `ManagerView.test.tsx` unhandled rejection. Re-run and re-confirmed at the end of the review; every mutated file restored and verified byte-identical by `md5 -q`.

**Verified by a prior review pass and accepted here as given:** `lib/banner-interactions.ts` is genuinely wired into `entrypoints/content.ts` (not a parallel implementation — Story 7.9's failure was not repeated); all six hand-inlined lucide paths are byte-identical to `lucide-react@0.460.0`'s own source (AC9 satisfied); the story's correction of the Story 7.6 audit is right (`banner-styles.ts:154` is `};`, the red was at `:157`); all nine baseline tautologies in `banner-styles.test.ts` are **structurally gone** (their style objects were deleted), replaced by hardcoded-literal pins (D-7.11-31e); all seven developer-claimed RED-proofs genuinely redden.

**Verified in this pass — NOT defects, recorded so nobody "fixes" them:**
1. **Raw hex is correct on this surface (D-7.11-35).** A non-comment-line grep for `#[0-9a-fA-F]{3,8}` across `lib/banner-dom.ts`, `lib/banner-icons.ts`, `lib/banner-interactions.ts` and `entrypoints/content.ts` returns **zero** hits — the literals live in `lib/banner-styles.ts` alone. All 15 constants re-checked line-by-line against `DESIGN.md` (`:8,9,16,17,18,19,20,22,29,32,39,40,45,48,258`) and `typography.guest` against `:104-109`: **every value and every cited line number is correct.**
2. **The two contrast non-passes are intended and must not be "fixed".** White rail on Jira's `#F7F8F9` = **1.06:1**; `#E4E3EC` hairline = **1.27:1** on the rail's own white / **1.20:1** against `#F7F8F9`. `DESIGN.md:500-502` requires distinctness "without a single saturated pixel", and 1.4.11 governs boundaries that are the **only** identification means — these are not (the rail is identified by its mark, eyebrow, state line, controls, and the **7.07:1** spine). **Darkening the border would break AC2's stated intent.**
3. **All thirteen interactive pairs pass**, hand-computed (sRGB relative luminance) against the rail's own ground: state line `#1E1B2E`/white **16.78**, eyebrow + dismiss `#6B6B72`/white **5.29**, ghost `#6B6678`/white **5.53**, ghost hover `#594F74`/white **7.51**, outline text **7.51**, outline hover `#594F74`/`#ECEBF3` **6.35**, primary action white/`#594F74` **7.51**, primary hover white/`#615B99` **6.06**, dismiss hover `#1E1B2E`/`#F4F4F7` **15.29**, field text/label **16.78**, submit **7.51**, success `#15803D`/white **5.02**, amber ink **8.34**, red ink **8.31**. Non-text: idle field border `#594F74`/white **7.51** ✓.
4. **The axe scans were UPDATED, not RETARGETED** (the Story 7.10 failure mode). Baseline `banner-dom.test.ts` had **3** scans (contextual, non-contextual, expanded); HEAD has **5** — the same three plus narrow-collapsed and expanded-with-visible-error. All five still render the real `renderCollapsedBanner`/`renderExpandedQuickLog` builders; none was pointed at a stub.
5. **The `BANNED_GLYPHS` gap CLOSED, it did not move.** Reintroducing `●`, `✕` and `✓` into `lib/banner-dom.ts` — and `✓` into `entrypoints/content.ts` — reddens the new whole-file scan **every time** (4/4). `✓` is the sharpest proof: it is rendered only by `content.ts`, so no render test can see it, and the widened grep catches it anyway.
6. **`font-mono` is ZERO outside tests, repo-wide** — Epic 7's close precondition holds. `lib/no-monospace.grep.test.ts:89` `ALLOWLIST` is still `{}`.

```
$ grep -rn "font-mono" --include='*.ts' --include='*.tsx' --include='*.css' \
      components entrypoints lib styles hooks | grep -v '\.test\.'
(no output)   # exit 1, 0 lines
```

**What could NOT be verified here, plainly:** jsdom performs no layout and Playwright is not installed, so the 44 px rendered height, "never wraps", "never reflows twice", ellipsis truncation, and whether `body padding-top` actually moves Jira content out from under the rail are **all unprovable as geometry**. Only *declared* styles were asserted. There is no real Jira page, so behaviour against Jira's real CSP, header, body styles and SPA router is unverified by construction. The `#F7F8F9` used above is the mockup's stand-in — every PASS row is self-contained against the rail's own ground and independent of it; only the two by-design non-passes depend on Jira's background at all.

---

## Review Findings

### Finding 1: The whole `entrypoints/content.ts` behaviour layer is unprotected — 9 of 18 adversarial mutations survived, all in that one file
- **Severity**: Major
- **Category**: Tests
- **Location**: `entrypoints/content.ts` (whole file); rationale at `lib/banner-interactions.ts:5-21`
- **Observation**: 18 mutations were applied to shipped behaviour and the full suite run after each. Nine reddened; **nine survived, and every survivor is in `content.ts`** — the file that cannot be imported under this vitest config. Survivors (suite stayed **120/1677 green** for each):
  1. `pageShift.push(RAIL_HEIGHT)` deleted from `renderBanner` (`:217`) — AC5's push never happens at all.
  2. `pageShift.restore()` deleted from the animated removal path (`:153`) — dismiss, teardown, caught-up/disconnect and SPA re-injection **all funnel through it**, so Jira's layout is left permanently shifted.
  3. Escape/in-flight gate defeated: `shouldReevaluateOnEscape(inflight)` → `(false)` (`:376`) — reopens the exact Story 3.3 deferred item D-7.11-31c closed.
  4. `if (inflight) return;` deleted from `submit` (`:321`) — the double-post guard on a non-idempotent worklog write.
  5. The `pending` (outbox) branch loses its 600 ms slide-away (`:351`) — AC12 names both `ok` **and** `pending`; only `ok` is even structurally similar enough to notice.
  6. `cancelPendingRemoval()` deleted from `renderBanner` (`:208`) — the removal-cancel guard; a re-render in the 220 ms gap gets deleted anyway.
  7. `showError(STRINGS.parseError, 'amber')` → `'red'` (`:326`) — **the exact D-7.11-40 regression this story exists to fix.** The *style objects* are pinned (`banner-styles.test.ts:224-233`); the **routing** of which error gets which tone is not.
  8. Daily-dismiss **ordering** inverted — `removeBanner()` before `await dismissForToday()` (`:240-243`), the race the code's own comment says it is preventing.
  9. SPA re-injection defeated — `scheduleReeval` made a permanent no-op (`:428`).
- **Impact**: Six of the twelve ACs (5, 6, 7, 10, 11, 12) have their *decisive* behaviour in `content.ts`. The extracted primitives in `banner-interactions.ts` are well-pinned (mutating `push()`'s prior-save reddens 4 tests; removing its re-entrancy guard reddens 2), but a tested primitive with an untested call site proves composition, not wiring. AC5 and the amber/red split in particular read as covered and are not.
- **Suggested Resolution**: Not a request to fix `content.ts` — a request to **decide** (see Escalation R-2). The cheapest real teeth: move `submit`'s tone/copy decision and `removeBanner`'s restore ordering into `lib/banner-interactions.ts` as pure functions and pin them; or wire `WxtVitest` into `vitest.config.ts`. This is the **last story that owns this surface** — D-7.11-31e's own reasoning ("deferring again means nobody picks it up") applies.
- **Related AC**: AC5, AC6, AC7, AC10, AC11, AC12

### Finding 2: The expanded quick-log has no pointer-reachable close control, and its only advertised exit is bound to the hours input alone
- **Severity**: Major
- **Category**: Security & data handling → Accessibility
- **Location**: `lib/banner-dom.ts:206-239` (`renderExpandedQuickLog`; `host.replaceChildren()` at `:207`); `entrypoints/content.ts:366-379`
- **Observation**: Confirmed with a live jsdom repro. Collapsed, the rail exposes three buttons — `Log time on PROJ-12`, `Open extension`, `Dismiss for today`. After `expandQuickLog`, `host.replaceChildren()` wipes them and the **only** button left is `Log`; `host.querySelector('button[aria-label]')` is `null`. The only exit is Escape, and the `keydown` listener is on `input` alone — a probe dispatching `Escape` from the input fires the handler (1), dispatching it from the `Log` button after `logBtn.focus()` does **not** (still 1), because the event bubbles input→host→body and never through the input. Meanwhile the rail renders a hint that **advertises** the missing route: `"⏎ to log · esc to close"`. The design source is not silent — `round2.dc.html:123` draws a dismiss `✕` **inside** the `isExpanded` block, alongside the field and the CTA. The implementation drops it.
- **Impact**: A pointer-only user who expands the quick-log has **no way to close it or dismiss the rail for the day** — no ✕, no Cancel, nothing clickable. A keyboard user who Tabs to `Log` loses Escape too. This story makes it worse than it was: under D-7.11-30 the rail now holds `body padding-top`, so a stuck-expanded rail keeps Jira's layout displaced, and AC12's daily-dismiss affordance is unreachable for the whole time. It self-heals on the next SPA navigation, which is why this is Major and not a Blocker. Related, and unprovable here: `announceSuccess` (`content.ts:302-303`) disables the element that currently has focus, which in a real browser drops focus to `<body>` — jsdom does not reproduce that (`activeElement` stayed `INPUT`).
- **Suggested Resolution**: Restore the dismiss button in `renderExpandedQuickLog` as `round2:123` draws it (reusing `dismissStyle` + `svg('X')` + the existing `aria-label`), **or** move the Escape listener from `input` to `host` and get an owner ruling on the pointer-only gap. Do not resolve by deleting the "esc to close" hint. See Escalation R-1.
- **Related AC**: AC11, AC12

### Finding 3: `error.style.display = ''` deletes the `display:flex` that `applyStyle` wrote one line earlier
- **Severity**: Minor
- **Category**: Correctness
- **Location**: `entrypoints/content.ts:289-290` and `:311-312`; style objects at `lib/banner-styles.ts:324`, `:339`, `:383`
- **Observation**: `applyStyle(error, errorTextAmberStyle)` writes the full style attribute including `display:flex`; the very next statement, `error.style.display = ''`, **removes** the declaration rather than revealing it. Probed directly: after `applyStyle` the attribute ends `…text-overflow:ellipsis;display:flex;align-items:center;gap:6px;flex:1 1 auto;min-width:0`; after the reveal it is `…text-overflow: ellipsis; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0;` — **no `display` at all**. Same in `announceSuccess` with `successTextStyle`.
- **Impact**: The status slot is a flex *item* of the 44 px rail, so it is blockified and `flex`/`overflow`/`text-overflow` still work; what is lost is its role as an inner flex *container* — `align-items:center` and `gap:6px` become inert, so the error/success icon sits on the text baseline flush against the copy instead of optically centred with a 6 px gap. Purely visual, and **not confirmable as geometry here** (jsdom does no layout) — the *declared-style* fact above is what is proven.
- **Suggested Resolution**: Reveal with `error.style.display = 'flex'`, or drop `display` from the three style objects and let `applyStyle` alone own it.
- **Related AC**: AC2, AC6

### Finding 4: The keyboard hint is not suppressed when an error is showing, and the expanded no-error spacer is missing
- **Severity**: Minor
- **Category**: AC Conformance
- **Location**: `lib/banner-dom.ts:227-236` vs `round2.dc.html:118-122`
- **Observation**: The design gates them mutually exclusively — `<sc-if b.hasError>` renders the error span at `flex:1 1 auto` **with no hint**, and `<sc-if b.noError>` renders `<span flex:1 1 auto>` + the hint. The shipped builder appends the error slot **and** the hint unconditionally, and `showError` reveals the error without hiding the hint; there is also no `flex:1 1 auto` spacer in the expanded row, so the hint is not pushed right as drawn.
- **Impact**: In the error state the 44 px `overflow:hidden` row carries label + field + Log + error + hint where the design carries four of those five. Extra width pressure on the one contract AC5/AC8 protect — direction is clear, magnitude is **not verifiable here**.
- **Suggested Resolution**: Hide `hint` while the error slot is visible (and restore it in `clearAmberError`); add the `flex:1 1 auto` spacer for the no-error case.
- **Related AC**: AC5, AC8

### Finding 5: The author-supplied focus ring composites to 1.22:1 on the white rail
- **Severity**: Minor
- **Category**: Accessibility
- **Location**: `lib/banner-styles.ts:72` (`FOCUS_RING`); `lib/banner-interactions.ts:86-93`
- **Observation**: `rgba(89,79,116,.13)` over `#FFFFFF` composites to `#E9E8ED` → **1.22:1** against the rail (it does pass at **6.16:1** on the purple primary action). Hand-computed; neither axe nor jsdom can see it. **Mitigating and verified:** `outline` never appears as a CSS property in any banner file (grep: hits are comments, an identifier name and a test title only), so the UA `:focus-visible` ring is **not** suppressed and remains the real indicator.
- **Impact**: No 1.4.11 failure today, because the low-alpha shadow is not the sole indicator. But AC6 and the Completion Notes both present it as "the focus ring", and the moment anyone adds `outline:none` — a routine tidy-up on a custom-styled control — every control on this surface silently loses its visible focus state.
- **Suggested Resolution**: Either raise the ring's alpha/darkness to clear 3:1 on white, or record in `banner-styles.ts` that the ring is decorative and the UA outline is load-bearing, so the next editor knows not to remove it.
- **Related AC**: AC6

### Finding 6: The expanded quick-log's visible label is a `<span>`, not a `<label for>`
- **Severity**: Minor
- **Category**: Accessibility
- **Location**: `lib/banner-dom.ts:209-219`
- **Observation**: `host.querySelectorAll('label').length === 0`. The accessible name is carried by `aria-label` on the input, duplicating the adjacent visible `<span>` text verbatim. Both axe scans of this state pass (zero Critical/Serious), and probes of the two **unscanned** states — success and red write-failure — also return zero Critical/Serious.
- **Impact**: Clicking the visible "Hours to log on PROJ-12" does not focus the field, which the collapsed rail's own controls do not suffer from. Small target-size/affordance loss, not a name failure.
- **Suggested Resolution**: Use `<label for>` with an id on the input and drop the duplicate `aria-label`; or accept and note it. Consider adding the success and red states to the axe scan set — nothing currently scans either.
- **Related AC**: AC12

### Finding 7: `banner-styles.ts:69-72` claims `FOCUS_RING` is also the hours field's idle ring; the field ships with `boxShadow: 'none'`
- **Severity**: Nit
- **Category**: Maintainability
- **Location**: `lib/banner-styles.ts:69-72` vs `:286`
- **Observation**: The comment cites `bannerBase.fieldRing`, `round2:1310` — and the design source does apply it as the field's **idle** `box-shadow` (`round2:113`), setting `fieldRing:"none"` only in the two error states (`:1327,:1335`). Shipped `hoursFieldStyle.boxShadow` is `'none'` unconditionally.
- **Impact**: A correct design-source citation attached to a value the code does not use that way. Either the field lost its designed resting ring or the comment is wrong; a future reader cannot tell which.
- **Suggested Resolution**: Apply the ring at idle as `round2:113` draws it, or correct the comment to say `FOCUS_RING` reuses the `fieldRing` *value* for a different purpose.

### Finding 8: The Completion Notes' contrast figures differ from an independent recomputation
- **Severity**: Nit
- **Category**: Maintainability
- **Location**: `## Dev Agent Record` → Completion Notes, contrast paragraph
- **Observation**: Recomputed with the standard sRGB relative-luminance formula: state line **16.78** (notes: 16.63), eyebrow/dismiss **5.29** (5.21), ghost **5.53** (5.52), primary/outline/submit **7.51** (7.54), amber **8.34** (8.46), red **8.31** (8.27), spine on `#F7F8F9` **7.07** (7.11). Every row still passes on both sets; the largest gap is 0.12.
- **Impact**: None to the verdict. Recorded so a future reviewer who recomputes does not treat the divergence as a regression.
- **Suggested Resolution**: None required.

---

## Escalations — owner ruling needed

- **R-1 (from Finding 2) — does the expanded rail get its dismiss button back?** The design source draws one (`round2:123`); the ACs never mention it; the implementation dropped it, leaving pointer-only users with no exit. Restoring it is an interaction change beyond the ACs' letter, and moving the Escape listener to `host` is a second, independent decision. **Do not guess** — this is the last story that owns this surface.
- **R-2 (from Finding 1) — is closing the `content.ts` test gap in scope for the epic close, or a named-owner deferral?** The story's own Completion Notes call the `WxtVitest` wiring out of scope and say so honestly; this review quantifies the cost at **9 surviving mutations covering 6 ACs**. If deferred, it needs an explicit owner in `deferred-work.md` (the `font-mono` lesson, D-7.7-21f), not a third silent pass.
- **R-3 — Epic 7 cannot be marked green on automated evidence alone.** `docs/a11y-audit-2026-06-27.md`'s human sign-off is still outstanding and is correctly reported as outstanding in three places. Confirm the orchestrator accepts closing the epic with it open. Epic-close gate items 2-5 are otherwise **verified**: `ALLOWLIST` is `{}` (`no-monospace.grep.test.ts:89`), the `day-status-vocabulary` allowlists are unwidened (the diff is a purely additive `+35`-line describe block), the Epic 6.3 fenced files carry exactly their pre-existing dirty state, and `deferred-work.md`'s Story 3.3 items are closed/re-deferred with a named owner.
- **R-4 (carried, unresolved by this story) — `DESIGN.md`'s `icons:` block still has no `close:` key.** D-7.11-31a assigned `close: X` to the DESIGN.md owner; the code uses lucide `X` correctly, but the spine still does not sanction it. Left open, correctly, since `DESIGN.md` is not in this story's modify list.

---

## Finding Resolutions (bmad-story-finisher pass)

**Orchestrator context carried into this pass:** `epic-7-decision-log.md` records `D-7.11-32` (owner: extract the remaining `content.ts` orchestration now, not deferred — this is the epic's last story and there is no successor to inherit a deferral), `D-7.11-33` (orchestrator: restore the expanded dismiss control, move Escape to the host), and `D-7.11-34` (orchestrator note: Epic 7's a11y gate closes `PENDING HUMAN VERIFICATION`, not silently green). These three rulings resolve every escalation and every Major finding below — they are FIXED, not re-litigated.

| # | Finding | Decision | Rationale |
| --- | --- | --- | --- |
| 1 | `content.ts` behaviour layer unprotected — 9/18 mutations survived | **FIX** | Per owner ruling D-7.11-32. Extracted all nine survivors into tested primitives in `lib/banner-interactions.ts` (`createRemovalScheduler`/`removeBannerViaSlide`/`beginBannerRender`/`commitMount`/`decideSubmitAction`/`isWorklogSuccess`/`dismissAndRemove`/`shouldReevaluateForUrl`/`createDebouncer`). Each was written test-first (RED before the code existed — a bare import failure counts, see Completion Notes below) and each survivor mutation was individually re-applied and re-reverted against the finished module to confirm it now reddens (also recorded below). `content.ts` now composes these; verified genuinely wired by reading every call site (`renderBanner`, `removeBanner`, `expandQuickLog`, `scheduleReeval`, `scheduleResize`). |
| 2 | Expanded quick-log has no pointer-reachable close control; Escape bound to the input alone | **FIX** | Per orchestrator ruling D-7.11-33 (resolves escalation R-1). `renderExpandedQuickLog` now returns a labelled `dismissButton` (same `aria-label="Dismiss for today"` as the collapsed rail's), wired to the same `dismissAndRemove` primitive. The Escape listener moved from the hours `input` to the rail `host` (added once, at first mount, gated on `isExpanded` so it is inert while collapsed) — it fires from anywhere inside the rail, including after Tab'ing to the Log button, and never intercepts `Tab` (only `e.key === 'Escape'` is checked). New tests: `banner-dom.test.ts`'s "labelled, pointer-reachable dismiss control" and the axe scans (unchanged, still render the real builder). |
| 3 | `error.style.display = ''` deletes the `display:flex` `applyStyle` just wrote | **FIX** | Confirmed by re-reading the pre-fix code: `applyStyle` already serializes `display:flex` as part of `errorTextAmberStyle`/`errorTextRedStyle`/`successTextStyle`; the following `error.style.display = ''` line served no purpose but to delete it. Removed from both `showError` and `announceSuccess` in `entrypoints/content.ts` — `applyStyle` alone now owns `display` (the finding's second suggested resolution). |
| 4 | Keyboard hint not suppressed when an error shows; no-error spacer missing | **FIX** | `renderExpandedQuickLog` (`lib/banner-dom.ts`) now returns `spacer` (an empty `flex:1 1 auto` element, reusing the existing `spacerStyle`) and `hint` alongside `error`. `content.ts`'s `showError`/`announceSuccess` hide both whenever the error/status slot is shown; `clearAmberError` restores them. New tests: `banner-dom.test.ts`'s "no-error spacer" structural test; the toggle behaviour itself lives in `content.ts` and is verified by reading (the same class of residual gap as Finding 1 — `content.ts` cannot be imported under this vitest config). |
| 5 | Author-supplied focus ring composites to 1.22:1 on white | **FIX (documentation)** | The finding's own mitigation holds: `outline` is never set to `none` anywhere on this surface (re-verified by grep), so the UA `:focus-visible` ring remains the real indicator, and `FOCUS_RING`'s value is pinned to the design source (`bannerBase.fieldRing`) by an existing test — changing the alpha would both break that pin and deviate from `DESIGN.md` without a design-owner ruling. Chose the finding's second option: `lib/banner-styles.ts`'s `FOCUS_RING` doc comment now states explicitly that the ring is decorative and the UA outline is load-bearing, and warns the next editor never to add `outline:none` here without first strengthening the ring. No behaviour changed. |
| 6 | Expanded label is a `<span>`, not a `<label for>` | **FIX** | Same class as Story 7.10's Blocker (per prior-epic pattern: fix, don't accept). `renderExpandedQuickLog` now creates a real `<label for="jira-time-logger-hours-input">`, the input carries that `id`, and the duplicate `aria-label` is removed — clicking the visible "Hours to log on `<KEY>`" text now focuses the field. `banner-dom.test.ts`'s accessible-name test rewritten to assert the `<label for>` relationship instead of the removed `aria-label`. |
| 7 | `FOCUS_RING`'s comment claims it is also the field's idle ring; `hoursFieldStyle.boxShadow` ships `'none'` | **FIX (documentation)** | Corrected the comment (the finding's second option) rather than changing `hoursFieldStyle.boxShadow` to add a permanent ring — the field's `none` idle state is intentional (matches every other idle control on this surface having no shadow) and changing visible behaviour this late, on a surface this design-sensitive, without a design-owner ruling would be scope creep. The comment (folded into the same edit as Finding 5, both live on `FOCUS_RING`) now says explicitly that the constant is reused for its VALUE, not as the field's resting `box-shadow`. |
| 8 | Completion Notes' contrast figures differ from an independent recomputation (≤0.12 gap) | **FIX** | The verdict is unchanged (every row still passes), so this is a record-correction only. Updated the Completion Notes contrast paragraph to the reviewer's recomputed figures: state line 16.78 (was 16.63), eyebrow/dismiss 5.29 (5.21), ghost 5.53 (5.52), primary/outline/submit 7.51 (7.54), amber ink 8.34 (8.46), red ink 8.31 (8.27), spine on `#F7F8F9` 7.07 (7.11). Success text (5.02) and success field value (5.08) were not flagged by the finding and are left as originally recorded. |
| R-2 | Is closing the `content.ts` test gap in scope for epic close? | **RESOLVED — in scope, per D-7.11-32** | See Finding 1. The owner explicitly chose "extract now" over "defer with a named owner" because this is the epic's last story touching this surface; deferring would leave the item unowned (the exact `font-mono`/D-7.7-21f failure mode this epic has already hit once). |
| R-3 | Epic 7 cannot be marked green on automated evidence alone | **ACKNOWLEDGED, not this story's to close** | Per orchestrator note D-7.11-34: the automated gate stays green; the human sign-off (colour-blindness simulation, row 12 of `docs/a11y-audit-2026-06-27.md`) remains outstanding and must be reported as `PENDING HUMAN VERIFICATION` to whoever closes the epic. This finisher pass does not touch that document further — it was already updated correctly by the dev pass (see Epic-Close Gate item 1 in the Completion Notes above). |
| R-4 | `DESIGN.md`'s `icons:` block still lacks a `close:` key | **DEFER — owner is the `DESIGN.md` maintainer, not this story** | `DESIGN.md` is not in this story's "Files this story MODIFIES" list (D-7.11-31a / D-7.11-37 assigned this explicitly to the design-doc owner). The code is correct today (lucide `X`, functionally and visually right); only the spec's own bookkeeping is outstanding. No action taken here — re-litigating it would be scope creep on the epic's last story. |

**Test-quality note on the extraction (Finding 1):** every one of the nine survivor mutations named in the review was individually re-applied against the finished `lib/banner-interactions.ts` and re-reverted, confirming each corresponding test goes RED under that exact mutation and GREEN once reverted (survivor numbering matches the review's own list):
1. `commitMount`'s `if (isNew) pageShift.push(height)` gate defeated → "pushes when isNew is true" reddened.
2. `removeBannerViaSlide`'s `pageShift.restore()` deleted from BOTH the reduced-motion branch and the delayed (220ms) branch → the corresponding "restores pageShift" assertions reddened independently for each branch.
3. (Escape/in-flight gate) — `shouldReevaluateOnEscape` itself is unchanged and already pinned from the prior extraction pass; the residual risk (a wrong variable passed at the `content.ts` call site) is bounded to reading the call site, noted honestly rather than claimed as tested.
4. `decideSubmitAction`'s `if (inflight) return { kind: 'ignored' }` deleted → "ignores the submit entirely while already inflight" reddened.
5. `isWorklogSuccess` narrowed to drop the `pending` branch → "pending (durably queued in the outbox) is ALSO success" reddened.
6. `beginBannerRender`'s `scheduler.cancelPending()` call removed → "beginBannerRender() cancels an in-flight removal" reddened.
7. `decideSubmitAction`'s over-limit branch's tone hand-flipped to `'red'` (the exact D-7.11-6/D-7.11-40 regression) → the amber-tone assertion reddened.
8. `dismissAndRemove`'s await/call order inverted (`removeBanner()` before `await dismissForToday()`) → the `['dismiss', 'remove']` ordering assertion reddened.
9. `shouldReevaluateForUrl` hardcoded to always return `true` → "the same URL does not [re-evaluate]" reddened; `createDebouncer`'s prior-timer-clear removed (so bursts would stack rather than debounce) → "only fires once for a burst of calls" reddened.

All nine were then restored (confirmed byte-identical to the pre-mutation file via `diff`) and the full `banner-interactions.test.ts` suite re-run green (33/33) before proceeding.

---

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-07-27 | 0.1 | Story created EXPLICITLY at baseline `f7740bc` (117 files / 1567 passed / 0 skipped, one known pre-existing `ManagerView.test.tsx` rejection). FINAL story of Epic 7. 12 ACs transcribed verbatim from `epics.md:2086-2149`. Surface 4 located and read line-by-line at `round2.dc.html:38-192` (+ `bannerNotes` data block `:1310-1342`); every design value cited with a verified file:line. Central tension resolved: the 18px mark is **geometry, not an icon** (`DESIGN.md:213`), so the lucide constraint is met via hand-inlined paths per the explicit CSP exception at `DESIGN.md:222-224`; `{typography.guest}` resolves to `DESIGN.md:106` and the shipped `SYSTEM_FONT` is **wrong**; raw hex is **correct** here and D-7.3-14/D-7.7-15 do **not** apply (D-7.11-35). Found: `body padding-top` (AC5) does **not exist** today — new behaviour (E-3); three text glyphs `●`/`✕`/`✓` violate AC9; the 7.6 red-survivor verdict is **partly wrong** — `errorTextStyle` serves three strings, two of which are not refused writes (D-7.11-40), and `banner-styles.ts:154` is a **stale** line ref (the red is at `:157`). Contrast hand-computed against **Jira's** `#F7F8F9`, incl. two honest non-passes that are correct by design. Deferred items: Escape/in-flight **closed** here, SW cold-start **re-deferred with a named owner**. Five escalations raised (E-1…E-5). Creator decisions `D-7.11-35..46`; **`D-7.11-30+` reserved** for orchestrator/owner. | bmad-story-creator |
| 2026-07-27 | 1.0 | Implemented per owner/orchestrator rulings D-7.11-30 (strict body-padding save/restore, re-entrancy-safe) and D-7.11-31(a-e). All 20 changes (C1-C20), all 11 tasks (T1-T11), and the AC10/AC9 machine-checkable invariants (D-7.11-42) implemented. `entrypoints/content.ts` confirmed unimportable under this project's vitest config (pre-existing, out of scope) — testable behaviour extracted into new `lib/banner-interactions.ts`. 28px control height applied everywhere per D-7.11-31(b), overruling the story's own E-2 recommendation. D-7.11-40 (amber/red split) and D-7.11-46 (Escape/in-flight gate) implemented and RED-proved. Baseline re-measured: 120 files / 1677 tests passed (was 117/1567), same one pre-existing `ManagerView.test.tsx` rejection, no second. `pnpm compile`/`lint`/`build` all clean. Epic-close gate verified: `docs/a11y-audit-2026-06-27.md` updated (human sign-off remains explicitly outstanding), `no-monospace` `ALLOWLIST` still `{}`, `day-status-vocabulary` allowlists unwidened, Epic 6.3 fenced files confirmed untouched, `deferred-work.md` Story-3.3 items resolved. Status → review. | bmad-story-developer |
| 2026-07-27 | 1.1 | **Finisher pass — all 8 findings + both Majors resolved, 0 dismissed, 0 deferred** (R-4 left correctly open for the `DESIGN.md` owner, not this story). Per owner ruling D-7.11-32: all nine of the review's surviving `content.ts` mutations closed by extracting `createRemovalScheduler`/`removeBannerViaSlide`/`beginBannerRender`/`commitMount`/`decideSubmitAction`/`isWorklogSuccess`/`dismissAndRemove`/`shouldReevaluateForUrl`/`createDebouncer` into `lib/banner-interactions.ts`, each written test-first and each survivor mutation individually re-proved RED then reverted GREEN; `content.ts` now composes them (verified genuinely wired by reading every call site). Per orchestrator ruling D-7.11-33: `renderExpandedQuickLog` (`lib/banner-dom.ts`) gained a labelled, pointer-reachable `dismissButton`, and the Escape handler moved from the hours input to the rail host (scoped to the rail's subtree, added once at mount, never intercepts Tab). Fixed the `error.style.display = ''` regression that was deleting `applyStyle`'s own `display:flex` (Finding 3) and the missing error/hint mutual-exclusion (Finding 4, via a new `spacer` element reusing `spacerStyle`). Fixed the `<span>`-not-`<label for>` a11y gap (Finding 6, same class as Story 7.10's Blocker). Documentation-only fixes for the focus-ring contrast note and the `FOCUS_RING`/field-idle-ring comment (Findings 5 and 7, folded into one `banner-styles.ts` comment edit) and for the Completion Notes' contrast figures (Finding 8). Folded the creator's `D-7.11-1 … D-7.11-12` into `epic-7-decision-log.md` as `D-7.11-35 … D-7.11-46` (D-7.3-11 pattern); every citation across the story file, source, tests, `sprint-status.yaml`, and `docs/a11y-audit-2026-06-27.md` repointed in one mechanical pass, including a `D-7.11-1..12` ellipsis-shorthand instance the regex's word-boundary form missed and had to be fixed by hand in both `sprint-status.yaml` and this file's own 0.1 Change Log entry. Re-validated: `pnpm compile` clean; `pnpm lint` 0 errors / 12 pre-existing warnings (unchanged baseline); `pnpm test` 120 files / 1699 passed (was 120/1677), same one pre-existing `ManagerView.test.tsx` rejection, no second; `pnpm build` clean, manifest carries no `web_accessible_resources` key. Epic 7's a11y gate remains `PENDING HUMAN VERIFICATION` (R-3 / D-7.11-34) and is reported as such — this story does not and cannot close it. `epic-7: done` is intentionally NOT set here; the orchestrator closes the epic separately. Status → done. | bmad-story-finisher |

---

## Delivery Log

> Migrated out of `sprint-status.yaml` on 2026-07-28, where the whole program's log used to
> accumulate as YAML comments. These are the **orchestrator's** per-stage notes from the
> `run-dev-cycle` pipeline; they overlap with — and do not replace — the story's own Change Log.

### 2026-07-27 — created (ready-for-dev)

At baseline f7740bc — the FINAL story of Epic 7. Restyle of Story 3.3's working banner into the 44px
guest rail; lib/banner-sw.ts untouched. Central tension resolved: the 18px mark is GEOMETRY not an
icon (DESIGN.md:213), hand-inlined lucide paths per the CSP exception at DESIGN.md:222-224,
{typography.guest} = DESIGN.md:106 (shipped SYSTEM_FONT is wrong), and RAW HEX IS CORRECT here —
D-7.3-14/D-7.7-15 do NOT apply since globals.css never reaches Jira's page. Found: body padding-top
(AC5) does not exist today; three text glyphs violate AC9; the 7.6 red-survivor verdict is partly
wrong (one style, three strings, two not refused writes). Surface 4 read at round2.dc.html:38-192 +
:1310-1342. Contrast hand-computed vs Jira's #F7F8F9 with two honest by-design non-passes. E-1..E-5
need rulings; D-7.11-30+ reserved. Baseline 117 files / 1567 passed / 0 skipped.

### 2026-07-27 — review

Dev pass implemented per owner/orchestrator rulings D-7.11-30 (strict body-padding push/restore,
re-entrancy-safe via lib/banner-interactions.ts's createPageShift) and D-7.11-31(a-e): lucide X for
dismiss, 28px control height everywhere (overruling the story's own 30px recommendation),
Escape-during-inflight closed (D-7.11-46) + SW cold-start re-deferred with a named owner, the
red-survivor amber/red split (D-7.11-40, DANGER/#dc2626 deleted repo-wide), the two by-design
contrast non-passes left alone. lib/banner-styles.ts rebuilt as the single literal set; new
lib/banner-icons.ts hand-inlines 6 lucide shapes; lib/banner-dom.ts rebuilt (18px mark = two spans,
not an icon; all 3 legacy text glyphs removed; renderExpandedQuickLog never writes
host.style.height). entrypoints/content.ts confirmed NOT importable under this project's vitest
config (defineContentScript is a WXT build-time global, no WxtVitest plugin wired in — pre-existing,
out of scope); testable behaviour (page-shift, Escape gate, focus-ring, hover-colour, amber-clear)
extracted into new lib/banner-interactions.ts so it stays RED-provable. lib/banner-sw.ts untouched.
day-status-vocabulary.grep.test.ts's BANNED_GLYPHS coverage widened to the banner surface (was
manager-only). docs/a11y-audit-2026-06-27.md updated to reflect the rebuilt rail — human sign-off
explicitly still OUTSTANDING, not silently closed. deferred-work.md: Story 3.3's Escape item closed,
SW cold-start item re-deferred with a named owner. 7 mutations RED-proved live (page-shift
re-entrancy x2, Escape gate, glyph-guard widening, amber/red split, C13 non-destructive clear,
single-height contract) then reverted. Baseline re-measured: 120 files / 1677 passed / 0 skipped
(was 117/1567), same one known pre-existing ManagerView.test.tsx rejection, no second. pnpm
compile/lint(0 errors)/build all clean. All fenced Epic 6.3 files confirmed untouched.

### 2026-07-27 — done

EPIC 7'S FINAL STORY CLOSED BY THE FINISHER. All 8 review findings + both Majors resolved (0
dismissed, 0 deferred; R-4 correctly left open for the DESIGN.md owner). Per owner ruling D-7.11-32:
all nine of the review's surviving entrypoints/content.ts mutations closed by extracting
createRemovalScheduler/removeBannerViaSlide/beginBannerRender/commitMount/decideSubmitAction/isWorklogSuccess/dismissAndRemove/shouldReevaluateForUrl/createDebouncer
into lib/banner-interactions.ts, each written test-first and each survivor mutation individually
RED-proved then reverted GREEN; content.ts now composes them, verified genuinely wired by reading
every call site. Per orchestrator ruling D-7.11-33: renderExpandedQuickLog gained a labelled
pointer-reachable dismissButton, and Escape moved from the hours input to the rail host (scoped to
the rail's subtree, added once at mount, never intercepts Tab). Fixed the error.style.display=''
regression deleting applyStyle's own display:flex (Finding 3) and the missing error/hint mutual
exclusion via a new spacer element (Finding 4). Fixed the span-not-label-for a11y gap (Finding 6,
same class as Story 7.10's Blocker). Documentation-only fixes for the focus-ring contrast note +
FOCUS_RING/field-idle-ring comment (Findings 5 and 7) and the Completion Notes contrast figures
(Finding 8). Folded creator decisions D-7.11-1..12 into epic-7-decision-log.md as D-7.11-35..46
(D-7.3-11 pattern); every citation repointed, including a D-7.11-1..12 ellipsis-shorthand instance
the word-boundary regex missed and was fixed by hand. Re-validated: pnpm compile clean; pnpm lint 0
errors/12 pre-existing warnings; pnpm test 120 files/1699 passed (was 120/1677), same one
pre-existing ManagerView.test.tsx rejection, no second; pnpm build clean, manifest carries no
web_accessible_resources key. Epic 7's a11y gate remains PENDING HUMAN VERIFICATION (R-3/D-7.11-34)
— reported as such, not silently closed; epic-7 itself is intentionally NOT marked done here, the
orchestrator closes it separately.
