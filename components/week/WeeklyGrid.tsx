import { useMutation } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DayStatusIndicator } from '@/components/shared/DayStatusIndicator';
import { Button } from '@/components/ui/button';
import { AddSubtaskRow } from '@/components/week/AddSubtaskRow';
import { DayCell } from '@/components/week/DayCell';
import { PtoPopover } from '@/components/week/PtoPopover';
import { dayStatusNote, isWeekend } from '@/lib/day-status';
import { hoursToSeconds, secondsToCellDisplay } from '@/lib/hours';
import { deleteWorklog } from '@/lib/jira-client';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import type { FullPageSection } from '@/lib/open-full-page';
import { enqueue as enqueueOutbox } from '@/lib/storage/outbox';
import type { ISODate } from '@/lib/storage/view-state';
import {
  DAYS_PER_WEEK,
  type DayStatus,
  type WeekGrid,
  type WeekGridCell,
  type WeekGridRow,
} from '@/lib/week-grid';
import { todayDateString } from '@/lib/worklog-date';

const STRINGS = {
  dayHeadersShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  dayNamesLong: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ],
  subtaskColHeader: 'Subtask',
  totalsRowLabel: 'Daily totals',
  addSubtask: '+ Add a subtask to this week',
  rowActions: (key: string) => `Row actions for ${key}`,
  rowActionsMenu: 'Row actions',
  removeFromWeek: 'Remove from week',
  cancel: 'Cancel',
  remove: 'Remove',
  removeConfirm: (key: string) => `Remove all entries for ${key}?`,
};

type Props = {
  grid: WeekGrid;
  /** Per-day status (index 0 = Monday); `null` at an index (or the array
   * itself omitted) → that day's total renders as a bare number, no
   * `DayStatusIndicator` (D-7.6-35's "future workday, no status yet"). */
  dayStatuses?: (DayStatus | null)[];
  /** Configured PTO subtask key (`null`/blank → PTO popover buttons disabled). */
  ptoSubtaskKey?: string | null;
  /** Daily target hours (full-day PTO posts this; half posts half). */
  targetHours?: number;
  /** Local `YYYY-MM-DD` "today", for the totals row's plain-language notes
   * (`dayStatusNote`'s today/past distinction, D-7.6-35). Defaults to the
   * real local today when omitted — this is presentational wording only,
   * never the status derivation itself (that already happened upstream in
   * `computeDayStatuses`). */
  today?: ISODate;
  /** Invalidate the week query after a successful cell/row mutation (AC #8). */
  onMutated?: () => void;
  /** Finding 9: threaded through to `PtoPopover`'s "Configure in Settings"
   * link so it switches the full page's section in place, rather than
   * calling `chrome.runtime.openOptionsPage()` (which post-D-7.10-39 opens a
   * duplicate tab). Optional (falls back to a no-op) so this component's
   * own test suite — which never exercises that link — doesn't need to
   * thread a prop through every one of its many call sites; every
   * PRODUCTION call site (`WeekView.tsx`) passes it. */
  onSectionChange?: (section: FullPageSection) => void;
};

// Story 7.7: `weekOf`/`isMarkedDone`/`onMarkedDone` are GONE from this
// component's props. The "Mark week as done" CTA (Story 4.5) used to render
// at the bottom of this grid; AC2 now puts it in `WeekChromeHeader`
// (mounted by `WeekView`), and the product must never ship two — see the
// Dev Notes "Files" section. `MarkAsDoneButton`/`GapAcknowledgmentDialog`
// themselves are unchanged in behaviour, only relocated.

/** A locally-added subtask row (Story 4.1) — all-`──` cells, no worklog posted. */
type LocalRow = { key: string; summary: string };

/** `Mon D` label for a day-header, e.g. `2026-05-15` → `May 15`. */
function formatDayLabel(dayISO: string): string {
  if (!dayISO) return '';
  return format(parseISO(dayISO), 'MMM d');
}

function emptyCell(): WeekGridCell {
  return { seconds: 0, worklogs: [] };
}

function emptyCells(): WeekGridCell[] {
  return Array.from({ length: DAYS_PER_WEEK }, emptyCell);
}

/**
 * One per-day totals cell (Story 7.6: unified onto the shared day-status
 * vocabulary — replaces the old hard-coded `STATUS_CLASSES`/`Check`/
 * `AlertCircle` map). `status === null` (no status yet — a future workday,
 * D-7.6-35) renders a bare `tabular` number: correct/no-status → plain
 * number, exception → `DayStatusIndicator`, no third path (D-7.6-3).
 *
 * Story 7.7, AC6/Task 2: `variant="stacked"` — value + target + status icon
 * on line one, the 3px progress bar on line two, the plain-language note on
 * line three (`DayStatusIndicator`'s totals-cell anatomy, D-7.6-3's frozen
 * contract). `size={11}` is the totals-row glyph D-7.7-30/17 added the prop
 * for. The weekend column's tint reaches this cell too (D-7.7-31) — the
 * THIRD of the three levels ("one recessive object"), alongside the header
 * and the body `<td>` (already correct in `DayCell.tsx`).
 */
function TotalsCell({
  seconds,
  status,
  dayName,
  iso,
  today,
  targetHours,
  timeOffSeconds,
}: {
  seconds: number;
  status: DayStatus | null;
  dayName: string;
  iso: ISODate;
  today: ISODate;
  targetHours: number;
  timeOffSeconds: number;
}): React.ReactElement {
  const total = secondsToCellDisplay(seconds);
  const weekendTint = isWeekend(iso) ? 'bg-weekend' : '';

  if (!status) {
    return (
      <td
        className={`px-1 py-1 text-right tabular text-xs motion-safe:transition-colors motion-safe:duration-200 ${weekendTint}`}
      >
        {total}
      </td>
    );
  }

  const targetSeconds = hoursToSeconds(targetHours);
  const note = dayStatusNote({
    status,
    loggedSeconds: seconds,
    timeOffSeconds,
    targetSeconds,
    iso,
    today,
  });
  // `weekend` carries no target of its own (D-7.6-6 — "no status of its
  // own"), so the design omits the "/ Xh" suffix for it entirely
  // (`imports/jira-time-logger.dc.html:817`'s `total("0", "", ...)`).
  const value = status === 'weekend' ? total : `${total} / ${targetHours}h`;
  const pct = targetSeconds > 0 ? (seconds / targetSeconds) * 100 : 0;

  return (
    <td
      // Finding 14: `tabular text-xs` restored on this branch's `<td>` — the
      // `null` branch above kept it, but the status branch dropped both,
      // leaving one totals ROW rendering at two font sizes (the indicator's
      // own inner `tabular` value span still lines up the digits, but the
      // cell itself, and the multi-word note sharing its narrow column,
      // inherited the larger body size).
      className={`px-1 py-1 text-right tabular text-xs motion-safe:transition-colors motion-safe:duration-200 ${weekendTint}`}
      // Finding 21: include the figure, not just the note — several notes
      // (`Weekend`, `Target met`, `Full-day time off`) contain
      // no digits of their own, so a screen reader announcing only
      // `${dayName}, ${note}` on THOSE statuses dropped the hours entirely
      // (a real regression from the pre-story `neutral` days, which carried
      // no `aria-label` at all and so left the visible `total` text as the
      // accessible name).
      aria-label={`${dayName}, ${total}, ${note}`}
    >
      <DayStatusIndicator
        variant="stacked"
        status={status}
        value={value}
        percent={pct}
        size={11}
        note={note}
      />
    </td>
  );
}

/**
 * The `⋯` row-actions menu + `Remove from week` (AC #6), using the Story 2.6
 * native inline-popover pattern (triggerRef/popoverRef/firstActionRef,
 * capture-phase Esc, pointerdown click-outside, focus-first/restore-trigger,
 * `role="menu"`/`menuitem`). NOT Radix.
 *
 * - Empty row (`rowTotalSeconds === 0`) → `onRemoveLocal` (hide locally; no network).
 * - Row with hours → inline confirm chip → delete every in-range worklog id
 *   (one `deleteWorklog` each; transient failures enqueue), then `onMutated`.
 */
function RowActions({
  row,
  onRemoveLocal,
  onMutated,
}: {
  row: WeekGridRow;
  onRemoveLocal: () => void;
  onMutated?: () => void;
}): React.ReactElement {
  type Mode = 'idle' | 'menu' | 'confirming';
  const [mode, setMode] = useState<Mode>('idle');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const confirmRemoveRef = useRef<HTMLButtonElement>(null);

  const hasHours = row.rowTotalSeconds > 0;

  const closeMenu = useCallback((restoreFocus = true) => {
    setMode('idle');
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (mode === 'menu') firstActionRef.current?.focus();
    if (mode === 'confirming') confirmRemoveRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode !== 'menu' && mode !== 'confirming') return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenu();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    if (mode !== 'menu') {
      return () => document.removeEventListener('keydown', onKeyDown, true);
    }
    const onPointerDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      closeMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [mode, closeMenu]);

  const removeMutation = useMutation({
    mutationFn: async () => {
      const ids = row.cells.flatMap((c) => c.worklogs.map((w) => w.id));
      let anyOk = false;
      for (const id of ids) {
        const result = await deleteWorklog(row.key, id);
        if (result.kind === 'ok') {
          anyOk = true;
        } else if (result.kind === 'network' || result.kind === 'rate-limited') {
          void enqueueOutbox({
            kind: 'delete',
            endpoint: `rest/api/3/issue/${encodeURIComponent(row.key)}/worklog/${encodeURIComponent(id)}`,
            issueKey: row.key,
            worklogId: id,
          }).catch((e) => log.error('outbox.enqueue.failed', { key: row.key, cause: String(e) }));
        } else {
          log.warn('week.row.remove.failed', { key: row.key, kind: result.kind });
        }
      }
      return { anyOk };
    },
    onSuccess: ({ anyOk }) => {
      if (anyOk) {
        void sendMessage('badge-update', { hoursMissing: 0 });
      }
      setMode('idle');
      onMutated?.();
    },
    onError: (e) => {
      log.error('week.row.remove.error', { key: row.key, error: String(e) });
      setMode('idle');
    },
  });

  const handleRemove = useCallback(() => {
    if (!hasHours) {
      setMode('idle');
      onRemoveLocal();
      return;
    }
    setMode('confirming');
  }, [hasHours, onRemoveLocal]);

  return (
    <span className="relative inline-flex">
      {mode === 'confirming' ? (
        <span className="flex items-center gap-1" role="group" aria-label={STRINGS.removeConfirm(row.key)}>
          <span className="text-[10px] text-neutral-700">{STRINGS.removeConfirm(row.key)}</span>
          <Button variant="secondary" size="sm" onClick={() => closeMenu()} disabled={removeMutation.isPending}>
            {STRINGS.cancel}
          </Button>
          {/* Not an AC4 refused-write survivor — this is the destructive-
              action-confirm convention (same category as the delete button
              in LoggedToday.tsx), not a status report about a write Jira
              rejected. AC1's time-related scope doesn't apply either. */}
          <Button
            ref={confirmRemoveRef}
            variant="ghost"
            size="sm"
            className="text-state-danger"
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
          >
            {STRINGS.remove}
          </Button>
        </span>
      ) : (
        <>
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={mode === 'menu'}
            aria-label={STRINGS.rowActions(row.key)}
            onClick={() => setMode((prev) => (prev === 'menu' ? 'idle' : 'menu'))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
          {mode === 'menu' && (
            <div
              ref={popoverRef}
              role="menu"
              aria-label={STRINGS.rowActionsMenu}
              className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-neutral-200 bg-white p-1 shadow-md"
            >
              <Button
                ref={firstActionRef}
                variant="ghost"
                size="sm"
                role="menuitem"
                className="w-full justify-start text-neutral-700"
                onClick={handleRemove}
              >
                {STRINGS.removeFromWeek}
              </Button>
            </div>
          )}
        </>
      )}
    </span>
  );
}

export function WeeklyGrid({
  grid,
  dayStatuses,
  ptoSubtaskKey = null,
  targetHours = 8,
  today = todayDateString(),
  onMutated,
  onSectionChange = () => {},
}: Props): React.ReactElement {
  const [localRows, setLocalRows] = useState<LocalRow[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  // `picking` carries the target day (from a header "Add a worklog…") so the
  // picked ticket's cell for THAT day can be opened for hours entry. `true`
  // (no day) = the plain "+ Add a subtask" affordance (4.1/4.3 behavior).
  const [picking, setPicking] = useState<{ dayIndex: number } | boolean>(false);
  const rowHeaderRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const cellEditRefs = useRef<Map<string, () => void>>(new Map());
  // Story 7.7, AC5/D-7.7-33: a sibling registry (same `${rowKey}-${dayIndex}`
  // key shape as `cellEditRefs`) exposing each cell's "focus me" action, so
  // `⏎` can move focus to the SAME day's cell in the NEXT row. The target
  // cell's button is already mounted in the DOM at keypress time (nothing
  // about committing THIS cell adds/removes sibling rows synchronously — a
  // refetch that could re-sort rows only lands later, asynchronously), so
  // the lookup and the `.focus()` call both happen synchronously, in the
  // SAME tick as `⏎` — deliberately NOT the double-`requestAnimationFrame`
  // pattern `deferred-work.md` already flags as fragile (Story 4.4).
  const cellFocusRefs = useRef<Map<string, () => void>>(new Map());
  // Holds the CURRENT render's row order, written in a `useLayoutEffect`
  // below (Finding 10: was written directly in the render body, which is a
  // documented React violation — an abandoned/thrown-away render under
  // concurrent rendering still performs the write) so `focusNextRowCell`
  // always resolves "next row" against up-to-date data. `useLayoutEffect`
  // runs synchronously after commit and before the browser paints or any
  // user event can fire, so the ref is still populated before `⏎` could
  // possibly read it — same guarantee as before, without the render-phase
  // side effect.
  const allRowsRef = useRef<WeekGridRow[]>([]);

  const existingKeys = new Set(grid.rows.map((r) => r.key));

  // Per-day time-off seconds (D-7.6-9/38): summed from already-categorized
  // `pto` rows so the totals cell's note can tell a half-day from a full one
  // — presentational aggregation over the view model, not new business
  // logic (categorization already happened in `buildWeekGrid`).
  const timeOffSecondsByDay = useMemo(() => {
    const totals = new Array<number>(DAYS_PER_WEEK).fill(0);
    for (const r of grid.rows) {
      if (r.category !== 'pto') continue;
      for (let i = 0; i < DAYS_PER_WEEK; i++) {
        totals[i] = (totals[i] ?? 0) + (r.cellsSeconds[i] ?? 0);
      }
    }
    return totals;
  }, [grid.rows]);

  const focusRowHeader = useCallback((key: string): void => {
    // Defer to the next frame so a freshly-rendered header is mounted.
    requestAnimationFrame(() => rowHeaderRefs.current.get(key)?.focus());
  }, []);

  // Story 7.7, D-7.7-33: `⏎` commits the current cell then moves focus to
  // the SAME day's cell in the NEXT row, resolved from `allRows`' order AT
  // THE MOMENT `⏎` was pressed (this callback closes over the `allRows`
  // computed for the CURRENT render — synchronous, not re-derived after any
  // later refetch/re-sort). Last row: no-op — commits and stays put, never
  // wraps, never throws.
  const focusNextRowCell = useCallback(
    (rowKey: string, dayIndex: number): void => {
      const idx = allRowsRef.current.findIndex((r) => r.key === rowKey);
      if (idx < 0) return;
      const nextRow = allRowsRef.current[idx + 1];
      if (!nextRow) return;
      cellFocusRefs.current.get(`${nextRow.key}-${dayIndex}`)?.();
    },
    [],
  );

  const handlePick = useCallback(
    (ticketKey: string, ticketSummary: string): void => {
      log.info('week.add-subtask.picked', { key: ticketKey });
      // Day-scoped pick (header "Add a worklog…") targets that day's cell so the
      // existing DayCell POST dates the worklog to grid.days[dayIndex] (AC #5).
      const dayScoped =
        typeof picking === 'object' && picking !== null ? picking.dayIndex : null;
      setLocalRows((prev) => {
        if (existingKeys.has(ticketKey) || prev.some((r) => r.key === ticketKey)) {
          // Already a row — do not add a duplicate; jump focus to it (AC #5).
          focusRowHeader(ticketKey);
          return prev;
        }
        return [...prev, { key: ticketKey, summary: ticketSummary }];
      });
      setPicking(false);
      if (dayScoped !== null) {
        // Defer to the next frame so the (possibly freshly-added) cell mounts,
        // then open its editor — the DayCell POST flow dates it to that day.
        requestAnimationFrame(() => {
          requestAnimationFrame(() =>
            cellEditRefs.current.get(`${ticketKey}-${dayScoped}`)?.(),
          );
        });
      }
    },
    // existingKeys is derived from props each render; depending on grid.rows is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid.rows, focusRowHeader, picking],
  );

  const handleRemoveLocal = useCallback((key: string): void => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    // Also drop it from local rows so a re-pick can re-add it.
    setLocalRows((prev) => prev.filter((r) => r.key !== key));
  }, []);

  // Local rows render as all-`──` rows for the rest of this popup session.
  // Reconcile against the live grid rows each render: if a locally-added key
  // later arrives via a refetch (e.g. a worklog was posted to it elsewhere),
  // drop the local placeholder so the row is not rendered twice (duplicate
  // React keys / phantom empty row).
  const localGridRows: WeekGridRow[] = localRows
    .filter((r) => !existingKeys.has(r.key))
    .map((r) => ({
      key: r.key,
      summary: r.summary,
      category: 'task',
      cells: emptyCells(),
      cellsSeconds: new Array<number>(DAYS_PER_WEEK).fill(0),
      rowTotalSeconds: 0,
    }));
  const allRows = [...grid.rows, ...localGridRows].filter(
    (r) => !hiddenKeys.has(r.key),
  );
  // What the user can actually SEE as a row right now — the predicate behind
  // the picker's "already in week" label. Deliberately `allRows`, not
  // `existingKeys` (server rows only): a row added locally this session, or
  // one removed via "Remove from week", is present/absent on screen well
  // before a refetch agrees, and the label has to match the screen.
  const visibleKeys = new Set(allRows.map((r) => r.key));
  // Finding 10: moved out of the render body into a layout effect — see
  // `allRowsRef`'s own comment above for why.
  useLayoutEffect(() => {
    allRowsRef.current = allRows;
  });

  return (
    <div>
      {/* Story 7.7, D-7.7-23: seven fixed 104px day columns + a flexing
       * subtask column, matching the design source's own
       * `1fr repeat(7,104px)` (`imports/jira-time-logger.dc.html:373,384,397`)
       * — the ONE value taken from the mockup's CSS-Grid layout; the
       * element itself stays a `<table>` (the AC/a11y spine wins on
       * structure, SD-6). `table-fixed` makes the widths load-bearing —
       * without it a long subtask summary can still push the day columns. */}
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col />
          <col span={DAYS_PER_WEEK} className="w-[104px]" />
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="px-1 py-1 text-left text-xs font-medium text-neutral-500"
            >
              {STRINGS.subtaskColHeader}
            </th>
            {STRINGS.dayHeadersShort.map((label, i) => {
              const dayISO = grid.days[i] ?? '';
              const dayLabel = formatDayLabel(dayISO);
              const weekend = isWeekend(dayISO);
              return (
                <th
                  key={label}
                  scope="col"
                  className={`px-1 py-1 text-right text-xs font-medium text-neutral-500 ${weekend ? 'bg-weekend' : ''}`}
                >
                  <PtoPopover
                    dayIndex={i}
                    dayName={STRINGS.dayNamesLong[i] ?? label}
                    dayLabel={dayLabel}
                    dayISO={dayISO}
                    loggedSeconds={grid.dayTotalsSeconds[i] ?? 0}
                    ptoSubtaskKey={ptoSubtaskKey}
                    targetHours={targetHours}
                    onAddWorklog={() => setPicking({ dayIndex: i })}
                    onSectionChange={onSectionChange}
                    weekend={weekend}
                    {...(onMutated ? { onMutated } : {})}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {allRows.map((row) => (
            <tr key={row.key} className="group border-b border-neutral-100">
              <th
                ref={(el) => {
                  if (el) rowHeaderRefs.current.set(row.key, el);
                  else rowHeaderRefs.current.delete(row.key);
                }}
                scope="row"
                tabIndex={-1}
                // D-7.7-23 consequence: 140px was tuned for the 380px popup;
                // this grid's only production mount is the full page (AC1 —
                // the popup never renders `WeeklyGrid`), so it widens to the
                // design's 520px (`imports/jira-time-logger.dc.html:387`)
                // without dropping the truncation itself.
                className="max-w-[520px] truncate px-1 py-1 text-left font-normal outline-none"
                title={`${row.key} ${row.summary}`}
              >
                <span className="inline-flex w-full items-center gap-1">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="tabular text-neutral-900">{row.key}</span>{' '}
                    <span className="text-neutral-700">{row.summary}</span>
                  </span>
                  <RowActions
                    row={row}
                    onRemoveLocal={() => handleRemoveLocal(row.key)}
                    {...(onMutated ? { onMutated } : {})}
                  />
                </span>
              </th>
              {row.cells.map((cell, i) => (
                <DayCell
                  key={STRINGS.dayHeadersShort[i] ?? i}
                  rowKey={row.key}
                  rowSummary={row.summary}
                  dayIndex={i}
                  dayName={STRINGS.dayNamesLong[i] ?? ''}
                  dayISO={grid.days[i] ?? ''}
                  cell={cell}
                  status={dayStatuses?.[i] ?? null}
                  onMutated={() => onMutated?.()}
                  registerOpenEditor={(open) => {
                    const id = `${row.key}-${i}`;
                    if (open) cellEditRefs.current.set(id, open);
                    else cellEditRefs.current.delete(id);
                  }}
                  registerFocusable={(focus) => {
                    const id = `${row.key}-${i}`;
                    if (focus) cellFocusRefs.current.set(id, focus);
                    else cellFocusRefs.current.delete(id);
                  }}
                  onCommitAdvance={() => focusNextRowCell(row.key, i)}
                />
              ))}
            </tr>
          ))}
        </tbody>
        {/* D-7.7-21a (Finding 7): the totals row moves from `<thead>` to
         * `<tfoot>` — the design places it at the BOTTOM with a top border
         * (`imports/jira-time-logger.dc.html:398`, `border-top:1px solid
         * #E4E3EC`, closing the grid card as the LAST row), and `<tfoot>`
         * is the semantically correct element for a totals row regardless:
         * `<td>` data cells belong in a body/footer section, not a header
         * one, and screen-reader users now encounter the week's data before
         * its summary rather than the reverse. */}
        <tfoot>
          <tr aria-label={STRINGS.totalsRowLabel} className="border-t border-neutral-200">
            <th
              scope="row"
              className="px-1 py-1 text-left text-xs font-medium text-neutral-500"
            >
              {STRINGS.totalsRowLabel}
            </th>
            {grid.dayTotalsSeconds.map((seconds, i) => (
              <TotalsCell
                key={STRINGS.dayHeadersShort[i] ?? i}
                seconds={seconds}
                status={dayStatuses?.[i] ?? null}
                dayName={STRINGS.dayNamesLong[i] ?? ''}
                iso={grid.days[i] ?? ''}
                today={today}
                targetHours={targetHours}
                timeOffSeconds={timeOffSecondsByDay[i] ?? 0}
              />
            ))}
          </tr>
        </tfoot>
      </table>

      {/* Design source `:839-883`: the add affordance lives INSIDE the grid
          card's footer band, in the subtask column, not floating below the
          card. `AddSubtaskRow` owns both of its states (dashed button →
          search + result popup); `picking` still decides whether it starts
          open, because the day-header "Add a worklog…" path opens the search
          directly and carries a target day. */}
      <div className="mt-2 flex min-w-0 flex-col">
        <AddSubtaskRow
          // Remount when the entry point changes so `startOpen` is re-read:
          // arriving from a day header must open the search even if the
          // dashed button is what is currently on screen.
          key={picking === false ? 'idle' : 'open'}
          startOpen={picking !== false}
          existingKeys={visibleKeys}
          onAdd={handlePick}
          onCancel={() => setPicking(false)}
        />
      </div>
    </div>
  );
}
