/**
 * Pure DOM builders for the inline Jira banner (Story 3.3), extracted so the
 * banner's accessibility structure (roles, labels, button semantics, the
 * labelled hours input) has a single source of truth that BOTH the content
 * script (`entrypoints/content.ts`) and the Story 6.1 axe a11y scan render.
 *
 * VANILLA DOM ONLY — no React, no Tailwind. Every style is an inline string
 * from `lib/banner-styles.ts` (Jira CSP forbids injected <style>/external
 * loads). These builders create elements and apply ARIA + inline styles; the
 * caller (content script) wires the event handlers and slide-in animation.
 */
import {
  BANNER_HOST_ID,
  COLLAPSED_HEIGHT,
  EXPANDED_HEIGHT,
  bannerContainerStyle,
  brandDotStyle,
  primaryTextStyle,
  openExtensionStyle,
  contextualButtonStyle,
  hoursInputStyle,
  logButtonStyle,
  dismissButtonStyle,
  errorTextStyle,
  styleString,
  type InlineStyle,
} from '@/lib/banner-styles';

export const BANNER_STRINGS = {
  unloggedSuffix: ' unlogged this week.',
  openExtension: 'Open extension',
  dismissLabel: 'Dismiss for today',
  logTimeOn: (key: string) => `Log time on ${key}`,
  hoursLabel: (key: string) => `Hours to log on ${key}`,
  hoursPlaceholder: '2.5h, 2h 30m…',
  logButton: 'Log',
  bannerRegionLabel: 'Time-tracking banner',
  check: '✓',
} as const;

export function applyStyle(el: HTMLElement, style: InlineStyle): void {
  el.setAttribute('style', styleString(style));
}

/** Handlers the collapsed banner wires to its interactive controls. */
export type CollapsedBannerHandlers = {
  onContextualLog?: (() => void) | undefined;
  onOpenExtension?: (() => void) | undefined;
  onDismiss?: (() => void) | undefined;
};

/**
 * Create the single banner host (`role="region"` + aria-label). Idempotent —
 * the caller reuses an existing host across re-evaluations.
 */
export function ensureBannerHost(doc: Document = document): HTMLElement {
  let host = doc.getElementById(BANNER_HOST_ID);
  if (!host) {
    host = doc.createElement('div');
    host.id = BANNER_HOST_ID;
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', BANNER_STRINGS.bannerRegionLabel);
  }
  return host;
}

/**
 * Render the collapsed banner content into `host`: brand dot (decorative),
 * the "<N>h unlogged this week." line, an optional contextual "Log time on
 * KEY" button, the "Open extension" CTA, and the labelled ✕ dismiss button.
 */
export function renderCollapsedBanner(
  host: HTMLElement,
  state: { hoursMissing: number; currentTicket?: string | undefined },
  handlers: CollapsedBannerHandlers = {},
): void {
  applyStyle(host, bannerContainerStyle);
  host.style.height = COLLAPSED_HEIGHT;
  host.replaceChildren();

  // Brand dot — decorative only (no logo; the banner is a guest).
  const dot = host.ownerDocument.createElement('span');
  applyStyle(dot, brandDotStyle);
  dot.textContent = '●';
  dot.setAttribute('aria-hidden', 'true');
  host.appendChild(dot);

  // Honest past-tense copy: "6h unlogged this week."
  const text = host.ownerDocument.createElement('span');
  applyStyle(text, primaryTextStyle);
  text.textContent = `${state.hoursMissing}h${BANNER_STRINGS.unloggedSuffix}`;
  host.appendChild(text);

  // Contextual CTA on a /browse/<KEY> page.
  if (state.currentTicket) {
    const cta = host.ownerDocument.createElement('button');
    cta.type = 'button';
    applyStyle(cta, contextualButtonStyle);
    cta.textContent = BANNER_STRINGS.logTimeOn(state.currentTicket);
    if (handlers.onContextualLog) cta.addEventListener('click', handlers.onContextualLog);
    host.appendChild(cta);
  }

  const open = host.ownerDocument.createElement('button');
  open.type = 'button';
  applyStyle(open, openExtensionStyle);
  open.textContent = BANNER_STRINGS.openExtension;
  if (handlers.onOpenExtension) open.addEventListener('click', handlers.onOpenExtension);
  host.appendChild(open);

  const dismiss = host.ownerDocument.createElement('button');
  dismiss.type = 'button';
  applyStyle(dismiss, dismissButtonStyle);
  dismiss.textContent = '✕';
  dismiss.setAttribute('aria-label', BANNER_STRINGS.dismissLabel);
  if (handlers.onDismiss) dismiss.addEventListener('click', handlers.onDismiss);
  host.appendChild(dismiss);
}

/** Elements the expanded quick-log exposes so the caller can wire submit/errors. */
export type ExpandedQuickLog = {
  input: HTMLInputElement;
  logBtn: HTMLButtonElement;
  error: HTMLSpanElement;
};

/**
 * Render the in-place inline quick-log into `host`: a label, the
 * accessible-name'd hours input, the "Log" button, and a hidden error slot.
 */
export function renderExpandedQuickLog(host: HTMLElement, ticket: string): ExpandedQuickLog {
  host.style.height = EXPANDED_HEIGHT;
  host.replaceChildren();

  const label = host.ownerDocument.createElement('span');
  applyStyle(label, primaryTextStyle);
  label.textContent = BANNER_STRINGS.logTimeOn(ticket);
  host.appendChild(label);

  const input = host.ownerDocument.createElement('input');
  input.type = 'text';
  applyStyle(input, hoursInputStyle);
  input.placeholder = BANNER_STRINGS.hoursPlaceholder;
  input.setAttribute('aria-label', BANNER_STRINGS.hoursLabel(ticket));
  host.appendChild(input);

  const logBtn = host.ownerDocument.createElement('button');
  logBtn.type = 'button';
  applyStyle(logBtn, logButtonStyle);
  logBtn.textContent = BANNER_STRINGS.logButton;
  host.appendChild(logBtn);

  const error = host.ownerDocument.createElement('span');
  applyStyle(error, errorTextStyle);
  error.style.display = 'none';
  error.setAttribute('role', 'alert');
  host.appendChild(error);

  return { input, logBtn, error };
}
