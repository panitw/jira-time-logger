/**
 * Shared worklog `started` ISO helper (Story 2.5).
 *
 * Both QuickLogForm and lib/pto.ts post worklogs with a `started` timestamp
 * anchored at 09:00 local time on the chosen date. The hardcoded 09:00 is an
 * accepted v1 limitation (deferred-work.md). Extracted here so the two call
 * sites cannot diverge.
 *
 * @param dateStr a `YYYY-MM-DD` calendar date string
 * @returns ISO timestamp for that date at 09:00 local time
 */
export function formatStartedISO(dateStr: string): string {
  const d = new Date(dateStr + 'T09:00:00');
  return d.toISOString();
}

/** `YYYY-MM-DD` for the given date in local time. */
export function formatDateForInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` for today in local time. */
export function todayDateString(): string {
  return formatDateForInput(new Date());
}
