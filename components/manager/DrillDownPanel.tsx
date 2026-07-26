import * as DialogPrimitive from '@radix-ui/react-dialog';
import { differenceInCalendarDays, format } from 'date-fns';
import { X } from 'lucide-react';
import { useMemo } from 'react';
import { ApproveButton, formatHours, type ApproveMode } from './ApproveButton';
import { VisibilityWarning } from './VisibilityWarning';
import { DayStatusIndicator } from '@/components/shared/DayStatusIndicator';
import { cn } from '@/components/ui/utils';
import { formatCycleTitle } from '@/lib/cycle-title';
import { secondsToHours, secondsToFixedHoursDisplay } from '@/lib/hours';
import type { ReportEpicWorklogs } from '@/lib/jira-types';
import type { CycleId } from '@/lib/storage/view-state';

const STRINGS = {
  header: (personName: string, epicKey: string) => `${personName} · ${epicKey}`,
  totalHours: (hours: string) => `${hours} hours`,
  reasonSeparator: ' · ',
  empty: (epicKey: string, personName: string) =>
    `No tickets in ${epicKey} for ${personName} this cycle.`,
  close: 'Close',
  needsReapproval: 'Needs re-approval',
  changed: 'changed',
  editedAfterApproval: (days: number) =>
    days <= 0 ? 'edited after approval' : `edited ${days} day${days === 1 ? '' : 's'} after approval`,
  // Finding 21 (Minor): `changed.length` counts TICKETS (aggregated per
  // Task 8), not worklog entries — "N entries" mismatched what was actually
  // being counted. "ticket(s)" states the true grain.
  changeSummary: (n: number, approvalDate: string, changedDates: string[]) => {
    const noun = n === 1 ? 'ticket' : 'tickets';
    const dateList = changedDates.length > 0 ? `: ${changedDates.join(', ')}` : '';
    return `${n} ${noun} changed since you approved on ${approvalDate}${dateList}.`;
  },
  // Finding 20: the honest line for a clean Epic in a dirty row — see
  // `rowDirtyButEpicClean` below.
  otherEpicDirty:
    'Another Epic in this cycle changed after approval; re-approving covers the whole cycle.',
};

/** One ticket's aggregated contribution within the chosen Epic this cycle. */
type TicketRow = {
  ticketKey: string;
  ticketSummary: string;
  seconds: number;
  /** A representative date for the row (the latest `started`, falling back
   * to `updated`, among its constituent worklogs) — dc.html:591's `w.date`
   * column. `undefined` when no constituent carries either field. */
  date: string | undefined;
  /** `true` when at least one constituent worklog's `updated` is after
   * `approvalAt` — the SAME comparison `lib/dirty-detect.ts#isCycleDirty`
   * makes (Task 8: read the same values rather than re-deriving). Always
   * `false` when the Epic isn't approved (`approvalAt` is null/undefined). */
  changed: boolean;
  /**
   * Finding 10 (Major): the epoch ms of the CHANGE itself — the latest
   * `updated` among only this ticket's `changedHere` worklogs — kept
   * SEPARATE from `date` (the row's general representative date, which can
   * be driven by an untouched worklog's `started`). `buildChangeSummary`
   * must name only dates on which something actually changed; `undefined`
   * when `changed` is false or no changed worklog carries `updated`. Kept
   * as ms (not pre-formatted) so the summary can sort chronologically
   * rather than alphabetically ("3 Jun" before "12 Jun", not after).
   */
  changedAtMs: number | undefined;
};

/**
 * Aggregate the Epic's preserved per-ticket worklog records by `ticketKey`
 * (a ticket can have multiple in-window records → sum their seconds so each
 * ticket appears once), sort by descending hours, tie-break `ticketKey` asc.
 * Pure — the records come in as props (no fetch, AC 5).
 *
 * Story 7.8 / Task 8: also computes each row's `changed` flag and a display
 * `date`. Aggregation stays by ticket (the smaller change per Task 8's own
 * allowance) rather than exploding into one row per raw worklog record.
 */
function aggregateTickets(
  epic: ReportEpicWorklogs,
  approvalAt: string | null | undefined,
): TicketRow[] {
  const approvalMs = approvalAt ? Date.parse(approvalAt) : NaN;
  const byKey = new Map<
    string,
    {
      ticketSummary: string;
      seconds: number;
      changed: boolean;
      latestMs: number | undefined;
      /** Finding 10: tracked SEPARATELY from `latestMs` — only advanced by
       * a worklog that actually `changedHere`, so it can never name a date
       * on which nothing changed. */
      latestChangedMs: number | undefined;
    }
  >();
  for (const wl of epic.worklogs) {
    const updatedMs = wl.updated ? Date.parse(wl.updated) : NaN;
    const changedHere =
      !Number.isNaN(approvalMs) && !Number.isNaN(updatedMs) && updatedMs > approvalMs;
    const dateSource = wl.started ?? wl.updated;
    const dateMs = dateSource ? Date.parse(dateSource) : NaN;

    const existing = byKey.get(wl.ticketKey);
    if (existing) {
      existing.seconds += wl.seconds;
      existing.changed = existing.changed || changedHere;
      if (!Number.isNaN(dateMs) && (existing.latestMs === undefined || dateMs > existing.latestMs)) {
        existing.latestMs = dateMs;
      }
      if (
        changedHere &&
        (existing.latestChangedMs === undefined || updatedMs > existing.latestChangedMs)
      ) {
        existing.latestChangedMs = updatedMs;
      }
    } else {
      byKey.set(wl.ticketKey, {
        ticketSummary: wl.ticketSummary,
        seconds: wl.seconds,
        changed: changedHere,
        latestMs: Number.isNaN(dateMs) ? undefined : dateMs,
        latestChangedMs: changedHere ? updatedMs : undefined,
      });
    }
  }
  return [...byKey.entries()]
    .map(([ticketKey, v]) => ({
      ticketKey,
      ticketSummary: v.ticketSummary,
      seconds: v.seconds,
      changed: v.changed,
      date: v.latestMs !== undefined ? format(new Date(v.latestMs), 'd MMM') : undefined,
      changedAtMs: v.latestChangedMs,
    }))
    .sort((a, b) =>
      b.seconds !== a.seconds ? b.seconds - a.seconds : a.ticketKey.localeCompare(b.ticketKey),
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

/** The "edited N days after approval" reason line — undefined when the Epic
 * isn't dirty (no approval, or no worklog changed after it). */
function formatReason(epic: ReportEpicWorklogs, approvalAt: string | null | undefined): string | undefined {
  if (!approvalAt) return undefined;
  const approvalMs = Date.parse(approvalAt);
  if (Number.isNaN(approvalMs)) return undefined;
  const changedMs = epic.worklogs
    .map((w) => w.updated)
    .filter((u): u is string => Boolean(u))
    .map((u) => Date.parse(u))
    .filter((ms) => !Number.isNaN(ms) && ms > approvalMs);
  if (changedMs.length === 0) return undefined;
  const latest = Math.max(...changedMs);
  const days = differenceInCalendarDays(new Date(latest), new Date(approvalMs));
  return STRINGS.editedAfterApproval(days);
}

/** Plain-language change summary (dc.html:599, Task 8): states only what the
 * data supports — a count, the approval date, and the changed dates. Never
 * claims a delta ("+1.5h") or a description of WHAT changed — Epic 5 never
 * stored a before-value, so that claim would be unprovable. */
function buildChangeSummary(
  tickets: TicketRow[],
  approvalAt: string | null | undefined,
): string | undefined {
  if (!approvalAt) return undefined;
  const approvalMs = Date.parse(approvalAt);
  if (Number.isNaN(approvalMs)) return undefined;
  const changed = tickets.filter((t) => t.changed);
  if (changed.length === 0) return undefined;
  const approvalDate = format(new Date(approvalMs), 'd MMM');
  // Finding 10: read `changedAtMs` (the change's OWN date), never `date`
  // (the row's general representative date, which can be driven by an
  // untouched worklog) — otherwise the summary can name a date on which
  // nothing changed. Finding 21: dedupe by CALENDAR DAY (the 'd MMM'
  // granularity actually shown), not by raw ms — two tickets that changed
  // on the same day at DIFFERENT times have different ms and would not
  // dedupe as Set members, but must still collapse to one date in the
  // list. Sort chronologically by ms (not alphabetically — "3 Jun" must
  // sort before "12 Jun"), keeping each day's earliest ms for the sort key.
  const dayToMs = new Map<string, number>();
  for (const t of changed) {
    if (t.changedAtMs === undefined) continue;
    const day = format(new Date(t.changedAtMs), 'd MMM');
    if (!dayToMs.has(day)) dayToMs.set(day, t.changedAtMs);
  }
  const changedDates = [...dayToMs.entries()].sort((a, b) => a[1] - b[1]).map(([day]) => day);
  return STRINGS.changeSummary(changed.length, approvalDate, changedDates);
}

/** Row-scoped write action the panel offers (Task 8). `undefined` when there
 * is nothing to do (no touched Epics, or the row is already fully approved)
 * — the footer then renders no action at all, same "absence is deliberate"
 * discipline as D-7.8-18's removed secondary. */
export type DrillDownAction = {
  mode: ApproveMode;
  reportAccountId: string;
  managerAccountId: string;
  epics: { epicKey: string; restrictedCount: number }[];
  rowSeconds: number;
  restrictedCount: number;
  disabledReason: string | undefined;
  priorApprovalAt: string | undefined;
};

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
  /**
   * This (report, Epic)'s resolved approval anchor (`cellAnchors`,
   * `ManagerMatrix.tsx`) — `null`/`undefined` when unapproved. Threaded in
   * as a prop (Task 8) so the panel derives the reason/flags/summary from
   * the SAME anchor `lib/dirty-detect.ts#isCycleDirty` compares, rather than
   * re-deriving or fetching.
   */
  approvalAt?: string | null;
  /** The row-scoped re-approve/approve action (Task 8) — reuses
   * `ApproveButton` (same mutation, canonicality gate, outbox behaviour) so
   * this is the row's SAME write path, not a second one. */
  action?: DrillDownAction | undefined;
};

/**
 * The drill-down rail (Story 5.5, restyled + extended by Story 7.8 AC5): a
 * right-anchored slide-in built on the in-repo Radix `Dialog` (focus trap,
 * Esc, ARIA modal, backdrop, and focus-return-to-trigger inherited). It
 * renders a NEW right-anchored `DialogPrimitive.Content` (NOT the shared
 * centered `DialogContent`) so the centered dialogs — `GapAcknowledgmentDialog`
 * / `MarkAsDoneButton` — do not regress. The matrix stays visible behind a
 * dimming overlay (UX-DR16).
 *
 * READ + DISPLAY only for the evidence itself: it never fetches (records
 * arrive as props). Story 7.8 adds ONE write affordance — reusing
 * `ApproveButton` verbatim — but the panel itself still never calls
 * `sendRequest` directly.
 */
export function DrillDownPanel({
  open,
  onOpenChange,
  personName,
  epicKey,
  cycle,
  epic,
  approvalAt,
  action,
}: Props): React.ReactElement {
  const tickets = useMemo(() => (epic ? aggregateTickets(epic, approvalAt) : []), [epic, approvalAt]);
  const cycleTitle = formatCycleTitle(cycle);
  const reason = epic ? formatReason(epic, approvalAt) : undefined;
  const summary = epic ? buildChangeSummary(tickets, approvalAt) : undefined;
  const isDirty = reason !== undefined;
  // Finding 20 (Minor): `action.mode` is ROW-scoped (Task 8: "re-approving
  // here is scoped to the WHOLE (user, cycle) — same as the row's own
  // button"), but this panel's evidence (`reason`/`isDirty`/`summary`) is
  // EPIC-scoped to the one the manager drilled into. When a DIFFERENT Epic
  // in the row is the dirty one, `action.mode === 'reapprove'` while THIS
  // Epic shows no reason/chip/summary — the footer asks to "Re-approve"
  // with nothing in the panel explaining why. Rather than rescope `mode`
  // (which would misstate what the write actually does), state the fact.
  const rowDirtyButEpicClean = action?.mode === 'reapprove' && !isDirty;

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
            // ResumeCard.tsx owns an exclusive elevation class (guarded by
            // its own test) — `shadow-overlay` is the semantically correct
            // token for a slide-in/dialog surface anyway, and matches
            // dc.html:580's own box-shadow more closely.
            'fixed right-0 top-0 z-50 flex h-full w-[340px] max-w-[85%] flex-col border-l border-border bg-surface shadow-overlay',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'motion-safe:data-[state=open]:slide-in-from-right motion-safe:data-[state=closed]:slide-out-to-right',
          )}
        >
          {/* dc.html:581-587 — header + subtitle + the dirty-only chip. */}
          <div className="flex items-start justify-between gap-2 border-b border-border-faint px-[18px] py-4">
            <div className="flex flex-col gap-[3px]">
              <DialogPrimitive.Title className="font-chrome text-[15px] font-semibold text-foreground">
                {STRINGS.header(personName, epicKey)}
              </DialogPrimitive.Title>
              {epic ? (
                <p className="text-[12.5px] text-muted">
                  {STRINGS.totalHours(formatTotalHours(epic.totalSeconds))}
                  {reason ? `${STRINGS.reasonSeparator}${reason}` : ''}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isDirty ? (
                <span className="inline-flex items-center gap-[5px] rounded-[5px] border border-amber-border bg-amber-soft px-2 py-[3px]">
                  <DayStatusIndicator variant="inline" status="attention" label={STRINGS.needsReapproval} />
                </span>
              ) : null}
              <DialogPrimitive.Close
                className="rounded p-1 text-neutral-500 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-focus"
                aria-label={STRINGS.close}
              >
                <X size={16} aria-hidden />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-3">
            {epic === undefined ? (
              <div data-testid="drilldown-skeleton" className="space-y-2" aria-hidden>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-5 animate-skeleton rounded bg-border-faint" />
                ))}
              </div>
            ) : (
              <>
                {tickets.length === 0 ? (
                  <p className="text-sm text-neutral-700">{STRINGS.empty(epicKey, personName)}</p>
                ) : (
                  <ul className="space-y-1">
                    {tickets.map((t) => (
                      <li
                        key={t.ticketKey}
                        className="flex items-center gap-3 border-b border-border-hairline py-[9px]"
                      >
                        <span className="w-12 shrink-0 font-chrome text-xs tabular text-muted">
                          {t.date ?? ''}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-chrome text-xs tabular text-neutral-900">
                            {t.ticketKey}
                          </span>{' '}
                          <span className="text-[12.5px] text-neutral-700">{t.ticketSummary}</span>
                        </span>
                        <span className="shrink-0 font-chrome text-[12.5px] font-medium tabular text-foreground">
                          {secondsToFixedHoursDisplay(t.seconds)}
                        </span>
                        {/* AC11: the `●` text glyph is gone — a filled Circle
                         * via the registry, `aria-hidden`, with the visible
                         * word "changed" (AC7 — never colour/shape alone). */}
                        {t.changed ? (
                          <DayStatusIndicator
                            variant="inline"
                            status="attention"
                            size={11}
                            label={STRINGS.changed}
                            className="shrink-0"
                          />
                        ) : (
                          <span className="w-[11px] shrink-0" aria-hidden />
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {summary ? (
                  <p className="rounded-md bg-surface-sunk px-[10px] py-2 text-[12.5px] leading-[1.55] text-muted">
                    {summary}
                  </p>
                ) : null}

                {rowDirtyButEpicClean ? (
                  <p
                    className="rounded-md bg-surface-sunk px-[10px] py-2 text-[12.5px] leading-[1.55] text-muted"
                    data-testid="drilldown-other-epic-dirty-note"
                  >
                    {STRINGS.otherEpicDirty}
                  </p>
                ) : null}

                <VisibilityWarning
                  restrictedCount={epic.restrictedCount}
                  personName={personName}
                  epicKey={epicKey}
                />
              </>
            )}
          </div>

          {action ? (
            <div
              className="flex border-t border-border-faint bg-surface-sunk px-[18px] py-4"
              data-testid="drilldown-footer"
            >
              {/*
               * D-7.8-18 (OWNER, orchestrator-confirmed): NO secondary action.
               * The design's "Ask Anucha" (dc.html:602) is the escape hatch
               * for questioning a change rather than approving it — this
               * product has no messaging capability, so it cannot be built
               * literally, and both substitutes considered ("Open in Jira",
               * "Copy summary") were explicitly REJECTED by the owner as
               * plausible-looking replacements for a button the design put
               * there for a specific purpose. The primary spans the full
               * footer width. Do NOT add a secondary here without a new,
               * explicit decision — this absence is deliberate, not an
               * oversight.
               */}
              <ApproveButton
                personName={personName}
                user={action.reportAccountId}
                by={action.managerAccountId}
                cycle={cycle}
                cycleTitle={cycleTitle}
                epics={action.epics}
                rowSeconds={action.rowSeconds}
                restrictedCount={action.restrictedCount}
                mode={action.mode}
                priorApprovalAt={action.priorApprovalAt}
                disabledReason={action.disabledReason}
                // Finding 18: the primary spans the footer's full width —
                // D-7.8-18's stated compensation for the removed secondary,
                // now actually implemented rather than only commented.
                className="w-full"
                // The panel is opened for ONE Epic, but re-approving/approving
                // here is scoped to the WHOLE (user, cycle) — same as the
                // row's own button (`lib/approval.ts#approveCycle` fans out
                // across every touched Epic). The label is worded from the
                // ROW total (never per-Epic) so it cannot imply a
                // single-Epic approval (Task 8).
                triggerLabel={`${action.mode === 'reapprove' ? 'Re-approve' : 'Approve'} ${formatHours(action.rowSeconds)}h`}
              />
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
