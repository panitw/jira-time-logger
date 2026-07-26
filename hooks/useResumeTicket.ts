import { useEffect, useMemo, useState } from 'react';
import { useWeekWorklogs } from '@/hooks/useWeekWorklogs';
import type { WeekIssueWorklogs } from '@/lib/jira-types';
import { getLastLoggedTicket, type LastLoggedTicket } from '@/lib/storage/last-logged';
import { ptoSubtaskKeyItem } from '@/lib/storage/settings';
import { currentWeekMonday } from '@/lib/week-of';

/**
 * The resume card's resolved data (Story 7.3, AC1/AC2/AC3/AC5).
 *
 *   'loading' — storage has not resolved yet (single-digit ms in practice).
 *   'none'    — no persisted record AND no non-PTO worklog in the current
 *               week (D-7.3-5's accepted cold-start blind spot).
 *   'ready'   — a resume ticket is resolved; `prefillSeconds` seeds AC3's
 *               hour input and `startedAt` drives AC2's recency note.
 */
export type ResumeTicket =
  | { status: 'loading' }
  | { status: 'none' }
  | {
      status: 'ready';
      key: string;
      summary: string;
      prefillSeconds: number;
      startedAt: string;
    };

/**
 * D-7.3-10: how long the no-stored-record branch of `useResumeTicket` may
 * render `'loading'` (the skeleton) while it waits on the week query before
 * falling through to `'none'` and letting the slot collapse (AC5). Applies
 * ONLY to that branch — a stored record resolves `'ready'` from storage
 * alone and is never subject to this budget.
 */
export const COLD_START_SKELETON_BUDGET_MS = 2000;

type FreshestWorklog = {
  key: string;
  summary: string;
  seconds: number;
  startedAt: string;
};

/**
 * The single freshest (by `started`) non-PTO worklog across a week's issues,
 * paired with its owning issue. Excludes `ptoKey` per D-7.3-12 — time off
 * never becomes the resume ticket. Returns `null` when nothing qualifies.
 */
function freshestWeekWorklog(
  issues: WeekIssueWorklogs[],
  ptoKey: string | null,
): FreshestWorklog | null {
  let best: (FreshestWorklog & { ms: number }) | null = null;
  for (const issue of issues) {
    if (ptoKey && issue.key === ptoKey) continue;
    for (const worklog of issue.worklogs) {
      if (!worklog.started) continue;
      const ms = new Date(worklog.started).getTime();
      if (!Number.isFinite(ms)) continue;
      if (!best || ms > best.ms) {
        best = {
          key: issue.key,
          summary: issue.summary,
          seconds: worklog.timeSpentSeconds,
          startedAt: worklog.started,
          ms,
        };
      }
    }
  }
  return best;
}

/**
 * The freshest `started` among a SPECIFIC issue's worklogs this week, or
 * `null` if the issue has none. Used only to refine the stored record's
 * recency note — never to change which ticket is resolved, and never to
 * change the pre-fill value (D-7.3-2: the stored `seconds` is the only
 * honest source of "what the user actually typed").
 */
function freshestStartedForIssue(issues: WeekIssueWorklogs[], key: string): string | null {
  let bestStarted: string | null = null;
  let bestMs = -Infinity;
  for (const issue of issues) {
    if (issue.key !== key) continue;
    for (const worklog of issue.worklogs) {
      if (!worklog.started) continue;
      const ms = new Date(worklog.started).getTime();
      if (!Number.isFinite(ms)) continue;
      if (ms > bestMs) {
        bestMs = ms;
        bestStarted = worklog.started;
      }
    }
  }
  return bestStarted;
}

/**
 * Resolves the resume card's ticket (Story 7.3).
 *
 * Two composed sources, per D-7.3-2:
 *   1. PRIMARY — `lastLoggedTicketItem` (storage, single-digit ms). `status`
 *      is resolved from this ALONE — the week query is never awaited — so
 *      the hour input can focus without blocking on the network (NFR1; Dev
 *      Notes > "Autofocus, NFR1, and the aria-live region").
 *   2. ENRICHMENT — `useWeekWorklogs(currentWeekMonday())`, the SAME query
 *      `useTodayTotal` already subscribes to (identical
 *      `queryKey: ['week-worklogs', weekOf]`), so this costs ZERO additional
 *      network calls. Used only to refine the recency note and to let a
 *      worklog made elsewhere (Jira web, another device) win on `started`
 *      (the "server-wins override").
 *
 * D-7.3-5 (owner decision): the recency lookup is NOT widened beyond the
 * current Monday–Sunday week. A returning user whose last worklog fell in a
 * previous week sees `status: 'none'` on their first open of the week — an
 * accepted, self-healing limitation, not a bug.
 */
export function useResumeTicket(): ResumeTicket {
  const [stored, setStored] = useState<LastLoggedTicket | null | undefined>(undefined);
  const [ptoKey, setPtoKey] = useState<string | null>(null);
  const [budgetExpired, setBudgetExpired] = useState(false);

  useEffect(() => {
    let active = true;
    void getLastLoggedTicket().then((record) => {
      if (active) setStored(record);
    });
    void ptoSubtaskKeyItem.getValue().then((key) => {
      if (active) setPtoKey(key);
    });
    return () => {
      active = false;
    };
  }, []);

  const weekQuery = useWeekWorklogs(currentWeekMonday());
  const weekIssues = weekQuery.data;
  // The week query has produced a definitive answer (data, or a failure we
  // fail closed on) — as opposed to simply not having resolved yet.
  const weekSettled = weekIssues !== undefined || weekQuery.isError;

  // D-7.3-10: bound how long the no-stored-record branch below may wait on
  // the week query. Only starts once storage has confirmed there is no
  // record AND the week query has not already settled — the common path (a
  // stored record exists) never enters this effect's true branch, so it is
  // never subject to the budget.
  useEffect(() => {
    if (stored !== null || weekSettled) return;
    const timer = setTimeout(() => setBudgetExpired(true), COLD_START_SKELETON_BUDGET_MS);
    return () => clearTimeout(timer);
  }, [stored, weekSettled]);

  return useMemo<ResumeTicket>(() => {
    if (stored === undefined) return { status: 'loading' };

    if (stored === null) {
      // No persisted record — the week scan is the ONLY other source, so
      // `status` genuinely cannot be decided until it settles. Reporting
      // 'none' early (before the already-in-flight, zero-extra-cost query
      // resolves) would render nothing and then pop the card in once data
      // arrives — exactly the pop-in D-7.3-10 rules out. `loading` renders
      // the skeleton instead, for this branch only, up to
      // `COLD_START_SKELETON_BUDGET_MS`; past that budget it falls through
      // to `'none'` so a stalled query cannot shimmer forever (D-7.3-10).
      // The common case (a stored record exists) never reaches here and is
      // never delayed.
      if (!weekSettled && !budgetExpired) return { status: 'loading' };
      const freshest = freshestWeekWorklog(weekIssues ?? [], ptoKey);
      if (!freshest) return { status: 'none' };
      return {
        status: 'ready',
        key: freshest.key,
        summary: freshest.summary,
        prefillSeconds: freshest.seconds,
        startedAt: freshest.startedAt,
      };
    }

    // A stored record exists — resolve 'ready' immediately (never await the
    // week query for this, the common, path; NFR1 / Dev Notes > "Autofocus,
    // NFR1, and the aria-live region"). Enrichment below only REFINES an
    // already-'ready' card once/if the week data arrives.
    const issues = weekIssues ?? [];
    const freshest = freshestWeekWorklog(issues, ptoKey);

    // Server-wins override: a DIFFERENT issue with a `started` strictly
    // newer than the stored record's wins outright — its newest worklog's
    // duration becomes the new pre-fill.
    if (
      freshest &&
      freshest.key !== stored.key &&
      new Date(freshest.startedAt).getTime() > new Date(stored.startedAt).getTime()
    ) {
      return {
        status: 'ready',
        key: freshest.key,
        summary: freshest.summary,
        prefillSeconds: freshest.seconds,
        startedAt: freshest.startedAt,
      };
    }

    // Otherwise the stored record stays the resume ticket. Refine its
    // recency note to the true freshest `started` for that SAME ticket this
    // week when the week query has one — never touches identity or the
    // pre-fill value.
    const refinedStarted = freshestStartedForIssue(issues, stored.key) ?? stored.startedAt;
    return {
      status: 'ready',
      key: stored.key,
      summary: stored.summary,
      prefillSeconds: stored.seconds,
      startedAt: refinedStarted,
    };
  }, [stored, ptoKey, weekIssues, weekSettled, budgetExpired]);
}
