import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MoreHorizontal, Clock, X } from 'lucide-react';
import { updateWorklog, deleteWorklog } from '@/lib/jira-client';
import {
  parseHours,
  hoursToSeconds,
  secondsToHoursDisplay,
  MAX_HOURS_PER_ENTRY,
} from '@/lib/hours';
import { currentCycleRange, isWithinCycle } from '@/lib/cycle-range';
import { formatStartedISO, formatDateForInput } from '@/lib/worklog-date';
import { approvalCycleItem } from '@/lib/storage/settings';
import { textToAdf } from '@/lib/adf';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import type { JiraError } from '@/lib/result';

const STRINGS = {
  heading: 'Logged today',
  empty: 'Nothing logged today yet. Pick a ticket below to start.',
  actions: 'Worklog actions',
  actionsAria: (key: string, hours: string) => `Worklog actions for ${key}, ${hours}`,
  edit: 'Edit',
  delete: 'Delete',
  save: 'Save',
  cancel: 'Cancel',
  hoursLabel: 'Hours',
  hoursPlaceholder: '2.5h, 2h 30m, 2:30…',
  commentLabel: 'Comment',
  commentPlaceholder: 'Optional comment…',
  today: 'Today',
  yesterday: 'Yesterday',
  pickDate: 'Pick date',
  overLimitError: 'Hours per entry can’t exceed 24. Split into multiple entries if needed.',
  deleteConfirm: 'Delete this worklog?',
  dismiss: 'Dismiss',
  retry: 'Retry',
  pending: 'Pending — will retry',
  editError: {
    forbidden: 'Couldn’t update — you don’t have permission',
    'not-found': 'Couldn’t update — worklog no longer exists',
    'parse-error': 'Couldn’t update — unexpected response',
  } as Record<string, string>,
  deleteError: {
    forbidden: 'Couldn’t delete — you don’t have permission',
    'not-found': 'Couldn’t delete — worklog no longer exists',
    'parse-error': 'Couldn’t delete — unexpected response',
  } as Record<string, string>,
};

export type LoggedEntry = {
  key: string;
  summary: string;
  hoursDisplay: string;
  started: string;
  seconds: number;
  worklogId: string;
  comment?: string | undefined;
};

export type EditPatch = {
  hoursDisplay: string;
  seconds: number;
  started: string;
  comment?: string | undefined;
};

type LoggedTodayProps = {
  entries: LoggedEntry[];
  onEdited?: ((worklogId: string, patch: EditPatch) => void) | undefined;
  onDeleted?: ((worklogId: string) => void) | undefined;
};

/**
 * Outbox seam (forward-ref to Story 2.7).
 *
 * For Story 2.6 this is a documented no-op that only logs intent — the UI shows
 * the "Pending — will retry" chip regardless. Story 2.7 replaces this with the
 * real lib/storage/outbox.ts enqueue + chrome.alarms retry.
 */
function enqueueFailedWorklogMutation(info: {
  worklogId: string;
  kind: 'edit' | 'delete';
  resultKind: string;
}): void {
  log.warn('worklog.mutation.deferred-outbox', info);
}

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

export function LoggedToday({
  entries,
  onEdited,
  onDeleted,
}: LoggedTodayProps): React.ReactElement {
  if (entries.length === 0) {
    return (
      <div className="mb-3">
        <p className="text-xs font-medium text-neutral-500 mb-1">{STRINGS.heading}</p>
        <p className="text-sm text-neutral-400">{STRINGS.empty}</p>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <p className="text-xs font-medium text-neutral-500 mb-1">{STRINGS.heading}</p>
      <div className="rounded-md border border-neutral-200 divide-y divide-neutral-100">
        {entries.map((entry) => (
          <WorklogRow
            key={entry.worklogId}
            entry={entry}
            onEdited={onEdited}
            onDeleted={onDeleted}
          />
        ))}
      </div>
    </div>
  );
}

type RowMode = 'idle' | 'menu' | 'editing' | 'confirming-delete';

type ErrorChip =
  | { kind: 'persistent'; message: string }
  | { kind: 'pending'; message: string };

type WorklogRowProps = {
  entry: LoggedEntry;
  onEdited?: ((worklogId: string, patch: EditPatch) => void) | undefined;
  onDeleted?: ((worklogId: string) => void) | undefined;
};

function WorklogRow({ entry, onEdited, onDeleted }: WorklogRowProps): React.ReactElement {
  const [mode, setMode] = useState<RowMode>('idle');
  const [errorChip, setErrorChip] = useState<ErrorChip | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Edit-mode field state.
  const [hoursInput, setHoursInput] = useState('');
  const [commentInput, setCommentInput] = useState(entry.comment ?? '');
  const [dateSel, setDateSel] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(formatDateForInput(new Date()));
  const [cycle, setCycle] = useState<string>('calendar-month');

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const hoursInputRef = useRef<HTMLInputElement>(null);
  const slideOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void approvalCycleItem.getValue().then(setCycle);
  }, []);

  // Clear any pending slide-out timer on unmount so onDeleted is never called
  // against a stale closure after the row goes away.
  useEffect(() => {
    return () => clearTimeout(slideOutTimeoutRef.current);
  }, []);

  const closeMenu = useCallback((restoreFocus = true) => {
    setMode('idle');
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Focus first menu item on open.
  useEffect(() => {
    if (mode === 'menu') firstActionRef.current?.focus();
  }, [mode]);

  // Focus hours input on entering edit mode.
  useEffect(() => {
    if (mode === 'editing') hoursInputRef.current?.focus();
  }, [mode]);

  // Esc + click-outside dismissal while the menu or the delete-confirm chip is
  // open. Esc never deletes — it reverts to the normal row (AC4).
  useEffect(() => {
    if (mode !== 'menu' && mode !== 'confirming-delete') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenu();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    // Click-outside dismissal only applies to the menu popover (whose anchors we
    // can identify). The delete-confirm chip is dismissed via Cancel/Esc only,
    // so a pointerdown on its own buttons is not pre-empted.
    if (mode !== 'menu') {
      return () => document.removeEventListener('keydown', onKeyDown, true);
    }
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
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

  // ---- Mutations ----
  const editMutation = useMutation({
    mutationFn: async (vars: {
      seconds: number;
      started: string;
      comment: string;
      hoursDisplay: string;
      selectedDate: string;
    }) => {
      const body: { timeSpentSeconds: number; started: string; comment?: unknown } = {
        timeSpentSeconds: vars.seconds,
        started: vars.started,
      };
      if (vars.comment.trim()) {
        body.comment = textToAdf(vars.comment.trim());
      }
      const result = await updateWorklog(entry.key, entry.worklogId, body);
      return { result, vars };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => deleteWorklog(entry.key, entry.worklogId),
  });

  const handleEditFailure = useCallback(
    (err: JiraError, kind: 'edit' | 'delete') => {
      const table = kind === 'edit' ? STRINGS.editError : STRINGS.deleteError;
      if (err.kind === 'network' || err.kind === 'rate-limited') {
        enqueueFailedWorklogMutation({
          worklogId: entry.worklogId,
          kind,
          resultKind: err.kind,
        });
        setErrorChip({ kind: 'pending', message: STRINGS.pending });
      } else {
        const message = table[err.kind] ?? table['parse-error']!;
        setErrorChip({ kind: 'persistent', message });
      }
    },
    [entry.worklogId],
  );

  const handleSaveEdit = useCallback(() => {
    if (editMutation.isPending) return;
    const validation = validateHours(hoursInput);
    if (validation.kind !== 'valid') return;

    const selectedDate =
      dateSel === 'today'
        ? formatDateForInput(new Date())
        : dateSel === 'yesterday'
          ? formatDateForInput(new Date(Date.now() - 86_400_000))
          : customDate;

    setErrorChip(null);
    editMutation.mutate(
      {
        seconds: validation.seconds,
        started: formatStartedISO(selectedDate),
        comment: commentInput,
        hoursDisplay: secondsToHoursDisplay(validation.seconds),
        selectedDate,
      },
      {
        onSuccess: ({ result, vars }) => {
          if (result.kind === 'ok') {
            log.info('worklog.edited', { key: entry.key, worklogId: entry.worklogId });
            void sendMessage('badge-update', { hoursMissing: 0 });
            onEdited?.(entry.worklogId, {
              hoursDisplay: vars.hoursDisplay,
              seconds: vars.seconds,
              started: vars.selectedDate,
              comment: vars.comment.trim() || undefined,
            });
            setMode('idle');
          } else {
            log.warn('worklog.edit.failed', { key: entry.key, kind: result.kind });
            setMode('idle');
            handleEditFailure(result, 'edit');
          }
        },
        onError: (e) => {
          log.error('worklog.edit.error', { key: entry.key, error: String(e) });
          setMode('idle');
          setErrorChip({ kind: 'persistent', message: STRINGS.editError['parse-error']! });
        },
      },
    );
  }, [
    editMutation,
    hoursInput,
    dateSel,
    customDate,
    commentInput,
    entry.key,
    entry.worklogId,
    onEdited,
    handleEditFailure,
  ]);

  const handleConfirmDelete = useCallback(() => {
    if (deleteMutation.isPending) return;
    setErrorChip(null);
    deleteMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.kind === 'ok') {
          log.info('worklog.deleted', { key: entry.key, worklogId: entry.worklogId });
          void sendMessage('badge-update', { hoursMissing: 0 });
          setMode('idle');
          // Slide the row out before removing it from the parent list. Under
          // reduced motion (or a non-DOM test env) remove immediately.
          const reduceMotion =
            typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (reduceMotion) {
            onDeleted?.(entry.worklogId);
          } else {
            setLeaving(true);
            slideOutTimeoutRef.current = setTimeout(
              () => onDeleted?.(entry.worklogId),
              200,
            );
          }
        } else {
          log.warn('worklog.delete.failed', { key: entry.key, kind: result.kind });
          setMode('idle');
          handleEditFailure(result, 'delete');
        }
      },
      onError: (e) => {
        log.error('worklog.delete.error', { key: entry.key, error: String(e) });
        setMode('idle');
        setErrorChip({ kind: 'persistent', message: STRINGS.deleteError['parse-error']! });
      },
    });
  }, [deleteMutation, entry.key, entry.worklogId, onDeleted, handleEditFailure]);

  const startEdit = useCallback(() => {
    // Seed the edit fields from the current entry. Use the exact stored seconds
    // (not the lossy display string) so an unchanged Save round-trips to the
    // same duration.
    setHoursInput(secondsToHoursDisplay(entry.seconds));
    setCommentInput(entry.comment ?? '');
    // Seed the date selector from the entry's actual `started` date so editing
    // hours/comment alone does not silently move the worklog to today.
    const startedDate = new Date(entry.started);
    const startedDateStr = Number.isNaN(startedDate.getTime())
      ? formatDateForInput(new Date())
      : formatDateForInput(startedDate);
    const todayStr = formatDateForInput(new Date());
    const yesterdayStr = formatDateForInput(new Date(Date.now() - 86_400_000));
    if (startedDateStr === todayStr) {
      setDateSel('today');
    } else if (startedDateStr === yesterdayStr) {
      setDateSel('yesterday');
    } else {
      setDateSel('custom');
    }
    setCustomDate(startedDateStr);
    setMode('editing');
  }, [entry.seconds, entry.comment, entry.started]);

  const cancelEdit = useCallback(() => {
    setMode('idle');
  }, []);

  // ---- Render: editing mode ----
  if (mode === 'editing') {
    const validation = validateHours(hoursInput);
    const isValid = validation.kind === 'valid';
    const isError = validation.kind === 'unparseable' || validation.kind === 'over-limit';
    const borderClass =
      validation.kind === 'empty'
        ? 'border-neutral-200'
        : isError
          ? 'border-state-danger'
          : 'border-state-success';

    const cycleRange = currentCycleRange(cycle);
    const yesterdayInCycle = isWithinCycle(new Date(Date.now() - 86_400_000), cycle);
    const saveDisabled = !isValid || editMutation.isPending;

    return (
      <div
        className="px-3 py-2"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveEdit();
          }
          if (e.key === 'Escape') {
            cancelEdit();
          }
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-neutral-900 shrink-0">
            {entry.key}
          </span>
          <span className="text-sm text-neutral-700 truncate flex-1">{entry.summary}</span>
        </div>

        <div className="mt-2 flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-700 mb-0.5">
              {STRINGS.hoursLabel}
            </label>
            <input
              ref={hoursInputRef}
              type="text"
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              placeholder={STRINGS.hoursPlaceholder}
              aria-label={STRINGS.hoursLabel}
              className={`flex h-9 w-full rounded-md border-2 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${borderClass}`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-0.5">
              {' '}
            </label>
            <select
              value={dateSel}
              onChange={(e) =>
                setDateSel(e.target.value as 'today' | 'yesterday' | 'custom')
              }
              className="h-9 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm"
              aria-label="Date"
            >
              <option value="today">{STRINGS.today}</option>
              {yesterdayInCycle && <option value="yesterday">{STRINGS.yesterday}</option>}
              <option value="custom">{STRINGS.pickDate}</option>
            </select>
          </div>
        </div>

        {dateSel === 'custom' && (
          <div className="mt-2">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              min={formatDateForInput(cycleRange.start)}
              max={formatDateForInput(cycleRange.end)}
              className="h-9 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm"
              aria-label="Pick date"
            />
          </div>
        )}

        <div className="mt-2">
          <label className="block text-xs font-medium text-neutral-700 mb-0.5">
            {STRINGS.commentLabel}
          </label>
          <input
            type="text"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder={STRINGS.commentPlaceholder}
            aria-label={STRINGS.commentLabel}
            className="flex h-9 w-full rounded-md border border-neutral-200 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          />
        </div>

        {validation.kind === 'over-limit' && (
          <p className="mt-1 text-xs text-state-danger font-medium">
            {STRINGS.overLimitError}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            aria-label={STRINGS.save}
            onClick={handleSaveEdit}
            disabled={saveDisabled}
          >
            {editMutation.isPending ? (
              <span className="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              STRINGS.save
            )}
          </Button>
          <Button variant="secondary" size="sm" onClick={cancelEdit}>
            {STRINGS.cancel}
          </Button>
        </div>
      </div>
    );
  }

  // ---- Render: normal row (idle / menu / confirming-delete) ----
  return (
    <div
      className={`group relative flex items-center gap-2 px-3 py-1.5 ${
        leaving ? 'motion-safe:animate-slide-out' : 'animate-slide-in'
      }`}
    >
      <span className="font-mono text-sm font-medium text-neutral-900 shrink-0">
        {entry.key}
      </span>
      <span className="text-sm text-neutral-700 truncate flex-1">{entry.summary}</span>
      <span className="font-mono text-sm font-medium text-neutral-700 shrink-0">
        {entry.hoursDisplay}
      </span>

      {mode === 'confirming-delete' ? (
        <div className="flex items-center gap-2" role="group" aria-label={STRINGS.deleteConfirm}>
          <span className="text-xs text-neutral-700">{STRINGS.deleteConfirm}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMode('idle')}
            disabled={deleteMutation.isPending}
          >
            {STRINGS.cancel}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-state-danger"
            onClick={handleConfirmDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <span className="inline-block h-3 w-3 rounded-full border-2 border-state-danger/40 border-t-state-danger animate-spin" />
            ) : (
              STRINGS.delete
            )}
          </Button>
        </div>
      ) : (
        <>
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={mode === 'menu'}
            aria-label={STRINGS.actionsAria(entry.key, entry.hoursDisplay)}
            onClick={() =>
              setMode((prev) => {
                if (prev === 'menu') return 'idle';
                // Clear any persistent/pending chip so the menu (which shares the
                // same anchor position) does not overlap it.
                setErrorChip(null);
                return 'menu';
              })
            }
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>

          {mode === 'menu' && (
            <div
              ref={popoverRef}
              role="menu"
              aria-label={STRINGS.actions}
              className="absolute right-2 top-full z-10 mt-1 w-32 rounded-md border border-neutral-200 bg-white p-1 shadow-md"
            >
              <Button
                ref={firstActionRef}
                variant="ghost"
                size="sm"
                role="menuitem"
                className="w-full justify-start"
                onClick={startEdit}
              >
                {STRINGS.edit}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                role="menuitem"
                className="mt-1 w-full justify-start"
                onClick={() => setMode('confirming-delete')}
              >
                {STRINGS.delete}
              </Button>
            </div>
          )}
        </>
      )}

      {errorChip && (
        <div
          role="alert"
          aria-live="assertive"
          className={`absolute right-2 top-full z-10 mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
            errorChip.kind === 'pending'
              ? 'bg-state-info-subtle text-neutral-700'
              : 'text-state-danger font-medium'
          }`}
        >
          {errorChip.kind === 'pending' && (
            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          <span>{errorChip.message}</span>
          <button
            type="button"
            aria-label={STRINGS.dismiss}
            onClick={() => setErrorChip(null)}
            className="ml-1 rounded text-neutral-500 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
