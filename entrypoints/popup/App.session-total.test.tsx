import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Story 7.2 Finding 1 (Major): the original double-count guard test
 * (`hooks/useTodayTotal.test.tsx`) only ever rerendered the hook with a new
 * `sessionSeconds` prop against a stable query key — a mutation that can
 * never trigger a TanStack Query refetch on its own — so
 * `expect(fetchByIssueMock).toHaveBeenCalledTimes(1)` there is a fact about
 * React, not a guard against the hazard. The reviewer proved this by
 * injecting the forbidden `invalidateQueries({ queryKey: ['week-worklogs'] })`
 * directly into `TodayView.handleLogged` and finding the whole 988-test suite
 * still green.
 *
 * This file drives the REAL composition root instead of a hand-rolled
 * harness: the real `entrypoints/popup/App.tsx` mounts the real `TodayView`
 * and the real `useTodayTotal`, wired exactly as production wires them, with
 * a `QueryClient` configured with the exact same `staleTime` /
 * `refetchOnWindowFocus` / `refetchOnReconnect` options as
 * `entrypoints/popup/main.tsx`. Only the storage/network BOUNDARY is mocked
 * (same seam `TodayView.test.tsx` and `entrypoints/popup/App.test.tsx` use) —
 * `PtoQuickAction` is stubbed out because Finding 1 is about the ticket-log
 * path, not the PTO path (Finding 3 covers PTO separately).
 *
 * The mock for `fetchCurrentUserWeekWorklogsByIssue` returns the pre-log
 * server total on its first call and the POST-log total (as a real backend
 * would report once the write landed) on any subsequent call. Logging an
 * entry through the real UI does not, today, cause a second call — if a
 * future change adds `invalidateQueries(['week-worklogs', …])` anywhere
 * reachable from `TodayView.handleLogged`, a second fetch WOULD fire, the
 * mock WOULD return the inflated total, and the assertion below goes red.
 */

vi.mock('@/lib/storage/tokens', () => ({
  getAuth: vi.fn(async () => ({ kind: 'oauth', access_token: 't' })),
  hasValidAuth: () => true,
}));

vi.mock('@/lib/storage/settings', () => ({
  targetHoursItem: { getValue: vi.fn(async () => 8) },
  catchAllProjectKeyItem: { getValue: vi.fn(async () => 'KNP') },
  approvalCycleItem: { getValue: vi.fn(async () => 'calendar-month') },
  // Story 7.3: `useResumeTicket` reads this to exclude the PTO subtask from
  // its week-worklog enrichment (D-7.3-12). `null` = not configured, so
  // nothing is excluded in this file's fixtures.
  ptoSubtaskKeyItem: { getValue: vi.fn(async () => null) },
}));

// Story 7.3: the resume card's data seam. `getLastLoggedTicket` resolves to
// `null` by default so `useResumeTicket` falls through to its free
// week-scan enrichment (the same `PROJ-9` worklog `useTodayTotal` already
// consumes) — the resume card genuinely mounts in this file's real
// composition root, which is exactly what the new guard test below needs.
const getLastLoggedTicketMock = vi.fn(async () => null as unknown);
const setLastLoggedTicketMock = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/lib/storage/last-logged', () => ({
  getLastLoggedTicket: () => getLastLoggedTicketMock(),
  setLastLoggedTicket: (...args: unknown[]) => setLastLoggedTicketMock(...args),
}));

vi.mock('@/components/today/PtoQuickAction', () => ({
  PtoQuickAction: () => <div data-testid="pto-quick-action" />,
}));

vi.mock('@/hooks/useHierarchyTickets', () => ({
  useHierarchyTickets: () => ({
    data: [
      {
        key: 'PROJ-1',
        summary: 'Alpha task',
        assigneeDisplayName: 'Test User',
        source: 'self',
        subtasks: [
          { key: 'PROJ-2', summary: 'Fix button', assigneeDisplayName: 'Test User' },
        ],
      },
    ],
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

vi.mock('@/lib/ticket-search', () => ({
  searchTickets: vi.fn(async () => ({ kind: 'ok', value: [] })),
}));

vi.mock('@/lib/create-subtask', () => ({
  createSubtask: vi.fn(async () => ({
    kind: 'ok',
    value: { id: '1', key: 'PROJ-999', summary: 'New sub' },
  })),
}));

vi.mock('@/lib/catch-all', () => ({
  fetchCatchAllSubtasks: vi.fn(async () => ({ kind: 'ok', value: [] })),
}));

vi.mock('@/lib/messages', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('@/lib/storage/outbox', () => ({
  enqueue: vi.fn(async () => ({})),
  remove: vi.fn(async () => {}),
  update: vi.fn(async () => {}),
  runOutboxRetryPass: vi.fn(async () => ({ drained: 0 })),
  outboxItem: {
    getValue: vi.fn(async () => []),
    setValue: vi.fn(async () => {}),
    watch: vi.fn(() => () => {}),
  },
  outboxDrainedItem: {
    getValue: vi.fn(async () => 0),
    setValue: vi.fn(async () => {}),
    watch: vi.fn(() => () => {}),
  },
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const fetchByIssueMock = vi.fn();
const postWorklogMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  fetchCurrentUserWeekWorklogsByIssue: (...args: unknown[]) => fetchByIssueMock(...args),
  postWorklog: (...args: unknown[]) => postWorklogMock(...args),
  updateWorklog: vi.fn(),
  deleteWorklog: vi.fn(),
}));

const { App } = await import('./App');

function todayIsoAt(hours: number): string {
  const d = new Date();
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
}

const PRE_LOG_WORKLOGS = [
  {
    key: 'PROJ-9',
    summary: 'Existing',
    worklogs: [{ id: 'wl-existing', timeSpentSeconds: 3600, started: todayIsoAt(9) }],
  },
];

// What a real backend would report AFTER the 2h entry logged below has been
// persisted — used to expose the hazard if a refetch ever fires.
const POST_LOG_WORKLOGS = [
  {
    key: 'PROJ-9',
    summary: 'Existing',
    worklogs: [
      { id: 'wl-existing', timeSpentSeconds: 3600, started: todayIsoAt(9) },
      { id: 'wl-2', timeSpentSeconds: 7200, started: todayIsoAt(10) },
    ],
  },
];

function renderApp() {
  // Mirrors entrypoints/popup/main.tsx's QueryClient options exactly — the
  // guard's documented preconditions (staleTime, refetchOnWindowFocus,
  // refetchOnReconnect — Story 7.2 Finding 6) only mean something if this
  // test actually uses them, rather than a bare `{ retry: false }` client.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

function figureText(container: HTMLElement): string {
  return container.querySelector('[role="status"] p')?.textContent ?? '';
}

describe('App — session total double-count guard (Story 7.2, Finding 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchByIssueMock.mockReset();
    let calls = 0;
    fetchByIssueMock.mockImplementation(async () => {
      calls += 1;
      return { kind: 'ok', value: calls === 1 ? PRE_LOG_WORKLOGS : POST_LOG_WORKLOGS };
    });
    postWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-2', timeSpentSeconds: 7200 },
    });
    // @ts-expect-error minimal chrome stub
    globalThis.chrome = { runtime: { openOptionsPage: vi.fn() }, tabs: { create: vi.fn() } };
  });

  it('logging an entry does not double-count — the header shows server + session exactly once', async () => {
    const { container } = renderApp();

    // Initial server-only total: 3600s = 1.0h.
    await waitFor(() => expect(figureText(container)).toMatch(/^1\.0/));

    // Real TicketPicker → QuickLogForm flow (mirrors TodayView.test.tsx).
    fireEvent.click(screen.getByLabelText('Pick PROJ-2: Fix button'));
    await waitFor(() => expect(screen.getByLabelText('Hours')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2h' } });
    fireEvent.click(screen.getByText('Log'));

    // Correct additive total: 3600 (server, unchanged) + 7200 (session) =
    // 10800s = 3.0h. If a future change adds invalidation reachable from
    // `handleLogged`, the second fetch returns POST_LOG_WORKLOGS (10800
    // server-side) and the header would show 10800 + 7200 = 18000s = 5.0h —
    // this assertion is what catches that.
    await waitFor(() => expect(figureText(container)).toMatch(/^3\.0/), {
      timeout: 1000,
    });

    // Direct confirmation: the week query was fetched exactly once.
    expect(fetchByIssueMock).toHaveBeenCalledTimes(1);
  });

  // ---- Story 7.3: the resume card composes over the SAME week-worklogs
  // query (D-7.3-2) — a log made through the card must be exactly as
  // additive as one made through TicketPicker/QuickLogForm, and must not
  // add a second fetch. `getLastLoggedTicketMock` resolves `null` (its file-
  // level default), so `useResumeTicket` resolves the resume ticket from
  // the free week-scan alone: `PROJ-9`, the same issue `useTodayTotal`
  // already sums into the initial 1.0h.
  it('a resume-card log does not double-count either — the header stays additive and the week query is fetched exactly once', async () => {
    postWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-resume-1', timeSpentSeconds: 5400 },
    });

    const { container } = renderApp();

    // Initial server-only total: 3600s = 1.0h (PROJ-9's existing worklog).
    await waitFor(() => expect(figureText(container)).toMatch(/^1\.0/));

    // The resume card auto-resolved PROJ-9 from the free week scan.
    const resumeInput = await screen.findByLabelText('Hours for PROJ-9');
    fireEvent.change(resumeInput, { target: { value: '1.5' } });
    fireEvent.keyDown(resumeInput, { key: 'Enter' });

    await waitFor(() => expect(postWorklogMock).toHaveBeenCalledWith('PROJ-9', {
      timeSpentSeconds: 5400,
      started: expect.any(String),
    }));

    // Correct additive total: 3600 (server, unchanged) + 5400 (session) =
    // 9000s = 2.5h — NOT 3600 (server) + 5400 (session) + 5400 (a phantom
    // refetch double-counting the just-posted write) = 3.5h.
    await waitFor(() => expect(figureText(container)).toMatch(/^2\.5/), {
      timeout: 1000,
    });

    // The week query was fetched exactly once — shared by useTodayTotal AND
    // useResumeTicket, and never invalidated after the post.
    expect(fetchByIssueMock).toHaveBeenCalledTimes(1);
    // The resume card's own write path stamped the data seam.
    expect(setLastLoggedTicketMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'PROJ-9', seconds: 5400 }),
    );
  });
});
