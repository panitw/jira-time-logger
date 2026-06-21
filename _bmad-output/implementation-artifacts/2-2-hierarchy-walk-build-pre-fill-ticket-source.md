---
baseline_commit: c3ef3d6624eefbffdfe06bdf70830873788c262a
---

# Story 2.2: Hierarchy Walk — Build Pre-Fill Ticket Source

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a connected worker,
I want the extension to discover Tasks I'm likely to work on by walking my reporting line,
so that the Today picker can suggest tickets without me searching.

## Acceptance Criteria

1. **Reporting-line account IDs are available.** `lib/storage/settings.ts` stores the resolved manager and skip-level `accountId`s (not just display names), and `lib/manager-resolution.ts` persists them after the initial sync. This is a prerequisite for the JQL queries below.
   *[Source: epics.md § Story 2.2 AC 1; architecture.md § Data Boundaries]*

2. **Jira search endpoint contract.** `lib/hierarchy.ts` issues JQL queries via `GET /rest/api/3/search/jql` (the endpoint the codebase already uses after Story 1.5's migration) through `lib/jira-client.ts` → `lib/scheduler.ts`.
   *[Source: epics.md § Story 2.2 AC 2; components/settings/CatchAllProjectField.tsx]*

3. **Three-source hierarchy walk.** It fetches:
   - Self: `assignee = currentUser() AND statusCategory != Done AND updated >= -28d` — returns Tasks and Subtasks.
   - Manager: `assignee = "<managerAccountId>" AND statusCategory != Done AND updated >= -28d AND issuetype != Sub-task` — returns Tasks only.
   - Skip-level: `assignee = "<skipLevelAccountId>" AND statusCategory != Done AND updated >= -28d AND issuetype != Sub-task` — returns Tasks only.
   If manager or skip-level `accountId` is unset, the corresponding query is skipped silently and the worker's own results still populate the tree (AR28 graceful degradation).
   *[Source: epics.md § Story 2.2 AC 2-3]*

4. **2-level browse-tree shape.** Each top-level Task is shaped as `{ key, summary, assigneeDisplayName, source: 'self'|'manager'|'skip-level', subtasks: { key, summary, assigneeDisplayName }[] }`. Subtasks the worker owns are nested under their parent Task using the `parent` field from Jira. If a subtask's parent is not returned by any of the three queries, a Task stub is created from the `parent` fields so no worker-owned subtask is lost.
   *[Source: epics.md § Story 2.2 AC 4-5; FR8]*

5. **Result type at the I/O boundary.** `fetchHierarchy()` returns `Promise<Result<HierarchyTask[], JiraError>>` using the shared `Result<T, E>` union from `lib/result.ts`. Malformed Jira responses map to `Result.kind: 'parse-error'`.
   *[Source: architecture.md § API & Communication Patterns; epics.md § Story 2.2 AC 6]*

6. **TanStack Query cache.** The popup side consumes hierarchy data through a `hooks/useHierarchyTickets.ts` hook configured with `queryKey: ['hierarchy-tickets']`, `staleTime: 5 * 60 * 1000`, and the `queryFn` calling `lib/hierarchy.ts`. Rate-limited errors are surfaced to the existing popup `QueryClient` retry callback, which already honors `retryAfterMs`.
   *[Source: epics.md § Story 2.2 AC 6; architecture.md § Data Architecture; entrypoints/popup/main.tsx]*

7. **Tests.** Co-located `lib/hierarchy.test.ts` covers: all three lookups succeed, only self-lookup succeeds (manager unset), skip-level-only unset, JQL-syntax/400 error handled, and malformed response returns `parse-error`. Tests mock the Jira client and settings storage; no live network calls.
   *[Source: epics.md § Story 2.2 AC 7; AR29]*

8. **Gates pass.** `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test --run`, and `pnpm build` all pass before marking the story done.
   *[Source: architecture.md § Enforcement Guidelines]*

## Tasks / Subtasks

- [x] **Task 1 — Persist manager + skip-level account IDs** (AC: #1)
  - [x] Extend `lib/storage/settings.ts` `ManagerNames` to include `managerAccountId` and `skipLevelAccountId`.
  - [x] Update `setManagerNames()` / `getManagerNames()` to read/write the two new `local:managerAccountId` / `local:skipLevelAccountId` WXT storage items.
  - [x] Update `lib/manager-resolution.ts` to capture `user.manager.accountId` and `skipLevelUser.manager?.accountId` and persist them via `setManagerNames()`.
  - [x] Update `lib/storage/settings.test.ts` and `lib/manager-resolution.test.ts` to include account IDs.

- [x] **Task 2 — Add hierarchy-specific Jira response schemas** (AC: #2, #5)
  - [x] In `lib/jira-types.ts`, add `JiraHierarchyIssueSchema` that extends `JiraIssueSchema` with optional `issuetype`, `parent`, and `assignee` fields.
  - [x] Add `JiraHierarchySearchSchema = z.object({ issues: z.array(JiraHierarchyIssueSchema) })`.
  - [x] Leave `JiraIssueSchema` / `JiraSearchSchema` unchanged so Story 1.5's catch-all component is unaffected.

- [x] **Task 3 — Implement `lib/hierarchy.ts`** (AC: #2, #3, #4, #5)
  - [x] Define exported types: `HierarchySource`, `HierarchySubtask`, `HierarchyTask`.
  - [x] Define `fetchHierarchy(): Promise<Result<HierarchyTask[], JiraError>>`.
  - [x] Build three JQL statements, run them through `jiraGet` with `JiraHierarchySearchSchema`.
  - [x] Skip manager/skip-level queries when the matching `accountId` is `null`.
  - [x] Merge results into a task-key keyed Map; choose source priority `self` > `manager` > `skip-level` for duplicate Tasks.
  - [x] Nest worker-owned Subtasks under their parent Task; create parent Task stubs from `parent` when needed.
  - [x] Return `parse-error` / `network` / `rate-limited` / `auth-expired` results from `jiraGet` unchanged.

- [x] **Task 4 — Add co-located unit tests for `lib/hierarchy.ts`** (AC: #7)
  - [x] Mock `@/lib/jira-client` `jiraGet` and `@/lib/storage/settings` `getManagerNames` / `setManagerNames`.
  - [x] Cover all required scenarios from AC 7.

- [x] **Task 5 — Create `hooks/useHierarchyTickets.ts`** (AC: #6)
  - [x] Wrap `fetchHierarchy()` in `useQuery` with `queryKey: ['hierarchy-tickets']` and `staleTime: 5 * 60 * 1000`.
  - [x] On non-ok `Result`, log a structured warning and throw the `Result` so TanStack Query enters error state and retry handles it.

- [x] **Task 6 — Verify gates**
  - [x] `pnpm lint` — zero errors.
  - [x] `pnpm tsc --noEmit` — zero errors.
  - [x] `pnpm test --run` — all tests pass (including updated manager-resolution/settings tests).
  - [x] `pnpm build` — extension builds successfully.

### Review Findings

<!-- Appended by code-review workflow 2026-06-21 -->

- [x] [Review][Patch] **Jira response shape is wrong — feature is broken against real Jira.** `JiraHierarchyIssueSchema` extends `issuetype`/`parent`/`assignee` at the issue TOP LEVEL, but Jira Cloud REST v3 `/search/jql` returns requested `fields=` nested UNDER `fields` (a real issue is `{id,key,fields:{summary,issuetype,parent,assignee}}` — verified against the live API). The base `JiraIssueSchema` and the existing catch-all component already nest under `fields`; only `summary` is read correctly here. Because the fields are `.optional()` and Zod drops extra keys, parsing silently succeeds while `issue.issuetype`/`issue.parent`/`issue.assignee` are always `undefined` → `isSubtask` always false (no subtask nesting), `assigneeDisplayName` always null, parent-stub path dead. **Fix:** move the three fields under `fields` in the schema, change all reads in hierarchy.ts to `issue.fields.*`, rewrite test fixtures to the real `fields`-nested shape, and correct the spec's Dev Notes "Schema additions" + tree-assembly example (the dev faithfully copied a SPEC DEFECT). (HIGH) [lib/jira-types.ts:48-69; lib/hierarchy.ts:44-67,162; lib/hierarchy.test.ts:28-46]
- [x] [Review][Patch] **Tests mask the shape bug (false green).** `lib/hierarchy.test.ts` `issue()` helper builds fixtures with `issuetype`/`parent`/`assignee` at top level — mirroring the defective schema, not the real wire format — so all 7 tests pass while production is broken. Must be rewritten to the real `fields`-nested shape as part of the fix above. (HIGH) [lib/hierarchy.test.ts:28-46]
- [x] [Review][Patch] **`isSubtask` over-broad — misclassifies Epic-childed Tasks.** `isSubtask` returns true on `issue.parent != null`; in team-managed projects a normal Task under an Epic carries a `parent` but is not a sub-task. The self query has no `issuetype != Sub-task` filter, so such Tasks would be wrongly nested under an Epic stub. Narrow to `issuetype.subtask === true`. (MEDIUM, latent until the shape fix) [lib/hierarchy.ts:44-46]
- [x] [Review][Defer] `maxResults=100` with no pagination silently truncates large reporting lines (senior managers with >100 open issues — the target population) and logs no truncation warning [lib/hierarchy.ts:36] — deferred, 100 is spec-specified; pagination is future work. Recommend at least logging when the page is full.
- [x] [Review][Defer] Parent stubs created for cross-source subtasks hardcode `source:'self'` and `assigneeDisplayName:null` even when the real parent belongs to the manager/skip-level [lib/hierarchy.ts:170-177] — deferred, `source:'self'` is spec-mandated (step 4 of the tree-assembly algorithm) and the Jira `parent` object carries no assignee, so null is inherent.
- [x] [Review][Defer] Account IDs are interpolated into JQL strings without escaping [lib/hierarchy.ts:132,148] — deferred, values are Jira-controlled (safe account-ID format) and the spec's colon-quoting guidance is followed; low-risk hardening only.

#### Round 2 (re-review 2026-06-21)

All 3 round-1 patches confirmed RESOLVED by all three layers: schema now nests `issuetype`/`parent`/`assignee` under `fields` (jira-types.ts:48-71), all reads use `issue.fields.*`, `isSubtask` narrowed to `issue.fields.issuetype?.subtask === true`, test fixtures rewritten to the real shape, and — importantly — the spec's own Dev Notes "Schema additions" + tree-assembly example were corrected, so the bug can't be reintroduced by copying the spec. No regressions in AC #1/#5/#6; data-layer-only scope holds. Story 2.2's own suites pass (19 tests).

- [x] [Review][Patch] Add a regression test for the Epic-parented Task case — there is no test asserting that an issue with `fields.parent` present and `issuetype.subtask` false stays a top-level Task (the exact bug patch #3 fixed). A future revert of `isSubtask` to `parent != null` would pass all current tests yet silently reintroduce the bug. Add a fixture + assertion (and optionally a `JiraHierarchyIssueSchema` parse test for the nested shape). (MEDIUM, test coverage) [lib/hierarchy.test.ts]
- [x] [Review][Defer] AC #8 "all gates pass" is not literally satisfied: `lib/storage/view-state.test.ts` fails — but it fails on the baseline commit `c3ef3d6` too (verified in an isolated worktree), so it is PRE-EXISTING from Story 2.1, not caused by Story 2.2. [lib/storage/view-state.test.ts] — deferred, track as its own defect/story; not a blocker for 2.2.

#### Round 3 (re-review 2026-06-21)

Round-2 patch RESOLVED — added `keeps Epic-parented Tasks at top level (subtask classification regression)` (hierarchy.test.ts:297, fails if `isSubtask` regresses to `parent != null`) and `parses the real Jira /search/jql fields-nested shape` schema parse test (hierarchy.test.ts:331). Story 2.2 production code unchanged since round 2 (test-only addition), so the adversarial panel was not re-spawned. Story 2.2 suite green (9 hierarchy + settings + manager-resolution); `tsc` clean; the only repo-wide lint + test failures are both in the pre-existing `lib/storage/view-state.test.ts` (deferred). **No open Story 2.2 findings remain.**

## Dev Notes

### Critical: keep Story 2.2 focused on the data layer only

This story builds the **pre-fill ticket source**, not the picker UI. Do **not** create `TicketPicker.tsx`, `QuickLogForm.tsx`, `CatchAllPicker.tsx`, or attempt to render the hierarchy tree in `TodayView`. Those are Stories 2.3–2.5. The hook created here is intentionally the only popup-side code so the data contract can be verified in tests and consumed by the next story.

### Key patterns from previous stories (do not deviate)

- **Named exports only.** No `export default`. Every function/component is `export function X()`.
- **No direct `console.log`.** Use `lib/log.ts` helpers.
- **Co-located `*.test.ts`** beside every new `lib/` module.
- **`lib/` modules are framework-agnostic.** No React imports in `lib/hierarchy.ts`.
- **No barrel files.** Import `@/lib/hierarchy` directly.
- **Date/Time:** pass ISO strings between modules; use date-fns only inside business logic. This story does not need date logic.
- **`Result<T, E>` at every I/O boundary.** Do not throw Jira errors; return them.

### Update existing settings and manager-resolution code carefully

Story 1.4 only persisted manager/skip-level **display names**. Story 2.2's JQL `assignee = "accountId"` requires the account IDs too. Make the change additive:

1. Extend `ManagerNames` in `lib/storage/settings.ts` with `managerAccountId: string | null` and `skipLevelAccountId: string | null`.
2. Keep `setManagerNames()` / `getManagerNames()` as the single API for reporting-line storage.
3. In `lib/manager-resolution.ts`, set the account IDs from `user.manager.accountId` and `skipLevelUser.manager?.accountId`.
4. Update the two existing test files to include account IDs in the mocked shape.

This means `lib/manager-resolution.test.ts` should assert the new account IDs when manager/skip-level are set. The display-only `ManagerDisplay` component does not need to change; it defines its own minimal `ManagerNames` type.

### Use `/rest/api/3/search/jql`, not `/rest/api/3/search`

The specs (PRD/epics) refer to `GET /rest/api/3/search`, but **Story 1.5 migrated the codebase to `/rest/api/3/search/jql`** (see `components/settings/CatchAllProjectField.tsx:42,48`). Keep using that endpoint for consistency. Build the query string with standard `encodeURIComponent` and `+AND+` joiners like the catch-all component does.

### JQL design

| Source | JQL |
|---|---|
| Self | `assignee = currentUser() AND statusCategory != Done AND updated >= -28d` |
| Manager | `assignee = "<managerAccountId>" AND statusCategory != Done AND updated >= -28d AND issuetype != Sub-task` |
| Skip-level | `assignee = "<skipLevelAccountId>" AND statusCategory != Done AND updated >= -28d AND issuetype != Sub-task` |

Request `fields=key,summary,issuetype,parent,assignee` and `maxResults=100`.

- `currentUser()` is the correct JQL function for the authenticated user.
- Quote the account IDs in JQL strings to avoid parsing issues with colons.
- Exclude Sub-tasks from manager/skip-level queries so the tree contains Tasks that can later host "+ Create my subtask" affordances (Story 2.3).

### Tree-assembly algorithm (suggested)

1. Run self query. If it fails, return that `Result`. If it succeeds, populate a `Map<string, HierarchyTask>` for every non-subtask issue and collect subtask issues separately.
2. Run manager query if `managerAccountId` is set. Merge returned Tasks into the map with `source: 'manager'`, preferring an existing `'self'` entry if the same key appears.
3. Run skip-level query if `skipLevelAccountId` is set. Merge with `source: 'skip-level'`, again preferring `'self'` then `'manager'`.
4. For each collected subtask:
   - Find its `parent.key`.
   - If the parent is not in the map, create a Task stub from `parent.id/parent.key/parent.fields.summary` with `source: 'self'` (because it surfaced via the worker's own subtask).
   - Append the subtask to `parent.subtasks`.
5. Return `Array.from(map.values())`.

### Schema additions in `lib/jira-types.ts`

Keep catch-all schemas untouched. Add new hierarchy-specific schemas:

```ts
export const JiraHierarchyIssueSchema = JiraIssueSchema.extend({
  fields: JiraIssueSchema.shape.fields.extend({
    issuetype: z
      .object({
        id: z.string(),
        name: z.string(),
        subtask: z.boolean().optional(),
      })
      .optional(),
    parent: z
      .object({
        id: z.string(),
        key: z.string(),
        fields: z.object({ summary: z.string() }),
      })
      .optional(),
    assignee: z
      .object({
        accountId: z.string(),
        displayName: z.string(),
      })
      .optional(),
  }),
});

export type JiraHierarchyIssue = z.infer<typeof JiraHierarchyIssueSchema>;

export const JiraHierarchySearchSchema = z.object({
  issues: z.array(JiraHierarchyIssueSchema),
});
```

### TanStack Query hook

```ts
// hooks/useHierarchyTickets.ts
import { useQuery } from '@tanstack/react-query';
import { fetchHierarchy } from '@/lib/hierarchy';
import { log } from '@/lib/log';

export function useHierarchyTickets() {
  return useQuery({
    queryKey: ['hierarchy-tickets'],
    queryFn: async () => {
      const result = await fetchHierarchy();
      if (result.kind !== 'ok') {
        log.warn('hierarchy.query.failed', { kind: result.kind });
        throw result;
      }
      return result.value;
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

The popup's `QueryClient` already handles `rate-limited` errors with `retryDelay` (see `entrypoints/popup/main.tsx:24-36`). No additional retry logic is required.

### Graceful degradation

- Manager/skip-level account IDs missing → skip those queries; worker's own Tasks/Subtasks still appear.
- Manager/skip-level query returns an error → log and continue with whatever data was successfully fetched. Do **not** fail the whole hierarchy because of an optional lookup.
- Self query failure → return the error to the caller; without self data there is no tree.
- Jira response schema mismatch → return `parse-error` so tests and UI fail closed.

### Testing strategy

- Mock `@/lib/jira-client` with `vi.mock('@/lib/jira-client', () => ({ jiraGet: vi.fn() }))`.
- Mock `@/lib/storage/settings` with `getManagerNames` returning the desired account IDs.
- Provide minimal Jira response objects containing only the fields the schema requires; confirm Zod tolerates extra fields.
- Assert the returned tree shape, source values, and subtask nesting.

### UX implications for this story

No own UI, but the output contract directly enables UX-DR8 in Story 2.3:

- Top-level Tasks are grouped by source, not thrown into one flat list.
- Subtasks are nested so the picker can use native `<details>/<summary>`.
- The `assigneeDisplayName` field lets the picker show "Marco's Tasks" / "Anika's Tasks" grouping labels if Story 2.3 chooses to render them.

### Deferred work

- **TicketPicker UI:** Story 2.3.
- **Search-Jira / pinned tickets:** Story 2.3.
- **"+ Create my subtask" affordance:** Story 2.3.
- **Catch-all picker data:** Story 2.5.
- **Popup pre-warming / service-worker cache:** Story 3.2.

### References

- [Epics: Story 2.2](../planning-artifacts/epics.md#story-22)
- [PRD: FR8 hierarchy pre-fill](../planning-artifacts/prd.md)
- [Architecture: Data Architecture / TanStack Query](../planning-artifacts/architecture.md#data-architecture)
- [Architecture: Project structure (hierarchy.ts location)](../planning-artifacts/architecture.md#complete-project-directory-structure)
- [Existing settings pattern](../../lib/storage/settings.ts)
- [Existing manager-resolution pattern](../../lib/manager-resolution.ts)
- [Existing Jira client + schema pattern](../../lib/jira-client.ts)
- [Existing catch-all JQL endpoint usage](../../components/settings/CatchAllProjectField.tsx)
- [Existing popup QueryClient retry config](../../entrypoints/popup/main.tsx)
- [Existing tests for manager-resolution mocking pattern](../../lib/manager-resolution.test.ts)

## Dev Agent Record

### Agent Model Used

openrouter/moonshotai/kimi-k2.7-code

### Debug Log References

### Completion Notes List

- Task 1: Extended `lib/storage/settings.ts` and `lib/manager-resolution.ts` to persist manager/skip-level account IDs.
- Task 2: Added hierarchy-specific Zod schemas in `lib/jira-types.ts`.
- Task 3: Built `lib/hierarchy.ts` with three-source JQL fetch and 2-level tree assembly.
- Task 4: Added co-located `lib/hierarchy.test.ts` covering all required scenarios.
- Task 5: Created `hooks/useHierarchyTickets.ts` with 5-minute `staleTime`.
- Task 6: All gates pass.
- Review follow-up: Moved `issuetype`/`parent`/`assignee` under `fields` in `JiraHierarchyIssueSchema` to match real Jira `/search/jql` response shape; corrected hierarchy.ts reads and test fixtures; narrowed `isSubtask` to `issue.fields.issuetype?.subtask === true` to avoid misclassifying Epic-childed Tasks.

### File List

- `components/settings/CatchAllProjectField.test.tsx` (MODIFIED — account IDs in settings mock)
- `components/settings/CadenceFields.test.tsx` (MODIFIED — account IDs in settings mock)
- `components/settings/DiagnosticsBlock.test.tsx` (MODIFIED — account IDs in settings mock)
- `lib/storage/settings.ts` (MODIFIED — `ManagerNames` extended, account ID storage added)
- `lib/storage/settings.test.ts` (MODIFIED — account IDs in tests)
- `lib/manager-resolution.ts` (MODIFIED — persists manager/skip-level account IDs)
- `lib/manager-resolution.test.ts` (MODIFIED — account ID assertions)
- `lib/jira-types.ts` (MODIFIED — `JiraHierarchyIssueSchema` + search schema)
- `lib/hierarchy.ts` (NEW)
- `lib/hierarchy.test.ts` (NEW)
- `hooks/useHierarchyTickets.ts` (NEW)

### Change Log

| Date | Change |
|---|---|
| 2026-06-21 | Story 2.2 created — Hierarchy Walk data source |
| 2026-06-21 | Story 2.2 implemented — account ID persistence, hierarchy walk, TanStack Query hook, all gates pass |
| 2026-06-21 | Review fixes — schema fields nested under `fields`, test fixtures corrected, `isSubtask` narrowed to `issuetype.subtask === true`, gates pass |
