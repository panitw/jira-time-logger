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

const {
  jiraPost,
  postWorklog,
  postComment,
  jiraPut,
  jiraDelete,
  updateWorklog,
  deleteWorklog,
  fetchCurrentUserWeekWorklogs,
  fetchCurrentUserWeekWorklogsByIssue,
  fetchReportCycleWorklogsByEpic,
} = await import('./jira-client');
const { z } = await import('zod');

async function resetAuthBundle(): Promise<void> {
  const { setAuth } = await import('@/lib/storage/tokens');
  await setAuth({
    kind: 'oauth',
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    cloudId: 'cloud-id-1',
  } as never);
}

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

describe('postComment', () => {
  const adfBody = {
    body: {
      type: 'doc' as const,
      version: 1 as const,
      content: [
        { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'approval' }] },
      ],
    },
  };

  beforeEach(async () => {
    fetchMock.mockReset();
    await resetAuthBundle();
  });

  it('POSTs to the issue comment endpoint with the { body: <AdfDoc> } shape', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: { get: () => null },
      json: async () => ({ id: 'c-1', created: '2026-06-27T10:00:00.000+0000', body: {} }),
    });

    const result = await postComment('PROJ-123', adfBody);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.id).toBe('c-1');
      expect(result.value.created).toBe('2026-06-27T10:00:00.000+0000');
    }

    const callArgs = fetchMock.mock.calls[0]!;
    const url = callArgs[0] as string;
    expect(url).toContain('rest/api/3/issue/PROJ-123/comment');
    expect(callArgs[1].method).toBe('POST');
    const sent = JSON.parse(callArgs[1].body);
    // ADF is nested under `body`, NOT the flat worklog shape.
    expect(sent.body.type).toBe('doc');
    expect(sent.body.content[0].content[0].text).toBe('approval');
  });

  it('url-encodes the issue key', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: { get: () => null },
      json: async () => ({ id: 'c-2', created: '2026-06-27T10:00:00.000+0000', body: {} }),
    });
    await postComment('PRO J/1', adfBody);
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('rest/api/3/issue/PRO%20J%2F1/comment');
  });

  it('returns rate-limited on 429', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: () => '5' },
      json: async () => ({}),
    });
    const result = await postComment('PROJ-1', adfBody);
    expect(result.kind).toBe('rate-limited');
  });

  it('returns network on a 5xx', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => 'boom',
    });
    const result = await postComment('PROJ-1', adfBody);
    expect(result.kind).toBe('network');
  });

  it('returns forbidden on 403', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await postComment('PROJ-1', adfBody);
    expect(result.kind).toBe('forbidden');
  });

  it('returns not-found on 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await postComment('PROJ-1', adfBody);
    expect(result.kind).toBe('not-found');
  });

  it('returns parse-error on schema drift', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: { get: () => null },
      json: async () => ({ wrong: 'shape' }),
    });
    const result = await postComment('PROJ-1', adfBody);
    expect(result.kind).toBe('parse-error');
  });
});

describe('jiraPut', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await resetAuthBundle();
  });

  it('returns ok with parsed response and uses PUT', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ id: '1', name: 'updated' }),
    });

    const result = await jiraPut('rest/api/3/thing/1', { name: 'updated' }, TestSchema);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual({ id: '1', name: 'updated' });
    }
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[1].method).toBe('PUT');
    expect(callArgs[1].headers['Content-Type']).toBe('application/json');
    expect(callArgs[1].body).toBe(JSON.stringify({ name: 'updated' }));
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

    const result = await jiraPut('rest/api/3/thing/1', {}, TestSchema);
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
    const result = await jiraPut('rest/api/3/thing/1', {}, TestSchema);
    expect(result.kind).toBe('rate-limited');
  });

  it('returns forbidden on 403', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await jiraPut('rest/api/3/thing/1', {}, TestSchema);
    expect(result.kind).toBe('forbidden');
  });

  it('returns not-found on 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await jiraPut('rest/api/3/thing/1', {}, TestSchema);
    expect(result.kind).toBe('not-found');
  });

  it('returns parse-error on schema drift', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ wrong: 'shape' }),
    });
    const result = await jiraPut('rest/api/3/thing/1', {}, TestSchema);
    expect(result.kind).toBe('parse-error');
  });
});

describe('jiraDelete', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await resetAuthBundle();
  });

  it('returns ok with no body parse on 204', async () => {
    const json = vi.fn(async () => ({}));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: { get: () => null },
      json,
    });

    const result = await jiraDelete('rest/api/3/issue/PROJ-1/worklog/10001');
    expect(result.kind).toBe('ok');
    expect(json).not.toHaveBeenCalled();

    const callArgs = fetchMock.mock.calls[0]!;
    const url = callArgs[0] as string;
    expect(url).toContain('rest/api/3/issue/PROJ-1/worklog/10001');
    expect(callArgs[1].method).toBe('DELETE');
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
        status: 204,
        headers: { get: () => null },
        json: async () => ({}),
      });

    const result = await jiraDelete('rest/api/3/issue/PROJ-1/worklog/10001');
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
    const result = await jiraDelete('rest/api/3/issue/PROJ-1/worklog/10001');
    expect(result.kind).toBe('rate-limited');
  });

  it('returns forbidden on 403', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await jiraDelete('rest/api/3/issue/PROJ-1/worklog/10001');
    expect(result.kind).toBe('forbidden');
  });

  it('returns not-found on 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await jiraDelete('rest/api/3/issue/PROJ-1/worklog/10001');
    expect(result.kind).toBe('not-found');
  });
});

describe('updateWorklog', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await resetAuthBundle();
  });

  it('PUTs to the worklog URL with a flat body and returns ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ id: '10001', timeSpentSeconds: 7200, started: 's' }),
    });

    const result = await updateWorklog('PROJ-1', '10001', {
      timeSpentSeconds: 7200,
      started: '2026-06-21T09:00:00.000Z',
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.id).toBe('10001');
      expect(result.value.timeSpentSeconds).toBe(7200);
    }

    const callArgs = fetchMock.mock.calls[0]!;
    const url = callArgs[0] as string;
    expect(url).toContain('rest/api/3/issue/PROJ-1/worklog/10001');
    expect(callArgs[1].method).toBe('PUT');
    const body = JSON.parse(callArgs[1].body);
    expect(body.timeSpentSeconds).toBe(7200);
    expect(body.started).toBe('2026-06-21T09:00:00.000Z');
    // FLAT body — not wrapped in { fields }
    expect(body.fields).toBeUndefined();
  });

  it('returns forbidden on 403', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await updateWorklog('PROJ-1', '10001', {
      timeSpentSeconds: 7200,
      started: 's',
    });
    expect(result.kind).toBe('forbidden');
  });

  it('returns not-found on 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await updateWorklog('PROJ-1', '10001', {
      timeSpentSeconds: 7200,
      started: 's',
    });
    expect(result.kind).toBe('not-found');
  });

  it('returns parse-error on schema drift', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ wrong: 'shape' }),
    });
    const result = await updateWorklog('PROJ-1', '10001', {
      timeSpentSeconds: 7200,
      started: 's',
    });
    expect(result.kind).toBe('parse-error');
  });
});

describe('deleteWorklog', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await resetAuthBundle();
  });

  it('DELETEs the worklog URL and returns ok on 204', async () => {
    const json = vi.fn(async () => ({}));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: { get: () => null },
      json,
    });

    const result = await deleteWorklog('PROJ-1', '10001');
    expect(result.kind).toBe('ok');
    expect(json).not.toHaveBeenCalled();

    const callArgs = fetchMock.mock.calls[0]!;
    const url = callArgs[0] as string;
    expect(url).toContain('rest/api/3/issue/PROJ-1/worklog/10001');
    expect(callArgs[1].method).toBe('DELETE');
  });

  it('returns not-found on 404 (already deleted server-side)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await deleteWorklog('PROJ-1', '10001');
    expect(result.kind).toBe('not-found');
  });
});

describe('fetchCurrentUserWeekWorklogs', () => {
  const ACCOUNT_ID = 'acct-me';
  const range = {
    start: new Date(2026, 5, 15, 0, 0, 0, 0), // Mon Jun 15
    end: new Date(2026, 5, 21, 23, 59, 59, 999), // Sun Jun 21
  };

  function okJson(body: unknown) {
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
  }

  beforeEach(async () => {
    fetchMock.mockReset();
    await resetAuthBundle();
  });

  it('resolves accountId, searches, and sums the current user worklogs in range', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ accountId: ACCOUNT_ID, displayName: 'Me' })) // myself
      .mockResolvedValueOnce(
        okJson({ issues: [{ id: '1', key: 'PROJ-1', fields: { summary: 'A' } }] }),
      ) // search
      .mockResolvedValueOnce(
        okJson({
          worklogs: [
            {
              id: 'wl-1',
              timeSpentSeconds: 3600,
              started: '2026-06-16T09:00:00.000+0000',
              author: { accountId: ACCOUNT_ID },
            },
            {
              id: 'wl-2',
              timeSpentSeconds: 7200,
              started: '2026-06-17T09:00:00.000+0000',
              author: { accountId: 'someone-else' },
            },
          ],
        }),
      ); // worklog list

    const result = await fetchCurrentUserWeekWorklogs(range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.id).toBe('wl-1');
    }
  });

  it('filters out worklogs whose started falls outside the range', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ accountId: ACCOUNT_ID, displayName: 'Me' }))
      .mockResolvedValueOnce(
        okJson({ issues: [{ id: '1', key: 'PROJ-1', fields: { summary: 'A' } }] }),
      )
      .mockResolvedValueOnce(
        okJson({
          worklogs: [
            {
              id: 'wl-old',
              timeSpentSeconds: 3600,
              started: '2026-06-08T09:00:00.000+0000', // prior week
              author: { accountId: ACCOUNT_ID },
            },
          ],
        }),
      );

    const result = await fetchCurrentUserWeekWorklogs(range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toHaveLength(0);
    }
  });

  it('returns empty when no issues match', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ accountId: ACCOUNT_ID, displayName: 'Me' }))
      .mockResolvedValueOnce(okJson({ issues: [] }));

    const result = await fetchCurrentUserWeekWorklogs(range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toHaveLength(0);
    }
    // Only myself + search were called, no per-issue worklog read.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('propagates the error when the myself lookup fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await fetchCurrentUserWeekWorklogs(range);
    expect(result.kind).toBe('forbidden');
    // No search/worklog calls once myself fails.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses a worklogAuthor/worklogDate JQL search via jiraGet (no raw fetch direct path)', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ accountId: ACCOUNT_ID, displayName: 'Me' }))
      .mockResolvedValueOnce(okJson({ issues: [] }));

    await fetchCurrentUserWeekWorklogs(range);
    const searchUrl = fetchMock.mock.calls[1]![0] as string;
    expect(decodeURIComponent(searchUrl)).toContain('worklogAuthor = currentUser()');
    expect(decodeURIComponent(searchUrl)).toContain('worklogDate >= "2026-06-15"');
    expect(decodeURIComponent(searchUrl)).toContain('worklogDate <= "2026-06-21"');
  });

  it('requests fields=key,summary so JiraSearchSchema can parse (not key alone)', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ accountId: ACCOUNT_ID, displayName: 'Me' }))
      .mockResolvedValueOnce(okJson({ issues: [] }));

    await fetchCurrentUserWeekWorklogs(range);
    const searchUrl = fetchMock.mock.calls[1]![0] as string;
    // JiraIssueSchema requires fields.summary; requesting `fields=key` alone
    // returns `fields: {}` and the Zod parse fails (badge silently breaks).
    expect(decodeURIComponent(searchUrl)).toContain('fields=key,summary');
  });

  it('fails (parse-error) when the search omits summary — regression guard', async () => {
    // Simulate what Jira returns for `fields=key` alone: no summary.
    fetchMock
      .mockResolvedValueOnce(okJson({ accountId: ACCOUNT_ID, displayName: 'Me' }))
      .mockResolvedValueOnce(okJson({ issues: [{ id: '1', key: 'PROJ-1', fields: {} }] }));

    const result = await fetchCurrentUserWeekWorklogs(range);
    expect(result.kind).toBe('parse-error');
  });

  it('scopes the per-issue worklog read with startedAfter/startedBefore', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ accountId: ACCOUNT_ID, displayName: 'Me' }))
      .mockResolvedValueOnce(
        okJson({ issues: [{ id: '1', key: 'PROJ-1', fields: { summary: 'A' } }] }),
      )
      .mockResolvedValueOnce(okJson({ worklogs: [] }));

    await fetchCurrentUserWeekWorklogs(range);
    const worklogUrl = fetchMock.mock.calls[2]![0] as string;
    // Jira returns worklogs oldest-first; without this server-side window the
    // current week's entries on a long-lived subtask land on a later page and
    // would be missed.
    expect(worklogUrl).toContain('startedAfter=');
    expect(worklogUrl).toContain('startedBefore=');
  });
});

describe('fetchCurrentUserWeekWorklogsByIssue', () => {
  const ACCOUNT_ID = 'acct-me';
  const range = {
    start: new Date(2026, 5, 15, 0, 0, 0, 0), // Mon Jun 15
    end: new Date(2026, 5, 21, 23, 59, 59, 999), // Sun Jun 21
  };

  function okJson(body: unknown) {
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
  }

  beforeEach(async () => {
    fetchMock.mockReset();
    await resetAuthBundle();
  });

  it('returns each issue paired with the current user in-range worklogs (key + summary preserved)', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ accountId: ACCOUNT_ID, displayName: 'Me' })) // myself
      .mockResolvedValueOnce(
        okJson({ issues: [{ id: '1', key: 'PROJ-1', fields: { summary: 'Build the grid' } }] }),
      ) // search
      .mockResolvedValueOnce(
        okJson({
          worklogs: [
            {
              id: 'wl-1',
              timeSpentSeconds: 3600,
              started: '2026-06-16T09:00:00.000+0000',
              author: { accountId: ACCOUNT_ID },
            },
            {
              id: 'wl-2',
              timeSpentSeconds: 7200,
              started: '2026-06-17T09:00:00.000+0000',
              author: { accountId: 'someone-else' },
            },
          ],
        }),
      ); // worklog list

    const result = await fetchCurrentUserWeekWorklogsByIssue(range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.key).toBe('PROJ-1');
      expect(result.value[0]!.summary).toBe('Build the grid');
      expect(result.value[0]!.worklogs).toHaveLength(1);
      expect(result.value[0]!.worklogs[0]!.id).toBe('wl-1');
    }
  });

  it('omits issues that have no in-range worklogs for the current user', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ accountId: ACCOUNT_ID, displayName: 'Me' }))
      .mockResolvedValueOnce(
        okJson({ issues: [{ id: '1', key: 'PROJ-1', fields: { summary: 'A' } }] }),
      )
      .mockResolvedValueOnce(
        okJson({
          worklogs: [
            {
              id: 'wl-old',
              timeSpentSeconds: 3600,
              started: '2026-06-08T09:00:00.000+0000', // prior week
              author: { accountId: ACCOUNT_ID },
            },
          ],
        }),
      );

    const result = await fetchCurrentUserWeekWorklogsByIssue(range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toHaveLength(0);
    }
  });

  it('returns empty when no issues match', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ accountId: ACCOUNT_ID, displayName: 'Me' }))
      .mockResolvedValueOnce(okJson({ issues: [] }));

    const result = await fetchCurrentUserWeekWorklogsByIssue(range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toHaveLength(0);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('propagates the error when the myself lookup fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await fetchCurrentUserWeekWorklogsByIssue(range);
    expect(result.kind).toBe('forbidden');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // --- Story 7.8 / D-7.8-20: paged via the SAME shared helper as the matrix
  it('D-7.8-20: follows nextPageToken across search pages (shares fetchAllSearchPages with the matrix fetcher)', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ accountId: ACCOUNT_ID, displayName: 'Me' })) // myself
      .mockResolvedValueOnce(
        okJson({
          issues: [{ id: '1', key: 'PROJ-1', fields: { summary: 'Page 1 issue' } }],
          nextPageToken: 'tok-week-1',
          isLast: false,
        }),
      )
      .mockResolvedValueOnce(
        okJson({ issues: [{ id: '2', key: 'PROJ-2', fields: { summary: 'Page 2 issue' } }], isLast: true }),
      )
      .mockResolvedValueOnce(
        okJson({
          worklogs: [
            {
              id: 'wl-p1',
              timeSpentSeconds: 3600,
              started: '2026-06-16T09:00:00.000+0000',
              author: { accountId: ACCOUNT_ID },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          worklogs: [
            {
              id: 'wl-p2',
              timeSpentSeconds: 7200,
              started: '2026-06-17T09:00:00.000+0000',
              author: { accountId: ACCOUNT_ID },
            },
          ],
        }),
      );

    const result = await fetchCurrentUserWeekWorklogsByIssue(range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.map((w) => w.key).sort()).toEqual(['PROJ-1', 'PROJ-2']);
    }
    const searchCalls = fetchMock.mock.calls.filter((call: unknown[]) => String(call[0]).includes('search/jql'));
    expect(searchCalls).toHaveLength(2);
    expect(String(searchCalls[1]![0])).toContain('nextPageToken=tok-week-1');
  });
});

describe('fetchReportCycleWorklogsByEpic', () => {
  const REPORT_ID = 'acct-report';
  const range = {
    start: new Date(2026, 4, 1, 0, 0, 0, 0), // Fri May 1
    end: new Date(2026, 4, 31, 23, 59, 59, 999), // Sun May 31
  };

  function okJson(body: unknown) {
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
  }

  beforeEach(async () => {
    fetchMock.mockReset();
    await resetAuthBundle();
  });

  it('scopes the JQL to the report (worklogAuthor = "<accountId>", not currentUser())', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ issues: [] })); // search returns nothing → no further calls

    const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
    expect(result.kind).toBe('ok');
    const searchUrl = String(fetchMock.mock.calls[0]![0]);
    expect(searchUrl).toContain(encodeURIComponent(`worklogAuthor = "${REPORT_ID}"`));
    expect(searchUrl).not.toContain(encodeURIComponent('currentUser()'));
  });

  it('groups the report worklogs by parent Epic with key/summary + per-ticket records preserved', async () => {
    fetchMock
      // search: one subtask under a Story; the search `parent` is the Story (PROJ-10)
      .mockResolvedValueOnce(
        okJson({
          issues: [
            {
              id: '1',
              key: 'PROJ-100',
              fields: {
                summary: 'Subtask A',
                issuetype: { id: '10', name: 'Sub-task', subtask: true },
                parent: { id: '10', key: 'PROJ-10', fields: { summary: 'Story A' } },
              },
            },
          ],
        }),
      )
      // grandparent lookup for PROJ-10 → its parent is the Epic PROJ-1
      .mockResolvedValueOnce(
        okJson({
          id: '10',
          key: 'PROJ-10',
          fields: {
            summary: 'Story A',
            issuetype: { id: '7', name: 'Story', subtask: false },
            parent: { id: '1', key: 'PROJ-1', fields: { summary: 'Epic One' } },
          },
        }),
      )
      // worklog list for PROJ-100
      .mockResolvedValueOnce(
        okJson({
          worklogs: [
            {
              id: 'wl-1',
              timeSpentSeconds: 3600,
              started: '2026-05-05T09:00:00.000+0000',
              updated: '2026-05-05T10:00:00.000+0000',
              author: { accountId: REPORT_ID },
            },
            {
              id: 'wl-2',
              timeSpentSeconds: 7200,
              started: '2026-05-06T09:00:00.000+0000',
              author: { accountId: 'someone-else' },
            },
          ],
        }),
      );

    const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.epics).toHaveLength(1);
      expect(result.value.restrictedCount).toBe(0);
      const epic = result.value.epics[0]!;
      expect(epic.epicKey).toBe('PROJ-1');
      expect(epic.epicSummary).toBe('Epic One');
      expect(epic.totalSeconds).toBe(3600); // only the report's worklog counts
      expect(epic.restrictedCount).toBe(0);
      expect(epic.worklogs).toHaveLength(1);
      expect(epic.worklogs[0]!.ticketKey).toBe('PROJ-100');
      expect(epic.worklogs[0]!.ticketSummary).toBe('Subtask A');
      expect(epic.worklogs[0]!.seconds).toBe(3600);
      expect(epic.worklogs[0]!.updated).toBe('2026-05-05T10:00:00.000+0000');
      expect(epic.worklogs[0]!.started).toBe('2026-05-05T09:00:00.000+0000');
    }
  });

  it('buckets subtasks with no resolvable Epic under their top-most resolvable parent', async () => {
    fetchMock
      // search: subtask whose parent (PROJ-20) has no further parent (parent IS the top)
      .mockResolvedValueOnce(
        okJson({
          issues: [
            {
              id: '2',
              key: 'PROJ-200',
              fields: {
                summary: 'Orphan subtask',
                issuetype: { id: '10', name: 'Sub-task', subtask: true },
                parent: { id: '20', key: 'PROJ-20', fields: { summary: 'Lonely Story' } },
              },
            },
          ],
        }),
      )
      // grandparent lookup for PROJ-20 → no parent (it is its own top)
      .mockResolvedValueOnce(
        okJson({
          id: '20',
          key: 'PROJ-20',
          fields: {
            summary: 'Lonely Story',
            issuetype: { id: '7', name: 'Story', subtask: false },
          },
        }),
      )
      // worklog list for PROJ-200
      .mockResolvedValueOnce(
        okJson({
          worklogs: [
            {
              id: 'wl-3',
              timeSpentSeconds: 1800,
              started: '2026-05-10T09:00:00.000+0000',
              author: { accountId: REPORT_ID },
            },
          ],
        }),
      );

    const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.epics).toHaveLength(1);
      // Hours are bucketed under the top-most resolvable parent, never dropped.
      expect(result.value.epics[0]!.epicKey).toBe('PROJ-20');
      expect(result.value.epics[0]!.totalSeconds).toBe(1800);
    }
  });

  it('omits worklogs outside the cycle window', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          issues: [
            {
              id: '1',
              key: 'PROJ-100',
              fields: {
                summary: 'Subtask A',
                parent: { id: '1', key: 'PROJ-1', fields: { summary: 'Epic One' } },
              },
            },
          ],
        }),
      )
      // grandparent lookup PROJ-1 → it is an Epic with no parent
      .mockResolvedValueOnce(
        okJson({
          id: '1',
          key: 'PROJ-1',
          fields: { summary: 'Epic One', issuetype: { id: '6', name: 'Epic', subtask: false } },
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          worklogs: [
            {
              id: 'wl-old',
              timeSpentSeconds: 3600,
              started: '2026-04-20T09:00:00.000+0000', // prior month
              author: { accountId: REPORT_ID },
            },
          ],
        }),
      );

    const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.epics).toHaveLength(0);
    }
  });

  it('returns empty when the report logged on nothing', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ issues: [] }));
    const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.epics).toHaveLength(0);
      expect(result.value.restrictedCount).toBe(0);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // --- Story 7.8 / D-7.8-20 (supersedes D-7.8-16): real pagination --------
  //
  // The `truncated` flag/tests this block used to hold are GONE — D-7.8-20
  // replaced "surface a maybe-wrong warning" with "page until correct".
  // `fetchAllSearchPages` (`lib/jira-client.ts`) is shared with
  // `fetchCurrentUserWeekWorklogsByIssue`'s own pagination tests below.

  describe('pagination (D-7.8-20)', () => {
    // The grandparent-lookup response for a subtask's parent that is
    // ITSELF the top-level Epic (no further parent).
    function epicLookup(key: string, summary: string) {
      return okJson({
        id: key,
        key,
        fields: { summary, issuetype: { id: '5', name: 'Epic', subtask: false } },
      });
    }

    function subtask(key: string, parentKey: string) {
      return {
        id: key,
        key,
        fields: {
          summary: `Subtask ${key}`,
          issuetype: { id: '10', name: 'Sub-task', subtask: true },
          parent: { id: parentKey, key: parentKey, fields: { summary: 'Epic One' } },
        },
      };
    }

    it('does NOT loop when the page is short of maxResults and carries no nextPageToken (the common case)', async () => {
      fetchMock
        .mockResolvedValueOnce(okJson({ issues: [subtask('PROJ-100', 'PROJ-1')] }))
        .mockResolvedValueOnce(epicLookup('PROJ-1', 'Epic One'))
        .mockResolvedValueOnce(okJson({ worklogs: [] }));
      const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
      expect(result.kind).toBe('ok');
      // 1 search + 1 grandparent lookup + 1 worklog fetch — no second search page.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('a full-but-final page (isLast: true, no nextPageToken) does NOT trigger a second page', async () => {
      const issues = Array.from({ length: 100 }, (_, i) => subtask(`PROJ-${200 + i}`, 'PROJ-1'));
      fetchMock.mockResolvedValueOnce(okJson({ issues, isLast: true }));
      fetchMock.mockResolvedValueOnce(epicLookup('PROJ-1', 'Epic One'));
      for (let i = 0; i < 100; i++) fetchMock.mockResolvedValueOnce(okJson({ worklogs: [] }));
      const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
      expect(result.kind).toBe('ok');
      // Every subtask's worklog list is empty, so no Epic group is created
      // (a subtask contributing neither visible hours nor a restricted
      // signal adds nothing — pre-existing behaviour, unrelated to paging).
      // What THIS test proves is the request count: exactly one search page
      // (no second page issued) + 1 grandparent lookup + 100 worklog fetches.
      expect(fetchMock).toHaveBeenCalledTimes(102);
    });

    it('follows nextPageToken across pages and aggregates BOTH pages into the totals — a report logging on >100 subtasks is now simply correct, not flagged', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => subtask(`PROJ-${300 + i}`, 'PROJ-1'));
      const page2 = [subtask('PROJ-999', 'PROJ-1')]; // the 101st subtask
      fetchMock.mockResolvedValueOnce(
        okJson({ issues: page1, nextPageToken: 'tok-1', isLast: false }),
      );
      fetchMock.mockResolvedValueOnce(okJson({ issues: page2, isLast: true }));
      // ONE grandparent lookup (shared parent, cached) — then one worklog
      // fetch per subtask, PAGE 1's 100 subtasks first (all empty), then
      // PAGE 2's single subtask carrying real hours — so the assertion
      // below can ONLY pass if page 2's issue was actually processed.
      fetchMock.mockResolvedValueOnce(epicLookup('PROJ-1', 'Epic One'));
      for (let i = 0; i < 100; i++) fetchMock.mockResolvedValueOnce(okJson({ worklogs: [] }));
      fetchMock.mockResolvedValueOnce(
        okJson({
          worklogs: [
            {
              id: 'wl-page2',
              timeSpentSeconds: 1800,
              started: '2026-05-05T09:00:00.000+0000',
              author: { accountId: REPORT_ID },
            },
          ],
        }),
      );

      const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Page 2's subtask (PROJ-999) is the ONLY source of these 1800s —
        // proof the second page was actually fetched and aggregated, not
        // silently dropped.
        expect(result.value.epics[0]!.totalSeconds).toBe(1800);
      }
      // 2 search pages issued (the page-2 request must carry nextPageToken).
      const searchCalls = fetchMock.mock.calls.filter((call: unknown[]) =>
        String(call[0]).includes('search/jql'),
      );
      expect(searchCalls).toHaveLength(2);
      expect(String(searchCalls[1]![0])).toContain('nextPageToken=tok-1');
    });

    it('fails LOUDLY (a network-kind error), never silently, if the page ceiling is reached without isLast', async () => {
      // Every page reports more remain — the loop must give up after its
      // bounded ceiling rather than spin or silently truncate.
      fetchMock.mockResolvedValue(
        okJson({ issues: [], nextPageToken: 'tok-forever', isLast: false }),
      );
      const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
      expect(result.kind).toBe('network');
    });
  });

  it('propagates the JiraError when the search fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
    expect(result.kind).toBe('forbidden');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates the JiraError when a worklog fetch fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          issues: [
            {
              id: '1',
              key: 'PROJ-100',
              fields: {
                summary: 'Subtask A',
                parent: { id: '1', key: 'PROJ-1', fields: { summary: 'Epic One' } },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          id: '1',
          key: 'PROJ-1',
          fields: { summary: 'Epic One', issuetype: { id: '6', name: 'Epic', subtask: false } },
        }),
      )
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: { get: () => null },
        json: async () => ({}),
      });
    const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
    expect(result.kind).toBe('not-found');
  });

  it('computes restrictedCount from total > returned worklogs.length (per-Epic + row sum)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          issues: [
            {
              id: '1',
              key: 'PROJ-100',
              fields: {
                summary: 'Subtask A',
                parent: { id: '1', key: 'PROJ-1', fields: { summary: 'Epic One' } },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          id: '1',
          key: 'PROJ-1',
          fields: { summary: 'Epic One', issuetype: { id: '6', name: 'Epic', subtask: false } },
        }),
      )
      // total = 3, but only 1 visible worklog for this manager → 2 restricted.
      .mockResolvedValueOnce(
        okJson({
          total: 3,
          worklogs: [
            {
              id: 'wl-1',
              timeSpentSeconds: 3600,
              started: '2026-05-05T09:00:00.000+0000',
              author: { accountId: REPORT_ID },
            },
          ],
        }),
      );

    const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.epics).toHaveLength(1);
      expect(result.value.epics[0]!.restrictedCount).toBe(2);
      expect(result.value.restrictedCount).toBe(2);
    }
  });

  it('treats an undefined total as restrictedCount 0 (never guesses, never throws)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          issues: [
            {
              id: '1',
              key: 'PROJ-100',
              fields: {
                summary: 'Subtask A',
                parent: { id: '1', key: 'PROJ-1', fields: { summary: 'Epic One' } },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          id: '1',
          key: 'PROJ-1',
          fields: { summary: 'Epic One', issuetype: { id: '6', name: 'Epic', subtask: false } },
        }),
      )
      // No `total` field → restrictedCount 0.
      .mockResolvedValueOnce(
        okJson({
          worklogs: [
            {
              id: 'wl-1',
              timeSpentSeconds: 3600,
              started: '2026-05-05T09:00:00.000+0000',
              author: { accountId: REPORT_ID },
            },
          ],
        }),
      );

    const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.epics[0]!.restrictedCount).toBe(0);
      expect(result.value.restrictedCount).toBe(0);
    }
  });

  it('sums restrictedCount across multiple subtasks into the row total', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          issues: [
            {
              id: '1',
              key: 'PROJ-100',
              fields: {
                summary: 'Subtask A',
                parent: { id: '1', key: 'PROJ-1', fields: { summary: 'Epic One' } },
              },
            },
            {
              id: '2',
              key: 'PROJ-200',
              fields: {
                summary: 'Subtask B',
                parent: { id: '2', key: 'PROJ-2', fields: { summary: 'Epic Two' } },
              },
            },
          ],
        }),
      )
      // grandparent lookups: both parents are top-level Epics.
      .mockResolvedValueOnce(
        okJson({
          id: '1',
          key: 'PROJ-1',
          fields: { summary: 'Epic One', issuetype: { id: '6', name: 'Epic', subtask: false } },
        }),
      )
      // worklog for PROJ-100: total 2, 1 visible → 1 restricted.
      .mockResolvedValueOnce(
        okJson({
          total: 2,
          worklogs: [
            {
              id: 'wl-1',
              timeSpentSeconds: 3600,
              started: '2026-05-05T09:00:00.000+0000',
              author: { accountId: REPORT_ID },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          id: '2',
          key: 'PROJ-2',
          fields: { summary: 'Epic Two', issuetype: { id: '6', name: 'Epic', subtask: false } },
        }),
      )
      // worklog for PROJ-200: total 4, 1 visible → 3 restricted.
      .mockResolvedValueOnce(
        okJson({
          total: 4,
          worklogs: [
            {
              id: 'wl-2',
              timeSpentSeconds: 3600,
              started: '2026-05-06T09:00:00.000+0000',
              author: { accountId: REPORT_ID },
            },
          ],
        }),
      );

    const result = await fetchReportCycleWorklogsByEpic(REPORT_ID, range);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.restrictedCount).toBe(4);
      const byKey = Object.fromEntries(
        result.value.epics.map((e) => [e.epicKey, e.restrictedCount]),
      );
      expect(byKey['PROJ-1']).toBe(1);
      expect(byKey['PROJ-2']).toBe(3);
    }
  });
});
