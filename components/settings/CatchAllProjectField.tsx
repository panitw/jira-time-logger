import { useCallback, useEffect, useState } from 'react';
import { jiraGet } from '@/lib/jira-client';
import { JiraSearchSchema, type JiraIssue } from '@/lib/jira-types';
import {
  catchAllProjectKeyItem,
  ptoSubtaskKeyItem,
  ptoSubtaskSummaryItem,
} from '@/lib/storage/settings';

const STRINGS = {
  heading: 'Catch-all project',
  projectKeyLabel: 'Project key',
  projectKeyHelper: '(default)',
  projectKeyNotFound: 'Project key not found or no access — check the key and your permissions',
  ptoLabel: 'PTO subtask',
  ptoLoading: 'Loading subtasks…',
  ptoEmpty: 'No subtasks found in this project',
  ptoPlaceholder: 'Select a subtask…',
  validating: 'Validating…',
};

export function CatchAllProjectField(): React.ReactElement {
  const [projectKey, setProjectKey] = useState('KNP');
  const [loaded, setLoaded] = useState(false);
  const [validating, setValidating] = useState(false);
  const [keyError, setKeyError] = useState(false);
  const [subtasks, setSubtasks] = useState<JiraIssue[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const validateAndFetch = useCallback(async (key: string) => {
    setValidating(true);
    setKeyError(false);
    const result = await jiraGet(
      `rest/api/3/search?jql=project=${encodeURIComponent(key)}&maxResults=1`,
      JiraSearchSchema,
    );
    if (result.kind !== 'ok') { setKeyError(true); setSubtasks([]); setValidating(false); return; }
    setLoadingSubtasks(true);
    const subtaskResult = await jiraGet(
      `rest/api/3/search?jql=project=${encodeURIComponent(key)}+AND+issuetype=Sub-task&maxResults=50`,
      JiraSearchSchema,
    );
    setLoadingSubtasks(false);
    setSubtasks(subtaskResult.kind === 'ok' ? subtaskResult.value.issues : []);
    setValidating(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const stored = await catchAllProjectKeyItem.getValue();
      setProjectKey(stored);
      const ptoKey = await ptoSubtaskKeyItem.getValue();
      setSelectedKey(ptoKey);
      if (stored && stored !== 'KNP') await validateAndFetch(stored);
      setLoaded(true);
    })();
  }, [validateAndFetch]);

  const handleKeyBlur = useCallback(async () => {
    const normalized = projectKey.trim().toUpperCase();
    if (normalized === '') return;
    setProjectKey(normalized);
    await catchAllProjectKeyItem.setValue(normalized);
    await validateAndFetch(normalized);
  }, [projectKey, validateAndFetch]);

  const handleSubtasksChange = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10);
    const issue = subtasks[idx];
    if (!issue) return;
    await ptoSubtaskKeyItem.setValue(issue.key);
    await ptoSubtaskSummaryItem.setValue(issue.fields.summary);
    setSelectedKey(issue.key);
  }, [subtasks]);

  if (!loaded) return <section className="mt-8"><h3 className="text-base font-semibold text-neutral-900">{STRINGS.heading}</h3><hr className="my-3 border-neutral-200" /><p className="text-sm text-neutral-500">{STRINGS.validating}</p></section>;

  return (
    <section className="mt-8">
      <h3 className="text-base font-semibold text-neutral-900">{STRINGS.heading}</h3>
      <hr className="my-3 border-neutral-200" />
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">{STRINGS.projectKeyLabel}</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              onBlur={() => void handleKeyBlur()}
              className={`block w-32 rounded-md border px-3 py-1.5 text-sm font-mono ${keyError ? 'border-state-danger focus:ring-state-danger' : 'border-neutral-200 focus:ring-accent'} focus:outline-none focus:ring-2 focus:ring-offset-1`}
              placeholder="KNP"
            />
            {!keyError && projectKey === 'KNP' && <span className="text-xs text-neutral-500">{STRINGS.projectKeyHelper}</span>}
            {validating && <span className="text-xs text-neutral-500">{STRINGS.validating}</span>}
          </div>
          {keyError && <p className="mt-1 text-xs text-state-danger">{STRINGS.projectKeyNotFound}</p>}
        </div>
        {!keyError && subtasks.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-neutral-700">{STRINGS.ptoLabel}</label>
            <select value={subtasks.findIndex((s) => s.key === selectedKey)} onChange={(e) => void handleSubtasksChange(e)} className="mt-1 block w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1">
              <option value={-1}>{STRINGS.ptoPlaceholder}</option>
              {subtasks.map((issue, idx) => <option key={issue.key} value={idx}>{issue.key} — {issue.fields.summary}</option>)}
            </select>
          </div>
        )}
        {loadingSubtasks && <p className="text-sm text-neutral-500">{STRINGS.ptoLoading}</p>}
        {!keyError && !loadingSubtasks && subtasks.length === 0 && !validating && projectKey !== 'KNP' && <p className="text-sm text-neutral-500">{STRINGS.ptoEmpty}</p>}
      </div>
    </section>
  );
}