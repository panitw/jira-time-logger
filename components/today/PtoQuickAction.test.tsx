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
    // Minimal chrome stub. Cast rather than `@ts-expect-error`: that only
    // suppresses the line it precedes, so once `tabs` was added the error moved
    // inside the object literal and escaped it.
    globalThis.chrome = {
      runtime: {
        openOptionsPage: vi.fn(),
        getURL: (p: string) => `chrome-extension://test/${p}`,
      },
      tabs: { create: vi.fn() },
    } as unknown as typeof chrome;
  });

  it('renders the trigger button', async () => {
    renderWithProviders(<PtoQuickAction onLogged={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText('Mark today as time off')).toBeTruthy(),
    );
  });

  // When no time-off subtask is configured the trigger stays ENABLED and opens
  // Settings itself, rather than sitting disabled beside a paragraph naming the
  // fix (D-7.2-5 / D-7.8-18: no dead UI). It also removes the two real-browser
  // defects that treatment shipped with — a 54-character helper that could not
  // fit its own 224px box, and which then overlapped the body because it was
  // absolutely positioned to protect the fixed-height action bar.
  describe('when no time-off subtask is configured', () => {
    beforeEach(() => {
      ptoKeyGetValue.mockResolvedValue(null);
    });

    it('keeps the trigger enabled — it is the route to configuring, not a dead control', async () => {
      renderWithProviders(<PtoQuickAction onLogged={vi.fn()} />);
      const btn = await waitFor(() =>
        screen.getByText('Mark today as time off').closest('button')!,
      );
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('aria-disabled')).toBeNull();
    });

    it('opens the full page on Settings — not the options page, which would duplicate the tab', async () => {
      renderWithProviders(<PtoQuickAction onLogged={vi.fn()} />);
      const trigger = await screen.findByText('Mark today as time off');
      fireEvent.click(trigger);
      // `chrome.tabs.create` via openFullPage; NOT openOptionsPage, which
      // post-D-7.10-39 only redirects to fullpage.html?section=settings and so
      // leaves a duplicate tab behind (the D-7.10-35 bug class).
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test/fullpage.html?section=settings',
      });
      expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
    });

    it('explains itself without occupying layout, so nothing can wrap or overlap', async () => {
      const { container } = renderWithProviders(<PtoQuickAction onLogged={vi.fn()} />);
      const btn = await waitFor(() =>
        screen.getByText('Mark today as time off').closest('button')!,
      );
      // The hint reaches sighted users via `title` and screen readers via
      // sr-only text — neither is a laid-out paragraph.
      expect(btn.getAttribute('title')).toBe(
        'Choose a time-off subtask in Settings first',
      );
      expect(btn.textContent).toContain('Choose a time-off subtask in Settings first');
      // The regression guard: no absolutely-positioned helper, and no fixed-width
      // box for the copy to overflow. Both were the shipped defect.
      expect(container.querySelector('p.absolute')).toBeNull();
      expect(container.querySelector('.w-56')).toBeNull();
    });
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
