import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const TestSchema = z.object({ id: z.string(), name: z.string() });

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
    clearAuth: vi.fn(async () => { bundle = null; }),
    hasValidAuth: vi.fn((b: unknown) => b !== null),
  };
});

vi.mock('@/lib/scheduler', () => ({
  scheduler: {
    acquire: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  },
}));

vi.mock('@/lib/oauth/refresh', () => ({
  refreshTokens: vi.fn(async () => ({ kind: 'auth-expired' })),
}));

const { jiraGet } = await import('./jira-client');

describe('jiraGet', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns ok with parsed response on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', name: 'test' }),
    });

    const result = await jiraGet('rest/api/3/myself', TestSchema);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual({ id: '1', name: 'test' });
    }
  });

  it('returns rate-limited on 429', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: () => '30' },
      json: async () => ({}),
    });

    const result = await jiraGet('rest/api/3/myself', TestSchema);
    expect(result.kind).toBe('rate-limited');
    if (result.kind === 'rate-limited') {
      expect(result.retryAfterMs).toBe(30000);
    }
  });

  it('returns forbidden on 403', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => null },
      json: async () => ({}),
    });

    const result = await jiraGet('rest/api/3/issue/RESTRICTED', TestSchema);
    expect(result.kind).toBe('forbidden');
  });

  it('returns not-found on 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({}),
    });

    const result = await jiraGet('rest/api/3/issue/MISSING', TestSchema);
    expect(result.kind).toBe('not-found');
  });

  it('returns network on 5xx', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => 'Internal Server Error',
    });

    const result = await jiraGet('rest/api/3/myself', TestSchema);
    expect(result.kind).toBe('network');
  });

  it('returns parse-error on schema drift', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 123, name: null }),
    });

    const result = await jiraGet('rest/api/3/myself', TestSchema);
    expect(result.kind).toBe('parse-error');
  });

  it('returns parse-error when response is not JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Unexpected token');
      },
    });

    const result = await jiraGet('rest/api/3/myself', TestSchema);
    expect(result.kind).toBe('parse-error');
  });
});