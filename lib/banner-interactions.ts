/**
 * Pure, DOM-only behaviour primitives for the guest rail's content script
 * (`entrypoints/content.ts`), extracted so they are unit-testable.
 *
 * `entrypoints/content.ts` cannot be imported under this project's current
 * vitest config: it calls the WXT build-time global `defineContentScript` at
 * module scope, which only exists after WXT's own bundler transform runs (no
 * `WxtVitest` plugin is wired into `vitest.config.ts`) — confirmed by a direct
 * import probe (`ReferenceError: defineContentScript is not defined`). This
 * is a pre-existing gap in the project's test infrastructure (the same is
 * true of `entrypoints/background.ts`, which has no test file either) and is
 * out of this story's scope to fix.
 *
 * The behaviours below are exactly the ones Story 7.11 must RED-prove
 * (`body padding-top` save/restore + re-entrancy, the Escape/in-flight gate,
 * focus-ring wiring, hover-colour wiring, the amber-error clear primitive),
 * pulled out as plain functions with no `chrome.*`/WXT dependency so they can
 * be tested directly against a real jsdom `document`. `content.ts` imports
 * and composes them; its own submit/error/success orchestration (which calls
 * `sendRequest`) is not independently exercised by an automated test — see
 * this story's Completion Notes for the honest accounting.
 */

// ---------------------------------------------------------------------------
// `body padding-top` push/restore (AC5, D-7.11-30)
// ---------------------------------------------------------------------------

export type PageShift = {
  /** Read-and-store the prior inline value, then write `height`. No-op if
   * already owned — never re-writes, never assumes the prior value was
   * empty. */
  push(height: string): void;
  /** Restore the EXACT prior value. No-op if not currently owned, so a
   * second call (or a call after the owned value was already restored) is
   * always safe — this is what makes "restore a value we ourselves wrote"
   * impossible. */
  restore(): void;
  /** True once `push()` has written a value not yet `restore()`d. */
  readonly owned: boolean;
};

/**
 * SPA navigation can re-inject the rail while a previous instance is
 * unwinding. A single `PageShift` instance (one per content-script run) is
 * the re-entrancy guard: `push()` is a no-op while already `owned`, so
 * calling it twice in a row never double-applies the padding, and `restore()`
 * is a no-op once `owned` flips back to false, so it can never restore twice
 * or restore a value this instance no longer holds.
 */
export function createPageShift(doc: Document = document): PageShift {
  let owned = false;
  let prior = '';
  return {
    push(height: string): void {
      if (owned) return;
      prior = doc.body.style.paddingTop;
      doc.body.style.paddingTop = height;
      owned = true;
    },
    restore(): void {
      if (!owned) return;
      doc.body.style.paddingTop = prior;
      owned = false;
    },
    get owned(): boolean {
      return owned;
    },
  };
}

// ---------------------------------------------------------------------------
// Escape during an in-flight submit (AC12, D-7.11-46 — closes the Story 3.3
// deferred item: Escape used to re-render unconditionally and drop the
// success confirmation, even though the write still posted).
// ---------------------------------------------------------------------------

export function shouldReevaluateOnEscape(inflight: boolean): boolean {
  return !inflight;
}

// ---------------------------------------------------------------------------
// Focus ring (AC6, D-7.9-17 — every interactive control gets a visible focus
// ring; missing ones are BLOCKERS).
// ---------------------------------------------------------------------------

export function wireFocusRing(el: HTMLElement, ring: string): void {
  el.addEventListener('focus', () => {
    el.style.boxShadow = ring;
  });
  el.addEventListener('blur', () => {
    el.style.boxShadow = 'none';
  });
}

// ---------------------------------------------------------------------------
// Hover colour swap (AC6 — hover is `mouseenter`/`mouseleave` writing
// `el.style.background`/`color`, never `:hover`).
// ---------------------------------------------------------------------------

export function wireHoverColor(
  el: HTMLElement,
  prop: 'background' | 'color',
  rest: string,
  hover: string,
): void {
  el.addEventListener('mouseenter', () => {
    el.style[prop] = hover;
  });
  el.addEventListener('mouseleave', () => {
    el.style[prop] = rest;
  });
}

// ---------------------------------------------------------------------------
// The amber-error clear primitive (C13 — auto-clears after 1.5s WITHOUT
// destroying the typed value; unlike the old behaviour, this never calls
// `reevaluate()`).
// ---------------------------------------------------------------------------

/**
 * Clear the error/status slot and restore the field's idle border colour.
 * Deliberately never touches `input.value` — that omission IS the fix
 * (C13): the previous behaviour called `reevaluate()`, which re-rendered the
 * whole banner and lost whatever the user had typed.
 */
export function clearAmberError(
  input: HTMLInputElement,
  status: HTMLElement,
  idleBorderColor: string,
): void {
  status.replaceChildren();
  status.style.display = 'none';
  input.style.borderColor = idleBorderColor;
}

// ---------------------------------------------------------------------------
// D-7.11-32 — the remaining `entrypoints/content.ts` orchestration, extracted
// so it is genuinely test-provable rather than merely composed. The review
// ran 18 mutations against shipped behaviour; 9 reddened and 9 survived, and
// every survivor was in `content.ts` (the file this whole module exists to
// work around). Each export below is named for the exact survivor it closes;
// `content.ts` now composes these instead of encoding the decision inline.
// ---------------------------------------------------------------------------

/**
 * A generic delay/cancel primitive — schedule() replaces any previously
 * scheduled callback (so a second call is a reschedule, never a stack of
 * timers), and cancelPending() guarantees a scheduled callback never fires.
 * Used for both the banner's deferred slide-up removal (220ms) and, via
 * `createDebouncer`, the SPA re-eval / resize debounces below.
 */
export type RemovalScheduler = {
  schedule(delayMs: number, onFire: () => void): void;
  cancelPending(): void;
  readonly pending: boolean;
};

export function createRemovalScheduler(): RemovalScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(delayMs, onFire) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        onFire();
      }, delayMs);
    },
    cancelPending() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    get pending(): boolean {
      return timer !== undefined;
    },
  };
}

/** Survivor #6 — `cancelPendingRemoval()` deleted from `renderBanner`. A
 * re-render must cancel any in-flight slide-up removal so the deferred
 * `host.remove()` never deletes a banner that was just re-rendered. */
export function beginBannerRender(scheduler: RemovalScheduler): void {
  scheduler.cancelPending();
}

/** Survivor #1 — `pageShift.push(RAIL_HEIGHT)` deleted from `renderBanner`
 * (AC5's page-push never happening). `push()` is itself a no-op once
 * `owned`, so this is safe to call on every render — the `isNew` gate is
 * what makes it a true "first mount only" write. */
export function commitMount(pageShift: PageShift, isNew: boolean, height: string): void {
  if (isNew) pageShift.push(height);
}

export type BannerRemovalDeps = {
  host: HTMLElement;
  pageShift: PageShift;
  scheduler: RemovalScheduler;
  reducedMotion: boolean;
  transition: string;
  /** Called at the exact moment the host actually leaves the DOM — the
   * caller uses this to reset its own `isExpanded` flag. */
  onRemoved: () => void;
};

/**
 * Survivor #2 — `pageShift.restore()` deleted from the animated removal path.
 * EVERY teardown (dismiss, caught-up, disconnect, SPA re-injection into
 * "caught up", and explicit teardown) funnels through this one function, so
 * "a removal path forgot to restore" is now provable by a single test rather
 * than trusted per call site.
 */
export function removeBannerViaSlide(deps: BannerRemovalDeps): void {
  const { host, pageShift, scheduler, reducedMotion, transition, onRemoved } = deps;
  // A stray earlier removal (e.g. a duplicate teardown event) must never
  // fire after this call schedules its own.
  scheduler.cancelPending();
  if (reducedMotion) {
    host.remove();
    pageShift.restore();
    onRemoved();
    return;
  }
  host.style.transition = transition;
  host.style.transform = 'translateY(-100%)';
  scheduler.schedule(220, () => {
    // Only remove if still slid up — a re-render in the gap resets the
    // transform to translateY(0), in which case the banner is live again.
    if (host.style.transform === 'translateY(-100%)') {
      host.remove();
      pageShift.restore();
      onRemoved();
    }
  });
}

/** `lib/hours.ts#ParseResult`, restated locally so this module has no import
 * dependency on `lib/hours.ts` (it stays a pure, dependency-free primitive —
 * the caller passes an already-parsed result). Must stay structurally
 * identical to `ParseResult`. */
export type ParsedHoursLike = { kind: 'ok'; hours: number } | { kind: 'unparseable' };

export type SubmitAction =
  | { kind: 'ignored' }
  | { kind: 'invalid'; message: string; tone: 'amber' }
  | { kind: 'submit'; hours: number };

/**
 * Survivors #4 + #7 — the double-post guard (`if (inflight) return;`) and the
 * amber/red tone routing (`showError(STRINGS.parseError, 'amber')` → `'red'`,
 * the exact D-7.11-40 regression) are folded into ONE decision. A client-side
 * validation failure can only ever produce `tone: 'amber'` here — flipping it
 * to red requires editing (and re-breaking) this function's own pinned tests,
 * not just the call site.
 */
export function decideSubmitAction(
  parsed: ParsedHoursLike,
  inflight: boolean,
  maxHoursPerEntry: number,
  strings: { parseError: string; overLimitError: string },
): SubmitAction {
  if (inflight) return { kind: 'ignored' };
  if (parsed.kind === 'ok') {
    if (parsed.hours > maxHoursPerEntry) {
      return { kind: 'invalid', message: strings.overLimitError, tone: 'amber' };
    }
    return { kind: 'submit', hours: parsed.hours };
  }
  return { kind: 'invalid', message: strings.parseError, tone: 'amber' };
}

/** Survivor #5 — the `pending` (outbox) branch lost its 600ms slide-away.
 * AC12 names BOTH `ok` and `pending` as success; only `pending` is durably
 * queued rather than confirmed by Jira, but the user still sees success. */
export function isWorklogSuccess(status: string | undefined): boolean {
  return status === 'ok' || status === 'pending';
}

/**
 * Survivor #8 — the daily-dismiss ordering inverted (`removeBanner()` before
 * `await dismissForToday()`), reopening the exact race the code's own comment
 * says it prevents: a re-eval racing the removal must reliably see the
 * dismissal already persisted.
 */
export async function dismissAndRemove(
  dismissForToday: () => Promise<void>,
  removeBanner: () => void,
): Promise<void> {
  await dismissForToday();
  removeBanner();
}

/**
 * Survivor #9 — SPA re-injection (`scheduleReeval`) made a permanent no-op.
 * The URL gate is the load-bearing decision (it stops a re-eval storm and
 * stops clobbering an in-flight quick-log, per `content.ts`'s own docstring);
 * only an ACTUAL in-tab navigation should re-evaluate, never a same-page DOM
 * mutation (Jira's SPA — and the banner's own inject/remove — mutate `body`
 * continuously).
 */
export function shouldReevaluateForUrl(currentUrl: string, lastUrl: string): boolean {
  return currentUrl !== lastUrl;
}

export type Debouncer = { schedule(fn: () => void): void };

/** The generic debounce mechanism `scheduleReeval` and `scheduleResize` both
 * compose (previously two hand-duplicated timer/clearTimeout pairs). */
export function createDebouncer(delayMs: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(fn) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        fn();
      }, delayMs);
    },
  };
}
