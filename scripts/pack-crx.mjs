#!/usr/bin/env node
// scripts/pack-crx.mjs — Story 6.3 (AR30)
//
// One-command CRX packager. Builds the WXT output for Chrome and Edge, then uses
// the LOCAL Chrome binary's CRX3 packer (`--pack-extension`) to emit a signed,
// version-stamped `.crx` for each target. No new npm dependency — shells out to
// Chrome + openssl (already on the release machine).
//
// SECURITY: the signing key is read from `CRX_SIGNING_KEY` env or a gitignored
// default path (keys/jira-time-logger.pem). This script NEVER generates a
// production key, NEVER writes key material into the repo, and NEVER logs key
// contents. See docs/release.md for the vault runbook.
//
// Usage:
//   CRX_SIGNING_KEY=/path/to/signing.pem pnpm pack:crx
//   CHROME_PATH=/path/to/chrome pnpm pack:crx   (if Chrome is not auto-located)

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, statSync, rmSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const DEFAULT_KEY_PATH = join(projectRoot, 'keys', 'jira-time-logger.pem');

/** Print an error and exit non-zero. */
function fail(message) {
  console.error(`\n[pack:crx] ERROR: ${message}\n`);
  process.exit(1);
}

function info(message) {
  console.info(`[pack:crx] ${message}`);
}

/** Read { version, name } from package.json. */
function readPackageMeta() {
  const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  if (!pkg.version) fail('package.json has no "version" field.');
  return { version: pkg.version, name: pkg.name };
}

/**
 * Resolve the signing key path from CRX_SIGNING_KEY env or the gitignored
 * default. Fail fast (before any build/pack) if missing, unreadable, or empty.
 * Never logs key contents.
 */
function resolveSigningKey() {
  const keyPath = process.env.CRX_SIGNING_KEY
    ? resolve(process.env.CRX_SIGNING_KEY)
    : DEFAULT_KEY_PATH;

  if (!existsSync(keyPath)) {
    fail(
      `Signing key not found at ${keyPath}. Retrieve from the team vault before ` +
        `packaging — see docs/release.md. (Set CRX_SIGNING_KEY to override the path.)`
    );
  }

  let contents;
  try {
    contents = readFileSync(keyPath, 'utf8');
  } catch {
    fail(
      `Signing key at ${keyPath} is unreadable. Check permissions and retrieve a ` +
        `valid key from the team vault — see docs/release.md.`
    );
  }

  if (!contents || contents.trim().length === 0) {
    fail(
      `Signing key at ${keyPath} is empty. Retrieve a valid key from the team ` +
        `vault before packaging — see docs/release.md.`
    );
  }

  return keyPath;
}

/**
 * Resolve the Chrome binary from CHROME_PATH env or platform-typical defaults.
 * Fail fast (naming CHROME_PATH) if not found.
 */
function resolveChromeBinary() {
  if (process.env.CHROME_PATH) {
    const p = resolve(process.env.CHROME_PATH);
    if (!existsSync(p)) {
      fail(
        `CHROME_PATH is set to ${p} but that file does not exist. Point CHROME_PATH ` +
          `at a Chrome/Chromium binary — see docs/release.md.`
      );
    }
    return p;
  }

  const candidatesByPlatform = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
  };

  const candidates = candidatesByPlatform[platform()] ?? [];
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    fail(
      `Could not locate a Chrome/Chromium binary. Set CHROME_PATH to your Chrome ` +
        `executable — see docs/release.md. (Checked: ${candidates.join(', ') || 'none for this platform'})`
    );
  }
  return found;
}

/** Run `wxt build` for the given browser target so output/ is fresh. */
function build(target) {
  const args = ['wxt', 'build'];
  if (target === 'edge') args.push('-b', 'edge');
  info(`Building ${target} (wxt build${target === 'edge' ? ' -b edge' : ''})...`);
  execFileSync('npx', args, { cwd: projectRoot, stdio: 'inherit' });
}

/**
 * Derive the extension ID from a DER-encoded SPKI public key.
 * ID = first 16 bytes of SHA-256(DER public key), hex-encoded, then each
 * hex nibble 0-9a-f mapped to a-p.
 */
function deriveExtensionId(derPublicKey) {
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

/** Extract the DER SPKI public key from a private key PEM using openssl. */
function publicKeyDerFromPem(keyPath) {
  // openssl reads the private key and emits the DER-encoded SPKI public key to stdout.
  return execFileSync(
    'openssl',
    ['rsa', '-in', keyPath, '-pubout', '-outform', 'DER'],
    { cwd: projectRoot, stdio: ['ignore', 'pipe', 'ignore'] }
  );
}

/**
 * Pack one unpacked extension dir into a version-stamped signed .crx.
 * Chrome writes `<dir>.crx` (and, if no key was given, `<dir>.pem`) beside the
 * dir; we rename the .crx to the version-stamped name.
 */
function pack({ chrome, keyPath, unpackedDir, outCrxName }) {
  if (!existsSync(unpackedDir)) {
    fail(`Expected build output dir not found: ${unpackedDir}. Did the build succeed?`);
  }

  const producedCrx = `${unpackedDir}.crx`;
  // Remove any stale artifact from a previous run so we detect a genuine pack.
  if (existsSync(producedCrx)) rmSync(producedCrx);

  info(`Packing ${unpackedDir} → ${outCrxName} ...`);
  try {
    execFileSync(
      chrome,
      [
        `--pack-extension=${unpackedDir}`,
        `--pack-extension-key=${keyPath}`,
        '--no-message-box',
      ],
      { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err) {
    // Chrome sometimes exits non-zero; surface stderr but still verify the file below.
    const stderr = err?.stderr?.toString?.() ?? '';
    if (stderr) console.error(stderr.trim());
  }

  // Chrome may exit 0 even on failure — verify the .crx actually exists & is non-empty.
  if (!existsSync(producedCrx) || statSync(producedCrx).size === 0) {
    fail(
      `Chrome did not produce a valid .crx for ${unpackedDir}. Check the key and ` +
        `Chrome binary — see docs/release.md.`
    );
  }

  const outPath = join(projectRoot, outCrxName);
  renameSync(producedCrx, outPath);

  const { version } = readPackageMeta();
  const size = statSync(outPath).size;
  const extId = deriveExtensionId(publicKeyDerFromPem(keyPath));

  info(`✓ ${outCrxName}`);
  info(`    version:      ${version}`);
  info(`    size:         ${size} bytes (${(size / 1024).toFixed(1)} KiB)`);
  info(`    extension ID: ${extId}`);
  return { outPath, size, extId, version };
}

function main() {
  const { version } = readPackageMeta();
  info(`Packaging jira-time-logger v${version}`);

  // Fail-fast BEFORE building/packing: key + Chrome must both resolve.
  const keyPath = resolveSigningKey();
  const chrome = resolveChromeBinary();
  info(`Signing key: ${keyPath}`);
  info(`Chrome:      ${chrome}`);

  build('chrome');
  build('edge');

  const results = [];
  results.push(
    pack({
      chrome,
      keyPath,
      unpackedDir: join(projectRoot, 'output', 'chrome-mv3'),
      outCrxName: `jira-time-logger-${version}.crx`,
    })
  );
  results.push(
    pack({
      chrome,
      keyPath,
      unpackedDir: join(projectRoot, 'output', 'edge-mv3'),
      outCrxName: `jira-time-logger-edge-${version}.crx`,
    })
  );

  info('\nDone. Produced (gitignored) artifacts:');
  for (const r of results) info(`  ${r.outPath}  [id ${r.extId}]`);
  info('\nReminder: post the .crx to the Microsoft Teams channel per docs/release.md (HUMAN step).');
}

main();
