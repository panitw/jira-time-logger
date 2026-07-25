# Reconciliation — Claude Design output vs. captured decisions

Input: [imports/jira-time-logger.dc.html](./imports/jira-time-logger.dc.html)
(claude.ai/design project `f9f22106-f61a-4bde-b27c-1ced04ef9832`, imported 2026-07-25 via DesignSync).

## Decisions honoured

| Decision | Evidence in the output |
|---|---|
| D1 popup + full page | Three surfaces at 380×560, 1180px, 1180px |
| D5 Linear register | Tabular density, keyboard affordances visible, no ornament |
| D6 KKP system | Chrome gradient, Kanit/Noto split, Legacy Purple sole brand colour |
| D7 resume card + search | Resume card pulled into the chrome; `/` search that reaches Jira live |
| D8 light only | No dark tokens emitted |
| D9 popup = today only | No tabs anywhere in the popup; "Open week ↗" hands off |
| D11 English only | No Thai; `--font-data` is Noto Sans Latin |
| D12 depth waiver | Used as licensed: chrome → cards → rows, three levels, explicitly stated |

## Problems solved that were handed over open

**The 55-ticket list.** Producer's answer: the popup never renders 55 rows. Four recency-ranked
"Recently worked" rows, then a handoff row — *"51 more assigned tickets · Search to find them →"*. Search
becomes the browse mechanism rather than a filter over one. This also solves logging against a teammate's
ticket through the same control, which the handoff listed as a separate problem.

**Long GAPI summaries.** Key and summary on separate lines, so an 80-character summary truncates on its own
line without displacing the key. Two-line clamp in the resume card, single-line ellipsis in list rows, fixed
row heights so lists still scan.

**The red "below target" wall.** Replaced with a five-state day vocabulary — and critically, a new glyph
`◔` for *partially logged*, which is the state the old build had no name for and therefore rendered as red.
Amber now fires once per week at most (a workday with genuinely zero hours); red is reserved for a write
Jira actually rejected.

## Additions the producer made, accepted into DESIGN.md

| Addition | Assessment |
|---|---|
| `--amber-soft/-border/-ink` (#FFF8EC/#EDD3A6/#7A3E06) | Accepted. Derived from `status-dirty`, no new hue; ink is 5.9:1 on soft. |
| `--surface-sunk`, `--border-faint`, `--border-hairline` | Accepted. This is the three-step surface ladder + three hairline weights that replace the old flat plane. It is the actual fix for "it looks flat." |
| `--focus-ring`, `--shadow-lift` | Accepted. Purple-tinted, consistent with KKP's shadow tint. |
| `◔` as a fifth status glyph | Accepted, and it's the highest-value single change in the output. |
| `·` as the empty glyph, replacing `——` | Accepted. |
| Drop Kanit 300 | Accepted — implemented, three woff2 files ship. |

## Gaps and disagreements

1. **`--status-recomputing` is overloaded.** The output uses `◐` for three different things: PTO, restricted
   visibility, and "searched live in Jira". KKP defines it as *recomputing/verifying*. EXPERIENCE.md records
   the broadened meaning, but a reader could reasonably read a PTO day as "still calculating." **Open.**

2. **No settings surface.** The IA places settings on the full page; the producer wasn't asked for it and
   didn't produce it. Spine-only. **Open.**

3. **Inline Jira banner and first-run** were scoped out (D10) and remain unreconciled. The popup's
   "Not connected" state exists, but the options-page connect flow does not.

4. **The `⏎` badge inside the hour input** is a nice affordance but sits inside a text input — needs care
   in implementation so it isn't announced as content by a screen reader, and so it doesn't overlap the
   caret at long values.

5. **Weekend columns** are tinted at header, cell, and totals level. Confirm this doesn't read as "disabled"
   to someone who genuinely works a Saturday — the design has no state for weekend work with hours logged.
   **Open.**

## Nothing was dropped

Every qualitative idea in the handoff prompt appears in the output. The producer also returned three
"Notes back to you" panels explaining its reasoning, which fed directly into DESIGN.md § Elevation & Depth
and EXPERIENCE.md § Information Architecture.
