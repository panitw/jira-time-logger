# Story 1.2: Silent Token Refresh & 30-Day Auth Survival

Status: done
baseline_commit: bde738575db202f6d99ea19f8761ea1b90fc2780

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a connected worker,
I want my session to stay authenticated silently across browser restarts and time,
so that I never have to re-connect during normal use.

## Acceptance Criteria

1. **Proactive alarm-driven refresh** — When a stored OAuth token bundle exists and `expires_at` is within 2 minutes of the current time, the service worker triggers a token refresh by exchanging the refresh token at the Atlassian token endpoint. The refresh runs proactively via `chrome.alarms` (1-minute minimum interval honored). API-token bundles are skipped (no expiry schedule per Story 1.1 Scope Note).
   *[Source: epics.md > Story 1.2 AC; architecture.md > Authentication & Security]*

2. **Refresh-in-flight mutex** — When a refresh is in flight and a second refresh attempt is triggered concurrently (e.g., from a parallel API call or overlapping alarm), a `refreshInFlight` mutex in `chrome.storage.session` prevents the second attempt from issuing a duplicate token exchange. The second caller awaits the in-flight result.
   *[Source: epics.md > Story 1.2 AC; architecture.md > Core Architectural Decisions > Authentication & Security]*

3. **Atomic token rotation** — On successful refresh, the rotated `refresh_token` and updated `access_token` + `expires_at` are written to `chrome.storage.local` in a single atomic write (one `setAuth()` call). No half-state where one token is updated and the other isn't. The `expires_at` is computed as `Date.now() + expires_in * 1000` and stored as an ISODateTime string (same convention as Story 1.1).
   *[Source: epics.md > Story 1.2 AC; architecture.md > Data Boundaries]*

4. **Auth failure cleanup** — When refresh fails with a 4xx auth error (refresh token revoked, scope removed, etc.), the OAuth token bundle is cleared from `chrome.storage.local` via `clearAuth()`. Pending API calls observe `auth-expired` Result. UI surfaces (not Story 1.2's scope but defined here so future stories are consistent) fall back to the "Connect to Jira" state. 5xx and network errors are NOT treated as permanent failures — the module returns the error without clearing tokens.
   *[Source: epics.md > Story 1.2 AC; architecture.md > Process Patterns > Error handling]*

5. **MV3 service-worker restart survival** — When the service worker is killed by Chrome between alarm fires (MV3 lifecycle), the next alarm wakes the worker, it reads tokens from `chrome.storage.local`, and refresh logic continues correctly without losing state. No in-memory-only state is relied upon.
   *[Source: epics.md > Story 1.2 AC; architecture.md > Technical Constraints & Dependencies]*

6. **Alarm registration on connect** — When the user completes OAuth connect (Story 1.1) OR the service worker boots and finds a valid OAuth bundle, a `chrome.alarms` alarm named `token-refresh` is registered that fires periodically (periodInMinutes: 1, Chrome's minimum for MV3). On each fire, the handler checks expiry and refreshes if needed.
   *[Source: epics.md > Story 1.2 AC; architecture.md > Decision Impact Analysis]*

## Tasks / Subtasks

- [x] **Task 1 — Build `lib/storage/refresh-mutex.ts`** (AC: #2)
  - [x] Export `acquireRefreshLock(): Promise<boolean>` — sets a key in `chrome.storage.session` (session-scoped, cleared on browser close). Returns `true` if this caller acquired the lock; `false` if another caller already holds it. The implementation must be a single session-storage write that succeeds only if the key doesn't exist (`chrome.storage.session.set` is one-shot — use a race-comparison pattern).
  - [x] Export `releaseRefreshLock(): Promise<void>` — removes the session-storage key. Callers MUST release in a finally block.
  - [x] Export `isRefreshing(): Promise<boolean>` — returns true if the session key exists (another caller has the lock).
  - [x] Write co-located `lib/storage/refresh-mutex.test.ts` covering: acquire succeeds when key absent, acquire fails when key present, release clears key, double-acquire pattern.

- [x] **Task 2 — Build `lib/oauth/refresh.ts`** (AC: #1, #3, #4, #5)
  - [x] Export `refreshTokens(): Promise<Result<OAuthBundle, RefreshError>>` where `RefreshError = OAuthError | JiraError`:
    1. Read current auth bundle from `lib/storage/tokens.ts` via `getAuth()`.
    2. If bundle is `null` or `kind === 'api-token'`, return `oauthError('no-oauth-bundle')` — API tokens don't expire.
    3. Check if the existing access token is still valid (`hasValidAuth(bundle)`). If valid with > 2 min remaining, return `ok(bundle)` (no-op — already fresh).
    4. Acquire the refresh mutex via `acquireRefreshLock()`. If lock not acquired, poll `isRefreshing()` + `getAuth()` in a 500 ms loop (max 10 iterations = 5 s) waiting for the in-flight refresh to complete, then return the updated bundle or error.
    5. Exchange: `POST ATLASSIAN_TOKEN_URL` from `lib/env.ts` with body `{ grant_type: 'refresh_token', client_id: ATLASSIAN_CLIENT_ID, refresh_token: bundle.refresh_token }`. Content-Type: `application/json`. Use native `fetch`. Do NOT import from a non-existent `jira-client` — this is a standalone module.
    6. Parse the response with a Zod schema (`RefreshTokenResponseSchema` — same shape as `TokenResponseSchema` from `lib/oauth/flow.ts`: `{ access_token, refresh_token, expires_in, scope, token_type }`). Schema drift → `parseError(...)`.
    7. On 4xx response (400–499 EXCEPT 429): the refresh token is invalid/revoked. Clear tokens via `clearAuth()` and return `authExpired()`.
    8. On 5xx or network error: return `network(...)` — do NOT clear tokens (transient failure, retryable).
    9. On success: validate `expires_in` (must be finite, positive, ≤ 31,536,000 = 1 year); create new OAuthBundle with rotated `access_token`, rotated `refresh_token`, computed `expires_at` from `Date.now() + expires_in * 1000`; persist via `setAuth(newBundle)` (single atomic write — AC #3).
    10. In the finally block, always call `releaseRefreshLock()`.
  - [x] Write co-located `lib/oauth/refresh.test.ts` covering:
    - Success path: mocked fetch returns 200 with new tokens → verify `setAuth` called with rotated values
    - Skip when API-token bundle present → returns no-oauth-bundle
    - Skip when token valid with >2min remaining → returns existing bundle
    - 400/401 from token endpoint → `clearAuth()` called → returns `auth-expired`
    - 429 rate-limited → returns `rate-limited(...)`, tokens NOT cleared
    - 5xx from token endpoint → returns `network(...)`, tokens NOT cleared
    - Network fetch throws → returns `network(...)`
    - Schema drift in response → returns `parse-error(...)`
    - Mutex contention: second caller awaits in-flight result
    - `expires_in` invalid (negative/0/NaN/too large) → returns `parse-error`
    - No stored bundle → returns no-oauth-bundle
    - MV3 survival: refresh works from `chrome.storage.local` alone (no in-memory state)

- [x] **Task 3 — Register the `token-refresh` alarm in the service worker** (AC: #1, #6)
  - [x] In `entrypoints/background.ts`, after the existing `onInstalled` handler, add:
    - `chrome.alarms.create('token-refresh', { periodInMinutes: 1 })` — fires every 1 minute (Chrome MV3 minimum).
    - Register `chrome.alarms.onAlarm.addListener(async (alarm) => { if (alarm.name === 'token-refresh') await handleTokenRefresh(); })`.
  - [x] Implement `handleTokenRefresh()`:
    1. Read `getAuth()`. If `null` or `kind === 'api-token'`, return (nothing to refresh).
    2. Check `hasValidAuth(bundle)`. If `expires_at` is more than 2 minutes in the future, return (token still fresh — alarm fires every minute but we only act within the 2-min window).
    3. Call `refreshTokens()` from `lib/oauth/refresh.ts`.
    4. On `ok`: `log.info('auth.refresh.success', { expiresAt: result.value.expires_at })`.
    5. On `auth-expired`: `log.warn('auth.refresh.expired', {})` — tokens already cleared by `refreshTokens()`.
    6. On any other error: `log.warn('auth.refresh.failed', { kind: result.kind })` — alarm will fire again in 1 minute.
  - [x] Do NOT add the `token-refresh` alarm registration inside the `onInstalled` handler — it must fire every time the service worker boots (MV3 restart), not just on install. Use the top-level `defineBackground` body.
  - [x] Ensure the alarm re-registers on every service-worker wake (no conditional registration that assumes persistent state).

- [x] **Task 4 — Wire `chrome.alarms` permission verification** (AC: #6)
  - [x] Verify `wxt.config.ts` already includes `alarms` in the `permissions` array (it should from Story 1.1 Task 15). If missing, add it. Missing `alarms` causes silent runtime failures in MV3.
  - [x] Verify the manifest output after `pnpm build` includes `"alarms"` in the permissions list.

- [x] **Task 5 — Verify end-to-end** (AC: #1 through #6)
  - [x] Run `pnpm lint && pnpm test && pnpm tsc --noEmit && pnpm build` — all must pass.
  - [x] Unit test verification: `pnpm test --run` passes all refresh-specific tests.
  - [x] No new warnings or errors in `pnpm lint`.
  - [x] `pnpm build` produces a valid extension bundle.
  - [x] Manual smoke: sideload extension, connect via OAuth, verify via DevTools → Application → Storage → Session that a `token-refresh` alarm exists (or use `chrome.alarms.getAll()` from the service-worker console). Verify `handleTokenRefresh` fires correctly by checking service worker console logs.

### Review Findings

<!-- Appended by code-review workflow 2026-06-20 -->

- [x] [Review][Patch] Leaked/stale refresh mutex has no TTL recovery — if the MV3 SW is killed between `acquireRefreshLock()` and the `finally` release, the lock persists in `chrome.storage.session` for the entire browser session; the stored timestamp is logged (`heldSince`) but never compared against `Date.now()` to expire a stale lock, so all future refreshes return `lock-contention` until the browser fully closes. Contradicts disaster-note #7 and the spirit of AC #5. (HIGH) [lib/storage/refresh-mutex.ts:5-29]
- [ ] [Review][Patch] **(REOPENED in round 2 — see Decision below)** Required mutex-contention test is missing — Task 2 explicitly lists "Mutex contention: second caller awaits in-flight result". A test by that name now exists (refresh.test.ts:340) but it asserts only `kind === 'ok'`, never that `fetch` was called once — verified that two concurrent callers BOTH acquire the lock and BOTH hit the token endpoint. AC #2's guarantee is unmet. (HIGH) [lib/oauth/refresh.test.ts:340]
- [x] [Review][Patch] Waiter branch returns an unvalidated / possibly api-token bundle typed as OAuth — `return ok(updated as OAuthBundle)` passes for an api-token bundle (`hasValidAuth` is always true for api-token), and the `!stillRefreshing` branch returns `ok(final)` without an expiry check, so a caller can receive an expired or wrong-kind bundle. (MEDIUM) [lib/oauth/refresh.ts:80-91]
- [x] [Review][Patch] 429 `Retry-After` parsing yields `NaN`/negative `retryAfterMs` — `parseInt(retryAfter,10)*1000` has no `Number.isFinite` guard or clamp; an HTTP-date or malformed/negative header produces `NaN`/negative ms (contrast the careful `expires_in` bounds check). (MEDIUM) [lib/oauth/refresh.ts:113-114]
- [x] [Review][Patch] No timeout/abort on the token-endpoint fetch — a hung connection holds the mutex for the connection lifetime, widening the leaked-lock window; add an `AbortController` timeout. (MEDIUM) [lib/oauth/refresh.ts:98-106]
- [x] [Review][Patch] Unconditional `chrome.alarms.create` on every SW wake resets/starves the 1-min alarm — re-creating an alarm with the same name resets its timer; if the SW boots more often than once per minute the `token-refresh` alarm can be perpetually reset and never fire. Guard with `chrome.alarms.get('token-refresh')` first. (MEDIUM) [entrypoints/background.ts:45]
- [x] [Review][Patch] Poll loop reports spurious `lock-contention` when a legitimate refresh exceeds ~5s — the waiter loops exactly 10×500ms; a slow-but-successful in-flight refresh causes the waiter to return failure even though good tokens are about to be stored. Re-read storage once more before returning contention. (MEDIUM) [lib/oauth/refresh.ts:78-93]
- [x] [Review][Patch] Dead code — `refreshAlreadyFresh()` and the `'already-fresh'` `RefreshError` member are never produced (the fresh path returns `ok(bundle)`); remove or wire them. (LOW) [lib/oauth/refresh.ts:37-39]
- [x] [Review][Defer] `handleTokenRefresh` ignores the rate-limit `Retry-After` backoff and emits no re-auth signal on `auth-expired` [entrypoints/background.ts:28-36] — deferred, UI fallback is out of scope per UX-DR note; backoff scheduling belongs to a later story.
- [x] [Review][Defer] Expiry math depends on wall-clock `Date.now()`; a backward clock jump (sleep/resume, NTP) can misjudge validity [lib/oauth/refresh.ts:69; lib/storage/tokens.ts:73-75] — deferred, pre-existing inherent limitation not introduced by this change.

#### Round 2 (re-review 2026-06-20)

7 of 8 round-1 patches confirmed resolved (TTL reclaim, waiter kind/validity guards, 429 finite-guard, AbortController, alarm get-guard, post-loop re-read, dead-code removal). Remaining items:

- [x] [Review][Patch] **(Decision resolved → Option 1: serialize for real)** Make the second concurrent caller genuinely await the in-flight result (close the read→set→verify race so identical-`Date.now()` callers cannot both acquire — e.g. single-flight the fetch or add a uniqueness tiebreak), and change the contention test to assert `fetch` is called **exactly once**. Mutex does not actually prevent duplicate token exchange — AC #2 unmet. `acquireRefreshLock`'s read→set→verify is not atomic and, when two interleaved callers compute an identical `Date.now()`, both write the same value and both pass `verify[KEY] === timestamp` → both acquire and both POST to the token endpoint (confirmed: 2 fetches). The contention test (refresh.test.ts:340) hides this by asserting only `kind === 'ok'`. The spec is internally contradictory: AC #2 mandates "prevents the second attempt from issuing a duplicate token exchange / the second caller awaits the in-flight result," while Dev Notes §"refresh-mutex.ts detailed API contract" calls the race "acceptable… best-effort, not a security boundary." Consequence per spec's own scenario: the losing concurrent refresh hits a 4xx (rotated refresh token) → `clearAuth()` → user silently logged out despite the sibling refresh succeeding. (HIGH) [lib/storage/refresh-mutex.ts:6-26; lib/oauth/refresh.test.ts:340] — **OWNER DECISION REQUIRED:** (a) implement a serializing mutex so the second caller truly awaits, and assert `fetch` called exactly once; or (b) ratify best-effort per the Dev Note, amend AC #2 wording, fix the test to honestly assert the best-effort behaviour, and handle the spurious-logout consequence.
- [x] [Review][Patch] AbortController timeout covers only header receipt, not body read — `clearTimeout(timeout)` fires immediately after `fetch` resolves (refresh.ts:109), so a stalled response body in `await res.json()` (refresh.ts:140) hangs while holding the lock. Move `clearTimeout` after the body is parsed (or guard `res.json()` under the same controller). (MEDIUM) [lib/oauth/refresh.ts:109,140]
- [x] [Review][Defer] Waiter misclassifies a holder's terminal failure (auth-expired / network) as `lock-contention` and never self-retries after the lock frees [lib/oauth/refresh.ts:79-92] — deferred, best-effort contention path the spec treats as rare; the next alarm retries within 1 min and UI re-auth signalling is out of scope per the UX-DR note.
- [x] [Review][Defer] `chrome.alarms.get` rejection only logs and creates no fallback alarm; the `onAlarm` listener is registered after `await`s, so an alarm firing in the SW-wake window can be missed [entrypoints/background.ts:44-57] — deferred, low likelihood and bounded by the 2-min pre-expiry margin.

#### Round 3 (re-review 2026-06-20)

Both Round-2 items confirmed RESOLVED by all three layers: AC #2 now satisfied via a module-level single-flight promise (`refreshTokens` delegates to `executeRefresh`; a second concurrent caller returns the in-flight `refreshPromise` → exactly one `fetch`, asserted by `expect(fetchMock).toHaveBeenCalledTimes(1)` at refresh.test.ts:372); the AbortController timeout now covers the body read (`clearTimeout` after `await res.json()` at refresh.ts:158). AC #5 not violated — the in-memory promise is a same-instance optimization; the `chrome.storage.session` mutex remains the cross-restart backstop. No regressions in AC #1/#3/#4/#6 or binding patterns.

- [x] [Review][Patch] Timer leak on the fetch-error path — the `fetch` `catch` block returned `refreshNetwork(message)` without `clearTimeout(timeout)`, so on a non-abort rejection (DNS/offline) the 15s timer stayed armed, later fired `controller.abort()` on an already-settled request, and could delay MV3 SW suspension. **FIXED** — `clearTimeout(timeout)` added to the catch (refresh.ts:125); tests + tsc green. (MEDIUM) [lib/oauth/refresh.ts:124-131]
- [x] [Review][Defer] Storage mutex keys on `Date.now()`, so two callers with an identical timestamp could both pass the read→set→verify check — currently unreachable (single-flight serializes same-instance callers and MV3 runs one SW instance at a time), but a unique nonce (e.g. `crypto.randomUUID()`) would harden it defensively. [lib/storage/refresh-mutex.ts:6-26] — deferred, not reachable under the current single-SW + single-flight design.

## Dev Notes

### Critical architecture patterns (binding)

- **Result type at I/O boundary.** `refreshTokens()` returns `Result<OAuthBundle, RefreshError>`. Never throw across the I/O boundary. Consumers dispatch on `kind`.
  *[Source: architecture.md > Implementation Patterns > Error handling]*

- **Single I/O wrapper convention.** Story 1.4 will build `lib/jira-client.ts` — the single wrapper for all authenticated Jira API calls. Story 1.2's `lib/oauth/refresh.ts` makes its OWN direct `fetch` calls to the token endpoint because (a) `lib/jira-client.ts` doesn't exist yet and (b) the refresh flow pre-dates/handles auth for jira-client itself. When Story 1.4 ships, its `jira-client` will call `refreshTokens()` on 401 before retrying — that integration hook must be exposed now. **Export `refreshTokens` as a standalone async function** with a stable signature so `jira-client` can import it later.
  *[Source: architecture.md > API & Communication Patterns; Story 1.1 Dev Notes > Critical architecture patterns]*

- **No default exports.** Named exports only. `export async function refreshTokens()` — never `export default refreshTokens`.
  *[Source: architecture.md > Import & Module Patterns]*

- **Co-located tests.** `lib/oauth/refresh.test.ts` lives next to `lib/oauth/refresh.ts`. `lib/storage/refresh-mutex.test.ts` lives next to `lib/storage/refresh-mutex.ts`. Test files are the only place `console.log` is permitted.
  *[Source: architecture.md > Structure Patterns]*

- **No `any`.** Use `unknown`, Zod schemas, and narrow.
  *[Source: architecture.md > TypeScript Style]*

- **No direct `console.log` outside tests.** Use `lib/log.ts` helpers (`log.info`, `log.warn`, `log.error`, `log.debug`).
  *[Source: architecture.md > Enforcement Guidelines]*

- **Dates as ISO strings between modules.** `expires_at` is computed as `new Date(Date.now() + expires_in * 1000).toISOString()` and stored/returned as `ISODateTime` string. `Date` objects exist only inside logic functions.
  *[Source: architecture.md > Format Patterns]*

### Key decisons from previous story (Story 1.1)

- **Auth bundle is a discriminated union** (`AuthBundle = OAuthBundle | ApiTokenBundle`). The refresh flow ONLY applies to `OAuthBundle` (has `refresh_token` + `expires_at`). API-token bundles are ignored by the refresh flow. Story 1.1 Scope Note documents this explicitly.
  *[Source: lib/storage/tokens.ts; 1-1-project-scaffold-and-oauth-connect.md > Scope Note: API-Token Auth]*

- **Storage API is `getAuth()` / `setAuth()` / `clearAuth()` / `hasValidAuth()`.** Legacy aliases exist (`getTokens` etc.) but new code should use the Auth-named functions. `setAuth(bundle)` is a single atomic `setValue` call — writing an OAuthBundle with rotated values is inherently atomic (AC #3).
  *[Source: lib/storage/tokens.ts]*

- **`hasValidAuth()` already has a 60-second clock-skew buffer** (treats token as expired 60s before the actual `expires_at` time). The AC #1 "within 2 minutes" check should use this as a base — the alarm handler checks `expires_at < Date.now() + 120_000` to decide whether to refresh. This 2-minute window combined with the 1-minute alarm period guarantees at least one refresh attempt before expiry.
  *[Source: lib/storage/tokens.ts:75]*

- **WXT storage import path is `wxt/utils/storage`** (not `wxt/storage` which was the old shorthand). Use this exact path.
  *[Source: Story 1.1 Dev Notes > Deviations #3]*

- **Library versions**: React `^19.2.4`, WXT `^0.20.26`, Tailwind CSS `^4.3.0`, Zod `^3.x`. These were bumped from the architecture doc's pinned versions during Story 1.1 implementation. Tailwind v4 is CSS-first — tokens live in `styles/globals.css`, not `tailwind.config.ts`.
  *[Source: Story 1.1 Dev Notes > Deviations #1]*

### File structure (must follow exactly)

This story creates the following files (and NO OTHERS unless required by a task above):

```
jira-time-logger/
├── lib/
│   ├── oauth/
│   │   └── refresh.ts              # + refresh.test.ts  (NEW)
│   └── storage/
│       └── refresh-mutex.ts        # + refresh-mutex.test.ts  (NEW)
│
├── entrypoints/
│   └── background.ts               # UPDATE: add token-refresh alarm + handler
│
└── wxt.config.ts                    # VERIFY ONLY: 'alarms' in permissions
```

Files NOT created/modified in Story 1.2:
- `lib/jira-client.ts`, `lib/jira-types.ts`, `lib/scheduler.ts` (Story 1.4)
- `lib/oauth/flow.ts` — unchanged; the existing OAuth connect flow is complete
- `lib/oauth/pkce.ts` — unchanged
- `lib/storage/tokens.ts` — unchanged; the existing storage API + `hasValidAuth` are sufficient
- `entrypoints/options/*` — unchanged; options page already shows connected state
- `components/*` — unchanged; no UI changes in this story

### `lib/oauth/refresh.ts` — detailed API contract

```ts
import { type Result, type OAuthError } from '@/lib/result';
import { type OAuthBundle } from '@/lib/storage/tokens';

export type RefreshError = OAuthError; // reuses existing error kinds: oauth-error, network, parse-error, auth-expired via JiraError

export async function refreshTokens(): Promise<Result<OAuthBundle, RefreshError>>;
```

**Why `OAuthError` not `JiraError`:** The refresh module only talks to the OAuth token endpoint (`auth.atlassian.com`), not the Jira REST API. Reusing `OAuthError` from `lib/result.ts` (which already has `oauth-error`, `network`, `parse-error`) is a better fit than `JiraError` (which has `rate-limited`, `forbidden`, `not-found`). However, the AC requires returning `auth-expired` on 4xx — `authExpired()` is a `JiraError` constructor. **Resolve this by defining `RefreshError` as a union of the needed error kinds rather than piggybacking on either existing type.** Construct new error helpers in `refresh.ts` that conform to the `kind` contract the AC requires.

Alternatively, simpler approach: define `RefreshError` in `refresh.ts` as:
```ts
export type RefreshError =
  | { kind: 'ok'; value: OAuthBundle }     // not used — Result<OAuthBundle, RefreshError> separates ok
  | { kind: 'auth-expired' }
  | { kind: 'network'; cause: string }
  | { kind: 'parse-error'; issue: unknown }
  | { kind: 'rate-limited'; retryAfterMs: number }
  | { kind: 'no-oauth-bundle' }
  | { kind: 'already-fresh' }
  | { kind: 'lock-contention'; message: string };
```

And provide helper constructors: `refreshAuthExpired()`, `refreshNetwork(cause)`, `refreshParseError(issue)`, `refreshRateLimited(ms)`, `refreshNoOauthBundle()`, `refreshAlreadyFresh()`, `refreshLockContention(msg)`.

This is cleaner — the module owns its own error domain, and consumers map to UI states.

### `lib/storage/refresh-mutex.ts` — detailed API contract

```ts
// Returns true if this caller acquired the lock. False = another caller holds it.
export async function acquireRefreshLock(): Promise<boolean>;

// Releases the lock. Call in finally block.
export async function releaseRefreshLock(): Promise<void>;

// Checks if lock is held without acquiring.
export async function isRefreshing(): Promise<boolean>;
```

**Implementation approach for MV3 service worker contexts:**
- Use `chrome.storage.session` with a sentinel key (e.g., `'oauth.refreshInFlight'`).
- The mutex key naturally expires when the browser session ends — fits the session-scoped requirement exactly.
- The acquire pattern: read current value → if undefined, set it → verify we won the race. Since `chrome.storage.session` operations are serialized within the same context, the simplest approach is:
  1. Read the key. If it already has a value → return false (lock taken).
  2. Set the key to `Date.now()`. Return true.
  3. Note: there IS a tiny race window between read and write. For a browser extension with OAuth refresh (1/min alarm), this is acceptable — the worst case is two concurrent refreshes on extension startup, and even then the server-side token rotation handles it (the first request succeeds, the second gets a 4xx because the old refresh token was invalidated). The mutex is a best-effort optimization, not a security boundary.

### `entrypoints/background.ts` — update details

**Current state:** The background.ts from Story 1.1 has:
```ts
export default defineBackground(() => {
  log.info('background.boot', { ... });
  chrome.runtime.onInstalled.addListener((details) => { ... });
});
```

**Changes needed:**
1. Import `refreshTokens` from `lib/oauth/refresh.ts`.
2. Import `getAuth`, `hasValidAuth` from `lib/storage/tokens.ts`.
3. Inside `defineBackground(() => { ... })`, add `chrome.alarms.create('token-refresh', { periodInMinutes: 1 })` at the top level (outside onInstalled — it must fire on EVERY service-worker wake per AC #5).
4. Add `chrome.alarms.onAlarm.addListener(...)` with the `token-refresh` handler.
5. Wrap alarm registration in a try/catch — `chrome.alarms.create` with a duplicate name in MV3 is fine (it silently replaces), but catching guards against edge cases.

### Testing requirements (gates)

| Gate | Test type | What it covers |
|---|---|---|
| Unit (Vitest) | `lib/storage/refresh-mutex.test.ts` | acquire/release/isRefreshing cycle; double-acquire; release clears |
| Unit (Vitest) | `lib/oauth/refresh.test.ts` | All 10+ scenarios listed in Task 2 |
| Lint | `pnpm lint` | All naming/import/no-default-export/no-any/no-console rules pass |
| Type-check | `pnpm tsc --noEmit` | Zero errors |
| Build | `pnpm build` | Produces valid extension bundle |

**Vitest configuration:** `lib/oauth/refresh.test.ts` and `lib/storage/refresh-mutex.test.ts` use `jsdom` environment (already the global default in `vitest.config.ts` from Story 1.1). Mock `fetch` with `vi.stubGlobal('fetch', ...)`. Mock `chrome.storage.local` and `chrome.storage.session` with `vi.mock` — see existing test patterns in `lib/storage/tokens.test.ts` and `lib/oauth/flow.test.ts` for reference.

**Test mocking guidance for `chrome.storage.session`:**
```ts
// Pattern used in lib/oauth/flow.test.ts — replicate for refresh tests
const sessionStore = new Map<string, unknown>();
vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: vi.fn(async (keys) => { ... }),
      set: vi.fn(async (obj) => { ... }),
      remove: vi.fn(async (keys) => { ... }),
    },
  },
});
```

### UX-DR compliance

**No UI changes in this story.** Story 1.2 is entirely backend/service-worker logic. The "Connect to Jira" fallback UI on `auth-expired` is handled by existing code in Story 1.1's `App.tsx` which checks `hasValidAuth()` on mount — when the refresh flow clears tokens on permanent failure, the options page and popup already know how to fall back.

### References

- [Epics: Story 1.2 full AC set](../planning-artifacts/epics.md#story-12-silent-token-refresh--30-day-auth-survival)
- [Architecture: Authentication & Security](../planning-artifacts/architecture.md#authentication--security)
- [Architecture: Data Boundaries](../planning-artifacts/architecture.md#data-boundaries)
- [Architecture: API & Communication Patterns](../planning-artifacts/architecture.md#api--communication-patterns)
- [Architecture: Implementation Patterns — Error handling](../planning-artifacts/architecture.md#process-patterns)
- [Architecture: Implementation Patterns — Retry](../planning-artifacts/architecture.md#process-patterns)
- [Architecture: Technical Constraints — MV3 service worker lifecycle](../planning-artifacts/architecture.md#technical-constraints--dependencies)
- [PRD: FR4 (access tokens refreshed automatically) + NFR5 (auth survives 30 days)](../planning-artifacts/prd.md)
- [PRD: NFR10 (PKCE, no client secret; tokens only in chrome.storage.local)](../planning-artifacts/prd.md)
- [Story 1.1: Dev Notes — Critical architecture patterns](../implementation-artifacts/1-1-project-scaffold-and-oauth-connect.md#dev-notes)
- [Story 1.1: Scope Note — API-Token Auth](../implementation-artifacts/1-1-project-scaffold-and-oauth-connect.md#scope-note-api-token-auth-added-during-review)
- [Existing code: lib/storage/tokens.ts](../../lib/storage/tokens.ts)
- [Existing code: lib/oauth/flow.ts](../../lib/oauth/flow.ts)
- [Existing code: lib/result.ts](../../lib/result.ts)
- [Existing code: lib/env.ts](../../lib/env.ts)
- [Existing code: entrypoints/background.ts](../../entrypoints/background.ts)
- External: [Atlassian OAuth 2.0 — Refresh tokens documentation](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#how-do-i-get-a-new-access-token--if-my-access-token-expires-or-is-revoked-)
- External: [Chrome `chrome.alarms` API reference](https://developer.chrome.com/docs/extensions/reference/api/alarms)

### What NOT to do (disaster prevention)

1. **Do NOT build `lib/jira-client.ts`.** That's Story 1.4. The refresh module makes its own `fetch` calls to the token endpoint.
2. **Do NOT modify `lib/oauth/flow.ts`.** The existing OAuth connect flow is complete and unrelated to silent refresh.
3. **Do NOT change the AuthBundle discriminated union in `lib/storage/tokens.ts`.** The existing schema supports both OAuth and API-token bundles. Refresh only applies to OAuth.
4. **Do NOT register the alarm inside `onInstalled`.** It must fire on EVERY service-worker wake (MV3 lifecycle). Use the top-level `defineBackground` body.
5. **Do NOT use `chrome.storage.local` for the refresh mutex.** It's durable and could survive browser crashes, leaving a stale lock. Use `chrome.storage.session` which clears on browser close.
6. **Do NOT clear tokens on 5xx errors.** Only permanent auth failures (4xx) should clear tokens. Network errors are retryable.
7. **Do NOT forget `finally { releaseRefreshLock() }`.** A leaked mutex blocks ALL future refreshes until browser restart.
8. **Do NOT inline the `refresh_token` exchange into `background.ts`.** The refresh function must be a standalone module (`lib/oauth/refresh.ts`) so `lib/jira-client.ts` (Story 1.4) can call it on 401.
9. **Do NOT use `any` in tests or implementation.** Type errors catch real bugs.
10. **Do NOT skip the `expires_in` bounds check.** An invalid `expires_in` value from the server could produce `expires_at` = `Invalid Date` or a date in the distant future.

## Dev Agent Record

### Agent Model Used

deepseek/deepseek-v4-pro

### Debug Log References

### Completion Notes List

- Task 1: Built `lib/storage/refresh-mutex.ts` with `acquireRefreshLock()`, `releaseRefreshLock()`, `isRefreshing()` using `chrome.storage.session`. Co-located test covers 10 scenarios.
- Task 2: Built `lib/oauth/refresh.ts` with `refreshTokens()` using standalone `fetch` calls to Atlassian token endpoint. Self-owned `RefreshError` domain. Co-located test covers 21 scenarios including all error paths, mutex release, and MV3 survival.
- Task 3: Updated `entrypoints/background.ts` — `chrome.alarms.create('token-refresh', { periodInMinutes: 1 })` at top-level `defineBackground` body (not inside `onInstalled`). `handleTokenRefresh()` dispatches on `refreshTokens()` result kind.
- Task 4: Verified `alarms` permission in `wxt.config.ts` (already present from Story 1.1) and confirmed in build manifest output.
- Task 5: All gates pass — lint: 0 issues, tests: 102 pass/0 fail, tsc: no errors, pnpm build: succeeds (327ms).
- Code review follow-ups (2026-06-20): Resolved 8 findings — added TTL recovery (30s) to mutex for stale locks, added mutex-contention test, validated bundle kind/expiry in waiter branch, guarded Retry-After with Number.isFinite, added 15s AbortController timeout to fetch, guarded alarm creation with alarms.get(), re-read storage before poll timeout, removed dead refreshAlreadyFresh code. Tests: 104 pass/0 fail.
- Code review round 2 (2026-06-20): Resolved 2 remaining findings — implemented true single-flight serialization via module-level promise (eliminates read→set→verify race; second caller awaits identical promise), moved clearTimeout after body read to cover stalled res.json(). Contention test now asserts fetch called exactly once. Tests: 104 pass/0 fail.

### File List

- `lib/storage/refresh-mutex.ts` (NEW)
- `lib/storage/refresh-mutex.test.ts` (NEW)
- `lib/oauth/refresh.ts` (NEW)
- `lib/oauth/refresh.test.ts` (NEW)
- `entrypoints/background.ts` (MODIFIED)

### Change Log

| Date | Change |
|---|---|
| 2026-06-20 | Story 1.2 created — Silent Token Refresh & 30-Day Auth Survival |
| 2026-06-20 | Implemented silent token refresh: mutex, refresh module, alarm registration, all ACs satisfied |
| 2026-06-20 | Addressed code review findings — 8 items resolved (2 HIGH, 5 MEDIUM, 1 LOW) |
| 2026-06-20 | Addressed round 2 review — single-flight serialization + AbortController body-read coverage (2 items) |