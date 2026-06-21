import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();

vi.stubGlobal('chrome', {
  runtime: { id: 'test-extension-id' },
});
vi.stubGlobal('fetch', fetchMock);
vi.stubGlobal('btoa', (s: string) => Buffer.from(s).toString('base64'));

vi.mock('@/lib/storage/tokens', () => {
  let bundle: object | null = {
    kind: 'oauth',
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    cloudId: 'cloud-id-1',
  };
  return {
    getAuth: vi.fn(async () => bundle),
    setAuth: vi.fn(),
    clearAuth: vi.fn(async () => {
      bundle = null;
    }),
    hasValidAuth: vi.fn((b: unknown) => b !== null),
  };
});

vi.mock('@/lib/scheduler', () => ({
  scheduler: {
    acquire: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  },
}));

vi.mock('@/lib/oauth/refresh', () => ({
  refreshTokens: vi.fn(async () => ({ kind: 'ok' })),
}));

const { jiraPost } = await import('./jira-client');
const { z } = await import('zod');

const TestSchema = z.object({ id: z.string(), name: z.string() });

describe('jiraPost', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns ok with parsed response on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ id: '1', name: 'created' }),
    });

    const result = await jiraPost(
      'rest/api/3/issue',
      { fields: { summary: 'test' } },
      TestSchema,
    );
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual({ id: '1', name: 'created' });
    }

    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[1].method).toBe('POST');
    expect(callArgs[1].headers['Content-Type']).toBe('application/json');
    expect(callArgs[1].body).toBe(JSON.stringify({ fields: { summary: 'test' } }));
  });

  it('refreshes OAuth token on 401 and retries', async () => {
    const { refreshTokens } = await import('@/lib/oauth/refresh');
    vi.mocked(refreshTokens).mockResolvedValueOnce({ kind: 'ok' } as never);

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => null },
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ id: '2', name: 'after-refresh' }),
      });

    const result = await jiraPost('rest/api/3/issue', {}, TestSchema);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual({ id: '2', name: 'after-refresh' });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
  });

  it('returns rate-limited on 429', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: () => '5' },
      json: async () => ({}),
    });

    const result = await jiraPost('rest/api/3/issue', {}, TestSchema);
    expect(result.kind).toBe('rate-limited');
  });

  it('returns parse-error on schema drift', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ wrong: 'shape' }),
    });

    const result = await jiraPost('rest/api/3/issue', {}, TestSchema);
    expect(result.kind).toBe('parse-error');
  });

  it('returns auth-expired when no auth bundle', async () => {
    const { clearAuth } = await import('@/lib/storage/tokens');
    await clearAuth();

    const result = await jiraPost('rest/api/3/issue', {}, TestSchema);
    expect(result.kind).toBe('auth-expired');
  });
});
