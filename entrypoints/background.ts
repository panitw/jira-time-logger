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
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import { refreshTokens } from '@/lib/oauth/refresh';
import { runOutboxRetryPass } from '@/lib/storage/outbox';
import { reminderTimeItem } from '@/lib/storage/settings';
import { getAuth, hasValidAuth } from '@/lib/storage/tokens';

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

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'token-refresh') {
      await handleTokenRefresh();
    }
    if (alarm.name === 'outbox-retry') {
      await handleOutboxRetry();
    }
  });

  try {
    const existing = await chrome.alarms.get('daily-reminder');
    if (!existing) {
      const time = await reminderTimeItem.getValue();
      const [hours, minutes] = time.split(':').map(Number);
      const now = new Date();
      const next = new Date(now);
      next.setHours(hours ?? 17, minutes ?? 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      chrome.alarms.create('daily-reminder', {
        when: next.getTime(),
      });
    }
  } catch (e) {
    log.warn('alarms.create.daily-reminder.failed', { error: String(e) });
  }

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
