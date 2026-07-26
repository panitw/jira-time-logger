import { useMutation } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { STATUS_TINT_CLASS, TIME_OFF_TEXT_CLASS } from '@/components/shared/DayStatusIndicator';
import { isWeekend } from '@/lib/day-status';
import {
  parseHours,
  hoursToSeconds,
  hoursPhrase,
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
  status: DayStatus | null;
  onMutated: () => void;
  /**
   * Optionally exposes this cell's "open editor" action to the parent so a
   * day-scoped "Add a worklog…" (Story 4.4) can open the editor on the right
   * column. Registers on mount, unregisters on unmount. No-op for multi cells.
   */
  registerOpenEditor?: (open: (() => void) | null) => void;
  /**
   * Story 7.7, D-7.7-33: exposes this cell's "focus me" action (the
   * display-mode button) so `WeeklyGrid` can move focus here from a `⏎` in
   * the SAME day's cell in the previous row. Registered/unregistered
   * exactly like `registerOpenEditor` — present only in display mode
   * (unregistered while editing or for a multi-worklog read-only cell).
   */
  registerFocusable?: (focus: (() => void) | null) => void;
  /**
   * Story 7.7, AC5/D-7.7-33: fired after `⏎` commits, so the OWNER
   * (`WeeklyGrid`, which knows the row order) can move focus to the same
   * day's cell in the next row. `DayCell` itself has no visibility into its
   * siblings.
   */
  onCommitAdvance?: () => void;
};

/** Empty-cell glyph inside the 34px anatomy box (AC4/D-7.7-26) — a
 * `faint-decorative` middot, distinct from `secondsToCellDisplay`'s
 * em-dash-pair convention used elsewhere (totals/multi-cell display). Scoped
 * to THIS one box, not a change to the shared conversion utility. */
const EMPTY_CELL_GLYPH = '·';

export function DayCell({
  rowKey,
  rowSummary,
  dayName,
  dayISO,
  cell,
  status,
  onMutated,
  registerOpenEditor,
  registerFocusable,
  onCommitAdvance,
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
        // AC5/D-7.7-33: `⏎` saves AND moves focus to the next row — the
        // NEW delta over the pre-7.7 behaviour (which only saved). `Tab` is
        // deliberately left un-intercepted below (no `else if` branch, no
        // `preventDefault`) so the browser's native tab order — which
        // already lands on the next day's cell inside this table row —
        // keeps working; the existing `onBlur` → `commit()` path handles
        // the save for that case.
        onCommitAdvance?.();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [hoursInput, commit, cancelEdit, onCommitAdvance],
  );

  // Tailwind tint per day status, carried through to body cells (AC #9;
  // D-7.6-45: consumes the ONE shared `STATUS_TINT_CLASS` registry
  // (`DayStatusIndicator.tsx`) rather than a second local colour map — the
  // exact per-surface re-implementation D-7.6-2 forbids. `weekend`'s tint is
  // NOT part of that registry (D-7.6-6/46): a per-cell status cannot express
  // "tint the whole column", so it comes from the exported `isWeekend(iso)`
  // predicate instead — the SAME predicate the status derivation uses, so
  // the two can't drift. A day whose STATUS carries its own tint (e.g.
  // `time-off`, which outranks `weekend` per D-7.6-6's precedence) shows
  // that tint rather than layering a second background on top of it; 7.7
  // owns applying the weekend tint as "one recessive object" across
  // header/cell/totals — this story only avoids reintroducing the
  // half-applied, status-derived version D-7.6-46 reverted.
  const statusTint = status ? (STATUS_TINT_CLASS[status] ?? '') : '';
  const tint = statusTint || (isWeekend(dayISO) ? 'bg-weekend' : '');
  const tdClass = `relative px-1 py-1 text-right tabular text-xs motion-safe:transition-colors motion-safe:duration-200 ${tint}`;

  // ---- Edit mode ----
  if (editing) {
    const validation = validateHours(hoursInput);
    // Unparseable/over-limit is a VALIDATION state, not a refused write — it
    // reads amber, never red (D-7.6-37: red means Jira actually rejected a
    // write; nothing has been sent yet here).
    const isError = validation.kind === 'unparseable' || validation.kind === 'over-limit';
    const borderClass =
      validation.kind === 'empty'
        ? 'border-neutral-200'
        : isError
          ? 'border-amber-border'
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
          <p className="mt-0.5 text-[10px] leading-tight text-amber-ink" role="alert" aria-live="assertive">
            {STRINGS.overLimitError}
          </p>
        )}
        {validation.kind === 'unparseable' && (
          <p className="mt-0.5 text-[10px] leading-tight text-amber-ink" role="alert" aria-live="assertive">
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
  // AC4 cell anatomy, cross-checked value-by-value against the design
  // source (D-7.7-26/D-7.7-15): a 34px `rounded-md` box, white fill + the
  // `cell-border` token when the cell holds a value, transparent fill/border
  // with a `faint-decorative` middot when empty, a primary border + the
  // EXISTING `ring-focus` utility (never static — D-7.3-15) when focused,
  // and — for a time-off day — its OWN fill/text/border triple (D-7.7-15),
  // no icon (D-7.7-17: the filled Diamond belongs to the totals row, not
  // this cell).
  const hasValue = cell.seconds > 0;
  const isTimeOff = status === 'time-off';
  // D-7.7-26/D-7.7-15: a WEEKEND cell holding a value dims its text to
  // `text-muted` (#6B6678) rather than the ordinary `text-foreground`
  // (#1E1B2E) — part of AC3's "one recessive object" (the column already
  // reads as recessive via `bg-weekend`; the text follows suit). The EMPTY
  // middot deliberately does NOT also dim (flagged decision, kept as
  // `faint-decorative`) — the column tint alone already carries the
  // recession for an empty cell, and a fourth colour value for one pixel of
  // difference was judged not worth it.
  const weekend = isWeekend(dayISO);
  // Finding 11: the hover class now lives per-branch, token-based, so a
  // time-off cell's hover doesn't blow away its `bg-time-off-fill` purple
  // wash with a raw, non-semantic `bg-neutral-100` grey — `hover:bg-primary-
  // soft` reinforces the SAME time-off tint family (`TIME_OFF_TEXT_CLASS`'s
  // own colour, `--color-primary`), while an ordinary/empty cell gets the
  // existing border-faint wash.
  const boxColorClass = isTimeOff
    ? `border-time-off-border bg-time-off-fill hover:bg-primary-soft ${TIME_OFF_TEXT_CLASS}`
    : hasValue
      ? `border-cell-border bg-surface hover:bg-border-faint ${weekend ? 'text-muted' : 'text-foreground'}`
      : 'border-transparent bg-transparent hover:bg-border-faint text-faint-decorative';
  // Finding 12: `text-right` dropped — it was inert under `justify-center`
  // (which the design's own `justify-content:center`, `:391`, confirms is
  // the intended alignment), a dead class left over from an earlier button.
  const boxClass = `flex h-[34px] w-full items-center justify-center rounded-md border tabular focus-visible:outline-none focus-visible:border-primary focus-visible:ring-focus ${boxColorClass}`;

  return (
    <td
      className={tdClass}
      // D-7.7-24: the value-bearing cell's accessible name — spoken hours,
      // not the visible "4.0" (most screen readers read "4.0" as "four
      // point zero"). Empty cells carry no such label; the button's own
      // `editAria` ("Hours for …") still serves them.
      {...(hasValue
        ? { 'aria-label': `${dayName}, ${rowKey}, ${hoursPhrase(cell.seconds)}` }
        : {})}
    >
      <button
        ref={(el) => {
          registerFocusable?.(el ? () => el.focus() : null);
        }}
        type="button"
        onClick={startEdit}
        aria-label={editAria}
        disabled={isPending}
        className={boxClass}
      >
        {hasValue ? secondsToCellDisplay(cell.seconds) : EMPTY_CELL_GLYPH}
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
        // AC4 survivor: Jira actually refused this post/put/delete (the
        // mutation's non-transient failure branch above sets this chip) —
        // red is legitimate here (Finding 9).
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
