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

export default defineBackground(() => {
  log.info('background.boot', {
    manifest: chrome.runtime.getManifest().version,
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
