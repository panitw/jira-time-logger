import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { WeekChromeHeader } from '@/components/week/WeekChromeHeader';
import { WeeklyGrid } from '@/components/week/WeeklyGrid';
import { useWeekWorklogs } from '@/hooks/useWeekWorklogs';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import type { FullPageSection } from '@/lib/open-full-page';
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

type Props = {
  weekOf: ISODate;
  /** Story 7.7, D-7.7-25: `weekOf` lives as state on the full page (App.tsx);
   * these fire the chrome header's prev/next nav. Required, not defaulted
   * (Finding 14b): the only production caller (`entrypoints/fullpage/
   * App.tsx`) always wires both, and a silent no-op default would let a
   * FUTURE caller drop the wiring invisibly — the type system should reject
   * that, not swallow it. */
  onPrevWeek: () => void;
  onNextWeek: () => void;
  /** Story 7.10, D-7.10-30: the shared Week/Manager/Settings tab row, now
   * mounted inside `WeekChromeHeader` instead of the shell's (removed)
   * plain `<nav>`. */
  section: FullPageSection;
  onSectionChange: (section: FullPageSection) => void;
  showManagerTab: boolean;
};

/** Local `YYYY-MM-DD` (not UTC) so today/future comparisons match local days. */
function localToday(): ISODate {
  return format(new Date(), 'yyyy-MM-dd');
}

const SKELETON_ROW_COUNT = 5;
const DAY_COLUMN_COUNT = 7;

const STRINGS = {
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

export function WeekView({
  weekOf,
  onPrevWeek,
  onNextWeek,
  section,
  onSectionChange,
  showManagerTab,
}: Props): React.ReactElement {
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

  return (
    <div className="motion-safe:animate-fade-in">
      {/* Story 7.7, AC2: the chrome header supersedes the old plain-text
       * heading + logged/target paragraph — it paints unconditionally
       * (title/eyebrow/nav) even before `grid` loads, same pattern as the
       * popup's `ChromeHeader.tsx`; the week figure/bar and the (now
       * relocated, sole) "Mark week as done" CTA gate on `grid`. */}
      <WeekChromeHeader
        weekOf={weekOf}
        section={section}
        onSectionChange={onSectionChange}
        showManagerTab={showManagerTab}
        grid={grid}
        targetHours={targetHours}
        today={today}
        isMarkedDone={isMarkedDone}
        onMarkedDone={handleMarkedDone}
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
      />
      {isMarkedDone ? (
        <div className="mt-2 flex justify-end">
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
        </div>
      ) : null}

      <div className="mt-3">
        {query.isPending ? (
          <WeekSkeleton />
        ) : query.isError ? (
          (query.error as { kind: string }).kind === 'auth-expired' ? (
            <ConnectFallback onSectionChange={onSectionChange} />
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
              onMutated={handleMutated}
              onSectionChange={onSectionChange}
              ptoSubtaskKey={ptoSubtaskKey || null}
              targetHours={targetHours}
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

// Finding 9: this session-expired CTA used to call
// `chrome.runtime.openOptionsPage()`, which now (D-7.10-39) opens an options
// tab that immediately redirects to `fullpage.html?section=settings` — a
// SECOND, duplicate full-page tab, since Week already lives on the full
// page post-7.7. `onSectionChange('settings')` switches in place instead,
// matching the fix D-7.10-40 already applied to the shell's own disconnected
// gate.
function ConnectFallback({
  onSectionChange,
}: {
  onSectionChange: (section: FullPageSection) => void;
}): React.ReactElement {
  return (
    <div className="text-center">
      <h3 className="text-base font-semibold text-neutral-900">
        {STRINGS.connectHeading}
      </h3>
      <p className="mt-2 text-sm text-neutral-500">{STRINGS.connectBody}</p>
      <div className="mt-4">
        <Button variant="primary" onClick={() => onSectionChange('settings')}>
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
