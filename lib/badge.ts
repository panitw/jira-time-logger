/**
 * Toolbar badge counter (Story 3.1, FR15).
 *
 * Computes the hours the worker still owes for the current week and renders
 * them on the extension's toolbar icon:
 *   deficit > 0  → red badge `<N>h`
 *   deficit <= 0 → invisible badge (caught-up relief moment, UX-DR15)
 *
 * Architecture rules honoured here:
 *   - All Jira HTTP via lib/jira-client (scheduler + auth + 401-refresh).
 *   - Never inline `/ 3600` — use secondsToHours from lib/hours.
 *   - The badge owns its own fetch+sum; nothing else reads worklogs back.
 *   - `updateBadge` never throws; transient fetch errors leave the badge as-is.
 */
import { storage } from 'wxt/utils/storage';
import { currentCycleRange, workdaysSoFar } from '@/lib/cycle-range';
import { secondsToHours } from '@/lib/hours';
import { fetchCurrentUserWeekWorklogs } from '@/lib/jira-client';
import { log } from '@/lib/log';
import { targetHoursItem } from '@/lib/storage/settings';
import { getAuth, hasValidAuth } from '@/lib/storage/tokens';

/** The `state.danger` token (styles/globals.css line 37). Single source. */
export const BADGE_DANGER_COLOR = '#dc2626';

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

/** Render a positive deficit as a red `<N>h` badge. */
async function renderDeficitBadge(deficit: number): Promise<void> {
  const rounded = Math.round(deficit);
  await chrome.action.setBadgeText({ text: `${rounded}h` });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_DANGER_COLOR });
}

/** Clear the badge (caught-up / disconnected / marked-done). */
async function clearBadge(): Promise<void> {
  await chrome.action.setBadgeText({ text: '' });
}

/**
 * Forward-compatible "current week marked done" flag (Epic 4 Story 4.5, FR24).
 *
 * Story 4.5 owns the UI + the authoritative write of this flag; it does not
 * exist yet. We only READ it here, defensively: the storage item defaults to
 * false, so the badge simply never skips on this account until 4.5 starts
 * writing the key. We do NOT build the 4.5 storage module/UI here.
 */
const weekMarkedDoneItem = storage.defineItem<boolean>('local:weekMarkedDone', {
  fallback: false,
});

export async function isCurrentWeekMarkedDone(): Promise<boolean> {
  try {
    return (await weekMarkedDoneItem.getValue()) === true;
  } catch {
    // Storage unavailable — treat as not marked done.
    return false;
  }
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
    // AC #6 — disconnected: clear and do NOT fetch.
    const bundle = await getAuth();
    if (!hasValidAuth(bundle)) {
      await clearBadge();
      log.info('badge.update.skipped', { reason: 'disconnected' });
      return;
    }

    // AC #3 — week marked done: clear regardless of deficit.
    if (await isCurrentWeekMarkedDone()) {
      await clearBadge();
      log.info('badge.update.skipped', { reason: 'marked-done' });
      return;
    }

    const targetHours = await targetHoursItem.getValue();
    const range = currentCycleRange('weekly');
    const days = workdaysSoFar();

    const result = await fetchCurrentUserWeekWorklogs(range);
    if (result.kind !== 'ok') {
      // Transient error — leave the existing badge untouched (do not blank).
      log.warn('badge.update.failed', { kind: result.kind });
      return;
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

    // Render only when the rounded badge value is >= 1h. A deficit in (0, 0.5)
    // rounds to 0 and would otherwise paint a contradictory red "0h" badge, so
    // treat it as caught-up and clear instead.
    if (Math.round(deficit) >= 1) {
      await renderDeficitBadge(deficit);
      log.info('badge.update.success', { deficit: Math.round(deficit) });
    } else {
      await clearBadge();
      log.info('badge.update.success', { deficit: 0 });
    }
  } catch (e) {
    log.error('badge.update.error', { cause: String(e) });
  }
}
