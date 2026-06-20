# Story 1.5: Catch-All Project & PTO Subtask Configuration

Status: ready-for-dev
baseline_commit: HEAD

## Story

As a connected worker, I want to configure my catch-all project key (default `KNP`) and pick a PTO subtask within it, so that the extension knows where to post my Admin/Meetings/PTO worklogs.

## Acceptance Criteria

1. Options page shows "Catch-all project" section with text input labelled "Project key" pre-filled with `KNP`, helper text "(default)". Below it, a "PTO subtask" dropdown appears once a valid project key resolves.
2. On blur, value is normalized (trim, uppercase) and saved to `chrome.storage.local`. PTO subtask dropdown fetches from Jira JQL: subtasks within configured project.
3. PTO subtask dropdown lists all subtasks (key + summary), user picks one, selection saved to settings.
4. Invalid project key shows `state.danger` border + "Project key not found or no access" helper. Dropdown hidden.
5. No PTO subtask configured: subsequent flows degrade gracefully per AR28.

## Dev Notes

- Build `components/settings/CatchAllProjectField.tsx` following `ManagerDisplay.tsx` pattern.
- Extend `lib/storage/settings.ts`: `catchAllProjectKey`, `ptoSubtaskKey`, `ptoSubtaskSummary`.
- Use `jiraGet` to validate project key and fetch subtasks via JQL.
- Use `lib/jira-types.ts` — add `JiraIssueSchema` for search results.
