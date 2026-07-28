#!/usr/bin/env node
// scripts/derive-ext-key.mjs
//
// Prints the manifest `key` field, the resulting extension ID, and the OAuth
// redirect URI to register with Atlassian — all derived from the signing key.
//
// The manifest `key` is the PUBLIC half of the signing key. It is safe to commit
// and safe to paste into a ticket or chat. The private .pem stays in the vault.
//
// Usage:
//   pnpm ext:id
//   CRX_SIGNING_KEY=/path/to/signing.pem pnpm ext:id

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  projectRoot,
  resolveSigningKeyPath,
  publicKeyDerFromPem,
  deriveExtensionId,
  manifestKeyFromPem,
  redirectUrlForId,
} from './lib/ext-id.mjs';

const resolved = resolveSigningKeyPath();
if (!resolved.ok) {
  console.error(`\n[ext:id] ERROR: ${resolved.reason}\n`);
  process.exit(1);
}

const { keyPath } = resolved;
const manifestKey = manifestKeyFromPem(keyPath);
const extensionId = deriveExtensionId(publicKeyDerFromPem(keyPath));
const redirectUrl = redirectUrlForId(extensionId);

// Report whether wxt.config.ts already carries this exact key, so a stale or
// missing pin is obvious rather than silent.
let pinState = 'UNKNOWN (could not read wxt.config.ts)';
try {
  const config = readFileSync(join(projectRoot, 'wxt.config.ts'), 'utf8');
  if (config.includes(manifestKey)) {
    pinState = 'OK — wxt.config.ts pins this exact key';
  } else if (/^\s*key:\s*['"]/m.test(config)) {
    pinState = 'STALE — wxt.config.ts pins a DIFFERENT key; the built ID will not match';
  } else {
    pinState = 'MISSING — wxt.config.ts has no `key`; unpacked ID falls back to being path-derived';
  }
} catch {
  /* leave UNKNOWN */
}

console.info(`
[ext:id] Signing key:  ${keyPath}
[ext:id] Pin status:   ${pinState}

Extension ID:
  ${extensionId}

OAuth redirect URI to register at developer.atlassian.com/console
(Authorization > OAuth 2.0 (3LO) > Callback URL) — trailing slash required:
  ${redirectUrl}

Manifest \`key\` for wxt.config.ts (PUBLIC — safe to commit):
  ${manifestKey}
`);
