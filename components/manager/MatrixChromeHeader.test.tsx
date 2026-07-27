import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MatrixChromeHeader } from './MatrixChromeHeader';

/**
 * Story 7.10, D-7.10-30: proves the REAL, unmocked `SectionTabs` composes
 * inside `MatrixChromeHeader` — the class of regression this epic keeps
 * getting burned by when a shared seam changes behind a mock.
 */
function baseProps() {
  return {
    cycleTitle: 'May 2026',
    onPrevCycle: vi.fn(),
    onNextCycle: vi.fn(),
    onApproveRemaining: vi.fn(),
  };
}

describe('MatrixChromeHeader — SectionTabs composition (Story 7.10)', () => {
  it('renders the real SectionTabs with Manager active and Week/Settings present', () => {
    render(
      <MatrixChromeHeader
        {...baseProps()}
        section="manager"
        onSectionChange={vi.fn()}
        showManagerTab
      />,
    );
    expect(screen.getByRole('button', { name: 'Week' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Manager' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('clicking Settings invokes onSectionChange with "settings" — real callback, not a mock of SectionTabs', () => {
    const onSectionChange = vi.fn();
    render(
      <MatrixChromeHeader
        {...baseProps()}
        section="manager"
        onSectionChange={onSectionChange}
        showManagerTab
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSectionChange).toHaveBeenCalledWith('settings');
  });
});
