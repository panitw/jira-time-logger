/**
 * Source-level grep guard (Story 7.9, D-7.9-16): `<main>` is the SOLE owner
 * of the −10 px chrome-baseline offset. `<main>` is `overflow-y-auto` with
 * NO top padding (`entrypoints/popup/App.tsx`), so a negative top margin on
 * a CHILD of the scroll region is silently CLIPPED (scrollTop cannot go
 * negative) rather than overhung — exactly the trap D-7.3-3 documents. This
 * recurred THREE times in this story alone (`OfflineBanner.tsx`,
 * `WriteErrorBanner.tsx`, the disconnected card) before D-7.9-16 fixed it,
 * and jsdom cannot see the clipping (no layout engine) — a render test would
 * stay green even with the defect present. This is a static-source check,
 * modelled on `lib/day-status-vocabulary.grep.test.ts`'s technique.
 *
 * Prove RED by re-adding `-mt-[10px]` to any popup component other than
 * `entrypoints/popup/App.tsx` itself.
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

function stripCommentLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

// The popup's own component tree — the only place this offset is relevant.
const SOURCE_DIRS = ['components', 'entrypoints/popup'];
const OWNER = 'entrypoints/popup/App.tsx';

const ALL_SOURCE_FILES = SOURCE_DIRS.flatMap((d) =>
  listFiles(path.join(ROOT, d), ['.ts', '.tsx']),
).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

describe('popup baseline offset — <main> is the sole owner (Story 7.9, D-7.9-16)', () => {
  it('no popup component other than App.tsx (which owns <main>) declares a negative top-margin class', () => {
    const violations: string[] = [];
    for (const file of ALL_SOURCE_FILES) {
      const rel = relPath(file);
      if (rel === OWNER) continue;
      const source = stripCommentLines(readFileSync(file, 'utf-8'));
      // Any Tailwind arbitrary-value negative top margin, not just the
      // literal 10px value — a differently-tuned regression is just as
      // broken (still clipped by `overflow-y-auto`).
      if (/-mt-\[\d+px\]/.test(source)) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });
});
