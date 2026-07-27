/**
 * Pure DOM builders for the inline Jira banner — the "guest rail" (Story 3.3,
 * restyled by Story 7.11), extracted so the banner's accessibility structure
 * (roles, labels, button semantics, the labelled hours input) has a single
 * source of truth that BOTH the content script (`entrypoints/content.ts`) and
 * the axe a11y scan render.
 *
 * VANILLA DOM ONLY — no React, no Tailwind. Every style is an inline string
 * from `lib/banner-styles.ts` (Jira CSP forbids injected <style>/external
 * loads); every icon is a hand-inlined SVG from `lib/banner-icons.ts`. These
 * builders create elements and apply ARIA + inline styles; the caller
 * (content script) wires the event handlers, hover/focus, and the slide-in
 * animation.
 */
import { svg } from '@/lib/banner-icons';
import {
  BANNER_HOST_ID,
  bannerContainerStyle,
  bannerContainerNarrowStyle,
  markOuterStyle,
  markInnerStyle,
  eyebrowStyle,
  dividerStyle,
  stateLineStyle,
  stateLineNarrowStyle,
  stateFigureStyle,
  spacerStyle,
  primaryActionStyle,
  openExtensionGhostStyle,
  openExtensionOutlineStyle,
  dismissStyle,
  labelStyle,
  hoursFieldStyle,
  submitStyle,
  keyboardHintStyle,
  styleString,
  type InlineStyle,
} from '@/lib/banner-styles';

/** Stable id for the expanded quick-log's single hours input, so its visible
 * label can be a real `<label for>` rather than a `<span>` duplicating an
 * `aria-label` (Finding 6 — the same class as Story 7.10's Blocker). */
const HOURS_INPUT_ID = 'jira-time-logger-hours-input';

export const BANNER_STRINGS = {
  eyebrow: 'Time Logger',
  unloggedSuffix: ' unlogged this week',
  openExtension: 'Open extension',
  dismissLabel: 'Dismiss for today',
  logTimeOn: (key: string) => `Log time on ${key}`,
  logOnShort: (key: string) => `Log on ${key}`,
  hoursLabel: (key: string) => `Hours to log on ${key}`,
  hoursPlaceholder: '2.5h, 2h 30m…',
  logButton: 'Log',
  tryAgain: 'Try again',
  loggedHours: (n: number) => `Logged ${n}h`,
  closing: 'Closing…',
  keyboardHintSuffix: ' to log · esc to close',
  bannerRegionLabel: 'Time-tracking banner',
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

/** Elements the collapsed banner exposes so the caller can wire hover/focus
 * (AC6 — hover/focus feedback is JS, not `:hover`/`:focus`). */
export type CollapsedBanner = {
  primaryButton: HTMLButtonElement | null;
  openExtensionButton: HTMLButtonElement;
  dismissButton: HTMLButtonElement;
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
 * Render the collapsed rail content into `host`: the 18px mark (decorative
 * geometry, D-7.11-36), the eyebrow + divider (dropped when `narrow`), the
 * state line, an optional contextual "Log time on KEY" button, the "Open
 * extension" affordance (ghost on a ticket page, outline elsewhere —
 * round2:60 vs :106), and the labelled dismiss button. `narrow` (AC8) is
 * decided by the caller (`window.innerWidth`), never read here — this
 * builder stays a pure function of its arguments.
 */
export function renderCollapsedBanner(
  host: HTMLElement,
  state: { hoursMissing: number; currentTicket?: string | undefined; narrow?: boolean },
  handlers: CollapsedBannerHandlers = {},
): CollapsedBanner {
  const narrow = state.narrow ?? false;
  applyStyle(host, narrow ? bannerContainerNarrowStyle : bannerContainerStyle);
  host.replaceChildren();

  // The 18px mark: two nested spans, decorative geometry (D-7.11-36) — NOT an
  // icon, NOT the text glyph '●' it replaces (AC9).
  const markOuter = host.ownerDocument.createElement('span');
  applyStyle(markOuter, markOuterStyle);
  markOuter.setAttribute('aria-hidden', 'true');
  const markInner = host.ownerDocument.createElement('span');
  applyStyle(markInner, markInnerStyle);
  markOuter.appendChild(markInner);
  host.appendChild(markOuter);

  if (!narrow) {
    const eyebrow = host.ownerDocument.createElement('span');
    applyStyle(eyebrow, eyebrowStyle);
    eyebrow.textContent = BANNER_STRINGS.eyebrow;
    host.appendChild(eyebrow);

    const divider = host.ownerDocument.createElement('span');
    applyStyle(divider, dividerStyle);
    divider.setAttribute('aria-hidden', 'true');
    host.appendChild(divider);
  }

  // "{N}h unlogged this week" — no trailing period (C6); the figure is
  // weight-600, the rest 400.
  const stateLine = host.ownerDocument.createElement('span');
  applyStyle(stateLine, narrow ? stateLineNarrowStyle : stateLineStyle);
  const figure = host.ownerDocument.createElement('span');
  applyStyle(figure, stateFigureStyle);
  figure.textContent = `${state.hoursMissing}h`;
  stateLine.appendChild(figure);
  stateLine.appendChild(
    host.ownerDocument.createTextNode(BANNER_STRINGS.unloggedSuffix),
  );
  host.appendChild(stateLine);

  if (!narrow) {
    const spacer = host.ownerDocument.createElement('span');
    applyStyle(spacer, spacerStyle);
    host.appendChild(spacer);
  }

  // Contextual CTA on a /browse/<KEY> page — the only emphasised element
  // (AC7). Never wraps (AC8, baked into primaryActionStyle).
  let primaryButton: HTMLButtonElement | null = null;
  if (state.currentTicket) {
    const cta = host.ownerDocument.createElement('button');
    cta.type = 'button';
    applyStyle(cta, primaryActionStyle);
    cta.textContent = narrow
      ? BANNER_STRINGS.logOnShort(state.currentTicket)
      : BANNER_STRINGS.logTimeOn(state.currentTicket);
    if (handlers.onContextualLog) cta.addEventListener('click', handlers.onContextualLog);
    host.appendChild(cta);
    primaryButton = cta;
  }

  // "Open extension ↗" — ghost on a ticket page (ArrowUpRight carries the
  // arrow; AC9 forbids the text glyph), outline everywhere else. Dropped
  // below 860px (AC8).
  const open = host.ownerDocument.createElement('button');
  open.type = 'button';
  const isGhost = state.currentTicket !== undefined;
  applyStyle(open, isGhost ? openExtensionGhostStyle : openExtensionOutlineStyle);
  open.appendChild(host.ownerDocument.createTextNode(BANNER_STRINGS.openExtension));
  open.appendChild(svg('ArrowUpRight', { size: 12 }, host.ownerDocument));
  if (handlers.onOpenExtension) open.addEventListener('click', handlers.onOpenExtension);
  if (!narrow) {
    host.appendChild(open);
  }

  // Dismiss — icon-only, labelled (never a mystery '✕' glyph, AC9).
  const dismiss = host.ownerDocument.createElement('button');
  dismiss.type = 'button';
  applyStyle(dismiss, dismissStyle);
  dismiss.appendChild(svg('X', { size: 13 }, host.ownerDocument));
  dismiss.setAttribute('aria-label', BANNER_STRINGS.dismissLabel);
  dismiss.title = BANNER_STRINGS.dismissLabel;
  if (handlers.onDismiss) dismiss.addEventListener('click', handlers.onDismiss);
  host.appendChild(dismiss);

  return { primaryButton, openExtensionButton: open, dismissButton: dismiss };
}

/** Elements the expanded quick-log exposes so the caller can wire submit/errors. */
export type ExpandedQuickLog = {
  input: HTMLInputElement;
  logBtn: HTMLButtonElement;
  error: HTMLSpanElement;
  /** An empty flex:1 1 auto spacer, visible only while `error` is hidden — it
   * exists purely to push `hint` right in the no-error state, mirroring
   * `round2.dc.html:121`'s `<sc-if b.noError>` branch (Finding 4). The caller
   * hides it alongside `hint` whenever the error/status slot is shown. */
  spacer: HTMLSpanElement;
  /** "⏎ to log · esc to close" — hidden whenever `error` is shown; the design
   * gates the two mutually exclusively (Finding 4). */
  hint: HTMLSpanElement;
  /** A pointer-reachable dismiss, same accessible name as the collapsed
   * rail's (D-7.11-33 / Finding 2) — the caller wires its click handler. */
  dismissButton: HTMLButtonElement;
};

/**
 * Render the in-place inline quick-log into `host`: a labelled hours input
 * (a real `<label for>`, Finding 6), the "Log" button, a hidden error/status
 * slot, a no-error spacer + keyboard hint ("⏎ to log · esc to close" — the ⏎
 * is a `CornerDownLeft` icon, never text, AC9) that are mutually exclusive
 * with the error slot (Finding 4), and a labelled dismiss control
 * (D-7.11-33). The host's height is NEVER written here (D-7.11-45) —
 * expansion is a content swap at a constant 44px (AC5).
 */
export function renderExpandedQuickLog(host: HTMLElement, ticket: string): ExpandedQuickLog {
  host.replaceChildren();

  const label = host.ownerDocument.createElement('label');
  applyStyle(label, labelStyle);
  label.setAttribute('for', HOURS_INPUT_ID);
  label.textContent = BANNER_STRINGS.hoursLabel(ticket);
  host.appendChild(label);

  const input = host.ownerDocument.createElement('input');
  input.type = 'text';
  input.id = HOURS_INPUT_ID;
  applyStyle(input, hoursFieldStyle);
  input.placeholder = BANNER_STRINGS.hoursPlaceholder;
  host.appendChild(input);

  const logBtn = host.ownerDocument.createElement('button');
  logBtn.type = 'button';
  applyStyle(logBtn, submitStyle);
  logBtn.textContent = BANNER_STRINGS.logButton;
  host.appendChild(logBtn);

  const error = host.ownerDocument.createElement('span');
  error.style.display = 'none';
  error.setAttribute('role', 'alert');
  host.appendChild(error);

  // The no-error spacer + hint (mutually exclusive with `error` — Finding 4).
  const spacer = host.ownerDocument.createElement('span');
  applyStyle(spacer, spacerStyle);
  host.appendChild(spacer);

  const hint = host.ownerDocument.createElement('span');
  applyStyle(hint, keyboardHintStyle);
  hint.appendChild(svg('CornerDownLeft', { size: 11 }, host.ownerDocument));
  hint.appendChild(host.ownerDocument.createTextNode(BANNER_STRINGS.keyboardHintSuffix));
  host.appendChild(hint);

  // Dismiss — same icon-only, labelled control as the collapsed rail's
  // (D-7.11-33): round2.dc.html:123 draws one inside the expanded block, and
  // without it a pointer-only user who expands the quick-log has no way to
  // close it or dismiss the rail for the day.
  const dismissButton = host.ownerDocument.createElement('button');
  dismissButton.type = 'button';
  applyStyle(dismissButton, dismissStyle);
  dismissButton.appendChild(svg('X', { size: 13 }, host.ownerDocument));
  dismissButton.setAttribute('aria-label', BANNER_STRINGS.dismissLabel);
  dismissButton.title = BANNER_STRINGS.dismissLabel;
  host.appendChild(dismissButton);

  return { input, logBtn, error, spacer, hint, dismissButton };
}
