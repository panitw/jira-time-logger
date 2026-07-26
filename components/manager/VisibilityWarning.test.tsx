import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VisibilityWarning } from './VisibilityWarning';

describe('VisibilityWarning', () => {
  it('renders nothing when restrictedCount is 0', () => {
    const { container } = render(
      <VisibilityWarning restrictedCount={0} personName="Sarah" epicKey="PROJ-A" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when restrictedCount is negative (defensive)', () => {
    const { container } = render(
      <VisibilityWarning restrictedCount={-1} personName="Sarah" epicKey="PROJ-A" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the singular "1 worklog" chip with "was", with no ⚠ text glyph (AC11)', () => {
    render(<VisibilityWarning restrictedCount={1} personName="Sarah" epicKey="PROJ-A" />);
    expect(
      screen.getByText(/1 worklog with restricted visibility was excluded from this view\./),
    ).toBeTruthy();
    expect(screen.queryByText(/⚠/)).toBeNull();
  });

  it('renders the plural "3 worklogs" chip with "were"', () => {
    render(<VisibilityWarning restrictedCount={3} personName="Sarah" epicKey="PROJ-A" />);
    expect(
      screen.getByText(/3 worklogs with restricted visibility were excluded from this view\./),
    ).toBeTruthy();
  });

  it('renders the EyeOff icon via the shared registry, not a raw lucide import', () => {
    const { container } = render(
      <VisibilityWarning restrictedCount={2} personName="Sarah" epicKey="PROJ-A" />,
    );
    expect(container.querySelector('svg.lucide-eye-off')).toBeTruthy();
  });

  it('carries the long-form explanatory message in title and aria-label', () => {
    render(<VisibilityWarning restrictedCount={2} personName="Sarah" epicKey="PROJ-A" />);
    const expected =
      "Sarah has worklogs with team-restricted visibility on this Epic that you don't have permission to see. This may make the totals appear lower than reality.";
    const el = screen.getByLabelText(expected);
    expect(el).toBeTruthy();
    expect(el.getAttribute('title')).toBe(expected);
  });
});
