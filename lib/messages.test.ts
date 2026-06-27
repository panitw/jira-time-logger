import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OAuthConnectRequestedSchema,
  OAuthCompletedSchema,
  BannerStateRequestSchema,
  BannerStateResponseSchema,
  LogWorklogResponseSchema,
  sendRequest,
  onRequest,
} from './messages';

describe('OAuthConnectRequestedSchema', () => {
  it('accepts the empty payload', () => {
    expect(OAuthConnectRequestedSchema.parse({})).toEqual({});
  });
});

describe('OAuthCompletedSchema', () => {
  it('accepts a valid payload', () => {
    const payload = {
      cloudId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      siteUrl: 'https://acme.atlassian.net',
    };
    expect(OAuthCompletedSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a missing cloudId', () => {
    const result = OAuthCompletedSchema.safeParse({ siteUrl: 'https://acme.atlassian.net' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-URL siteUrl', () => {
    const result = OAuthCompletedSchema.safeParse({
      cloudId: 'abc',
      siteUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields silently (Zod default)', () => {
    // Zod by default strips unknown keys — verify that's the behavior we get.
    const result = OAuthCompletedSchema.parse({
      cloudId: 'abc',
      siteUrl: 'https://acme.atlassian.net',
      extra: 'ignored',
    });
    expect(result).toEqual({ cloudId: 'abc', siteUrl: 'https://acme.atlassian.net' });
  });
});

describe('banner-state schemas (Story 3.3)', () => {
  it('request requires a url string', () => {
    expect(BannerStateRequestSchema.safeParse({ url: 'https://x.atlassian.net/' }).success).toBe(
      true,
    );
    expect(BannerStateRequestSchema.safeParse({}).success).toBe(false);
  });

  it('response carries hoursMissing and optional currentTicket', () => {
    expect(BannerStateResponseSchema.parse({ hoursMissing: 6 })).toEqual({ hoursMissing: 6 });
    expect(
      BannerStateResponseSchema.parse({ hoursMissing: 6, currentTicket: 'AB-1' }),
    ).toEqual({ hoursMissing: 6, currentTicket: 'AB-1' });
  });

  it('log-worklog response status is an enum', () => {
    expect(LogWorklogResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(LogWorklogResponseSchema.safeParse({ status: 'nope' }).success).toBe(false);
  });
});

describe('request/response bus (sendRequest / onRequest)', () => {
  type Listener = (
    message: unknown,
    sender: unknown,
    sendResponse: (response?: unknown) => void,
  ) => boolean;
  const listeners: Listener[] = [];

  beforeEach(() => {
    listeners.length = 0;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: (l: Listener) => listeners.push(l),
          removeListener: (l: Listener) => {
            const i = listeners.indexOf(l);
            if (i >= 0) listeners.splice(i, 1);
          },
        },
        // Route sendMessage through any registered request listeners,
        // emulating Chrome's sendResponse round-trip.
        sendMessage: (envelope: unknown) =>
          new Promise((resolve, reject) => {
            let responded = false;
            for (const l of listeners) {
              const keepOpen = l(envelope, {}, (response?: unknown) => {
                responded = true;
                resolve(response);
              });
              if (keepOpen) return; // async handler will call sendResponse
            }
            if (!responded) reject(new Error('no receiver'));
          }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a validated request/response', async () => {
    const off = onRequest('banner-state', (req) => ({
      hoursMissing: req.url.includes('PROJ') ? 6 : 0,
      currentTicket: 'PROJ-1',
    }));
    const res = await sendRequest('banner-state', {
      url: 'https://x.atlassian.net/browse/PROJ-1',
    });
    expect(res).toEqual({ hoursMissing: 6, currentTicket: 'PROJ-1' });
    off();
  });

  it('returns null when there is no receiver', async () => {
    const res = await sendRequest('banner-state', { url: 'https://x.atlassian.net/' });
    expect(res).toBeNull();
  });

  it('returns null when the handler throws (does not hang)', async () => {
    const off = onRequest('banner-state', () => {
      throw new Error('boom');
    });
    const res = await sendRequest('banner-state', { url: 'https://x.atlassian.net/' });
    expect(res).toBeNull();
    off();
  });

  it('ignores envelopes for a different request kind', async () => {
    const handler = vi.fn(() => ({ status: 'ok' as const }));
    const off = onRequest('log-worklog-request', handler);
    // No banner-state handler registered → null, and the log handler is untouched.
    const res = await sendRequest('banner-state', { url: 'https://x.atlassian.net/' });
    expect(res).toBeNull();
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it('off() removes the listener', async () => {
    const off = onRequest('banner-state', () => ({ hoursMissing: 1 }));
    off();
    const res = await sendRequest('banner-state', { url: 'https://x.atlassian.net/' });
    expect(res).toBeNull();
  });
});
