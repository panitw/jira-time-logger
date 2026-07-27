/**
 * Story 7.10, D-7.10-45 / D-7.10-33 (owner ruling) / E-4: `disconnectAll()`
 * calls `chrome.storage.local.clear()` (`lib/disconnect.ts`), which wipes
 * every SETTING (catch-all project key, time-off subtask, work-day target,
 * daily reminder, approval cycle, cached manager names) — not just
 * credentials and cached worklogs. AC5's prescribed copy names only
 * credentials and worklogs; that understates what actually happens.
 *
 * This test pins `DisconnectAction.tsx`'s body copy against
 * `disconnectAll()`'s ACTUAL behaviour so the two cannot silently drift —
 * if a future change scopes `disconnectAll()` down to spare some storage,
 * or the copy is edited to drop a noun, this goes red and forces a
 * reconciling review, rather than the mismatch surviving unnoticed the way
 * the AC's own understatement did.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const DISCONNECT_LIB = path.join(ROOT, 'lib', 'disconnect.ts');
const DISCONNECT_ACTION = path.join(ROOT, 'components', 'settings', 'DisconnectAction.tsx');

describe('Story 7.10, D-7.10-45/33 — Disconnect copy is pinned to disconnectAll()\'s actual behaviour', () => {
  it('disconnectAll() still clears ALL of chrome.storage.local (the fact the copy is pinned against)', () => {
    const source = readFileSync(DISCONNECT_LIB, 'utf-8');
    expect(source).toMatch(/chrome\.storage\.local\.clear\(\)/);
  });

  /** Extract a single `STRINGS.<key>: '...'` string literal's value —
   * scoped per-copy rather than "somewhere in the file", so dropping a
   * noun from ONE of the two copies (the card's summary line vs. the
   * dialog's operative confirmation text) cannot hide behind the other
   * copy still mentioning it. */
  function extractStringValue(source: string, key: string): string | null {
    const match = new RegExp(`${key}:\\s*\\n?\\s*'([^']*)'`).exec(source);
    return match ? match[1]! : null;
  }

  it.each(['body', 'dialogBody'])(
    'DisconnectAction.tsx STRINGS.%s names credentials, cached worklogs, AND settings — not just the AC-verbatim two',
    (key) => {
      const source = readFileSync(DISCONNECT_ACTION, 'utf-8');
      const value = extractStringValue(source, key);
      expect(value).not.toBeNull();
      const lower = value!.toLowerCase();
      expect(lower).toMatch(/credential/);
      expect(lower).toMatch(/worklog/);
      // M-8: `/setting/` was a bare substring — copy that drops the real
      // claim but happens to contain "Re**setting**" would have passed.
      // Word-boundary the noun instead.
      expect(lower).toMatch(/\bsettings?\b/);
    },
  );

  it.each(['body', 'dialogBody'])(
    'DisconnectAction.tsx STRINGS.%s states hours already written to Jira are untouched',
    (key) => {
      const source = readFileSync(DISCONNECT_ACTION, 'utf-8');
      const value = extractStringValue(source, key);
      expect(value).not.toBeNull();
      expect(value).toMatch(/untouched/i);
      expect(value).toMatch(/already written to Jira/i);
    },
  );

  it('disconnectAll() is untouched — still a single chrome.storage.local.clear() call, not per-key removal (D-7.10-45: the function itself is not modified)', () => {
    const source = readFileSync(DISCONNECT_LIB, 'utf-8');
    const clearCalls = (source.match(/chrome\.storage\.local\.clear\(\)/g) ?? []).length;
    expect(clearCalls).toBe(1);
    expect(source).not.toMatch(/chrome\.storage\.local\.remove\(/);
  });

  // M-8: the guard above proves the copy doesn't UNDERSTATE what's cleared
  // (narrowing `.clear()` to `.remove([...])` reddens it), but said nothing
  // about the copy OVERSTATING it — `disconnectAll()` writing storage back
  // after the clear (a reseed) would silently neuter the "credentials,
  // worklogs and settings are gone" claim without this guard noticing.
  it('disconnectAll() does not write chrome.storage.local back after clearing it (no silent reseed)', () => {
    const source = readFileSync(DISCONNECT_LIB, 'utf-8');
    expect(source).not.toMatch(/chrome\.storage\.local\.set\(/);
    expect(source).not.toMatch(/\.setValue\(/);
  });
});
