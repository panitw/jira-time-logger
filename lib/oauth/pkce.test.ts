import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge, generateStateToken } from './pkce';

describe('generateCodeVerifier', () => {
  it('produces a 43-character string for a 32-byte random source', () => {
    const v = generateCodeVerifier();
    expect(v.length).toBe(43);
  });

  it('uses only URL-safe base64 alphabet (no +/= chars)', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces a different value on each call (cryptographically random)', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe('generateCodeChallenge (RFC 7636 Appendix B test vector)', () => {
  it('verifier dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk → challenge E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', async () => {
    // The canonical RFC 7636 §4.2 test vector.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('is deterministic — same verifier always produces the same challenge', async () => {
    const verifier = generateCodeVerifier();
    const c1 = await generateCodeChallenge(verifier);
    const c2 = await generateCodeChallenge(verifier);
    expect(c1).toBe(c2);
  });

  it('produces a 43-character base64url string (SHA-256 → 32 bytes → 43 chars no padding)', async () => {
    const c = await generateCodeChallenge('any-verifier-string-here-1234567890abcde');
    expect(c.length).toBe(43);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('generateStateToken', () => {
  it('produces a non-empty URL-safe base64 string', () => {
    const s = generateStateToken();
    expect(s.length).toBeGreaterThan(0);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces a different value on each call', () => {
    expect(generateStateToken()).not.toBe(generateStateToken());
  });
});
