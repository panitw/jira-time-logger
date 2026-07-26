import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { postWorklog } from '@/lib/jira-client';
import {
  parseHours,
  hoursToSeconds,
  secondsToHoursDisplay,
  MAX_HOURS_PER_ENTRY,
} from '@/lib/hours';
import { currentCycleRange, isWithinCycle } from '@/lib/cycle-range';
import { formatStartedISO, formatDateForInput } from '@/lib/worklog-date';
import { approvalCycleItem } from '@/lib/storage/settings';
import { setLastLoggedTicket } from '@/lib/storage/last-logged';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import { enqueue as enqueueOutbox } from '@/lib/storage/outbox';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LoggedEntry } from '@/components/today/LoggedToday';

const STRINGS = {
  hoursLabel: 'Hours',
  hoursPlaceholder: '2.5h, 2h 30m, 2:30\u2026',
  helperText: 'Use formats like 2.5h, 2h 30m, or 2:30',
  overLimitError: 'Hours per entry can\u2019t exceed 24. Split into multiple entries if needed.',
  logButton: 'Log',
  cancelButton: 'Cancel',
  today: 'Today',
  yesterday: 'Yesterday',
  pickDate: 'Pick date',
  postError: 'Couldn\u2019t log time \u2014 try again',
  pending: 'Pending \u2014 will retry',
  empty: 'Enter hours',
};

type SubmitState = 'idle' | 'success' | 'error' | 'pending';

type QuickLogFormProps = {
  ticketKey: string;
  ticketSummary: string;
  onLogged: (entry: LoggedEntry) => void;
  onCancel: () => void;
};

type ValidationResult =
  | { kind: 'empty' }
  | { kind: 'valid'; hours: number; seconds: number }
  | { kind: 'unparseable' }
  | { kind: 'over-limit'; hours: number };

function validateHours(input: string): ValidationResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'empty' };
  const parsed = parseHours(trimmed);
  if (parsed.kind !== 'ok') return { kind: 'unparseable' };
  if (parsed.hours > MAX_HOURS_PER_ENTRY) return { kind: 'over-limit', hours: parsed.hours };
  return { kind: 'valid', hours: parsed.hours, seconds: hoursToSeconds(parsed.hours) };
}

export function QuickLogForm({
  ticketKey,
  ticketSummary,
  onLogged,
  onCancel,
}: QuickLogFormProps): React.ReactElement {
  const [hoursInput, setHoursInput] = useState('');
  const [dateSel, setDateSel] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(formatDateForInput(new Date()));
  const [cycle, setCycle] = useState<string>('calendar-month');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => clearTimeout(successTimeoutRef.current);
  }, []);

  useEffect(() => {
    void approvalCycleItem.getValue().then(setCycle);
  }, []);

  const validation = validateHours(hoursInput);
  const isError = validation.kind === 'unparseable' || validation.kind === 'over-limit';
  const isValid = validation.kind === 'valid';

  const borderClass =
    validation.kind === 'empty'
      ? 'border-neutral-200'
      : isError
        ? 'border-state-danger'
        : 'border-state-success';

  const selectedDate =
    dateSel === 'today'
      ? formatDateForInput(new Date())
      : dateSel === 'yesterday'
        ? formatDateForInput(new Date(Date.now() - 86_400_000))
        : customDate;

  const cycleRange = currentCycleRange(cycle);
  const yesterdayDate = new Date(Date.now() - 86_400_000);
  const yesterdayInCycle = isWithinCycle(yesterdayDate, cycle);

  const logMutation = useMutation({
    mutationFn: async (params: {
      seconds: number;
      started: string;
      hoursDisplay: string;
    }) =>
      postWorklog(ticketKey, {
        timeSpentSeconds: params.seconds,
        started: params.started,
      }),
    onSuccess: (result, vars) => {
      if (result.kind === 'ok') {
        log.info('worklog.posted', { key: ticketKey });
        setSubmitState('success');
        // Broadcast badge update (NFR4 — SW badge logic is Story 3.1)
        void sendMessage('badge-update', { hoursMissing: 0 });
        // Story 7.3, D-7.3-2: stamp the resume card's data seam on every
        // CONFIRMED post — never on outbox-enqueue or refusal (see the
        // other two onSuccess branches below). Fire-and-forget: a storage
        // failure must never break the log itself.
        void setLastLoggedTicket({
          key: ticketKey,
          summary: ticketSummary,
          seconds: vars.seconds,
          startedAt: vars.started,
          recordedAt: new Date().toISOString(),
        }).catch((e) => {
          log.error('last-logged.write.failed', { key: ticketKey, cause: String(e) });
        });
        const entry: LoggedEntry = {
          key: ticketKey,
          summary: ticketSummary,
          hoursDisplay: vars.hoursDisplay,
          started: selectedDate,
          seconds: vars.seconds,
          worklogId: result.value.id,
        };
        successTimeoutRef.current = setTimeout(() => {
          onLogged(entry);
        }, 200);
      } else if (result.kind === 'network' || result.kind === 'rate-limited') {
        // Transient failure — queue the post durably so it retries on
        // reconnect, and surface the persistent "Pending — will retry" chip.
        log.warn('worklog.post.failed', { key: ticketKey, kind: result.kind });
        void enqueueOutbox({
          kind: 'post',
          endpoint: `rest/api/3/issue/${encodeURIComponent(ticketKey)}/worklog`,
          issueKey: ticketKey,
          body: { timeSpentSeconds: vars.seconds, started: vars.started },
        }).catch((e) => {
          log.error('outbox.enqueue.failed', { key: ticketKey, cause: String(e) });
        });
        setSubmitState('pending');
      } else {
        log.warn('worklog.post.failed', { key: ticketKey, kind: result.kind });
        setSubmitState('error');
      }
    },
    onError: (e) => {
      log.error('worklog.post.error', { key: ticketKey, error: String(e) });
      setSubmitState('error');
    },
  });

  const { mutate: logMutate, isPending: isLogPending } = logMutation;

  const handleSubmit = useCallback(() => {
    if (!isValid || isLogPending) return;
    setSubmitState('idle');
    logMutate({
      seconds: validation.seconds,
      started: formatStartedISO(selectedDate),
      hoursDisplay: secondsToHoursDisplay(validation.seconds),
    });
  }, [isValid, isLogPending, logMutate, validation, selectedDate]);

  const handleCancel = useCallback(() => {
    clearTimeout(successTimeoutRef.current);
    onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        handleCancel();
      }
    },
    [handleSubmit, handleCancel],
  );

  const showSuccess = submitState === 'success';
  const showError = submitState === 'error';
  const showPending = submitState === 'pending';
  const isPending = isLogPending;
  const buttonDisabled = !isValid || isPending || showSuccess;

  return (
    <div
      className="mt-3 rounded-md border border-neutral-200 p-3"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-medium text-neutral-900 shrink-0">
          {ticketKey}
        </span>
        <span className="text-sm text-neutral-700 truncate">{ticketSummary}</span>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-neutral-700 mb-0.5">
            {STRINGS.hoursLabel}
          </label>
          <input
            ref={inputRef}
            type="text"
            value={hoursInput}
            onChange={(e) => {
              setHoursInput(e.target.value);
              setSubmitState('idle');
            }}
            placeholder={STRINGS.hoursPlaceholder}
            aria-label={STRINGS.hoursLabel}
            className={`flex h-9 w-full rounded-md border-2 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${borderClass}`}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-0.5">
            {'\u00A0'}
          </label>
          <select
            value={dateSel}
            onChange={(e) => {
              const v = e.target.value as 'today' | 'yesterday' | 'custom';
              setDateSel(v);
            }}
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

      <div className="mt-1 min-h-[1.25rem]">
        {validation.kind === 'unparseable' && hoursInput.trim() && (
          <p className="text-xs text-state-danger">{STRINGS.helperText}</p>
        )}
        {validation.kind === 'over-limit' && (
          <p className="text-xs text-state-danger font-medium">{STRINGS.overLimitError}</p>
        )}
        {validation.kind === 'empty' && hoursInput.trim() === '' && (
          <p className="text-xs text-neutral-500">{STRINGS.empty}</p>
        )}
        {showError && (
          <p className="text-xs text-state-danger font-medium">{STRINGS.postError}</p>
        )}
        {showPending && (
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1 rounded-md bg-state-info-subtle px-2 py-0.5 text-xs text-neutral-700"
          >
            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
            {STRINGS.pending}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={buttonDisabled}
        >
          {isPending ? (
            <span className="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          ) : showSuccess ? (
            '\u2713'
          ) : (
            STRINGS.logButton
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {STRINGS.cancelButton}
        </Button>
      </div>
    </div>
  );
}
