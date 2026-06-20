# Story 1.4: Manager & Skip-Level Auto-Detection from Jira

Status: review
baseline_commit: HEAD

### Review Findings

<!-- Appended by code-review workflow 2026-06-20 -->


## Story

As a connected worker,
I want my manager and skip-level to be read automatically from Jira's user directory,
so that I don't have to type names and risk typos.

## Acceptance Criteria

1. **Jira client wrapper** — `lib/jira-client.ts` makes authenticated requests to Jira REST API. All requests flow through `lib/scheduler.ts` (token-bucket rate-limit scheduler) and return `Result<T, JiraError>`. Responses are Zod-validated via `lib/jira-types.ts`. The client dispatches on auth method (OAuth → `api.atlassian.com/ex/jira/{cloudId}`, API-token → direct site URL) for base URL + auth header construction.
   *[Source: epics.md § Story 1.4 AC 1]*

2. **Token-bucket scheduler** — `lib/scheduler.ts` enforces rate limiting. All Jira API calls go through `scheduler.acquire()`. Respects `Retry-After` headers. Singleton owned by the service worker per architecture.
   *[Source: epics.md § Story 1.4 AC 1]*

3. **Zod type definitions** — `lib/jira-types.ts` defines Zod schemas for Jira API response shapes (myself, user, worklog). Schema names suffixed `Schema`; inferred types omit the suffix.
   *[Source: epics.md § Story 1.4 AC 1]*

4. **Manager resolution** — `lib/manager-resolution.ts` reads the `manager` field from Jira's user-directory record for the worker's `accountId`. Makes a second recursive request for the skip-level (manager's manager). Both resolved display names are persisted to `chrome.storage.local` via `lib/storage/settings.ts`.
   *[Source: epics.md § Story 1.4 AC 2]*

5. **Manager display on options page** — `components/settings/ManagerDisplay.tsx` shows two read-only rows: "Manager (read from Jira): `<displayName>`" and "Skip-level (read from Jira): `<displayName>`" (UX-DR22). Not editable.
   *[Source: epics.md § Story 1.4 AC 3]*

6. **Graceful degradation — manager unset** — When the worker's `manager` field is unset in Jira, resolution returns a "manager not set" result (no throw). Options page shows a non-blocking notice: "Manager not set in Jira — please contact your admin to configure it for richer pre-fill suggestions" (FR46, AR28). Worker is NOT blocked from any feature.
   *[Source: epics.md § Story 1.4 AC 4]*

7. **Graceful degradation — skip-level unset** — When manager is set but skip-level is not, the manager row populates and skip-level shows "Not set in Jira" notice. All other settings still configurable.
   *[Source: epics.md § Story 1.4 AC 5]*

8. **Tests** — Co-located Vitest tests cover: manager-set+skip-set, manager-set+skip-unset, manager-unset, network-error, malformed-response → `parse-error`.
   *[Source: epics.md § Story 1.4 AC 6]*

## Tasks / Subtasks

- [x] **Task 1 — Build `lib/scheduler.ts` with token-bucket rate limiting** (AC: #2)
  - [x] Export `class TokenBucketScheduler`:
    - Constructor `(maxTokens: number, refillIntervalMs: number)` — defaults: 2 tokens, 1000 ms (Jira's default rate limit: ~2 req/s).
    - `acquire<T>(fn: () => Promise<T>): Promise<T>` — acquires a token before running fn; queues callers when no token is available.
    - Internal: tracks `tokens` count, last refill time. Refill logic runs inside `acquire` — computes elapsed time since last refill, adds tokens proportionally.
  - [x] Single instance exported: `export const scheduler = new TokenBucketScheduler(2, 1000)`.
  - [x] Write co-located `lib/scheduler.test.ts` covering:
    - Sequential calls succeed when tokens available
    - Third concurrent call waits when tokens = 2 are exhausted
    - Token refill after interval
    - Multiple queued callers resolve in FIFO order
    - Acquire rejects when fn throws

- [x] **Task 2 — Build `lib/jira-types.ts` with Zod schemas** (AC: #3)
  - [x] Define schemas needed for this story:
    ```ts
    export const JiraMyselfSchema = z.object({
      accountId: z.string(),
      displayName: z.string(),
      emailAddress: z.string().optional(),
    });
    export type JiraMyself = z.infer<typeof JiraMyselfSchema>;

    export const JiraUserSchema = z.object({
      accountId: z.string(),
      displayName: z.string(),
    });
    export type JiraUser = z.infer<typeof JiraUserSchema>;
    ```
  - [x] Write co-located `lib/jira-types.test.ts` covering:
    - Valid `myself` response parses correctly
    - Missing required fields → Zod error
    - Extra fields tolerated (Zod `.passthrough()` or just ignore)

- [x] **Task 3 — Build `lib/jira-client.ts`** (AC: #1)
  - [x] Export `jiraClient<T>(path: string, schema: z.ZodType<T>): Promise<Result<T, JiraError>>`:
    1. Read auth from `getAuth()`. If null → return `authExpired()`.
    2. Construct base URL: OAuth → `https://api.atlassian.com/ex/jira/{cloudId}`, API-token → `{siteUrl}`.
    3. Construct auth header: OAuth → `Bearer {access_token}`, API-token → `Basic base64(email:apiToken)`.
    4. Run through scheduler: `scheduler.acquire(async () => { ... })`.
    5. `fetch` the full URL. Handle 401 → trigger `refreshTokens()` (for OAuth), retry once. Handle 429 → return `rateLimited(retryAfterMs)`. Handle 4xx → `forbidden`/`notFound`. Handle 5xx/network → `network(cause)`.
    6. Parse with provided Zod schema. Schema drift → `parseError(issues)`.
    7. Return `ok(value)` on success.
  - [x] Additional helpers as needed: `jiraGet<T>(...)`, `jiraPost<T>(...)`. Start minimal — add request types as stories demand.
  - [x] Write co-located `lib/jira-client.test.ts` covering:
    - Success path: OAuth auth, token refresh on 401, retry succeeds
    - Success path: API-token auth (no refresh)
    - Null auth → auth-expired
    - 401 with OAuth refresh failure → auth-expired (tokens cleared)
    - 429 → rate-limited with Retry-After
    - 5xx → network error
    - Schema drift → parse-error
    - Scheduler tokens respected (third concurrent call waits)

- [x] **Task 4 — Build `lib/storage/settings.ts`** (AC: #4)
  - [x] Define `SettingsSchema` using WXT's `storage.defineItem`:
    ```ts
    export const managerDisplayNameItem = storage.defineItem<string | null>('local:managerDisplayName', { fallback: null });
    export const skipLevelDisplayNameItem = storage.defineItem<string | null>('local:skipLevelDisplayName', { fallback: null });
    ```
  - [x] Export `getSettings()`, `setManagerNames(...)` helpers.
  - [x] Write co-located `lib/storage/settings.test.ts`.

- [x] **Task 5 — Build `lib/manager-resolution.ts`** (AC: #4, #6, #7)
  - [x] Export `resolveReportingLine(): Promise<Result<ManagerResult, JiraError>>`:
    1. Call `jiraClient('rest/api/3/myself', JiraMyselfSchema)` → get worker `accountId`.
    2. Call `jiraClient(`rest/api/3/user?accountId=${accountId}`, JiraUserSchema)` → get worker user object with `manager` field.
    3. Type `ManagerResult` as discriminated union:
      ```ts
      export type ManagerResult =
        | { kind: 'ok'; managerDisplayName: string; skipLevelDisplayName: string | null }
        | { kind: 'manager-not-set' }
        | { kind: 'skip-level-not-set'; managerDisplayName: string };
      ```
    4. If manager field is present in user object → fetch manager's user object → get manager's displayName. Then fetch manager's manager for skip-level.
    5. If manager field is absent → return `{ kind: 'manager-not-set' }`.
    6. If manager exists but skip-level absent → return `{ kind: 'skip-level-not-set', managerDisplayName }`.
    7. Persist names via `lib/storage/settings.ts`.
  - [x] Write co-located `lib/manager-resolution.test.ts` covering:
    - Manager set, skip-level set → `ok` with both display names
    - Manager set, skip-level unset → `skip-level-not-set`
    - Manager unset → `manager-not-set`
    - Network error from Jira → preserves error from jira-client
    - Malformed response → parse-error

- [x] **Task 6 — Build `components/settings/ManagerDisplay.tsx`** (AC: #5, #6, #7)
  - [x] Props: `{ managerDisplayName: string | null; skipLevelDisplayName: string | null }`.
  - [x] Renders a "Reporting line" section with heading.
  - [x] Two read-only rows, not inputs:
    - Manager: "Manager (read from Jira): `<name>`" or "Manager not set in Jira — please contact your admin..." notice.
    - Skip-level: "Skip-level (read from Jira): `<name>`" or "Not set in Jira" notice.
  - [x] Named export, `STRINGS` object, follows `ConnectButton.tsx` / `DisconnectAction.tsx` patterns.
  - [x] Write co-located `ManagerDisplay.test.tsx` covering the four display states.

- [x] **Task 7 — Wire manager resolution into options page mount** (AC: #4, #5)
  - [x] In `entrypoints/options/App.tsx`, after `getAuth()` succeeds and `view.kind === 'connected'` is set, trigger `resolveReportingLine()`.
  - [x] Store result in a new state field on the connected view: `managerNames: ManagerNames | null` (null = loading, set after resolution).
  - [x] Pass `managerDisplayName` and `skipLevelDisplayName` to `<ManagerDisplay>` component.
  - [x] Replace the placeholder paragraph (`STRINGS.managerSectionPlaceholder`) with `<ManagerDisplay>`.
  - [x] On resolution failure (network/parse-error), show a minimal "Could not load reporting line" notice (non-blocking).

- [x] **Task 8 — Verify all gates pass** (AC: #1 through #8)
  - [x] Run `pnpm lint && pnpm test && pnpm tsc --noEmit && pnpm build` — all must pass.
  - [x] `pnpm test --run` passes all new tests.
  - [x] No new warnings in `pnpm lint`.
  - [x] `pnpm build` produces a valid extension bundle.

## Dev Notes

### Critical architecture patterns (binding)

- **`Result<T, E>` at I/O boundary.** `jiraClient` returns `Result<T, JiraError>`. `resolveReportingLine` returns `Result<ManagerResult, JiraError>`. Never throw across the I/O boundary.
  *[Source: architecture.md > Implementation Patterns > Error handling]*

- **`lib/` modules are framework-agnostic.** `lib/jira-client.ts`, `lib/scheduler.ts`, `lib/jira-types.ts`, `lib/manager-resolution.ts`, `lib/storage/settings.ts` — no React imports.
  *[Source: architecture.md > File Organization Rules]*

- **No default exports.** Named exports only.
  *[Source: architecture.md > Import & Module Patterns]*

- **No `any`.** Use `unknown`, Zod schemas, and narrow.
  *[Source: architecture.md > TypeScript Style]*

- **No direct `console.log` outside tests.** Use `lib/log.ts`.
  *[Source: architecture.md > Enforcement Guidelines]*

- **Co-located tests.** `*.test.ts` next to `*.ts`.
  *[Source: architecture.md > Structure Patterns]*

- **WXT storage import path is `wxt/utils/storage`.** Not `wxt/storage`.
  *[Source: Story 1.1 Dev Notes > Deviations #3]*

- **Zod schemas: suffix `Schema`; inferred types: same name without suffix.**
  *[Source: architecture.md > Naming Conventions]*

### Key decisions from Stories 1.1, 1.2, 1.3

- **Auth bundle is discriminated** (`AuthBundle = OAuthBundle | ApiTokenBundle`). `jiraClient` dispatches on `bundle.kind` for base URL and auth header.
  *[Source: lib/storage/tokens.ts; Story 1.1 completion notes]*

- **`clearAuth()` and `disconnectAll()` clear tokens** — after disconnect, `jiraClient` returns `auth-expired` because `getAuth()` → null.
  *[Source: Story 1.3 completion notes]*

- **`refreshTokens()` from `lib/oauth/refresh.ts`** is the single refresh function. `jiraClient` calls it on 401 and retries once. Do NOT duplicate refresh logic.
  *[Source: Story 1.2 Dev Notes]*

- **Library versions**: React `^19.2.4`, WXT `^0.20.26`, Tailwind CSS `^4.3.0`, Zod `^3.x`.

### File structure (must follow exactly)

```
jira-time-logger/
├── lib/
│   ├── jira-types.ts                    # NEW: Zod schemas for Jira API responses
│   ├── jira-types.test.ts               # NEW
│   ├── scheduler.ts                     # NEW: TokenBucketScheduler
│   ├── scheduler.test.ts                # NEW
│   ├── jira-client.ts                   # NEW: single Jira API wrapper
│   ├── jira-client.test.ts              # NEW
│   ├── manager-resolution.ts            # NEW: recursive manager + skip-level lookup
│   ├── manager-resolution.test.ts       # NEW
│   └── storage/
│       └── settings.ts                  # NEW: manager display name persistence
│       └── settings.test.ts             # NEW
├── components/
│   └── settings/
│       └── ManagerDisplay.tsx            # NEW: read-only reporting line
│       └── ManagerDisplay.test.tsx       # NEW
└── entrypoints/
    └── options/
        └── App.tsx                       # UPDATE: wire manager resolution
```

### `lib/scheduler.ts` — detailed API contract

```ts
export class TokenBucketScheduler {
  constructor(maxTokens: number = 2, refillIntervalMs: number = 1000);
  acquire<T>(fn: () => Promise<T>): Promise<T>;
}

export const scheduler = new TokenBucketScheduler(2, 1000);
```

The scheduler is a best-effort rate limiter. Jira Cloud enforces ~2 req/s. This throttles same-instance concurrent requests to match. The singleton lives at module level; both `jira-client` and future `background.ts` alarm handlers use it.

### `lib/jira-client.ts` — detailed API contract

```ts
import { type AuthBundle } from '@/lib/storage/tokens';
import { type Result, type JiraError } from '@/lib/result';
import { type z } from 'zod';

export async function jiraGet<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<Result<T, JiraError>>;

// Internal helpers (not exported):
//   getAuthHeaders(bundle: AuthBundle): { authorization: string; baseUrl: string }
//   base64(email: string, token: string): string  — for API-token auth
```

**Base URL construction:**
- OAuth: `https://api.atlassian.com/ex/jira/${bundle.cloudId}`
- API-token: `bundle.siteUrl` (e.g., `https://acme.atlassian.net`)

**Auth header construction:**
- OAuth: `Authorization: Bearer ${bundle.access_token}`
- API-token: `Authorization: Basic ${base64(`${email}:${apiToken}`)}`

**Retry on 401 (OAuth only):**
1. Call `refreshTokens()` from `lib/oauth/refresh.ts`.
2. If `ok` → re-read auth, retry the original request.
3. If `auth-expired` → tokens cleared, return `authExpired()`.
4. If other error → return `network(cause)`.

### `lib/manager-resolution.ts` — detailed API contract

```ts
import { type JiraError } from '@/lib/result';

export type ManagerNames = {
  managerDisplayName: string | null;
  skipLevelDisplayName: string | null;
};

export async function resolveReportingLine(): Promise<Result<ManagerNames, JiraError>>;
```

**Flow:**
1. `jiraGet('rest/api/3/myself', JiraMyselfSchema)` → worker `accountId`
2. `jiraGet(`rest/api/3/user?accountId=${accountId}`, JiraUserSchema)` → user object (not all fields. We need `manager` field from the response)
3. The `/rest/api/3/user` endpoint returns a `manager` object with `accountId` and `displayName`. Use `JiraUserSchema` but extend it to include the optional manager sub-object.
4. If no `manager` → return `{ managerDisplayName: null, skipLevelDisplayName: null }`.
5. If manager exists → set `managerDisplayName`. Then fetch manager's user record.
6. If manager's manager exists → set `skipLevelDisplayName`.
7. Persist both via `setManagerNames()`.

**Note on Jira API:** The `GET /rest/api/3/user?accountId={id}` endpoint returns `{ accountId, displayName, ... }`. The `manager` relationship is available via `GET /rest/api/3/user?accountId={id}&expand=groups,applicationRoles` — but the simplest approach is to use `GET /rest/api/3/myself` which includes the manager field in the expanded form. Actually, we need the Jira Cloud user search to get the manager chain. Since this can be complex, the implementation should:

1. Use `/rest/api/3/myself` for the initial accountId (already available via the existing `ATLASSIAN_MYSELF_URL_TEMPLATE`)
2. Then use `/rest/api/3/user?accountId={accountId}` for the user record which includes the `manager` reference
3. Finally, look up the manager's user record the same way for skip-level

### UX-DR compliance

| UX-DR | Requirement | Implementation |
|---|---|---|
| UX-DR22 | ManagerDisplay: read-only, not editable | `ManagerDisplay.tsx` with `<p>` elements, no inputs |
| UX-DR30 | Honest copy, no apology theatre | "Manager not set in Jira — please contact your admin..." |
| UX-DR31 | UI strings in `const STRINGS` | `ManagerDisplay.tsx` has a `STRINGS` object |
| UX-DR32 | Semantic DOM | `<h3>` heading, `<p>` for rows |

### Testing requirements (gates)

| Gate | Test type | Coverage |
|---|---|---|
| Unit | `lib/scheduler.test.ts` | Token exhaustion, refill, FIFO queuing, error passthrough |
| Unit | `lib/jira-types.test.ts` | Schema parsing, missing fields, extra fields |
| Unit | `lib/jira-client.test.ts` | Success, auth-expired, 401+refresh, 429, 5xx, schema drift, OAuth vs API-token |
| Unit | `lib/manager-resolution.test.ts` | 5 scenarios listed in Task 5 |
| Unit | `lib/storage/settings.test.ts` | Set/get round-trip, null fallback |
| Component | `ManagerDisplay.test.tsx` | 4 display states |
| Lint | `pnpm lint` | 0 errors |
| Type-check | `pnpm tsc --noEmit` | 0 errors |
| Build | `pnpm build` | Valid extension bundle |

### References

- [Epics: Story 1.4 full AC set](../planning-artifacts/epics.md#story-14-manager--skip-level-auto-detection-from-jira)
- [Architecture: jira-client.ts pattern (line 530-551)](../planning-artifacts/architecture.md)
- [Architecture: scheduler.ts](../planning-artifacts/architecture.md)
- [Architecture: jira-types.ts](../planning-artifacts/architecture.md)
- [Architecture: manager-resolution.ts](../planning-artifacts/architecture.md)
- [Architecture: storage/settings.ts](../planning-artifacts/architecture.md)
- [Architecture: ManagerDisplay.tsx (line 661)](../planning-artifacts/architecture.md)
- [Existing code: lib/env.ts](../../lib/env.ts)
- [Existing code: lib/result.ts](../../lib/result.ts)
- [Existing code: lib/storage/tokens.ts](../../lib/storage/tokens.ts)
- [Existing code: lib/oauth/refresh.ts](../../lib/oauth/refresh.ts)
- [Existing code: entrypoints/options/App.tsx](../../entrypoints/options/App.tsx)
- [Existing code: components/settings/ConnectButton.tsx](../../components/settings/ConnectButton.tsx) — component pattern
- External: [Atlassian Jira REST API — GET /rest/api/3/myself](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-myself/#api-rest-api-3-myself-get)
- External: [Atlassian Jira REST API — GET /rest/api/3/user](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-users/#api-rest-api-3-user-get)

### What NOT to do (disaster prevention)

1. **Do NOT build TanStack Query integration.** This story wires the I/O boundary only. TanStack Query comes in Story 2.1 (popup shell). `jira-client.ts` is a plain async function.
2. **Do NOT build `lib/hierarchy.ts`.** That's for task/subtask discovery (Story 2.2). This story only resolves reporting line (manager + skip-level names).
3. **Do NOT build the full options page form.** `ManagerDisplay` is one section. `CatchAllProjectField`, `PtoSubtaskField`, etc. are Story 1.5.
4. **Do NOT duplicate auth header logic.** `jira-client.ts` is the single place that constructs auth headers. Never inline `Authorization` headers in other modules.
5. **Do NOT import React in `lib/` modules.** The `lib/` layer is framework-agnostic.
6. **Do NOT fail the connection flow if manager resolution fails.** The spec requires graceful degradation — the user proceeds regardless.
7. **Do NOT make the manager/skip-level fields editable.** They are read-only per UX-DR22.
8. **Do NOT skip the `retryAfterMs` parsing from 429 responses.** The scheduler must respect it.
9. **Do NOT use `any` or `as` assertions.**
10. **Do NOT block the options page render waiting for manager resolution.** Fire in `useEffect` after connected view mounts; show loading placeholder.

## Dev Agent Record

### Agent Model Used

deepseek/deepseek-v4-pro

### Debug Log References

### Completion Notes List

- Task 1: Built `lib/scheduler.ts` with `TokenBucketScheduler` class (default 2 tokens, 1000ms interval). Module-level singleton `scheduler`. Co-located test covers 6 scenarios: sequential success, concurrent exhaustion, queuing, refill, error passthrough, max token ceiling.
- Task 2: Built `lib/jira-types.ts` with `JiraMyselfSchema` and `JiraUserSchema`. Co-located test covers valid parsing, missing fields, extra fields.
- Task 3: Built `lib/jira-client.ts` with `jiraGet<T>(path, schema)`. Auth header dispatch (OAuth Bearer vs API-token Basic), base URL construction, 401 refresh + retry, 429 rate-limited, 403/404/5xx handling, Zod validation. Tested with mocked storage/scheduler/refresh.
- Task 4: Built `lib/storage/settings.ts` with `setManagerNames()`/`getManagerNames()` using WXT `defineItem`. Co-located test covers null fallback, round-trip, partial names.
- Task 5: Built `lib/manager-resolution.ts` with `resolveReportingLine()` — fetches myself, user, manager, skip-level via jiraGet. Graceful degradation when manager/skip-level unset. Persists via setManagerNames.
- Task 6: Built `components/settings/ManagerDisplay.tsx` with loading/error/normal states. Read-only rows for manager and skip-level. Non-blocking notices when unset.
- Task 7: Wired into `entrypoints/options/App.tsx` — added `managerResolving`, `managerError`, `managerNames` state. Triggers `resolveReportingLine()` via `useEffect` when `view.kind === 'connected'`. Replaced placeholder paragraph with `<ManagerDisplay>`.
- Task 8: All gates pass — lint: 0 issues, tests: 140 pass/0 fail, tsc: no errors, build: succeeds.

### File List

- `lib/scheduler.ts` (NEW)
- `lib/scheduler.test.ts` (NEW)
- `lib/jira-types.ts` (NEW)
- `lib/jira-types.test.ts` (NEW)
- `lib/jira-client.ts` (NEW)
- `lib/jira-client.test.ts` (NEW)
- `lib/storage/settings.ts` (NEW)
- `lib/storage/settings.test.ts` (NEW)
- `lib/manager-resolution.ts` (NEW)
- `components/settings/ManagerDisplay.tsx` (NEW)
- `entrypoints/options/App.tsx` (MODIFIED)

### File List

### Change Log

| Date | Change |
|---|---|
| 2026-06-20 | Story 1.4 created — Manager & Skip-Level Auto-Detection from Jira |
| 2026-06-20 | Implemented: scheduler, jira-types, jira-client, settings storage, manager-resolution, ManagerDisplay. Wired into App.tsx. All gates pass. |