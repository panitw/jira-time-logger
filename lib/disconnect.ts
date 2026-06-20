import { log } from '@/lib/log';
import { DisconnectRequestedSchema } from '@/lib/messages';
import { type Result, ok } from '@/lib/result';

export type DisconnectError =
  | { kind: 'storage-clear-failed'; cause: string }
  | { kind: 'badge-clear-failed'; cause: string };

export async function disconnectAll(): Promise<Result<void, DisconnectError>> {
  log.info('disconnect.start', {});

  try {
    await chrome.alarms.clear('token-refresh');
  } catch (e) {
    log.warn('disconnect.alarm-clear-failed', { cause: String(e) });
  }

  try {
    await chrome.storage.session.remove('oauth.refreshInFlight');
  } catch (e) {
    log.warn('disconnect.session-remove-failed', { cause: String(e) });
  }

  try {
    await chrome.storage.local.clear();
  } catch (e) {
    log.error('disconnect.storage-clear-failed', { cause: String(e) });
    return { kind: 'storage-clear-failed', cause: String(e) };
  }

  notifyBannersToDismiss();

  try {
    await chrome.action.setBadgeText({ text: '' });
  } catch (e) {
    log.error('disconnect.badge-clear-failed', { cause: String(e) });
    return { kind: 'badge-clear-failed', cause: String(e) };
  }

  log.info('disconnect.complete', {});
  return ok(undefined);
}

function notifyBannersToDismiss(): void {
  const payload = DisconnectRequestedSchema.parse({});
  chrome.tabs.query({ url: 'https://*.atlassian.net/*' }, (tabs) => {
    for (const tab of tabs) {
      if (typeof tab.id === 'number') {
        chrome.tabs.sendMessage(tab.id, { kind: 'disconnect', payload }).catch(() => {});
      }
    }
  });
}