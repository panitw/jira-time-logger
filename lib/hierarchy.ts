/**
 * Reporting-line hierarchy walk for the Today picker pre-fill source.
 *
 * Fetches open tickets for the worker, their manager, and their skip-level
 * manager, then assembles a 2-level Task → Subtask tree.
 *
 * Per architecture.md > Data Architecture: this module is framework-agnostic.
 * The popup consumes it through hooks/useHierarchyTickets.ts.
 */
import { jiraGet } from '@/lib/jira-client';
import {
  JiraHierarchySearchSchema,
  type JiraHierarchyIssue,
} from '@/lib/jira-types';
import { log } from '@/lib/log';
import { type Result, type JiraError, ok } from '@/lib/result';
import { getManagerNames } from '@/lib/storage/settings';

export type HierarchySource = 'self' | 'manager' | 'skip-level';

export type HierarchySubtask = {
  key: string;
  summary: string;
  assigneeDisplayName: string | null;
};

export type HierarchyTask = {
  key: string;
  summary: string;
  assigneeDisplayName: string | null;
  source: HierarchySource;
  subtasks: HierarchySubtask[];
};

const HIERARCHY_FIELDS = 'key,summary,issuetype,parent,assignee';
const MAX_RESULTS = 100;

function buildSearchUrl(jql: string): string {
  return `rest/api/3/search/jql?jql=${encodeURIComponent(
    jql,
  )}&maxResults=${MAX_RESULTS}&fields=${encodeURIComponent(HIERARCHY_FIELDS)}`;
}

function isSubtask(issue: JiraHierarchyIssue): boolean {
  return issue.fields.issuetype?.subtask === true;
}

function issueToTask(
  issue: JiraHierarchyIssue,
  source: HierarchySource,
): HierarchyTask {
  return {
    key: issue.key,
    summary: issue.fields.summary,
    assigneeDisplayName: issue.fields.assignee?.displayName ?? null,
    source,
    subtasks: [],
  };
}

function issueToSubtask(issue: JiraHierarchyIssue): HierarchySubtask {
  return {
    key: issue.key,
    summary: issue.fields.summary,
    assigneeDisplayName: issue.fields.assignee?.displayName ?? null,
  };
}

function sourcePriority(source: HierarchySource): number {
  switch (source) {
    case 'self':
      return 0;
    case 'manager':
      return 1;
    case 'skip-level':
      return 2;
  }
}

function mergeTask(
  map: Map<string, HierarchyTask>,
  issue: JiraHierarchyIssue,
  source: HierarchySource,
): void {
  const existing = map.get(issue.key);
  const task = issueToTask(issue, source);

  if (!existing) {
    map.set(issue.key, task);
    return;
  }

  if (sourcePriority(source) < sourcePriority(existing.source)) {
    existing.source = source;
    existing.summary = task.summary;
    existing.assigneeDisplayName = task.assigneeDisplayName;
  }
}

export async function fetchHierarchy(): Promise<
  Result<HierarchyTask[], JiraError>
> {
  log.info('hierarchy.fetch.start', {});

  const names = await getManagerNames();

  const selfResult = await jiraGet(
    buildSearchUrl(
      'assignee = currentUser() AND statusCategory != Done AND updated >= -28d',
    ),
    JiraHierarchySearchSchema,
  );
  if (selfResult.kind !== 'ok') {
    log.warn('hierarchy.fetch.self-failed', { kind: selfResult.kind });
    return selfResult;
  }

  const map = new Map<string, HierarchyTask>();
  const subtasks: JiraHierarchyIssue[] = [];

  for (const issue of selfResult.value.issues) {
    if (isSubtask(issue)) {
      subtasks.push(issue);
    } else {
      mergeTask(map, issue, 'self');
    }
  }

  if (names.managerAccountId) {
    const managerResult = await jiraGet(
      buildSearchUrl(
        `assignee = "${names.managerAccountId}" AND statusCategory != Done AND updated >= -28d AND issuetype != Sub-task`,
      ),
      JiraHierarchySearchSchema,
    );
    if (managerResult.kind === 'ok') {
      for (const issue of managerResult.value.issues) {
        mergeTask(map, issue, 'manager');
      }
    } else {
      log.warn('hierarchy.fetch.manager-failed', { kind: managerResult.kind });
    }
  }

  if (names.skipLevelAccountId) {
    const skipResult = await jiraGet(
      buildSearchUrl(
        `assignee = "${names.skipLevelAccountId}" AND statusCategory != Done AND updated >= -28d AND issuetype != Sub-task`,
      ),
      JiraHierarchySearchSchema,
    );
    if (skipResult.kind === 'ok') {
      for (const issue of skipResult.value.issues) {
        mergeTask(map, issue, 'skip-level');
      }
    } else {
      log.warn('hierarchy.fetch.skip-level-failed', { kind: skipResult.kind });
    }
  }

  for (const issue of subtasks) {
    const parent = issue.fields.parent;
    if (!parent) {
      log.warn('hierarchy.fetch.subtask-missing-parent', { key: issue.key });
      continue;
    }

    let task = map.get(parent.key);
    if (!task) {
      task = {
        key: parent.key,
        summary: parent.fields.summary,
        assigneeDisplayName: null,
        source: 'self',
        subtasks: [],
      };
      map.set(parent.key, task);
    }
    task.subtasks.push(issueToSubtask(issue));
  }

  const tasks = Array.from(map.values());
  log.info('hierarchy.fetch.complete', { taskCount: tasks.length });
  return ok(tasks);
}
