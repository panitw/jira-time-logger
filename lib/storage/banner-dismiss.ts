/**
 * Daily-dismiss store for the inline Jira banner (Story 3.3, FR18, AR33).
 *
 * The banner can be dismissed once per day with a single click (no confirm).
 * A dismissal is recorded as today's local `YYYY-MM-DD` date string; the banner
 * stays hidden for the rest of that calendar day and returns automatically on
 * the next day's first Jira page visit (if hours are still owed).
 *
 * State lives in `chrome.storage.local` (key `local:bannerDismissedDates`) as a
 * `string[]` of dismissed dates. `lib/disconnect.ts` wipes the whole `local`
 * area on disconnect, so this key is cleared automatically on disconnect — no
 * extra wiring needed (verified against `lib/disconnect.ts`).
 *
 * All helpers are defensive: they never throw. A read failure is treated as
 * "not dismissed" (show the banner) and a write failure is swallowed (the
 * banner closes in the DOM regardless — the worst case is it reappears).
 */
import { storage } from 'wxt/utils/storage';
import { log } from '@/lib/log';
import { todayDateString, formatDateForInput } from '@/lib/worklog-date';

/** Bound storage growth: keep at most this many trailing days of dismissals. */
const PRUNE_WINDOW_DAYS = 7;

export const bannerDismissedDatesItem = storage.defineItem<string[]>(
  'local:bannerDismissedDates',
  { fallback: [] },
);

/** Oldest `YYYY-MM-DD` we keep, given a reference "today". */
function pruneCutoff(reference: Date): string {
  const cutoff = new Date(reference);
  cutoff.setDate(cutoff.getDate() - PRUNE_WINDOW_DAYS);
  return formatDateForInput(cutoff);
}

/**
 * Whether the banner has been dismissed for the reference day (default: now).
 * Returns `false` on any read error (mirrors `isCurrentWeekMarkedDone`).
 */
export async function isDismissedToday(reference?: Date): Promise<boolean> {
  try {
    const today = reference ? formatDateForInput(reference) : todayDateString();
    const dates = await bannerDismissedDatesItem.getValue();
    return Array.isArray(dates) && dates.includes(today);
  } catch (e) {
    log.warn('banner.dismiss.read-failed', { cause: String(e) });
    return false;
  }
}

/**
 * Record a dismissal for the reference day (default: now). Deduplicated, and
 * prunes dates older than the prune window on write. Never throws.
 */
export async function dismissForToday(reference?: Date): Promise<void> {
  try {
    const ref = reference ?? new Date();
    const today = formatDateForInput(ref);
    const cutoff = pruneCutoff(ref);
    const current = await bannerDismissedDatesItem.getValue();
    const kept = (Array.isArray(current) ? current : []).filter(
      (d) => d >= cutoff && d !== today,
    );
    kept.push(today);
    await bannerDismissedDatesItem.setValue(kept);
    log.info('banner.dismissed', { date: today });
  } catch (e) {
    log.warn('banner.dismiss.write-failed', { cause: String(e) });
  }
}
