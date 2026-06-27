import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendRequestMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendRequest: (...a: unknown[]) => sendRequestMock(...a),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// Mock the settings boundary defensively (5-4 learned an unmocked
// `targetHoursItem` leaks unhandled rejections); ApproveButton doesn't read it,
// but its import graph might in future and this keeps the test isolated.
vi.mock('@/lib/storage/settings', () => ({
  targetHoursItem: { getValue: vi.fn(async () => 8) },
}));

const { ApproveButton } = await import('./ApproveButton');

let client: QueryClient;
let invalidateSpy: ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client }, children);
}

const baseProps = {
  personName: 'Bob',
  user: 'r-bob',
  by: 'mgr-1',
  cycle: '2026-05',
  cycleTitle: 'May 2026',
  epics: [
    { epicKey: 'EP-1', restrictedCount: 0 },
    { epicKey: 'EP-2', restrictedCount: 0 },
  ],
  rowSeconds: 40 * 3600,
  restrictedCount: 0,
};

function renderButton(props: Partial<React.ComponentProps<typeof ApproveButton>> = {}) {
  return render(<ApproveButton {...baseProps} {...props} />, { wrapper });
}

describe('ApproveButton', () => {
  beforeEach(() => {
    sendRequestMock.mockReset();
    client = new QueryClient();
    invalidateSpy = vi.fn();
    client.invalidateQueries = invalidateSpy as never;
  });

  it('renders a primary "Approve <Person>" button', () => {
    renderButton();
    const btn = screen.getByTestId('approve-button');
    expect(btn.textContent).toContain('Approve Bob');
    expect(btn.className).toContain('bg-accent');
    expect(btn.className).toContain('font-semibold');
  });

  it('is disabled (with explanation) when the row has no touched Epics', () => {
    renderButton({ epics: [] });
    const btn = screen.getByTestId('approve-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/no hours logged/i);
  });

  it('is disabled with the provided disabledReason (5.8 seam)', () => {
    renderButton({ disabledReason: 'Only the canonical manager can approve' });
    const btn = screen.getByTestId('approve-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('Only the canonical manager can approve');
  });

  it('opens a confirm dialog with the summary copy (H h across N Epics)', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(
      screen.getByText("Approve Bob's May 2026: 40h across 2 Epics"),
    ).toBeTruthy();
  });

  it('omits the restricted line when restrictedCount is 0', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(screen.queryByTestId('approve-restricted-line')).toBeNull();
  });

  it('shows the restricted line when restrictedCount > 0', () => {
    renderButton({ restrictedCount: 3 });
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(screen.getByTestId('approve-restricted-line').textContent).toMatch(
      /3 restricted-visibility worklogs excluded/,
    );
  });

  it('Cancel closes the dialog without sending a request', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  it('full success → ✓ Done; invalidates each confirmed Epic', async () => {
    sendRequestMock.mockResolvedValueOnce({
      confirmed: ['EP-1', 'EP-2'],
      failed: [],
      enqueued: [],
    });
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(screen.getByTestId('approve-done')).toBeTruthy());
    expect(sendRequestMock).toHaveBeenCalledWith('approve-cycle', {
      user: 'r-bob',
      cycle: '2026-05',
      by: 'mgr-1',
      epics: [
        { epicKey: 'EP-1', restrictedCount: 0 },
        { epicKey: 'EP-2', restrictedCount: 0 },
      ],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['epic-approvals', 'EP-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['epic-approvals', 'EP-2'] });
  });

  it('partial → "Approval partial — N of M Epics confirmed" chip with tooltip', async () => {
    sendRequestMock.mockResolvedValueOnce({
      confirmed: ['EP-1'],
      failed: ['EP-2'],
      enqueued: ['EP-2'],
    });
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    const chip = await screen.findByTestId('approve-partial');
    expect(chip.textContent).toContain('Approval partial — 1 of 2 Epics confirmed');
    expect(chip.getAttribute('title')).toMatch(/retry automatically/i);
    // Only the confirmed Epic is invalidated.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['epic-approvals', 'EP-1'] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['epic-approvals', 'EP-2'] });
  });

  it('null SW response → partial (nothing confirmed), no false Done', async () => {
    sendRequestMock.mockResolvedValueOnce(null);
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const chip = await screen.findByTestId('approve-partial');
    expect(chip.textContent).toContain('0 of 2 Epics confirmed');
  });

  it('partial with NO enqueued failures uses a no-auto-retry tooltip', async () => {
    // Terminal failures (forbidden/not-found) are recorded as failed but not
    // enqueued — the chip must NOT promise an automatic retry.
    sendRequestMock.mockResolvedValueOnce({
      confirmed: ['EP-1'],
      failed: ['EP-2'],
      enqueued: [],
    });
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const chip = await screen.findByTestId('approve-partial');
    expect(chip.getAttribute('title')).not.toMatch(/retry automatically/i);
    expect(chip.getAttribute('title')).toMatch(/re-approve/i);
  });

  it('resets a terminal "✓ Done" state when the cycle subject changes', async () => {
    sendRequestMock.mockResolvedValueOnce({
      confirmed: ['EP-1', 'EP-2'],
      failed: [],
      enqueued: [],
    });
    const { rerender } = renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByTestId('approve-done');

    // Switch to a different cycle on the SAME button instance — the stale Done
    // must clear back to a ready Approve button (no false Done for a cycle this
    // manager never approved).
    rerender(<ApproveButton {...baseProps} cycle="2026-06" cycleTitle="Jun 2026" />);
    await waitFor(() => expect(screen.getByTestId('approve-button')).toBeTruthy());
    expect(screen.queryByTestId('approve-done')).toBeNull();
  });
});
