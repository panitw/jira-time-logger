import { describe, it, expect } from 'vitest';
import { OAuthConnectRequestedSchema, OAuthCompletedSchema } from './messages';

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
