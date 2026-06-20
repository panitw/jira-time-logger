import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { validateApiToken, normalizeSiteUrl } from '@/lib/auth/api-token';
import { log } from '@/lib/log';
import { setAuth } from '@/lib/storage/tokens';

const STRINGS = {
  heading: 'Set up with an API token',
  body: 'Enter your Atlassian Cloud site URL, the email you sign in with, and an API token. You can create a token at id.atlassian.com.',
  tokenLinkLabel: 'Create an API token →',
  tokenLinkUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
  siteLabel: 'Jira Cloud site URL',
  sitePlaceholder: 'acme.atlassian.net',
  siteHelper: 'Just the host — e.g. acme.atlassian.net',
  emailLabel: 'Atlassian login email',
  emailPlaceholder: 'you@example.com',
  apiTokenLabel: 'API token',
  apiTokenPlaceholder: 'Paste the token you just generated',
  apiTokenHelper: 'Treated like a password. Stored only in this browser.',
  ctaConnect: 'Connect',
  ctaConnecting: 'Verifying…',
  ctaBack: 'Back',
  errorInvalid: "Couldn't sign in with those credentials. Double-check the email and token.",
  errorForbidden:
    'Your account is recognized but lacks API access. Ask your Jira admin to grant API access to your role.',
  errorNetwork: "Can't reach the site. Check the URL is correct and your network is up.",
  errorParse: 'Unexpected response from Jira. Try again or use a different site URL.',
};

type Status =
  | { kind: 'idle' }
  | { kind: 'verifying' }
  | { kind: 'error'; message: string };

type Props = {
  onConnected: (email: string, siteDomain: string) => void;
  onBack: () => void;
};

export function ApiTokenSetup({ onConnected, onBack }: Props): React.ReactElement {
  const [siteUrl, setSiteUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const isDisabled =
    status.kind === 'verifying' ||
    siteUrl.trim().length === 0 ||
    email.trim().length === 0 ||
    apiToken.trim().length === 0;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (isDisabled) return;
    setStatus({ kind: 'verifying' });

    const canonicalSiteUrl = normalizeSiteUrl(siteUrl);
    const result = await validateApiToken({
      siteUrl: canonicalSiteUrl,
      email: email.trim(),
      apiToken: apiToken.trim(),
    });

    if (result.kind !== 'ok') {
      log.warn('apitoken.setup.result', { kind: result.kind });
      const message = errorMessageFor(result.kind);
      setStatus({ kind: 'error', message });
      return;
    }

    await setAuth({
      kind: 'api-token',
      email: email.trim(),
      apiToken: apiToken.trim(),
      siteUrl: canonicalSiteUrl,
      accountId: result.value.accountId,
    });
    log.info('apitoken.setup.persisted', { siteUrl: canonicalSiteUrl });

    let host = canonicalSiteUrl;
    try {
      host = new URL(canonicalSiteUrl).host;
    } catch {
      // unchanged
    }
    const displayEmail = result.value.emailAddress ?? email.trim();
    onConnected(displayEmail, host);
  };

  return (
    <section>
      <h2 className="text-2xl font-semibold text-neutral-900">{STRINGS.heading}</h2>
      <p className="mt-2 text-sm text-neutral-500">{STRINGS.body}</p>
      <p className="mt-2 text-sm">
        <a
          href={STRINGS.tokenLinkUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent hover:text-accent-hover underline-offset-2 hover:underline"
        >
          {STRINGS.tokenLinkLabel}
        </a>
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
        <Field
          id="api-site"
          label={STRINGS.siteLabel}
          helper={STRINGS.siteHelper}
          value={siteUrl}
          onChange={setSiteUrl}
          placeholder={STRINGS.sitePlaceholder}
          autoFocus
          autoComplete="url"
        />
        <Field
          id="api-email"
          label={STRINGS.emailLabel}
          value={email}
          onChange={setEmail}
          placeholder={STRINGS.emailPlaceholder}
          type="email"
          autoComplete="email"
        />
        <Field
          id="api-token"
          label={STRINGS.apiTokenLabel}
          helper={STRINGS.apiTokenHelper}
          value={apiToken}
          onChange={setApiToken}
          placeholder={STRINGS.apiTokenPlaceholder}
          type="password"
          autoComplete="off"
        />

        {status.kind === 'error' && (
          <p
            className="rounded-md border border-state-danger bg-state-danger-subtle px-3 py-2 text-sm text-state-danger"
            role="alert"
            aria-live="assertive"
          >
            {status.message}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onBack} disabled={status.kind === 'verifying'}>
            {STRINGS.ctaBack}
          </Button>
          <Button type="submit" variant="primary" disabled={isDisabled}>
            {status.kind === 'verifying' ? STRINGS.ctaConnecting : STRINGS.ctaConnect}
          </Button>
        </div>
      </form>
    </section>
  );
}

function errorMessageFor(kind: string): string {
  switch (kind) {
    case 'invalid-credentials':
      return STRINGS.errorInvalid;
    case 'forbidden':
      return STRINGS.errorForbidden;
    case 'parse-error':
      return STRINGS.errorParse;
    default:
      return STRINGS.errorNetwork;
  }
}

type FieldProps = {
  id: string;
  label: string;
  helper?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  autoComplete?: string;
};

function Field({
  id,
  label,
  helper,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
  autoComplete,
}: FieldProps): React.ReactElement {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 placeholder:text-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        aria-describedby={helper ? `${id}-helper` : undefined}
      />
      {helper && (
        <p id={`${id}-helper`} className="mt-1 text-xs text-neutral-500">
          {helper}
        </p>
      )}
    </div>
  );
}
