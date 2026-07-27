import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const deleteWorklogMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  deleteWorklog: (...args: unknown[]) => deleteWorklogMock(...args),
}));

const enqueueOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: (...args: unknown[]) => enqueueOutboxMock(...args),
}));

// UNDO_WINDOW_MS is IMPORTED from LoggedToday.tsx by the real component
// (composed, per D-7.9-13 — not a second copy). Mocked here as a static
// value rather than via `vi.importActual` — the real `LoggedToday.tsx`
// transitively imports `@wxt-dev/storage` (via `lib/storage/outbox.ts`),
// which schedules a real `chrome.storage` read that throws in jsdom without
// the full extension polyfill (the exact pre-existing class of unhandled
// rejection `components/manager/ManagerView.test.tsx` already carries at
// baseline — `importActual` would add a SECOND one here). The literal value
// must stay in sync with `LoggedToday.tsx`'s own export; a source-level
// guard isn't warranted for one constant already covered by
// `LoggedToday.test.tsx`'s own tests.
vi.mock('@/components/today/LoggedToday', () => ({ UNDO_WINDOW_MS: 5000 }));

const { TimeOffCard } = await import('./TimeOffCard');
const { UNDO_WINDOW_MS } = await import('@/components/today/LoggedToday');

describe('TimeOffCard (AC4, D-7.9-13, D-7.9-7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    deleteWorklogMock.mockReset();
    enqueueOutboxMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const oneWorklog = [{ key: 'KNP-99', worklogId: 'wl-1', seconds: 28800 }];
  const twoWorklogs = [
    { key: 'KNP-99', worklogId: 'wl-1', seconds: 14400 },
    { key: 'KNP-99', worklogId: 'wl-2', seconds: 14400 },
  ];

  it('AC4: shows the filled Diamond heading, the explanation with the VERBATIM subtask summary (SD-7/D-7.9-7), and the Undo action', () => {
    render(
      <TimeOffCard
        totalSeconds={28800}
        subtaskKey="KNP-99"
        subtaskSummary="PTO"
        worklogs={oneWorklog}
        onExcludedIdsChange={vi.fn()}
        onUndoCommitted={vi.fn()}
      />,
    );
    expect(screen.getByText('Marked as time off')).toBeTruthy();
    // SD-7 / D-7.9-7: the REAL Jira subtask summary stays verbatim — "PTO",
    // never silently rewritten to "Time off".
    expect(screen.getByText(/KNP-99 · PTO/)).toBeTruthy();
    expect(screen.getByText(/8h logged to/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo time off' })).toBeTruthy();
  });

  it('a custom subtask summary also stays verbatim — never rewritten to "Time off"', () => {
    render(
      <TimeOffCard
        totalSeconds={28800}
        subtaskKey="KNP-99"
        subtaskSummary="Annual Leave"
        worklogs={oneWorklog}
        onExcludedIdsChange={vi.fn()}
        onUndoCommitted={vi.fn()}
      />,
    );
    expect(screen.getByText(/KNP-99 · Annual Leave/)).toBeTruthy();
    expect(screen.queryByText(/KNP-99 · Time off/)).toBeNull();
  });

  it('does not import Diamond directly — renders it only via DayStatusIndicator status="time-off"', () => {
    const { container } = render(
      <TimeOffCard
        totalSeconds={28800}
        subtaskKey="KNP-99"
        subtaskSummary="PTO"
        worklogs={oneWorklog}
        onExcludedIdsChange={vi.fn()}
        onUndoCommitted={vi.fn()}
      />,
    );
    // The filled diamond renders as an svg with fill="currentColor" (the
    // vocabulary's own FILLED_STATUSES treatment) — proves the real
    // indicator rendered, not a stand-in.
    const svg = container.querySelector('svg[fill="currentColor"]');
    expect(svg).toBeTruthy();
  });

  it('the affordance says how many when more than one worklog is being removed ("Undo time off · 2 entries")', () => {
    render(
      <TimeOffCard
        totalSeconds={28800}
        subtaskKey="KNP-99"
        subtaskSummary="PTO"
        worklogs={twoWorklogs}
        onExcludedIdsChange={vi.fn()}
        onUndoCommitted={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Undo time off · 2 entries' })).toBeTruthy();
  });

  it('one time-off worklog: clicking Undo starts the window, excludes it immediately, and issues NO Jira traffic yet', () => {
    const onExcludedIdsChange = vi.fn();
    render(
      <TimeOffCard
        totalSeconds={28800}
        subtaskKey="KNP-99"
        subtaskSummary="PTO"
        worklogs={oneWorklog}
        onExcludedIdsChange={onExcludedIdsChange}
        onUndoCommitted={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo time off' }));
    expect(onExcludedIdsChange).toHaveBeenCalledWith(new Set(['wl-1']));
    expect(deleteWorklogMock).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  // The load-bearing "no Jira traffic" proof: cancel INSIDE the window.
  it('cancelling inside the undo window issues ZERO Jira traffic and restores the card', async () => {
    const onExcludedIdsChange = vi.fn();
    const onUndoCommitted = vi.fn();
    render(
      <TimeOffCard
        totalSeconds={28800}
        subtaskKey="KNP-99"
        subtaskSummary="PTO"
        worklogs={oneWorklog}
        onExcludedIdsChange={onExcludedIdsChange}
        onUndoCommitted={onUndoCommitted}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo time off' }));
    fireEvent.click(screen.getByRole('button', { name: /Undo time off/ }));

    // Advance PAST the window — if cancellation failed to clear the timer,
    // the commit would fire here.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100);
    });

    expect(deleteWorklogMock).not.toHaveBeenCalled();
    expect(enqueueOutboxMock).not.toHaveBeenCalled();
    expect(onUndoCommitted).not.toHaveBeenCalled();
    // The exclusion is cleared back to empty — nothing was ever removed.
    expect(onExcludedIdsChange).toHaveBeenLastCalledWith(new Set());
    expect(screen.getByText('Marked as time off')).toBeTruthy();
  });

  it('letting the window expire (two worklogs, both delete ok) commits both deletes and calls onUndoCommitted', async () => {
    deleteWorklogMock.mockResolvedValue({ kind: 'ok' });
    const onExcludedIdsChange = vi.fn();
    const onUndoCommitted = vi.fn();
    render(
      <TimeOffCard
        totalSeconds={28800}
        subtaskKey="KNP-99"
        subtaskSummary="PTO"
        worklogs={twoWorklogs}
        onExcludedIdsChange={onExcludedIdsChange}
        onUndoCommitted={onUndoCommitted}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Undo time off/ }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100);
    });

    expect(deleteWorklogMock).toHaveBeenCalledWith('KNP-99', 'wl-1');
    expect(deleteWorklogMock).toHaveBeenCalledWith('KNP-99', 'wl-2');
    expect(deleteWorklogMock).toHaveBeenCalledTimes(2);
    expect(onUndoCommitted).toHaveBeenCalledTimes(1);
    expect(onExcludedIdsChange).toHaveBeenLastCalledWith(new Set(['wl-1', 'wl-2']));
  });

  it('a transient (network) delete failure enqueues to the outbox durably and still commits the transition', async () => {
    deleteWorklogMock.mockResolvedValue({ kind: 'network' });
    const onUndoCommitted = vi.fn();
    render(
      <TimeOffCard
        totalSeconds={28800}
        subtaskKey="KNP-99"
        subtaskSummary="PTO"
        worklogs={oneWorklog}
        onExcludedIdsChange={vi.fn()}
        onUndoCommitted={onUndoCommitted}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo time off' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100);
    });

    expect(enqueueOutboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'delete', issueKey: 'KNP-99', worklogId: 'wl-1' }),
    );
    expect(onUndoCommitted).toHaveBeenCalledTimes(1);
  });

  it('a persistent (forbidden) delete failure surfaces an inline error and does NOT commit the transition', async () => {
    deleteWorklogMock.mockResolvedValue({ kind: 'forbidden' });
    const onUndoCommitted = vi.fn();
    render(
      <TimeOffCard
        totalSeconds={28800}
        subtaskKey="KNP-99"
        subtaskSummary="PTO"
        worklogs={oneWorklog}
        onExcludedIdsChange={vi.fn()}
        onUndoCommitted={onUndoCommitted}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo time off' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100);
    });

    expect(onUndoCommitted).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
    // Reverted back to the settled card (still time-off) — the undo button
    // is available to retry.
    expect(screen.getByRole('button', { name: 'Undo time off' })).toBeTruthy();
  });

  it('zero time-off worklogs: Undo commits immediately with NO Jira traffic and no undo window', () => {
    const onUndoCommitted = vi.fn();
    render(
      <TimeOffCard
        totalSeconds={0}
        subtaskKey="KNP-99"
        subtaskSummary="PTO"
        worklogs={[]}
        onExcludedIdsChange={vi.fn()}
        onUndoCommitted={onUndoCommitted}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo time off' }));
    expect(onUndoCommitted).toHaveBeenCalledTimes(1);
    expect(deleteWorklogMock).not.toHaveBeenCalled();
  });
});
