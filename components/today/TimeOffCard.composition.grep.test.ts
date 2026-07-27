/**
 * Source-level grep guard (Story 7.9, D-7.9-13 / Review Finding 3 & 14a).
 *
 * `TimeOffCard.test.tsx` mocks `@/components/today/LoggedToday` wholesale
 * (to avoid a second pre-existing-class unhandled rejection from that
 * module's transitive `@wxt-dev/storage` import in jsdom) — which means the
 * RUNTIME test suite cannot, by itself, distinguish "TimeOffCard genuinely
 * imports LoggedToday's `enqueueFailedWorklogMutation`/`UNDO_WINDOW_MS`"
 * from "TimeOffCard coincidentally declares a same-shaped local mock and
 * the vi.mock factory happens to satisfy it" (Finding 14's mutation M13:
 * swapping the `UNDO_WINDOW_MS` import for an identically-valued local
 * `const` changed nothing, because the test's own mock intercepts the
 * specifier either way). This static check closes that gap: it reads the
 * SOURCE file directly, independent of any mock.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

describe('TimeOffCard — genuine composition over LoggedToday.tsx (D-7.9-13, Finding 14a)', () => {
  it('imports BOTH enqueueFailedWorklogMutation and UNDO_WINDOW_MS from LoggedToday.tsx (not a local declaration)', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'components/today/TimeOffCard.tsx'),
      'utf-8',
    );
    const importMatch = /import\s*\{([^}]*)\}\s*from\s*['"]@\/components\/today\/LoggedToday['"]/.exec(
      source,
    );
    expect(importMatch).not.toBeNull();
    const names = importMatch![1]!.split(',').map((s) => s.trim());
    expect(names).toContain('enqueueFailedWorklogMutation');
    expect(names).toContain('UNDO_WINDOW_MS');
    // Neither name may ALSO be locally declared (the exact shape a
    // "coincidentally satisfies the same mock" duplicate would take).
    expect(source).not.toMatch(/(?:function|const|let|var)\s+enqueueFailedWorklogMutation\b/);
    expect(source).not.toMatch(/(?:const|let|var)\s+UNDO_WINDOW_MS\s*=/);
  });
});
