import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isValid } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { WeeklyGrid } from '@/components/week/WeeklyGrid';
import { useWeekWorklogs } from '@/hooks/useWeekWorklogs';
import { secondsToHoursDisplay } from '@/lib/hours';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import {
  targetHoursItem,
  catchAllProjectKeyItem,
  ptoSubtaskKeyItem,
} from '@/lib/storage/settings';
import type { ISODate } from '@/lib/storage/view-state';
import {
  getMarkDoneState,
  clearWeekMarkedDone,
} from '@/lib/storage/view-state';
import { buildWeekGrid, computeDayStatuses } from '@/lib/week-grid';

type Props = { weekOf: ISODate };

/** Local `YYYY-MM-DD` (not UTC) so today/future comparisons match local days. */
function localToday(): ISODate {
  return format(new Date(), 'yyyy-MM-dd');
}

const WORKDAYS_PER_WEEK = 5;
const SKELETON_ROW_COUNT = 5;
const DAY_COLUMN_COUNT = 7;

const STRINGS = {
  headingPrefix: 'Week of',
  invalidDate: 'Unknown week',
  connectHeading: 'Connect to Jira',
  connectBody: 'Your session expired. Reconnect to load this week.',
  connectCta: 'Connect to Jira',
  errorHeading: "Couldn't load this week",
  errorBody: 'Check your connection and try again.',
  retry: 'Try again',
  weekDone: 'Week done',
  undo: 'Undo',
  undoLabel: 'Undo mark week as done',
};

function openOptions(): void {
  chrome.runtime.openOptionsPage();
}

export function WeekView({ weekOf }: Props): React.ReactElement {
  const parsed = parseISO(weekOf);
  const displayDate = isValid(parsed)
    ? format(parsed, 'EEE, MMM d')
    : STRINGS.invalidDate;

  const [targetHours, setTargetHours] = useState(8);
  const [catchAllProjectKey, setCatchAllProjectKey] = useState('');
  const [ptoSubtaskKey, setPtoSubtaskKey] = useState('');

  useEffect(() => {
    void targetHoursItem.getValue().then(setTargetHours);
  }, []);
  useEffect(() => {
    void catchAllProjectKeyItem.getValue().then((v) => setCatchAllProjectKey(v ?? ''));
  }, []);
  useEffect(() => {
    void ptoSubtaskKeyItem.getValue().then((v) => setPtoSubtaskKey(v ?? ''));
  }, []);

  // Mark-week-as-done flag (Story 4.5). Week-aware: the stored `weekOf` must
  // match THIS view's week. Re-read on mount and after mark/undo; a local
  // useState refreshed by the callbacks is sufficient (no cross-surface live
  // sync required for v1).
  const [isMarkedDone, setIsMarkedDone] = useState(false);
  useEffect(() => {
    let active = true;
    void getMarkDoneState().then((state) => {
      if (active) setIsMarkedDone(state?.weekOf === weekOf);
    });
    return () => {
      active = false;
    };
  }, [weekOf]);

  const handleMarkedDone = useCallback(() => {
    setIsMarkedDone(true);
  }, []);

  const handleUndo = useCallback(() => {
    clearWeekMarkedDone()
      .then(() => {
        void sendMessage('badge-update', { hoursMissing: 0 });
        setIsMarkedDone(false);
      })
      .catch((e: unknown) => {
        // Storage write failed — leave the week marked done (the user can
        // retry) rather than swallow an unhandled rejection.
        log.error('week.undo.failed', { cause: String(e) });
      });
  }, []);

  const query = useWeekWorklogs(weekOf);
  const queryClient = useQueryClient();

  // After a successful cell/row mutation, invalidate the week query so the grid,
  // totals, and 4.2 day-status colors re-derive from authoritative data (AC #8).
  // Do NOT hand-mutate query.data — invalidation is the source of truth.
  const handleMutated = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['week-worklogs', weekOf] });
  }, [queryClient, weekOf]);

  const grid = useMemo(() => {
    if (!query.data) return null;
    return buildWeekGrid(query.data, {
      weekOf,
      catchAllProjectKey,
      ptoSubtaskKey,
    });
  }, [query.data, weekOf, catchAllProjectKey, ptoSubtaskKey]);

  const today = useMemo(() => localToday(), []);
  const dayStatuses = useMemo(
    () => (grid ? computeDayStatuses(grid, { targetHours, today }) : null),
    [grid, targetHours, today],
  );

  const loggedSeconds = grid
    ? grid.dayTotalsSeconds.reduce((sum, s) => sum + s, 0)
    : 0;
  const loggedDisplay = secondsToHoursDisplay(loggedSeconds).replace(/h$/, '');
  const targetDisplay = targetHours * WORKDAYS_PER_WEEK;

  return (
    <div className="motion-safe:animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">
          {STRINGS.headingPrefix} {displayDate}
        </h2>
        {isMarkedDone ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
            {STRINGS.weekDone}
            <span aria-hidden className="text-neutral-300">
              ·
            </span>
            <button
              type="button"
              aria-label={STRINGS.undoLabel}
              onClick={handleUndo}
              className="rounded text-neutral-500 underline-offset-2 hover:text-neutral-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {STRINGS.undo}
            </button>
          </span>
        ) : null}
      </div>
      {!query.isPending && !query.isError && (
        <p className="mt-1 text-sm text-neutral-500">
          <span className="font-mono">
            {loggedSeconds > 0 ? loggedDisplay : '0'}
          </span>{' '}
          / {targetDisplay}h
        </p>
      )}

      <div className="mt-3">
        {query.isPending ? (
          <WeekSkeleton />
        ) : query.isError ? (
          (query.error as { kind: string }).kind === 'auth-expired' ? (
            <ConnectFallback />
          ) : (
            <WeekErrorState onRetry={() => void query.refetch()} />
          )
        ) : grid ? (
          // Marked-done: faint grayed tint signalling the week is closed, but
          // NOT pointer-events-none — edits stay possible and visible (AC #8,
          // FR26); only explicit Undo clears the flag.
          <div
            className={
              isMarkedDone
                ? 'rounded-md bg-neutral-100/60 opacity-60 motion-safe:transition-opacity'
                : undefined
            }
            data-testid={isMarkedDone ? 'week-grayed' : undefined}
          >
            <WeeklyGrid
              grid={grid}
              weekOf={weekOf}
              onMutated={handleMutated}
              ptoSubtaskKey={ptoSubtaskKey || null}
              targetHours={targetHours}
              isMarkedDone={isMarkedDone}
              onMarkedDone={handleMarkedDone}
              // Finding 13: pass the SAME memoised `today` that derived
              // `dayStatuses` above — `WeeklyGrid` otherwise falls back to
              // its own default-parameter `todayDateString()`, re-evaluated
              // on every render, so a status frozen at mount and a note
              // re-read on a later render could disagree about "today"
              // across a local-midnight boundary (D-7.6-35's own "how we'd
              // know it was wrong").
              today={today}
              {...(dayStatuses ? { dayStatuses } : {})}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WeekSkeleton(): React.ReactElement {
  return (
    <div data-testid="week-skeleton" aria-hidden>
      <div className="flex gap-1">
        {Array.from({ length: DAY_COLUMN_COUNT }).map((_, i) => (
          <div
            key={i}
            className="h-5 flex-1 rounded bg-neutral-100 motion-safe:animate-pulse"
          />
        ))}
      </div>
      <div className="mt-2 space-y-2">
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
          <div
            key={i}
            className="h-6 rounded bg-neutral-100 motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

function ConnectFallback(): React.ReactElement {
  return (
    <div className="text-center">
      <h3 className="text-base font-semibold text-neutral-900">
        {STRINGS.connectHeading}
      </h3>
      <p className="mt-2 text-sm text-neutral-500">{STRINGS.connectBody}</p>
      <div className="mt-4">
        <Button variant="primary" onClick={openOptions}>
          {STRINGS.connectCta}
        </Button>
      </div>
    </div>
  );
}

function WeekErrorState({
  onRetry,
}: {
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="text-center">
      <h3 className="text-base font-semibold text-neutral-900">
        {STRINGS.errorHeading}
      </h3>
      <p className="mt-2 text-sm text-neutral-500">{STRINGS.errorBody}</p>
      <div className="mt-4">
        <Button variant="secondary" onClick={onRetry}>
          {STRINGS.retry}
        </Button>
      </div>
    </div>
  );
}
