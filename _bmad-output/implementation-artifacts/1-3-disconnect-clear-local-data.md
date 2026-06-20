# Story 1.3: Disconnect & Clear Local Data

Status: done
baseline_commit: 6b1f8a5

<!--
  Source: epics.md § Story 1.3 (lines 411–443)
  Companion: architecture.md § Storage Patterns (180), Data Boundaries (815-827),
             DisconnectAction component (667), Badge clearing (736-737)
             ux-design-specification.md § Button Hierarchy (1555-1571),
             Confirmation Dialog patterns (1663-1677), Disconnect flow (1356)
-->

## Story

As a connected worker,
I want to disconnect my Jira account and have all local data cleared,
so that I can hand the device off, reset state, or remove the extension cleanly.

## Acceptance Criteria

1. **Confirmation dialog on click** — When the user clicks "Disconnect" on the options page, a confirmation dialog appears with the summary: "This will clear your local extension data. Your Jira worklogs and comments remain untouched." The dialog has Cancel (secondary, left) and "Disconnect" (primary, right) buttons per UX-DR25.
   *[Source: epics.md § Story 1.3 AC 1]*

2. **Cancel dismisses cleanly** — When the confirmation dialog is open and the user clicks Cancel or presses Esc, the dialog closes and no state changes occur.
   *[Source: epics.md § Story 1.3 AC 2]*

3. **Disconnect clears ALL local data** — On confirm: all `chrome.storage.local` keys owned by the extension are cleared (tokens, settings, view-state, banner-dismissals, cycle cache, outbox, recent/pinned tickets). The `refreshInFlight` flag in `chrome.storage.session` is cleared. Any active content-script banners are notified via `chrome.tabs.sendMessage` to dismiss themselves. The toolbar badge is cleared (set to empty text).
   *[Source: epics.md § Story 1.3 AC 3]*

4. **Post-disconnect UI falls back to first-run** — After disconnect, the options page returns to the first-run welcome hero with "Connect to Jira" CTA. The popup (if opened) shows a "Connect to Jira" fallback state.
   *[Source: epics.md § Story 1.3 AC 4]*

5. **Auth-expired on Jira access** — After disconnect, any code path calling the Jira API (including the in-progress `jira-client` from Story 1.4) returns `Result.kind: 'auth-expired'` because the token bundle is absent. The extension NEVER calls any DELETE endpoint on Jira (worklogs and comments remain untouched — FR42).
   *[Source: epics.md § Story 1.3 AC 5]*

## Tasks / Subtasks

- [x] **Task 1 — Build `lib/disconnect.ts` — the I/O boundary for disconnect logic** (AC: #3, #5)
  - [x] Export `disconnectAll(): Promise<Result<void, DisconnectError>>` — clears all extension-owned data:
    1. Call `clearAuth()` (existing in `lib/storage/tokens.ts`).
    2. Clear ALL remaining `chrome.storage.local` keys except the WXT-internal `@` prefix keys. Use `chrome.storage.local.clear()` and re-persist any keys the extension does NOT own. Since WXT stores `defineItem` items with predictable keys, the simplest approach: iterate `chrome.storage.local.get(null)`, delete all keys, then re-set any WXT-internal keys if needed. Alternatively: use `chrome.storage.local.clear()` to wipe everything, then log any WXT-internal items that need re-creation (let future stories add their own re-init).
    3. Clear `chrome.storage.session` key `oauth.refreshInFlight` (used by `lib/storage/refresh-mutex.ts`).
    4. Notify all active Jira tabs to dismiss content-script banners via `chrome.tabs.query({ url: 'https://*.atlassian.net/*' })` + `chrome.tabs.sendMessage(tab.id, { kind: 'disconnect' })`.
    5. Clear the toolbar badge via `chrome.action.setBadgeText({ text: '' })`.
  - [x] Type `DisconnectError` as a self-owned error domain:
    ```ts
    export type DisconnectError =
      | { kind: 'storage-clear-failed'; cause: string }
      | { kind: 'badge-clear-failed'; cause: string };
    ```
  - [x] Log every step via `log.info` / `log.warn` / `log.error` with `noun.verb` names.
  - [x] NEVER make any network call to Jira (no DELETE/revoke). The disconnect is client-only by design.
  - [x] Write co-located `lib/disconnect.test.ts` covering:
    - All storage keys cleared
    - Session key cleared
    - Badge text set to `''`
    - `chrome.tabs.sendMessage` called for each open Atlassian tab
    - Content-script sendMessage rejection handled gracefully (tab closed / no listener)
    - `chrome.storage.local.clear()` rejection handled (return `storage-clear-failed`)
    - No `fetch` calls made (assert `fetch` not called)
    - No Jira DELETE API calls (assert no network to `atlassian.net/rest/api`)

- [x] **Task 2 — Install shadcn `dialog` primitive** (AC: #1)
  - [x] Run `pnpm dlx shadcn@latest add dialog` (uses existing `components.json` config; outputs to `components/ui/dialog.tsx`).
  - [x] Trim dialog toward Linear-grade restraint per UX-DR4: remove backdrop blur, use a thin border, keep the overlay as a simple `bg-black/50` backdrop.

- [x] **Task 3 — Build `components/settings/DisconnectAction.tsx`** (AC: #1, #2, #3)
  - [x] Three states: `idle` | `confirming` | `clearing` (follows `components/settings/ConnectButton.tsx` discriminated union pattern).
  - [x] **Idle state:** Renders a `<Button variant="secondary">` labeled "Disconnect."
  - [x] **Confirming state:** Opens shadcn `<Dialog>` (modal).
    - Copy: `"This will clear your local extension data. Your Jira worklogs and comments remain untouched."`
    - Buttons: `<Button variant="secondary">` Cancel (left) + `<Button variant="primary">` Disconnect (right) — per UX-DR25 dialog rule.
    - Focus management: let Radix defaults handle focus trapping; `Escape` closes (cancels).
    - Backdrop click does NOT close (destructive dialog rule per UX spec line 1677).
  - [x] **Clearing state:** Close the dialog, disable the idle button (show spinner or "Clearing…"), call `disconnectAll()`, then invoke `onDisconnected()` prop.
  - [x] All UI strings in a top-of-file `const STRINGS` object (UX-DR31).
  - [x] Named export only: `export function DisconnectAction(...)`.
  - [x] Props: `{ onDisconnected: () => void }` — parent (`App.tsx`) transitions to first-run on call.

- [x] **Task 4 — Wire `DisconnectAction` into `entrypoints/options/App.tsx`** (AC: #4)
  - [x] Replace the `handleDisconnectStub` with the real `DisconnectAction` component.
  - [x] Remove the `disconnecting` local state from `App.tsx` (DisconnectAction owns its own clearing state).
  - [x] Remove the `handleDisconnectStub` function entirely.
  - [x] On `onDisconnected`, set `view` to `{ kind: 'first-run' }` — no need to manually call `clearAuth()` (done by `disconnectAll()`).
  - [x] Import `DisconnectAction` from `@/components/settings/DisconnectAction`.
  - [x] Keep `handleConnected` unchanged.

- [x] **Task 5 — Register `disconnect` message in `lib/messages.ts`** (AC: #3)
  - [x] Add `DisconnectRequestedSchema = z.object({})` message schema.
  - [x] Add `'disconnect'` to the `MessageRegistry` and `SCHEMAS` maps.
  - [x] This enables the content script (Story 3.3) to listen for disconnect and dismiss the banner. For Story 1.3, no content script exists yet, but the message schema must be registered now so `chrome.tabs.sendMessage` from `disconnectAll()` uses a valid message shape.
  - [x] The service worker does not need to handle this message — it only broadcasts it to tabs. Content-script tabs that don't have a listener will reject the sendMessage, which `disconnectAll()` already handles gracefully.

- [x] **Task 6 — Verify all gates pass** (AC: #1 through #5)
  - [x] Run `pnpm lint && pnpm test && pnpm tsc --noEmit && pnpm build` — all must pass.
  - [x] `pnpm test --run` passes all new tests (disconnect.test.ts).
  - [x] No new warnings in `pnpm lint`.
  - [x] `pnpm build` produces a valid extension bundle.
  - [x] Manual smoke: sideload extension, connect via OAuth, click Disconnect → confirm dialog appears → click Disconnect → options page shows first-run hero → check DevTools console for `disconnect.*` logs → verify `chrome.storage.local` is empty → verify badge is cleared.

## Dev Notes

### Critical architecture patterns (binding)

- **`Result<T, E>` at I/O boundary.** `disconnectAll()` returns `Result<void, DisconnectError>`. Never throw across the I/O boundary. Consumers dispatch on `kind`.
  *[Source: architecture.md > Implementation Patterns > Error handling; Story 1.1 Dev Notes > Critical architecture patterns]*

- **`lib/` modules are framework-agnostic.** `lib/disconnect.ts` MUST NOT import React, React DOM, or any `components/*`. It operates purely on `chrome.*` APIs + `lib/storage/*` modules.
  *[Source: architecture.md > File Organization Rules line 904]*

- **No default exports.** Named exports only. ESLint enforces.
  *[Source: architecture.md > Import & Module Patterns]*

- **No `any`.** Use `unknown`, Zod schemas, and narrow.
  *[Source: architecture.md > TypeScript Style; Story 1.1 Dev Notes]*

- **No direct `console.log` outside tests.** Use `lib/log.ts` helpers (`log.info`, `log.warn`, `log.error`, `log.debug`).
  *[Source: architecture.md > Enforcement Guidelines; Story 1.1 Dev Notes]*

- **Co-located tests.** `lib/disconnect.test.ts` lives next to `lib/disconnect.ts`.
  *[Source: architecture.md > Structure Patterns; Story 1.1 Dev Notes]*

- **WXT storage import path is `wxt/utils/storage`** (not `wxt/storage`).
  *[Source: Story 1.1 Dev Notes > Deviations #3]*

### Key decisions from Story 1.1 & 1.2

- **Auth bundle is a discriminated union** (`AuthBundle = OAuthBundle | ApiTokenBundle`). `clearAuth()` handles either kind — this story just calls it.
  *[Source: lib/storage/tokens.ts; Story 1.1 completion notes > Scope deviation]*

- **`disconnecting` disabled guard already exists** in `App.tsx` on the button — but since Story 1.3 replaces the inline button with `DisconnectAction`, the guard moves into the component's own state machine.
  *[Source: Story 1.1 review findings line 446]*

- **`onAuthChange(callback)` helper exists** (`lib/storage/tokens.ts:79-88`) but is NOT needed for disconnect — `disconnectAll()` just clears storage directly. The `App.tsx` view-state machine already reads `getAuth()` on mount and transitions accordingly.
  *[Source: lib/storage/tokens.ts:79-88; Story 1.1 review findings line 430]*

- **Library versions**: React `^19.2.4`, WXT `^0.20.26`, Tailwind CSS `^4.3.0`, Zod `^3.x`.
  *[Source: Story 1.1 Dev Notes > Deviations #1]*

### File structure (must follow exactly)

```
jira-time-logger/
├── lib/
│   ├── disconnect.ts                    # NEW: disconnectAll() + DisconnectError
│   ├── disconnect.test.ts               # NEW: co-located tests
│   └── messages.ts                      # UPDATE: add 'disconnect' message kind
├── components/
│   ├── settings/
│   │   └── DisconnectAction.tsx          # NEW: three-state component
│   └── ui/
│       └── dialog.tsx                    # NEW: shadcn dialog (pnpm dlx install)
└── entrypoints/
    └── options/
        └── App.tsx                       # UPDATE: replace stub with <DisconnectAction>
```

Files NOT created/modified in Story 1.3:
- `lib/storage/tokens.ts` — unchanged; `clearAuth()` already exists
- `lib/storage/refresh-mutex.ts` — unchanged; session key cleared manually by `disconnectAll()` via `chrome.storage.session.remove`
- `entrypoints/background.ts` — unchanged; badge cleared by `disconnectAll()` via `chrome.action.setBadgeText`; no new alarm or listener
- `components/settings/ConnectButton.tsx` — unchanged; it's already the first-run hero
- `components/ui/button.tsx` — unchanged; three-tier variants already exist

### `lib/disconnect.ts` — detailed API contract

```ts
import { type Result } from '@/lib/result';

export type DisconnectError =
  | { kind: 'storage-clear-failed'; cause: string }
  | { kind: 'badge-clear-failed'; cause: string };

export async function disconnectAll(): Promise<Result<void, DisconnectError>>;
```

**Implementation plan:**
1. `log.info('disconnect.start', {})`.
2. `await clearAuth()` — existing function, removes the `local:tokens` item.
3. `await chrome.storage.local.clear()` — wipe everything.
   - After clear, WXT will re-initialize its internal storage keys on next access. This is acceptable — the extension's own items are gone.
   - If `clear()` rejects: return `{ kind: 'storage-clear-failed', cause: String(e) }`.
4. `await chrome.storage.session.remove('oauth.refreshInFlight')` — dismiss the refresh mutex. Do NOT block on failure — session storage may be unavailable.
5. `chrome.tabs.query({ url: 'https://*.atlassian.net/*' }, (tabs) => { ... })`:
   - For each tab: `chrome.tabs.sendMessage(tab.id, { kind: 'disconnect', payload: {} }).catch(() => {})` — ignore rejections (tab has no listener, content script not injected).
   - This is fire-and-forget; no `await`.
6. `try { await chrome.action.setBadgeText({ text: '' }); } catch (e) { return { kind: 'badge-clear-failed', cause: String(e) }; }`.
7. `log.info('disconnect.complete', {})`.
8. Return `ok(undefined)`.

### `components/settings/DisconnectAction.tsx` — component contract

```ts
type Props = {
  onDisconnected: () => void;
};

export function DisconnectAction({ onDisconnected }: Props): React.ReactElement;
```

**State machine** (follows `ConnectButton.tsx` pattern):
```ts
type Status =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'clearing' };
```

**Rendering per state:**
- `idle` → `<Button variant="secondary" onClick={() => setStatus({ kind: 'confirming' })}>Disconnect</Button>`
- `confirming` → `<Dialog open onOpenChange={(open) => { if (!open) setStatus({ kind: 'idle' }); }}>`:
  - `<DialogTrigger>` not needed — we control `open` programmatically.
  - `<DialogContent>`:
    - `<DialogTitle>Disconnect?</DialogTitle>` or the summary string as description.
    - `<p className="text-sm text-neutral-700">This will clear your local extension data. Your Jira worklogs and comments remain untouched.</p>`
    - Footer: `<Button variant="secondary" onClick={() => setStatus({ kind: 'idle' })}>Cancel</Button>` + `<Button variant="primary" onClick={handleConfirm}>Disconnect</Button>`
  - Per UX spec line 1677: destructive dialogs require explicit cancel — set `onInteractOutside` to prevent backdrop-click dismiss.
- `clearing` → `<Button variant="secondary" disabled>Clearing…</Button>`

**Confirm handler:**
```ts
async function handleConfirm(): Promise<void> {
  setStatus({ kind: 'clearing' });
  const result = await disconnectAll();
  if (result.kind !== 'ok') {
    log.error('disconnect.failed', { error: result });
    // Stay in clearing state? Or revert? Per error handling pattern:
    // log and continue — the intent was to disconnect; partial clear is still a disconnect.
  }
  onDisconnected();
}
```

### `lib/messages.ts` — changes needed

Add to schemas section:
```ts
export const DisconnectRequestedSchema = z.object({});
```

Add to registry types:
```ts
export type MessageRegistry = {
  'oauth-connect-requested': z.infer<typeof OAuthConnectRequestedSchema>;
  'oauth-completed': z.infer<typeof OAuthCompletedSchema>;
  'disconnect': z.infer<typeof DisconnectRequestedSchema>;
};
```

Add to SCHEMAS:
```ts
const SCHEMAS: { [K in MessageKind]: z.ZodType<MessageRegistry[K]> } = {
  'oauth-connect-requested': OAuthConnectRequestedSchema,
  'oauth-completed': OAuthCompletedSchema,
  'disconnect': DisconnectRequestedSchema,
};
```

### `entrypoints/options/App.tsx` — changes needed

**Current state** (lines 92-96):
```ts
const handleDisconnectStub = async (): Promise<void> => {
  log.info('disconnect.stub-clicked', { note: 'full handler in Story 1.3' });
  await clearAuth();
  setView({ kind: 'first-run' });
};
```

**Replace with:**
```ts
import { DisconnectAction } from '@/components/settings/DisconnectAction';
```

**Remove:** `handleDisconnectStub` function, `disconnecting` state variable.

**Replace the button block** (lines 128-137) with:
```tsx
<DisconnectAction onDisconnected={() => setView({ kind: 'first-run' })} />
```

**Remove imports** no longer needed: `clearAuth` from `@/lib/storage/tokens`.

### UX-DR compliance

| UX-DR | Requirement | This story's implementation |
|---|---|---|
| UX-DR20 | First-run hero: brand-gradient header, centered 64px logo, "Welcome to jira-time-logger", supporting paragraph, "Connect to Jira" primary CTA | Already built in Story 1.1 (`components/settings/ConnectButton.tsx`). Post-disconnect, `App.tsx` transitions to `view.kind === 'first-run'` which renders `<ConnectButton>`. No new work. |
| UX-DR25 | Button hierarchy: at most one primary per surface; primary = brand-purple bg + white text + font-semibold; secondary = transparent bg + neutral.700 + 1px border | Idle state: "Disconnect" button is secondary tier. Confirm dialog: "Disconnect" action upgrades to primary inside the dialog only. Cancel remains secondary. |
| UX-DR30 | Honest copy register: no apology theatre, no exclamation marks, no "Oops" | Confirmation copy: "This will clear your local extension data. Your Jira worklogs and comments remain untouched." Factual, direct. |
| UX-DR31 | All UI strings in a top-of-file `const STRINGS` object | `DisconnectAction.tsx` defines `STRINGS` with all copy strings. |
| UX-DR32 | Semantic DOM: `<button>`, `<h1>`/`<h2>`, `aria-label` | shadcn `Dialog` (Radix-based) handles ARIA semantics; buttons get appropriate `aria-label` props. |

### Testing requirements (gates)

| Gate | Test type | What it covers |
|---|---|---|
| Unit (Vitest) | `lib/disconnect.test.ts` | All 8 scenarios listed in Task 1 |
| Lint | `pnpm lint` | All naming/import/no-default-export/no-any/no-console rules pass |
| Type-check | `pnpm tsc --noEmit` | Zero errors |
| Build | `pnpm build` | Produces valid extension bundle |

**Vitest configuration:** `lib/disconnect.test.ts` uses `jsdom` environment (already the global default in `vitest.config.ts`). Mock `chrome.storage.local`, `chrome.storage.session`, `chrome.tabs.query`, `chrome.tabs.sendMessage`, `chrome.action.setBadgeText`, and `fetch` with `vi.stubGlobal`. See existing patterns in `lib/storage/tokens.test.ts` and `lib/oauth/refresh.test.ts`.

**Test mocking guidance for chrome.storage.local.clear:**
```ts
const localStore = new Map<string, unknown>();
vi.stubGlobal('chrome', {
  storage: {
    local: {
      clear: vi.fn(async () => { localStore.clear(); }),
      get: vi.fn(async () => { /* ... */ }),
      set: vi.fn(async (obj) => { Object.entries(obj).forEach(([k, v]) => localStore.set(k, v)); }),
    },
    session: {
      remove: vi.fn(async () => { /* ... */ }),
    },
  },
  tabs: {
    query: vi.fn(async () => [{ id: 1 }, { id: 2 }]),
    sendMessage: vi.fn(async () => { /* success */ }),
  },
  action: {
    setBadgeText: vi.fn(async () => { /* success */ }),
  },
});
```

### References

- [Epics: Story 1.3 full AC set](../planning-artifacts/epics.md#story-13-disconnect--clear-local-data)
- [Architecture: Storage Patterns](../planning-artifacts/architecture.md)
- [Architecture: Data Boundaries table](../planning-artifacts/architecture.md)
- [UX Design: Button Hierarchy (UX-DR25)](../planning-artifacts/ux-design-specification.md)
- [UX Design: Dialog/Popover Patterns](../planning-artifacts/ux-design-specification.md)
- [UX Design: First-run Connect screen](../planning-artifacts/ux-design-specification.md)
- [UX Design: Disconnect flow summary (line 1356)](../planning-artifacts/ux-design-specification.md)
- [Story 1.1: Dev Notes — Critical architecture patterns](../implementation-artifacts/1-1-project-scaffold-and-oauth-connect.md#dev-notes)
- [Story 1.1: Review findings (universal patterns)](../implementation-artifacts/1-1-project-scaffold-and-oauth-connect.md#review-findings)
- [Story 1.2: Dev Notes (applicable patterns)](../implementation-artifacts/1-2-silent-token-refresh-30-day-auth-survival.md#dev-notes)
- [Existing code: lib/disconnect.ts — TO BE CREATED](../../lib/disconnect.ts)
- [Existing code: lib/storage/tokens.ts](../../lib/storage/tokens.ts)
- [Existing code: lib/messages.ts](../../lib/messages.ts)
- [Existing code: entrypoints/options/App.tsx](../../entrypoints/options/App.tsx)
- [Existing code: components/settings/ConnectButton.tsx](../../components/settings/ConnectButton.tsx) — component pattern reference
- [Existing code: components/ui/button.tsx](../../components/ui/button.tsx)
- External: [Chrome `chrome.storage` API reference](https://developer.chrome.com/docs/extensions/reference/api/storage)
- External: [Chrome `chrome.tabs.sendMessage` API reference](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- External: [Chrome `chrome.action.setBadgeText` API reference](https://developer.chrome.com/docs/extensions/reference/api/action)
- External: [shadcn/ui Dialog component docs](https://ui.shadcn.com/docs/components/dialog)

### What NOT to do (disaster prevention)

1. **Do NOT call any DELETE endpoint on Jira.** `disconnectAll()` is purely a client-side cleanup. The extension never touches Jira data (FR42).
2. **Do NOT clear only `tokens` — clear ALL extension-owned data.** Settings, view-state, banner-dismissals, cache, outbox, pinned tickets. Everything in `chrome.storage.local` must go.
3. **Do NOT import React in `lib/disconnect.ts`.** The `lib/` layer is framework-agnostic.
4. **Do NOT forget to handle `chrome.tabs.sendMessage` rejections.** Tabs without a content-script listener will reject. This is normal — catch and ignore.
5. **Do NOT use `<DialogTrigger>`** — the dialog is opened programmatically via the `open` prop + state. This avoids a11y issues with buttons inside buttons.
6. **Do NOT allow backdrop-click dismiss on the confirmation dialog.** Per UX spec line 1677, destructive dialogs require explicit cancel. Set `onInteractOutside={(e) => e.preventDefault()}` on the DialogContent.
7. **Do NOT leave the `disconnecting` state in `App.tsx`** — `DisconnectAction` owns its own `clearing` state. Remove the old state and stub function.
8. **Do NOT create `lib/storage/clear-all.ts` or similar.** `lib/disconnect.ts` is the single module that orchestrates the full disconnect flow. It imports from the storage modules it needs.
9. **Do NOT use `any` or `as` assertions in tests or implementation.**
10. **Do NOT skip the `clearTimeout` / `AbortController` pattern if any async operation is added to `DisconnectAction`** — follow the Story 1.1 review pattern.

### Review Findings

<!-- Appended by code-review workflow 2026-06-20 -->

- [x] [Review][Defer] Popup "Connect to Jira" fallback state missing (AC 4) — The spec requires the popup to show a "Connect to Jira" fallback state after disconnect, but no popup surface exists yet (planned for Story 2.1). The disconnect infrastructure (clear → options falls back to first-run) is correct, but the popup AC cannot be fulfilled by this story. (HIGH) — deferred, forward-dependency on Story 2.1 (popup surface)

- [x] [Review][Defer] No content-script listener for the `disconnect` message (AC 3) — `notifyBannersToDismiss` sends `chrome.tabs.sendMessage({ kind: 'disconnect', payload: {} })` to Jira tabs, but no content script exists to receive it (planned for Story 3.3). Every sendMessage call will reject, caught by `.catch(() => {})`. The message schema is registered correctly in `lib/messages.ts`, and the fire-and-forget pattern is by design, but AC 3's banner-dismiss behavior is untestable until the content-script consumer exists. (MEDIUM) — deferred, forward-dependency on Story 3.3 (content-script surface)

- [x] [Review][Patch] Token-refresh alarm is never cleared after disconnect — `entrypoints/background.ts` registers a `token-refresh` alarm with `periodInMinutes: 1` that wakes the service worker every 60 seconds. `disconnectAll()` clears storage, badges, and session mutex, but never calls `chrome.alarms.clear('token-refresh')`. The alarm handler returns harmlessly when `getAuth()` is null, but the SW is needlessly woken forever. (HIGH) [lib/disconnect.ts:9-52]

- [x] [Review][Patch] `clearAuth()` is redundant and triggers a double `onAuthChange` fire — `disconnectAll` calls `clearAuth()` (writes `null` to `local:tokens`) then immediately calls `chrome.storage.local.clear()` (wipes everything). Between these two awaits, any surface subscribed via `onAuthChange` sees a `null` transition, then a second "everything gone" event. Additionally, if `chrome.storage.local.clear()` fails but `clearAuth()` succeeded, tokens are gone but the error is reported as `storage-clear-failed`. (HIGH) [lib/disconnect.ts:13,19]

- [x] [Review][Patch] `notifyBannersToDismiss` bypasses the typed message registry — sends raw `{ kind: 'disconnect', payload: {} }` via `chrome.tabs.sendMessage` without using `sendMessage()` from `lib/messages.ts`. If the schema or message key is renamed, this call site gets no type error. (HIGH) [lib/disconnect.ts:44-51]

- [x] [Review][Patch] `handleConfirm` ignores `disconnectAll` error and always calls `onDisconnected()` — regardless of whether storage or badge clear failed, the parent re-renders `first-run` view. User sees "disconnected" UI even when operations failed. The only feedback is a `log.error` the user never sees. (MEDIUM) [components/settings/DisconnectAction.tsx:37-42]

- [x] [Review][Patch] `onDisconnected()` has no error boundary — if the parent's callback throws, `handleConfirm` has no catch, leaving the component stuck in `clearing` state with a permanently disabled "Clearing…" button. (MEDIUM) [components/settings/DisconnectAction.tsx:42]

- [x] [Review][Patch] Dialog close animation races with view transition — `setStatus({ kind: 'clearing' })` starts the Radix dialog's 200ms close animation while `disconnectAll()` runs. If `disconnectAll()` resolves quickly, `onDisconnected()` transitions to `first-run` before the dialog fade completes, causing a visual flash of stale overlay. (LOW) [components/settings/DisconnectAction.tsx:37-56]

- [x] [Review][Patch] Refresh lock removed after storage clear, not before — `chrome.storage.local.clear()` runs first, then `session.remove('oauth.refreshInFlight')`. If the service worker alarm fires between these calls with a stale lock in session, `acquireRefreshLock()` enters its polling loop unnecessarily. Swap the order so session cleanup happens before storage wipe. (LOW) [lib/disconnect.ts:15,19]

- [x] [Review][Defer] No centralized Jira client to enforce `auth-expired` contract (AC 5) — `lib/jira-client.ts` is explicitly scoped for Story 1.4. The auth-expired behavior emerges naturally because `getAuth()` returns null and `hasValidAuth()` returns false after `chrome.storage.local.clear()`. [lib/disconnect.ts] — deferred, Story 1.4 provides the centralized client

- [x] [Review][Defer] `chrome.storage.local.clear()` wipes WXT internal metadata keys — WXT's `storage.defineItem` stores version/migration metadata; `clear()` removes these alongside app data. Current `defineItem` calls use `fallback` so this is safe, but future items with `version`/migration hooks could break. [lib/disconnect.ts:15] — deferred, cross-cutting concern for future storage items

- [x] [Review][Defer] `chrome.tabs.query` callback-based API — `notifyBannersToDismiss` uses the legacy callback form instead of the MV3 promise-based call. Works correctly but callback errors are unobserved. [lib/disconnect.ts:45-52] — deferred, pattern used intentionally for fire-and-forget semantics

## Dev Agent Record

### Agent Model Used

deepseek/deepseek-v4-pro

### Debug Log References

### Completion Notes List

- Task 1: Built `lib/disconnect.ts` with `disconnectAll(): Promise<Result<void, DisconnectError>>`. Clears tokens via `clearAuth()`, wipes `chrome.storage.local` entirely, removes `oauth.refreshInFlight` from session storage, notifies Jira tabs via `chrome.tabs.sendMessage`, clears badge. Self-owned `DisconnectError` domain. Co-located test covers 10 scenarios.
- Task 2: Installed shadcn `dialog` primitive via `pnpm dlx shadcn@latest add dialog`. Trimmed to Linear-grade restraint: `bg-black/50` overlay (no blur), `border-neutral-200` thin border, background + text tokens mapped to our design system, no shadow.
- Task 3: Built `components/settings/DisconnectAction.tsx` — three-state discriminated union (`idle` | `confirming` | `clearing`), follows `ConnectButton.tsx` pattern. Uses shadcn `Dialog` for confirmation with `onInteractOutside` prevention. All UI strings in `STRINGS` object. Named export.
- Task 4: Wired `DisconnectAction` into `entrypoints/options/App.tsx`. Removed `handleDisconnectStub`, `disconnecting` state, `Button` import, `clearAuth` import. Post-disconnect sets view to `first-run`, which renders existing `ConnectButton` (first-run hero).
- Task 5: Registered `'disconnect'` message kind in `lib/messages.ts` with `DisconnectRequestedSchema = z.object({})`.
- Task 6: All gates pass — lint: 0 issues, tests: 114 pass/0 fail (10 new), tsc: no errors, build: succeeds (352ms).
- Code review follow-ups (2026-06-20): Applied 7 patches from adversarial review — cleared `token-refresh` alarm on disconnect, removed redundant `clearAuth()` call, used typed message schema from `lib/messages.ts`, added error state to `DisconnectAction` for disconnect failures, wrapped `onDisconnected()` callback in try/catch, reordered session.remove before storage.clear, added 3 new tests (alarm clearing, alarm failure, Zod-validated payload). Tests: 117 pass/0 fail.

### File List

- `lib/disconnect.ts` (NEW)
- `lib/disconnect.test.ts` (NEW)
- `components/settings/DisconnectAction.tsx` (NEW)
- `components/ui/dialog.tsx` (NEW — shadcn install, trimmed to design system)
- `lib/messages.ts` (MODIFIED — added 'disconnect' message kind)
- `entrypoints/options/App.tsx` (MODIFIED — replaced stub with DisconnectAction)

### File List

### Change Log

| Date | Change |
|---|---|
| 2026-06-20 | Story 1.3 created — Disconnect & Clear Local Data |