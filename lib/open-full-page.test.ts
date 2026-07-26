import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openFullPage } from './open-full-page';

describe('openFullPage', () => {
  beforeEach(() => {
    // @ts-expect-error minimal chrome stub for getURL/tabs.create
    globalThis.chrome = { runtime: { getURL: vi.fn((path: string) => `chrome-extension://abc/${path}`) }, tabs: { create: vi.fn() } };
  });

  it('builds the fullpage.html URL for the week section and opens it once', () => {
    openFullPage('week');
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('fullpage.html?section=week');
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://abc/fullpage.html?section=week',
    });
  });

  it('builds the URL for the manager section', () => {
    openFullPage('manager');
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('fullpage.html?section=manager');
  });

  it('builds the URL for the settings section', () => {
    openFullPage('settings');
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('fullpage.html?section=settings');
  });
});
