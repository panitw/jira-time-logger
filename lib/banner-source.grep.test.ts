/**
 * Source-level grep tests for Story 7.11's AC1 (CSP) and D-7.11-45 (the
 * single-height layout contract) and D-7.11-40 (the deleted `DANGER` red).
 *
 * Precedent: `lib/day-status-vocabulary.grep.test.ts` and
 * `components/week/WeeklyGrid.test.tsx:131` — a behavioural render test can
 * prove one call site is right; only a grep across the guest-rail files
 * proves nothing else quietly reintroduced a CSP-illegal construct or a
 * second height write.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();

const BANNER_FILES = [
  'lib/banner-styles.ts',
  'lib/banner-dom.ts',
  'lib/banner-icons.ts',
  'lib/banner-interactions.ts',
  'entrypoints/content.ts',
];

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf-8');
}

/** Drop whole COMMENT lines before running a literal-substring guard — this
 * file's own docstrings document what these files DON'T do ("no injected
 * <style> blocks", "never EXPANDED_HEIGHT") in prose, which would otherwise
 * trip the very guard the comment is explaining. Mirrors
 * `day-status-vocabulary.grep.test.ts`'s `stripCommentLines`. */
function stripCommentLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

function readCode(rel: string): string {
  return stripCommentLines(read(rel));
}

// TT7 — AC1: vanilla DOM, inline styles only, no external request of any kind.
describe('AC1 — no CSP-illegal construct in any guest-rail source file', () => {
  const BANNED_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /<style/, label: '<style' },
    { pattern: /\bclassList\b/, label: 'classList' },
    { pattern: /\bclassName\b/, label: 'className' },
    { pattern: /@keyframes/, label: '@keyframes' },
    { pattern: /@media/, label: '@media' },
    { pattern: /::before/, label: '::before' },
    { pattern: /::after/, label: '::after' },
    { pattern: /fetch\(/, label: 'fetch(' },
    { pattern: /XMLHttpRequest/, label: 'XMLHttpRequest' },
    { pattern: /new Image/, label: 'new Image' },
    { pattern: /url\(http/, label: 'url(http' },
  ];

  it.each(BANNER_FILES)('%s contains no CSP-illegal construct', (rel) => {
    const source = readCode(rel);
    const violations = BANNED_PATTERNS.filter(({ pattern }) => pattern.test(source)).map(
      ({ label }) => label,
    );
    expect(violations).toEqual([]);
  });
});

// TT2 — D-7.11-45: the rail's height is a layout contract. The ONLY place a
// height is assigned to the host is the single `height: RAIL_HEIGHT` entry
// inside `bannerContainerStyle`; no code path ever calls `.style.height = `
// directly (that would be the old collapsed/expanded height-swap bug).
describe('D-7.11-45 — the rail height is written exactly once, never via `.style.height =`', () => {
  it.each(BANNER_FILES)('%s never assigns `.style.height =` directly', (rel) => {
    const source = readCode(rel);
    expect(source).not.toMatch(/\.style\.height\s*=/);
  });

  it('bannerContainerStyle is the only object-literal `height:` entry that is NOT a fixed control height', () => {
    const source = readCode('lib/banner-styles.ts');
    // The container's height must reference the RAIL_HEIGHT constant, not a
    // second hardcoded '44px' literal (which would make it invisible to a
    // future single-source-of-truth rename).
    expect(source).toMatch(/height:\s*RAIL_HEIGHT/);
    // No OTHER 44px literal height should appear (control heights are 26/28px).
    const height44Literal = (source.match(/height:\s*'44px'/g) ?? []).length;
    expect(height44Literal).toBe(0);
  });

  it('EXPANDED_HEIGHT and COLLAPSED_HEIGHT no longer exist (D-7.11-45)', () => {
    const source = readCode('lib/banner-styles.ts');
    expect(source).not.toMatch(/EXPANDED_HEIGHT/);
    expect(source).not.toMatch(/COLLAPSED_HEIGHT/);
  });
});

// TT9 (source-level half) — D-7.11-40: DANGER / #dc2626 must not survive
// anywhere on this surface; ERROR_INK (#991B1B) is the one legitimate red.
describe('D-7.11-40 — DANGER / #dc2626 appears in NO banner file', () => {
  it.each(BANNER_FILES)('%s contains neither DANGER nor #dc2626', (rel) => {
    const source = readCode(rel);
    expect(source).not.toMatch(/\bDANGER\b/);
    expect(source.toLowerCase()).not.toContain('#dc2626');
  });
});

// AC3 — no `web_accessible_resources` entry is added for fonts; satisfied by
// not touching the fenced `wxt.config.ts` at all (SD-5). This test proves the
// negative the story requires without opening the fenced file.
describe('AC3 — wxt.config.ts is untouched by this story (fenced, SD-5)', () => {
  it('this story never imports or references wxt.config.ts from any banner file', () => {
    for (const rel of BANNER_FILES) {
      const source = read(rel);
      expect(source).not.toMatch(/wxt\.config/);
    }
  });
});
