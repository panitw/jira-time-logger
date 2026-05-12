import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { log } from '@/lib/log';
import { startOAuthFlow, type PendingConnection } from '@/lib/oauth/flow';
import { setTokens } from '@/lib/storage/tokens';

const STRINGS = {
  heading: 'Welcome to jira-time-logger',
  body: 'Connect to Jira to get started. The extension will read your assigned tickets and help you log time without leaving Chrome.',
  ctaConnect: 'Connect to Jira',
  ctaConnecting: 'Opening Jira…',
  disconnectNote: '(You can disconnect any time from Settings.)',
  pickerHeading: 'Pick a Jira site',
  pickerSub: 'Your account has access to more than one Jira Cloud site. Pick the one to connect.',
};

type Status =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'site-picker'; pending: PendingConnection };

type Props = {
  onConnected: (email: string, siteDomain: string) => void;
};

export function ConnectButton({ onConnected }: Props): React.ReactElement {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const handleConnect = async (): Promise<void> => {
    setStatus({ kind: 'connecting' });
    const result = await startOAuthFlow();

    if (result.kind !== 'ok') {
      log.warn('oauth.flow.result', { kind: result.kind });
      setStatus({ kind: 'idle' });
      // UX-DR30: no apology theatre — user can retry by clicking again.
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
    await setTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      cloudId,
    });
    log.info('oauth.flow.tokens-persisted', { cloudId });
    // Email + domain look-up happens in App.tsx after we transition; here we
    // pass back enough info to render the connected indicator immediately.
    let host = siteUrl;
    try {
      host = new URL(siteUrl).host;
    } catch {
      // siteUrl wasn't a URL — keep as-is.
    }
    onConnected('(loading email…)', host);
  };

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
    <section className="text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
        <img src="/icon/128.png" alt="" className="h-16 w-16 rounded-lg" />
      </div>
      <h2 className="text-3xl font-semibold text-neutral-900">{STRINGS.heading}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-neutral-500">{STRINGS.body}</p>
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
      <p className="mt-4 text-xs text-neutral-500">{STRINGS.disconnectNote}</p>
    </section>
  );
}
