import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus } from 'lucide-react';
import { useHierarchyTickets } from '@/hooks/useHierarchyTickets';
import { type HierarchySource, type HierarchyTask, type HierarchySubtask } from '@/lib/hierarchy';
import { searchTickets } from '@/lib/ticket-search';
import { createSubtask } from '@/lib/create-subtask';
import {
  getPinnedTickets,
  addPinnedTicket,
  type PinnedTicket,
} from '@/lib/storage/pinned-tickets';
import { log } from '@/lib/log';
import { cn } from '@/components/ui/utils';

const STRINGS = {
  searchPlaceholder: 'Search or pick\u2026',
  searchJiraPlaceholder: 'Type a ticket key (e.g., OTHER-789) or text',
  searchJiraCta: '+ Search Jira for a ticket\u2026',
  noResults: 'No matching tickets.',
  searchJiraLink: 'Search Jira for a specific key',
  recentlyUsed: 'Recently used',
  yourTasks: 'Your Tasks',
  unknownAssignee: 'Manager',
  createSubtask: '+ Create my subtask under this Task',
  createSubtaskPlaceholder: 'Subtask name\u2026',
  create: 'Create',
  cancel: 'Cancel',
  searchPrompt: 'Type a ticket key or search text',
};

const SOURCE_ORDER: HierarchySource[] = ['self', 'manager', 'skip-level'];

type PickerMode = 'hierarchy' | 'search-jira';

type TicketPickerProps = {
  onSelect: (ticketKey: string, ticketSummary: string) => void;
};

function matchesFilter(
  ticket: { key: string; summary: string },
  query: string,
): boolean {
  const q = query.toLowerCase();
  return (
    ticket.key.toLowerCase().includes(q) || ticket.summary.toLowerCase().includes(q)
  );
}

function sourceLabel(
  source: HierarchySource,
  assigneeDisplayName: string | null,
): string {
  if (source === 'self') return STRINGS.yourTasks;
  const name = assigneeDisplayName ?? STRINGS.unknownAssignee;
  return `${name}\u2019s Tasks`;
}

type FilteredTask = {
  task: HierarchyTask;
  taskMatches: boolean;
  matchingSubtasks: HierarchySubtask[];
  hasVisibleContent: boolean;
};

function filterTask(task: HierarchyTask, query: string): FilteredTask {
  const matchingSubtasks = task.subtasks.filter((st) =>
    matchesFilter(st, query),
  );
  const taskMatches = matchesFilter(task, query);
  return {
    task,
    taskMatches,
    matchingSubtasks,
    hasVisibleContent: taskMatches || matchingSubtasks.length > 0,
  };
}

type SourceGroup = {
  source: HierarchySource;
  label: string;
  filteredTasks: FilteredTask[];
  visibleTaskCount: number;
  hasVisibleContent: boolean;
};

function buildSourceGroups(
  hierarchyTasks: HierarchyTask[] | undefined,
  query: string,
): SourceGroup[] {
  if (!hierarchyTasks || hierarchyTasks.length === 0) return [];

  const bySource = new Map<HierarchySource, SourceGroup>();
  for (const task of hierarchyTasks) {
    const filtered = filterTask(task, query);
    let group = bySource.get(task.source);
    if (!group) {
      group = {
        source: task.source,
        label: sourceLabel(task.source, task.assigneeDisplayName),
        filteredTasks: [],
        visibleTaskCount: 0,
        hasVisibleContent: false,
      };
      bySource.set(task.source, group);
    }
    group.filteredTasks.push(filtered);
    if (filtered.hasVisibleContent) {
      group.visibleTaskCount += 1;
      group.hasVisibleContent = true;
    }
  }

  return SOURCE_ORDER.map((s) => bySource.get(s)).filter(
    (g): g is SourceGroup => g !== undefined,
  );
}

function isRowReachable(btn: HTMLButtonElement): boolean {
  let node: Element | null = btn.parentElement;
  while (node) {
    if (node.tagName === 'DETAILS' && !node.hasAttribute('open')) return false;
    node = node.parentElement;
  }
  return true;
}

export function TicketPicker({
  onSelect,
}: TicketPickerProps): React.ReactElement {
  const {
    data: hierarchyTasks,
    isLoading,
    isError,
    refetch,
  } = useHierarchyTickets();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [mode, setMode] = useState<PickerMode>('hierarchy');
  const [pinnedTickets, setPinnedTickets] = useState<PinnedTicket[]>([]);
  const [searchResults, setSearchResults] = useState<
    { key: string; summary: string }[]
  >([]);
  const [creatingForTask, setCreatingForTask] = useState<string | null>(null);
  const [subtaskName, setSubtaskName] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    void getPinnedTickets().then(setPinnedTickets);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 100);
  }, []);

  const { mutate: searchMutate, isPending: isSearchPending } = useMutation({
    mutationFn: (q: string) => searchTickets(q),
    onSuccess: (result) => {
      if (result.kind === 'ok') {
        setSearchResults(
          result.value.map((i) => ({ key: i.key, summary: i.fields.summary })),
        );
      } else {
        log.warn('picker.search.failed', { kind: result.kind });
        setSearchResults([]);
      }
    },
    onError: () => {
      setSearchResults([]);
    },
  });

  useEffect(() => {
    if (mode !== 'search-jira' || !debouncedQuery.trim()) {
      return;
    }
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchMutate(debouncedQuery);
    }, 300);
    return () => clearTimeout(searchDebounceRef.current);
  }, [debouncedQuery, mode, searchMutate]);

  const createMutation = useMutation({
    mutationFn: ({
      parentKey,
      summary,
    }: { parentKey: string; summary: string }) =>
      createSubtask(parentKey, summary),
    onSuccess: (result) => {
      if (result.kind === 'ok') {
        void queryClient.invalidateQueries({ queryKey: ['hierarchy-tickets'] });
        const key = result.value.key;
        const summary = result.value.summary;
        setCreatingForTask(null);
        setSubtaskName('');
        onSelect(key, summary);
      } else {
        log.warn('picker.create-subtask.failed', { kind: result.kind });
      }
    },
  });

  const handleSelect = useCallback(
    async (key: string, summary: string) => {
      log.info('picker.ticket.selected', { key });
      if (mode === 'search-jira') {
        await addPinnedTicket(key, summary);
        setPinnedTickets((prev) =>
          [
            { key, summary, pinnedAt: new Date().toISOString() },
            ...prev.filter((t) => t.key !== key),
          ].slice(0, 10),
        );
      }
      onSelect(key, summary);
      setQuery('');
      setDebouncedQuery('');
      if (mode === 'search-jira') {
        setMode('hierarchy');
      }
      inputRef.current?.focus();
    },
    [mode, onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode === 'search-jira') {
          setMode('hierarchy');
          setQuery('');
          setDebouncedQuery('');
        } else if (query) {
          setQuery('');
          setDebouncedQuery('');
        }
        return;
      }

      // Enter on a focused <button> activates it natively — no manual click needed.
      // (Calling btn.click() here would double-fire onClick → double onSelect.)

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const listbox = listboxRef.current;
        if (!listbox) return;
        const buttons = Array.from(
          listbox.querySelectorAll<HTMLButtonElement>(
            'button[data-picker-row="true"][role="option"]',
          ),
        ).filter(isRowReachable);
        if (buttons.length === 0) return;
        const currentIndex = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const nextIndex =
          e.key === 'ArrowDown'
            ? currentIndex < buttons.length - 1
              ? currentIndex + 1
              : 0
            : currentIndex > 0
              ? currentIndex - 1
              : buttons.length - 1;
        buttons[nextIndex]?.focus();
      }
    },
    [mode, query],
  );

  const filteredPinned = pinnedTickets.filter((t) =>
    matchesFilter(t, debouncedQuery),
  );
  const sourceGroups = buildSourceGroups(hierarchyTasks, debouncedQuery);
  const hasAnyHierarchyResults =
    filteredPinned.length > 0 ||
    sourceGroups.some((g) => g.hasVisibleContent);
  const filtering = !!debouncedQuery;

  if (isLoading) {
    return (
      <div className="mt-3 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 rounded bg-neutral-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-3 text-center">
        <p className="text-sm text-neutral-500">
          Couldn&rsquo;t load suggestions &mdash; try again
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-1 text-sm text-accent hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3" onKeyDown={handleKeyDown}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={
            mode === 'search-jira'
              ? STRINGS.searchJiraPlaceholder
              : STRINGS.searchPlaceholder
          }
          className="flex h-9 w-full rounded-md border border-neutral-200 bg-transparent pl-8 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          aria-label={
            mode === 'search-jira'
              ? STRINGS.searchJiraPlaceholder
              : STRINGS.searchPlaceholder
          }
        />
      </div>

      <div
        ref={listboxRef}
        role="listbox"
        aria-label="Ticket picker"
        className="mt-2 max-h-64 overflow-y-auto"
      >
        {mode === 'hierarchy' && (
          <>
            {filteredPinned.length > 0 && (
              <Disclosure
                label={`${STRINGS.recentlyUsed} (${filteredPinned.length})`}
                startOpen
                forceOpen={filtering}
              >
                {filteredPinned.map((ticket) => (
                  <TicketRow
                    key={ticket.key}
                    ticketKey={ticket.key}
                    summary={ticket.summary}
                    onSelect={() => void handleSelect(ticket.key, ticket.summary)}
                  />
                ))}
              </Disclosure>
            )}

            {sourceGroups
              .filter((g) => g.hasVisibleContent)
              .map((group) => (
                <Disclosure
                  key={group.source}
                  label={`${group.label} (${group.visibleTaskCount})`}
                  startOpen
                  forceOpen={filtering}
                >
                  {group.filteredTasks
                    .filter((t) => t.hasVisibleContent)
                    .map(({ task, taskMatches, matchingSubtasks }) => (
                      <TaskDisclosure
                        key={task.key}
                        task={task}
                        taskMatches={taskMatches}
                        matchingSubtasks={matchingSubtasks}
                        forceOpen={filtering}
                        creatingForTask={creatingForTask}
                        subtaskName={subtaskName}
                        onNameChange={setSubtaskName}
                        onAffordanceClick={() => setCreatingForTask(task.key)}
                        onSubmitSubtask={() => {
                          if (subtaskName.trim()) {
                            createMutation.mutate({
                              parentKey: task.key,
                              summary: subtaskName.trim(),
                            });
                          }
                        }}
                        onCancelSubtask={() => {
                          setCreatingForTask(null);
                          setSubtaskName('');
                        }}
                        isCreating={
                          creatingForTask === task.key && createMutation.isPending
                        }
                        onSubtaskSelect={(st) =>
                          void handleSelect(st.key, st.summary)
                        }
                      />
                    ))}
                </Disclosure>
              ))}

            {!hasAnyHierarchyResults && debouncedQuery && (
              <div className="py-3 text-center">
                <p className="text-sm text-neutral-500">{STRINGS.noResults}</p>
              </div>
            )}
          </>
        )}

        {mode === 'search-jira' && (
          <>
            {searchResults.length > 0
              ? searchResults.map((ticket) => (
                  <TicketRow
                    key={ticket.key}
                    ticketKey={ticket.key}
                    summary={ticket.summary}
                    onSelect={() => void handleSelect(ticket.key, ticket.summary)}
                  />
                ))
              : debouncedQuery ? (
                <div className="py-3 text-center">
                  {isSearchPending ? (
                    <div className="h-5 w-5 mx-auto rounded-full border-2 border-neutral-300 border-t-accent animate-spin" />
                  ) : (
                    <p className="text-sm text-neutral-500">{STRINGS.noResults}</p>
                  )}
                </div>
              ) : (
                <p className="py-3 text-center text-sm text-neutral-500">
                  {STRINGS.searchPrompt}
                </p>
              )}
          </>
        )}
      </div>

      {!hasAnyHierarchyResults && debouncedQuery && mode === 'hierarchy' && (
        <div className="py-2 text-center">
          <button
            type="button"
            onClick={() => {
              setMode('search-jira');
              inputRef.current?.focus();
            }}
            className="text-sm text-accent hover:underline"
          >
            {STRINGS.searchJiraLink}
          </button>
        </div>
      )}

      <div className="border-t border-neutral-100 pt-2 mt-1">
        <button
          type="button"
          onClick={() => {
            setMode('search-jira');
            setQuery('');
            setDebouncedQuery('');
            inputRef.current?.focus();
          }}
          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 rounded"
        >
          <Search className="h-3.5 w-3.5" />
          {STRINGS.searchJiraCta}
        </button>
      </div>
    </div>
  );
}

function Disclosure({
  label,
  startOpen,
  forceOpen,
  children,
}: {
  label: string;
  startOpen?: boolean;
  forceOpen?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [userOpen, setUserOpen] = useState(!!startOpen);
  const open = forceOpen || userOpen;
  return (
    <details
      open={open}
      onToggle={(e) => setUserOpen(e.currentTarget.open)}
      className="group"
    >
      <summary className="flex cursor-pointer items-center gap-1 px-2 py-1 text-xs font-medium text-neutral-500 select-none hover:text-neutral-700 list-none">
        <span className="group-open:rotate-90 transition-transform">{'\u25B8'}</span>
        {label}
      </summary>
      <div className="ml-1">{children}</div>
    </details>
  );
}

function TaskDisclosure({
  task,
  taskMatches,
  matchingSubtasks,
  forceOpen,
  creatingForTask,
  subtaskName,
  onNameChange,
  onAffordanceClick,
  onSubmitSubtask,
  onCancelSubtask,
  isCreating,
  onSubtaskSelect,
}: {
  task: HierarchyTask;
  taskMatches: boolean;
  matchingSubtasks: HierarchySubtask[];
  forceOpen: boolean;
  creatingForTask: string | null;
  subtaskName: string;
  onNameChange: (v: string) => void;
  onAffordanceClick: () => void;
  onSubmitSubtask: () => void;
  onCancelSubtask: () => void;
  isCreating: boolean;
  onSubtaskSelect: (st: HierarchySubtask) => void;
}): React.ReactElement {
  const [userOpen, setUserOpen] = useState(false);
  const open = forceOpen || userOpen;
  const isCreatingThis = creatingForTask === task.key;

  // When the Task header matches but none of its sub-tasks match (and it has
  // sub-tasks), render ALL sub-tasks so the expanded body isn't an empty
  // dead-end — the user can still pick a sub-task under a matched Task.
  const subtasksToRender =
    taskMatches && matchingSubtasks.length === 0 && task.subtasks.length > 0
      ? task.subtasks
      : matchingSubtasks;

  return (
    <details
      open={open}
      onToggle={(e) => setUserOpen(e.currentTarget.open)}
      className="group ml-2"
    >
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-50 list-none">
        <span className="group-open:rotate-90 transition-transform text-neutral-400">
          {'\u25B8'}
        </span>
        <span className="font-mono text-sm font-medium text-neutral-900 shrink-0">
          {task.key}
        </span>
        <span className="text-sm text-neutral-700 truncate">{task.summary}</span>
        <span className="ml-auto text-xs text-neutral-400 shrink-0">
          ({task.subtasks.length})
        </span>
      </summary>
      <div className="ml-3 mt-0.5">
        {subtasksToRender.map((st) => (
          <TicketRow
            key={st.key}
            ticketKey={st.key}
            summary={st.summary}
            indent
            onSelect={() => onSubtaskSelect(st)}
          />
        ))}
        {task.subtasks.length === 0 && !isCreatingThis && (
          <button
            type="button"
            data-picker-row="true"
            role="option"
            onClick={onAffordanceClick}
            aria-label={STRINGS.createSubtask}
            className="flex w-full items-center gap-1.5 pl-7 pr-3 py-1.5 text-left rounded text-xs text-accent hover:bg-accent-subtle"
          >
            <Plus className="h-3 w-3" />
            {STRINGS.createSubtask}
          </button>
        )}
        {isCreatingThis && (
          <CreateSubtaskForm
            taskKey={task.key}
            subtaskName={subtaskName}
            onNameChange={onNameChange}
            onSubmit={onSubmitSubtask}
            onCancel={onCancelSubtask}
            isCreating={isCreating}
          />
        )}
      </div>
    </details>
  );
}

function TicketRow({
  ticketKey,
  summary,
  indent,
  onSelect,
}: {
  ticketKey: string;
  summary: string;
  indent?: boolean;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      data-picker-row="true"
      role="option"
      onClick={onSelect}
      aria-label={`Pick ${ticketKey}: ${summary}`}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left rounded hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
        indent && 'pl-7',
      )}
    >
      <span className="font-mono text-sm font-medium text-neutral-900 shrink-0">
        {ticketKey}
      </span>
      <span className="text-sm text-neutral-700 truncate">{summary}</span>
    </button>
  );
}

function CreateSubtaskForm({
  taskKey,
  subtaskName,
  onNameChange,
  onSubmit,
  onCancel,
  isCreating,
}: {
  taskKey: string;
  subtaskName: string;
  onNameChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isCreating: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 pl-7 pr-3 py-1.5">
      <input
        type="text"
        value={subtaskName}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={STRINGS.createSubtaskPlaceholder}
        className="flex h-7 flex-1 rounded border border-neutral-200 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        autoFocus
        aria-label={`Create subtask under ${taskKey}`}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!subtaskName.trim() || isCreating}
        className="rounded bg-accent px-2 py-0.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isCreating ? '\u2026' : STRINGS.create}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-neutral-700"
      >
        {STRINGS.cancel}
      </button>
    </div>
  );
}
