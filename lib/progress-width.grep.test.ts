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

const ALL_SOURCE_FILES = SOURCE_DIRS.flatMap((d) => listFiles(path.join(ROOT, d), ['.ts', '.tsx'])).filter(
  (f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'),
);

describe('progress-width — exactly one owner (Story 7.9, Obligation 1)', () => {
  it('no file other than lib/progress-width.ts declares a w-[N%] width-class table', () => {
    const violations: string[] = [];
    for (const file of ALL_SOURCE_FILES) {
      const rel = relPath(file);
      if (rel === OWNER) continue;
      const source = readFileSync(file, 'utf-8');
      // The width-class table is a literal array containing at least two
      // `w-[N%]` arbitrary-value strings — the fingerprint of a copy of the
      // quantised table, not an incidental single Tailwind class.
      const matches = source.match(/'w-\[\d+%\]'/g) ?? [];
      if (matches.length >= 2) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });

  it('no file other than lib/progress-width.ts declares a local pctToWidthClass function', () => {
    const violations: string[] = [];
    for (const file of ALL_SOURCE_FILES) {
      const rel = relPath(file);
      if (rel === OWNER) continue;
      const source = readFileSync(file, 'utf-8');
      if (/function\s+pctToWidthClass\s*\(/.test(source)) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });

  it('the three migrated call sites import pctToWidthClass from lib/progress-width (not a local declaration)', () => {
    const CALL_SITES = [
      'components/shell/ChromeHeader.tsx',
      'components/week/WeekChromeHeader.tsx',
      'components/shared/DayStatusIndicator.tsx',
    ];
    for (const rel of CALL_SITES) {
      const source = readFileSync(path.join(ROOT, rel), 'utf-8');
      expect(source).toMatch(/import\s*\{\s*pctToWidthClass\s*\}\s*from\s*['"]@\/lib\/progress-width['"]/);
    }
  });
});
