/**
 * Result<T, E> — discriminated union for I/O-boundary returns.
 *
 * Per architecture.md > Process Patterns, every call that touches the network
 * (OAuth, Jira API, storage writes) returns a Result instead of throwing.
 * UI code dispatches on `kind`; throwing is reserved for in-memory bugs and
 * React render errors (caught by ErrorBoundary).
 */

export type Ok<T> = { kind: 'ok'; value: T };

export type JiraError =
  | { kind: 'rate-limited'; retryAfterMs: number }
  | { kind: 'auth-expired' }
  | { kind: 'network'; cause: string }
  | { kind: 'parse-error'; issue: unknown }
  | { kind: 'forbidden' }
  | { kind: 'not-found' };

export type OAuthError =
  | { kind: 'oauth-cancelled' }
  | { kind: 'oauth-csrf-mismatch' }
  | { kind: 'oauth-error'; cause: string }
  | { kind: 'network'; cause: string }
  | { kind: 'parse-error'; issue: unknown };

export type Result<T, E = JiraError> = Ok<T> | E;

// ---- Constructors ----

export function ok<T>(value: T): Ok<T> {
  return { kind: 'ok', value };
}

export function rateLimited(retryAfterMs: number): JiraError {
  return { kind: 'rate-limited', retryAfterMs };
}

export function authExpired(): JiraError {
  return { kind: 'auth-expired' };
}

export function network(cause: string): JiraError {
  return { kind: 'network', cause };
}

export function parseError(issue: unknown): JiraError {
  return { kind: 'parse-error', issue };
}

export function forbidden(): JiraError {
  return { kind: 'forbidden' };
}

export function notFound(): JiraError {
  return { kind: 'not-found' };
}

// ---- OAuth-specific constructors ----

export function oauthCancelled(): OAuthError {
  return { kind: 'oauth-cancelled' };
}

export function oauthCsrfMismatch(): OAuthError {
  return { kind: 'oauth-csrf-mismatch' };
}

export function oauthError(cause: string): OAuthError {
  return { kind: 'oauth-error', cause };
}

// ---- Type guards ----

export function isOk<T, E extends { kind: string }>(r: Result<T, E>): r is Ok<T> {
  return r.kind === 'ok';
}
