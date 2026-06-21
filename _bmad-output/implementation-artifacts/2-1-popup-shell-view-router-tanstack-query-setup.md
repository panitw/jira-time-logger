# Story 2.1: Popup Shell, View Router & TanStack Query Setup

baseline_commit: 48507907db2f70026c02f935c490f4a244aefd76
Status: done

## Story

As a connected worker,
I want to open the toolbar popup and see a tabbed shell with a Today view by default,
So that I have a working surface for daily logging.

## Acceptance Criteria

1. **Popup rendering:** The popup opens at 360px wide with `p-4` outer padding. It mounts via a React entrypoint at `entrypoints/popup/main.tsx` wrapped in a TanStack Query `QueryClientProvider` and a top-level `ErrorBoundary` (UX-DR23).
   *[Source: epics.md § Story 2.1 AC 1]*

2. **Tab bar:** The popup shows `[Today] [Week]` tabs with active-tab underline in `accent.DEFAULT` using a shadcn/ui tabs primitive. Manager tab deferred to Epic 5.
   *[Source: epics.md § Story 2.1 AC 2]*

3. **View-state machine:** `PopupView` is a discriminated union (`{ kind: 'today' } | { kind: 'week', weekOf: ISODate }`) stored in `chrome.storage.local` via `lib/storage/view-state.ts`. The popup remembers the last-used view across opens; new users default to `kind: 'today'` (UX-DR28).
   *[Source: epics.md § Story 2.1 AC 3]*

4. **Disconnected fallback:** When no valid token bundle exists in `chrome.storage.local`, the popup shows a "Connect to Jira" CTA that opens the options page in a new browser tab via `chrome.runtime.openOptionsPage()`. Does not throw, does not show a generic error screen.
   *[Source: epics.md § Story 2.1 AC 4]*

5. **Mount animation:** A 120ms fade-in completes on Today view mount (UX-DR7 motion). Honor `prefers-reduced-motion: reduce` with instant render. Use Tailwind `motion-safe:` / `motion-reduce:` variants.
   *[Source: epics.md § Story 2.1 AC 5]*

6. **TanStack Query config:** Configure `QueryClient` with `defaultOptions.queries.queryFn` that calls `lib/jira-client.ts` functions. `retry` callback honors `Retry-After` headers. `staleTime` defaults per AR23: 5 min hierarchy, 1 min current-week, infinite for closed cycles. Do NOT create a `lib/query-client.ts` — instantiate `QueryClient` in `main.tsx`.
   *[Source: epics.md § Story 2.1 AC 6]*

7. **Pre-warmed popup (deferred wiring):** Acceptance criterion 7 is deferred to Epic 3 (Story 3.2). Story 2.1 sets up the popup shell and TanStack Query configuration ready for the `queryCache` to be pre-warmed by the service worker, but does NOT implement the pre-warming mechanism itself.
   *[Source: epics.md § Story 2.1 AC 7]*

8. **Close behavior:** Popup closes on blur per Chrome's native behavior. View-state is persisted to `chrome.storage.local` on every tab/view change so re-opening restores the last view (UX-DR28).
   *[Source: epics.md § Story 2.1 AC 8]*

9. **Files created:**

   | File | Purpose |
   |---|---|
   | `entrypoints/popup/index.html` | WXT-required HTML shell (pattern: options/index.html) |
   | `entrypoints/popup/main.tsx` | React mount + QueryClientProvider + ErrorBoundary |
   | `entrypoints/popup/App.tsx` | View router: auth gate → tabs → view dispatch |
   | `lib/storage/view-state.ts` | PopupView persistence via WXT `storage.defineItem` |
   | `components/today/TodayView.tsx` | Placeholder: "Today" heading with fade-in animation |
   | `components/week/WeekView.tsx` | Placeholder: "Week of..." heading |
   | `components/ui/tabs.tsx` | shadcn/ui tabs primitive (creates NEW — NOT `pnpm dlx shadcn add`) |

   *[Source: epics.md § Story 2.1 AC 9]*

## Tasks / Subtasks

- [x] **Task 1 — Install `@radix-ui/react-tabs` dependency** (AC: #2)
  - [x] Run `pnpm add @radix-ui/react-tabs`

- [x] **Task 2 — Create `components/ui/tabs.tsx`** (AC: #2)
  - [x] DO NOT use `pnpm dlx shadcn add tabs` — create the file by hand following the existing `button.tsx` pattern.
  - [x] Build from `@radix-ui/react-tabs` primitives: `Tabs`, `TabsList`, `TabsTrigger` with `data-[state=active]` underline styling in `accent.DEFAULT`.
  - [x] No `forwardRef` wrapper needed — directly re-export `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@radix-ui/react-tabs` with shadcn-style className forwarding.
  - [x] Active indicator: a bottom border `border-b-2 border-accent` on `TabsTrigger` with `data-[state=active]`.

- [x] **Task 3 — Create `lib/storage/view-state.ts`** (AC: #3, #8)
  - [x] Define `ISODate = string` type alias (year-month-day pattern).
  - [x] Define `PopupView` discriminated union — only `{ kind: 'today' }` and `{ kind: 'week', weekOf: ISODate }` for v2.1. Architecture spec includes `manager-matrix` and `manager-drill-down` variants but those are Epic 5. Design the type to be forward-compatible: add comment noting future variants.
  - [x] Use WXT `storage.defineItem<PopupView>` with `'local:popupView'` key and `{ kind: 'today' }` as `fallback` (new users default to today — UX-DR28).
  - [x] Export `setPopupView(view: PopupView): Promise<void>` and `getPopupView(): Promise<PopupView>` helper functions.
  - [x] Write co-located `view-state.test.ts` covering: default value `{ kind: 'today' }`, set and get round-trip, week view with weekOf persistence.

- [x] **Task 4 — Create `entrypoints/popup/index.html`** (AC: #1)
  - [x] Follow `entrypoints/options/index.html` pattern exactly: `<!doctype html>`, `<meta charset="UTF-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1.0">`, `<div id="root">`, `<script type="module" src="./main.tsx">`.
  - [x] Use `<meta name="manifest.default_popup" content="true">` (WXT requires this meta tag to register index.html as the default popup — NOT `manifest.action.default_popup`). Title: "jira-time-logger".
  - [x] No `meta[name="manifest.open_in_tab"]` — popup is a popup, not a tab.

- [x] **Task 5 — Create `entrypoints/popup/main.tsx`** (AC: #1, #6)
  - [x] Pattern: follow `entrypoints/options/main.tsx` — `createRoot`, `StrictMode`, `ErrorBoundary`, global CSS import.
  - [x] Import `@/styles/globals.css` for Tailwind (no separate `style.css` file — follow options page pattern).
  - [x] Create `QueryClient` with `defaultOptions.queries`:
    - `staleTime: 60_000` (1 min — current week default; individual queries override this via their own `staleTime`)
    - `retry: failureCount < 3` (max 3 retries; do NOT parse Retry-After in client-side retry — the scheduler in the service worker handles that for background calls; popup-side queries should retry simply)
    - `refetchOnWindowFocus: false` (popup doesn't have concept of "window focus")
  - [x] Wrap `<App />` in `QueryClientProvider` + `ErrorBoundary`.
  - [x] Use named function `export function App(): React.ReactElement`.

- [x] **Task 6 — Create `entrypoints/popup/App.tsx`** (AC: #1, #2, #3, #4, #8)
  - [x] **Auth gate (AC #4):** On mount, check `hasValidAuth(getAuth())` from `lib/storage/tokens.ts`. If disconnected, render fallback with "Connect to Jira" primary button that calls `chrome.runtime.openOptionsPage()`.
  - [x] **View state (AC #3, #8):** On mount, read `getPopupView()` from `lib/storage/view-state.ts`. On tab change, call `setPopupView(newView)`. Default to `{ kind: 'today' }`.
  - [x] **Tab bar (AC #2):** Render `[Today] [Week]` using `Tabs`, `TabsList`, `TabsTrigger` from `components/ui/tabs.tsx`. ActiveTab is derived from `view.kind`. Calling `onValueChange` updates view state and persists.
  - [x] **View dispatch:** When `view.kind === 'today'`, render `<TodayView />`. When `view.kind === 'week'`, render `<WeekView weekOf={view.weekOf} />`.
  - [x] **Popup width (AC #1):** Body must be 360px wide (min-width in inline style or WXT manifest meta). Wrap content in `<div className="p-4">` per UX-DR3.
  - [x] **STRINGS constant** for all UI copy (UX-DR31). No hardcoded strings in JSX.
  - [x] Write co-located `App.test.tsx` covering: connected state renders tab bar + Today placeholder, disconnected state renders fallback, clicking "Connect to Jira" opens options page (mock `chrome.runtime.openOptionsPage`), tab switching persists view state, Edge Cases: connect-click mock returns a promise so `void` usage is safe.

- [x] **Task 7 — Create placeholder `components/today/TodayView.tsx`** (AC: #5)
  - [x] Render `<div>` with heading "Today" + date display, total hours placeholder "0h / 0h".
  - [x] **Fade-in (AC #5):** Use CSS: `opacity animate-[fadeIn_120ms_ease-out]` with `@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`. Define the keyframes inline in a `<style>` tag OR in `globals.css` (prefer globals.css to avoid duplication). Honor `motion-reduce:` with `motion-safe:animate-fadeIn`.
  - [x] Define `@keyframes fade-in` in `styles/globals.css` and use utility `animate-fade-in`.
  - [x] Export component as named function: `export function TodayView(): React.ReactElement`.
  - [x] Add co-located `TodayView.test.tsx` verifying: renders heading, handles edge cases gracefully.

- [x] **Task 8 — Create placeholder `components/week/WeekView.tsx`** (AC: #2)
  - [x] Accept `weekOf: ISODate` prop. Display heading "Week of Mon, Jun 16".
  - [x] Use `date-fns` `parseISO`, `format` for date display: `format(parseISO(weekOf), 'EEE, MMM d')`.
  - [x] Export component as named function.
  - [x] Add co-located `WeekView.test.tsx` verifying: renders heading with formatted date, handles invalid weekOf gracefully (try/catch around `parseISO` or defensive check).

- [x] **Task 9 — Add fade-in keyframes to `styles/globals.css`** (AC: #5)
  - [x] Add `@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }` and `@utility animate-fade-in` utility.

- [x] **Task 10 — Verify all gates**
  - [x] `pnpm lint` — zero errors
  - [x] `pnpm tsc --noEmit` — zero errors
  - [x] `pnpm test --run` — all tests pass (unit tests only, Story 2.1 has no browser-specific dependencies that need mocking)
  - [x] `pnpm build` — extension builds successfully with popup entrypoint

## Dev Notes

### Key patterns from Epic 1 (DO NOT DEVIATE)

- **Named exports only.** No `export default`. Every function/component is `export function X()`.
- **`const STRINGS` object** for all UI copy per UX-DR31. Module-level, before component.
- **`React.ReactElement` return type** on all components — not `JSX.Element`, not `ReactNode`.
- **Co-located `*.test.ts` / `*.test.tsx`** beside every new module and component.
- **`lib/` modules are framework-agnostic** — no React imports in `view-state.ts`.
- **No direct `console.log`** — use `lib/log.ts` helpers.
- **`@/` path alias** for all internal imports (configured in `wxt.config.ts`).
- **No barrel files** (`index.ts` re-exports) for `lib/` modules — import directly.
- **No default exports** — ESLint enforces this.
- **`noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`** in `tsconfig.json` — type-safe array access and optional props.

### Component architecture

- Follow `entrypoints/options/main.tsx` pattern:
  ```tsx
  import React from 'react';
  import ReactDOM from 'react-dom/client';
  import { App } from './App';
  import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
  import '@/styles/globals.css';
  // + QueryClientProvider wrapping
  ```
- No separate `style.css` per surface — import `@/styles/globals.css` directly (options page already does this).
- `main.tsx` is the mount point; `App.tsx` is the routing/logic component; view components are placeholders.

### Popup width (360px)

Popups in Chrome Extensions default to the widest element. Set `min-w-[360px]` on the root `<div>` in `App.tsx` to ensure consistent width. No explicit `width` in HTML — let the content drive height.

### View state persistence pattern

```ts
// lib/storage/view-state.ts
import { storage } from 'wxt/utils/storage';

export type ISODate = string;

export type PopupView =
  | { kind: 'today' }
  | { kind: 'week'; weekOf: ISODate };
  // Future: { kind: 'manager-matrix'; cycle: string } (Epic 5)

const popupViewItem = storage.defineItem<PopupView>('local:popupView', {
  fallback: { kind: 'today' },
});

export async function getPopupView(): Promise<PopupView> {
  return popupViewItem.getValue();
}

export async function setPopupView(view: PopupView): Promise<void> {
  await popupViewItem.setValue(view);
}
```

### Tab bar implementation

Build `tabs.tsx` from `@radix-ui/react-tabs` (NOT `pnpm dlx shadcn`). Model the file after `components/ui/button.tsx`:
- Import `cn` from `./utils` for class merging
- Use `React.ComponentPropsWithoutRef` for typing
- Active state via `data-[state=active]:border-b-2 data-[state=active]:border-accent`
- `TabsList` uses `flex gap-0 border-b border-neutral-200`
- `TabsTrigger` uses `px-3 py-2 text-sm font-medium text-neutral-500` + hover/focus/active states

### Disconnected fallback

Use `hasValidAuth()` and `getAuth()` from `lib/storage/tokens.ts`:
```ts
const bundle = await getAuth();
const isConnected = hasValidAuth(bundle);
```
Open options page via `chrome.runtime.openOptionsPage()` (call directly — `void` the promise since it's a click handler).

### TanStack Query config in main.tsx

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 min — default for current-week
      retry: (failureCount, error) => failureCount < 3,
      refetchOnWindowFocus: false,
    },
  },
});
```

Individual queries in future stories override `staleTime` (5 min for hierarchy, Infinity for closed cycles). Story 2.1 does NOT create any hooks or queries — just sets up the provider.

### Fade-in animation

Add to `styles/globals.css`:
```css
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@utility animate-fade-in {
  animation: fade-in 120ms ease-out;
}
```

Honor reduced motion via `motion-safe:`:
```tsx
<div className="motion-safe:animate-fade-in motion-reduce:opacity-100">
```

The global CSS already has `@media (prefers-reduced-motion: reduce)` rule — the `motion-safe:` Tailwind variant handles the opt-in side.

### UX-DR compliance

| UX-DR | Requirement | Implementation |
|---|---|---|
| UX-DR3 | Popup `p-4` outer padding | `<div className="p-4">` wrapper |
| UX-DR4 | shadcn tabs primitive | `tabs.tsx` with shadcn styling conventions |
| UX-DR7 | 120ms fade-in mount | `animate-fade-in` utility with `motion-safe:` |
| UX-DR23 | ErrorBoundary + ErrorState | Reuse existing `ErrorBoundary` from `components/shared/ErrorBoundary.tsx` |
| UX-DR28 | View persistence across opens | WXT `storage.defineItem` with `local:popupView` key |
| UX-DR30 | Honest copy, no exclamation marks | "Connect to Jira" — factual imperative |
| UX-DR31 | STRINGS object | Module-level const in each component |
| UX-DR33 | Reduced-motion accessibility | `motion-safe:` variant + existing global CSS rule |

### Deferred work (do NOT implement)

- **Pre-warming (AC #7):** Service worker pre-warming and popup TTI measurement come in Epic 3 (Story 3.2). Story 2.1 only sets up TanStack Query so the `queryCache` is pre-warmable.
- **Manager tab:** Added in Epic 5 (Story 5.2). Tab bar shows only `[Today] [Week]`.
- **Actual Today/Week content:** TodayView and WeekView are placeholder shells. Full implementations come in Stories 2.2–2.7 (Today) and 4.1–4.5 (Week).
- **`lib/query-client.ts`:** Do NOT create a separate module. Instantiate `QueryClient` directly in `main.tsx`. Architecture AR23 does not require a separate file.

### Dependencies and version check

- `@radix-ui/react-tabs`: MUST be installed (`pnpm add @radix-ui/react-tabs`). Latest as of 2026-06 is 1.1.x range.
- `@tanstack/react-query`: Already installed (`^5.100.10`) — no changes needed.
- `react`, `react-dom`: Already installed (`^19.2.4`) — no changes needed.
- `date-fns`: Already installed (`^4.1.0`) — used in WeekView placeholder.

### Testing standards

- Vitest with `jsdom` environment (global in config).
- Tests for `view-state.ts` mock WXT `storage.defineItem` OR test the logic by treating `storage` as external dependency.
- `App.test.tsx` mocks: `chrome.runtime.openOptionsPage`, token bundle read.
- `TodayView.test.tsx` / `WeekView.test.tsx`: simple render tests.
- **Do NOT write tests for `tabs.tsx`** — shadcn/ui primitives are upstream-tested by Radix.
- Test `App.tsx` for disconnected fallback + tab switching + view persistence via mock.

### References

- [Epics: Story 2.1](../planning-artifacts/epics.md#story-21)
- [Architecture: Popup view-state machine](../planning-artifacts/architecture.md#frontend-architecture) — lines 303–313
- [Architecture: TanStack Query config](../planning-artifacts/architecture.md#data-architecture) — lines 241–248
- [Architecture: Project structure](../planning-artifacts/architecture.md#complete-project-directory-structure) — lines 606–613
- [UX: Popup view-state persistence (UX-DR28)](../planning-artifacts/ux-design-specification.md)
- [UX: Motion system (UX-DR7)](../planning-artifacts/ux-design-specification.md)
- [UX: Button hierarchy (UX-DR25)](../planning-artifacts/ux-design-specification.md)
- [Options main.tsx pattern](../../entrypoints/options/main.tsx)
- [Options index.html pattern](../../entrypoints/options/index.html)
- [ErrorBoundary component](../../components/shared/ErrorBoundary.tsx)
- [Button component](../../components/ui/button.tsx) — tabs.tsx pattern reference
- [Settings storage pattern](../../lib/storage/settings.ts) — view-state.ts pattern reference

## Dev Agent Record

### Agent Model Used

deepseek/deepseek-v4-pro

### Debug Log References

### Completion Notes List

- Task 1: Installed `@radix-ui/react-tabs@1.1.15` via `pnpm add`.
- Task 2: Created `components/ui/tabs.tsx` — shadcn-style tabs built manually on `@radix-ui/react-tabs` primitives with accent.DEFAULT active underline, hover states, focus-visible rings.
- Task 3: Created `lib/storage/view-state.ts` — `PopupView` discriminated union (`today` | `week`) with WXT `storage.defineItem`, `getPopupView`/`setPopupView` helpers, co-located test covering default, round-trip, weekOf persistence.
- Task 4: Created `entrypoints/popup/index.html` — WXT popup HTML shell with `manifest.default_popup` meta tag, follows `entrypoints/options/index.html` pattern.
- Task 5: Created `entrypoints/popup/main.tsx` — React mount with `QueryClientProvider` (staleTime=60s, retry<3, refetchOnWindowFocus=false) + `ErrorBoundary` + `@/styles/globals.css` import. No separate `style.css` per options page pattern.
- Task 6: Created `entrypoints/popup/App.tsx` — auth gate (`hasValidAuth` → disconnected fallback with `chrome.runtime.openOptionsPage()`), view-state machine (read/save `PopupView` via `lib/storage/view-state.ts`), `Tabs` router (Today/Week), view dispatch to placeholder components, `min-w-[360px] p-4`, `STRINGS` constant. Co-located test with 5 scenarios passing.
- Task 7: Created `components/today/TodayView.tsx` — placeholder with "Today" heading, formatted date, "0h logged", `motion-safe:animate-fade-in` for 120ms fade-in (UX-DR7). Co-located test (3 tests).
- Task 8: Created `components/week/WeekView.tsx` — placeholder with "Week of <date>" heading using `date-fns` `parseISO`/`format`, graceful handling of invalid `weekOf`. Co-located test (4 tests, including invalid date edge case).
- Task 9: Added `@keyframes fade-in` and `@utility animate-fade-in` to `styles/globals.css` per UX-DR7.
- Task 10: All gates pass — lint: 0 errors, 7 warnings (import/order — same as existing codebase), tsc: 0, tests: 193 pass / 0 fail, build: succeeds (popup.html generated at 532 B).

### File List

- `package.json` (MODIFIED — added `@radix-ui/react-tabs`)
- `pnpm-lock.yaml` (MODIFIED — dependency lock)
- `styles/globals.css` (MODIFIED — added fade-in keyframes + utility)
- `components/ui/tabs.tsx` (NEW)
- `lib/storage/view-state.ts` (NEW)
- `lib/storage/view-state.test.ts` (NEW)
- `entrypoints/popup/index.html` (NEW)
- `entrypoints/popup/main.tsx` (NEW)
- `entrypoints/popup/App.tsx` (NEW)
- `entrypoints/popup/App.test.tsx` (NEW)
- `components/today/TodayView.tsx` (NEW)
- `components/today/TodayView.test.tsx` (NEW)
- `components/week/WeekView.tsx` (NEW)
- `components/week/WeekView.test.tsx` (NEW)

### Change Log

| Date | Change |
|---|---|
| 2026-06-21 | Story 2.1 implemented — Popup Shell, View Router & TanStack Query Setup |

### Review Findings

<!-- Appended by code-review workflow 2026-06-21 -->

- [x] [Review][Patch] Missing TabsContent wrapper for tab panels — TodayView/WeekView rendered outside Radix Tabs via raw conditional, breaking tab-to-tabpanel ARIA association and tab-panel visibility management (CRITICAL) [entrypoints/popup/App.tsx:109-126]

- [x] [Review][Patch] Retry callback ignores Retry-After header — `retry: (failureCount) => failureCount < 3` drops the `error` parameter; rate-limited responses from jira-client carry `retryAfterMs` but the retry fires immediately instead of delaying (MEDIUM) [entrypoints/popup/main.tsx:12]

- [x] [Review][Patch] chrome.runtime.openOptionsPage() unhandled — handleConnect calls void chrome.runtime.openOptionsPage() with no .catch(); failure gives user zero feedback (MEDIUM) [entrypoints/popup/App.tsx:73-75]

- [x] [Review][Patch] View flash on async restore — initial useState hardcodes { kind: 'today' } but async getPopupView may return { kind: 'week' }, causing brief TodayView flash before snap to WeekView (MEDIUM) [entrypoints/popup/App.tsx:28]

- [x] [Review][Patch] Disconnected button duplicates Button component — raw <button> with Tailwind classes instead of shared <Button variant="primary">; missing type="button" and disabled states (LOW) [entrypoints/popup/App.tsx:94-99]

- [x] [Review][Patch] parseISO try/catch is dead code — date-fns parseISO returns Invalid Date (never throws); isValid guard on line 15 already catches all cases (LOW) [components/week/WeekView.tsx:13-20]

- [x] [Review][Defer] getAuth() catch conflates all errors with "disconnected" — storage I/O errors, quota errors, and missing tokens all show same "Connect to Jira" UI; acceptable for Story 2.1 shell since auth-expired is the dominant case [entrypoints/popup/App.tsx:40-44] — deferred, thin shell without API calls

- [x] [Review][Defer] fire-and-forget setPopupView drops storage write failures — view-state persistence errors are silently swallowed; non-critical since worst case is seeing Today instead of last view [entrypoints/popup/App.tsx:70] — deferred, low-impact edge case

- [x] [Review][Defer] getCurrentWeekMonday uses local Date without timezone handling — local Date may differ from Jira timezone; acceptable for v1.0 internal tool [entrypoints/popup/App.tsx:131-136] — deferred, internal tool v1.0

- [x] [Review][Defer] No auth-change subscription while popup open — token may expire during long popup session; no impact until stories add Jira API calls [entrypoints/popup/App.tsx:30-47] — deferred, no API calls in this story