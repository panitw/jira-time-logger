import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateWorklogMock = vi.fn();
const deleteWorklogMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  updateWorklog: (...args: unknown[]) => updateWorklogMock(...args),
  deleteWorklog: (...args: unknown[]) => deleteWorklogMock(...args),
}));

const sendMessageMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

vi.mock('@/lib/storage/settings', () => ({
  approvalCycleItem: { getValue: vi.fn(async () => 'calendar-month') },
}));

const enqueueOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve({}));
const removeOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const updateOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const runOutboxRetryPassMock = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ drained: 0 }),
);
let outboxEntries: unknown[] = [];
const outboxWatchers: ((v: unknown[]) => void)[] = [];
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: (...args: unknown[]) => enqueueOutboxMock(...args),
  remove: (...args: unknown[]) => removeOutboxMock(...args),
  update: (...args: unknown[]) => updateOutboxMock(...args),
  runOutboxRetryPass: (...args: unknown[]) => runOutboxRetryPassMock(...args),
  outboxItem: {
    getValue: vi.fn(async () => outboxEntries),
    setValue: vi.fn(async (v: unknown[]) => {
      outboxEntries = v;
    }),
    watch: vi.fn((cb: (v: unknown[]) => void) => {
      outboxWatchers.push(cb);
      return () => {
        const i = outboxWatchers.indexOf(cb);
        if (i >= 0) outboxWatchers.splice(i, 1);
      };
    }),
  },
}));

const logMock = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
vi.mock('@/lib/log', () => ({ log: logMock }));

const { LoggedToday, UNDO_WINDOW_MS } = await import('./LoggedToday');

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const baseEntry = {
  key: 'PROJ-1',
  summary: 'Fix bug',
  hoursDisplay: '2.5h',
  started: '2026-06-21',
  seconds: 9000,
  worklogId: '10001',
};

/** Advances past the undo window inside `act`, per the project's
 * established fake-timer + RTL pattern (`hooks/useTicketSearch.test.ts`) —
 * `waitFor`'s own internal polling is unreliable once fake timers are on,
 * so callers assert synchronously right after this resolves. */
async function commitPendingDeletion(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
  });
}

describe('LoggedToday', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outboxEntries = [];
    outboxWatchers.length = 0;
    updateWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: '10001', timeSpentSeconds: 7200 },
    });
    deleteWorklogMock.mockResolvedValue({ kind: 'ok', value: undefined });
  });

  // ---- AC5: empty state ---------------------------------------------------

  it('shows the exact empty-state copy when no entries — no illustration, no third line', () => {
    const { container } = renderWithProviders(<LoggedToday entries={[]} />);
    expect(screen.getByText('Nothing on the clock yet today.')).toBeTruthy();
    expect(screen.getByText('Add hours above, or search for a ticket.')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    // Dashed border, tokenised (D-7.3-14) — never the mockup's raw hex.
    const card = screen.getByText('Nothing on the clock yet today.').closest('div');
    expect(card?.className).toContain('border-dashed');
    expect(card?.className).toContain('border-border');
    expect(card?.className).not.toContain('#DEDCE9');
  });

  it('renders heading "Logged today"', () => {
    renderWithProviders(<LoggedToday entries={[]} />);
    expect(screen.getByText('Logged today')).toBeTruthy();
  });

  // ---- AC3/AC6: row anatomy ------------------------------------------------

  it('renders entries with key, summary, and hours; no font-mono anywhere', () => {
    const { container } = renderWithProviders(
      <LoggedToday
        entries={[
          { ...baseEntry },
          {
            key: 'PROJ-2',
            summary: 'Review',
            hoursDisplay: '0.5h',
            started: '2026-06-21',
            seconds: 1800,
            worklogId: '10002',
          },
        ]}
      />,
    );
    expect(screen.getByText('PROJ-1')).toBeTruthy();
    expect(screen.getByText('Fix bug')).toBeTruthy();
    expect(screen.getByText('2.5h')).toBeTruthy();
    expect(screen.getByText('PROJ-2')).toBeTruthy();
    expect(screen.getByText('0.5h')).toBeTruthy();
    expect(container.querySelector('.font-mono')).toBeNull();
  });

  it('renders a heading count pill reflecting the visible entry count', () => {
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('renders direct 24px Edit and Delete buttons — no MoreHorizontal menu', () => {
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
    const editBtn = screen.getByLabelText('Edit PROJ-1, 2.5h');
    const deleteBtn = screen.getByLabelText('Delete PROJ-1, 2.5h');
    expect(editBtn.tagName).toBe('BUTTON');
    expect(deleteBtn.tagName).toBe('BUTTON');
    expect(editBtn.className).toContain('h-6');
    expect(editBtn.className).toContain('w-6');
    expect(deleteBtn.className).toContain('h-6');
    expect(deleteBtn.className).toContain('w-6');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByLabelText(/Worklog actions/)).toBeNull();
  });

  it('an 80+ character summary truncates without shoving the key, in a min-w-0 fixed-height row (AC6)', () => {
    const longSummary =
      'This is a genuinely long GAPI-style summary line that exceeds eighty characters in total length easily';
    expect(longSummary.length).toBeGreaterThan(80);
    renderWithProviders(
      <LoggedToday entries={[{ ...baseEntry, summary: longSummary }]} />,
    );
    expect(screen.getByText('PROJ-1')).toBeTruthy();
    const summaryEl = screen.getByText(longSummary);
    expect(summaryEl.className).toContain('truncate');
    const row = summaryEl.closest('div[class*="h-["]');
    expect(row).toBeTruthy();
    const textColumn = summaryEl.closest('.min-w-0');
    expect(textColumn).toBeTruthy();
  });

  // ---- Edit flow (unchanged from Story 2.6 / 7.2 Finding 3) --------------

  it('Edit → Save calls updateWorklog with id/body and fires onEdited', async () => {
    const onEdited = vi.fn();
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onEdited={onEdited} />);
    fireEvent.click(screen.getByLabelText('Edit PROJ-1, 2.5h'));

    const input = screen.getByLabelText('Hours');
    fireEvent.change(input, { target: { value: '2h' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(updateWorklogMock).toHaveBeenCalledWith(
        'PROJ-1',
        '10001',
        expect.objectContaining({ timeSpentSeconds: 7200, started: expect.any(String) }),
      );
    });
    await waitFor(() => {
      expect(onEdited).toHaveBeenCalledWith(
        '10001',
        expect.objectContaining({ seconds: 7200, hoursDisplay: '2h' }),
      );
    });
    expect(sendMessageMock).toHaveBeenCalledWith('badge-update', { hoursMissing: 0 });
  });

  it('Edit preserves the entry’s original date when only hours change', async () => {
    const onEdited = vi.fn();
    const pastEntry = { ...baseEntry, started: '2020-01-15' };
    renderWithProviders(<LoggedToday entries={[pastEntry]} onEdited={onEdited} />);
    fireEvent.click(screen.getByLabelText('Edit PROJ-1, 2.5h'));

    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '3h' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const body = updateWorklogMock.mock.calls[0]![2] as { started: string };
      expect(body.started.startsWith('2020-01-1')).toBe(true);
    });
    await waitFor(() => {
      expect(onEdited).toHaveBeenCalledWith(
        '10001',
        expect.objectContaining({ started: '2020-01-15' }),
      );
    });
  });

  it('Edit with a comment wraps it in ADF before sending', async () => {
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onEdited={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Edit PROJ-1, 2.5h'));
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2h' } });
    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const body = updateWorklogMock.mock.calls[0]![2] as { comment?: unknown };
      expect(body.comment).toEqual({
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
      });
    });
  });

  it('Esc reverts edit mode', async () => {
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
    fireEvent.click(screen.getByLabelText('Edit PROJ-1, 2.5h'));
    expect(screen.getByLabelText('Hours')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Hours')).toBeNull());
  });

  it('forbidden on edit → persistent chip, no onEdited', async () => {
    updateWorklogMock.mockResolvedValueOnce({ kind: 'forbidden' });
    const onEdited = vi.fn();
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onEdited={onEdited} />);
    fireEvent.click(screen.getByLabelText('Edit PROJ-1, 2.5h'));
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2h' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Couldn’t update — you don’t have permission')).toBeTruthy();
    });
    expect(onEdited).not.toHaveBeenCalled();
  });

  it('network failure on edit → enqueues a put with the edited body', async () => {
    updateWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onEdited={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Edit PROJ-1, 2.5h'));
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2h' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Pending — will retry')).toBeTruthy();
    });
    expect(enqueueOutboxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'put',
        issueKey: 'PROJ-1',
        worklogId: '10001',
        body: expect.objectContaining({ timeSpentSeconds: 7200 }),
      }),
    );
  });

  it('guards double-submit on Save while pending', async () => {
    let resolve: (v: unknown) => void = () => {};
    updateWorklogMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onEdited={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Edit PROJ-1, 2.5h'));
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2h' } });
    fireEvent.click(screen.getByLabelText('Save'));

    await waitFor(() => expect(updateWorklogMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByLabelText('Save'));
    expect(updateWorklogMock).toHaveBeenCalledTimes(1);

    resolve({ kind: 'ok', value: { id: '10001', timeSpentSeconds: 7200 } });
  });

  // ---- AC4 / D-7.5-18: deferred delete + undo ------------------------------

  describe('deferred delete + undo (AC4, D-7.5-18, D-7.5-14)', () => {
    it('no confirmation dialog — clicking Delete hides the row immediately with an undo affordance', () => {
      const onDeleted = vi.fn();
      renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onDeleted={onDeleted} />);
      fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));

      // No "Delete this worklog?" confirm text anywhere.
      expect(screen.queryByText(/Delete this worklog/)).toBeNull();
      expect(screen.queryByText('PROJ-1')).toBeNull(); // row is gone
      expect(screen.getByText('Undo')).toBeTruthy();
      expect(screen.getByRole('status')).toBeTruthy();
      // Zero Jira traffic at click time.
      expect(deleteWorklogMock).not.toHaveBeenCalled();
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('UNDO_WINDOW_MS is exactly 5000', () => {
      expect(UNDO_WINDOW_MS).toBe(5000);
    });

    it('commits the delete via deleteWorklog and fires onDeleted only once UNDO_WINDOW_MS elapses', async () => {
      vi.useFakeTimers();
      try {
        const onDeleted = vi.fn();
        renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onDeleted={onDeleted} />);
        fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));

        await act(async () => {
          await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1);
        });
        expect(deleteWorklogMock).not.toHaveBeenCalled();
        expect(onDeleted).not.toHaveBeenCalled();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1);
        });
        expect(deleteWorklogMock).toHaveBeenCalledWith('PROJ-1', '10001');
        expect(onDeleted).toHaveBeenCalledWith('10001');
        expect(sendMessageMock).toHaveBeenCalledWith('badge-update', { hoursMissing: 0 });
      } finally {
        vi.useRealTimers();
      }
    });

    it('clicking Undo cancels the timer — zero Jira traffic, the row reappears', async () => {
      // Review Finding 5 (Nit): `clearTimeout` is pinned directly (not just
      // via the safety property below) — removing the `clearTimeout` call
      // from `cancelPendingDeletion` alone must go RED here, even though the
      // timer callback's own `pendingRef` guard would independently suppress
      // the delete either way (that redundant safety net is real, but it is
      // not what THIS assertion is claiming to prove).
      vi.useFakeTimers();
      // Spy AFTER `useFakeTimers()` — fake timers install their own
      // `clearTimeout`, and spying beforehand would wrap the (unused) real
      // implementation instead.
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      try {
        const onDeleted = vi.fn();
        renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onDeleted={onDeleted} />);
        fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));

        fireEvent.click(screen.getByText('Undo'));
        expect(screen.getByText('PROJ-1')).toBeTruthy();
        expect(screen.queryByText('Undo')).toBeNull();
        expect(clearTimeoutSpy).toHaveBeenCalled();

        // Even letting the original window fully elapse afterwards must not
        // fire a delete. This is a SAFETY-NET property (belt-and-braces: the
        // timer callback's own `pendingRef.current?.entry.worklogId ===
        // entry.worklogId` guard would suppress the delete on its own even
        // if the timeout had not been cleared) — the `clearTimeoutSpy`
        // assertion above is what actually pins cancellation itself.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
        });
        expect(deleteWorklogMock).not.toHaveBeenCalled();
        expect(onDeleted).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
        clearTimeoutSpy.mockRestore();
      }
    });

    it('⌘Z triggers undo while the affordance is present', () => {
      renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
      fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));
      expect(screen.getByText('Undo')).toBeTruthy();

      fireEvent.keyDown(document, { key: 'z', metaKey: true });

      expect(screen.getByText('PROJ-1')).toBeTruthy();
      expect(screen.queryByText('Undo')).toBeNull();
    });

    it('Ctrl+Z (non-Mac) also triggers undo', () => {
      renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
      fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));
      fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
      expect(screen.getByText('PROJ-1')).toBeTruthy();
    });

    it('⇧⌘Z (redo) does NOT trigger undo', () => {
      renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
      fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));
      fireEvent.keyDown(document, { key: 'z', metaKey: true, shiftKey: true });
      expect(screen.queryByText('PROJ-1')).toBeNull();
      expect(screen.getByText('Undo')).toBeTruthy();
    });

    it('⌘Z does NOT fire while focus is inside a text-entry element — native undo wins (D-7.5-20)', async () => {
      renderWithProviders(<LoggedToday entries={[{ ...baseEntry }, {
        ...baseEntry,
        key: 'PROJ-2',
        worklogId: '10002',
      }]} />);

      // Put a text input in focus by entering edit mode on the OTHER row.
      fireEvent.click(screen.getByLabelText('Edit PROJ-2, 2.5h'));
      const hoursInput = screen.getByLabelText('Hours');
      hoursInput.focus();
      expect(document.activeElement).toBe(hoursInput);

      fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));
      expect(screen.getByText('Undo')).toBeTruthy();

      fireEvent.keyDown(hoursInput, { key: 'z', metaKey: true });

      // The row stays deleted (hidden) — the keystroke fell through to the
      // (mocked) native text-editing undo instead of cancelling the delete.
      expect(screen.queryByText('PROJ-1')).toBeNull();
      expect(screen.getByText('Undo')).toBeTruthy();
    });

    it('⌘Z does nothing when no delete is pending (listener is unbound)', () => {
      renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
      // Should not throw, and the entry stays exactly as it was.
      fireEvent.keyDown(document, { key: 'z', metaKey: true });
      expect(screen.getByText('PROJ-1')).toBeTruthy();
    });

    it('a second delete commits the first immediately, then starts a new window for the second', async () => {
      vi.useFakeTimers();
      try {
        const onDeleted = vi.fn();
        renderWithProviders(
          <LoggedToday
            entries={[
              { ...baseEntry },
              { ...baseEntry, key: 'PROJ-2', worklogId: '10002', hoursDisplay: '1h' },
            ]}
            onDeleted={onDeleted}
          />,
        );

        fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));
        // Advance partway — PROJ-1 is still only pending, not yet committed.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
        expect(deleteWorklogMock).not.toHaveBeenCalled();

        // A second delete forces the first to commit immediately.
        fireEvent.click(screen.getByLabelText('Delete PROJ-2, 1h'));
        // Flush the mutation's own promise chain (TanStack Query defers the
        // actual mutationFn invocation by a microtask) without advancing
        // fake time — the commit is immediate in wall-clock terms, just not
        // synchronous in JS terms.
        await act(async () => {});
        expect(deleteWorklogMock).toHaveBeenCalledWith('PROJ-1', '10001');
        expect(onDeleted).toHaveBeenCalledWith('10001');
        expect(deleteWorklogMock).not.toHaveBeenCalledWith('PROJ-2', '10002');

        await act(async () => {
          await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
        });
        expect(deleteWorklogMock).toHaveBeenCalledWith('PROJ-2', '10002');
        expect(onDeleted).toHaveBeenCalledWith('10002');
      } finally {
        vi.useRealTimers();
      }
    });

    // Review Finding 1 (Blocker), D-7.5-18: reproduces the reviewer's exact
    // probe P1 — a `deleteWorklog` that never settles. Before the fix, the
    // undo-window timer cleared `pending` BEFORE dispatching the mutation,
    // so `visibleEntries` stopped filtering the row the instant the timer
    // fired, well before the DELETE round-trip ever completed: the row came
    // back with LIVE Edit/Delete buttons, and a second click issued a
    // SECOND, duplicate, irreversible DELETE for the same worklog.
    it('the row stays hidden for the ENTIRE in-flight DELETE, and a second DELETE of the same worklog is structurally impossible (Finding 1)', async () => {
      let resolveDelete: (v: unknown) => void = () => {};
      deleteWorklogMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDelete = resolve;
          }),
      );
      vi.useFakeTimers();
      try {
        renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
        fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));

        // Let the undo window elapse — this dispatches the DELETE, which
        // then never settles (the probe's whole point).
        await act(async () => {
          await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
        });
        expect(deleteWorklogMock).toHaveBeenCalledTimes(1);

        // The reviewer's exact assertions, inverted: the row must NOT be
        // back, there must be NO live Delete button to click a second time,
        // and the Undo affordance (nothing left to cancel) must be gone too.
        expect(screen.queryByText('PROJ-1')).toBeNull();
        expect(screen.queryByLabelText('Delete PROJ-1, 2.5h')).toBeNull();
        expect(screen.queryByText('Undo')).toBeNull();

        // Waiting longer changes nothing — no timer is left to re-fire, and
        // there is no button in the document to double-click.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
        });
        expect(deleteWorklogMock).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('PROJ-1')).toBeNull();

        // Let the DELETE finally settle so the mutation doesn't leak into
        // the next test.
        resolveDelete({ kind: 'ok', value: undefined });
        await act(async () => {});
      } finally {
        vi.useRealTimers();
      }
    });

    it('a REFUSED delete re-inserts the row with the persistent red chip — the only legitimate red', async () => {
      deleteWorklogMock.mockResolvedValueOnce({ kind: 'forbidden' });
      vi.useFakeTimers();
      try {
        renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
        fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));
        await commitPendingDeletion();

        // The row is back — Jira genuinely refused the delete.
        expect(screen.getByText('PROJ-1')).toBeTruthy();
        expect(
          screen.getByText('Couldn’t delete — you don’t have permission'),
        ).toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a transient (network) failure at commit re-inserts the row, enqueues to the outbox, and shows the pending chip', async () => {
      deleteWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
      vi.useFakeTimers();
      try {
        renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
        fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));
        await commitPendingDeletion();

        expect(screen.getByText('PROJ-1')).toBeTruthy();
        expect(screen.getByText('Pending — will retry')).toBeTruthy();
        expect(enqueueOutboxMock).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'delete', issueKey: 'PROJ-1', worklogId: '10001' }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('the chrome-header seconds derivation drops immediately and is not double-hidden — onPendingDeletionChange fires with the id, then null on undo', () => {
      const onPendingDeletionChange = vi.fn();
      renderWithProviders(
        <LoggedToday
          entries={[{ ...baseEntry }]}
          onPendingDeletionChange={onPendingDeletionChange}
        />,
      );
      expect(onPendingDeletionChange).toHaveBeenLastCalledWith(null);

      fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));
      expect(onPendingDeletionChange).toHaveBeenLastCalledWith('10001');

      fireEvent.click(screen.getByText('Undo'));
      expect(onPendingDeletionChange).toHaveBeenLastCalledWith(null);
    });

    it('teardown (pagehide) while a delete is pending enqueues it to the outbox instead of racing a fetch', () => {
      renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
      fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));

      // Finding 4's fix now flips `committingIds` (a real state update)
      // inside `flush()`, so the raw `dispatchEvent` (unlike `fireEvent`,
      // not auto-wrapped by RTL) needs an explicit `act()`.
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });

      expect(deleteWorklogMock).not.toHaveBeenCalled();
      expect(enqueueOutboxMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'delete', issueKey: 'PROJ-1', worklogId: '10001' }),
      );
    });

    // Review Finding 4 (Minor), D-7.5-18: reproduces probe P2 — once the
    // teardown flush has handed the delete to the outbox, Undo must not
    // stay offered as if it could still cancel something. Before the fix,
    // `flush()` never touched `pending`/`committingIds`, so the affordance
    // stayed rendered AND functional: clicking it cleared `pending` and the
    // row came back — while the outbox entry stayed queued for the service
    // worker to delete anyway. That is the "silent data-integrity lie"
    // D-7.5-18 was written to prevent, from the opposite direction.
    it('after the teardown flush, Undo is gone (inert) — it can never contradict a delete already queued to the outbox', () => {
      renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
      fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));
      expect(screen.getByText('Undo')).toBeTruthy();

      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });

      // The affordance is gone — nothing left to cancel, so nothing to
      // click. The row stays hidden (it is, correctly, being deleted).
      expect(screen.queryByText('Undo')).toBeNull();
      expect(screen.queryByText('PROJ-1')).toBeNull();
      expect(enqueueOutboxMock).toHaveBeenCalledTimes(1);
    });

    it('empty state renders once the only entry is pending deletion, and the undo affordance still shows', () => {
      renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
      fireEvent.click(screen.getByLabelText('Delete PROJ-1, 2.5h'));

      expect(screen.getByText('Nothing on the clock yet today.')).toBeTruthy();
      expect(screen.getByText('Undo')).toBeTruthy();
    });
  });

  // ---- Existing failed-outbox-entry surface (Story 2.7) — unchanged ------

  it('renders a failed-outbox chip with Retry now + Discard for a matching entry', async () => {
    outboxEntries = [
      {
        id: 'ob-1',
        kind: 'delete',
        endpoint: 'e',
        issueKey: 'PROJ-1',
        worklogId: '10001',
        attemptCount: 10,
        status: 'failed',
        lastError: 'network',
        enqueuedAt: 'now',
      },
    ];
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);

    await waitFor(() => {
      expect(screen.getByText(/Couldn’t post after multiple tries/)).toBeTruthy();
    });
    expect(screen.getByLabelText('Retry now')).toBeTruthy();
    expect(screen.getByLabelText('Discard')).toBeTruthy();
  });

  it('Discard → confirm chip → Discard calls outbox.remove', async () => {
    outboxEntries = [
      {
        id: 'ob-1',
        kind: 'delete',
        endpoint: 'e',
        issueKey: 'PROJ-1',
        worklogId: '10001',
        attemptCount: 10,
        status: 'failed',
        lastError: 'network',
        enqueuedAt: 'now',
      },
    ];
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);

    await waitFor(() => expect(screen.getByLabelText('Discard')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Discard'));
    expect(screen.getByText('Discard this pending write?')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Discard'));

    await waitFor(() => {
      expect(removeOutboxMock).toHaveBeenCalledWith('ob-1');
    });
  });

  it('Retry now → resets to pending + triggers an immediate drain pass', async () => {
    outboxEntries = [
      {
        id: 'ob-1',
        kind: 'delete',
        endpoint: 'e',
        issueKey: 'PROJ-1',
        worklogId: '10001',
        attemptCount: 10,
        status: 'failed',
        lastError: 'network',
        enqueuedAt: 'now',
      },
    ];
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);

    await waitFor(() => expect(screen.getByLabelText('Retry now')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Retry now'));

    await waitFor(() => {
      expect(updateOutboxMock).toHaveBeenCalledWith(
        'ob-1',
        expect.objectContaining({ status: 'pending', attemptCount: 0 }),
      );
    });
    await waitFor(() => {
      expect(runOutboxRetryPassMock).toHaveBeenCalled();
    });
  });
});
