import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { TodayView } from './TodayView';

describe('TodayView', () => {
  it('renders the heading', () => {
    render(<TodayView />);
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('renders the date placeholder text', () => {
    render(<TodayView />);
    expect(screen.getByText(/0h logged/)).toBeTruthy();
  });

  it('renders without crashing', () => {
    const { container } = render(<TodayView />);
    expect(container).toBeTruthy();
  });
});