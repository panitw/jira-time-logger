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
    // AC4 (Story 6.1): aria-disabled (kept focusable) rather than native disabled.
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.disabled).toBe(false);
    expect(btn.title).toMatch(/no hours logged/i);
  });

  it('is disabled with the provided disabledReason (5.8 seam)', () => {
    renderButton({ disabledReason: 'Only the canonical manager can approve' });
    const btn = screen.getByTestId('approve-button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.disabled).toBe(false);
    expect(btn.title).toBe('Only the canonical manager can approve');
  });

  // Story 7.8 / Task 9: the title and the "H h across N epics" copy are now
  // TWO separate strings, and the commit button carries the figure.
  it('opens a confirm dialog with the title "Approve <Person>\'s <Cycle>?" and the body stating the figure + epic count', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(screen.getByText("Approve Bob's May 2026?")).toBeTruthy();
    expect(screen.getByTestId('approve-dialog-body').textContent).toBe(
      "You're approving 40h across 2 epics for the May 2026 cycle. Accounting uses this figure.",
    );
  });

  it('the commit button carries the figure ("Approve 40h"), not a bare "Approve"', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(screen.getByRole('button', { name: 'Approve 40h' })).toBeTruthy();
  });

  it('omits the restricted line when restrictedCount is 0', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(screen.queryByTestId('approve-restricted-line')).toBeNull();
  });

  it('shows the restricted line, counting EPICS (not worklogs) — AC6', () => {
    renderButton({
      restrictedCount: 3,
      epics: [
        { epicKey: 'EP-1', restrictedCount: 3 },
        { epicKey: 'EP-2', restrictedCount: 0 },
      ],
    });
    fireEvent.click(screen.getByTestId('approve-button'));
    // Only ONE of the two epics has a restrictedCount > 0.
    expect(screen.getByTestId('approve-restricted-line').textContent).toMatch(
      /1 epic has worklogs you can't see\. Approving does not cover them\./,
    );
  });

  it('pluralises the restricted-line epic count AND its verb (Finding 26: "have", not "has")', () => {
    renderButton({
      restrictedCount: 4,
      epics: [
        { epicKey: 'EP-1', restrictedCount: 3 },
        { epicKey: 'EP-2', restrictedCount: 1 },
      ],
    });
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(screen.getByTestId('approve-restricted-line').textContent).toMatch(
      /2 epics have worklogs you can't see\./,
    );
  });

  it('Cancel closes the dialog without sending a request', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  // Task 12 mutation (h) / QA Finding 2: the developer's own probe found
  // that a SYNCHRONOUS `fireEvent.pointerDown` never reaches Radix's
  // `DismissableLayer` outside-click handler (it defers attaching its own
  // `pointerdown` listener by one `setTimeout(0)` tick, precisely so the
  // very pointerdown that OPENED the dialog can't immediately close it) —
  // and concluded the interaction was unprovable in jsdom. That conclusion
  // was wrong: Story 7.7 already solved this exact false-green
  // (`components/week/GapAcknowledgmentDialog.test.tsx:201-225`) by
  // AWAITING the deferred tick before firing the outside pointerdown. The
  // house pattern, applied here:
  it('a pointer-down outside the confirm dialog does NOT close it (money-path guard)', async () => {
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    // Let Radix's deferred outside-pointerdown listener attach.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  it('Esc still closes the confirm dialog without sending a request', async () => {
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  it('full success → Done (via the shared registry, no ✓ text glyph); invalidates each confirmed Epic', async () => {
    sendRequestMock.mockResolvedValueOnce({
      confirmed: ['EP-1', 'EP-2'],
      failed: [],
      enqueued: [],
    });
    renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve 40h' }));

    await waitFor(() => expect(screen.getByTestId('approve-done')).toBeTruthy());
    const done = screen.getByTestId('approve-done');
    expect(done.textContent).toBe('Done');
    expect(done.querySelector('svg')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Approve 40h' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Approve 40h' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Approve 40h' }));
    const chip = await screen.findByTestId('approve-partial');
    expect(chip.getAttribute('title')).not.toMatch(/retry automatically/i);
    expect(chip.getAttribute('title')).toMatch(/re-approve/i);
  });

  // --- Story 5.7: re-approve mode -----------------------------------------

  it('renders a secondary-tier "Re-approve <Person>" button in reapprove mode', () => {
    renderButton({ mode: 'reapprove', priorApprovalAt: '2026-05-20T08:30:00.000Z' });
    const btn = screen.getByTestId('approve-button');
    expect(btn.textContent).toContain('Re-approve Bob');
    expect(btn.getAttribute('aria-label')).toBe('Re-approve Bob');
    // Secondary tier: transparent bg + neutral border, NOT brand-purple.
    expect(btn.className).toContain('bg-transparent');
    expect(btn.className).toContain('border-neutral-200');
    expect(btn.className).not.toContain('bg-accent');
  });

  it('reapprove dialog shows the supersede line with the formatted prior at', () => {
    renderButton({ mode: 'reapprove', priorApprovalAt: '2026-05-20T08:30:00.000Z' });
    fireEvent.click(screen.getByTestId('approve-button'));
    // Verb becomes "Re-approve" in the title; the commit button carries the figure.
    expect(screen.getByText("Re-approve Bob's May 2026?")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-approve 40h' })).toBeTruthy();
    const supersede = screen.getByTestId('approve-supersede-line');
    expect(supersede.textContent).toMatch(/supersedes prior approval from/i);
    // Human-readable formatted date, not the raw ISO.
    expect(supersede.textContent).toMatch(/May 20, 2026/);
    expect(supersede.textContent).not.toContain('2026-05-20T08:30:00.000Z');
  });

  it('reapprove with a missing/unparseable prior at never crashes (cosmetic fallback)', () => {
    renderButton({ mode: 'reapprove', priorApprovalAt: undefined });
    fireEvent.click(screen.getByTestId('approve-button'));
    const supersede = screen.getByTestId('approve-supersede-line');
    expect(supersede.textContent).toMatch(/supersedes prior approval from/i);
    // Falls back to a neutral placeholder rather than throwing.
    expect(supersede.textContent).toMatch(/an earlier approval/i);
  });

  it('reapprove falls back to the raw ISO when the prior at is unparseable', () => {
    renderButton({ mode: 'reapprove', priorApprovalAt: 'not-a-date' });
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(screen.getByTestId('approve-supersede-line').textContent).toContain('not-a-date');
  });

  it('reapprove fires the SAME approve-cycle payload and success → ✓ Done', async () => {
    sendRequestMock.mockResolvedValueOnce({
      confirmed: ['EP-1', 'EP-2'],
      failed: [],
      enqueued: [],
    });
    renderButton({ mode: 'reapprove', priorApprovalAt: '2026-05-20T08:30:00.000Z' });
    fireEvent.click(screen.getByTestId('approve-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve 40h' }));

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
  });

  it('reapprove partial → the same "Approval partial" chip', async () => {
    sendRequestMock.mockResolvedValueOnce({
      confirmed: ['EP-1'],
      failed: ['EP-2'],
      enqueued: ['EP-2'],
    });
    renderButton({ mode: 'reapprove', priorApprovalAt: '2026-05-20T08:30:00.000Z' });
    fireEvent.click(screen.getByTestId('approve-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve 40h' }));
    const chip = await screen.findByTestId('approve-partial');
    expect(chip.textContent).toContain('Approval partial — 1 of 2 Epics confirmed');
  });

  it('disabledReason disables the button in reapprove mode too (5.8 seam, AC7)', () => {
    renderButton({
      mode: 'reapprove',
      priorApprovalAt: '2026-05-20T08:30:00.000Z',
      disabledReason: 'Only the canonical manager can approve',
    });
    const btn = screen.getByTestId('approve-button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.disabled).toBe(false);
    expect(btn.title).toBe('Only the canonical manager can approve');
  });

  // --- Story 6.1 AC4: disabled-reason is keyboard/SR-reachable ------------

  describe('AC4 — disabled-button explanation reachable by keyboard & SR', () => {
    it('keeps a disabled (non-canonical) Approve focusable and announces its reason', () => {
      renderButton({ disabledReason: 'Only the canonical manager can approve' });
      const btn = screen.getByTestId('approve-button') as HTMLButtonElement;
      // Focusable: not the native `disabled` attribute (which drops it from the
      // tab order and hides its title from assistive tech).
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      btn.focus();
      expect(btn).toHaveFocus();
      // The reason is associated via aria-describedby → a (visually-hidden) node
      // carrying the explanation, so a screen reader announces it.
      const describedBy = btn.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const reasonNode = document.getElementById(describedBy!);
      expect(reasonNode?.textContent).toBe('Only the canonical manager can approve');
      // jsdom can't compute the accessible description, but the wiring above is
      // the screen-reader contract; the accessible NAME stays the button label.
      expect(btn).toHaveAccessibleName('Approve Bob');
    });

    it('associates the empty-row reason the same way', () => {
      renderButton({ epics: [] });
      const btn = screen.getByTestId('approve-button') as HTMLButtonElement;
      const describedBy = btn.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)?.textContent).toMatch(/no hours logged/i);
    });

    it('does NOT open the confirm dialog when activated while disabled (fail-closed, no 5.8 regression)', () => {
      renderButton({ disabledReason: 'Only the canonical manager can approve' });
      const btn = screen.getByTestId('approve-button');
      // Click and keyboard activation must both be inert while disabled.
      fireEvent.click(btn);
      fireEvent.keyDown(btn, { key: 'Enter' });
      fireEvent.keyUp(btn, { key: 'Enter' });
      // No confirm dialog, no approve-cycle request.
      expect(screen.queryByText(/across .* epic/i)).toBeNull();
      expect(sendRequestMock).not.toHaveBeenCalled();
    });

    it('an enabled Approve has no aria-disabled and no describedby reason node', () => {
      renderButton();
      const btn = screen.getByTestId('approve-button') as HTMLButtonElement;
      expect(btn.getAttribute('aria-disabled')).toBeNull();
      expect(btn.getAttribute('aria-describedby')).toBeNull();
      expect(screen.queryByTestId('approve-disabled-reason')).toBeNull();
    });
  });

  it('resets a terminal "Done" state when the cycle subject changes', async () => {
    sendRequestMock.mockResolvedValueOnce({
      confirmed: ['EP-1', 'EP-2'],
      failed: [],
      enqueued: [],
    });
    const { rerender } = renderButton();
    fireEvent.click(screen.getByTestId('approve-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve 40h' }));
    await screen.findByTestId('approve-done');

    // Switch to a different cycle on the SAME button instance — the stale Done
    // must clear back to a ready Approve button (no false Done for a cycle this
    // manager never approved).
    rerender(<ApproveButton {...baseProps} cycle="2026-06" cycleTitle="Jun 2026" />);
    await waitFor(() => expect(screen.getByTestId('approve-button')).toBeTruthy());
    expect(screen.queryByTestId('approve-done')).toBeNull();
  });
});
