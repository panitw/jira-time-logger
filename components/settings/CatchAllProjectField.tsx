import { useCallback, useEffect, useRef, useState } from 'react';
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

type Props = {
  onSaved?: () => void;
};

export function CatchAllProjectField({ onSaved }: Props): React.ReactElement {
  const [projectKey, setProjectKey] = useState('KNP');
  const [loaded, setLoaded] = useState(false);
  const [validating, setValidating] = useState(false);
  const [keyError, setKeyError] = useState(false);
  const [subtasks, setSubtasks] = useState<JiraIssue[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const lastCallId = useRef(0);

  const validateAndFetch = useCallback(async (key: string): Promise<boolean> => {
    const callId = ++lastCallId.current;
    setValidating(true);
    setKeyError(false);
    setLoadingSubtasks(false);
    const result = await jiraGet(
      `rest/api/3/search/jql?jql=project=${encodeURIComponent(key)}&maxResults=1&fields=key,summary`,
      JiraSearchSchema,
    );
    if (result.kind !== 'ok') { setKeyError(true); setSubtasks([]); setValidating(false); return false; }
    setLoadingSubtasks(true);
    const subtaskResult = await jiraGet(
      `rest/api/3/search/jql?jql=project=${encodeURIComponent(key)}+AND+issuetype=Sub-task&maxResults=50&fields=key,summary`,
      JiraSearchSchema,
    );
    if (callId !== lastCallId.current) return false;
    setLoadingSubtasks(false);
    setSubtasks(subtaskResult.kind === 'ok' ? subtaskResult.value.issues : []);
    setValidating(false);
    return true;
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const stored = await catchAllProjectKeyItem.getValue();
        if (ac.signal.aborted) return;
        setProjectKey(stored);
        const ptoKey = await ptoSubtaskKeyItem.getValue();
        if (ac.signal.aborted) return;
        setSelectedKey(ptoKey);
        if (stored) await validateAndFetch(stored);
        if (!ac.signal.aborted) setLoaded(true);
      } catch {
        if (!ac.signal.aborted) setLoaded(true);
      }
    })();
    return () => ac.abort();
  }, [validateAndFetch]);

  const handleKeyBlur = useCallback(async () => {
    const normalized = projectKey.trim().toUpperCase();
    if (normalized === '') return;
    setProjectKey(normalized);
    await catchAllProjectKeyItem.setValue(normalized);
    const ok = await validateAndFetch(normalized);
    if (ok) onSaved?.();
  }, [projectKey, validateAndFetch, onSaved]);

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
            aria-describedby={keyError ? 'catchall-key-error' : undefined}
            />
            {!keyError && projectKey === 'KNP' && <span className="text-xs text-neutral-500">{STRINGS.projectKeyHelper}</span>}
            {validating && <span className="text-xs text-neutral-500">{STRINGS.validating}</span>}
          </div>
          {keyError && <p id="catchall-key-error" className="mt-1 text-xs text-state-danger">{STRINGS.projectKeyNotFound}</p>}
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