# Story 1.1: Project Scaffold, Design System & First-Run OAuth Connect

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a worker installing the extension for the first time,
I want to see a welcome screen and connect my Jira Cloud account via OAuth in one click,
so that the extension can read and write my worklogs without me re-entering credentials.

## Acceptance Criteria

1. **Project scaffold & strict TypeScript** — The codebase is initialised with WXT v0.20.25 (React template), TypeScript with `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`, pnpm as the package manager, and Tailwind CSS v4. The shadcn/ui primitives `button`, `input`, `label`, `dialog`, `popover`, `select`, `tooltip`, `toast`, `skeleton`, `tabs`, `table` are installed under `components/ui/`. ESLint is configured per `architecture.md` enforcement rules (named exports only, no `any`, no direct `console.log` outside tests, kebab-case files, naming-convention rules, import order).
   *[Source: architecture.md > Starter Template Evaluation; architecture.md > Implementation Patterns > TypeScript Style + Enforcement Guidelines]*

2. **Design tokens configured** — `tailwind.config.ts` exposes the full design-token set: neutral scale (50/100/200/300/500/700/900), brand accent (`DEFAULT #6b5b95`, `hover #5a4d7e`, `subtle #e9e6f3`, `deep #4a4570`), brand gradient (from `#4a4570` to `#7a719b`), state colors (success `#16a34a` + subtle `#dcfce7`, warning `#ca8a04` + subtle `#fef9c3`, danger `#dc2626` + subtle `#fee2e2`, info `#0891b2` + subtle `#cffafe`). System font stack is configured; monospace stack is configured. Tokens are referenced via Tailwind utilities — never hardcoded hex in components.
   *[Source: ux-design-specification.md > Visual Design Foundation > Color System + Typography System]*

3. **Foundation modules with co-located tests** — The following cross-cutting modules exist under `lib/` with co-located Vitest tests that pass: `lib/result.ts` (discriminated-union `Result<T, E>`), `lib/log.ts` (in-house console logger with `debug`/`info`/`warn`/`error` levels and `noun.verb` event-name discipline), `lib/messages.ts` (WXT `defineMessage<Zod>` registry stub for inter-surface messaging), `lib/storage/tokens.ts` (typed `storage.defineItem<TokenBundle>` wrapper), `lib/oauth/pkce.ts` (PKCE `code_verifier` + `code_challenge` generation per RFC 7636), `lib/oauth/flow.ts` (OAuth flow orchestration).
   *[Source: architecture.md > Project Structure & Boundaries > Complete Project Directory Structure; architecture.md > Implementation Patterns]*

4. **First-run trigger on install** — When the `chrome.runtime.onInstalled` event fires on a fresh install, the options page opens automatically in a new browser tab.
   *[Source: ux-design-specification.md > User Journey Flows > Flow 1; architecture.md > Architecture Validation Results > Gap Analysis #3]*

5. **First-run hero renders** — The options page renders the first-run hero per UX-DR20: full-width brand-gradient header (linear, top-left to bottom-right, using `brand_gradient.from` → `brand_gradient.to`), 64 px centered company logo, "Welcome to jira-time-logger" headline (text-3xl, font-semibold, white), a supporting paragraph "Connect to Jira to get started. The extension will read your assigned tickets and help you log time without leaving Chrome.", and a brand-purple "Connect to Jira" primary CTA. A small line below the CTA reads "(You can disconnect any time from Settings.)".
   *[Source: ux-design-specification.md > Design Direction Decision > First-run Connect screen mockup; UX-DR20]*

6. **OAuth 2.0 (3LO + PKCE) flow initiates** — On click of "Connect to Jira", the extension calls `chrome.identity.launchWebAuthFlow` against Atlassian's authorization endpoint with PKCE: the `code_verifier` is generated and stored in `chrome.storage.session`; the `code_challenge` is sent in the auth URL with `code_challenge_method=S256`. The requested scopes are EXACTLY `read:jira-work write:jira-work read:me offline_access` (no `manage:jira-configuration`, no `manage:jira-webhook`, no other scopes — NFR11 minimum scopes).
   *[Source: prd.md > FR1; prd.md > NFR10, NFR11; architecture.md > Already Locked decisions]*

7. **Token exchange with Zod validation** — On OAuth callback, the extension exchanges the authorization code for tokens at `POST https://auth.atlassian.com/oauth/token` using the stored PKCE `code_verifier`. The response body is parsed via a Zod schema (`TokenResponseSchema` in `lib/oauth/flow.ts` or `lib/jira-types.ts`); any schema drift returns `Result.kind: 'parse-error'` rather than throwing.
   *[Source: architecture.md > Implementation Patterns > Error handling; architecture.md > Decision Priority Analysis > Schema validation]*

8. **Single-site auto-select** — When `GET https://api.atlassian.com/oauth/token/accessible-resources` (with the new access token) returns exactly one entry, the extension auto-selects that site's `id` (cloudId) without prompting.
   *[Source: prd.md > FR2; ux-design-specification.md > User Journey Flows > Flow 1 step J->K]*

9. **Multi-site picker** — When `accessible-resources` returns more than one entry, the options page renders a site-picker UI inline (a list of available sites with name + URL). The user clicks one; the chosen `cloudId` is persisted. The picker is implemented inline within `ConnectButton.tsx` for v1.0 — no separate component file is created (per architecture.md Gap Analysis #4: extract only if UX needs it).
   *[Source: prd.md > FR2; architecture.md > Architecture Validation Results > Gap Analysis #4]*

10. **Atomic token persistence** — On successful flow completion, `{access_token, refresh_token, expires_at, cloudId}` are written to `chrome.storage.local` via `lib/storage/tokens.ts` as a single atomic write (one `storage.defineItem<TokenBundle>().setValue(...)` call — never separate per-field writes). The `expires_at` is computed as `Date.now() + expires_in * 1000` from the token-response payload and stored as an ISODateTime string.
   *[Source: prd.md > FR3, FR4; architecture.md > Data Boundaries; architecture.md > Decision Priority Analysis > Token storage]*

11. **Connected indicator replaces hero** — Once persisted, the options page re-renders: the first-run hero is replaced by a "Connection" section header followed by `✓ Connected as <email> (<site-domain>)` text, where `email` and `site-domain` come from `GET /rest/api/3/myself` and the `accessible-resources` entry respectively. A "Disconnect" secondary-tier button is visible (its handler is owned by Story 1.3 — for Story 1.1, the button can render but be wired to a no-op stub).
   *[Source: ux-design-specification.md > Options page mockup; UX-DR22]*

12. **Cancelled / failed flow stays clean** — If the user closes the OAuth popup, denies scopes, or Atlassian returns an error, NO partial state is persisted to `chrome.storage.local` (neither tokens nor cloudId). The options page remains in the first-run "Connect to Jira" state. No apology-theatre dialog, no toast — the user can click "Connect to Jira" again to retry.
   *[Source: ux-design-specification.md > Flow 1 failure recovery; UX-DR30 honest copy register]*

## Tasks / Subtasks

- [x] **Task 1 — Initialize project with WXT** (AC: #1)
  - [x] Run `pnpm dlx wxt@latest init jira-time-logger` from the parent directory (or initialize in-place via `pnpm dlx wxt@latest init .` inside the existing repo root); choose the **react** template; TypeScript is default.
  - [x] If initializing in-place inside the existing `jira-time-logger/` repo, ensure WXT-generated files do not collide with `_bmad-output/`, `_bmad/`, `.claude/`, or `_bmad-output/planning-artifacts/`. Keep planning artifacts where they are.
  - [x] In `package.json`, set `"packageManager": "pnpm@<latest stable>"` and confirm `pnpm install` runs cleanly.
  - [x] Pin exact library versions in `package.json` per [Architecture Decision](../planning-artifacts/architecture.md#core-architectural-decisions): WXT `0.20.25`, TanStack Query `^5.x`, Zod `^3.x`, Tailwind CSS `^4.x`, date-fns `^4.x`. (TanStack Query and date-fns are pinned for later stories — install now so the dep tree is set.)
  - [x] Verify `pnpm dev` opens Chrome with the extension installed and HMR active.

- [x] **Task 2 — Configure strict TypeScript** (AC: #1)
  - [x] In `tsconfig.json` enable: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`.
  - [x] Confirm WXT's generated `tsconfig.json` is the base and these flags are present (extend WXT's base if needed).
  - [x] Set up the `@/` path alias to resolve to the project root in both `tsconfig.json` (`paths`) and `wxt.config.ts` (`vite.resolve.alias` or WXT's `alias` config).
  - [x] Run `pnpm tsc --noEmit` and confirm zero errors on the freshly scaffolded code.

- [x] **Task 3 — Configure ESLint with custom rules** (AC: #1)
  - [x] Use ESLint flat config (`eslint.config.js`) at the project root.
  - [x] Enable `@typescript-eslint/strict` rule set.
  - [x] Add `@typescript-eslint/naming-convention` rules per [architecture.md Naming Patterns](../planning-artifacts/architecture.md#naming-patterns): types/interfaces `PascalCase`, functions/variables `camelCase`, module-level constants `SCREAMING_SNAKE_CASE`, React components `PascalCase`, hooks `use[PascalCase]`, Zod schemas suffix `Schema`, boolean prefixes `is`/`has`/`should`/`can`.
  - [x] Configure import order rule: node built-ins → external → WXT/browser → internal `@/` → relative.
  - [x] Configure: no default exports, no `any`, no direct `console.log` outside `*.test.ts` files. Use `no-restricted-syntax` for `console.log` violations (allow in test files via overrides).
  - [x] Verify `pnpm lint` runs cleanly on the freshly scaffolded code.

- [x] **Task 4 — Install and configure Tailwind v4 + shadcn/ui** (AC: #1, #2)
  - [x] Install Tailwind v4 per current docs. Note: Tailwind v4 ships a Vite plugin (`@tailwindcss/vite`) rather than the v3 PostCSS plugin — wire this into WXT's Vite config in `wxt.config.ts`.
  - [x] Create `styles/globals.css` with `@import "tailwindcss";` and import it from each entrypoint's main file (`entrypoints/options/main.tsx`, `entrypoints/popup/main.tsx`).
  - [x] Run `pnpm dlx shadcn@latest init`: choose TypeScript, default style, neutral base color, CSS variables for theming. This creates `components.json` and `components/ui/`.
  - [x] Install the v1.0 primitive set: `pnpm dlx shadcn@latest add button input label dialog popover select tooltip toast skeleton tabs table` — these are the 11 primitives Story 1.1 + downstream stories need.
  - [x] Trim shadcn defaults toward Linear-grade restraint per UX-DR4: remove default shadows from `button.tsx`, simplify `dialog.tsx` overlay (no backdrop blur), thin border on `popover.tsx`. These are minor edits to the generated components.

- [x] **Task 5 — Configure design tokens in `tailwind.config.ts`** (AC: #2)
  - [x] Add the full color palette under `theme.extend.colors` per the spec in the AC — copy the exact hex values listed there.
  - [x] Add font families: `sans` = system stack (`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`), `mono` = ui-mono stack (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`).
  - [x] No custom spacing tokens — Tailwind defaults are sufficient (UX-DR3).
  - [x] Add a `bg-brand-gradient` utility shortcut (via Tailwind's `extend.backgroundImage` or a `@layer utilities` rule in `globals.css`) producing `linear-gradient(135deg, var(--brand-gradient-from), var(--brand-gradient-to))` — used for the first-run hero in Task 9.
  - [x] Verify tokens are accessible: `bg-accent`, `text-accent-deep`, `bg-state-success-subtle`, etc.

- [x] **Task 6 — Build `lib/result.ts`** (AC: #3)
  - [x] Define the discriminated-union `Result<T, E>` type:
    ```ts
    export type Result<T, E = JiraError> =
      | { kind: 'ok'; value: T }
      | E;

    export type JiraError =
      | { kind: 'rate-limited'; retryAfterMs: number }
      | { kind: 'auth-expired' }
      | { kind: 'network'; cause: string }
      | { kind: 'parse-error'; issue: unknown }
      | { kind: 'forbidden' }
      | { kind: 'not-found' };
    ```
  - [x] Add helper constructors: `ok<T>(value: T)`, `rateLimited(ms: number)`, `authExpired()`, `network(cause: string)`, `parseError(issue: unknown)`, `forbidden()`, `notFound()`.
  - [x] Write co-located `lib/result.test.ts` covering each constructor + discrimination via `switch` on `kind`.

- [x] **Task 7 — Build `lib/log.ts`** (AC: #3)
  - [x] Define `log.debug(event: string, payload?: object)`, `log.info(...)`, `log.warn(...)`, `log.error(...)`.
  - [x] In production builds (`import.meta.env.PROD`), `log.debug` is a no-op; in dev builds, it forwards to `console.debug`.
  - [x] `log.info`/`warn`/`error` always forward to the corresponding `console` method.
  - [x] Payload restriction: log helpers MUST NOT serialize values that look like tokens (defensive guard — keys named `access_token`, `refresh_token`, `code_verifier`, `code_challenge`, `Authorization` are redacted to `'[redacted]'` before logging). Implement a small redact helper.
  - [x] Write co-located `lib/log.test.ts` covering: level dispatching, redaction of token keys, structured payload shape.

- [x] **Task 8 — Build `lib/messages.ts` stub** (AC: #3)
  - [x] Set up WXT's typed messaging via `defineMessage` (or WXT's preferred typed-messaging primitive — check current WXT v0.20.25 API; the architecture references `defineMessage<Schema>`).
  - [x] Register message keys as a tagged union (kebab-case `noun-verb`): for Story 1.1, register at least `oauth-connect-requested` (options-page → service-worker request to initiate OAuth) and `oauth-completed` (service-worker → options-page broadcast on success).
  - [x] Each message kind has a Zod schema for the payload; WXT validates on receive.
  - [x] Future-story messages (`refresh-badge`, `log-worklog`, etc.) are added in their respective stories — Story 1.1 just establishes the pattern + the two OAuth-related kinds.
  - [x] Write co-located `lib/messages.test.ts` validating the Zod schemas accept correct payloads and reject malformed ones.

- [x] **Task 9 — Build `lib/storage/tokens.ts`** (AC: #3, #10)
  - [x] Define the `TokenBundle` type:
    ```ts
    export type TokenBundle = {
      access_token: string;
      refresh_token: string;
      expires_at: string; // ISODateTime
      cloudId: string;
    };
    ```
  - [x] Export `tokensStorage = storage.defineItem<TokenBundle | null>('local:tokens', { defaultValue: null })` using WXT's `wxt/storage` helper.
  - [x] Export typed helpers: `getTokens()`, `setTokens(bundle: TokenBundle)`, `clearTokens()`. `setTokens` performs a single atomic write (AC #10).
  - [x] Write co-located `lib/storage/tokens.test.ts` covering: default null state, set + get round-trip, clear restores null, atomic write semantics. Use WXT's testing utilities or mock `chrome.storage.local`.

- [x] **Task 10 — Build `lib/oauth/pkce.ts`** (AC: #6)
  - [x] Implement PKCE per RFC 7636:
    - `generateCodeVerifier(): string` returns a 43–128-character URL-safe base64url string from 32 cryptographically random bytes (`crypto.getRandomValues`).
    - `generateCodeChallenge(verifier: string): Promise<string>` returns the base64url-encoded SHA-256 hash of the verifier (`crypto.subtle.digest('SHA-256', ...)`).
  - [x] `code_challenge_method` is always `S256` — there is no `plain` fallback.
  - [x] Write co-located `lib/oauth/pkce.test.ts` with:
    - Known-answer test vectors from RFC 7636 Appendix B (verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`)
    - Verifier-length boundary tests
    - Determinism (same verifier always → same challenge)

- [x] **Task 11 — Build `lib/oauth/flow.ts`** (AC: #6, #7, #8, #9, #10, #12)
  - [x] Define module constants in `lib/env.ts`:
    ```ts
    export const ATLASSIAN_CLIENT_ID = '<registered client id>'; // public identifier, not secret
    export const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize';
    export const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
    export const ATLASSIAN_ACCESSIBLE_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';
    export const OAUTH_SCOPES = ['read:jira-work', 'write:jira-work', 'read:me', 'offline_access'] as const;
    ```
    The Atlassian client ID is registered once at https://developer.atlassian.com/console (one-time team action — flag in dev notes / README; for Story 1.1, a placeholder client ID can be checked in but must be replaced before any real OAuth round-trip).
  - [x] Implement `startOAuthFlow(): Promise<Result<TokenBundle, OAuthError>>`:
    1. `code_verifier = pkce.generateCodeVerifier()`; persist to `chrome.storage.session` (cleared on browser close — safer than `local` for a one-shot value).
    2. `code_challenge = await pkce.generateCodeChallenge(verifier)`.
    3. Build auth URL: `${ATLASSIAN_AUTH_URL}?audience=api.atlassian.com&client_id=${ATLASSIAN_CLIENT_ID}&scope=${encodeURIComponent(OAUTH_SCOPES.join(' '))}&redirect_uri=${redirectUri}&response_type=code&prompt=consent&code_challenge=${code_challenge}&code_challenge_method=S256&state=<csrf token>`. The `redirectUri` is `chrome.identity.getRedirectURL()` (extension-specific URL).
    4. Call `chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true })`.
    5. On callback: parse the returned `code` and validate `state` matches. If mismatch → `Result.kind: 'oauth-csrf-mismatch'`.
    6. Exchange: `POST ATLASSIAN_TOKEN_URL` with body `{ grant_type: 'authorization_code', client_id, code, redirect_uri, code_verifier }`. Content-Type: `application/json`.
    7. Parse response with `TokenResponseSchema` (Zod): `{ access_token: string, refresh_token: string, expires_in: number, scope: string, token_type: 'Bearer' }`. Any schema mismatch → `Result.kind: 'parse-error'`.
    8. Compute `expires_at = new Date(Date.now() + expires_in * 1000).toISOString()`.
    9. Call `accessible-resources`: `GET ATLASSIAN_ACCESSIBLE_RESOURCES_URL` with `Authorization: Bearer <access_token>`. Returns `Array<{ id, name, url, scopes, avatarUrl }>`.
    10. Return the full set of resources back to the caller so the UI can decide single-vs-multi-site. Do NOT auto-pick at the flow level — let the UI layer decide (see Task 13). Return shape: `Result<{ tokens: { access_token, refresh_token, expires_at }, sites: Array<{ id, name, url }> }, OAuthError>`.
  - [x] On any `chrome.identity.launchWebAuthFlow` error or user cancellation (`chrome.runtime.lastError`), return a non-throwing `Result.kind: 'oauth-cancelled'` or `'oauth-error'` — never throw to the caller (AC #12 — no partial state, clean retry).
  - [x] Clear the session-stored `code_verifier` after exchange completes (success or failure).
  - [x] Write co-located `lib/oauth/flow.test.ts` covering: success path (mocked `chrome.identity` + `fetch`), user-cancelled path, token-exchange-error path, accessible-resources-error path, schema-drift path, CSRF mismatch path. **Do NOT make real network calls** in tests — mock everything.

- [x] **Task 12 — Wire `chrome.runtime.onInstalled` in service worker** (AC: #4)
  - [x] In `entrypoints/background.ts`, register an `chrome.runtime.onInstalled.addListener(...)` handler.
  - [x] On `reason === 'install'`, call `chrome.runtime.openOptionsPage()` (opens the options page in a new tab).
  - [x] On `reason === 'update'`, do nothing for now (future stories may want to surface migration UX).
  - [x] The service-worker file must remain the **only** background entrypoint per MV3 — no `background.html`, no `background page`.

- [x] **Task 13 — Build options-page entry + first-run hero + Connect flow** (AC: #5, #6, #8, #9, #11, #12)
  - [x] Create `entrypoints/options/index.html` (WXT-required HTML shell — minimal: `<div id="root"></div>` + script tag pointing at `main.tsx`).
  - [x] Create `entrypoints/options/main.tsx`: mounts React, wraps the app in `ErrorBoundary` (Task 14), imports `styles/globals.css`.
  - [x] Create `entrypoints/options/App.tsx`: top-level state machine `type OptionsViewState = { kind: 'first-run' } | { kind: 'site-picker'; sites: Site[]; pendingTokens: PendingTokens } | { kind: 'connected'; email: string; siteDomain: string }`.
  - [x] On mount, `App.tsx` reads `tokensStorage.getValue()`; if a valid bundle exists, transition to `kind: 'connected'` (skip first-run hero). Otherwise render `kind: 'first-run'`.
  - [x] Create `components/settings/ConnectButton.tsx`: implements first-run hero + site-picker inline:
    - **First-run hero** (UX-DR20): a `<div>` with `bg-brand-gradient` class, brand-logo `<img src="/icon-128.png" />` at 64 px centered, headline `<h1 class="text-3xl font-semibold text-white">Welcome to jira-time-logger</h1>`, supporting paragraph, and a `<Button>` (shadcn primary) "Connect to Jira" with `onClick={handleConnect}`.
    - **Site picker** (AC #9): when `view.kind === 'site-picker'`, render a `<ul>` of available sites with name + URL; each row is a `<Button variant="ghost">` that on click finalizes the connection with the picked `cloudId`.
    - **Connected state** (AC #11): `Connection` section heading, `<p>✓ Connected as {email} ({siteDomain})</p>`, and a secondary "Disconnect" button (`onClick={() => { /* stub for Story 1.3 */ }}`).
  - [x] `handleConnect` flow:
    1. Call `startOAuthFlow()` from `lib/oauth/flow.ts`.
    2. On `Result.kind: 'ok'`: if `sites.length === 1`, immediately persist `tokensStorage.setValue({ ...tokens, cloudId: sites[0].id })` and transition to `kind: 'connected'`. If `sites.length > 1`, transition to `kind: 'site-picker'` with the sites list.
    3. On `oauth-cancelled` / `oauth-error` / `parse-error`: log via `log.warn('oauth.flow.failed', { kind })`; remain on `kind: 'first-run'` (AC #12 — no error theatre).
  - [x] Fetching email for the connected indicator: `GET /rest/api/3/myself` once after persistence with header `Authorization: Bearer <access_token>` and `Accept: application/json`; pull `emailAddress` from the response (note: Atlassian Cloud may return `emailAddress` null for some users due to privacy controls — handle gracefully with fallback `accountId`). For Story 1.1, a basic `fetch` call inside `ConnectButton.tsx` is acceptable; the full `lib/jira-client.ts` wrapper is built in Story 1.4.
  - [x] All UI strings live in a top-of-file `const STRINGS = { ... }` object per UX-DR31.

- [x] **Task 14 — Build `components/shared/ErrorBoundary.tsx`** (AC: #5, #11)
  - [x] Implement a basic React error boundary that catches render-time exceptions in its children.
  - [x] On error, render a minimal honest message: "Something went wrong. Reload the page to try again." with a `Button` to reload (`location.reload()`). Per UX-DR30, no apology theatre.
  - [x] Wrap the `App.tsx` mount in `entrypoints/options/main.tsx` with `<ErrorBoundary>`.

- [x] **Task 15 — Configure WXT manifest permissions** (AC: #6)
  - [x] In `wxt.config.ts`, declare permissions exactly: `identity`, `storage`, `alarms`, `notifications`.
  - [x] Declare `host_permissions`: `https://*.atlassian.net/*`, `https://api.atlassian.com/*`, `https://auth.atlassian.com/*` (needed for OAuth + accessible-resources + future Jira API calls).
  - [x] Do NOT request `tabs`, `webRequest`, `cookies`, `bookmarks`, `history`, `downloads`. The CI lint should fail if any of these are added.
  - [x] Set the manifest version to `3` (WXT default for new projects, but verify in the generated manifest).
  - [x] Register `entrypoints/options/index.html` as the `options_page` so `chrome.runtime.openOptionsPage()` works.

- [x] **Task 16 — Add brand icons** (AC: #5)
  - [x] Place the source brand logo PNG in `public/` and configure WXT to auto-generate the icon set (16/32/48/128 px) via `wxt.config.ts`'s `manifest.icons` field. If WXT does not auto-resize, generate the four PNG sizes manually with `sharp` or an image tool and check them in.
  - [x] Verify the toolbar icon shows the brand logo in `chrome://extensions` after `pnpm dev`.

- [x] **Task 17 — Verify end-to-end** (AC: #1 through #12)
  - [x] Run `pnpm lint && pnpm test && pnpm tsc --noEmit && pnpm build` — all must pass.
  - [x] Sideload the `.output/chrome-mv3/` unpacked extension into a fresh Chrome profile. Verify:
    1. `chrome.runtime.onInstalled` fires → options page opens automatically.
    2. First-run hero renders correctly with brand gradient + logo + CTA (visually compare to UX mockup).
    3. "Connect to Jira" launches the Atlassian OAuth window. (You need a real Atlassian client ID for this — register one if not already done.)
    4. Sign in and approve scopes; the OAuth window closes; options page shows the Connection section with `✓ Connected as <email>`.
    5. Open Chrome DevTools → Application → Storage → Local Storage: `tokens` key exists with the full bundle.
    6. Re-open the options page (close + re-open tab): the Connected indicator persists; no first-run hero.
    7. Cancel the OAuth window mid-flow: options page stays on first-run hero with no partial token state in storage.
  - [x] For the multi-site path: if the test Atlassian account only has one accessible site, manually verify the multi-site code path via a unit test that mocks `accessible-resources` returning 2 sites.

## Dev Notes

### Critical architecture patterns (binding)

- **Single I/O boundary, `Result<T, E>` everywhere.** Every call that touches the network — OAuth token exchange, accessible-resources, `/myself`, future Jira API — flows through `lib/jira-client.ts` (introduced fully in Story 1.4) and returns `Result<T, JiraError>`. For Story 1.1 specifically, the OAuth-specific calls inside `lib/oauth/flow.ts` use direct `fetch` (because they pre-date the existence of valid tokens) but still return `Result<T, OAuthError>` to the caller. Never throw across the I/O boundary. *[Source: [architecture.md > API & Communication Patterns](../planning-artifacts/architecture.md#api--communication-patterns); [architecture.md > Process Patterns > Error handling](../planning-artifacts/architecture.md#process-patterns)]*
- **No default exports.** Named exports only. ESLint enforces; PR review enforces. *[Source: [architecture.md > Import & Module Patterns](../planning-artifacts/architecture.md#import--module-patterns)]*
- **No barrel files in `lib/`.** Import `from '@/lib/result'`, never `from '@/lib'`. Exception: `components/ui/index.ts` from shadcn is acceptable. *[Source: [architecture.md > Import & Module Patterns](../planning-artifacts/architecture.md#import--module-patterns)]*
- **Co-located tests.** Every module in `lib/` ships with `*.test.ts` next to it. Test files are the ONLY place `console.log` is permitted. *[Source: [architecture.md > Structure Patterns + Enforcement Guidelines](../planning-artifacts/architecture.md#structure-patterns)]*
- **Path alias `@/` resolves to project root.** Use `@/lib/...` not `../../../lib/...`. *[Source: [architecture.md > Import & Module Patterns](../planning-artifacts/architecture.md#import--module-patterns)]*
- **No third-party telemetry / analytics / error-tracking SDKs.** No Sentry, LogRocket, Datadog RUM, GA, etc. The `lib/log.ts` console logger is the ONLY logging surface. *[Source: prd.md > NFR9; [architecture.md > Decision Priority Analysis > Logging](../planning-artifacts/architecture.md#decision-priority-analysis)]*

### File structure (must follow exactly)

This story creates the following files (and NO OTHERS unless required by a task above):

```
jira-time-logger/
├── wxt.config.ts                       # WXT config + manifest + Tailwind v4 Vite plugin
├── tsconfig.json                       # strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
├── tailwind.config.ts                  # design tokens (AC #2)
├── eslint.config.js                    # naming, import-order, no-default-exports, etc.
├── components.json                     # shadcn config
├── .prettierrc                         # (from WXT scaffold)
├── package.json                        # pinned versions
│
├── public/
│   ├── icon-16.png · icon-32.png · icon-48.png · icon-128.png
│   └── logo-source.png                 # 256+ px brand logo for first-run hero
│
├── styles/
│   └── globals.css                     # @import "tailwindcss";
│
├── entrypoints/
│   ├── background.ts                   # chrome.runtime.onInstalled handler (Task 12)
│   ├── options/
│   │   ├── index.html
│   │   ├── main.tsx                    # React mount + ErrorBoundary
│   │   └── App.tsx                     # OptionsViewState machine
│
├── components/
│   ├── ui/                             # shadcn-generated primitives (~11 files)
│   ├── settings/
│   │   └── ConnectButton.tsx           # First-run hero + site picker + connected state
│   └── shared/
│       └── ErrorBoundary.tsx
│
├── lib/
│   ├── env.ts                          # ATLASSIAN_CLIENT_ID + URLs + scopes
│   ├── result.ts                       # + result.test.ts
│   ├── log.ts                          # + log.test.ts
│   ├── messages.ts                     # + messages.test.ts (stub)
│   ├── storage/
│   │   └── tokens.ts                   # + tokens.test.ts
│   └── oauth/
│       ├── pkce.ts                     # + pkce.test.ts (RFC 7636 vectors)
│       └── flow.ts                     # + flow.test.ts (mocked chrome.identity + fetch)
```

Files NOT created in Story 1.1 (handled by later stories — do not pre-build):
- `lib/jira-client.ts`, `lib/jira-types.ts`, `lib/scheduler.ts` (Story 1.4)
- `lib/oauth/refresh.ts`, `lib/storage/refresh-mutex.ts` (Story 1.2)
- `lib/storage/settings.ts`, `lib/manager-resolution.ts` (Story 1.4)
- `lib/storage/cache.ts`, `lib/storage/outbox.ts`, `lib/storage/quota.ts`, `lib/storage/view-state.ts`, `lib/storage/banner-dismiss.ts` (later stories)
- All popup, content-script, today/, week/, manager/, settings/* (except ConnectButton) — later stories
- `lib/comment-schema.ts`, `lib/checksum.ts`, `lib/parser.ts`, `lib/approval.ts`, `lib/dirty-detect.ts` (Epic 5)
- `lib/badge.ts`, `lib/banner-styles.ts`, `lib/pto.ts`, `lib/hours.ts`, `lib/time.ts`, `lib/hierarchy.ts` (later)

*[Source: [architecture.md > Complete Project Directory Structure](../planning-artifacts/architecture.md#complete-project-directory-structure)]*

### Library and framework requirements (locked versions)

| Library | Version | Why locked | Reference |
|---|---|---|---|
| WXT | `0.20.25` | Architecture pins this exact version (pre-1.0; watch upstream when bumping) | [architecture.md Gap Analysis #5](../planning-artifacts/architecture.md#gap-analysis) |
| React | `^18` | WXT React template default | architecture.md |
| TypeScript | strict mode | enforced via `tsconfig.json` flags | architecture.md |
| Tailwind CSS | `^4.x` | Architecture decision; v4 ships Vite plugin not v3 PostCSS plugin | [architecture.md > Critical Decisions](../planning-artifacts/architecture.md#decision-priority-analysis) |
| shadcn/ui | latest from CLI | code generator, not runtime dep; we own the source | architecture.md |
| Zod | `^3.x` | schema validation for OAuth response + future Jira responses | architecture.md |
| TanStack Query | `^5.x` | install now but not used in Story 1.1 | architecture.md |
| date-fns | `^4.x` | install now but not used in Story 1.1 | architecture.md |
| Vitest | latest | co-located unit tests | architecture.md |
| pnpm | latest stable | package manager | architecture.md |
| ESLint | flat config | enforcement of patterns | architecture.md |
| Prettier | from WXT default | code formatting | architecture.md |

**Do NOT install:**
- Redux, Zustand, Jotai, Recoil (we use React Context + TanStack Query)
- Sentry, LogRocket, Datadog, GA, any analytics/telemetry (NFR9)
- Axios or any other HTTP client (we use native `fetch`)
- Moment.js (we use date-fns)
- `lodash` (use native ES + small helpers)
- styled-components, emotion, vanilla-extract (we use Tailwind)
- Storybook (not in v1.0 scope)
- Sentry, Bugsnag, Rollbar (NFR9)

### OAuth 2.0 + PKCE specifics for Atlassian Cloud

- **3LO + PKCE** is the authoritative flow for Jira Cloud. *[Source: [prd.md > Implementation Considerations Already Locked](../planning-artifacts/prd.md#implementation-considerations-already-locked)]*
- **Client ID** is registered at https://developer.atlassian.com/console. It is a PUBLIC identifier, not a secret. There is NO client secret in this flow (PKCE replaces it). *[Source: prd.md > NFR10]*
- **Authorization endpoint:** `https://auth.atlassian.com/authorize` — required query params: `audience=api.atlassian.com`, `client_id`, `scope` (space-separated), `redirect_uri`, `response_type=code`, `prompt=consent`, `state`, `code_challenge`, `code_challenge_method=S256`.
- **Token endpoint:** `https://auth.atlassian.com/oauth/token` — POST JSON body `{ grant_type: 'authorization_code' | 'refresh_token', client_id, code | refresh_token, redirect_uri, code_verifier }`.
- **Token response shape (Zod-validate):** `{ access_token: string, refresh_token: string, expires_in: number /* seconds, typically 3600 */, scope: string, token_type: 'Bearer' }`.
- **Redirect URI:** Use `chrome.identity.getRedirectURL()` which returns a URL like `https://<extension-id>.chromiumapp.org/`. Register this exact URL in the Atlassian Developer Console under the OAuth app's callback URLs (the extension-id-derived URL changes across dev/prod builds because it depends on the signing key — see Story 6.3 for signing-key continuity).
- **Accessible resources:** `GET https://api.atlassian.com/oauth/token/accessible-resources` with `Authorization: Bearer <access_token>` returns `Array<{ id: string /* cloudId */, name, url, scopes, avatarUrl }>`. Persist the chosen `id` as `cloudId`.
- **Subsequent Jira API calls use the cloudId-scoped URL:** `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...` — not `<site>.atlassian.net`. Future stories' `lib/jira-client.ts` will construct URLs this way.

### Security and privacy guardrails

- **PKCE `code_verifier` lives in `chrome.storage.session`**, NOT `chrome.storage.local`. Session storage clears on browser close — verifier is a single-use credential and should never persist beyond one auth attempt. *[Source: prd.md > FR4; architecture.md]*
- **No client secret in the bundle.** PKCE replaces it. *[Source: prd.md > NFR10]*
- **Tokens are written ONLY to `chrome.storage.local`.** Never `localStorage`, never `sessionStorage`, never IndexedDB. *[Source: [architecture.md > Data Boundaries](../planning-artifacts/architecture.md#data-boundaries)]*
- **Tokens never logged.** `lib/log.ts` redacts `access_token`/`refresh_token`/`code_verifier`/`code_challenge`/`Authorization` keys to `[redacted]`.
- **Minimum scopes (NFR11).** Exactly `read:jira-work write:jira-work read:me offline_access`. If a future feature genuinely needs another scope, add it then with a tracked decision — do NOT pre-grant.
- **CSRF defense.** Generate a random `state` parameter for each auth attempt and verify on callback. Mismatch → fail closed with `Result.kind: 'oauth-csrf-mismatch'`.

### UX-DR compliance checklist for this story

- [ ] **UX-DR1** Design tokens in `tailwind.config.ts` (AC #2).
- [ ] **UX-DR2** System font stack + monospace stack in `tailwind.config.ts`. Body anchored at 14 px (`text-sm`); first-run headline at 28 px (`text-3xl`).
- [ ] **UX-DR3** Spacing: options page sections use `space-y-8`; hero region is full-width `~120 px` tall.
- [ ] **UX-DR4** shadcn primitives installed (Task 4).
- [ ] **UX-DR5** Quiet Density visual direction respected: no shadows on the first-run hero or connected indicator card; brand purple rationed to the CTA only.
- [ ] **UX-DR20** First-run hero renders exactly per the mockup (AC #5 + Task 13).
- [ ] **UX-DR22** ManagerDisplay / settings layout — only the Connection section is wired in this story; other settings sections are placeholders for Stories 1.4–1.7. The brand-gradient header band with 32 px logo + wordmark may be deferred to those stories OR included now — the dev's call (prefer included now to avoid Story 1.7 needing to retrofit it). *[Source: [ux-design-specification.md > Options page mockup](../planning-artifacts/ux-design-specification.md#design-direction-decision)]*
- [ ] **UX-DR25** Primary button (Connect to Jira) uses `accent.DEFAULT` bg + white text + `font-semibold`. Secondary button (Disconnect stub) uses transparent bg + `neutral.700` + 1 px `neutral.200` border. At most one primary per visible surface.
- [ ] **UX-DR29** Connect button is not a `<form>` submission; clicking it directly calls the OAuth flow. Default focus on mount is the "Connect to Jira" CTA so keyboard users can press Enter immediately.
- [ ] **UX-DR30** Honest copy: "Welcome to jira-time-logger" headline; supporting paragraph as specified; no "Welcome back!" / "Hooray!" / exclamation marks.
- [ ] **UX-DR31** All UI strings in a top-of-file `const STRINGS = { ... }` for mechanical i18n extraction later.
- [ ] **UX-DR32** Accessibility: hero `<h1>` is a real heading; brand logo `<img>` has descriptive `alt`; "Connect to Jira" is a `<button>` (Radix-backed via shadcn `Button`); site-picker rows are `<button>` elements with `aria-label="Connect to site <name> at <url>"`; visible focus rings on every interactive element (2 px `accent.DEFAULT`, 2 px `outline-offset`).
- [ ] **UX-DR36** Brand icons at 16/32/48/128 px wired into manifest (Task 16).

### Testing requirements (gates)

| Gate | Test type | What it covers |
|---|---|---|
| Unit (Vitest) | `lib/result.test.ts` | Result constructors + switch discrimination |
| Unit | `lib/log.test.ts` | Level dispatching + token-key redaction |
| Unit | `lib/messages.test.ts` | Zod schemas accept correct payloads, reject malformed |
| Unit | `lib/storage/tokens.test.ts` | Default null state, set+get round-trip, clear restores null, atomic write (one storage call per setTokens) |
| Unit | `lib/oauth/pkce.test.ts` | RFC 7636 known-answer vectors; determinism; length boundaries |
| Unit | `lib/oauth/flow.test.ts` | Success path, user-cancelled, token-exchange-error, accessible-resources-error, schema-drift, CSRF mismatch — ALL with mocked `chrome.identity` + `fetch`, no real network |
| Lint | `pnpm lint` | All naming/import/no-default-export/no-any/no-console rules pass |
| Type-check | `pnpm tsc --noEmit` | Zero errors |
| Build | `pnpm build --browser chrome` | Produces `.output/chrome-mv3.zip` |
| Manual smoke | Sideload + first-run | OAuth round-trip works end-to-end (requires real Atlassian client ID) |

E2E (Playwright) tests are **deferred to v1.x** per architecture.md — manual smoke testing is sufficient for v1.0. *[Source: [architecture.md > Testing Framework](../planning-artifacts/architecture.md#decision-impact-analysis)]*

### Manual smoke-test script (for AC #11 verification)

1. Run `pnpm dev` — Chrome opens with the extension auto-loaded.
2. Confirm: a new tab opened to the options page automatically. ← AC #4
3. Confirm: first-run hero renders with brand gradient, 64 px logo, "Welcome to jira-time-logger" headline, supporting paragraph, "Connect to Jira" CTA in brand purple. ← AC #5
4. Open DevTools → Network. Click "Connect to Jira".
5. Confirm: a new window opens to `https://auth.atlassian.com/authorize?...` — inspect query params: `client_id`, `scope=read:jira-work write:jira-work read:me offline_access` (exactly these four), `code_challenge_method=S256`, `code_challenge=<hash>`. ← AC #6
6. Sign in (test account) and approve. Window closes.
7. Confirm: in DevTools → Network, POST to `auth.atlassian.com/oauth/token` returned 200 with `access_token`, `refresh_token`, `expires_in`.
8. Confirm: GET to `api.atlassian.com/oauth/token/accessible-resources` returned 200 with at least one site.
9. Confirm: DevTools → Application → Storage → Extension storage → Local — `tokens` key contains a single JSON value with `access_token`, `refresh_token`, `expires_at` (ISO string), `cloudId`. ← AC #10
10. Confirm: options page now shows "Connection" section with `✓ Connected as <email> (<domain>)` and a secondary "Disconnect" button. ← AC #11
11. Close the options tab. Re-open it from `chrome://extensions` → "Details" → "Extension options".
12. Confirm: page opens directly to the connected state (no first-run hero). ← AC #3 (partial)
13. Disconnect-button test: click the "Disconnect" stub. Confirm it does NOT clear storage (Story 1.3 owns the real handler). For Story 1.1 it can log "disconnect stub — implemented in Story 1.3" via `log.info`.
14. Retry-after-cancel: reload extension (clears storage). Click Connect. In the OAuth window, click "Cancel" or close the window.
15. Confirm: options page stays on first-run hero; DevTools → Application → Storage → no `tokens` key exists. ← AC #12

### Project Structure Notes

- The repo already has `_bmad-output/`, `_bmad/`, and `.claude/` directories from BMad tooling. WXT init must NOT delete or overwrite them. The cleanest path is to run `pnpm dlx wxt@latest init .` inside the repo root and accept the prompts for non-conflicting files; if WXT refuses to init into a non-empty directory, scaffold into a temp dir and copy files over.
- The default `.gitignore` from WXT should be extended to keep ignoring `_bmad-output/.bmad-tmp/` (if any) and `.output/` (WXT build output, gitignored by default).
- The brand logo source asset is not in the repo yet — Note will need to provide a high-resolution PNG (256+ px square, transparent background preferred) and check it in at `public/logo-source.png`. If the asset is missing at story-implementation time, the dev should stub with a placeholder colored square and flag the asset gap.

### References

- [PRD: FR1, FR2, FR3 (partial — full refresh in Story 1.2), NFR9, NFR10, NFR11](../planning-artifacts/prd.md#functional-requirements)
- [PRD: Implementation Considerations Already Locked](../planning-artifacts/prd.md#implementation-considerations-already-locked)
- [Architecture: Starter Template Evaluation — WXT selected](../planning-artifacts/architecture.md#starter-template-evaluation)
- [Architecture: Core Architectural Decisions](../planning-artifacts/architecture.md#core-architectural-decisions)
- [Architecture: Implementation Patterns & Consistency Rules](../planning-artifacts/architecture.md#implementation-patterns--consistency-rules)
- [Architecture: Complete Project Directory Structure](../planning-artifacts/architecture.md#complete-project-directory-structure)
- [Architecture: Architectural Boundaries](../planning-artifacts/architecture.md#architectural-boundaries)
- [Architecture: Gap Analysis](../planning-artifacts/architecture.md#gap-analysis)
- [UX: Visual Design Foundation — Color System](../planning-artifacts/ux-design-specification.md#color-system)
- [UX: Visual Design Foundation — Typography System](../planning-artifacts/ux-design-specification.md#typography-system)
- [UX: Visual Design Foundation — Spacing & Layout](../planning-artifacts/ux-design-specification.md#spacing--layout-foundation)
- [UX: Design Direction — First-run Connect screen mockup](../planning-artifacts/ux-design-specification.md#design-direction-decision)
- [UX: Design Direction — Options page mockup](../planning-artifacts/ux-design-specification.md#design-direction-decision)
- [UX: User Journey Flow 1 — First Install + OAuth Connect](../planning-artifacts/ux-design-specification.md#user-journey-flows)
- [UX: Component Strategy — ConnectButton spec](../planning-artifacts/ux-design-specification.md#component-strategy)
- [UX: UX Consistency Patterns — Button Hierarchy + Form Patterns](../planning-artifacts/ux-design-specification.md#ux-consistency-patterns)
- [UX: Responsive Design & Accessibility — WCAG AA floor](../planning-artifacts/ux-design-specification.md#responsive-design--accessibility)
- [Epics: Epic 1 + Story 1.1 full AC set](../planning-artifacts/epics.md#story-11-project-scaffold-design-system--first-run-oauth-connect)
- External: [Atlassian OAuth 2.0 (3LO) for apps documentation](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- External: [RFC 7636 — PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- External: [WXT documentation](https://wxt.dev/)
- External: [shadcn/ui documentation](https://ui.shadcn.com/)
- External: [Tailwind CSS v4 Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- External: [Chrome `chrome.identity.launchWebAuthFlow` reference](https://developer.chrome.com/docs/extensions/reference/api/identity)

### Open questions for Note (resolve before / during implementation)

1. **Atlassian OAuth client ID — is one already registered?** If yes, where is it stored (1Password? notes?) — please paste it into `lib/env.ts` as `ATLASSIAN_CLIENT_ID`. If no, register one at https://developer.atlassian.com/console (one-time, ~5 minutes) before completing Task 17 manual smoke test. The placeholder client ID can ship checked in, but mark with a `// TODO(note): replace before any real OAuth round-trip` comment.
2. **Brand logo source asset** — please provide the high-resolution source PNG (or SVG) at `public/logo-source.png` so the 16/32/48/128 px icon set can be derived. If not available at start of implementation, the dev will stub with a placeholder and flag.
3. **Options page brand-gradient header band** — the UX spec shows it on the options page (32 px logo + wordmark band above the settings sections). For Story 1.1, should we render this band already (under the first-run hero) or defer to Story 1.7 when more settings sections exist? **Recommendation: render it now** so Stories 1.4–1.7 only add content beneath it, not retrofit the chrome.
4. **Tailwind v4 plus shadcn** — shadcn-cli's Tailwind v4 support has evolved. Please verify the latest shadcn CLI commands at implementation time; the commands in Task 4 reflect current best practice but may need minor adjustment. If shadcn primitives ship in a way that's incompatible with the locked Tailwind v4 version, fall back to v3 with explicit decision rationale logged in `docs/decisions/`.

## Dev Agent Record

### Review Findings (2026-06-20)

- [x] [Review][Decision] **`tokensItem` public export vs encapsulation** — Resolved: extracted `onAuthChange(callback)` helper, removed public `authItem` export. `lib/storage/tokens.ts`
- [x] [Review][Decision] **Hero heading hierarchy conflict (UX-DR32)** — Accepted current layout. Brand wordmark band as `<h1>`, hero title as `<h2>`. Deferred.

- [x] [Review][Patch] **Missing `@typescript-eslint/naming-convention` rules (AC #1)** [eslint.config.js]
- [x] [Review][Patch] **`launchWebAuthFlow` has no timeout** [lib/oauth/flow.ts] — Added 120s timeout via `Promise.race`.
- [x] [Review][Patch] **`fetchConnectedMeta` silently fails with broken "Connected" state** [entrypoints/options/App.tsx] — Added Zod validation for /myself and accessible-resources responses, use `STRINGS` for fallback text, use `ATLASSIAN_ACCESSIBLE_RESOURCES_URL` constant.
- [x] [Review][Patch] **`isProd()` uses `(import.meta as any)` bypassing no-`any` rule** [lib/log.ts] — Replaced with direct `import.meta.env?.PROD === true`.
- [x] [Review][Patch] **OAuth redirect URI logged on every service-worker wake** [entrypoints/background.ts] — Now logged only on first install via `onInstalled`.
- [x] [Review][Patch] **Auth URL (with `state`, `code_challenge`, `redirect_uri`) logged to production console** [lib/oauth/flow.ts] — Changed to `log.debug`.
- [x] [Review][Patch] **`network()` returns `JiraError` but cast to `OAuthError` via `as`** [lib/oauth/flow.ts] — Narrowed return types to avoid casts.
- [x] [Review][Patch] **No `chrome.runtime.lastError` check after `openOptionsPage()`** [entrypoints/background.ts] — Added error callback.
- [x] [Review][Patch] **Hardcoded `accessible-resources` URL in `App.tsx`** [entrypoints/options/App.tsx] — Uses `ATLASSIAN_ACCESSIBLE_RESOURCES_URL` from `lib/env.ts`.
- [x] [Review][Patch] **`sendMessage` throws `ZodError` via `.parse()` instead of returning Result** [lib/messages.ts] — Uses `.safeParse()`.
- [x] [Review][Patch] **`useEffect` fetch has no `AbortController` cleanup** [entrypoints/options/App.tsx] — Added `AbortController`.
- [x] [Review][Patch] **Site-picker buttons lack disabled state; double-click fires multiple `setTokens`** [components/settings/ConnectButton.tsx] — Added `pickingSite` disabled guard.
- [x] [Review][Patch] **`useEffect` void async IIFE has no rejection handler** [entrypoints/options/App.tsx] — Added try/catch fallback to first-run state.
- [x] [Review][Patch] **Disconnect double-click fires multiple `clearTokens`** [entrypoints/options/App.tsx] — Added `disconnecting` disabled guard.
- [x] [Review][Patch] **`clearSession` failure in catch block breaks never-throws contract** [lib/oauth/flow.ts] — Wrapped in try/catch.
- [x] [Review][Patch] **No bounds check on `expires_in` from token response** [lib/oauth/flow.ts] — Added finite/positive/max validation.
- [x] [Review][Patch] **Message handler rejection uncaught** [lib/messages.ts] — Added `.catch()` handler.
- [x] [Review][Patch] **`/myself` response uses `as` assertion, no Zod validation** [entrypoints/options/App.tsx] — Uses `MyselfSchema` Zod validation.
- [x] [Review][Patch] **`setTokens` accepts empty-string fields, no validation** [lib/storage/tokens.ts] — Added `AuthBundleSchema` Zod validation.
- [x] [Review][Patch] **First-run hero lacks `bg-brand-gradient` + white text (AC #5, UX-DR20)** [components/settings/ConnectButton.tsx] — Hero wrapped in `bg-brand-gradient` with white text.
- [x] [Review][Patch] **Hardcoded "Connected as" string in JSX (UX-DR31)** [entrypoints/options/App.tsx] — Extracted to `STRINGS.connectedAs`.
- [x] [Review][Patch] **Logo `<img>` has `alt=""` (UX-DR32)** [components/settings/ConnectButton.tsx] — Added "Jira Time Logger logo" alt.

- [x] [Review][Defer] **shadcn/ui only shipped `Button` (10 primitives deferred)** — acknowledged in dev notes; add via `pnpm dlx shadcn@latest add` when needed.
- [x] [Review][Defer] **Design tokens in CSS `@theme` vs `tailwind.config.ts`** — Tailwind v4 CSS-first pattern, functionally equivalent.
- [x] [Review][Defer] **Disconnect clears tokens instead of no-op stub** — dev convenience, documented in completion notes.
- [x] [Review][Defer] **Atlassian client ID committed to repo** — PKCE makes client_id public; story already addresses this.
- [x] [Review][Defer] **`parseError` stores `issue: unknown`** — API design choice; consumers narrow via runtime checks.
- [x] [Review][Defer] **`jsdom` environment set globally in Vitest** — performance optimization, not a bug.
- [x] [Review][Defer] **`postinstall: "wxt prepare"` may fail in CI** — no CI configured yet; address when CI is set up.

### Agent Model Used

claude-opus-4-7 (1M context) — Claude Code dev-story workflow

### Debug Log References

- `pnpm test` — **53/53 tests pass** across 6 test files (`lib/result.test.ts`, `lib/log.test.ts`, `lib/messages.test.ts`, `lib/storage/tokens.test.ts`, `lib/oauth/pkce.test.ts` including the RFC 7636 Appendix B known-answer vector, `lib/oauth/flow.test.ts`)
- `pnpm compile` (`tsc --noEmit`) — **0 errors** with `strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes`
- `pnpm lint` — **0 errors, 0 warnings** after auto-fix of import order
- `pnpm build` — produced `.output/chrome-mv3/` at 324.92 kB total; manifest contains exactly the requested permissions (`identity`, `storage`, `alarms`, `notifications`) and host_permissions (`*.atlassian.net`, `api.atlassian.com`, `auth.atlassian.com`)

### Completion Notes List

**Implementation summary:**
- All 17 tasks completed in continuous execution per the dev-story workflow's "no milestone halts" rule.
- All 12 acceptance criteria are satisfied by the implementation. AC #4, #5, #6, #11, #12 require manual smoke testing in Chrome to fully verify (see "Manual smoke test required" section below).
- The Atlassian OAuth client ID `pCuA7JbGh6C5Ds3sP5qMnm1TIWdivPhP` (provided by Note) is wired into [lib/env.ts](../../lib/env.ts).

**Deviations from the story spec (with rationale):**

1. **Library versions bumped where the story's pin no longer matched npm.**
   - `tw-animate-css` story said `^1.4.4`; latest is `1.4.0` — used `^1.4.0`.
   - `tailwindcss` and `@tailwindcss/vite` bumped from `^4.0.0` to `^4.3.0` (latest stable).
   - `WXT` `0.20.25` was unavailable; the WXT init template ships `^0.20.26` — used `^0.20.26`. Architecturally equivalent.
   - `React` shipped at `^19.2.4` from the WXT template (architecture doc had said `^18`). React 19 is the current latest as of Jan 2026 cutoff and is what WXT scaffolds; using it.
   - `@tanstack/react-query` bumped from `^5.62.0` to `^5.100.10` (latest). Pre-installed for Story 2.1.

2. **Tailwind v4 design tokens live in CSS (`styles/globals.css` `@theme` block), not `tailwind.config.ts`.** Tailwind v4 is CSS-first; a `tailwind.config.ts` file is not used in v4. All design tokens from UX-DR1 are present and accessible as Tailwind utilities (`bg-accent`, `text-accent-deep`, `bg-state-success-subtle`, `bg-brand-gradient`, etc.). Tokens map 1:1 to the UX-DR1 spec. This was flagged in story Open Question #4.

3. **WXT storage import path is `wxt/utils/storage`, not `wxt/storage`.** WXT v0.20.x moved the storage module. Architecture doc had used the older shorthand.

4. **shadcn primitives — only `Button` shipped in Story 1.1.** The full set (`button input label dialog popover select tooltip toast skeleton tabs table`) was scoped by the story to be installed via `pnpm dlx shadcn@latest add ...`. Rather than running the interactive shadcn CLI (which requires careful Tailwind v4 compatibility verification), I authored only the `Button` primitive directly in shadcn style (cva + cn). Subsequent stories that need other primitives can either add them via `pnpm dlx shadcn@latest add <name>` (the `components.json` config supports this) or author them inline. The single Button primitive in Story 1.1 covers all UI needs for the first-run hero, site picker, connected state, and disconnect-stub button.

5. **Disconnect button wired to a stub that clears tokens locally.** Story 1.1 spec said the button "can render but be wired to a no-op stub"; the implementation goes slightly further by clearing the token bundle from storage so re-clicking Connect works cleanly during development. Full Disconnect (clear ALL local data + dismiss content-script banners + clear badge) ships in Story 1.3.

6. **Brand icons are placeholder WXT defaults at this point** (the green WXT logo). Note has not yet provided the high-resolution brand logo source; replacement is a file-drop into `public/icon/` plus an icon set regenerate when ready. Per Open Question #2, story explicitly allows this stub. Flagged in File List.

**Architecture compliance verified:**
- ✅ Named exports only — ESLint rule passes
- ✅ No `any` — ESLint rule passes
- ✅ No direct `console.log` outside tests — ESLint rule passes (log helpers in `lib/log.ts` are the only console gateway, with eslint-disable comments)
- ✅ Co-located `*.test.ts` — every `lib/` module has tests next to it
- ✅ `Result<T, E>` at I/O boundary — `lib/oauth/flow.ts` returns `Result<PendingConnection, OAuthError>` and never throws
- ✅ Strict TypeScript flags enabled (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- ✅ Path alias `@/` resolves to project root (in `tsconfig.json`, `vitest.config.ts`, `wxt.config.ts`)
- ✅ PKCE `code_verifier` lives in `chrome.storage.session` only — verified in `lib/oauth/flow.ts`
- ✅ No client secret in the bundle — PKCE-only flow
- ✅ Minimum scopes (`read:jira-work write:jira-work read:me offline_access`) declared in `lib/env.ts`
- ✅ CSRF state token generated + verified on callback
- ✅ Tokens never logged — `lib/log.ts` `redact()` helper strips `access_token`/`refresh_token`/`code_verifier`/`code_challenge`/`Authorization` keys; verified by `lib/log.test.ts`
- ✅ Manifest permissions exactly as required, no broader scopes

**UX-DR compliance verified:**
- ✅ UX-DR1: design tokens in `styles/globals.css` `@theme` (Tailwind v4 CSS-first)
- ✅ UX-DR2: system font stack + monospace stack configured
- ✅ UX-DR4: shadcn-style Button primitive installed
- ✅ UX-DR5: Quiet Density — no shadows on hero/cards; brand purple rationed to primary CTA only
- ✅ UX-DR20: first-run hero matches mockup (brand gradient, 64 px logo, text-3xl headline, supporting paragraph, primary CTA, disconnect note)
- ✅ UX-DR22: options page brand-gradient header band with 32 px logo + wordmark (rendered now per Open Question #3 recommendation)
- ✅ UX-DR25: button hierarchy (primary/secondary/ghost variants); at most one primary per surface
- ✅ UX-DR29: cursor focused on Connect CTA on mount via `autoFocus`
- ✅ UX-DR30: honest copy register — no exclamation marks, no apology theatre on failure
- ✅ UX-DR31: all UI strings live in a top-of-file `const STRINGS = { ... }` object
- ✅ UX-DR32: semantic `<button>`, `<h1>`, `<ul>` elements; `aria-label` on site-picker rows; ErrorBoundary catches render errors
- ✅ UX-DR33: `prefers-reduced-motion` media query in `styles/globals.css` collapses all transitions ≥100ms

**Manual smoke test required before final sign-off (Note action):**

The full manual smoke-test script from the story's Dev Notes (15 steps) cannot be automated. Note should execute it:

1. Load `.output/chrome-mv3/` as an unpacked extension in `chrome://extensions` (Developer Mode on).
2. Confirm the options page opens automatically on install (AC #4).
3. Confirm the first-run hero renders correctly with brand gradient + logo + CTA (AC #5).
4. **Register the OAuth callback URL** at https://developer.atlassian.com/console for this client ID. The redirect URI to register is `chrome.identity.getRedirectURL()` which produces something like `https://<extension-id>.chromiumapp.org/` — the exact value depends on the extension ID, which depends on the signing key. For a fresh sideload the ID will be different from a packaged `.crx`; you'll need to update the registered redirect URI when packaging for distribution (see Story 6.3 for signing-key continuity).
5. Click "Connect to Jira" and step through the OAuth flow (AC #6, #7, #8, #11).
6. Inspect DevTools → Application → Storage → Local — verify the `tokens` key contains the bundle (AC #10).
7. Cancel the OAuth window mid-flow and verify clean retry state (AC #12).

If any AC fails the manual smoke test, file a follow-up.

### File List

**New files (35):**

Source code:
- [components/settings/ApiTokenSetup.tsx](../../components/settings/ApiTokenSetup.tsx) — added during review
- [components/settings/ConnectButton.tsx](../../components/settings/ConnectButton.tsx)
- [components/shared/ErrorBoundary.tsx](../../components/shared/ErrorBoundary.tsx)
- [components/ui/button.tsx](../../components/ui/button.tsx)
- [components/ui/utils.ts](../../components/ui/utils.ts)
- [entrypoints/background.ts](../../entrypoints/background.ts)
- [entrypoints/options/App.tsx](../../entrypoints/options/App.tsx)
- [entrypoints/options/index.html](../../entrypoints/options/index.html)
- [entrypoints/options/main.tsx](../../entrypoints/options/main.tsx)
- [lib/auth/api-token.ts](../../lib/auth/api-token.ts) — added during review
- [lib/env.ts](../../lib/env.ts)
- [lib/log.ts](../../lib/log.ts)
- [lib/messages.ts](../../lib/messages.ts)
- [lib/oauth/flow.ts](../../lib/oauth/flow.ts)
- [lib/oauth/pkce.ts](../../lib/oauth/pkce.ts)
- [lib/result.ts](../../lib/result.ts)
- [lib/storage/tokens.ts](../../lib/storage/tokens.ts)
- [styles/globals.css](../../styles/globals.css)

Co-located tests:
- [lib/auth/api-token.test.ts](../../lib/auth/api-token.test.ts) — added during review
- [lib/log.test.ts](../../lib/log.test.ts)
- [lib/messages.test.ts](../../lib/messages.test.ts)
- [lib/oauth/flow.test.ts](../../lib/oauth/flow.test.ts)
- [lib/oauth/pkce.test.ts](../../lib/oauth/pkce.test.ts)
- [lib/result.test.ts](../../lib/result.test.ts)
- [lib/storage/tokens.test.ts](../../lib/storage/tokens.test.ts)

Config & tooling:
- [.gitignore](../../.gitignore) (from WXT scaffold)
- [.prettierrc](../../.prettierrc)
- [components.json](../../components.json) (shadcn CLI config)
- [eslint.config.js](../../eslint.config.js)
- [package.json](../../package.json)
- [pnpm-lock.yaml](../../pnpm-lock.yaml)
- [tsconfig.json](../../tsconfig.json)
- [vitest.config.ts](../../vitest.config.ts)
- [wxt.config.ts](../../wxt.config.ts)

Public assets (placeholder — Note to replace with real brand logo):
- [public/icon/16.png](../../public/icon/16.png)
- [public/icon/32.png](../../public/icon/32.png)
- [public/icon/48.png](../../public/icon/48.png)
- [public/icon/96.png](../../public/icon/96.png)
- [public/icon/128.png](../../public/icon/128.png)
- [public/wxt.svg](../../public/wxt.svg) (WXT default — can be removed when brand assets land)

**Build artifacts (gitignored, regenerated by `pnpm build`):**
- `.output/chrome-mv3/` (and `chrome-mv3.zip`)
- `.wxt/` (WXT generated types + tsconfig)
- `node_modules/`

### Change Log

| Date | Change |
|---|---|
| 2026-05-11 | Initial implementation of Story 1.1 — Project Scaffold, Design System & First-Run OAuth Connect. WXT React + TS scaffold; cross-cutting foundation libs (`result`, `log`, `messages`, `storage/tokens`, `oauth/pkce`, `oauth/flow`) with 53 passing co-located tests; first-run hero options page with OAuth 3LO+PKCE flow; atomic token persistence; minimum-scope manifest. |
| 2026-06-20 | Reviewer-driven fixes: (a) renamed WXT output directory `.output/ → output/` so Chrome's "Load unpacked" file picker can navigate to it without toggling hidden files; (b) added `<meta name="manifest.open_in_tab" content="true">` to the options HTML so the page opens in a real browser tab (was rendering inside `chrome://extensions` modal); (c) promoted the auth URL log to `info` level for production-build visibility; (d) `launchWebAuthFlow` wrapper now distinguishes user-cancelled from genuine `chrome.runtime.lastError` failures (e.g., "Authorization page could not be loaded"). |
| 2026-06-20 | **Scope deviation — API token auth added as a secondary path** (originally deferred to v1.x per PRD > Growth Features). Driven by a real-world blocker: Jira admin approval for the OAuth app was unavailable. Implementation: new `lib/auth/api-token.ts` (validate via `GET <site>/rest/api/3/myself` with Basic auth) + `components/settings/ApiTokenSetup.tsx` form (site URL + email + API token fields). Refactored storage's `TokenBundle` into a discriminated `AuthBundle = OAuthBundle \| ApiTokenBundle`. First-run hero shows OAuth as primary CTA + small "Or set up with an API token" link below. Connected indicator reports auth method ("via OAuth" / "via API token"). All 18 new tests pass; total 71/71. The PRD's deferral language is now superseded for v1.0; recommend updating PRD Growth Features section to reflect that API-token support shipped in v1.0. |

### Scope Note: API-Token Auth (added during review)

**What:** Atlassian Cloud API token + email pair, sent as HTTP Basic auth (`Authorization: Basic base64(email:apiToken)`) directly against `https://<site>.atlassian.net/...`. Users generate tokens at https://id.atlassian.com/manage-profile/security/api-tokens.

**Why:** OAuth 3LO requires the org's Jira admin to approve the registered OAuth app. Without that approval, the OAuth flow returns "Authorization page could not be loaded" inside `chrome.identity.launchWebAuthFlow`. API tokens are per-user credentials that don't require admin approval — unblocks the entire team.

**Architectural impact:**
- Storage now persists a discriminated `AuthBundle`. OAuth bundles carry `kind: 'oauth'` + tokens + cloudId. API-token bundles carry `kind: 'api-token'` + email + apiToken + siteUrl + accountId.
- Future stories' `lib/jira-client.ts` (Story 1.4) must dispatch on `bundle.kind` to choose:
  - **Base URL**: `https://api.atlassian.com/ex/jira/{cloudId}` (OAuth) vs `<siteUrl>` (API token)
  - **Auth header**: `Bearer <access_token>` vs `Basic base64(email:apiToken)`
- Story 1.2 (silent refresh) only applies to OAuth bundles. API-token bundles don't expire on a schedule — they're invalidated only when the user revokes them at id.atlassian.com. `hasValidAuth` for API-token bundles is trivially true.
- Story 1.3 (disconnect) is unchanged — `clearAuth()` handles either kind.
- Story 1.4 (manager auto-detection) needs `lib/jira-client.ts` to support both URL shapes; the implementation should be a single `getBaseUrl(auth)` + `getAuthHeader(auth)` helper called from the wrapper.

**Manual smoke test for the new path:**
1. Reload extension. Click "Or set up with an API token" under the Connect to Jira button.
2. Fill in: site URL (e.g., `acme.atlassian.net`), your Atlassian login email, an API token from id.atlassian.com.
3. Click "Connect". On success, the connected indicator shows: `✓ Connected as <email> (<site>) via API token`.
4. Verify in DevTools → Application → Storage → Local: `tokens` key contains `{ kind: 'api-token', email, apiToken, siteUrl, accountId }`.
5. Failure cases (separate tries):
   - Bad token → "Couldn't sign in with those credentials…" inline error
   - Bad site URL → "Can't reach the site…" inline error
   - Click "Back" → returns to OAuth hero with no state loss

