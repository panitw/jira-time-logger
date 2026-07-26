import { describe, it, expect } from 'vitest';
import {
  parseHours,
  hoursToSeconds,
  secondsToHours,
  secondsToHoursDisplay,
  secondsToFixedHoursDisplay,
  secondsToCellDisplay,
  hoursPhrase,
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

describe('secondsToFixedHoursDisplay', () => {
  it('keeps the trailing .0 (12.0h) for whole hours', () => {
    expect(secondsToFixedHoursDisplay(12 * 3600)).toBe('12.0h');
  });

  it('displays 32.0h for 32 hours', () => {
    expect(secondsToFixedHoursDisplay(32 * 3600)).toBe('32.0h');
  });

  it('displays 0.5h for 1800s', () => {
    expect(secondsToFixedHoursDisplay(1800)).toBe('0.5h');
  });

  it('rounds to one decimal (2.5h)', () => {
    expect(secondsToFixedHoursDisplay(9000)).toBe('2.5h');
  });

  it('displays 0.0h for 0s (defensive — aggregated tickets are >0)', () => {
    expect(secondsToFixedHoursDisplay(0)).toBe('0.0h');
  });

  it('displays 0.0h for negative seconds (defensive)', () => {
    expect(secondsToFixedHoursDisplay(-100)).toBe('0.0h');
  });
});

describe('secondsToCellDisplay', () => {
  it('displays a bare one-decimal value (4.0)', () => {
    expect(secondsToCellDisplay(14400)).toBe('4.0');
  });

  it('displays 0.5 for 1800s', () => {
    expect(secondsToCellDisplay(1800)).toBe('0.5');
  });

  it('displays ── for 0s', () => {
    expect(secondsToCellDisplay(0)).toBe('——');
  });

  it('displays ── for negative', () => {
    expect(secondsToCellDisplay(-100)).toBe('——');
  });
});

describe('MAX_HOURS_PER_ENTRY', () => {
  it('is 24', () => {
    expect(MAX_HOURS_PER_ENTRY).toBe(24);
  });
});

// Story 7.7, D-7.7-24: the spoken-quantity phrase for a body cell's
// accessible name — "Wednesday, MBS-135, 4 hours", not "4.0".
describe('hoursPhrase', () => {
  it('pluralizes a whole number of hours (4 hours)', () => {
    expect(hoursPhrase(hoursToSeconds(4))).toBe('4 hours');
  });

  it('singularizes exactly one hour (1 hour)', () => {
    expect(hoursPhrase(hoursToSeconds(1))).toBe('1 hour');
  });

  it('keeps a fractional hour value (4.5 hours)', () => {
    expect(hoursPhrase(hoursToSeconds(4.5))).toBe('4.5 hours');
  });

  it('spells sub-hour amounts as minutes, not a fraction (30 minutes)', () => {
    expect(hoursPhrase(hoursToSeconds(0.5))).toBe('30 minutes');
  });

  it('singularizes exactly one minute (1 minute)', () => {
    expect(hoursPhrase(60)).toBe('1 minute');
  });

  it('returns "0 hours" for a zero/empty duration', () => {
    expect(hoursPhrase(0)).toBe('0 hours');
    expect(hoursPhrase(-100)).toBe('0 hours');
  });
});
