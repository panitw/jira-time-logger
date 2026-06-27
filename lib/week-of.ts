/**
 * Shared week-of-Monday math (Story 4.5).
 *
 * Returns the local-midnight Monday of the week containing `reference`,
 * formatted as `YYYY-MM-DD` from the LOCAL date — never `toISOString()`, which
 * converts local midnight to UTC and, in positive-offset timezones, rolls back
 * to Sunday.
 *
 * This MUST agree with `currentCycleRange('weekly')`'s local-midnight Monday
 * (Story 4.1) and `buildWeekGrid`'s `weekOf`, so the week header/cache key, the
 * fetched range, and the badge's "current week" comparison all share a Monday.
 *
 * Extracted from the previously-inline `getCurrentWeekMonday()` in
 * `entrypoints/popup/App.tsx`; reused by `App.tsx` and `lib/badge.ts`.
 */
import type { ISODate } from '@/lib/storage/view-state';

export function currentWeekMonday(reference: Date = new Date()): ISODate {
  const day = reference.getDay(); // 0 = Sun .. 6 = Sat
  const diff = reference.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(reference.getFullYear(), reference.getMonth(), diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
