/**
 * Durable outbox for failed worklog writes (Story 2.7, FR43, AR21, NFR6).
 *
 * When a worklog post/edit/delete fails with a transient error (`network` or
 * `rate-limited`), the pending write is appended to a durable queue persisted
 * in `chrome.storage.local` (key `local:outbox`). A service-worker alarm
 * (`outbox-retry`) drains the queue by replaying each write through
 * `lib/jira-client`. Successful entries are removed; transient failures bump
 * `attemptCount`; non-retryable errors (and entries that exhaust MAX_ATTEMPTS)
 * are moved to `status: 'failed'` for a user-actionable Retry-now / Discard UI.
 *
 * This module is framework-agnostic (no React import) so it can run both
 * popup-side (enqueue) and in the service worker (drain).
 */
import { storage } from 'wxt/utils/storage';
import { z } from 'zod';
import type { AdfDoc } from '@/lib/adf';
import {
  postWorklog,
  postComment,
  updateWorklog,
  deleteWorklog,
} from '@/lib/jira-client';
import { log } from '@/lib/log';
import type { JiraError, Result } from '@/lib/result';

export const MAX_ATTEMPTS = 10;

// `comment` (Story 5.6) is the approval fan-out's deferred-retry op: a failed
// approval comment POST enqueues its already-serialized body so the SW retry
// posts the byte-identical, checksum-valid approval. `kind` is the replay
// dispatcher (`endpoint` is stored but ignored on replay).
export type OutboxKind = 'post' | 'put' | 'delete' | 'comment';
export type OutboxStatus = 'pending' | 'failed';

export const OutboxEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['post', 'put', 'delete', 'comment']),
  endpoint: z.string(),
  body: z.unknown().optional(),
  issueKey: z.string(),
  worklogId: z.string().optional(),
  attemptCount: z.number(),
  status: z.enum(['pending', 'failed']),
  lastError: z.string().optional(),
  enqueuedAt: z.string(),
});

export type OutboxEntry = z.infer<typeof OutboxEntrySchema>;

export const outboxItem = storage.defineItem<OutboxEntry[]>('local:outbox', {
  fallback: [],
});

/** Persisted counter the popup reads + clears on mount to show one drain toast. */
export const outboxDrainedItem = storage.defineItem<number>(
  'local:outbox-drained',
  { fallback: 0 },
);

/**
 * Read the outbox, validating each entry against the Zod schema.
 *
 * Fail-closed: a corrupt entry is silently dropped (logged at warn), never
 * thrown — one bad row must not poison the whole queue.
 */
export async function list(): Promise<OutboxEntry[]> {
  const raw = await outboxItem.getValue();
  if (!Array.isArray(raw)) return [];
  const valid: OutboxEntry[] = [];
  for (const candidate of raw) {
    const parsed = OutboxEntrySchema.safeParse(candidate);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      log.warn('outbox.entry.corrupt', { issues: parsed.error.issues.length });
    }
  }
  return valid;
}

/**
 * Append a new pending write to the outbox. Generates `id`, `enqueuedAt`,
 * `attemptCount: 0`, `status: 'pending'`.
 */
export async function enqueue(
  input: {
    kind: OutboxKind;
    endpoint: string;
    issueKey: string;
    body?: unknown;
    worklogId?: string;
  },
): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    id: crypto.randomUUID(),
    kind: input.kind,
    endpoint: input.endpoint,
    issueKey: input.issueKey,
    attemptCount: 0,
    status: 'pending',
    enqueuedAt: new Date().toISOString(),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.worklogId !== undefined ? { worklogId: input.worklogId } : {}),
  };
  const current = await list();
  await outboxItem.setValue([...current, entry]);
  log.warn('outbox.enqueued', { kind: entry.kind, issueKey: entry.issueKey });
  return entry;
}

/** Remove an entry by id (e.g. after a successful drain or a Discard). */
export async function remove(id: string): Promise<void> {
  const current = await list();
  await outboxItem.setValue(current.filter((e) => e.id !== id));
}

/** Patch an entry in place. No-op if the id is not found. */
export async function update(
  id: string,
  patch: Partial<OutboxEntry>,
): Promise<void> {
  const current = await list();
  await outboxItem.setValue(
    current.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  );
}

/** Move an entry to the terminal `failed` state, recording the last error. */
export async function markFailed(id: string, lastError: string): Promise<void> {
  await update(id, { status: 'failed', lastError });
}

/** Wipe the entire outbox (consistent with full disconnect reset). */
export async function clearOutbox(): Promise<void> {
  await outboxItem.setValue([]);
}

/**
 * Subset of `lib/jira-client` needed to replay outbox entries. Injected so the
 * drain function is unit-testable with a mocked client.
 */
export type OutboxJiraClient = {
  postWorklog: typeof postWorklog;
  postComment: typeof postComment;
  updateWorklog: typeof updateWorklog;
  deleteWorklog: typeof deleteWorklog;
};

const defaultClient: OutboxJiraClient = {
  postWorklog,
  postComment,
  updateWorklog,
  deleteWorklog,
};

// The stored body is opaque (`unknown`) on read; it is replayed verbatim. A
// `post`/`put` carries a flat worklog body (edits carry an already-built ADF
// `comment`); a `comment` op (Story 5.6 approval fan-out) carries the nested
// `{ body: <AdfDoc> }` approval-comment body. We cast at the replay boundary
// since the value is trusted (we wrote it) and jira-client re-serializes it
// as-is.
type PutBody = { timeSpentSeconds: number; started: string; comment?: unknown };
type PostBody = { timeSpentSeconds: number; started: string; comment?: string };
type CommentBody = { body: AdfDoc };

/** A malformed entry can never succeed — treat as a non-retryable error so the
 * drain marks it `failed` immediately instead of looping to MAX_ATTEMPTS (a
 * missing body would throw a TypeError; a missing worklogId would hit a bogus
 * endpoint). We never silently lose it. */
const MALFORMED: Result<unknown, JiraError> = { kind: 'not-found' };

function replay(
  client: OutboxJiraClient,
  entry: OutboxEntry,
): Promise<Result<unknown, JiraError>> {
  if (entry.kind === 'post') {
    if (entry.body === undefined) return Promise.resolve(MALFORMED);
    return client.postWorklog(entry.issueKey, entry.body as PostBody);
  }
  if (entry.kind === 'comment') {
    if (entry.body === undefined) return Promise.resolve(MALFORMED);
    return client.postComment(entry.issueKey, entry.body as CommentBody);
  }
  if (entry.kind === 'put') {
    if (!entry.worklogId || entry.body === undefined) {
      return Promise.resolve(MALFORMED);
    }
    return client.updateWorklog(entry.issueKey, entry.worklogId, entry.body as PutBody);
  }
  if (!entry.worklogId) return Promise.resolve(MALFORMED);
  return client.deleteWorklog(entry.issueKey, entry.worklogId);
}

/**
 * Replay every `pending` entry sequentially (the scheduler throttles ~2 req/s).
 *
 *   - `ok` → remove the entry.
 *   - `network` / `rate-limited` (transient) → increment attemptCount; if that
 *     reaches MAX_ATTEMPTS, move to `failed` instead of retrying forever.
 *   - any other kind (`forbidden` / `not-found` / `parse-error` /
 *     `auth-expired`) → move to `failed` immediately (a real, non-transient
 *     error — do not silently lose it).
 *
 * Never throws: each entry is wrapped so a single replay failure cannot abort
 * the pass or escape the service-worker `onAlarm` listener.
 *
 * @returns the number of entries drained (successfully removed) this pass.
 */
/**
 * In-flight guard: a single JS context (popup or service worker) must not run
 * two overlapping drain passes — e.g. a popup Retry-now firing while the 60s SW
 * alarm pass is mid-flight, or an alarm re-firing before a long pass finishes.
 * Replaying the same `pending` entry twice would double-post a worklog. (This
 * does not serialize across the popup/SW contexts — chrome.storage.local has no
 * transaction primitive — but it removes the common same-context double-drain.)
 */
let draining = false;

export async function runOutboxRetryPass(
  client: OutboxJiraClient = defaultClient,
): Promise<{ drained: number }> {
  if (draining) {
    log.info('outbox.retry.skipped', { reason: 'already-draining' });
    return { drained: 0 };
  }
  draining = true;
  try {
    return await drainPass(client);
  } finally {
    draining = false;
  }
}

async function drainPass(
  client: OutboxJiraClient,
): Promise<{ drained: number }> {
  const entries = (await list()).filter((e) => e.status === 'pending');
  if (entries.length === 0) return { drained: 0 };

  log.info('outbox.retry.start', { count: entries.length });
  let drained = 0;

  for (const entry of entries) {
    try {
      const result = await replay(client, entry);
      if (result.kind === 'ok') {
        await remove(entry.id);
        drained += 1;
        log.info('outbox.retry.succeeded', {
          kind: entry.kind,
          issueKey: entry.issueKey,
        });
        continue;
      }

      if (result.kind === 'network' || result.kind === 'rate-limited') {
        const nextAttempt = entry.attemptCount + 1;
        if (nextAttempt >= MAX_ATTEMPTS) {
          await markFailed(entry.id, result.kind);
          log.warn('outbox.entry.failed', {
            kind: entry.kind,
            issueKey: entry.issueKey,
            reason: 'max-attempts',
          });
        } else {
          await update(entry.id, {
            attemptCount: nextAttempt,
            lastError: result.kind,
          });
          log.warn('outbox.retry.failed', {
            kind: entry.kind,
            issueKey: entry.issueKey,
            attempt: nextAttempt,
            reason: result.kind,
          });
        }
        continue;
      }

      // Non-retryable kind — a real error, not transient.
      await markFailed(entry.id, result.kind);
      log.warn('outbox.entry.failed', {
        kind: entry.kind,
        issueKey: entry.issueKey,
        reason: result.kind,
      });
    } catch (e) {
      // Defensive: a replay should return a Result, never throw. If it does,
      // keep the entry pending and move on — never abort the pass.
      log.error('outbox.retry.error', {
        kind: entry.kind,
        issueKey: entry.issueKey,
        cause: String(e),
      });
    }
  }

  if (drained > 0) {
    const prior = await outboxDrainedItem.getValue();
    await outboxDrainedItem.setValue(prior + drained);
    log.info('outbox.drained', { count: drained });
  }

  return { drained };
}
