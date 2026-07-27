import { CircleX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { secondsToHoursDisplay } from '@/lib/hours';
import type { OutboxEntry } from '@/lib/storage/outbox';

/**
 * The write-refused banner (Story 7.9, AC3) — a legitimate red on the
 * popup: Jira actually refused a worklog write.
 *
 * `role="alert"` is mounted UNCONDITIONALLY and EMPTY; its contents populate
 * one tick later, in an effect. A `role="alert"` populated at first paint is
 * generally NOT announced by assistive tech (Story 7.2 Finding 5's rule,
 * carried forward here) — and since a `failed` outbox entry persists across
 * popup sessions, the banner IS present at first paint in the common case.
 * Without this, AC3 ships decoratively true and functionally dead.
 *
 * `CircleX` is a write-failure icon, never a day status — allowlisted in
 * `lib/day-status-vocabulary.grep.test.ts#ICON_ALLOWLIST` for this file only
 * (D-7.9-22, the exact `LoaderCircle`/`SearchPanel.tsx` precedent).
 *
 * Contrast (§ Contrast, hand-computed): the headline is `text-error-ink`
 * (#991B1B on #FEF2F2, 7.60:1) — NEVER `text-status-error` (#DC2626 on
 * #FEF2F2 is 4.42:1, below AA for normal text). `DayStatusIndicator
 * status="error"` derives ONE colour for both icon and label, so composing
 * the headline through it would ship that exact failure — this component
 * renders `CircleX` directly instead, icon in `text-status-error`, headline
 * in `text-error-ink`.
 */

const STRINGS = {
  headline: "Jira didn't accept that worklog",
  retry: 'Retry',
  logElsewhere: 'Log elsewhere',
};

const REASON: Record<string, string> = {
  forbidden: '403, you may not have Work On Issues permission',
  'not-found': '404, that ticket or worklog no longer exists',
  'auth-expired': '401, your Jira session expired',
  'parse-error': "Jira sent a response we couldn't read",
  // Only reachable via MAX_ATTEMPTS exhaustion — a transient kind that never
  // recovered, not a fresh transient failure.
  network: 'gave up after 10 retries',
  'rate-limited': 'gave up after 10 retries',
};

function reasonFor(lastError: string | undefined): string {
  return REASON[lastError ?? ''] ?? "Jira sent a response we couldn't read";
}

/** `entry.body` is `unknown` on read (opaque, replayed verbatim) — extract
 * `timeSpentSeconds` defensively; a malformed/absent body degrades to `null`
 * rather than throwing. */
function extractSeconds(entry: OutboxEntry): number | null {
  if (entry.body && typeof entry.body === 'object' && 'timeSpentSeconds' in entry.body) {
    const v = (entry.body as { timeSpentSeconds?: unknown }).timeSpentSeconds;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export type WriteErrorBannerProps = {
  /** The outbox's `status: 'failed'` entries. The first entry that carries a
   * worklog write body (`post`/`put`/`comment` — a `delete` failure has no
   * "Nh saved locally" to report) is the one named in the banner. */
  entries: OutboxEntry[];
  onRetry: (id: string) => void;
  onLogElsewhere: () => void;
};

/** Review Finding 15 / D-7.9-18(a): the banner names one representative
 * ticket, but when MORE than one write has failed it must say so — silently
 * representing N failures as one is the same class of defect as a silent
 * cap. Counts every failed entry that carries a worklog write body (the
 * SAME predicate that selects `primary` below), not just delete failures. */
function countWorklogFailures(entries: OutboxEntry[]): number {
  return entries.filter((e) => e.kind !== 'delete').length;
}

export function WriteErrorBanner({
  entries,
  onRetry,
  onLogElsewhere,
}: WriteErrorBannerProps): React.ReactElement {
  const [mounted, setMounted] = useState(false);
  // A bare `useEffect(() => setMounted(true), [])` is flushed SYNCHRONOUSLY
  // by React Testing Library's `act()` wrapper around the initial render,
  // which would collapse this to a single-tick mount in tests even though a
  // real browser defers `useEffect` to after paint. A macrotask (`setTimeout`)
  // genuinely requires a tick to elapse in both environments, which is what
  // makes the "mounted empty, populated one tick later" contract provable
  // rather than merely asserted.
  //
  // Review Finding 18: 0ms is a delay calibrated to make the ASSERTION
  // provable in jsdom, not a delay chosen for real assistive-tech cadence —
  // screen readers observe live-region mutations on their own schedule, and
  // ~100ms is the conventional safe minimum for a mount-empty-then-populate
  // pattern to be reliably picked up. Bumped from 0 to 100; this is not a
  // hot path (a failed write is already stale by the time it is seen).
  const MOUNT_DELAY_MS = 100;
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), MOUNT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const primary = entries.find((e) => e.kind !== 'delete') ?? entries[0];
  const seconds = primary ? extractSeconds(primary) : null;
  const otherCount = Math.max(countWorklogFailures(entries) - 1, 0);
  const detail = primary
    ? `${primary.issueKey} · ${reasonFor(primary.lastError)}.` +
      (seconds !== null ? ` Your ${secondsToHoursDisplay(seconds)} is saved locally.` : '') +
      (otherCount > 0 ? ` (+${otherCount} more.)` : '')
    : '';

  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-error-border bg-error-soft px-[11px] py-[9px] shadow-hairline">
      <CircleX aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-status-error" />
      <div role="alert" className="flex flex-1 flex-col gap-1">
        {mounted && primary && (
          <>
            <p className="font-chrome text-body-sm font-medium text-error-ink">
              {STRINGS.headline}
            </p>
            <p className="tabular text-[12px] leading-[1.5] text-muted">{detail}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onRetry(primary.id)}
                className="rounded-md border border-error-border bg-white px-[10px] py-[5px] font-chrome text-label font-medium text-error-ink hover:bg-error-soft focus-visible:outline-none focus-visible:border-primary focus-visible:ring-focus"
              >
                {STRINGS.retry}
              </button>
              <button
                type="button"
                onClick={onLogElsewhere}
                className="rounded px-1 py-[5px] font-chrome text-label font-medium text-muted hover:text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-focus"
              >
                {STRINGS.logElsewhere}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
