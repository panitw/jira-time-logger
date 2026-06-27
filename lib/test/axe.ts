import type { AxeResults, Result, RunOptions } from 'axe-core';
import { axe } from 'vitest-axe';

/**
 * Shared axe configuration for the Story 6.1 accessibility audit gate.
 *
 * Scope: WCAG 2.1 A + AA structural / ARIA / name-role-value rules. The HARD
 * gate (AC1) is zero Critical/Serious violations — use `criticalOrSerious()`.
 *
 * `color-contrast` is DISABLED: axe-core computes contrast by painting to a
 * <canvas>, which jsdom does not implement (it has no layout/paint engine), so
 * the rule can neither pass nor fail meaningfully here. Real contrast, focus-
 * ring visibility, 200% zoom, high-contrast OS mode and color-blindness are
 * verified MANUALLY per the UX spec (Story 6.1 AC5/AC7) and recorded in the
 * release-gate audit doc.
 */
export const WCAG_AA_OPTIONS: RunOptions = {
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  },
  rules: {
    'color-contrast': { enabled: false },
  },
};

/** Run axe against a container/element with the WCAG 2.1 AA gate config. */
export function scan(node: Element | string): Promise<AxeResults> {
  return axe(node, WCAG_AA_OPTIONS);
}

/** Filter axe violations to the hard-gate severities (Critical + Serious). */
export function criticalOrSerious(violations: Result[]): Result[] {
  return violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
}
