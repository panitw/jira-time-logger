/**
 * Approval-comment discovery + resolution (Story 5.1).
 *
 * `findApprovalComments` fetches every comment on an Epic, runs each body
 * through the fail-closed `parseApprovalComment`, drops the ones that aren't
 * verifiable approvals, and applies the "newest wins per (user, cycle)" rule.
 *
 * Consumers (seams): 5.4 cell-coloring / dirty-detection and 5.5 drill-down
 * read the resolved approval records. This module does NOT render UI or detect
 * dirtiness — it only returns the verified approvals those stories consume.
 *
 * All HTTP goes through `jiraGet` so it inherits the scheduler, OAuth
 * 401-refresh, status mapping, and Result handling. Comment-level parse
 * failures are silently dropped (never abort the call); only a network/auth/
 * parse failure of the LIST response surfaces as a JiraError.
 */
import { adfToText } from '@/lib/adf';
import { type ApprovalComment, parseApprovalComment } from '@/lib/comment-schema';
import { jiraGet } from '@/lib/jira-client';
import { JiraCommentListSchema } from '@/lib/jira-types';
import { type Result, type JiraError, ok, isOk } from '@/lib/result';

/** A verified approval paired with the Jira-native `created` timestamp. */
type TimedApproval = {
  approval: ApprovalComment;
  /** Jira `created` epoch ms; NaN if unparseable (sorts oldest). */
  createdMs: number;
};

/**
 * Apply the newest-wins-per-(user, cycle) rule. When multiple verified
 * approvals share the same (user, cycle), keep the one with the latest Jira
 * `created`. Deterministic tiebreak on equal timestamps: keep the FIRST one
 * encountered (i.e. the earlier position in the input array is retained).
 */
/** Composite-key delimiter (ASCII Unit Separator, U+001F) — the same byte the
 *  checksum canonical form uses. It cannot occur inside a Jira accountId or a
 *  cycle id, so two distinct (user, cycle) pairs can never collide on the
 *  joined key (a printable separator like a space would let `("a b","c")`
 *  clash with `("a","b c")`). */
const KEY_SEP = '';

function resolveNewestWins(timed: TimedApproval[]): ApprovalComment[] {
  const winners = new Map<string, TimedApproval>();
  for (const entry of timed) {
    const key = `${entry.approval.user}${KEY_SEP}${entry.approval.cycle}`;
    const existing = winners.get(key);
    // Treat an unparseable `created` (NaN) as the oldest possible time so it
    // never beats a real timestamp — whether it appears first or last. A bare
    // `NaN > x` comparison is always false, which would otherwise let a
    // first-encountered NaN entry incorrectly win over later valid duplicates.
    const entryMs = Number.isNaN(entry.createdMs) ? -Infinity : entry.createdMs;
    const existingMs =
      !existing || Number.isNaN(existing.createdMs) ? -Infinity : existing.createdMs;
    // Strictly-greater so an equal timestamp keeps the first-encountered entry.
    if (!existing || entryMs > existingMs) {
      winners.set(key, entry);
    }
  }
  return Array.from(winners.values()).map((e) => e.approval);
}

/** Page size for the comment-list fetch (Jira caps this server-side). */
const COMMENTS_PAGE_SIZE = 100;
/** Safety bound so a misbehaving `total`/page can never loop forever. */
const MAX_COMMENT_PAGES = 100;

export async function findApprovalComments(
  epicKey: string,
): Promise<Result<ApprovalComment[], JiraError>> {
  const timed: TimedApproval[] = [];
  let startAt = 0;

  // The Jira comment endpoint paginates (default page size ~100). An Epic with
  // many comments would otherwise silently drop approvals past the first page —
  // unacceptable for an audit-integrity read — so we loop until every page is
  // consumed (bounded by MAX_COMMENT_PAGES as a runaway guard).
  for (let page = 0; page < MAX_COMMENT_PAGES; page += 1) {
    const result = await jiraGet(
      `rest/api/3/issue/${encodeURIComponent(epicKey)}/comment?startAt=${startAt}&maxResults=${COMMENTS_PAGE_SIZE}`,
      JiraCommentListSchema,
    );
    if (!isOk(result)) {
      return result;
    }

    const { comments, total } = result.value;
    for (const comment of comments) {
      const text = adfToText(comment.body);
      const parsed = await parseApprovalComment(text);
      if (isOk(parsed)) {
        timed.push({ approval: parsed.value, createdMs: Date.parse(comment.created) });
      }
    }

    // Advance. Stop when this page returned nothing (defensive) or we've reached
    // the reported total. If `total` is absent, a short page (< page size) ends it.
    startAt += comments.length;
    if (comments.length === 0) break;
    if (total !== undefined) {
      if (startAt >= total) break;
    } else if (comments.length < COMMENTS_PAGE_SIZE) {
      break;
    }
  }

  return ok(resolveNewestWins(timed));
}
