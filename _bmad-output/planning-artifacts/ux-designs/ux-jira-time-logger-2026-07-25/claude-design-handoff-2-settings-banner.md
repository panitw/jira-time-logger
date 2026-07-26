# Claude Design handoff #2 — Settings & the inline Jira banner

Covers the two Epic 7 stories blocked on design: **7.10 settings on the full page** and
**7.11 inline Jira banner reconciliation**. Neither surface was in the first handoff's scope.

**How to use this:** upload `DESIGN.md` and `EXPERIENCE.md` from this folder into the Claude Design project
first — this surface *inherits* an existing system rather than establishing one — then paste everything
below the rule as the prompt. Save the output back here and run `/bmad-ux` Update to fold it into the spines.

---

## Context — you are extending a system, not creating one

**jira-time-logger** is a Chrome/Edge MV3 extension for a ~10-person engineering team at KKP (Kiatnakin
Phatra, a Thai financial group). It turns Jira's worklog into a daily-logging tool plus a monthly manager
approval flow. Three surfaces were designed in a previous round — the toolbar popup, a full-page week
review, and a full-page manager matrix. **Those are done.** This round covers the two that were left out.

**The existing system is binding.** `DESIGN.md` and `EXPERIENCE.md` (uploaded alongside this prompt) win
over anything you produce. Do not re-derive the visual language, invent new tokens without flagging them, or
restyle what already exists. Match it.

The one idea that governs everything: **distinctive shell, calm data.** Brand character lives in the purple
chrome — gradient, orbital ring motif, Kanit display type. The data underneath stays quiet: white surfaces,
purple-tinted hairlines, Noto Sans, numbers that don't shout. Purple and grey must cover ≥50% of any
surface; the chrome carries that so the data canvas never has to.

Register: **Linear's discipline in KKP's clothes.** Dense, precise, keyboard-first, tabular. Never scolding.

### The tokens, restated so this prompt stands alone

```css
--legacy-purple:#594F74;  --royal-purple:#615B99;  --purple-deep:#4A4163;
--grandeur-grey:#ADACB9;  --grandeur-lite:#E7E7ED;
--background:#FAFAFB; --surface:#FFFFFF; --surface-sunk:#FCFCFD;
--foreground:#1E1B2E; --muted:#6B6678;
--faint:#6B6B72;            /* a11y floor 4.6:1 — LIGHTEST PERMISSIBLE TEXT GREY, never lighten */
--faint-decorative:#ADACB9; /* non-text decoration only */
--border:#E4E3EC; --border-faint:#F0EFF5; --border-hairline:#F4F3F8;
--primary:#594F74; --primary-foreground:#FFFFFF; --primary-soft:#ECEBF3;
--status-clean:#15803D; --status-dirty:#B45309; --status-error:#DC2626;
--amber-soft:#FFF8EC; --amber-border:#EDD3A6; --amber-ink:#7A3E06;
--error-soft:#FEF2F2; --error-border:#F3C9C9; --error-ink:#991B1B;
--r-sm:4px; --r-md:6px; --r-lg:8px; --r-xl:10px; --r-full:9999px;
--chrome-gradient:linear-gradient(165deg,#615B99 0%,#594F74 42%,#4A4163 100%);
--shadow-hairline:0 1px 2px rgba(74,65,99,.05);
--shadow-raised:0 1px 3px rgba(74,65,99,.07), 0 10px 26px rgba(74,65,99,.08);
--shadow-overlay:0 1px 3px rgba(74,65,99,.07), 0 24px 50px rgba(74,65,99,.16);
--focus-ring:0 0 0 3px rgba(89,79,116,.13);
```

**Type:** Kanit (400/500/600) for chrome — headings, labels, buttons, keys, and **all numerics with
`tabular-nums`**. Noto Sans for data — field values, prose, captions. **No monospace, no serif.** Spacing is
4-based. Section headers use the KKP underline rule: a Kanit title in Legacy Purple over a 2px rule whose
first 64px is purple, remainder `--border`.

**Icons: lucide only.** Already the project's icon library. 11–13px, `aria-hidden`, meaning carried by
adjacent text. Relevant names: `CircleCheck`, `Circle` (filled), `Diamond` (filled), `LoaderCircle`,
`EyeOff`, `CircleX`, `Search`, `Plus`, `Trash2`, `ChevronDown`, `X`, `ArrowUpRight`, `WifiOff`, `Undo2`.

**Copy rules.** Say the fact, not the verdict. Never imperative about the user's diligence. Say plainly what
the software can't do. **"Time off", never "PTO"** — including in field labels. Hours in decimals (`1.5h`).
Sentence case except uppercase letter-spaced eyebrows.

---

## Surface 1 — Settings, on the full page

Settings currently lives on a **separate options page** with its own purple hero header. This round folds it
into the existing full-page surface as a third section beside Week and Manager, so there is one patient
surface instead of two.

Desktop width. Content column ~1180px like the other full-page sections, but settings is a form, not a grid
— **decide the reading width yourself and say why.** A 1180px-wide text input would be absurd.

### What it actually contains

Every field below exists in code today. Labels are the current strings — improve them where they're unclear,
and flag what you changed.

**Connection**
- Connected state: email address, Jira site domain, and how they authenticated — "via OAuth" or "via API
  token". These are facts, not settings; they need no input affordance.
- **Disconnect** — destructive. Currently opens a confirm dialog. It clears all local credentials and cached
  data. Must be visually separated from the ordinary settings, per KKP's rule that destructive actions are
  set apart.
- First-run state: not connected at all. Primary "Connect to Jira" plus a secondary "Set up with an API
  token" path for people who can't use OAuth.

**Reporting line** *(read-only, auto-detected from Jira's user directory)*
- Manager and skip-level names. Three states: resolving, resolved, and failed. Either name may legitimately
  be unset — the product degrades gracefully rather than blocking, so "not set" is a normal state and must
  not look like an error.

**Catch-all project**
- Project key, free text, defaults to `KNP`. Live-validated against Jira: idle → validating → valid →
  invalid. This is the project holding meetings, standup, and time off.
- **Time-off subtask** — a select populated from that project's subtasks. States: loading, populated, empty
  ("no subtasks found"), and blocked by an invalid project key. When unset, the popup shows a "not
  configured" notice, so the link between this field and that consequence should be legible here.

**Work-day target** — hours per day, default 8. **Daily reminder time** — a time of day.
**Approval cycle** — a select; `calendar-month` is one option.

**Diagnostics**
- Last sync timestamp (or "never"), local storage used in MB, and a "Clear cache" action that confirms
  inline by swapping to a cleared state rather than opening a dialog.

### What I need you to solve

1. **Grouping and rhythm.** Eleven controls of wildly different weight — two read-only facts, one
   destructive action, one live-validated field with a dependent select, three simple inputs, and a
   diagnostics block. Give it a structure that makes the important things findable and keeps the rest quiet.
2. **Where Disconnect lives** so it's reachable but never mis-clicked.
3. **Validation display** for the catch-all key → time-off subtask dependency, including the case where the
   key is invalid and the select therefore can't populate. Show the failure without making a normal
   mid-typing state look broken.
4. **The chrome header for this section** — the other two full-page sections have one. Settings has no
   headline figure to put in it. Decide what it carries.

States to cover: first-run/disconnected · connected and fully configured · connected with catch-all unset ·
reporting line failed to resolve · a field mid-validation.

---

## Surface 2 — The inline Jira banner

This is the hard one. It's the product's second-strongest discovery channel and the only place it reaches
into the user's existing workflow — but it lives **inside Jira's own page**, under Jira's CSP, as a guest.

### Hard constraints — these are not negotiable

- **Vanilla DOM, inline styles only.** No React, no Tailwind, no stylesheet, no class names. Every style is
  an inline `style` string. Design accordingly — anything requiring `:hover` CSS, pseudo-elements, media
  queries, or keyframes must be expressed some other way or attached via JS.
- **No external loads of any kind.** No fonts, no images, no `blob:` URLs.
- **The bundled Kanit/Noto fonts are NOT available here.** They're extension resources and aren't declared
  web-accessible; even if they were, Jira's `font-src` CSP may reject them. **Assume a system font stack**
  and make the banner look deliberate without the brand faces. If you think it's worth the manifest change
  and the CSP risk to get Kanit, say so and show both.
- **Do not use the full chrome gradient.** `DESIGN.md` is explicit: the gradient and orbital motif are
  chrome-only and this surface is a guest in someone else's chrome. It must read as the same product as the
  popup without competing with Jira's own header.
- Fixed to the top of the viewport, full width, above Jira's chrome in stacking order.
- `prefers-reduced-motion` must collapse the slide animations.

### What it does

**Collapsed** (~56px today — change it if you have a reason):
- A brand mark (currently a decorative dot)
- The state: *"3.5h unlogged this week."*
- A contextual action **only when the user is on a `/browse/<KEY>` page**: "Log time on GAPI-330" — this is
  the whole point of the banner, catching them on the ticket they actually worked on
- "Open extension"
- Dismiss — an X labelled "Dismiss for today"

**Expanded** — clicking the contextual action expands the banner in place into a quick-log:
- An hours input, labelled "Hours to log on GAPI-330", placeholder `2.5h, 2h 30m…`
- A "Log" button; `Enter` also submits
- An inline error slot

**Errors:** "Use formats like 2.5h, 2h 30m" · "Hours per entry can't exceed 24" · "Couldn't log time — try
again". The first two auto-clear after 1.5s.

**Success:** the button shows a confirmation, then the banner slides away after 600ms.

**The banner does not appear at all** when the user is caught up, dismissed it today, is disconnected, or
their auth expired. It never blocks, never throws, never nags twice.

### What I need you to solve

1. **How to be unmistakably this product without the gradient, the motif, or the brand fonts.** This is the
   central problem. Three of the four things carrying brand identity elsewhere are unavailable here.
2. **Sitting inside Jira without fighting it.** Jira's own UI is blue-forward and dense. A full-bleed purple
   bar pinned above it could read as a browser warning or an ad. Find the register that reads as *a tool the
   user installed* rather than *something wrong with the page*.
3. **The collapsed → expanded transition** in a fixed-position bar that is displacing page content.
4. **Restraint.** This appears on every Jira page the user visits, all day. It has to survive being seen
   fifty times without becoming irritating — which is a different problem from being seen once and admired.

States: collapsed without a contextual ticket · collapsed with one · expanded · error · success · and what
the layout does at narrow viewport widths where Jira itself gets cramped.

---

## What to give back

1. **Self-contained HTML mockups** — inline CSS, no external requests, all states named above.
2. **The banner mockup must use inline styles only**, so it can be transcribed straight into a vanilla-DOM
   builder. Don't hand back something that needs a stylesheet.
3. **Any token you added** beyond the block above, called out as an addition with its contrast ratio.
4. **A note on the banner's brand problem** — what you used to carry identity once the gradient, motif, and
   fonts were off the table, and why.
5. **Anywhere you departed from the existing spines**, flagged, with what it bought.

Priority if you can't do both: **the banner first.** Settings can extend patterns the spines already
specify — section headers, data cards, field rows — with fairly little invention. The banner can't; it's the
one surface where the whole system has to be re-expressed under different constraints, and it's the one
where getting it wrong is most visible.
