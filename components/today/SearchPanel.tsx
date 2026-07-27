import { useMutation } from '@tanstack/react-query';
import { CornerDownLeft, LoaderCircle, Search, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import type { LoggedEntry } from '@/components/today/LoggedToday';
import { cn } from '@/components/ui/utils';
import { useTicketSearch, type SearchResultItem } from '@/hooks/useTicketSearch';
import {
  parseHours,
  hoursToSeconds,
  secondsToHoursDisplay,
  MAX_HOURS_PER_ENTRY,
} from '@/lib/hours';
import { postWorklog } from '@/lib/jira-client';
import { type JiraHierarchyIssue } from '@/lib/jira-types';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import { setLastLoggedTicket } from '@/lib/storage/last-logged';
import { enqueue as enqueueOutbox } from '@/lib/storage/outbox';
import { formatStartedISO, todayDateString } from '@/lib/worklog-date';

/**
 * Search as the browse mechanism (Story 7.4). `combobox` + `listbox` +
 * `option` per ORCHESTRATOR DECISION D-7.4-19 — DOM focus never leaves the
 * search `<input>`; `↑`/`↓` move `activeIndex` only, and each `role="option"`
 * carries ZERO interactive descendants (the mockup's in-row hour input and
 * `+` button are ARIA-invalid there — see the story's D-7.4-19). The single
 * hour input lives once, in the results header strip.
 */

const STRINGS = {
  placeholder: 'Search any ticket — key or text',
  resultsLabel: 'Results',
  navHint: '↑↓ to move · ⏎ to log',
  searching: 'Searching…',
  hoursLabel: (key: string) => `Hours for ${key}`,
  footnote: "Searched live in Jira — includes tickets that aren't assigned to you.",
  truncatedNote: (n: number) => `Showing the first ${n} matches — narrow your search to see more.`,
  noResults: 'No matching tickets.',
  rateLimited: 'Jira is rate-limiting search — try again in a moment.',
  searchFailed: "Couldn’t search Jira — try again.",
  assignedToYou: 'assigned to you',
  unassigned: 'Unassigned',
  // D-7.4-11 (owner decision): plain language stating the CONSEQUENCE, never
  // just the issue type — a user who has never heard "subtask" must still be
  // able to act on it. Amber only; this is never the write-refused red.
  nonSubtaskWarning: 'Hours logged here may not show up when your manager reviews approvals.',
  overLimitError: 'Hours per entry can’t exceed 24. Split into multiple entries if needed.',
  helperText: 'Use formats like 2.5h, 2h 30m, or 2:30',
  postError: 'Couldn’t log time — try again',
  pending: 'Pending — will retry',
  resultCount: (n: number) => (n === 1 ? '1 result' : `${n} results`),
  noResultsAnnouncement: 'No results',
};

const MAX_HOURS_INPUT_WIDTH_CH = 5;

export type SearchPanelHandle = {
  focus: () => void;
};

type SearchPanelProps = {
  /** AC7 / D-7.4-23: takes the autofocus the hour input would otherwise have
   * had, when the resume card is not on screen. Applied once, at mount. */
  autoFocus?: boolean;
  onLogged: (entry: LoggedEntry) => void;
  /** D-7.4-18: fires whenever `query.trim().length > 0` flips — the RAW
   * query, not the debounced one, so the shell can hide `TodayView` on the
   * very first keystroke rather than waiting out the debounce window. */
  onActiveChange: (active: boolean) => void;
  ref?: React.Ref<SearchPanelHandle>;
};

type ValidationResult =
  | { kind: 'empty' }
  | { kind: 'valid'; hours: number; seconds: number }
  | { kind: 'unparseable' }
  | { kind: 'over-limit' };

function validateHours(input: string): ValidationResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'empty' };
  const parsed = parseHours(trimmed);
  if (parsed.kind !== 'ok') return { kind: 'unparseable' };
  if (parsed.hours > MAX_HOURS_PER_ENTRY) return { kind: 'over-limit' };
  return { kind: 'valid', hours: parsed.hours, seconds: hoursToSeconds(parsed.hours) };
}

/** Mirrors D-7.4-11: fail toward SHOWING the warning — only an explicit
 * `subtask: true` suppresses it. Missing/absent `issuetype` (shouldn't
 * happen given the widened projection, but never trust the network) is
 * treated the same as "not a subtask" rather than silently hiding the risk. */
function isNonSubtask(issue: JiraHierarchyIssue): boolean {
  return issue.fields.issuetype?.subtask !== true;
}

/** D-7.4-19 item 1: the composed accessible name — the pill's / warning's
 * meaning must survive with colour and icon deleted. */
function optionAccessibleName(item: SearchResultItem): string {
  const parts = [item.issue.key, item.issue.fields.summary];
  if (item.assignment === 'you') {
    parts.push(STRINGS.assignedToYou);
  } else if (item.assignment === 'other') {
    parts.push(item.issue.fields.assignee?.displayName ?? STRINGS.unassigned);
  }
  if (isNonSubtask(item.issue)) {
    parts.push(STRINGS.nonSubtaskWarning);
  }
  return parts.join('. ');
}

const TEXT_INPUT_EXCLUDED_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** D-7.4-17: what counts as "a text input where `/` is a legitimate
 * character" — the exclusion the document-level `/` listener defers to. */
function isTextEntryElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !TEXT_INPUT_EXCLUDED_TYPES.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

export function SearchPanel({
  autoFocus,
  onLogged,
  onActiveChange,
  ref,
}: SearchPanelProps): React.ReactElement {
  const listboxId = useId();
  const messageId = useId();

  const inputRef = useRef<HTMLInputElement>(null);
  const autoFocusedRef = useRef(false);

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoursInput, setHoursInput] = useState('1');
  const [writeState, setWriteState] = useState<'idle' | 'pending' | 'error'>('idle');

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  const searchState = useTicketSearch(query);
  const items = searchState.kind === 'results' ? searchState.items : [];
  const hasResults = items.length > 0;
  const clampedActiveIndex = hasResults ? Math.min(activeIndex, items.length - 1) : 0;
  const activeItem = hasResults ? items[clampedActiveIndex] : undefined;
  // Finding 6 (Minor) / D-7.4-16: whether the CONTROL THAT PERFORMS THE
  // WRITE (the header hour input, and `⏎` in the search field) is currently
  // pointed at a non-subtask result — used to render the warning in the
  // always-visible header strip and wire it into the hour input's
  // accessible name/description, not only into the row.
  const activeIsNonSubtask = activeItem ? isNonSubtask(activeItem.issue) : false;

  const optionId = useCallback((i: number) => `${listboxId}-option-${i}`, [listboxId]);
  const warningId = `${listboxId}-warning`;

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus({ preventScroll: true }),
  }));

  // Finding 3 (Major) / D-7.4-17: `autoFocus` is a TRANSITION, not a constant
  // — `resume.status` can still be `'loading'` for up to
  // `COLD_START_SKELETON_BUDGET_MS` (D-7.3-10), so this effect can fire up
  // to two seconds after mount. Mirrors `ResumeCard.tsx`'s own reverse
  // focus-steal guard exactly: bail before latching if focus has already
  // been explicitly claimed by anything other than the document body.
  useEffect(() => {
    if (autoFocus && !autoFocusedRef.current) {
      if (document.activeElement && document.activeElement !== document.body) return;
      autoFocusedRef.current = true;
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [autoFocus]);

  useEffect(() => {
    onActiveChange(hasQuery);
  }, [hasQuery, onActiveChange]);

  // D-7.4-17: document-level `/` listener, added/removed in one effect.
  useEffect(() => {
    function handleSlash(e: KeyboardEvent): void {
      if (e.key !== '/') return;
      const active = document.activeElement;
      if (
        isTextEntryElement(active) &&
        (active as HTMLElement).getAttribute('data-slash-passthrough') !== 'true'
      ) {
        return; // let '/' type normally — covers the search field itself too.
      }
      e.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
    }
    document.addEventListener('keydown', handleSlash);
    return () => document.removeEventListener('keydown', handleSlash);
  }, []);

  // A genuinely NEW result set (not just a re-render of the same one)
  // re-preselects the first row and resets the shared hour input to its
  // default. Keyed off the STABLE key list, not the array reference —
  // `useTicketSearch` returns a fresh array every render even when the
  // underlying data hasn't changed, so keying off the array itself would
  // fight the user's own arrow-key navigation.
  const resultKeysSignature = items.map((i) => i.issue.key).join('|');
  useEffect(() => {
    setActiveIndex(0);
    setHoursInput('1');
  }, [resultKeysSignature]);

  // Finding 2 (Major) / D-7.4-16: `↑`/`↓` move `activeIndex` only — DOM
  // focus never leaves the search input (D-7.4-19) and both arrow handlers
  // `preventDefault()`, so the browser never scrolls the list on its own.
  // With up to `MAX_RESULTS` rows inside the popup's single scroll region
  // (7.2 AC2), the active option — and the D-7.4-11 warning it may carry —
  // can end up entirely off-screen at the exact moment `⏎` writes. Runs on
  // EVERY selection change, including the initial preselection (the
  // `resultKeysSignature` effect above resets `activeIndex` to 0, which
  // this effect also observes via `clampedActiveIndex`). `block: 'nearest'`
  // scrolls only when the option isn't already visible, so the list never
  // jumps. `document.getElementById` + `scrollIntoView` — rather than a
  // ref-array — targets the option inside the popup's ONE existing scroll
  // region (no nested `overflow-*` is introduced here or anywhere else in
  // this file).
  useEffect(() => {
    if (!hasResults) return;
    document
      .getElementById(optionId(clampedActiveIndex))
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [clampedActiveIndex, hasResults, optionId]);

  const logMutation = useMutation({
    mutationFn: async (vars: { key: string; seconds: number; started: string }) =>
      postWorklog(vars.key, { timeSpentSeconds: vars.seconds, started: vars.started }),
  });
  const { mutate: logMutate, isPending: isLogPending } = logMutation;

  // Mirrors `ResumeCard.submitSeconds` exactly (Task 6) — ok / outbox-enqueue
  // (network + rate-limited) / error branching, badge broadcast, and the
  // `lastLoggedTicket` write. On success: clear the query, restore the
  // lists (via `onActiveChange` firing through the `hasQuery` effect above),
  // and return focus to the search field.
  const submitSeconds = useCallback(
    (issue: JiraHierarchyIssue, seconds: number) => {
      if (isLogPending) return;
      const key = issue.key;
      const summary = issue.fields.summary;
      const started = formatStartedISO(todayDateString());
      setWriteState('idle');
      logMutate(
        { key, seconds, started },
        {
          onSuccess: (result) => {
            if (result.kind === 'ok') {
              log.info('search.worklog.posted', { key });
              void sendMessage('badge-update', { hoursMissing: 0 });
              void setLastLoggedTicket({
                key,
                summary,
                seconds,
                startedAt: started,
                recordedAt: new Date().toISOString(),
              }).catch((e) => {
                log.error('last-logged.write.failed', { key, cause: String(e) });
              });
              const entry: LoggedEntry = {
                key,
                summary,
                hoursDisplay: secondsToHoursDisplay(seconds),
                started: todayDateString(),
                seconds,
                worklogId: result.value.id,
              };
              onLogged(entry);
              setQuery('');
              setActiveIndex(0);
              inputRef.current?.focus({ preventScroll: true });
            } else if (result.kind === 'network' || result.kind === 'rate-limited') {
              log.warn('search.worklog.post.failed', { key, kind: result.kind });
              void enqueueOutbox({
                kind: 'post',
                endpoint: `rest/api/3/issue/${encodeURIComponent(key)}/worklog`,
                issueKey: key,
                body: { timeSpentSeconds: seconds, started },
              }).catch((e) => {
                log.error('outbox.enqueue.failed', { key, cause: String(e) });
              });
              setWriteState('pending');
            } else {
              log.warn('search.worklog.post.failed', { key, kind: result.kind });
              setWriteState('error');
            }
          },
          onError: (e) => {
            log.error('search.worklog.post.error', { key, error: String(e) });
            setWriteState('error');
          },
        },
      );
    },
    [isLogPending, logMutate, onLogged],
  );

  const validation = validateHours(hoursInput);
  // Finding 9 (Nit): `'empty'` used to be neither `valid` (so `logItem`
  // silently no-ops) nor amber (so the message region rendered nothing) —
  // clearing the field and pressing `⏎` gave no post AND no explanation.
  // Treated identically to `'unparseable'` for messaging; it still fails
  // closed (no post) exactly as before.
  const isAmber =
    validation.kind === 'unparseable' ||
    validation.kind === 'over-limit' ||
    validation.kind === 'empty';
  const isErrorMessage = !isAmber && writeState === 'error';
  const hasVisibleMessage = isAmber || isErrorMessage;

  const logItem = useCallback(
    (item: SearchResultItem) => {
      if (validation.kind !== 'valid' || isLogPending) return;
      submitSeconds(item.issue, validation.seconds);
    },
    [validation, isLogPending, submitSeconds],
  );

  // AC5: "⏎ logs the selected result without a second step" — both the
  // search field's Enter and the header hour input's Enter call this.
  const handleEnter = useCallback(() => {
    if (!activeItem) return;
    logItem(activeItem);
  }, [activeItem, logItem]);

  const handleArrow = useCallback(
    (direction: 1 | -1) => {
      if (!hasResults) return;
      setActiveIndex((prev) => {
        const len = items.length;
        return (prev + direction + len) % len;
      });
    },
    [hasResults, items.length],
  );

  const handleFieldKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // D-7.4-24: Esc must preventDefault + stopPropagation, or Chrome closes
      // the popup on an unhandled Escape.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (hasQuery) {
          setQuery('');
          // Query non-empty case: focus stays in the field (badge stays `esc`).
        } else {
          inputRef.current?.blur();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleArrow(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleArrow(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEnter();
      }
    },
    [hasQuery, handleArrow, handleEnter],
  );

  const handleHourKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEnter();
      }
    },
    [handleEnter],
  );

  // The listbox is a PERSISTENT container whenever a search is active — it
  // is valid ARIA for a listbox to be empty (no `option` children), and
  // keeping it mounted across in-flight/empty/failed/results gives
  // `aria-busy` one stable home to toggle on, rather than a container that
  // only exists once results have already landed.
  const activeOptionId = hasResults ? optionId(clampedActiveIndex) : undefined;

  // Finding 4 (Minor): `failed` (rate-limited AND generic) and `in-flight`
  // used to resolve to `''` here, so the `role="status"` region announced
  // nothing in those states. Because the listbox is a PERSISTENT container
  // (mounted across every state, not just once results exist), an
  // unannounced `failed` state is indistinguishable from "no results" to a
  // screen-reader user — D-7.4-13 makes a 429 more likely in normal use, so
  // that gap matters most exactly when it is most likely to occur.
  const announcement =
    searchState.kind === 'results'
      ? STRINGS.resultCount(searchState.items.length)
      : searchState.kind === 'empty'
        ? STRINGS.noResultsAnnouncement
        : searchState.kind === 'in-flight'
          ? STRINGS.searching
          : searchState.kind === 'failed'
            ? searchState.errorKind === 'rate-limited'
              ? STRINGS.rateLimited
              : STRINGS.searchFailed
            : '';

  return (
    // D-7.9-16: when `resume.status === 'none'`, this panel is promoted to
    // the first child of the scroll region and now shares `<main>`'s
    // baseline-break offset (`breaksHeaderBaseline = !anyBanner`, no longer
    // gated on `resume.status !== 'none'`) — `relative z-[1]` is required
    // wherever that offset applies, matching `ResumeCard.tsx`'s own
    // unconditional `relative z-[1]`. A no-op when this panel renders BELOW
    // the resume card (its own stacking is unaffected either way).
    <div className="relative z-[1] mb-3">
      <div
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-[9px] shadow-hairline',
          'focus-within:border-[1.5px] focus-within:border-primary focus-within:ring-focus',
        )}
      >
        <Search aria-hidden="true" className="h-[13px] w-[13px] shrink-0 text-faint" />
        <input
          ref={inputRef}
          role="combobox"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleFieldKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={STRINGS.placeholder}
          aria-label={STRINGS.placeholder}
          aria-keyshortcuts="/"
          aria-expanded={hasQuery}
          aria-controls={hasQuery ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          className="tabular w-full min-w-0 flex-1 bg-transparent text-[13.5px] focus:outline-none"
        />
        <span
          aria-hidden="true"
          className={cn(
            'shrink-0 rounded-sm border px-1 text-eyebrow',
            focused
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-neutral-100 text-faint',
          )}
        >
          {focused ? 'esc' : '/'}
        </span>
      </div>

      {hasQuery && (
        <div className="mt-2">
          <span role="status" aria-live="polite" className="sr-only">
            {announcement}
          </span>

          <div className="flex items-center gap-1.5">
            <span className="text-eyebrow uppercase text-faint">{STRINGS.resultsLabel}</span>
            {hasResults && (
              <span
                aria-hidden="true"
                className="tabular rounded-full bg-primary-soft px-[7px] py-px text-eyebrow text-primary"
              >
                {items.length}
              </span>
            )}
            {hasResults && <span className="text-[11px] text-faint">{STRINGS.navHint}</span>}
            {searchState.kind === 'in-flight' && (
              // D-7.4-25 (recorded pre-emptively for Story 7.6): this
              // `LoaderCircle` is genuine in-flight work — the search request
              // is actually pending against Jira — NOT a day status. Story
              // 7.6's AC5 forbids `LoaderCircle`/`EyeOff` as a day status, but
              // that rule governs `components/shared/DayStatusIndicator.tsx`'s
              // vocabulary; this spinner is a different, legitimate use of
              // the same icon and is intentionally left as-is.
              <LoaderCircle
                aria-hidden="true"
                className="h-[13px] w-[13px] motion-safe:animate-spin text-primary"
              />
            )}
            {hasResults && activeItem && (
              <div className="ml-auto flex h-[34px] shrink-0 items-center gap-1 rounded-md border-[1.5px] border-primary px-[9px] focus-within:ring-focus">
                <input
                  value={hoursInput}
                  onChange={(e) => {
                    setHoursInput(e.target.value);
                    setWriteState('idle');
                  }}
                  onKeyDown={handleHourKeyDown}
                  type="text"
                  inputMode="decimal"
                  // Finding 7 (Nit) / D-7.4-17: this input accepts the same
                  // hour syntax as `ResumeCard`'s (`validateHours` →
                  // `parseHours`), where `/` is equally never a legitimate
                  // character — without this attribute `/` types a stray
                  // slash here instead of returning focus to search.
                  data-slash-passthrough="true"
                  aria-label={STRINGS.hoursLabel(activeItem.issue.key)}
                  aria-keyshortcuts="Enter"
                  aria-invalid={isAmber || undefined}
                  // Finding 6 (Minor) / D-7.4-16: the WRITE control itself —
                  // not only the row — carries the warning in its
                  // description when the active result is a non-subtask, so
                  // a user who tabs straight into this input and presses
                  // `⏎` (an explicitly supported path) is not warning-blind.
                  aria-describedby={
                    [activeIsNonSubtask ? warningId : null, hasVisibleMessage ? messageId : null]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  style={{ width: `${MAX_HOURS_INPUT_WIDTH_CH}ch` }}
                  className="tabular min-w-0 bg-transparent text-[13.5px] focus:outline-none"
                />
                <span aria-hidden="true" className="tabular text-[13.5px] text-faint">
                  h
                </span>
                <span
                  aria-hidden="true"
                  className="flex shrink-0 items-center rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground"
                >
                  <CornerDownLeft aria-hidden="true" className="h-[13px] w-[13px]" />
                </span>
              </div>
            )}
          </div>

          {/* Finding 2 / Finding 6 (Major/Minor) / D-7.4-16: the D-7.4-11
              warning rendered in the ALWAYS-VISIBLE write area — the header
              strip, not only the (possibly scrolled-off-screen) result row.
              This is what makes the warning reachable "without scrolling"
              when a non-subtask option is active, per D-7.4-16's test
              requirement. Not `role="alert"` — the row already carries the
              warning in its accessible name via `aria-activedescendant`, and
              re-announcing on every arrow-key move over the same non-subtask
              result would be noisy; this paragraph is the always-visible
              backstop, wired to the hour input via `aria-describedby` above. */}
          {activeIsNonSubtask && (
            <p
              id={warningId}
              className="mt-1 flex items-center gap-1 text-[11px] text-amber-ink"
            >
              <TriangleAlert aria-hidden="true" className="h-3 w-3 shrink-0" />
              {STRINGS.nonSubtaskWarning}
            </p>
          )}

          {hasResults && (
            <div id={messageId} className="mt-1 min-h-[1rem]">
              {(validation.kind === 'unparseable' || validation.kind === 'empty') && (
                <p role="alert" className="text-[11.5px] text-amber-ink">
                  {STRINGS.helperText}
                </p>
              )}
              {validation.kind === 'over-limit' && (
                <p role="alert" className="text-[11.5px] font-medium text-amber-ink">
                  {STRINGS.overLimitError}
                </p>
              )}
              {isErrorMessage && (
                // AC4 survivor: red fires only here, when `postWorklog` came
                // back non-retryable — Jira actually refused this write.
                <p role="alert" className="text-[11.5px] font-medium text-state-danger">
                  {STRINGS.postError}
                </p>
              )}
              {!isAmber && writeState === 'pending' && (
                <span
                  role="status"
                  aria-live="polite"
                  className="inline-flex items-center gap-1 rounded-md bg-state-info-subtle px-2 py-0.5 text-[11.5px] text-neutral-700"
                >
                  {STRINGS.pending}
                </span>
              )}
            </div>
          )}

          {/* AC6: a PERSISTENT listbox container — an empty listbox (no
              `option` children) is valid ARIA, so `aria-busy` and
              `aria-controls`/`aria-activedescendant` above all have one
              stable element to point at across every search state, rather
              than a container that only mounts once results exist. */}
          <ul
            id={listboxId}
            role="listbox"
            aria-label={STRINGS.resultsLabel}
            aria-busy={searchState.kind === 'in-flight'}
            className="mt-1 flex flex-col"
          >
            {searchState.kind === 'results' &&
              items.map((item, i) => {
                const active = i === clampedActiveIndex;
                const nonSubtask = isNonSubtask(item.issue);
                return (
                  <li
                    key={item.issue.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={active}
                    aria-label={optionAccessibleName(item)}
                    onClick={() => {
                      setActiveIndex(i);
                      logItem(item);
                    }}
                    className={cn(
                      'flex cursor-pointer flex-col gap-0.5 border-b border-border-faint px-[11px] py-[9px] last:border-b-0 hover:bg-background',
                      active && 'border-l-2 border-l-primary bg-primary-soft',
                    )}
                  >
                    <div aria-hidden="true" className="flex items-center gap-1.5">
                      <span className="tabular text-body-sm font-medium text-foreground">
                        {item.issue.key}
                      </span>
                      {item.assignment === 'you' && (
                        <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-eyebrow text-primary">
                          {STRINGS.assignedToYou}
                        </span>
                      )}
                      {item.assignment === 'other' && (
                        <span className="rounded-full border border-border bg-neutral-100 px-1.5 py-0.5 text-eyebrow text-faint">
                          {item.issue.fields.assignee?.displayName ?? STRINGS.unassigned}
                        </span>
                      )}
                    </div>
                    <span aria-hidden="true" className="line-clamp-1 text-body-sm text-muted">
                      {item.issue.fields.summary}
                    </span>
                    {nonSubtask && (
                      <span
                        aria-hidden="true"
                        className="flex items-center gap-1 text-[11px] text-amber-ink"
                      >
                        <TriangleAlert aria-hidden="true" className="h-3 w-3 shrink-0" />
                        {STRINGS.nonSubtaskWarning}
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>

          {searchState.kind === 'in-flight' && (
            <p className="py-2 text-center text-body-sm text-faint">{STRINGS.searching}</p>
          )}

          {searchState.kind === 'empty' && (
            <p className="py-3 text-center text-body-sm text-faint">{STRINGS.noResults}</p>
          )}

          {searchState.kind === 'failed' && (
            <p className="py-3 text-center text-body-sm text-faint">
              {searchState.errorKind === 'rate-limited' ? STRINGS.rateLimited : STRINGS.searchFailed}
            </p>
          )}

          {searchState.kind === 'results' && searchState.truncated && (
            <p className="mt-1 text-[11px] text-faint">{STRINGS.truncatedNote(items.length)}</p>
          )}
          {hasResults && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-faint">
              <Search aria-hidden="true" className="h-[11px] w-[11px] shrink-0" />
              {STRINGS.footnote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
