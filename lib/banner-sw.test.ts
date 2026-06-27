import { describe, it, expect, vi, beforeEach } from 'vitest';

const getWeekHoursMissingMock = vi.fn();
vi.mock('@/lib/badge', () => ({
  getWeekHoursMissing: (...a: unknown[]) => getWeekHoursMissingMock(...a),
}));

const postWorklogMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  postWorklog: (...a: unknown[]) => postWorklogMock(...a),
}));

const enqueueMock = vi.fn();
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: (...a: unknown[]) => enqueueMock(...a),
}));

const sendMessageMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendMessage: (...a: unknown[]) => sendMessageMock(...a),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { handleBannerStateRequest, handleLogWorklogRequest, handleOpenPopup } =
  await import('./banner-sw');

beforeEach(() => {
  getWeekHoursMissingMock.mockReset();
  postWorklogMock.mockReset();
  enqueueMock.mockReset().mockResolvedValue(undefined);
  sendMessageMock.mockReset();
});

describe('handleBannerStateRequest', () => {
  it('returns the badge deficit + ticket parsed from a /browse/ URL', async () => {
    getWeekHoursMissingMock.mockResolvedValue(6);
    const res = await handleBannerStateRequest({
      url: 'https://acme.atlassian.net/browse/PROJ-455',
    });
    expect(res).toEqual({ hoursMissing: 6, currentTicket: 'PROJ-455' });
  });

  it('omits currentTicket on a non-browse page', async () => {
    getWeekHoursMissingMock.mockResolvedValue(3);
    const res = await handleBannerStateRequest({
      url: 'https://acme.atlassian.net/jira/your-work',
    });
    expect(res).toEqual({ hoursMissing: 3 });
  });

  it('maps null (disconnected/auth-expired/transient) to hoursMissing 0 — no banner', async () => {
    getWeekHoursMissingMock.mockResolvedValue(null);
    const res = await handleBannerStateRequest({
      url: 'https://acme.atlassian.net/browse/PROJ-1',
    });
    expect(res.hoursMissing).toBe(0);
  });

  it('maps caught-up (0) to hoursMissing 0', async () => {
    getWeekHoursMissingMock.mockResolvedValue(0);
    const res = await handleBannerStateRequest({ url: 'https://acme.atlassian.net/' });
    expect(res.hoursMissing).toBe(0);
  });
});

describe('handleLogWorklogRequest (mirrors QuickLogForm pathway)', () => {
  const req = {
    issueKey: 'PROJ-1',
    timeSpentSeconds: 9000,
    started: '2026-06-27T09:00:00.000Z',
  };

  it('on ok: broadcasts badge-update and returns ok', async () => {
    postWorklogMock.mockResolvedValue({ kind: 'ok', value: { id: 'w1' } });
    const res = await handleLogWorklogRequest(req);
    expect(res).toEqual({ status: 'ok' });
    expect(sendMessageMock).toHaveBeenCalledWith('badge-update', { hoursMissing: 0 });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('on network error: enqueues the outbox and returns pending', async () => {
    postWorklogMock.mockResolvedValue({ kind: 'network', message: 'x' });
    const res = await handleLogWorklogRequest(req);
    expect(res).toEqual({ status: 'pending' });
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'post',
        endpoint: 'rest/api/3/issue/PROJ-1/worklog',
        issueKey: 'PROJ-1',
        body: { timeSpentSeconds: 9000, started: req.started },
      }),
    );
  });

  it('on rate-limited: enqueues and returns pending', async () => {
    postWorklogMock.mockResolvedValue({ kind: 'rate-limited', retryAfterMs: 1000 });
    const res = await handleLogWorklogRequest(req);
    expect(res).toEqual({ status: 'pending' });
    expect(enqueueMock).toHaveBeenCalled();
  });

  it('on other error (forbidden): returns error, no enqueue', async () => {
    postWorklogMock.mockResolvedValue({ kind: 'forbidden' });
    const res = await handleLogWorklogRequest(req);
    expect(res).toEqual({ status: 'error' });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('never throws — a thrown postWorklog becomes status error', async () => {
    postWorklogMock.mockRejectedValue(new Error('boom'));
    const res = await handleLogWorklogRequest(req);
    expect(res).toEqual({ status: 'error' });
  });
});

describe('handleOpenPopup', () => {
  it('calls chrome.action.openPopup', async () => {
    const openPopup = vi.fn(async () => {});
    vi.stubGlobal('chrome', { action: { openPopup } });
    await handleOpenPopup();
    expect(openPopup).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('never throws when openPopup rejects (no focused window)', async () => {
    vi.stubGlobal('chrome', {
      action: { openPopup: vi.fn(async () => Promise.reject(new Error('no window'))) },
    });
    await expect(handleOpenPopup()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
