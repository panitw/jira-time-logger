/**
 * PKCE (Proof Key for Code Exchange) per RFC 7636.
 *
 * The code_verifier is a high-entropy cryptographic random string (43–128
 * chars, URL-safe base64 alphabet). The code_challenge is its SHA-256 hash,
 * base64url-encoded. `code_challenge_method` is always `S256` — there is
 * NO `plain` fallback per architecture security guardrail.
 *
 * The verifier is single-use and short-lived; store in chrome.storage.session
 * (cleared on browser close), never chrome.storage.local.
 */

/**
 * Base64url-encode a Uint8Array per RFC 4648 §5 (URL-safe, no padding).
 */
function base64UrlEncode(bytes: Uint8Array): string {
  // btoa needs a binary string. For large inputs this loop is fine — code
  // verifiers are 32 bytes, challenges are 32 bytes.
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a 32-byte random code_verifier, base64url-encoded.
 * Output length: 43 characters (32 bytes → 43-char base64url with no padding).
 */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Generate the SHA-256 code_challenge for a given verifier, base64url-encoded.
 * Method is always S256 per RFC 7636 §4.2 and architecture security policy.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Generate a high-entropy random state token for CSRF defense.
 * 16 bytes → 22 chars base64url, sufficient for the OAuth state parameter.
 */
export function generateStateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}
