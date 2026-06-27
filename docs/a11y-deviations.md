# Accessibility Deviations — Accepted Moderate/Minor axe Findings

This file records accepted **Moderate/Minor** axe-core findings from the
automated WCAG 2.1 AA scan harness (Story 6.1, AC1). The hard gate is **zero
Critical/Serious** violations; anything below that severity is either fixed or
recorded here with a justification.

The automated scan runs inside the vitest suite (`vitest-axe` + `axe-core`,
jsdom) against the rendered DOM of every surface (popup Today/Week/Manager
views, options page, injected banner DOM). See `lib/test/axe.ts` for the shared
WCAG 2.1 AA configuration.

## Scan severity gate

| Severity            | Policy                                        |
| ------------------- | --------------------------------------------- |
| Critical / Serious  | **MUST be zero** (test fails otherwise)       |
| Moderate / Minor    | Fix, or record an accepted deviation below    |

## Accepted deviations

**None.** As of the 2026-06-27 audit, the automated scan reports zero
Critical/Serious violations across all surfaces, and no Moderate/Minor findings
were left unaddressed. The Critical findings surfaced during this story were all
**fixed** (not deviated):

1. **Form fields without an accessible name** (`select-name`, `label`) on the
   options page — `CycleField`, `ReminderTimeField`, `TargetHoursField`,
   `CatchAllProjectField` had `<label>`s not associated with their controls.
   Fixed by adding `htmlFor`/`id` associations.
2. **Invalid composite-widget children** (`aria-required-children`) on the Today
   `TicketPicker` — a `role="listbox"` cannot contain focusable `<summary>`
   group headers. Fixed by modelling the nested, collapsible hierarchy as a
   `tree` (`role="tree"` → `role="treeitem"` leaves, with `role="group"` bodies
   and `aria-expanded` on the disclosure summaries).

## Rules disabled in the jsdom harness (verified manually instead)

| axe rule          | Why disabled in jsdom                                         | How it is verified                          |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------- |
| `color-contrast`  | axe computes contrast by painting to `<canvas>`, which jsdom does not implement (no layout/paint engine). The rule can neither pass nor fail meaningfully. | Human DevTools contrast check against the design tokens — **PENDING HUMAN VERIFICATION**, tracked in the dated audit doc (AC5/AC7). |

True rendered color-contrast, focus-ring visibility, 200% zoom, high-contrast OS
mode, and color-blindness simulation are inherently un-evaluable in jsdom. They
are tracked as **PENDING HUMAN VERIFICATION** manual passes in
`docs/a11y-audit-<date>.md` (not yet performed by the implementation agent).
