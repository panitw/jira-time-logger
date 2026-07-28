/* eslint-disable import-x/order */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Retargeted for Story 7.10 / AC6 (four-state catch-all validation: idle,
 * validating/mid-typing — neutral, settled-invalid — amber, settled-valid —
 * project name + subtask count). Mocks the `jiraGet` module boundary
 * directly rather than raw `fetch` — simpler than the old scheduler/refresh/
 * fetch stack and this component only ever calls through that one seam.
 */

const jiraGetMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  jiraGet: (...args: unknown[]) => jiraGetMock(...args),
}));

vi.mock('@/lib/storage/settings', () => ({
  catchAllProjectKeyItem: { getValue: vi.fn(async () => 'KNP'), setValue: vi.fn(async () => {}) },
  ptoSubtaskKeyItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  ptoSubtaskSummaryItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
}));

import { CatchAllProjectField } from './CatchAllProjectField';

/** Real 400ms debounce + a settle margin — genuinely waits it out rather
 * than faking timers (which would fight the mixed setTimeout/Promise
 * resolution order here). Wrapped in `act` so the resulting state updates
 * aren't flagged as outside React's control. */
async function flushDebounce(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450));
  });
}

function mockProject(key: string, name: string): void {
  jiraGetMock.mockImplementation(async (path: string) => {
    if (path === `rest/api/3/project/${key}`) {
      return { kind: 'ok', value: { key, name } };
    }
    if (path.startsWith('rest/api/3/project/')) {
      return { kind: 'not-found' };
    }
    if (path.includes('search/jql')) {
      return {
        kind: 'ok',
        value: {
          issues: [
            { id: '1', key: `${key}-1`, fields: { summary: 'First' } },
            { id: '2', key: `${key}-2`, fields: { summary: 'Second' } },
          ],
        },
      };
    }
    return { kind: 'ok', value: { issues: [] } };
  });
}

describe('CatchAllProjectField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProject('KNP', 'KKP Non-Project');
  });

  it('renders the label and its one-line consequence', async () => {
    render(<CatchAllProjectField />);
    await waitFor(() => expect(screen.getByText('Catch-all project key')).toBeTruthy());
    expect(
      screen.getByText('Where meetings, standup and time off get logged.'),
    ).toBeTruthy();
    expect(screen.getByText('Time-off ticket')).toBeTruthy();
    expect(screen.getByText('Marking a day as time off logs a full day here.')).toBeTruthy();
  });

  it('shows the stored key in the input', async () => {
    render(<CatchAllProjectField />);
    await waitFor(() => expect(screen.getByDisplayValue('KNP')).toBeTruthy());
  });

  it('a settled valid key confirms with the project name and subtask count, no red anywhere', async () => {
    const { container } = render(<CatchAllProjectField />);
    await waitFor(() => expect(screen.getByText('KKP Non-Project — 2 items')).toBeTruthy());
    expect(container.innerHTML).not.toMatch(/state-danger|status-error/);
  });

  it('mid-typing is neutral — never red or amber, even before the debounce settles', async () => {
    render(<CatchAllProjectField />);
    await waitFor(() => expect(screen.getByDisplayValue('KNP')).toBeTruthy());
    const callsBeforeKeystroke = jiraGetMock.mock.calls.length;
    mockProject('ZZZZ', 'irrelevant');
    fireEvent.change(screen.getByDisplayValue('KNP'), { target: { value: 'ZZZZ' } });
    const input = screen.getByDisplayValue('ZZZZ');
    // Synchronous — the flip to `validating` happens on the keystroke
    // itself, before the 400ms debounce elapses. Mutation-proven (M-3):
    // deleting the synchronous `setStatus('validating')`, deleting the
    // debounce, deleting the "Checking…" hint, or rendering the amber
    // `attention` icon mid-typing all fail one of these assertions.
    expect(screen.getByText('Checking…')).toBeTruthy();
    expect(screen.getByText('Waiting for a valid project key')).toBeTruthy();
    expect(input.className).not.toMatch(/border-state-danger|border-amber-border/);
    expect(input.className).toMatch(/border-\[1\.5px\]\s+border-primary/);
    // No network round trip has happened yet — proves this is genuinely
    // debounced, not merely a neutral resting colour left over from `valid`.
    expect(jiraGetMock.mock.calls.length).toBe(callsBeforeKeystroke);
  });

  it('clearing the key resets the field to idle instead of showing a stale confirmation', async () => {
    render(<CatchAllProjectField />);
    await waitFor(() => expect(screen.getByText('KKP Non-Project — 2 items')).toBeTruthy());
    fireEvent.change(screen.getByDisplayValue('KNP'), { target: { value: '' } });
    await waitFor(() =>
      expect(screen.queryByText('KKP Non-Project — 2 items')).toBeNull(),
    );
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
    expect(screen.getByText('Waiting for a valid project key')).toBeTruthy();
  });

  it('correcting a typo back to the last-good key recovers — does not stay bricked amber (Finding 1)', async () => {
    render(<CatchAllProjectField />);
    await waitFor(() => expect(screen.getByText('KKP Non-Project — 2 items')).toBeTruthy());

    jiraGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('rest/api/3/project/')) return { kind: 'not-found' };
      return { kind: 'ok', value: { issues: [] } };
    });
    fireEvent.change(screen.getByDisplayValue('KNP'), { target: { value: 'ZZZZ' } });
    await flushDebounce();
    await waitFor(() => expect(screen.getByText('No project with this key')).toBeTruthy());

    mockProject('KNP', 'KKP Non-Project');
    fireEvent.change(screen.getByDisplayValue('ZZZZ'), { target: { value: 'KNP' } });
    await flushDebounce();

    await waitFor(() => expect(screen.getByText('KKP Non-Project — 2 items')).toBeTruthy());
    const input = screen.getByDisplayValue('KNP');
    expect(input.className).not.toMatch(/border-amber-border|border-state-danger/);
    expect(screen.getByRole('combobox')).not.toBeDisabled();
  });

  it('a failed item probe is not presented as "0 items" (Finding 16)', async () => {
    jiraGetMock.mockImplementation(async (path: string) => {
      if (path === 'rest/api/3/project/KNP') {
        return { kind: 'ok', value: { key: 'KNP', name: 'KKP Non-Project' } };
      }
      if (path.includes('search/jql')) return { kind: 'network', cause: 'boom' };
      return { kind: 'not-found' };
    });
    render(<CatchAllProjectField />);
    await waitFor(() =>
      expect(screen.getByText("KKP Non-Project — couldn't load items")).toBeTruthy(),
    );
    // No false COUNT anywhere — the confirmation says the probe failed, not
    // "0 subtasks" (a real, and false, fact about the project).
    expect(screen.queryByText(/\d+ items?$/)).toBeNull();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('a stale response does not overwrite a newer validation (lastCallId guard, M-2)', async () => {
    render(<CatchAllProjectField />);
    await waitFor(() => expect(screen.getByDisplayValue('KNP')).toBeTruthy());

    let resolveSlow: (v: unknown) => void = () => {};
    const slowProject = new Promise((resolve) => {
      resolveSlow = resolve;
    });
    jiraGetMock.mockImplementation((path: string) => {
      if (path === 'rest/api/3/project/SLOW') return slowProject;
      if (path === 'rest/api/3/project/FAST') {
        return Promise.resolve({ kind: 'ok', value: { key: 'FAST', name: 'Fast Project' } });
      }
      if (path.includes('search/jql')) {
        return Promise.resolve({ kind: 'ok', value: { issues: [] } });
      }
      return Promise.resolve({ kind: 'not-found' });
    });

    fireEvent.change(screen.getByDisplayValue('KNP'), { target: { value: 'SLOW' } });
    await flushDebounce();
    fireEvent.change(screen.getByDisplayValue('SLOW'), { target: { value: 'FAST' } });
    await flushDebounce();

    await waitFor(() => expect(screen.getByText('Fast Project — 0 items')).toBeTruthy());

    // Let the stale SLOW request resolve now — it must not clobber the
    // already-settled FAST result.
    resolveSlow({ kind: 'ok', value: { key: 'SLOW', name: 'Slow Project' } });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Fast Project — 0 items')).toBeTruthy();
    expect(screen.queryByText(/Slow Project/)).toBeNull();
  });

  it('a settled invalid key renders amber (attention), not red, and states the consequence to the dependent select', async () => {
    render(<CatchAllProjectField />);
    await waitFor(() => expect(screen.getByDisplayValue('KNP')).toBeTruthy());
    jiraGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('rest/api/3/project/')) return { kind: 'not-found' };
      return { kind: 'ok', value: { issues: [] } };
    });
    fireEvent.change(screen.getByDisplayValue('KNP'), { target: { value: 'ZZZZ' } });
    await flushDebounce();
    await waitFor(() => expect(screen.getByText('No project with this key')).toBeTruthy());
    const input = screen.getByDisplayValue('ZZZZ');
    expect(input.className).toMatch(/border-amber-border/);
    expect(input.className).not.toMatch(/border-state-danger/);
    expect(screen.getByText("Can't load — fix the key above")).toBeTruthy();
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
  });

  it('the dependent select waits while validation is in flight', async () => {
    render(<CatchAllProjectField />);
    await waitFor(() => expect(screen.getByDisplayValue('KNP')).toBeTruthy());
    // Never resolves within this test — proves the "waiting" copy shows
    // while genuinely in flight, not just momentarily.
    jiraGetMock.mockImplementation(() => new Promise(() => {}));
    fireEvent.change(screen.getByDisplayValue('KNP'), { target: { value: 'PEND' } });
    await flushDebounce();
    await waitFor(() => expect(screen.getByText('Waiting for a valid project key')).toBeTruthy());
  });
});
