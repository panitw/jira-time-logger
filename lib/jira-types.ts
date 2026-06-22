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

/**
 * Jira `POST /rest/api/3/issue` create-issue response shape.
 *
 * NOTE: Jira returns only `{ id, key, self }` on create — no `fields`.
 * Do NOT use `JiraIssueSchema` (which requires `fields.summary`) to parse
 * a create response; use this schema instead. The summary is sourced from
 * the user-typed input on the caller side.
 */
export const JiraCreateIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
});

export type JiraCreateIssue = z.infer<typeof JiraCreateIssueSchema>;

export const JiraSearchSchema = z.object({
  issues: z.array(JiraIssueSchema),
});

// ---- Worklog (Story 2.4) — POST /rest/api/3/issue/{key}/worklog response ----

export const JiraWorklogSchema = z.object({
  id: z.string(),
  timeSpentSeconds: z.number(),
  timeSpent: z.string().optional(),
  started: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  comment: z.unknown().optional(),
  author: z
    .object({
      accountId: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
});

export type JiraWorklog = z.infer<typeof JiraWorklogSchema>;

/**
 * Jira `GET /rest/api/3/issue/{key}/worklog` response shape (Story 3.1).
 * A paginated wrapper around an array of worklogs. The badge fetch scopes this
 * with `startedAfter`/`startedBefore` so a single week's worklogs fit one page.
 */
export const JiraWorklogListSchema = z.object({
  worklogs: z.array(JiraWorklogSchema),
  total: z.number().optional(),
});

export type JiraWorklogList = z.infer<typeof JiraWorklogListSchema>;

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