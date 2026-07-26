import { readFileSync } from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
      expect(screen.getByText('Mark today as time off')).toBeTruthy(),
    );
  });

  it('renders disabled with discoverable explanation + Settings link when PTO unset', async () => {
    ptoKeyGetValue.mockResolvedValue(null);
    renderWithProviders(<PtoQuickAction onLogged={vi.fn()} />);
    await waitFor(() => {
      const btn = screen.getByText('Mark today as time off').closest('button')!;
      expect(btn.disabled).toBe(true);
    });
    expect(screen.getByText(/Time off subtask not configured/)).toBeTruthy();
    const settingsLink = screen.getByText('Settings');
    fireEvent.click(settingsLink);
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it('opens a popover with Full/Half buttons showing correct hours', async () => {
    renderWithProviders(<PtoQuickAction onLogged={vi.fn()} />);
    const trigger = await screen.findByText('Mark today as time off');
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByText('Full day (8h)')).toBeTruthy();
      expect(screen.getByText('Half day (4h)')).toBeTruthy();
    });
  });

  it('Full day click posts target seconds and calls onLogged + broadcasts badge-update', async () => {
    const onLogged = vi.fn();
    renderWithProviders(<PtoQuickAction onLogged={onLogged} />);
    fireEvent.click(await screen.findByText('Mark today as time off'));
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
    fireEvent.click(await screen.findByText('Mark today as time off'));
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
    fireEvent.click(await screen.findByText('Mark today as time off'));
    fireEvent.click(await screen.findByText('Full day (8h)'));

    await waitFor(() => {
      expect(screen.getByText(/Couldn.t mark time off/)).toBeTruthy();
    });
    expect(onLogged).not.toHaveBeenCalled();
    expect(enqueueOutboxMock).not.toHaveBeenCalled();
  });

  it('network failure → enqueues a post + shows "Pending — will retry"', async () => {
    logFullDayPtoMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
    const onLogged = vi.fn();
    renderWithProviders(<PtoQuickAction onLogged={onLogged} />);
    fireEvent.click(await screen.findByText('Mark today as time off'));
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

  // ---- D-7.3-12 guard: time off never becomes the resume ticket -----------
  // A source-level pin, not a mock-call assertion — this file's component
  // under test does not import `lib/storage/last-logged` at all today, so a
  // "was it called" spy would trivially pass without proving anything. The
  // meaningful guarantee is that the source itself never wires up the
  // resume card's writer, so a future edit that DOES add it would have to
  // touch (and update) this test.
  it('never writes the resume card’s last-logged record (D-7.3-12)', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'components/today/PtoQuickAction.tsx'),
      'utf-8',
    );
    expect(source).not.toMatch(/last-logged|setLastLoggedTicket/);
  });

  // ---- AC7: the verbatim-Jira-summary trap (Story 7.6) --------------------
  // `ptoSummary` is the REAL Jira subtask summary (`ptoSubtaskSummaryItem`)
  // — customer data — and must render exactly as Jira returned it, even
  // though it happens to contain the literal substring "PTO". A naive
  // find-and-replace across the repo would corrupt this.
  it('renders the real Jira subtask summary verbatim, even though it contains "PTO" (AC7)', async () => {
    ptoSummaryGetValue.mockResolvedValue('KNP-99 PTO');
    const onLogged = vi.fn();
    renderWithProviders(<PtoQuickAction onLogged={onLogged} />);
    fireEvent.click(await screen.findByText('Mark today as time off'));
    fireEvent.click(await screen.findByText('Full day (8h)'));

    await waitFor(
      () => {
        expect(onLogged).toHaveBeenCalledWith(
          expect.objectContaining({ summary: 'KNP-99 PTO' }),
        );
      },
      { timeout: 1000 },
    );
  });

  it('falls back to the literal "PTO" default summary when the real summary has not resolved (also AC7 — the fallback stands in for the same Jira field)', async () => {
    ptoSummaryGetValue.mockResolvedValue(null);
    const onLogged = vi.fn();
    renderWithProviders(<PtoQuickAction onLogged={onLogged} />);
    fireEvent.click(await screen.findByText('Mark today as time off'));
    fireEvent.click(await screen.findByText('Full day (8h)'));

    await waitFor(
      () => {
        expect(onLogged).toHaveBeenCalledWith(expect.objectContaining({ summary: 'PTO' }));
      },
      { timeout: 1000 },
    );
  });

  it('Esc closes the popover', async () => {
    renderWithProviders(<PtoQuickAction onLogged={vi.fn()} />);
    fireEvent.click(await screen.findByText('Mark today as time off'));
    expect(await screen.findByText('Full day (8h)')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Full day (8h)')).toBeNull();
    });
  });
});
