import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  DAY_STATUSES,
  STATUS_LABEL,
  dayStatusFor,
  dayStatusNote,
  isWeekend,
  type DayStatus,
} from '@/lib/day-status';

const TARGET = 8 * 3600;

describe('lib/day-status.ts is framework-agnostic (architecture rule)', () => {
  it('imports zero React, zero lucide-react', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'lib/day-status.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/from ['"]react['"]/);
    expect(source).not.toMatch(/from ['"]lucide-react['"]/);
  });
});

describe('DAY_STATUSES / STATUS_LABEL exhaustiveness (AC2)', () => {
  it('has exactly five day statuses', () => {
    expect(DAY_STATUSES).toEqual(['met', 'partial', 'attention', 'time-off', 'weekend']);
  });

  it('every DayStatus (and the 3 extra StatusKind members) has a non-empty label', () => {
    for (const status of [...DAY_STATUSES, 'restricted', 'loading', 'error'] as const) {
      expect(STATUS_LABEL[status]).toBeTruthy();
      expect(typeof STATUS_LABEL[status]).toBe('string');
    }
  });

  it('every DayStatus has a note for a representative input', () => {
    const today = '2026-06-17';
    for (const status of DAY_STATUSES) {
      const note = dayStatusNote({
        status,
        loggedSeconds: 4 * 3600,
        timeOffSeconds: status === 'time-off' ? 4 * 3600 : 0,
        targetSeconds: TARGET,
        iso: '2026-06-15',
        today,
      });
      expect(note).toBeTruthy();
    }
  });
});

describe('isWeekend', () => {
  it('is true for Saturday and Sunday, false for weekdays', () => {
    expect(isWeekend('2026-06-20')).toBe(true); // Sat
    expect(isWeekend('2026-06-21')).toBe(true); // Sun
    expect(isWeekend('2026-06-15')).toBe(false); // Mon
    expect(isWeekend('2026-06-19')).toBe(false); // Fri
  });
});

describe('dayStatusFor — precedence (D-7.6-6): time-off > weekend > met > partial > attention', () => {
  const base = { targetSeconds: TARGET, today: '2026-06-17' };

  it('time off wins even over a weekend day', () => {
    const status = dayStatusFor({
      ...base,
      iso: '2026-06-20', // Saturday
      loggedSeconds: 0,
      timeOffSeconds: 4 * 3600,
    });
    expect(status).toBe('time-off');
  });

  it('time off wins even when the day also meets target', () => {
    const status = dayStatusFor({
      ...base,
      iso: '2026-06-15',
      loggedSeconds: TARGET,
      timeOffSeconds: TARGET,
    });
    expect(status).toBe('time-off');
  });

  it('weekend wins over meeting target — a Saturday hitting target is `weekend`, not `met`', () => {
    // Deliberate behaviour change from the old build (D-7.6-6).
    const status = dayStatusFor({
      ...base,
      iso: '2026-06-20', // Saturday
      loggedSeconds: TARGET,
      timeOffSeconds: 0,
    });
    expect(status).toBe('weekend');
  });

  it('a weekday at/above target is met', () => {
    const status = dayStatusFor({
      ...base,
      iso: '2026-06-15',
      loggedSeconds: TARGET,
      timeOffSeconds: 0,
    });
    expect(status).toBe('met');
  });

  it('a weekday with some but under-target hours is partial', () => {
    const status = dayStatusFor({
      ...base,
      iso: '2026-06-15',
      loggedSeconds: 4 * 3600,
      timeOffSeconds: 0,
    });
    expect(status).toBe('partial');
  });

  it('an ELAPSED (past) weekday with nothing logged is attention', () => {
    const status = dayStatusFor({
      ...base,
      iso: '2026-06-15', // Monday, before "today" (Wed 06-17)
      loggedSeconds: 0,
      timeOffSeconds: 0,
    });
    expect(status).toBe('attention');
  });
});

describe('dayStatusFor — D-7.6-35: elapsed vs. future boundary (owner ruling)', () => {
  const base = { targetSeconds: TARGET, loggedSeconds: 0, timeOffSeconds: 0 };

  it('today itself with nothing logged is ELAPSED — attention, not null', () => {
    const status = dayStatusFor({ ...base, iso: '2026-06-17', today: '2026-06-17' });
    expect(status).toBe('attention');
  });

  it('a past weekday with nothing logged is attention', () => {
    const status = dayStatusFor({ ...base, iso: '2026-06-15', today: '2026-06-17' });
    expect(status).toBe('attention');
  });

  it('a FUTURE weekday with nothing logged has no status (null), never amber', () => {
    const status = dayStatusFor({ ...base, iso: '2026-06-19', today: '2026-06-17' });
    expect(status).toBeNull();
  });

  it('Monday morning: only today is attention — Tue..Fri all render null (not five ambers)', () => {
    const today = '2026-06-15'; // Monday
    const results = ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'].map(
      (iso) => dayStatusFor({ ...base, iso, today }),
    );
    expect(results).toEqual(['attention', null, null, null, null]);
  });

  it('the elapsed boundary is local-midnight lexical, not UTC — a future ISO date one day out is null', () => {
    const status = dayStatusFor({ ...base, iso: '2026-06-18', today: '2026-06-17' });
    expect(status).toBeNull();
  });

  it('never reads a clock: dayStatusFor is a pure function of its injected inputs', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'lib/day-status.ts'),
      'utf-8',
    );
    // No bare `new Date()` (no-arg = "now") anywhere in the module.
    expect(source).not.toMatch(/new Date\(\)/);
  });
});

describe('dayStatusNote — partial: today is "in progress", a past day gets the shortfall', () => {
  it('today, partially logged: "in progress"', () => {
    const note = dayStatusNote({
      status: 'partial',
      loggedSeconds: 5.5 * 3600,
      timeOffSeconds: 0,
      targetSeconds: TARGET,
      iso: '2026-06-17',
      today: '2026-06-17',
    });
    expect(note).toBe('in progress');
  });

  it('a past partial day: the exact shortfall, e.g. "2.5h short"', () => {
    const note = dayStatusNote({
      status: 'partial',
      loggedSeconds: 5.5 * 3600,
      timeOffSeconds: 0,
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('2.5h short');
  });
});

describe('dayStatusNote — never "below target", never "incomplete" (D-7.6-12)', () => {
  it('no note for any status contains the banned verdict words', () => {
    const today = '2026-06-17';
    const statuses: DayStatus[] = ['met', 'partial', 'attention', 'time-off', 'weekend'];
    for (const status of statuses) {
      const note = dayStatusNote({
        status,
        loggedSeconds: 3 * 3600,
        timeOffSeconds: status === 'time-off' ? 3 * 3600 : 0,
        targetSeconds: TARGET,
        iso: '2026-06-15',
        today,
      });
      expect(note.toLowerCase()).not.toContain('below target');
      expect(note.toLowerCase()).not.toContain('incomplete');
    }
  });
});

describe('dayStatusNote — half-day time off (D-7.6-9/38): note differentiates, no sixth state', () => {
  it('full-day time off (timeOffSeconds >= target): "Full-day time off"', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: TARGET,
      timeOffSeconds: TARGET,
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('Full-day time off');
  });

  it('a 4h half-day time off with nothing else logged: "Half-day time off · 4.0h short"', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: 4 * 3600,
      timeOffSeconds: 4 * 3600,
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('Half-day time off · 4h short');
  });

  it('a 4h half-day PLUS enough other hours to reach target: "Half-day time off" with no shortfall appended', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: TARGET, // 4h off + 4h worked = target
      timeOffSeconds: 4 * 3600,
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('Half-day time off');
  });

  it('the STATUS stays time-off either way — the five-state vocabulary is never widened', () => {
    const full = dayStatusFor({
      iso: '2026-06-15',
      loggedSeconds: TARGET,
      timeOffSeconds: TARGET,
      targetSeconds: TARGET,
      today: '2026-06-17',
    });
    const half = dayStatusFor({
      iso: '2026-06-15',
      loggedSeconds: 4 * 3600,
      timeOffSeconds: 4 * 3600,
      targetSeconds: TARGET,
      today: '2026-06-17',
    });
    expect(full).toBe('time-off');
    expect(half).toBe('time-off');
  });
});

describe('dayStatusNote — D-7.6-47 #1 / Finding 5: no past-tense verdict for a day that has not happened', () => {
  it('a FUTURE partial day (hours pre-logged into a future cell) reads "in progress", never a shortfall', () => {
    const note = dayStatusNote({
      status: 'partial',
      loggedSeconds: 3 * 3600,
      timeOffSeconds: 0,
      targetSeconds: TARGET,
      iso: '2026-06-19',
      today: '2026-06-17',
    });
    expect(note).toBe('in progress');
  });

  it('a FUTURE half-day time off (booked in advance) never appends a shortfall', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: 4 * 3600,
      timeOffSeconds: 4 * 3600,
      targetSeconds: TARGET,
      iso: '2026-06-19',
      today: '2026-06-17',
    });
    expect(note).toBe('Half-day time off');
  });
});

describe('dayStatusNote — D-7.6-47 #2 / Finding 6: time off is weekend-aware and only claims "half" at >= half target', () => {
  it('time off on a weekend carries no target-relative clause — just the hours off', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: 4 * 3600,
      timeOffSeconds: 4 * 3600,
      targetSeconds: TARGET,
      iso: '2026-06-20', // Saturday
      today: '2026-06-24',
    });
    expect(note).toBe('Time off · 4h');
  });

  it('a sub-half amount of time off (< target/2) does not claim "half-day" — neutral "Time off · Nh"', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: 2 * 3600,
      timeOffSeconds: 2 * 3600, // 2h of an 8h target — under the 4h half threshold
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('Time off · 2h');
  });

  it('exactly half the target (>= target/2) still reads "Half-day time off"', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: 4 * 3600,
      timeOffSeconds: 4 * 3600, // exactly half of an 8h target
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('Half-day time off · 4h short');
  });

  it('time off with no configured target carries no target-relative clause either', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: 3 * 3600,
      timeOffSeconds: 3 * 3600,
      targetSeconds: 0,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('Time off · 3h');
  });
});

// Finisher fix, D-7.7-20 / Finding 4: the reviewer probed 7.5h of time off
// against an 8h target and got "Half-day time off · 0.5h short" — false,
// since 7.5h is not a half day. The RULE stays uniform (any day below
// target is a gap, time off included); only the NOTE's wording was wrong.
// RED-proved by reverting the `isActualHalf` arm: all four cases below
// still pass with the day-status-for-the-day DERIVATION unchanged (the gap
// itself was already closed by D-7.7-19), but the near-full case's note
// reverts to the false "Half-day time off · 0.5h short".
describe('dayStatusNote — D-7.7-20 / Finding 4: "half-day" is reserved for an ACTUAL half booking', () => {
  it('a full day at target is not a gap and reads "Full-day time off"', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: TARGET,
      timeOffSeconds: TARGET, // 8h off, 8h target — exactly full
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('Full-day time off');
  });

  it('a near-full booking under target (7.5h of an 8h target) never claims "half-day" — states the real hours + shortfall', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: 7.5 * 3600,
      timeOffSeconds: 7.5 * 3600,
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('Time off · 7.5h · 0.5h short');
    expect(note).not.toContain('Half-day');
  });

  it('another near-full case (0.9x target) also avoids the false "half-day" label', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: TARGET * 0.9,
      timeOffSeconds: TARGET * 0.9,
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).not.toContain('Half-day');
    expect(note).toContain('7.2h');
  });

  it('a booking just above half (0.6x target) also avoids the false "half-day" label', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: TARGET * 0.6,
      timeOffSeconds: TARGET * 0.6,
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).not.toContain('Half-day');
    expect(note).toContain('4.8h');
  });

  it('an ACTUAL half booking (exactly target/2, the logHalfDayPto shape) still reads "Half-day time off"', () => {
    const note = dayStatusNote({
      status: 'time-off',
      loggedSeconds: TARGET / 2,
      timeOffSeconds: TARGET / 2, // exactly 4h of an 8h target
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('Half-day time off · 4h short');
  });

  it('a normal short workday (no time off at all) is unaffected — still the plain shortfall', () => {
    const note = dayStatusNote({
      status: 'partial',
      loggedSeconds: 3 * 3600,
      timeOffSeconds: 0,
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('5h short');
  });
});

describe('dayStatusNote — Finding 10: "met" states the actual hours logged, verbatim per D-7.6-12', () => {
  it('"Target met — Xh logged", using the day\'s actual logged seconds', () => {
    const note = dayStatusNote({
      status: 'met',
      loggedSeconds: TARGET,
      timeOffSeconds: 0,
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('Target met — 8h logged');
  });
});

describe('dayStatusNote — Finding 23: a sub-6-minute shortfall floors to "0.1h short", never "0h short"', () => {
  it('a 60-second shortfall does not print the self-contradictory "0h short"', () => {
    const note = dayStatusNote({
      status: 'partial',
      loggedSeconds: TARGET - 60,
      timeOffSeconds: 0,
      targetSeconds: TARGET,
      iso: '2026-06-15',
      today: '2026-06-17',
    });
    expect(note).toBe('0.1h short');
  });
});

describe('dayStatusFor — Finding 19: no configured target means no target-relative status', () => {
  it('targetSeconds <= 0 resolves to null even with hours logged (never a "0h short" partial)', () => {
    const status = dayStatusFor({
      iso: '2026-06-15',
      loggedSeconds: 8 * 3600,
      timeOffSeconds: 0,
      targetSeconds: 0,
      today: '2026-06-17',
    });
    expect(status).toBeNull();
  });

  it('targetSeconds <= 0 with nothing logged also resolves to null, not attention', () => {
    const status = dayStatusFor({
      iso: '2026-06-15',
      loggedSeconds: 0,
      timeOffSeconds: 0,
      targetSeconds: 0,
      today: '2026-06-17',
    });
    expect(status).toBeNull();
  });
});

describe('isWeekend — Finding 24: malformed input fails closed to "not a weekend", not silently via NaN', () => {
  it('an empty string, an out-of-range month, and an unpadded date all return false', () => {
    expect(isWeekend('')).toBe(false);
    expect(isWeekend('2026-13-01')).toBe(false);
    expect(isWeekend('2026-6-20')).toBe(false); // unpadded — a real Saturday, but shape-invalid
  });
});
