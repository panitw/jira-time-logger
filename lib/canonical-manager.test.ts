import { describe, it, expect, vi, beforeEach } from 'vitest';

import { type Result, type JiraError, ok, network } from '@/lib/result';

// Mock the I/O boundary (`jiraGet`) — mirrors lib/manager-resolution.direct-reports.test.ts.
const mockJiraGet = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  jiraGet: (...args: unknown[]) => mockJiraGet(...args) as unknown,
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { resolveCanonicalManager } = await import('./canonical-manager');

function okResult<T>(value: T): Result<T, JiraError> {
  return ok(value);
}

describe('resolveCanonicalManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries the directory with the report accountId and &expand=manager', async () => {
    mockJiraGet.mockResolvedValueOnce(
      okResult({
        accountId: 'r1',
        displayName: 'Report One',
        manager: { accountId: 'me', displayName: 'Big Boss' },
      }),
    );

    await resolveCanonicalManager('r1', 'me');

    expect(mockJiraGet).toHaveBeenCalledTimes(1);
    const path = mockJiraGet.mock.calls[0]?.[0] as string;
    expect(path).toBe('rest/api/3/user?accountId=r1&expand=manager');
  });

  it('encodes the report accountId in the path', async () => {
    mockJiraGet.mockResolvedValueOnce(
      okResult({ accountId: 'a b/c', displayName: 'Spaced', manager: { accountId: 'me', displayName: 'Boss' } }),
    );

    await resolveCanonicalManager('a b/c', 'me');

    const path = mockJiraGet.mock.calls[0]?.[0] as string;
    expect(path).toBe('rest/api/3/user?accountId=a%20b%2Fc&expand=manager');
  });

  it('is canonical when manager.accountId equals the current user', async () => {
    mockJiraGet.mockResolvedValueOnce(
      okResult({
        accountId: 'r1',
        displayName: 'Report One',
        manager: { accountId: 'me', displayName: 'Big Boss' },
      }),
    );

    const result = await resolveCanonicalManager('r1', 'me');

    expect(result).toEqual({ isCanonical: true, canonicalManagerName: 'Big Boss' });
  });

  it('is non-canonical when manager.accountId differs from the current user', async () => {
    mockJiraGet.mockResolvedValueOnce(
      okResult({
        accountId: 'r1',
        displayName: 'Report One',
        manager: { accountId: 'other', displayName: 'Other Manager' },
      }),
    );

    const result = await resolveCanonicalManager('r1', 'me');

    expect(result).toEqual({ isCanonical: false, canonicalManagerName: 'Other Manager' });
  });

  it('fails closed (non-canonical, null name) when the lookup errors', async () => {
    mockJiraGet.mockResolvedValueOnce(network('boom'));

    const result = await resolveCanonicalManager('r1', 'me');

    expect(result).toEqual({ isCanonical: false, canonicalManagerName: null });
  });

  it('fails closed when the manager field is absent', async () => {
    mockJiraGet.mockResolvedValueOnce(
      okResult({ accountId: 'r1', displayName: 'Report One' }),
    );

    const result = await resolveCanonicalManager('r1', 'me');

    expect(result).toEqual({ isCanonical: false, canonicalManagerName: null });
  });
});
