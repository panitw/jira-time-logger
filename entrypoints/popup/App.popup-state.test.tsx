import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Story 7.9, Task 9 — App-level integration tests for the popup-state
 * derivation (AC6), Obligation 2 (`breaksHeaderBaseline`), D-7.3-9 (the
 * resume card's frozen identity survives a banner mounting above it), AC2's
 * hot path, AC5's "no dead UI", and D-7.9-26/14's frozen time-off body
 * (Trap 2). Mirrors `App.test.tsx`'s hook-mocking strategy — the REAL
 * `ResumeCard`/`SearchPanel` render, driven through controllable hooks.
 */

const mockGetAuth = vi.fn();
const mockHasValidAuth = vi.fn();
const mockUseTodayTotal = vi.fn();
const mockUseResumeTicket = vi.fn();
const mockUseTicketSearch = vi.fn();
const mockUseTimeOffToday = vi.fn();
const mockUseOutboxState = vi.fn();
const postWorklogMock = vi.fn();
const deleteWorklogMock = vi.fn();
const enqueueOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve({}));
const setLastLoggedTicketMock = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock('@/lib/storage/tokens', () => ({
  getAuth: () => mockGetAuth(),
  hasValidAuth: (bundle: unknown) => mockHasValidAuth(bundle),
}));

vi.mock('@/lib/storage/settings', () => ({
  targetHoursItem: { getValue: async () => 8 },
  ptoSubtaskKeyItem: { getValue: async () => 'KNP-99' },
  ptoSubtaskSummaryItem: { getValue: async () => 'PTO' },
}));

vi.mock('@/hooks/useTodayTotal', () => ({
  useTodayTotal: (...args: unknown[]) => mockUseTodayTotal(...args),
}));
vi.mock('@/hooks/useResumeTicket', () => ({
  useResumeTicket: () => mockUseResumeTicket(),
}));
vi.mock('@/hooks/useTicketSearch', () => ({
  useTicketSearch: (query: string) => mockUseTicketSearch(query),
}));
vi.mock('@/hooks/useTimeOffToday', () => ({
  useTimeOffToday: (...args: unknown[]) => mockUseTimeOffToday(...args),
}));
vi.mock('@/hooks/useOutboxState', () => ({
  useOutboxState: () => mockUseOutboxState(),
}));

vi.mock('@/components/today/TodayView', () => ({
  TodayView: () => <div data-testid="today-view">Today Placeholder</div>,
}));

// A richer PtoQuickAction stub than App.test.tsx's bare div — this file
// needs to simulate a mid-session time-off post (Trap 2) without driving
// the real mutation/network path.
vi.mock('@/components/today/PtoQuickAction', () => ({
  PtoQuickAction: ({ onLogged }: { onLogged: (e: unknown) => void }) => (
    <button
      type="button"
      data-testid="pto-quick-action"
      onClick={() =>
        onLogged({
          key: 'KNP-99',
          summary: 'PTO',
          hoursDisplay: '8h',
          started: '2026-07-27',
          seconds: 28800,
          worklogId: 'wl-session-pto-1',
        })
      }
    >
      Mark today as time off
    </button>
  ),
}));

vi.mock('@/lib/pto', () => ({ logFullDayPto: vi.fn(), logHalfDayPto: vi.fn() }));
vi.mock('@/lib/messages', () => ({ sendMessage: vi.fn() }));
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: (...args: unknown[]) => enqueueOutboxMock(...args),
  update: vi.fn(async () => {}),
  runOutboxRetryPass: vi.fn(async () => ({ drained: 0 })),
  outboxItem: { getValue: vi.fn(async () => []), watch: vi.fn(() => () => {}) },
}));
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

function stubConnected() {
  mockGetAuth.mockResolvedValue({ kind: 'oauth', access_token: 't' });
  mockHasValidAuth.mockReturnValue(true);
}

const READY_TICKET = {
  status: 'ready' as const,
  key: 'PROJ-1',
  summary: 'Fix the flaky checkout test',
  prefillSeconds: 9000,
  startedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTodayTotal.mockReturnValue({ seconds: 9000, isPending: false, isError: false });
  mockUseResumeTicket.mockReturnValue(READY_TICKET);
  mockUseTicketSearch.mockReturnValue({ kind: 'idle' });
  mockUseTimeOffToday.mockReturnValue({ seconds: 0, isPending: false, worklogs: [] });
  mockUseOutboxState.mockReturnValue({ pendingCount: 0, failed: [] });
  postWorklogMock.mockResolvedValue({ kind: 'ok', value: { id: 'wl-x', timeSpentSeconds: 1800 } });
  // @ts-expect-error minimal chrome stub
  globalThis.chrome = { runtime: { openOptionsPage: vi.fn(), getURL: vi.fn((p: string) => `chrome-extension://abc/${p}`) }, tabs: { create: vi.fn() } };
});

describe('App — Obligation 2: breaksHeaderBaseline drops under a banner, restores when neither renders', () => {
  it('drops -mt-[10px] when the offline banner renders, restores it once the banner clears', async () => {
    stubConnected();
    mockUseOutboxState.mockReturnValue({ pendingCount: 2, failed: [] });
    const { container, rerender } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    const main = container.querySelector('main')!;
    expect(main.className).not.toContain('-mt-[10px]');
    expect(screen.getByText(/entries queued/)).toBeTruthy();

    mockUseOutboxState.mockReturnValue({ pendingCount: 0, failed: [] });
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    const main2 = document.querySelector('main')!;
    expect(main2.className).toContain('-mt-[10px]');
  });

  it('drops -mt-[10px] when the error banner renders (RED-proof: without !anyBanner both classes would coexist, overlapping the chrome)', async () => {
    stubConnected();
    mockUseOutboxState.mockReturnValue({
      pendingCount: 0,
      failed: [
        {
          id: 'f1',
          kind: 'post',
          endpoint: 'x',
          issueKey: 'GAPI-348',
          attemptCount: 10,
          status: 'failed',
          lastError: 'forbidden',
          enqueuedAt: new Date().toISOString(),
          body: { timeSpentSeconds: 5400, started: 'x' },
        },
      ],
    });
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    const main = container.querySelector('main')!;
    expect(main.className).not.toContain('-mt-[10px]');
  });
});

describe('App — D-7.3-9: the resume card is not re-keyed by a banner mounting above it', () => {
  // Review Finding 7: the ORIGINAL version of this test set `pendingCount: 3`
  // BEFORE the only render, so the banner was already mounted when
  // `preFillBefore` was captured — it compared the pre-fill value to ITSELF
  // in the same render and could not fail for any value, never asserted the
  // write target at all, and the story's own mandated RED-proof (re-key the
  // card + change the pre-fill when a banner is present) passed GREEN.
  // Fixed: render WITHOUT a banner first, establish an UNSUBMITTED, typed
  // (non-default) value AND the write target, THEN `rerender` the SAME live
  // tree with a banner mounted — a genuine rerender, not a fresh render, is
  // what actually exercises a remount if one occurs — and assert all three
  // survive using `toHaveBeenLastCalledWith` (a bare `toHaveBeenCalledWith`
  // would already be satisfied by a call made BEFORE the banner mounted).
  it('the resume card keeps its subtask, its UNSUBMITTED typed value, and its write target unchanged when a banner mounts above it', async () => {
    stubConnected();
    mockUseOutboxState.mockReturnValue({ pendingCount: 0, failed: [] });
    const { rerender } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </QueryClientProvider>,
    );

    const resumeInput = (await screen.findByLabelText('Hours for PROJ-1')) as HTMLInputElement;
    expect(screen.queryByText(/entries queued/)).toBeNull();

    // A distinctive, UNSUBMITTED value — a remount (mutation M9a: re-keying
    // the card off `anyBanner`) would reset this back to the pre-fill.
    fireEvent.change(resumeInput, { target: { value: '3.5' } });

    mockUseOutboxState.mockReturnValue({ pendingCount: 3, failed: [] });
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/entries queued/)).toBeTruthy();
    const resumeInputAfter = screen.getByLabelText('Hours for PROJ-1') as HTMLInputElement;
    expect(resumeInputAfter.value).toBe('3.5');

    // The write target is unchanged too — submitting NOW (after the banner
    // mounted) must still target PROJ-1. `postWorklog(key, body)` — the
    // issue key is the FIRST positional argument (`ResumeCard.tsx:177`).
    fireEvent.click(screen.getByRole('button', { name: /Log 1 hours to PROJ-1/ }));
    await waitFor(() => expect(postWorklogMock).toHaveBeenCalledTimes(1));
    expect(postWorklogMock).toHaveBeenLastCalledWith('PROJ-1', expect.anything());
  });
});

describe('App — AC2 hot path: the resume card still enqueues while offline (pendingCount > 0)', () => {
  it('a +1 press whose post returns {kind: "network"} still calls enqueue, even with pendingCount > 0', async () => {
    stubConnected();
    mockUseOutboxState.mockReturnValue({ pendingCount: 2, failed: [] });
    postWorklogMock.mockResolvedValue({ kind: 'network' });
    renderApp();

    await screen.findByLabelText('Hours for PROJ-1');
    fireEvent.click(screen.getByRole('button', { name: /Log 1 hours to PROJ-1/ }));

    await waitFor(() => expect(enqueueOutboxMock).toHaveBeenCalledTimes(1));
    expect(enqueueOutboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'post', issueKey: 'PROJ-1' }),
    );
  });
});

describe('App — AC5: disconnected renders no dead UI behind the connect card', () => {
  it('ResumeCard, SearchPanel, TodayView, PopupActionBar all render nothing, and the chrome role="status" region is absent', async () => {
    mockGetAuth.mockResolvedValue(null);
    mockHasValidAuth.mockReturnValue(false);
    const { container } = renderApp();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connect to Jira' })).toBeTruthy(),
    );

    expect(screen.queryByLabelText(/Hours for/)).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByTestId('today-view')).toBeNull();
    expect(screen.queryByTestId('pto-quick-action')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open week review in a new tab' })).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe('ResumeCard seeding is committed, not deferred (regression: CI-only flake)', () => {
  it('the hours input is already seeded the first moment it exists — never committed holding the placeholder', async () => {
    stubConnected();
    renderApp();

    // Deliberately NO waitFor around the value assertion. The point is that
    // the input must never be observable holding the pre-seed placeholder:
    // when seeding lived in a passive effect, the element was committed with
    // '1' and corrected on a later flush, so anything typed in that window
    // was silently overwritten by the seed. That is what made the Trap 2 test
    // below fail on CI and only on CI — a slow machine widens the window.
    //
    // Asserting straight off findBy (which resolves as soon as the element is
    // in the DOM) is what makes this a real guard: add a waitFor and it would
    // pass against the bug too.
    const input = (await screen.findByLabelText('Hours for PROJ-1')) as HTMLInputElement;
    expect(input.value).toBe('2.5'); // READY_TICKET.prefillSeconds = 9000 = 2.5h
  });
});

describe('App — D-7.9-26/14 (Trap 2): a mid-session time-off post does not flip the frozen body', () => {
  it('marking today as time off via the action bar mid-session does not swap the body — the resume card stays mounted, untouched', async () => {
    stubConnected();
    // Reactive mock: the hook's `seconds` output tracks whatever
    // `sessionPtoSeconds` App.tsx passes in — exactly what makes this a real
    // proof that the FREEZE (not the hook) is what prevents the swap.
    mockUseTimeOffToday.mockImplementation((sessionSeconds: number) => ({
      seconds: sessionSeconds,
      isPending: false,
      worklogs: [],
    }));
    renderApp();

    // First settle: sessionPtoSeconds is 0 → frozen to 'normal'.
    const resumeInput = (await screen.findByLabelText('Hours for PROJ-1')) as HTMLInputElement;
    expect(screen.getByTestId('today-view')).toBeTruthy();

    // Type into the resume card's hour input but do NOT submit — proves the
    // frozen body doesn't discard it either.
    fireEvent.change(resumeInput, { target: { value: '3.5' } });

    // Mid-session: mark today as time off via the (stubbed) action bar.
    fireEvent.click(screen.getByTestId('pto-quick-action'));

    // The body must NOT swap to the time-off card — the resume card (with
    // the just-typed, unsubmitted value) and TodayView both stay mounted.
    expect(screen.queryByText('Marked as time off')).toBeNull();
    expect(screen.getByLabelText('Hours for PROJ-1')).toBeTruthy();
    expect((screen.getByLabelText('Hours for PROJ-1') as HTMLInputElement).value).toBe('3.5');
    expect(screen.getByTestId('today-view')).toBeTruthy();
  });
});

describe('App — D-7.9-16: <main> is the sole owner of the baseline offset', () => {
  it('Finding 11: resume.status === "none" (any week beginning with a day off) + a time-off body still gets the offset — the old resume.status-keyed guard silently dropped it here', async () => {
    stubConnected();
    mockUseResumeTicket.mockReturnValue({ status: 'none' as const });
    mockUseTimeOffToday.mockReturnValue({ seconds: 28800, isPending: false, worklogs: [] });
    mockUseOutboxState.mockReturnValue({ pendingCount: 0, failed: [] });
    const { container } = renderApp();

    await waitFor(() => expect(screen.getByText('Marked as time off')).toBeTruthy());
    const main = container.querySelector('main')!;
    expect(main.className).toContain('-mt-[10px]');
  });

  it('Finding 5: the disconnected card no longer self-carries -mt-[10px] — <main> supplies it instead', async () => {
    mockGetAuth.mockResolvedValue(null);
    mockHasValidAuth.mockReturnValue(false);
    const { container } = renderApp();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connect to Jira' })).toBeTruthy(),
    );
    const main = container.querySelector('main')!;
    expect(main.className).toContain('-mt-[10px]');
    const card = screen.getByRole('heading', { name: 'Connect to Jira' }).closest('div')!;
    expect(card.className).not.toContain('-mt-[10px]');
  });

  it('AC1: the loading body gets the offset too, with PopupSkeletonBody genuinely mounted (Finding 13 — App-level AC1 wiring)', () => {
    stubConnected();
    mockUseTodayTotal.mockReturnValue({ seconds: 0, isPending: true, isError: false });
    const { container } = renderApp();

    // AC1's App-level wiring, proven directly rather than via ResumeCard's
    // OWN (different) skeleton branch: `PopupSkeletonBody`'s distinctive
    // `aria-hidden` root is the loading body's only producer. Deleting
    // `{popupState.body === 'loading' && <PopupSkeletonBody />}` from
    // `App.tsx` would make this selector find nothing.
    const skeletonRoot = container.querySelector('main > div[aria-hidden="true"]');
    expect(skeletonRoot).toBeTruthy();
    expect(screen.queryByLabelText(/Hours for/)).toBeNull();
    expect(screen.queryByTestId('today-view')).toBeNull();

    const main = container.querySelector('main')!;
    expect(main.className).toContain('-mt-[10px]');
  });
});

describe('App — Finding 12: the rendered Axis-B contract (banner order, suppression, and the time-off body)', () => {
  it('both banners render together, error ABOVE offline, in real DOM order', async () => {
    stubConnected();
    mockUseOutboxState.mockReturnValue({
      pendingCount: 2,
      failed: [
        {
          id: 'f1',
          kind: 'post',
          endpoint: 'x',
          issueKey: 'GAPI-348',
          attemptCount: 10,
          status: 'failed',
          lastError: 'forbidden',
          enqueuedAt: new Date().toISOString(),
          body: { timeSpentSeconds: 5400, started: 'x' },
        },
      ],
    });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());

    const errorBanner = screen.getByRole('alert');
    const offlineBanner = screen.getByText(/entries queued/).closest('[role="status"]')!;
    // `compareDocumentPosition`: DOCUMENT_POSITION_FOLLOWING (4) means the
    // offline banner comes AFTER the error banner in DOM order — a REAL
    // order assertion, not a boolean out of the pure precedence function
    // (which structurally cannot express order at all).
    expect(errorBanner.compareDocumentPosition(offlineBanner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('both banners render ABOVE a rendered time-off body (not just the normal body)', async () => {
    stubConnected();
    mockUseTimeOffToday.mockReturnValue({ seconds: 28800, isPending: false, worklogs: [] });
    mockUseOutboxState.mockReturnValue({
      pendingCount: 2,
      failed: [
        {
          id: 'f1',
          kind: 'post',
          endpoint: 'x',
          issueKey: 'GAPI-1',
          attemptCount: 10,
          status: 'failed',
          lastError: 'forbidden',
          enqueuedAt: new Date().toISOString(),
          body: { timeSpentSeconds: 3600, started: 'x' },
        },
      ],
    });
    renderApp();
    await waitFor(() => expect(screen.getByText('Marked as time off')).toBeTruthy());

    const errorBanner = screen.getByRole('alert');
    const offlineBanner = screen.getByText(/entries queued/).closest('[role="status"]')!;
    const card = screen.getByText('Marked as time off').closest('div')!;
    expect(card.compareDocumentPosition(errorBanner) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(card.compareDocumentPosition(offlineBanner) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('both banners are SUPPRESSED in the loading body even with pendingCount/failedCount > 0', async () => {
    stubConnected();
    mockUseTodayTotal.mockReturnValue({ seconds: 0, isPending: true, isError: false });
    mockUseOutboxState.mockReturnValue({
      pendingCount: 3,
      failed: [
        {
          id: 'f1',
          kind: 'post',
          endpoint: 'x',
          issueKey: 'GAPI-1',
          attemptCount: 10,
          status: 'failed',
          lastError: 'forbidden',
          enqueuedAt: new Date().toISOString(),
          body: { timeSpentSeconds: 3600, started: 'x' },
        },
      ],
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </QueryClientProvider>,
    );
    // `todayTotal.isPending: true` keeps the body 'loading' regardless of
    // when the mocked `getAuth()` promise settles — flush it explicitly so
    // the assertion below isn't racing an unflushed `act()` warning.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/entries queued/)).toBeNull();
  });

  it('both banners are SUPPRESSED in the disconnected body even with pendingCount/failedCount > 0', async () => {
    mockGetAuth.mockResolvedValue(null);
    mockHasValidAuth.mockReturnValue(false);
    mockUseOutboxState.mockReturnValue({
      pendingCount: 3,
      failed: [
        {
          id: 'f1',
          kind: 'post',
          endpoint: 'x',
          issueKey: 'GAPI-1',
          attemptCount: 10,
          status: 'failed',
          lastError: 'forbidden',
          enqueuedAt: new Date().toISOString(),
          body: { timeSpentSeconds: 3600, started: 'x' },
        },
      ],
    });
    renderApp();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connect to Jira' })).toBeTruthy(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/entries queued/)).toBeNull();
  });
});
