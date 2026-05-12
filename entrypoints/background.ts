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
    // Logged on every service-worker wake so the dev can copy this URL into
    // the Atlassian Developer Console's OAuth callback list. It's tied to the
    // extension ID and will change if you reinstall to a different path /
    // repack with a different signing key.
    oauthRedirectUri: chrome.identity.getRedirectURL(),
  });

  chrome.runtime.onInstalled.addListener((details) => {
    log.info('runtime.installed', { reason: details.reason });
    if (details.reason === 'install') {
      // Open the options page on first install so the user sees the
      // first-run hero and Connect to Jira CTA (UX-DR20, FR1).
      void chrome.runtime.openOptionsPage();
    }
  });
});
