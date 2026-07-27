import { describe, it, expect } from 'vitest';
import { resolvePopupState, type PopupStateInput } from './popup-state';

/**
 * Story 7.9, Task 9: every branch of the state-precedence rule, plus every
 * co-occurrence pair named in the story's § State precedence.
 */

const BASE: PopupStateInput = {
  authKind: 'connected',
  isPending: false,
  timeOffSeconds: 0,
  pendingCount: 0,
  failedCount: 0,
};

describe('resolvePopupState — Axis A (body), first match wins', () => {
  it('disconnected outranks everything else', () => {
    const result = resolvePopupState({
      ...BASE,
      authKind: 'disconnected',
      isPending: true,
      timeOffSeconds: 500,
      pendingCount: 3,
      failedCount: 2,
    });
    expect(result.body).toBe('disconnected');
  });

  it('loading via authKind === "loading" (even with isPending false)', () => {
    const result = resolvePopupState({ ...BASE, authKind: 'loading', isPending: false });
    expect(result.body).toBe('loading');
  });

  it('loading via isPending === true (even when authKind is connected)', () => {
    const result = resolvePopupState({ ...BASE, authKind: 'connected', isPending: true });
    expect(result.body).toBe('loading');
  });

  it('loading outranks time-off', () => {
    const result = resolvePopupState({ ...BASE, isPending: true, timeOffSeconds: 28800 });
    expect(result.body).toBe('loading');
  });

  it('time-off when timeOffSeconds > 0 and nothing else outranks it', () => {
    const result = resolvePopupState({ ...BASE, timeOffSeconds: 1 });
    expect(result.body).toBe('time-off');
  });

  it('normal is the fallthrough — connected, resolved, zero time off', () => {
    const result = resolvePopupState(BASE);
    expect(result.body).toBe('normal');
  });

  it('timeOffSeconds === 0 is normal, not time-off (boundary)', () => {
    const result = resolvePopupState({ ...BASE, timeOffSeconds: 0 });
    expect(result.body).toBe('normal');
  });
});

describe('resolvePopupState — Axis B (banners), independent of body, error above offline', () => {
  it('neither banner when both counts are zero', () => {
    const result = resolvePopupState(BASE);
    expect(result.offlineBanner).toBe(false);
    expect(result.errorBanner).toBe(false);
    expect(result.anyBanner).toBe(false);
  });

  it('offlineBanner only, in the normal body', () => {
    const result = resolvePopupState({ ...BASE, pendingCount: 2 });
    expect(result.body).toBe('normal');
    expect(result.offlineBanner).toBe(true);
    expect(result.errorBanner).toBe(false);
    expect(result.anyBanner).toBe(true);
  });

  it('errorBanner only, in the normal body', () => {
    const result = resolvePopupState({ ...BASE, failedCount: 1 });
    expect(result.body).toBe('normal');
    expect(result.errorBanner).toBe(true);
    expect(result.offlineBanner).toBe(false);
    expect(result.anyBanner).toBe(true);
  });

  it('offline + time-off co-occur — banner renders above the time-off body', () => {
    const result = resolvePopupState({ ...BASE, timeOffSeconds: 28800, pendingCount: 1 });
    expect(result.body).toBe('time-off');
    expect(result.offlineBanner).toBe(true);
    expect(result.anyBanner).toBe(true);
  });

  it('error + offline co-occur — both true, error still logically "above" (caller order)', () => {
    const result = resolvePopupState({ ...BASE, pendingCount: 3, failedCount: 1 });
    expect(result.offlineBanner).toBe(true);
    expect(result.errorBanner).toBe(true);
    expect(result.anyBanner).toBe(true);
  });

  it('error + time-off co-occur — banner renders above the time-off body', () => {
    const result = resolvePopupState({ ...BASE, timeOffSeconds: 14400, failedCount: 2 });
    expect(result.body).toBe('time-off');
    expect(result.errorBanner).toBe(true);
    expect(result.anyBanner).toBe(true);
  });

  it('disconnected + both counts nonzero — banners fully suppressed', () => {
    const result = resolvePopupState({
      ...BASE,
      authKind: 'disconnected',
      pendingCount: 5,
      failedCount: 5,
    });
    expect(result.body).toBe('disconnected');
    expect(result.offlineBanner).toBe(false);
    expect(result.errorBanner).toBe(false);
    expect(result.anyBanner).toBe(false);
  });

  it('loading + both counts nonzero — banners fully suppressed', () => {
    const result = resolvePopupState({
      ...BASE,
      isPending: true,
      pendingCount: 5,
      failedCount: 5,
    });
    expect(result.body).toBe('loading');
    expect(result.offlineBanner).toBe(false);
    expect(result.errorBanner).toBe(false);
    expect(result.anyBanner).toBe(false);
  });

  it('all three (offline + error + time-off) co-occur — both banners true, body time-off', () => {
    const result = resolvePopupState({
      ...BASE,
      timeOffSeconds: 3600,
      pendingCount: 2,
      failedCount: 1,
    });
    expect(result.body).toBe('time-off');
    expect(result.offlineBanner).toBe(true);
    expect(result.errorBanner).toBe(true);
    expect(result.anyBanner).toBe(true);
  });
});
