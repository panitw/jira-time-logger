import { describe, it, expect } from 'vitest';
import {
  formatStartedISO,
  formatDateForInput,
  todayDateString,
} from './worklog-date';

describe('worklog-date', () => {
  it('formatStartedISO anchors at 09:00 LOCAL time and keeps it local', () => {
    // The wall-clock fields are the local ones — NOT shifted to UTC. Asserted
    // literally so a regression to `toISOString()` fails here regardless of
    // the TZ the suite runs in.
    expect(formatStartedISO('2026-06-21')).toMatch(
      /^2026-06-21T09:00:00\.000[+-]\d{4}$/,
    );
  });

  it('formatStartedISO emits a numeric offset, never a literal Z', () => {
    // Jira parses `started` as `yyyy-MM-dd'T'HH:mm:ss.SSSZ` (RFC-822 numeric
    // offset). A trailing `Z` is a 400 — see the note in worklog-date.ts.
    const iso = formatStartedISO('2026-06-21');
    expect(iso.endsWith('Z')).toBe(false);
    expect(iso).toMatch(/[+-]\d{4}$/);
  });

  it('formatStartedISO names the same instant as the equivalent Date', () => {
    // The offset must actually be correct, not merely well-formed.
    expect(new Date(formatStartedISO('2026-06-21')).getTime()).toBe(
      new Date('2026-06-21T09:00:00').getTime(),
    );
  });

  it('formatDateForInput zero-pads month and day', () => {
    expect(formatDateForInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('todayDateString matches formatDateForInput(now)', () => {
    expect(todayDateString()).toBe(formatDateForInput(new Date()));
  });
});
