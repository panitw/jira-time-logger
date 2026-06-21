import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { logFullDayPto, logHalfDayPto } from '@/lib/pto';
import { secondsToHoursDisplay, hoursToSeconds } from '@/lib/hours';
import { formatStartedISO, todayDateString } from '@/lib/worklog-date';
import {
  ptoSubtaskKeyItem,
  ptoSubtaskSummaryItem,
  targetHoursItem,
} from '@/lib/storage/settings';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import { enqueue as enqueueOutbox } from '@/lib/storage/outbox';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LoggedEntry } from '@/components/today/LoggedToday';

const STRINGS = {
  trigger: 'Mark today as PTO',
  fullDay: (h: number) => `Full day (${h}h)`,
  halfDay: (h: number) => `Half day (${formatHours(h)}h)`,
  fullDayAria: (h: number) => `Mark today as full-day PTO (${h}h)`,
  halfDayAria: (h: number) => `Mark today as half-day PTO (${formatHours(h)}h)`,
  notConfiguredPrefix: 'PTO subtask not configured. Configure in ',
  settings: 'Settings',
  postError: 'Couldn’t mark PTO — try again',
  pending: 'Pending — will retry',
  defaultSummary: 'PTO',
  menuLabel: 'PTO options',
};

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1).replace(/\.0$/, '');
}

type PtoQuickActionProps = {
  onLogged: (entry: LoggedEntry) => void;
};

type Variant = 'full' | 'half';

export function PtoQuickAction({
  onLogged,
}: PtoQuickActionProps): React.ReactElement {
  // `undefined` = settings not yet loaded (avoids flashing the "not configured"
  // state on mount); `null`/'' = explicitly unconfigured.
  const [ptoKey, setPtoKey] = useState<string | null | undefined>(undefined);
  const [ptoSummary, setPtoSummary] = useState<string | null>(null);
  const [targetHours, setTargetHours] = useState(8);
  const [open, setOpen] = useState(false);
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPending, setShowPending] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void ptoSubtaskKeyItem.getValue().then(setPtoKey);
    void ptoSubtaskSummaryItem.getValue().then(setPtoSummary);
    void targetHoursItem.getValue().then(setTargetHours);
  }, []);

  useEffect(() => {
    return () => clearTimeout(successTimeoutRef.current);
  }, []);

  const closePopover = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Focus first action on open.
  useEffect(() => {
    if (open) firstActionRef.current?.focus();
  }, [open]);

  // Esc + click-outside dismissal while open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePopover();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      closePopover(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, closePopover]);

  const mutation = useMutation({
    mutationFn: async (variant: Variant) => {
      const started = formatStartedISO(todayDateString());
      const fn = variant === 'full' ? logFullDayPto : logHalfDayPto;
      const result = await fn(ptoKey!, targetHours, started);
      return { variant, started, result };
    },
    onSuccess: ({ variant, started, result }) => {
      if (result.kind === 'ok') {
        const hours = variant === 'full' ? targetHours : targetHours / 2;
        const seconds = hoursToSeconds(hours);
        log.info('pto.posted', { key: ptoKey, variant });
        void sendMessage('badge-update', { hoursMissing: 0 });
        const entry: LoggedEntry = {
          key: ptoKey!,
          summary: ptoSummary ?? STRINGS.defaultSummary,
          hoursDisplay: secondsToHoursDisplay(seconds),
          started,
          seconds,
          worklogId: result.value.id,
        };
        setShowSuccess(true);
        successTimeoutRef.current = setTimeout(() => {
          setShowSuccess(false);
          setOpen(false);
          triggerRef.current?.focus();
          onLogged(entry);
        }, 200);
      } else if (result.kind === 'network' || result.kind === 'rate-limited') {
        // Transient failure — queue the PTO post durably so it retries on
        // reconnect, and surface the "Pending — will retry" chip.
        const hours = variant === 'full' ? targetHours : targetHours / 2;
        const seconds = hoursToSeconds(hours);
        log.warn('pto.post.failed', { key: ptoKey, kind: result.kind });
        void enqueueOutbox({
          kind: 'post',
          endpoint: `rest/api/3/issue/${encodeURIComponent(ptoKey!)}/worklog`,
          issueKey: ptoKey!,
          body: { timeSpentSeconds: seconds, started },
        }).catch((e) => {
          log.error('outbox.enqueue.failed', { key: ptoKey, cause: String(e) });
        });
        setShowPending(true);
      } else {
        log.warn('pto.post.failed', { key: ptoKey, kind: result.kind });
        setShowError(true);
      }
    },
    onError: (e) => {
      log.error('pto.post.error', { key: ptoKey, error: String(e) });
      setShowError(true);
    },
  });

  const { mutate, isPending } = mutation;

  const handleSubmit = useCallback(
    (variant: Variant) => {
      // Guard against double-post: in-flight mutation, missing key, or the
      // brief post-success window (popover lingers ~200ms showing ✓).
      if (isPending || showSuccess || !ptoKey) return;
      setShowError(false);
      setShowPending(false);
      mutate(variant);
    },
    [isPending, showSuccess, ptoKey, mutate],
  );

  const handleTriggerClick = useCallback(() => {
    setShowError(false);
    setShowPending(false);
    setOpen((prev) => !prev);
  }, []);

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  // While settings are still loading (`undefined`), render nothing rather than
  // flashing the disabled "not configured" state.
  if (ptoKey === undefined) {
    return <div className="mt-2" aria-hidden="true" />;
  }

  // ---- Disabled state (AC #7): PTO subtask not configured (null or empty) ----
  if (!ptoKey) {
    return (
      <div className="mt-2">
        <Button
          variant="primary"
          size="sm"
          disabled
          aria-disabled="true"
          aria-describedby="pto-disabled-help"
        >
          {STRINGS.trigger}
        </Button>
        <p id="pto-disabled-help" className="mt-1 text-xs text-neutral-500">
          {STRINGS.notConfiguredPrefix}
          <button
            type="button"
            onClick={openOptions}
            className="text-accent hover:underline"
          >
            {STRINGS.settings}
          </button>
          {'.'}
        </p>
      </div>
    );
  }

  // ---- Enabled state ----
  const halfHours = targetHours / 2;
  return (
    <div className="relative mt-2 inline-block">
      <Button
        ref={triggerRef}
        variant="primary"
        size="sm"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={handleTriggerClick}
      >
        {STRINGS.trigger}
      </Button>

      {open && (
        <div
          ref={popoverRef}
          role="menu"
          aria-label={STRINGS.menuLabel}
          className="absolute left-0 top-full z-10 mt-1 w-44 rounded-md border border-neutral-200 bg-white p-1 shadow-md"
        >
          <Button
            ref={firstActionRef}
            variant="primary"
            size="sm"
            role="menuitem"
            className="w-full justify-start"
            disabled={isPending}
            aria-label={STRINGS.fullDayAria(targetHours)}
            onClick={() => handleSubmit('full')}
          >
            {isPending ? (
              <span className="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : showSuccess ? (
              '✓'
            ) : (
              STRINGS.fullDay(targetHours)
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            role="menuitem"
            className="mt-1 w-full justify-start"
            disabled={isPending}
            aria-label={STRINGS.halfDayAria(halfHours)}
            onClick={() => handleSubmit('half')}
          >
            {STRINGS.halfDay(halfHours)}
          </Button>

          {showError && (
            <p className="mt-1 px-1 text-xs text-state-danger font-medium">
              {STRINGS.postError}
            </p>
          )}
          {showPending && (
            <span
              role="status"
              aria-live="polite"
              className="mt-1 mx-1 inline-flex items-center gap-1 rounded-md bg-state-info-subtle px-2 py-0.5 text-xs text-neutral-700"
            >
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              {STRINGS.pending}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
