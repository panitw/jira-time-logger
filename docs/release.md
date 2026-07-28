# Release Runbook — CRX Packaging & Signing Key Vault

**Story:** 6.3 — CRX Packaging Script & Signing Key Vault (AR30)
**Scope:** How to cut a signed `.crx` release of jira-time-logger for sideloaded
distribution via the Microsoft Teams channel, and how the production signing key
is stored and handled.

> **Status of this document (read first):** The packaging **script**
> (`scripts/pack-crx.mjs`), the `pnpm pack:crx` wiring, the `.gitignore`
> guardrails, and a **dry-run pack proven with a THROWAWAY self-signed key** are
> COMPLETE and were actually executed by the implementation agent (Part A). The
> **one-time provisioning of the REAL production signing key into the team
> vault** and the **posting of the signed `.crx` to Microsoft Teams** are
> **PENDING HUMAN** (Part B) — the implementation agent has **no authority to
> mint or store a production secret and performs no outward-facing publish.** It
> did NOT do, and does NOT claim, any Part B action. See
> [Part B — PENDING HUMAN](#part-b--pending-human) below. This mirrors the honest
> PENDING-HUMAN framing used in `docs/edge-validation-2026-06-27.md` and
> `docs/a11y-audit-2026-06-27.md`.

---

## Overview

Distribution for v1.0 is a **sideloaded `.crx`** posted to a Microsoft Teams
channel — there is no Chrome Web Store listing and no CI/CD for v1.0. A release is
a single command:

```
pnpm pack:crx
```

This builds the WXT output for Chrome and Edge, then uses the **local Chrome
binary's CRX3 packer** (`--pack-extension`) to emit a **signed, version-stamped
`.crx`** for each target. No new npm dependency is introduced — the script shells
out to Chrome and OpenSSL, which the release machine already has.

Produced artifacts (written to the repo root, and **gitignored**):

| Target | Artifact name (version from `package.json`) |
| ------ | ------------------------------------------- |
| Chrome | `jira-time-logger-<version>.crx`            |
| Edge   | `jira-time-logger-edge-<version>.crx`       |

For each artifact the script prints the **file size**, the **extension ID**
(derived deterministically from the signing key), and the **version**.

---

## OAuth callback URL & the pinned extension ID (read before first connect)

`lib/oauth/flow.ts` uses `chrome.identity.getRedirectURL()`, which returns
`https://<EXTENSION_ID>.chromiumapp.org/`. Atlassian rejects any `redirect_uri`
not registered for the client, failing with:

```
unauthorized_client — redirect_uri is not registered for client: https://<id>.chromiumapp.org/
```

**Without a `key` field in the manifest, Chrome derives an unpacked extension's ID
by hashing its absolute install path.** That means the ID — and the callback URL —
changes whenever the checkout moves, the `outDir` changes, or the build is loaded
on another machine, and it never matches the packed `.crx` or the Edge build.

The fix is to set **`manifest.key`** in `wxt.config.ts` to the **public half of the
production signing key**. The ID is then derived from the key instead of the path,
so the unpacked dev build, the Chrome `.crx`, the Edge `.crx`, and every developer
machine all resolve to **one** ID and **one** registered callback URL. (This also
retires the Edge/Chrome ID-divergence risk recorded in
`docs/edge-validation-2026-06-27.md` risk #2.)

### Steps

1. Provision the production signing key into the vault — **HUMAN**, see
   [AC10](#ac10--provision-the-real-production-signing-key-into-the-team-vault-pending-human).
2. With the key on disk, print the identity triple:
   ```
   CRX_SIGNING_KEY=/absolute/path/to/jira-time-logger.pem pnpm ext:id
   ```
   It reports the **manifest `key`**, the **extension ID**, the **callback URL** to
   register, and a **pin status** telling you whether `wxt.config.ts` currently
   pins that exact key (`OK` / `STALE` / `MISSING`).
3. Paste the printed `key` value into `manifest.key` in `wxt.config.ts` and commit
   it. The `key` is the **public** half — safe to commit to this repo. The `.pem`
   is not, and stays in the vault.
4. Register the printed callback URL at
   [developer.atlassian.com/console](https://developer.atlassian.com/console) →
   the app for client ID in `lib/env.ts` → **Authorization** → OAuth 2.0 (3LO) →
   **Configure** → **Callback URL**. The **trailing slash is required** — Atlassian
   matches exactly.
5. `pnpm build`, reload the unpacked extension, and re-run `pnpm ext:id` to confirm
   the pin status reads `OK`.

> Because the ID follows the key, **never rotating the key** (see below) is also
> what keeps the registered callback URL valid for the life of the extension.

---

## The signing key & the vault (why this matters)

Chrome/Edge derive the **extension ID from the packing public key**. Reusing the
**one** production key across releases (v1.0 → v1.1 → …) means users get an
**in-place update**, not a duplicate install. **Rotating / regenerating the key
would change the extension ID and orphan every existing install.**

> **DO NOT EVER regenerate the production key.** There is exactly one production
> signing key for the lifetime of the extension. Losing or rotating it forces all
> users to uninstall/reinstall.

### Where the key lives (AR30)

- The production signing key is a **team secret stored in the team vault** — a
  **1Password vault** or a **private, team-only repository**. It lives **NEVER**
  in this public source repo.
- On the releaser's machine the key sits at an **untracked** local path. The
  packaging script reads it from:
  1. the **`CRX_SIGNING_KEY`** environment variable (an absolute path), if set;
  2. otherwise the default path **`keys/jira-time-logger.pem`** (gitignored).

### `.gitignore` guardrails

`.gitignore` ignores **`*.pem`**, **`*.crx`**, and **`keys/`**, so neither key
material nor built packages can be accidentally staged. Verify at any time:

```
git check-ignore keys/jira-time-logger.pem jira-time-logger-0.1.0.crx
```

Both paths should be reported as ignored.

---

## Prerequisites

- **Node** (v24 used in dev) and **pnpm** (`packageManager` in `package.json`).
  `npm run pack:crx` works equally if pnpm is unavailable.
- A **local Chrome/Chromium binary**. The script auto-detects platform defaults:
  - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  - Linux: `/usr/bin/google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`
  - Windows: `…\Google\Chrome\Application\chrome.exe`
  If Chrome is elsewhere, set **`CHROME_PATH`** to the executable.
- **OpenSSL** on `PATH` (used to derive the extension ID's public key from the PEM).
- The **production signing key** retrieved from the vault into your local
  `CRX_SIGNING_KEY` path (or `keys/jira-time-logger.pem`).

---

## Cutting a release

1. Retrieve the production signing `.pem` from the team vault (1Password / private
   repo) into an untracked local path. **Do not commit it.**
2. Point the script at it (skip if you placed it at `keys/jira-time-logger.pem`):
   ```
   export CRX_SIGNING_KEY="/absolute/path/to/jira-time-logger.pem"
   # export CHROME_PATH="/path/to/chrome"   # only if not auto-detected
   ```
3. Confirm the release version in `package.json` (`version`) is correct — the
   artifact name is version-stamped.
4. Run:
   ```
   pnpm pack:crx
   ```
5. Note the printed **extension ID** and confirm it **matches the previous
   release's ID** (same key → same ID = an in-place update, not a duplicate).
6. Post the produced `.crx` to the Microsoft Teams channel — **HUMAN step**, see
   Part B.

---

## Fail-fast behaviors

The script exits **non-zero before invoking Chrome / before producing any
artifact** when:

- **Signing key missing / unreadable / empty** at the resolved path:
  > `Signing key not found at <path>. Retrieve from the team vault before packaging — see docs/release.md.`
  It does **not** produce an unsigned `.crx` and does **not** silently generate a
  new production key.
- **Chrome binary not found** (and no valid `CHROME_PATH`): the message names
  `CHROME_PATH` and points here.

After each pack it also **verifies the `.crx` actually exists and is non-empty**
(Chrome can exit 0 even on some failures) and fails clearly otherwise.

The signing key is loaded from disk **only at run time**; its **contents are never
printed to logs**.

---

## Part B — PENDING HUMAN

The following are **human-only** steps. The implementation agent did **NOT**
perform, claim, or imply any of them.

### AC10 — Provision the REAL production signing key into the team vault (PENDING HUMAN)

- A human generates the production signing key **one time** (e.g.
  `openssl genrsa -out jira-time-logger.pem 2048`, or Chrome's own key generation
  when `--pack-extension-key` is omitted on the first pack) and stores the `.pem`
  in the **team vault** (1Password vault or private team-only repo).
- The key must live **only** in the vault and on the releaser's untracked local
  `CRX_SIGNING_KEY` path — **never** in this public repo.
- All subsequent releases **reuse the same key** so the extension ID is stable.
- **The implementation agent has no authority to mint or store a production
  secret and did NOT generate a production key.** (The Part A dry-run used a
  disposable throwaway self-signed key that was never committed and can be
  deleted.)

### AC11 — Post the signed `.crx` to Microsoft Teams / distribute (PENDING HUMAN)

- A human posts the human-produced signed `.crx` (from the real key) to the
  Microsoft Teams channel; distribution proceeds per this runbook and the README
  (Story 6.4).
- **No outward-facing publish is performed by the implementation agent.**

---

## Appendix — Extension ID derivation

The extension ID is computed deterministically from the signing key so the team
can confirm identity continuity:

`id = SHA-256(DER SPKI public key)` → take the **first 16 bytes** → hex-encode →
map each hex nibble `0–9a–f` → `a–p`.

The script derives this in-process (via OpenSSL to extract the DER public key from
the PEM). It is **never hard-coded**, so a mismatch immediately signals that a
different key was used.
