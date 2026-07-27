/**
 * Resolve the email + site-domain to show on Settings' Connection block.
 *
 * Moved verbatim from `entrypoints/options/App.tsx` (Story 7.10, D-7.10-39):
 * the options page becomes a redirect and carries no fetch logic of its
 * own, but this logic doesn't die — the Connection block still needs it.
 * Log event names (`options.myself.*`, `options.accessible-resources.*`,
 * `options.connected-meta.error`) stay byte-identical (D-7.10-48) —
 * renaming operator-facing log keys is churn with no user value and breaks
 * any operator grep.
 */
import { z } from 'zod';
import {
  ATLASSIAN_ACCESSIBLE_RESOURCES_URL,
  ATLASSIAN_MYSELF_URL_TEMPLATE,
} from '@/lib/env';
import { log } from '@/lib/log';
import type { AuthBundle } from '@/lib/storage/tokens';

const MyselfSchema = z.object({
  emailAddress: z.string().optional(),
  accountId: z.string().optional(),
});
const AccessibleResourceSchema = z.object({
  id: z.string(),
  url: z.string(),
});
const AccessibleResourcesSchema = z.array(AccessibleResourceSchema);

export const CONNECTION_META_STRINGS = {
  emailUnavailable: '(email unavailable)',
  siteUnknown: '(site unknown)',
};

/**
 * Resolve the email + site-domain to show on the Connection row, branching on
 * the auth method:
 *   - OAuth     → fetch /myself via api.atlassian.com/ex/jira/{cloudId}/... and
 *                 derive the site URL from accessible-resources.
 *   - API token → both values are already in the bundle.
 */
export async function resolveConnectedMeta(
  bundle: AuthBundle,
): Promise<{ email: string; siteDomain: string }> {
  if (bundle.kind === 'api-token') {
    let siteDomain = bundle.siteUrl;
    try {
      siteDomain = new URL(bundle.siteUrl).host;
    } catch {
      // unchanged
    }
    return { email: bundle.email, siteDomain };
  }
  return fetchOAuthConnectedMeta(bundle.access_token, bundle.cloudId);
}

async function fetchOAuthConnectedMeta(
  accessToken: string,
  cloudId: string,
): Promise<{ email: string; siteDomain: string }> {
  let email = CONNECTION_META_STRINGS.emailUnavailable;
  let siteDomain = CONNECTION_META_STRINGS.siteUnknown;
  try {
    const myselfUrl = ATLASSIAN_MYSELF_URL_TEMPLATE.replace('{cloudId}', cloudId);
    const res = await fetch(myselfUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (res.ok) {
      const json = await res.json();
      const parsed = MyselfSchema.safeParse(json);
      if (parsed.success) {
        email = parsed.data.emailAddress ?? parsed.data.accountId ?? email;
      } else {
        log.warn('options.myself.schema-mismatch', { issues: parsed.error.issues });
      }
    } else {
      log.warn('options.myself.failed', { status: res.status });
    }
    const arRes = await fetch(ATLASSIAN_ACCESSIBLE_RESOURCES_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (arRes.ok) {
      const json = await arRes.json();
      const parsed = AccessibleResourcesSchema.safeParse(json);
      if (parsed.success) {
        const match = parsed.data.find((s) => s.id === cloudId);
        if (match) {
          try {
            siteDomain = new URL(match.url).host;
          } catch {
            siteDomain = match.url;
          }
        }
      } else {
        log.warn('options.accessible-resources.schema-mismatch', { issues: parsed.error.issues });
      }
    }
  } catch (e) {
    log.warn('options.connected-meta.error', { cause: String(e) });
  }
  return { email, siteDomain };
}
