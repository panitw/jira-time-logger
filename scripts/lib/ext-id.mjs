// scripts/lib/ext-id.mjs
//
// Shared extension-identity helpers: derive the manifest `key` field and the
// resulting extension ID from the signing key PEM.
//
// Both `pack:crx` (which signs the .crx) and `ext:id` (which emits the manifest
// `key`) import from here so the packed artifact and the unpacked build can
// never disagree about the extension ID — a mismatch would silently break the
// registered OAuth callback URL. See docs/release.md.
//
// SECURITY: reads the private key only to derive its PUBLIC half. Never logs or
// returns private key material.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(__dirname, '..', '..');

export const DEFAULT_KEY_PATH = join(projectRoot, 'keys', 'jira-time-logger.pem');

/**
 * Resolve the signing key path from CRX_SIGNING_KEY env or the gitignored
 * default. Returns { ok: true, keyPath } or { ok: false, reason } — callers
 * decide how to report. Never reads/echoes key contents beyond an empty check.
 */
export function resolveSigningKeyPath() {
  const keyPath = process.env.CRX_SIGNING_KEY
    ? resolve(process.env.CRX_SIGNING_KEY)
    : DEFAULT_KEY_PATH;

  if (!existsSync(keyPath)) {
    return {
      ok: false,
      keyPath,
      reason:
        `Signing key not found at ${keyPath}. Retrieve from the team vault ` +
        `before packaging — see docs/release.md. (Set CRX_SIGNING_KEY to override the path.)`,
    };
  }

  let contents;
  try {
    contents = readFileSync(keyPath, 'utf8');
  } catch {
    return {
      ok: false,
      keyPath,
      reason:
        `Signing key at ${keyPath} is unreadable. Check permissions and retrieve ` +
        `a valid key from the team vault — see docs/release.md.`,
    };
  }

  if (!contents || contents.trim().length === 0) {
    return {
      ok: false,
      keyPath,
      reason:
        `Signing key at ${keyPath} is empty. Retrieve a valid key from the team ` +
        `vault before packaging — see docs/release.md.`,
    };
  }

  return { ok: true, keyPath };
}

/** Extract the DER-encoded SPKI public key from a private key PEM using openssl. */
export function publicKeyDerFromPem(keyPath) {
  return execFileSync('openssl', ['rsa', '-in', keyPath, '-pubout', '-outform', 'DER'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/**
 * Derive the extension ID from a DER-encoded SPKI public key.
 * ID = first 16 bytes of SHA-256(DER public key), hex-encoded, then each
 * hex nibble 0-9a-f mapped to a-p.
 */
export function deriveExtensionId(derPublicKey) {
  const hash = createHash('sha256').update(derPublicKey).digest();
  const first16 = hash.subarray(0, 16);
  let id = '';
  for (const byte of first16) {
    // Each byte → two hex nibbles → two mapped chars.
    id += String.fromCharCode('a'.charCodeAt(0) + (byte >> 4));
    id += String.fromCharCode('a'.charCodeAt(0) + (byte & 0x0f));
  }
  return id;
}

/**
 * The value for the manifest `key` field: base64 of the DER SPKI public key.
 * Placing this in the manifest pins the extension ID for UNPACKED loads to the
 * signing key instead of the install path, so dev loads, the packed .crx, other
 * machines, and Edge all resolve to the same ID.
 */
export function manifestKeyFromPem(keyPath) {
  return publicKeyDerFromPem(keyPath).toString('base64');
}

/** The OAuth redirect URI chrome.identity.getRedirectURL() will return for an ID. */
export function redirectUrlForId(extensionId) {
  return `https://${extensionId}.chromiumapp.org/`;
}
