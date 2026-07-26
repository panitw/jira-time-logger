/**
 * Open the full-page host shell in a new browser tab (Story 7.2, AC4/AC7).
 *
 * `chrome.tabs.create` needs no new permission and no `web_accessible_resources`
 * entry — an extension may always open its own pages in a tab. WXT compiles
 * `entrypoints/fullpage/index.html` to `fullpage.html` at the extension root
 * (its "unlisted page" convention; the popup/options pages get their manifest
 * entries from `<meta name="manifest.*">` tags in their own HTML, which an
 * unlisted page deliberately omits).
 *
 * One helper so every caller shares a single URL construction, and so it is
 * the only thing that needs a `chrome` mock in tests.
 */
export type FullPageSection = 'week' | 'manager' | 'settings';

export function openFullPage(section: FullPageSection): void {
  const url = chrome.runtime.getURL(`fullpage.html?section=${section}`);
  chrome.tabs.create({ url });
}
