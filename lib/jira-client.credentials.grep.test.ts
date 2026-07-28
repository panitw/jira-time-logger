import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Finding 2 (security review): `credentials: 'omit'` must be on EVERY Jira
 * fetch, not most of them.
 *
 * This is a source-level grep because the defect it guards is an OMISSION at
 * one call site among several identical-looking ones. `lib/auth/api-token.ts`
 * declared the rule CRITICAL and said it applied to "every future Jira API
 * call in Story 1.4's jira-client wrapper" — and then all eight calls in
 * `jira-client.ts` shipped without it for the life of the project, because
 * nothing checked. A behavioural test would have to exercise all four verbs
 * AND both of each verb's 401-retry branches to notice; adding a ninth fetch
 * without the flag would still slip past. Counting at the source is what
 * actually matches the failure mode.
 */
const CLIENT = 'lib/jira-client.ts';

function source(): string {
  return readFileSync(path.resolve(process.cwd(), CLIENT), 'utf-8');
}

/** Drop whole comment lines before counting — the module's own SECURITY note
 * quotes `credentials: 'omit'` verbatim, which would otherwise inflate the
 * tally and mask a genuinely unflagged call. Same line-based convention as
 * `lib/day-status-vocabulary.grep.test.ts#stripCommentLines`. */
function code(): string {
  return source()
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

describe('jira-client: no Jira request may carry ambient cookies', () => {
  it("every fetch( in jira-client.ts passes credentials: 'omit'", () => {
    const src = code();
    const fetchCount = (src.match(/\bfetch\(/g) ?? []).length;
    const omitCount = (src.match(/credentials: 'omit'/g) ?? []).length;

    expect(fetchCount).toBeGreaterThan(0);
    // Equality, not `>=`: a new fetch without the flag fails here even if the
    // existing ones still have it.
    expect(omitCount).toBe(fetchCount);
  });

  it('covers all four verbs and their 401-retry twins (8 calls today)', () => {
    // Pins the count so DELETING a call site — which would also make the
    // equality above trivially true — is visible rather than silent.
    expect((code().match(/\bfetch\(/g) ?? []).length).toBe(8);
  });

  it('the rule is stated at the top of the module, not just enacted', () => {
    // The original omission happened because the reasoning lived in a
    // different file (`lib/auth/api-token.ts`) from the code it governed.
    expect(source()).toMatch(/SECURITY[\s\S]{0,400}credentials: 'omit'/);
  });
});
