import { useCallback, useEffect, useRef, useState } from 'react';
import { FieldLabel } from '@/components/settings/SettingsPrimitives';
import { DayStatusIndicator } from '@/components/shared/DayStatusIndicator';
import { jiraGet } from '@/lib/jira-client';
import { JiraProjectSchema, JiraSearchSchema, type JiraIssue } from '@/lib/jira-types';
import {
  catchAllProjectKeyItem,
  ptoSubtaskKeyItem,
  ptoSubtaskSummaryItem,
} from '@/lib/storage/settings';

/**
 * Catch-all project key + Time-off subtask (Story 7.10, AC3/AC6/AC9,
 * Logging-defaults items 1 & 2). `round2:273-293`.
 *
 * AC6's four-state model reuses the FROZEN `DayStatusIndicator` registry
 * (D-7.10-42) — `met`/`attention`/`loading` — rather than a local
 * status→colour map (`lib/day-status-vocabulary.grep.test.ts` would fail
 * the build on a local re-implementation). Not one red pixel in any state:
 * the "invalid — settled" state is `attention` (amber), never
 * `state-danger`.
 */

const STRINGS = {
  keyLabel: 'Catch-all project key',
  keyConsequence: 'Where meetings, standup and time off get logged.',
  checking: 'Checking…',
  // "item", not "subtask": since D-CA-1 the catch-all accepts Sub-task AND
  // Task, so naming the issue type here would assert something that is false
  // for a Task-based project — the exact copy-lies-about-the-data problem
  // D-7.6-38 and D-7.7-20 both had to correct elsewhere. The internal
  // identifiers (`ptoSubtaskKeyItem`, storage keys) deliberately keep their
  // names, per SD-7's copy-only rule.
  validHint: (projectName: string, count: number): string =>
    `${projectName} — ${count} ${count === 1 ? 'item' : 'items'}`,
  // Finding 16: a failed probe must not be presented as "0 items" — that
  // reads as a fact about the project when it is really a fact about a
  // failed request.
  subtasksUnavailableHint: (projectName: string): string =>
    `${projectName} — couldn't load items`,
  invalidHint: 'No project with this key',
  ptoLabel: 'Time-off ticket',
  ptoConsequence: 'Marking a day as time off logs a full day here.',
  ptoWaiting: 'Waiting for a valid project key',
  ptoBlocked: "Can't load — fix the key above",
  ptoUnavailable: "Can't load — items failed to load",
  ptoPlaceholder: 'Choose a ticket',
};

type Status = 'idle' | 'validating' | 'valid' | 'invalid';

type Props = {
  onSaved?: (() => void) | undefined;
};

// Findings 4/5: every focusable control pairs `ring-focus` with a 1.5px
// primary border, and the ring/border must be scoped to `focus-visible` —
// never static — per EXPERIENCE.md:257-258 / D-7.3-15. The three sibling
// fields (Target hours / Reminder / Cycle) already get this right; these
// two now match them.
const KEY_INPUT_BASE =
  'h-[34px] w-[180px] rounded-md bg-surface px-[11px] font-chrome text-body tabular text-foreground focus:outline-none focus-visible:border-[1.5px] focus-visible:border-primary focus-visible:ring-focus';

const KEY_STATUS_BORDER: Record<Status, string> = {
  idle: 'border border-border',
  // The 1.5px primary border is the AC6 "mid-typing" affordance itself and
  // stays visible for the whole `validating` state (not just while
  // focused). The ring/box-shadow, however, must only paint on focus —
  // `focus-visible:ring-focus` on KEY_INPUT_BASE already supplies that;
  // this entry must NOT repeat an unprefixed `ring-focus`, or the ring
  // paints whether or not the field is focused (Finding 5).
  validating: 'border-[1.5px] border-primary',
  valid: 'border border-border',
  invalid: 'border-[1.5px] border-amber-border',
};

const SELECT_BASE =
  'h-[34px] w-full rounded-md border border-border bg-surface px-[11px] text-body text-foreground focus:outline-none focus-visible:border-[1.5px] focus-visible:border-primary focus-visible:ring-focus disabled:bg-surface-sunk disabled:text-faint';

export function CatchAllProjectField({ onSaved }: Props): React.ReactElement {
  const [loaded, setLoaded] = useState(false);
  const [projectKey, setProjectKey] = useState('KNP');
  const [committedKey, setCommittedKey] = useState('KNP');
  const [status, setStatus] = useState<Status>('idle');
  const [projectName, setProjectName] = useState<string | null>(null);
  const [subtasks, setSubtasks] = useState<JiraIssue[]>([]);
  // Finding 16: a failed subtask probe is its own state — it must not be
  // rendered as "0 subtasks", which reads as a fact about the project.
  const [subtasksError, setSubtasksError] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const lastCallId = useRef(0);
  // A ref mirror of `status`, read (not depended on) by the mid-typing
  // effect below. Putting `status` itself in that effect's dependency
  // array would re-run it every time `runValidation` changes status —
  // including invalid → validating → invalid — because the effect body
  // itself calls `setStatus('validating')`, which is exactly the kind of
  // effect-triggers-itself loop that produced Finding 1's sibling bugs.
  const statusRef = useRef<Status>(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const runValidation = useCallback(
    async (key: string) => {
      const callId = ++lastCallId.current;
      setStatus('validating');

      const projectResult = await jiraGet(
        `rest/api/3/project/${encodeURIComponent(key)}`,
        JiraProjectSchema,
      );
      if (callId !== lastCallId.current) return;
      if (projectResult.kind !== 'ok') {
        setStatus('invalid');
        setProjectName(null);
        setSubtasks([]);
        setSubtasksError(false);
        return;
      }

      const subtaskResult = await jiraGet(
        `rest/api/3/search/jql?jql=project=${encodeURIComponent(key)}+AND+issuetype=Sub-task&maxResults=50&fields=key,summary`,
        JiraSearchSchema,
      );
      if (callId !== lastCallId.current) return;

      setProjectName(projectResult.value.name);
      if (subtaskResult.kind === 'ok') {
        setSubtasks(subtaskResult.value.issues);
        setSubtasksError(false);
      } else {
        // A failed second fetch is NOT "the project has zero subtasks" —
        // keep the project confirmation, drop the count claim, and leave
        // the dependent select waiting rather than presenting a false 0.
        setSubtasks([]);
        setSubtasksError(true);
      }
      setStatus('valid');
      setCommittedKey(key);
      await catchAllProjectKeyItem.setValue(key);
      // M-1: guard again after the storage-write await — a newer call
      // could have started (and even resolved) while this one was
      // writing, and without this check `onSaved` would fire for a key
      // that is no longer current.
      if (callId !== lastCallId.current) return;
      onSaved?.();
    },
    [onSaved],
  );

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const [stored, ptoKey] = await Promise.all([
          catchAllProjectKeyItem.getValue(),
          ptoSubtaskKeyItem.getValue(),
        ]);
        if (ac.signal.aborted) return;
        setProjectKey(stored);
        setCommittedKey(stored);
        setSelectedKey(ptoKey);
        setLoaded(true);
        if (stored) await runValidation(stored);
      } catch {
        if (!ac.signal.aborted) setLoaded(true);
      }
    })();
    return () => ac.abort();
    // Only ever runs once on mount — `runValidation` intentionally omitted:
    // re-running this effect on every render (its identity changes with
    // `onSaved`) would re-fetch on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AC6: while the user is mid-typing, the field state is NEUTRAL — never
  // red — and the dependent select simply waits. Debounced so a settled
  // pause (not every keystroke) triggers the real Jira round-trip; the
  // status flips to 'validating' synchronously so the neutral/checking
  // chrome appears immediately, before the debounce timer fires.
  useEffect(() => {
    if (!loaded) return;
    const trimmed = projectKey.trim().toUpperCase();
    // Finding 1 (Blocker): `committedKey` only ever advances on a
    // SUCCESSFUL validation, so short-circuiting on `trimmed ===
    // committedKey` alone left a typo-then-correct-back sequence stuck in
    // `invalid` forever — the key matched the last good key, but the
    // status did not. Only skip re-validation when the field is already
    // settled successfully; anything else (idle/validating/invalid) must
    // re-run so a corrected key can recover.
    if (trimmed === committedKey && statusRef.current === 'valid') return;
    if (trimmed === '') {
      // Finding 15: clearing the key must not leave a stale "valid"
      // confirmation (or its subtask options) on screen for a key that is
      // no longer entered.
      setStatus('idle');
      setProjectName(null);
      setSubtasks([]);
      setSubtasksError(false);
      return;
    }
    setStatus('validating');
    const timer = setTimeout(() => {
      void runValidation(trimmed);
    }, 400);
    return () => clearTimeout(timer);
    // `status` is intentionally NOT a dependency — see `statusRef` above.
  }, [projectKey, committedKey, loaded, runValidation]);

  const handleKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setProjectKey(e.target.value);
  }, []);

  const handleSubtasksChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const idx = parseInt(e.target.value, 10);
      const issue = subtasks[idx];
      if (!issue) return;
      await ptoSubtaskKeyItem.setValue(issue.key);
      await ptoSubtaskSummaryItem.setValue(issue.fields.summary);
      setSelectedKey(issue.key);
    },
    [subtasks],
  );

  if (!loaded) {
    return (
      <div className="flex flex-col gap-4" aria-hidden="true">
        <div className="h-[34px] w-[180px] animate-skeleton rounded-md bg-border-faint" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel
          label={STRINGS.keyLabel}
          consequence={STRINGS.keyConsequence}
          htmlFor="catchall-key-input"
        />
        <div className="mt-0.5 flex items-center gap-2.5">
          <input
            id="catchall-key-input"
            type="text"
            value={projectKey}
            onChange={handleKeyChange}
            placeholder="KNP"
            className={`${KEY_INPUT_BASE} ${KEY_STATUS_BORDER[status]}`}
            aria-describedby="catchall-key-hint"
          />
          <span id="catchall-key-hint">
            {status === 'validating' && (
              <DayStatusIndicator status="loading" label={STRINGS.checking} size={11} />
            )}
            {status === 'valid' && projectName && !subtasksError && (
              <DayStatusIndicator
                status="met"
                label={STRINGS.validHint(projectName, subtasks.length)}
                size={11}
              />
            )}
            {status === 'valid' && projectName && subtasksError && (
              <DayStatusIndicator
                status="attention"
                label={STRINGS.subtasksUnavailableHint(projectName)}
                size={11}
              />
            )}
            {status === 'invalid' && (
              <DayStatusIndicator status="attention" label={STRINGS.invalidHint} size={11} />
            )}
          </span>
        </div>
      </div>

      <div aria-hidden="true" className="h-px bg-border-hairline" />

      <div className="flex flex-col gap-1.5">
        <FieldLabel
          label={STRINGS.ptoLabel}
          consequence={STRINGS.ptoConsequence}
          htmlFor="catchall-pto-select"
        />
        {status === 'idle' || status === 'validating' ? (
          <select
            id="catchall-pto-select"
            disabled
            className={`${SELECT_BASE} bg-surface-sunk`}
          >
            <option>{STRINGS.ptoWaiting}</option>
          </select>
        ) : status === 'invalid' ? (
          <select
            id="catchall-pto-select"
            disabled
            className={`${SELECT_BASE} bg-surface-sunk`}
          >
            <option>{STRINGS.ptoBlocked}</option>
          </select>
        ) : subtasksError ? (
          // Finding 16: a failed subtask probe leaves the select waiting,
          // not enabled with an empty (falsely "0 subtasks") list.
          <select
            id="catchall-pto-select"
            disabled
            className={`${SELECT_BASE} bg-surface-sunk`}
          >
            <option>{STRINGS.ptoUnavailable}</option>
          </select>
        ) : (
          <select
            id="catchall-pto-select"
            value={subtasks.findIndex((s) => s.key === selectedKey)}
            onChange={(e) => void handleSubtasksChange(e)}
            className={SELECT_BASE}
          >
            <option value={-1}>{STRINGS.ptoPlaceholder}</option>
            {subtasks.map((issue, idx) => (
              <option key={issue.key} value={idx}>
                {issue.key} — {issue.fields.summary}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
