import { useEffect } from 'react';
import { openFullPage } from '@/lib/open-full-page';

/**
 * Options-page entrypoint (Story 7.10, D-7.10-39): REDIRECTS to the full
 * page's Settings section — it is not removed.
 *
 * Three reasons, each verified at this story's baseline:
 *   1. `wxt.config.ts:25` (a FENCED Epic 6.3 file, SD-5) derives
 *      `options_ui` from this directory's existence — deleting it changes
 *      the built manifest.
 *   2. Eight in-product call sites depend on `chrome.runtime.
 *      openOptionsPage()` (four on the time-off write path, D-7.3-12) —
 *      redirecting means editing none of them.
 *   3. Chrome's own "Extension options" item in chrome://extensions must
 *      still land somewhere.
 *
 * `resolveConnectedMeta`/`fetchOAuthConnectedMeta` MOVED to
 * `lib/connection-meta.ts` — they do not die, the Connection block still
 * needs them. This file carries no fetch logic of its own.
 *
 * `openFullPage` opens the full page in a new tab (its existing contract,
 * built in Story 7.2 — reused here rather than hand-rolled), then this tab
 * closes itself. `window.close()` is a no-op on a tab Chrome opened
 * directly (e.g. via chrome://extensions, not window.open) rather than an
 * error — the visible text below is what a user sees in that case, so the
 * redirect stays honest either way: a brief line, never a spinner
 * (epics.md's standing "no spinner anywhere" rule).
 */

const STRINGS = {
  redirecting: 'Opening Settings on the full page…',
};

export function App(): React.ReactElement {
  useEffect(() => {
    openFullPage('settings');
    window.close();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <p className="text-body text-muted">{STRINGS.redirecting}</p>
    </div>
  );
}
