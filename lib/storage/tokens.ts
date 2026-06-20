/**
 * Typed wrapper over `chrome.storage.local` for the authentication bundle.
 *
 * Two auth kinds are supported, distinguished by `kind`:
 *   - 'oauth'     — OAuth 2.0 (3LO + PKCE) tokens against api.atlassian.com.
 *                   Primary path; refresh flow ships in Story 1.2.
 *   - 'api-token' — Atlassian Cloud API token + email pair (Basic auth)
 *                   against the site URL directly. Added during Story 1.1
 *                   review to unblock environments awaiting OAuth admin
 *                   approval.
 *
 * Persistence contract: bundles are written atomically in a single setValue
 * call. Never write individual fields separately.
 *
 * Per architecture.md > Data Boundaries: auth credentials live ONLY in
 * `chrome.storage.local`. Never `localStorage`, never `sessionStorage`,
 * never IndexedDB.
 */
import { storage } from 'wxt/utils/storage';
import { z } from 'zod';
import { log } from '@/lib/log';

const OAuthBundleSchema = z.object({
  kind: z.literal('oauth'),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.string().min(1),
  cloudId: z.string().min(1),
});

const ApiTokenBundleSchema = z.object({
  kind: z.literal('api-token'),
  email: z.string().min(1),
  apiToken: z.string().min(1),
  siteUrl: z.string().min(1),
  accountId: z.string().min(1),
});

const AuthBundleSchema = z.discriminatedUnion('kind', [
  OAuthBundleSchema,
  ApiTokenBundleSchema,
]);

export type OAuthBundle = z.infer<typeof OAuthBundleSchema>;
export type ApiTokenBundle = z.infer<typeof ApiTokenBundleSchema>;
export type AuthBundle = OAuthBundle | ApiTokenBundle;

const authItem = storage.defineItem<AuthBundle | null>('local:tokens', {
  fallback: null,
});

export async function getAuth(): Promise<AuthBundle | null> {
  return authItem.getValue();
}

export async function setAuth(bundle: AuthBundle): Promise<void> {
  AuthBundleSchema.parse(bundle);
  await authItem.setValue(bundle);
}

export async function clearAuth(): Promise<void> {
  await authItem.setValue(null);
}

/**
 * For OAuth: validity = the access token hasn't expired.
 * For API token: validity = the bundle is present (API tokens don't expire
 *   on a fixed schedule; they're revoked manually by the user at id.atlassian.com).
 */
export function hasValidAuth(bundle: AuthBundle | null): boolean {
  if (!bundle) return false;
  if (bundle.kind === 'api-token') return true;
  const expiresAt = new Date(bundle.expires_at).getTime();
  // 60 s clock-skew buffer to avoid mid-flight expiry.
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000;
}

/** Subscribe to auth changes. Returns an unsubscribe function. */
export function onAuthChange(callback: (bundle: AuthBundle | null) => void): () => void {
  const unwatch = authItem.watch((newVal) => {
    try {
      callback(newVal);
    } catch (e) {
      log.error('tokens.on-change.error', { error: String(e) });
    }
  });
  return unwatch;
}

// ---- Legacy aliases (kept temporarily so other modules compile during
//      this refactor; remove these once all callers are updated) ----

/** @deprecated Use `getAuth()` instead. */
export const getTokens = getAuth;
/** @deprecated Use `setAuth()` instead. */
export const setTokens = setAuth;
/** @deprecated Use `clearAuth()` instead. */
export const clearTokens = clearAuth;
/** @deprecated Use `hasValidAuth()` instead. */
export const hasValidTokens = hasValidAuth;
