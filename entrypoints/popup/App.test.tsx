import { readFileSync } from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuth = vi.fn();
const mockHasValidAuth = vi.fn();
const mockUseTodayTotal = vi.fn();
const mockUseResumeTicket = vi.fn();
const mockUseTicketSearch = vi.fn();
const mockUseTimeOffToday = vi.fn();
const mockUseOutboxState = vi.fn();
const postWorklogMock = vi.fn();
const deleteWorklogMock = vi.fn();
const setLastLoggedTicketMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const updateOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const runOutboxRetryPassMock = vi.fn(() => Promise.resolve({ drained: 0 }));

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
  useTodayTotal: (...args: unknown[]) => mockUseTodayTotal(...args),
}));

// Story 7.9: mocked at the hook level (same pattern as `useTodayTotal` /
// `useResumeTicket` above) so these tests drive `resolvePopupState`'s real
// precedence through controllable inputs, without a real week-query/outbox
// round-trip.
vi.mock('@/hooks/useTimeOffToday', () => ({
  useTimeOffToday: (...args: unknown[]) => mockUseTimeOffToday(...args),
}));
vi.mock('@/hooks/useOutboxState', () => ({
  useOutboxState: () => mockUseOutboxState(),
}));

// Story 7.3: resolved once in App.tsx and passed down as a prop — mocking
// the hook (rather than `ResumeCard` itself) lets these tests drive the
// REAL card through its resolved status, exactly like `mockUseTodayTotal`
// already does for the chrome figure.
vi.mock('@/hooks/useResumeTicket', () => ({
  useResumeTicket: () => mockUseResumeTicket(),
}));

// Story 7.4: `SearchPanel` renders for real in this file (only `TodayView`
// is stubbed below), so its own search-results hook needs the same
// controllable-mock treatment as `useResumeTicket` above — these tests only
// need to drive the WRITE path, never a real debounced Jira search.
vi.mock('@/hooks/useTicketSearch', () => ({
  useTicketSearch: (query: string) => mockUseTicketSearch(query),
}));

vi.mock('@/components/today/TodayView', () => ({
  TodayView: () => <div data-testid="today-view">Today Placeholder</div>,
}));

// PopupActionBar is real (proves the App → action bar → open-full-page
// wiring end to end) — its own PtoQuickAction internals need the same
// storage/network boundary mocks as PopupActionBar.test.tsx.
vi.mock('@/lib/pto', () => ({
  logFullDayPto: vi.fn(),
  logHalfDayPto: vi.fn(),
}));
vi.mock('@/lib/messages', () => ({ sendMessage: vi.fn() }));
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: vi.fn(async () => ({})),
  update: (...args: unknown[]) => updateOutboxMock(...args),
  runOutboxRetryPass: () => runOutboxRetryPassMock(),
  outboxItem: { getValue: vi.fn(async () => []), watch: vi.fn(() => () => {}) },
}));
vi.mock('@/components/today/PtoQuickAction', () => ({
  PtoQuickAction: () => <div data-testid="pto-quick-action" />,
}));

// The REAL `ResumeCard` renders here (driven via the mocked hook above), so
// its own storage/network boundary needs the same treatment as every other
// producer in this file. `@wxt-dev/storage`'s `defineItem` kicks off an
// unawaited background read the instant a module calls it — merely
// IMPORTING the real `lib/storage/last-logged` (as `ResumeCard.tsx` does)
// is enough to trigger it, so this must be mocked even though no test here
// drives a submission through the card.
vi.mock('@/lib/storage/last-logged', () => ({
  getLastLoggedTicket: vi.fn(async () => null),
  setLastLoggedTicket: (...args: unknown[]) => setLastLoggedTicketMock(...args),
}));
vi.mock('@/lib/jira-client', () => ({
  postWorklog: (...args: unknown[]) => postWorklogMock(...args),
  deleteWorklog: (...args: unknown[]) => deleteWorklogMock(...args),
}));

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
  mockGetAuth.mockResolvedValue(null);
  mockHasValidAuth.mockReturnValue(false);
  mockUseTodayTotal.mockReturnValue({ seconds: 0, isPending: false, isError: false });
  mockUseResumeTicket.mockReturnValue({ status: 'none' });
  mockUseTicketSearch.mockReturnValue({ kind: 'idle' });
  mockUseTimeOffToday.mockReturnValue({ seconds: 0, isPending: false, worklogs: [] });
  mockUseOutboxState.mockReturnValue({ pendingCount: 0, failed: [] });
  postWorklogMock.mockResolvedValue({ kind: 'ok', value: { id: 'wl-search-1', timeSpentSeconds: 3600 } });
  // @ts-expect-error minimal chrome stub
  globalThis.chrome = { runtime: { openOptionsPage: vi.fn(), getURL: vi.fn((path: string) => `chrome-extension://abc/${path}`) }, tabs: { create: vi.fn() } };
});

function stubConnected() {
  mockGetAuth.mockResolvedValue({ kind: 'oauth', access_token: 't' });
  mockHasValidAuth.mockReturnValue(true);
}

describe('App', () => {
  // ---- AC1: Tabs removed, only today's content renders ------------------
  it('renders no tab list / TabsTrigger anywhere, and WeekView/ManagerView are never rendered', async () => {
    stubConnected();
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(screen.queryByTestId('week-view')).toBeNull();
    expect(screen.queryByTestId('manager-view')).toBeNull();
    expect(screen.queryByText('Week')).toBeNull();
    expect(screen.queryByText('Manager')).toBeNull();
  });

  // Story 7.2 Finding 8 (nit): jsdom has no layout engine, so nothing in a
  // rendered-DOM test can observe the popup's fixed 380x560 dimensions — they
  // live purely in `styles/globals.css`. A source-level pin at least catches
  // a silent removal or edit of the scoped rule (the structural
  // one-scroll-region guarantee above is the part real DOM assertions CAN
  // cover).
  it('AC2: the 380x560 popup surface rule exists in styles/globals.css', () => {
    const css = readFileSync(
      path.resolve(process.cwd(), 'styles/globals.css'),
      'utf-8',
    );
    const match = css.match(/body\[data-surface=["']popup["']\]\s*{([^}]*)}/);
    expect(match).toBeTruthy();
    const body = match![1]!;
    expect(body).toMatch(/width:\s*380px/);
    expect(body).toMatch(/height:\s*560px/);
  });

  // ---- AC2: fixed surface, exactly one scroll region ---------------------
  it('the root is a column flex with exactly one overflow-y-auto scroll region', async () => {
    stubConnected();
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('flex');
    expect(root.className).toContain('flex-col');
    expect(root.className).toContain('overflow-hidden');

    // Story 7.2 Finding 7 (nit): broadened past the exact `overflow-y-auto`
    // class so a nested region introduced as `overflow-auto`,
    // `overflow-scroll`, or `overflow-y-scroll` would also be caught — the
    // AC's wording ("no nested scroll region exists anywhere") is broader
    // than the one class name the shell happens to use today.
    const scrollRegions = container.querySelectorAll(
      '[class*="overflow-y-auto"],[class*="overflow-auto"],[class*="overflow-scroll"],[class*="overflow-y-scroll"]',
    );
    expect(scrollRegions.length).toBe(1);
  });

  // ---- AC3: chrome header composition ------------------------------------
  it('the chrome header renders the date and a role="status" region', async () => {
    stubConnected();
    mockUseTodayTotal.mockReturnValue({ seconds: 9000, isPending: false, isError: false });
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    expect(container.querySelector('header')).toBeTruthy();
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  // ---- AC4: action bar ----------------------------------------------------
  it('renders both action-bar actions when connected; "Open week" opens the full page in a new tab', async () => {
    stubConnected();
    renderApp();
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    expect(screen.getByTestId('pto-quick-action')).toBeTruthy();
    const openWeek = screen.getByRole('button', { name: 'Open week review in a new tab' });
    fireEvent.click(openWeek);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://abc/fullpage.html?section=week',
    });
  });

  it('does NOT render the action bar in the disconnected state', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Connect to Jira' })).toBeTruthy();
    });
    expect(screen.queryByTestId('pto-quick-action')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open week review in a new tab' })).toBeNull();
  });

  // ---- AC5: no orphaned manager affordance -------------------------------
  it('no element with an accessible name matching /manager|matrix/i exists', async () => {
    stubConnected();
    renderApp();
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /manager|matrix/i })).toBeNull();
    expect(screen.queryByText(/manager|matrix/i)).toBeNull();
  });

  // ---- AC6: chrome paints before data resolves ---------------------------
  it('the date renders on the first render pass, before the auth/total promises settle', () => {
    // getAuth() never resolves within this test — proves the header does not
    // await it before its first paint.
    mockGetAuth.mockReturnValue(new Promise(() => {}));
    const { container } = renderApp();
    // Synchronous assertion — no `await`/`waitFor`.
    expect(container.querySelector('header')).toBeTruthy();
    const dateText = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date());
    expect(container.textContent).toContain(dateText);
  });

  // Story 7.9, AC5: the disconnected card's copy — heading "Connect to
  // Jira" (unchanged since 7.2), body, full-width "Sign in to Jira" CTA, and
  // the reassurance line.
  it('renders the disconnected fallback when not connected', async () => {
    renderApp();
    await waitFor(() => {
      expect(
        screen.getByText(
          'Sign in once with your KKP Jira account. The extension reads your assigned tickets and writes worklogs as you.',
        ),
      ).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Sign in to Jira' })).toBeTruthy();
    expect(
      screen.getByText('Nothing is sent anywhere except your Jira instance.'),
    ).toBeTruthy();
  });

  it('renders Today view when connected', async () => {
    stubConnected();
    renderApp();
    await waitFor(() => {
      expect(screen.getByTestId('today-view')).toBeTruthy();
    });
  });

  // ---- Story 7.3, AC1/AC5: the resume card's mount/collapse contract -----
  describe('resume card (Story 7.3)', () => {
    const READY_TICKET = {
      status: 'ready' as const,
      key: 'PROJ-1',
      summary: 'Fix the flaky checkout test',
      prefillSeconds: 9000,
      startedAt: new Date().toISOString(),
    };

    it('AC1: mounts as the first child of the scroll region and breaks the header baseline when status is "ready"', async () => {
      stubConnected();
      mockUseResumeTicket.mockReturnValue(READY_TICKET);
      const { container } = renderApp();
      await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());

      const main = container.querySelector('main')!;
      expect(main.className).toContain('-mt-[10px]');
      // The card (identified by its unique shadow-lift class) is the first
      // element inside <main>, above the (stubbed) TodayView.
      expect(main.firstElementChild?.querySelector('.shadow-lift')).toBeTruthy();
      const todayView = screen.getByTestId('today-view');
      const card = main.querySelector('.shadow-lift')!;
      expect(
        card.compareDocumentPosition(todayView) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('AC5: collapses to nothing with no history — no card, and <main> carries no -mt-[10px]', async () => {
      stubConnected();
      mockUseResumeTicket.mockReturnValue({ status: 'none' });
      const { container } = renderApp();
      await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());

      const main = container.querySelector('main')!;
      expect(main.className).not.toContain('-mt-[10px]');
      expect(main.querySelector('.shadow-lift')).toBeNull();
      // Finding 3: the two assertions above cannot tell "no card" apart from
      // "an empty reserved-space wrapper where the card would go" — D-7.3-1's
      // named deliverable is specifically "no reserved dead space". Story 7.4
      // (AC7 / D-7.4-23) closes the other half of this same AC: the resume
      // slot is no longer dead space at all — it is the search field,
      // promoted to primary. So <main>'s first child is now the REAL search
      // control (not an empty wrapper), immediately followed by TodayView.
      expect(main.children.length).toBe(2);
      expect(main.firstElementChild?.querySelector('[role="combobox"]')).toBeTruthy();
      expect(main.firstElementChild).not.toBe(screen.getByTestId('today-view'));
      expect(main.children[1]).toBe(screen.getByTestId('today-view').parentElement);
    });

    // ---- AC7 / D-7.4-23: Story 7.4 closes Story 7.3's carried-forward half ---
    it('AC7: promotes search to primary — first child, autofocused — when there is no resume history', async () => {
      stubConnected();
      mockUseResumeTicket.mockReturnValue({ status: 'none' });
      const { container } = renderApp();
      await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());

      const main = container.querySelector('main')!;
      const searchInput = main.firstElementChild!.querySelector(
        '[role="combobox"]',
      ) as HTMLInputElement;
      expect(searchInput).toBeTruthy();
      // `waitFor` rather than a bare synchronous assertion: the autofocus
      // fires from a `useEffect` one commit after the initial render, and
      // under load (e.g. the full suite running in parallel) that commit
      // can land a tick after `today-view` appears.
      await waitFor(() => expect(document.activeElement).toBe(searchInput));
    });

    it('renders search BELOW the resume card, not autofocused, when status is "ready"', async () => {
      stubConnected();
      mockUseResumeTicket.mockReturnValue({
        status: 'ready',
        key: 'PROJ-1',
        summary: 'Fix the flaky checkout test',
        prefillSeconds: 9000,
        startedAt: new Date().toISOString(),
      });
      const { container } = renderApp();
      await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());

      const main = container.querySelector('main')!;
      const card = main.querySelector('.shadow-lift')!;
      const searchInput = screen.getByRole('combobox');
      expect(
        card.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // The hour input (not search) still gets the hot-path autofocus here.
      expect(document.activeElement).not.toBe(searchInput);
    });

    it('renders a skeleton that shares the ready card\'s offset (Finding 5) while status is "loading"', async () => {
      stubConnected();
      mockUseResumeTicket.mockReturnValue({ status: 'loading' });
      const { container } = renderApp();
      await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());

      const main = container.querySelector('main')!;
      // Finding 5: the boolean is `resume.status !== 'none'`, not
      // `=== 'ready'` — the skeleton and the resolved card must share one
      // offset (and, per ResumeCard's skeleton shape, one height) so the
      // 'loading' → 'ready' transition never double-shifts the layout.
      expect(main.className).toContain('-mt-[10px]');
      expect(main.querySelector('.animate-skeleton')).toBeTruthy();
    });
  });
});
