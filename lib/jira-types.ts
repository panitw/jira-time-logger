/**
 * Zod schemas for Jira Cloud REST API v3 responses.
 *
 * Per architecture.md > Implementation Patterns:
 *   - Schema names suffixed `Schema`
 *   - Inferred types omit the suffix
 *   - All schemas tolerate extra fields (Zod ignores by default)
 */
import { z } from 'zod';

export const JiraMyselfSchema = z.object({
  accountId: z.string(),
  displayName: z.string(),
  emailAddress: z.string().optional(),
});

export type JiraMyself = z.infer<typeof JiraMyselfSchema>;

export const JiraUserSchema = z.object({
  accountId: z.string(),
  displayName: z.string(),
  manager: z
    .object({
      accountId: z.string(),
      displayName: z.string(),
    })
    .optional(),
});

export type JiraUser = z.infer<typeof JiraUserSchema>;