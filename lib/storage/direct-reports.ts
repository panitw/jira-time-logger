/**
 * Per-account, 24h-TTL cache for the current user's direct reports (Story 5.2).
 *
 * Direct-report sets change infrequently, so resolving them on every popup
 * open would waste a Jira round-trip. This module persists the resolved set in
 * `chrome.storage.local` keyed by the resolving user's `accountId` so a
 * re-connect as a different user never reads a stale set, with a 24-hour
 * freshness window. The Manager-tab visibility (`hasDirectReports` in
 * `lib/manager-resolution.ts`) reads this cache before falling back to a live
 * directory query.
 *
 * Framework-agnostic — no React imports.
 */
import { storage } from 'wxt/utils/storage';

export type DirectReport = { accountId: string; displayName: string };

/** Stored cache shape: per-account report set + the time it was fetched. */
export type CachedDirectReports = {
  accountId: string;
  reports: DirectReport[];
  fetchedAt: number;
};

/** 24 hours in milliseconds — the cache freshness window. */
export const DIRECT_REPORTS_TTL_MS = 24 * 60 * 60 * 1000;

const directReportsItem = storage.defineItem<CachedDirectReports | null>(
  'local:directReports',
  { fallback: null },
);

function isCachedShape(value: unknown): value is CachedDirectReports {
  if (value == null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accountId === 'string' &&
    Array.isArray(v.reports) &&
    typeof v.fetchedAt === 'number'
  );
}

/**
 * Read the cached report set for `accountId`.
 *
 * Returns `null` when nothing is cached, the stored value is malformed/legacy,
 * or the cached `accountId` differs from the requested one (per-account
 * keying). Otherwise returns the reports plus a `fresh` boolean computed
 * against the 24-hour TTL — callers re-fetch when `fresh === false`.
 */
export async function getCachedDirectReports(
  accountId: string,
): Promise<{ reports: DirectReport[]; fresh: boolean } | null> {
  const value = await directReportsItem.getValue();
  if (!isCachedShape(value)) return null;
  if (value.accountId !== accountId) return null;
  const fresh = Date.now() - value.fetchedAt < DIRECT_REPORTS_TTL_MS;
  return { reports: value.reports, fresh };
}

/** Persist `reports` for `accountId`, stamping the current time. */
export async function setCachedDirectReports(
  accountId: string,
  reports: DirectReport[],
): Promise<void> {
  await directReportsItem.setValue({
    accountId,
    reports,
    fetchedAt: Date.now(),
  });
}
