---
baseline_commit: 20f035ce8a10b237ff5bee01ce1fd37f45e11efc
---

# Story 2.3: TicketPicker — 2-Level Browse Tree with Search & Create Subtask

Status: done

## Story

As a connected worker,
I want a fast picker that shows my likely tickets and lets me search Jira or create a subtask when needed,
so that I can find the right ticket in under 2 seconds.

## Acceptance Criteria

1. **Picker renders a 2-level browse tree from hierarchy data.** When the Today view mounts, `TicketPicker` consumes `useHierarchyTickets()` and displays a collapsible 2-level tree using native `<details>/<summary>` elements. **Level 1 sections are grouped by `task.source`** into collapsible groups: `"Your Tasks (N)"` (source `self`), `"<assigneeDisplayName>'s Tasks (N)"` (source `manager`), `"<assigneeDisplayName>'s Tasks (N)"` (source `skip-level`). Inside each source section, **Task rows are expandable headers, NOT log targets** — clicking a Task row expands/collapses its level-2 sub-task leaves. **Sub-tasks the worker owns appear nested at level 2 as `<button>` leaves** — only sub-task rows are selectable. Ticket keys render in `font-mono text-sm font-medium neutral.900`; summaries in `font-sans text-sm font-normal neutral.700`. A search `<input>` with a `Search` icon from `lucide-react` is focused on mount.
   *[Source: epics.md § Story 2.3 AC 1; UX-DR8; UX-DR2; Review decision 2026-06-21 — source-grouped tree, sub-task = selectable leaf]*

2. **Real-time filtering with 100ms debounce.** When the user types in the search input, the picker filters Task and subtask rows against a case-insensitive substring match on key + summary with a 100ms debounce. Non-matching rows are hidden; `<details>` groups whose children all match expand automatically.
   *[Source: epics.md § Story 2.3 AC 2; UX-DR8]*

3. **"+ Create my subtask under this Task" affordance (FR9).** When the user expands a Task header that has no worker-owned sub-task, a "+ Create my subtask under this Task" affordance appears inside the expanded Task (alongside the sub-task leaves). Clicking it opens an inline name input; submitting calls `POST /rest/api/3/issue` with `issueType: { name: 'Sub-task' }`, `parent: { key: <taskKey> }`, `assignee: { accountId: <currentUser> }`, `summary: <typed name>`, `project: { key: <projectKey> }`. On success, the new subtask appears in the tree under that Task and is auto-selected (the sub-task is the log unit; the Task header itself never calls `onSelect`).
   *[Source: epics.md § Story 2.3 AC 3; FR9; Review decision 2026-06-21 — sub-task is the log unit]*

4. **Empty state with Search-Jira affordance.** When no ticket in the hierarchy matches the search query, an empty state appears: "No matching tickets." followed by a "Search Jira for a specific key" link. The "+ Search Jira for a ticket…" affordance is also always available at the bottom of the picker.
   *[Source: epics.md § Story 2.3 AC 4; UX-DR27; UX-DR8]*

5. **Search-Jira mode.** When the user clicks "Search Jira", the input placeholder changes to "Type a ticket key (e.g., OTHER-789) or text". Typing triggers `GET /rest/api/3/search/jql` with a JQL query searching by key or text (debounced 300ms). Results appear below; selecting one adds it to the worker's "Recent / Pinned" list in `chrome.storage.local` and surfaces it alongside hierarchy results on subsequent picker opens.
   *[Source: epics.md § Story 2.3 AC 5; UX-DR8]*

6. **Recently used group.** When the worker has previously pinned tickets, a "▸ Recently used (N)" group appears at the top of the tree above "Tasks" on picker mount.
   *[Source: epics.md § Story 2.3 AC 6; UX-DR8]*

7. **Keyboard navigation.** Arrow keys move focus between rows in DOM order; Enter selects the focused row; Esc clears the search input or closes Search-Jira mode. Each row has `aria-label="Pick <ticketKey>: <summary>"` and rows are `<button>` elements — no clickable `<div>`.
   *[Source: epics.md § Story 2.3 AC 7; UX-DR29; UX-DR32]*

8. **Gates pass.** `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test --run`, and `pnpm build` all pass.
   *[Source: architecture.md § Enforcement Guidelines]*

## Tasks / Subtasks

- [x] **Task 1 — Install missing shadcn/ui primitives** (AC: #1, #7)
  - [x] `pnpm dlx shadcn@latest add input` — adds `components/ui/input.tsx`
  - [x] Verify the Input component integrates with the existing styling system (`globals.css` theme tokens, `cn()` utility)

- [x] **Task 2 — Add `jiraPost` to `lib/jira-client.ts`** (AC: #3)
  - [x] Add `jiraPost<T>(path, body, schema)` following the same pattern as `jiraGet`: scheduler-gated, OAuth header, 401 refresh, Zod parse, `Result<T, JiraError>` return
  - [x] Add co-located test in `lib/jira-client.test.ts` covering success, 401-refresh, 429, and parse-error paths

- [x] **Task 3 — Add pinned/recent ticket storage** (AC: #5, #6)
  - [x] Create `lib/storage/pinned-tickets.ts` with WXT `storage.defineItem<PinnedTicket[]>('local:pinnedTickets', { fallback: [] })`
  - [x] Define `PinnedTicket = { key: string; summary: string; pinnedAt: string (ISODateTime) }`
  - [x] Export `getPinnedTickets()`, `addPinnedTicket(key, summary)`, `removePinnedTicket(key)`
  - [x] Cap the list at 10 entries (FIFO eviction of oldest)
  - [x] Add co-located `lib/storage/pinned-tickets.test.ts`

- [x] **Task 4 — Add Jira search-by-keyword schema and function** (AC: #5)
  - [x] In `lib/jira-types.ts`, add `JiraTicketSearchSchema` reusing `JiraIssueSchema` (id, key, fields.summary) — the same shape the catch-all component uses
  - [x] In `lib/hierarchy.ts` (or a new `lib/ticket-search.ts`), add `searchTickets(query: string): Promise<Result<JiraIssue[], JiraError>>` that builds a JQL query: `key ~ "<query>" OR summary ~ "<query>"` and calls `jiraGet` through the scheduler
  - [x] Handle the case where the query looks like a ticket key (contains `-` and digits): try `key = "<query>"` first
  - [x] Add co-located test

- [x] **Task 5 — Add create-subtask function** (AC: #3)
  - [x] In `lib/hierarchy.ts` (or a new `lib/create-subtask.ts`), add `createSubtask(parentKey, summary): Promise<Result<CreatedSubtask, JiraError>>` that calls `jiraPost('rest/api/3/issue', body, JiraCreateIssueSchema)` — the create response is `{id,key}` only (no `fields`), so the summary is echoed from the typed input, not parsed from the response
  - [x] The payload must include `project` (derived from parent key prefix), `issuetype: { name: 'Sub-task' }`, `parent: { key: parentKey }`, `summary`, and `assignee: { accountId: <currentUser> }`
  - [x] Fetch the current user's `accountId` from `GET /rest/api/3/myself` (cached via TanStack Query or settings storage)
  - [x] Add co-located test

- [x] **Task 6 — Build `TicketPicker` component** (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] Create `components/today/TicketPicker.tsx`
  - [x] Render search input (focused on mount, `Search` icon from `lucide-react`, 100ms debounce via `useDeferredValue` or `setTimeout`)
  - [x] Render hierarchy tree using native `<details>/<summary>` for collapsible groups
  - [x] **Group level-1 sections by `task.source`**: "Your Tasks" (self), "<assignee>'s Tasks" (manager), "<assignee>'s Tasks" (skip-level)
  - [x] **Task rows are expandable headers, NOT log targets** — clicking expands to reveal sub-task leaves + create-subtask affordance
  - [x] **Only sub-task rows call `onSelect`** (the sub-task is the log unit); `onSelect(task.key)` path removed entirely
  - [x] Filter logic: case-insensitive substring match on `key + summary`; auto-expand matching groups
  - [x] Row rendering: `<button role="option">` elements with `aria-label="Pick <key>: <summary>"`; keyboard nav via arrow keys, Enter to select, Esc to clear
  - [x] "+ Create my subtask" inline affordance for Tasks with no worker-owned subtask (shown inside expanded Task)
  - [x] "+ Search Jira for a ticket…" affordance at bottom; enters search-Jira mode with 300ms debounce
  - [x] Empty state: "No matching tickets." with search-Jira link (UX-DR27)
  - [x] On sub-task selection: call `onSelect(ticketKey, ticketSummary)` callback prop
  - [x] Co-located `components/today/TicketPicker.test.tsx` with Testing Library

- [x] **Task 7 — Integrate TicketPicker into TodayView** (AC: #1)
  - [x] Update `components/today/TodayView.tsx` to render `<TicketPicker>` below the heading
  - [x] Wire `onSelect` callback (for now, log the selection — Story 2.4 will add the QuickLogForm)
  - [x] Show skeleton while `useHierarchyTickets()` is loading (UX-DR26)
  - [x] Show error state on query failure (UX-DR23 `ErrorState` pattern)
  - [x] Update `components/today/TodayView.test.tsx`

- [x] **Task 8 — Verify gates** (AC: #8)
  - [x] `pnpm lint` — zero errors
  - [x] `pnpm tsc --noEmit` — zero errors
  - [x] `pnpm test --run` — all tests pass
  - [x] `pnpm build` — extension builds successfully

### Review Findings

<!-- Appended by code-review workflow 2026-06-21 -->

- [x] [Review][Patch] **(Decision resolved → source-grouped tree, sub-task = selectable leaf)** Restructure the picker IA: (1) **Group level-1 Tasks by source** into sections ("Your Tasks" / "<manager>'s Tasks" / "<skip-level>'s Tasks") using `task.source` + `assigneeDisplayName`. (2) **Task rows become expandable headers, NOT log targets** — expanding reveals the worker's sub-tasks (level 2) + the "+ Create my subtask" affordance. (3) **Only sub-task rows and newly-created sub-tasks call `onSelect`** — remove the `onSelect(task.key)` path entirely (logging is sub-task-level; Tasks are containers). (4) Ensure leaves are reachable (fix the collapsed-on-mount dead-end; this supersedes the controlled-`open` and arrow-nav-into-collapsed-rows patches below as they get rewritten here). (5) Update the spec: AC #1 (source grouping), AC #3 (sub-task is the log unit), Task 6, and the architecture diagram. (HIGH) [components/today/TicketPicker.tsx:248-310]
  - Superseded original finding: **AC #1 tree is not grouped by source.** The picker renders one `<details>` group **per Task** (label `${task.summary} (${matchingSubtasks.length})`, TicketPicker.tsx:248-310) and never reads `task.source`; there is no "▸ Tasks (N)" source grouping (the `STRINGS.tasks` constant is dead). Worse, groups are collapsed on mount (`defaultOpen={!!debouncedQuery}` → false), and each Task's own selectable row sits **inside** its collapsed group — so on a fresh open no Task is directly pickable without first expanding it. Spec AC #1 + Task 6 + the architecture diagram all call for level-1 Task rows grouped under a source/"Tasks" header with subtasks nested at level 2. (HIGH) [components/today/TicketPicker.tsx:248-310] — **OWNER DECISION:** (a) restructure to source/"Tasks (N)" grouping with Task rows at level 1 (also resolves the not-pickable-on-mount dead-end); or (b) ratify per-Task grouping, amend AC #1/Task 6/architecture — but still fix the collapsed-on-mount unpickable-Task issue.
- [x] [Review][Patch] **`createSubtask` returns `parse-error` on a successful create — AC #3 flow is dead in production.** `POST /rest/api/3/issue` returns only `{id,key,self}` (no `fields`), but `createSubtask` parses it with `JiraIssueSchema` (requires `fields.summary`) → `parseError` on real success → `createMutation.onSuccess` takes the `else` branch, never invalidates/auto-selects; `onSelect(...result.value.fields.summary)` would also deref undefined. Same response-shape trap as Story 2.2. **Fix:** use a create-specific schema (`{id,key}`), source the summary from the user-typed `subtaskName`, rewrite the create-subtask + TicketPicker tests to the real no-`fields` shape (they currently mock a fabricated `fields` object that hides the bug), and correct the spec's Task 5/Dev Notes which prescribe `JiraIssueSchema`. (HIGH) [lib/create-subtask.ts:31; lib/jira-types.ts:32-38; components/today/TicketPicker.tsx:99-107; lib/create-subtask.test.ts; components/today/TicketPicker.test.tsx]
- [x] [Review][Patch] **Disclosure triangle renders the literal text `▸`.** `PickerGroup` has `<span>▸</span>` as JSX **text** (TicketPicker.tsx:389); JSX does not interpret `\u` escapes in element text, so every group header shows `▸ …` instead of `▸ …`. (Contrast the `STRINGS` object, where `\u` escapes are in real string literals and decode correctly.) Fix: `{'▸'}` or paste the literal ▸. (MEDIUM, user-visible) [components/today/TicketPicker.tsx:389]
- [x] [Review][Patch] **Invalid ARIA: `role="listbox"` with no `role="option"` children.** Container is `role="listbox"` (TicketPicker.tsx:215) but rows are plain `<button data-picker-row>` with no `role="option"`, and the search `<input>` + bottom CTA also sit inside the listbox. Dev Notes specify `<button role="option">`. Add `role="option"` to rows (and scope the listbox to just the rows), per AC #7 / UX-DR32. (MEDIUM, a11y) [components/today/TicketPicker.tsx:215,409-413]
- [x] [Review][Patch] **Arrow-key nav focuses rows hidden inside collapsed `<details>`.** `handleKeyDown` collects `button[data-picker-row]` and filters `!btn.hidden`, but filtered-out rows are removed from the DOM (never `hidden`) so the filter is a no-op, and rows inside collapsed groups are still in the DOM → ArrowUp/Down moves focus to invisible rows. Also the bottom "Search Jira" CTA and the empty-state link lack `data-picker-row`, so nav can't reach them. Scope nav to visible rows (e.g. `offsetParent !== null`). (MEDIUM) [components/today/TicketPicker.tsx:153-166]
- [x] [Review][Patch] **`<details open={defaultOpen}>` fights manual toggling.** `open` is a controlled attribute React re-applies every render; since `defaultOpen` derives from `debouncedQuery`, any re-render snaps the group back, overriding the user's expand/collapse. Use the uncontrolled `defaultOpen` semantics or manage open state via `onToggle`. (MEDIUM) [components/today/TicketPicker.tsx:387]
- [x] [Review][Defer] AC #8 "all gates pass" is not literally satisfied: `pnpm test --run` fails on `lib/storage/view-state.test.ts` (vi.mock hoisting error) — PRE-EXISTING from Story 2.1 (already tracked in deferred-work), not caused by 2.3. tsc/lint/build pass. [lib/storage/view-state.test.ts] — deferred, separate defect.
- [x] [Review][Defer] JQL injection / breakage via unescaped search text in the `summary ~ "<query>"` branch (the `key = ` branch is regex-guarded) [lib/ticket-search.ts:25] — deferred, low risk (worst case a malformed query → handled error); escape `"`/`\` when hardening.
- [x] [Review][Defer] Minor UX polish: ~400ms cumulative search latency from chained 100ms+300ms debounces; create-affordance predicate `task.subtasks.length === 0` conflates "no subtask exists" with "no subtask assigned to me" for manager/skip Tasks; Esc from a non-form element leaves an open create affordance dangling [components/today/TicketPicker.tsx:64-94,261,135-147] — deferred, non-blocking polish.

#### Round 2 (re-review 2026-06-21)

All 6 prior items (1 decision + 5 patches) confirmed RESOLVED by all three layers (impl + tests + spec): source-grouped tree with non-selectable Task headers and sub-task leaves, `createSubtask` uses `JiraCreateIssueSchema` ({id,key}) and echoes the typed summary (tests now mock the realistic no-`fields` shape), `{'▸'}` glyph, `role="option"` rows scoped under `role="listbox"`, and `isRowReachable` keyboard nav with `userOpen`/`onToggle`/`forceOpen`. tsc/lint/build pass; 49 story-2.3 tests green. Two NEW patches from the restructure:

- [x] [Review][Patch] **Enter double-fires on a focused row.** `handleKeyDown` calls `btn.click()` on Enter without `e.preventDefault()`; a native `<button>` also activates on Enter, so `onClick` fires twice → double `onSelect` / double `addPinnedTicket`. Harmless while `onSelect` only logs, but will double-trigger once Story 2.4 wires a form. Drop the manual `btn.click()` (native handles it) or `preventDefault()`. (MEDIUM) [components/today/TicketPicker.tsx:255-261]
- [x] [Review][Patch] **Search dead-end: a Task that matches by its own key/summary but whose sub-tasks don't match (and has ≥1 sub-task) expands to an empty body** — `matchingSubtasks` is empty, and the create affordance is gated on `task.subtasks.length === 0` so it doesn't show. Nothing is selectable under a matched Task. Fix: when the parent Task matches, render its non-matching sub-tasks too (or show the affordance). (MEDIUM) [components/today/TicketPicker.tsx:563-585]
- [x] [Review][Defer] No user-visible feedback on create-subtask failure — `createMutation` non-ok only `log.warn`s; the inline form stays open with no message (likely for cross-project/permission failures under manager Tasks) [components/today/TicketPicker.tsx:212-214] — deferred, error-state UX; revisit when the log flow matures in Story 2.4.
- [x] [Review][Defer] Pinned & Search-Jira results are flat selectable rows that can log a NON-sub-task (Task/Story/Epic) directly, inconsistent with the new "sub-task is the only log unit" rule enforced in the hierarchy tree [components/today/TicketPicker.tsx:357-371,428-436] — deferred, PRODUCT DECISION: search/pin is an explicit escape hatch for arbitrary external tickets; confirm whether to constrain it to sub-tasks or document the exception.
- [x] [Review][Defer] Creating a sub-task under a manager/skip-level Task assumes the worker can create in that (possibly cross-project) project and that it has an issue type named exactly `Sub-task`; `deriveProjectKey` takes the parent's prefix and failures surface only as a logged warning [lib/create-subtask.ts:9-12; components/today/TicketPicker.tsx:573] — deferred, ties to the create-failure-feedback item above.

#### Round 3 (re-review 2026-06-21)

Both round-2 patches RESOLVED: Enter double-fire removed (native `<button>` handles Enter; TicketPicker.tsx:255-256); search dead-end fixed via `subtasksToRender` fallback to all sub-tasks when a Task matches but its sub-tasks don't (TicketPicker.tsx:546-549,570). tsc clean; 51 story-2.3 tests pass (2 added). No open HIGH/MEDIUM findings remain — only the deferred items. **Story 2.3 done.**

## Dev Notes

### Critical: this is the first interactive UI component in the Today view

Story 2.2 built the data layer only (`lib/hierarchy.ts` + `hooks/useHierarchyTickets.ts`). This story builds the **picker UI** that consumes it. The TicketPicker is the defining interaction of the entire product — the 30-second worklog starts here.

### Key patterns from previous stories (do not deviate)

- **Named exports only.** No `export default`. Every function/component is `export function X()`.
- **No direct `console.log`.** Use `lib/log.ts` helpers (`log.info('picker.ticket.selected', { key })`).
- **Co-located `*.test.ts`** beside every new module.
- **`lib/` modules are framework-agnostic.** No React imports in `lib/` files.
- **No barrel files.** Import directly: `import { TicketPicker } from '@/components/today/TicketPicker'`.
- **`Result<T, E>` at every I/O boundary.** New `jiraPost` must follow the same pattern as `jiraGet`.
- **STRINGS constants.** UI copy lives in component-level named string constants (UX-DR31).
- **shadcn/ui Button variants.** Use existing `Button` component from `components/ui/button.tsx` with `primary`/`secondary`/`ghost` variants.

### Current codebase state (read these files before modifying)

| File | Current state | What this story changes |
|---|---|---|
| `components/today/TodayView.tsx` | Bare shell — heading + date only | Add `<TicketPicker>` below heading |
| `components/today/TodayView.test.tsx` | 3 basic smoke tests | Add picker integration tests |
| `lib/jira-client.ts` | Only `jiraGet` exists | Add `jiraPost` |
| `lib/jira-types.ts` | `JiraIssueSchema`, `JiraHierarchyIssueSchema`, `JiraSearchSchema` | Add `JiraTicketSearchSchema` (or reuse `JiraSearchSchema`) |
| `lib/hierarchy.ts` | `fetchHierarchy()` returns `HierarchyTask[]` | No changes needed; consumed via hook |
| `hooks/useHierarchyTickets.ts` | `useQuery` wrapping `fetchHierarchy` | No changes needed |
| `lib/storage/settings.ts` | No pinned/recent ticket items | Add pinned-tickets storage (new file) |
| `lib/storage/quota.ts` | Already handles `local:recent-*` and `local:pinned-*` keys in `clearCache()` | No changes needed |
| `entrypoints/popup/App.tsx` | Two-tab layout (Today/Week), 360px min-width | No changes needed |
| `entrypoints/popup/main.tsx` | QueryClient with retry/rate-limit config | No changes needed |
| `components/ui/` | `button.tsx`, `dialog.tsx`, `tabs.tsx`, `utils.ts` | Add `input.tsx` via shadcn CLI |

### Installed UI primitives

Currently installed shadcn/ui: **Button**, **Dialog**, **Tabs**, **cn() utility**.

**Missing and needed:** `Input` — install via `pnpm dlx shadcn@latest add input`.

**NOT needed:** Do not install `cmdk`, `@radix-ui/react-popover`, `@radix-ui/react-scroll-area`, or `@radix-ui/react-combobox`. The spec (UX-DR8) calls for native `<details>/<summary>` for collapsible groups and a plain `<input>` for search. Keep it simple.

### `jiraPost` implementation pattern

Follow `jiraGet` exactly. The only differences:

```ts
export async function jiraPost<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<Result<T, JiraError>> {
  // Same as jiraGet but:
  // - method: 'POST'
  // - headers include 'Content-Type': 'application/json'
  // - body: JSON.stringify(body)
  // Everything else identical: scheduler.acquire, auth header, 401 refresh, 429 handling, Zod parse
}
```

### Jira create-issue payload shape

The `POST /rest/api/3/issue` endpoint expects:

```json
{
  "fields": {
    "project": { "key": "PROJ" },
    "summary": "My new subtask",
    "issuetype": { "name": "Sub-task" },
    "parent": { "key": "PROJ-123" },
    "assignee": { "accountId": "5b10ac8d..." }
  }
}
```

The project key is derived from the parent ticket key (everything before the `-`). The current user's `accountId` is available from `lib/storage/tokens.ts` (the auth bundle) or from a cached `/rest/api/3/myself` call.

### Pinned/recent tickets storage

```ts
// lib/storage/pinned-tickets.ts
import { storage } from 'wxt/utils/storage';

export type PinnedTicket = {
  key: string;
  summary: string;
  pinnedAt: string;
};

const MAX_PINNED = 10;

export const pinnedTicketsItem = storage.defineItem<PinnedTicket[]>(
  'local:pinnedTickets',
  { fallback: [] },
);

export async function getPinnedTickets(): Promise<PinnedTicket[]> { ... }
export async function addPinnedTicket(key: string, summary: string): Promise<void> {
  // Add to front; deduplicate by key; cap at MAX_PINNED (FIFO)
}
export async function removePinnedTicket(key: string): Promise<void> { ... }
```

The quota module (`lib/storage/quota.ts`) already clears `local:pinned-*` and `local:recent-*` keys in `clearCache()`. No changes needed there.

### TicketPicker component architecture

```
TicketPicker
├── SearchInput (plain <input> with Search icon, focused on mount)
├── RecentlyUsedGroup (<details>/<summary>, from pinned-tickets storage)
├── SourceSections (one <details>/<summary> per task.source group)
│   ├── "Your Tasks (N)"        (source=self)
│   ├── "<manager>'s Tasks (N)" (source=manager)
│   └── "<skip>'s Tasks (N)"    (source=skip-level)
│   └── TaskHeader (expandable, NOT a log target — clicking toggles expansion)
│       ├── SubtaskRow (<button role="option">, indented, selectable leaf)
│       └── CreateSubtaskAffordance (inline, appears inside expanded Task with no worker subtask)
├── SearchJiraMode (replaces tree with search results, 300ms debounce)
└── EmptyState ("No matching tickets." + search-Jira link)
```

**Props:**

```ts
type TicketPickerProps = {
  onSelect: (ticketKey: string, ticketSummary: string) => void;
};
```

### Debounce implementation

Do NOT add a debounce library. Use a simple `useRef` + `setTimeout` pattern:

```ts
const timerRef = useRef<ReturnType<typeof setTimeout>>();
const handleSearch = (value: string) => {
  clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => setDebouncedQuery(value), 100); // or 300 for Jira search
};
```

### Keyboard navigation

The picker uses arrow-key navigation among visible `<button>` rows. Implementation approach:

1. Wrap the tree in a `role="listbox"` container.
2. Each row is a `<button role="option">` with `aria-label`.
3. `onKeyDown` handler on the container: ArrowDown/ArrowUp moves focus among visible buttons; Enter triggers selection; Esc clears search or exits search-Jira mode.
4. Use `document.querySelectorAll` scoped to the container to find visible buttons; skip hidden ones.

### Filtering logic

```ts
function matchesFilter(ticket: { key: string; summary: string }, query: string): boolean {
  const q = query.toLowerCase();
  return ticket.key.toLowerCase().includes(q) || ticket.summary.toLowerCase().includes(q);
}
```

For `<details>` groups: if any child matches, the group auto-expands (`open` attribute set). If no children match, the group is hidden.

### Search-Jira mode

When the user clicks "+ Search Jira for a ticket…" or when the hierarchy filter yields zero results:

1. The input placeholder changes to "Type a ticket key (e.g., OTHER-789) or text".
2. Typing triggers a JQL search with 300ms debounce.
3. JQL strategy:
   - If the query looks like a ticket key (matches `/^[A-Z]+-\d+$/i`): search by `key = "<query>"`
   - Otherwise: search by `summary ~ "<query>"` with `statusCategory != Done AND updated >= -28d`
4. Results render as a flat list of `<button>` rows.
5. Selecting a result calls `addPinnedTicket()` and then `onSelect()`.

### "+ Create my subtask" affordance

When the user clicks a Task row that has no worker-owned subtask:

1. Instead of calling `onSelect`, show an inline "+ Create my subtask under this Task" button below the Task row.
2. Clicking it reveals an inline `<input>` for the subtask name + a "Create" button.
3. On submit, call `createSubtask(parentKey, summary)`.
4. On success, the new subtask appears in the tree (invalidate `['hierarchy-tickets']` query) and is auto-selected via `onSelect`.

### Skeleton and error states

While `useHierarchyTickets()` is loading:
- Show a skeleton with 4-6 shimmer rows (UX-DR26, `LoadingSkeleton` pattern from `globals.css` `animate-shimmer`).

On error:
- Show "Couldn't load suggestions — try again" with a retry button that calls `refetch()` (UX-DR27).

### Testing strategy

- **`TicketPicker.test.tsx`:** Use `@testing-library/react` with a mocked `useHierarchyTickets` hook. Test: renders tree, filters on type, keyboard nav, empty state, search-Jira mode, create-subtask flow.
- **`jira-client.test.ts`:** Add tests for `jiraPost` covering success, 401-refresh, 429, parse-error.
- **`pinned-tickets.test.ts`:** Test add/remove/cap/dedup.
- **`ticket-search.test.ts`:** Test JQL construction for key vs text queries.
- **`TodayView.test.tsx`:** Update to verify picker renders.

### UX constraints

- **Popup width: 360px min.** The picker must work within this constraint. No horizontal scrolling; truncate long summaries with `truncate` or `text-ellipsis overflow-hidden`.
- **No external dependencies.** Do not add `cmdk`, `downshift`, or other combobox libraries. Native `<details>/<summary>` + `<input>` + `<button>` is sufficient.
- **Motion system:** Popup mount fade-in (120ms ease-out per UX-DR7) is already handled by `motion-safe:animate-fade-in` on TodayView. No additional animations needed for the picker itself.
- **Color discipline:** Ticket keys in `font-mono text-sm font-medium text-neutral-900`; summaries in `font-sans text-sm text-neutral-700`. No brand purple on picker rows (purple is reserved for primary CTAs per UX-DR5).

### Deferred work (not this story)

- **QuickLogForm (hours input + submit):** Story 2.4.
- **Catch-all picker (KNP flat list):** Story 2.5.
- **PTO quick action:** Story 2.5.
- **Edit/delete worklogs:** Story 2.6.
- **Outbox queue:** Story 2.7.
- **Popup pre-warming from service worker:** Story 3.2.

### References

- [Epics: Story 2.3](../planning-artifacts/epics.md#story-23)
- [PRD: FR8 hierarchy pre-fill, FR9 create subtask](../planning-artifacts/prd.md)
- [Architecture: Frontend Architecture / Component architecture](../planning-artifacts/architecture.md#frontend-architecture)
- [Architecture: Project structure (components/today/)](../planning-artifacts/architecture.md#complete-project-directory-structure)
- [UX: UX-DR8 TicketPicker spec](../planning-artifacts/ux-design-specification.md)
- [UX: UX-DR27 empty states](../planning-artifacts/ux-design-specification.md)
- [UX: UX-DR29 form patterns](../planning-artifacts/ux-design-specification.md)
- [UX: UX-DR32 accessibility](../planning-artifacts/ux-design-specification.md)
- [Previous story: 2.2 hierarchy data layer](./2-2-hierarchy-walk-build-pre-fill-ticket-source.md)
- [Existing hierarchy types](../../lib/hierarchy.ts)
- [Existing jira-client pattern](../../lib/jira-client.ts)
- [Existing TodayView shell](../../components/today/TodayView.tsx)
- [Existing popup QueryClient config](../../entrypoints/popup/main.tsx)
- [Existing quota module (handles pinned-* keys)](../../lib/storage/quota.ts)

## Dev Agent Record

### Agent Model Used

openrouter/z-ai/glm-5.2

### Debug Log References

- Initial test run hung indefinitely: `TicketPicker.tsx` had an infinite render loop caused by `searchMutation` (a new object each render from `useMutation`) in the `useEffect` dependency array, combined with `setSearchResults([])` creating a new array reference each render. Fixed by destructuring the stable `mutate` function (`searchMutate`) instead of depending on the whole mutation object.
- `TodayView.test.tsx` apostrophe mismatch: test regex used a straight apostrophe (`'`) but the component renders a curly apostrophe (`&rsquo;` → `'`). Fixed test matcher to use `/Couldn.t load suggestions/`.
- Create-subtask flow logic bug: the original code opened the inline form directly when clicking a Task with no subtasks, skipping the "+ Create my subtask" affordance step required by AC #3. Fixed by introducing a two-step state (`affordanceTask` shows the affordance button; `creatingForTask` shows the inline form).
- Missing co-located `TicketPicker.test.tsx`: created with 16 tests covering mount focus, tree rendering, aria-labels, onSelect, filtering, empty state, search-Jira mode, pinning, create-subtask flow, and keyboard navigation.
- **Review follow-up (2026-06-21):** `createSubtask` returned `parse-error` on real success because `JiraIssueSchema` requires `fields.summary` but `POST /rest/api/3/issue` returns only `{id,key,self}`. Fixed by introducing `JiraCreateIssueSchema = {id,key}` and echoing the user-typed summary from the input. Tests updated to the real no-`fields` response shape.
- **Review follow-up (2026-06-21):** Restructured the picker IA per review decision: source-grouped sections ("Your Tasks" / "<assignee>'s Tasks"), Task rows are expandable `<summary>` headers (NOT log targets), only sub-task leaves call `onSelect`, source sections open on mount (fixing the collapsed-on-mount dead-end). Spec updated (AC #1, AC #3, Task 6, architecture diagram).
- **Review follow-up (2026-06-21):** Disclosure triangle — `<span>\u25B8</span>` in JSX text doesn't decode `\u` escapes; changed to `<span>{'\u25B8'}</span>` (string literal).
- **Review follow-up (2026-06-21):** ARIA — `role="listbox"` was on the outer container (including the search input); scoped to a dedicated rows container with `aria-label="Ticket picker"`. Sub-task rows now have `role="option"`.
- **Review follow-up (2026-06-21):** Arrow-key nav — old `!btn.hidden` filter was a no-op (filtered rows are removed from DOM, not hidden). Replaced with `isRowReachable` that walks ancestors to skip rows inside closed `<details>`. Added Enter handler to trigger the focused row's `click()`.
- **Review follow-up (2026-06-21):** `<details open>` fought manual toggling because `open` is controlled by React. Replaced with `Disclosure`/`TaskDisclosure` components using `useState` + `onToggle` so React's `open` prop stays synced with the user's toggle. Added `forceOpen={!!debouncedQuery}` to auto-expand during active filtering while preserving the user's last toggle state otherwise.

### Completion Notes List

- **Task 1:** `components/ui/input.tsx` installed via shadcn; integrates with `cn()` utility and existing theme tokens.
- **Task 2:** `jiraPost<T>(path, body, schema)` added to `lib/jira-client.ts` mirroring `jiraGet` (scheduler-gated, OAuth header, 401 refresh, 429 handling, Zod parse, `Result<T, JiraError>` return). Co-located test covers success, 401-refresh-and-retry, 429, parse-error, and auth-expired paths.
- **Task 3:** `lib/storage/pinned-tickets.ts` created with `PinnedTicket` type, WXT `storage.defineItem`, `getPinnedTickets`/`addPinnedTicket`/`removePinnedTicket` (FIFO cap at 10, dedup-by-key-to-front). Co-located test covers add/remove/dedup/cap/no-op.
- **Task 4:** `lib/ticket-search.ts` created with `searchTickets(query)` building JQL (`key = "..."` for ticket-key-shaped queries; `summary ~ "..." AND statusCategory != Done AND updated >= -28d` otherwise) via `jiraGet` + `JiraSearchSchema`. Co-located test covers key vs text JQL construction, empty results, and error pass-through.
- **Task 5:** `lib/create-subtask.ts` created with `createSubtask(parentKey, summary)` fetching `/rest/api/3/myself` for accountId, deriving project key from parent, and calling `jiraPost('rest/api/3/issue', ...)`. **Review fix:** uses `JiraCreateIssueSchema = {id,key}` (Jira's create response omits `fields`) and echoes the user-typed summary. Co-located test covers success, myself-failure, post-error, project-key derivation, and parse-error.
- **Task 6:** `components/today/TicketPicker.tsx` — **restructured per review decision**: source-grouped sections ("Your Tasks" / "<assignee>'s Tasks" via `task.source` + `assigneeDisplayName`), Task rows are expandable `<summary>` headers (NOT log targets), only sub-task leaves are `<button role="option">` calling `onSelect`. `Disclosure`/`TaskDisclosure` components use `useState` + `onToggle` (controlled-but-synced, fixing the open-attribute fight). Source sections `startOpen` (fix collapsed-on-mount dead-end); `forceOpen={!!debouncedQuery}` auto-expands during filtering. Arrow-key nav uses `isRowReachable` (walks ancestors for closed `<details>`) instead of `!btn.hidden` no-op. 100ms debounce for hierarchy filter, 300ms for search-Jira. Co-located `TicketPicker.test.tsx` with 22 tests covering source grouping, Task-not-a-button, ARIA roles, arrow-nav-skip-collapsed, Enter-to-select, create-subtask flow, search-Jira mode, pinning, skeleton/error states.
- **Task 7:** `TodayView.tsx` renders `<TicketPicker>` below the heading; `onSelect` logs via `lib/log`. Skeleton + error states delegated to `TicketPicker`. `TodayView.test.tsx` updated with 7 tests.
- **Task 8:** All gates pass — `pnpm lint` (0 errors), `pnpm tsc --noEmit` (0 errors), `pnpm test --run` (241 tests pass), `pnpm build` (extension builds successfully). (Note: pre-existing `lib/storage/view-state.test.ts` failure tracked in deferred-work, unrelated to 2.3.)
- **Review follow-ups resolved (2026-06-21):** 6 active findings — (1) source-grouped restructure [HIGH], (2) createSubtask schema bug [HIGH], (3) literal ▸ disclosure triangle [MED], (4) ARIA role=option + scoped listbox [MED], (5) arrow-nav visibility via ancestor walk [MED], (6) controlled-`open` fight via onToggle [MED]. 3 items already deferred to deferred-work.md (JQL escaping, minor UX polish, pre-existing view-state test).

### File List

- `components/ui/input.tsx` (new — shadcn Input primitive)
- `components/today/TicketPicker.tsx` (new — picker component; restructured per review: source-grouped, Task=headers, sub-task=leaves, role=option, onToggle-synced Disclosure)
- `components/today/TicketPicker.test.tsx` (new — 22 co-located tests covering source grouping, ARIA, arrow-nav, create-subtask, search-Jira)
- `components/today/TodayView.tsx` (modified — renders TicketPicker)
- `components/today/TodayView.test.tsx` (modified — picker integration tests; createSubtask mock updated to no-`fields` shape)
- `lib/jira-client.ts` (modified — added `jiraPost`)
- `lib/jira-client.test.ts` (modified — added jiraPost tests incl. 401-refresh)
- `lib/jira-types.ts` (modified — added `JiraCreateIssueSchema = {id,key}` for create-issue response shape)
- `lib/ticket-search.ts` (new — `searchTickets` JQL search)
- `lib/ticket-search.test.ts` (new — co-located tests)
- `lib/create-subtask.ts` (new — `createSubtask` via `jiraPost`; uses `JiraCreateIssueSchema`; echoes user-typed summary)
- `lib/create-subtask.test.ts` (new — co-located tests using real no-`fields` response shape)
- `lib/storage/pinned-tickets.ts` (new — pinned/recent ticket storage)
- `lib/storage/pinned-tickets.test.ts` (new — co-located tests)

### Change Log

- 2026-06-21: Story 2.3 implementation complete — TicketPicker with 2-level browse tree, 100ms-debounced filtering, create-subtask affordance, search-Jira mode, pinned/recent storage, keyboard navigation. Fixed infinite render loop and create-subtask two-step flow bug. All gates pass (234 tests). Status set to review.
- 2026-06-21: **Review follow-ups resolved** — Addressed 6 active review findings: (1) [HIGH] restructured to source-grouped tree with Task=headers/sub-task=leaves; (2) [HIGH] fixed `createSubtask` parse-error on success by using `JiraCreateIssueSchema` (Jira create response has no `fields`); (3) [MED] fixed literal `▸` JSX text via string literal `{'\u25B8'}`; (4) [MED] added `role="option"` to rows and scoped `role="listbox"` to rows container only; (5) [MED] arrow-nav now uses `isRowReachable` (ancestor walk for closed `<details>`) + Enter to select; (6) [MED] `Disclosure`/`TaskDisclosure` use `useState`+`onToggle` (synced controlled, no more open-attribute fight). Spec updated (AC #1, AC #3, Task 6, architecture diagram). 3 items already deferred to deferred-work.md. All gates pass: lint (0 errors), tsc (0 errors), 241 tests pass, build succeeds. Status set to review.
- 2026-06-21: **Round 2 re-review follow-ups resolved** — Addressed 2 new MEDIUM findings from the restructure: (1) Enter double-fire — removed manual `btn.click()` from `handleKeyDown` (native `<button>` handles Enter activation); (2) search dead-end — when a Task matches by its own key/summary but no sub-tasks match (and it has ≥1), `TaskDisclosure` now renders ALL sub-tasks (`subtasksToRender` falls back to `task.subtasks` when `taskMatches && matchingSubtasks.length === 0`). Added 3 new tests (single-fire click, Enter-doesn't-double-fire, search-dead-end-fix). All gates pass: lint (0 errors), tsc (0 errors), 243 tests pass, build succeeds.
