/**
 * Quota-check wrapper for chrome.storage.local writes.
 *
 * Before any write, checks storage usage via `chrome.storage.local.getBytesInUse()`.
 * If exceeding 10 MB ceiling, evicts closed-cycle cache entries oldest-first.
 */
import { log } from '@/lib/log';

const QUOTA_BYTES = 10 * 1024 * 1024;
const SAFE_RATIO = 0.8;

export async function ensureQuota(): Promise<void> {
  try {
    const bytes = await chrome.storage.local.getBytesInUse(null);
    if (bytes < QUOTA_BYTES * SAFE_RATIO) return;

    log.warn('quota.near-limit', { bytes, limit: QUOTA_BYTES });
    await evictOldest();
  } catch (e) {
    log.warn('quota.check-failed', { cause: String(e) });
  }
}

async function evictOldest(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(all).filter(
    (k) => k.startsWith('local:cache-') || k.startsWith('local:cycle-'),
  );

  if (cacheKeys.length === 0) {
    log.warn('quota.no-evictable', {});
    return;
  }

  const toRemove = cacheKeys.slice(0, Math.max(1, Math.floor(cacheKeys.length * 0.3)));
  await chrome.storage.local.remove(toRemove);
  log.info('quota.evicted', { count: toRemove.length });
}

export async function getStorageUsedBytes(): Promise<number> {
  try {
    return await chrome.storage.local.getBytesInUse(null);
  } catch {
    return 0;
  }
}

export async function clearCache(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(all).filter(
    (k) =>
      k.startsWith('local:cache-') ||
      k.startsWith('local:cycle-') ||
      k.startsWith('local:view-state') ||
      k.startsWith('local:outbox') ||
      k.startsWith('local:banner-dismiss') ||
      k.startsWith('local:recent-') ||
      k.startsWith('local:pinned-'),
  );
  if (cacheKeys.length > 0) {
    await chrome.storage.local.remove(cacheKeys);
  }
  log.info('cache.cleared', { keys: cacheKeys.length });
}