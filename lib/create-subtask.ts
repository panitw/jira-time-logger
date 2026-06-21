import { jiraGet, jiraPost } from '@/lib/jira-client';
import {
  JiraMyselfSchema,
  JiraCreateIssueSchema,
  type JiraCreateIssue,
} from '@/lib/jira-types';
import { type Result, type JiraError } from '@/lib/result';

function deriveProjectKey(parentKey: string): string {
  const dashIndex = parentKey.indexOf('-');
  return dashIndex > 0 ? parentKey.slice(0, dashIndex) : parentKey;
}

export type CreatedSubtask = JiraCreateIssue & {
  /** The summary the user typed — Jira's create response omits `fields`, so we echo the input. */
  summary: string;
};

export async function createSubtask(
  parentKey: string,
  summary: string,
): Promise<Result<CreatedSubtask, JiraError>> {
  const myselfResult = await jiraGet('rest/api/3/myself', JiraMyselfSchema);
  if (myselfResult.kind !== 'ok') {
    return myselfResult;
  }

  const projectKey = deriveProjectKey(parentKey);

  const body = {
    fields: {
      project: { key: projectKey },
      summary,
      issuetype: { name: 'Sub-task' },
      parent: { key: parentKey },
      assignee: { accountId: myselfResult.value.accountId },
    },
  };

  const result = await jiraPost('rest/api/3/issue', body, JiraCreateIssueSchema);
  if (result.kind !== 'ok') {
    return result;
  }
  return { kind: 'ok', value: { ...result.value, summary } };
}
