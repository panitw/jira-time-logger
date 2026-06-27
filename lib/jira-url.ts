/**
 * Pure Jira URL helpers (Story 3.3).
 *
 * Kept tiny and dependency-free so it is unit-testable and safe to import into
 * the content-script bundle.
 */

// Jira issue keys: project key (letter + alphanumerics) + dash + number.
const BROWSE_KEY_RE = /\/browse\/([A-Za-z][A-Za-z0-9]+-\d+)(?:[/?#]|$)/;

/**
 * Extract the issue key from a `/browse/<KEY>` URL, or `undefined` if the URL
 * is not a subtask/issue page. Tolerates a trailing slash, `?query`, `#anchor`.
 * The returned key is upper-cased (Jira keys are upper).
 */
export function currentTicketFromUrl(url: string): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return undefined;
  }
  const match = BROWSE_KEY_RE.exec(pathname);
  if (!match) return undefined;
  return match[1]!.toUpperCase();
}
