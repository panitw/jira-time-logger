import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scan, criticalOrSerious } from '@/lib/test/axe';

const mockGetAuth = vi.fn();
const mockHasValidAuth = vi.fn();

vi.mock('@/lib/storage/tokens', () => ({
  getAuth: () => mockGetAuth(),
  hasValidAuth: (bundle: unknown) => mockHasValidAuth(bundle),
}));

vi.mock('@/lib/storage/settings', () => ({
  targetHoursItem: { getValue: async () => 8 },
  ptoSubtaskKeyItem: { getValue: async () => null },
  ptoSubtaskSummaryItem: { getValue: async () => null },
}));

vi.mock('@/hooks/useTodayTotal', () => ({
  useTodayTotal: () => ({ seconds: 9000, isPending: false, isError: false }),
}));

// Story 7.9: mocked directly here too (same "shell only" scope as
// `useTodayTotal` above) — this file's scans cover the chrome shell, not a
// full time-off/outbox data path.
vi.mock('@/hooks/useTimeOffToday', () => ({
  useTimeOffToday: () => ({ seconds: 0, isPending: false, worklogs: [] }),
}));
vi.mock('@/hooks/useOutboxState', () => ({
  useOutboxState: () => ({ pendingCount: 0, failed: [] }),
}));

const mockUseResumeTicket = vi.fn();
vi.mock('@/hooks/useResumeTicket', () => ({
  useResumeTicket: () => mockUseResumeTicket(),
}));

// Story 7.4: `SearchPanel` renders for real here too — controllable mock for
// its results hook, same seam `App.test.tsx` uses.
const mockUseTicketSearch = vi.fn();
vi.mock('@/hooks/useTicketSearch', () => ({
  useTicketSearch: (query: string) => mockUseTicketSearch(query),
}));

// Story 7.2 Finding 9 (nit): TodayView and PtoQuickAction are stubbed to bare
// divs below, so the scans in this file cover the CHROME SHELL ONLY (header,
// action bar, disconnected panel) — not the popup body a user actually sees.
// That is intentional (it keeps this suite fast and focused on what 7.2
// itself built), but it means AC8's "the axe gate stays at zero
// Critical/Serious on every surface" should be read as shell-scoped here,
// not full-popup-scoped. The real `TodayView` subtree has its own dedicated
// scan in `components/today/TodayView.test.tsx` ("a11y scan (Story 6.1
// AC1)"), which is the coverage for the body these mocks hollow out.
vi.mock('@/components/today/TodayView', () => ({
  TodayView: () => <div data-testid="today-view">Today Placeholder</div>,
}));

vi.mock('@/lib/pto', () => ({
  logFullDayPto: vi.fn(),
  logHalfDayPto: vi.fn(),
}));
vi.mock('@/lib/messages', () => ({ sendMessage: vi.fn() }));
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: vi.fn(async () => ({})),
  update: vi.fn(async () => {}),
  runOutboxRetryPass: vi.fn(async () => ({ drained: 0 })),
  outboxItem: { getValue: vi.fn(async () => []), watch: vi.fn(() => () => {}) },
}));
vi.mock('@/components/today/PtoQuickAction', () => ({
  PtoQuickAction: () => <div data-testid="pto-quick-action" />,
}));

// The REAL `ResumeCard` renders here — see the matching comment in
// `App.test.tsx` for why `lib/storage/last-logged` must be mocked even
// though no test drives an actual submission through the card.
vi.mock('@/lib/storage/last-logged', () => ({
  getLastLoggedTicket: vi.fn(async () => null),
  setLastLoggedTicket: vi.fn(async () => {}),
}));
vi.mock('@/lib/jira-client', () => ({ postWorklog: vi.fn() }));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { App } = await import('./App');

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseResumeTicket.mockReturnValue({ status: 'none' });
  mockUseTicketSearch.mockReturnValue({ kind: 'idle' });
  // @ts-expect-error minimal chrome stub
  globalThis.chrome = { runtime: { openOptionsPage: vi.fn(), getURL: vi.fn((path: string) => `chrome-extension://abc/${path}`) }, tabs: { create: vi.fn() } };
});

describe('Popup shell a11y (Story 7.2 AC8)', () => {
  it('connected popup has zero Critical/Serious axe violations', async () => {
    mockGetAuth.mockResolvedValue({ kind: 'oauth', access_token: 't' });
    mockHasValidAuth.mockReturnValue(true);
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });

  it('disconnected popup has zero Critical/Serious axe violations', async () => {
    mockGetAuth.mockResolvedValue(null);
    mockHasValidAuth.mockReturnValue(false);
    const { container } = renderApp();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connect to Jira' })).toBeTruthy(),
    );
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });

  // Story 7.3: the real ResumeCard mounted with a resolved ticket — zero
  // Critical/Serious, same gate as the rest of the shell.
  it('connected popup with the resume card mounted has zero Critical/Serious axe violations', async () => {
    mockGetAuth.mockResolvedValue({ kind: 'oauth', access_token: 't' });
    mockHasValidAuth.mockReturnValue(true);
    mockUseResumeTicket.mockReturnValue({
      status: 'ready',
      key: 'PROJ-1',
      summary: 'Fix the flaky checkout test',
      prefillSeconds: 9000,
      startedAt: new Date().toISOString(),
    });
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });

  // ---- Story 7.4, Task 9: extend the gate to both new SearchPanel states ---
  it('popup with search promoted to primary (no resume history) has zero Critical/Serious axe violations', async () => {
    mockGetAuth.mockResolvedValue({ kind: 'oauth', access_token: 't' });
    mockHasValidAuth.mockReturnValue(true);
    mockUseResumeTicket.mockReturnValue({ status: 'none' });
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    // AC7: promoted search is the FIRST child and autofocused.
    expect(container.querySelector('main')?.firstElementChild?.querySelector('[role="combobox"]')).toBeTruthy();
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });

  it('popup with search results open (combobox/listbox/option ARIA shape) has zero Critical/Serious axe violations', async () => {
    mockGetAuth.mockResolvedValue({ kind: 'oauth', access_token: 't' });
    mockHasValidAuth.mockReturnValue(true);
    mockUseResumeTicket.mockReturnValue({
      status: 'ready',
      key: 'PROJ-1',
      summary: 'Fix the flaky checkout test',
      prefillSeconds: 9000,
      startedAt: new Date().toISOString(),
    });
    mockUseTicketSearch.mockReturnValue({
      kind: 'results',
      items: [
        {
          issue: {
            id: '1',
            key: 'GAPI-330',
            fields: {
              summary: 'Payment gateway rollout',
              issuetype: { id: '1', name: 'Story', subtask: false },
              assignee: { accountId: 'other', displayName: 'Anucha P.' },
            },
          },
          assignment: 'other',
        },
        {
          issue: {
            id: '2',
            key: 'GAPI-331',
            fields: {
              summary: 'Fix the flaky checkout test',
              issuetype: { id: '2', name: 'Subtask', subtask: true },
              assignee: { accountId: 'me', displayName: 'Me' },
            },
          },
          assignment: 'you',
        },
      ],
      truncated: false,
    });
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'payment' } });
    expect(container.querySelector('ul[role="listbox"]')).toBeTruthy();
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });
});
