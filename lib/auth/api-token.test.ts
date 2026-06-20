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
    ['http://my-internal-jira', 'http://my-internal-jira'],
  ])('normalizes %j → %j', (input, expected) => {
    expect(normalizeSiteUrl(input)).toBe(expected);
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
