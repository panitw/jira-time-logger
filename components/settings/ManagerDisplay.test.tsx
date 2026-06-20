import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ManagerDisplay } from './ManagerDisplay';

describe('ManagerDisplay', () => {
  it('shows loading state', () => {
    render(
      <ManagerDisplay
        managerDisplayName={null}
        skipLevelDisplayName={null}
        loading={true}
        error={false}
      />,
    );
    expect(screen.getByText('Loading from Jira…')).toBeTruthy();
  });

  it('shows error state', () => {
    render(
      <ManagerDisplay
        managerDisplayName={null}
        skipLevelDisplayName={null}
        loading={false}
        error={true}
      />,
    );
    expect(screen.getByText('Could not load reporting line.')).toBeTruthy();
  });

  it('shows manager-not-set notice when both are null', () => {
    render(
      <ManagerDisplay
        managerDisplayName={null}
        skipLevelDisplayName={null}
        loading={false}
        error={false}
      />,
    );
    expect(
      screen.getAllByText(
        'Manager not set in Jira — please contact your admin to configure it for richer pre-fill suggestions.',
      ).length,
    ).toBe(2);
  });

  it('shows skip-level-not-set notice when manager is set but skip-level is null', () => {
    render(
      <ManagerDisplay
        managerDisplayName="Marco Rivera"
        skipLevelDisplayName={null}
        loading={false}
        error={false}
      />,
    );
    expect(screen.getByText('Marco Rivera')).toBeTruthy();
    expect(screen.getByText('Not set in Jira.')).toBeTruthy();
  });
});