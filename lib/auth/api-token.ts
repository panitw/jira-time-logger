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
  | { kind: 'network'; cause: string }
  | { kind: 'parse-error'; issue: unknown }
  | { kind: 'forbidden' };

export const MyselfSchema = z.object({
  accountId: z.string().min(1),
  emailAddress: z.string().optional(),
  displayName: z.string(),
});

export type MyselfResponse = z.infer<typeof MyselfSchema>;

/**
 * Accept user input in any of these shapes and produce a canonical site URL:
 *   "acme"                      → https://acme.atlassian.net
 *   "acme.atlassian.net"        → https://acme.atlassian.net
 *   "https://acme.atlassian.net" → https://acme.atlassian.net
 *   "https://acme.atlassian.net/" → https://acme.atlassian.net (strip trailing /)
 */
export function normalizeSiteUrl(input: string): string {
  let s = input.trim();
  if (s.length === 0) return '';

  // Strip surrounding whitespace and trailing slashes.
  s = s.replace(/\/+$/, '');

  // If no dot and no scheme, treat as bare slug.
  if (!s.includes('.') && !s.startsWith('http')) {
    s = `${s}.atlassian.net`;
  }
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  return s;
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
  const siteUrl = normalizeSiteUrl(input.siteUrl);
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
