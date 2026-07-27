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

  // --- Story 7.9, AC5: the disconnected chrome adds the "Not connected" note
  it('AC5: disconnected chrome shows "Not connected to Jira" — no figure, no bar, no live region', () => {
    const { container } = render(
      <ChromeHeader connected={false} userInitial={null} seconds={0} targetHours={8} isPending={false} />,
    );
    expect(screen.getByText('Not connected to Jira')).toBeTruthy();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('.animate-skeleton')).toBeNull();
  });

  it('AC5: the "Not connected to Jira" note does NOT render while connected', () => {
    render(
      <ChromeHeader connected userInitial="J" seconds={0} targetHours={8} isPending={false} />,
    );
    expect(screen.queryByText('Not connected to Jira')).toBeNull();
  });

  // --- Story 7.6: the progress note now routes through DayStatusIndicator --

  it('the progress note now carries an icon (AC3) — the popup used to have none', () => {
    const { container } = render(
      <ChromeHeader connected userInitial="J" seconds={8 * 3600} targetHours={8} isPending={false} />,
    );
    const status = container.querySelector('[role="status"]') as HTMLElement;
    // Two aria-hidden decorations live in the region: the bar and the note's icon.
    const decorations = status.querySelectorAll('[aria-hidden="true"]');
    expect(decorations.length).toBeGreaterThanOrEqual(2);
  });

  it('at/above target uses the same translucent-white chrome tone as every other status (D-7.6-40, correcting D-7.6-39\'s "met"-only on-chrome exception)', () => {
    const { container } = render(
      <ChromeHeader connected userInitial="J" seconds={8 * 3600} targetHours={8} isPending={false} />,
    );
    expect(screen.getByText('Target met — 8h logged')).toBeTruthy();
    const noteSpans = container.querySelectorAll('p > span');
    const rootClass = noteSpans[noteSpans.length - 1]?.className ?? '';
    expect(rootClass).toContain('text-white/85');
    expect(rootClass).not.toContain('text-status-clean-on-chrome');
  });

  it('below target uses the translucent-white chrome default, not status-clean', () => {
    const { container } = render(
      <ChromeHeader connected userInitial="J" seconds={2 * 3600} targetHours={8} isPending={false} />,
    );
    expect(screen.getByText('6h to go today')).toBeTruthy();
    const noteSpans = container.querySelectorAll('p > span');
    const rootClass = noteSpans[noteSpans.length - 1]?.className ?? '';
    expect(rootClass).toContain('text-white/85');
    expect(rootClass).not.toContain('text-status-clean');
  });

  // --- Story 7.9, Obligation 1: the Math.round quantisation defect dies here.
  // Migrated onto `lib/progress-width.ts` (Math.floor + non-zero floor).
  it('Obligation 1: 97.6% of target no longer renders a FULL bar (the old Math.round defect)', () => {
    // 28100 / 28800 = 97.569% — Math.round would map this to index 20
    // ("w-full", reads "done"); Math.floor + non-zero floor maps it to
    // index 19 ("w-[95%]").
    const { container } = render(
      <ChromeHeader connected userInitial="J" seconds={28100} targetHours={8} isPending={false} />,
    );
    const status = container.querySelector('[role="status"]') as HTMLElement;
    const fill = [...status.querySelectorAll('div')].find(
      (el) => el.className.includes('bg-white') && !el.className.includes('bg-white/20'),
    );
    expect(fill?.className).toContain('w-[95%]');
    expect(fill?.className).not.toContain('w-full');
  });

  it('Obligation 1: 2.4% of target no longer renders an EMPTY bar (the old Math.round defect)', () => {
    // 700 / 28800 = 2.43% — Math.round would map this to index 0 ("w-0",
    // reads "nothing logged" after an hour was logged); Math.floor + the
    // non-zero floor maps any genuinely non-zero percentage to at least
    // index 1 ("w-[5%]").
    const { container } = render(
      <ChromeHeader connected userInitial="J" seconds={700} targetHours={8} isPending={false} />,
    );
    const status = container.querySelector('[role="status"]') as HTMLElement;
    const fill = [...status.querySelectorAll('div')].find(
      (el) => el.className.includes('bg-white') && !el.className.includes('bg-white/20'),
    );
    expect(fill?.className).toContain('w-[5%]');
    expect(fill?.className).not.toContain('w-0');
  });

  it('an explicit `status` prop overrides the derived met/partial/attention (7.9 seam)', () => {
    const { container } = render(
      <ChromeHeader
        connected
        userInitial="J"
        seconds={2 * 3600}
        targetHours={8}
        isPending={false}
        status="time-off"
      />,
    );
    // The note text is still the header's own copy (label overrides the
    // default STATUS_LABEL) — only icon/colour come from `status`.
    expect(screen.getByText('6h to go today')).toBeTruthy();
    const noteSpans = container.querySelectorAll('p > span');
    expect(noteSpans[noteSpans.length - 1]?.className).toContain('text-white/85');
  });
});
