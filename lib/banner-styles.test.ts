import { describe, it, expect } from 'vitest';
import {
  ACCENT,
  ACCENT_SUBTLE,
  NEUTRAL_700,
  NEUTRAL_500,
  WHITE,
  BANNER_HOST_ID,
  bannerContainerStyle,
  brandDotStyle,
  primaryTextStyle,
  openExtensionStyle,
  contextualButtonStyle,
  hoursInputStyle,
  logButtonStyle,
  dismissButtonStyle,
  errorTextStyle,
  SLIDE_TRANSITION,
  styleString,
} from './banner-styles';

describe('banner-styles token literals', () => {
  it('exports the documented hex tokens', () => {
    expect(ACCENT).toBe('#6b5b95');
    expect(ACCENT_SUBTLE).toBe('#e9e6f3');
    expect(NEUTRAL_700).toBe('#334155');
    expect(NEUTRAL_500).toBe('#64748b');
    expect(WHITE).toBe('#ffffff');
  });

  it('uses the stable host element id', () => {
    expect(BANNER_HOST_ID).toBe('jira-time-logger-banner-root');
  });
});

describe('banner-styles style objects (CSP-safe inline only)', () => {
  it('banner background is accent.subtle and full width', () => {
    expect(bannerContainerStyle.background).toBe(ACCENT_SUBTLE);
    expect(bannerContainerStyle.width).toBe('100%');
  });

  it('brand dot is brand purple', () => {
    expect(brandDotStyle.color).toBe(ACCENT);
  });

  it('primary text is neutral.700', () => {
    expect(primaryTextStyle.color).toBe(NEUTRAL_700);
  });

  it('open-extension tertiary CTA is neutral.500 with no border', () => {
    expect(openExtensionStyle.color).toBe(NEUTRAL_500);
    expect(openExtensionStyle.border).toBe('none');
  });

  it('contextual button is brand purple background with white text', () => {
    expect(contextualButtonStyle.background).toBe(ACCENT);
    expect(contextualButtonStyle.color).toBe(WHITE);
  });

  it('log button is brand purple', () => {
    expect(logButtonStyle.background).toBe(ACCENT);
    expect(logButtonStyle.color).toBe(WHITE);
  });

  it('hours input exists with a fixed-px font size', () => {
    expect(hoursInputStyle.fontSize).toMatch(/px$/);
  });

  it('dismiss button has no border (ghost)', () => {
    expect(dismissButtonStyle.border).toBe('none');
  });

  it('error text is a danger-ish color string', () => {
    expect(typeof errorTextStyle.color).toBe('string');
  });

  it('uses fixed pixel sizes (no Tailwind classes / rem-only)', () => {
    expect(bannerContainerStyle.fontSize).toMatch(/px$/);
  });

  it('slide transition mentions 200ms ease-out', () => {
    expect(SLIDE_TRANSITION).toContain('200ms');
    expect(SLIDE_TRANSITION).toContain('ease-out');
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
