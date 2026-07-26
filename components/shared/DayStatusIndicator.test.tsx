import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DayStatusIndicator } from '@/components/shared/DayStatusIndicator';
import { DAY_STATUSES, STATUS_LABEL, type DayStatus } from '@/lib/day-status';

/** Accessible text with the decorative svg stripped out — the AC8 test:
 * "delete the icon and the state must still read correctly". */
function textWithoutIcon(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('svg').forEach((svg) => svg.remove());
  return clone.textContent ?? '';
}

describe('DayStatusIndicator — AC2/AC8: all five day statuses, both variants, at the REAL call-site shapes', () => {
  // D-7.6-43 / Finding 4: the previous version of this suite rendered with
  // NEITHER `label` NOR `note` — i.e. only the fallback path. But every
  // production call site overrides the visible text: `WeeklyGrid.tsx`
  // passes `label={note}` (a `dayStatusNote()` string); `ManagerMatrix.tsx`
  // passes `label={STRINGS.approved/onTarget/shortOfTarget}`;
  // `ChromeHeader.tsx` passes `label={note}` on `tone="chrome"`. Only the
  // matrix's `restricted` chip uses the bare default. These tests exercise
  // the OVERRIDE path every OTHER production consumer actually takes.
  for (const status of DAY_STATUSES) {
    const overrideLabel = `${status} — axis-specific words`;

    it(`${status} (inline, with an overriding label — ManagerMatrix/ChromeHeader's real shape): icon is aria-hidden and the OVERRIDDEN text alone names the state`, () => {
      const { container } = render(
        <DayStatusIndicator status={status} label={overrideLabel} value="4.0" />,
      );
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      const textAlone = textWithoutIcon(container);
      expect(textAlone).toContain(overrideLabel);
    });

    it(`${status} (stacked, with a note — WeeklyGrid's real totals-cell shape): icon is aria-hidden and the NOTE text alone names the state`, () => {
      const note = `${status} note text`;
      const { container } = render(
        <DayStatusIndicator
          status={status}
          variant="stacked"
          value="4.0"
          percent={50}
          note={note}
        />,
      );
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      const textAlone = textWithoutIcon(container);
      expect(textAlone).toContain(note);
    });
  }

  it("the matrix's restricted chip (the ONE production call site that omits both label and note) is still readable text-alone", () => {
    // components/manager/ManagerMatrix.tsx: <DayStatusIndicator variant="inline" status="restricted" className="shrink-0" />
    const { container } = render(<DayStatusIndicator status="restricted" />);
    const textAlone = textWithoutIcon(container);
    expect(textAlone).toContain(STATUS_LABEL.restricted);
  });
});

describe('DayStatusIndicator — AC8 fallback path (no caller override — kept as an extra, per D-7.6-43; no OTHER production call site reaches this)', () => {
  for (const status of DAY_STATUSES) {
    it(`${status} (inline): falls back to STATUS_LABEL when the caller omits label`, () => {
      const { container } = render(<DayStatusIndicator status={status} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      const textAlone = textWithoutIcon(container);
      expect(textAlone).toContain(STATUS_LABEL[status]);
    });

    it(`${status} (stacked): falls back to STATUS_LABEL when the caller omits both label and note`, () => {
      const { container } = render(
        <DayStatusIndicator status={status} variant="stacked" value="4.0" percent={50} />,
      );
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      const textAlone = textWithoutIcon(container);
      expect(textAlone.length).toBeGreaterThan(0);
      // Default (no `note` passed) falls back to the visible label — AC8
      // must hold even when the caller forgets to supply a note.
      expect(textAlone).toContain(STATUS_LABEL[status]);
    });
  }
});

describe('DayStatusIndicator — filled icons (AC5)', () => {
  it('attention (Circle) and time-off (Diamond) render fill="currentColor"', () => {
    const { container: attentionEl } = render(<DayStatusIndicator status="attention" />);
    expect(attentionEl.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');

    const { container: timeOffEl } = render(<DayStatusIndicator status="time-off" />);
    expect(timeOffEl.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
  });

  it('met/partial/weekend do NOT render a solid fill', () => {
    for (const status of ['met', 'partial', 'weekend'] as DayStatus[]) {
      const { container } = render(<DayStatusIndicator status={status} />);
      expect(container.querySelector('svg')?.getAttribute('fill')).not.toBe('currentColor');
    }
  });
});

describe('DayStatusIndicator — never LoaderCircle, never EyeOff as a day status (AC5)', () => {
  it('restricted and loading render DIFFERENT icons from each other and from every day status', () => {
    const { container: restrictedEl } = render(<DayStatusIndicator status="restricted" />);
    const { container: loadingEl } = render(<DayStatusIndicator status="loading" />);
    const restrictedSvg = restrictedEl.querySelector('svg')!.outerHTML;
    const loadingSvg = loadingEl.querySelector('svg')!.outerHTML;
    expect(restrictedSvg).not.toBe(loadingSvg);

    for (const status of DAY_STATUSES) {
      const { container } = render(<DayStatusIndicator status={status} />);
      const svg = container.querySelector('svg')!.outerHTML;
      expect(svg).not.toBe(restrictedSvg);
      expect(svg).not.toBe(loadingSvg);
    }
  });
});

describe('DayStatusIndicator — label override (D-7.6-4: same token, axis-specific words)', () => {
  it('overrides the visible text without changing the icon or colour class', () => {
    const { container } = render(
      <DayStatusIndicator status="attention" label="Edited after approval" />,
    );
    expect(screen.getByText('Edited after approval')).toBeTruthy();
    expect(screen.queryByText(STATUS_LABEL.attention)).toBeNull();
    // The colour class is still the shared `attention` token — an axis
    // reusing the token, never a bespoke colour.
    expect(container.querySelector('span')?.className).toContain('text-amber-ink');
  });
});

describe('DayStatusIndicator — Finding 16: an empty-string label/note falls back, never rendering icon+colour with zero visible text', () => {
  it('label="" falls back to the default STATUS_LABEL (inline)', () => {
    const { container } = render(<DayStatusIndicator status="met" label="" />);
    const textAlone = textWithoutIcon(container);
    expect(textAlone).toContain(STATUS_LABEL.met);
  });

  it('note="" falls back to the default STATUS_LABEL (stacked)', () => {
    const { container } = render(
      <DayStatusIndicator status="partial" variant="stacked" percent={50} note="" />,
    );
    const textAlone = textWithoutIcon(container);
    expect(textAlone).toContain(STATUS_LABEL.partial);
  });

  it('note="" still falls back to an explicit label override, not the raw STATUS_LABEL, when both are given', () => {
    const { container } = render(
      <DayStatusIndicator
        status="attention"
        variant="stacked"
        percent={0}
        label="Edited after approval"
        note=""
      />,
    );
    const textAlone = textWithoutIcon(container);
    expect(textAlone).toContain('Edited after approval');
  });
});

describe('DayStatusIndicator — variant="stacked" bar (D-7.6-3)', () => {
  // Story 7.7, D-7.7-29 defect 2: `Math.round` used to map 53% to `w-[55%]`;
  // `Math.floor` (with a non-zero floor) now maps it to `w-[50%]` — the
  // floor never rounds UP past the true percentage, which is what let 97.6%
  // read as "done" before this fix.
  it('quantises percent to a literal 5%-step Tailwind class, floored (never rounded up)', () => {
    const { container } = render(
      <DayStatusIndicator status="partial" variant="stacked" percent={53} note="2.5h short" />,
    );
    const bar = container.querySelectorAll('span')[2]; // outer bar wrapper
    expect(bar?.querySelector('span')?.className).toMatch(/w-\[50%\]/);
  });

  // RED-proved: reverting `Math.floor` back to `Math.round` makes this
  // assertion fail (97.6 would render `w-full`).
  it('a near-100% value never reads as fully done (w-full) — D-7.7-29 defect 2', () => {
    const { container } = render(
      <DayStatusIndicator status="met" variant="stacked" percent={97.6} note="Almost there" />,
    );
    const bar = container.querySelectorAll('span')[2];
    expect(bar?.querySelector('span')?.className).not.toMatch(/w-full/);
    expect(bar?.querySelector('span')?.className).toMatch(/w-\[95%\]/);
  });

  // RED-proved: reverting to `Math.round` makes this assertion fail (2.4
  // rounds to 0, i.e. `w-0`, before the fix).
  it('a small non-zero value never reads as empty (w-0) — D-7.7-29 defect 2', () => {
    const { container } = render(
      <DayStatusIndicator status="partial" variant="stacked" percent={2.4} note="Just started" />,
    );
    const bar = container.querySelectorAll('span')[2];
    expect(bar?.querySelector('span')?.className).not.toMatch(/w-0\b/);
    expect(bar?.querySelector('span')?.className).toMatch(/w-\[5%\]/);
  });

  it('a genuine zero still renders w-0', () => {
    const { container } = render(
      <DayStatusIndicator status="attention" variant="stacked" percent={0} note="Nothing yet" />,
    );
    const bar = container.querySelectorAll('span')[2];
    expect(bar?.querySelector('span')?.className).toMatch(/w-0\b/);
  });

  // Story 7.7, D-7.7-29 defect 1 (width): the wrapper must have a DEFINITE
  // width so `w-full` on the bar is container-relative, not relative to the
  // widest sibling line. RED-proved by reverting `flex w-full` to
  // `inline-flex` — the wrapper would then lose the `w-full` class here.
  // Finisher fix, D-7.7-21 / Finding 9: this test used to end with
  // `expect(shortBar?.className).toBe(longBar?.className)`, prescribed by
  // the story itself ("same percent, different note → same width class").
  // That assertion is VACUOUS — it cannot fail under any mutation, because
  // `pctToWidthClass` is a pure function of `percent` alone; the width
  // CLASS never depended on note length, even with the pre-fix `inline-
  // flex` bug. The real defect D-7.7-29 describes is a RENDERED PIXEL LENGTH
  // difference (`w-full` resolving against the widest sibling line under
  // `inline-flex` rather than the wrapper's own box), which jsdom does not
  // lay out and therefore cannot measure — no assertion in a Vitest+jsdom-
  // only project can prove container-relative geometry. What CAN be proven,
  // and is genuinely load-bearing (RED-proved: reverting `flex w-full` to
  // `inline-flex` fails this), is the CSS CONTRACT itself: a definite
  // `flex` (never `inline-flex`) + `w-full` on the WRAPPER is what MAKES
  // the bar's `w-full` resolve against the totals `<td>` (pinned to 104px
  // by D-7.7-23) instead of a sibling line. This test now asserts that
  // contract directly, on both renders, and records the limitation instead
  // of implying a geometric proof that doesn't exist.
  it('the wrapper has a definite width regardless of note length — the CSS contract, not rendered geometry', () => {
    const short = render(
      <DayStatusIndicator status="partial" variant="stacked" percent={50} note="short" />,
    );
    const long = render(
      <DayStatusIndicator
        status="partial"
        variant="stacked"
        percent={50}
        note="a much, much longer note that would otherwise widen the sibling line"
      />,
    );
    const shortWrapper = short.container.querySelector('span');
    const longWrapper = long.container.querySelector('span');
    for (const wrapper of [shortWrapper, longWrapper]) {
      expect(wrapper?.className).toContain('flex');
      expect(wrapper?.className).not.toContain('inline-flex');
      expect(wrapper?.className).toContain('w-full');
    }
    // Honest limitation: jsdom cannot measure rendered pixel width, so the
    // two renders' bar CLASSES are asserted equal only as a sanity check
    // that the quantisation arithmetic (proven exact elsewhere in this
    // file) is unaffected by note length — NOT as proof the two bars
    // occupy the same number of physical pixels, which this suite cannot
    // demonstrate.
    const shortBar = short.container.querySelectorAll('span')[2]?.querySelector('span');
    const longBar = long.container.querySelectorAll('span')[2]?.querySelector('span');
    expect(shortBar?.className).toBe(longBar?.className);
  });

  it('renders no bar at all for weekend, regardless of percent', () => {
    const { container } = render(
      <DayStatusIndicator status="weekend" variant="stacked" percent={80} />,
    );
    // Only the icon/value line + the note line — no progress-bar wrapper.
    const bars = container.querySelectorAll('[aria-hidden="true"].h-\\[3px\\]');
    expect(bars.length).toBe(0);
  });

  it('the bar itself is aria-hidden — the note carries the meaning', () => {
    const { container } = render(
      <DayStatusIndicator status="met" variant="stacked" percent={100} note="Target met" />,
    );
    const bar = container.querySelector('.h-\\[3px\\]');
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
  });

  // Story 7.7, D-7.7-15: the track is the design's `#EDECF2` (`bg-cell-border`
  // in the token layer), NOT `--color-border-faint` (`#F0EFF5`), which is a
  // different, already-spoken-for value (the column separator rule).
  it('the bar track uses the cell-border token, not border-faint', () => {
    const { container } = render(
      <DayStatusIndicator status="met" variant="stacked" percent={100} note="Target met" />,
    );
    const track = container.querySelector('.h-\\[3px\\]');
    expect(track?.className).toContain('bg-cell-border');
    expect(track?.className).not.toContain('bg-border-faint');
  });
});

// Story 7.7, D-7.7-16: the bar colour is a separate axis from the text
// colour — RED-proved by reverting `STATUS_BAR_CLASS[status]` back to
// `bg-current`, which would make `partial`'s bar match its (near-black)
// text colour class.
describe('DayStatusIndicator — variant="stacked" bar colour is a separate axis (D-7.7-16)', () => {
  it("partial's bar colour is royal-purple, NOT the same class as its text colour", () => {
    const { container } = render(
      <DayStatusIndicator status="partial" variant="stacked" percent={50} note="2.5h short" />,
    );
    const wrapper = container.querySelector('span');
    const bar = container.querySelectorAll('span')[2]?.querySelector('span');
    expect(wrapper?.className).toContain('text-foreground');
    expect(bar?.className).toContain('bg-royal-purple');
    expect(bar?.className).not.toContain('bg-current');
  });

  it("met's bar colour equals its text colour (the one status where they agree)", () => {
    const { container } = render(
      <DayStatusIndicator status="met" variant="stacked" percent={100} note="Target met" />,
    );
    const bar = container.querySelectorAll('span')[2]?.querySelector('span');
    expect(bar?.className).toContain('bg-status-clean');
  });

  it("time-off's bar colour is its own token, distinct from its text colour", () => {
    const { container } = render(
      <DayStatusIndicator status="time-off" variant="stacked" percent={100} note="Full-day time off" />,
    );
    const wrapper = container.querySelector('span');
    const bar = container.querySelectorAll('span')[2]?.querySelector('span');
    expect(wrapper?.className).toContain('text-legacy-purple');
    expect(bar?.className).toContain('bg-time-off-bar');
  });
});

// Story 7.7, D-7.7-30/17: `size` is for the totals row's 11px glyph, not a
// cell icon (obligation 3's consumer changed — see D-7.7-17).
describe('DayStatusIndicator — size prop (D-7.7-30)', () => {
  it('defaults to 12px when size is omitted', () => {
    const { container } = render(<DayStatusIndicator status="met" />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('12');
  });

  it('renders an 11px icon when size={11} (the totals-row glyph)', () => {
    const { container } = render(<DayStatusIndicator status="time-off" size={11} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('11');
  });

  it('renders a 13px icon when size={13}', () => {
    const { container } = render(<DayStatusIndicator status="met" size={13} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('13');
  });
});

describe('DayStatusIndicator — tone="chrome" is white-only for every status, "met" included (D-7.6-40, correcting D-7.6-39)', () => {
  it('every status — met included — renders translucent white on the chrome tone, never a per-status colour', () => {
    for (const status of DAY_STATUSES) {
      const { container } = render(<DayStatusIndicator status={status} tone="chrome" />);
      expect(container.querySelector('span')?.className).toContain('text-white/85');
      expect(container.querySelector('span')?.className).not.toContain('text-status-clean-on-chrome');
    }
  });

  it('data tone (default) uses the plain status-clean token — the on-chrome/data distinction still exists, it just no longer varies BY status on chrome', () => {
    const { container } = render(<DayStatusIndicator status="met" />);
    expect(container.querySelector('span')?.className).toContain('text-status-clean');
    expect(container.querySelector('span')?.className).not.toContain('text-white/85');
  });
});
