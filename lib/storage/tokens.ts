/**
 * Typed wrapper over `chrome.storage.local` for the OAuth token bundle.
 *
 * Persistence contract: `{access_token, refresh_token, expires_at, cloudId}`
 * are written atomically in a single setValue call (AC #10). Never write
 * fields separately.
 *
 * Per architecture.md > Data Boundaries: tokens live ONLY in
 * `chrome.storage.local`. Never `localStorage`, never `sessionStorage`,
 * never IndexedDB.
 */
import { storage } from 'wxt/utils/storage';

export type TokenBundle = {
  access_token: string;
  refresh_token: string;
  /** ISODateTime string — `new Date(expires_at) > now` means valid */
  expires_at: string;
  cloudId: string;
};

const tokensItem = storage.defineItem<TokenBundle | null>('local:tokens', {
  fallback: null,
});

export async function getTokens(): Promise<TokenBundle | null> {
  return tokensItem.getValue();
}

export async function setTokens(bundle: TokenBundle): Promise<void> {
  // Atomic write — single setValue call per AC #10.
  await tokensItem.setValue(bundle);
}

export async function clearTokens(): Promise<void> {
  await tokensItem.setValue(null);
}

export function hasValidTokens(bundle: TokenBundle | null): boolean {
  if (!bundle) return false;
  const expiresAt = new Date(bundle.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

// Exposed for tests so they can subscribe to changes if needed.
export { tokensItem };
