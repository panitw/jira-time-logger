/**
 * Source-level grep tests for Story 7.6's AC1 / AC3 / AC6 — "the AC most
 * likely to be faked" per the story's own Dev Notes. A behavioural render
 * test can prove one call site is right; only a grep across the whole tree
 * proves nothing ELSE quietly re-hardcoded an icon, a colour, or "PTO".
 *
 * Precedent for a source-level grep test in this codebase:
 * `components/week/WeeklyGrid.test.tsx:131` (the `TicketPicker` `unbounded`
 * check). This file generalises the technique across the whole tree instead
 * of one component, because AC1/AC3/AC6 are inherently cross-cutting.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.wxt',
  'dist',
  'output',
  '.output',
  'coverage',
]);

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

/** Drop whole COMMENT lines (a trimmed line starting `//`, `*`, or `/*`)
 * before running a literal-substring guard — several of this file's checks
 * ban a class name / verdict word as a CODE token, and this codebase's own
 * convention is to document those bans in a comment that quotes the exact
 * banned string (e.g. `// D-7.6-12: never "below target"`), which would
 * otherwise trip the very guard the comment is explaining. Deliberately
 * line-based rather than a full comment-stripper: it never touches a
 * same-line string VALUE (e.g. `tokenLinkUrl: 'https://…'`), since that line
 * does not trim-start with a comment marker. */
function stripCommentLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

/** Every non-test TS/TSX source file under the directories a day status
 * could plausibly reach. `styles/` is included separately for the colour
 * checks (CSS can't import an icon, so it's excluded from the icon check). */
const SOURCE_DIRS = ['components', 'lib', 'entrypoints', 'hooks'];
const ALL_SOURCE_FILES = SOURCE_DIRS.flatMap((d) =>
  listFiles(path.join(ROOT, d), ['.ts', '.tsx']),
).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

const CSS_FILES = listFiles(path.join(ROOT, 'styles'), ['.css']);

const INDICATOR_FILE = 'components/shared/DayStatusIndicator.tsx';

// ---------------------------------------------------------------------------
// AC1 — the red "below target" treatment is removed entirely
// ---------------------------------------------------------------------------

describe('AC1 — the time-related "below target" red is gone from the three unified renderers', () => {
  // `bg-state-danger-subtle` was EXCLUSIVELY the old day-status background
  // tint (below-target cells / matrix gap cells) — it has no other, still-
  // legitimate use anywhere in the product, so a strict zero-occurrence
  // check is safe.
  const targets = [
    'components/week/WeeklyGrid.tsx',
    'components/week/DayCell.tsx',
    'components/manager/ManagerMatrix.tsx',
  ];
  for (const rel of targets) {
    it(`${rel} contains zero occurrences of the old day-status tint "bg-state-danger-subtle"`, () => {
      const source = readFileSync(path.join(ROOT, rel), 'utf-8');
      expect(source).not.toMatch(/bg-state-danger-subtle/);
    });
  }

  // `text-state-danger` alone is NOT exclusively a day-status colour — the
  // Dev Notes name two documented, legitimate survivors that are NOT
  // time-related: WeeklyGrid's row-remove destructive-action confirm, and
  // DayCell's write-failure error chip (AC4 — a write Jira actually
  // refused). ManagerMatrix has no such survivor, so it stays a strict zero.
  it('ManagerMatrix.tsx contains zero occurrences of "state-danger" at all (no legitimate survivor there)', () => {
    const source = readFileSync(
      path.join(ROOT, 'components/manager/ManagerMatrix.tsx'),
      'utf-8',
    );
    expect(source).not.toMatch(/state-danger/);
  });

  it('WeeklyGrid.tsx and DayCell.tsx keep exactly their documented non-time-related survivors, nothing more', () => {
    const weeklyGrid = readFileSync(
      path.join(ROOT, 'components/week/WeeklyGrid.tsx'),
      'utf-8',
    );
    const dayCell = readFileSync(path.join(ROOT, 'components/week/DayCell.tsx'), 'utf-8');

    // WeeklyGrid: only the destructive-action Remove-confirm button.
    const weeklyGridMatches = weeklyGrid.match(/state-danger/g) ?? [];
    expect(weeklyGridMatches.length).toBe(1);
    expect(weeklyGrid).toMatch(/className="text-state-danger"\s*\n\s*onClick=\{\(\) => removeMutation\.mutate\(\)\}/);

    // DayCell: only the write-failure (post/put/delete refused) error chip.
    const dayCellMatches = dayCell.match(/state-danger/g) ?? [];
    expect(dayCellMatches.length).toBe(1);
    expect(dayCell).toMatch(/chip\?\.kind === 'error'/);
  });
});

// ---------------------------------------------------------------------------
// AC3 — one shared component; no surface hard-codes anything
// ---------------------------------------------------------------------------

describe('AC3 — no surface hard-codes a day-status icon (source-level grep)', () => {
  // Complete against DESIGN.md's icons: block — all 8 StatusKind entries
  // (`STATUS_ICON` in DayStatusIndicator.tsx), not just the 5 DayStatus ones.
  // D-7.6-43 / Finding 3(a): `Circle`/`LoaderCircle`/`CircleX` were absent,
  // so a hard-coded `Circle` (the `attention` glyph) passed undetected —
  // proven by mutation B (GREEN when it should have reddened).
  const BANNED_ICONS = [
    'CircleCheck',
    'ChartPie',
    'Circle',
    'Diamond',
    'Minus',
    'EyeOff',
    'LoaderCircle',
    'CircleX',
  ];

  // `LoaderCircle` is the one banned icon with a genuine pre-existing
  // exception: `SearchPanel.tsx`'s in-flight search spinner (D-7.4-25,
  // explicitly protected by this story's own Task 8 — "do not remove it").
  // AC5's actual rule is "never used AS A DAY STATUS", not "never imported
  // anywhere" — `SearchPanel.tsx` never renders it through
  // `DayStatusIndicator`, so it is a different icon USE, not a hard-code of
  // the vocabulary.
  const ICON_ALLOWLIST: Partial<Record<string, string[]>> = {
    LoaderCircle: ['components/today/SearchPanel.tsx'],
  };

  it('no file other than DayStatusIndicator.tsx imports a day-status icon from lucide-react', () => {
    const violations: string[] = [];
    for (const file of ALL_SOURCE_FILES) {
      const rel = relPath(file);
      if (rel === INDICATOR_FILE) continue;
      const source = readFileSync(file, 'utf-8');
      // D-7.6-43 / Finding 3: `matchAll`, not `match` — a SECOND
      // `from 'lucide-react'` import statement further down the file used
      // to be invisible to this guard (only the first was scanned).
      const importMatches = source.matchAll(
        /import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g,
      );
      for (const importMatch of importMatches) {
        const names = importMatch[1]!.split(',').map((s) => s.trim().split(/\s+as\s+/)[0]);
        for (const icon of BANNED_ICONS) {
          if (!names.includes(icon)) continue;
          if (ICON_ALLOWLIST[icon]?.includes(rel)) continue;
          violations.push(`${rel}: ${icon}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('AC3 — no surface hard-codes a day-status colour token (source-level grep)', () => {
  // `text-status-clean` and `text-legacy-purple` are wholly NEW tokens this
  // story introduces for the day-status vocabulary — zero pre-existing usage
  // anywhere, so a strict "nowhere but the indicator" check is safe.
  it('no file other than DayStatusIndicator.tsx / globals.css contains text-status-clean or text-legacy-purple', () => {
    const allowlist = new Set([INDICATOR_FILE, 'styles/globals.css']);
    const violations: string[] = [];
    for (const file of [...ALL_SOURCE_FILES, ...CSS_FILES]) {
      const rel = relPath(file);
      if (allowlist.has(rel)) continue;
      const source = stripCommentLines(readFileSync(file, 'utf-8'));
      if (source.includes('text-status-clean')) violations.push(`${rel}: text-status-clean`);
      if (source.includes('text-legacy-purple')) violations.push(`${rel}: text-legacy-purple`);
    }
    expect(violations).toEqual([]);
  });

  // `bg-amber-soft` and `bg-weekend` are ALSO day-status-exclusive — grep-
  // confirmed zero legitimate use anywhere but their one owner
  // (`DayStatusIndicator.tsx`'s `STATUS_TINT_CLASS` for the former,
  // `DayCell.tsx`'s `isWeekend(dayISO)` tint for the latter, D-7.6-45/46).
  // D-7.6-43 / Finding 3(b): the colour guard above only checked `text-*`
  // literals, so mutation A's hard-coded `bg-amber-soft` tint map passed
  // undetected — this closes that specific gap. (`bg-primary-soft` and
  // `bg-state-success-subtle` are deliberately NOT added here: both have
  // real, legitimate non-day-status usage elsewhere — `bg-primary-soft` in
  // several `today/` surfaces, `bg-state-success-subtle` in
  // `ManagerMatrix.tsx`'s own `CellStatus` axis, D-7.6-4 — so a blanket ban
  // on those two would be false at baseline, the same reasoning that scopes
  // `text-amber-ink` below rather than banning it outright.)
  it('no file other than DayStatusIndicator.tsx / DayCell.tsx / globals.css contains bg-amber-soft', () => {
    const allowlist = new Set([
      INDICATOR_FILE,
      'components/week/DayCell.tsx',
      'styles/globals.css',
    ]);
    const violations: string[] = [];
    for (const file of [...ALL_SOURCE_FILES, ...CSS_FILES]) {
      const rel = relPath(file);
      if (allowlist.has(rel)) continue;
      const source = stripCommentLines(readFileSync(file, 'utf-8'));
      if (source.includes('bg-amber-soft')) violations.push(`${rel}: bg-amber-soft`);
    }
    expect(violations).toEqual([]);
  });

  // Story 7.7, D-7.7-31: the weekend tint is now applied at THREE levels —
  // `DayCell.tsx`'s body `<td>` (pre-existing), plus `WeeklyGrid.tsx`'s
  // `<th scope="col">` day header AND its totals `<td>` (new) — "one
  // recessive object" across the whole column. This is the SAME sanctioned
  // mechanism (the literal `bg-weekend` class, gated by the SAME exported
  // `isWeekend(iso)` predicate) reaching a second legitimate call site, not
  // an undisclosed second implementation — so the allowlist widens rather
  // than the check being removed.
  it('no file other than DayStatusIndicator.tsx / DayCell.tsx / WeeklyGrid.tsx / globals.css contains bg-weekend', () => {
    const allowlist = new Set([
      INDICATOR_FILE,
      'components/week/DayCell.tsx',
      'components/week/WeeklyGrid.tsx',
      'styles/globals.css',
    ]);
    const violations: string[] = [];
    for (const file of [...ALL_SOURCE_FILES, ...CSS_FILES]) {
      const rel = relPath(file);
      if (allowlist.has(rel)) continue;
      const source = stripCommentLines(readFileSync(file, 'utf-8'));
      if (source.includes('bg-weekend')) violations.push(`${rel}: bg-weekend`);
    }
    expect(violations).toEqual([]);
  });

  // `text-amber-ink` is DIFFERENT: it already had legitimate, pre-existing
  // usage before this story (Story 7.3/D-7.3-16's "unparseable input is
  // amber, not red" convention, in `ResumeCard.tsx` and `SearchPanel.tsx`,
  // which ALSO carries D-7.4-11's non-subtask warning), and this story
  // deliberately EXTENDS the validation convention to
  // `QuickLogForm.tsx`/`DayCell.tsx`/`LoggedToday.tsx` (D-7.6-37/44) — a
  // validation colour, not a day-status hard-code. A blanket "only the
  // indicator" ban would be false at baseline. This test instead proves the
  // token hasn't spread beyond the known, reasoned allowlist of FILES.
  it('text-amber-ink is confined to DayStatusIndicator.tsx and the established validation/warning convention (D-7.3-16/D-7.4-11)', () => {
    const allowlist = new Set([
      INDICATOR_FILE,
      'styles/globals.css',
      'components/today/ResumeCard.tsx',
      'components/today/SearchPanel.tsx',
      'components/today/QuickLogForm.tsx',
      'components/week/DayCell.tsx',
      'components/today/LoggedToday.tsx',
    ]);
    const violations: string[] = [];
    for (const file of [...ALL_SOURCE_FILES, ...CSS_FILES]) {
      const rel = relPath(file);
      if (allowlist.has(rel)) continue;
      const source = stripCommentLines(readFileSync(file, 'utf-8'));
      if (source.includes('text-amber-ink')) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });

  // D-7.6-43 / Finding 3(c): allowlisting a whole FILE for `text-amber-ink`
  // turned a validation carve-out into a day-status carve-out on a
  // day-status surface — proven by mutation C (a hard-coded
  // `{ attention: 'text-amber-ink' }` map inside allowlisted `DayCell.tsx`
  // passed undetected). This is the narrower, per-OCCURRENCE guard the
  // file-level allowlist above cannot give: `text-amber-ink` may appear as a
  // plain JSX className string (`className="... text-amber-ink"`, an `=`
  // before the quote) anywhere in the allowlisted files, but never as an
  // OBJECT-LITERAL PROPERTY VALUE (`key: 'text-amber-ink'`, a `:` before the
  // quote) anywhere but the indicator — that shape IS a status→colour map,
  // regardless of which file it's hidden in.
  it('text-amber-ink never appears as an object-literal property value (a hidden status-colour map) outside DayStatusIndicator.tsx', () => {
    const mapValuePattern = /[\w'"-]+\s*:\s*(['"`])(?:(?!\1).)*text-amber-ink(?:(?!\1).)*\1/;
    const violations: string[] = [];
    for (const file of ALL_SOURCE_FILES) {
      const rel = relPath(file);
      if (rel === INDICATOR_FILE) continue;
      const source = stripCommentLines(readFileSync(file, 'utf-8'));
      if (mapValuePattern.test(source)) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });

  // Story 7.7, D-7.7-16 / Finding 2: `STATUS_BAR_CLASS` is a SECOND,
  // independent status->colour axis (the totals-row/chrome-adjacent
  // progress-bar fill) that shipped with ZERO grep coverage — the review's
  // mutation table found `bg-time-off-bar`, `bg-weekend-bar`,
  // `bg-royal-purple` and `bg-status-dirty`, written as literals in
  // `WeeklyGrid.tsx`, and a hard-coded status->bar-colour object map in
  // `DayCell.tsx`, all passed undetected. Grep-confirmed (see the finisher's
  // commit) that all five `StatusKind` bar-colour values are exclusive to
  // this one file (plus their own tests) — no legitimate non-day-status use
  // anywhere else — so, exactly like `text-status-clean`/`text-legacy-purple`
  // above, a strict "nowhere but the indicator" check is safe and catches
  // BOTH a bare literal and an object-map value in one pass (the check does
  // not care about surrounding syntax, only presence).
  it('no file other than DayStatusIndicator.tsx / globals.css contains a STATUS_BAR_CLASS token', () => {
    const allowlist = new Set([INDICATOR_FILE, 'styles/globals.css']);
    const BAR_TOKENS = [
      'bg-status-clean',
      'bg-royal-purple',
      'bg-status-dirty',
      'bg-time-off-bar',
      'bg-weekend-bar',
    ];
    const violations: string[] = [];
    for (const file of [...ALL_SOURCE_FILES, ...CSS_FILES]) {
      const rel = relPath(file);
      if (allowlist.has(rel)) continue;
      const source = stripCommentLines(readFileSync(file, 'utf-8'));
      for (const tok of BAR_TOKENS) {
        if (source.includes(tok)) violations.push(`${rel}: ${tok}`);
      }
    }
    expect(violations).toEqual([]);
  });

  // Story 7.7, D-7.7-31 / Finding 3: `bg-weekend` gained a second legitimate
  // call site (`WeeklyGrid.tsx`, header + totals) via a FILE-level allowlist
  // widening above, but D-7.6-43's own precedent (the `text-amber-ink` guard
  // just above) is that a file-level allowlist alone is not enough on a
  // day-status surface — it needs the narrower, per-OCCURRENCE companion
  // that still permits the class as a plain `className=` string but never as
  // an OBJECT-LITERAL PROPERTY VALUE (a hidden status->tint map). Mutation-
  // proved: `{ weekend: 'bg-weekend', partial: 'bg-weekend' }` dropped into
  // the newly-allowlisted `WeeklyGrid.tsx` passed undetected before this
  // test existed; the three legitimate `isWeekend(iso) ? 'bg-weekend' : ''`
  // ternaries in `WeeklyGrid.tsx`/`DayCell.tsx` do NOT match this pattern
  // (the class name sits in the ternary's TRUTHY branch, before the colon,
  // never immediately after one), so this guard adds no false positive.
  it('bg-weekend never appears as an object-literal property value (a hidden status-tint map) outside DayStatusIndicator.tsx', () => {
    const mapValuePattern = /[\w'"-]+\s*:\s*(['"`])(?:(?!\1).)*bg-weekend(?:(?!\1).)*\1/;
    const violations: string[] = [];
    for (const file of ALL_SOURCE_FILES) {
      const rel = relPath(file);
      if (rel === INDICATOR_FILE) continue;
      const source = stripCommentLines(readFileSync(file, 'utf-8'));
      if (mapValuePattern.test(source)) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });
});

describe('AC1/AC2 — the verdict words "below target" / "incomplete" never re-enter a STRINGS object at any surface (source-level grep)', () => {
  // D-7.6-43 / Finding 3(d): the existing ban (`lib/day-status.test.ts`)
  // only scoped `dayStatusNote`'s OUTPUT — re-adding
  // `belowTarget: 'below target'` to a surface's own `STRINGS` (mutation E,
  // proven GREEN) went undetected because nothing checked surface copy at
  // all. Reuses the AC6 `extractStringsBlock` brace-balancer defined below
  // (a hoisted `function` declaration, so the forward reference is safe).
  it('no STRINGS object anywhere contains "below target" or "incomplete"', () => {
    const violations: string[] = [];
    for (const file of ALL_SOURCE_FILES) {
      const rel = relPath(file);
      const source = stripCommentLines(readFileSync(file, 'utf-8'));
      const block = extractStringsBlock(source);
      if (!block) continue;
      const lower = block.toLowerCase();
      if (lower.includes('below target')) violations.push(`${rel}: "below target"`);
      if (lower.includes('incomplete')) violations.push(`${rel}: "incomplete"`);
    }
    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC6 — "PTO" becomes "time off" in every user-facing string
// ---------------------------------------------------------------------------

/** Extract the `const STRINGS = { ... }` object literal's source text via
 * brace balancing (handles nested `{}` inside arrow-function values). */
function extractStringsBlock(source: string): string | null {
  const start = source.search(/const\s+STRINGS\s*[:=]/);
  if (start < 0) return null;
  const braceStart = source.indexOf('{', start);
  if (braceStart < 0) return null;
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  return null;
}

describe('AC6 — no STRINGS value contains "PTO" (excluding the verbatim-Jira-data fallback)', () => {
  it('no STRINGS object in components/ or lib/ contains the substring "PTO"', () => {
    const violations: string[] = [];
    for (const file of ALL_SOURCE_FILES) {
      const rel = relPath(file);
      const source = readFileSync(file, 'utf-8');
      const block = extractStringsBlock(source);
      if (!block) continue;

      // AC7's trap: `PtoQuickAction.tsx`'s `defaultSummary: 'PTO'` stands in
      // for the REAL Jira subtask summary field and must stay literally
      // 'PTO' — excluded by name, not by file, so any OTHER key in this same
      // file is still checked.
      const linesWithoutDefaultSummary = block
        .split('\n')
        .filter((line) => !/defaultSummary\s*:/.test(line))
        .join('\n');

      if (linesWithoutDefaultSummary.includes('PTO')) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('AC6 — internal identifiers survive the rename unchanged (copy-only)', () => {
  it('ptoSubtaskKeyItem / ptoSubtaskSummaryItem still exist in lib/storage/settings.ts', () => {
    const source = readFileSync(
      path.join(ROOT, 'lib/storage/settings.ts'),
      'utf-8',
    );
    expect(source).toMatch(/ptoSubtaskKeyItem/);
    expect(source).toMatch(/ptoSubtaskSummaryItem/);
  });

  it('PtoQuickAction and PtoPopover still exist under their current names/paths', () => {
    expect(() =>
      readFileSync(path.join(ROOT, 'components/today/PtoQuickAction.tsx'), 'utf-8'),
    ).not.toThrow();
    expect(() =>
      readFileSync(path.join(ROOT, 'components/week/PtoPopover.tsx'), 'utf-8'),
    ).not.toThrow();
    const quickAction = readFileSync(
      path.join(ROOT, 'components/today/PtoQuickAction.tsx'),
      'utf-8',
    );
    const popover = readFileSync(
      path.join(ROOT, 'components/week/PtoPopover.tsx'),
      'utf-8',
    );
    expect(quickAction).toMatch(/export function PtoQuickAction/);
    expect(popover).toMatch(/export function PtoPopover/);
  });

  it('logFullDayPto / logHalfDayPto still exist in lib/pto.ts', () => {
    const source = readFileSync(path.join(ROOT, 'lib/pto.ts'), 'utf-8');
    expect(source).toMatch(/export (async )?function logFullDayPto/);
    expect(source).toMatch(/export (async )?function logHalfDayPto/);
  });

  it("WeekGridCategory's 'pto' member still exists in lib/week-grid.ts", () => {
    const source = readFileSync(path.join(ROOT, 'lib/week-grid.ts'), 'utf-8');
    expect(source).toMatch(/WeekGridCategory\s*=\s*'task'\s*\|\s*'catch-all'\s*\|\s*'pto'/);
  });

  it('the pto.posted / pto.post.failed log event names still exist in PtoPopover.tsx', () => {
    const source = readFileSync(path.join(ROOT, 'components/week/PtoPopover.tsx'), 'utf-8');
    expect(source).toMatch(/'pto\.posted'/);
    expect(source).toMatch(/'pto\.post\.failed'/);
  });
});
