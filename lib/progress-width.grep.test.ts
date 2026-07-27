/**
 * Source-level grep guard (Story 7.9, Task 8 / Obligation 1): no file other
 * than `lib/progress-width.ts` may declare a `w-[N%]` width-class table or a
 * local `pctToWidthClass` function. Modelled on
 * `lib/day-status-vocabulary.grep.test.ts`'s own technique.
 *
 * This is where the `Math.round` quantisation defect
 * (`ChromeHeader.tsx`'s original, then `WeekChromeHeader.tsx`'s copy of it)
 * dies for good — without this guard, a fifth uncoordinated copy could
 * reappear (with the same latent bug) and nothing would fail.
 *
 * Review Finding 8 / D-7.9-18(c): the ORIGINAL version of this guard was
 * porous along five mutation axes — a hard-coded single-quote regex missed
 * double-quoted and backtick-quoted copies, a `Tailwind fraction` table
 * (`w-1/4`/`w-1/2`/`w-3/4`) went entirely undetected, an arrow-function
 * declaration (`const pctToWidthClass = (pct) => …`) slipped past a
 * `function\s+pctToWidthClass` regex, and every `.test.ts(x)` file was
 * unconditionally excluded — so a full table+function pasted into a test
 * file was invisible. Hardened here to `lib/no-monospace.grep.test.ts`'s
 * standard: every `w-[N%]` literal outside the owner is either a PINNED,
 * exact-count test assertion (a stale entry — a count that no longer
 * matches — fails the build) or a violation; every `.ts(x)` file (including
 * tests) is scanned; the function-declaration check accepts `function`,
 * `const`/`let`/`var`, and object-literal-method-shorthand forms; and a
 * SEPARATE check bans the Tailwind-fraction quantiser shape outright (zero
 * legitimate uses exist anywhere in this codebase today).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();

const SKIP_DIRS = new Set(['node_modules', '.git', '.wxt', 'dist', 'output', '.output', 'coverage']);

function listFiles(dir: string, extensions: string[], out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      listFiles(full, extensions, out);
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function relPath(f: string): string {
  return path.relative(ROOT, f).replace(/\\/g, '/');
}

const SOURCE_DIRS = ['components', 'lib', 'entrypoints', 'hooks'];
const OWNER = 'lib/progress-width.ts';
// This guard file itself is self-referentially excluded: its OWN detection
// regexes legitimately contain the strings `w-[`, `w-1/4`-style fractions,
// and `pctToWidthClass` as pattern SOURCE, not as a width table — the same
// reason `lib/no-monospace.grep.test.ts` never scans itself.
const SELF = 'lib/progress-width.grep.test.ts';

// Finding 8: scan EVERY file, including `.test.ts(x)` — a fifth copy hiding
// inside a test file is exactly the mutation axis that survived before.
const ALL_FILES = SOURCE_DIRS.flatMap((d) => listFiles(path.join(ROOT, d), ['.ts', '.tsx']));

/**
 * D-7.9-18(c): pinned to an EXACT count, mirroring
 * `lib/no-monospace.grep.test.ts`'s `ALLOWLIST`. Every entry here is a
 * legitimate TEST ASSERTION string (`expect(...).toBe('w-[95%]')`), never a
 * table — when one of these files' assertion strings changes, this count
 * MUST change in the SAME diff, or the guard fails. That is what makes the
 * allowlist unable to go stale (closing the class of defect Finding 9 found
 * in the sibling `day-status-vocabulary` guard).
 */
const WIDTH_LITERAL_ALLOWLIST: Record<string, number> = {
  'components/shell/ChromeHeader.test.tsx': 4,
  'components/shared/DayStatusIndicator.test.tsx': 2,
  'lib/progress-width.test.ts': 5,
};

const CALL_SITES = [
  'components/shell/ChromeHeader.tsx',
  'components/week/WeekChromeHeader.tsx',
  'components/shared/DayStatusIndicator.tsx',
  // Finding 24(b): the fourth consumer, previously absent from this list.
  'components/manager/ManagerMatrix.tsx',
];

describe('progress-width — exactly one owner (Story 7.9, Obligation 1 / D-7.9-18c)', () => {
  it('every w-[N%] literal is either the owner\'s table or a pinned test assertion, at its exact count', () => {
    const violations: string[] = [];
    const seen = new Set<string>();
    for (const file of ALL_FILES) {
      const rel = relPath(file);
      if (rel === OWNER || rel === SELF) continue;
      const source = readFileSync(file, 'utf-8');
      // Quote-agnostic (Finding 8 axis 1/2: the original regex hard-coded
      // the single quote, missing double- and backtick-quoted copies).
      const matches = source.match(/['"`]w-\[\d+%\]['"`]/g) ?? [];
      const pinned = WIDTH_LITERAL_ALLOWLIST[rel];
      if (pinned !== undefined) {
        seen.add(rel);
        if (matches.length !== pinned) {
          violations.push(
            `${rel}: expected exactly ${pinned} pinned w-[N%] literal(s), found ${matches.length} — update WIDTH_LITERAL_ALLOWLIST in the SAME change that touches this file`,
          );
        }
        continue;
      }
      if (matches.length > 0) {
        violations.push(
          `${rel}: ${matches.length} unowned w-[N%] literal(s) — a copy of the quantised width table, or add to WIDTH_LITERAL_ALLOWLIST if this is a genuine pinned test assertion`,
        );
      }
    }
    // A stale allowlist entry (file no longer contains any, or was
    // renamed/deleted) is caught here too, rather than silently passing.
    for (const rel of Object.keys(WIDTH_LITERAL_ALLOWLIST)) {
      if (!seen.has(rel)) {
        violations.push(`${rel}: allowlisted but not found under ${SOURCE_DIRS.join('/')} — remove this stale entry`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file other than lib/progress-width.ts declares a Tailwind width-fraction quantiser table (w-1/4 etc.)', () => {
    // Finding 8 axis 3: a coarser quantiser built on Tailwind's built-in
    // fraction utilities (`w-1/4`, `w-1/2`, `w-3/4`, …) went entirely
    // undetected by the `w-[N%]` arbitrary-value regex above. Zero
    // legitimate uses of these fraction classes exist anywhere in the
    // codebase today (verified by full-tree grep), so a strict "2 or more
    // in one file" threshold is safe from false positives.
    const violations: string[] = [];
    for (const file of ALL_FILES) {
      const rel = relPath(file);
      if (rel === OWNER || rel === SELF) continue;
      const source = readFileSync(file, 'utf-8');
      const matches = source.match(/['"`]w-(?:1\/4|1\/3|1\/2|2\/3|3\/4)['"`]/g) ?? [];
      if (matches.length >= 2) violations.push(`${rel}: ${matches.length} width-fraction literal(s)`);
    }
    expect(violations).toEqual([]);
  });

  it('no file other than lib/progress-width.ts declares pctToWidthClass (function, const/arrow, or object-method form)', () => {
    // Finding 8 axis 4: `const pctToWidthClass = (pct) => …` (an arrow
    // function, no table at all) slipped past the original
    // `function\s+pctToWidthClass` regex. This also covers the
    // object-literal-method-shorthand form (`{ pctToWidthClass(pct) { … } }`)
    // without matching a plain CALL (`pctToWidthClass(pct)`) or the import
    // line (`import { pctToWidthClass } from …`).
    const DECL =
      /(?:function\s+pctToWidthClass\s*\(|(?:const|let|var)\s+pctToWidthClass\s*[:=]|\bpctToWidthClass\s*\([^)]*\)\s*\{)/;
    const violations: string[] = [];
    for (const file of ALL_FILES) {
      const rel = relPath(file);
      if (rel === OWNER || rel === SELF) continue;
      const source = readFileSync(file, 'utf-8');
      if (DECL.test(source)) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });

  it('the four migrated call sites import pctToWidthClass from lib/progress-width (not a local declaration)', () => {
    for (const rel of CALL_SITES) {
      const source = readFileSync(path.join(ROOT, rel), 'utf-8');
      expect(source).toMatch(/import\s*\{\s*pctToWidthClass\s*\}\s*from\s*['"]@\/lib\/progress-width['"]/);
    }
  });
});
