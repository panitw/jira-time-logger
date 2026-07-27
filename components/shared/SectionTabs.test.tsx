import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SectionTabs } from './SectionTabs';

/**
 * Story 7.10, D-7.10-30: the ONE shared Week/Manager/Settings tab row now
 * consumed by all three full-page chrome headers. This file proves the
 * component itself, real and unmocked; each chrome header's own test file
 * proves it composes there too (also unmocked) — "verify each host
 * behaviourally not via mocks" per D-7.10-30.
 */
describe('SectionTabs', () => {
  it('renders Week and Settings, but hides Manager when showManager is false', () => {
    render(<SectionTabs active="week" onSelect={vi.fn()} showManager={false} />);
    expect(screen.getByRole('button', { name: 'Week' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Manager' })).toBeNull();
  });

  it('renders all three when showManager is true', () => {
    render(<SectionTabs active="week" onSelect={vi.fn()} showManager />);
    expect(screen.getByRole('button', { name: 'Week' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Manager' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('marks the active section with aria-current="page" and marks the others unset', () => {
    render(<SectionTabs active="manager" onSelect={vi.fn()} showManager />);
    expect(screen.getByRole('button', { name: 'Manager' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Week' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBeNull();
  });

  // Active is conveyed by more than colour (D-7.10-30): a distinct
  // background (`bg-surface`) and a distinct text colour (`text-primary`),
  // not merely a different shade of the same hue.
  it('the active tab carries a distinct background class, not just a text-colour change', () => {
    render(<SectionTabs active="settings" onSelect={vi.fn()} showManager={false} />);
    const active = screen.getByRole('button', { name: 'Settings' });
    const inactive = screen.getByRole('button', { name: 'Week' });
    expect(active.className).toMatch(/bg-surface/);
    expect(inactive.className).not.toMatch(/bg-surface\b/);
  });

  it('clicking a tab invokes onSelect with that section', () => {
    const onSelect = vi.fn();
    render(<SectionTabs active="week" onSelect={onSelect} showManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Manager' }));
    expect(onSelect).toHaveBeenCalledWith('manager');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSelect).toHaveBeenCalledWith('settings');
  });

  // EXPERIENCE.md:257-258 documents no exception to the ring-focus + 1.5px
  // border pairing (N-1) — this is PRECEDENT, not a documented exception:
  // WeekChromeHeader.tsx:112's pre-existing prev/next nav buttons already use
  // this identical ring-only pairing on this same chrome surface, and it is
  // compliant on merit (ring-white/60 measures 3.32:1+ against the gradient).
  // Pin that every tab button carries it, so a future edit can't drop it.
  it('every tab button carries the chrome focus-visible ring', () => {
    render(<SectionTabs active="week" onSelect={vi.fn()} showManager />);
    for (const name of ['Week', 'Manager', 'Settings']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/focus-visible:ring-white\/60/);
    }
  });
});
