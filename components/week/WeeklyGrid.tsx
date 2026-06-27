import { useMutation } from '@tanstack/react-query';
import { Check, AlertCircle, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TicketPicker } from '@/components/today/TicketPicker';
import { Button } from '@/components/ui/button';
import { DayCell } from '@/components/week/DayCell';
import { secondsToCellDisplay } from '@/lib/hours';
import { deleteWorklog } from '@/lib/jira-client';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import { enqueue as enqueueOutbox } from '@/lib/storage/outbox';
import {
  DAYS_PER_WEEK,
  type DayStatus,
  type WeekGrid,
  type WeekGridCell,
  type WeekGridRow,
} from '@/lib/week-grid';

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
  markWeekDone: 'Mark week as done',
  belowTarget: 'below target',
  pto: 'PTO',
  statusComplete: 'complete',
  rowActions: (key: string) => `Row actions for ${key}`,
  rowActionsMenu: 'Row actions',
  removeFromWeek: 'Remove from week',
  cancel: 'Cancel',
  remove: 'Remove',
  removeConfirm: (key: string) => `Remove all entries for ${key}?`,
};

type Props = {
  grid: WeekGrid;
  /** Per-day status (index 0 = Monday); when omitted, totals render neutral. */
  dayStatuses?: DayStatus[];
  /** Invalidate the week query after a successful cell/row mutation (AC #8). */
  onMutated?: () => void;
};

/** A locally-added subtask row (Story 4.1) — all-`──` cells, no worklog posted. */
type LocalRow = { key: string; summary: string };

function emptyCell(): WeekGridCell {
  return { seconds: 0, worklogs: [] };
}

function emptyCells(): WeekGridCell[] {
  return Array.from({ length: DAYS_PER_WEEK }, emptyCell);
}

const ICON_SIZE = 16;

/** Tailwind classes + the accessible status word for each colored status. */
const STATUS_CLASSES: Record<DayStatus, string> = {
  complete: 'bg-state-success-subtle text-state-success',
  'below-target': 'bg-state-danger-subtle text-state-danger',
  pto: 'bg-state-success-subtle text-state-success',
  neutral: 'text-neutral-500',
};

/**
 * One per-day totals cell. Color (when a status is present) is always paired
 * with a lucide icon (decorative, `aria-hidden`), an `aria-label`, and — for
 * below-target — the visible literal text `below target`, so the meaning is
 * conveyed without relying on color (NFR12 / UX-DR32).
 */
function TotalsCell({
  seconds,
  status,
  dayName,
}: {
  seconds: number;
  status: DayStatus;
  dayName: string;
}): React.ReactElement {
  const total = secondsToCellDisplay(seconds);
  const colorClass = STATUS_CLASSES[status];

  const ariaLabel =
    status === 'complete'
      ? `${dayName}, ${STRINGS.statusComplete}`
      : status === 'below-target'
        ? `${dayName}, ${STRINGS.belowTarget}`
        : status === 'pto'
          ? `${dayName}, ${STRINGS.pto}`
          : undefined;

  return (
    <td
      className={`px-1 py-1 text-right font-mono text-xs motion-safe:transition-colors motion-safe:duration-200 ${colorClass}`}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
    >
      <span className="flex items-center justify-end gap-0.5">
        {status === 'complete' || status === 'pto' ? (
          <Check size={ICON_SIZE} aria-hidden />
        ) : status === 'below-target' ? (
          <AlertCircle size={ICON_SIZE} aria-hidden />
        ) : null}
        {status === 'pto' ? <span>{STRINGS.pto}</span> : <span>{total}</span>}
      </span>
      {status === 'below-target' ? (
        <span className="block text-[10px] leading-tight">
          {STRINGS.belowTarget}
        </span>
      ) : null}
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

export function WeeklyGrid({ grid, dayStatuses, onMutated }: Props): React.ReactElement {
  const [localRows, setLocalRows] = useState<LocalRow[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const rowHeaderRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  const existingKeys = new Set(grid.rows.map((r) => r.key));

  const focusRowHeader = useCallback((key: string): void => {
    // Defer to the next frame so a freshly-rendered header is mounted.
    requestAnimationFrame(() => rowHeaderRefs.current.get(key)?.focus());
  }, []);

  const handlePick = useCallback(
    (ticketKey: string, ticketSummary: string): void => {
      log.info('week.add-subtask.picked', { key: ticketKey });
      setLocalRows((prev) => {
        if (existingKeys.has(ticketKey) || prev.some((r) => r.key === ticketKey)) {
          // Already a row — do not add a duplicate; jump focus to it (AC #5).
          focusRowHeader(ticketKey);
          return prev;
        }
        return [...prev, { key: ticketKey, summary: ticketSummary }];
      });
      setPicking(false);
    },
    // existingKeys is derived from props each render; depending on grid.rows is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid.rows, focusRowHeader],
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

  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="px-1 py-1 text-left text-xs font-medium text-neutral-500"
            >
              {STRINGS.subtaskColHeader}
            </th>
            {STRINGS.dayHeadersShort.map((label) => (
              <th
                key={label}
                scope="col"
                className="px-1 py-1 text-right text-xs font-medium text-neutral-500"
              >
                {label}
              </th>
            ))}
          </tr>
          <tr aria-label={STRINGS.totalsRowLabel} className="border-b border-neutral-200">
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
                status={dayStatuses?.[i] ?? 'neutral'}
                dayName={STRINGS.dayNamesLong[i] ?? ''}
              />
            ))}
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
                className="max-w-[140px] truncate px-1 py-1 text-left font-normal outline-none"
                title={`${row.key} ${row.summary}`}
              >
                <span className="inline-flex w-full items-center gap-1">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono text-neutral-900">{row.key}</span>{' '}
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
                  status={dayStatuses?.[i] ?? 'neutral'}
                  onMutated={() => onMutated?.()}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2">
        {picking ? (
          <TicketPicker onSelect={handlePick} />
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="rounded px-1 py-1 text-sm text-neutral-500 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {STRINGS.addSubtask}
          </button>
        )}
      </div>

      <div className="mt-4 flex justify-center">
        <Button variant="primary" disabled>
          {STRINGS.markWeekDone}
        </Button>
      </div>
    </div>
  );
}
