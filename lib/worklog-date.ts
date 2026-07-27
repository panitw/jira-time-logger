/**
 * Shared worklog `started` ISO helper (Story 2.5).
 *
 * Both QuickLogForm and lib/pto.ts post worklogs with a `started` timestamp
 * anchored at 09:00 local time on the chosen date. The hardcoded 09:00 is an
 * accepted v1 limitation (deferred-work.md). Extracted here so the two call
 * sites cannot diverge.
 *
 * The output MUST carry a numeric `+HHMM` offset, never a trailing `Z`. Jira
 * parses `started` with the Java pattern `yyyy-MM-dd'T'HH:mm:ss.SSSZ`, where
 * `Z` is an RFC-822 numeric offset — a literal `Z` (what `toISOString()`
 * emits) fails to parse and Jira rejects the whole POST with a 400:
 *
 *     {"errors":{"started":"Invalid date format. Please enter the date in
 *      the format \"yyyy-MM-dd'T'HH:mm:ss.SSSZ\"."}}
 *
 * `jiraPost` maps that 400 to `network`, so callers read it as "offline" and
 * park the write in the durable outbox — every worklog silently queueing
 * instead of posting. Keep the offset numeric.
 *
 * @param dateStr a `YYYY-MM-DD` calendar date string
 * @returns ISO timestamp for that date at 09:00 local time, e.g.
 *          `2026-06-21T09:00:00.000+0700`
 */
export function formatStartedISO(dateStr: string): string {
  const d = new Date(dateStr + 'T09:00:00');
  const pad = (n: number) => String(n).padStart(2, '0');
  // `getTimezoneOffset` is minutes UTC-minus-local (so +07:00 reads as -420);
  // negate it to get the sign Jira expects.
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absOffset = Math.abs(offsetMinutes);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return (
    `${formatDateForInput(d)}T${time}.${ms}` +
    `${sign}${pad(Math.floor(absOffset / 60))}${pad(absOffset % 60)}`
  );
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
