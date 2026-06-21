import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LoggedToday } from './LoggedToday';

describe('LoggedToday', () => {
  it('shows empty state when no entries', () => {
    render(<LoggedToday entries={[]} />);
    expect(
      screen.getByText('Nothing logged today yet. Pick a ticket below to start.'),
    ).toBeTruthy();
  });

  it('renders entries with key, summary, and hours', () => {
    render(
      <LoggedToday
        entries={[
          { key: 'PROJ-1', summary: 'Fix bug', hoursDisplay: '2.5h', started: '2026-06-21', seconds: 9000 },
          { key: 'PROJ-2', summary: 'Review', hoursDisplay: '0.5h', started: '2026-06-21', seconds: 1800 },
        ]}
      />,
    );
    expect(screen.getByText('PROJ-1')).toBeTruthy();
    expect(screen.getByText('Fix bug')).toBeTruthy();
    expect(screen.getByText('2.5h')).toBeTruthy();
    expect(screen.getByText('PROJ-2')).toBeTruthy();
    expect(screen.getByText('0.5h')).toBeTruthy();
  });

  it('renders heading "Logged today"', () => {
    render(<LoggedToday entries={[]} />);
    expect(screen.getByText('Logged today')).toBeTruthy();
  });
});
