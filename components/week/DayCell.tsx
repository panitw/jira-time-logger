import { useMutation } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseHours,
  hoursToSeconds,
  secondsToCellDisplay,
  secondsToHours,
  MAX_HOURS_PER_ENTRY,
} from '@/lib/hours';
import { postWorklog, updateWorklog, deleteWorklog } from '@/lib/jira-client';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import { enqueue as enqueueOutbox } from '@/lib/storage/outbox';
import {
  cellEditability,
  type DayStatus,
  type WeekGridCell,
} from '@/lib/week-grid';
import { formatStartedISO } from '@/lib/worklog-date';

const STRINGS = {
  overLimitError: 'Hours per entry can’t exceed 24. Split into multiple entries if needed.',
  helperText: 'Use formats like 2.5h, 2h 30m, or 2:30',
  multiEntries: 'Multiple entries — edit in Today view',
  pending: 'Pending — will retry',
  errorPost: 'Couldn’t log time — try again',
  errorUpdate: 'Couldn’t update — try again',
  errorDelete: 'Couldn’t delete — try again',
};

/** Tailwind tint per day status, carried through to body cells (AC #9). */
const STATUS_TINT: Record<DayStatus, string> = {
  complete: 'bg-state-success-subtle',
  'below-target': 'bg-state-danger-subtle',
  pto: 'bg-state-success-subtle',
  neutral: '',
};

type ValidationResult =
  | { kind: 'empty' }
  | { kind: 'valid'; seconds: number }
  | { kind: 'unparseable' }
  | { kind: 'over-limit' };

function validateHours(input: string): ValidationResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'empty' };
  const parsed = parseHours(trimmed);
  if (parsed.kind !== 'ok') return { kind: 'unparseable' };
  if (parsed.hours > MAX_HOURS_PER_ENTRY) return { kind: 'over-limit' };
  return { kind: 'valid', seconds: hoursToSeconds(parsed.hours) };
}

/** Pre-fill the editor with the cell's value as a bare decimal (`4`, `0.5`). */
function cellInputValue(seconds: number): string {
  if (seconds <= 0) return '';
  return String(secondsToHours(seconds));
}

type ChipState =
  | { kind: 'pending'; message: string }
  | { kind: 'error'; message: string };

export type DayCellProps = {
  rowKey: string;
  rowSummary: string;
  dayIndex: number;
  dayName: string;
  dayISO: string;
  cell: WeekGridCell;
  status: DayStatus;
  onMutated: () => void;
  /**
   * Optionally exposes this cell's "open editor" action to the parent so a
   * day-scoped "Add a worklog…" (Story 4.4) can open the editor on the right
   * column. Registers on mount, unregisters on unmount. No-op for multi cells.
   */
  registerOpenEditor?: (open: (() => void) | null) => void;
};

export function DayCell({
  rowKey,
  rowSummary,
  dayName,
  dayISO,
  cell,
  status,
  onMutated,
  registerOpenEditor,
}: DayCellProps): React.ReactElement {
  const editability = cellEditability(cell);
  const isMulti = editability === 'multi';

  const [editing, setEditing] = useState(false);
  const [hoursInput, setHoursInput] = useState('');
  const [chip, setChip] = useState<ChipState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Synchronous guard: a single edit session commits/cancels exactly once.
  // Closing the editor unmounts the focused <input>, which fires a `blur` that
  // would otherwise re-run commit() and issue a duplicate POST/PUT/DELETE
  // (mutation.isPending is stale inside the same event's closures). Set true
  // the moment a session resolves; reset only when a fresh edit opens.
  const resolvedRef = useRef(false);
  // Avoid setState after the cell unmounts (a refetch can drop/re-sort rows
  // while a mutation is in flight).
  const mountedRef = useRef(true);

  const baseAria = `${dayName}, ${rowKey} ${rowSummary}`;
  const editAria = `Hours for ${baseAria}`;
  const multiAria = `${cell.worklogs.length} entries for ${baseAria} — edit in the Today view`;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const mutation = useMutation({
    mutationFn: async (
      vars:
        | { op: 'post'; seconds: number }
        | { op: 'put'; seconds: number; worklogId: string; startedISO: string }
        | { op: 'delete'; worklogId: string },
    ) => {
      if (vars.op === 'post') {
        const started = formatStartedISO(dayISO);
        const result = await postWorklog(rowKey, {
          timeSpentSeconds: vars.seconds,
          started,
        });
        return { vars, result, started } as const;
      }
      if (vars.op === 'put') {
        const result = await updateWorklog(rowKey, vars.worklogId, {
          timeSpentSeconds: vars.seconds,
          started: vars.startedISO,
        });
        return { vars, result, started: vars.startedISO } as const;
      }
      const result = await deleteWorklog(rowKey, vars.worklogId);
      return { vars, result, started: '' } as const;
    },
    onSuccess: ({ vars, result, started }) => {
      if (result.kind === 'ok') {
        log.info('week.cell.mutated', { key: rowKey, op: vars.op });
        if (mountedRef.current) setChip(null);
        void sendMessage('badge-update', { hoursMissing: 0 });
        onMutated();
        return;
      }
      if (result.kind === 'network' || result.kind === 'rate-limited') {
        log.warn('week.cell.transient', { key: rowKey, op: vars.op, kind: result.kind });
        enqueueTransient(vars, started);
        if (mountedRef.current) setChip({ kind: 'pending', message: STRINGS.pending });
        return;
      }
      log.warn('week.cell.failed', { key: rowKey, op: vars.op, kind: result.kind });
      if (mountedRef.current) setChip({ kind: 'error', message: errorMessageFor(vars.op) });
    },
    onError: (e) => {
      log.error('week.cell.error', { key: rowKey, error: String(e) });
      if (mountedRef.current) setChip({ kind: 'error', message: errorMessageFor('post') });
    },
  });

  const { mutate, isPending } = mutation;

  function errorMessageFor(op: 'post' | 'put' | 'delete'): string {
    if (op === 'put') return STRINGS.errorUpdate;
    if (op === 'delete') return STRINGS.errorDelete;
    return STRINGS.errorPost;
  }

  function enqueueTransient(
    vars:
      | { op: 'post'; seconds: number }
      | { op: 'put'; seconds: number; worklogId: string; startedISO: string }
      | { op: 'delete'; worklogId: string },
    started: string,
  ): void {
    const base = `rest/api/3/issue/${encodeURIComponent(rowKey)}/worklog`;
    if (vars.op === 'post') {
      void enqueueOutbox({
        kind: 'post',
        endpoint: base,
        issueKey: rowKey,
        body: { timeSpentSeconds: vars.seconds, started },
      }).catch((e) => log.error('outbox.enqueue.failed', { key: rowKey, cause: String(e) }));
      return;
    }
    const endpoint = `${base}/${encodeURIComponent(vars.worklogId)}`;
    if (vars.op === 'put') {
      void enqueueOutbox({
        kind: 'put',
        endpoint,
        issueKey: rowKey,
        worklogId: vars.worklogId,
        body: { timeSpentSeconds: vars.seconds, started },
      }).catch((e) => log.error('outbox.enqueue.failed', { key: rowKey, cause: String(e) }));
      return;
    }
    void enqueueOutbox({
      kind: 'delete',
      endpoint,
      issueKey: rowKey,
      worklogId: vars.worklogId,
    }).catch((e) => log.error('outbox.enqueue.failed', { key: rowKey, cause: String(e) }));
  }

  const startEdit = useCallback(() => {
    if (isMulti) return;
    resolvedRef.current = false;
    setChip(null);
    setHoursInput(cellInputValue(cell.seconds));
    setEditing(true);
  }, [isMulti, cell.seconds]);

  // Expose the editor-open action to the parent (day-scoped "Add a worklog…").
  useEffect(() => {
    if (!registerOpenEditor) return;
    registerOpenEditor(isMulti ? null : startEdit);
    return () => registerOpenEditor(null);
  }, [registerOpenEditor, startEdit, isMulti]);

  const cancelEdit = useCallback(() => {
    resolvedRef.current = true;
    setEditing(false);
    setHoursInput('');
  }, []);

  const commit = useCallback(() => {
    // A session resolves exactly once: the second invocation (e.g. the blur
    // fired when closing the editor unmounts the focused input) is a no-op,
    // preventing duplicate writes. `isPending` is stale inside event closures,
    // so this synchronous ref is the real guard.
    if (resolvedRef.current || isPending) return;
    const validation = validateHours(hoursInput);
    // A refetch may have flipped this cell to multi (a concurrent worklog
    // landed) while the editor was open — never issue an ambiguous write.
    if (isMulti) {
      cancelEdit();
      return;
    }
    const single = cell.worklogs[0];

    // Clear to empty.
    if (validation.kind === 'empty') {
      if (single) {
        resolvedRef.current = true;
        setEditing(false);
        mutate({ op: 'delete', worklogId: single.id });
      } else {
        // Clearing an already-empty cell is a no-op.
        cancelEdit();
      }
      return;
    }
    // Invalid: blocked at submit (Enter no-op; caller handles blur-cancel).
    if (validation.kind !== 'valid') return;

    resolvedRef.current = true;
    setEditing(false);
    if (single) {
      mutate({
        op: 'put',
        seconds: validation.seconds,
        worklogId: single.id,
        startedISO: single.startedISO ?? formatStartedISO(dayISO),
      });
    } else {
      mutate({ op: 'post', seconds: validation.seconds });
    }
  }, [isPending, isMulti, hoursInput, cell.worklogs, mutate, cancelEdit, dayISO]);

  const handleBlur = useCallback(() => {
    if (resolvedRef.current) return;
    const validation = validateHours(hoursInput);
    // Unparseable on blur cancels back to the prior value (no write).
    if (validation.kind === 'unparseable' || validation.kind === 'over-limit') {
      cancelEdit();
      return;
    }
    commit();
  }, [hoursInput, cancelEdit, commit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const validation = validateHours(hoursInput);
        // Enter on an unparseable/over-limit value is a no-op (stay editing).
        if (validation.kind === 'unparseable' || validation.kind === 'over-limit') return;
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [hoursInput, commit, cancelEdit],
  );

  const tint = STATUS_TINT[status];
  const tdClass = `relative px-1 py-1 text-right font-mono text-xs motion-safe:transition-colors motion-safe:duration-200 ${tint}`;

  // ---- Edit mode ----
  if (editing) {
    const validation = validateHours(hoursInput);
    const isError = validation.kind === 'unparseable' || validation.kind === 'over-limit';
    const borderClass =
      validation.kind === 'empty'
        ? 'border-neutral-200'
        : isError
          ? 'border-state-danger'
          : 'border-state-success';
    return (
      <td className={tdClass}>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={hoursInput}
          onChange={(e) => setHoursInput(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-label={editAria}
          className={`h-7 w-full rounded border-2 bg-white px-1 text-right text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${borderClass}`}
        />
        {validation.kind === 'over-limit' && (
          <p className="mt-0.5 text-[10px] leading-tight text-state-danger" role="alert" aria-live="assertive">
            {STRINGS.overLimitError}
          </p>
        )}
        {validation.kind === 'unparseable' && (
          <p className="mt-0.5 text-[10px] leading-tight text-state-danger" role="alert" aria-live="assertive">
            {STRINGS.helperText}
          </p>
        )}
      </td>
    );
  }

  // ---- Multi-worklog read-only cell (AC #4) ----
  if (isMulti) {
    return (
      <td className={tdClass} aria-label={multiAria}>
        <span
          className="cursor-help underline decoration-dotted underline-offset-2 text-neutral-700"
          title={STRINGS.multiEntries}
        >
          {secondsToCellDisplay(cell.seconds)}
        </span>
      </td>
    );
  }

  // ---- Display mode (empty or single → editable) ----
  return (
    <td className={tdClass}>
      <button
        type="button"
        onClick={startEdit}
        aria-label={editAria}
        disabled={isPending}
        className="w-full rounded px-1 text-right text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {secondsToCellDisplay(cell.seconds)}
      </button>
      {chip?.kind === 'pending' && (
        <span
          role="status"
          aria-live="polite"
          className="mt-0.5 flex items-center justify-end gap-1 rounded bg-state-info-subtle px-1 text-[10px] text-neutral-700"
        >
          <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          {chip.message}
        </span>
      )}
      {chip?.kind === 'error' && (
        <span
          role="alert"
          aria-live="assertive"
          className="mt-0.5 block text-[10px] leading-tight text-state-danger"
        >
          {chip.message}
        </span>
      )}
    </td>
  );
}
