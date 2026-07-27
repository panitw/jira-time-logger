import { CircleX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { secondsToHoursDisplay } from '@/lib/hours';
import type { OutboxEntry } from '@/lib/storage/outbox';

/**
 * The write-refused banner (Story 7.9, AC3) — the ONE legitimate red on the
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
 * (D-7.9-4, the exact `LoaderCircle`/`SearchPanel.tsx` precedent).
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

export function WriteErrorBanner({
  entries,
  onRetry,
  onLogElsewhere,
}: WriteErrorBannerProps): React.ReactElement {
  const [mounted, setMounted] = useState(false);
  // A bare `useEffect(() => setMounted(true), [])` is flushed SYNCHRONOUSLY
  // by React Testing Library's `act()` wrapper around the initial render,
  // which would collapse this to a single-tick mount in tests even though a
  // real browser defers `useEffect` to after paint. A macrotask (`setTimeout`,
  // 0ms) genuinely requires a tick to elapse in both environments, which is
  // what makes the "mounted empty, populated one tick later" contract
  // provable rather than merely asserted.
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const primary = entries.find((e) => e.kind !== 'delete') ?? entries[0];
  const seconds = primary ? extractSeconds(primary) : null;
  const detail = primary
    ? `${primary.issueKey} · ${reasonFor(primary.lastError)}.` +
      (seconds !== null ? ` Your ${secondsToHoursDisplay(seconds)} is saved locally.` : '')
    : '';

  return (
    <div className="-mt-[10px] mb-3 flex items-start gap-2 rounded-lg border border-error-border bg-error-soft px-[11px] py-[9px] shadow-hairline">
      <CircleX aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-status-error" />
      <div role="alert" className="flex flex-1 flex-col gap-1">
        {mounted && primary && (
          <>
            <p className="font-chrome text-body-sm font-medium text-error-ink">
              {STRINGS.headline}
            </p>
            <p className="text-[12px] leading-[1.5] text-muted">{detail}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onRetry(primary.id)}
                className="rounded-md border border-error-border bg-white px-[10px] py-[5px] font-chrome text-label font-medium text-error-ink hover:bg-error-soft focus-visible:outline-none focus-visible:ring-focus"
              >
                {STRINGS.retry}
              </button>
              <button
                type="button"
                onClick={onLogElsewhere}
                className="rounded px-1 py-[5px] font-chrome text-label font-medium text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-focus"
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
