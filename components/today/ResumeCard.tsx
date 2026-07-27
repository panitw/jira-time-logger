import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { format, isSameYear } from 'date-fns';
import { CornerDownLeft, Clock } from 'lucide-react';
import type { LoggedEntry } from '@/components/today/LoggedToday';
import type { ResumeTicket } from '@/hooks/useResumeTicket';
import {
  parseHours,
  hoursToSeconds,
  secondsToHours,
  secondsToHoursDisplay,
  MAX_HOURS_PER_ENTRY,
} from '@/lib/hours';
import { postWorklog } from '@/lib/jira-client';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import { setLastLoggedTicket } from '@/lib/storage/last-logged';
import { enqueue as enqueueOutbox } from '@/lib/storage/outbox';
import { formatStartedISO, todayDateString } from '@/lib/worklog-date';

/**
 * The "first move" — the popup's primary affordance (Story 7.3). Composes
 * over `useResumeTicket`'s resolved status (passed in as `resume` so the
 * offset boolean in `entrypoints/popup/App.tsx` and this card's own render
 * branch can never disagree about which state is current — Task 5).
 *
 * `shadow-lift` is applied EXACTLY here and nowhere else in the popup
 * source tree (AC1) — pinned by a source-level guard test
 * (`ResumeCard.test.tsx`).
 */

const STRINGS = {
  eyebrow: 'CONTINUE LOGGING',
  hoursLabel: (key: string) => `Hours for ${key}`,
  quickLabel: (n: number, key: string) => `Log ${n} hours to ${key}`,
  overLimitError: 'Hours per entry can’t exceed 24. Split into multiple entries if needed.',
  helperText: 'Use formats like 2.5h, 2h 30m, or 2:30',
  postError: 'Couldn’t log time — try again',
  pending: 'Pending — will retry',
};

const MESSAGE_ID = 'resume-card-message';

const QUICK_AMOUNTS = [0.5, 1, 2] as const;

type ResumeCardProps = {
  resume: ResumeTicket;
  onLogged: (entry: LoggedEntry) => void;
};

type ReadyTicket = Extract<ResumeTicket, { status: 'ready' }>;

type ValidationResult =
  | { kind: 'empty' }
  | { kind: 'valid'; hours: number; seconds: number }
  | { kind: 'unparseable' }
  | { kind: 'over-limit' };

function validateHours(input: string): ValidationResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'empty' };
  const parsed = parseHours(trimmed);
  if (parsed.kind !== 'ok') return { kind: 'unparseable' };
  if (parsed.hours > MAX_HOURS_PER_ENTRY) return { kind: 'over-limit' };
  return { kind: 'valid', hours: parsed.hours, seconds: hoursToSeconds(parsed.hours) };
}

function trimTrailingZero(hours: number): string {
  return hours.toFixed(1).replace(/\.0$/, '');
}

/** Bare (unit-less) display value for the hour input's pre-fill — the visible
 * "h" is a separate decorative suffix span, not part of the editable text. */
function prefillDisplayValue(seconds: number): string {
  if (seconds <= 0) return '1';
  return trimTrailingZero(secondsToHours(seconds));
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetweenLocalDays(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfLocalDay(a).getTime() - startOfLocalDay(b).getTime()) / MS_PER_DAY);
}

/** Recency note copy table (Dev Notes > "Recency note copy", AC2). */
export function recencyNote(startedAt: string, seconds: number, now: Date = new Date()): string {
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return '';
  const daysAgo = daysBetweenLocalDays(now, started);
  if (daysAgo <= 0) return `logged ${trimTrailingZero(secondsToHours(seconds))}h today`;
  if (daysAgo === 1) return 'last logged yesterday';
  if (daysAgo <= 6) return `last logged ${daysAgo} days ago`;
  return `last logged ${format(started, isSameYear(started, now) ? 'MMM d' : 'MMM d, yyyy')}`;
}

export function ResumeCard({ resume, onLogged }: ResumeCardProps): React.ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const seededKeyRef = useRef<string | null>(null);
  const [hoursInput, setHoursInput] = useState('1');
  const [submitState, setSubmitState] = useState<'idle' | 'pending' | 'error'>('idle');
  // Bumped (never compared by value) after a successful Enter-post so the
  // select-on-success effect below always re-fires — including when the
  // just-logged value is textually IDENTICAL to what was already in the
  // input (e.g. typing "3", logging it, seeing "3" again), where a plain
  // `[hoursInput]` dependency would see no change and never re-run.
  const [selectTick, setSelectTick] = useState(0);

  // D-7.3-9: once the card has first rendered with a resolved identity, that
  // identity — subtask, pre-fill, and write target — is FROZEN for the rest
  // of the popup session. `useResumeTicket`'s server-wins override is a
  // designed code path (a worklog made outside the extension, e.g. Jira web,
  // legitimately corrects a stale local record), but it must only ever
  // decide the card's identity BEFORE the card is on screen — retargeting a
  // card the user is already looking at (or typing into) silently redirects
  // a write the user never asked to redirect. Latched the same way
  // `focusedRef` below is: a ref, set at most once. The whole ticket
  // snapshot is frozen together (not just `key`) so the displayed subtask,
  // the recency note, the pre-fill, and the write target can never disagree
  // with each other for the remainder of this popup session. Across popup
  // sessions (a fresh mount) the override is free to correct a stale record
  // again — that is the whole reason it exists.
  const latchedTicketRef = useRef<ReadyTicket | null>(null);
  if (resume.status === 'ready' && !latchedTicketRef.current) {
    latchedTicketRef.current = resume;
  }
  const ticket = latchedTicketRef.current;

  // Seed the input from the latched record exactly once per popup session —
  // `ticket` cannot change identity once latched, so this can never fight an
  // enrichment re-render the way keying off `resume` directly used to.
  useEffect(() => {
    if (!ticket) return;
    if (seededKeyRef.current === ticket.key) return;
    seededKeyRef.current = ticket.key;
    setHoursInput(prefillDisplayValue(ticket.prefillSeconds));
  }, [ticket]);

  // Focus latch (D-7.3-4 / AC3): fires at most once per popup session. A
  // later enrichment re-render (Task 2's week-query refinement) must never
  // steal focus back from wherever the user has since moved it.
  //
  // D-7.4-17 (reverse focus-steal guard, Story 7.4 Task 8): on a cold open
  // this card can still be 'loading' for up to COLD_START_SKELETON_BUDGET_MS
  // (D-7.3-10). If the user presses `/` during that window and starts
  // typing into search, this effect firing when the card resolves to
  // 'ready' must NOT yank focus back out of search. One-line,
  // dependency-free: bail before flipping the latch if focus has already
  // been explicitly claimed by anything other than the document body — this
  // also protects against any future focus-claiming surface (7.9's
  // banners), not just search.
  useEffect(() => {
    if (!ticket) return;
    if (focusedRef.current) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    focusedRef.current = true;
    inputRef.current?.focus({ preventScroll: true });
  }, [ticket]);

  // Runs AFTER a successful Enter-post has re-rendered the input with the
  // just-logged value — selecting synchronously inside the mutation
  // callback would still see the pre-update DOM.
  useEffect(() => {
    if (selectTick === 0) return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [selectTick]);

  const key = ticket?.key ?? null;
  const summary = ticket?.summary ?? '';

  const logMutation = useMutation({
    mutationFn: async (vars: { seconds: number; started: string }) =>
      postWorklog(key!, { timeSpentSeconds: vars.seconds, started: vars.started }),
  });
  const { mutate: logMutate, isPending: isLogPending } = logMutation;

  // Shared write path for BOTH the Enter flow and the +0.5/+1/+2 buttons —
  // mirrors `QuickLogForm.tsx`'s onSuccess branching exactly (D-7.3-2's
  // "confirmed write only" writer rule, D-7.3-16's amber/red split, and the
  // "never invalidateQueries(['week-worklogs', …])" hazard both apply here
  // too — see `hooks/useTodayTotal.ts` lines 13–31).
  const submitSeconds = useCallback(
    (seconds: number, opts?: { resetInputTo: string }) => {
      if (!key || isLogPending) return;
      const started = formatStartedISO(todayDateString());
      setSubmitState('idle');
      logMutate(
        { seconds, started },
        {
          onSuccess: (result) => {
            if (result.kind === 'ok') {
              log.info('resume.worklog.posted', { key });
              void sendMessage('badge-update', { hoursMissing: 0 });
              void setLastLoggedTicket({
                key,
                summary,
                seconds,
                startedAt: started,
                recordedAt: new Date().toISOString(),
              }).catch((e) => {
                log.error('last-logged.write.failed', { key, cause: String(e) });
              });
              const entry: LoggedEntry = {
                key,
                summary,
                hoursDisplay: secondsToHoursDisplay(seconds),
                started: todayDateString(),
                seconds,
                worklogId: result.value.id,
              };
              onLogged(entry);
              if (opts) {
                setHoursInput(opts.resetInputTo);
                setSelectTick((t) => t + 1);
              }
            } else if (result.kind === 'network' || result.kind === 'rate-limited') {
              log.warn('resume.worklog.post.failed', { key, kind: result.kind });
              void enqueueOutbox({
                kind: 'post',
                endpoint: `rest/api/3/issue/${encodeURIComponent(key)}/worklog`,
                issueKey: key,
                body: { timeSpentSeconds: seconds, started },
              }).catch((e) => {
                log.error('outbox.enqueue.failed', { key, cause: String(e) });
              });
              setSubmitState('pending');
            } else {
              log.warn('resume.worklog.post.failed', { key, kind: result.kind });
              setSubmitState('error');
            }
          },
          onError: (e) => {
            log.error('resume.worklog.post.error', { key, error: String(e) });
            setSubmitState('error');
          },
        },
      );
    },
    [key, summary, isLogPending, logMutate, onLogged],
  );

  const validation = validateHours(hoursInput);
  const isAmber = validation.kind === 'unparseable' || validation.kind === 'over-limit';
  const isErrorMessage = !isAmber && submitState === 'error';
  const hasVisibleMessage = isAmber || isErrorMessage;

  const handleEnter = useCallback(() => {
    if (validation.kind !== 'valid' || isLogPending) return;
    submitSeconds(validation.seconds, { resetInputTo: trimTrailingZero(validation.hours) });
  }, [validation, isLogPending, submitSeconds]);

  const handleQuick = useCallback(
    (hours: number) => {
      // +0.5/+1/+2 post that exact amount immediately — they never touch
      // the input value (D-7.3-13), so no `resetInputTo` is passed.
      submitSeconds(hoursToSeconds(hours));
    },
    [submitSeconds],
  );

  if (resume.status === 'none') return null;

  if (resume.status === 'loading' || !ticket) {
    return (
      <div className="relative z-[1] flex flex-col gap-[11px] rounded-lg border border-border bg-surface p-[14px] shadow-lift">
        <div className="h-[11px] w-32 animate-skeleton rounded bg-border" />
        <div className="flex flex-col gap-[3px]">
          <div className="h-[18px] w-24 animate-skeleton rounded bg-border" />
          <div className="h-[14px] w-full animate-skeleton rounded bg-border" />
        </div>
        <div className="h-[34px] w-full animate-skeleton rounded-md bg-border" />
        {/* Finding 5: matches the real card's message-region reserve
            exactly (same `min-h-[1.25rem]`, same preceding gap) so the flip
            from skeleton to the ready card never changes the card's total
            height — only the offset boolean in App.tsx changes. */}
        <div className="min-h-[1.25rem]" />
      </div>
    );
  }

  return (
    <div className="relative z-[1] flex flex-col gap-[11px] rounded-lg border border-border bg-surface p-[14px] shadow-lift">
      <div className="flex items-center justify-between gap-2">
        <span className="font-chrome text-eyebrow uppercase text-primary">{STRINGS.eyebrow}</span>
        <span className="tabular text-[11.5px] text-faint">
          {recencyNote(ticket.startedAt, ticket.prefillSeconds)}
        </span>
      </div>

      <div className="flex flex-col gap-[3px]">
        <span className="tabular text-subheading text-primary">{ticket.key}</span>
        <span className="text-body text-foreground line-clamp-2">{ticket.summary}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="flex h-[34px] flex-1 items-center gap-1.5 rounded-md border-[1.5px] border-primary px-[9px] focus-within:ring-focus">
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={hoursInput}
            onChange={(e) => {
              setHoursInput(e.target.value);
              setSubmitState('idle');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleEnter();
              }
            }}
            aria-label={STRINGS.hoursLabel(ticket.key)}
            aria-keyshortcuts="Enter"
            aria-invalid={isAmber || undefined}
            aria-describedby={hasVisibleMessage ? MESSAGE_ID : undefined}
            // D-7.4-17: `/` is never a legitimate character in this field
            // (only hour syntax — `lib/hours.ts`), so it does not consume
            // Story 7.4's `/`-focuses-search shortcut the way a generic
            // text input would.
            data-slash-passthrough="true"
            className="tabular w-full min-w-0 flex-1 bg-transparent text-[14px] focus:outline-none"
          />
          <span aria-hidden="true" className="tabular text-[14px] text-faint">
            h
          </span>
          <span
            aria-hidden="true"
            className="ml-auto flex shrink-0 items-center rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground"
          >
            <CornerDownLeft aria-hidden="true" className="h-[13px] w-[13px]" />
          </span>
        </div>

        {QUICK_AMOUNTS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={isLogPending}
            aria-label={STRINGS.quickLabel(n, ticket.key)}
            onClick={() => handleQuick(n)}
            className="h-[33px] shrink-0 rounded-md border border-border bg-surface px-[9px] tabular text-[12.5px] hover:bg-neutral-100 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-focus"
          >
            {`+${trimTrailingZero(n)}`}
          </button>
        ))}
      </div>

      <div id={MESSAGE_ID} className="min-h-[1.25rem]">
        {validation.kind === 'unparseable' && (
          <p role="alert" className="text-[11.5px] text-amber-ink">
            {STRINGS.helperText}
          </p>
        )}
        {validation.kind === 'over-limit' && (
          <p role="alert" className="text-[11.5px] font-medium text-amber-ink">
            {STRINGS.overLimitError}
          </p>
        )}
        {isErrorMessage && (
          <p role="alert" className="text-[11.5px] font-medium text-state-danger">
            {STRINGS.postError}
          </p>
        )}
        {!isAmber && submitState === 'pending' && (
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1 rounded-md bg-state-info-subtle px-2 py-0.5 text-[11.5px] text-neutral-700"
          >
            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
            {STRINGS.pending}
          </span>
        )}
      </div>
    </div>
  );
}
