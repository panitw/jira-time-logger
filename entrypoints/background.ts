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
import { refreshTokens } from '@/lib/oauth/refresh';
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

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'token-refresh') {
      await handleTokenRefresh();
    }
  });

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
