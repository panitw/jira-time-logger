import { format, parse, parseISO, isValid } from 'date-fns';
import { Check, AlertCircle, RefreshCw, Lock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useEpicApprovals } from '@/hooks/useEpicApprovals';
import { useManagerReports } from '@/hooks/useManagerReports';
import { useManagerRow } from '@/hooks/useManagerRow';
import { currentCycleRange } from '@/lib/cycle-range';
import { approvalAtFor } from '@/lib/dirty-detect';
import type { ReportCycleWorklogs, ReportEpicWorklogs } from '@/lib/jira-types';
import {
  buildMatrixColumns,
  cellSeconds,
  formatCellHours,
  computeRowStatus,
  computeCellStatus,
  EMPTY_CELL,
  type CellStatus,
  type MatrixRowInput,
} from '@/lib/manager-matrix';
import type { DirectReport } from '@/lib/storage/direct-reports';
import { targetHoursItem } from '@/lib/storage/settings';
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
  // Status copy (UX-DR30/31): honest, descriptive, no exclamation marks.
  belowTarget: 'below target',
  needsReapproval: 'needs re-approval',
  approved: 'approved',
  onTarget: 'on target',
  restrictedCell: 'Some worklogs on this Epic have restricted visibility you can’t see',
  restrictedChip: (n: number) => `⚠ ${n} restricted`,
  restrictedChipTitle:
    'Some worklogs in this row have restricted visibility you can’t see',
  ariaApproved: (person: string, epicKey: string, hours: string) =>
    `${person}, ${epicKey}, ${hours} hours, approved`,
  ariaOnTarget: (person: string, epicKey: string, hours: string) =>
    `${person}, ${epicKey}, ${hours} hours, on target`,
  ariaGap: (person: string, epicKey: string, hours: string) =>
    `${person}, ${epicKey}, ${hours} hours, below target`,
  ariaDirty: (person: string, epicKey: string, hours: string) =>
    `${person}, ${epicKey}, ${hours} hours, approved but worklogs changed, needs re-approval`,
  ariaNeutral: (person: string, epicKey: string, hours: string) =>
    `${person}, ${epicKey}, ${hours} hours`,
  ariaEmpty: (person: string, epicKey: string) =>
    `${person}, ${epicKey}, no hours logged`,
  ariaRestrictedSuffix: ', restricted visibility',
};

/** Past this many Epic columns the data region scrolls; the person column stays. */
const SCROLL_COLUMN_THRESHOLD = 4;
/** Staggered-reveal step per row (the canonical Motion-table value, UX-DR7). */
const STAGGER_MS = 100;
/** lucide icon size for the cell status/lock icons (matches Story 4.2). */
const ICON_SIZE = 16;
/** Default per-workday target hours when the setting is unset (matches WeekView). */
const DEFAULT_TARGET_HOURS = 8;

/**
 * The diagonal-stripe overlay that gives the dirty (warning) state a non-color
 * signal (NFR12 / UX a11y: "yellow stripe uses diagonal lines, not just yellow
 * bg"). A low-contrast amber `repeating-linear-gradient` over
 * `bg-state-warning-subtle`, tuned so the `RefreshCw` icon and hours stay
 * legible. Kept in one place — no per-cell duplication.
 */
const DIRTY_STRIPE_STYLE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, transparent 0 6px, rgba(202,138,4,0.18) 6px 8px)',
};

/** Tailwind bg/text token pair per colored status (HYPHENATED `state-*`). */
const STATUS_CLASSES: Record<CellStatus, string> = {
  approved: 'bg-state-success text-white border border-state-success',
  'on-target': 'bg-state-success-subtle text-state-success',
  gap: 'bg-state-danger-subtle text-state-danger',
  dirty: 'bg-state-warning-subtle text-state-warning',
  'unapproved-neutral': 'text-neutral-900',
};

/**
 * Count past-or-today Mon–Fri workdays within `[start, min(today, end)]`. Used
 * for the row-grain target comparison (`targetHours × workdaysElapsed`). A pure
 * count over an injected window — the clock is read once at the component level
 * (`today`), never inside `lib/`.
 */
function workdaysElapsedInWindow(start: Date, end: Date, today: Date): number {
  const last = today < end ? today : end;
  if (last < start) return 0;
  let count = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  while (cursor <= lastDay) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

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
  const [resolved, setResolved] = useState<Map<string, ReportCycleWorklogs>>(
    () => new Map(),
  );

  const handleResolved = useCallback(
    (accountId: string, data: ReportCycleWorklogs) => {
      setResolved((prev) => {
        // Skip when the row reported the same data reference — guards against a
        // re-render storm if a row re-renders without new query data.
        if (prev.get(accountId) === data) return prev;
        const next = new Map(prev);
        next.set(accountId, data);
        return next;
      });
    },
    [],
  );

  // Per-workday target (settings, default 8) and the local `today` (NOT UTC) for
  // the row-grain target comparison. Clock read once here; the pure status fns
  // receive `today`/`workdaysElapsed`/`targetHours` injected.
  const [targetHours, setTargetHours] = useState(DEFAULT_TARGET_HOURS);
  useEffect(() => {
    void targetHoursItem.getValue().then((v) => setTargetHours(v ?? DEFAULT_TARGET_HOURS));
  }, []);

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
      epics: resolved.get(r.accountId)?.epics ?? [],
    }));
    return buildMatrixColumns(rows);
  }, [sortedReports, resolved]);

  // Past-or-today Mon–Fri count in the cycle window — injected into the pure
  // row-status fn. Memoized on the resolved range so it is stable per render.
  const workdaysElapsed = useMemo(
    () => workdaysElapsedInWindow(range.start, range.end, new Date()),
    [range],
  );

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
                targetHours={targetHours}
                workdaysElapsed={workdaysElapsed}
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
  targetHours: number;
  workdaysElapsed: number;
  onResolved: (accountId: string, data: ReportCycleWorklogs) => void;
};

function ManagerMatrixRow({
  report,
  cycle,
  range,
  columns,
  revealIndex,
  targetHours,
  workdaysElapsed,
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

  const restrictedCount = query.data?.restrictedCount ?? 0;
  const personHeader = (
    <th
      scope="row"
      className="sticky left-0 z-10 max-w-[160px] bg-white px-2 py-1 text-left font-normal text-neutral-900"
      title={report.displayName}
    >
      <span className="flex items-center gap-1">
        <span className="truncate">{report.displayName}</span>
        {restrictedCount > 0 ? (
          <span
            className="shrink-0 rounded bg-state-warning-subtle px-1 text-[10px] font-medium text-state-warning"
            title={STRINGS.restrictedChipTitle}
            aria-label={STRINGS.restrictedChipTitle}
          >
            {STRINGS.restrictedChip(restrictedCount)}
          </span>
        ) : null}
      </span>
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

  const epics = query.data?.epics ?? [];

  // Row-grain on-target/gap status (AC 4): the report's TOTAL seconds across all
  // Epics vs `targetHours × workdaysElapsed`. Each non-empty cell inherits this;
  // the per-(report, Epic) approved/dirty states layer on top.
  const rowSeconds = epics.reduce((sum, e) => sum + e.totalSeconds, 0);
  const rowStatus = computeRowStatus(rowSeconds, { targetHours, workdaysElapsed });

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
      {columns.map((epicKey) => (
        <MatrixCell
          key={epicKey}
          epicKey={epicKey}
          epics={epics}
          report={report}
          cycle={cycle}
          rowStatus={rowStatus}
        />
      ))}
    </tr>
  );
}

type CellProps = {
  epicKey: string;
  epics: ReportEpicWorklogs[];
  report: DirectReport;
  cycle: CycleId;
  rowStatus: CellStatus;
};

/**
 * One `(report, Epic)` data cell. Fetches the Epic's approvals via
 * `useEpicApprovals` (one query per Epic key, deduped across rows by TanStack),
 * resolves this report's approval anchor, computes the `CellStatus`, and paints
 * it with the AC-6 color token + lucide icon + aria-label + visible status text.
 * Color is NEVER the sole signal (NFR12). An approval-fetch failure for this
 * Epic degrades the cell to its worklog-only status (treated as unapproved); the
 * hours still render.
 */
function MatrixCell({
  epicKey,
  epics,
  report,
  cycle,
  rowStatus,
}: CellProps): React.ReactElement {
  const approvalsQuery = useEpicApprovals(epicKey, cycle);

  const seconds = cellSeconds(epics, epicKey);
  const display = formatCellHours(seconds);
  const isEmpty = display === EMPTY_CELL;

  // Resolve this report's approval anchor for the cell's (user, cycle). On a
  // failed approval fetch the list is empty → null anchor → unapproved.
  const approvals = approvalsQuery.data ?? [];
  const approvalAt = approvalAtFor(approvals, report.accountId, cycle);

  const status: CellStatus = isEmpty
    ? 'unapproved-neutral'
    : computeCellStatus({ epics, epicKey, approvalAt, rowStatus });

  const restricted =
    epics.find((e) => e.epicKey === epicKey)?.restrictedCount ?? 0;
  const locked = restricted > 0;

  const baseAria = isEmpty
    ? STRINGS.ariaEmpty(report.displayName, epicKey)
    : status === 'approved'
      ? STRINGS.ariaApproved(report.displayName, epicKey, display)
      : status === 'on-target'
        ? STRINGS.ariaOnTarget(report.displayName, epicKey, display)
        : status === 'gap'
          ? STRINGS.ariaGap(report.displayName, epicKey, display)
          : status === 'dirty'
            ? STRINGS.ariaDirty(report.displayName, epicKey, display)
            : STRINGS.ariaNeutral(report.displayName, epicKey, display);
  const ariaLabel = locked ? `${baseAria}${STRINGS.ariaRestrictedSuffix}` : baseAria;

  const statusText =
    status === 'gap'
      ? STRINGS.belowTarget
      : status === 'dirty'
        ? STRINGS.needsReapproval
        : null;

  const cellStyle = status === 'dirty' ? DIRTY_STRIPE_STYLE : undefined;

  return (
    <td
      className={`relative px-2 py-1 text-right font-mono motion-safe:transition-colors motion-safe:duration-200 ${STATUS_CLASSES[status]}`}
      style={cellStyle}
      aria-label={ariaLabel}
    >
      <span className="flex items-center justify-end gap-1">
        {status === 'approved' || status === 'on-target' ? (
          <Check size={ICON_SIZE} aria-hidden />
        ) : status === 'gap' ? (
          <AlertCircle size={ICON_SIZE} aria-hidden />
        ) : status === 'dirty' ? (
          <RefreshCw size={ICON_SIZE} aria-hidden />
        ) : null}
        <span className={isEmpty ? 'text-neutral-500' : undefined}>{display}</span>
        {locked ? (
          <span
            className="inline-flex shrink-0 text-neutral-500"
            title={STRINGS.restrictedCell}
            aria-label={STRINGS.restrictedCell}
            role="img"
          >
            <Lock size={ICON_SIZE} aria-hidden />
          </span>
        ) : null}
      </span>
      {statusText ? (
        <span className="block text-[10px] leading-tight">{statusText}</span>
      ) : null}
    </td>
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
