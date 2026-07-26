/**
 * Shared "is this a text-entry element" predicate (Story 7.5, D-7.5-20).
 *
 * Extracted from `components/today/SearchPanel.tsx`'s own inline check
 * (`isTextEntryElement` + `TEXT_INPUT_EXCLUDED_TYPES`, added for Story 7.4's
 * `/`-focuses-search shortcut). That file's copy is deliberately left
 * BYTE-IDENTICAL — see `SearchPanel.tsx:111-129` — because Story 7.4's `/`
 * handler and this story's `⌘/Ctrl+Z` handler have INVERTED default
 * behaviour (D-7.5-20): `/` defaults to CAPTURE and opts individual fields
 * out via `data-slash-passthrough`, while `⌘Z` defaults to FALL-THROUGH
 * (every text-entry element has a native undo history `⌘Z` must not shadow)
 * and captures only outside text entry.
 *
 * This module exists so the new undo-capture code (`LoggedToday.tsx`) does
 * not duplicate the predicate's logic by hand, without touching the
 * `SearchPanel.tsx` seam this story has no business editing. Do not import
 * this from `SearchPanel.tsx` — the duplication is deliberate, see above.
 */

const TEXT_INPUT_EXCLUDED_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** True for `<textarea>`, `contenteditable`, and `<input>` types where typed
 * text (and therefore a native browser undo history) is a legitimate thing
 * to have — i.e. everything except the button-like/non-text input types.
 *
 * Uses the `contentEditable` STRING property (`'true'` / `'false'` /
 * `'inherit'`), not the boolean `isContentEditable` IDL attribute — jsdom
 * does not implement the latter (it always reads back `undefined`, a real
 * gap in the test environment, not a spec nuance), which would make this
 * predicate untestable under Vitest. `contentEditable` is properly
 * implemented and is what real browsers set when script assigns
 * `el.contentEditable = 'true'`. */
export function isTextEntryElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !TEXT_INPUT_EXCLUDED_TYPES.has(el.type);
  return el instanceof HTMLElement && el.contentEditable === 'true';
}
