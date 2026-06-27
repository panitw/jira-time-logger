import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useMemo } from 'react';
import { VisibilityWarning } from './VisibilityWarning';
import { cn } from '@/components/ui/utils';
import { formatCycleTitle } from '@/lib/cycle-title';
import { secondsToHours, secondsToFixedHoursDisplay } from '@/lib/hours';
import type { ReportEpicWorklogs } from '@/lib/jira-types';
import type { CycleId } from '@/lib/storage/view-state';

const STRINGS = {
  header: (personName: string, epicKey: string, cycleTitle: string) =>
    `${personName} · ${epicKey} · ${cycleTitle}`,
  totalHours: (hours: string) => `${hours} hours`,
  empty: (epicKey: string, personName: string) =>
    `No tickets in ${epicKey} for ${personName} this cycle.`,
  close: 'Close',
};

/** One ticket's aggregated contribution within the chosen Epic this cycle. */
type TicketRow = {
  ticketKey: string;
  ticketSummary: string;
  seconds: number;
};

/**
 * Aggregate the Epic's preserved per-ticket worklog records by `ticketKey`
 * (a ticket can have multiple in-window records → sum their seconds so each
 * ticket appears once), sort by descending hours, tie-break `ticketKey` asc.
 * Pure — the records come in as props (no fetch, AC 5).
 */
function aggregateTickets(epic: ReportEpicWorklogs): TicketRow[] {
  const byKey = new Map<string, TicketRow>();
  for (const wl of epic.worklogs) {
    const existing = byKey.get(wl.ticketKey);
    if (existing) {
      existing.seconds += wl.seconds;
    } else {
      byKey.set(wl.ticketKey, {
        ticketKey: wl.ticketKey,
        ticketSummary: wl.ticketSummary,
        seconds: wl.seconds,
      });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    b.seconds !== a.seconds
      ? b.seconds - a.seconds
      : a.ticketKey.localeCompare(b.ticketKey),
  );
}

/**
 * Header total ("64 hours" / "12.5 hours"): whole when whole, else one decimal.
 * Mirrors `formatCellHours`'s number form but spells out "hours" (the
 * drill-down wireframe word, NOT the `h` suffix). Never inline `/3600`.
 * A tiny-but-nonzero total (e.g. < ~3 min) rounds to "0" with `.0` stripped;
 * unlike the matrix cell (which shows `──`) the header always states a number,
 * so keep the one-decimal form rather than the misleading bare "0" — the cell
 * may read `──` while the panel honestly shows the small total.
 */
function formatTotalHours(totalSeconds: number): string {
  const hours = secondsToHours(totalSeconds);
  const stripped = hours.toFixed(1).replace(/\.0$/, '');
  if (stripped === '0' && totalSeconds > 0) return hours.toFixed(1);
  return stripped;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  epicKey: string;
  cycle: CycleId;
  /**
   * The chosen Epic's already-resolved records (Story 5.3/5.4 output) — or
   * `undefined` in the defensive case where the cell was clicked before its
   * row's query resolved (AC 12). The panel filters these client-side; it
   * NEVER fetches.
   */
  epic: ReportEpicWorklogs | undefined;
};

/**
 * The read-only drill-down panel (Story 5.5): a right-anchored slide-in built
 * on the in-repo Radix `Dialog` (focus trap, Esc, ARIA modal, backdrop, and
 * focus-return-to-trigger inherited). It renders a NEW right-anchored
 * `DialogPrimitive.Content` (NOT the shared centered `DialogContent`) so the
 * centered dialogs — `GapAcknowledgmentDialog` / `MarkAsDoneButton` — do not
 * regress. The matrix stays visible behind a dimming overlay (UX-DR16).
 *
 * READ + DISPLAY only: it shows the per-ticket evidence behind a matrix cell
 * plus the visibility warning; it never POSTs, never adds an approve action,
 * and never fetches (the records arrive as props from the resolved map).
 */
export function DrillDownPanel({
  open,
  onOpenChange,
  personName,
  epicKey,
  cycle,
  epic,
}: Props): React.ReactElement {
  const tickets = useMemo(() => (epic ? aggregateTickets(epic) : []), [epic]);
  const cycleTitle = formatCycleTitle(cycle);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          // The DialogTitle is the accessible name; there is no separate
          // description, so opt out of Radix's aria-describedby requirement
          // (otherwise Radix logs a "Missing Description" console warning).
          aria-describedby={undefined}
          className={cn(
            'fixed right-0 top-0 z-50 flex h-full w-[300px] max-w-[85%] flex-col gap-3 border-l border-neutral-200 bg-neutral-50 p-4 shadow-lg',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'motion-safe:data-[state=open]:slide-in-from-right motion-safe:data-[state=closed]:slide-out-to-right',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <DialogPrimitive.Title className="text-sm font-semibold leading-tight text-neutral-900">
              {STRINGS.header(personName, epicKey, cycleTitle)}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="-mr-1 -mt-1 shrink-0 rounded p-1 text-neutral-500 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={STRINGS.close}
            >
              <X size={16} aria-hidden />
            </DialogPrimitive.Close>
          </div>

          {epic === undefined ? (
            <div data-testid="drilldown-skeleton" className="space-y-2" aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-5 rounded bg-neutral-100 motion-safe:animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              <p className="text-xs text-neutral-500">
                {STRINGS.totalHours(formatTotalHours(epic.totalSeconds))}
              </p>

              {tickets.length === 0 ? (
                <p className="text-sm text-neutral-700">
                  {STRINGS.empty(epicKey, personName)}
                </p>
              ) : (
                <ul className="space-y-1 overflow-y-auto text-sm">
                  {tickets.map((t) => (
                    <li
                      key={t.ticketKey}
                      className="flex items-baseline justify-between gap-2 border-b border-neutral-100 py-1"
                    >
                      <span className="min-w-0">
                        <span className="font-mono text-xs text-neutral-900">
                          {t.ticketKey}
                        </span>{' '}
                        <span className="text-neutral-700">{t.ticketSummary}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-neutral-900">
                        {secondsToFixedHoursDisplay(t.seconds)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <VisibilityWarning
                restrictedCount={epic.restrictedCount}
                personName={personName}
                epicKey={epicKey}
              />
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
