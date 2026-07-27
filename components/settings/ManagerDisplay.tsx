import { FactRow, FactTable, FactTableFooter, SectionRule } from '@/components/settings/SettingsPrimitives';
import { Button } from '@/components/ui/button';

/**
 * Reporting line block (Story 7.10, AC3/AC7, Block 2 of 5) — facts,
 * read-only, `round2:248-264`.
 *
 * D-7.10-43: the old monospace utility is REMOVED here, not swapped to
 * `tabular` — a person's name is not a numeric (`round2:257,261` render
 * names in the plain body face, no Kanit, no tabular-nums).
 *
 * AC7's two branches map directly onto `resolveReportingLine()`'s existing
 * contract (`lib/manager-resolution.ts`): it returns `ok()` with
 * `managerDisplayName: null` when the manager is genuinely unset, and an
 * `err` only when a request actually failed. No new derivation needed —
 * `loading` / `ok+name` / `ok+null` / `err` cover every case.
 */

const STRINGS = {
  heading: 'Reporting line',
  subCaption: "Read from Jira's user directory. Not editable here — ask IT if it's wrong.",
  managerLabel: 'Manager',
  skipLevelLabel: 'Skip-level',
  notSetInJira: 'Not set in Jira',
  errorValue: "Couldn't read this from Jira",
  errorConsequence: 'Approvals still work — your manager finds you from their side.',
  tryAgain: 'Try again',
};

export type ManagerNames = {
  managerDisplayName: string | null;
  skipLevelDisplayName: string | null;
};

type Props = {
  managerDisplayName: string | null;
  skipLevelDisplayName: string | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

/** `round2:419,423`'s skeleton fill (`#EFEFF3`) has no existing token match
 * — but the manager matrix's own skeleton rows (`ManagerMatrix.tsx:400`)
 * already established `bg-border-faint` (`#F0EFF5`) + `animate-skeleton` as
 * this product's skeleton-neutral pairing. Reusing it rather than tokenising
 * a near-duplicate hex is the D-7.3-14 "don't fragment a near neighbour"
 * discipline applied in the opposite direction: this genuinely IS the same
 * surface (a loading placeholder bar), not a distinct one. */
function SkeletonRow({ label, widthClass }: { label: string; widthClass: string }): React.ReactElement {
  return (
    <div className="grid grid-cols-[180px_1fr] items-center gap-4 px-4 py-[11px]">
      <span className="font-chrome text-[12.5px] font-medium text-muted">{label}</span>
      <span aria-hidden="true" className={`h-[11px] animate-skeleton rounded bg-border-faint ${widthClass}`} />
    </div>
  );
}

export function ManagerDisplay({
  managerDisplayName,
  skipLevelDisplayName,
  loading,
  error,
  onRetry,
}: Props): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <SectionRule heading={STRINGS.heading} />
      <span className="-mt-1 text-body-sm text-muted">{STRINGS.subCaption}</span>

      {loading ? (
        <FactTable>
          <SkeletonRow label={STRINGS.managerLabel} widthClass="w-[130px]" />
          <SkeletonRow label={STRINGS.skipLevelLabel} widthClass="w-[90px]" />
        </FactTable>
      ) : error ? (
        <FactTable
          footer={
            <FactTableFooter>
              <span className="text-body-sm text-muted">{STRINGS.errorConsequence}</span>
              <Button variant="secondary" size="sm" onClick={onRetry}>
                {STRINGS.tryAgain}
              </Button>
            </FactTableFooter>
          }
        >
          <FactRow label={STRINGS.managerLabel}>
            <span className="text-faint">{STRINGS.errorValue}</span>
          </FactRow>
          {/* M-7: the Skip-level row used to disappear entirely in this
           * branch (rows went 2 → 1 → 2 across load/fail/retry) — a layout
           * shift plus a silently missing fact. Both rows always render;
           * only their VALUE varies by state. */}
          <FactRow label={STRINGS.skipLevelLabel}>
            <span className="text-faint">{STRINGS.errorValue}</span>
          </FactRow>
        </FactTable>
      ) : (
        <FactTable>
          <FactRow label={STRINGS.managerLabel}>
            {managerDisplayName ? (
              <span className="text-foreground">{managerDisplayName}</span>
            ) : (
              <span className="text-faint">{STRINGS.notSetInJira}</span>
            )}
          </FactRow>
          <FactRow label={STRINGS.skipLevelLabel}>
            {skipLevelDisplayName ? (
              <span className="text-foreground">{skipLevelDisplayName}</span>
            ) : (
              <span className="text-faint">{STRINGS.notSetInJira}</span>
            )}
          </FactRow>
        </FactTable>
      )}
    </div>
  );
}
