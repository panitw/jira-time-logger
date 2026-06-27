/**
 * Hours parsing and conversion utilities.
 *
 * Per architecture.md > Format Patterns: hours are stored as seconds when
 * interfacing with Jira, converted to decimal hours for display. This module
 * is the single conversion utility — no inline `* 3600` elsewhere.
 *
 * The parser accepts Jira's flexible worklog formats:
 *   2.5, 2.5h, 2h 30m, 2:30, 150m, 1d 1h, 1d, 30m
 */

export const MAX_HOURS_PER_ENTRY = 24;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;

export type ParseResult =
  | { kind: 'ok'; hours: number }
  | { kind: 'unparseable' };

// ---- Regex patterns (ordered by specificity) ----

// 2:30 or 2:5 (hours:minutes)
const CLOCK_RE = /^(\d+):(\d{1,2})$/;

// 1d 2h 30m — any combo of d/h/m, at least one present (case-insensitive)
const DHM_RE = /^(?:(\d+)\s*d)?\s*(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/i;

// 2.5 or 2.5h or 2 — bare decimal with optional h (case-insensitive)
const DECIMAL_RE = /^(\d+(?:\.\d+)?)\s*h?$/i;

export function parseHours(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'unparseable' };

  // 1. Clock format: 2:30
  const clock = CLOCK_RE.exec(trimmed);
  if (clock) {
    const h = parseInt(clock[1]!, 10);
    const m = parseInt(clock[2]!, 10);
    if (m >= MINUTES_PER_HOUR || m < 0) return { kind: 'unparseable' };
    if (h < 0) return { kind: 'unparseable' };
    const hours = h + m / MINUTES_PER_HOUR;
    if (hours <= 0) return { kind: 'unparseable' };
    return { kind: 'ok', hours };
  }

  // 2. Days/hours/minutes combo: 1d 2h 30m, 2h, 150m, 1d 1h
  const dhm = DHM_RE.exec(trimmed);
  if (dhm && (dhm[1] || dhm[2] || dhm[3])) {
    const d = dhm[1] ? parseInt(dhm[1], 10) : 0;
    const h = dhm[2] ? parseFloat(dhm[2]) : 0;
    const m = dhm[3] ? parseInt(dhm[3], 10) : 0;
    if (d < 0 || h < 0 || m < 0) return { kind: 'unparseable' };
    const hours = d * HOURS_PER_DAY + h + m / MINUTES_PER_HOUR;
    if (hours <= 0) return { kind: 'unparseable' };
    return { kind: 'ok', hours };
  }

  // 3. Bare decimal: 2.5, 2.5h, 2
  const decimal = DECIMAL_RE.exec(trimmed);
  if (decimal) {
    const hours = parseFloat(decimal[1]!);
    if (isNaN(hours) || hours <= 0) return { kind: 'unparseable' };
    return { kind: 'ok', hours };
  }

  return { kind: 'unparseable' };
}

export function hoursToSeconds(hours: number): number {
  return Math.round(hours * SECONDS_PER_HOUR);
}

export function secondsToHours(seconds: number): number {
  return seconds / SECONDS_PER_HOUR;
}

/**
 * Display format for lists/cells: `2.5h`, `0.5h`, `──` for zero.
 * Per UX Hours Display spec.
 */
export function secondsToHoursDisplay(seconds: number): string {
  if (seconds <= 0) return '\u2014\u2014';
  const hours = secondsToHours(seconds);
  return `${hours.toFixed(1).replace(/\.0$/, '')}h`;
}

/**
 * Week-grid cell format: a bare one-decimal value (`4.0`, `0.5`) per the
 * Weekly Review wireframe, or `\u2500\u2500` (em-dash pair) for empty cells (\u22640).
 * No `h` suffix \u2014 the column context makes the unit clear (UX-DR11).
 */
export function secondsToCellDisplay(seconds: number): string {
  if (seconds <= 0) return '\u2014\u2014';
  return secondsToHours(seconds).toFixed(1);
}
