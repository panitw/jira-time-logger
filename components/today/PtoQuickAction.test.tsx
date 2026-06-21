import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const logFullDayPtoMock = vi.fn();
const logHalfDayPtoMock = vi.fn();
vi.mock('@/lib/pto', () => ({
  logFullDayPto: (...args: unknown[]) => logFullDayPtoMock(...args),
  logHalfDayPto: (...args: unknown[]) => logHalfDayPtoMock(...args),
}));

const sendMessageMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

const enqueueOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: (...args: unknown[]) => enqueueOutboxMock(...args),
}));

const ptoKeyGetValue = vi.fn(async () => 'KNP-99' as string | null);
const ptoSummaryGetValue = vi.fn(async () => 'PTO' as string | null);
const targetHoursGetValue = vi.fn(async () => 8);
vi.mock('@/lib/storage/settings', () => ({
  ptoSubtaskKeyItem: { getValue: () => ptoKeyGetValue() },
  ptoSubtaskSummaryItem: { getValue: () => ptoSummaryGetValue() },
  targetHoursItem: { getValue: () => targetHoursGetValue() },
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { PtoQuickAction } = await import('./PtoQuickAction');

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('PtoQuickAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ptoKeyGetValue.mockResolvedValue('KNP-99');
    ptoSummaryGetValue.mockResolvedValue('PTO');
    targetHoursGetValue.mockResolvedValue(8);
    logFullDayPtoMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-1', timeSpentSeconds: 28800 },
    });
    logHalfDayPtoMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-2', timeSpentSeconds: 14400 },
    });
    // @ts-expect-error minimal chrome stub
    globalThis.chrome = { runtime: { openOptionsPage: vi.fn() } };
  });

  it('renders the trigger button', async () => {
    renderWithProviders(<PtoQuickAction onLogged={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText('Mark today as PTO')).toBeTruthy(),
    );
  });

  it('renders disabled with discoverable explanation + Settings link when PTO unset', async () => {
    ptoKeyGetValue.mockResolvedValue(null);
    renderWithProviders(<PtoQuickAction onLogged={vi.fn()} />);
    await waitFor(() => {
      const btn = screen.getByText('Mark today as PTO').closest('button')!;
      expect(btn.disabled).toBe(true);
    });
    expect(screen.getByText(/PTO subtask not configured/)).toBeTruthy();
    const settingsLink = screen.getByText('Settings');
    fireEvent.click(settingsLink);
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it('opens a popover with Full/Half buttons showing correct hours', async () => {
    renderWithProviders(<PtoQuickAction onLogged={vi.fn()} />);
    const trigger = await screen.findByText('Mark today as PTO');
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByText('Full day (8h)')).toBeTruthy();
      expect(screen.getByText('Half day (4h)')).toBeTruthy();
    });
  });

  it('Full day click posts target seconds and calls onLogged + broadcasts badge-update', async () => {
    const onLogged = vi.fn();
    renderWithProviders(<PtoQuickAction onLogged={onLogged} />);
    fireEvent.click(await screen.findByText('Mark today as PTO'));
    fireEvent.click(await screen.findByText('Full day (8h)'));

    await waitFor(() => {
      expect(logFullDayPtoMock).toHaveBeenCalledWith(
        'KNP-99',
        8,
        expect.any(String),
      );
    });
    await waitFor(
      () => {
        expect(onLogged).toHaveBeenCalledWith(
          expect.objectContaining({
            key: 'KNP-99',
            summary: 'PTO',
            seconds: 28800,
            worklogId: 'wl-1',
          }),
        );
      },
      { timeout: 1000 },
    );
    expect(sendMessageMock).toHaveBeenCalledWith('badge-update', {
      hoursMissing: 0,
    });
  });

  it('Half day click posts half the target seconds', async () => {
    const onLogged = vi.fn();
    renderWithProviders(<PtoQuickAction onLogged={onLogged} />);
    fireEvent.click(await screen.findByText('Mark today as PTO'));
    fireEvent.click(await screen.findByText('Half day (4h)'));

    await waitFor(() => {
      expect(logHalfDayPtoMock).toHaveBeenCalledWith(
        'KNP-99',
        8,
        expect.any(String),
      );
    });
    await waitFor(
      () => {
        expect(onLogged).toHaveBeenCalledWith(
          expect.objectContaining({ seconds: 14400 }),
        );
      },
      { timeout: 1000 },
    );
  });

  it('shows inline error and does not call onLogged on a non-retryable Result', async () => {
    logFullDayPtoMock.mockResolvedValueOnce({ kind: 'forbidden' });
    const onLogged = vi.fn();
    renderWithProviders(<PtoQuickAction onLogged={onLogged} />);
    fireEvent.click(await screen.findByText('Mark today as PTO'));
    fireEvent.click(await screen.findByText('Full day (8h)'));

    await waitFor(() => {
      expect(screen.getByText(/Couldn.t mark PTO/)).toBeTruthy();
    });
    expect(onLogged).not.toHaveBeenCalled();
    expect(enqueueOutboxMock).not.toHaveBeenCalled();
  });

  it('network failure → enqueues a post + shows "Pending — will retry"', async () => {
    logFullDayPtoMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
    const onLogged = vi.fn();
    renderWithProviders(<PtoQuickAction onLogged={onLogged} />);
    fireEvent.click(await screen.findByText('Mark today as PTO'));
    fireEvent.click(await screen.findByText('Full day (8h)'));

    await waitFor(() => {
      expect(screen.getByText('Pending — will retry')).toBeTruthy();
    });
    expect(onLogged).not.toHaveBeenCalled();
    expect(enqueueOutboxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'post',
        issueKey: 'KNP-99',
        body: expect.objectContaining({ timeSpentSeconds: 28800 }),
      }),
    );
  });

  it('Esc closes the popover', async () => {
    renderWithProviders(<PtoQuickAction onLogged={vi.fn()} />);
    fireEvent.click(await screen.findByText('Mark today as PTO'));
    expect(await screen.findByText('Full day (8h)')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Full day (8h)')).toBeNull();
    });
  });
});
