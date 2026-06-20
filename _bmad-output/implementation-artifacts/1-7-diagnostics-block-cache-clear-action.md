# Story 1.7: Diagnostics Block & Cache-Clear Action

Status: ready-for-dev
baseline_commit: HEAD

## Story

As a connected worker, I want to see last-sync time, storage usage, and clear my cache, so I can diagnose issues without disconnecting.

## Acceptance Criteria

1. Two lines: "Last sync: `<relative time>`" (date-fns) and "Local storage used: X.X MB / 10 MB" with "Clear local cache" tertiary button.
2. `lib/storage/quota.ts` checks `chrome.storage.local.getBytesInUse()` before writes. Evicts closed-cycle cache oldest-first if exceeding 10 MB ceiling.
3. "Clear local cache" clears cache, view-state, outbox (NOT tokens/settings). Inline "Cleared" tooltip feedback. Storage line refreshes.
4. Never-synced shows "Last sync: never" (no NaN/Invalid Date).

## Dev Notes

- Build `components/settings/DiagnosticsBlock.tsx`.
- Build `lib/storage/quota.ts` with eviction logic.
- Extend `lib/storage/settings.ts`: `lastSyncTimestamp`.
- Import `date-fns` (already in package.json).
