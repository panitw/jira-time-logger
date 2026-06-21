/**
 * One-click PTO worklog helpers (Story 2.5).
 *
 * Framework-agnostic. Posts a single worklog to the configured PTO subtask via
 * jira-client.postWorklog, using lib/hours.hoursToSeconds — NO inline `* 3600`
 * (architecture binding rule). Returns Result<JiraWorklog, JiraError>.
 *
 * `started` is the today-at-09:00 ISO string (see lib/worklog-date.formatStartedISO,
 * shared with QuickLogForm). Callers pass it in so this module stays time-pure.
 */
import { postWorklog } from '@/lib/jira-client';
import { hoursToSeconds } from '@/lib/hours';
import { type JiraWorklog } from '@/lib/jira-types';
import { type Result, type JiraError } from '@/lib/result';

export async function logFullDayPto(
  ptoSubtaskKey: string,
  targetHours: number,
  started: string,
): Promise<Result<JiraWorklog, JiraError>> {
  return postWorklog(ptoSubtaskKey, {
    timeSpentSeconds: hoursToSeconds(targetHours),
    started,
  });
}

export async function logHalfDayPto(
  ptoSubtaskKey: string,
  targetHours: number,
  started: string,
): Promise<Result<JiraWorklog, JiraError>> {
  return postWorklog(ptoSubtaskKey, {
    timeSpentSeconds: hoursToSeconds(targetHours / 2),
    started,
  });
}
