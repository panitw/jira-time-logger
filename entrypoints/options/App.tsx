import { useEffect, useState } from 'react';
import { ConnectButton } from '@/components/settings/ConnectButton';
import { Button } from '@/components/ui/button';
import { ATLASSIAN_MYSELF_URL_TEMPLATE } from '@/lib/env';
import { log } from '@/lib/log';
import { getTokens, hasValidTokens, clearTokens } from '@/lib/storage/tokens';

const STRINGS = {
  brandWordmark: 'jira-time-logger',
  connectionHeading: 'Connection',
  disconnectLabel: 'Disconnect',
  loadingConnection: 'Checking connection…',
  managerSectionPlaceholder:
    'Reporting line and other settings will appear here in upcoming releases.',
};

type ViewState =
  | { kind: 'loading' }
  | { kind: 'first-run' }
  | { kind: 'connected'; email: string; siteDomain: string };

export function App(): React.ReactElement {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    void (async () => {
      const bundle = await getTokens();
      if (!hasValidTokens(bundle)) {
        setView({ kind: 'first-run' });
        return;
      }
      const meta = await fetchConnectedMeta(bundle!.access_token, bundle!.cloudId);
      setView({
        kind: 'connected',
        email: meta.email,
        siteDomain: meta.siteDomain,
      });
    })();
  }, []);

  const handleConnected = (email: string, siteDomain: string): void => {
    setView({ kind: 'connected', email, siteDomain });
  };

  // Story 1.1 ships a stub Disconnect — full handler is Story 1.3 (FR5).
  const handleDisconnectStub = async (): Promise<void> => {
    log.info('disconnect.stub-clicked', { note: 'full handler in Story 1.3' });
    await clearTokens();
    setView({ kind: 'first-run' });
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
                <span className="font-medium text-state-success">✓</span> Connected as{' '}
                <span className="font-mono">{view.email}</span> ({view.siteDomain})
              </p>
              <Button variant="secondary" onClick={() => void handleDisconnectStub()}>
                {STRINGS.disconnectLabel}
              </Button>
            </div>

            <p className="mt-12 text-sm text-neutral-500">
              {STRINGS.managerSectionPlaceholder}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

async function fetchConnectedMeta(
  accessToken: string,
  cloudId: string,
): Promise<{ email: string; siteDomain: string }> {
  let email = '(email unavailable)';
  let siteDomain = '(site unknown)';
  try {
    const myselfUrl = ATLASSIAN_MYSELF_URL_TEMPLATE.replace('{cloudId}', cloudId);
    const res = await fetch(myselfUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (res.ok) {
      const me = (await res.json()) as { emailAddress?: string; accountId?: string };
      email = me.emailAddress ?? me.accountId ?? email;
    } else {
      log.warn('options.myself.failed', { status: res.status });
    }
    // accessible-resources call: re-fetch site URL to derive domain.
    const arRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (arRes.ok) {
      const sites = (await arRes.json()) as Array<{ id: string; url: string }>;
      const match = sites.find((s) => s.id === cloudId);
      if (match) {
        try {
          siteDomain = new URL(match.url).host;
        } catch {
          siteDomain = match.url;
        }
      }
    }
  } catch (e) {
    log.warn('options.connected-meta.error', { cause: String(e) });
  }
  return { email, siteDomain };
}
