const STRINGS = {
  /**
   * Short chip copy (Story 5.5, FR34). Honest, no exclamation beyond the ⚠
   * glyph (UX-DR30/31). Singular/plural agreement on the noun + verb.
   */
  chip: (n: number) =>
    `⚠ ${n} worklog${n === 1 ? '' : 's'} with restricted visibility ${
      n === 1 ? 'was' : 'were'
    } excluded from this view.`,
  /**
   * Long-form explanation surfaced via `title` + `aria-label` (the in-repo
   * a11y-equivalent fallback Story 5.4 shipped — there is no tooltip primitive
   * in `components/ui/`). States the fact, no accusation (UX-DR30).
   */
  explanation: (personName: string) =>
    `${personName} has worklogs with team-restricted visibility on this Epic that you don't have permission to see. This may make the totals appear lower than reality.`,
};

type Props = {
  restrictedCount: number;
  personName: string;
  epicKey: string;
};

/**
 * The restricted-visibility chip (Story 5.5, FR34). Renders ONLY when the
 * chosen `(report, Epic)` has worklogs the manager cannot see
 * (`restrictedCount > 0`) — otherwise nothing (no empty container, AC 9). The
 * count is consumed read-only from Story 5.4's per-Epic `restrictedCount`;
 * this component never fetches or recomputes it.
 *
 * `epicKey` is part of the contract (the warning is scoped per-Epic) so Story
 * 5.6 can reuse the same component/copy if it surfaces restriction in the
 * approve flow.
 */
export function VisibilityWarning({
  restrictedCount,
  personName,
}: Props): React.ReactElement | null {
  if (restrictedCount <= 0) return null;

  const explanation = STRINGS.explanation(personName);

  return (
    <p
      className="mt-3 rounded bg-state-warning-subtle px-2 py-1 text-xs text-state-warning"
      title={explanation}
      aria-label={explanation}
    >
      {STRINGS.chip(restrictedCount)}
    </p>
  );
}
