import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Story 7.4 Finding 1 / D-7.4-15: the reviewer's core objection was that
 * `TicketPicker.test.tsx:23` mocks `@/lib/ticket-search` WHOLESALE, so no
 * test in this repo could ever see what JQL string actually reaches Jira
 * from `TicketPicker`'s own search path — the widened D-7.4-13 JQL leaked
 * through that exact blind spot.
 *
 * This file does the opposite: it lets the REAL `lib/ticket-search.ts` run
 * and mocks only the network boundary (`jiraGet`), so the request URL
 * `TicketPicker`'s search actually sends is directly observable. The
 * assertion is that it is byte-identical to what `dfccf5a` sent — proving
 * `TicketPicker` never opted in to D-7.4-13's widening.
 */

const jiraGetMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  jiraGet: (...args: unknown[]) => jiraGetMock(...args),
}));

vi.mock('@/hooks/useHierarchyTickets', () => ({
  useHierarchyTickets: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/lib/storage/pinned-tickets', () => ({
  getPinnedTickets: vi.fn(async () => []),
  addPinnedTicket: vi.fn(async () => {}),
  removePinnedTicket: vi.fn(async () => {}),
}));

vi.mock('@/lib/create-subtask', () => ({
  createSubtask: vi.fn(),
}));

vi.mock('@/lib/catch-all', () => ({
  fetchCatchAllSubtasks: vi.fn(async () => ({ kind: 'ok', value: [] })),
}));

vi.mock('@/lib/storage/settings', () => ({
  catchAllProjectKeyItem: { getValue: vi.fn(async () => '') },
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { TicketPicker } = await import('./TicketPicker');

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TicketPicker — the JQL actually reaching jiraGet (D-7.4-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jiraGetMock.mockResolvedValue({ kind: 'ok', value: { issues: [] } });
  });

  it('sends the byte-identical dfccf5a request URL — never the D-7.4-13 widened JQL', async () => {
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    fireEvent.click(screen.getByText('+ Search Jira for a ticket…'));
    const input = screen.getByPlaceholderText('Type a ticket key (e.g., OTHER-789) or text');
    fireEvent.change(input, { target: { value: 'auth review' } });

    await waitFor(() => expect(jiraGetMock).toHaveBeenCalled(), { timeout: 1000 });

    const calledPath = jiraGetMock.mock.calls[0]![0] as string;
    const DFCCF5A_MAX_RESULTS = 20;
    const dfccf5aJql = 'summary ~ "auth review" AND statusCategory != Done AND updated >= -28d';
    const dfccf5aFields = 'key,summary';
    const dfccf5aUrl = `rest/api/3/search/jql?jql=${encodeURIComponent(
      dfccf5aJql,
    )}&maxResults=${DFCCF5A_MAX_RESULTS}&fields=${encodeURIComponent(dfccf5aFields)}`;

    expect(calledPath).toBe(dfccf5aUrl);
    // Explicitly rule out the D-7.4-13 widened branch reaching this path.
    expect(calledPath).not.toContain('text%20~');
    expect(calledPath).not.toContain(encodeURIComponent('issuetype'));
  });

  it('a ticket-key query also stays byte-identical to dfccf5a (fields=key,summary)', async () => {
    renderWithProviders(<TicketPicker onSelect={vi.fn()} />);

    fireEvent.click(screen.getByText('+ Search Jira for a ticket…'));
    const input = screen.getByPlaceholderText('Type a ticket key (e.g., OTHER-789) or text');
    fireEvent.change(input, { target: { value: 'OTHER-789' } });

    await waitFor(() => expect(jiraGetMock).toHaveBeenCalled(), { timeout: 1000 });

    const calledPath = jiraGetMock.mock.calls[0]![0] as string;
    const dfccf5aUrl = `rest/api/3/search/jql?jql=${encodeURIComponent(
      'key = "OTHER-789"',
    )}&maxResults=20&fields=${encodeURIComponent('key,summary')}`;
    expect(calledPath).toBe(dfccf5aUrl);
  });
});
