/**
 * Service worker entrypoint.
 *
 * Owns: OAuth refresh alarm (Story 1.2), badge update alarm (Story 3.1),
 * daily push notification (Story 3.2), outbox retry alarm (Story 2.7),
 * the scheduler singleton (Story 1.4), and inter-surface message routing.
 *
 * For Story 1.1 the service worker only opens the options page on first
 * install. Everything else is wired in subsequent stories.
 */
import { updateBadge } from '@/lib/badge';
import { log } from '@/lib/log';
import { onMessage, sendMessage } from '@/lib/messages';
import {
  handleNotificationClick,
  maybeShowDailyReminder,
  nextReminderOccurrenceFromSettings,
} from '@/lib/notification';
import { refreshTokens } from '@/lib/oauth/refresh';
import { runOutboxRetryPass } from '@/lib/storage/outbox';
import { getAuth, hasValidAuth } from '@/lib/storage/tokens';

/**
 * Register (or re-register) the `daily-reminder` alarm at the next configured
 * wall-clock occurrence (Story 1.6 + 3.2). DST-safe `when`-only registration —
 * never `periodInMinutes`. Idempotent when `idempotent` is set (boot): skips if
 * an alarm already exists so a SW wake never resets a still-valid alarm.
 */
async function registerDailyReminderAlarm(idempotent = false): Promise<void> {
  try {
    if (idempotent) {
      const existing = await chrome.alarms.get('daily-reminder');
      if (existing) return;
    }
    const when = await nextReminderOccurrenceFromSettings();
    chrome.alarms.create('daily-reminder', { when });
  } catch (e) {
    log.warn('alarms.create.daily-reminder.failed', { error: String(e) });
  }
}

/**
 * Re-register the next day's reminder after the alarm fires. The fired alarm is
 * already auto-removed by Chrome; `chrome.alarms.create` with the same name
 * atomically (re)arms the next occurrence in a single call. We deliberately do
 * NOT `clear` first — a `clear`-then-async-`create` opens a window where, if the
 * SW is terminated between the two, the reminder is left unarmed with no event
 * to recreate it until a cold boot. A single `create` has no such gap.
 */
async function reRegisterDailyReminder(): Promise<void> {
  await registerDailyReminderAlarm();
}

async function handleTokenRefresh(): Promise<void> {
  const bundle = await getAuth();
  if (!bundle || bundle.kind === 'api-token') {
    return;
  }

  if (hasValidAuth(bundle)) {
    const expiresAt = new Date(bundle.expires_at).getTime();
    if (expiresAt > Date.now() + 120_000) {
      return;
    }
  }

  const result = await refreshTokens();

  if (result.kind === 'ok') {
    log.info('auth.refresh.success', { expiresAt: result.value.expires_at });
  } else if (result.kind === 'auth-expired') {
    log.warn('auth.refresh.expired', {});
  } else {
    log.warn('auth.refresh.failed', { kind: result.kind });
  }
}

/**
 * Drain the durable outbox (Story 2.7). Replays pending worklog writes through
 * lib/jira-client. On a successful drain pass, broadcasts a badge re-sync; the
 * drained count is persisted by runOutboxRetryPass for the popup toast. Never
 * throws — the alarm listener must not crash the service worker.
 */
async function handleOutboxRetry(): Promise<void> {
  try {
    const { drained } = await runOutboxRetryPass();
    if (drained > 0) {
      void sendMessage('badge-update', { hoursMissing: 0 });
    }
  } catch (e) {
    log.error('outbox.retry.error', { cause: String(e) });
  }
}

export default defineBackground(async () => {
  log.info('background.boot', {
    manifest: chrome.runtime.getManifest().version,
  });

  try {
    const existing = await chrome.alarms.get('token-refresh');
    if (!existing) {
      chrome.alarms.create('token-refresh', { periodInMinutes: 1 });
    }
  } catch (e) {
    log.warn('alarms.create.token-refresh.failed', { error: String(e) });
  }

  try {
    const existing = await chrome.alarms.get('outbox-retry');
    if (!existing) {
      // Chrome's minimum period is 1 minute; this is the retry cadence.
      chrome.alarms.create('outbox-retry', { periodInMinutes: 1 });
    }
  } catch (e) {
    log.warn('alarms.create.outbox-retry.failed', { error: String(e) });
  }

  try {
    const existing = await chrome.alarms.get('badge-update');
    if (!existing) {
      // Normal cadence for the toolbar badge counter (Story 3.1, NFR4).
      chrome.alarms.create('badge-update', { periodInMinutes: 30 });
    }
  } catch (e) {
    log.warn('alarms.create.badge-update.failed', { error: String(e) });
  }

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'token-refresh') {
      await handleTokenRefresh();
    }
    if (alarm.name === 'outbox-retry') {
      await handleOutboxRetry();
    }
    if (alarm.name === 'badge-update') {
      await updateBadge();
    }
    if (alarm.name === 'daily-reminder') {
      // Show/suppress FIRST (never throws), then re-register the next day's
      // alarm so reminders keep firing regardless of the decision (AC #6).
      await maybeShowDailyReminder();
      await reRegisterDailyReminder();
    }
  });

  // Open the pre-warmed popup when the daily reminder is clicked (AC #3). The
  // handler ignores other notification ids and never throws.
  chrome.notifications.onClicked.addListener((id) => {
    void handleNotificationClick(id);
  });

  // Re-register the daily reminder when the user changes the reminder time
  // (Story 1.6 ReminderTimeField writes `local:reminderTime`). WXT stores the
  // item under the bare `reminderTime` key in the `local` area; gate on it
  // defensively (a spurious re-register is harmless — it's idempotent/cheap).
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!('reminderTime' in changes)) return;
    // `registerDailyReminderAlarm` re-creates the same-named alarm, which
    // atomically overwrites the existing one at the new next-occurrence — no
    // `clear` needed (and no clear/create gap that a SW death could leave bare).
    void registerDailyReminderAlarm();
  });

  // Recompute the badge on local actions (popup/banner worklog posts, outbox
  // drains) broadcasting `badge-update`. The payload's `hoursMissing` is a
  // placeholder and is ignored — updateBadge recomputes authoritatively.
  onMessage('badge-update', () => updateBadge());

  // Refresh the badge once on service-worker boot so it is correct after the
  // SW wakes. updateBadge is a no-op (clears) when disconnected.
  void updateBadge();

  // Idempotent boot registration — skips if a still-valid alarm exists so a SW
  // wake never resets it. Uses the shared next-occurrence math (Story 3.2).
  await registerDailyReminderAlarm(true);

  chrome.runtime.onInstalled.addListener((details) => {
    log.info('runtime.installed', { reason: details.reason });
    if (details.reason === 'install') {
      const redirectUri = chrome.identity.getRedirectURL();
      log.info('background.first-install', {
        note: 'Register this URL in the Atlassian Developer Console OAuth callback list.',
        redirectUri,
      });
      chrome.runtime.openOptionsPage(() => {
        const err = chrome.runtime.lastError;
        if (err) {
          log.error('runtime.open-options.failed', { message: err.message });
        }
      });
    }
  });
});
