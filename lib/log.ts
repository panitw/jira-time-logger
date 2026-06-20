/**
 * In-house console logger with levels + token-redaction discipline.
 *
 * Per PRD NFR9: no third-party telemetry (no Sentry, no LogRocket, no Datadog).
 * Per architecture.md > Process Patterns > Logging: event names are
 * `noun.verb` (e.g., `oauth.flow.failed`); payloads are flat objects with no PII.
 *
 * ESLint forbids direct `console.log` outside `*.test.ts` files. Always use
 * `log.<level>(event, payload?)`.
 *
 * Token redaction: keys named access_token, refresh_token, code_verifier,
 * code_challenge, Authorization are replaced with '[redacted]' before output.
 */

type LogPayload = Record<string, unknown>;

const REDACTED_KEYS = new Set([
  'access_token',
  'refresh_token',
  'code_verifier',
  'code_challenge',
  'authorization',
]);

const REDACTED = '[redacted]';

export function redact(payload: LogPayload | undefined): LogPayload | undefined {
  if (!payload) return payload;
  const out: LogPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      out[key] = REDACTED;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redact(value as LogPayload);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const isProd = import.meta.env?.PROD === true;

export const log = {
  debug(event: string, payload?: LogPayload): void {
    if (isProd) return;
    console.debug(event, redact(payload));
  },
  info(event: string, payload?: LogPayload): void {
    console.info(event, redact(payload));
  },
  warn(event: string, payload?: LogPayload): void {
    console.warn(event, redact(payload));
  },
  error(event: string, payload?: LogPayload): void {
    console.error(event, redact(payload));
  },
};
