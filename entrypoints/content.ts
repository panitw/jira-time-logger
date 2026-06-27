/**
 * Inline Jira banner content script (Story 3.3 — the extension's FIRST content
 * script). Injected into `*.atlassian.net` pages.
 *
 * VANILLA DOM ONLY — no React, no Tailwind, no external loads (Jira CSP). Every
 * style is an inline `style` string from `lib/banner-styles.ts`. All decision
 * logic lives in tested pure helpers (`lib/storage/banner-dismiss`, `lib/badge`
 * via the SW `banner-state` handler, `lib/hours`); this file is thin DOM glue.
 *
 * Flow (inject / re-eval):
 *   1. If dismissed today → ensure no banner, stop (AC #1, #6).
 *   2. Ask the SW for `{ hoursMissing, currentTicket }` (AC #2).
 *   3. If `hoursMissing <= 0` (caught up / disconnected / auth-expired) → ensure
 *      no banner, stop (AC #2, #8).
 *   4. Render the collapsed banner (AC #3); add the contextual CTA when on a
 *      `/browse/<KEY>` page (AC #4); clicking it expands an inline quick-log
 *      that posts via the SW (AC #5).
 *
 * SPA-aware: a `popstate` listener + a debounced `MutationObserver` re-run the
 * flow on in-tab navigation, idempotently (AC #7). The script never throws —
 * the banner is a passive guest (AC #8, graceful degradation).
 */
import {
  BANNER_STRINGS,
  ensureBannerHost,
  renderCollapsedBanner,
  renderExpandedQuickLog,
} from '@/lib/banner-dom';
import {
  BANNER_HOST_ID,
  SLIDE_TRANSITION,
  NO_TRANSITION,
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
  logFailedError: 'Couldn’t log time — try again',
};

const SPA_DEBOUNCE_MS = 250;

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

function existingHost(): HTMLElement | null {
  return document.getElementById(BANNER_HOST_ID);
}

/** A pending slide-up removal timer, so a re-render can cancel it (the deferred
 * `host.remove()` must never delete a banner that was re-rendered in the gap). */
let removeTimer: ReturnType<typeof setTimeout> | undefined;

function cancelPendingRemoval(): void {
  if (removeTimer !== undefined) {
    clearTimeout(removeTimer);
    removeTimer = undefined;
  }
}

/** Remove the banner with a slide-up (instant under reduced motion). */
function removeBanner(): void {
  const host = existingHost();
  if (!host) return;
  cancelPendingRemoval();
  if (prefersReducedMotion()) {
    host.remove();
    return;
  }
  host.style.transition = transitionFor();
  host.style.transform = 'translateY(-100%)';
  removeTimer = setTimeout(() => {
    removeTimer = undefined;
    // Only remove if still slid up — a re-render in the gap resets the
    // transform to translateY(0), in which case the banner is live again.
    if (host.style.transform === 'translateY(-100%)') host.remove();
  }, 220);
}

type BannerState = { hoursMissing: number; currentTicket?: string };

/**
 * Build (or reuse) the single banner host and render the collapsed content.
 * Idempotent: reuses the existing host element (AC #1, #7).
 */
function renderBanner(state: BannerState): void {
  // A re-render supersedes any in-flight slide-up removal — keep the banner.
  cancelPendingRemoval();
  const isNew = existingHost() === null;
  // Build (or reuse) the host with its role="region" + aria-label, and render
  // the collapsed content via the shared builder (single a11y source of truth).
  const host = ensureBannerHost();
  if (isNew) document.body.appendChild(host);
  renderCollapsedBanner(
    host,
    {
      hoursMissing: state.hoursMissing,
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
        // Persist the dismissal BEFORE removing so any re-eval reliably sees it.
        void (async () => {
          await dismissForToday();
          removeBanner();
        })();
      },
    },
  );
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

/** Expand the banner in place into the inline quick-log (AC #5). */
function expandQuickLog(ticket: string): void {
  const host = existingHost();
  if (!host) return;
  // Build the labelled hours input + Log button + error slot via the shared
  // builder (single a11y source of truth with the axe scan).
  const { input, logBtn, error } = renderExpandedQuickLog(host, ticket);

  const showError = (msg: string): void => {
    error.textContent = msg;
    error.style.display = '';
  };

  // Re-entrancy guard: the Enter keydown handler calls submit() independently
  // of the button's disabled state, so without this a fast double-Enter (or
  // click+Enter) would post the worklog twice (the SW write is not idempotent).
  let inflight = false;

  const submit = async (): Promise<void> => {
    if (inflight) return;
    const parsed = parseHours(input.value);
    if (parsed.kind !== 'ok') {
      showError(STRINGS.parseError);
      window.setTimeout(() => void reevaluate(), 1500);
      return;
    }
    if (parsed.hours > MAX_HOURS_PER_ENTRY) {
      showError(STRINGS.overLimitError);
      window.setTimeout(() => void reevaluate(), 1500);
      return;
    }
    inflight = true;
    logBtn.disabled = true;
    const res = await sendRequest('log-worklog-request', {
      issueKey: ticket,
      timeSpentSeconds: hoursToSeconds(parsed.hours),
      started: formatStartedISO(todayDateString()),
    });
    if (res && res.status === 'ok') {
      logBtn.textContent = STRINGS.check;
      log.info('banner.log.success', { key: ticket });
      window.setTimeout(() => removeBanner(), 600);
    } else if (res && res.status === 'pending') {
      logBtn.textContent = STRINGS.check;
      log.info('banner.log.pending', { key: ticket });
      window.setTimeout(() => removeBanner(), 600);
    } else {
      log.warn('banner.log.failed', { key: ticket });
      showError(STRINGS.logFailedError);
      logBtn.disabled = false;
      inflight = false;
    }
  };

  logBtn.addEventListener('click', () => void submit());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
    if (e.key === 'Escape') {
      void reevaluate();
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
let spaTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleReeval(): void {
  if (spaTimer) clearTimeout(spaTimer);
  spaTimer = setTimeout(() => {
    // Only re-evaluate on an actual in-tab navigation (AC #7). Jira's SPA
    // mutates <body>/<title> constantly (modals, toasts, lazy content) and the
    // banner's own inject/remove mutates <body> too; re-evaluating on every
    // mutation would fire a storage read + SW round-trip continuously and could
    // clobber an in-flight quick-log. Gating on the URL changing avoids that.
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    void reevaluate();
  }, SPA_DEBOUNCE_MS);
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
