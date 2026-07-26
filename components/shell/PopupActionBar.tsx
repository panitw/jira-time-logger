import { ArrowUpRight } from 'lucide-react';
import type { LoggedEntry } from '@/components/today/LoggedToday';
import { PtoQuickAction } from '@/components/today/PtoQuickAction';
import { openFullPage } from '@/lib/open-full-page';

/**
 * Fixed popup action bar (Story 7.2, AC4). Exactly two actions: the
 * relocated ghost "Mark today as time off" quick action, and a secondary
 * "Open week ↗" button that opens the full-page host shell in a new tab on
 * the Week section. NOT rendered in the disconnected state — the caller
 * scopes that.
 */

const STRINGS = {
  openWeek: 'Open week',
  openWeekAria: 'Open week review in a new tab',
};

type PopupActionBarProps = {
  onLogged: (entry: LoggedEntry) => void;
};

export function PopupActionBar({ onLogged }: PopupActionBarProps): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-surface px-[12px] py-[9px]">
      <PtoQuickAction onLogged={onLogged} />
      <button
        type="button"
        onClick={() => openFullPage('week')}
        aria-label={STRINGS.openWeekAria}
        className="inline-flex items-center gap-1.5 rounded-md border-[1.5px] border-border bg-white px-3 py-1.5 font-chrome text-label text-primary hover:bg-neutral-100 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-focus"
      >
        {STRINGS.openWeek}
        <ArrowUpRight className="h-[13px] w-[13px]" aria-hidden="true" />
      </button>
    </div>
  );
}
