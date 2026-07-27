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
 * `GET /rest/api/3/project/{key}` response shape (Story 7.10 / AC6): used
 * both to confirm a catch-all project key resolves to a real project (a 404
 * means it doesn't) and to read the project's display name for the
 * settled-valid confirmation ("<project name> — N subtasks"). Tolerant of
 * every other field Jira returns.
 */
export const JiraProjectSchema = z.object({
  key: z.string(),
  name: z.string(),
});

export type JiraProject = z.infer<typeof JiraProjectSchema>;

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

/**
 * Story 7.8 / D-7.8-20: `nextPageToken`/`isLast` are the enhanced
 * `/rest/api/3/search/jql` endpoint's TOKEN-pagination signal. Optional and
 * purely additive — every existing consumer (`lib/catch-all.ts`,
 * `lib/ticket-search.ts`, the flat `fetchCurrentUserWeekWorklogs`) reads only
 * `issues` and is unaffected. `lib/jira-client.ts#fetchAllSearchPages` is the
 * ONLY place that reads these two fields.
 */
export const JiraSearchSchema = z.object({
  issues: z.array(JiraIssueSchema),
  nextPageToken: z.string().optional(),
  isLast: z.boolean().optional(),
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
    /**
     * Story 7.4 (D-7.4-13, owner decision): `lib/ticket-search.ts` dropped its
     * `statusCategory != Done` / `updated >= -28d` JQL clauses so "any ticket"
     * is literally reachable. The forced mitigation is RANKING, not
     * filtering — open tickets before done ones, recently-updated before
     * stale — so `hooks/useTicketSearch.ts` needs these two fields to rank
     * with. Both optional/tolerant, same as every other field here.
     */
    status: z
      .object({
        statusCategory: z.object({ key: z.string() }).optional(),
      })
      .optional(),
    updated: z.string().optional(),
  }),
});

export type JiraHierarchyIssue = z.infer<typeof JiraHierarchyIssueSchema>;

export const JiraHierarchySearchSchema = z.object({
  issues: z.array(JiraHierarchyIssueSchema),
});

// ---- Manager matrix (Story 5.3): report-scoped, Epic-grouped worklogs ----

/**
 * A single issue from the report-scoped worklog search (Story 5.3). Carries the
 * direct `parent` (typically the Story/Task one level above a subtask) so the
 * matrix can roll a logged subtask up to its owning Epic. Tolerant of extra
 * fields. The `parent` nested `fields` is optional because Jira occasionally
 * omits it on the search projection.
 */
export const JiraMatrixIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    issuetype: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        subtask: z.boolean().optional(),
      })
      .optional(),
    parent: z
      .object({
        id: z.string().optional(),
        key: z.string(),
        // `summary` is optional even when `fields` is present: Jira can return a
        // parent whose summary is redacted/restricted. Requiring it would turn
        // one restricted parent into a whole-row "Couldn't load". The rollup
        // falls back to the parent key when summary is absent.
        fields: z.object({ summary: z.string().optional() }).optional(),
      })
      .optional(),
  }),
});

export type JiraMatrixIssue = z.infer<typeof JiraMatrixIssueSchema>;

/** Story 7.8 / D-7.8-20: same additive token-pagination signal as
 * `JiraSearchSchema` above — see that schema's doc comment. */
export const JiraMatrixSearchSchema = z.object({
  issues: z.array(JiraMatrixIssueSchema),
  nextPageToken: z.string().optional(),
  isLast: z.boolean().optional(),
});

/**
 * Single-issue lookup used to walk one level up the hierarchy (subtask →
 * Story/Task → Epic). The report-scoped search only returns the *direct*
 * parent, so the matrix resolves the grandparent (the Epic) with one lookup per
 * distinct parent key. Same tolerant shape as `JiraMatrixIssueSchema`.
 */
export const JiraIssueLookupSchema = JiraMatrixIssueSchema;

export type JiraIssueLookup = z.infer<typeof JiraIssueLookupSchema>;

/**
 * One Epic column's data for a single report (Story 5.3). `totalSeconds` is the
 * per-(report, Epic) roll-up; `worklogs` PRESERVES the underlying per-ticket
 * records (with `updated`) so Story 5.5 can filter them client-side for the
 * drill-down and Story 5.4 can dirty-detect. Do NOT collapse to totals only.
 *
 * `restrictedCount` (Story 5.4) is the per-Epic count of visibility-restricted
 * worklogs the manager cannot see — derived from the worklog endpoint's `total`
 * minus the number of worklogs actually returned. Always a finite, non-negative
 * integer (0 when nothing is hidden or the endpoint omits `total`).
 */
export type ReportEpicWorklogs = {
  epicKey: string;
  epicSummary: string;
  totalSeconds: number;
  restrictedCount: number;
  worklogs: Array<{
    ticketKey: string;
    ticketSummary: string;
    seconds: number;
    started?: string;
    updated?: string;
  }>;
};

/**
 * One report row's resolved matrix data (Story 5.4): the per-Epic groups plus
 * the row-summed `restrictedCount` (the "⚠ N restricted" chip count). Wrapping
 * the array keeps the per-Epic lock overlay (each `ReportEpicWorklogs`'s own
 * `restrictedCount`) and the row chip in one return value.
 *
 * Story 7.8 / D-7.8-20 (SUPERSEDES D-7.8-16): this type USED to carry a
 * `truncated: boolean` flag for `fetchReportCycleWorklogsByEpic`'s unpaged
 * `maxResults=100` search cap. The review found the flag could not be
 * trusted — Jira's `/search/jql` is token-paginated and can return a page
 * shorter than `maxResults` while further pages remain, so a genuinely
 * truncated response could read as complete. Rather than ship an unreliable
 * warning, `fetchReportCycleWorklogsByEpic` now pages through every result via
 * `fetchAllSearchPages` (`lib/jira-client.ts`), so the totals are simply
 * correct and no flag is needed. Do not re-add a `truncated` field without a
 * new owner ruling.
 */
export type ReportCycleWorklogs = {
  epics: ReportEpicWorklogs[];
  /** Sum of every Epic's `restrictedCount` for this report this cycle. */
  restrictedCount: number;
};