---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
status: 'complete'
completedAt: 2026-05-10
inputDocuments:
  - '{project-root}/_bmad-output/planning-artifacts/prd.md'
  - '{project-root}/_bmad-output/brainstorming/brainstorming-session-2026-05-09-180149.md'
workflowType: 'architecture'
project_name: 'jira-time-logger'
user_name: 'Note'
date: '2026-05-10'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (52 FRs in 7 capability areas):**

The capability surface decomposes naturally along four runtime boundaries that the architecture must serve simultaneously and consistently:

| Capability area | FRs | Primary runtime surface |
|---|---|---|
| Authentication & Connection | 5 | Service worker + Options page |
| Time Logging | 9 | Popup + Content-script banner |
| Daily Awareness & Reminders | 5 | Service worker (badge, alarm, notification) + Content-script |
| Weekly Review & Mark-as-Done | 7 | Popup |
| Manager Approval | 11 | Popup (manager view) |
| Audit & Data Integrity | 6 | Cross-cutting — Jira-client + comment parser |
| Settings & Configuration | 9 | Options page + Service worker |

The architectural implication: this is **not three independent surfaces plus shared utilities** — it's **one coherent state model with three view surfaces and a service-worker orchestrator**. Token lifecycle, badge state, hierarchy cache, and approval-comment parsing must live in a layer all surfaces can reach reliably.

**Non-Functional Requirements (13 NFRs):**

The NFRs that drive architectural decisions:

- **NFR1 (popup TTI ≤ 400 ms warm / 800 ms cold)** — forces service-worker pre-warming, deferred-render patterns, and a strict bundle budget for popup code.
- **NFR2 (manager matrix progressive render)** — forces a streaming / row-by-row data flow, not a "wait for everything then render" pattern.
- **NFR5 (auth survives 30 days)** — forces robust token-refresh logic with `chrome.storage.session` mutex.
- **NFR6 (offline-tolerant; failed posts retried)** — forces an outbox/queue pattern for worklog writes; cannot be a fire-and-forget fetch.
- **NFR7 (fail-closed comment parser)** and **NFR8 (cross-version comment reading)** — forces a versioned, formally-typed parser module isolated from business logic.
- **NFR9–NFR11 (no third-party telemetry, PKCE, minimum scopes)** — rules out most analytics/error-tracking SDKs (no Sentry, no LogRocket, no Datadog RUM) and forces local-only diagnostics.
- **NFR13 (keyboard-reachable, visible focus)** — forces accessibility testing as a first-class CI concern, not a manual checklist.

### Scale & Complexity

- **Primary domain:** Browser extension (Chromium MV3) over a third-party REST API (Jira Cloud).
- **Complexity level:** **High** — driven by three structurally-difficult components, not by feature count or scale:
  1. Approval-comment protocol (state-in-plaintext-comments with versioned-checksum schema)
  2. MV3 service worker auth lifecycle (sleeps/restarts unpredictably, must survive)
  3. Manager-view client-side fan-out vs Jira rate limits (no bulk worklog endpoint; token-bucket scheduler required)
- **User scale:** ≤ 10 internal users; no horizontal scaling concerns.
- **Data scale:** Per manager, up to ~600 worklog records per cycle (12 reports × 50 Epics); fits comfortably in `chrome.storage.local` 10 MB budget with eviction.
- **Estimated architectural components (high-level):**
  - 4 runtime surfaces (popup, content-script, options, service-worker)
  - 1 Jira API client wrapper
  - 1 OAuth/token-lifecycle module
  - 1 Approval-comment schema/parser module (versioned)
  - 1 Cache/storage layer (chrome.storage abstraction)
  - 1 Rate-limit scheduler (token bucket)
  - 1 Inter-surface message-bus (typed)
  - 1 Hierarchy-walk query engine (FR8 / FR44 / FR45)
  - Worker view + Manager view presentation layers
  - Options page presentation layer (separate bundle)

### Technical Constraints & Dependencies

**Hard constraints (non-negotiable, from PRD):**

- **Manifest V3 only.** No background page; service worker lifecycle is the law.
- **Serverless: Chrome extension + Jira Cloud REST API only.** No backend, no third-party services, no external infrastructure.
- **OAuth 2.0 (3LO + PKCE) for Jira Cloud auth.** No PAT in v1.0; no client secret embedded.
- **Chrome and Edge as primary targets.** Same MV3 codebase; explicit Edge validation pre-release.
- **All shared state lives in Jira.** No central database. Local state is per-user, per-browser only.
- **CSP-safe content-script.** Inline styles only; no external loads.

**Discoveries from PRD that bind library/tool choice:**

- Tagged-union message-passing types implies **TypeScript** is required (not optional).
- Versioned + checksummed approval-comment schema implies a **schema module with explicit serialization tests**.
- `chrome.storage.local` 10 MB quota implies **eviction strategy** in storage layer.
- `chrome.alarms` 1-min minimum interval bounds badge update cadence.
- "Dual-persona role-switching in same popup" implies **route-based architecture inside the popup**, not a single monolithic view.

### Cross-Cutting Concerns

These concerns span every capability area and deserve top-level architectural treatment, not buried inside features:

1. **Token lifecycle** — auth refresh, rotation, mutex; touched by every API call.
2. **Rate-limit governance** — every Jira API call flows through the token-bucket scheduler; respects `Retry-After`.
3. **Approval-comment protocol** — schema, parser, dirty-detection logic; touched by manager view, worker view, and any view that displays approval status.
4. **Inter-surface messaging** — popup ↔ service worker ↔ content script ↔ options; tagged-union types enforced.
5. **Storage abstraction** — `chrome.storage.local` writes go through one layer that handles quota, eviction, and concurrency.
6. **Error surfacing** — NFR6/NFR17 require explicit error states and retry-on-reconnect; cannot be silent.
7. **Logging / diagnostics** — NFR9 forbids third-party telemetry; developer-facing console logging needs a discipline (verbosity levels, structured payloads) so we can debug user-reported issues without shipping data anywhere.
8. **Schema migration** — extension versions in a rollout window must coexist; comment schema versioning is the contract, with parse-time migration.
9. **Accessibility** — keyboard reachability + non-color-only signaling touch every UI surface; cannot be retrofitted.

### Architectural Risks (from PRD, ranked)

| Risk | Severity | Architectural mitigation locus |
|---|---|---|
| Approval-comment protocol fragility | HIGH | Dedicated schema/parser module with version + checksum + comment-id lookup |
| Manager-view fan-out vs rate limits | HIGH | Token-bucket scheduler + aggressive cycle-cache + progressive UI render |
| OAuth in MV3 service worker | MEDIUM | Persistent token store + `chrome.storage.session` mutex + `chrome.alarms`-based refresh |
| Storage quota (10 MB) | LOW-MED | Quota-aware storage abstraction with TTL eviction |
| Content-script CSP / SPA re-injection | LOW-MED | Idempotent content-script with MutationObserver + popstate listener |

## Starter Template Evaluation

### Primary Technology Domain

Chromium-based browser extension (Manifest V3) targeting Chrome and Edge, written in TypeScript with React. Per PRD constraints: serverless, talks only to Jira Cloud REST API.

### Starter Options Considered

**WXT v0.20.25** (selected) — Opinionated Vite-based framework for web extensions. File-based config (manifest entries auto-derived from file structure), built-in storage helpers (`storage.defineItem`), built-in messaging utilities, content-script HMR, multi-browser support out of the box.

**CRXJS Vite Plugin v2.4.0** (alternative considered) — Battle-tested Vite plugin for Chrome extensions. Lower abstraction, more flexibility, but requires hand-rolling our own storage and messaging wrappers (the exact code WXT provides as helpers).

**Plasmo** (rejected) — Heavier framework with React-specific opinions; more abstraction than we need and historically inconsistent maintenance cadence.

**Vanilla Vite + manifest.json** (rejected) — Maximum flexibility but reinvents both content-script HMR and entry-point discovery for no benefit at our scope.

### Selected Starter: WXT (React template)

**Rationale for Selection:**

1. WXT's built-in `storage.defineItem()` and typed messaging helpers directly address two of our cross-cutting concerns (storage abstraction; inter-surface messaging). On CRXJS we would write these by hand.
2. File-based manifest generation removes a maintenance surface unrelated to the actual problem.
3. First-class Edge support out of the box matches the PRD's primary browser matrix (Chrome + Edge).
4. React keeps us aligned with the broader Chrome extension ecosystem precedent (jira-assistant uses React).
5. Lower setup friction = faster path to internal v1.0; the team is small and one extension is the only product.

**Initialization Command:**

```bash
pnpm dlx wxt@latest init jira-time-logger
# When prompted: select "react" template; TypeScript is default
cd jira-time-logger
pnpm install
pnpm dev    # opens Chrome with extension installed, HMR on
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript (default, strict mode in `tsconfig.json`)
- ESM modules
- Service worker for background, not background page (MV3 mandate)

**Build Tooling:**
- Vite (production-grade bundler, fast dev server with HMR)
- WXT CLI for `dev`, `build`, `zip` (produces ready-to-distribute packed extension), `submit` (we won't use — not publishing)
- Output: per-browser zip in `.output/` ready for sideloading or distribution via Microsoft Teams (per PRD distribution model)

**Project Layout (file-based, established by WXT convention):**

```
jira-time-logger/
├── wxt.config.ts           # WXT configuration; manifest derived
├── entrypoints/            # All runtime surfaces here
│   ├── background.ts       # Service worker
│   ├── popup/              # Toolbar popup (React)
│   ├── content.ts          # Inline Jira banner
│   ├── options/            # Options page (React)
├── components/             # Shared React components
├── lib/                    # Cross-cutting modules (Jira client,
│                           #   storage, messaging, scheduler, parser)
├── public/                 # Static assets
└── package.json
```

**Storage:**
- WXT's `storage.defineItem<T>('local:key', { defaultValue, ... })` for typed `chrome.storage.local` access
- WXT's `storage.defineItem<T>('session:key', ...)` for `chrome.storage.session`
- Our cross-cutting "Storage abstraction" concern is addressed by using WXT's storage helpers as the single layer plus a quota-check wrapper (~30 LOC of our own code)

**Messaging:**
- WXT's typed messaging utilities for popup ↔ service worker ↔ content script ↔ options
- Tagged-union message types (PRD requirement) implemented via WXT's `defineMessage<Schema>` pattern

**Browser Targets (built-in, single config):**
- Chrome (primary)
- Edge (primary; via Chromium)
- Firefox (out of scope for v1.0; WXT supports it for free if we later choose to add)

**Testing Framework:**
- Vitest (Vite-native, fast) — recommended for unit tests of cross-cutting modules (parser, scheduler, storage)
- Playwright for E2E if needed (deferred — manual testing is fine for v1.0 internal release)

**Linting / Formatting:**
- WXT default scaffolds ESLint + Prettier
- Recommend turning on `@typescript-eslint/strict` rule set

**Package Manager:** `pnpm`

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Already Locked (PRD constraints + Starter):**

| Decision | Source | Value |
|---|---|---|
| Manifest version | PRD | MV3 |
| Browser targets | PRD | Chrome + Edge primary; Firefox deferred |
| Auth | PRD | OAuth 2.0 (3LO + PKCE) via `chrome.identity.launchWebAuthFlow` |
| Token storage | PRD | `chrome.storage.local` (durable) + `chrome.storage.session` (mutex) |
| Approval state location | PRD | Versioned comments on Jira Epics, scoped per `(user, cycle)` |
| Worklog logging level | PRD | Subtask only |
| Catch-all model | PRD | Configurable Jira project (default `KNP`), shared subtasks |
| Distribution | PRD | Sideloaded `.crx` via Microsoft Teams |
| Language | Starter | TypeScript (strict) |
| UI framework | Starter | React 18+ |
| Build tool | Starter | Vite (via WXT) |
| Storage abstraction | Starter | WXT `storage.defineItem` |
| Inter-surface messaging | Starter | WXT typed messaging utilities |
| Package manager | User | `pnpm` |

**Critical Decisions (made this step):**

- Server-state caching → TanStack Query v5
- Schema validation → Zod v3
- UI / styling → Tailwind CSS v4 + shadcn/ui (copy-paste components on Radix primitives)
- Routing → No router; discriminated-union view state in popup
- Date / time → date-fns v4
- Error discipline → `Result<T, E>` discriminated union at I/O boundary; throw/catch elsewhere
- Logging → In-house console logger with verbosity levels (no third-party telemetry per NFR9)
- Testing → Vitest unit tests for cross-cutting modules; E2E deferred

### Data Architecture

**Server-state caching: TanStack Query v5**

All Jira API reads flow through TanStack Query. Configuration:

- `queryFn` calls our `jira-client` wrapper, which goes through the token-bucket scheduler
- `retry` callback respects `Retry-After` headers from rate-limited responses
- `staleTime` set per query type: 5 min for hierarchy walk; 1 min for current week; **infinite for closed cycles** (immutable data)
- `select` projection for view-specific shapes
- Per-query progressive render via per-row queries in the manager matrix (each row is its own query, renders independently)

**Schema validation: Zod v3**

Three enforcement points:

1. **Approval-comment parser** (`lib/comment-schema.ts`) — fail-closed parsing of versioned comment bodies via `z.discriminatedUnion('v', [v1Schema, v2Schema, ...])`. Schema is the contract between extension versions.
2. **Jira API responses** — defensive parsing inside `jira-client`; Zod errors map to `Result.kind: 'parse-error'`.
3. **Inter-surface messages** — WXT's `defineMessage` accepts a Zod schema; sender and receiver share strict types.

**Caching topology:**

- Live data (current cycle, current week) → TanStack Query memory cache, refetched on focus
- Closed-cycle data → cached in `chrome.storage.local` with TTL eviction (quota-managed); reads come from storage cache first, network only on miss
- Outbox (pending worklog writes) → persistent in `chrome.storage.local`, retried by service worker on connectivity recovery

### Authentication & Security

(All inherited from PRD — OAuth 2.0 + PKCE via `chrome.identity.launchWebAuthFlow`; tokens in `chrome.storage.local`; refresh via `chrome.alarms`; mutex via `chrome.storage.session`. Specific token-refresh state machine and concurrency contract are detailed in the **Implementation Patterns** section.)

### API & Communication Patterns

**Outbound (extension → Jira):** all HTTP through `lib/jira-client.ts`. Single wrapper module owns:

- OAuth header injection
- Token refresh trigger on 401
- Request scheduling via token-bucket scheduler
- Zod response parsing
- Result-type return (`Ok<T>` or one of: `RateLimited`, `AuthExpired`, `Network`, `ParseError`, `Forbidden`, `NotFound`)

**Inter-surface (within extension):** typed message bus via WXT's `defineMessage`. Each message type has a Zod schema. Tagged union covers all known message kinds.

| Message kind | Direction | Schema |
|---|---|---|
| `refresh-badge` | Popup → SW | `{ }` |
| `current-week` | Popup → SW | `{ weekOf: ISODate }` |
| `manager-matrix-row` | Popup → SW | `{ userAccountId: string, cycle: CycleId }` |
| `log-worklog` | Popup/Banner → SW | `{ issueKey, hours, started, comment? }` |
| `approve-cycle` | Popup → SW | `{ userAccountId, cycle }` |
| `badge-update` | SW → Popup (broadcast) | `{ hoursMissing: number }` |
| `banner-state` | SW → Content script | `{ hoursMissing: number, currentTicket?: string }` |
| `dismiss-banner-today` | Content script → SW | `{ }` |

**Error handling:** `Result<T, JiraError>` returned from `jira-client`. Consumers (TanStack Query callbacks, popup logic) dispatch on the `kind` field explicitly. UI components throw/catch ordinarily; only the I/O boundary uses `Result`.

### Frontend Architecture

**State management:**

- **Server state:** TanStack Query (with WXT storage as durable cache backing for closed cycles)
- **Local UI state:** React `useState` / `useReducer` per component
- **Cross-component shared state:** React Context for things like current view (`worker` vs `manager`), settings snapshot
- **No Redux, Zustand, or other global store** — popup TTI budget (NFR1) and dual-persona role-switching are both better served by simple state + Context

**View routing (popup):**

```ts
type PopupView =
  | { kind: 'today' }
  | { kind: 'week', weekOf: ISODate }
  | { kind: 'manager-matrix', cycle: CycleId }
  | { kind: 'manager-drill-down', userAccountId: string, epicKey: string, cycle: CycleId };
```

State is stored in `chrome.storage.local` so re-opening popup restores the last view. Manager-mode toggle is a separate boolean in the same setting object.

**Component architecture (shadcn/ui + Tailwind):**

- shadcn/ui components live under `components/ui/` (copy-pasted from shadcn CLI)
- Domain components under `components/` (e.g., `WeeklyGrid`, `ManagerMatrix`, `TicketPicker`)
- All Tailwind classes; no inline styles in popup/options (only allowed in the content-script banner due to CSP)

### Infrastructure & Deployment

**No infrastructure** — the extension is self-contained and serverless. Deployment is:

1. `pnpm build` → produces `.output/chrome-mv3.zip` and `.output/edge-mv3.zip`
2. Convert zip to `.crx` via Chrome's `--pack-extension` flag (one-line script in `package.json`)
3. Post `.crx` to the Microsoft Teams channel; team members reinstall

**No CI/CD pipeline for v1.0.** A single `pnpm test && pnpm build` ahead of any release post is sufficient. If the team grows or release cadence increases, a GitHub Actions workflow can be added later.

**Environment configuration:**

- `wxt.config.ts` carries the Atlassian OAuth client ID (registered once in Atlassian Developer Console; this is a public identifier, not a secret)
- No environment-specific builds; one extension binary works for any Jira Cloud site (the user picks at first-run via `accessible-resources`)

### Decision Impact Analysis

**Implementation Sequence:**

1. **Foundation modules** (cross-cutting): `lib/log.ts`, `lib/result.ts`, `lib/storage/` (with WXT helpers + quota wrapper)
2. **Comment schema parser** (`lib/comment-schema.ts`) with Zod + Vitest tests
3. **Token-bucket scheduler** (`lib/scheduler.ts`) with Vitest tests
4. **OAuth flow + token lifecycle** (`lib/oauth/`) — auth on first connect, refresh state machine, mutex via `chrome.storage.session`
5. **Jira client wrapper** (`lib/jira-client.ts`) — uses scheduler, returns `Result<T>`, parses with Zod
6. **Hierarchy-walk query** (`lib/hierarchy.ts`) — task/subtask discovery from manager + skip-level
7. **Worklog outbox** (`lib/outbox.ts`) — pending writes persistence, retry on connectivity
8. **Service worker entry** (`entrypoints/background.ts`) — wires scheduler, OAuth, alarms (badge, refresh), notifications
9. **Popup shell** (`entrypoints/popup/`) — view-state machine, TanStack Query setup, Tailwind config
10. **Today view** (logging surface) — pre-fill picker, quick-log, PTO popover
11. **Weekly grid** — 7-day grid, click-cell-header popover for PTO, mark-as-done
12. **Manager matrix** — progressive row render, drill-down panel, approve action with fan-out
13. **Content script** (`entrypoints/content.ts`) — banner injection, SPA re-injection, contextual quick-log
14. **Options page** (`entrypoints/options/`) — settings form, manager auto-detection, catch-all project picker
15. **Polish** — accessibility audit, Edge validation, copy review

**Cross-Component Dependencies:**

- All UI surfaces depend on `jira-client`, which depends on `scheduler`, which depends on `oauth`
- Comment parser is read by both worker view (own approval status) and manager view (drill-down + approve)
- Outbox is owned by service worker but consumed by popup-side UI for "pending worklog" indicators
- Hierarchy walk is read by Today view (pre-fill picker) and indirectly by Manager view (resolving display names)

## Implementation Patterns & Consistency Rules

These patterns prevent contributors (human or AI agent) from making divergent choices that collectively erode the codebase. They are deliberately concrete: each pattern names the rule, the rationale, and a good/bad example where useful.

### N/A categories (don't define patterns we don't need)

- **Database naming** — N/A. Jira is the data store; we never own a database.
- **API endpoint naming** — N/A. Jira defines its REST endpoints; we consume them.
- **Event system naming** — partially N/A. Inter-surface messages are defined by Zod schemas (decision in Step 4); see "Message bus" below.

### Naming Patterns

**File names:** `kebab-case.ts` for non-component files; `PascalCase.tsx` for React component files.

- ✅ `lib/comment-schema.ts`, `lib/jira-client.ts`, `components/WeeklyGrid.tsx`
- ❌ `lib/CommentSchema.ts`, `components/weekly-grid.tsx`

**Folders:** `kebab-case/`. Avoid acronyms unless standard.

- ✅ `entrypoints/`, `lib/oauth/`, `components/ui/`
- ❌ `OAuthLib/`, `Components/`

**TypeScript identifiers:**

- Types and interfaces: `PascalCase` (`type WorklogEntry`, `interface JiraClient`)
- Functions and variables: `camelCase` (`fetchWorklogs`, `currentCycle`)
- Constants: `SCREAMING_SNAKE_CASE` for module-level, `camelCase` for local
- React components: `PascalCase` (`function ManagerMatrix()`)
- React hooks: `use` + `PascalCase` (`useCurrentCycle`, `useTokenBucket`)
- Zod schemas: suffix `Schema` (`WorklogSchema`, `ApprovalCommentV1Schema`)
- Inferred types from Zod: same name without `Schema` suffix (`type Worklog = z.infer<typeof WorklogSchema>`)

**Boolean naming:** prefix with `is` / `has` / `should` / `can`.

- ✅ `isApproved`, `hasGap`, `shouldRefresh`, `canApprove`
- ❌ `approved`, `gap`, `refresh` (when used as a boolean)

**Async function naming:** unprefixed (no `Async` suffix). The `Promise<T>` return type is the contract.

- ✅ `fetchWorklogs(): Promise<Result<Worklog[], JiraError>>`
- ❌ `fetchWorklogsAsync()`

### Import & Module Patterns

**Imports use named exports, not defaults.** Default exports lead to inconsistent local naming across files.

- ✅ `export function jiraClient(...)` and `import { jiraClient } from '@/lib/jira-client'`
- ❌ `export default jiraClient`

**No barrel files (`index.ts` re-exports) for `lib/` modules.** They hide dependencies, hurt tree-shaking, and confuse downstream agents/devs about where things actually live.

- ✅ `import { TokenBucketScheduler } from '@/lib/scheduler'`
- ❌ `import { TokenBucketScheduler } from '@/lib'`
- *Exception:* `components/ui/index.ts` from shadcn/ui is acceptable as it's the convention shadcn ships.

**Import order (enforced by ESLint):**

1. Node built-ins (rare in extension code)
2. External packages (`react`, `@tanstack/react-query`, etc.)
3. WXT / browser API imports (`wxt/storage`, `webextension-polyfill`)
4. Internal absolute imports (`@/lib/...`, `@/components/...`)
5. Relative imports (`./helpers`)

**Path alias:** `@/` resolves to project root. Use `@/lib/...` not `../../../lib/...`.

### Structure Patterns

**Tests are co-located** as `*.test.ts` next to the source file.

- ✅ `lib/comment-schema.ts` and `lib/comment-schema.test.ts`
- ❌ `tests/lib/comment-schema.test.ts`
- *Rationale:* Test discoverability + refactoring is easier when files travel together.

**One responsibility per module.** A file does one thing; if a file is approaching 300 lines, it likely needs splitting.

**Cross-cutting modules live in `lib/`** with one folder per concern. View-specific code lives under the `entrypoints/<surface>/` folder.

### Format Patterns

**Date / time:**

- All dates passed *between* modules, *to* Jira, and *from* Jira are ISO-8601 strings (`'2026-05-10T14:30:00.000Z'` or `'2026-05-10'`)
- `Date` objects exist only inside business logic (date-fns operations)
- Type aliases distinguish: `type ISODate = string` (date only), `type ISODateTime = string` (full timestamp)
- Display formatting happens *only* in render-layer code (components), never in domain logic

**Hours:**

- Stored and passed as **seconds** when interfacing with Jira (Jira's worklog API uses `timeSpentSeconds`)
- Converted to **decimal hours** for display (`2.5h`, not `2h 30m` in v1.0)
- One conversion utility (`secondsToHours`, `hoursToSeconds`); do not inline `* 3600` anywhere

**JSON serialization:**

- camelCase keys throughout (Jira's API also uses camelCase, no conversion needed)
- Never wrap responses in `{ data: ..., error: ... }` envelopes — use the `Result<T, E>` type instead

### Communication Patterns

**Message bus (inter-surface):**

- Each message kind defined once in `lib/messages.ts` via `defineMessage<Schema>(name, schema)`
- Naming: kebab-case verb-noun (`refresh-badge`, `log-worklog`, `approve-cycle`, `dismiss-banner-today`)
- Payloads always validated by Zod on receive (WXT does this when schema is provided)
- Request/response messages return `Result<T, E>`; fire-and-forget return `void`
- No global event bus — messages are explicit point-to-point via WXT

**State update patterns:**

- React state is always immutable (use spread / `produce` from immer if depth is heavy; immer not added unless needed)
- Server state goes through TanStack Query — never copy server data into local React state
- Settings updates flow: UI → message → service worker writes to `chrome.storage.local` → storage change event → all surfaces re-read via WXT's `watch()` API

### Process Patterns

**Error handling:**

- I/O boundary (`jira-client`, OAuth refresh, storage writes) returns `Result<T, E>` discriminated union
- UI components throw / catch ordinary `Error`s; React Error Boundaries handle uncaught
- Never swallow an error silently. Either:
  - Return it (`Result.kind: 'error'`)
  - Log it via `log.error(...)` with structured payload
  - Show it to the user via a toast or inline error UI
- Errors shown to the user are **never raw exception messages**. They are pre-written, friendly strings keyed off the error kind.

**Loading state:**

- TanStack Query's `isLoading` / `isFetching` / `isError` are the source of truth for server-state load status
- UI shows a skeleton (not a spinner) for the manager matrix and weekly grid (progressive render NFR2)
- Spinners used only for short-lived transient operations (e.g., a worklog post)

**Retry:**

- Network retries handled by TanStack Query's `retry` callback
- Retry-After respected unconditionally (no override)
- Maximum 3 retries on a single user-initiated action; further failures surface to the user

**Logging:**

- Use `log.<level>(eventName, payload)` from `lib/log.ts`
- `eventName` is a stable string in `noun.verb` form (`worklog.posted`, `auth.refresh.failed`)
- `payload` is a flat object; no PII (no token contents, no email bodies)
- Verbosity levels: `debug` (off by default in production builds), `info` (key user-facing actions), `warn` (recoverable issues), `error` (failures shown or dropped)

### TypeScript Style

- `tsconfig.json` enables `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- Prefer `type` over `interface` for type aliases (consistent across codebase). Use `interface` only for declaration merging needs.
- No `any`. If genuinely unknown, use `unknown` and narrow.
- No `as` type assertions except when narrowing after a runtime check the type system can't see (rare; always commented).
- Discriminated unions over enums (smaller, more pattern-match-friendly)

### Enforcement Guidelines

**All contributors (human or AI agent) MUST:**

1. Run `pnpm lint` before submitting changes; ESLint enforces import order, naming via `@typescript-eslint/naming-convention`, no `any`, no default exports
2. Run `pnpm test` before submitting changes; new modules in `lib/` require co-located unit tests
3. Use the `Result` type at the I/O boundary; ESLint custom rule forbids returning a raw `Promise<T>` from `jira-client.ts`
4. Use the `log.<level>` helpers; ESLint custom rule forbids direct `console.log` (only allowed in test files)
5. Pass dates as ISO strings between modules; ESLint custom rule warns on `Date` parameter types in cross-module function signatures

**Pattern violations** are discussed in PR review (or the AI agent's self-review) and either fixed or explicitly justified. Update this section if a pattern is found to be wrong.

### Pattern Examples

**✅ Good — fetching worklogs:**

```ts
// lib/jira-client.ts
export async function fetchWorklogs(
  issueKey: string
): Promise<Result<Worklog[], JiraError>> {
  return scheduler.acquire(async () => {
    const res = await fetch(`/rest/api/3/issue/${issueKey}/worklog`, {
      headers: await authHeaders(),
    });
    if (res.status === 429) {
      return { kind: 'rate-limited', retryAfterMs: parseRetryAfter(res) };
    }
    const json = await res.json();
    const parsed = WorklogListSchema.safeParse(json);
    if (!parsed.success) {
      log.error('jira.parse.worklog', { issueKey, issue: parsed.error.issues[0] });
      return { kind: 'parse-error', issue: parsed.error.issues[0] };
    }
    return { kind: 'ok', value: parsed.data };
  });
}
```

**❌ Bad — same flow, anti-pattern:**

```ts
// don't do this
export async function fetchWorklogsAsync(issueKey: any) {
  try {
    const res = await fetch(`/rest/api/3/issue/${issueKey}/worklog`);
    return (await res.json()).worklogs;
  } catch (e) {
    console.log('error', e);
    return null;
  }
}
```

Issues: `Async` suffix, `any` parameter, no schema validation, raw `console.log`, swallowed error returned as `null` (caller can't distinguish "no worklogs" from "fetch failed").

## Project Structure & Boundaries

### Complete Project Directory Structure

```
jira-time-logger/
├── README.md                       # Install instructions, settings reference, top-3 troubleshooting
├── PROTOCOL.md                     # Approval-comment schema spec, dirty-detection rules, parser contract
├── package.json
├── pnpm-lock.yaml
├── wxt.config.ts                   # WXT config: manifest, browser targets, build output
├── tsconfig.json                   # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
├── tailwind.config.ts
├── postcss.config.cjs
├── eslint.config.js                # Naming rules, import order, no-default-exports, custom Result/log rules
├── .prettierrc
├── .gitignore                      # excludes .output/, node_modules/
├── .vscode/
│   └── settings.json               # Editor formatter, import sorter
├── components.json                 # shadcn/ui CLI config
│
├── public/                         # Static assets bundled into extension
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
│
├── entrypoints/                    # All runtime surfaces — WXT convention
│   ├── background.ts               # Service worker (FR4, FR15-16, FR43, NFR5, NFR15)
│   │                               #   - OAuth refresh alarm
│   │                               #   - Badge update alarm (FR15)
│   │                               #   - Daily push notification (FR16)
│   │                               #   - Outbox retry alarm (FR43)
│   │                               #   - Owns the scheduler instance
│   │                               #   - Routes inter-surface messages
│   ├── popup/
│   │   ├── index.html              # WXT-required popup html shell
│   │   ├── main.tsx                # React mount + TanStack Query provider + Error boundary
│   │   ├── App.tsx                 # Top-level view router (discriminated union)
│   │   └── style.css               # Tailwind import
│   ├── options/
│   │   ├── index.html              # WXT-required options html shell
│   │   ├── main.tsx                # React mount + TanStack Query provider
│   │   ├── App.tsx                 # Settings form (FR43-46, FR47-52)
│   │   └── style.css               # Tailwind import
│   └── content.ts                  # Inline Jira banner (FR16-19, NFR11)
│                                   #   - SPA-aware (popstate + MutationObserver)
│                                   #   - Inline styles only (CSP-safe)
│                                   #   - Daily-dismiss state via storage
│                                   #   - Contextual quick-log when on subtask page
│
├── components/                     # React components (PascalCase.tsx)
│   ├── ui/                         # shadcn/ui copy-pasted primitives
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── popover.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── toast.tsx
│   │   └── tooltip.tsx
│   │
│   ├── today/                      # Today view (FR6-14)
│   │   ├── TodayView.tsx
│   │   ├── QuickLogForm.tsx        # Pick subtask + hours + post (FR6, FR7, FR12)
│   │   ├── TicketPicker.tsx        # 2-level browse tree (FR8, FR9)
│   │   ├── CatchAllPicker.tsx      # KNP project tasks (FR10)
│   │   └── PtoQuickAction.tsx      # One-click PTO (FR11)
│   │
│   ├── week/                       # Weekly Review view (FR20-26)
│   │   ├── WeekView.tsx
│   │   ├── WeeklyGrid.tsx          # 7-day grid with rows = subtasks (FR20)
│   │   ├── DayCellHeader.tsx       # Click target for PTO popover (FR23)
│   │   ├── DayCell.tsx             # Per-day editable cell (FR21, FR22)
│   │   ├── PtoPopover.tsx          # Full/half-day PTO action (FR23)
│   │   ├── MarkAsDoneButton.tsx    # Local-only mark-as-done (FR24, FR26)
│   │   └── GapAcknowledgmentDialog.tsx  # Pre-mark-as-done warning (FR25)
│   │
│   ├── manager/                    # Manager view (FR27-37)
│   │   ├── ManagerView.tsx
│   │   ├── ManagerMatrix.tsx       # Person × Epic grid, progressive render (FR28-30)
│   │   ├── MatrixCell.tsx          # Cell with color coding (FR30)
│   │   ├── DrillDownPanel.tsx      # Per-ticket evidence (FR31)
│   │   ├── ApproveButton.tsx       # Cycle approve action (FR32-33)
│   │   ├── ReApproveButton.tsx     # Re-approve dirty cycles (FR37)
│   │   ├── VisibilityWarning.tsx   # Restricted worklogs warning (FR34-35)
│   │   └── ApproveDisabledTooltip.tsx  # For non-canonical managers (FR36)
│   │
│   ├── settings/                   # Options page (FR47-52)
│   │   ├── SettingsForm.tsx
│   │   ├── ManagerDisplay.tsx      # Read-only show of Jira-derived manager (FR44-46)
│   │   ├── CatchAllProjectField.tsx # Default KNP (FR47)
│   │   ├── PtoSubtaskField.tsx     # PTO subtask within catch-all (FR48)
│   │   ├── ReminderTimeField.tsx   # Daily push notification time (FR49)
│   │   ├── TargetHoursField.tsx    # Default 8 (FR50)
│   │   ├── CycleField.tsx          # Default monthly (FR51)
│   │   ├── DiagnosticsBlock.tsx    # Last-sync, storage usage (FR52)
│   │   ├── DisconnectAction.tsx    # Clear all local data (FR5)
│   │   └── ConnectButton.tsx       # OAuth connect (FR1, FR2)
│   │
│   └── shared/
│       ├── ErrorBoundary.tsx       # React error boundary (Process Patterns)
│       ├── ErrorState.tsx          # User-facing error UI (NFR6, NFR17)
│       ├── LoadingSkeleton.tsx     # Skeleton loading (NFR2)
│       ├── DirtyIndicator.tsx      # Re-approval-needed badge (FR37, FR39)
│       └── ModeToggle.tsx          # Worker ↔ Manager mode switch
│
├── hooks/                          # React hooks (use{PascalCase}.ts)
│   ├── useSettings.ts              # Reactive settings via WXT storage.watch
│   ├── useCurrentCycle.ts          # Cycle math from settings + today
│   ├── useCurrentWeek.ts           # Week boundary math
│   ├── useHierarchyTickets.ts      # TanStack Query for FR8 hierarchy walk
│   ├── useWorklogs.ts              # TanStack Query for current week worklogs
│   ├── useManagerReports.ts        # Manager's direct reports (resolved from Jira manager field)
│   ├── useManagerMatrix.ts         # TanStack Query for matrix data, per-row queries
│   ├── useApprovalStatus.ts        # Per (user, cycle) approval state
│   ├── useDirtyStatus.ts           # Per (user, cycle) dirty detection
│   ├── useViewState.ts             # Popup view-state machine (persistent)
│   └── useCanApprove.ts            # FR36 — canonical manager check
│
├── lib/                            # Cross-cutting modules (kebab-case.ts)
│   │
│   ├── jira-client.ts              # ALL Jira API calls — Result<T> return
│   ├── jira-client.test.ts
│   ├── jira-types.ts               # Zod schemas for Jira API responses
│   ├── jira-types.test.ts
│   │
│   ├── scheduler.ts                # Token-bucket rate-limit scheduler
│   ├── scheduler.test.ts           # Includes Retry-After honor tests
│   │
│   ├── oauth/
│   │   ├── flow.ts                 # launchWebAuthFlow + PKCE + accessible-resources
│   │   ├── flow.test.ts
│   │   ├── refresh.ts              # Refresh state machine + chrome.alarms scheduling
│   │   ├── refresh.test.ts
│   │   └── pkce.ts                 # PKCE code_verifier + code_challenge generation
│   │
│   ├── storage/                    # Strict layer over WXT storage helpers
│   │   ├── tokens.ts               # storage.defineItem<TokenBundle>
│   │   ├── settings.ts             # storage.defineItem<Settings>
│   │   ├── view-state.ts           # storage.defineItem<PopupView>
│   │   ├── banner-dismiss.ts       # storage.defineItem<DateString[]>
│   │   ├── refresh-mutex.ts        # session-scoped refreshInFlight flag
│   │   ├── cache.ts                # Cycle/week cache with TTL
│   │   ├── cache.test.ts
│   │   ├── outbox.ts               # Pending worklog writes queue (FR43)
│   │   ├── outbox.test.ts
│   │   └── quota.ts                # Quota check + eviction
│   │
│   ├── comment-schema.ts           # Zod discriminatedUnion('v', [...]) for approval comments
│   ├── comment-schema.test.ts      # Table-driven fail-closed tests (NFR7)
│   ├── parser.ts                   # Find + parse approval comments on Epic
│   ├── parser.test.ts              # Includes "newest wins per (user, cycle)" tests
│   ├── checksum.ts                 # Comment body checksum
│   ├── checksum.test.ts
│   │
│   ├── approval.ts                 # Approve cycle action — fan-out comment poster (FR32-33)
│   ├── approval.test.ts
│   ├── dirty-detect.ts             # Per (user, cycle) dirty detection (FR39)
│   ├── dirty-detect.test.ts
│   │
│   ├── hierarchy.ts                # Manager + skip-level task discovery (FR8)
│   ├── hierarchy.test.ts
│   ├── manager-resolution.ts       # Read manager from Jira user-directory field (FR44-46)
│   ├── manager-resolution.test.ts
│   │
│   ├── badge.ts                    # Badge counter computation (FR15)
│   ├── badge.test.ts
│   │
│   ├── pto.ts                      # PTO subtask logging helpers (FR11)
│   ├── time.ts                     # date-fns helpers; week/cycle boundaries
│   ├── time.test.ts
│   ├── hours.ts                    # secondsToHours / hoursToSeconds (Format Patterns)
│   ├── hours.test.ts
│   │
│   ├── messages.ts                 # WXT defineMessage<Zod> registry (Communication Patterns)
│   ├── result.ts                   # Result<T, E> discriminated union
│   ├── result.test.ts
│   ├── log.ts                      # Console logger with levels (no telemetry — NFR9)
│   └── env.ts                      # Atlassian OAuth client ID, scopes constants
│
├── styles/
│   └── globals.css                 # Tailwind base + custom CSS vars
│
└── .output/                        # WXT build output (gitignored)
    ├── chrome-mv3/                 # Unpacked extension for dev/sideload
    ├── chrome-mv3.zip              # Distributable to Microsoft Teams (Chrome)
    ├── edge-mv3/
    └── edge-mv3.zip                # Distributable to Microsoft Teams (Edge)
```

### Architectural Boundaries

**Surface boundaries (no shared in-memory state):**

```
┌────────────────────────────────────────────────────────────┐
│ entrypoints/background.ts (Service Worker)                 │
│   • Owns scheduler, OAuth refresh, alarms, notifications   │
│   • Routes all inter-surface messages                      │
│   • Reads/writes chrome.storage.local + .session           │
│   • Wakes on: alarm, message, notification click, install  │
└────────────────────┬───────────────────────────────────────┘
                     │ (WXT typed messages)
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
┌──────────┐  ┌────────────┐  ┌──────────────────┐
│ Popup    │  │ Options    │  │ Content Script   │
│ (React)  │  │ (React)    │  │ (vanilla DOM)    │
│          │  │            │  │ on *.atlassian.  │
│ TanStack │  │ Form-only  │  │   net pages      │
│ Query    │  │ TanStack   │  │ Inline styles    │
│ proxies  │  │ Query for  │  │ only (CSP-safe)  │
│ all I/O  │  │ user dir   │  │                  │
│ via SW   │  │ search     │  │ MutationObserver │
└──────────┘  └────────────┘  └──────────────────┘
```

**API boundaries (single point of contact with Jira):**

```
React UI / Service Worker tasks
         │
         ▼
   useQuery / useMutation        (TanStack Query layer)
         │
         ▼
   lib/jira-client.ts            (Wrapper — Result<T> return)
         │
         ▼
   lib/scheduler.ts              (Token-bucket gating)
         │
         ▼
   fetch(...)                    (with OAuth header)
         │
         ▼
   Jira Cloud REST API
         │
         ▼
   Zod parse via lib/jira-types.ts
         │
         ▼
   Result<T, JiraError>
```

**Data boundaries:**

| Data class | Lives in | Lifecycle |
|---|---|---|
| OAuth tokens | `chrome.storage.local` (via `lib/storage/tokens.ts`) | Persistent until disconnect (FR3, FR5) |
| Settings | `chrome.storage.local` (via `lib/storage/settings.ts`) | Persistent until disconnect |
| Popup view state | `chrome.storage.local` (via `lib/storage/view-state.ts`) | Persistent across opens |
| Banner dismissals | `chrome.storage.local` (via `lib/storage/banner-dismiss.ts`) | Cleared next day (date-keyed) |
| Refresh-in-flight mutex | `chrome.storage.session` (via `lib/storage/refresh-mutex.ts`) | Cleared on browser close |
| Closed-cycle worklog cache | `chrome.storage.local` (via `lib/storage/cache.ts`) | TTL eviction, quota-managed |
| Pending worklog outbox | `chrome.storage.local` (via `lib/storage/outbox.ts`) | Cleared on successful send |
| Live data (current cycle/week) | TanStack Query memory | Cleared on popup close |

### Requirements to Structure Mapping

**FR Capability Area → Files:**

| Capability Area | Files / Folders |
|---|---|
| **Authentication & Connection** (FR1-5) | `lib/oauth/*`, `lib/storage/tokens.ts`, `entrypoints/background.ts` (refresh alarm), `components/settings/ConnectButton.tsx`, `components/settings/DisconnectAction.tsx` |
| **Time Logging** (FR6-14) | `components/today/*`, `lib/jira-client.ts` (worklog post/edit/delete), `lib/storage/outbox.ts`, `entrypoints/content.ts` (FR14 contextual log) |
| **Daily Awareness & Reminders** (FR15-19) | `entrypoints/background.ts` (badge alarm, daily push), `lib/badge.ts`, `entrypoints/content.ts` (banner FR16-18), `lib/storage/banner-dismiss.ts` |
| **Weekly Review & Mark-as-Done** (FR20-26) | `components/week/*`, `lib/storage/view-state.ts` (mark-as-done flag) |
| **Manager Approval** (FR27-37) | `components/manager/*`, `hooks/useManagerMatrix.ts`, `hooks/useCanApprove.ts`, `lib/approval.ts`, `lib/dirty-detect.ts`, `lib/parser.ts` |
| **Audit & Data Integrity** (FR38-43) | `lib/comment-schema.ts`, `lib/parser.ts`, `lib/checksum.ts`, `lib/storage/outbox.ts`, `components/shared/ErrorState.tsx` |
| **Settings & Configuration** (FR44-52) | `entrypoints/options/*`, `components/settings/*`, `lib/manager-resolution.ts`, `lib/storage/settings.ts`, `hooks/useSettings.ts` |

**Cross-cutting concerns → Locations:**

| Concern | Owner |
|---|---|
| Token lifecycle | `lib/oauth/refresh.ts` + `lib/storage/tokens.ts` + `lib/storage/refresh-mutex.ts` |
| Rate-limit governance | `lib/scheduler.ts` (singleton in service worker) |
| Approval-comment protocol | `lib/comment-schema.ts` + `lib/parser.ts` + `lib/checksum.ts` (PROTOCOL.md is the spec) |
| Inter-surface messaging | `lib/messages.ts` + WXT `defineMessage` |
| Storage abstraction | `lib/storage/*` (one file per data class) + `lib/storage/quota.ts` |
| Error surfacing | `lib/result.ts` + `components/shared/ErrorBoundary.tsx` + `components/shared/ErrorState.tsx` |
| Logging / diagnostics | `lib/log.ts` |
| Schema migration | `lib/comment-schema.ts` (`z.discriminatedUnion('v', [v1, v2, ...])`) |
| Accessibility | shadcn/ui primitives in `components/ui/` (Radix-based); ESLint a11y rules |

### Integration Points

**External integrations:** ONE — Atlassian Cloud (Jira REST API + OAuth at `auth.atlassian.com` / `api.atlassian.com`).

**Inter-surface communication:** all via WXT typed messages defined in `lib/messages.ts`. No global event bus, no shared in-memory state.

**Data flow — User logs a worklog from popup:**

```
User clicks "Log" in TicketPicker
  → useMutation in QuickLogForm
  → message: 'log-worklog' to service worker
  → background.ts: scheduler.acquire()
  → jira-client.postWorklog(...)
  → POST /rest/api/3/issue/{key}/worklog
  → Result<Worklog, JiraError> returned
  → on success: TanStack Query cache invalidated (useWorklogs, useBadge)
  → message: 'badge-update' broadcast → content script + popup re-render
  → on rate-limited or network error: outbox enqueue + chrome.alarm to retry
```

**Data flow — Manager approves a cycle:**

```
Manager clicks "Approve [Person]'s [Cycle]" in ApproveButton
  → useMutation in ApproveButton
  → message: 'approve-cycle' to service worker
  → background.ts: lib/approval.approveCycle(userAccountId, cycle)
  →   → fetch all worklogs by user in cycle (cached or fresh)
  →   → group by Epic → list of Epics that received hours
  →   → for each Epic (sequentially through scheduler):
  →       lib/comment-schema.serializeApproval(v=1, user, cycle, by, checksum)
  →       jira-client.postComment(epicKey, body)
  → Result<ApprovalRecord, JiraError> returned
  → on success: TanStack Query invalidates approval queries
  → matrix re-renders cell as approved (dark green)
```

### File Organization Patterns

**Configuration files** at root (`wxt.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `eslint.config.js`, `.prettierrc`, `components.json`).

**Source organization by surface and concern:**

- `entrypoints/` = surfaces (one folder per popup/options; one file for background and content)
- `components/` = React components, grouped by view (today/, week/, manager/, settings/, shared/) plus `ui/` for shadcn primitives
- `hooks/` = React hooks (one file per hook)
- `lib/` = framework-agnostic modules (no React imports), grouped by concern
- `styles/` = global CSS only

**Test organization** = co-located `*.test.ts` next to source. Vitest auto-discovers via glob.

**Asset organization** = `public/` for icons (auto-bundled by WXT into manifest).

### Development Workflow Integration

**Development server:**

```bash
pnpm dev                    # WXT starts Vite dev server, opens Chrome with extension installed, HMR enabled
pnpm dev --browser edge     # Same for Edge
```

**Build process:**

```bash
pnpm build                  # WXT produces .output/chrome-mv3/ and .output/chrome-mv3.zip
pnpm build --browser edge   # Same for Edge
pnpm zip                    # Convenience: build + zip all targets
```

**Testing:**

```bash
pnpm test                   # Vitest runs all *.test.ts (watch mode by default)
pnpm test --run             # Single run
pnpm test:coverage          # Vitest coverage report
```

**Linting / formatting:**

```bash
pnpm lint                   # ESLint
pnpm lint --fix             # Auto-fix
pnpm format                 # Prettier
```

**Distribution:**

```bash
pnpm pack:crx               # Custom script: convert .zip to .crx using local Chrome's --pack-extension
                            # (script in package.json scripts)
                            # Output: jira-time-logger.crx + jira-time-logger.crx.pem (sign key)
```

The signing `.pem` is committed to a separate **private team store** (1Password vault, private repo, etc.) — not in the public repo. Identity continuity across releases requires reusing the same key.

## Architecture Validation Results

### FR Coverage (52 of 52)

Every FR maps to a specific file or pattern. Spot-check:

| FR | Architectural support |
|---|---|
| FR1 OAuth connect | `lib/oauth/flow.ts` + `components/settings/ConnectButton.tsx` |
| FR8 Hierarchy pre-fill | `lib/hierarchy.ts` + `components/today/TicketPicker.tsx` |
| FR15 Badge counter | `lib/badge.ts` + `entrypoints/background.ts` (alarm) |
| FR23 PTO popover | `components/week/PtoPopover.tsx` + `DayCellHeader.tsx` |
| FR33 Approve fan-out | `lib/approval.ts` + `lib/comment-schema.ts` |
| FR41 Cross-team `(user, cycle)` independence | `lib/comment-schema.ts` discriminated by user; `lib/parser.ts` "newest wins per (user, cycle)" |
| FR43 Outbox retry | `lib/storage/outbox.ts` + `entrypoints/background.ts` (alarm) |
| FR44 Read manager from Jira | `lib/manager-resolution.ts` |

**Status:** ✅ All 52 FRs covered.

### NFR Coverage (13 of 13)

Every NFR has an explicit architectural home (popup TTI → pre-warm + bundle budget; manager matrix progressive → per-row TanStack queries; offline-tolerant → outbox; fail-closed parser → Zod discriminated union; etc.).

**Status:** ✅ All 13 NFRs covered.

### Decision Coherence

No internal contradictions. TypeScript strict + Zod-first validation reinforce each other; TanStack Query + scheduler chain produces a clean ordering; Result<T> at I/O + throw/catch elsewhere is consistently applied; surface boundaries are crisp (service worker owns I/O; UI surfaces are stateless proxies).

**Status:** ✅ All decisions compatible.

### Graceful Degradation Behavior (added per user clarification)

**Principle:** *Worker can always log time on their own assigned subtasks.* Missing configuration degrades feature surface, never blocks the core value loop.

| Missing config | Behavior | UX nudge |
|---|---|---|
| **Manager not set in Jira** | Pre-fill picker (FR8) shows only the worker's own assigned tasks/subtasks. Skip-level expansion is also skipped. | Non-blocking notice in `TicketPicker`: "Pre-fill is limited — your manager isn't set in Jira. Ask your admin to configure it for richer suggestions." Worker can still log normally. |
| **Skip-level not set** | Hierarchy walk stops at the manager level. | Same pattern as above (silent if manager is set; mentioned in DiagnosticsBlock). |
| **Catch-all project (`KNP`) not configured** | Catch-all picker (FR10) hides the catch-all column entirely. | Empty-state in `CatchAllPicker`: "Catch-all not configured. Configure in [Settings] to log Admin/Meetings/PTO." Worker can still log project work. |
| **PTO subtask not configured** | PTO popover (FR11, FR23) shows the PTO actions disabled with a tooltip. | "PTO subtask not configured. Configure in [Settings]." Worker can still log project hours and even non-PTO catch-all work. |
| **OAuth disconnected / token-revoked** | All Jira-touching surfaces show the reconnect prompt; popup falls back to a "Connect to Jira" CTA. | Hard requirement — without auth, nothing works. |
| **Offline / Jira unreachable** | TanStack Query shows last cached data with a stale indicator; outbox queues new writes. | Banner + status chip per NFR6. |

**Implementation rule (binding):** Any feature whose precondition is missing renders a non-blocking placeholder with a deep link to the relevant settings field. Never throw, never block the core log-my-time flow.

This refines the original FR46 (manager-not-set surface) — the message is **informational**, not a blocking modal. The worker can dismiss and continue using the extension's core function.

### Gap Analysis

**🟡 Minor gaps (non-blocking, refined per user clarification):**

1. **Catch-all / PTO unconfigured behavior** — clarified above (graceful degradation, non-blocking).
2. **Manager unconfigured behavior** — clarified above (degrade pre-fill richness; do NOT block logging).
3. **First-run / onboarding UX** — implicit (options page opens via `chrome.runtime.onInstalled`); resolve in implementation.
4. **Site-picker UI when `accessible-resources` returns multiple sites** — inline in `ConnectButton.tsx` for v1.0; extract a separate component only if UX needs it.
5. **WXT v0.20.25 pre-1.0** — pin version; watch upstream releases when bumping.
6. **Tailwind CSS v4 recent** — pin version; shadcn/ui supports v4.

**🟢 Critical gaps:** None.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped (9 named)

**Architectural Decisions**

- [x] Critical decisions documented with versions (TanStack Query v5, Zod v3, Tailwind v4, shadcn/ui, date-fns v4, WXT v0.20.25)
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed (NFR1-4 mapped)

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented (error handling, loading, retry, logging)

**Project Structure**

- [x] Complete directory structure defined (~80 source + ~25 test files)
- [x] Component boundaries established
- [x] Integration points mapped (external = Jira only; internal = WXT messages)
- [x] Requirements to structure mapping complete (every FR area → specific files)

**Status:** All 16 items ✅

### Architecture Readiness Assessment

**Overall Status:** **READY FOR IMPLEMENTATION** — all 16 checklist items satisfied; no critical gaps; graceful-degradation behavior explicitly defined.

**Confidence Level:** **High** — supported by full FR + NFR coverage trace, internal coherence checks, and named risk mitigations for the three high-complexity components called out in Step 2.

**Key Strengths:**

1. Cross-cutting concerns each have a single canonical home.
2. The three high-risk components from PRD have explicit mitigations baked into the architecture.
3. Decisions are minimal and reinforce each other.
4. Surface boundaries are crisp — no shared in-memory state.
5. WXT abstracts away the worst MV3 boilerplate without locking us in.
6. **Graceful degradation principle** ensures the core value loop (worker logs time) is never blocked by missing config.

**Areas for Future Enhancement (post-MVP):**

- CI/CD pipeline
- E2E tests via Playwright
- Performance-budget enforcement in build
- First-run onboarding polish (UX detail)
- PAT / basic-auth fallback for Jira Server users (PRD-deferred to v1.x)

### Implementation Handoff

**AI Agent / Contributor Guidelines:**

1. Follow Step 4 decisions exactly. Don't substitute libraries.
2. Use Step 5 patterns consistently. ESLint enforces several; PR review enforces the rest.
3. Respect Step 6 structure. Cross-cutting code goes in `lib/`; view code goes in `entrypoints/<surface>/` and `components/<view>/`.
4. Never bypass the I/O boundary: all Jira API calls flow through `lib/jira-client.ts`; all returned errors are `Result<T, E>` cases.
5. Write tests next to source for any module added under `lib/`.
6. Refer to PROTOCOL.md for the approval-comment schema; it's the contract between extension versions.
7. **Apply the graceful-degradation principle:** every UI surface that depends on optional config must render a non-blocking empty state with a deep link to settings, not throw or block.

**First Implementation Priority:**

```bash
pnpm dlx wxt@latest init jira-time-logger
# Select React template; TypeScript default
cd jira-time-logger
pnpm install
pnpm dev
```

Then in order:

1. Stub the cross-cutting modules: `lib/result.ts`, `lib/log.ts`, `lib/storage/`, `lib/comment-schema.ts`, `lib/scheduler.ts`. Write Vitest tests as you go.
2. Wire OAuth: `lib/oauth/flow.ts` + `lib/oauth/refresh.ts` + `entrypoints/background.ts` refresh alarm.
3. Wire the Jira client: `lib/jira-client.ts` + `lib/jira-types.ts` Zod schemas.
4. Build the Today view (fastest path to a working extension on yourself).
5. Then weekly grid, then manager matrix, then content-script banner.
6. Run accessibility audit and Edge validation as the final pre-release gate.
