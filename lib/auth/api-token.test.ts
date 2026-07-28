import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeSiteUrl, validateApiToken } from './api-token';

describe('normalizeSiteUrl', () => {
  it.each([
    ['acme', 'https://acme.atlassian.net'],
    ['acme.atlassian.net', 'https://acme.atlassian.net'],
    ['https://acme.atlassian.net', 'https://acme.atlassian.net'],
    ['https://acme.atlassian.net/', 'https://acme.atlassian.net'],
    ['https://acme.atlassian.net///', 'https://acme.atlassian.net'],
    ['  acme  ', 'https://acme.atlassian.net'],
    ['HTTPS://ACME.ATLASSIAN.NET', 'https://acme.atlassian.net'],
    // Userinfo/port/path are dropped, not honoured — the canonical form is
    // rebuilt from the parsed hostname alone.
    ['https://acme.atlassian.net/jira/rest', 'https://acme.atlassian.net'],
    ['https://user:pass@acme.atlassian.net', 'https://acme.atlassian.net'],
  ])('normalizes %j → %j', (input, expected) => {
    expect(normalizeSiteUrl(input)).toBe(expected);
  });

  // `['http://my-internal-jira', 'http://my-internal-jira']` used to sit in
  // the table above — the vulnerable behaviour pinned as intended behaviour.
  // `normalizeSiteUrl`'s output is persisted and reused by `jira-client` as
  // the base for every request carrying `Authorization: Basic
  // base64(email:apiToken)`, so passing a host through meant handing a live
  // Jira credential to it (and, over `http://`, to the whole network path).
  //
  // Nothing that worked stopped working: `host_permissions` covers only
  // `https://*.atlassian.net/*`, so a self-hosted host had no permission and
  // would have failed CORS regardless. Supporting Data Center needs a
  // manifest entry too, not just a looser parser here.
  it.each([
    ['http://acme.atlassian.net', 'plaintext scheme — Basic auth in the clear'],
    ['http://my-internal-jira', 'plaintext scheme, non-Atlassian host'],
    ['http://127.0.0.1:8080', 'loopback over plaintext'],
    ['evil.com', 'arbitrary host'],
    ['https://evil.com', 'arbitrary host, explicit scheme'],
    ['acme.atlassian.net.evil.com', 'suffix typo-squat — the prefix check missed this'],
    ['https://acme.atlassian.net.evil.com', 'suffix typo-squat, explicit scheme'],
    ['https://evil.com/acme.atlassian.net', 'allowed host in the PATH, not the host'],
    ['https://evil.com#acme.atlassian.net', 'allowed host in the fragment'],
    ['https://atlassian.net', 'the bare apex is not a site'],
    ['ftp://acme.atlassian.net', 'non-http scheme'],
    ['javascript:alert(1)//acme.atlassian.net', 'script scheme'],
    ['', 'empty'],
    ['   ', 'whitespace only'],
  ])('REFUSES %j (%s)', (input) => {
    expect(normalizeSiteUrl(input)).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeSiteUrl('')).toBe('');
    expect(normalizeSiteUrl('   ')).toBe('');
  });
});

describe('validateApiToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok with myself payload on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            accountId: '5fae123',
            emailAddress: 'note@example.com',
            displayName: 'Note Wechasil',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const result = await validateApiToken({
      siteUrl: 'acme',
      email: 'note@example.com',
      apiToken: 'tok-abc',
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.accountId).toBe('5fae123');
      expect(result.value.emailAddress).toBe('note@example.com');
    }
  });

  it('calls the correct URL with normalized siteUrl and Basic auth header', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ accountId: 'a', displayName: 'd' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await validateApiToken({
      siteUrl: 'acme',
      email: 'note@example.com',
      apiToken: 'tok-abc',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://acme.atlassian.net/rest/api/3/myself');
    const headers = call[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${btoa('note@example.com:tok-abc')}`,
    );
    expect(headers.Accept).toBe('application/json');
    // Regression: must omit credentials so Chrome doesn't include the user's
    // existing Jira session cookie and authenticate via that instead of the
    // Basic auth header. A wrong token would otherwise return 200.
    expect(call[1].credentials).toBe('omit');
  });

  it('returns invalid-credentials on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    );

    const result = await validateApiToken({
      siteUrl: 'acme',
      email: 'wrong@example.com',
      apiToken: 'bad',
    });

    expect(result.kind).toBe('invalid-credentials');
  });

  it('returns forbidden on 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('forbidden', { status: 403 })),
    );

    const result = await validateApiToken({
      siteUrl: 'acme',
      email: 'note@example.com',
      apiToken: 'tok',
    });

    expect(result.kind).toBe('forbidden');
  });

  it('returns network on a 5xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 503 })),
    );

    const result = await validateApiToken({
      siteUrl: 'acme',
      email: 'note@example.com',
      apiToken: 'tok',
    });

    expect(result.kind).toBe('network');
  });

  it('returns network when fetch itself throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );

    const result = await validateApiToken({
      siteUrl: 'acme',
      email: 'note@example.com',
      apiToken: 'tok',
    });

    expect(result.kind).toBe('network');
  });

  it('returns parse-error on schema drift', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ accountId: 123 /* should be string */, displayName: 'd' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const result = await validateApiToken({
      siteUrl: 'acme',
      email: 'note@example.com',
      apiToken: 'tok',
    });

    expect(result.kind).toBe('parse-error');
  });

  it('returns parse-error when response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('<html>not json</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const result = await validateApiToken({
      siteUrl: 'acme',
      email: 'note@example.com',
      apiToken: 'tok',
    });

    expect(result.kind).toBe('parse-error');
  });
});

// Finding 1 (security review): the credential must never leave the browser
// when the site URL is not an Atlassian Cloud host. `validateApiToken`
// re-normalizes rather than trusting its caller, because it is exported and
// is the last checkpoint before `Authorization: Basic …` goes on the wire.
describe('validateApiToken — refuses to contact a non-Atlassian host', () => {
  it.each([
    'http://evil.com',
    'https://evil.com',
    'acme.atlassian.net.evil.com',
    'http://acme.atlassian.net',
  ])('never calls fetch for %j', async (siteUrl) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await validateApiToken({
      siteUrl,
      email: 'note@example.com',
      apiToken: 'tok-abc',
    });

    // Not "the request failed" — the request was never made. The credential
    // stayed in the browser.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.kind).toBe('invalid-site-url');
  });

  it('rejects even when the caller hands it a pre-built hostile URL', async () => {
    // The UI normalizes before calling, so this models a FUTURE caller that
    // skips that step — the reason the check lives here and not only there.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await validateApiToken({
      siteUrl: 'https://acme.atlassian.net.evil.com/rest/api/3/myself',
      email: 'note@example.com',
      apiToken: 'tok-abc',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.kind).toBe('invalid-site-url');
  });

  it('still accepts a legitimate site — the guard is not a blanket refusal', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ accountId: 'a', displayName: 'd' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await validateApiToken({
      siteUrl: 'acme',
      email: 'note@example.com',
      apiToken: 'tok-abc',
    });

    expect(result.kind).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
