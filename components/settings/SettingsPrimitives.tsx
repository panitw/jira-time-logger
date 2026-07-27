/**
 * Shared building blocks for the Settings five-block layout (Story 7.10,
 * AC2/AC3). Every value is cited to the vendored design source (SD-6):
 * `imports/jira-time-logger-round2.dc.html:229-347`.
 *
 * `SectionRule` is the purple (or, for Disconnect, grey — D-7.10-49/AC5)
 * heading rule repeated above every block. `FactTable`/`FactRow` are the
 * hairline row tables AC3 requires to carry NO input affordance at all —
 * neither renders an `<input>`, `<select>`, or `<textarea>`; Task 10's grep
 * guard pins that.
 */

export type SectionRuleTone = 'primary' | 'muted';

export function SectionRule({
  heading,
  tone = 'primary',
}: {
  heading: string;
  tone?: SectionRuleTone;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={`font-chrome text-[15px] font-semibold ${
          tone === 'primary' ? 'text-primary' : 'text-muted'
        }`}
      >
        {heading}
      </span>
      {/* Purple rule for the four ordinary blocks; the Disconnect block's
       * own grey variant is deliberate (AC5) — this is a destructive action,
       * set apart, not a fact among facts. */}
      <div
        aria-hidden="true"
        className={
          tone === 'primary'
            ? 'h-0.5 bg-[linear-gradient(to_right,var(--color-primary)_0_64px,var(--color-border)_64px)]'
            : 'h-0.5 bg-[linear-gradient(to_right,var(--color-grandeur-grey)_0_64px,var(--color-border)_64px)]'
        }
      />
    </div>
  );
}

export function FactTable({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-hairline">
      <div className="divide-y divide-border-hairline">{children}</div>
      {footer}
    </div>
  );
}

export function FactRow({
  label,
  children,
  tabularValue = false,
}: {
  label: string;
  children: React.ReactNode;
  /** The design applies `tabular-nums` to every fact VALUE cell (`round2:238`)
   * — set false for a value that is prose, not a numeric/date/key. */
  tabularValue?: boolean;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-[180px_1fr] items-baseline gap-4 px-4 py-[11px]">
      <span className="font-chrome text-[12.5px] font-medium text-muted">{label}</span>
      <div className={`text-body text-foreground ${tabularValue ? 'tabular' : ''}`}>{children}</div>
    </div>
  );
}

/** A Logging-defaults field's label + one-line consequence (AC9) — the
 * label is Kanit 12.5/500 `#1E1B2E` (darker than a fact label's `#6B6678`,
 * `round2:274`), the consequence 12.5px `#6B6678` `line-height:1.5`
 * (`round2:275`). A tooltip is explicitly NOT this pattern — AC9 requires
 * the consequence to be always-visible text beneath the label. */
export function FieldLabel({
  label,
  consequence,
  htmlFor,
}: {
  label: string;
  consequence: string;
  /** Wires this label to its control's `id` so the control has an
   * accessible name (WCAG 4.1.2/3.3.2). Every Logging-defaults control must
   * pass its own `id` here — a bare `<span>` was found to leave all five
   * controls with no accessible name at all (review Finding 2 / Blocker). */
  htmlFor: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-chrome text-[12.5px] font-medium text-foreground">
        {label}
      </label>
      <span className="text-body-sm leading-[1.5] text-muted">{consequence}</span>
    </div>
  );
}

/** The `#FCFCFD` footer row a fact table sometimes carries — the Connection
 * block's reassurance copy, or a reporting-line/reporting-failure "Try
 * again" action row (`round2:241-244`, `:431-433`). */
export function FactTableFooter({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface-sunk px-4 py-[11px]">
      {children}
    </div>
  );
}
