/**
 * Inline Jira banner content script — the "guest rail" (Story 3.3, restyled
 * by Story 7.11). Injected into `*.atlassian.net` pages.
 *
 * VANILLA DOM ONLY — no React, no Tailwind, no external loads (Jira CSP). Every
 * style is an inline `style` string from `lib/banner-styles.ts`; every icon is
 * a hand-inlined SVG from `lib/banner-icons.ts`. All decision logic lives in
 * tested pure helpers (`lib/storage/banner-dismiss`, `lib/badge` via the SW
 * `banner-state` handler, `lib/hours`); this file is thin DOM + behaviour glue.
 *
 * Flow (inject / re-eval):
 *   1. If dismissed today → ensure no banner, stop (AC #11).
 *   2. Ask the SW for `{ hoursMissing, currentTicket }` (AC #7).
 *   3. If `hoursMissing <= 0` (caught up / disconnected / auth-expired) → ensure
 *      no banner, stop (AC #10, #11).
 *   4. Render the collapsed rail (AC #2); add the contextual CTA when on a
 *      `/browse/<KEY>` page (AC #7); clicking it expands an inline quick-log
 *      that posts via the SW (AC #5).
 *
 * SPA-aware: a `popstate` listener + a debounced `MutationObserver` re-run the
 * flow on in-tab navigation, idempotently (AC #12). The script never throws —
 * the rail is a passive guest (AC #11, graceful degradation).
 *
 * `document.body.style.paddingTop` is the rail's ONE mutation of Jira's own
 * page (AC #5, D-7.11-30): written exactly once per mount, restored to the
 * EXACT prior value on every removal path. See `lib/banner-interactions.ts`'s
 * `createPageShift` — re-entrancy-safe by construction (a boolean ownership
 * flag, never a value we ourselves wrote gets "restored" twice).
 */
import {
  BANNER_STRINGS,
  applyStyle,
  ensureBannerHost,
  renderCollapsedBanner,
  renderExpandedQuickLog,
  type CollapsedBanner,
} from '@/lib/banner-dom';
import { svg } from '@/lib/banner-icons';
import {
  clearAmberError as clearAmberErrorState,
  createPageShift,
  shouldReevaluateOnEscape,
  wireFocusRing,
  wireHoverColor,
  createRemovalScheduler,
  removeBannerViaSlide,
  beginBannerRender,
  commitMount,
  decideSubmitAction,
  isWorklogSuccess,
  dismissAndRemove,
  shouldReevaluateForUrl,
  createDebouncer,
} from '@/lib/banner-interactions';
import {
  AMBER_BORDER,
  BANNER_HOST_ID,
  BORDER,
  ERROR_INK,
  FOCUS_RING,
  HOVER,
  LEGACY_PURPLE,
  NO_TRANSITION,
  RAIL_HEIGHT,
  REST,
  SLIDE_TRANSITION,
  SURFACE_SUNK,
  FAINT,
  errorTextAmberStyle,
  errorTextRedStyle,
  successButtonStyle,
  successTextStyle,
} from '@/lib/banner-styles';
import { parseHours, hoursToSeconds, MAX_HOURS_PER_ENTRY } from '@/lib/hours';
import { log } from '@/lib/log';
import { sendMessage, sendRequest } from '@/lib/messages';
import { dismissForToday, isDismissedToday } from '@/lib/storage/banner-dismiss';
import { formatStartedISO, todayDateString } from '@/lib/worklog-date';

const STRINGS = {
  ...BANNER_STRINGS,
  parseError: 'Use formats like 2.5h, 2h 30m',
  overLimitError: 'Hours per entry can’t exceed 24',
  // D-7.11-41: the button IS the retry now ("Try again"), so "try again" in
  // the message became redundant; "nothing was saved" is the honest fact.
  logFailedError: 'Couldn’t log time — nothing was saved',
};

const SPA_DEBOUNCE_MS = 250;
const RESIZE_DEBOUNCE_MS = 150;
/** AC8 — below this viewport width the rail drops the eyebrow, divider and
 * "Open extension", and the state line ellipsis-truncates. */
const NARROW_BREAKPOINT_PX = 860;
/** Amber (parse/over-limit) errors auto-clear without destroying the typed
 * value (C13) — no `reevaluate()`, unlike the write-failure state. */
const AMBER_AUTOCLEAR_MS = 1500;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function transitionFor(): string {
  return prefersReducedMotion() ? NO_TRANSITION : SLIDE_TRANSITION;
}

function isNarrowViewport(): boolean {
  try {
    return window.innerWidth < NARROW_BREAKPOINT_PX;
  } catch {
    return false;
  }
}

function existingHost(): HTMLElement | null {
  return document.getElementById(BANNER_HOST_ID);
}

// `body padding-top` — written exactly once, restored exactly once (AC5,
// D-7.11-30). `pageShift` is the re-entrancy guard (see
// `lib/banner-interactions.ts`): SPA navigation can re-inject while a
// previous instance is unwinding, and its `owned` flag is what makes "add
// twice" and "restore a value we ourselves wrote" both impossible.
const pageShift = createPageShift();

/** The deferred slide-up removal's cancel guard (D-7.11-32 survivor #6) — a
 * re-render must cancel any in-flight removal so the deferred `host.remove()`
 * never deletes a banner that was just re-rendered in the gap. */
const removalScheduler = createRemovalScheduler();

/** Remove the banner with a slide-up (instant under reduced motion), and
 * restore `body padding-top` at the exact moment the host actually leaves the
 * DOM — covers teardown, dismiss, SPA re-injection into "caught up", and
 * disconnect. Every removal path funnels through `removeBannerViaSlide`
 * (D-7.11-32 survivor #2), which is what makes "a path forgot to restore"
 * provable by test rather than trusted per call site. */
function removeBanner(): void {
  const host = existingHost();
  if (!host) return;
  removeBannerViaSlide({
    host,
    pageShift,
    scheduler: removalScheduler,
    reducedMotion: prefersReducedMotion(),
    transition: transitionFor(),
    onRemoved: () => {
      isExpanded = false;
    },
  });
}

type BannerState = { hoursMissing: number; currentTicket?: string };

/** The most recently rendered collapsed state, so a viewport resize (AC8) can
 * redraw the rail without a fresh SW round-trip. */
let lastBannerState: BannerState | null = null;
/** True while the expanded quick-log is showing — a resize must never
 * collapse an in-progress edit back to the collapsed rail. */
let isExpanded = false;

/** Re-entrancy guard for the quick-log submit (module-scoped, not local to
 * `expandQuickLog`, so the host-level Escape listener added once at mount
 * — D-7.11-33 — can read the CURRENT value across repeated expand/collapse
 * cycles). Reset to `false` every time the quick-log is (re)expanded. Prevents
 * a fast double-Enter (or click+Enter) from posting the worklog twice — the
 * SW write is not idempotent. */
let inflight = false;

/** Hover/focus feedback is JS, never `:hover`/`:focus` (AC6, D-7.9-17: every
 * interactive control gets a visible focus ring). Delegates to the tested
 * primitives in `lib/banner-interactions.ts`. */
function wireCollapsedHoverFocus(handles: CollapsedBanner, ghost: boolean): void {
  if (handles.primaryButton) {
    wireHoverColor(
      handles.primaryButton,
      'background',
      REST.primaryAction.background,
      HOVER.primaryAction.background,
    );
    wireFocusRing(handles.primaryButton, FOCUS_RING);
  }

  const open = handles.openExtensionButton;
  if (ghost) {
    wireHoverColor(open, 'color', REST.openExtensionGhost.color, HOVER.openExtensionGhost.color);
  } else {
    wireHoverColor(
      open,
      'background',
      REST.openExtensionOutline.background,
      HOVER.openExtensionOutline.background,
    );
  }
  wireFocusRing(open, FOCUS_RING);

  const dismiss = handles.dismissButton;
  wireHoverColor(dismiss, 'background', REST.dismiss.background, HOVER.dismiss.background);
  wireHoverColor(dismiss, 'color', REST.dismiss.color, HOVER.dismiss.color);
  wireFocusRing(dismiss, FOCUS_RING);
}

/**
 * Build (or reuse) the single banner host and render the collapsed content.
 * Idempotent: reuses the existing host element (AC #11, #12). `body
 * padding-top` is pushed exactly once, on first mount only (T4).
 */
function renderBanner(state: BannerState): void {
  // A re-render supersedes any in-flight slide-up removal — keep the banner.
  beginBannerRender(removalScheduler);
  lastBannerState = state;
  isExpanded = false;
  const isNew = existingHost() === null;
  // Build (or reuse) the host with its role="region" + aria-label, and render
  // the collapsed content via the shared builder (single a11y source of truth).
  const host = ensureBannerHost();
  if (isNew) {
    document.body.appendChild(host);
    // D-7.11-33: Escape closes the quick-log from ANYWHERE inside the rail
    // (not just the hours input) — scoped to the rail's own subtree by
    // listening on the host itself, added once per host so re-renders never
    // stack duplicate listeners. Only relevant while expanded; never
    // intercepts Tab or any other key.
    host.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!isExpanded) return;
      if (!shouldReevaluateOnEscape(inflight)) return;
      void reevaluate();
    });
  }
  // AC5's page-push on first mount only (D-7.11-32 survivor #1) — push() is
  // itself a no-op once owned, so this is safe to call every render.
  commitMount(pageShift, isNew, RAIL_HEIGHT);

  const narrow = isNarrowViewport();
  const ghost = state.currentTicket !== undefined;
  let handles: CollapsedBanner;
  try {
    handles = renderCollapsedBanner(
      host,
      {
        hoursMissing: state.hoursMissing,
        narrow,
        ...(state.currentTicket !== undefined ? { currentTicket: state.currentTicket } : {}),
      },
      {
        ...(state.currentTicket !== undefined
          ? { onContextualLog: () => expandQuickLog(state.currentTicket!) }
          : {}),
        onOpenExtension: () => {
          void sendMessage('open-popup', {});
        },
        onDismiss: () => {
          // Persist the dismissal BEFORE removing so any re-eval reliably
          // sees it — folded into one function (D-7.11-32 survivor #8) so
          // the ordering cannot be silently inverted at the call site.
          void dismissAndRemove(dismissForToday, removeBanner);
        },
      },
    );
  } catch (e) {
    // Never leave a half-mounted host owning body padding it can't clean up.
    if (isNew) {
      pageShift.restore();
      host.remove();
    }
    throw e;
  }
  wireCollapsedHoverFocus(handles, ghost);

  // Set the transition AFTER renderCollapsedBanner: its applyStyle() rewrites
  // the whole inline `style` attribute, which would otherwise wipe a transition
  // set earlier — losing the fresh-mount slide-in (Story 3.3 behaviour).
  host.style.transition = transitionFor();

  // Slide-in for a freshly mounted banner (instant under reduced motion).
  if (isNew && !prefersReducedMotion()) {
    host.style.transform = 'translateY(-100%)';
    // Force reflow so the transition applies on the next frame.
    void host.offsetHeight;
    host.style.transform = 'translateY(0)';
  } else {
    host.style.transform = 'translateY(0)';
  }
}

/** Expand the banner in place into the inline quick-log (AC #5, #6). */
function expandQuickLog(ticket: string): void {
  const host = existingHost();
  if (!host) return;
  isExpanded = true;
  inflight = false;
  // Build the labelled hours input + Log button + error/status slot + the
  // no-error spacer/hint + a pointer-reachable dismiss via the shared builder
  // (single a11y source of truth with the axe scan). The host's height is
  // never written — expansion is a content swap (D-7.11-45).
  const { input, logBtn, error, spacer, hint, dismissButton } = renderExpandedQuickLog(host, ticket);
  wireFocusRing(input, FOCUS_RING);
  wireFocusRing(logBtn, FOCUS_RING);
  wireFocusRing(dismissButton, FOCUS_RING);
  wireHoverColor(dismissButton, 'background', REST.dismiss.background, HOVER.dismiss.background);
  wireHoverColor(dismissButton, 'color', REST.dismiss.color, HOVER.dismiss.color);
  dismissButton.addEventListener('click', () => {
    void dismissAndRemove(dismissForToday, removeBanner);
  });

  // Finding 4: the design shows the error/status slot and the keyboard hint
  // mutually exclusively — hide the no-error spacer + hint whenever the
  // error slot is shown, restore them when it clears.
  const showError = (msg: string, tone: 'amber' | 'red'): void => {
    error.replaceChildren();
    error.appendChild(svg(tone === 'amber' ? 'Circle' : 'CircleX', { size: 11 }));
    error.appendChild(document.createTextNode(msg));
    // applyStyle() already writes `display:flex` as part of the style
    // object — a stray `error.style.display = ''` after this line used to
    // immediately delete it again (Finding 3); it is gone for good.
    applyStyle(error, tone === 'amber' ? errorTextAmberStyle : errorTextRedStyle);
    spacer.style.display = 'none';
    hint.style.display = 'none';
  };

  // C13: auto-clears after 1.5s WITHOUT destroying the typed value — the
  // tested primitive never touches `input.value`.
  const clearAmberError = (): void => {
    clearAmberErrorState(input, error, LEGACY_PURPLE);
    spacer.style.display = '';
    hint.style.display = '';
  };

  const announceSuccess = (hours: number): void => {
    applyStyle(logBtn, successButtonStyle);
    logBtn.replaceChildren();
    logBtn.appendChild(svg('CircleCheck', { size: 12 }));
    logBtn.appendChild(document.createTextNode(STRINGS.loggedHours(hours)));
    logBtn.disabled = true;
    input.disabled = true;
    input.style.borderColor = BORDER;
    input.style.background = SURFACE_SUNK;
    input.style.color = FAINT;
    input.style.boxShadow = 'none';

    error.replaceChildren();
    error.appendChild(document.createTextNode(`${STRINGS.loggedHours(hours)} — ${STRINGS.closing}`));
    // See the Finding 3 note above — no redundant `display` overwrite.
    applyStyle(error, successTextStyle);
    spacer.style.display = 'none';
    hint.style.display = 'none';
  };

  const submit = async (): Promise<void> => {
    const parsed = parseHours(input.value);
    // The double-post guard and the amber/red tone routing are ONE tested
    // decision (D-7.11-32 survivors #4 + #7) — a client-side validation
    // failure can only ever come back `tone: 'amber'` from here.
    const action = decideSubmitAction(parsed, inflight, MAX_HOURS_PER_ENTRY, STRINGS);
    if (action.kind === 'ignored') return;
    if (action.kind === 'invalid') {
      input.style.borderColor = AMBER_BORDER;
      input.style.boxShadow = 'none';
      showError(action.message, action.tone);
      window.setTimeout(clearAmberError, AMBER_AUTOCLEAR_MS);
      return;
    }
    inflight = true;
    logBtn.disabled = true;
    const res = await sendRequest('log-worklog-request', {
      issueKey: ticket,
      timeSpentSeconds: hoursToSeconds(action.hours),
      started: formatStartedISO(todayDateString()),
    });
    // AC12 names BOTH `ok` and `pending` (durably queued in the outbox) as
    // success (D-7.11-32 survivor #5).
    if (res && isWorklogSuccess(res.status)) {
      log.info(res.status === 'ok' ? 'banner.log.success' : 'banner.log.pending', { key: ticket });
      announceSuccess(action.hours);
      window.setTimeout(() => removeBanner(), 600);
    } else {
      // The ONE legitimate red on this surface (D-7.11-40): a write Jira
      // actually refused. Persists — no auto-clear — until the user retries.
      log.warn('banner.log.failed', { key: ticket });
      input.style.borderColor = BORDER;
      logBtn.style.background = ERROR_INK;
      logBtn.disabled = false;
      logBtn.textContent = STRINGS.tryAgain;
      showError(STRINGS.logFailedError, 'red');
      inflight = false;
    }
  };

  logBtn.addEventListener('click', () => void submit());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  });

  input.focus();
}

/** The core inject / re-evaluate flow. Never throws. */
async function reevaluate(): Promise<void> {
  try {
    if (await isDismissedToday()) {
      removeBanner();
      log.info('banner.skipped', { reason: 'dismissed' });
      return;
    }

    const state = await sendRequest('banner-state', { url: location.href });
    if (!state || state.hoursMissing <= 0) {
      removeBanner();
      log.info('banner.skipped', {
        reason: state ? 'caught-up' : 'disconnected',
      });
      return;
    }

    renderBanner({
      hoursMissing: state.hoursMissing,
      ...(state.currentTicket !== undefined
        ? { currentTicket: state.currentTicket }
        : {}),
    });
    log.info('banner.injected', {
      hoursMissing: state.hoursMissing,
      contextual: state.currentTicket !== undefined,
    });
  } catch (e) {
    log.error('banner.error', { cause: String(e) });
  }
}

let lastUrl = '';
const spaDebouncer = createDebouncer(SPA_DEBOUNCE_MS);

function scheduleReeval(): void {
  spaDebouncer.schedule(() => {
    // Only re-evaluate on an actual in-tab navigation (AC #12, D-7.11-32
    // survivor #9). Jira's SPA mutates <body>/<title> constantly (modals,
    // toasts, lazy content) and the banner's own inject/remove mutates <body>
    // too; re-evaluating on every mutation would fire a storage read + SW
    // round-trip continuously and could clobber an in-flight quick-log.
    if (!shouldReevaluateForUrl(location.href, lastUrl)) return;
    lastUrl = location.href;
    void reevaluate();
  });
}

const resizeDebouncer = createDebouncer(RESIZE_DEBOUNCE_MS);

/** AC8 — re-evaluate the narrow/wide breakpoint on resize, reusing the
 * existing collapsed render path. Never fires while the quick-log is open. */
function scheduleResize(): void {
  resizeDebouncer.schedule(() => {
    if (isExpanded) return;
    if (!existingHost()) return;
    if (!lastBannerState) return;
    renderBanner(lastBannerState);
  });
}

export default defineContentScript({
  matches: ['https://*.atlassian.net/*'],
  main() {
    try {
      lastUrl = location.href;
      void reevaluate();

      // SPA in-tab navigation: popstate + a debounced MutationObserver on the
      // document title (cheap, fires on Jira route changes). Idempotent.
      window.addEventListener('popstate', scheduleReeval);
      window.addEventListener('resize', scheduleResize);

      const titleEl = document.querySelector('title');
      const observer = new MutationObserver(scheduleReeval);
      if (titleEl) {
        observer.observe(titleEl, { childList: true });
      }
      observer.observe(document.body, { childList: true, subtree: false });

      // Disconnect (Story 2.1): the SW broadcasts `disconnect` to Atlassian
      // tabs; tear the banner down immediately (no auth surface here).
      chrome.runtime.onMessage.addListener((message: unknown) => {
        if (
          typeof message === 'object' &&
          message !== null &&
          (message as { kind?: unknown }).kind === 'disconnect'
        ) {
          removeBanner();
          log.info('banner.dismissed', { reason: 'disconnect' });
        }
        return false;
      });
    } catch (e) {
      log.error('banner.error', { cause: String(e) });
    }
  },
});
