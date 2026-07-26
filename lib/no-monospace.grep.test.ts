/**
 * Source-level grep test for the standing Epic 7 constraint (`epics.md`):
 * KKP has no monospace face — every number/key uses the `tabular` utility
 * (Kanit + `font-variant-numeric: tabular-nums`), never `font-mono`.
 *
 * Added by the Story 7.7 finisher pass per D-7.7-21f: a prior finisher claim
 * that `font-mono` was "gone everywhere" was FALSE (the file it touched was
 * clean, but 11 other occurrences remained across the product) — this test
 * makes that claim mechanically checkable instead of relying on memory.
 *
 * Precedent for this technique: `lib/day-status-vocabulary.grep.test.ts`.
 *
 * SCOPING NOTE (why this is not a strict zero-occurrence check): at the time
 * this test was added, `font-mono` still has legitimate, not-yet-fixed
 * occurrences owned by stories that have not shipped (D-7.7-21f's
 * partition). A strict "zero anywhere" check would fail TODAY, for no fault
 * of any change in this diff — that is not what this guard is for. Instead:
 *   - Every occurrence OUTSIDE the allowlist below is a REGRESSION and fails
 *     immediately (this is what actually catches a new violation).
 *   - Every occurrence INSIDE the allowlist is pinned to an EXACT count, not
 *     "at most" — so the owning story, when it fixes its `font-mono`
 *     occurrence(s), MUST also shrink or remove that allowlist entry, or
 *     this test goes red. That is the forcing function: it is not possible
 *     to silently leave a stale allowlist entry once the code no longer
 *     matches it.
 *   - Before `epic-7` is marked done, this file's `ALLOWLIST` must be empty
 *     (D-7.7-21f).
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

// D-7.7-21f's own scope: "over components/ lib/ entrypoints/".
const SOURCE_DIRS = ['components', 'lib', 'entrypoints'];
const ALL_SOURCE_FILES = SOURCE_DIRS.flatMap((d) =>
  listFiles(path.join(ROOT, d), ['.ts', '.tsx']),
).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

/**
 * D-7.7-21f's partition of the 9 remaining occurrences with a named owner.
 * Each entry is the EXACT count today — not a ceiling. When the owning
 * story fixes its occurrence(s), update (or delete) that entry in the SAME
 * change, matching the file's actual new count.
 */
const ALLOWLIST: Record<string, { count: number; owner: string }> = {
  'components/settings/DiagnosticsBlock.tsx': { count: 2, owner: 'Story 7.10' },
  'components/settings/ManagerDisplay.tsx': { count: 2, owner: 'Story 7.10' },
  'components/settings/CatchAllProjectField.tsx': { count: 1, owner: 'Story 7.10' },
  'entrypoints/options/App.tsx': { count: 1, owner: 'Story 7.10' },
};

describe('Epic 7 standing constraint — no monospace (font-mono) outside the named, owned allowlist', () => {
  it('every font-mono occurrence is either inside the allowlist at its exact pinned count, or absent', () => {
    const violations: string[] = [];
    const seen = new Set<string>();
    for (const file of ALL_SOURCE_FILES) {
      const rel = relPath(file);
      const source = readFileSync(file, 'utf-8');
      const matches = source.match(/font-mono/g) ?? [];
      const allowed = ALLOWLIST[rel];
      if (allowed) {
        seen.add(rel);
        if (matches.length !== allowed.count) {
          violations.push(
            `${rel}: expected exactly ${allowed.count} (${allowed.owner}'s pinned allowlist count), found ${matches.length} — update ALLOWLIST in this test as part of the SAME change that touches this file`,
          );
        }
        continue;
      }
      if (matches.length > 0) {
        violations.push(`${rel}: ${matches.length} unowned font-mono occurrence(s) — not on the allowlist`);
      }
    }
    // A stale allowlist entry (file no longer contains font-mono at all, or
    // was renamed/deleted) is caught here too, rather than silently passing.
    for (const rel of Object.keys(ALLOWLIST)) {
      if (!seen.has(rel)) {
        violations.push(`${rel}: allowlisted but the file was not found under ${SOURCE_DIRS.join('/')} — remove this stale entry`);
      }
    }
    expect(violations).toEqual([]);
  });
});
