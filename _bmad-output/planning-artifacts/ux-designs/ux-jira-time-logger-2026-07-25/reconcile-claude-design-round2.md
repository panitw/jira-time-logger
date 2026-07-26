# Reconciliation — Claude Design round 2 (settings + banner)

Input: [imports/jira-time-logger-round2.dc.html](./imports/jira-time-logger-round2.dc.html)
(same claude.ai/design project; the doc was **replaced**, not appended — round 1 is preserved locally at
`imports/jira-time-logger.dc.html`).

Covers Epic 7 stories **7.10 settings** and **7.11 inline Jira banner**. Both are now unblocked.

## Surface 4 — the banner

**The central answer: it's a rail, not a bar.** White ground, a 3px Legacy-Purple spine on the left edge,
one 18px purple mark, purple-tinted hairline beneath, 44px tall (down from today's 56px). It sits above Jira
the way a browser bookmarks bar does — structurally present, chromatically quiet, never mistakable for a
warning. This directly answers the brief's hardest question.

**How it carries brand identity with the gradient, motif, and Kanit all unavailable:**

| Carrier | Mechanism |
|---|---|
| The exact purple, tiny dose | 3px spine + 18px mark — under 2% of the bar's area. Recognition needs the *right* `#594F74` next to the right neutral, not coverage. |
| Purple-tinted neutrals | Borders are `#E4E3EC`, not Jira's `#DFE1E6`. Side by side the rail reads as a different object — warmer, quieter — with no saturated pixel. |
| Geometry, verbatim | 6px radii, 28px control height, 1px divider, the same button proportions as the popup's `+0.5 / +1` row. Shape is the most CSP-proof brand asset available. |
| Tabular numerals | `font-variant-numeric: tabular-nums` works on any system face. The product's numbers look like the product's numbers. |

**Recommendation accepted: do not ship Kanit to the banner.** It costs a `web_accessible_resources` entry, a
permission-warning risk at install, and a silent fallback on any Jira instance with a strict `font-src` —
meaning the surface you'd actually be designing for is the fallback anyway. A 44px rail is not where anyone
reads type.

**Three implementation findings that materially change Story 7.11:**

1. **Expansion must not grow the bar.** It stays 44px and swaps its right-hand contents; the hours field
   appears in the space the contextual action vacated. The page therefore reflows *once*, and the
   `body padding-top` the content script sets is written a single time. Growing the bar would reflow Jira's
   layout twice per interaction.
2. **No keyframes are needed anywhere.** Entry, expand, and exit are all one property —
   `transform: translateY()` with `transition` in the inline style string. Set the value, let the browser
   tween. This removes the biggest apparent obstacle to inline-styles-only.
3. **Hover and focus without CSS** — `mouseenter`/`mouseleave` listeners writing `el.style.background`;
   `focus`/`blur` writing `boxShadow`. Reduced motion via `matchMedia` in JS setting `transition: 'none'`.

**Narrow viewport (<~860px):** the eyebrow and "Open extension" drop, the state line truncates, and the
contextual action keeps full width. **The action never wraps to a second line — the bar's height is a
layout contract with Jira's page.**

**On surviving repetition:** the rail states a number and stops. No icon parade, no progress bar, and
explicitly no colour that escalates as the week slips — "an amber bar on Thursday would be a scold, and the
spines forbid it." It asks for something exactly once, on a `/browse/<KEY>` page, where the ask is specific
and almost always right.

## Surface 5 — settings

**1180px shell, 680px reading column, left-aligned.** Same shell as Week and Manager so the three sections
align, but the form is a single column with labels above fields. The reasoning is sound: a two-column
label/field split would make eleven controls of unequal weight look like a database admin panel, and the
empty right margin is what signals "a page you read, not a grid you work."

**Grouping by weight — the answer to the brief's main question:**

| Group | Treatment | Why |
|---|---|---|
| Connection · Reporting line | Hairline row tables, **no input affordance** | They're facts, not settings |
| Logging defaults | One padded card | The only place anything can be typed |
| Diagnostics | Fact table with an inline action | Fact + one safe action |
| Disconnect | Separate block, **grey rule instead of purple**, sunk card, error-ink outline button | Irreversible in a way Clear cache isn't; keeps its confirm dialog |

**Chrome header** carries identity, connection status, last-synced, and the **Week / Manager / Settings tab
row** — which is the thing that actually folds two pages into one. It carries no headline figure, correctly.

**Catch-all validation, four states — and the important one is neutral.** Mid-typing is *neutral*, never
red; the dependent subtask select simply waits. Only a settled, wrong key gets amber, and it states what it
did to the dependent field. This is exactly the "don't make a normal mid-typing state look broken"
requirement, solved.

**Label improvements adopted:** "PTO subtask" → **Time-off subtask** · "Default hours" → **Work-day target**
· "Reminder" → **Daily reminder** · "Fallback project" → **Catch-all project key**. Each gained a one-line
consequence beneath it instead of a tooltip.

## Accepted into DESIGN.md

| Addition | Assessment |
|---|---|
| `--status-clean-border: #BFE0C8` | Accepted. Success outline button; `#15803D` on white is 4.9:1. |
| `--guest-font` system stack | Accepted as a named token — the banner's typography is a real, permanent constraint, not an oversight. |
| Guest-surface pattern (white ground + 3px spine + purple mark) | Accepted as a first-class component. It's the answer to "how does this system express itself where it owns no chrome." |
| 44px rail height, down from 56px | Accepted. |

## Corrections applied — the producer was working without the spines

Note uploaded the two handoff prompts but **not `DESIGN.md`/`EXPERIENCE.md`**, so round 2 predates decisions
D14 and D16. The producer even flagged this itself ("round 1's surfaces still say PTO"). The spines win;
these are corrected rather than adopted:

1. **Text glyphs (`✓ ▾ ✕ ●`) throughout.** D16 replaced these with lucide icons. On the popup and full page
   this is a straight swap. **On the banner it needs a specific rule** — `lucide-react` is a React library
   and the banner is vanilla DOM, so the banner uses **hand-inlined lucide SVG paths**, not the components.
   Same shapes, no dependency, no font. Recorded in both spines.
2. **`#8FE0A8` connected-dot on the chrome** — an undeclared colour. `status-clean` `#15803D` has no
   contrast on the purple gradient, so a chrome-variant is legitimate; adopted as a named token
   `status-clean-on-chrome` rather than an inline literal.
3. **"PTO" strings in the carried-forward round-1 surfaces.** Already fixed in the spines by D14. The
   round-1 mockup is stale on this point; no action beyond noting that the spine wins.

## New scope introduced — flagged, not silently accepted

**"Re-authenticate" button** in the Connection block. It does not exist in the codebase today
(`components/settings/` has Connect, Disconnect, and ApiTokenSetup — no re-auth path). It's a reasonable
affordance for an expired-but-not-disconnected session, but it is **new functionality, not a restyle**.
Story 7.10 records it as out of scope for the revamp; it needs its own story if wanted.

## Open

- **First-run dims the defaults to `opacity: .5`.** Confirm disabled controls still clear AA — dimming a
  compliant control by half usually doesn't. Story 7.10 carries this as an explicit check.
- **The green connected-dot** is decorative; it needs its text label ("Connected · email") to carry the
  meaning, which it does. No change needed, noted for the a11y pass.
