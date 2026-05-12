import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, redact } from './log';

describe('redact', () => {
  it('returns undefined for undefined input', () => {
    expect(redact(undefined)).toBeUndefined();
  });

  it('redacts top-level token keys', () => {
    expect(redact({ access_token: 'abc' })).toEqual({ access_token: '[redacted]' });
    expect(redact({ refresh_token: 'xyz' })).toEqual({ refresh_token: '[redacted]' });
    expect(redact({ code_verifier: 'v' })).toEqual({ code_verifier: '[redacted]' });
    expect(redact({ code_challenge: 'c' })).toEqual({ code_challenge: '[redacted]' });
    expect(redact({ Authorization: 'Bearer x' })).toEqual({ Authorization: '[redacted]' });
  });

  it('is case-insensitive for redaction keys', () => {
    expect(redact({ AUTHORIZATION: 'Bearer x' })).toEqual({ AUTHORIZATION: '[redacted]' });
    expect(redact({ Access_Token: 'a' })).toEqual({ Access_Token: '[redacted]' });
  });

  it('preserves non-sensitive keys verbatim', () => {
    expect(
      redact({ event: 'login', count: 3, ok: true, list: [1, 2, 3] }),
    ).toEqual({ event: 'login', count: 3, ok: true, list: [1, 2, 3] });
  });

  it('redacts nested token keys', () => {
    const result = redact({
      meta: { user: 'x', access_token: 'leak' },
      ok: true,
    });
    expect(result).toEqual({
      meta: { user: 'x', access_token: '[redacted]' },
      ok: true,
    });
  });
});

describe('log levels', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('info forwards to console.info with redacted payload', () => {
    log.info('oauth.flow.started', { access_token: 'secret', user: 'note' });
    expect(infoSpy).toHaveBeenCalledWith('oauth.flow.started', {
      access_token: '[redacted]',
      user: 'note',
    });
  });

  it('warn forwards to console.warn', () => {
    log.warn('oauth.flow.failed', { kind: 'cancelled' });
    expect(warnSpy).toHaveBeenCalledWith('oauth.flow.failed', { kind: 'cancelled' });
  });

  it('error forwards to console.error', () => {
    log.error('jira.parse.worklog', { issueKey: 'PROJ-1' });
    expect(errorSpy).toHaveBeenCalledWith('jira.parse.worklog', { issueKey: 'PROJ-1' });
  });

  it('debug forwards to console.debug in dev', () => {
    log.debug('hierarchy.fetch.start', { count: 1 });
    expect(debugSpy).toHaveBeenCalled();
  });

  it('handles missing payload', () => {
    log.info('background.boot');
    expect(infoSpy).toHaveBeenCalledWith('background.boot', undefined);
  });
});
