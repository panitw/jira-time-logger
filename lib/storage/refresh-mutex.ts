import { log } from '@/lib/log';

const MUTEX_KEY = 'oauth.refreshInFlight';
const STALE_TTL_MS = 30_000;

export async function acquireRefreshLock(): Promise<boolean> {
  const current = await chrome.storage.session.get(MUTEX_KEY);
  if (current[MUTEX_KEY] !== undefined) {
    const age = Date.now() - (current[MUTEX_KEY] as number);
    if (age > STALE_TTL_MS) {
      log.warn('refresh-mutex.acquire.stale-lock', { age });
      await chrome.storage.session.remove(MUTEX_KEY);
    } else {
      log.debug('refresh-mutex.acquire.already-held', { heldSince: current[MUTEX_KEY] });
      return false;
    }
  }
  const timestamp = Date.now();
  await chrome.storage.session.set({ [MUTEX_KEY]: timestamp });
  const verify = await chrome.storage.session.get(MUTEX_KEY);
  if (verify[MUTEX_KEY] !== timestamp) {
    log.warn('refresh-mutex.acquire.race-lost', {});
    return false;
  }
  log.debug('refresh-mutex.acquire.success', { timestamp });
  return true;
}

export async function releaseRefreshLock(): Promise<void> {
  await chrome.storage.session.remove(MUTEX_KEY);
  log.debug('refresh-mutex.release', {});
}

export async function isRefreshing(): Promise<boolean> {
  const current = await chrome.storage.session.get(MUTEX_KEY);
  return current[MUTEX_KEY] !== undefined;
}
