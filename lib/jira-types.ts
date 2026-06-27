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

/**
 * `GET /rest/api/3/user/search?query=…` directory-query response (Story 5.2).
 *
 * A bare array of user records. Each entry carries `accountId` + `displayName`;
 * the optional `manager` sub-object (same shape as `JiraUserSchema.manager`) is
 * present only when the deployment expands it. `findDirectReports` uses this as
 * the candidate set, then confirms each candidate's manager. Tolerates the many
 * extra fields the directory returns (avatarUrls, active, accountType, …).
 */
export const JiraUserSearchResultSchema = z.array(
  z.object({
    accountId: z.string(),
    displayName: z.string(),
    manager: z
      .object({
        accountId: z.string(),
        displayName: z.string(),
      })
      .optional(),
  }),
);

export type JiraUserSearchResult = z.infer<typeof JiraUserSearchResultSchema>;

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

/**
 * One issue paired with its in-range worklogs (Story 4.1, week grid).
 *
 * Unlike the flat `fetchCurrentUserWeekWorklogs` (badge 3.1 / banner 3.3) which
 * discards the issue, the week grid needs per-subtask rows, so the issue
 * `key`/`summary` must survive alongside its worklogs. Composed from existing
 * wire schemas — no new Zod schema needed.
 */
export type WeekIssueWorklogs = {
  key: string;
  summary: string;
  worklogs: JiraWorklog[];
};

// ---- Comments (Story 5.1) — GET /rest/api/3/issue/{key}/comment ----

/**
 * One Jira comment. `body` is an ADF document (object), typed `z.unknown()` —
 * the approval parser converts it to text via `adfToText`. `created` is the
 * Jira-native ISO timestamp used as the newest-wins tiebreaker (NOT the payload
 * `at` field). Tolerates extra fields like Jira's full comment shape.
 */
export const JiraCommentSchema = z.object({
  id: z.string(),
  created: z.string(),
  body: z.unknown(),
});

export type JiraComment = z.infer<typeof JiraCommentSchema>;

/**
 * The paginated wrapper Jira returns for the comment-list endpoint. `startAt`,
 * `maxResults`, and `total` drive the pagination loop in `findApprovalComments`
 * so an Epic with more comments than one page still surfaces every approval.
 */
export const JiraCommentListSchema = z.object({
  comments: z.array(JiraCommentSchema),
  startAt: z.number().optional(),
  maxResults: z.number().optional(),
  total: z.number().optional(),
});

export type JiraCommentList = z.infer<typeof JiraCommentListSchema>;

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