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

export const JiraIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    summary: z.string(),
  }),
});

export type JiraIssue = z.infer<typeof JiraIssueSchema>;

export const JiraSearchSchema = z.object({
  issues: z.array(JiraIssueSchema),
});

// ---- Hierarchy-specific search response (Story 2.2) ----

export const JiraHierarchyIssueSchema = JiraIssueSchema.extend({
  fields: JiraIssueSchema.shape.fields.extend({
    issuetype: z
      .object({
        id: z.string(),
        name: z.string(),
        subtask: z.boolean().optional(),
      })
      .optional(),
    parent: z
      .object({
        id: z.string(),
        key: z.string(),
        fields: z.object({ summary: z.string() }),
      })
      .optional(),
    assignee: z
      .object({
        accountId: z.string(),
        displayName: z.string(),
      })
      .optional(),
  }),
});

export type JiraHierarchyIssue = z.infer<typeof JiraHierarchyIssueSchema>;

export const JiraHierarchySearchSchema = z.object({
  issues: z.array(JiraHierarchyIssueSchema),
});