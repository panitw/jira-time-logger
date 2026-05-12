/**
 * Environment constants — Atlassian OAuth + endpoint URLs + scopes.
 *
 * The Atlassian client ID is a PUBLIC identifier (PKCE replaces the client
 * secret). It's safe to commit. Register at https://developer.atlassian.com/console.
 *
 * Per PRD NFR11, scopes are the minimum needed: read:jira-work, write:jira-work,
 * read:me, offline_access. Do NOT add scopes without an explicit decision.
 */

export const ATLASSIAN_CLIENT_ID = 'pCuA7JbGh6C5Ds3sP5qMnm1TIWdivPhP';

export const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize';
export const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
export const ATLASSIAN_ACCESSIBLE_RESOURCES_URL =
  'https://api.atlassian.com/oauth/token/accessible-resources';
export const ATLASSIAN_MYSELF_URL_TEMPLATE =
  'https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/myself';

export const OAUTH_SCOPES = [
  'read:jira-work',
  'write:jira-work',
  'read:me',
  'offline_access',
] as const;

export const OAUTH_AUDIENCE = 'api.atlassian.com';
