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

// UNDO_WINDOW_MS AND enqueueFailedWorklogMutation are IMPORTED from
// LoggedToday.tsx by the real component (composed, per D-7.9-13 — not a
// second copy; `TimeOffCard.composition.grep.test.ts` proves this
// STATICALLY, independent of this mock). Mocked here rather than via
// `vi.importActual` — the real `LoggedToday.tsx` transitively imports
// `@wxt-dev/storage` (via `lib/storage/outbox.ts`), which schedules a real
// `chrome.storage` read that throws in jsdom without the full extension
// polyfill (the exact pre-existing class of unhandled rejection
// `components/manager/ManagerView.test.tsx` already carries at baseline —
// `importActual` would add a SECOND one here). `enqueueFailedWorklogMutation`
// is mocked to forward into the SAME `enqueueOutboxMock` the real
// implementation would reach (mirroring its endpoint-construction shape) so
// the existing outbox-durability assertions below still observe genuine
// call shapes, not a black hole.
const enqueueFailedWorklogMutationMock = vi.fn(
  (info: { issueKey: string; worklogId: string }) => {
    void enqueueOutboxMock({
      kind: 'delete',
      endpoint: `rest/api/3/issue/${encodeURIComponent(info.issueKey)}/worklog/${encodeURIComponent(info.worklogId)}`,
      issueKey: info.issueKey,
      worklogId: info.worklogId,
    });
  },
);
vi.mock('@/components/today/LoggedToday', () => ({
  UNDO_WINDOW_MS: 5000,
  enqueueFailedWorklogMutation: (...args: [{ issueKey: string; worklogId: string }]) =>
    enqueueFailedWorklogMutationMock(...args),
}));

const { TimeOffCard } = await import('./TimeOffCard');
const { UNDO_WINDOW_MS } = await import('@/components/today/LoggedToday');

describe('TimeOffCard (AC4, D-7.9-13, D-7.9-25)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    deleteWorklogMock.mockReset();
    enqueueOutboxMock.mockClear();
    enqueueFailedWorklogMutationMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const oneWorklog = [{ key: 'KNP-99', worklogId: 'wl-1', seconds: 28800 }];
  const twoWorklogs = [
    { key: 'KNP-99', worklogId: 'wl-1', seconds: 14400 },
    { key: 'KNP-99', worklogId: 'wl-2', seconds: 14400 },
  ];

  it('AC4: shows the filled Diamond heading, the explanation with the VERBATIM subtask summary (SD-7/D-7.9-25), and the Undo action', () => {
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
    // SD-7 / D-7.9-25: the REAL Jira subtask summary stays verbatim — "PTO",
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

  // Review Finding 14(c): the previous title ("does not import Diamond
  // directly") overstated what this render assertion proves — a hand-rolled
  // `<Diamond fill="currentColor" />` would satisfy the same selector. The
  // REAL "never import Diamond outside DayStatusIndicator.tsx" invariant is
  // enforced by `lib/day-status-vocabulary.grep.test.ts`'s AC3 source-level
  // guard, not by this component test. Retitled to describe only what it
  // actually asserts: the real indicator rendered, filled.
  it('renders the filled time-off Diamond via DayStatusIndicator (the "never import Diamond directly" rule itself is enforced by the AC3 grep guard, not this test)', () => {
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
    const svg = container.querySelector('svg[fill="currentColor"]');
    expect(svg).toBeTruthy();
    // hideText (Finding 17) must not suppress the icon-only Diamond, and the
    // heading text must come from THIS component's own sibling <h2>, not a
    // second copy of the vocabulary's default "Time off" label.
    expect(screen.queryByText('Time off')).toBeNull();
    expect(screen.getByText('Marked as time off')).toBeTruthy();
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

  // Review Finding 14(b): the in-window notice's OWN count/wording was
  // previously untested — only the SETTLED affordance's label was pinned.
  it('the in-window notice states the count for a 2-worklog batch ("2 entries removed." / a LIVE "Undo time off · 2 entries" button)', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Undo time off · 2 entries' }));
    expect(screen.getByText('2 entries removed.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo time off · 2 entries' })).toBeTruthy();
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

  it('a persistent (forbidden) delete failure surfaces an inline error (canonical error-ink token, D-7.9-18b) and does NOT commit the transition', async () => {
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
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    // D-7.9-18(b): the canonical red pair, never the legacy token — matches
    // `WriteErrorBanner`'s own headline colour (7.60:1 on white/error-soft).
    expect(alert.className).toContain('text-error-ink');
    expect(alert.className).not.toContain('text-state-danger');
    // Reverted back to the settled card (still time-off) — the undo button
    // is available to retry.
    expect(screen.getByRole('button', { name: 'Undo time off' })).toBeTruthy();
  });

  // Review Finding 14: D-7.9-13's own multi-record scenario (a mixed
  // batch — one worklog persistently refused, one genuinely removed) was
  // verified correct by probe during review but had no test.
  it('a mixed batch (one forbidden, one ok) removes only the successful worklog and surfaces the persistent error for the whole batch', async () => {
    deleteWorklogMock
      .mockResolvedValueOnce({ kind: 'forbidden' })
      .mockResolvedValueOnce({ kind: 'ok' });
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

    expect(deleteWorklogMock).toHaveBeenCalledTimes(2);
    expect(onExcludedIdsChange).toHaveBeenLastCalledWith(new Set(['wl-2']));
    expect(onUndoCommitted).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
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

  // ---------------------------------------------------------------------
  // Review Blockers 1 & 2 — RED-proved against the reviewer's exact probes.
  // ---------------------------------------------------------------------

  describe('Blocker 1 (Review Finding 1): no duplicate DELETE while a commit is in flight', () => {
    it('once the window expires and the commit is dispatched, the in-window Undo button disappears — deleteWorklog stays called exactly once for the whole in-flight period, however long it takes', async () => {
      let resolveDelete: ((v: { kind: 'ok' }) => void) | undefined;
      deleteWorklogMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDelete = resolve;
          }),
      );
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

      await act(async () => {
        await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100);
      });

      // The DELETE is now in flight (the promise never resolves) — this is
      // the reviewer's PROBE-b/e setup exactly. Before the fix, the notice's
      // Undo button stayed live for the ENTIRE round-trip; a second click
      // cleared `pending`, the card re-admitted the worklog, and a THIRD
      // click issued a duplicate DELETE — `deleteWorklog` calls
      // `[['KNP-99','wl-1'],['KNP-99','wl-1']]`. With the fix, the button is
      // gone the instant `commit()` marks the id committing — there is
      // structurally nothing left to click.
      expect(deleteWorklogMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Time off removed.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Undo time off/ })).toBeNull();

      // The card must not have re-admitted the worklog while committing.
      expect(onExcludedIdsChange).not.toHaveBeenLastCalledWith(new Set());

      resolveDelete?.({ kind: 'ok' });
      await act(async () => {
        await Promise.resolve();
      });
      expect(deleteWorklogMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Blocker 2 (Review Finding 2): the popup closing inside the undo window durably enqueues the delete', () => {
    it('pagehide firing WHILE the window is still open enqueues to the outbox immediately — nothing is silently abandoned', () => {
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
      fireEvent.click(screen.getByRole('button', { name: 'Undo time off' }));

      // The real failure mode: the popup's JS context dies before the
      // `setTimeout` for the undo window ever fires — the reviewer's
      // PROBE-c ("deletes = 2, enqueues = 0" on the buggy version).
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });

      expect(deleteWorklogMock).not.toHaveBeenCalled();
      expect(enqueueOutboxMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'delete', issueKey: 'KNP-99', worklogId: 'wl-1' }),
      );
    });

    it('pagehide firing twice for the SAME pending batch enqueues only once (no duplicate outbox entries)', () => {
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
      fireEvent.click(screen.getByRole('button', { name: 'Undo time off' }));

      act(() => {
        window.dispatchEvent(new Event('pagehide'));
        window.dispatchEvent(new Event('pagehide'));
      });

      expect(enqueueOutboxMock).toHaveBeenCalledTimes(1);
    });

    it('two worklogs: pagehide enqueues BOTH, in one flush', () => {
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
      fireEvent.click(screen.getByRole('button', { name: /Undo time off/ }));

      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });

      expect(enqueueOutboxMock).toHaveBeenCalledTimes(2);
      expect(enqueueOutboxMock).toHaveBeenCalledWith(
        expect.objectContaining({ worklogId: 'wl-1' }),
      );
      expect(enqueueOutboxMock).toHaveBeenCalledWith(
        expect.objectContaining({ worklogId: 'wl-2' }),
      );
    });

    it('pagehide with NO pending undo (nothing clicked yet) is a no-op', () => {
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
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(enqueueOutboxMock).not.toHaveBeenCalled();
    });
  });
});
