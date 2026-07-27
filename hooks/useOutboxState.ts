import { useEffect, useState } from 'react';
import { outboxItem, type OutboxEntry } from '@/lib/storage/outbox';

/**
 * The popup-wide read of Story 2.7's durable outbox (Story 7.9, Task 1).
 *
 * `pendingCount` feeds the offline banner (AC2) — `status: 'pending'` only,
 * never `'failed'` (counting `failed` would make "they'll sync automatically"
 * a lie: only the service-worker `outbox-retry` alarm drains `pending`).
 * `failed` feeds the error banner (AC3) with the full entries so it can name
 * the ticket, the status code, and the likely reason.
 *
 * Reuses the exact reactive-read shape `LoggedToday.tsx:566-590` already
 * established: `outboxItem.getValue()` once on mount, `outboxItem.watch()`
 * for updates, an `active` flag + `unwatch()` on cleanup. No polling, no new
 * storage key — and no `list()` (the Zod-validating helper): the same
 * WorklogRow effect in `LoggedToday.tsx` reads `outboxItem.getValue()`
 * directly too, so this stays the SAME established pattern rather than a
 * second one.
 */

export type OutboxState = {
  pendingCount: number;
  failed: OutboxEntry[];
};

export function useOutboxState(): OutboxState {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);

  useEffect(() => {
    let active = true;
    const sync = async (): Promise<void> => {
      try {
        const all = await outboxItem.getValue();
        if (active) setEntries(all);
      } catch {
        if (active) setEntries([]);
      }
    };
    void sync();
    const unwatch = outboxItem.watch(() => {
      void sync();
    });
    return () => {
      active = false;
      unwatch();
    };
  }, []);

  return {
    pendingCount: entries.filter((e) => e.status === 'pending').length,
    failed: entries.filter((e) => e.status === 'failed'),
  };
}
