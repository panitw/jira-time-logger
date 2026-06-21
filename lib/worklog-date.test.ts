import { describe, it, expect } from 'vitest';
import {
  formatStartedISO,
  formatDateForInput,
  todayDateString,
} from './worklog-date';

describe('worklog-date', () => {
  it('formatStartedISO anchors at 09:00 local time and returns ISO', () => {
    const iso = formatStartedISO('2026-06-21');
    // Round-trips through Date; the local 09:00 maps to a fixed UTC instant.
    const expected = new Date('2026-06-21T09:00:00').toISOString();
    expect(iso).toBe(expected);
  });

  it('formatDateForInput zero-pads month and day', () => {
    expect(formatDateForInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('todayDateString matches formatDateForInput(now)', () => {
    expect(todayDateString()).toBe(formatDateForInput(new Date()));
  });
});
