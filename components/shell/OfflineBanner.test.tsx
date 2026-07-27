import { render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

function setOnLine(value: boolean | undefined): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('OfflineBanner (AC2, D-7.9-20, D-7.9-23)', () => {
  afterEach(() => {
    setOnLine(true);
  });

  it('is role="status" aria-live="polite" — NOT role="alert" (D-7.9-20)', () => {
    setOnLine(true);
    render(<OfflineBanner pendingCount={2} />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('role')).not.toBe('alert');
  });

  it('D-7.9-23: when navigator.onLine === false, the headline says "Offline"', () => {
    setOnLine(false);
    render(<OfflineBanner pendingCount={2} />);
    expect(screen.getByText('Offline — 2 entries queued')).toBeTruthy();
  });

  it('D-7.9-23: when navigator.onLine === true, the headline drops the word "Offline" (queue count only)', () => {
    setOnLine(true);
    render(<OfflineBanner pendingCount={2} />);
    expect(screen.getByText('2 entries queued')).toBeTruthy();
    expect(screen.queryByText(/Offline/)).toBeNull();
  });

  it('singularises "entry" for N=1', () => {
    setOnLine(false);
    render(<OfflineBanner pendingCount={1} />);
    expect(screen.getByText('Offline — 1 entry queued')).toBeTruthy();
  });

  it('states the "sync automatically" body line verbatim', () => {
    render(<OfflineBanner pendingCount={3} />);
    expect(
      screen.getByText("They'll sync to Jira automatically when you're back."),
    ).toBeTruthy();
  });

  it('renders exactly one aria-hidden WifiOff icon (svg), no LoaderCircle/spinner', () => {
    const { container } = render(<OfflineBanner pendingCount={1} />);
    const icons = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(icons.length).toBe(1);
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('carries NO self -mt-[10px] offset (D-7.9-16 — <main> is the sole owner; a child offset would be CLIPPED by overflow-y-auto, not overhung)', () => {
    const { container } = render(<OfflineBanner pendingCount={1} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('-mt-[10px]');
  });
});
