import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ChromeHeader } from './ChromeHeader';

describe('ChromeHeader', () => {
  it('wraps the progress figure/bar/note in a single role="status" aria-live="polite" region', () => {
    const { container } = render(
      <ChromeHeader connected userInitial="J" seconds={9000} targetHours={8} isPending={false} />,
    );
    const status = container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status?.getAttribute('aria-live')).toBe('polite');
    // Figure + bar + note all live inside the one live region.
    expect(status?.textContent).toContain('2.5');
    expect(status?.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('the progress bar is aria-hidden (meaning is carried by the figure text)', () => {
    const { container } = render(
      <ChromeHeader connected userInitial="J" seconds={0} targetHours={8} isPending={false} />,
    );
    const status = container.querySelector('[role="status"]') as HTMLElement;
    const bar = status.querySelector('.bg-white\\/20');
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
  });

  it('the ring motif is aria-hidden decoration', () => {
    const { container } = render(
      <ChromeHeader connected userInitial="J" seconds={0} targetHours={8} isPending={false} />,
    );
    const motif = container.querySelector('header > div[aria-hidden="true"]');
    expect(motif).toBeTruthy();
  });

  it('formats zero seconds as 0.0, never ——', () => {
    render(<ChromeHeader connected userInitial="J" seconds={0} targetHours={8} isPending={false} />);
    expect(screen.getByText(/^0\.0/)).toBeTruthy();
    expect(screen.queryByText(/——/)).toBeNull();
  });

  it('shows "Target met" copy at/above target', () => {
    render(
      <ChromeHeader connected userInitial="J" seconds={8 * 3600} targetHours={8} isPending={false} />,
    );
    expect(screen.getByText('Target met — 8h logged')).toBeTruthy();
  });

  it('shows "h to go today" copy below target', () => {
    render(
      <ChromeHeader connected userInitial="J" seconds={2 * 3600} targetHours={8} isPending={false} />,
    );
    expect(screen.getByText('6h to go today')).toBeTruthy();
  });

  it('renders skeleton placeholders while pending (never a spinner)', () => {
    const { container } = render(
      <ChromeHeader connected userInitial="J" seconds={0} targetHours={8} isPending />,
    );
    expect(container.querySelector('.animate-skeleton')).toBeTruthy();
    expect(container.querySelector('.animate-spin')).toBeNull();
    // No committed figure value while pending.
    expect(screen.queryByText('0.0')).toBeNull();
  });

  // --- Story 7.2 Finding 5: the live region must be present from first ------
  // --- paint, not inserted together with the resolved content --------------
  it('mounts the role="status" live region for the pending skeleton too, so the resolved transition is announced', () => {
    const { container, rerender } = render(
      <ChromeHeader connected userInitial="J" seconds={0} targetHours={8} isPending />,
    );
    // The region must already exist while pending...
    const pendingStatus = container.querySelector('[role="status"]');
    expect(pendingStatus).toBeTruthy();
    expect(pendingStatus?.getAttribute('aria-live')).toBe('polite');

    rerender(
      <ChromeHeader
        connected
        userInitial="J"
        seconds={9000}
        targetHours={8}
        isPending={false}
      />,
    );
    // ...and it is the SAME element that now carries the resolved figure —
    // AT only announces a mutation to an already-present live region, not
    // one inserted simultaneously with its content.
    const resolvedStatus = container.querySelector('[role="status"]');
    expect(resolvedStatus).toBe(pendingStatus);
    expect(resolvedStatus?.textContent).toContain('2.5');
  });

  it('disconnected: renders no figure and no live region (eyebrow + date only)', () => {
    const { container } = render(
      <ChromeHeader connected={false} userInitial={null} seconds={0} targetHours={8} isPending={false} />,
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(screen.getByText('Time Logger')).toBeTruthy();
  });
});
