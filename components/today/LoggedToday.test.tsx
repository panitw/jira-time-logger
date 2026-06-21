import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

const { LoggedToday } = await import('./LoggedToday');

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

  it('shows empty state when no entries', () => {
    renderWithProviders(<LoggedToday entries={[]} />);
    expect(
      screen.getByText('Nothing logged today yet. Pick a ticket below to start.'),
    ).toBeTruthy();
  });

  it('renders entries with key, summary, and hours', () => {
    renderWithProviders(
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
  });

  it('renders heading "Logged today"', () => {
    renderWithProviders(<LoggedToday entries={[]} />);
    expect(screen.getByText('Logged today')).toBeTruthy();
  });

  it('the actions trigger is a button with a descriptive aria-label', () => {
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
    const trigger = screen.getByLabelText('Worklog actions for PROJ-1, 2.5h');
    expect(trigger.tagName).toBe('BUTTON');
  });

  it('opens a menu with Edit + Delete items', () => {
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    const menu = screen.getByRole('menu', { name: 'Worklog actions' });
    expect(menu).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('Esc closes the menu', async () => {
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} />);
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    expect(screen.getByText('Edit')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Edit')).toBeNull());
  });

  it('Edit → Save calls updateWorklog with id/body and fires onEdited', async () => {
    const onEdited = vi.fn();
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onEdited={onEdited} />);
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    fireEvent.click(screen.getByText('Edit'));

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
    // Entry started well in the past — must NOT be silently moved to today.
    const pastEntry = { ...baseEntry, started: '2020-01-15' };
    renderWithProviders(<LoggedToday entries={[pastEntry]} onEdited={onEdited} />);
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    fireEvent.click(screen.getByText('Edit'));

    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '3h' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const body = updateWorklogMock.mock.calls[0]![2] as { started: string };
      // The posted timestamp must reflect the original 2020 date, not today.
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
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    fireEvent.click(screen.getByText('Edit'));
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

  it('Delete → confirm chip → Delete calls deleteWorklog and fires onDeleted', async () => {
    const onDeleted = vi.fn();
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByText('Delete this worklog?')).toBeTruthy();
    // Click the confirm "Delete" (now inside the confirm chip)
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(deleteWorklogMock).toHaveBeenCalledWith('PROJ-1', '10001');
    });
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledWith('10001');
    });
  });

  it('Cancel in the confirm chip does not call deleteWorklog', () => {
    const onDeleted = vi.fn();
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(deleteWorklogMock).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('forbidden on edit → persistent chip, no onEdited', async () => {
    updateWorklogMock.mockResolvedValueOnce({ kind: 'forbidden' });
    const onEdited = vi.fn();
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onEdited={onEdited} />);
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2h' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Couldn’t update — you don’t have permission')).toBeTruthy();
    });
    expect(onEdited).not.toHaveBeenCalled();
  });

  it('forbidden on delete → persistent chip, no onDeleted', async () => {
    deleteWorklogMock.mockResolvedValueOnce({ kind: 'forbidden' });
    const onDeleted = vi.fn();
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Couldn’t delete — you don’t have permission')).toBeTruthy();
    });
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('network failure on delete → "Pending — will retry" chip + outbox enqueue', async () => {
    deleteWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
    const onDeleted = vi.fn();
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Pending — will retry')).toBeTruthy();
    });
    expect(onDeleted).not.toHaveBeenCalled();
    expect(enqueueOutboxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'delete',
        issueKey: 'PROJ-1',
        worklogId: '10001',
      }),
    );
  });

  it('network failure on edit → enqueues a put with the edited body', async () => {
    updateWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onEdited={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    fireEvent.click(screen.getByText('Edit'));
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

  it('guards double-submit on Save while pending', async () => {
    let resolve: (v: unknown) => void = () => {};
    updateWorklogMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderWithProviders(<LoggedToday entries={[{ ...baseEntry }]} onEdited={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Worklog actions for PROJ-1, 2.5h'));
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2h' } });
    fireEvent.click(screen.getByLabelText('Save'));

    await waitFor(() => expect(updateWorklogMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByLabelText('Save'));
    expect(updateWorklogMock).toHaveBeenCalledTimes(1);

    resolve({ kind: 'ok', value: { id: '10001', timeSpentSeconds: 7200 } });
  });
});
