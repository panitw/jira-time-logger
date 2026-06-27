import { describe, it, expect, vi, beforeEach } from 'vitest';

const approveCycleMock = vi.fn();
vi.mock('@/lib/approval', () => ({
  approveCycle: (...a: unknown[]) => approveCycleMock(...a),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { handleApproveCycle } = await import('./approve-sw');

const baseReq = {
  user: 'report-1',
  cycle: '2026-05',
  by: 'manager-9',
  epics: [
    { epicKey: 'EP-1', restrictedCount: 0 },
    { epicKey: 'EP-2', restrictedCount: 2 },
  ],
};

describe('handleApproveCycle', () => {
  beforeEach(() => {
    approveCycleMock.mockReset();
  });

  it('passes the request through to approveCycle verbatim', async () => {
    approveCycleMock.mockResolvedValueOnce({ confirmed: ['EP-1', 'EP-2'], failed: [] });
    await handleApproveCycle(baseReq);
    expect(approveCycleMock).toHaveBeenCalledWith({
      user: 'report-1',
      cycle: '2026-05',
      by: 'manager-9',
      epics: baseReq.epics,
    });
  });

  it('all-success → confirmed list, empty failed/enqueued', async () => {
    approveCycleMock.mockResolvedValueOnce({ confirmed: ['EP-1', 'EP-2'], failed: [] });
    const res = await handleApproveCycle(baseReq);
    expect(res).toEqual({ confirmed: ['EP-1', 'EP-2'], failed: [], enqueued: [] });
  });

  it('partial → flattens failed keys; enqueued is the enqueued subset', async () => {
    approveCycleMock.mockResolvedValueOnce({
      confirmed: ['EP-1'],
      failed: [
        { epicKey: 'EP-2', body: {}, error: { kind: 'network' }, enqueued: true },
        { epicKey: 'EP-3', body: {}, error: { kind: 'forbidden' }, enqueued: false },
      ],
    });
    const res = await handleApproveCycle(baseReq);
    expect(res.confirmed).toEqual(['EP-1']);
    expect(res.failed).toEqual(['EP-2', 'EP-3']);
    expect(res.enqueued).toEqual(['EP-2']); // forbidden is terminal, not enqueued
  });

  it('never throws: an unexpected throw reports every Epic as failed', async () => {
    approveCycleMock.mockRejectedValueOnce(new Error('boom'));
    const res = await handleApproveCycle(baseReq);
    expect(res.confirmed).toEqual([]);
    expect(res.failed).toEqual(['EP-1', 'EP-2']);
    expect(res.enqueued).toEqual([]);
  });
});
