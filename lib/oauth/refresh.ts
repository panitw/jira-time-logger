import { z } from 'zod';
import { ATLASSIAN_TOKEN_URL, ATLASSIAN_CLIENT_ID } from '@/lib/env';
import { log } from '@/lib/log';
import { type Result, ok } from '@/lib/result';
import { acquireRefreshLock, releaseRefreshLock, isRefreshing } from '@/lib/storage/refresh-mutex';
import { type OAuthBundle, getAuth, setAuth, clearAuth, hasValidAuth } from '@/lib/storage/tokens';

export type RefreshError =
  | { kind: 'auth-expired' }
  | { kind: 'network'; cause: string }
  | { kind: 'parse-error'; issue: unknown }
  | { kind: 'rate-limited'; retryAfterMs: number }
  | { kind: 'no-oauth-bundle' }
  | { kind: 'lock-contention'; message: string };

export function refreshAuthExpired(): RefreshError {
  return { kind: 'auth-expired' };
}

export function refreshNetwork(cause: string): RefreshError {
  return { kind: 'network', cause };
}

export function refreshParseError(issue: unknown): RefreshError {
  return { kind: 'parse-error', issue };
}

export function refreshRateLimited(retryAfterMs: number): RefreshError {
  return { kind: 'rate-limited', retryAfterMs };
}

export function refreshNoOauthBundle(): RefreshError {
  return { kind: 'no-oauth-bundle' };
}

export function refreshLockContention(message: string): RefreshError {
  return { kind: 'lock-contention', message };
}

const RefreshTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string(),
  token_type: z.literal('Bearer'),
});

let refreshPromise: Promise<Result<OAuthBundle, RefreshError>> | null = null;

export async function refreshTokens(): Promise<Result<OAuthBundle, RefreshError>> {
  const bundle = await getAuth();

  if (!bundle) {
    log.debug('auth.refresh.no-bundle', {});
    return refreshNoOauthBundle();
  }

  if (bundle.kind === 'api-token') {
    log.debug('auth.refresh.api-token-skipped', {});
    return refreshNoOauthBundle();
  }

  if (hasValidAuth(bundle)) {
    const expiresAt = new Date(bundle.expires_at).getTime();
    if (expiresAt > Date.now() + 120_000) {
      log.debug('auth.refresh.already-fresh', { expires_at: bundle.expires_at });
      return ok(bundle);
    }
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = executeRefresh(bundle);
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function executeRefresh(bundle: OAuthBundle): Promise<Result<OAuthBundle, RefreshError>> {
  let lockAcquired = false;
  try {
    lockAcquired = await acquireRefreshLock();
    if (!lockAcquired) {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const updated = await getAuth();
        if (updated && updated.kind === 'oauth' && hasValidAuth(updated)) {
          return ok(updated);
        }
        const stillRefreshing = await isRefreshing();
        if (!stillRefreshing) {
          const final = await getAuth();
          if (final && final.kind === 'oauth' && hasValidAuth(final)) {
            return ok(final);
          }
          return refreshLockContention('Refresh completed but no valid OAuth bundle found');
        }
      }
      const lastAttempt = await getAuth();
      if (lastAttempt && lastAttempt.kind === 'oauth' && hasValidAuth(lastAttempt)) {
        return ok(lastAttempt);
      }
      return refreshLockContention('Timed out waiting for in-flight refresh');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(ATLASSIAN_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: ATLASSIAN_CLIENT_ID,
          refresh_token: bundle.refresh_token,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      const message = e instanceof DOMException && e.name === 'AbortError'
        ? 'Token endpoint request timed out'
        : String(e);
      log.warn('auth.refresh.network-error', { cause: message });
      return refreshNetwork(message);
    }

    if (res.status === 429) {
      clearTimeout(timeout);
      const retryAfter = res.headers.get('Retry-After');
      const parsed = retryAfter ? parseInt(retryAfter, 10) : NaN;
      const ms = Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 60_000;
      log.warn('auth.refresh.rate-limited', { retryAfterMs: ms });
      return refreshRateLimited(ms);
    }

    if (res.status >= 400 && res.status < 500) {
      clearTimeout(timeout);
      log.warn('auth.refresh.expired', { status: res.status });
      await clearAuth();
      return refreshAuthExpired();
    }

    if (!res.ok) {
      clearTimeout(timeout);
      const body = await safeText(res);
      log.warn('auth.refresh.server-error', { status: res.status, body });
      return refreshNetwork(`Token endpoint returned ${res.status}: ${body}`);
    }

    let json: unknown;
    try {
      json = await res.json();
      clearTimeout(timeout);
    } catch (e) {
      clearTimeout(timeout);
      log.warn('auth.refresh.parse-json-error', { cause: String(e) });
      return refreshParseError('Token response not valid JSON');
    }

    const parsed = RefreshTokenResponseSchema.safeParse(json);
    if (!parsed.success) {
      log.warn('auth.refresh.schema-drift', { issue: parsed.error.issues[0] });
      return refreshParseError(parsed.error.issues[0]);
    }

    const data = parsed.data;
    if (!Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 31_536_000) {
      log.warn('auth.refresh.invalid-expires-in', { expires_in: data.expires_in });
      return refreshParseError(`Invalid expires_in: ${data.expires_in}`);
    }

    const newBundle: OAuthBundle = {
      kind: 'oauth',
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      cloudId: bundle.cloudId,
    };

    await setAuth(newBundle);
    log.info('auth.refresh.success', { expiresAt: newBundle.expires_at });
    return ok(newBundle);
  } finally {
    if (lockAcquired) {
      await releaseRefreshLock();
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<unreadable>';
  }
}