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
  it('quantises percent to a literal 5%-step Tailwind class', () => {
    const { container } = render(
      <DayStatusIndicator status="partial" variant="stacked" percent={53} note="2.5h short" />,
    );
    const bar = container.querySelectorAll('span')[2]; // outer bar wrapper
    expect(bar?.querySelector('span')?.className).toMatch(/w-\[55%\]/);
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
