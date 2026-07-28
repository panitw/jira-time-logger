# jira-time-logger

> Stop forgetting. See the week. Approve the month. All inside Jira, no server.

A Manifest V3 browser extension that turns Jira's worklog from a passive form people
forget into an ambient tool: it reminds you to log time daily, shows you the week at a
glance, and lets managers approve a whole month in one pass.

It talks **only to Jira Cloud**. There is no backend, no database, and no ops burden —
approval state is written as checksummed comments on Jira Epics, so Jira's own
append-only comment timeline becomes the approval ledger.

This is an internal team tool distributed as a sideloaded `.crx`. It is not on the
Chrome Web Store.

---

## What it does

**For developers logging time**

- A **toolbar badge** counting the hours missing from the current week, so the gap is
  visible before month-end rather than after.
- An **inline banner injected into Jira ticket pages**, dismissable for the day, that
  offers to log time against the ticket you are already looking at.
- A **daily push notification** at a time you configure.
- A **popup** that opens pre-filled by walking your reporting hierarchy in Jira — your
  tickets, your manager's, your skip-level's, filtered to active and recent — so logging
  is review-and-adjust rather than reconstruct-from-memory.
- A **week grid** with per-day status, one-click time-off marking, and a submit flow that
  makes you explicitly acknowledge any gaps instead of quietly skipping them.

**For managers approving it**

- A **person × Epic matrix** for the cycle, rendered progressively row by row.
- **Drill-down** to the per-ticket evidence behind any cell.
- **One-click approval** per person per cycle, and re-approval when a cycle goes dirty.
- Explicit **visibility warnings** when Jira's worklog restrictions hide entries the
  approver is not permitted to see, so an approval is never silently partial.

## How it works

| Concern        | Approach                                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth           | OAuth 2.0 3LO + PKCE via `chrome.identity`. Tokens in `chrome.storage.local`, refresh driven by `chrome.alarms` so it survives service-worker restarts.                                                                                         |
| Approval state | A checksummed, versioned comment on the Epic. The parser **fails closed** — anything not byte-valid and checksum-verified counts as unapproved. See [PROTOCOL.md](PROTOCOL.md).                                                                 |
| Rate limits    | Every Jira call routes through a client-side token-bucket scheduler; the client classifies `429` separately and surfaces the `Retry-After` delay. The manager view fans out across reports × Epics and would otherwise trip Jira Cloud's limit. |
| Offline writes | Failed worklog posts queue in an outbox and drain on reconnect.                                                                                                                                                                                 |
| Storage        | `chrome.storage.local` with a quota check and eviction, since the 10MB ceiling is reachable.                                                                                                                                                    |

## Getting started

**Prerequisites:** Node.js and [pnpm](https://pnpm.io) 10.32.1 (see `packageManager` in
`package.json`; `corepack enable` will honour it).

```bash
pnpm install
pnpm dev              # Chrome, live-reloading
pnpm dev:edge         # Edge
```

`pnpm dev` writes an unpacked extension to `output/` and opens a browser with it loaded.

### Before your first connect — read this

`lib/oauth/flow.ts` uses `chrome.identity.getRedirectURL()`, which returns
`https://<EXTENSION_ID>.chromiumapp.org/`. **Without a `key` field in the manifest,
Chrome derives an unpacked extension's ID by hashing its install path** — so the ID and
the callback URL change whenever the checkout moves or the build lands on another
machine, and OAuth fails with:

```
unauthorized_client — redirect_uri is not registered for client
```

Set `manifest.key` in [wxt.config.ts](wxt.config.ts) to the public half of the signing
key. `pnpm ext:id` prints the key, the resulting extension ID, and the exact callback URL
to register at developer.atlassian.com. Full walkthrough in
[docs/release.md](docs/release.md).

> At the time of writing `manifest.key` is **not yet set** — it needs the production
> signing key, which lives in the team vault. Until then, expect OAuth to fail on a fresh
> checkout.

## Scripts

| Command                                  | What it does                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm dev:edge`             | Run the extension with live reload.                                                                                                            |
| `pnpm build` / `pnpm build:edge`         | Production build into `output/`.                                                                                                               |
| `pnpm zip` / `pnpm zip:edge`             | Zip a build for distribution.                                                                                                                  |
| `pnpm pack:crx`                          | Build and emit a signed, version-stamped `.crx` for Chrome and Edge.                                                                           |
| `pnpm ext:id`                            | Print the manifest `key`, extension ID, and OAuth callback URL.                                                                                |
| `pnpm test`                              | Run the test suite.                                                                                                                            |
| `pnpm test:watch` / `pnpm test:coverage` | Watch mode / coverage report.                                                                                                                  |
| `pnpm compile`                           | Typecheck (`tsc --noEmit`).                                                                                                                    |
| `pnpm lint` / `pnpm lint:fix`            | ESLint.                                                                                                                                        |
| `pnpm format`                            | Prettier.                                                                                                                                      |
| `pnpm icons`                             | Regenerate `public/icon/*.png` from `assets/icon/*.svg`. macOS only — the PNGs are committed, so you only need this if you change the artwork. |

## Layout

```
entrypoints/      Three UI surfaces (popup, fullpage, options) plus the
                  background service worker and the Jira content script
components/       React UI, grouped by surface (today, week, manager, settings, shell)
hooks/            Data-fetching hooks over TanStack Query
lib/              Everything non-visual — Jira client, OAuth, approval protocol,
                  scheduler, storage, badge, banner DOM
assets/icon/      Extension icon source SVGs
public/           Static assets copied verbatim into the build (icons, fonts)
docs/             Release runbook, accessibility audit, Edge validation
_bmad-output/     Planning artifacts — PRD, architecture, epics, UX spec
```

Built with [WXT](https://wxt.dev), React 19, TypeScript, Tailwind CSS 4, TanStack Query,
Radix UI, and Zod. Tests run on Vitest with jsdom, plus axe-core for accessibility
assertions.

## Quality

Current state on `main`:

- **119 test files, 1737 tests** passing; ~89% statement coverage.
- `pnpm compile`, `pnpm lint`, and `pnpm build` clean.
- `pnpm audit` reports **zero advisories at every severity**. Dependency overrides that
  keep it there are documented, with rationale, in
  [pnpm-workspace.yaml](pnpm-workspace.yaml) — including two that were deliberately
  _rejected_ because the "fixed" version breaks its consumer.

There is no CI pipeline; these are run locally before a release.

Two items are explicitly **pending human sign-off** and are not claimed as done:
the accessibility audit ([docs/a11y-audit-2026-06-27.md](docs/a11y-audit-2026-06-27.md))
and provisioning the production signing key ([docs/release.md](docs/release.md)).

## Documentation

| Document                                                                 | Contents                                                                                                                                                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PROTOCOL.md](PROTOCOL.md)                                               | The approval-comment contract: marker format, payload schema, checksum algorithm, fail-closed parser rules. Changing it breaks every previously-posted approval. |
| [docs/release.md](docs/release.md)                                       | Packaging a signed `.crx`, signing-key handling, OAuth callback setup.                                                                                           |
| [docs/a11y-audit-2026-06-27.md](docs/a11y-audit-2026-06-27.md)           | WCAG 2.1 AA audit, with [known deviations](docs/a11y-deviations.md).                                                                                             |
| [docs/edge-validation-2026-06-27.md](docs/edge-validation-2026-06-27.md) | Edge browser validation notes.                                                                                                                                   |
| [\_bmad-output/planning-artifacts/](_bmad-output/planning-artifacts/)    | PRD, architecture, epics, UX specification.                                                                                                                      |
