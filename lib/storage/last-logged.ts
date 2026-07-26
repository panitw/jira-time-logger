import { storage } from 'wxt/utils/storage';

/**
 * Persisted "last logged ticket" record (Story 7.3, D-7.3-2) — the resume
 * card's authoritative data seam. Written only on a CONFIRMED successful
 * worklog post (`result.kind === 'ok'`); never on an outbox-enqueued or
 * refused write (`components/today/QuickLogForm.tsx`, `components/today/
 * ResumeCard.tsx`). Survives popup close, week rollover, and browser
 * restart — unlike `TodayView.loggedEntries`, which is session-only.
 *
 * `seconds` is the duration the user last ENTERED against this ticket (the
 * resume card's AC3 pre-fill value) — not necessarily the freshest server
 * duration, since a worklog can later be edited; this store is the only
 * honest source of "what the user actually typed". `startedAt` is the
 * worklog's `started` (Jira ISO timestamp), driving the AC2 recency note.
 * `recordedAt` is a tiebreak timestamp only — this is a "most recent", not a
 * history (see `setLastLoggedTicket`).
 */
export type LastLoggedTicket = {
  key: string;
  summary: string;
  seconds: number;
  startedAt: string;
  recordedAt: string;
};

export const lastLoggedTicketItem = storage.defineItem<LastLoggedTicket | null>(
  'local:lastLoggedTicket',
  { fallback: null },
);

/**
 * Defensive coercion, mirroring `lib/storage/view-state.ts`'s
 * `getMarkDoneState`: WXT's `fallback` only applies to an ABSENT key, so a
 * malformed/partial stored value (a stale shape from a future reshape) would
 * otherwise survive as-is. Any missing/mistyped required field folds to
 * `null` so `useResumeTicket` falls back to its `status: 'none'` branch
 * rather than rendering a broken record.
 */
export async function getLastLoggedTicket(): Promise<LastLoggedTicket | null> {
  const value = await lastLoggedTicketItem.getValue();
  if (
    value == null ||
    typeof value !== 'object' ||
    typeof value.key !== 'string' ||
    typeof value.summary !== 'string' ||
    typeof value.seconds !== 'number' ||
    typeof value.startedAt !== 'string' ||
    typeof value.recordedAt !== 'string'
  ) {
    return null;
  }
  return value;
}

/** Last write wins — this is a "most recent" record, not a history. */
export async function setLastLoggedTicket(record: LastLoggedTicket): Promise<void> {
  await lastLoggedTicketItem.setValue(record);
}
