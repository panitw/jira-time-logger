---
baseline_commit: cc86415caa8136e29b195b463b4c9b59d960ea9c
---

# Story 6.3: CRX Packaging Script & Signing Key Vault

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the dev distributing v1.0,
I want a `pnpm pack:crx` script that builds the extension and produces a signed `.crx` from a signing key read out of an untracked/gitignored location (never a committed secret), plus documented vault/secret handling,
so that releases take one command and the production signing key stays safe and out of the repo.

## Context

This is the THIRD story of Epic 6 (Release Polish — Distribution). It is a **tooling / release-infrastructure story**, not an app-feature build. It delivers the `pnpm pack:crx` packaging script (AR30) that converts the WXT build output into a signed Chrome/Edge `.crx`, and it establishes how the signing key is stored and read (the "key vault"). No app/runtime code changes.

> **CRITICAL INTEGRITY / SECURITY CONSTRAINT (read first — this is the whole point of the story split).** An autonomous implementation agent MUST NOT generate or commit a real production signing key, and MUST NOT perform any outward-facing publish (posting a `.crx` to Microsoft Teams, distributing to users). The extension's **identity continuity depends on ONE long-lived private key** — same key → same extension ID across releases. That key is a production secret owned by the team. Therefore this story is split into two explicitly labelled parts:
>
> - **Part A — AUTOMATABLE (the dev agent's job):** author the packaging script, wire it into `package.json`, add `.gitignore` entries that guarantee no key/artifact is ever committed, write `docs/release.md` documenting the vault approach, and prove the script end-to-end with a **throwaway self-signed key generated locally at runtime and NEVER committed** (a dry-run). These deliverables are genuinely verifiable by the agent and must actually pass.
> - **Part B — HUMAN-ONLY (PENDING HUMAN):** generating/provisioning the REAL production signing `.pem` into the actual team secret store (1Password vault or private team-only repo), and posting the produced `.crx` to the Microsoft Teams channel / distributing it. The agent MUST NOT do, claim, or imply any Part B action. Mark every Part B item `PENDING HUMAN` in both the story and `docs/release.md`.
>
> **Do NOT let any deliverable imply the agent provisioned a real production secret or published a release.** (Story 6.1/6.2 precedent: manual/human-gated results were over-claimed once and required a code-review correction — do not repeat that.)

### Chosen packaging approach (decided — do not reinvent)
Use **local Chrome's `--pack-extension` CRX3 packer**, invoked from a small **Node ESM script** (`scripts/pack-crx.mjs`) wired as `pnpm pack:crx`. This matches AR30 and architecture §Infrastructure & Deployment exactly and adds **NO new npm dependency** — it shells out to the Chrome binary the team already has. Chrome's `--pack-extension=<dir> --pack-extension-key=<pem>` reads an existing private key and emits a signed `.crx` next to the packed dir. This is the canonical, dependency-free CRX3 path. (A JS CRX-packing library such as `crx3` was considered and REJECTED for v1.0 to avoid a new supply-chain dependency for a one-command release tool; see Design Questions if the team prefers the pure-JS route.)

### Verified facts about the current setup (agent confirmed these while creating this story)
- `wxt.config.ts` sets **`outDir: 'output'`** (NO leading dot). So builds land at **`output/chrome-mv3/`** and **`output/edge-mv3/`** — NOT `.output/…`. The epic AC text says `.output/chrome-mv3`; that path is **stale** — use `output/…`. Both `output` and `.output` are already gitignored.
- `pnpm build` (= `wxt build`) emits `output/chrome-mv3/` (contains `manifest.json` at its root). `pnpm build:edge` emits `output/edge-mv3/`. Verified present.
- `package.json` scripts today: `build`, `build:edge`, `zip`, `zip:edge`, `compile`, `test`, `lint`, `format`. **There is NO `pack:crx` script yet** — this story adds it.
- **`.gitignore` does NOT currently ignore `*.pem`, `*.crx`, or a `keys/` dir** (verified via `git check-ignore` — returns nothing for `test.pem`/`test.crx`/`keys/signing.pem`). Adding these entries is a REQUIRED security deliverable of this story.
- Node **v24** and Chrome (default macOS path `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) are available in the dev env. `package.json` `type: "module"`, so a `.mjs` (or plain `.js`) ESM script runs directly under `node`.
- `docs/` exists (created in Story 6.1; it is the `project_knowledge` dir) and holds `a11y-audit-2026-06-27.md`, `a11y-deviations.md`, `edge-validation-2026-06-27.md`. `docs/release.md` is new and additive.
- Package manager is **pnpm** per `packageManager`; `npm run <script>` works equally. Invoke whichever is available.

## Acceptance Criteria

### --- PART A — AUTOMATABLE (dev agent implements & verifies these for real) ---

### AC1 — `pnpm pack:crx` script exists and builds first
**Given** the project needs a one-command release packager
**When** the dev adds a `pack:crx` script under `scripts` in `package.json` that runs a Node script `scripts/pack-crx.mjs`
**Then** running `pnpm pack:crx` first runs `pnpm build` (Chrome build) and, for the Edge artifact, `pnpm build:edge`, ensuring `output/chrome-mv3/` and `output/edge-mv3/` are fresh before packing
**And** the script targets the ACTUAL output dirs `output/chrome-mv3/` and `output/edge-mv3/` (NOT `.output/…`).

### AC2 — Signing key is read from a gitignored/untracked location or env var (never a committed secret)
**Given** the packaging step needs a private signing key
**When** the script resolves the key path
**Then** it reads the key path from env var **`CRX_SIGNING_KEY`** if set, otherwise falls back to a default **untracked** local path (e.g. `keys/jira-time-logger.pem`) that is covered by `.gitignore`
**And** the script NEVER embeds, generates-into-repo, or hard-codes real key material
**And** the key file is loaded from disk at run time only; its contents are never printed to logs.

### AC3 — Chrome `--pack-extension` produces version-stamped signed `.crx` for Chrome and Edge
**Given** a valid signing key is available at the resolved path
**When** the dev runs `pnpm pack:crx`
**Then** the script locates the Chrome binary via env var **`CHROME_PATH`** first, else platform-typical default paths (macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, Linux `google-chrome`/`chromium`, Windows `…\Application\chrome.exe`)
**And** invokes it with `--pack-extension=output/chrome-mv3 --pack-extension-key=<resolved-pem>` to produce **`jira-time-logger-<version>.crx`**
**And** runs the same for Edge → **`jira-time-logger-edge-<version>.crx`** (Edge consumes the same CRX3 format)
**And** `<version>` is read from `package.json` (currently `0.1.0`) so each release artifact is uniquely named
**And** the produced `.crx` files are written to a gitignored location (e.g. project root or `output/`) and are NOT committed.

### AC4 — Fail-fast with a clear, actionable message when the key is missing/unreadable
**Given** the signing key is missing, unreadable, or empty at the resolved path
**When** `pnpm pack:crx` runs
**Then** it exits non-zero **before** invoking Chrome, printing exactly the intent of: `Signing key not found at <path>. Retrieve from the team vault before packaging — see docs/release.md.`
**And** it does NOT produce an unsigned `.crx` and does NOT silently generate a new production key.
**And** it likewise fails clearly if the Chrome binary cannot be located (message names `CHROME_PATH` and points to `docs/release.md`).

### AC5 — Verification output: file size, extension ID (derived from public key), and version
**Given** the pack succeeds
**When** the script completes
**Then** for each produced `.crx` it prints the file size, the extension **ID derived from the public key**, and the version
**And** the extension ID is computed deterministically from the same key (so the team can confirm identity continuity — same key → same ID across releases). *(Extension ID = hex-encoded first 16 bytes of the SHA-256 of the DER public key, mapped `0–9a–f` → `a–p`. Derive it from the key/`.crx` in-script; do NOT hard-code an ID.)*

### AC6 — Dry-run proof with a THROWAWAY self-signed key (generated locally, NOT committed)
**Given** the agent has no access to the real production key (that is Part B)
**When** the agent proves the script end-to-end
**Then** it generates a **throwaway** RSA key locally at run time (e.g. `openssl genrsa` or Chrome's own key generation when `--pack-extension-key` is omitted on first pack) into a gitignored/temp path, runs `pnpm pack:crx` (or an equivalent invocation) against it, and confirms a signed `.crx` is produced with printed size/ID/version
**And** the throwaway key and the produced `.crx`/`.pem` are **NEVER committed** (verified via `git check-ignore` / `git status`) and may be deleted after the check
**And** the completion notes record that the dry-run used a throwaway self-signed key, NOT the production key.

### AC7 — `.gitignore` guarantees no key material or `.crx` is ever committed
**Given** the packaging flow creates `.pem` (keys) and `.crx` (artifacts)
**When** the dev updates `.gitignore`
**Then** it ignores `*.pem`, `*.crx`, and the default key dir (e.g. `keys/`) so neither key material nor built packages can be accidentally staged
**And** `git check-ignore` confirms each pattern matches (these are NOT ignored today — this is a required change)
**And** the story leaves NO `.pem`/`.crx`/key file tracked in git.

### AC8 — `docs/release.md` documents the vault approach and the release runbook
**Given** the team needs to know where the key lives and how to cut a release
**When** the dev writes `docs/release.md`
**Then** it documents: (a) that the signing key is a **production secret stored in the team vault** (1Password vault or private team-only repo — NEVER the public source repo, AR30), how to retrieve it, and where to place it / how to point `CRX_SIGNING_KEY` at it; (b) the exact `pnpm pack:crx` command, its prerequisites (`CHROME_PATH` if needed), and the produced artifact names; (c) the fail-fast behaviors; (d) a clearly labelled **PENDING HUMAN** section for the one-time real-key generation/provisioning and for posting the `.crx` to Teams — stating the agent did NOT perform these
**And** it mirrors the honest PENDING-HUMAN framing already used in `docs/edge-validation-2026-06-27.md` / `docs/a11y-audit-2026-06-27.md`.

### AC9 — No regressions; existing gates stay green
**Given** the only changes are a new `scripts/pack-crx.mjs`, a `package.json` script entry, `.gitignore` additions, and `docs/release.md`
**When** `pnpm compile` (tsc), `pnpm lint` (eslint), and `pnpm test` (vitest) run
**Then** all pass with no NEW failures versus baseline (76 suites / 961 passing / 1 skipped as of Story 6.2)
**And** no app/runtime source under `entrypoints/`, `lib/`, `components/` is modified.

### --- PART B — HUMAN-ONLY (PENDING HUMAN — agent must NOT perform or claim) ---

### AC10 — Provision the REAL production signing key into the team vault (HUMAN)
**Given** a real v1.0 release
**When** a human generates the production signing key one time (Chrome `--pack-extension` on their machine, or `openssl genrsa`) and stores the `.pem` in the team vault (1Password / private team-only repo)
**Then** the key lives ONLY in the vault + the releaser's untracked local `CRX_SIGNING_KEY` path, never in the public repo
**And** subsequent releases (v1.0 → v1.1) reuse the SAME key so Chrome/Edge treat the new `.crx` as an update (same key → same extension ID, no duplicate install).
> **This AC is satisfied ONLY by a human.** The implementation agent has no authority to mint or store a production secret; it must leave this `PENDING HUMAN` and must not generate a "production" key.

### AC11 — Post the signed `.crx` to Microsoft Teams / distribute (HUMAN)
**Given** a human-produced signed `.crx` from the real key
**When** the human posts it to the Microsoft Teams channel
**Then** distribution proceeds per `docs/release.md` (and the README from Story 6.4)
> **HUMAN-ONLY.** No outward-facing publish is performed by the agent. Leave `PENDING HUMAN`.

## Tasks / Subtasks

- [ ] **Task 1 — Author `scripts/pack-crx.mjs` (AC1, AC2, AC3, AC4, AC5)**
  - [ ] Read `version` and `name` from `package.json`.
  - [ ] Resolve signing key path: `CRX_SIGNING_KEY` env → else default `keys/jira-time-logger.pem`. Fail fast (AC4 message) if missing/unreadable/empty, BEFORE building/packing.
  - [ ] Resolve Chrome binary: `CHROME_PATH` env → else platform defaults (mac/Linux/Windows). Fail fast with a `CHROME_PATH`-naming message if not found.
  - [ ] Run `pnpm build` then `pnpm build:edge` (or invoke `wxt build` / `wxt build -b edge`) to refresh `output/chrome-mv3/` and `output/edge-mv3/`.
  - [ ] For each target dir, invoke Chrome `--pack-extension=<dir> --pack-extension-key=<pem> --no-message-box`; rename/verify output to `jira-time-logger-<version>.crx` and `jira-time-logger-edge-<version>.crx`. (Chrome writes `<dirname>.crx` beside the packed dir — move/rename to the version-stamped name.)
  - [ ] After each pack: print file size, derived extension ID (from public key / `.crx` header), and version.
- [ ] **Task 2 — Wire `pack:crx` into package.json (AC1)**
  - [ ] Add `"pack:crx": "node scripts/pack-crx.mjs"` under `scripts`. Do not disturb existing scripts.
- [ ] **Task 3 — `.gitignore` hardening (AC7)**
  - [ ] Add `*.pem`, `*.crx`, and `keys/` (or the chosen default key dir). Verify with `git check-ignore` that a sample `keys/x.pem`, `x.crx`, `x.pem` are all ignored.
  - [ ] Confirm no `.pem`/`.crx`/key file is tracked (`git status` clean of such files).
- [ ] **Task 4 — Dry-run proof with a THROWAWAY key (AC6)**
  - [ ] Generate a throwaway RSA key locally into a gitignored/temp path (e.g. `openssl genrsa -out keys/throwaway.pem 2048`, or let Chrome generate on first `--pack-extension` without `--pack-extension-key`).
  - [ ] Run `pnpm pack:crx` (or an equivalent direct invocation pointing `CRX_SIGNING_KEY` at the throwaway key) and confirm signed `.crx` files are produced with printed size/ID/version.
  - [ ] Verify (`git check-ignore` / `git status`) that the throwaway key + produced `.crx`/`.pem` are NOT staged. Optionally delete them after.
  - [ ] Record in completion notes: dry-run used a THROWAWAY self-signed key, NOT the production key.
- [ ] **Task 5 — Author `docs/release.md` (AC8)**
  - [ ] Document the vault approach (1Password / private team-only repo, AR30), key retrieval, `CRX_SIGNING_KEY` / `CHROME_PATH` usage, the `pnpm pack:crx` command, produced artifact names, and fail-fast behaviors.
  - [ ] Add a clearly labelled **PENDING HUMAN** section covering AC10 (real-key provisioning) + AC11 (Teams posting), stating the agent did NOT perform them. Mirror the honesty framing of `docs/edge-validation-2026-06-27.md`.
- [ ] **Task 6 — Gates green (AC9)**
  - [ ] Run `pnpm compile`, `pnpm lint`, `pnpm test`; confirm no new failures vs baseline (76 suites / 961 passed / 1 skipped). Confirm no `entrypoints/`|`lib/`|`components/` source changed.
- [ ] **Task 7 — Provision REAL production key into vault (AC10)** — **PENDING HUMAN.** The implementation agent does NOT and MUST NOT mint or store a production signing secret. Leave unchecked.
- [ ] **Task 8 — Post `.crx` to Microsoft Teams / distribute (AC11)** — **PENDING HUMAN.** No outward-facing publish by the agent. Leave unchecked.

## Dev Notes

### Packaging mechanics (verified / decided at story-creation — confirm, don't reinvent)
- **Approach = local Chrome `--pack-extension` (CRX3), invoked from `scripts/pack-crx.mjs` via `pnpm pack:crx`.** NO new npm dependency. This is exactly AR30 and architecture §Infrastructure & Deployment.
- Chrome CLI: `"<chrome>" --pack-extension=<unpacked-dir> --pack-extension-key=<private.pem> --no-message-box`. On success Chrome writes `<unpacked-dir>.crx` (e.g. `output/chrome-mv3.crx`) beside the dir — the script must move/rename it to the version-stamped name. If `--pack-extension-key` is omitted on the FIRST pack, Chrome generates a `<dir>.pem` beside the output (useful ONLY for the throwaway dry-run; the real key must come from the vault).
- **Chrome may exit 0 even on some errors** and prints packing status to stderr — validate that the expected `.crx` file actually exists and is non-empty after the call rather than trusting exit code alone.
- **Extension ID derivation (AC5):** `id = SHA-256(DER public key)`, take the first 16 bytes, hex-encode, then map each hex nibble `0–9a–f` → `a–p`. You can extract the public key from the `.crx` header (CRX3) or from the `.pem`. Do NOT hard-code an ID — derive it so the team can confirm same-key-same-ID continuity.
- **Actual build paths:** `output/chrome-mv3/`, `output/edge-mv3/` (from `outDir: 'output'` in `wxt.config.ts`). Ignore the epic's stale `.output/…`.

### Security rules (the central requirement — non-negotiable)
- The script reads the key from `CRX_SIGNING_KEY` env or a gitignored default path. It NEVER writes a real key into the repo, NEVER logs key contents, and NEVER commits `.pem`/`.crx`.
- `.gitignore` MUST gain `*.pem`, `*.crx`, `keys/` (currently absent — confirmed via `git check-ignore`). This is the guardrail that makes an accidental key commit impossible.
- The dry-run (AC6) uses a **throwaway self-signed** key only; it is not the production key and is not committed. Do not conflate the throwaway key with the production key anywhere in prose.
- Real production-key provisioning (AC10) and Teams distribution (AC11) are **PENDING HUMAN**. The agent must not perform, claim, or imply either. This is the same honesty discipline enforced in Stories 6.1/6.2 (which had a review correction for over-claiming a human-gated result).

### Why same-key → same-ID matters
Chrome/Edge derive the extension ID from the packing public key. Reusing the ONE production key across v1.0→v1.1 means users get an in-place update, not a duplicate install. Rotating the key would orphan the prior install. `docs/release.md` must make this explicit so the human releaser never regenerates the key.

### What must be preserved (regression guardrails)
- This is a tooling story: **do not modify app/runtime logic** (`entrypoints/`, `lib/`, `components/`). Changes are limited to `scripts/pack-crx.mjs` (new), `package.json` `scripts` (one line), `.gitignore` (additive), `docs/release.md` (new).
- Keep `compile`/`lint`/`test` green. If ESLint lints `scripts/**`, ensure the new `.mjs` passes lint (or is appropriately scoped) — prefer conforming over adding ignore rules.
- Do not disturb Story 6.1 (a11y harness) or 6.2 (Edge validation doc) artifacts.

### Status discipline (why this story can reach a near-complete but human-gated end state)
- Part A (AC1–AC9) is fully automatable and must genuinely pass, INCLUDING a real dry-run pack with a throwaway key. Only AC10/AC11 are human-gated.
- On dev completion, if Part A is done and verified, the story may move to `review`; the human-only AC10/AC11 remain `PENDING HUMAN` and do NOT block the automated scope from review (mirror how 6.2 handled its human gate — but note 6.2 stayed `in-progress` because ALL of its Part B was human; here Part A is a concrete shippable deliverable, so `review` is appropriate once Part A is verified). Flag this judgement call in completion notes.

### Project Structure Notes
- No `scripts/` dir exists yet — create it; `scripts/pack-crx.mjs` is the sole new script. `package.json` is `type: "module"`, so ESM in `.mjs`/`.js` runs under `node` directly.
- `docs/` already exists; `docs/release.md` is additive alongside the a11y/edge docs.
- Produced `.crx` output location: prefer `output/` (already gitignored) or project root (now gitignored via AC7); either is fine as long as it's ignored.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3 (lines 1586–1618)] — full AC set (note stale `.output/chrome-mv3` path; actual is `output/chrome-mv3`).
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6 (line 1506)] — "`pnpm pack:crx` script + signing-key vault setup produces a versioned `.crx` ready to post to the Microsoft Teams channel."
- [Source: _bmad-output/planning-artifacts/architecture.md (lines 321–334)] — Infrastructure & Deployment: `pnpm build` → `.crx` via Chrome `--pack-extension` (one-line script) → post to Teams; no CI/CD for v1.0.
- [Source: _bmad-output/planning-artifacts/architecture.md (lines 943–951)] — Distribution: `pnpm pack:crx` script; signing `.pem` in private team store (1Password vault / private repo), NOT public repo; identity continuity requires reusing the same key. (AR30.)
- [Source: _bmad-output/planning-artifacts/architecture.md (line 220)] — Distribution = sideloaded `.crx` via Microsoft Teams.
- [Source: package.json#scripts, #version] — existing `build`/`build:edge`/`zip`/`zip:edge`/`compile`/`lint`/`test`; version `0.1.0`; `type: "module"`; `packageManager: pnpm`.
- [Source: wxt.config.ts] — `outDir: 'output'` → `output/chrome-mv3/`, `output/edge-mv3/` (NOT `.output/…`).
- [Source: .gitignore] — currently ignores `output`/`.output` but NOT `*.pem`/`*.crx`/`keys/` (confirmed via `git check-ignore`; must be added).
- [Source: docs/edge-validation-2026-06-27.md] — template for the honest PENDING-HUMAN framing in `docs/release.md`.
- [Source: _bmad-output/implementation-artifacts/6-2-edge-browser-validation.md] — Part A / Part B split precedent + honesty discipline (6.1/6.2 over-claim correction).

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date       | Change                                                          |
| ---------- | --------------------------------------------------------------- |
| 2026-07-11 | Story 6.3 created (ready-for-dev). CRX packaging split into Part A (AUTOMATABLE: `scripts/pack-crx.mjs` + `pnpm pack:crx` using local Chrome `--pack-extension` — no new dep; key read from `CRX_SIGNING_KEY` env / gitignored default; fail-fast on missing key/Chrome; version-stamped Chrome+Edge `.crx`; prints size/ext-ID/version; `.gitignore` adds `*.pem`/`*.crx`/`keys/`; `docs/release.md` vault runbook; dry-run proof with a THROWAWAY self-signed key NOT committed) and Part B (HUMAN-ONLY, PENDING HUMAN: provision REAL production key into 1Password/team vault; post `.crx` to Microsoft Teams). Confirmed at creation: actual build paths are `output/chrome-mv3/`+`output/edge-mv3/` (epic's `.output/…` is stale); no `pack:crx` script yet; `*.pem`/`*.crx`/`keys/` NOT yet gitignored; Node v24 + Chrome present. Agent must NOT mint/commit a real production key or publish. |
