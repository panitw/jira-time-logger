# Story 2.3: TicketPicker — 2-Level Browse Tree with Search & Create Subtask

Status: ready-for-dev

## Story

As a connected worker,
I want a fast picker that shows my likely tickets and lets me search Jira or create a subtask when needed,
so that I can find the right ticket in under 2 seconds.

## Acceptance Criteria

1. **Picker renders a 2-level browse tree from hierarchy data.** When the Today view mounts, `TicketPicker` consumes `useHierarchyTickets()` and displays a collapsible 2-level tree using native `<details>/<summary>` elements. Tasks appear at level 1 grouped by source ("▸ Tasks (N)"); subtasks the worker owns appear nested at level 2. Ticket keys render in `font-mono text-sm font-medium neutral.900`; summaries in `font-sans text-sm font-normal neutral.700`. A search `<input>` with a `Search` icon from `lucide-react` is focused on mount.
   *[Source: epics.md § Story 2.3 AC 1; UX-DR8; UX-DR2]*

2. **Real-time filtering with 100ms debounce.** When the user types in the search input, the picker filters Task and subtask rows against a case-insensitive substring match on key + summary with a 100ms debounce. Non-matching rows are hidden; `<details>` groups whose children all match expand automatically.
   *[Source: epics.md § Story 2.3 AC 2; UX-DR8]*

3. **"+ Create my subtask under this Task" affordance (FR9).** When the user selects a Task that has no subtask assigned to them, a "+ Create my subtask under this Task" affordance appears. Clicking it opens an inline name input; submitting calls `POST /rest/api/3/issue` with `issueType: { name: 'Sub-task' }`, `parent: { key: <taskKey> }`, `assignee: { accountId: <currentUser> }`, `summary: <typed name>`, `project: { key: <projectKey> }`. On success, the new subtask appears in the tree under that Task and is auto-selected.
   *[Source: epics.md § Story 2.3 AC 3; FR9]*

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

- [ ] **Task 1 — Install missing shadcn/ui primitives** (AC: #1, #7)
  - [ ] `pnpm dlx shadcn@latest add input` — adds `components/ui/input.tsx`
  - [ ] Verify the Input component integrates with the existing styling system (`globals.css` theme tokens, `cn()` utility)

- [ ] **Task 2 — Add `jiraPost` to `lib/jira-client.ts`** (AC: #3)
  - [ ] Add `jiraPost<T>(path, body, schema)` following the same pattern as `jiraGet`: scheduler-gated, OAuth header, 401 refresh, Zod parse, `Result<T, JiraError>` return
  - [ ] Add co-located test in `lib/jira-client.test.ts` covering success, 401-refresh, 429, and parse-error paths

- [ ] **Task 3 — Add pinned/recent ticket storage** (AC: #5, #6)
  - [ ] Create `lib/storage/pinned-tickets.ts` with WXT `storage.defineItem<PinnedTicket[]>('local:pinnedTickets', { fallback: [] })`
  - [ ] Define `PinnedTicket = { key: string; summary: string; pinnedAt: string (ISODateTime) }`
  - [ ] Export `getPinnedTickets()`, `addPinnedTicket(key, summary)`, `removePinnedTicket(key)`
  - [ ] Cap the list at 10 entries (FIFO eviction of oldest)
  - [ ] Add co-located `lib/storage/pinned-tickets.test.ts`

- [ ] **Task 4 — Add Jira search-by-keyword schema and function** (AC: #5)
  - [ ] In `lib/jira-types.ts`, add `JiraTicketSearchSchema` reusing `JiraIssueSchema` (id, key, fields.summary) — the same shape the catch-all component uses
  - [ ] In `lib/hierarchy.ts` (or a new `lib/ticket-search.ts`), add `searchTickets(query: string): Promise<Result<JiraIssue[], JiraError>>` that builds a JQL query: `key ~ "<query>" OR summary ~ "<query>"` and calls `jiraGet` through the scheduler
  - [ ] Handle the case where the query looks like a ticket key (contains `-` and digits): try `key = "<query>"` first
  - [ ] Add co-located test

- [ ] **Task 5 — Add create-subtask function** (AC: #3)
  - [ ] In `lib/hierarchy.ts` (or a new `lib/create-subtask.ts`), add `createSubtask(parentKey: string, summary: string): Promise<Result<JiraIssue, JiraError>>` that calls `jiraPost('rest/api/3/issue', body, JiraIssueSchema)` with the correct Jira create-issue payload
  - [ ] The payload must include `project` (derived from parent key prefix), `issuetype: { name: 'Sub-task' }`, `parent: { key: parentKey }`, `summary`, and `assignee: { accountId: <currentUser> }`
  - [ ] Fetch the current user's `accountId` from `GET /rest/api/3/myself` (cached via TanStack Query or settings storage)
  - [ ] Add co-located test

- [ ] **Task 6 — Build `TicketPicker` component** (AC: #1, #2, #3, #4, #5, #6, #7)
  - [ ] Create `components/today/TicketPicker.tsx`
  - [ ] Render search input (focused on mount, `Search` icon from `lucide-react`, 100ms debounce via `useDeferredValue` or `setTimeout`)
  - [ ] Render hierarchy tree using native `<details>/<summary>` for collapsible groups
  - [ ] Group by source: "Recently used", "Tasks" (self/manager/skip-level), "Catch-all (KNP)"
  - [ ] Filter logic: case-insensitive substring match on `key + summary`; auto-expand matching groups
  - [ ] Row rendering: `<button>` elements with `aria-label="Pick <key>: <summary>"`; keyboard nav via arrow keys, Enter to select, Esc to clear
  - [ ] "+ Create my subtask" inline affordance for Tasks with no worker-owned subtask
  - [ ] "+ Search Jira for a ticket…" affordance at bottom; enters search-Jira mode with 300ms debounce
  - [ ] Empty state: "No matching tickets." with search-Jira link (UX-DR27)
  - [ ] On ticket selection: call `onSelect(ticketKey, ticketSummary)` callback prop
  - [ ] Co-located `components/today/TicketPicker.test.tsx` with Testing Library

- [ ] **Task 7 — Integrate TicketPicker into TodayView** (AC: #1)
  - [ ] Update `components/today/TodayView.tsx` to render `<TicketPicker>` below the heading
  - [ ] Wire `onSelect` callback (for now, log the selection — Story 2.4 will add the QuickLogForm)
  - [ ] Show skeleton while `useHierarchyTickets()` is loading (UX-DR26)
  - [ ] Show error state on query failure (UX-DR23 `ErrorState` pattern)
  - [ ] Update `components/today/TodayView.test.tsx`

- [ ] **Task 8 — Verify gates** (AC: #8)
  - [ ] `pnpm lint` — zero errors
  - [ ] `pnpm tsc --noEmit` — zero errors
  - [ ] `pnpm test --run` — all tests pass
  - [ ] `pnpm build` — extension builds successfully

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
├── HierarchyGroups (one <details>/<summary> per source group from useHierarchyTickets)
│   └── TaskRow (<button>, shows key + summary)
│       └── SubtaskRow (<button>, indented, shows key + summary)
├── CreateSubtaskAffordance (inline, appears when Task has no worker subtask)
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

### Debug Log References

### Completion Notes List

### File List
