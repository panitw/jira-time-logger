/**
 * Per-ticket dismissal for the resume ("Continue logging") card.
 *
 * The card can be closed with a single click (no confirm — nothing is
 * destroyed; the ticket stays searchable). The dismissal is keyed to the
 * TICKET, not the clock: the card stays hidden for as long as that same key
 * is the resume ticket, and returns the moment the resume ticket resolves to
 * a different one.
 *
 * Deliberately NOT the daily-dismiss shape `lib/storage/banner-dismiss.ts`
 * uses for the inline Jira banner. That surface nags about hours owed, so it
 * SHOULD come back tomorrow; this one is a shortcut to a specific ticket, and
 * a shortcut you have declined stays declined until there is a different
 * shortcut to offer. The consequence is deliberate: dismissing a ticket you
 * keep working on hides the card for that ticket indefinitely, not just for
 * today.
 *
 * A single key rather than a list — only one ticket can be the resume ticket
 * at a time, so a set would grow without ever being read. This also means
 * dismissing B forgets a dismissal of A: if A becomes the resume ticket
 * again later, its card returns. That is the intended reading of "until a
 * different ticket".
 *
 * State lives in `chrome.storage.local` (key `local:resumeDismissedKey`).
 * `lib/disconnect.ts` wipes the whole `local` area on disconnect, so this key
 * is cleared automatically — no extra wiring needed.
 *
 * All helpers are defensive: they never throw. A read failure is treated as
 * "not dismissed" (show the card) and a write failure is swallowed (the card
 * closes in the DOM regardless — worst case it returns on the next open).
 */
import { storage } from 'wxt/utils/storage';
import { log } from '@/lib/log';

export const resumeDismissedKeyItem = storage.defineItem<string | null>(
  'local:resumeDismissedKey',
  { fallback: null },
);

/**
 * The ticket key whose resume card is currently dismissed, or `null` for
 * none. Returns `null` on any read error (mirrors `isDismissedToday`).
 */
export async function getDismissedResumeKey(): Promise<string | null> {
  try {
    const key = await resumeDismissedKeyItem.getValue();
    return typeof key === 'string' && key.length > 0 ? key : null;
  } catch (e) {
    log.warn('resume.dismiss.read-failed', { cause: String(e) });
    return null;
  }
}

/** Record a dismissal for `key`, replacing any previous one. Never throws. */
export async function dismissResumeKey(key: string): Promise<void> {
  try {
    await resumeDismissedKeyItem.setValue(key);
    log.info('resume.dismissed', { key });
  } catch (e) {
    log.warn('resume.dismiss.write-failed', { cause: String(e) });
  }
}
