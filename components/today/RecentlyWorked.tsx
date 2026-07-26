import { Plus } from 'lucide-react';
import type { RecentlyWorkedItem } from '@/hooks/useRecentlyWorked';

/**
 * "Recently worked" (Story 7.5, AC1/AC2/AC6) — the popup's replacement for
 * the deleted `TicketPicker` browse tree. Renders UP TO
 * `MAX_RECENTLY_WORKED` (4) rows fed by `useRecentlyWorked` (the
 * already-fetched week-worklogs query — zero extra network calls) plus a
 * fixed handoff row to search.
 *
 * D-7.5-13 (orchestrator decision): NEVER padded to a fixed count, and NEVER
 * reserves empty space — the whole section is absent when there is nothing
 * to show (AC1's "exactly four" is deliberately not honoured literally; see
 * the story's D-7.5-16).
 *
 * D-7.5-12 (owner decision): the handoff row carries NO count — "More
 * assigned tickets · Search to find them →", verbatim, no number. Rendering
 * a true "N assigned" figure would cost a Jira request this story otherwise
 * removes from the popup's first-paint path (see the story's D-7.5-17).
 *
 * D-7.5-11 (owner decision): each row's `+` opens `QuickLogForm` PRE-TARGETED
 * at that ticket via `onSelectTicket` — it must NEVER reach up and retarget
 * the resume card. `TodayView` (the only caller) wires `onSelectTicket` to
 * its own `handleSelect`/`selectedTicket`/`QuickLogForm` state, which has no
 * channel to the resume card at all — see `TodayView.tsx` and D-7.3-9.
 */

const STRINGS = {
  heading: 'Recently worked',
  addLabel: (key: string) => `Log time to ${key}`,
  // D-7.5-12: verbatim, no count.
  handoff: 'More assigned tickets · Search to find them →',
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** A short, local recency note for a row's first line ("today" / "yesterday"
 * / "N days ago"). Self-contained (does not import `ResumeCard`'s
 * `recencyNote`, which is phrased for the resume card's own "logged Xh
 * today" copy and is out of scope for this component to couple to). */
function recencyLabel(startedAt: string, now: Date = new Date()): string {
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return '';
  const daysAgo = Math.round(
    (startOfLocalDay(now).getTime() - startOfLocalDay(started).getTime()) / MS_PER_DAY,
  );
  if (daysAgo <= 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  return `${daysAgo} days ago`;
}

export type RecentlyWorkedProps = {
  items: RecentlyWorkedItem[];
  /** Opens `QuickLogForm` pre-targeted at this ticket (D-7.5-11). */
  onSelectTicket: (key: string, summary: string) => void;
  /** The `SearchPanelHandle` seam Story 7.4 published for this row
   * (D-7.4-26) — threaded down from `App.tsx` via `TodayView`. */
  onRequestSearchFocus?: (() => void) | undefined;
};

export function RecentlyWorked({
  items,
  onSelectTicket,
  onRequestSearchFocus,
}: RecentlyWorkedProps): React.ReactElement | null {
  // D-7.5-13: zero recent tickets renders NO section at all — not an empty
  // card, not reserved dead space (Story 7.3 AC5).
  if (items.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-eyebrow uppercase text-faint">{STRINGS.heading}</span>
        <span className="tabular rounded-full bg-primary-soft px-[7px] py-px text-eyebrow text-primary">
          {items.length}
        </span>
        <span aria-hidden="true" className="h-px flex-1 bg-border-faint" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-hairline">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex h-[52px] items-center gap-[10px] border-b border-border-faint px-[11px] py-[9px] hover:bg-background focus-within:ring-focus"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="flex items-center gap-1.5">
                <span className="tabular font-chrome text-body-sm font-medium text-primary">
                  {item.key}
                </span>
                <span className="text-eyebrow text-faint">{recencyLabel(item.startedAt)}</span>
              </span>
              <span className="truncate text-body-sm text-muted">{item.summary}</span>
            </div>
            <button
              type="button"
              aria-label={STRINGS.addLabel(item.key)}
              onClick={() => onSelectTicket(item.key, item.summary)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-focus"
            >
              <Plus className="h-[13px] w-[13px]" aria-hidden="true" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={onRequestSearchFocus}
          className="flex h-[40px] w-full items-center px-[11px] text-left text-body-sm text-muted hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-focus"
        >
          {STRINGS.handoff}
        </button>
      </div>
    </div>
  );
}
