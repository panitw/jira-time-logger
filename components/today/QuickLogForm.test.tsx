import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const postWorklogMock = vi.fn();

vi.mock('@/lib/jira-client', () => ({
  postWorklog: (...args: unknown[]) => postWorklogMock(...args),
}));

const sendMessageMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

const enqueueOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: (...args: unknown[]) => enqueueOutboxMock(...args),
}));

vi.mock('@/lib/storage/settings', () => ({
  approvalCycleItem: { getValue: vi.fn(async () => 'calendar-month') },
  targetHoursItem: { getValue: vi.fn(async () => 8) },
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { QuickLogForm } = await import('./QuickLogForm');

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('QuickLogForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-1', timeSpentSeconds: 9000 },
    });
  });

  it('renders ticket key + summary and focuses hours input on mount', () => {
    renderWithProviders(
      <QuickLogForm
        ticketKey="PROJ-1"
        ticketSummary="Fix bug"
        onLogged={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('PROJ-1')).toBeTruthy();
    expect(screen.getByText('Fix bug')).toBeTruthy();
    const input = screen.getByLabelText('Hours');
    expect(document.activeElement).toBe(input);
  });

  it('shows green border when input is parseable', () => {
    renderWithProviders(
      <QuickLogForm
        ticketKey="PROJ-1"
        ticketSummary="Fix bug"
        onLogged={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Hours');
    fireEvent.change(input, { target: { value: '2.5h' } });
    expect(input.className).toContain('border-state-success');
  });

  it('shows red border + helper text when unparseable', () => {
    renderWithProviders(
      <QuickLogForm
        ticketKey="PROJ-1"
        ticketSummary="Fix bug"
        onLogged={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Hours');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.className).toContain('border-state-danger');
    expect(screen.getByText('Use formats like 2.5h, 2h 30m, or 2:30')).toBeTruthy();
  });

  it('hard-blocks hours > 24 with error message and disabled Log button', () => {
    renderWithProviders(
      <QuickLogForm
        ticketKey="PROJ-1"
        ticketSummary="Fix bug"
        onLogged={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Hours');
    fireEvent.change(input, { target: { value: '25h' } });
    expect(input.className).toContain('border-state-danger');
    expect(
      screen.getByText("Hours per entry can\u2019t exceed 24. Split into multiple entries if needed."),
    ).toBeTruthy();
    expect(screen.getByText('Log').closest('button')!.disabled).toBe(true);
  });

  it('submits on Enter with parseable hours', async () => {
    const onLogged = vi.fn();
    renderWithProviders(
      <QuickLogForm
        ticketKey="PROJ-1"
        ticketSummary="Fix bug"
        onLogged={onLogged}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Hours');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(postWorklogMock).toHaveBeenCalledWith('PROJ-1', {
        timeSpentSeconds: 9000,
        started: expect.any(String),
      });
    });
  });

  it('calls onLogged after successful submit', async () => {
    const onLogged = vi.fn();
    renderWithProviders(
      <QuickLogForm
        ticketKey="PROJ-1"
        ticketSummary="Fix bug"
        onLogged={onLogged}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Hours');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(
      () => {
        expect(onLogged).toHaveBeenCalledWith(
          expect.objectContaining({
            key: 'PROJ-1',
            summary: 'Fix bug',
            seconds: 9000,
            worklogId: 'wl-1',
          }),
        );
      },
      { timeout: 1000 },
    );
  });

  it('disables Log button while submit is in-flight (no double post)', async () => {
    let resolvePost: (value: unknown) => void = () => {};
    postWorklogMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    renderWithProviders(
      <QuickLogForm
        ticketKey="PROJ-1"
        ticketSummary="Fix bug"
        onLogged={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Hours');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(postWorklogMock).toHaveBeenCalledTimes(1));

    // Try pressing Enter again while in-flight
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(postWorklogMock).toHaveBeenCalledTimes(1);

    resolvePost({ kind: 'ok', value: { id: '1', timeSpentSeconds: 9000 } });
  });

  it('shows error on a non-retryable post failure', async () => {
    postWorklogMock.mockResolvedValueOnce({ kind: 'forbidden' });

    renderWithProviders(
      <QuickLogForm
        ticketKey="PROJ-1"
        ticketSummary="Fix bug"
        onLogged={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Hours');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/Couldn\u2019t log time/)).toBeTruthy();
    });
    expect(enqueueOutboxMock).not.toHaveBeenCalled();
  });

  it('network failure \u2192 enqueues a post + shows "Pending \u2014 will retry"', async () => {
    postWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });

    renderWithProviders(
      <QuickLogForm
        ticketKey="PROJ-1"
        ticketSummary="Fix bug"
        onLogged={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Hours');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Pending \u2014 will retry')).toBeTruthy();
    });
    expect(enqueueOutboxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'post',
        issueKey: 'PROJ-1',
        body: expect.objectContaining({ timeSpentSeconds: 9000 }),
      }),
    );
  });

  it('Escape calls onCancel', () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <QuickLogForm
        ticketKey="PROJ-1"
        ticketSummary="Fix bug"
        onLogged={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Hours'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders date selector with Today default', () => {
    renderWithProviders(
      <QuickLogForm
        ticketKey="PROJ-1"
        ticketSummary="Fix bug"
        onLogged={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dateSelect = screen.getByLabelText('Date') as HTMLSelectElement;
    expect(dateSelect.value).toBe('today');
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
  });
});
