import { DayStatusIndicator } from '@/components/shared/DayStatusIndicator';

const STRINGS = {
  /**
   * Short chip copy (Story 5.5, FR34). Honest, no exclamation (AC11 removes
   * the `⚠` text glyph — the icon now comes from the shared registry).
   * Singular/plural agreement on the noun + verb.
   */
  chip: (n: number) =>
    `${n} worklog${n === 1 ? '' : 's'} with restricted visibility ${
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
    // Story 7.8 / AC11: the `⚠` text glyph is gone — the restricted chip's
    // own vocabulary (`EyeOff` via the shared registry, dc.html:534) carries
    // the signal, on its OWN chip-surface fill so it composes safely over
    // any surface behind it (D-7.8-26/AC9's point, applied here too).
    <p
      className="mt-3 inline-flex items-center gap-1 rounded-[5px] border border-border bg-chip-surface px-[7px] py-[3px] text-xs"
      title={explanation}
      aria-label={explanation}
    >
      <DayStatusIndicator variant="inline" status="restricted" label={STRINGS.chip(restrictedCount)} />
    </p>
  );
}
