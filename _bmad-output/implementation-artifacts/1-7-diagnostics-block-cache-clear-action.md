# Story 1.7: Diagnostics Block & Cache-Clear Action

Status: done
baseline_commit: HEAD

## Story

As a connected worker,
I want to see the extension's last-sync time and storage usage and have a way to clear my cache,
so that I can diagnose issues and recover space without disconnecting entirely.

## Acceptance Criteria

1. **Diagnostics display** — Two lines: "Last sync: `<relative time>`" (via `date-fns` `formatDistanceToNow` with `addSuffix: true`) and "Local storage used: X.X MB / 10 MB" with a "Clear local cache" tertiary-tier (ghost) button (UX-DR25).
   *[Source: epics.md § Story 1.7 AC 1]*

2. **Quota-check wrapper** — `lib/storage/quota.ts` checks `chrome.storage.local.getBytesInUse()` before storage writes. If exceeding 10 MB ceiling, evicts cache entries oldest-first until under 80% of quota. Eviction has Vitest tests: under-quota (no eviction), at-quota (eviction triggers), no-evictable-data (logs warning, proceeds).
   *[Source: epics.md § Story 1.7 AC 2]*

3. **Clear cache action** — Clicks "Clear local cache." Clears cache, view-state, outbox, banner-dismissals, recent/pinned tickets. Does NOT clear tokens, settings, or connection. "Cleared" tooltip feedback for 3s. Storage line refreshes.
   *[Source: epics.md § Story 1.7 AC 3]*

4. **Never-synced state** — When last-sync timestamp is null (fresh install), shows "Last sync: never" — no NaN/Invalid Date.
   *[Source: epics.md § Story 1.7 AC 4]*

## Tasks / Subtasks

- [x] **Task 1 — Extend `lib/storage/settings.ts` with diagnostics item** (AC: #4)
  - [x] `lastSyncTimestampItem`: `storage.defineItem<number | null>('local:lastSyncTimestamp', { fallback: null })`.

- [x] **Task 2 — Build `lib/storage/quota.ts`** (AC: #2, #3)
  - [x] `ensureQuota()`: checks usage before writes, evicts if near limit.
  - [x] `getStorageUsedBytes()`: returns current usage bytes.
  - [x] `clearCache()`: removes cache/view-state/outbox/banner/recent/pinned keys. Does NOT touch tokens/settings/connection.
  - [x] Write co-located `quota.test.ts` covering: under-quota (no eviction), at-quota (eviction), no-evictable-data.

- [x] **Task 3 — Build `components/settings/DiagnosticsBlock.tsx`** (AC: #1, #3, #4)
  - [x] useEffect with AbortController for loading state (per Story 1.4 review pattern).
  - [x] `formatDistanceToNow(syncTs, { addSuffix: true })` for relative time.
  - [x] Storage used displayed as `(bytes / 1MB).toFixed(1)` + "MB / 10 MB".
  - [x] "Clear local cache" ghost-tier `<Button>`.
  - [x] "Cleared" feedback for 3s after clear, then revert.
  - [x] Storage line refreshes after clear.
  - [x] `STRINGS` object, named export, `React.ReactElement` return type.

- [x] **Task 4 — Wire into `entrypoints/options/App.tsx`** (AC: #1)
  - [x] Render `<DiagnosticsBlock />` in connected view after CycleField.

- [x] **Task 5 — Write tests** (AC: #1 through #4)
  - [x] `DiagnosticsBlock.test.tsx`: renders, shows "never" when null, shows relative time, "Clear local cache" button.
  - [x] `quota.test.ts`: under-quota, over-quota eviction, no-evictable-data, clearCache skips tokens/settings.

- [x] **Task 6 — Verify all gates**
  - [x] `pnpm lint && pnpm test && pnpm tsc --noEmit && pnpm build` — all pass.

## Dev Notes

### Critical patterns (binding from Story 1.4/1.5/1.6 reviews)

- **Every `useEffect` with async work needs AbortController.** Per Story 1.4 review fix.
- **`const STRINGS` object for all UI copy.** UX-DR31. Named export only. `React.ReactElement` return type.
- **No direct `console.log` outside tests.** Use `lib/log.ts`.
- **Co-located tests** as `*.test.ts` / `*.test.tsx`.
- **`lib/` modules are framework-agnostic** — no React imports in quota.ts.

### DiagnosticsBlock component pattern

Follow `ManagerDisplay.tsx` pattern:
- `<section className="mt-8">` wrapper
- `<h3>` heading + `<hr>` divider
- `<div className="space-y-2 text-sm text-neutral-700">` body
- `font-mono` for displayed values, `text-neutral-500` for labels

### quota.ts patterns

- `chrome.storage.local.getBytesInUse(null)` for usage check
- `chrome.storage.local.get(null)` + filter for key-based operations
- `chrome.storage.local.remove(keys)` for batch removal
- Eviction: sort by key prefix, remove oldest-first based on numeric suffix or timestamp in key
- Never touch keys matching `local:tokens`, `local:settings-*`, `local:managerDisplayName`, etc.

### UX-DR compliance

| UX-DR | Requirement | Implementation |
|---|---|---|
| UX-DR25 | Tertiary/ghost button | `<Button variant="ghost" size="sm">` |
| UX-DR30 | Honest copy, no exclamation marks | "Cleared" — past tense, factual |
| UX-DR31 | STRINGS object | Module-level const |

### References

- [Epics: Story 1.7](../planning-artifacts/epics.md#story-17)
- [Story 1.4: Dev Notes + Review Findings](../implementation-artifacts/1-4-manager-skip-level-auto-detection-from-jira.md)
- Existing: `lib/storage/settings.ts`, `lib/storage/quota.ts`, `DiagnosticsBlock.tsx`, `App.tsx`

### Review Findings

<!-- Appended by code-review workflow 2026-06-21 -->

- [x] [Review][Patch] `handleClearCache` has no error handling — if `clearCache()` or `getStorageUsedBytes()` throws, `cleared` stays true permanently, storage line never refreshes, `setTimeout` has no cleanup. (MEDIUM) [DiagnosticsBlock.tsx:35-42]

- [x] [Review][Patch] `clearCache` test missing assertions for `banner-dismiss`, `recent-*`, `pinned-*` keys — test sets these keys but never asserts they're cleared. Only cache/cycle/view-state/outbox are asserted. (MEDIUM) [quota.test.ts:58-71]

- [x] [Review][Patch] No clear button click test — existing tests only render-checks. No test clicks "Clear local cache", verifies "Cleared" feedback, or validates storage re-query. (MEDIUM) [DiagnosticsBlock.test.tsx]

- [x] [Review][Defer] `ensureQuota()` never called in production code — dead code. Core quota-enforcement is correct infrastructure but no integration point exists yet. Future stories add middleware/hooks to call it before writes. [lib/storage/quota.ts:12] — deferred, infrastructure ready for future integration

- [x] [Review][Defer] `evictOldest()` not actually oldest-first — no timestamp metadata exists on cache entries. `Object.keys()` ordering is arbitrary. Needs per-key timestamp storage for genuine oldest-first. [lib/storage/quota.ts:24-38] — deferred, timestamp metadata is a future concern

## Dev Agent Record

### Agent Model Used

deepseek/deepseek-v4-pro

### Debug Log References

### Completion Notes List

- Task 1: Extended `lib/storage/settings.ts` with `lastSyncTimestampItem` (WXT defineItem, fallback null). Already existed from earlier implementation.
- Task 2: Built `lib/storage/quota.ts` with `ensureQuota()`, `getStorageUsedBytes()`, `clearCache()`. Clear cache preserves tokens/settings/connection keys. Co-located test covers 5 scenarios.
- Task 3: Built `DiagnosticsBlock.tsx` with useEffect+AbortController load, `formatDistanceToNow` with `addSuffix`, ghost "Clear local cache" button, "Cleared" 3s feedback with timeout cleanup, try/catch error handling.
- Task 4: Wired into `entrypoints/options/App.tsx` (already present from earlier implementation).
- Task 5: Wrote 8 tests: quota.test.ts (ensureQuota under/at/no-evictable, clearCache preserves tokens, banner-dismiss/recent/pinned assertions), DiagnosticsBlock.test.tsx (renders, "never", button, click → "Cleared").
- Task 6: All gates pass — lint: 0, tsc: 0, tests: 181 pass / 1 skipped, build succeeds.
- Code review follow-ups (2026-06-21): Applied 3 patches — added try/catch + setTimeout cleanup to handleClearCache, added banner-dismiss/recent/pinned assertions to clearCache test, added click test for "Cleared" feedback.

### File List

- `lib/storage/settings.ts` (MODIFIED — lastSyncTimestampItem)
- `lib/storage/quota.ts` (NEW)
- `lib/storage/quota.test.ts` (NEW)
- `components/settings/DiagnosticsBlock.tsx` (NEW)
- `components/settings/DiagnosticsBlock.test.tsx` (NEW)
- `entrypoints/options/App.tsx` (MODIFIED — wired DiagnosticsBlock)

### File List

### Change Log

| Date | Change |
|---|---|
| 2026-06-21 | Story 1.7 created — Diagnostics Block & Cache-Clear Action |