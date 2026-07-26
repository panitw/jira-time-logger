import { describe, it, expect } from 'vitest';
import { pctToWidthClass } from './progress-width';

describe('pctToWidthClass', () => {
  it('a genuine zero renders w-0', () => {
    expect(pctToWidthClass(0)).toBe('w-0');
  });

  it('a negative value clamps to w-0 (defensive)', () => {
    expect(pctToWidthClass(-5)).toBe('w-0');
  });

  it('a small non-zero value never reads as empty (w-0) — D-7.7-29 defect 2, same fix', () => {
    // 2.4% would floor(2.4/5)=0 without the non-zero floor.
    expect(pctToWidthClass(2.4)).toBe('w-[5%]');
  });

  it('a near-100% value never reads as fully done (w-full) unless it genuinely floors to 100', () => {
    // 97.6% floors to index 19 → w-[95%], not w-full.
    expect(pctToWidthClass(97.6)).toBe('w-[95%]');
  });

  it('exactly 100 renders w-full', () => {
    expect(pctToWidthClass(100)).toBe('w-full');
  });

  it('a value over 100 clamps to w-full (defensive)', () => {
    expect(pctToWidthClass(140)).toBe('w-full');
  });

  it('quantises to 5% steps, floor not round', () => {
    expect(pctToWidthClass(24)).toBe('w-[20%]');
    expect(pctToWidthClass(25)).toBe('w-[25%]');
    expect(pctToWidthClass(49)).toBe('w-[45%]');
  });

  it('Finding 14: NaN resolves to w-0 (unknown), never w-full ("everything is done")', () => {
    expect(pctToWidthClass(NaN)).toBe('w-0');
    expect(pctToWidthClass(0 / 0)).toBe('w-0');
  });
});
