/**
 * OAuth 2.0 (3LO + PKCE) flow against Atlassian Cloud.
 *
 * Returns a Result<T, OAuthError> — never throws. UI dispatches on `kind`.
 * The verifier + state are persisted to chrome.storage.session for the
 * duration of the auth round-trip; cleared on completion (success or failure).
 *
 * See architecture.md > Already Locked + prd.md FR1–4 + NFR10–11.
 */
import { z } from 'zod';
import { generateCodeVerifier, generateCodeChallenge, generateStateToken } from './pkce';
import {
  ATLASSIAN_AUTH_URL,
  ATLASSIAN_TOKEN_URL,
  ATLASSIAN_ACCESSIBLE_RESOURCES_URL,
  ATLASSIAN_CLIENT_ID,
  OAUTH_AUDIENCE,
  OAUTH_SCOPES,
} from '@/lib/env';
import { log } from '@/lib/log';
import {
  type Result,
  type OAuthError,
  ok,
  oauthCancelled,
  oauthCsrfMismatch,
  oauthError,
  network,
  parseError,
} from '@/lib/result';

// ---- Schemas ----

export const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string(),
  token_type: z.literal('Bearer'),
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const AccessibleResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  scopes: z.array(z.string()).optional(),
  avatarUrl: z.string().optional(),
});
export const AccessibleResourcesSchema = z.array(AccessibleResourceSchema);
export type AccessibleResource = z.infer<typeof AccessibleResourceSchema>;

// ---- Public shape returned by startOAuthFlow ----

export type PendingConnection = {
  /** Tokens already obtained; cloudId not yet chosen (multi-site case). */
  tokens: {
    access_token: string;
    refresh_token: string;
    /** ISODateTime computed from `Date.now() + expires_in * 1000`. */
    expires_at: string;
  };
  /** All sites the user can access; UI decides single-vs-multi-pick. */
  sites: AccessibleResource[];
};

// ---- Session storage keys for PKCE state ----

const SESSION_KEY_VERIFIER = 'oauth.code_verifier';
const SESSION_KEY_STATE = 'oauth.state';

async function setSession(key: string, value: string): Promise<void> {
  await chrome.storage.session.set({ [key]: value });
}

async function getSession(key: string): Promise<string | undefined> {
  const obj = await chrome.storage.session.get(key);
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

async function clearSession(): Promise<void> {
  await chrome.storage.session.remove([SESSION_KEY_VERIFIER, SESSION_KEY_STATE]);
}

// ---- Flow ----

/**
 * Initiate the OAuth flow.
 *
 * Steps:
 *   1. Generate PKCE verifier + challenge + CSRF state; persist to session.
 *   2. Open Atlassian authorize URL via chrome.identity.launchWebAuthFlow.
 *   3. Parse callback URL for code + state; verify state.
 *   4. Exchange code for tokens at the token endpoint.
 *   5. Look up accessible-resources.
 *   6. Return tokens + sites for the UI to handle the single-/multi-site choice.
 *
 * On any failure path returns a Result variant; never throws. The session-
 * scoped verifier + state are always cleared before return.
 */
export async function startOAuthFlow(): Promise<Result<PendingConnection, OAuthError>> {
  try {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const stateToken = generateStateToken();

    await setSession(SESSION_KEY_VERIFIER, verifier);
    await setSession(SESSION_KEY_STATE, stateToken);

    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = buildAuthUrl({
      redirectUri,
      codeChallenge: challenge,
      state: stateToken,
    });

    log.info('oauth.flow.started', { redirectUri });

    const launch = await launchWebAuthFlow(authUrl);
    if (launch.kind === 'cancelled') {
      log.warn('oauth.flow.cancelled', {});
      await clearSession();
      return oauthCancelled();
    }
    if (launch.kind === 'error') {
      log.error('oauth.flow.launch-error', { message: launch.message });
      await clearSession();
      return oauthError(launch.message);
    }

    const { code, state: returnedState, error: oauthErrorCode } = parseCallbackUrl(launch.url);

    if (oauthErrorCode) {
      log.warn('oauth.flow.error', { oauthErrorCode });
      await clearSession();
      return oauthError(oauthErrorCode);
    }

    if (!code) {
      await clearSession();
      return oauthError('missing-code');
    }

    const expectedState = await getSession(SESSION_KEY_STATE);
    if (!expectedState || returnedState !== expectedState) {
      log.warn('oauth.flow.csrf-mismatch', {});
      await clearSession();
      return oauthCsrfMismatch();
    }

    const storedVerifier = await getSession(SESSION_KEY_VERIFIER);
    if (!storedVerifier) {
      await clearSession();
      return oauthError('missing-verifier');
    }

    const tokenResult = await exchangeCodeForTokens({
      code,
      verifier: storedVerifier,
      redirectUri,
    });

    if (tokenResult.kind !== 'ok') {
      await clearSession();
      return tokenResult;
    }

    const tokenData = tokenResult.value;
    if (
      !Number.isFinite(tokenData.expires_in) ||
      tokenData.expires_in <= 0 ||
      tokenData.expires_in > 31_536_000
    ) {
      await clearSession();
      return parseError('invalid expires_in value');
    }
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    const sitesResult = await fetchAccessibleResources(tokenData.access_token);
    if (sitesResult.kind !== 'ok') {
      await clearSession();
      return sitesResult;
    }

    await clearSession();
    log.info('oauth.flow.success', { siteCount: sitesResult.value.length });

    return ok({
      tokens: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
      },
      sites: sitesResult.value,
    });
  } catch (e) {
    try {
      await clearSession();
    } catch {
      // Session storage may have been torn down — best-effort cleanup.
    }
    return oauthError(String(e));
  }
}

// ---- Helpers ----

export function buildAuthUrl(opts: {
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    audience: OAUTH_AUDIENCE,
    client_id: ATLASSIAN_CLIENT_ID,
    scope: OAUTH_SCOPES.join(' '),
    redirect_uri: opts.redirectUri,
    state: opts.state,
    response_type: 'code',
    prompt: 'consent',
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${ATLASSIAN_AUTH_URL}?${params.toString()}`;
}

export function parseCallbackUrl(callbackUrl: string): {
  code?: string;
  state?: string;
  error?: string;
} {
  const url = new URL(callbackUrl);
  const out: { code?: string; state?: string; error?: string } = {};
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (code !== null) out.code = code;
  if (state !== null) out.state = state;
  if (error !== null) out.error = error;
  return out;
}

type LaunchResult =
  | { kind: 'ok'; url: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

async function launchWebAuthFlow(authUrl: string): Promise<LaunchResult> {
  log.debug('oauth.launch.url', { authUrl });
  return new Promise((resolve) => {
    const timeoutMs = 120_000;
    const timer = setTimeout(() => {
      resolve({ kind: 'error', message: 'OAuth flow timed out' });
    }, timeoutMs);
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        clearTimeout(timer);
        const message = lastError.message ?? 'unknown';
        const cancelled =
          /user did not approve|user(.+)cancel|cancelled/i.test(message) === true;
        resolve(cancelled ? { kind: 'cancelled' } : { kind: 'error', message });
        return;
      }
      if (!responseUrl) {
        clearTimeout(timer);
        resolve({ kind: 'cancelled' });
        return;
      }
      clearTimeout(timer);
      resolve({ kind: 'ok', url: responseUrl });
    });
  });
}

async function exchangeCodeForTokens(opts: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<Result<TokenResponse, OAuthError>> {
  let res: Response;
  try {
    res = await fetch(ATLASSIAN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: ATLASSIAN_CLIENT_ID,
        code: opts.code,
        redirect_uri: opts.redirectUri,
        code_verifier: opts.verifier,
      }),
    });
  } catch (e) {
    return network(String(e));
  }

  if (!res.ok) {
    const body = await safeReadText(res);
    return oauthError(`token-exchange ${res.status} ${body}`);
  }

  const json = await safeReadJson(res);
  if (json === undefined) {
    return parseError('token response not JSON');
  }
  const parsed = TokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    return parseError(parsed.error.issues[0]);
  }
  return ok(parsed.data);
}

async function fetchAccessibleResources(
  accessToken: string,
): Promise<Result<AccessibleResource[], OAuthError>> {
  let res: Response;
  try {
    res = await fetch(ATLASSIAN_ACCESSIBLE_RESOURCES_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
  } catch (e) {
    return network(String(e));
  }

  if (!res.ok) {
    return oauthError(`accessible-resources ${res.status}`);
  }

  const json = await safeReadJson(res);
  if (json === undefined) {
    return parseError('accessible-resources not JSON');
  }
  const parsed = AccessibleResourcesSchema.safeParse(json);
  if (!parsed.success) {
    return parseError(parsed.error.issues[0]);
  }
  return ok(parsed.data);
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<unreadable>';
  }
}
