import { useState } from 'react';
import { ApiTokenSetup } from '@/components/settings/ApiTokenSetup';
import { Button } from '@/components/ui/button';
import { log } from '@/lib/log';
import { startOAuthFlow, type PendingConnection } from '@/lib/oauth/flow';
import { setAuth } from '@/lib/storage/tokens';

const STRINGS = {
  heading: 'Welcome to jira-time-logger',
  body: 'Connect to Jira to get started. The extension will read your assigned tickets and help you log time without leaving Chrome.',
  ctaConnect: 'Connect to Jira',
  ctaConnecting: 'Opening Jira…',
  ctaUseApiToken: 'Or set up with an API token',
  disconnectNote: '(You can disconnect any time from Settings.)',
  pickerHeading: 'Pick a Jira site',
  pickerSub: 'Your account has access to more than one Jira Cloud site. Pick the one to connect.',
};

type Status =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'site-picker'; pending: PendingConnection }
  | { kind: 'api-token-form' };

type Props = {
  onConnected: (email: string, siteDomain: string) => void;
};

export function ConnectButton({ onConnected }: Props): React.ReactElement {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pickingSite, setPickingSite] = useState<string | null>(null);

  const handleConnect = async (): Promise<void> => {
    setStatus({ kind: 'connecting' });
    const result = await startOAuthFlow();

    if (result.kind !== 'ok') {
      log.warn('oauth.flow.result', { kind: result.kind });
      setStatus({ kind: 'idle' });
      return;
    }

    const { tokens, sites } = result.value;

    if (sites.length === 0) {
      log.warn('oauth.flow.no-sites', {});
      setStatus({ kind: 'idle' });
      return;
    }

    if (sites.length === 1) {
      await finalize(sites[0]!.id, sites[0]!.url, tokens);
      return;
    }

    setStatus({ kind: 'site-picker', pending: result.value });
  };

  const finalize = async (
    cloudId: string,
    siteUrl: string,
    tokens: PendingConnection['tokens'],
  ): Promise<void> => {
    setPickingSite(cloudId);
    try {
      await setAuth({
        kind: 'oauth',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
        cloudId,
      });
      log.info('oauth.flow.tokens-persisted', { cloudId });
      let host = siteUrl;
      try {
        host = new URL(siteUrl).host;
      } catch {
        // siteUrl wasn't a URL — keep as-is.
      }
      onConnected('(loading email…)', host);
    } catch (e) {
      log.error('oauth.flow.persist-error', { error: String(e) });
      setStatus({ kind: 'idle' });
    } finally {
      setPickingSite(null);
    }
  };

  if (status.kind === 'api-token-form') {
    return (
      <ApiTokenSetup
        onConnected={onConnected}
        onBack={() => setStatus({ kind: 'idle' })}
      />
    );
  }

  if (status.kind === 'site-picker') {
    return (
      <section>
        <h2 className="text-2xl font-semibold text-neutral-900">{STRINGS.pickerHeading}</h2>
        <p className="mt-2 text-sm text-neutral-500">{STRINGS.pickerSub}</p>
        <ul className="mt-4 space-y-2">
          {status.pending.sites.map((site) => (
            <li key={site.id}>
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => void finalize(site.id, site.url, status.pending.tokens)}
                disabled={pickingSite !== null}
                aria-label={`Connect to site ${site.name} at ${site.url}`}
              >
                <span className="flex flex-col items-start">
                  <span className="font-medium text-neutral-900">{site.name}</span>
                  <span className="text-xs text-neutral-500">{site.url}</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md rounded-lg bg-brand-gradient p-10 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
        <img src="/icon/128.png" alt="Jira Time Logger logo" className="h-16 w-16 rounded-lg" />
      </div>
      <h2 className="text-3xl font-semibold text-white">{STRINGS.heading}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-white/80">{STRINGS.body}</p>
      <div className="mt-6">
        <Button
          variant="primary"
          onClick={() => void handleConnect()}
          disabled={status.kind === 'connecting'}
          autoFocus
        >
          {status.kind === 'connecting' ? STRINGS.ctaConnecting : STRINGS.ctaConnect}
        </Button>
      </div>
      <p className="mt-3 text-xs">
        <button
          type="button"
          onClick={() => setStatus({ kind: 'api-token-form' })}
          className="text-white/70 underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-accent-deep focus-visible:rounded"
          disabled={status.kind === 'connecting'}
        >
          {STRINGS.ctaUseApiToken}
        </button>
      </p>
      <p className="mt-4 text-xs text-white/60">{STRINGS.disconnectNote}</p>
    </section>
  );
}
