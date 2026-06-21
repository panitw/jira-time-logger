import { describe, it, expect } from 'vitest';
import {
  parseHours,
  hoursToSeconds,
  secondsToHours,
  secondsToHoursDisplay,
  MAX_HOURS_PER_ENTRY,
} from './hours';

describe('parseHours', () => {
  describe('valid formats', () => {
    const cases: Array<[string, number]> = [
      ['2.5', 2.5],
      ['2.5h', 2.5],
      ['2h 30m', 2.5],
      ['2:30', 2.5],
      ['150m', 2.5],
      ['1d 1h', 25],
      ['1d', 24],
      ['30m', 0.5],
      ['2', 2],
      ['2h', 2],
      ['1d 2h 30m', 26.5],
      ['0.5', 0.5],
      ['0.5h', 0.5],
      ['8', 8],
      ['8h', 8],
      ['1:15', 1.25],
      ['0:30', 0.5],
      ['45m', 0.75],
      ['1.5h', 1.5],
      ['  2.5  ', 2.5],
      ['2H', 2],
      ['2H 30M', 2.5],
      ['1D 1H', 25],
    ];

    for (const [input, expected] of cases) {
      it(`parses "${input}" → ${expected}h`, () => {
        const result = parseHours(input);
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') {
          expect(result.hours).toBeCloseTo(expected, 10);
        }
      });
    }
  });

  describe('invalid formats', () => {
    const cases = [
      '',
      '   ',
      'abc',
      '-2',
      '-2h',
      '0',
      '0h',
      '0m',
      '0:0',
      '2.5.5',
      '2:60',
      '2:99',
      '2::30',
      'h',
      'm',
      'd',
      '1x',
      '1d 1d',
      '2h 2h',
      ':30',
      '2:',
    ];

    for (const input of cases) {
      it(`rejects "${input}"`, () => {
        const result = parseHours(input);
        expect(result.kind).toBe('unparseable');
      });
    }
  });
});

describe('hoursToSeconds', () => {
  it('converts 2.5h → 9000s', () => {
    expect(hoursToSeconds(2.5)).toBe(9000);
  });

  it('converts 1h → 3600s', () => {
    expect(hoursToSeconds(1)).toBe(3600);
  });

  it('converts 0.5h → 1800s', () => {
    expect(hoursToSeconds(0.5)).toBe(1800);
  });

  it('rounds fractional seconds', () => {
    expect(hoursToSeconds(1.0001)).toBe(3600);
  });
});

describe('secondsToHours', () => {
  it('converts 9000s → 2.5h', () => {
    expect(secondsToHours(9000)).toBe(2.5);
  });
});

describe('secondsToHoursDisplay', () => {
  it('displays 2.5h for 9000s', () => {
    expect(secondsToHoursDisplay(9000)).toBe('2.5h');
  });

  it('displays 0.5h for 1800s', () => {
    expect(secondsToHoursDisplay(1800)).toBe('0.5h');
  });

  it('displays ── for 0s', () => {
    expect(secondsToHoursDisplay(0)).toBe('\u2014\u2014');
  });

  it('displays ── for negative', () => {
    expect(secondsToHoursDisplay(-100)).toBe('\u2014\u2014');
  });

  it('displays 8h for 28800s', () => {
    expect(secondsToHoursDisplay(28800)).toBe('8h');
  });
});

describe('MAX_HOURS_PER_ENTRY', () => {
  it('is 24', () => {
    expect(MAX_HOURS_PER_ENTRY).toBe(24);
  });
});
