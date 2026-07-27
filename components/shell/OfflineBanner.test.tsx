import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

function setOnLine(value: boolean | undefined): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

/** `onDiscardAll` is required; default it so the pre-existing cases below
 * keep asserting exactly what they always did. */
function renderBanner(
  props: { pendingCount: number; onDiscardAll?: () => void },
): ReturnType<typeof render> {
  return render(
    <OfflineBanner
      pendingCount={props.pendingCount}
      onDiscardAll={props.onDiscardAll ?? ((): void => {})}
    />,
  );
}

describe('OfflineBanner (AC2, D-7.9-20, D-7.9-23)', () => {
  afterEach(() => {
    setOnLine(true);
  });

  it('is role="status" aria-live="polite" — NOT role="alert" (D-7.9-20)', () => {
    setOnLine(true);
    renderBanner({ pendingCount: 2 });
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('role')).not.toBe('alert');
  });

  it('D-7.9-23: when navigator.onLine === false, the headline says "Offline"', () => {
    setOnLine(false);
    renderBanner({ pendingCount: 2 });
    expect(screen.getByText('Offline — 2 entries queued')).toBeTruthy();
  });

  it('D-7.9-23: when navigator.onLine === true, the headline drops the word "Offline" (queue count only)', () => {
    setOnLine(true);
    renderBanner({ pendingCount: 2 });
    expect(screen.getByText('2 entries queued')).toBeTruthy();
    expect(screen.queryByText(/Offline/)).toBeNull();
  });

  it('singularises "entry" for N=1', () => {
    setOnLine(false);
    renderBanner({ pendingCount: 1 });
    expect(screen.getByText('Offline — 1 entry queued')).toBeTruthy();
  });

  it('states the "sync automatically" body line verbatim', () => {
    renderBanner({ pendingCount: 3 });
    expect(
      screen.getByText("They'll sync to Jira automatically when you're back."),
    ).toBeTruthy();
  });

  it('renders exactly one aria-hidden status icon outside the discard button, no LoaderCircle/spinner', () => {
    // Was `=== 1` across the whole banner; the discard button legitimately
    // adds a second svg. Scoped to icons NOT inside a button so it still
    // catches a spinner or a day-status icon creeping into the message —
    // which is what the assertion was guarding.
    const { container } = renderBanner({ pendingCount: 1 });
    const statusIcons = [...container.querySelectorAll('svg[aria-hidden="true"]')].filter(
      (svg) => svg.closest('button') === null,
    );
    expect(statusIcons.length).toBe(1);
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('carries NO self -mt-[10px] offset (D-7.9-16 — <main> is the sole owner; a child offset would be CLIPPED by overflow-y-auto, not overhung)', () => {
    const { container } = renderBanner({ pendingCount: 1 });
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('-mt-[10px]');
  });
});

describe('OfflineBanner — discard queued entries', () => {
  afterEach(() => {
    setOnLine(true);
  });

  it('exposes the discard affordance by accessible name, counted and pluralised', () => {
    renderBanner({ pendingCount: 3 });
    expect(screen.getByRole('button', { name: 'Discard 3 entries' })).toBeTruthy();
  });

  it('singularises the discard label for N=1', () => {
    renderBanner({ pendingCount: 1 });
    expect(screen.getByRole('button', { name: 'Discard 1 entry' })).toBeTruthy();
  });

  it('does NOT discard on the first click — the trash arms an inline confirm', () => {
    const onDiscardAll = vi.fn();
    renderBanner({ pendingCount: 3, onDiscardAll });

    fireEvent.click(screen.getByRole('button', { name: 'Discard 3 entries' }));

    // The whole point of the two-step: queued time is unlogged work with no
    // undo, so one stray click must not destroy it.
    expect(onDiscardAll).not.toHaveBeenCalled();
    expect(screen.getByText('Discard 3 entries?')).toBeTruthy();
  });

  it('names the consequence in the confirm — the hours are deleted, not merely unsynced', () => {
    renderBanner({ pendingCount: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Discard 2 entries' }));
    expect(screen.getByText('This deletes the hours. Jira never receives them.')).toBeTruthy();
    // The reassuring "they'll sync automatically" line must not survive into
    // a prompt about deleting them.
    expect(screen.queryByText(/sync to Jira automatically/)).toBeNull();
  });

  it('fires onDiscardAll exactly once when the confirm is accepted', () => {
    const onDiscardAll = vi.fn();
    renderBanner({ pendingCount: 3, onDiscardAll });

    fireEvent.click(screen.getByRole('button', { name: 'Discard 3 entries' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onDiscardAll).toHaveBeenCalledTimes(1);
  });

  it('"Keep" cancels — no discard, and the banner returns to its resting copy', () => {
    const onDiscardAll = vi.fn();
    setOnLine(true);
    renderBanner({ pendingCount: 3, onDiscardAll });

    fireEvent.click(screen.getByRole('button', { name: 'Discard 3 entries' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

    expect(onDiscardAll).not.toHaveBeenCalled();
    expect(screen.getByText('3 entries queued')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discard 3 entries' })).toBeTruthy();
  });

  it('keeps role="status" aria-live="polite" while confirming (D-7.9-20 — never escalates to alert)', () => {
    renderBanner({ pendingCount: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Discard 2 entries' }));
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('role')).not.toBe('alert');
  });

  it('swaps contents in place — the confirm adds no -mt offset and no second box (D-7.9-16)', () => {
    const { container } = renderBanner({ pendingCount: 2 });
    const rootBefore = container.firstElementChild as HTMLElement;

    fireEvent.click(screen.getByRole('button', { name: 'Discard 2 entries' }));

    const rootAfter = container.firstElementChild as HTMLElement;
    expect(rootAfter).toBe(rootBefore);
    expect(rootAfter.className).not.toContain('-mt-[10px]');
    expect(container.children.length).toBe(1);
  });
});
