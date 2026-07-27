import { describe, it, expect } from 'vitest';
import {
  LEGACY_PURPLE,
  ROYAL_PURPLE,
  FOREGROUND,
  MUTED,
  FAINT,
  BORDER,
  PRIMARY_SOFT,
  SURFACE,
  SURFACE_SUNK,
  HOVER_NEUTRAL,
  AMBER_BORDER,
  AMBER_INK,
  ERROR_INK,
  STATUS_CLEAN,
  STATUS_CLEAN_BORDER,
  BANNER_HOST_ID,
  SYSTEM_FONT,
  RAIL_HEIGHT,
  SLIDE_TRANSITION,
  FOCUS_RING,
  REST,
  HOVER,
  bannerContainerStyle,
  bannerContainerNarrowStyle,
  markOuterStyle,
  markInnerStyle,
  eyebrowStyle,
  dividerStyle,
  stateLineStyle,
  stateLineNarrowStyle,
  stateFigureStyle,
  primaryActionStyle,
  openExtensionGhostStyle,
  openExtensionOutlineStyle,
  dismissStyle,
  labelStyle,
  hoursFieldStyle,
  submitStyle,
  errorTextAmberStyle,
  errorTextRedStyle,
  keyboardHintStyle,
  successButtonStyle,
  successTextStyle,
  styleString,
} from './banner-styles';

// Every literal here is pinned to the value read line-by-line from DESIGN.md
// (colors:) and round2.dc.html (Surface 4, :38-192) by the story's own
// "Verified Design-Source Values" section. Mutating any RHS below must fail —
// that is what makes this a real drift guard rather than a tautology
// (D-7.11-35: raw hex is correct here, but it must equal its named token).
describe('banner-styles token literals pin the DESIGN.md `colors:` block', () => {
  it('brand + neutrals', () => {
    expect(LEGACY_PURPLE).toBe('#594F74'); // DESIGN.md:8 colors.legacy-purple
    expect(ROYAL_PURPLE).toBe('#615B99'); // DESIGN.md:9 colors.royal-purple
    expect(FOREGROUND).toBe('#1E1B2E'); // DESIGN.md:18 colors.foreground
    expect(MUTED).toBe('#6B6678'); // DESIGN.md:19 colors.muted
    expect(FAINT).toBe('#6B6B72'); // DESIGN.md:20 colors.faint
    expect(BORDER).toBe('#E4E3EC'); // DESIGN.md:22 colors.border
    expect(PRIMARY_SOFT).toBe('#ECEBF3'); // DESIGN.md:29 colors.primary-soft
    expect(SURFACE).toBe('#FFFFFF'); // DESIGN.md:16 colors.surface
    expect(SURFACE_SUNK).toBe('#FCFCFD'); // DESIGN.md:17 colors.surface-sunk
    expect(HOVER_NEUTRAL).toBe('#F4F4F7'); // DESIGN.md:258 icons.kbd.background
  });

  it('amber / error / success tints', () => {
    expect(AMBER_BORDER).toBe('#EDD3A6'); // DESIGN.md:39 colors.amber-border
    expect(AMBER_INK).toBe('#7A3E06'); // DESIGN.md:40 colors.amber-ink
    expect(ERROR_INK).toBe('#991B1B'); // DESIGN.md:45 colors.error-ink
    expect(STATUS_CLEAN).toBe('#15803D'); // DESIGN.md:32 colors.status-clean
    expect(STATUS_CLEAN_BORDER).toBe('#BFE0C8'); // DESIGN.md:48 colors.status-clean-border
  });

  it('the single legitimate red is error-ink, not the deleted DANGER (#dc2626)', () => {
    // D-7.11-40: the pre-story `DANGER = '#dc2626'` fed THREE strings, two of
    // which were client-side validation that never reached Jira. It is
    // deleted (see `lib/banner-source.grep.test.ts` for the source-level
    // absence proof); only ERROR_INK (#991B1B) remains, for the one refused
    // write.
    expect(ERROR_INK).not.toBe('#dc2626');
  });

  it('uses the stable host element id', () => {
    expect(BANNER_HOST_ID).toBe('jira-time-logger-banner-root');
  });
});

describe('SYSTEM_FONT — D-7.11-38: the shipped stack was wrong, this is the exact fix', () => {
  it('equals `{typography.guest}` exactly (DESIGN.md:106 / round2.dc.html:53)', () => {
    expect(SYSTEM_FONT).toBe('system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
  });

  it('does NOT contain the previously-shipped extras (BlinkMacSystemFont/Helvetica/Arial)', () => {
    expect(SYSTEM_FONT).not.toContain('BlinkMacSystemFont');
    expect(SYSTEM_FONT).not.toContain('Helvetica');
    expect(SYSTEM_FONT).not.toContain('Arial');
  });
});

describe('RAIL_HEIGHT — the layout contract (AC5, D-7.11-45)', () => {
  it('is 44px, not the old 56/120px collapsed/expanded pair', () => {
    expect(RAIL_HEIGHT).toBe('44px');
  });

  it('is the ONLY height in bannerContainerStyle, and bannerContainerNarrowStyle inherits it', () => {
    expect(bannerContainerStyle.height).toBe(RAIL_HEIGHT);
    expect(bannerContainerNarrowStyle.height).toBe(RAIL_HEIGHT);
  });
});

describe('SLIDE_TRANSITION — motion is ONE property (AC6): transform only, no height transition', () => {
  it('mentions transform and 200ms ease-out, and does not transition height', () => {
    expect(SLIDE_TRANSITION).toContain('transform');
    expect(SLIDE_TRANSITION).toContain('200ms');
    expect(SLIDE_TRANSITION).toContain('ease-out');
    expect(SLIDE_TRANSITION).not.toContain('height');
  });
});

describe('FOCUS_RING pins bannerBase.fieldRing (round2.dc.html:1310)', () => {
  it('is the exact rgba ring value', () => {
    expect(FOCUS_RING).toBe('0 0 0 3px rgba(89,79,116,.13)');
  });
});

// TT1 — must go red if C1/C2/C3 (background, spine, hairline, no shadow) regress.
describe('bannerContainerStyle — the rail, not the old full-bleed purple bar (C1-C3)', () => {
  it('white ground, 44px, purple-tinted hairline, legacy-purple spine, no shadow', () => {
    expect(bannerContainerStyle.background).toBe('#FFFFFF');
    expect(bannerContainerStyle.height).toBe('44px');
    expect(bannerContainerStyle.borderLeft).toBe('3px solid #594F74');
    expect(bannerContainerStyle.borderBottom).toBe('1px solid #E4E3EC');
    expect(bannerContainerStyle.boxShadow).toBeUndefined();
    // The old accent-subtle full-bleed bar background must never come back.
    expect(styleString(bannerContainerStyle)).not.toContain('#e9e6f3');
  });

  it('serializes with no box-shadow substring at all', () => {
    expect(styleString(bannerContainerStyle)).not.toContain('box-shadow');
  });
});

describe('bannerContainerNarrowStyle — tighter padding/gap below 860px (T7, round2:147-154)', () => {
  it('padding 0 10px 0 11px, gap 10px', () => {
    expect(bannerContainerNarrowStyle.padding).toBe('0 10px 0 11px');
    expect(bannerContainerNarrowStyle.gap).toBe('10px');
  });
});

describe('the 18px mark is geometry, not an icon (D-7.11-36, C4)', () => {
  it('outer: 18x18, radius 5px, legacy-purple', () => {
    expect(markOuterStyle.width).toBe('18px');
    expect(markOuterStyle.height).toBe('18px');
    expect(markOuterStyle.borderRadius).toBe('5px');
    expect(markOuterStyle.background).toBe(LEGACY_PURPLE);
  });

  it('inner dot: 5x5, fully round, white', () => {
    expect(markInnerStyle.width).toBe('5px');
    expect(markInnerStyle.height).toBe('5px');
    expect(markInnerStyle.borderRadius).toBe('9999px');
    expect(markInnerStyle.background).toBe('#FFFFFF');
  });
});

describe('eyebrow + divider (C5)', () => {
  it('eyebrow: 10px/600/.11em/uppercase/faint', () => {
    expect(eyebrowStyle.fontSize).toBe('10px');
    expect(eyebrowStyle.fontWeight).toBe('600');
    expect(eyebrowStyle.letterSpacing).toBe('.11em');
    expect(eyebrowStyle.textTransform).toBe('uppercase');
    expect(eyebrowStyle.color).toBe(FAINT);
  });

  it('divider: 1x16 border-colour line', () => {
    expect(dividerStyle.width).toBe('1px');
    expect(dividerStyle.height).toBe('16px');
    expect(dividerStyle.background).toBe(BORDER);
  });
});

describe('E-2 / D-7.11-31(b) — 28px control height everywhere, NOT the source\'s 30px', () => {
  it('primaryActionStyle, hoursFieldStyle and submitStyle are all 28px', () => {
    expect(primaryActionStyle.height).toBe('28px');
    expect(hoursFieldStyle.height).toBe('28px');
    expect(submitStyle.height).toBe('28px');
    expect(openExtensionGhostStyle.height).toBe('28px');
    expect(openExtensionOutlineStyle.height).toBe('28px');
    expect(successButtonStyle.height).toBe('28px');
  });

  it('dismissStyle keeps the source\'s own 26x26 footprint (not a control-height case)', () => {
    expect(dismissStyle.width).toBe('26px');
    expect(dismissStyle.height).toBe('26px');
    expect(dismissStyle.borderRadius).toBe('5px');
  });
});

describe('primaryActionStyle never wraps (AC8)', () => {
  it('declares white-space:nowrap and a non-growing flex-basis', () => {
    expect(primaryActionStyle.whiteSpace).toBe('nowrap');
    expect(primaryActionStyle.flex).toBe('0 0 auto');
  });
});

describe('open-extension fork (round2:60 vs :106) — ghost vs outline', () => {
  it('ghost: transparent background, no border, muted text', () => {
    expect(openExtensionGhostStyle.background).toBe('transparent');
    expect(openExtensionGhostStyle.border).toBe('none');
    expect(openExtensionGhostStyle.color).toBe(MUTED);
  });

  it('outline: white background, hairline border, legacy-purple text', () => {
    expect(openExtensionOutlineStyle.background).toBe('#FFFFFF');
    expect(openExtensionOutlineStyle.border).toBe(`1px solid ${BORDER}`);
    expect(openExtensionOutlineStyle.color).toBe(LEGACY_PURPLE);
  });
});

// TT9 — must go red if D-7.11-40 is reverted (red creeping back onto the two
// client-side validation errors, or the write-failure losing its red).
describe('D-7.11-40 — amber vs red split', () => {
  it('errorTextAmberStyle is amber-ink, never the old danger red', () => {
    expect(errorTextAmberStyle.color).toBe('#7A3E06');
    expect(errorTextAmberStyle.color).not.toBe('#dc2626');
  });

  it('errorTextRedStyle is error-ink — the ONE legitimate red', () => {
    expect(errorTextRedStyle.color).toBe('#991B1B');
  });
});

describe('successButtonStyle / successTextStyle — status-clean outline', () => {
  it('outline border is status-clean-border, text is status-clean', () => {
    expect(successButtonStyle.color).toBe('#15803D');
    expect(successButtonStyle.border).toBe('1px solid #BFE0C8');
    expect(successButtonStyle.cursor).toBe('default');
  });

  it('successTextStyle (the role="alert" announcement) is neutral, not error/amber-coloured', () => {
    expect(successTextStyle.color).toBe(FAINT);
    expect(successTextStyle.color).not.toBe('#7A3E06');
    expect(successTextStyle.color).not.toBe('#991B1B');
  });
});

// TT4 — every style object that renders a figure carries tabular-nums.
describe('AC3 — font-variant-numeric:tabular-nums on every figure-bearing style', () => {
  const figureBearing: Record<string, Record<string, string>> = {
    stateLineStyle,
    stateLineNarrowStyle,
    primaryActionStyle,
    labelStyle,
    hoursFieldStyle,
    submitStyle,
    successButtonStyle,
    errorTextAmberStyle,
  };

  it.each(Object.entries(figureBearing))('%s declares tabular-nums', (_name, style) => {
    expect(style.fontVariantNumeric).toBe('tabular-nums');
  });

  it('stateFigureStyle is weight-600 (the figure inside the state line)', () => {
    expect(stateFigureStyle.fontWeight).toBe('600');
  });

  it('non-figure-bearing styles do not falsely claim tabular-nums', () => {
    expect(dismissStyle.fontVariantNumeric).toBeUndefined();
    expect(eyebrowStyle.fontVariantNumeric).toBeUndefined();
    expect(keyboardHintStyle.fontVariantNumeric).toBeUndefined();
    expect(errorTextRedStyle.fontVariantNumeric).toBeUndefined();
  });
});

describe('every button/input style declares its own fontFamily (form elements do not inherit)', () => {
  const controlStyles: Record<string, Record<string, string>> = {
    primaryActionStyle,
    openExtensionGhostStyle,
    openExtensionOutlineStyle,
    dismissStyle,
    hoursFieldStyle,
    submitStyle,
    successButtonStyle,
  };

  it.each(Object.entries(controlStyles))('%s sets fontFamily to SYSTEM_FONT', (_name, style) => {
    expect(style.fontFamily).toBe(SYSTEM_FONT);
  });
});

describe('REST / HOVER value maps (T5)', () => {
  it('primary action: legacy-purple at rest, royal-purple on hover', () => {
    expect(REST.primaryAction.background).toBe(LEGACY_PURPLE);
    expect(HOVER.primaryAction.background).toBe(ROYAL_PURPLE);
  });

  it('ghost "Open extension": muted at rest, legacy-purple on hover', () => {
    expect(REST.openExtensionGhost.color).toBe(MUTED);
    expect(HOVER.openExtensionGhost.color).toBe(LEGACY_PURPLE);
  });

  it('outline "Open extension": white at rest, primary-soft on hover', () => {
    expect(REST.openExtensionOutline.background).toBe(SURFACE);
    expect(HOVER.openExtensionOutline.background).toBe(PRIMARY_SOFT);
  });

  it('dismiss: transparent/faint at rest, hover-neutral/foreground on hover', () => {
    expect(REST.dismiss.background).toBe('transparent');
    expect(REST.dismiss.color).toBe(FAINT);
    expect(HOVER.dismiss.background).toBe(HOVER_NEUTRAL);
    expect(HOVER.dismiss.color).toBe(FOREGROUND);
  });
});

describe('styleString', () => {
  it('serializes a style object into a CSS text string with kebab-case keys', () => {
    const css = styleString({ background: '#fff', fontSize: '13px' });
    expect(css).toContain('background:#fff');
    expect(css).toContain('font-size:13px');
  });

  it('returns empty string for empty object', () => {
    expect(styleString({})).toBe('');
  });
});
