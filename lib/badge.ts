/**
 * Toolbar badge counter (Story 3.1, FR15).
 *
 * Computes the hours the worker still owes for the current week and renders
 * them on the extension's toolbar icon:
 *   deficit > 0  → amber badge `<N>h` (Story 7.6, D-7.6-36 — was red)
 *   deficit <= 0 → invisible badge (caught-up relief moment, UX-DR15)
 *
 * Architecture rules honoured here:
 *   - All Jira HTTP via lib/jira-client (scheduler + auth + 401-refresh).
 *   - Never inline `/ 3600` — use secondsToHours from lib/hours.
 *   - The badge owns its own fetch+sum; nothing else reads worklogs back.
 *   - `updateBadge` never throws; transient fetch errors leave the badge as-is.
 */
import { currentCycleRange, workdaysSoFar } from '@/lib/cycle-range';
import { secondsToHours } from '@/lib/hours';
import { fetchCurrentUserWeekWorklogs } from '@/lib/jira-client';
import { log } from '@/lib/log';
import { targetHoursItem } from '@/lib/storage/settings';
import { getAuth, hasValidAuth } from '@/lib/storage/tokens';
import { getMarkDoneState } from '@/lib/storage/view-state';
import { currentWeekMonday } from '@/lib/week-of';

/**
 * The `status-dirty` token (`styles/globals.css` `--color-status-dirty`).
 * Story 7.6 / D-7.6-36 (owner decision): an hours deficit is a time-related
 * state, so AC1 ("no red is rendered for any time-related state anywhere in
 * the product") applies to the toolbar badge too — the most-seen surface the
 * product owns. Recoloured from `#dc2626` (status-error red) to the amber
 * the day-status vocabulary already uses for "nothing logged" — an hours
 * deficit is exactly that. `EXPERIENCE.md:32`'s "Unchanged" listing for the
 * badge is overruled by this decision.
 */
export const BADGE_DEFICIT_COLOR = '#b45309';

/**
 * Pure deficit computation for the current week.
 *
 *   deficit = (workdaysSoFar * targetHours) − totalLoggedHours
 *
 * Exported separately from the orchestrator so the math is unit-testable
 * without any chrome/storage/network mocks.
 */
export function computeHoursMissing(input: {
  workdaysSoFar: number;
  targetHours: number;
  totalLoggedSeconds: number;
}): number {
  const expected = input.workdaysSoFar * input.targetHours;
  const logged = secondsToHours(input.totalLoggedSeconds);
  return expected - logged;
}

/** Render a positive deficit as an amber `<N>h` badge (D-7.6-36). */
async function renderDeficitBadge(deficit: number): Promise<void> {
  const rounded = Math.round(deficit);
  await chrome.action.setBadgeText({ text: `${rounded}h` });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_DEFICIT_COLOR });
}

/** Clear the badge (caught-up / disconnected / marked-done). */
async function clearBadge(): Promise<void> {
  await chrome.action.setBadgeText({ text: '' });
}

/**
 * "Current week marked done" flag (Epic 4 Story 4.5, FR24).
 *
 * Story 4.5 owns the UI + the authoritative write of this flag; the item now
 * lives in `lib/storage/view-state.ts` as `{ weekOf, markedDoneAt } | null`.
 * The badge reads it WEEK-AWARELY: a mark-done only suppresses *this* week's
 * badge — a stale flag from a previous week never silences the current week.
 */
export async function isCurrentWeekMarkedDone(): Promise<boolean> {
  try {
    const state = await getMarkDoneState();
    return state != null && state.weekOf === currentWeekMonday();
  } catch {
    // Storage unavailable — treat as not marked done.
    return false;
  }
}

/**
 * The shared current-week deficit signal. Discriminates the cases the badge AND
 * the banner both need to distinguish (Story 3.3, Task 3):
 *
 *   - `cleared`  — disconnected OR week marked done → clear the badge / no banner.
 *   - `unknown`  — a transient fetch error → leave the badge untouched / no banner.
 *   - `deficit`  — a real computed deficit, ROUNDED. `hours >= 1` means behind
 *                  (render red badge / show banner); `hours === 0` means caught
 *                  up (clear badge / no banner). Values in (0, 0.5) round to 0,
 *                  so `hours` is never a contradictory red "0h".
 */
export type WeekDeficit =
  | { kind: 'cleared'; reason: 'disconnected' | 'marked-done' }
  | { kind: 'unknown'; reason: string }
  | { kind: 'deficit'; hours: number };

/**
 * Compute the current-week deficit once, for both the toolbar badge (Story 3.1)
 * and the inline banner (Story 3.3). This is the SINGLE source of the deficit:
 * the banner's `hoursMissing` is exactly this number. Never throws.
 *
 * Mirrors the badge's gating order: disconnected → marked-done → fetch →
 * compute → round with the `Math.round(deficit) >= 1` threshold.
 */
export async function getWeekDeficit(): Promise<WeekDeficit> {
  try {
    // Disconnected: do NOT fetch.
    const bundle = await getAuth();
    if (!hasValidAuth(bundle)) {
      return { kind: 'cleared', reason: 'disconnected' };
    }

    // Week marked done: treat as caught up regardless of the real deficit.
    if (await isCurrentWeekMarkedDone()) {
      return { kind: 'cleared', reason: 'marked-done' };
    }

    const targetHours = await targetHoursItem.getValue();
    const range = currentCycleRange('weekly');
    const days = workdaysSoFar();

    const result = await fetchCurrentUserWeekWorklogs(range);
    if (result.kind !== 'ok') {
      // Transient error — do not blank the badge / do not show a stale banner.
      return { kind: 'unknown', reason: result.kind };
    }

    const totalLoggedSeconds = result.value.reduce(
      (sum, w) => sum + w.timeSpentSeconds,
      0,
    );
    const deficit = computeHoursMissing({
      workdaysSoFar: days,
      targetHours,
      totalLoggedSeconds,
    });

    const rounded = Math.round(deficit);
    return { kind: 'deficit', hours: rounded >= 1 ? rounded : 0 };
  } catch (e) {
    return { kind: 'unknown', reason: String(e) };
  }
}

/**
 * The rounded hours the worker still owes this week, for the banner's
 * `banner-state` response (Story 3.3, Task 3):
 *
 *   - a positive number → show the banner with that many hours.
 *   - `0`  → caught up → no banner (AC #2).
 *   - `null` → disconnected / auth-expired / transient fetch error → no banner
 *     (AC #8). The content script never distinguishes WHY — it just hides.
 */
export async function getWeekHoursMissing(): Promise<number | null> {
  const deficit = await getWeekDeficit();
  if (deficit.kind === 'deficit') return deficit.hours;
  return null;
}

/**
 * Orchestrate a single badge update (AC #1, #2, #3, #6).
 *
 * Guaranteed not to throw — the alarm/message handlers must never crash the
 * service worker. On a transient fetch error the previous badge state is left
 * untouched (do not blank it on a single failed remote fetch).
 */
export async function updateBadge(): Promise<void> {
  try {
    const deficit = await getWeekDeficit();

    if (deficit.kind === 'cleared') {
      await clearBadge();
      log.info('badge.update.skipped', { reason: deficit.reason });
      return;
    }

    if (deficit.kind === 'unknown') {
      // Transient error — leave the existing badge untouched (do not blank).
      log.warn('badge.update.failed', { kind: deficit.reason });
      return;
    }

    if (deficit.hours >= 1) {
      await renderDeficitBadge(deficit.hours);
      log.info('badge.update.success', { deficit: deficit.hours });
    } else {
      await clearBadge();
      log.info('badge.update.success', { deficit: 0 });
    }
  } catch (e) {
    log.error('badge.update.error', { cause: String(e) });
  }
}
