import { readFileSync } from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuth = vi.fn();
const mockHasValidAuth = vi.fn();
const mockUseTodayTotal = vi.fn();
const mockUseResumeTicket = vi.fn();

vi.mock('@/lib/storage/tokens', () => ({
  getAuth: () => mockGetAuth(),
  hasValidAuth: (bundle: unknown) => mockHasValidAuth(bundle),
}));

vi.mock('@/lib/storage/settings', () => ({
  targetHoursItem: { getValue: async () => 8 },
}));

vi.mock('@/hooks/useTodayTotal', () => ({
  useTodayTotal: (...args: unknown[]) => mockUseTodayTotal(...args),
}));

// Story 7.3: resolved once in App.tsx and passed down as a prop — mocking
// the hook (rather than `ResumeCard` itself) lets these tests drive the
// REAL card through its resolved status, exactly like `mockUseTodayTotal`
// already does for the chrome figure.
vi.mock('@/hooks/useResumeTicket', () => ({
  useResumeTicket: () => mockUseResumeTicket(),
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
vi.mock('@/lib/storage/outbox', () => ({ enqueue: vi.fn(async () => ({})) }));
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
  mockGetAuth.mockResolvedValue(null);
  mockHasValidAuth.mockReturnValue(false);
  mockUseTodayTotal.mockReturnValue({ seconds: 0, isPending: false, isError: false });
  mockUseResumeTicket.mockReturnValue({ status: 'none' });
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

  it('renders the disconnected fallback when not connected', async () => {
    renderApp();
    await waitFor(() => {
      expect(
        screen.getByText('Connect your Jira Cloud account to start logging time.'),
      ).toBeTruthy();
    });
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
      // named deliverable is specifically "no reserved dead space", and a
      // stray `<div className="mb-3" />` left in the wrapper's place would
      // satisfy both assertions above while still holding the gap open.
      // Assert the resume slot contributes NO element at all: <main>'s only
      // child is the (stubbed) TodayView.
      expect(main.children.length).toBe(1);
      expect(main.firstElementChild).toBe(screen.getByTestId('today-view'));
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
