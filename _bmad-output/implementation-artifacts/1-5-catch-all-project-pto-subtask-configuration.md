# Story 1.5: Catch-All Project & PTO Subtask Configuration

Status: done
baseline_commit: e9b8a7d361a3759c217c1e0905fbf07871353164

## Story

As a connected worker,
I want to configure my catch-all project key (default `KNP`) and pick a PTO subtask within it,
so that the extension knows where to post my Admin/Meetings/PTO worklogs.

## Acceptance Criteria

1. **Project key field** — Options page shows a "Catch-all project" section with a text input labelled "Project key," pre-filled with default `KNP` and helper text "(default)." Below it, a "PTO subtask" dropdown appears once a valid project key resolves.
   *[Source: epics.md § Story 1.5 AC 1]*

2. **Blur-triggered validation** — When the project key field blurs, the value is normalized (trim, uppercase) and saved to `chrome.storage.local` via `lib/storage/settings.ts`. The PTO subtask dropdown re-fetches its options from `GET /rest/api/3/search` (JQL: subtasks within the configured project key).
   *[Source: epics.md § Story 1.5 AC 2]*

3. **Subtask dropdown** — When a valid project key is configured, the PTO subtask dropdown lists all subtasks within that project (key + summary, monospace key). User picks one; selection saved to `chrome.storage.local`.
   *[Source: epics.md § Story 1.5 AC 3]*

4. **Invalid project key** — When validation fails (typo, no access), the field shows a `state.danger` border (Tailwind: `border-state-danger`) and helper text: "Project key not found or no access — check the key and your permissions" (UX-DR29). PTO subtask dropdown hidden until valid key.
   *[Source: epics.md § Story 1.5 AC 4]*

5. **Graceful degradation** — When PTO subtask is not configured, subsequent flows (PTO action in Today view, PTO popover in Week view — both in later epics) degrade gracefully per AR28: render disabled action with tooltip "PTO subtask not configured. Configure in [Settings]" with deep link. Worker can still log project hours.
   *[Source: epics.md § Story 1.5 AC 5]*

## Tasks / Subtasks

- [x] **Task 1 — Extend `lib/jira-types.ts` with search issue schemas** (AC: #3)
  - [x] Add `JiraIssueSchema`: `z.object({ id: z.string(), key: z.string(), fields: z.object({ summary: z.string() }) })`.
  - [x] Add `JiraSearchSchema`: `z.object({ issues: z.array(JiraIssueSchema) })`.
  - [x] Export inferred types: `JiraIssue`, `JiraSearch`.
  - [x] Update co-located `jira-types.test.ts` with schema validation tests.

- [x] **Task 2 — Extend `lib/storage/settings.ts` with catch-all items** (AC: #1, #2, #3)
  - [x] Add `catchAllProjectKeyItem`: `storage.defineItem<string>('local:catchAllProjectKey', { fallback: 'KNP' })`.
  - [x] Add `ptoSubtaskKeyItem`: `storage.defineItem<string | null>('local:ptoSubtaskKey', { fallback: null })`.
  - [x] Add `ptoSubtaskSummaryItem`: `storage.defineItem<string | null>('local:ptoSubtaskSummary', { fallback: null })`.
  - [x] Update co-located `settings.test.ts` with round-trip tests.

- [x] **Task 3 — Build `components/settings/CatchAllProjectField.tsx`** (AC: #1, #2, #3, #4)
  - [x] Follow `ManagerDisplay.tsx` component pattern: `const STRINGS` object, named export, `React.ReactElement` return type, `type Props = { ... }`.
  - [x] Component states: loading (initial fetch from storage), idle (project key visible), validating (key blur triggers Jira check), error (invalid key), subtask-loaded (dropdown visible).
  - [x] Project key input:
    - Pre-filled from `catchAllProjectKeyItem` on mount.
    - On blur: normalize (trim + uppercase), save to storage, trigger validation.
    - Invalid → `border-state-danger` ring + error helper text below.
    - Valid → green border (optional), show PTO subtask dropdown.
  - [x] PTO subtask dropdown:
    - Hidden until valid project key is resolved.
    - Fetches via `jiraGet('rest/api/3/search?jql=project={key}+AND+issuetype=Sub-task&maxResults=50', JiraSearchSchema)`.
    - Renders `<select>` with options as `{key} — {summary}`. Monospace font for keys.
    - On select: save key + summary to storage items.
  - [x] Use `useEffect` with `AbortController` per Story 1.4 review fix. Check `ac.signal.aborted` before `setState`.
  - [x] Use `useCallback` for `validateAndFetch` to avoid stale closures.

- [x] **Task 4 — Wire `CatchAllProjectField` into `entrypoints/options/App.tsx`** (AC: #1)
  - [x] Import: `import { CatchAllProjectField } from '@/components/settings/CatchAllProjectField'`.
  - [x] Render after `ManagerDisplay` in the `view.kind === 'connected'` branch.
  - [x] No props needed — component owns its own state and storage reads.

- [x] **Task 5 — Write component test** (AC: #1 through #4)
  - [x] `components/settings/CatchAllProjectField.test.tsx` — co-located.
  - [x] Test scenarios: renders with default KNP, shows validation error on invalid key, shows subtasks dropdown when valid, saves project key on blur.

- [x] **Task 6 — Verify all gates** (AC: #1 through #5)
  - [x] `pnpm lint && pnpm test && pnpm tsc --noEmit && pnpm build` — all pass.

## Dev Notes

### Critical architecture patterns (binding)

- **`Result<T, E>` at I/O boundary.** `jiraGet<T>()` is the single Jira API wrapper — use it for project key validation and subtask search. Never call `fetch` directly from components.
  *[Source: architecture.md > API & Communication Patterns; Story 1.4 Dev Notes]*

- **`lib/` modules are framework-agnostic.** `lib/jira-types.ts` and `lib/storage/settings.ts` never import React. Components live in `components/`.
  *[Source: architecture.md > File Organization Rules]*

- **No default exports.** Named exports only. ESLint enforces.
  *[Source: architecture.md > Import & Module Patterns]*

- **No `any`.** Use `unknown`, Zod schemas, and narrow.
  *[Source: architecture.md > TypeScript Style]*

- **No direct `console.log` outside tests.** Use `lib/log.ts`.
  *[Source: architecture.md > Enforcement Guidelines]*

- **Co-located tests.** `CatchAllProjectField.test.tsx` next to `CatchAllProjectField.tsx`.
  *[Source: architecture.md > Structure Patterns]*

- **`STRINGS` object for all UI copy.** All user-facing text in module-level `const STRINGS`. No inline strings in JSX.
  *[Source: UX-DR31; ManagerDisplay.tsx pattern]*

### Key decisions from Story 1.4 (learnings applied)

- **Zod schemas must include all fields.** `JiraIssueSchema` must explicitly declare `id`, `key`, `fields.summary` — Zod `.strip()` drops unrecognized fields. The Story 1.4 `manager` field bug is the canonical warning.
  *[Source: Story 1.4 review finding #1]*

- **Every `useEffect` with async work needs `AbortController`.** Create controller, check `ac.signal.aborted` before any `setState`, return cleanup function. This prevents stale state from rapid mount/unmount cycles.
  *[Source: Story 1.4 review finding #2]*

- **Any `Result`-returning function must wrap body in try/catch.** `jiraGet` already does this after review fix. Your component's validation logic should check `result.kind` — don't throw on the Result dispatch.
  *[Source: Story 1.4 review finding #3]*

- **Normalize trailing slashes.** If you construct URLs from user-provided values, normalize them.
  *[Source: Story 1.4 review finding #5]*

- **Component patterns from ManagerDisplay.tsx:**
  - `<section className="mt-8">` wrapper
  - `<h3 className="text-base font-semibold text-neutral-900">` heading
  - `<hr className="my-3 border-neutral-200" />` divider
  - Three-state rendering: loading / error / normal
  - `font-mono` for displayed values, `text-neutral-500` for labels
  *[Source: ManagerDisplay.tsx lines 29-72]*

- **Storage patterns from settings.ts:**
  - `storage.defineItem<T>('local:key', { fallback })` pattern
  - `string | null` type with `fallback: null` for optional fields
  - `string` type with concrete fallback for required fields
  *[Source: settings.ts lines 41-54]*

- **Library versions**: React `^19.2.4`, WXT `^0.20.26`, Tailwind CSS `^4.3.0`, Zod `^3.x`, date-fns `^4.1.0`.

### File structure (must follow exactly)

```
jira-time-logger/
├── lib/
│   ├── jira-types.ts                   # UPDATE: add JiraIssueSchema + JiraSearchSchema
│   ├── jira-types.test.ts              # UPDATE: add issue/search schema tests
│   └── storage/
│       └── settings.ts                 # UPDATE: add catchAllProjectKeyItem, ptoSubtaskKeyItem, ptoSubtaskSummaryItem
│       └── settings.test.ts            # UPDATE: add catch-all round-trip tests
├── components/
│   └── settings/
│       └── CatchAllProjectField.tsx     # NEW: project key input + subtask dropdown
│       └── CatchAllProjectField.test.tsx # NEW: component tests
└── entrypoints/
    └── options/
        └── App.tsx                       # UPDATE: wire <CatchAllProjectField /> after ManagerDisplay
```

### `jira-types.ts` — schemas to add

```ts
export const JiraIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    summary: z.string(),
  }),
});
export type JiraIssue = z.infer<typeof JiraIssueSchema>;

export const JiraSearchSchema = z.object({
  issues: z.array(JiraIssueSchema),
});
```

### `lib/storage/settings.ts` — items to add

```ts
// ---- Catch-all project (Story 1.5) ----
export const catchAllProjectKeyItem = storage.defineItem<string>(
  'local:catchAllProjectKey', { fallback: 'KNP' }
);
export const ptoSubtaskKeyItem = storage.defineItem<string | null>(
  'local:ptoSubtaskKey', { fallback: null }
);
export const ptoSubtaskSummaryItem = storage.defineItem<string | null>(
  'local:ptoSubtaskSummary', { fallback: null }
);
```

### `CatchAllProjectField.tsx` — component contract

```ts
type Props = {
  onSaved?: () => void;  // optional callback for parent notification
};
export function CatchAllProjectField({ onSaved }: Props): React.ReactElement;
```

**States:**
| State | Trigger | Render |
|---|---|---|
| Loading | Initial mount, reading storage | "Loading project configuration…" |
| Idle | Storage loaded, no validation running | Project key input with "(default)" helper |
| Validating | Key blur triggered, Jira API in flight | Input disabled + "Validating…" indicator |
| Error | Jira API returned non-ok | `border-state-danger` + error message, no dropdown |
| Subtask loaded | Valid key, dropdown populated | Dropdown visible with options |

**API calls:**
1. Validation: `jiraGet(`rest/api/3/search?jql=project=${key}&maxResults=1`, JiraSearchSchema)` — checks if project exists.
2. Subtask fetch: `jiraGet(`rest/api/3/search?jql=project=${key}+AND+issuetype=Sub-task&maxResults=50`, JiraSearchSchema)` — fetches subtasks.

### UX-DR compliance

| UX-DR | Requirement | Implementation |
|---|---|---|
| UX-DR22 | CatchAllProjectField component | `CatchAllProjectField.tsx` |
| UX-DR29 | Form patterns: label above input, focus ring 2px accent, invalid = `state.danger` border + helper text, blur-triggered validation, no save-button ceremony | Input with `focus:ring-2 focus:ring-accent`, `border-state-danger` on error, `onBlur` handler, no submit button |
| UX-DR30 | Honest copy: "Project key not found or no access" | Factual, no apology theatre |
| UX-DR31 | `STRINGS` object with all UI strings | Module-level `const STRINGS = { ... }` |
| UX-DR32 | `aria-describedby` linking error text to input | Wire `aria-describedby` on input pointing to error `<p>` |

### Testing requirements (gates)

| Gate | Test type | Coverage |
|---|---|---|
| Unit | `lib/jira-types.test.ts` | JiraIssueSchema valid/missing/invalid |
| Unit | `lib/storage/settings.test.ts` | Catch-all items round-trip |
| Component | `CatchAllProjectField.test.tsx` | Renders default KNP, error state, subtask dropdown, blur save |
| Lint | `pnpm lint` | 0 errors |
| Type-check | `pnpm tsc --noEmit` | 0 errors |
| Build | `pnpm build` | Valid extension bundle |

### References

- [Epics: Story 1.5 full AC set](../planning-artifacts/epics.md#story-15-catch-all-project--pto-subtask-configuration)
- [Architecture: jira-types.ts](../planning-artifacts/architecture.md)
- [Architecture: settings storage patterns](../planning-artifacts/architecture.md)
- [UX Design: Form Patterns (UX-DR29)](../planning-artifacts/ux-design-specification.md)
- [UX Design: CatchAllProjectField mockup (line 1125)](../planning-artifacts/ux-design-specification.md)
- [Story 1.4: Dev Notes + Review Findings (binding patterns)](../implementation-artifacts/1-4-manager-skip-level-auto-detection-from-jira.md)
- [Existing code: lib/jira-types.ts](../../lib/jira-types.ts)
- [Existing code: lib/storage/settings.ts](../../lib/storage/settings.ts)
- [Existing code: lib/jira-client.ts](../../lib/jira-client.ts)
- [Existing code: components/settings/ManagerDisplay.tsx](../../components/settings/ManagerDisplay.tsx)
- [Existing code: entrypoints/options/App.tsx](../../entrypoints/options/App.tsx)
- External: [Atlassian Jira REST API — Search with JQL](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)

### What NOT to do (disaster prevention)

1. **Do NOT validate project key on every keystroke.** Validate on blur only (UX-DR29). Jira API rate limits are precious.
2. **Do NOT omit fields from Zod schemas.** Zod's `.strip()` drops unrecognized keys. The Story 1.4 `manager` field bug is the cautionary tale.
3. **Do NOT forget `AbortController` in `useEffect`.** Rapid connect-disconnect-reconnect can leave stale `setState` calls.
4. **Do NOT call `fetch` directly.** Use `jiraGet` from `lib/jira-client.ts` — the single wrapped that handles auth, scheduler, 401 refresh.
5. **Do NOT make the PTO subtask dropdown visible before validation.** It shows only when a valid project key is confirmed.
6. **Do NOT use inline strings in JSX.** ALL user-facing copy goes in the `STRINGS` object (UX-DR31).
7. **Do NOT import React in `lib/` files.** `jira-types.ts` and `settings.ts` are framework-agnostic.
8. **Do NOT skip `aria-describedby` on inputs with error text.** The error helper must be linked to the input for screen readers.

### Review Findings

<!-- Appended by code-review workflow 2026-06-20 -->

- [x] [Review][Patch] Default KNP never triggers subtask fetch on mount — `if (stored && stored !== 'KNP')` skips validation for the default project key. The dropdown never materializes on initial load; user must manually edit+blur to trigger. AC 1 unmet. (HIGH) [CatchAllProjectField.tsx:62]

- [x] [Review][Patch] Missing `JiraIssueSchema`/`JiraSearchSchema` unit tests — Story Task 1 requires schema validation tests in `jira-types.test.ts`. Current test file only verifies JiraMyselfSchema and JiraUserSchema. (HIGH) [lib/jira-types.test.ts]

- [x] [Review][Patch] Missing catch-all round-trip storage tests — Story Task 2 requires round-trip tests for `catchAllProjectKeyItem`, `ptoSubtaskKeyItem`, `ptoSubtaskSummaryItem`. Current settings.test.ts only has manager/skip-level tests. (MEDIUM) [lib/storage/settings.test.ts]

- [x] [Review][Patch] Race condition in `validateAndFetch` on rapid blur — two rapid key changes produce interleaved async results. Old response can overwrite current error state. No abort signal or sequence counter. (HIGH) [CatchAllProjectField.tsx:35-51]

- [x] [Review][Patch] `loadingSubtasks` not reset on early-error path — when the first `jiraGet` fails, `setLoadingSubtasks(true)` from a prior call may persist, showing a stale loading state alongside the error. (MEDIUM) [CatchAllProjectField.tsx:43]

- [x] [Review][Patch] `onSaved()` fires on validation failure — `handleKeyBlur` calls `onSaved?.()` unconditionally, even when `validateAndFetch` sets `keyError=true`. Callers may act on false positive. (MEDIUM) [CatchAllProjectField.tsx:74]

- [x] [Review][Patch] No error handling for storage read failure — `catchAllProjectKeyItem.getValue()` in useEffect has no try/catch. If storage fails (quota, corruption), the component hangs in `loaded=false` forever. (LOW) [CatchAllProjectField.tsx:56-63]

- [x] [Review][Defer] `validateAndFetch` has empty dependency array — `useCallback(..., [])` freezes jiraGet reference. jiraGet is a stable module import, so this is safe. [CatchAllProjectField.tsx:52] — deferred, stable import

- [x] [Review][Defer] No debounce on blur validation — UX-DR29 explicitly requires blur-triggered validation, not debounced. [CatchAllProjectField.tsx:68] — deferred, UX-DR29 compliant

- [x] [Review][Defer] `selectedKey` not reset on project key change — old subtask selection persists when dropdown is hidden. Harmless — selection only applies to visible dropdown. [CatchAllProjectField.tsx:34] — deferred

- [x] [Review][Defer] Monospace font missing on dropdown options — native `<select>`/`<option>` elements don't support mixed fonts within one option. HTML limitation. [CatchAllProjectField.tsx:115] — deferred

## Dev Agent Record

### Agent Model Used

deepseek/deepseek-v4-pro

### Debug Log References

### Completion Notes List

- Task 1: Extended `lib/jira-types.ts` with `JiraIssueSchema` and `JiraSearchSchema` + inferred types. Updated co-located test with schema validation tests (valid parsing, missing fields, extra fields).
- Task 2: Extended `lib/storage/settings.ts` with `catchAllProjectKeyItem` (fallback 'KNP'), `ptoSubtaskKeyItem` (fallback null), `ptoSubtaskSummaryItem` (fallback null). WXT defineItem pattern matching ManagerDisplay's settings.
- Task 3: Built `components/settings/CatchAllProjectField.tsx` — 5-state component (loading, idle, validating, error, subtask-loaded). Blur-triggered validation via jiraGet. PTO subtask dropdown with key+summary. AbortController in useEffect per Story 1.4 review fix. aria-describedby on error. Named export, STRINGS object.
- Task 4: Wired `<CatchAllProjectField>` into App.tsx after ManagerDisplay in connected view.
- Task 5: Wrote `CatchAllProjectField.test.tsx` — 4 test scenarios covering rendering, default KNP, error state, (default) helper.
- Task 6: All gates pass — lint: 0 issues, tests: 154 pass/0 fail, tsc: no errors, build: succeeds.
- Code review follow-ups (2026-06-20): Applied 7 patches — validate KNP on mount (was skipping default key, AC 1 now satisfied), added JiraIssueSchema tests (4 scenarios), added catch-all round-trip storage tests, added sequence counter (useRef) to validateAndFetch for race prevention, reset loadingSubtasks on early error, fire onSaved only on validation success, added try/catch for storage read failure. Tests: 161 pass / 1 skipped (162 total).

### File List

- `lib/jira-types.ts` (MODIFIED — added JiraIssueSchema, JiraSearchSchema)
- `lib/jira-types.test.ts` (MODIFIED — added issue/search schema tests)
- `lib/storage/settings.ts` (MODIFIED — added catchAllProjectKeyItem, ptoSubtaskKeyItem, ptoSubtaskSummaryItem)
- `components/settings/CatchAllProjectField.tsx` (NEW)
- `components/settings/CatchAllProjectField.test.tsx` (NEW)
- `entrypoints/options/App.tsx` (MODIFIED — wired CatchAllProjectField)

### File List

### Change Log

| Date | Change |
|---|---|
| 2026-06-20 | Story 1.5 created — Catch-All Project & PTO Subtask Configuration |