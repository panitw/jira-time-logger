import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isValid } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { WeeklyGrid } from '@/components/week/WeeklyGrid';
import { useWeekWorklogs } from '@/hooks/useWeekWorklogs';
import { secondsToHoursDisplay } from '@/lib/hours';
import {
  targetHoursItem,
  catchAllProjectKeyItem,
  ptoSubtaskKeyItem,
} from '@/lib/storage/settings';
import type { ISODate } from '@/lib/storage/view-state';
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
      <h2 className="text-lg font-semibold text-neutral-900">
        {STRINGS.headingPrefix} {displayDate}
      </h2>
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
          <WeeklyGrid
            grid={grid}
            onMutated={handleMutated}
            {...(dayStatuses ? { dayStatuses } : {})}
          />
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
