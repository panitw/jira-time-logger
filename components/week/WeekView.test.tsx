import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { WeekView } from './WeekView';

describe('WeekView', () => {
  it('renders the heading with a valid weekOf', () => {
    render(<WeekView weekOf="2026-06-16" />);
    expect(screen.getByText('Week of Tue, Jun 16')).toBeTruthy();
  });

  it('renders placeholder hours', () => {
    render(<WeekView weekOf="2026-06-16" />);
    expect(screen.getByText('0h logged')).toBeTruthy();
  });

  it('handles invalid weekOf gracefully', () => {
    render(<WeekView weekOf="not-a-date" />);
    expect(screen.getByText('Week of Unknown week')).toBeTruthy();
    expect(screen.getByText('0h logged')).toBeTruthy();
  });

  it('renders without crashing for empty string', () => {
    const { container } = render(<WeekView weekOf="" />);
    expect(container).toBeTruthy();
  });
});