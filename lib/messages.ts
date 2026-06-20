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

// ---- Registry (tagged union) ----

export type MessageRegistry = {
  'oauth-connect-requested': z.infer<typeof OAuthConnectRequestedSchema>;
  'oauth-completed': z.infer<typeof OAuthCompletedSchema>;
  'disconnect': z.infer<typeof DisconnectRequestedSchema>;
};

export type MessageKind = keyof MessageRegistry;

const SCHEMAS: { [K in MessageKind]: z.ZodType<MessageRegistry[K]> } = {
  'oauth-connect-requested': OAuthConnectRequestedSchema,
  'oauth-completed': OAuthCompletedSchema,
  'disconnect': DisconnectRequestedSchema,
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
