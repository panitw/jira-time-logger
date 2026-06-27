import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { ManagerView } from './ManagerView';

describe('ManagerView (placeholder)', () => {
  it('renders the heading and a body line', () => {
    render(<ManagerView cycle="2026-06" />);
    expect(screen.getByText('Manager')).toBeTruthy();
    expect(
      screen.getByText('The approval matrix for your reports will appear here.'),
    ).toBeTruthy();
  });

  it('accepts the cycle prop without throwing', () => {
    expect(() => render(<ManagerView cycle="2026-06-15" />)).not.toThrow();
  });
});
