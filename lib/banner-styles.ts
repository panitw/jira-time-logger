/**
 * CSP-safe inline-style tokens for the inline Jira banner — the "guest rail"
 * (Story 3.3, restyled by Story 7.11).
 *
 * The banner is injected by a content script into Jira pages. Jira's CSP
 * forbids injected `<style>` blocks and external font/style loads, so every
 * style here is a plain JS object applied as inline `style` properties. This
 * file is the banner's entire "design system" — NO Tailwind, NO CSS variables,
 * NO `@/styles` imports, NO external fonts. Fixed pixel sizes only.
 *
 * RAW HEX IS CORRECT HERE (D-7.11-35). `styles/globals.css` is never injected
 * into Jira's page, so `var(--color-legacy-purple)` would resolve to nothing.
 * This file is therefore the SINGLE SOURCE of literal hex for the guest rail —
 * every literal below carries a comment naming the `DESIGN.md` token it
 * mirrors, and `banner-styles.test.ts` pins each one to that value so a drift
 * in `globals.css` is caught without this file depending on it.
 */

/** Plain inline-style map. Values are CSS strings (CSP-safe, no Tailwind). */
export type InlineStyle = Record<string, string>;

// ---- Token literals (single source for the guest rail — DESIGN.md `colors:`) ----
export const LEGACY_PURPLE = '#594F74'; // colors.legacy-purple
export const ROYAL_PURPLE = '#615B99'; // colors.royal-purple (primary-action hover)
export const FOREGROUND = '#1E1B2E'; // colors.foreground
export const MUTED = '#6B6678'; // colors.muted ("Open extension" ghost text)
export const FAINT = '#6B6B72'; // colors.faint (eyebrow / dismiss / keyboard hint)
export const BORDER = '#E4E3EC'; // colors.border — purple-tinted, NOT Jira's #DFE1E6
export const PRIMARY_SOFT = '#ECEBF3'; // colors.primary-soft (outline hover bg)
export const SURFACE = '#FFFFFF'; // colors.surface
export const SURFACE_SUNK = '#FCFCFD'; // colors.surface-sunk (success field bg)
export const HOVER_NEUTRAL = '#F4F4F7'; // icons.kbd.background, reused for dismiss hover
export const AMBER_BORDER = '#EDD3A6'; // colors.amber-border
export const AMBER_INK = '#7A3E06'; // colors.amber-ink
export const ERROR_INK = '#991B1B'; // colors.error-ink (the ONE legitimate red — D-7.11-40)
export const STATUS_CLEAN = '#15803D'; // colors.status-clean
export const STATUS_CLEAN_BORDER = '#BFE0C8'; // colors.status-clean-border

/** Stable id for the single banner host element (idempotency guard, AC1). */
export const BANNER_HOST_ID = 'jira-time-logger-banner-root';

/** z-index above Jira's chrome but not absurd. */
const Z_INDEX = '2147483000';

/**
 * `{typography.guest}` — DESIGN.md:104-109. The bundled Kanit/Noto faces are
 * not `web_accessible_resources` and Jira's `font-src` may reject them anyway
 * (AC3). This is the EXACT stack; the previously-shipped stack omitted the
 * leading `system-ui` and appended `BlinkMacSystemFont`/`Helvetica`/`Arial` —
 * fixed per D-7.11-38.
 */
export const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * The rail's height is a layout contract with Jira's page (AC5, D-7.11-45):
 * it is 44px, always — never `EXPANDED_HEIGHT`, because expansion is a
 * content swap, not a height change.
 */
export const RAIL_HEIGHT = '44px';

/**
 * Motion is ONE property (AC6 / EXPERIENCE.md "The Guest Rail — platform
 * behaviour"): entry/exit are `transform: translateY()`. There is no height
 * transition any more — the rail's height never changes.
 */
export const SLIDE_TRANSITION = 'transform 200ms ease-out';
export const NO_TRANSITION = 'none';

/**
 * The focus ring every interactive control gets on `focus` (AC6, D-7.9-17).
 * Pinned to `bannerBase.fieldRing` (`round2:1310`) — that source value is
 * ALSO drawn as the expanded hours field's idle-state `box-shadow`
 * (`round2:113`), but `hoursFieldStyle.boxShadow` ships `'none'` here
 * (Finding 7): this constant is reused for its VALUE (the ring colour/size),
 * not as the field's resting shadow. Composited against the rail's white
 * ground this is ~1.22:1 (Finding 5) — below 1.4.11's 3:1 — but it is never
 * the sole focus indicator: `outline` is never set to `none` anywhere on
 * this surface (grep-verified — no banner file contains the property), so
 * the UA `:focus-visible` outline remains the real, load-bearing indicator.
 * Do NOT add `outline:none` to any control here without first strengthening
 * this ring — doing so would silently remove every control's visible focus
 * state.
 */
export const FOCUS_RING = '0 0 0 3px rgba(89,79,116,.13)';

// ---- Hover / rest value maps (AC6 — hover is JS, not `:hover`) ----
export const REST = {
  primaryAction: { background: LEGACY_PURPLE },
  openExtensionGhost: { color: MUTED },
  openExtensionOutline: { background: SURFACE },
  dismiss: { background: 'transparent', color: FAINT },
} as const;

export const HOVER = {
  primaryAction: { background: ROYAL_PURPLE },
  openExtensionGhost: { color: LEGACY_PURPLE },
  openExtensionOutline: { background: PRIMARY_SOFT },
  dismiss: { background: HOVER_NEUTRAL, color: FOREGROUND },
} as const;

// ---- Style objects (round2.dc.html:53, Surface 4) ----

/**
 * Banner container: a 44px white rail, fixed to the top of the viewport (the
 * page is pushed down via `document.body.style.paddingTop`, T4/AC5 — the rail
 * itself stays `position:fixed` so it never scrolls away). White ground, 3px
 * legacy-purple left spine, purple-tinted hairline beneath, NO box-shadow
 * (C1-C3).
 */
export const bannerContainerStyle: InlineStyle = {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100%',
  height: RAIL_HEIGHT,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '0 12px 0 13px',
  background: SURFACE,
  color: FOREGROUND,
  borderLeft: `3px solid ${LEGACY_PURPLE}`,
  borderBottom: `1px solid ${BORDER}`,
  fontFamily: SYSTEM_FONT,
  fontSize: '13px',
  lineHeight: '1.4',
  zIndex: Z_INDEX,
  overflow: 'hidden',
};

/** Narrow-viewport (<860px) container: tighter padding/gap (T7, round2:147-154). */
export const bannerContainerNarrowStyle: InlineStyle = {
  ...bannerContainerStyle,
  padding: '0 10px 0 11px',
  gap: '10px',
};

/** The 18px mark — geometry, not an icon (D-7.11-36). Two nested spans. */
export const markOuterStyle: InlineStyle = {
  width: '18px',
  height: '18px',
  borderRadius: '5px',
  background: LEGACY_PURPLE,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
};

export const markInnerStyle: InlineStyle = {
  width: '5px',
  height: '5px',
  borderRadius: '9999px',
  background: SURFACE,
};

export const eyebrowStyle: InlineStyle = {
  fontSize: '10px',
  fontWeight: '600',
  letterSpacing: '.11em',
  textTransform: 'uppercase',
  color: FAINT,
  whiteSpace: 'nowrap',
  flex: '0 0 auto',
};

export const dividerStyle: InlineStyle = {
  width: '1px',
  height: '16px',
  background: BORDER,
  flex: '0 0 auto',
};

/** State line: "{N}h unlogged this week" — no trailing period (C6). */
export const stateLineStyle: InlineStyle = {
  fontSize: '13px',
  color: FOREGROUND,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  flex: '0 0 auto',
};

/** Narrow variant: absorbs remaining space and ellipsis-truncates (AC8). */
export const stateLineNarrowStyle: InlineStyle = {
  ...stateLineStyle,
  flex: '1 1 auto',
  minWidth: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

/** The figure inside the state line is weight 600, the rest is 400. */
export const stateFigureStyle: InlineStyle = {
  fontWeight: '600',
};

export const spacerStyle: InlineStyle = {
  flex: '1 1 auto',
};

/** The contextual "Log time on <KEY>" primary action — the ONLY emphasised
 * element on a ticket page (AC7). Never wraps (AC8). 28px, not the source's
 * 30px (E-2, D-7.11-31b — the spines are not silent). */
export const primaryActionStyle: InlineStyle = {
  background: LEGACY_PURPLE,
  color: SURFACE,
  border: 'none',
  borderRadius: '6px',
  height: '28px',
  padding: '0 12px',
  fontSize: '12.5px',
  fontWeight: '600',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: SYSTEM_FONT,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flex: '0 0 auto',
};

/** "Open extension" — ghost variant, used on a /browse/<KEY> page where the
 * contextual action already carries the emphasis (round2:60). */
export const openExtensionGhostStyle: InlineStyle = {
  background: 'transparent',
  border: 'none',
  padding: '0 6px',
  height: '28px',
  fontSize: '12.5px',
  fontWeight: '500',
  color: MUTED,
  fontFamily: SYSTEM_FONT,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  whiteSpace: 'nowrap',
  flex: '0 0 auto',
};

/** "Open extension" — outline variant, the rail's only control on any other
 * page (round2:106). */
export const openExtensionOutlineStyle: InlineStyle = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '6px',
  padding: '0 11px',
  height: '28px',
  fontSize: '12.5px',
  fontWeight: '500',
  color: LEGACY_PURPLE,
  fontFamily: SYSTEM_FONT,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  whiteSpace: 'nowrap',
  flex: '0 0 auto',
};

/** Dismiss — icon-only, 26x26 (round2:61,107; NOT the 28px control-height —
 * the dismiss glyph has its own smaller footprint in the source). */
export const dismissStyle: InlineStyle = {
  width: '26px',
  height: '26px',
  border: 'none',
  background: 'transparent',
  borderRadius: '5px',
  color: FAINT,
  fontSize: '13px',
  fontFamily: SYSTEM_FONT,
  cursor: 'pointer',
  padding: '0',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
};

/** Expanded quick-log label: "Hours to log on <KEY>" (round2:111). */
export const labelStyle: InlineStyle = {
  fontSize: '13px',
  color: FOREGROUND,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  flex: '0 0 auto',
};

/** Hours field — 28px, not the source's 30px (E-2, D-7.11-31b). Idle border
 * is legacy-purple; state-specific border colours are applied by the caller
 * via `input.style.borderColor` (amber on parse error, neutral border on a
 * failed write) rather than a family of near-duplicate style objects. */
export const hoursFieldStyle: InlineStyle = {
  height: '28px',
  boxSizing: 'border-box',
  border: `1.5px solid ${LEGACY_PURPLE}`,
  borderRadius: '6px',
  padding: '0 10px',
  boxShadow: 'none',
  background: SURFACE,
  minWidth: '150px',
  fontSize: '13px',
  color: FOREGROUND,
  fontFamily: SYSTEM_FONT,
  fontVariantNumeric: 'tabular-nums',
  flex: '0 0 auto',
};

/** The "Log" submit — 28px, not the source's 30px (E-2). On a failed write
 * the caller repaints `background`/`color` to `ERROR_INK`/white and the label
 * to "Try again"; that is a targeted property write, not a second object. */
export const submitStyle: InlineStyle = {
  background: LEGACY_PURPLE,
  color: SURFACE,
  border: 'none',
  borderRadius: '6px',
  height: '28px',
  padding: '0 14px',
  fontSize: '12.5px',
  fontWeight: '600',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: SYSTEM_FONT,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flex: '0 0 auto',
};

/** Format / over-limit error — AMBER, never red (D-7.11-40): client-side
 * validation that never reached Jira is not a refused write. */
export const errorTextAmberStyle: InlineStyle = {
  color: AMBER_INK,
  fontSize: '12.5px',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flex: '1 1 auto',
  minWidth: '0',
};

/** Write failure — the ONLY legitimate red on this surface (D-7.11-40):
 * `logFailedError`, a write Jira actually refused. */
export const errorTextRedStyle: InlineStyle = {
  color: ERROR_INK,
  fontSize: '12.5px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flex: '1 1 auto',
  minWidth: '0',
};

/** "⏎ to log · esc to close" — the ⏎ is a `CornerDownLeft` icon, never text
 * (AC9). */
export const keyboardHintStyle: InlineStyle = {
  fontSize: '11.5px',
  color: FAINT,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  flex: '0 0 auto',
};

/** Success — outline `status-clean`, the submit button's terminal state. */
export const successButtonStyle: InlineStyle = {
  background: SURFACE,
  color: STATUS_CLEAN,
  border: `1px solid ${STATUS_CLEAN_BORDER}`,
  borderRadius: '6px',
  height: '28px',
  padding: '0 12px',
  fontSize: '12.5px',
  fontWeight: '600',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: SYSTEM_FONT,
  cursor: 'default',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  flex: '0 0 auto',
};

/** The success announcement routed through the `role="alert"` slot
 * (A11y-2) — neutral text, no error styling. */
export const successTextStyle: InlineStyle = {
  color: FAINT,
  fontSize: '12.5px',
  whiteSpace: 'nowrap',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flex: '1 1 auto',
  minWidth: '0',
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
