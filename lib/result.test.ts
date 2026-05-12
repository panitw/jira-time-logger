import { describe, it, expect } from 'vitest';
import {
  ok,
  rateLimited,
  authExpired,
  network,
  parseError,
  forbidden,
  notFound,
  oauthCancelled,
  oauthCsrfMismatch,
  oauthError,
  isOk,
  type Result,
  type JiraError,
} from './result';

describe('result constructors', () => {
  it('ok wraps a value', () => {
    expect(ok(42)).toEqual({ kind: 'ok', value: 42 });
  });

  it('rateLimited carries retryAfterMs', () => {
    expect(rateLimited(1500)).toEqual({ kind: 'rate-limited', retryAfterMs: 1500 });
  });

  it('authExpired has no payload', () => {
    expect(authExpired()).toEqual({ kind: 'auth-expired' });
  });

  it('network carries a cause string', () => {
    expect(network('fetch failed')).toEqual({ kind: 'network', cause: 'fetch failed' });
  });

  it('parseError carries an issue', () => {
    const issue = { path: ['scope'], message: 'expected string' };
    expect(parseError(issue)).toEqual({ kind: 'parse-error', issue });
  });

  it('forbidden has no payload', () => {
    expect(forbidden()).toEqual({ kind: 'forbidden' });
  });

  it('notFound has no payload', () => {
    expect(notFound()).toEqual({ kind: 'not-found' });
  });
});

describe('OAuth-specific constructors', () => {
  it('oauthCancelled has no payload', () => {
    expect(oauthCancelled()).toEqual({ kind: 'oauth-cancelled' });
  });

  it('oauthCsrfMismatch has no payload', () => {
    expect(oauthCsrfMismatch()).toEqual({ kind: 'oauth-csrf-mismatch' });
  });

  it('oauthError carries a cause', () => {
    expect(oauthError('invalid_grant')).toEqual({ kind: 'oauth-error', cause: 'invalid_grant' });
  });
});

describe('isOk guard', () => {
  it('returns true for ok value', () => {
    const r: Result<number, JiraError> = ok(7);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      // type narrows
      expect(r.value).toBe(7);
    }
  });

  it('returns false for error values', () => {
    expect(isOk(authExpired())).toBe(false);
    expect(isOk(network('x'))).toBe(false);
    expect(isOk(parseError({}))).toBe(false);
  });
});

describe('discriminated-union switch exhaustiveness', () => {
  // This is a compile-time test really; if a new variant is added without
  // updating this switch, TypeScript flags the `_exhaustive` line.
  it('every JiraError kind is handled', () => {
    function handle(r: Result<string, JiraError>): string {
      switch (r.kind) {
        case 'ok':
          return r.value;
        case 'rate-limited':
          return `retry-in-${r.retryAfterMs}`;
        case 'auth-expired':
          return 'expired';
        case 'network':
          return `net-${r.cause}`;
        case 'parse-error':
          return 'bad-shape';
        case 'forbidden':
          return 'forbid';
        case 'not-found':
          return '404';
        default: {
          const _exhaustive: never = r;
          return _exhaustive;
        }
      }
    }
    expect(handle(ok('a'))).toBe('a');
    expect(handle(rateLimited(100))).toBe('retry-in-100');
    expect(handle(authExpired())).toBe('expired');
    expect(handle(network('fail'))).toBe('net-fail');
    expect(handle(parseError({}))).toBe('bad-shape');
    expect(handle(forbidden())).toBe('forbid');
    expect(handle(notFound())).toBe('404');
  });
});
