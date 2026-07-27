import { useMutation } from '@tanstack/react-query';
import { Check, Clock, LoaderCircle } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { LoggedEntry } from '@/components/today/LoggedToday';
import { Button } from '@/components/ui/button';
import { secondsToHoursDisplay, hoursToSeconds } from '@/lib/hours';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import { logFullDayPto, logHalfDayPto } from '@/lib/pto';
import { enqueue as enqueueOutbox } from '@/lib/storage/outbox';
import {
  ptoSubtaskKeyItem,
  ptoSubtaskSummaryItem,
  targetHoursItem,
} from '@/lib/storage/settings';
import { formatStartedISO, todayDateString } from '@/lib/worklog-date';

const STRINGS = {
  trigger: 'Mark today as time off',
  fullDay: (h: number) => `Full day (${h}h)`,
  halfDay: (h: number) => `Half day (${formatHours(h)}h)`,
  fullDayAria: (h: number) => `Mark today as full-day time off (${h}h)`,
  halfDayAria: (h: number) => `Mark today as half-day time off (${formatHours(h)}h)`,
  notConfiguredPrefix: 'Time off subtask not configured. Configure in ',
  settings: 'Settings',
  postError: 'Couldn’t mark time off — try again',
  pending: 'Pending — will retry',
  defaultSummary: 'PTO',
  menuLabel: 'Time off options',
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
    return <div aria-hidden="true" />;
  }

  // ---- Disabled state (AC #7): PTO subtask not configured (null or empty) ----
  if (!ptoKey) {
    return (
      <div className="relative inline-block">
        <Button
          variant="ghost"
          size="sm"
          disabled
          aria-disabled="true"
          aria-describedby="pto-disabled-help"
        >
          {STRINGS.trigger}
        </Button>
        {/* Absolutely positioned above the trigger — a bottom action bar has a
         * fixed height (Story 7.2 AC4); this transient helper text must never
         * grow it. */}
        <p
          id="pto-disabled-help"
          className="absolute bottom-full left-0 mb-1 w-56 text-xs text-neutral-500"
        >
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
    <div className="relative inline-block">
      <Button
        ref={triggerRef}
        variant="ghost"
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
          className="absolute left-0 bottom-full z-10 mb-1 w-44 rounded-md border border-neutral-200 bg-white p-1 shadow-md"
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
              <LoaderCircle aria-hidden="true" className="h-3 w-3 motion-safe:animate-spin" />
            ) : showSuccess ? (
              <Check aria-hidden="true" className="h-3 w-3" />
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
            // AC4 survivor: red fires only here, when the time-off post came
            // back non-retryable — Jira actually refused this write.
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
