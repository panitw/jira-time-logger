import { useMutation } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { hoursToSeconds, secondsToCellDisplay } from '@/lib/hours';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import { logFullDayPto, logHalfDayPto } from '@/lib/pto';
import { enqueue as enqueueOutbox } from '@/lib/storage/outbox';
import { formatStartedISO } from '@/lib/worklog-date';

const STRINGS = {
  triggerAria: (dayName: string, dayLabel: string) =>
    `Time off and worklog actions for ${dayName}, ${dayLabel}`,
  menuLabel: 'Time off and worklog actions',
  fullDay: (h: number) => `Mark full-day time off (${formatHours(h)}h)`,
  halfDay: (h: number) => `Mark half-day time off (${formatHours(h)}h)`,
  addWorklog: 'Add a worklog…',
  currently: (display: string) => `Currently: ${display} logged`,
  notConfiguredPrefix: 'Time off subtask not configured. Configure in ',
  settings: 'Settings',
  postError: 'Couldn’t mark time off — try again',
  pending: 'Pending — will retry',
};

/** Half-hour label like PtoQuickAction: `4` not `4.0`, `7.5` kept. */
function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1).replace(/\.0$/, '');
}

/** `Currently:` footer total — `4.0` cell display rendered as `4h`, `0` as `0h`. */
function loggedDisplay(seconds: number): string {
  if (seconds <= 0) return '0h';
  return `${secondsToCellDisplay(seconds).replace(/\.0$/, '')}h`;
}

type Variant = 'full' | 'half';

type Props = {
  dayIndex: number;
  dayName: string;
  dayLabel: string;
  dayISO: string;
  loggedSeconds: number;
  ptoSubtaskKey: string | null;
  targetHours: number;
  onAddWorklog: () => void;
  onMutated?: () => void;
  /** Story 7.7, AC3/D-7.7-31: the weekend column tint applies at header,
   * cell, AND totals level as one recessive object — the header's TEXT
   * (not just its background) dims to `text-faint` for Sat/Sun
   * (`imports/jira-time-logger.dc.html:787`). This trigger renders the
   * header's visible day-name text, so the dimming has to reach in here. */
  weekend?: boolean;
};

export function PtoPopover({
  dayIndex,
  dayName,
  dayLabel,
  dayISO,
  loggedSeconds,
  ptoSubtaskKey,
  targetHours,
  onAddWorklog,
  onMutated,
  weekend = false,
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [showError, setShowError] = useState(false);
  const [showPending, setShowPending] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  // When PTO is unconfigured the first two actions are disabled (not focusable),
  // so focus-on-open targets the first ENABLED action instead.
  const addWorklogRef = useRef<HTMLButtonElement>(null);
  // A successful post resolves the popover exactly once; guards a second submit
  // in the brief window before close (mirrors PtoQuickAction's showSuccess).
  const resolvedRef = useRef(false);

  const shortLabel = STRINGS_DAY_SHORT[dayIndex] ?? dayName.slice(0, 3);
  const footerId = `pto-popover-current-${dayIndex}`;

  const closePopover = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Focus the first focusable action on open. When PTO is unconfigured the two
  // PTO buttons are disabled (and thus not focusable), so fall back to the
  // always-enabled "Add a worklog…" action rather than letting focus drop to
  // <body> (which would strand keyboard users outside the menu).
  useEffect(() => {
    if (!open) return;
    if (ptoSubtaskKey) firstActionRef.current?.focus();
    else addWorklogRef.current?.focus();
  }, [open, ptoSubtaskKey]);

  // Esc (capture) + click-outside / focus-out dismissal while open. The
  // `focusout` arm closes the menu when focus moves to another element outside
  // it — e.g. another day header's trigger is activated via keyboard (which
  // fires `click` but no `pointerdown`), guaranteeing at most one open popover.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePopover();
      }
    };
    const isInside = (target: Node | null): boolean =>
      Boolean(
        target &&
          (popoverRef.current?.contains(target) ||
            triggerRef.current?.contains(target)),
      );
    const onPointerDown = (e: MouseEvent): void => {
      if (isInside(e.target as Node)) return;
      closePopover(false);
    };
    const onFocusOut = (e: FocusEvent): void => {
      const next = e.relatedTarget as Node | null;
      // Focus left the page or moved outside this popover/trigger → close.
      if (next && !isInside(next)) closePopover(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, [open, closePopover]);

  const mutation = useMutation({
    mutationFn: async (variant: Variant) => {
      const started = formatStartedISO(dayISO);
      const fn = variant === 'full' ? logFullDayPto : logHalfDayPto;
      // ptoSubtaskKey is non-null here (guarded in handleSubmit).
      const result = await fn(ptoSubtaskKey as string, targetHours, started);
      return { variant, started, result };
    },
    onSuccess: ({ variant, started, result }) => {
      if (result.kind === 'ok') {
        log.info('pto.posted', { key: ptoSubtaskKey, variant });
        void sendMessage('badge-update', { hoursMissing: 0 });
        onMutated?.();
        closePopover();
        return;
      }
      if (result.kind === 'network' || result.kind === 'rate-limited') {
        const hours = variant === 'full' ? targetHours : targetHours / 2;
        const seconds = hoursToSeconds(hours);
        log.warn('pto.post.failed', { key: ptoSubtaskKey, kind: result.kind });
        void enqueueOutbox({
          kind: 'post',
          endpoint: `rest/api/3/issue/${encodeURIComponent(ptoSubtaskKey as string)}/worklog`,
          issueKey: ptoSubtaskKey as string,
          body: { timeSpentSeconds: seconds, started },
        }).catch((e) => {
          log.error('outbox.enqueue.failed', { key: ptoSubtaskKey, cause: String(e) });
        });
        setShowPending(true);
        resolvedRef.current = false;
        return;
      }
      log.warn('pto.post.failed', { key: ptoSubtaskKey, kind: result.kind });
      setShowError(true);
      resolvedRef.current = false;
    },
    onError: (e) => {
      log.error('pto.post.error', { key: ptoSubtaskKey, error: String(e) });
      setShowError(true);
      resolvedRef.current = false;
    },
  });

  const { mutate, isPending } = mutation;

  const handleSubmit = useCallback(
    (variant: Variant) => {
      // Guard against double-post: in-flight, missing key, or already resolved.
      if (isPending || resolvedRef.current || !ptoSubtaskKey) return;
      resolvedRef.current = true;
      setShowError(false);
      setShowPending(false);
      mutate(variant);
    },
    [isPending, ptoSubtaskKey, mutate],
  );

  const handleTriggerClick = useCallback(() => {
    setShowError(false);
    setShowPending(false);
    resolvedRef.current = false;
    setOpen((prev) => !prev);
  }, []);

  const handleAddWorklog = useCallback(() => {
    closePopover(false);
    onAddWorklog();
  }, [closePopover, onAddWorklog]);

  function openOptions(): void {
    chrome.runtime.openOptionsPage();
  }

  const halfHours = targetHours / 2;
  const ptoConfigured = Boolean(ptoSubtaskKey);

  return (
    <span className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={STRINGS.triggerAria(dayName, dayLabel)}
        {...(open ? { 'aria-describedby': footerId } : {})}
        onClick={handleTriggerClick}
        className={`inline-flex h-8 min-w-[2rem] items-center justify-end rounded px-1 text-xs font-medium hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${weekend ? 'text-faint' : 'text-neutral-500'}`}
      >
        {shortLabel}
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="menu"
          aria-label={STRINGS.menuLabel}
          className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-neutral-200 bg-white p-1 text-left shadow-md"
        >
          <p className="px-2 py-1 text-sm font-semibold text-neutral-900">
            {dayName}
          </p>

          <Button
            ref={firstActionRef}
            variant="primary"
            size="sm"
            role="menuitem"
            className="w-full justify-start"
            disabled={!ptoConfigured || isPending}
            {...(!ptoConfigured ? { 'aria-disabled': 'true' as const } : {})}
            onClick={() => handleSubmit('full')}
          >
            {STRINGS.fullDay(targetHours)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            role="menuitem"
            className="mt-1 w-full justify-start"
            disabled={!ptoConfigured || isPending}
            {...(!ptoConfigured ? { 'aria-disabled': 'true' as const } : {})}
            onClick={() => handleSubmit('half')}
          >
            {STRINGS.halfDay(halfHours)}
          </Button>
          <Button
            ref={addWorklogRef}
            variant="ghost"
            size="sm"
            role="menuitem"
            className="mt-1 w-full justify-start"
            onClick={handleAddWorklog}
          >
            {STRINGS.addWorklog}
          </Button>

          {!ptoConfigured && (
            <p className="mt-1 px-2 text-xs text-neutral-500">
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
          )}

          {showError && (
            // AC4 survivor: red fires only here, when the time-off post came
            // back non-retryable — Jira actually refused this write.
            <p
              className="mt-1 px-2 text-xs font-medium text-state-danger"
              aria-live="assertive"
            >
              {STRINGS.postError}
            </p>
          )}
          {showPending && (
            <span
              role="status"
              aria-live="polite"
              className="mt-1 mx-2 inline-flex items-center gap-1 rounded-md bg-state-info-subtle px-2 py-0.5 text-xs text-neutral-700"
            >
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              {STRINGS.pending}
            </span>
          )}

          <p
            id={footerId}
            className="mt-1 border-t border-neutral-100 px-2 pt-1 text-xs text-neutral-500"
          >
            {STRINGS.currently(loggedDisplay(loggedSeconds))}
          </p>
        </div>
      )}
    </span>
  );
}

const STRINGS_DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
