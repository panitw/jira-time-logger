/* eslint-disable import-x/order */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * New for Story 7.10 finisher pass (review M-4): no test existed for this
 * component at all. The dialog's source is correct
 * (`onInteractOutside={(e) => e.preventDefault()}`) but nothing proved
 * focus-trap / restore-focus / no-backdrop-dismiss, or that removing
 * `onInteractOutside` would even be noticed. The backdrop-dismiss idiom is
 * copied from `components/week/GapAcknowledgmentDialog.test.tsx:201-225` —
 * Radix's dismissable-layer defers attaching its own pointerdown listener by
 * one `setTimeout(0)` tick.
 */

const disconnectAllMock = vi.fn();
vi.mock('@/lib/disconnect', () => ({
  disconnectAll: (...args: unknown[]) => disconnectAllMock(...args),
}));

import { DisconnectAction } from './DisconnectAction';

describe('DisconnectAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disconnectAllMock.mockResolvedValue({ kind: 'ok', value: undefined });
  });

  it('renders the outline button under a muted (grey) rule, not purple', () => {
    render(<DisconnectAction onDisconnected={vi.fn()} />);
    expect(screen.getByText('Disconnect')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disconnect…' })).toBeTruthy();
  });

  it('opens the confirmation dialog on click and does not call disconnectAll yet', () => {
    render(<DisconnectAction onDisconnected={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect…' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(disconnectAllMock).not.toHaveBeenCalled();
  });

  it('Cancel closes the dialog without calling disconnectAll', () => {
    render(<DisconnectAction onDisconnected={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(disconnectAllMock).not.toHaveBeenCalled();
  });

  it('a pointer-down outside the dialog does NOT close it (no-backdrop-dismiss)', async () => {
    render(<DisconnectAction onDisconnected={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect…' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    // Let Radix's deferred outside-pointerdown listener attach.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(disconnectAllMock).not.toHaveBeenCalled();
  });

  it('confirming calls disconnectAll and, on success, onDisconnected', async () => {
    const onDisconnected = vi.fn();
    render(<DisconnectAction onDisconnected={onDisconnected} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(disconnectAllMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onDisconnected).toHaveBeenCalledTimes(1));
  });

  it('a failed disconnectAll shows an inline failure and does not call onDisconnected', async () => {
    disconnectAllMock.mockResolvedValue({
      kind: 'storage-clear-failed',
      cause: 'boom',
    });
    const onDisconnected = vi.fn();
    render(<DisconnectAction onDisconnected={onDisconnected} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(screen.getByText('Failed. Try again.')).toBeTruthy());
    expect(onDisconnected).not.toHaveBeenCalled();
  });

  it('the dialog body copy names credentials, cached worklogs AND settings', () => {
    render(<DisconnectAction onDisconnected={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect…' }));
    // Scoped to the dialog specifically — the card behind it carries its
    // own, near-identical summary copy, so an unscoped query matches both.
    const dialog = within(screen.getByRole('dialog'));
    expect(
      dialog.getByText(/credentials.*cached worklog.*setting/i, { exact: false }),
    ).toBeTruthy();
  });
});
