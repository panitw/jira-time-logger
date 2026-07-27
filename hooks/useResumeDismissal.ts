import { useCallback, useEffect, useState } from 'react';
import { getDismissedResumeKey, dismissResumeKey } from '@/lib/storage/resume-dismiss';

/**
 * Reads (and writes) the resume card's per-ticket dismissal.
 *
 * `dismissedKey` is `undefined` until storage answers — a THIRD state, not a
 * synonym for `null`. The caller needs it: rendering the resolved card while
 * the dismissal is still unknown would pop a card in and then yank it back
 * out a millisecond later, the exact pop-in D-7.3-10 rules out for the
 * skeleton. `entrypoints/popup/App.tsx` holds the card at 'loading' until
 * this resolves. Both reads are `chrome.storage.local` and are issued in the
 * same mount tick as `useResumeTicket`'s, so the wait is single-digit ms.
 *
 * The optimistic local write matters: `dismiss()` must hide the card on the
 * click, not on the storage round-trip, and `resume-dismiss.ts` swallows
 * write failures by design — so the DOM can never be waiting on a promise
 * that resolves to nothing.
 */
export type ResumeDismissal = {
  /** `undefined` = not read yet; `null` = nothing dismissed. */
  dismissedKey: string | null | undefined;
  dismiss: (key: string) => void;
};

export function useResumeDismissal(): ResumeDismissal {
  const [dismissedKey, setDismissedKey] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void getDismissedResumeKey().then((key) => {
      if (active) setDismissedKey(key);
    });
    return () => {
      active = false;
    };
  }, []);

  const dismiss = useCallback((key: string): void => {
    setDismissedKey(key);
    void dismissResumeKey(key);
  }, []);

  return { dismissedKey, dismiss };
}
