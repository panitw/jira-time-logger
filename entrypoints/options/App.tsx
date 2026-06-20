import { useEffect, useState } from 'react';
import { z } from 'zod';
import { CatchAllProjectField } from '@/components/settings/CatchAllProjectField';
import { ConnectButton } from '@/components/settings/ConnectButton';
import { CycleField } from '@/components/settings/CycleField';
import { DiagnosticsBlock } from '@/components/settings/DiagnosticsBlock';
import { DisconnectAction } from '@/components/settings/DisconnectAction';
import { ManagerDisplay, type ManagerNames } from '@/components/settings/ManagerDisplay';
import { ReminderTimeField } from '@/components/settings/ReminderTimeField';
import { TargetHoursField } from '@/components/settings/TargetHoursField';
import {
  ATLASSIAN_ACCESSIBLE_RESOURCES_URL,
  ATLASSIAN_MYSELF_URL_TEMPLATE,
} from '@/lib/env';
import { log } from '@/lib/log';
import { resolveReportingLine } from '@/lib/manager-resolution';
import {
  getAuth,
  hasValidAuth,
  type AuthBundle,
} from '@/lib/storage/tokens';

const MyselfSchema = z.object({
  emailAddress: z.string().optional(),
  accountId: z.string().optional(),
});
const AccessibleResourceSchema = z.object({
  id: z.string(),
  url: z.string(),
});
const AccessibleResourcesSchema = z.array(AccessibleResourceSchema);

const STRINGS = {
  brandWordmark: 'jira-time-logger',
  connectionHeading: 'Connection',
  loadingConnection: 'Checking connection…',
  connectedAs: 'Connected as',
  emailUnavailable: '(email unavailable)',
  siteUnknown: '(site unknown)',
  authMethodOAuth: 'via OAuth',
  authMethodApiToken: 'via API token',
};

type ViewState =
  | { kind: 'loading' }
  | { kind: 'first-run' }
  | {
      kind: 'connected';
      email: string;
      siteDomain: string;
      authMethod: 'oauth' | 'api-token';
    };

export function App(): React.ReactElement {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [managerResolving, setManagerResolving] = useState(false);
  const [managerError, setManagerError] = useState(false);
  const [managerNames, setManagerNames] = useState<ManagerNames | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const bundle = await getAuth();
        if (!hasValidAuth(bundle)) {
          setView({ kind: 'first-run' });
          return;
        }
        const meta = await resolveConnectedMeta(bundle!);
        setView({
          kind: 'connected',
          email: meta.email,
          siteDomain: meta.siteDomain,
          authMethod: bundle!.kind,
        });
      } catch (e) {
        log.error('options.init.error', { cause: String(e) });
        setView({ kind: 'first-run' });
      }
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (view.kind !== 'connected') return;
    const ac = new AbortController();
    setManagerResolving(true);
    setManagerError(false);
    void (async () => {
      const result = await resolveReportingLine();
      if (ac.signal.aborted) return;
      if (result.kind === 'ok') {
        setManagerNames(result.value);
      } else {
        log.warn('options.manager-resolution.failed', { kind: result.kind });
        setManagerError(true);
      }
      if (!ac.signal.aborted) {
        setManagerResolving(false);
      }
    })();
    return () => ac.abort();
  }, [view.kind]);

  const handleConnected = (email: string, siteDomain: string): void => {
    // Read the auth kind from storage so the badge label is accurate.
    void (async () => {
      const bundle = await getAuth();
      setView({
        kind: 'connected',
        email,
        siteDomain,
        authMethod: bundle?.kind ?? 'oauth',
      });
    })();
  };

  return (
    <div className="min-h-screen">
      <header className="bg-brand-gradient px-8 py-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <img src="/icon/48.png" alt="" className="h-8 w-8 rounded" />
          <h1 className="text-lg font-semibold text-white">{STRINGS.brandWordmark}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-8 py-8">
        {view.kind === 'loading' && (
          <p className="text-sm text-neutral-500">{STRINGS.loadingConnection}</p>
        )}

        {view.kind === 'first-run' && <ConnectButton onConnected={handleConnected} />}

        {view.kind === 'connected' && (
          <section>
            <h2 className="text-2xl font-semibold text-neutral-900">
              {STRINGS.connectionHeading}
            </h2>
            <hr className="my-3 border-neutral-200" />
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-neutral-700">
                <span className="font-medium text-state-success">✓</span> {STRINGS.connectedAs}{' '}
                <span className="font-mono">{view.email}</span> ({view.siteDomain}){' '}
                <span className="text-xs text-neutral-500">
                  {view.authMethod === 'oauth' ? STRINGS.authMethodOAuth : STRINGS.authMethodApiToken}
                </span>
              </p>
              <DisconnectAction onDisconnected={() => setView({ kind: 'first-run' })} />
            </div>

            <ManagerDisplay
              managerDisplayName={managerNames?.managerDisplayName ?? null}
              skipLevelDisplayName={managerNames?.skipLevelDisplayName ?? null}
              loading={managerResolving}
              error={managerError}
            />

            <CatchAllProjectField />
            <ReminderTimeField />
            <TargetHoursField />
            <CycleField />
            <DiagnosticsBlock />
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * Resolve the email + site-domain to show on the Connection row, branching on
 * the auth method:
 *   - OAuth     → fetch /myself via api.atlassian.com/ex/jira/{cloudId}/... and
 *                 derive the site URL from accessible-resources.
 *   - API token → both values are already in the bundle.
 */
async function resolveConnectedMeta(
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
  let email = STRINGS.emailUnavailable;
  let siteDomain = STRINGS.siteUnknown;
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
