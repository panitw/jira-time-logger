/**
 * Percentage → Tailwind-scannable width-class quantiser (Story 7.8, D-7.8-39
 * / D-7.8-19a).
 *
 * `dc.html:564`'s 3px streaming-progress bar needs a percentage converted to
 * a WIDTH CLASS Tailwind's build-time scanner can see (a runtime-interpolated
 * `w-[${pct}%]` string is invisible to it — the same constraint every other
 * chrome progress bar in the product already works around).
 *
 * Three private copies of this exact table + function already exist
 * (`components/shell/ChromeHeader.tsx`, `components/week/WeekChromeHeader.tsx`,
 * `components/shared/DayStatusIndicator.tsx`). D-7.7-21c assigned extracting a
 * shared helper to Story 7.9 SPECIFICALLY so a fourth uncoordinated copy never
 * appears — but 7.8 lands first and needs its own bar for AC4's streaming
 * line. Per the orchestrator ruling (D-7.8-19a), 7.8 creates this module for
 * ITS OWN bar only and does not touch the three existing copies; Story 7.9's
 * obligation becomes "migrate all four call sites onto this module" rather
 * than "extract a shared helper".
 *
 * Uses the CORRECTED `Math.floor` + non-zero-floor arithmetic (D-7.7-29's
 * fix) — NOT the `Math.round` defect that shipped twice before that fix
 * (`ChromeHeader.tsx`'s original bug, then `WeekChromeHeader.tsx`'s copy of
 * it). `Math.round` maps e.g. 97.6% to `w-full` ("done") and 2.4% to `w-0`
 * ("empty"), misrepresenting both ends. `Math.floor` + a non-zero floor means
 * any genuinely non-zero percentage renders at least `w-[5%]`, and only a
 * true zero renders `w-0`.
 */

// Quantised to 5% steps — Tailwind's build-time scanner cannot see a
// runtime-interpolated `w-[${pct}%]` class string.
const WIDTH_CLASSES = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
] as const;

/**
 * Clamp to [0, 100], floor to the nearest 5% step, with a non-zero floor: any
 * percentage `> 0` renders at least `w-[5%]` (never reads as visually empty),
 * and only a true `<= 0` renders `w-0`. Only a percentage that itself floors
 * to 100 renders `w-full`.
 */
export function pctToWidthClass(pct: number): string {
  // Finding 14 (Minor): `NaN` skips the `<= 0` zero gate (`NaN <= 0` is
  // false) and every downstream arithmetic step propagates `NaN`, so
  // `WIDTH_CLASSES[NaN]` is `undefined` and the `?? 'w-full'` fallback
  // resolved an UNKNOWN percentage to "everything is done" — exactly the
  // wrong direction for a silent-correctness surface. Guard explicitly.
  if (!Number.isFinite(pct)) return 'w-0';
  const clamped = Math.min(100, Math.max(0, pct));
  if (clamped <= 0) return 'w-0';
  const index = Math.max(1, Math.floor(clamped / 5));
  return WIDTH_CLASSES[index] ?? 'w-full';
}
