import { describe, it, expect, vi, beforeEach } from 'vitest';

import { type Result, type JiraError, ok, network } from '@/lib/result';

// AC 12: mock the `jiraGet` boundary (the existing `resolveReportingLine` tests
// drive the real fetch stack; these direct-report tests live in a sibling file
// so mocking `@/lib/jira-client` here does not disturb those). Mirrors the
// `vi.mock('@/lib/jira-client', …)` pattern used in lib/parser.test.ts.
const mockJiraGet = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  jiraGet: (...args: unknown[]) => mockJiraGet(...args) as unknown,
}));

const mockGetCached = vi.fn();
const mockSetCached = vi.fn();
vi.mock('@/lib/storage/direct-reports', () => ({
  getCachedDirectReports: (id: string) => mockGetCached(id) as unknown,
  setCachedDirectReports: (id: string, reports: unknown) =>
    mockSetCached(id, reports) as unknown,
}));

vi.mock('@/lib/storage/settings', () => ({
  setManagerNames: vi.fn(),
  getManagerNames: vi.fn(),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { findDirectReports, hasDirectReports } = await import('./manager-resolution');

function okResult<T>(value: T): Result<T, JiraError> {
  return ok(value);
}

describe('findDirectReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the reports whose manager matches the current user', async () => {
    mockJiraGet
      // user/search directory candidates
      .mockResolvedValueOnce(
        okResult([
          { accountId: 'me', displayName: 'Me' },
          { accountId: 'r1', displayName: 'Report One' },
          { accountId: 'x1', displayName: 'Someone Else' },
        ]),
      )
      // per-candidate expansions (r1 reports to me, x1 does not)
      .mockResolvedValueOnce(
        okResult({ accountId: 'r1', displayName: 'Report One', manager: { accountId: 'me', displayName: 'Me' } }),
      )
      .mockResolvedValueOnce(
        okResult({ accountId: 'x1', displayName: 'Someone Else', manager: { accountId: 'other', displayName: 'Other' } }),
      );

    const result = await findDirectReports('me');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual([{ accountId: 'r1', displayName: 'Report One' }]);
    }
  });

  it('uses an already-expanded manager field without a second lookup', async () => {
    mockJiraGet.mockResolvedValueOnce(
      okResult([
        { accountId: 'r1', displayName: 'Report One', manager: { accountId: 'me', displayName: 'Me' } },
      ]),
    );
    const result = await findDirectReports('me');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual([{ accountId: 'r1', displayName: 'Report One' }]);
    }
    // Only the directory query — no per-candidate expansion needed.
    expect(mockJiraGet).toHaveBeenCalledTimes(1);
  });

  it('returns ok([]) when the directory matches nobody', async () => {
    mockJiraGet
      .mockResolvedValueOnce(okResult([{ accountId: 'x1', displayName: 'X' }]))
      .mockResolvedValueOnce(
        okResult({ accountId: 'x1', displayName: 'X', manager: { accountId: 'other', displayName: 'O' } }),
      );
    const result = await findDirectReports('me');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual([]);
    }
  });

  it('propagates a JiraError when the directory query fails', async () => {
    mockJiraGet.mockResolvedValueOnce(network('boom'));
    const result = await findDirectReports('me');
    expect(result.kind).toBe('network');
  });

  it('skips a candidate whose expansion fails rather than failing the whole resolution', async () => {
    mockJiraGet
      .mockResolvedValueOnce(
        okResult([
          { accountId: 'r1', displayName: 'Report One' },
          { accountId: 'r2', displayName: 'Report Two' },
        ]),
      )
      .mockResolvedValueOnce(network('candidate down'))
      .mockResolvedValueOnce(
        okResult({ accountId: 'r2', displayName: 'Report Two', manager: { accountId: 'me', displayName: 'Me' } }),
      );
    const result = await findDirectReports('me');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual([{ accountId: 'r2', displayName: 'Report Two' }]);
    }
  });
});

describe('hasDirectReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true from a fresh cache without re-fetching the directory', async () => {
    mockJiraGet.mockResolvedValueOnce(okResult({ accountId: 'me', displayName: 'Me' }));
    mockGetCached.mockResolvedValueOnce({ reports: [{ accountId: 'r1', displayName: 'R1' }], fresh: true });

    expect(await hasDirectReports()).toBe(true);
    // Only the myself call — no directory query.
    expect(mockJiraGet).toHaveBeenCalledTimes(1);
    expect(mockSetCached).not.toHaveBeenCalled();
  });

  it('returns false from a fresh empty cache', async () => {
    mockJiraGet.mockResolvedValueOnce(okResult({ accountId: 'me', displayName: 'Me' }));
    mockGetCached.mockResolvedValueOnce({ reports: [], fresh: true });
    expect(await hasDirectReports()).toBe(false);
    expect(mockJiraGet).toHaveBeenCalledTimes(1);
  });

  it('re-fetches and caches when the cache is stale', async () => {
    mockJiraGet
      .mockResolvedValueOnce(okResult({ accountId: 'me', displayName: 'Me' })) // myself
      .mockResolvedValueOnce(
        okResult([{ accountId: 'r1', displayName: 'R1', manager: { accountId: 'me', displayName: 'Me' } }]),
      ); // directory
    mockGetCached.mockResolvedValueOnce({ reports: [], fresh: false });
    mockSetCached.mockResolvedValueOnce(undefined);

    expect(await hasDirectReports()).toBe(true);
    expect(mockSetCached).toHaveBeenCalledWith('me', [{ accountId: 'r1', displayName: 'R1' }]);
  });

  it('re-fetches when there is no cache at all', async () => {
    mockJiraGet
      .mockResolvedValueOnce(okResult({ accountId: 'me', displayName: 'Me' }))
      .mockResolvedValueOnce(okResult([]));
    mockGetCached.mockResolvedValueOnce(null);
    mockSetCached.mockResolvedValueOnce(undefined);

    expect(await hasDirectReports()).toBe(false);
    expect(mockSetCached).toHaveBeenCalledWith('me', []);
  });

  it('fails closed to false when the myself call errors', async () => {
    mockJiraGet.mockResolvedValueOnce(network('myself down'));
    expect(await hasDirectReports()).toBe(false);
  });

  it('fails closed to false when the directory query errors', async () => {
    mockJiraGet
      .mockResolvedValueOnce(okResult({ accountId: 'me', displayName: 'Me' }))
      .mockResolvedValueOnce(network('directory down'));
    mockGetCached.mockResolvedValueOnce(null);
    expect(await hasDirectReports()).toBe(false);
    expect(mockSetCached).not.toHaveBeenCalled();
  });

  it('fails closed to false when an unexpected error is thrown', async () => {
    mockJiraGet.mockRejectedValueOnce(new Error('kaboom'));
    expect(await hasDirectReports()).toBe(false);
  });
});
