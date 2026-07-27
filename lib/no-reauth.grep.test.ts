/**
 * THE SCOPE TRAP (Story 7.10, D-7.10-37): the design source draws a
 * "Re-authenticate" button in the Settings Connection block
 * (`imports/jira-time-logger-round2.dc.html:243`). It is deliberately NOT
 * built, and nothing is substituted for it — three independent sources
 * agree (SD-1, `EXPERIENCE.md:403-405`, `epics.md:2076`). The only auth
 * entry points in this codebase are `startOAuthFlow()`, `validateApiToken()`
 * and `disconnectAll()` — there is no re-auth path, and no partial one.
 *
 * Precedent for pinning a deliberate absence: D-7.8-18's "Ask Anucha"
 * substitute was rejected on the same reasoning ("a manager who clicks
 * 'Open in Jira' expecting to notify someone has not notified anyone") but
 * that absence was left mechanically UNdefended, which this story's own Dev
 * Notes call out explicitly as the gap to close here.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const SETTINGS_DIR = path.join(ROOT, 'components', 'settings');

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      listFiles(full, out);
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

// Banned as user-facing STRING content — a renamed stand-in for the
// missing re-auth flow is explicitly forbidden (D-7.10-37). Case-insensitive
// so "reconnect"/"Reconnect"/"RECONNECT" are all caught the same way.
// Finding 11: widened past the original four shapes to the four extra
// candidates the review brief named, all of which were previously GREEN.
const BANNED_PATTERNS = [
  /re-?authenticat/i,
  /re-?connect/i,
  /sign in again/i,
  /sign back in/i,
  /log in again/i,
  /refresh\s+(your\s+)?(connection|session)/i,
  /renew(ing)?\s+access/i,
  /re-?establish(ing)?\s+connection/i,
];

// Finding 11: the guard defended WORDS, but a working substitute — a real
// `startOAuthFlow()`/`validateApiToken()`/`disconnectAll()` call wired to a
// plausible-looking button anywhere in the fact blocks — is exactly what
// D-7.10-37 warns is worse than an honest absence, and it is undefended by a
// word list alone. Only the three components that legitimately own an auth
// entry point may import one.
const AUTH_IMPORT_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /from ['"]@\/lib\/oauth\/flow['"]/, name: 'startOAuthFlow (@/lib/oauth/flow)' },
  { pattern: /from ['"]@\/lib\/auth\/api-token['"]/, name: 'validateApiToken (@/lib/auth/api-token)' },
  { pattern: /from ['"]@\/lib\/disconnect['"]/, name: 'disconnectAll (@/lib/disconnect)' },
];
const ALLOWED_AUTH_IMPORTERS = new Set([
  'components/settings/ConnectButton.tsx',
  'components/settings/ApiTokenSetup.tsx',
  'components/settings/DisconnectAction.tsx',
]);

describe('Story 7.10, D-7.10-37 — no "Re-authenticate" / renamed stand-in anywhere in the settings tree', () => {
  const files = listFiles(SETTINGS_DIR).filter(
    (f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'),
  );

  it('scans at least the settings component tree (sanity: this guard is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('no component under components/settings/ contains a re-auth affordance or a renamed stand-in for one', () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      for (const pattern of BANNED_PATTERNS) {
        // A source COMMENT is allowed (and expected) to name the banned
        // strings while explaining their absence — e.g. this story's own
        // "no Re-authenticate button" comments in ConnectionBlock.tsx. Only
        // comment lines are exempted; any occurrence in a non-comment line
        // (a real STRINGS value, JSX text, aria-label, etc.) is a violation.
        const nonCommentLines = source
          .split('\n')
          .filter((line) => {
            const t = line.trim();
            return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
          })
          .join('\n');
        if (pattern.test(nonCommentLines)) {
          violations.push(`${rel}: matches ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  // Finding 11: a real, working re-auth substitute (e.g. a "Update
  // credentials" button wired to `startOAuthFlow()`) has no banned WORDS in
  // it and sailed through the string guard above untouched. This closes
  // that gap by pinning WHO may import an auth entry point at all.
  it('no component under components/settings/ other than the three that own an auth entry point imports one', () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      if (ALLOWED_AUTH_IMPORTERS.has(rel)) continue;
      for (const { pattern, name } of AUTH_IMPORT_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${rel} imports ${name}, which only ConnectButton/ApiTokenSetup/DisconnectAction may do`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
