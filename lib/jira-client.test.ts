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
    setAuth: vi.fn(async (b: object) => {
      bundle = b;
    }),
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

const { jiraPost, postWorklog } = await import('./jira-client');
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

describe('postWorklog', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    // Reset auth bundle (prior jiraPost test clears it via clearAuth)
    const { setAuth } = await import('@/lib/storage/tokens');
    await setAuth({
      kind: 'oauth',
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      cloudId: 'cloud-id-1',
    } as never);
  });

  it('returns ok with parsed worklog on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: { get: () => null },
      json: async () => ({
        id: 'wl-1',
        timeSpentSeconds: 9000,
        timeSpent: '2h 30m',
        started: '2026-06-21T09:00:00.000+0000',
      }),
    });

    const result = await postWorklog('PROJ-123', {
      timeSpentSeconds: 9000,
      started: '2026-06-21T09:00:00.000+0000',
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.id).toBe('wl-1');
      expect(result.value.timeSpentSeconds).toBe(9000);
    }

    const callArgs = fetchMock.mock.calls[0]!;
    const url = callArgs[0] as string;
    expect(url).toContain('rest/api/3/issue/PROJ-123/worklog');
    expect(callArgs[1].method).toBe('POST');
    const body = JSON.parse(callArgs[1].body);
    expect(body.timeSpentSeconds).toBe(9000);
    expect(body.started).toBe('2026-06-21T09:00:00.000+0000');
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
        status: 201,
        headers: { get: () => null },
        json: async () => ({ id: 'wl-2', timeSpentSeconds: 3600 }),
      });

    const result = await postWorklog('PROJ-1', {
      timeSpentSeconds: 3600,
      started: '2026-06-21T09:00:00.000+0000',
    });
    expect(result.kind).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns rate-limited on 429', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: () => '5' },
      json: async () => ({}),
    });

    const result = await postWorklog('PROJ-1', {
      timeSpentSeconds: 3600,
      started: '2026-06-21T09:00:00.000+0000',
    });
    expect(result.kind).toBe('rate-limited');
  });

  it('returns parse-error on schema drift', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: { get: () => null },
      json: async () => ({ wrong: 'shape' }),
    });

    const result = await postWorklog('PROJ-1', {
      timeSpentSeconds: 3600,
      started: '2026-06-21T09:00:00.000+0000',
    });
    expect(result.kind).toBe('parse-error');
  });
});
