/**
 * Daily push notification (Story 3.2, FR16).
 *
 * A single honest, past-tense reminder shown at the worker's configured time
 * (the Story 1.6 `daily-reminder` alarm). It nudges only when the worker has
 * NOT logged anything today, the week is not marked done, and the worker is
 * connected — never an end-of-day nag once they're done (UX-DR30).
 *
 * Architecture rules honoured here:
 *   - All Jira HTTP via lib/jira-client (scheduler + auth + 401-refresh).
 *   - Never inline `/ 3600` — use secondsToHours from lib/hours.
 *   - Copy is strictly past-tense factual ("logged today"), never pushy.
 *   - The orchestrator/click handler NEVER throw — the SW listeners must not
 *     crash. A single stable notification id means we never stack pushes.
 */
import { isCurrentWeekMarkedDone } from '@/lib/badge';
import { currentCycleRange } from '@/lib/cycle-range';
import { secondsToHours } from '@/lib/hours';
import { fetchCurrentUserWeekWorklogs } from '@/lib/jira-client';
import type { JiraWorklog } from '@/lib/jira-types';
import { log } from '@/lib/log';
import { targetHoursItem, reminderTimeItem } from '@/lib/storage/settings';
import { getAuth, hasValidAuth } from '@/lib/storage/tokens';

/** Past-tense, factual title (UX spec line 569). Never "Don't forget!". */
export const REMINDER_TITLE = "Log today's time";

/**
 * Single stable id so only one notification ever exists — re-firing,
 * clicking, or dismissing replaces it rather than stacking (UX "one daily
 * push, that's it", UX spec line 328).
 */
export const REMINDER_NOTIFICATION_ID = 'daily-reminder';

/** The 96 px notification-size brand icon (UX-DR36, public/icon/96.png). */
const NOTIFICATION_ICON_PATH = 'icon/96.png';

const DEFAULT_REMINDER_HOUR = 17;
const DEFAULT_REMINDER_MINUTE = 0;

/**
 * Pure "logged today" reducer. Sums `timeSpentSeconds` for worklogs whose
 * `started` calendar date equals the reference's local Y-M-D. Worklogs with an
 * absent `started` are ignored (mirrors the badge's defensive filter).
 */
export function computeLoggedToday(
  worklogs: JiraWorklog[],
  reference: Date = new Date(),
): { loggedTodaySeconds: number; hasLoggedToday: boolean } {
  const refY = reference.getFullYear();
  const refM = reference.getMonth();
  const refD = reference.getDate();

  let loggedTodaySeconds = 0;
  for (const worklog of worklogs) {
    if (!worklog.started) continue;
    const started = new Date(worklog.started);
    if (
      started.getFullYear() === refY &&
      started.getMonth() === refM &&
      started.getDate() === refD
    ) {
      loggedTodaySeconds += worklog.timeSpentSeconds;
    }
  }

  return { loggedTodaySeconds, hasLoggedToday: loggedTodaySeconds > 0 };
}

/**
 * Pure copy composer. Returns the exact past-tense string
 * `"<X>h / <Y>h logged today"` where X is whole-hour-rounded logged-today
 * hours and Y is the target. Past-tense only — no "forget"/"should".
 */
export function composeReminderBody(input: {
  loggedTodaySeconds: number;
  targetHours: number;
}): string {
  const logged = Math.round(secondsToHours(input.loggedTodaySeconds));
  return `${logged}h / ${input.targetHours}h logged today`;
}

/**
 * Pure next-occurrence helper. Given an `"HH:MM"` time, returns the epoch ms of
 * the next wall-clock occurrence at or after `reference`: today-at-time if it is
 * still in the future, otherwise tomorrow-at-time.
 *
 * Any malformed or out-of-range value (empty string, missing/extra parts,
 * negative, `24:00`, `17:60`, NaN, etc.) falls back to the 17:00 default rather
 * than scheduling at a bogus wall-clock time or in the past. The only legitimate
 * writer (Story 1.6 `ReminderTimeField`) already validates `HH:MM` in range, so
 * this is defense-in-depth against corrupt storage or a future writer.
 *
 * The `when`-only registration (no `periodInMinutes`) avoids DST drift. Note the
 * one residual DST caveat: a configured time inside a spring-forward gap (e.g.
 * `02:30` on the transition day) is normalized by `setHours`, so that single
 * day's reminder may fire ~1h off — an acceptable once-a-year skew.
 */
export function nextReminderOccurrence(
  time: string,
  reference: Date = new Date(),
): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  let hours = DEFAULT_REMINDER_HOUR;
  let minutes = DEFAULT_REMINDER_MINUTE;
  if (match) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      hours = h;
      minutes = m;
    }
  }

  const next = new Date(reference);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= reference.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

/**
 * Orchestrate a single daily-reminder decision (AC #1, #2, #5).
 *
 * Suppression order (cheapest first):
 *   1. disconnected → no fetch, no notify (AC #5)
 *   2. week marked done → no fetch, no notify (AC #1)
 *   3. fetch error → no notify (transient; do not crash)
 *   4. already logged today → no notify (AC #1)
 * Otherwise compose past-tense copy and create a single notification (AC #2).
 *
 * Guaranteed not to throw — the SW alarm listener must never crash.
 */
export async function maybeShowDailyReminder(): Promise<void> {
  try {
    // AC #5 — disconnected: do NOT fetch, do NOT notify.
    const bundle = await getAuth();
    if (!hasValidAuth(bundle)) {
      log.info('notification.suppressed', { reason: 'disconnected' });
      return;
    }

    // AC #1 — week marked done (Story 4.5 forward-compat flag, defaults false).
    if (await isCurrentWeekMarkedDone()) {
      log.info('notification.suppressed', { reason: 'marked-done' });
      return;
    }

    const range = currentCycleRange('weekly');
    const result = await fetchCurrentUserWeekWorklogs(range);
    if (result.kind !== 'ok') {
      // Transient — do not notify, do not crash.
      log.warn('notification.suppressed', { reason: 'fetch-failed', kind: result.kind });
      return;
    }

    // AC #1 — already logged something today: no end-of-day nag.
    const { loggedTodaySeconds, hasLoggedToday } = computeLoggedToday(result.value);
    if (hasLoggedToday) {
      log.info('notification.suppressed', { reason: 'logged-today' });
      return;
    }

    const targetHours = await targetHoursItem.getValue();
    const message = composeReminderBody({ loggedTodaySeconds, targetHours });

    await chrome.notifications.create(REMINDER_NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON_PATH),
      title: REMINDER_TITLE,
      message,
    });
    log.info('notification.shown', { loggedTodaySeconds, targetHours });
  } catch (e) {
    log.error('notification.error', { cause: String(e) });
  }
}

/**
 * Notification click handler (AC #3). Opens the pre-warmed popup to the Today
 * view and clears the notification. Ignores clicks on other notifications.
 * Never throws — `openPopup` can reject when no window is focused.
 */
export async function handleNotificationClick(notificationId: string): Promise<void> {
  if (notificationId !== REMINDER_NOTIFICATION_ID) return;
  try {
    log.info('notification.clicked', {});
    try {
      await chrome.action.openPopup();
    } catch (e) {
      // openPopup rejects if no window is focused — log and continue.
      log.warn('notification.open-popup.failed', { cause: String(e) });
    }
    await chrome.notifications.clear(REMINDER_NOTIFICATION_ID);
  } catch (e) {
    log.error('notification.error', { cause: String(e) });
  }
}

/**
 * Read the configured reminder time and compute the next-occurrence epoch ms.
 * Shared by the SW boot registration AND daily re-registration AND the
 * settings-change watcher so the math lives in exactly one place.
 */
export async function nextReminderOccurrenceFromSettings(): Promise<number> {
  const time = await reminderTimeItem.getValue();
  return nextReminderOccurrence(time);
}
