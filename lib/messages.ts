/**
 * Inter-surface message bus stub.
 *
 * For Story 1.1 we register just the two OAuth-related message kinds.
 * Subsequent stories register their own kinds following the same Zod-validated
 * tagged-union pattern (refresh-badge, log-worklog, approve-cycle, etc.).
 *
 * Naming convention: kebab-case verb-noun. Each message carries a Zod schema
 * for the payload so sender and receiver share a strict contract.
 *
 * NOTE: WXT v0.20.x does not export a `defineMessage<Schema>` helper publicly
 * out of the box; the architecture's reference to it was aspirational. We
 * implement a thin registry on top of `chrome.runtime.sendMessage` /
 * `onMessage` here so future stories can swap to WXT's official messaging
 * helper if/when it stabilizes.
 */
import { z } from 'zod';
import { log } from './log';

// ---- Schemas ----

export const OAuthConnectRequestedSchema = z.object({});
export const OAuthCompletedSchema = z.object({
  cloudId: z.string(),
  siteUrl: z.string().url(),
});
export const DisconnectRequestedSchema = z.object({});

// Story 2.4 — worklog logging + badge broadcast
export const LogWorklogSchema = z.object({
  issueKey: z.string(),
  timeSpentSeconds: z.number(),
  started: z.string(),
  comment: z.string().optional(),
});
export const BadgeUpdateSchema = z.object({
  hoursMissing: z.number(),
});

// Story 3.3 — inline banner: fire-and-forget "open the popup" (the content
// script cannot call chrome.action.openPopup itself; the SW does it).
export const OpenPopupSchema = z.object({});

// ---- Registry (tagged union) ----

export type MessageRegistry = {
  'oauth-connect-requested': z.infer<typeof OAuthConnectRequestedSchema>;
  'oauth-completed': z.infer<typeof OAuthCompletedSchema>;
  'disconnect': z.infer<typeof DisconnectRequestedSchema>;
  'log-worklog': z.infer<typeof LogWorklogSchema>;
  'badge-update': z.infer<typeof BadgeUpdateSchema>;
  'open-popup': z.infer<typeof OpenPopupSchema>;
};

export type MessageKind = keyof MessageRegistry;

const SCHEMAS: { [K in MessageKind]: z.ZodType<MessageRegistry[K]> } = {
  'oauth-connect-requested': OAuthConnectRequestedSchema,
  'oauth-completed': OAuthCompletedSchema,
  'disconnect': DisconnectRequestedSchema,
  'log-worklog': LogWorklogSchema,
  'badge-update': BadgeUpdateSchema,
  'open-popup': OpenPopupSchema,
};

type EnvelopeOf<K extends MessageKind> = { kind: K; payload: MessageRegistry[K] };

// ---- Send / receive ----

export async function sendMessage<K extends MessageKind>(
  kind: K,
  payload: MessageRegistry[K],
): Promise<void> {
  const parsed = SCHEMAS[kind].safeParse(payload);
  if (!parsed.success) {
    log.warn('messages.send.invalid', { kind, issues: parsed.error.issues });
    return;
  }
  const envelope: EnvelopeOf<K> = { kind, payload: parsed.data };
  try {
    await chrome.runtime.sendMessage(envelope);
  } catch (err) {
    log.debug('messages.send.no-receiver', { kind, err: String(err) });
  }
}

export function onMessage<K extends MessageKind>(
  kind: K,
  handler: (payload: MessageRegistry[K]) => void | Promise<void>,
): () => void {
  const listener = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    _sendResponse: (response?: unknown) => void,
  ): boolean => {
    if (!isEnvelope(message) || message.kind !== kind) return false;
    const parsed = SCHEMAS[kind].safeParse(message.payload);
    if (!parsed.success) {
      log.warn('messages.receive.invalid', { kind, issues: parsed.error.issues });
      return false;
    }
    void Promise.resolve(handler(parsed.data as MessageRegistry[K])).catch((e) =>
      log.error('messages.handler.error', { kind, error: String(e) }),
    );
    return false; // not using sendResponse / not keeping channel open
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

function isEnvelope(value: unknown): value is { kind: string; payload: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as { kind: unknown }).kind === 'string' &&
    'payload' in value
  );
}

// ---- Request/response messages (Story 3.3) ----
//
// The fire-and-forget bus above intentionally `return false`s and never calls
// `sendResponse`. The banner needs a REPLY (current deficit; log result), so we
// add a parallel request/response channel that keeps the message port open
// (`return true`) and resolves with the validated response. This does NOT touch
// the fire-and-forget contract or its listeners.

export const BannerStateRequestSchema = z.object({ url: z.string() });
export const BannerStateResponseSchema = z.object({
  hoursMissing: z.number(),
  currentTicket: z.string().optional(),
});

// The banner posts a worklog via the SW (it cannot call postWorklog in-page —
// it would bypass the SW scheduler). Reuses the LogWorklog payload shape.
export const LogWorklogRequestSchema = LogWorklogSchema;
export const LogWorklogResponseSchema = z.object({
  status: z.enum(['ok', 'pending', 'error']),
});

export type RequestRegistry = {
  'banner-state': {
    request: z.infer<typeof BannerStateRequestSchema>;
    response: z.infer<typeof BannerStateResponseSchema>;
  };
  'log-worklog-request': {
    request: z.infer<typeof LogWorklogRequestSchema>;
    response: z.infer<typeof LogWorklogResponseSchema>;
  };
};

export type RequestKind = keyof RequestRegistry;

const REQUEST_SCHEMAS: {
  [K in RequestKind]: {
    request: z.ZodType<RequestRegistry[K]['request']>;
    response: z.ZodType<RequestRegistry[K]['response']>;
  };
} = {
  'banner-state': {
    request: BannerStateRequestSchema,
    response: BannerStateResponseSchema,
  },
  'log-worklog-request': {
    request: LogWorklogRequestSchema,
    response: LogWorklogResponseSchema,
  },
};

type RequestEnvelopeOf<K extends RequestKind> = {
  reqKind: K;
  payload: RequestRegistry[K]['request'];
};

function isRequestEnvelope(
  value: unknown,
): value is { reqKind: string; payload: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'reqKind' in value &&
    typeof (value as { reqKind: unknown }).reqKind === 'string' &&
    'payload' in value
  );
}

/**
 * Send a request and await the SW's validated response. Returns `null` if the
 * payload is invalid, there is no receiver, or the response fails validation —
 * callers treat `null` as "no answer" and degrade gracefully (the banner hides).
 */
export async function sendRequest<K extends RequestKind>(
  kind: K,
  payload: RequestRegistry[K]['request'],
): Promise<RequestRegistry[K]['response'] | null> {
  const parsed = REQUEST_SCHEMAS[kind].request.safeParse(payload);
  if (!parsed.success) {
    log.warn('messages.request.invalid', { kind, issues: parsed.error.issues });
    return null;
  }
  const envelope: RequestEnvelopeOf<K> = { reqKind: kind, payload: parsed.data };
  try {
    const raw = await chrome.runtime.sendMessage(envelope);
    const validated = REQUEST_SCHEMAS[kind].response.safeParse(raw);
    if (!validated.success) {
      log.debug('messages.response.invalid', { kind });
      return null;
    }
    return validated.data;
  } catch (err) {
    log.debug('messages.request.no-receiver', { kind, err: String(err) });
    return null;
  }
}

/**
 * Register a request handler that replies with a validated response. Keeps the
 * message channel open (`return true`) and calls `sendResponse` once the async
 * handler resolves. On handler error it responds with a schema-valid fallback
 * so the caller's `await` never hangs.
 */
export function onRequest<K extends RequestKind>(
  kind: K,
  handler: (
    payload: RequestRegistry[K]['request'],
  ) => RequestRegistry[K]['response'] | Promise<RequestRegistry[K]['response']>,
): () => void {
  const listener = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean => {
    if (!isRequestEnvelope(message) || message.reqKind !== kind) return false;
    const parsed = REQUEST_SCHEMAS[kind].request.safeParse(message.payload);
    if (!parsed.success) {
      log.warn('messages.request.receive-invalid', {
        kind,
        issues: parsed.error.issues,
      });
      return false;
    }
    void Promise.resolve(handler(parsed.data))
      .then((result) => sendResponse(result))
      .catch((e) => {
        log.error('messages.request.handler.error', { kind, error: String(e) });
        // Best-effort: do not leave the caller hanging. Sending `undefined`
        // makes sendRequest's response validation fail → caller gets `null`.
        sendResponse(undefined);
      });
    return true; // keep the channel open for the async sendResponse
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
