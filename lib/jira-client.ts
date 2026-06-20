/**
 * Single wrapper for all Jira Cloud REST API v3 calls.
 *
 * Per architecture.md > API & Communication Patterns:
 *   - All Jira HTTP goes through this module
 *   - Returns Result<T, JiraError>
 *   - Routes through scheduler for rate limiting
 *   - Refreshes OAuth token on 401
 *   - Parses responses with Zod schemas from jira-types.ts
 */
import { type z } from 'zod';
import { log } from '@/lib/log';
import { refreshTokens } from '@/lib/oauth/refresh';
import { type Result, type JiraError, ok, authExpired, rateLimited, network, parseError, forbidden, notFound } from '@/lib/result';
import { scheduler } from '@/lib/scheduler';
import { getAuth, type AuthBundle } from '@/lib/storage/tokens';

function getBaseUrl(bundle: AuthBundle): string {
  if (bundle.kind === 'oauth') {
    return `https://api.atlassian.com/ex/jira/${bundle.cloudId}`;
  }
  return bundle.siteUrl;
}

function getAuthHeader(bundle: AuthBundle): string {
  if (bundle.kind === 'oauth') {
    return `Bearer ${bundle.access_token}`;
  }
  const encoded = btoa(`${bundle.email}:${bundle.apiToken}`);
  return `Basic ${encoded}`;
}

export async function jiraGet<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<Result<T, JiraError>> {
  const bundle = await getAuth();
  if (!bundle) {
    return authExpired();
  }

  const result = await scheduler.acquire(async () => {
    const url = `${getBaseUrl(bundle)}/${path}`;
    const headers: Record<string, string> = {
      Authorization: getAuthHeader(bundle),
      Accept: 'application/json',
    };

    log.debug('jira.get.request', { path });

    let res = await fetch(url, { headers });

    if (res.status === 401 && bundle.kind === 'oauth') {
      log.info('jira.get.401-refreshing', { path });
      const refreshResult = await refreshTokens();
      if (refreshResult.kind === 'ok') {
        const newBundle = await getAuth();
        if (!newBundle) return authExpired();
        headers.Authorization = getAuthHeader(newBundle);
        res = await fetch(url, { headers });
      } else {
        return authExpired();
      }
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
      return rateLimited(Number.isFinite(retryAfterMs) ? retryAfterMs : 1000);
    }

    if (res.status === 401) {
      return authExpired();
    }

    if (res.status === 403) {
      return forbidden();
    }

    if (res.status === 404) {
      return notFound();
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return network(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const json: unknown = await res.json().catch(() => null);
    if (json === null) {
      return parseError('Response body is not valid JSON');
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return parseError(parsed.error.issues);
    }

    return ok(parsed.data);
  });

  return result;
}