/**
 * CSP-safe inline-style tokens for the inline Jira banner (Story 3.3).
 *
 * The banner is injected by a content script into Jira pages. Jira's CSP
 * forbids injected `<style>` blocks and external font/style loads, so every
 * style here is a plain JS object applied as inline `style` properties. This
 * file is the banner's entire "design system" — NO Tailwind, NO CSS variables,
 * NO `@/styles` imports, NO external fonts. Fixed pixel sizes only.
 *
 * Token hex literals mirror `styles/globals.css`:
 *   accent.DEFAULT  #6b5b95 (brand purple — dot, buttons)
 *   accent.subtle   #e9e6f3 (banner background)
 *   neutral.700     #334155 (primary text)
 *   neutral.500     #64748b (tertiary CTA text)
 *   state.danger    #dc2626 (inline error)
 */

/** Plain inline-style map. Values are CSS strings (CSP-safe, no Tailwind). */
export type InlineStyle = Record<string, string>;

// ---- Token literals (single source for the banner) ----
export const ACCENT = '#6b5b95';
export const ACCENT_SUBTLE = '#e9e6f3';
export const NEUTRAL_700 = '#334155';
export const NEUTRAL_500 = '#64748b';
export const WHITE = '#ffffff';
// AC4 survivor: DANGER is applied only to the guest rail's failed-write slot
// (`lib/banner-dom.ts`'s `errorTextStyle`, `role="alert"`) — red fires only
// when Jira actually refused a worklog write, never for time itself.
export const DANGER = '#dc2626';

/** Stable id for the single banner host element (idempotency guard, AC #1). */
export const BANNER_HOST_ID = 'jira-time-logger-banner-root';

/** z-index above Jira's chrome but not absurd. */
const Z_INDEX = '2147483000';

const SYSTEM_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** 200 ms ease-out slide (UX-DR7). Reduced-motion variant disables it. */
export const SLIDE_TRANSITION = 'transform 200ms ease-out, height 200ms ease-out';
export const NO_TRANSITION = 'none';

// ---- Style objects ----

/**
 * Banner container: full-width, top-anchored fixed overlay, ~56px collapsed.
 * Callers set `height` to switch between collapsed (~56px) and expanded
 * (~120px), and `transform` for the slide-in/out.
 */
export const bannerContainerStyle: InlineStyle = {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100%',
  height: '56px',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '0 16px',
  background: ACCENT_SUBTLE,
  color: NEUTRAL_700,
  fontFamily: SYSTEM_FONT,
  fontSize: '14px',
  lineHeight: '1.4',
  zIndex: Z_INDEX,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.12)',
  overflow: 'hidden',
};

export const EXPANDED_HEIGHT = '120px';
export const COLLAPSED_HEIGHT = '56px';

export const brandDotStyle: InlineStyle = {
  color: ACCENT,
  fontSize: '14px',
  lineHeight: '1',
  flex: '0 0 auto',
};

export const primaryTextStyle: InlineStyle = {
  color: NEUTRAL_700,
  fontSize: '14px',
  fontWeight: '500',
  flex: '1 1 auto',
};

/** Tertiary / ghost "Open extension" CTA — neutral.500 text, no border. */
export const openExtensionStyle: InlineStyle = {
  color: NEUTRAL_500,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  fontFamily: SYSTEM_FONT,
  padding: '6px 8px',
  flex: '0 0 auto',
};

/** Brand-purple "Log time on KEY" contextual button. */
export const contextualButtonStyle: InlineStyle = {
  background: ACCENT,
  color: WHITE,
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: '500',
  fontFamily: SYSTEM_FONT,
  padding: '6px 12px',
  flex: '0 0 auto',
};

export const hoursInputStyle: InlineStyle = {
  height: '32px',
  width: '160px',
  boxSizing: 'border-box',
  border: `1px solid ${NEUTRAL_500}`,
  borderRadius: '6px',
  padding: '0 10px',
  fontSize: '14px',
  fontFamily: SYSTEM_FONT,
  color: NEUTRAL_700,
  background: WHITE,
  flex: '0 0 auto',
};

/** Primary "Log" submit button (same brand purple as the contextual CTA). */
export const logButtonStyle: InlineStyle = {
  background: ACCENT,
  color: WHITE,
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: '500',
  fontFamily: SYSTEM_FONT,
  padding: '6px 14px',
  flex: '0 0 auto',
};

/** ✕ dismiss icon — ghost, no border. */
export const dismissButtonStyle: InlineStyle = {
  color: NEUTRAL_500,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '16px',
  lineHeight: '1',
  padding: '6px 8px',
  flex: '0 0 auto',
};

export const errorTextStyle: InlineStyle = {
  color: DANGER,
  fontSize: '12px',
  flex: '0 0 auto',
};

/**
 * Serialize an inline-style object into a CSS text string with kebab-case
 * property names (for `setAttribute('style', ...)` or `cssText`). Used by the
 * content script so it can apply one inline-style string per element.
 */
export function styleString(style: InlineStyle): string {
  return Object.entries(style)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(';');
}
