import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('chrome', { runtime: { id: 'test' } });
vi.stubGlobal('fetch', vi.fn());
vi.stubGlobal('btoa', (s: string) => Buffer.from(s).toString('base64'));

vi.mock('@/lib/storage/tokens', () => {
  let bundle: object | null = { kind: 'oauth', access_token: 'x', refresh_token: 'y', expires_at: new Date(Date.now() + 1e6).toISOString(), cloudId: 'c' };
  return { getAuth: vi.fn(async () => bundle), setAuth: vi.fn(), clearAuth: vi.fn(async () => { bundle = null; }), hasValidAuth: vi.fn((b: unknown) => b !== null) };
});
vi.mock('@/lib/scheduler', () => ({ scheduler: { acquire: vi.fn(async <T>(fn: () => Promise<T>) => fn()) } }));
vi.mock('@/lib/oauth/refresh', () => ({ refreshTokens: vi.fn(async () => ({ kind: 'auth-expired' })) }));
vi.mock('@/lib/storage/settings', () => {
  let store: { managerDisplayName: string | null; skipLevelDisplayName: string | null } = { managerDisplayName: null, skipLevelDisplayName: null };
  return {
    setManagerNames: vi.fn(async (names: typeof store) => { store = names; }),
    getManagerNames: vi.fn(async () => store),
  };
});

const { resolveReportingLine } = await import('./manager-resolution');

const fetchMock = vi.mocked(fetch);

function okResponse(json: unknown): Response {
  return { ok: true, status: 200, json: async () => json, headers: new Headers() } as unknown as Response;
}

describe('resolveReportingLine', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns ok with both manager and skip-level when set', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ accountId: 'w1', displayName: 'Worker', emailAddress: 'w@x.com' }))
      .mockResolvedValueOnce(okResponse({ accountId: 'w1', displayName: 'Worker', manager: { accountId: 'm1', displayName: 'Marco Rivera' } }))
      .mockResolvedValueOnce(okResponse({ accountId: 'm1', displayName: 'Marco Rivera', manager: { accountId: 's1', displayName: 'Anika Patel' } }));

    const result = await resolveReportingLine();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.managerDisplayName).toBe('Marco Rivera');
      expect(result.value.skipLevelDisplayName).toBe('Anika Patel');
    }
  });

  it('returns manager only when skip-level is unset', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ accountId: 'w1', displayName: 'Worker' }))
      .mockResolvedValueOnce(okResponse({ accountId: 'w1', displayName: 'Worker', manager: { accountId: 'm1', displayName: 'Marco Rivera' } }))
      .mockResolvedValueOnce(okResponse({ accountId: 'm1', displayName: 'Marco Rivera' }));

    const result = await resolveReportingLine();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.managerDisplayName).toBe('Marco Rivera');
      expect(result.value.skipLevelDisplayName).toBeNull();
    }
  });

  it('returns manager-not-set when manager field is absent', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ accountId: 'w1', displayName: 'Worker' }))
      .mockResolvedValueOnce(okResponse({ accountId: 'w1', displayName: 'Worker' }));

    const result = await resolveReportingLine();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.managerDisplayName).toBeNull();
      expect(result.value.skipLevelDisplayName).toBeNull();
    }
  });

  it('returns network error when jiraGet fails', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ accountId: 'w1', displayName: 'Worker' }))
      .mockRejectedValueOnce(new Error('Network down'));

    const result = await resolveReportingLine();
    expect(result.kind).toBe('network');
  });

  it('returns parse-error on malformed myself response', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ accountId: 123, displayName: null }));

    const result = await resolveReportingLine();
    expect(result.kind).toBe('parse-error');
  });
});