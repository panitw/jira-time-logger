import { describe, it, expect, vi, beforeEach } from 'vitest';

const postWorklogMock = vi.fn();

vi.mock('@/lib/jira-client', () => ({
  postWorklog: (...args: unknown[]) => postWorklogMock(...args),
}));

const { logFullDayPto, logHalfDayPto } = await import('./pto');

describe('pto worklog helpers', () => {
  beforeEach(() => {
    postWorklogMock.mockReset();
    postWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-1', timeSpentSeconds: 28800 },
    });
  });

  it('logFullDayPto posts targetHours*3600 seconds to the PTO key', async () => {
    await logFullDayPto('KNP-99', 8, '2026-06-21T09:00:00.000Z');
    expect(postWorklogMock).toHaveBeenCalledWith('KNP-99', {
      timeSpentSeconds: 28800,
      started: '2026-06-21T09:00:00.000Z',
    });
  });

  it('logHalfDayPto posts (targetHours/2)*3600 seconds', async () => {
    await logHalfDayPto('KNP-99', 8, '2026-06-21T09:00:00.000Z');
    expect(postWorklogMock).toHaveBeenCalledWith('KNP-99', {
      timeSpentSeconds: 14400,
      started: '2026-06-21T09:00:00.000Z',
    });
  });

  it('handles odd target hours (7 → 25200 full / 12600 half)', async () => {
    await logFullDayPto('KNP-99', 7, '2026-06-21T09:00:00.000Z');
    expect(postWorklogMock).toHaveBeenLastCalledWith('KNP-99', {
      timeSpentSeconds: 25200,
      started: '2026-06-21T09:00:00.000Z',
    });
    await logHalfDayPto('KNP-99', 7, '2026-06-21T09:00:00.000Z');
    expect(postWorklogMock).toHaveBeenLastCalledWith('KNP-99', {
      timeSpentSeconds: 12600,
      started: '2026-06-21T09:00:00.000Z',
    });
  });

  it('surfaces a non-ok Result from postWorklog', async () => {
    postWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
    const result = await logFullDayPto('KNP-99', 8, '2026-06-21T09:00:00.000Z');
    expect(result.kind).toBe('network');
  });
});
