/**
 * Atlassian Cloud API-token authentication.
 *
 * Atlassian Cloud uses email + API token paired via HTTP Basic Auth:
 *   Authorization: Basic base64(<email>:<apiToken>)
 *
 * Users create an API token at https://id.atlassian.com/manage-profile/security/api-tokens.
 *
 * This is a fallback to OAuth 2.0 (3LO + PKCE) for environments where the
 * OAuth app is awaiting admin approval. The PRD originally deferred this to
 * v1.x but it was promoted to v1.0 during Story 1.1 review.
 *
 * Validation strategy: call `GET <siteUrl>/rest/api/3/myself` with Basic auth.
 *   200 → credentials are valid; return accountId + emailAddress + displayName.
 *   401 → invalid credentials (wrong token, wrong email, revoked token).
 *   403 → token valid but user lacks permission (unusual for /myself).
 *   else → network or parse error.
 */
import { z } from 'zod';
import { log } from '@/lib/log';
import {
  type Result,
  ok,
  network,
  parseError,
  forbidden,
  authExpired,
} from '@/lib/result';

export type ApiTokenError =
  | { kind: 'invalid-credentials' }
  | { kind: 'invalid-site-url' }
  | { kind: 'network'; cause: string }
  | { kind: 'parse-error'; issue: unknown }
  | { kind: 'forbidden' };

export const MyselfSchema = z.object({
  accountId: z.string().min(1),
  emailAddress: z.string().optional(),
  displayName: z.string(),
});

export type MyselfResponse = z.infer<typeof MyselfSchema>;

/** The only host suffix this extension will send credentials to. */
const ALLOWED_HOST_SUFFIX = '.atlassian.net';

/**
 * Accept user input in any of these shapes and produce a canonical site URL:
 *   "acme"                       → https://acme.atlassian.net
 *   "acme.atlassian.net"         → https://acme.atlassian.net
 *   "https://acme.atlassian.net" → https://acme.atlassian.net
 *   "https://acme.atlassian.net/" → https://acme.atlassian.net
 *
 * Returns `''` for anything that does not resolve to an `https://` host under
 * `.atlassian.net` — the caller MUST treat that as a refusal.
 *
 * SECURITY: this is a credential boundary, not a convenience formatter. The
 * value returned here is persisted and then reused by `lib/jira-client.ts`
 * (`getBaseUrl`) as the base for EVERY subsequent request, each carrying
 * `Authorization: Basic base64(email:apiToken)` — and base64 is encoding, not
 * encryption. Before this guard the function passed through any host and
 * preserved a plaintext `http://` scheme, so a single mistyped or phished
 * entry ("acme.atlassian.net.evil.com", "http://evil.com") exfiltrated a live
 * Jira credential on the validation call and on every call after it. Host
 * permissions are not a backstop: a cross-origin request carrying an
 * `Authorization` header triggers a CORS preflight, and an attacker's own
 * server answers it permissively.
 *
 * The allowlist deliberately mirrors `wxt.config.ts`'s `host_permissions`
 * (`https://*.atlassian.net/*`). A self-hosted Jira Server/Data Center host
 * could never have worked through this extension anyway — it holds no
 * permission for such an origin, and the request would fail CORS — so this
 * rejects only inputs that were already non-functional, plus the hostile ones.
 */
export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (trimmed.length === 0) return '';

  // A bare slug ("acme") becomes a site host; everything else must already
  // carry (or be given) a scheme so `new URL` can parse it authoritatively.
  // Hand-rolled prefix matching is what let `acme.atlassian.net.evil.com`
  // through before — only a real URL parse knows where the host ends.
  const candidate =
    !trimmed.includes('.') && !/^https?:\/\//i.test(trimmed)
      ? `https://${trimmed}${ALLOWED_HOST_SUFFIX}`
      : /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return '';
  }

  // Plaintext would put the Basic credential on the wire in the clear.
  if (url.protocol !== 'https:') return '';
  if (!url.hostname.toLowerCase().endsWith(ALLOWED_HOST_SUFFIX)) return '';

  // Rebuild from the parsed hostname alone: this drops any userinfo, port,
  // path, query or fragment, so nothing the user pasted can redirect the
  // request away from the host that was just checked.
  return `https://${url.hostname.toLowerCase()}`;
}

export type ValidateInput = {
  siteUrl: string;
  email: string;
  apiToken: string;
};

/**
 * Validate the (siteUrl, email, apiToken) tuple by calling /myself.
 * Returns the user's accountId + display info on success.
 */
export async function validateApiToken(
  input: ValidateInput,
): Promise<Result<MyselfResponse, ApiTokenError>> {
  // Re-normalize rather than trusting the caller's string. This function is
  // the last point before a credential goes on the wire, and it is exported
  // — a future caller that skips the UI's normalization must not be able to
  // aim the Basic header at an arbitrary host. Fails closed BEFORE `fetch`,
  // so a rejected host is never contacted at all.
  const siteUrl = normalizeSiteUrl(input.siteUrl);
  if (siteUrl === '') {
    log.warn('apitoken.validate.rejected-site-url', {});
    return { kind: 'invalid-site-url' };
  }
  const url = `${siteUrl}/rest/api/3/myself`;
  const credentials = btoa(`${input.email}:${input.apiToken}`);

  log.info('apitoken.validate.start', { siteUrl });

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/json',
      },
      // CRITICAL: omit cookies. Without this, Chrome includes the user's
      // existing Jira session cookie (the extension has host_permissions
      // for *.atlassian.net), and Atlassian authenticates via that cookie,
      // ignoring our Basic auth header. A wrong token would then return 200
      // because the cookie validates the request — completely defeating
      // the point of validating the token. Same caveat applies to every
      // future Jira API call in Story 1.4's jira-client wrapper.
      credentials: 'omit',
    });
  } catch (e) {
    log.warn('apitoken.validate.network', { cause: String(e) });
    return network(String(e)) as ApiTokenError;
  }

  if (res.status === 401) {
    log.warn('apitoken.validate.unauthorized', {});
    return { kind: 'invalid-credentials' };
  }
  if (res.status === 403) {
    log.warn('apitoken.validate.forbidden', {});
    return forbidden() as ApiTokenError;
  }
  if (!res.ok) {
    log.warn('apitoken.validate.bad-status', { status: res.status });
    return network(`HTTP ${res.status}`) as ApiTokenError;
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return parseError('myself response not JSON') as ApiTokenError;
  }

  const parsed = MyselfSchema.safeParse(json);
  if (!parsed.success) {
    log.warn('apitoken.validate.parse-error', { issue: parsed.error.issues[0] });
    return parseError(parsed.error.issues[0]) as ApiTokenError;
  }

  log.info('apitoken.validate.success', { accountId: parsed.data.accountId });
  return ok(parsed.data);
}

// authExpired is re-used by future stories' refresh logic; importing it here
// keeps the module's import list aligned with sibling auth modules.
void authExpired;
