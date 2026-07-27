import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';

// ManagerView now renders the real ManagerMatrix; mock the data hooks so the
// component tree mounts without touching the network.
vi.mock('@/hooks/useManagerReports', () => ({
  useManagerReports: () => ({ isPending: false, isError: false, data: [] }),
}));
// ManagerMatrix (Story 5.6) resolves the current manager's accountId for the
// approve `by` field; mock it so the matrix never hits the network.
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ isPending: false, isError: false, data: 'mgr-1' }),
}));
vi.mock('@/hooks/useManagerRow', () => ({
  useManagerRow: () => ({
    isPending: true,
    isError: false,
    isSuccess: false,
    data: undefined,
    refetch: vi.fn(),
  }),
}));
// ManagerMatrix (Story 5.4) reads `targetHours` from settings in a `useEffect`;
// mock the storage boundary so the async `getValue()` resolves cleanly instead
// of hitting the unmocked `@wxt-dev/storage` chrome API.
vi.mock('@/lib/storage/settings', () => ({
  targetHoursItem: { getValue: () => Promise.resolve(8) },
}));
// ManagerMatrix also fetches approvals per Epic; with no rows resolved this is
// never invoked, but mock it defensively so the matrix never touches the parser.
vi.mock('@/hooks/useEpicApprovals', () => ({
  useEpicApprovals: () => ({ data: [], isError: false, isPending: false }),
}));

const { ManagerView } = await import('./ManagerView');

function renderView(props: React.ComponentProps<typeof ManagerView>) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ManagerView {...props} />
    </QueryClientProvider>,
  );
}

describe('ManagerView', () => {
  const sectionProps = {
    section: 'manager' as const,
    onSectionChange: () => {},
    showManagerTab: true,
  };

  it('renders the matrix (cycle title) instead of the old placeholder', () => {
    renderView({ cycle: '2026-06', onSwitchToToday: () => {}, ...sectionProps });
    expect(screen.getByText(/June 2026/)).toBeTruthy();
    expect(
      screen.queryByText('The approval matrix for your reports will appear here.'),
    ).toBeNull();
  });

  it('accepts the cycle prop without throwing', () => {
    expect(() =>
      renderView({ cycle: '2026-06-15', onSwitchToToday: () => {}, ...sectionProps }),
    ).not.toThrow();
  });
});
