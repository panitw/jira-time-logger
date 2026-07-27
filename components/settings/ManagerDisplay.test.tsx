import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ManagerDisplay } from './ManagerDisplay';

/**
 * Retargeted for Story 7.10 / AC7 (was a plain-text section; now a
 * two-row hairline fact table with skeleton / value / faint-"not set" /
 * honest-failure branches). Old copy ("Loading from Jira…", "Could not load
 * reporting line.", "Manager not set in Jira — please contact your
 * admin…") is retired — this component no longer renders an error-styled
 * red message, per AC7.
 */
describe('ManagerDisplay', () => {
  it('shows skeleton placeholders while loading, not text', () => {
    const { container } = render(
      <ManagerDisplay
        managerDisplayName={null}
        skipLevelDisplayName={null}
        loading={true}
        error={false}
        onRetry={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('.animate-skeleton').length).toBe(2);
    expect(screen.getByText('Manager')).toBeTruthy();
    expect(screen.getByText('Skip-level')).toBeTruthy();
  });

  it('shows the honest-failure state with a consequence line and a Try again action, no red text', () => {
    const { container } = render(
      <ManagerDisplay
        managerDisplayName={null}
        skipLevelDisplayName={null}
        loading={false}
        error={true}
        onRetry={vi.fn()}
      />,
    );
    // M-7: BOTH rows render the honest-failure value (no 2 → 1 → 2 shift).
    expect(screen.getAllByText("Couldn't read this from Jira").length).toBe(2);
    expect(
      screen.getByText('Approvals still work — your manager finds you from their side.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/state-danger|status-error/);
  });

  it('the Skip-level row still renders in the error state (M-7: no 2 → 1 → 2 layout shift)', () => {
    render(
      <ManagerDisplay
        managerDisplayName={null}
        skipLevelDisplayName={null}
        loading={false}
        error={true}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText('Manager')).toBeTruthy();
    expect(screen.getByText('Skip-level')).toBeTruthy();
    expect(screen.getAllByText("Couldn't read this from Jira").length).toBe(2);
  });

  it('Try again re-invokes the retry callback', () => {
    const onRetry = vi.fn();
    render(
      <ManagerDisplay
        managerDisplayName={null}
        skipLevelDisplayName={null}
        loading={false}
        error={true}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders "Not set in Jira" as a normal (faint) value, not an error, when both are unset', () => {
    render(
      <ManagerDisplay
        managerDisplayName={null}
        skipLevelDisplayName={null}
        loading={false}
        error={false}
        onRetry={vi.fn()}
      />,
    );
    const values = screen.getAllByText('Not set in Jira');
    expect(values.length).toBe(2);
    // Finding 14: the original test never inspected a class, so rendering
    // "Not set in Jira" in `text-state-danger` — an ERROR treatment, the
    // one thing AC7 forbids for a genuinely-unset value — was GREEN. Every
    // instance must be `text-faint` and none may carry a danger class.
    for (const value of values) {
      expect(value.className).toMatch(/text-faint/);
      expect(value.className).not.toMatch(/state-danger|status-error/);
    }
  });

  it('shows the resolved manager name and "Not set in Jira" for a still-unset skip-level', () => {
    render(
      <ManagerDisplay
        managerDisplayName="Marco Rivera"
        skipLevelDisplayName={null}
        loading={false}
        error={false}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText('Marco Rivera')).toBeTruthy();
    expect(screen.getAllByText('Not set in Jira').length).toBe(1);
  });

  // D-7.10-43: font-mono is REMOVED, not swapped to `tabular` — a person's
  // name is not a numeric.
  it('does not render a resolved manager name with font-mono or tabular classes', () => {
    render(
      <ManagerDisplay
        managerDisplayName="Marco Rivera"
        skipLevelDisplayName="Dana Skip"
        loading={false}
        error={false}
        onRetry={vi.fn()}
      />,
    );
    const nameNode = screen.getByText('Marco Rivera');
    expect(nameNode.className).not.toMatch(/font-mono|tabular/);
  });
});
