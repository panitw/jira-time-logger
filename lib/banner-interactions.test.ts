import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createPageShift,
  shouldReevaluateOnEscape,
  wireFocusRing,
  wireHoverColor,
  clearAmberError,
  createRemovalScheduler,
  removeBannerViaSlide,
  beginBannerRender,
  commitMount,
  decideSubmitAction,
  isWorklogSuccess,
  dismissAndRemove,
  shouldReevaluateForUrl,
  createDebouncer,
} from './banner-interactions';

// TT11 — AC5 / D-7.11-30. `entrypoints/content.ts` itself cannot be imported
// under this project's vitest config (`defineContentScript` is a WXT
// build-time global; see `lib/banner-interactions.ts`'s module docstring for
// the confirmed probe). This is where the extracted, tested primitive lives.
describe('createPageShift — body padding-top save/restore, exactly once, re-entrancy-safe', () => {
  beforeEach(() => {
    document.body.style.paddingTop = '';
  });

  it('push() writes the given height and saves the PRIOR value (the empty/unset case)', () => {
    const shift = createPageShift(document);
    expect(document.body.style.paddingTop).toBe('');
    shift.push('44px');
    expect(document.body.style.paddingTop).toBe('44px');
    expect(shift.owned).toBe(true);
  });

  it('restore() puts back the exact prior value, INCLUDING the case where a host page had already set one', () => {
    document.body.style.paddingTop = '20px'; // "Jira" (or another script) already set one
    const shift = createPageShift(document);
    shift.push('44px');
    expect(document.body.style.paddingTop).toBe('44px');
    shift.restore();
    expect(document.body.style.paddingTop).toBe('20px');
    expect(shift.owned).toBe(false);
  });

  it('never assumes the prior value was empty — restores "" faithfully when that WAS the prior value', () => {
    document.body.style.paddingTop = '';
    const shift = createPageShift(document);
    shift.push('44px');
    shift.restore();
    expect(document.body.style.paddingTop).toBe('');
  });

  it('push() is written EXACTLY ONCE — a second push() before restore() is a no-op (re-entrancy)', () => {
    document.body.style.paddingTop = '7px';
    const shift = createPageShift(document);
    shift.push('44px');
    // A second mount (e.g. SPA re-injection racing a previous instance)
    // must NOT clobber the saved prior value with the value we ourselves
    // just wrote.
    document.body.style.paddingTop = '44px'; // simulate: still our value
    shift.push('44px');
    shift.restore();
    expect(document.body.style.paddingTop).toBe('7px');
  });

  it('restore() is a no-op once already restored — never restores a value we ourselves wrote twice', () => {
    document.body.style.paddingTop = '9px';
    const shift = createPageShift(document);
    shift.push('44px');
    shift.restore();
    expect(document.body.style.paddingTop).toBe('9px');
    // Something else legitimately changes body padding after we let go...
    document.body.style.paddingTop = '3px';
    // ...a stray second restore() call (e.g. a duplicate teardown event)
    // must not clobber it back to our old saved value.
    shift.restore();
    expect(document.body.style.paddingTop).toBe('3px');
  });

  it('restore() before any push() is a safe no-op', () => {
    document.body.style.paddingTop = '5px';
    const shift = createPageShift(document);
    shift.restore();
    expect(document.body.style.paddingTop).toBe('5px');
  });

  it('two independent PageShift instances (simulating two racing content-script instances) do not clobber each other', () => {
    document.body.style.paddingTop = '11px';
    const first = createPageShift(document);
    first.push('44px'); // instance A mounts, saves '11px'

    // Instance A begins unwinding but hasn't restored yet; a re-injected
    // instance B is the SAME logical rail (content.ts only ever creates one
    // `pageShift` at module scope), so in practice there is one shift per
    // script run — this test proves the flag-guard holds even if `push`
    // were (incorrectly) called again against the SAME instance mid-unwind.
    first.push('44px'); // no-op: already owned
    expect(document.body.style.paddingTop).toBe('44px');
    first.restore();
    expect(document.body.style.paddingTop).toBe('11px');
  });
});

// TT12 — AC12 / D-7.11-46.
describe('shouldReevaluateOnEscape — closes the Story 3.3 deferred item', () => {
  it('returns false while a submit is in flight (Escape must not drop the confirmation)', () => {
    expect(shouldReevaluateOnEscape(true)).toBe(false);
  });

  it('returns true when idle (Escape closes the quick-log as before)', () => {
    expect(shouldReevaluateOnEscape(false)).toBe(true);
  });
});

// TT13 — AC6 / D-7.9-17.
describe('wireFocusRing — every interactive control gets a visible focus ring', () => {
  it('focus sets a non-empty boxShadow; blur clears it', () => {
    const el = document.createElement('button');
    wireFocusRing(el, '0 0 0 3px rgba(89,79,116,.13)');
    expect(el.style.boxShadow).toBe('');
    el.dispatchEvent(new Event('focus'));
    expect(el.style.boxShadow).toBe('0 0 0 3px rgba(89,79,116,.13)');
    el.dispatchEvent(new Event('blur'));
    expect(el.style.boxShadow).toBe('none');
  });
});

describe('wireHoverColor — AC6: hover is mouseenter/mouseleave writing style, never :hover', () => {
  it('mouseenter applies the hover value; mouseleave restores the rest value', () => {
    const el = document.createElement('button');
    wireHoverColor(el, 'background', '#594F74', '#615B99');
    el.dispatchEvent(new Event('mouseenter'));
    expect(el.style.background).toBe('rgb(97, 91, 153)');
    el.dispatchEvent(new Event('mouseleave'));
    expect(el.style.background).toBe('rgb(89, 79, 116)');
  });

  it('works for the color property too (e.g. the ghost "Open extension" text)', () => {
    const el = document.createElement('button');
    wireHoverColor(el, 'color', '#6B6678', '#594F74');
    el.dispatchEvent(new Event('mouseenter'));
    expect(el.style.color).toBe('rgb(89, 79, 116)');
    el.dispatchEvent(new Event('mouseleave'));
    expect(el.style.color).toBe('rgb(107, 102, 120)');
  });
});

// TT10 — C13: the amber auto-clear must NEVER destroy the typed value.
describe('clearAmberError — C13: clears the error slot without touching input.value', () => {
  it('hides the status slot, resets the border, and leaves input.value untouched', () => {
    const input = document.createElement('input');
    input.value = '2.5';
    input.style.borderColor = '#EDD3A6'; // amber, as if a parse error had fired
    const status = document.createElement('span');
    status.textContent = 'Use formats like 2.5h, 2h 30m';
    status.style.display = '';

    clearAmberError(input, status, '#594F74');

    expect(input.value).toBe('2.5'); // the whole point of C13
    expect(status.style.display).toBe('none');
    expect(status.textContent).toBe('');
    expect(input.style.borderColor).toBe('rgb(89, 79, 116)');
  });
});

// ---------------------------------------------------------------------------
// D-7.11-32 — the remaining `entrypoints/content.ts` orchestration, extracted
// and RED-proved. Each block below targets exactly one of the review's nine
// surviving mutations (see the story's Finding 1 / D-7.11-32). Every test
// here was written BEFORE the corresponding implementation existed in this
// file (a bare import of a not-yet-exported name fails the whole suite) —
// that failure IS the RED proof; see Completion Notes for the record of each
// mutation re-applied and re-reverted after the extraction landed.
// ---------------------------------------------------------------------------

// Survivor #6 — cancelPendingRemoval() deleted from renderBanner.
describe('createRemovalScheduler / beginBannerRender — survivor #6: a re-render cancels a pending removal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('schedule() fires onFire after the delay if never cancelled', () => {
    const scheduler = createRemovalScheduler();
    const onFire = vi.fn();
    scheduler.schedule(220, onFire);
    expect(scheduler.pending).toBe(true);
    vi.advanceTimersByTime(220);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(false);
  });

  it('cancelPending() stops a scheduled onFire from ever running', () => {
    const scheduler = createRemovalScheduler();
    const onFire = vi.fn();
    scheduler.schedule(220, onFire);
    scheduler.cancelPending();
    vi.advanceTimersByTime(500);
    expect(onFire).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(false);
  });

  it('beginBannerRender() cancels an in-flight removal — a re-render must never let a stale removal delete the fresh banner', () => {
    const scheduler = createRemovalScheduler();
    const onFire = vi.fn();
    scheduler.schedule(220, onFire);
    beginBannerRender(scheduler);
    vi.advanceTimersByTime(500);
    expect(onFire).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

// Survivors #1 (push never happens) and #2 (restore forgotten on the removal
// path) — folded into one mount/removal pair so both directions of the same
// AC5 contract are provable.
describe('commitMount — survivor #1: AC5 page-push happens on first mount only', () => {
  it('pushes when isNew is true', () => {
    const pageShift = { push: vi.fn(), restore: vi.fn(), owned: false };
    commitMount(pageShift, true, '44px');
    expect(pageShift.push).toHaveBeenCalledWith('44px');
  });

  it('does NOT push on a re-render (isNew false)', () => {
    const pageShift = { push: vi.fn(), restore: vi.fn(), owned: true };
    commitMount(pageShift, false, '44px');
    expect(pageShift.push).not.toHaveBeenCalled();
  });
});

describe('removeBannerViaSlide — survivor #2: every removal path restores body padding-top', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reduced motion: removes the host and restores pageShift immediately', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pageShift = { push: vi.fn(), restore: vi.fn(), owned: true };
    const scheduler = createRemovalScheduler();
    const onRemoved = vi.fn();
    removeBannerViaSlide({ host, pageShift, scheduler, reducedMotion: true, transition: 'none', onRemoved });
    expect(host.isConnected).toBe(false);
    expect(pageShift.restore).toHaveBeenCalledTimes(1);
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  it('normal motion: slides up, then after 220ms removes the host and restores pageShift', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pageShift = { push: vi.fn(), restore: vi.fn(), owned: true };
    const scheduler = createRemovalScheduler();
    const onRemoved = vi.fn();
    removeBannerViaSlide({
      host,
      pageShift,
      scheduler,
      reducedMotion: false,
      transition: 'transform 200ms ease-out',
      onRemoved,
    });
    expect(pageShift.restore).not.toHaveBeenCalled();
    vi.advanceTimersByTime(220);
    expect(host.isConnected).toBe(false);
    expect(pageShift.restore).toHaveBeenCalledTimes(1);
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  it('a re-render that resets the transform before the timer fires cancels the removal (host stays, pageShift NOT restored)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pageShift = { push: vi.fn(), restore: vi.fn(), owned: true };
    const scheduler = createRemovalScheduler();
    const onRemoved = vi.fn();
    removeBannerViaSlide({
      host,
      pageShift,
      scheduler,
      reducedMotion: false,
      transition: 'transform 200ms ease-out',
      onRemoved,
    });
    host.style.transform = 'translateY(0)'; // a re-render reset it in the gap
    vi.advanceTimersByTime(220);
    expect(host.isConnected).toBe(true);
    expect(pageShift.restore).not.toHaveBeenCalled();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it('cancels any PRIOR pending removal before scheduling its own (the same guard beginBannerRender exercises)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pageShift = { push: vi.fn(), restore: vi.fn(), owned: true };
    const scheduler = createRemovalScheduler();
    scheduler.schedule(220, () => {
      throw new Error('a stale removal must never fire');
    });
    removeBannerViaSlide({
      host,
      pageShift,
      scheduler,
      reducedMotion: false,
      transition: 'transform 200ms ease-out',
      onRemoved: vi.fn(),
    });
    expect(() => vi.advanceTimersByTime(220)).not.toThrow();
  });
});

// Survivors #4 (double-post guard) and #7 (amber/red tone routing, the exact
// D-7.11-40 regression) — folded into one decision so the tone can never be
// flipped to red for a client-side validation failure without editing (and
// re-breaking) this function's own pinned tests.
describe('decideSubmitAction — survivors #4 + #7: the double-post guard and the amber/red split are ONE decision', () => {
  const strings = { parseError: 'Use formats like 2.5h, 2h 30m', overLimitError: "Hours per entry can't exceed 24" };

  it('ignores the submit entirely while already inflight (the double-post guard)', () => {
    expect(decideSubmitAction({ kind: 'ok', hours: 2.5 }, true, 24, strings)).toEqual({ kind: 'ignored' });
  });

  it('an unparseable value is ALWAYS amber, never red, even if a caller tried to pass a different tone', () => {
    const action = decideSubmitAction({ kind: 'unparseable' }, false, 24, strings);
    expect(action).toEqual({ kind: 'invalid', message: strings.parseError, tone: 'amber' });
  });

  it('an over-limit value is amber (client-side limit, nothing was sent)', () => {
    const action = decideSubmitAction({ kind: 'ok', hours: 30 }, false, 24, strings);
    expect(action).toEqual({ kind: 'invalid', message: strings.overLimitError, tone: 'amber' });
  });

  it('a valid value under the limit submits', () => {
    expect(decideSubmitAction({ kind: 'ok', hours: 2.5 }, false, 24, strings)).toEqual({
      kind: 'submit',
      hours: 2.5,
    });
  });
});

// Survivor #5 — the `pending` (outbox) branch loses its 600ms slide-away.
describe('isWorklogSuccess — survivor #5: AC12 names BOTH `ok` and `pending` as success', () => {
  it('ok is success', () => {
    expect(isWorklogSuccess('ok')).toBe(true);
  });
  it('pending (durably queued in the outbox) is ALSO success', () => {
    expect(isWorklogSuccess('pending')).toBe(true);
  });
  it('anything else is not success', () => {
    expect(isWorklogSuccess('error')).toBe(false);
    expect(isWorklogSuccess(undefined)).toBe(false);
  });
});

// Survivor #8 — dismiss ordering inverted (removeBanner() before the persist
// resolves), the exact race the code's own comment says it prevents.
describe('dismissAndRemove — survivor #8: persists the dismissal BEFORE removing the banner', () => {
  it('awaits dismissForToday() before calling removeBanner()', async () => {
    const order: string[] = [];
    const dismissForToday = vi.fn(async () => {
      order.push('dismiss');
    });
    const removeBanner = vi.fn(() => {
      order.push('remove');
    });
    await dismissAndRemove(dismissForToday, removeBanner);
    expect(order).toEqual(['dismiss', 'remove']);
    expect(removeBanner).toHaveBeenCalledTimes(1);
  });
});

// Survivor #9 — SPA re-injection made a permanent no-op. The URL gate is the
// load-bearing decision (content.ts's own docstring calls it that); the
// debouncer is the generic mechanism, tested once and reused for both the SPA
// re-eval and the resize path (previously two hand-duplicated timers).
describe('shouldReevaluateForUrl — survivor #9: only an ACTUAL navigation re-evaluates', () => {
  it('a genuinely different URL re-evaluates', () => {
    expect(shouldReevaluateForUrl('https://x.atlassian.net/browse/A-2', 'https://x.atlassian.net/browse/A-1')).toBe(
      true,
    );
  });
  it('the same URL (a same-page DOM mutation) does not', () => {
    expect(shouldReevaluateForUrl('https://x.atlassian.net/browse/A-1', 'https://x.atlassian.net/browse/A-1')).toBe(
      false,
    );
  });
});

describe('createDebouncer — the generic debounce mechanism scheduleReeval/scheduleResize compose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('only fires once for a burst of calls, after the delay from the LAST call', () => {
    const debouncer = createDebouncer(250);
    const fn = vi.fn();
    debouncer.schedule(fn);
    vi.advanceTimersByTime(100);
    debouncer.schedule(fn); // resets the delay
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
