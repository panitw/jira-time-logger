import { format, parse, parseISO, isValid } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useManagerReports } from '@/hooks/useManagerReports';
import { useManagerRow } from '@/hooks/useManagerRow';
import { currentCycleRange } from '@/lib/cycle-range';
import type { ReportEpicWorklogs } from '@/lib/jira-types';
import {
  buildMatrixColumns,
  cellSeconds,
  formatCellHours,
  EMPTY_CELL,
  type MatrixRowInput,
} from '@/lib/manager-matrix';
import type { DirectReport } from '@/lib/storage/direct-reports';
import type { CycleId } from '@/lib/storage/view-state';

const STRINGS = {
  headingPrefix: 'Manager',
  reportCount: (n: number) => `${n} ${n === 1 ? 'report' : 'reports'}`,
  personColHeader: 'Person',
  noReportsTitle: "You're not configured as anyone's manager in Jira.",
  noReportsCta: 'Switch to Worker view',
  noHours: '(no hours logged this cycle)',
  rowErrorText: "Couldn't load",
  retry: 'Retry',
  connectTitle: 'Connect to Jira',
  connectBody: 'Your session expired. Reconnect to load the matrix.',
  connectCta: 'Connect to Jira',
  errorTitle: "Couldn't load your reports",
  errorBody: 'Check your connection and try again.',
  tryAgain: 'Try again',
};

/** Past this many Epic columns the data region scrolls; the person column stays. */
const SCROLL_COLUMN_THRESHOLD = 4;
/** Staggered-reveal step per row (the canonical Motion-table value, UX-DR7). */
const STAGGER_MS = 100;

function openOptions(): void {
  chrome.runtime.openOptionsPage();
}

/**
 * Cycle title from the `cycle` id: `"2026-05"` → `"May 2026"`; a weekly id
 * (`yyyy-MM-dd`) falls back to `"MMM d"`. Mirrors the `getCurrentCycleId` shapes.
 */
function formatCycleTitle(cycle: CycleId): string {
  const monthly = parse(cycle, 'yyyy-MM', new Date());
  if (isValid(monthly) && /^\d{4}-\d{2}$/.test(cycle)) {
    return format(monthly, 'MMMM yyyy');
  }
  const weekly = parseISO(cycle);
  if (isValid(weekly)) return format(weekly, 'MMM d');
  return cycle;
}

type Props = {
  cycle: CycleId;
  /** Flip the popup to the Today/Worker view (no-reports fallback, AC 13). */
  onSwitchToToday: () => void;
};

export function ManagerMatrix({ cycle, onSwitchToToday }: Props): React.ReactElement {
  const reportsQuery = useManagerReports();

  // The parent owns the cross-row column set because columns are the union of
  // every Epic any report touched. Each row lifts its resolved data up here.
  const [resolved, setResolved] = useState<Map<string, ReportEpicWorklogs[]>>(
    () => new Map(),
  );

  const handleResolved = useCallback(
    (accountId: string, epics: ReportEpicWorklogs[]) => {
      setResolved((prev) => {
        // Skip when the row reported the same data reference — guards against a
        // re-render storm if a row re-renders without new query data.
        if (prev.get(accountId) === epics) return prev;
        const next = new Map(prev);
        next.set(accountId, epics);
        return next;
      });
    },
    [],
  );

  const reports = reportsQuery.data;

  // Sort the row set by display name (AC 9).
  const sortedReports = useMemo<DirectReport[]>(() => {
    if (!reports) return [];
    return [...reports].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [reports]);

  const range = useMemo(() => {
    // Anchor the range to the cycle id so it agrees with 5.4/5.6 checksums.
    const monthly = /^\d{4}-\d{2}$/.test(cycle);
    if (monthly) {
      const ref = parse(cycle, 'yyyy-MM', new Date());
      return currentCycleRange('calendar-month', isValid(ref) ? ref : new Date());
    }
    const ref = parseISO(cycle);
    return currentCycleRange('weekly', isValid(ref) ? ref : new Date());
  }, [cycle]);

  const columns = useMemo(() => {
    const rows: MatrixRowInput[] = sortedReports.map((r) => ({
      accountId: r.accountId,
      epics: resolved.get(r.accountId) ?? [],
    }));
    return buildMatrixColumns(rows);
  }, [sortedReports, resolved]);

  const cycleTitle = formatCycleTitle(cycle);

  // --- Reports-loading / error gates --------------------------------------

  if (reportsQuery.isPending) {
    return (
      <div className="motion-safe:animate-fade-in">
        <Header cycleTitle={cycleTitle} />
        <div className="mt-3" data-testid="matrix-reports-skeleton" aria-hidden>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-6 rounded bg-neutral-100 motion-safe:animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (reportsQuery.isError) {
    const kind = (reportsQuery.error as { kind: string }).kind;
    return (
      <div className="motion-safe:animate-fade-in">
        <Header cycleTitle={cycleTitle} />
        {kind === 'auth-expired' ? (
          <FallbackState
            title={STRINGS.connectTitle}
            body={STRINGS.connectBody}
            ctaLabel={STRINGS.connectCta}
            onCta={openOptions}
          />
        ) : (
          <FallbackState
            title={STRINGS.errorTitle}
            body={STRINGS.errorBody}
            ctaLabel={STRINGS.tryAgain}
            onCta={() => void reportsQuery.refetch()}
          />
        )}
      </div>
    );
  }

  // Defensive secondary fallback (AC 13): App.tsx already redirects a stale
  // manager-matrix view to Today, but if we somehow land here with no reports,
  // offer the switch.
  if (sortedReports.length === 0) {
    return (
      <div className="motion-safe:animate-fade-in">
        <Header cycleTitle={cycleTitle} />
        <div className="mt-4 text-center">
          <p className="text-sm text-neutral-700">{STRINGS.noReportsTitle}</p>
          <div className="mt-3">
            <Button variant="secondary" onClick={onSwitchToToday}>
              {STRINGS.noReportsCta}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const scrolls = columns.length > SCROLL_COLUMN_THRESHOLD;

  return (
    <div className="motion-safe:animate-fade-in">
      <Header cycleTitle={cycleTitle} reportCount={sortedReports.length} />
      <div
        className={`mt-3 ${scrolls ? 'overflow-x-auto' : ''}`}
        data-testid="matrix-scroll"
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-white px-2 py-1 text-left text-xs font-medium text-neutral-500"
              >
                {STRINGS.personColHeader}
              </th>
              {columns.map((epicKey) => (
                <th
                  key={epicKey}
                  scope="col"
                  className="px-2 py-1 text-right font-mono text-xs font-medium text-neutral-500"
                >
                  {epicKey}
                </th>
              ))}
            </tr>
          </thead>
          <tbody aria-live="polite">
            {sortedReports.map((report, i) => (
              <ManagerMatrixRow
                key={report.accountId}
                report={report}
                cycle={cycle}
                range={range}
                columns={columns}
                revealIndex={i}
                onResolved={handleResolved}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Header({
  cycleTitle,
  reportCount,
}: {
  cycleTitle: string;
  reportCount?: number;
}): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold text-neutral-900">
        {STRINGS.headingPrefix} · {cycleTitle}
      </h2>
      {reportCount !== undefined ? (
        <span className="text-xs text-neutral-500">{STRINGS.reportCount(reportCount)}</span>
      ) : null}
    </div>
  );
}

type RowProps = {
  report: DirectReport;
  cycle: CycleId;
  range: { start: Date; end: Date };
  columns: string[];
  revealIndex: number;
  onResolved: (accountId: string, epics: ReportEpicWorklogs[]) => void;
};

function ManagerMatrixRow({
  report,
  cycle,
  range,
  columns,
  revealIndex,
  onResolved,
}: RowProps): React.ReactElement {
  const query = useManagerRow(report.accountId, cycle, range);

  // Lift resolved per-row data to the parent so it can derive the union columns.
  useEffect(() => {
    if (query.data) onResolved(report.accountId, query.data);
  }, [query.data, report.accountId, onResolved]);

  const colSpan = Math.max(columns.length, 1);
  // Staggered reveal: ~100ms/row ease-out under motion-safe; static otherwise.
  const revealStyle = { animationDelay: `${revealIndex * STAGGER_MS}ms` };

  const personHeader = (
    <th
      scope="row"
      className="sticky left-0 z-10 max-w-[140px] truncate bg-white px-2 py-1 text-left font-normal text-neutral-900"
      title={report.displayName}
    >
      {report.displayName}
    </th>
  );

  if (query.isPending) {
    return (
      <tr className="border-b border-neutral-100" data-testid="matrix-skeleton-row">
        {personHeader}
        <td colSpan={colSpan} className="px-2 py-1">
          <div
            className="h-4 rounded bg-neutral-100 motion-safe:animate-pulse"
            aria-hidden
          />
        </td>
      </tr>
    );
  }

  if (query.isError) {
    return (
      <tr className="border-b border-neutral-100">
        {personHeader}
        <td colSpan={colSpan} className="px-2 py-1">
          <span className="inline-flex items-center gap-2 text-xs text-neutral-700">
            <span>{STRINGS.rowErrorText}</span>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {STRINGS.retry}
            </button>
          </span>
        </td>
      </tr>
    );
  }

  const epics = query.data ?? [];

  // When the WHOLE matrix has no columns (nobody logged anything this cycle),
  // each row shows a single per-row "(no hours logged this cycle)" placeholder
  // (AC 14). When columns DO exist but this row logged nothing on them, it falls
  // through to render all-`──` cells instead.
  if (columns.length === 0) {
    return (
      <tr
        className="border-b border-neutral-100 motion-safe:animate-fade-in"
        style={revealStyle}
      >
        {personHeader}
        <td colSpan={1} className="px-2 py-1 text-xs text-neutral-500">
          {STRINGS.noHours}
        </td>
      </tr>
    );
  }

  return (
    <tr
      className="border-b border-neutral-100 motion-safe:animate-fade-in"
      style={revealStyle}
    >
      {personHeader}
      {columns.map((epicKey) => {
        const seconds = cellSeconds(epics, epicKey);
        const display = formatCellHours(seconds);
        // An em-dash cell means the report logged nothing on this Epic — say so
        // explicitly rather than announcing "0 hours" (which an AT user can't
        // distinguish from a genuine zero). Cells with hours use AC 4's format.
        const ariaLabel =
          display === EMPTY_CELL
            ? `${report.displayName}, ${epicKey}, no hours logged`
            : `${report.displayName}, ${epicKey}, ${display} hours`;
        return (
          <td
            key={epicKey}
            className="px-2 py-1 text-right font-mono text-neutral-900"
            aria-label={ariaLabel}
          >
            {display}
          </td>
        );
      })}
    </tr>
  );
}

function FallbackState({
  title,
  body,
  ctaLabel,
  onCta,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
}): React.ReactElement {
  return (
    <div className="mt-4 text-center">
      <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm text-neutral-500">{body}</p>
      <div className="mt-4">
        <Button variant="secondary" onClick={onCta}>
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
