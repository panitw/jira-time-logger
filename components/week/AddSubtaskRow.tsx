import { LoaderCircle, Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/components/ui/utils';
import { useTicketSearch, type SearchResultItem } from '@/hooks/useTicketSearch';
import { MAX_RESULTS } from '@/lib/ticket-search';

/**
 * The week grid's "add a row to this week" affordance (design source
 * `Jira Time Logger.dc.html:839-883`).
 *
 * Two states, exactly as the design draws them:
 *
 *   IDLE  — a dashed pill button, `+ Add a subtask to this week` (`:842`).
 *   OPEN  — a 34px search field (`:847`) with a FLOATING result popup
 *           beneath it (`:854`), headed "Add to this week" + a count pill,
 *           each row offering `Add row` or reporting `already in week`.
 *
 * This REPLACES the previous week-grid usage of `components/today/
 * TicketPicker.tsx`. That component is the popup surface's browse-the-
 * hierarchy tree — "Recently used", "Your Tasks (55)", per-Task create-a-
 * subtask affordances, a 16rem inner scroll clamp — and rendering it inline
 * across a 7-column grid footer is what made the week view look unfinished:
 * a 380px-wide tree stretched across a full-page table, with its own scroll
 * region nested inside the page's. The design specifies a fundamentally
 * different interaction here — live Jira search, flat results, one verb —
 * so this is a separate component rather than another `TicketPicker` prop.
 *
 * Search is `hooks/useTicketSearch` — the SAME seam the popup's `SearchPanel`
 * uses (one debounce, cancellation-safe via `useQuery` identity, the
 * assigned-to-you derivation already solved in D-7.4-22/AC4). Deliberately
 * NOT `TicketPicker`'s two-chained-debounce `useMutation` search, which that
 * hook's own header documents as the anti-pattern it replaced.
 *
 * ARIA: the combobox pattern `SearchPanel` already establishes — the input
 * owns `aria-activedescendant`, the `<ul>` is the listbox, and rows carry no
 * interactive descendants (D-7.4-19). `Add row` / `already in week` are
 * therefore rendered as TEXT, not buttons: the design draws them as affordance
 * labels inside the option, and a `<button>` inside a `role="option"` is
 * ARIA-invalid.
 */

const STRINGS = {
  addSubtask: '+ Add a subtask to this week',
  searchLabel: 'Search Jira to add a subtask row to this week',
  placeholder: 'Search any ticket — key or text',
  navHint: '↑↓ · ⏎ to add',
  close: 'Close the add-a-subtask search',
  resultsLabel: 'Tickets to add to this week',
  header: 'Add to this week',
  addRow: 'Add row',
  alreadyIn: 'already in week',
  footnote: 'Searched live in Jira — a new row starts empty, with no hours logged.',
  searching: 'Searching…',
  noResults: 'No matching tickets.',
  prompt: 'Type a ticket key or search text.',
  truncatedNote: (n: number) => `Showing the first ${n} matches — narrow your search to see more.`,
  rateLimited: 'Jira is rate-limiting search — try again in a moment.',
  searchFailed: 'Couldn’t search Jira — try again.',
  assignedToYou: 'assigned to you',
  unassigned: 'Unassigned',
  resultCount: (n: number) => (n === 1 ? '1 result' : `${n} results`),
};

export type AddSubtaskRowProps = {
  /** Keys already rendered as rows this week — drives the `already in week`
   * state. Activating such a row still calls `onAdd`; `WeeklyGrid` resolves
   * it by focusing the existing row rather than adding a duplicate, which is
   * the behaviour that predates this component. */
  existingKeys: ReadonlySet<string>;
  onAdd: (ticketKey: string, ticketSummary: string) => void;
  /** Fires when the search is dismissed (✕ or Escape) without adding. */
  onCancel?: () => void;
  /** Start in the open state — the day-header "Add a worklog…" entry point
   * opens the search directly rather than via the dashed button. */
  startOpen?: boolean;
};

/** D-7.4-19 item 1: the option's composed accessible name — the pill and the
 * add/already affordance are `aria-hidden` decoration inside the row, so
 * everything a screen reader needs is spelled out here instead. */
function optionAccessibleName(item: SearchResultItem, alreadyIn: boolean): string {
  const parts = [item.issue.key, item.issue.fields.summary];
  if (item.assignment === 'you') parts.push(STRINGS.assignedToYou);
  else if (item.assignment === 'other') {
    parts.push(item.issue.fields.assignee?.displayName ?? STRINGS.unassigned);
  }
  parts.push(alreadyIn ? STRINGS.alreadyIn : STRINGS.addRow);
  return parts.join(', ');
}

export function AddSubtaskRow({
  existingKeys,
  onAdd,
  onCancel,
  startOpen = false,
}: AddSubtaskRowProps): React.ReactElement {
  const [open, setOpen] = useState(startOpen);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = useCallback((i: number) => `${baseId}-option-${i}`, [baseId]);

  const searchState = useTicketSearch(query);
  const items = searchState.kind === 'results' ? searchState.items : [];
  const truncated = searchState.kind === 'results' && searchState.truncated;
  // The active row can outlive the list it indexed into (results shrink as
  // the query narrows) — clamp on read rather than resetting in an effect,
  // which would fight the user's ↑↓ mid-keystroke.
  const clampedActiveIndex = items.length === 0 ? 0 : Math.min(activeIndex, items.length - 1);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = useCallback((): void => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    onCancel?.();
    // Return focus to the affordance that opened it — closing must never
    // drop focus to <body>.
    requestAnimationFrame(() => openButtonRef.current?.focus());
  }, [onCancel]);

  const addItem = useCallback(
    (item: SearchResultItem): void => {
      onAdd(item.issue.key, item.issue.fields.summary);
      setOpen(false);
      setQuery('');
      setActiveIndex(0);
    },
    [onAdd],
  );

  // Deliberately NOT a `useCallback`: it closes over `items`, which
  // `useTicketSearch` rebuilds every render (a fresh ranked array), so the
  // memo could never hold — and it is only ever attached to a DOM node, so
  // a stable identity buys nothing anyway. Wrapping it would have meant
  // memoizing `items` purely to satisfy the linter about a memo with no
  // beneficiary.
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i >= items.length - 1 ? 0 : i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[clampedActiveIndex];
      if (item) addItem(item);
    }
  };

  if (!open) {
    return (
      <button
        ref={openButtonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-md border border-dashed border-chip-dashed-border bg-surface px-[11px] py-1.5 font-chrome text-[12.5px] font-medium text-primary hover:border-solid hover:bg-primary-soft focus-visible:outline-none focus-visible:border-solid focus-visible:border-primary focus-visible:ring-focus"
      >
        {STRINGS.addSubtask}
      </button>
    );
  }

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col" onKeyDown={handleKeyDown}>
      {/* `:847` — 1.5px primary border + the focus ring, the pairing
          `styles/globals.css#ring-focus` documents. */}
      <div className="flex h-[34px] items-center gap-2 rounded-md border-[1.5px] border-primary bg-surface px-2.5 ring-focus">
        <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            items.length > 0 ? optionId(clampedActiveIndex) : undefined
          }
          aria-label={STRINGS.searchLabel}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          placeholder={STRINGS.placeholder}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-faint focus:outline-none"
        />
        <span aria-hidden="true" className="shrink-0 font-chrome text-[11px] text-faint">
          {STRINGS.navHint}
        </span>
        <button
          type="button"
          onClick={close}
          aria-label={STRINGS.close}
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded text-faint hover:bg-chip-surface hover:text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-focus"
        >
          <X aria-hidden="true" className="h-3 w-3" />
        </button>
      </div>

      {/* `:854` — the floating result popup. `shadow-raised` is the token
          for this elevation; the design writes its second layer at .10 alpha
          against the token's .08, a delta invisible at 26px blur and not
          worth a near-duplicate token (D-7.3-14). */}
      <div className="mt-2 w-full overflow-hidden rounded-lg border border-popover-border bg-surface shadow-raised">
        <div className="flex items-center gap-2 border-b border-border-faint bg-surface-sunk px-[11px] py-[7px]">
          <span className="font-chrome text-eyebrow uppercase text-faint">
            {STRINGS.header}
          </span>
          {items.length > 0 && (
            <span className="tabular rounded-full bg-primary-soft px-[7px] py-px font-chrome text-[11px] font-medium text-primary">
              {items.length}
            </span>
          )}
        </div>

        <ul
          id={listboxId}
          role="listbox"
          aria-label={STRINGS.resultsLabel}
          aria-busy={searchState.kind === 'in-flight'}
          className="flex flex-col"
        >
          {items.map((item, i) => {
            const active = i === clampedActiveIndex;
            const alreadyIn = existingKeys.has(item.issue.key);
            return (
              <li
                key={item.issue.key}
                id={optionId(i)}
                role="option"
                aria-selected={active}
                aria-label={optionAccessibleName(item, alreadyIn)}
                onClick={() => {
                  setActiveIndex(i);
                  addItem(item);
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 border-b border-l-2 border-border-hairline border-l-transparent px-[11px] py-[9px] last:border-b-0 hover:bg-background',
                  active && 'border-l-primary bg-time-off-fill',
                )}
              >
                <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-px">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'tabular font-chrome text-[12px] text-primary',
                        active ? 'font-semibold' : 'font-medium',
                      )}
                    >
                      {item.issue.key}
                    </span>
                    {item.assignment === 'you' && (
                      <span className="rounded-full bg-primary-soft px-1.5 py-px font-chrome text-[10px] font-medium text-primary">
                        {STRINGS.assignedToYou}
                      </span>
                    )}
                    {item.assignment === 'other' && (
                      <span className="rounded-full border border-border bg-chip-surface px-1.5 py-px font-chrome text-[10px] font-medium text-faint">
                        {item.issue.fields.assignee?.displayName ?? STRINGS.unassigned}
                      </span>
                    )}
                  </div>
                  <span className="truncate text-[12.5px] text-muted">
                    {item.issue.fields.summary}
                  </span>
                </div>
                {alreadyIn ? (
                  <span
                    aria-hidden="true"
                    className="shrink-0 font-chrome text-[11.5px] font-medium text-faint"
                  >
                    {STRINGS.alreadyIn}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="shrink-0 rounded-[5px] border border-border px-2 py-1 font-chrome text-[11.5px] font-medium text-primary"
                  >
                    {STRINGS.addRow}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {searchState.kind !== 'results' && (
          <div className="px-[11px] py-[9px] text-[12.5px] text-muted" role="status">
            {searchState.kind === 'in-flight' && (
              <span className="flex items-center gap-2">
                <LoaderCircle
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin text-primary"
                />
                {STRINGS.searching}
              </span>
            )}
            {searchState.kind === 'idle' && STRINGS.prompt}
            {searchState.kind === 'empty' && STRINGS.noResults}
            {searchState.kind === 'failed' &&
              (searchState.errorKind === 'rate-limited'
                ? STRINGS.rateLimited
                : STRINGS.searchFailed)}
          </div>
        )}

        {truncated && (
          <p className="border-t border-border-hairline px-[11px] py-[7px] text-[11.5px] text-faint">
            {STRINGS.truncatedNote(MAX_RESULTS)}
          </p>
        )}

        {/* `:876` — the footnote states the CONSEQUENCE of adding (an empty
            row), not just where the results came from. */}
        <div className="flex items-center gap-[7px] bg-surface-sunk px-[11px] py-2">
          <span aria-hidden="true" className="text-[11px] text-faint">
            ◐
          </span>
          <span className="text-[11.5px] leading-[1.45] text-faint">{STRINGS.footnote}</span>
        </div>
      </div>

      {/* The result count, announced without duplicating the visible list. */}
      <span className="sr-only" role="status" aria-live="polite">
        {searchState.kind === 'results' ? STRINGS.resultCount(items.length) : ''}
      </span>
    </div>
  );
}
