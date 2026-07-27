/**
 * Story 7.10, AC3 — "fact blocks render as hairline row tables with NO
 * input affordance at all", and the standing D-7.6-37 rule (deferred to
 * this story) that red fires ONLY for a write Jira actually refused —
 * everywhere else on this surface is amber or error-ink-on-a-destructive-
 * confirm (D-7.10-47), never `state-danger`/`status-error`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const SETTINGS_DIR = path.join(ROOT, 'components', 'settings');

// Finding 12: `SettingsPrimitives.tsx` is the file that actually RENDERS
// every fact row (`FactRow`) for all three fact blocks — the original list
// named only the three fact-block FILES, so an `<input>` added to `FactRow`
// itself (which would break Connection, Reporting-line AND Diagnostics
// simultaneously) was invisible to this guard.
const FACT_BLOCK_FILES = [
  'ConnectionBlock.tsx',
  'ManagerDisplay.tsx',
  'DiagnosticsBlock.tsx',
  'SettingsPrimitives.tsx',
];

// M-9: recurse (readdirSync alone is non-recursive — a future subdirectory
// under components/settings/ would otherwise go unscanned), and this list
// is used by the state-danger guard below.
function listSettingsFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
        out.push(full);
      }
    }
  };
  walk(SETTINGS_DIR);
  return out;
}

// M-9: the original `/<input\b/` family missed `contentEditable`,
// `role="textbox"|"combobox"|"searchbox"`, and capitalised `<Input`/`<Select`
// wrapper components (`components/ui/input.tsx` exports exactly such a
// wrapper) — and was case-sensitive, so `<INPUT` or a differently-cased
// wrapper import would also have passed.
const INPUT_AFFORDANCE_PATTERNS = [
  /<input\b/i,
  /<select\b/i,
  /<textarea\b/i,
  /<Input\b/,
  /<Select\b/,
  /contentEditable/i,
  /role=["']?(textbox|combobox|searchbox)["']?/i,
];

/** Several of this story's own components document the red→amber rework in
 * a comment that quotes the retired class literally (e.g. "never
 * `state-danger`"), which would otherwise trip the very guard the comment
 * explains — same rationale, same technique, as
 * `lib/day-status-vocabulary.grep.test.ts#stripCommentLines`. */
function stripCommentLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

describe('Story 7.10, AC3 — the Connection / Reporting-line / Diagnostics fact blocks carry no input affordance', () => {
  for (const file of FACT_BLOCK_FILES) {
    it(`${file} contains no input affordance (input/select/textarea/contentEditable/textbox-role/<Input>/<Select>)`, () => {
      // Comments are allowed to NAME the banned tags while explaining their
      // absence (e.g. this very file's own docstring says "neither renders
      // an `<input>`...") — only non-comment lines are scanned.
      const source = stripCommentLines(readFileSync(path.join(SETTINGS_DIR, file), 'utf-8'));
      for (const pattern of INPUT_AFFORDANCE_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});

describe('Story 7.10, D-7.6-37/D-7.10-47 — no bare "state-danger"/"status-error" survives in components/settings/', () => {
  it('no file under components/settings/ (recursively) contains state-danger or status-error (all validation reds resolved to amber or error-ink)', () => {
    const violations: string[] = [];
    for (const file of listSettingsFiles()) {
      if (file.endsWith('.test.tsx') || file.endsWith('.test.ts')) continue;
      const source = stripCommentLines(readFileSync(file, 'utf-8'));
      if (/state-danger|status-error/.test(source)) {
        violations.push(path.relative(ROOT, file));
      }
    }
    expect(violations).toEqual([]);
  });
});
