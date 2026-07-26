import { useQueryClient } from '@tanstack/react-query';
import { addMonths, addWeeks, format, parse, parseISO, isValid } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApproveButton, formatHours } from './ApproveButton';
import { DrillDownPanel, type DrillDownAction } from './DrillDownPanel';
import { MatrixChromeHeader } from './MatrixChromeHeader';
import { DayStatusIndicator } from '@/components/shared/DayStatusIndicator';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCanApprove } from '@/hooks/useCanApprove';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEpicApprovals } from '@/hooks/useEpicApprovals';
import { useManagerReports } from '@/hooks/useManagerReports';
import { useManagerRow } from '@/hooks/useManagerRow';
import { currentCycleRange } from '@/lib/cycle-range';
import { formatCycleTitle } from '@/lib/cycle-title';
import { approvalAtFor } from '@/lib/dirty-detect';
import type { ReportCycleWorklogs, ReportEpicWorklogs } from '@/lib/jira-types';
import { log } from '@/lib/log';
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
import { sendRequest } from '@/lib/messages';
import { pctToWidthClass } from '@/lib/progress-width';
import type { DirectReport } from '@/lib/storage/direct-reports';
import { targetHoursItem } from '@/lib/storage/settings';
import type { CycleId } from '@/lib/storage/view-state';

const STRINGS = {
  personColHeader: 'Report',
  actionColHeader: 'Total · action',
  noReportsTitle: "You're not configured as anyone's manager in Jira.",
  noReportsCta: 'Switch to Worker view',
  noHours: '(no hours logged this cycle)',
  noHoursChip: 'no hours',
  rowErrorText: "Couldn't load",
  retry: 'Retry',
  connectTitle: 'Connect to Jira',
  connectBody: 'Your session expired. Reconnect to load the matrix.',
  connectCta: 'Connect to Jira',
  errorTitle: "Couldn't load your reports",
  errorBody: 'Check your connection and try again.',
  tryAgain: 'Try again',
  // Status copy (UX-DR30/31): honest, descriptive, no exclamation marks.
  // Story 7.6 / D-7.6-12: never "below target" — state the fact, not the
  // verdict.
  shortOfTarget: 'short of target',
  // Story 7.8 / Task 4: the dirty chip's inline word follows dc.html:572's
  // legend — a FACT ("edited after approval"), not the verdict "needs
  // re-approval" (which the aria-label still states, since that IS the
  // required action and screen-reader text has more room to be explicit).
  editedAfterApproval: 'edited after approval',
  hidden: 'hidden',
  approved: 'approved',
  restrictedChip: (n: number) => `${n} restricted`,
  restrictedChipTitle: 'Some worklogs in this row have restricted visibility you can’t see',
  streamingLine: (n: number, m: number) =>
    `Loading ${n} of ${m} reports — rows appear as Jira responds (rate-limited, ~600 cells).`,
  ariaApproved: (person: string, epicKey: string, hours: string) =>
    `${person}, ${epicKey}, ${hours} hours, approved`,
  ariaOnTarget: (person: string, epicKey: string, hours: string) =>
    `${person}, ${epicKey}, ${hours} hours, on target`,
  ariaGap: (person: string, epicKey: string, hours: string) =>
    `${person}, ${epicKey}, ${hours} hours, short of target`,
  ariaDirty: (person: string, epicKey: string, hours: string) =>
    `${person}, ${epicKey}, ${hours} hours, approved but worklogs changed, needs re-approval`,
  ariaNeutral: (person: string, epicKey: string, hours: string) =>
    `${person}, ${epicKey}, ${hours} hours`,
  ariaEmpty: (person: string, epicKey: string) => `${person}, ${epicKey}, no hours logged`,
  ariaRestrictedSuffix: ', restricted visibility',
  approveRemainingTitle: (n: number) => `Approve ${n} remaining ${n === 1 ? 'report' : 'reports'}?`,
  approveRemainingBodyLead: "You're approving",
  approveRemainingBodyTail: (n: number, cycleTitle: string) =>
    `across ${n} ${n === 1 ? 'report' : 'reports'} for the ${cycleTitle} cycle. Accounting uses this figure.`,
  approveRemainingCommit: (hours: string) => `Approve ${hours}h`,
  cancel: 'Cancel',
  noRemainingReports: 'No reports ready to approve',
  approvingRemaining: 'Approving…',
  // D-7.8-21: the Blocker's remaining half once D-7.8-20 removed the
  // truncation caveat — "Approve remaining" must never be LESS informed
  // than the per-row action it reuses, so it carries the SAME restricted-
  // visibility caveat, aggregated across the batch.
  approveRemainingRestrictedCaveat: (n: number) =>
    `${n} epic${n === 1 ? '' : 's'} across these reports ${n === 1 ? 'has' : 'have'} worklogs you can't see. Approving does not cover them.`,
  // Finding 9: a mid-batch failure must never be silent.
  approveRemainingPartial: (confirmed: number, total: number) =>
    `Approved ${confirmed} of ${total} reports — the rest could not be confirmed. Open "Approve remaining" again to retry.`,
};

/** Empty-cell glyph — mirrors `DayCell.tsx:96`'s local-constant pattern
 * (Story 7.8 / Task 4) rather than extracting a shared module for one
 * character. Distinct from `lib/manager-matrix.ts#EMPTY_CELL` (`'──'`), the
 * frozen SENTINEL `formatCellHours` returns for comparison — this is only
 * what gets RENDERED on the `isEmpty` branch. */
const EMPTY_CELL_GLYPH = '·';

/** Past this many Epic columns the data region scrolls; the person column stays. */
const SCROLL_COLUMN_THRESHOLD = 4;
/** Staggered-reveal step per row (the canonical Motion-table value, UX-DR7). */
const STAGGER_MS = 100;
/** Default per-workday target hours when the setting is unset (matches WeekView). */
const DEFAULT_TARGET_HOURS = 8;

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
 * Move `cycle` forward/back by `offset` cycles of the SAME cadence the id
 * already implies (monthly `yyyy-MM` vs weekly ISO-Monday `yyyy-MM-dd`) —
 * D-7.8-29: "Change cycle" moves between cycles of the CONFIGURED cadence and
 * must never change the cadence itself (that is a settings concern, Story
 * 7.10's surface).
 */
function offsetCycle(cycle: CycleId, offset: number): CycleId {
  if (offset === 0) return cycle;
  const monthly = /^\d{4}-\d{2}$/.test(cycle);
  if (monthly) {
    const ref = parse(cycle, 'yyyy-MM', new Date());
    return format(addMonths(isValid(ref) ? ref : new Date(), offset), 'yyyy-MM');
  }
  const ref = parseISO(cycle);
  return format(addWeeks(isValid(ref) ? ref : new Date(), offset), 'yyyy-MM-dd');
}

/** 24px initials avatar (dc.html:513): first letters of the first two words,
 * or the first two letters of a single-word name. */
function initialsFrom(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

type Props = {
  cycle: CycleId;
  /** Flip the popup to the Today/Worker view (no-reports fallback, AC 13). */
  onSwitchToToday: () => void;
};

/** Per-row state lifted to the parent (Story 7.8): drives the header's
 * "N need attention" count, the "Approve remaining" eligibility/canonicality
 * gate, and the drill-down panel's row-scoped action. */
type RowMeta = {
  anyDirty: boolean;
  disabledReason: string | undefined;
  /** Per-Epic resolved approval anchor for THIS row — the same map the row
   * itself uses for its own supersede line, lifted so the parent can derive
   * the drill-down panel's reason/priorApprovalAt without re-deriving. */
  cellAnchors: Map<string, string | null>;
};

export function ManagerMatrix({ cycle, onSwitchToToday }: Props): React.ReactElement {
  const reportsQuery = useManagerReports();
  // The current manager's accountId — the `by` field of every approval payload
  // (Story 5.6). Undefined until resolved / on error; the row's ApproveButton is
  // disabled until it is known.
  const currentUserQuery = useCurrentUser();
  const managerAccountId = currentUserQuery.data;

  const queryClient = useQueryClient();

  // Story 7.8 / D-7.8-29: "Change cycle" moves between cycles of the SAME
  // cadence the host-supplied `cycle` prop implies, entirely within this
  // component — `entrypoints/fullpage/App.tsx` and `ManagerView.tsx` are
  // outside this story's file list, so the nav state lives here rather than
  // being lifted to the host (the way `weekOf` was lifted for 7.7's
  // WeekChromeHeader). It never changes the configured cadence itself.
  const [cycleOffset, setCycleOffset] = useState(0);
  const effectiveCycle = useMemo(() => offsetCycle(cycle, cycleOffset), [cycle, cycleOffset]);
  const handlePrevCycle = useCallback(() => setCycleOffset((o) => o - 1), []);
  const handleNextCycle = useCallback(() => setCycleOffset((o) => o + 1), []);

  // The parent owns the cross-row column set because columns are the union of
  // every Epic any report touched. Each row lifts its resolved data up here.
  const [resolved, setResolved] = useState<Map<string, ReportCycleWorklogs>>(
    () => new Map(),
  );

  // Per-row "every touched-Epic cell resolves to approved" signal, lifted from
  // each row (derived from the SAME `useEpicApprovals` anchors the cells use).
  // Drives the "N of M approved" chip — server-state derived, not a local
  // approved flag flipped on the approve action.
  const [approvedRows, setApprovedRows] = useState<Map<string, boolean>>(
    () => new Map(),
  );

  // Story 7.8: dirty/disabled/anchor state per row, lifted for the header's
  // "N need attention" count, "Approve remaining"'s eligibility + canonicality
  // gate, and the drill-down panel's action.
  const [rowMeta, setRowMeta] = useState<Map<string, RowMeta>>(() => new Map());

  // Story 7.8 / AC4: which reports' `useManagerRow` query has SETTLED
  // (success OR error, not pending) — drives the streaming line's "N of M".
  const [settledRows, setSettledRows] = useState<Set<string>>(() => new Set());

  const handleApprovalState = useCallback((accountId: string, allApproved: boolean) => {
    setApprovedRows((prev) => {
      if (prev.get(accountId) === allApproved) return prev;
      const next = new Map(prev);
      next.set(accountId, allApproved);
      return next;
    });
  }, []);

  const handleRowMeta = useCallback((accountId: string, meta: RowMeta) => {
    setRowMeta((prev) => {
      const next = new Map(prev);
      next.set(accountId, meta);
      return next;
    });
  }, []);

  const handleSettled = useCallback((accountId: string) => {
    setSettledRows((prev) => (prev.has(accountId) ? prev : new Set(prev).add(accountId)));
  }, []);

  // The matrix owns ONE drill-down panel (Story 5.5). A cell click lifts its
  // target here; the panel reads the chosen Epic's already-resolved records
  // from the `resolved` map (no new fetch).
  const [selectedCell, setSelectedCell] = useState<{
    report: DirectReport;
    epicKey: string;
  } | null>(null);

  // The originating cell button, captured when the panel opens. Because the
  // panel is conditionally unmounted on close (not trigger-driven), Radix's
  // focus-return-to-trigger cannot run against the still-mounted tree — so we
  // restore focus to the clicked cell ourselves (AC 10).
  const triggerElementRef = useRef<HTMLElement | null>(null);

  const handleOpenCell = useCallback((report: DirectReport, epicKey: string) => {
    triggerElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedCell({ report, epicKey });
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedCell(null);
    const trigger = triggerElementRef.current;
    triggerElementRef.current = null;
    // Defer to the next frame so the focus restore lands after Radix has torn
    // down the (now unmounted) dialog focus scope.
    if (trigger) requestAnimationFrame(() => trigger.focus());
  }, []);

  // Finding 23 (Maintainability): the dedupe below used to compare `data`
  // by REFERENCE, which is sound only because `useManagerRow` (a plain
  // `useQuery`, no `select`) happens to get a stable reference from
  // TanStack's default structural sharing. That is an IMPLICIT invariant of
  // a hook this component doesn't own — a future `select` option there
  // would return a fresh object per call and silently defeat this dedupe,
  // reintroducing the exact unbounded render-loop a RED-proof already caught
  // during this story's own development (a mock object built fresh inside
  // `mockImplementation` OOM-crashed a vitest worker). Comparing a cheap
  // VALUE signature instead makes the dedupe correct regardless of what
  // `useManagerRow` does internally.
  const resolvedSignatures = useRef<Map<string, string>>(new Map());
  const handleResolved = useCallback(
    (accountId: string, data: ReportCycleWorklogs) => {
      const signature = JSON.stringify({
        restrictedCount: data.restrictedCount,
        epics: data.epics.map((e) => [e.epicKey, e.totalSeconds, e.restrictedCount, e.worklogs.length]),
      });
      if (resolvedSignatures.current.get(accountId) === signature) return;
      resolvedSignatures.current.set(accountId, signature);
      setResolved((prev) => {
        const next = new Map(prev);
        next.set(accountId, data);
        return next;
      });
    },
    [],
  );

  // Reset every cross-row derived signal when the EFFECTIVE cycle CHANGES
  // (cycle nav, or the host swapping the configured cadence) — otherwise a
  // stale cycle's resolved data / approvals / drill-down selection would
  // leak into the newly-selected cycle's render for one frame. Skips the
  // FIRST run (mount): effects commit child-before-parent, so on mount each
  // row's own `onResolved`/`onApprovalState`/`onRowMeta` effects fire before
  // this parent effect does — an unconditional reset here would wipe that
  // freshly-resolved data out from under the very same commit.
  const isFirstCycleEffect = useRef(true);
  useEffect(() => {
    if (isFirstCycleEffect.current) {
      isFirstCycleEffect.current = false;
      return;
    }
    setResolved(new Map());
    setApprovedRows(new Map());
    setRowMeta(new Map());
    setSettledRows(new Set());
    setSelectedCell(null);
  }, [effectiveCycle]);

  // Per-workday target (settings, default 8) and the local `today` (NOT UTC) for
  // the row-grain target comparison. Clock read once here; the pure status fns
  // receive `today`/`workdaysElapsed`/`targetHours` injected.
  const [targetHours, setTargetHours] = useState(DEFAULT_TARGET_HOURS);
  useEffect(() => {
    void targetHoursItem.getValue().then((v) => setTargetHours(v ?? DEFAULT_TARGET_HOURS));
  }, []);

  const [approveRemainingOpen, setApproveRemainingOpen] = useState(false);
  // Finding 22: re-entrancy guard — the confirm dialog closes the instant
  // "Approve remaining" is confirmed, but the header button stayed enabled
  // for the whole sequential in-flight loop, so a second click could open a
  // fresh dialog over a still-stale row set and start an overlapping batch.
  const [isApprovingRemaining, setIsApprovingRemaining] = useState(false);
  // Finding 9: a mid-batch failure must be visible, not silent.
  const [approveRemainingSummary, setApproveRemainingSummary] = useState<
    { confirmed: number; total: number } | null
  >(null);

  const reports = reportsQuery.data;

  // Sort the row set by display name (AC 9).
  const sortedReports = useMemo<DirectReport[]>(() => {
    if (!reports) return [];
    return [...reports].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [reports]);

  const range = useMemo(() => {
    // Anchor the range to the cycle id so it agrees with 5.4/5.6 checksums.
    const monthly = /^\d{4}-\d{2}$/.test(effectiveCycle);
    if (monthly) {
      const ref = parse(effectiveCycle, 'yyyy-MM', new Date());
      return currentCycleRange('calendar-month', isValid(ref) ? ref : new Date());
    }
    const ref = parseISO(effectiveCycle);
    return currentCycleRange('weekly', isValid(ref) ? ref : new Date());
  }, [effectiveCycle]);

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

  const cycleTitle = formatCycleTitle(effectiveCycle);

  // --- Reports-loading / error gates --------------------------------------

  if (reportsQuery.isPending) {
    return (
      <div className="overflow-hidden rounded-[10px] border border-border shadow-raised motion-safe:animate-fade-in">
        <MatrixChromeHeader
          cycleTitle={cycleTitle}
          onPrevCycle={handlePrevCycle}
          onNextCycle={handleNextCycle}
          onApproveRemaining={() => setApproveRemainingOpen(true)}
        />
        <div className="bg-background px-[26px] py-[22px]">
          <div data-testid="matrix-reports-skeleton" aria-hidden>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-6 animate-skeleton rounded bg-border-faint" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (reportsQuery.isError) {
    const kind = (reportsQuery.error as { kind: string }).kind;
    return (
      <div className="overflow-hidden rounded-[10px] border border-border shadow-raised motion-safe:animate-fade-in">
        <MatrixChromeHeader
          cycleTitle={cycleTitle}
          onPrevCycle={handlePrevCycle}
          onNextCycle={handleNextCycle}
          onApproveRemaining={() => setApproveRemainingOpen(true)}
        />
        <div className="bg-background px-[26px] py-[22px]">
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
      </div>
    );
  }

  // Defensive secondary fallback (AC 13): App.tsx already redirects a stale
  // manager-matrix view to Today, but if we somehow land here with no reports,
  // offer the switch.
  if (sortedReports.length === 0) {
    return (
      <div className="overflow-hidden rounded-[10px] border border-border shadow-raised motion-safe:animate-fade-in">
        <MatrixChromeHeader
          cycleTitle={cycleTitle}
          onPrevCycle={handlePrevCycle}
          onNextCycle={handleNextCycle}
          onApproveRemaining={() => setApproveRemainingOpen(true)}
        />
        <div className="bg-background px-[26px] py-[22px] text-center">
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

  // Resolve the chosen cell's Epic records for the panel (no fetch — read the
  // `resolved` map). `undefined` ⇒ the row hasn't resolved yet (defensive
  // skeleton, AC 12). A resolved row with no matching Epic ⇒ a synthetic empty
  // group so the panel shows the empty state (AC 6) rather than the skeleton.
  const selectedCycleData = selectedCell ? resolved.get(selectedCell.report.accountId) : undefined;
  const selectedEpic: ReportEpicWorklogs | undefined =
    selectedCell && selectedCycleData
      ? (selectedCycleData.epics.find((e) => e.epicKey === selectedCell.epicKey) ?? {
          epicKey: selectedCell.epicKey,
          epicSummary: '',
          totalSeconds: 0,
          restrictedCount: 0,
          worklogs: [],
        })
      : undefined;

  // Story 7.8: derive the drill-down panel's reason anchor + row-scoped
  // action from the SAME lifted state the header/eligibility use — never a
  // second fetch, never a re-derivation of what the row already resolved.
  const selectedRowMeta = selectedCell ? rowMeta.get(selectedCell.report.accountId) : undefined;
  const selectedApprovalAt: string | null =
    selectedCell && selectedRowMeta
      ? (selectedRowMeta.cellAnchors.get(selectedCell.epicKey) ?? null)
      : null;
  const selectedAllApproved = selectedCell
    ? (approvedRows.get(selectedCell.report.accountId) ?? false)
    : false;
  const selectedTouchedEpics =
    selectedCycleData?.epics.map((e) => ({ epicKey: e.epicKey, restrictedCount: e.restrictedCount })) ??
    [];
  const selectedRowSecondsForAction =
    selectedCycleData?.epics.reduce((sum, e) => sum + e.totalSeconds, 0) ?? 0;
  const selectedPriorApprovalAt = selectedRowMeta?.anyDirty
    ? selectedTouchedEpics
        .map((e) => selectedRowMeta.cellAnchors.get(e.epicKey))
        .find((at): at is string => typeof at === 'string' && at.length > 0)
    : undefined;
  const drillDownAction: DrillDownAction | undefined =
    selectedCell && managerAccountId !== undefined && selectedTouchedEpics.length > 0 && !selectedAllApproved
      ? {
          mode: selectedRowMeta?.anyDirty ? 'reapprove' : 'approve',
          reportAccountId: selectedCell.report.accountId,
          managerAccountId,
          epics: selectedTouchedEpics,
          rowSeconds: selectedRowSecondsForAction,
          restrictedCount: selectedCycleData?.restrictedCount ?? 0,
          disabledReason: selectedRowMeta?.disabledReason,
          priorApprovalAt: selectedPriorApprovalAt,
        }
      : undefined;

  // "N of M approved": N = rows whose every touched-Epic cell resolves to
  // approved (lifted from each row's cell anchors).
  const doneCount = sortedReports.reduce(
    (n, r) => n + (approvedRows.get(r.accountId) ? 1 : 0),
    0,
  );

  // "N need attention": rows with at least one dirty cell (D-7.8-30: rendered
  // white/opacity only on the chrome, never amber there).
  const needAttentionCount = sortedReports.reduce(
    (n, r) => n + (rowMeta.get(r.accountId)?.anyDirty ? 1 : 0),
    0,
  );

  // Streaming line (AC4): N = settled reports (success OR error), M = total.
  const settledCount = sortedReports.filter((r) => settledRows.has(r.accountId)).length;
  const totalReportCount = sortedReports.length;
  const stillStreaming = settledCount < totalReportCount;

  const isCurrentUserUnresolved = managerAccountId === undefined || managerAccountId === '';

  // "Approve remaining" (D-7.8-29/D-7.8-19e): the rows that are neither
  // approved nor dirty and are not canonicality-blocked — EXPERIENCE.md:153's
  // "batches the untouched ones behind a single confirm." Reuses the row
  // write path (`sendRequest('approve-cycle', …)`, the SAME wire contract
  // `ApproveButton` uses) sequentially per report — no second write path.
  // Finding 34: a row whose Epic groups sum to ZERO seconds is excluded too
  // (the pre-existing check only rejected an EMPTY `epics` array, not one
  // whose totals are all zero) — otherwise a zero-second-only batch reads
  // "Approve 0h".
  const remainingRows = sortedReports.filter((r) => {
    const data = resolved.get(r.accountId);
    if (!data || data.epics.length === 0) return false;
    const rowTotalSeconds = data.epics.reduce((s, e) => s + e.totalSeconds, 0);
    if (rowTotalSeconds === 0) return false;
    if (approvedRows.get(r.accountId)) return false;
    const meta = rowMeta.get(r.accountId);
    if (meta?.anyDirty) return false;
    if (meta?.disabledReason) return false;
    return true;
  });
  const remainingTotalSeconds = remainingRows.reduce((sum, r) => {
    const data = resolved.get(r.accountId);
    return sum + (data?.epics.reduce((s, e) => s + e.totalSeconds, 0) ?? 0);
  }, 0);
  // D-7.8-21: the aggregate restricted caveat — counts EPICS (mirroring
  // ApproveButton's own per-row `restrictedEpicCount`), not worklogs, summed
  // across every batched report so the caveat is never LESS informed than
  // the single-row action it reuses.
  const remainingRestrictedEpicsCount = remainingRows.reduce((sum, r) => {
    const data = resolved.get(r.accountId);
    return sum + (data?.epics.filter((e) => e.restrictedCount > 0).length ?? 0);
  }, 0);
  const approveRemainingDisabledReason: string | undefined = isCurrentUserUnresolved
    ? 'Resolving your account…'
    : isApprovingRemaining
      ? STRINGS.approvingRemaining
      : remainingRows.length === 0
        ? STRINGS.noRemainingReports
        : undefined;

  const handleConfirmApproveRemaining = async (): Promise<void> => {
    setApproveRemainingOpen(false);
    // Finding 9: re-assert the manager account is resolved at CLICK time,
    // not just at render time — `isCurrentUserUnresolved` only gates the
    // dialog trigger, so a current-user query invalidation while the dialog
    // was open could otherwise post every Epic in the batch with an empty
    // `by`, which `ApproveCycleRequestSchema` rejects for EVERY report —
    // the dialog would close as though it worked while approving nothing.
    if (isCurrentUserUnresolved) {
      log.error('approve-remaining.aborted', { reason: 'manager-account-unresolved' });
      return;
    }
    const by = managerAccountId as string;
    const rows = remainingRows;
    setIsApprovingRemaining(true);
    setApproveRemainingSummary(null);
    let confirmedReports = 0;
    let failedReports = 0;
    for (const r of rows) {
      const data = resolved.get(r.accountId);
      const epicsForFanout = (data?.epics ?? []).map((e) => ({
        epicKey: e.epicKey,
        restrictedCount: e.restrictedCount,
      }));
      if (epicsForFanout.length === 0) continue;
      const res = await sendRequest('approve-cycle', {
        user: r.accountId,
        cycle: effectiveCycle,
        by,
        epics: epicsForFanout,
      });
      // Finding 9: `sendRequest` returns `null` (never throws) on an absent
      // receiver / invalid payload / invalid response — `if (res)` alone
      // silently treated that as "nothing to do" rather than a failure.
      if (res) {
        for (const epicKey of res.confirmed) {
          void queryClient.invalidateQueries({ queryKey: ['epic-approvals', epicKey] });
        }
      }
      if (res && res.failed.length === 0) {
        confirmedReports += 1;
      } else {
        failedReports += 1;
      }
    }
    setIsApprovingRemaining(false);
    log.info('approve-remaining.settled', {
      confirmed: confirmedReports,
      failed: failedReports,
      total: rows.length,
    });
    if (failedReports > 0) {
      log.error('approve-remaining.partial', { confirmed: confirmedReports, failed: failedReports });
      setApproveRemainingSummary({ confirmed: confirmedReports, total: rows.length });
    }
  };

  return (
    <div className="overflow-hidden rounded-[10px] border border-border shadow-raised motion-safe:animate-fade-in">
      <MatrixChromeHeader
        cycleTitle={cycleTitle}
        reportCount={sortedReports.length}
        doneCount={doneCount}
        needAttentionCount={needAttentionCount}
        onPrevCycle={handlePrevCycle}
        onNextCycle={handleNextCycle}
        onApproveRemaining={() => setApproveRemainingOpen(true)}
        approveRemainingDisabledReason={approveRemainingDisabledReason}
      />
      {/* Finding 9: a mid-batch "Approve remaining" failure surfaces here —
       * never silent. Amber (never red, AC8): retryable, not refused. */}
      {approveRemainingSummary ? (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-amber-border bg-amber-soft px-[26px] py-2"
          data-testid="approve-remaining-summary"
        >
          <DayStatusIndicator
            variant="inline"
            status="attention"
            label={STRINGS.approveRemainingPartial(
              approveRemainingSummary.confirmed,
              approveRemainingSummary.total,
            )}
          />
        </div>
      ) : null}
      <div className="bg-background px-[26px] py-[22px]">
        <div
          className={`overflow-hidden rounded-lg border border-border bg-surface shadow-hairline ${scrolls ? 'overflow-x-auto' : ''}`}
          data-testid="matrix-scroll"
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunk">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-surface-sunk px-[14px] py-[11px] text-left font-chrome text-xs font-medium text-faint"
                >
                  {STRINGS.personColHeader}
                </th>
                {columns.map((epicKey) => (
                  <th
                    key={epicKey}
                    scope="col"
                    className="border-l border-border-faint px-2 py-[11px] text-right font-chrome tabular text-xs font-medium text-faint"
                  >
                    {epicKey}
                  </th>
                ))}
                <th
                  scope="col"
                  className="border-l border-border-faint px-3 py-[11px] text-right font-chrome text-xs font-medium text-faint"
                >
                  {STRINGS.actionColHeader}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedReports.map((report, i) => (
                <ManagerMatrixRow
                  key={report.accountId}
                  report={report}
                  cycle={effectiveCycle}
                  cycleTitle={cycleTitle}
                  range={range}
                  columns={columns}
                  revealIndex={i}
                  targetHours={targetHours}
                  workdaysElapsed={workdaysElapsed}
                  managerAccountId={managerAccountId}
                  onResolved={handleResolved}
                  onOpen={handleOpenCell}
                  onApprovalState={handleApprovalState}
                  onRowMeta={handleRowMeta}
                  onSettled={handleSettled}
                />
              ))}
            </tbody>
          </table>
          {/* AC4's streaming line — the named `role="status"` live region
           * (D-7.8-38: moved OFF `<tbody>`, which announced every row/cell
           * re-render). */}
          {stillStreaming ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-[10px] bg-surface-sunk px-[14px] py-[10px]"
            >
              <span className="text-xs text-faint">
                {STRINGS.streamingLine(settledCount, totalReportCount)}
              </span>
              <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-cell-border">
                <div
                  aria-hidden="true"
                  className={`h-full rounded-full bg-royal-purple ${pctToWidthClass(
                    totalReportCount > 0 ? (settledCount / totalReportCount) * 100 : 0,
                  )}`}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {selectedCell ? (
        <DrillDownPanel
          open
          onOpenChange={(next) => {
            if (!next) handleClosePanel();
          }}
          personName={selectedCell.report.displayName}
          epicKey={selectedCell.epicKey}
          cycle={effectiveCycle}
          epic={selectedEpic}
          approvalAt={selectedApprovalAt}
          action={drillDownAction}
        />
      ) : null}

      <Dialog open={approveRemainingOpen} onOpenChange={setApproveRemainingOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="font-chrome text-[16px] font-semibold">
              {STRINGS.approveRemainingTitle(remainingRows.length)}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted" data-testid="approve-remaining-dialog-body">
            {STRINGS.approveRemainingBodyLead}{' '}
            <span className="font-chrome font-medium tabular">
              {formatHours(remainingTotalSeconds)}h
            </span>{' '}
            {STRINGS.approveRemainingBodyTail(remainingRows.length, cycleTitle)}
          </p>
          {remainingRestrictedEpicsCount > 0 ? (
            // D-7.8-21 / Blocker Finding 1: the batch must never be LESS
            // informed than the single-row action it reuses — the per-row
            // ApproveButton dialog already carries this caveat.
            <div
              className="flex items-start gap-2 rounded-md border border-border bg-surface-sunk px-[10px] py-2"
              data-testid="approve-remaining-restricted-line"
            >
              <DayStatusIndicator
                variant="inline"
                status="restricted"
                label={STRINGS.approveRemainingRestrictedCaveat(remainingRestrictedEpicsCount)}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setApproveRemainingOpen(false)}>
              {STRINGS.cancel}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleConfirmApproveRemaining()}
              data-testid="approve-remaining-confirm"
            >
              {STRINGS.approveRemainingCommit(formatHours(remainingTotalSeconds))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type RowProps = {
  report: DirectReport;
  cycle: CycleId;
  cycleTitle: string;
  range: { start: Date; end: Date };
  columns: string[];
  revealIndex: number;
  targetHours: number;
  workdaysElapsed: number;
  /** The current manager's accountId (`by`); undefined until resolved. */
  managerAccountId: string | undefined;
  onResolved: (accountId: string, data: ReportCycleWorklogs) => void;
  onOpen: (report: DirectReport, epicKey: string) => void;
  /** Report this row's "every touched-Epic cell approved" signal to the parent. */
  onApprovalState: (accountId: string, allApproved: boolean) => void;
  /** Report this row's dirty/disabled/anchor state to the parent (Story 7.8). */
  onRowMeta: (accountId: string, meta: RowMeta) => void;
  /** Report that this row's query has settled (success OR error) — drives
   * the streaming line's "N of M" (Story 7.8, AC4). */
  onSettled: (accountId: string) => void;
};

function ManagerMatrixRow({
  report,
  cycle,
  cycleTitle,
  range,
  columns,
  revealIndex,
  targetHours,
  workdaysElapsed,
  managerAccountId,
  onResolved,
  onOpen,
  onApprovalState,
  onRowMeta,
  onSettled,
}: RowProps): React.ReactElement {
  const query = useManagerRow(report.accountId, cycle, range);

  // FR36 (Story 5.8): is the current user the report's CANONICAL manager? An
  // independent per-report verification — the row set being canonical-only today
  // is not relied upon, so Approve is correctly gated read-only the moment a
  // non-canonical report surfaces (broadened row set, or a mid-session `manager`
  // change). Fails closed to non-canonical on any error / absent manager.
  const canApproveQuery = useCanApprove(report.accountId, managerAccountId);

  // AC4: report settlement (success OR error, not pending) for the streaming
  // line — unconditional hook, above every early return.
  useEffect(() => {
    if (!query.isPending) onSettled(report.accountId);
  }, [query.isPending, report.accountId, onSettled]);

  // Lift resolved per-row data to the parent so it can derive the union columns.
  useEffect(() => {
    if (query.data) onResolved(report.accountId, query.data);
  }, [query.data, report.accountId, onResolved]);

  // Per-Epic cell status, lifted from each MatrixCell, so the row can decide
  // whether EVERY touched-Epic cell resolves to approved (the "done" signal for
  // the progress chip) and whether ANY cell is dirty (the re-approve signal)
  // without re-querying the approval anchors here.
  const [cellStatuses, setCellStatuses] = useState<Map<string, CellStatus>>(
    () => new Map(),
  );
  // Per-Epic resolved approval anchor (`at`), lifted alongside the status so the
  // row can thread the prior approval timestamp into the re-approve supersede
  // line. All dirty cells of one (user, cycle) share one anchor (newest-wins),
  // so any dirty cell's `approvalAt` is the correct prior `at`.
  const [cellAnchors, setCellAnchors] = useState<Map<string, string | null>>(
    () => new Map(),
  );
  const handleCellStatus = useCallback(
    (epicKey: string, status: CellStatus, approvalAt: string | null) => {
      setCellStatuses((prev) => {
        if (prev.get(epicKey) === status) return prev;
        const next = new Map(prev);
        next.set(epicKey, status);
        return next;
      });
      setCellAnchors((prev) => {
        if (prev.get(epicKey) === approvalAt) return prev;
        const next = new Map(prev);
        next.set(epicKey, approvalAt);
        return next;
      });
    },
    [],
  );

  // Canonicality gate (Story 5.8, AC8) — computed unconditionally and EARLY
  // (Story 7.8: it no longer depends on anything past the early returns, so
  // it can be lifted to the parent for "Approve remaining"'s eligibility).
  // OR the non-canonical reason into the existing precedence chain —
  // unresolved current-user (`'Resolving your account…'`) wins so a
  // transient load is never mislabeled a permission denial; then, while
  // canonicality is still loading, fail closed to that same resolving copy
  // (never enable Approve for a yet-unproven row); then the non-canonical
  // tooltip; else enabled (undefined).
  const isCurrentUserUnresolved =
    managerAccountId === undefined || managerAccountId === '';
  const canonicalManagerName = canApproveQuery.data?.canonicalManagerName ?? null;
  const nonCanonicalReason = `Only ${report.displayName}'s canonical manager (${
    canonicalManagerName ?? 'their manager'
  }) can approve their cycle. You can read but not approve here.`;
  const approveDisabledReason: string | undefined = isCurrentUserUnresolved
    ? 'Resolving your account…'
    : !canApproveQuery.isSuccess
      ? 'Resolving your account…'
      : canApproveQuery.data.isCanonical
        ? undefined
        : nonCanonicalReason;

  // The resolved Epic groups (empty until the row query settles). Computed ABOVE
  // the loading/error early returns so the approval-state effect below is an
  // unconditional hook (rules-of-hooks).
  const epics = query.data?.epics ?? [];

  // The fan-out target set (AC3): every Epic this report touched this cycle,
  // with the per-Epic restrictedCount the cell reported (checksum-covered).
  const touchedEpics = epics.map((e) => ({
    epicKey: e.epicKey,
    restrictedCount: e.restrictedCount,
  }));

  // A row is "done" when it has at least one touched Epic AND every touched-Epic
  // cell resolves to `approved` (derived from the cell statuses lifted above).
  const allApproved =
    touchedEpics.length > 0 &&
    touchedEpics.every((e) => cellStatuses.get(e.epicKey) === 'approved');
  useEffect(() => {
    onApprovalState(report.accountId, allApproved);
  }, [allApproved, report.accountId, onApprovalState]);

  // A row is dirty when ANY touched-Epic cell resolves to `dirty` (an existing
  // approval went stale). A dirty row shows "Re-approve" (secondary) instead of
  // "Approve" (primary); a row never shows both. (Story 5.7)
  const anyDirty = touchedEpics.some(
    (e) => cellStatuses.get(e.epicKey) === 'dirty',
  );

  // Story 7.8: report dirty/disabled/anchor state to the parent —
  // unconditional, above every early return.
  useEffect(() => {
    onRowMeta(report.accountId, { anyDirty, disabledReason: approveDisabledReason, cellAnchors });
  }, [anyDirty, approveDisabledReason, cellAnchors, report.accountId, onRowMeta]);

  // The prior approval anchor for the supersede line: any dirty cell's reported
  // `approvalAt` (they all share one by newest-wins). Undefined when no anchor
  // surfaced yet (race during stagger reveal) — the dialog falls back gracefully
  // and never blocks re-approval (Story 5.7 Dev Notes).
  const priorApprovalAt = anyDirty
    ? (touchedEpics
        .map((e) => cellAnchors.get(e.epicKey))
        .find((at): at is string => typeof at === 'string' && at.length > 0) ?? undefined)
    : undefined;

  // +1 for the trailing row-action (Approve) column so the pending/error/empty
  // single-cell states keep the table rectangular.
  const colSpan = Math.max(columns.length, 1) + 1;
  // Staggered reveal: ~100ms/row ease-out under motion-safe; static otherwise.
  const revealStyle = { animationDelay: `${revealIndex * STAGGER_MS}ms` };

  const restrictedCount = query.data?.restrictedCount ?? 0;
  // Row-grain total seconds — hoisted above the personHeader/early-return
  // split (Finding 33) so both `rowHasZeroHours` and the later row-status
  // computation read the SAME sum rather than two independently-computed
  // ones.
  const rowSeconds = epics.reduce((sum, e) => sum + e.totalSeconds, 0);
  // Story 7.8 / D-7.8-17: the row-grain "no hours" chip fires ONCE per row,
  // ONLY when this report logged zero hours anywhere in the entire cycle.
  // Finding 33: the ORIGINAL predicate (`touchedEpics.length === 0`) counted
  // Epic GROUPS, not seconds — a report with Epic groups that exist but sum
  // to zero (a real, tested data shape) did not trip the chip even though
  // D-7.8-17's own wording is "logged ZERO HOURS anywhere in the entire
  // cycle". Gate on the total instead. `query.isSuccess` still guards
  // against pending/error, where `epics` is `[]` by fallback, not by
  // genuine resolution.
  const rowHasZeroHours = query.isSuccess && rowSeconds === 0;

  const personHeader = (
    <th
      scope="row"
      className="sticky left-0 z-10 max-w-[220px] bg-surface px-[14px] py-[10px] text-left align-top font-normal text-neutral-900"
      title={report.displayName}
    >
      <span className="flex items-start gap-[9px]">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft font-chrome text-[11px] font-medium text-primary"
        >
          {initialsFrom(report.displayName)}
        </span>
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="flex items-center gap-1">
            <span className="truncate text-[13px]">{report.displayName}</span>
            {restrictedCount > 0 ? (
              <span
                className="inline-flex shrink-0 items-center gap-[5px] rounded-[5px] border border-border bg-chip-surface px-[7px] py-[3px]"
                title={STRINGS.restrictedChipTitle}
              >
                <DayStatusIndicator
                  variant="inline"
                  status="restricted"
                  size={11}
                  label={STRINGS.restrictedChip(restrictedCount)}
                  className="text-[10px] font-medium"
                />
              </span>
            ) : null}
          </span>
          {rowHasZeroHours && columns.length > 0 ? (
            // D-7.8-17: static (no `cursor:pointer`) — it doesn't drill down
            // to any one cell, so it is not interactive. Finding 33(b):
            // gated on `columns.length > 0` — when the WHOLE matrix has no
            // columns, the row falls through to the `columns.length === 0`
            // branch below, which already renders its own
            // "(no hours logged this cycle)" placeholder; without this
            // guard the same fact was stated twice in one row.
            <span className="inline-flex w-fit items-center gap-[5px] rounded-[5px] border border-dashed border-chip-dashed-border bg-surface px-[7px] py-[3px] font-chrome text-[11px] font-medium text-muted">
              {STRINGS.noHoursChip}
            </span>
          ) : null}
        </span>
      </span>
    </th>
  );

  if (query.isPending) {
    return (
      <tr className="border-b border-border-hairline" data-testid="matrix-skeleton-row">
        <th scope="row" className="sticky left-0 z-10 bg-surface px-[14px] py-[10px] text-left">
          <span className="flex items-center gap-[9px]" aria-hidden="true">
            <span className="h-6 w-6 shrink-0 animate-skeleton rounded-full bg-border-faint" />
            <span className="h-[11px] w-[110px] animate-skeleton rounded bg-border-faint" />
          </span>
        </th>
        <td colSpan={colSpan} className="px-2 py-[10px]">
          <div className="flex justify-end gap-2" aria-hidden="true">
            {Array.from({ length: Math.max(columns.length, 1) }).map((_, i) => (
              <span key={i} className="h-[11px] w-[38px] shrink-0 animate-skeleton rounded bg-border-faint" />
            ))}
          </div>
        </td>
      </tr>
    );
  }

  if (query.isError) {
    return (
      <tr className="border-b border-border-hairline">
        {personHeader}
        <td colSpan={colSpan} className="px-2 py-[10px]">
          <span className="inline-flex items-center gap-2 text-xs text-neutral-700">
            <span>{STRINGS.rowErrorText}</span>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-focus"
            >
              {STRINGS.retry}
            </button>
          </span>
        </td>
      </tr>
    );
  }

  // Row-grain on-target/gap status (AC 4): the report's TOTAL seconds across all
  // Epics vs `targetHours × workdaysElapsed`. Each non-empty cell inherits this;
  // the per-(report, Epic) approved/dirty states layer on top. `rowSeconds`
  // itself is hoisted above (Finding 33) so `rowHasZeroHours` reads the SAME sum.
  const rowStatus = computeRowStatus(rowSeconds, { targetHours, workdaysElapsed });

  // The row-end Total · action column (Task 5, dc.html:538-546). Disabled
  // while the manager accountId is still resolving (surfaced as a tooltip,
  // never mystery-disabled). D-7.8-32: a short row's shortfall is stated ONCE
  // here (amber, no fill/border, no red — AC8), never on all six cells.
  const approveCell = (
    <td className="border-l border-border-hairline px-3 py-[7px] align-middle">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          {rowStatus === 'gap' && !allApproved ? (
            <DayStatusIndicator variant="inline" status="attention" label={STRINGS.shortOfTarget} />
          ) : null}
          <span className="font-chrome text-[13px] font-semibold tabular">
            {formatHours(rowSeconds)}
          </span>
        </span>
        {allApproved ? (
          <DayStatusIndicator variant="inline" status="met" label={STRINGS.approved} />
        ) : (
          <ApproveButton
            personName={report.displayName}
            user={report.accountId}
            by={managerAccountId ?? ''}
            cycle={cycle}
            cycleTitle={cycleTitle}
            epics={touchedEpics}
            rowSeconds={rowSeconds}
            restrictedCount={restrictedCount}
            mode={anyDirty ? 'reapprove' : 'approve'}
            priorApprovalAt={priorApprovalAt}
            disabledReason={approveDisabledReason}
          />
        )}
      </div>
    </td>
  );

  // When the WHOLE matrix has no columns (nobody logged anything this cycle),
  // each row shows a single per-row "(no hours logged this cycle)" placeholder
  // (AC 14). When columns DO exist but this row logged nothing on them, it falls
  // through to render all-empty-glyph cells instead.
  if (columns.length === 0) {
    return (
      <tr
        className="border-b border-border-hairline motion-safe:animate-fade-in"
        style={revealStyle}
      >
        {personHeader}
        <td colSpan={1} className="px-2 py-[10px] text-xs text-neutral-500">
          {STRINGS.noHours}
        </td>
        {approveCell}
      </tr>
    );
  }

  return (
    <tr
      className="border-b border-border-hairline motion-safe:animate-fade-in"
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
          onOpen={onOpen}
          onStatus={handleCellStatus}
        />
      ))}
      {approveCell}
    </tr>
  );
}

type CellProps = {
  epicKey: string;
  epics: ReportEpicWorklogs[];
  report: DirectReport;
  cycle: CycleId;
  rowStatus: CellStatus;
  onOpen: (report: DirectReport, epicKey: string) => void;
  /**
   * Report this cell's resolved CellStatus AND its approval anchor up to the
   * row (progress chip + re-approve mode/supersede line, Story 5.7).
   */
  onStatus: (epicKey: string, status: CellStatus, approvalAt: string | null) => void;
};

/**
 * One `(report, Epic)` data cell. Fetches the Epic's approvals via
 * `useEpicApprovals` (one query per Epic key, deduped across rows by TanStack),
 * resolves this report's approval anchor, computes the `CellStatus`, and paints
 * it (Story 7.8, AC2/AC3): a CORRECT cell (`approved`/`on-target`/`gap`/
 * `unapproved-neutral`-with-hours) is a BARE `tabular` number — no fill, no
 * border, no icon, no label. Only `dirty` takes a chip. An empty cell is a
 * single `faint-decorative` middot. Restricted visibility is an independent
 * overlay chip that composes over ANY of the above (its own `#F4F4F7`
 * background never depends on what's behind it — D-7.8-26/AC9).
 */
function MatrixCell({
  epicKey,
  epics,
  report,
  cycle,
  rowStatus,
  onOpen,
  onStatus,
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

  // Report the resolved status AND anchor up so the row can derive its "all
  // approved" (done) and "any dirty" (re-approve) signals — plus the prior
  // approval `at` for the supersede line — from the SAME anchors the cell
  // paints with.
  useEffect(() => {
    onStatus(epicKey, status, approvalAt);
  }, [epicKey, status, approvalAt, onStatus]);

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

  return (
    <td className="border-l border-border-hairline p-0 text-right">
      {/* The cell is an interactive trigger that opens the drill-down panel
          (Story 5.5). It is a real <button> — keyboard-operable (Enter/Space)
          with a visible focus ring — and OWNS the accessible name so the cell
          is announced once (the <td> carries no aria-label, avoiding a double
          announcement). Empty cells are clickable too (→ empty state). */}
      <button
        type="button"
        onClick={() => onOpen(report, epicKey)}
        aria-label={ariaLabel}
        className="block w-full cursor-pointer px-2 py-[7px] text-right focus-visible:outline-none focus-visible:ring-focus"
      >
        <span className="flex items-center justify-end gap-1">
          {isEmpty ? (
            <span className="text-faint-decorative" aria-hidden="true">
              {EMPTY_CELL_GLYPH}
            </span>
          ) : status === 'dirty' ? (
            // dc.html:528 — filled Circle + hours, amber, ONE colour
            // (D-7.8-37: icon and text share `amber-ink`, per the spine's
            // `status-chip-dirty` recipe, not the mockup's two-colour split).
            <span className="inline-flex items-center gap-[5px] rounded-[5px] border border-amber-border bg-amber-soft px-[7px] py-[3px] shadow-hairline">
              <DayStatusIndicator
                variant="inline"
                status="attention"
                value={display}
                label={STRINGS.editedAfterApproval}
                className="text-[12.5px] font-medium tabular"
              />
            </span>
          ) : (
            // AC2 / D-7.8-25: the correct-cell arms (`approved`, `on-target`,
            // `gap`, `unapproved-neutral`-with-hours) are ALL a bare tabular
            // number now — no fill, no border, no icon, no label. `gap`'s
            // shortfall moved to the row total (D-7.8-32).
            <span className="tabular text-[13px] text-foreground">{display}</span>
          )}
          {locked ? (
            // dc.html:534 — its OWN `#F4F4F7`/border background, so it reads
            // at 4.81:1 regardless of the cell's own (now-bare) content.
            <span className="inline-flex shrink-0 items-center gap-[5px] rounded-[5px] border border-border bg-chip-surface px-[7px] py-[3px]">
              <DayStatusIndicator
                variant="inline"
                status="restricted"
                size={11}
                label={STRINGS.hidden}
                className="text-xs font-medium"
              />
            </span>
          ) : null}
        </span>
      </button>
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
    <div className="text-center">
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
