import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
 * Story 7.5: `TicketPicker` is gone from the popup, so the "log a NEW
 * ticket" flows below go through `SearchPanel` (the browse mechanism now),
 * and the "log the resume ticket via a second surface" flows go through
 * `RecentlyWorked`'s `+` (D-7.5-11) instead of the old picker → QuickLogForm
 * chain. `useHierarchyTickets`/`pinned-tickets`/`ticket-search`/
 * `create-subtask`/`catch-all` mocks are gone with it — none of those
 * modules are reachable from the real `TodayView` any more (see the story's
 * Task 9 and the dedicated NFR1 test at the bottom of this file).
 */

vi.mock('@/lib/storage/tokens', () => ({
  getAuth: vi.fn(async () => ({ kind: 'oauth', access_token: 't' })),
  hasValidAuth: () => true,
}));

vi.mock('@/lib/storage/settings', () => ({
  targetHoursItem: { getValue: vi.fn(async () => 8) },
  catchAllProjectKeyItem: { getValue: vi.fn(async () => 'KNP') },
  approvalCycleItem: { getValue: vi.fn(async () => 'calendar-month') },
  // Story 7.3: `useResumeTicket` (and, since 7.5, `useRecentlyWorked`) read
  // this to exclude the PTO subtask from week-worklog enrichment
  // (D-7.3-12). `null` = not configured, so nothing is excluded in this
  // file's fixtures. Story 7.9's `useTimeOffToday` reads the same item —
  // `null` means no worklog is ever categorised as time off here either, so
  // none of THIS file's existing tests land in the 'time-off' body.
  ptoSubtaskKeyItem: { getValue: vi.fn(async () => null) },
  ptoSubtaskSummaryItem: { getValue: vi.fn(async () => null) },
}));

// Story 7.3: the resume card's data seam. `getLastLoggedTicket` resolves to
// `null` by default so `useResumeTicket` falls through to its free
// week-scan enrichment (the same `PROJ-9` worklog `useTodayTotal` already
// consumes) — the resume card genuinely mounts in this file's real
// composition root, which is exactly what the guard tests below need.
const getLastLoggedTicketMock = vi.fn(async () => null as unknown);
const setLastLoggedTicketMock = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/lib/storage/last-logged', () => ({
  getLastLoggedTicket: () => getLastLoggedTicketMock(),
  setLastLoggedTicket: (...args: unknown[]) => setLastLoggedTicketMock(...args),
}));

vi.mock('@/components/today/PtoQuickAction', () => ({
  PtoQuickAction: () => <div data-testid="pto-quick-action" />,
}));

// Story 7.4: `SearchPanel` renders for real in this file (nothing here mocks
// it away), so its results hook gets the same controllable-mock treatment
// used in `App.test.tsx` — these tests drive the WRITE path only, never a
// real debounced Jira search or `useCurrentUser` network call.
const mockUseTicketSearch = vi.fn();
vi.mock('@/hooks/useTicketSearch', () => ({
  useTicketSearch: (query: string) => mockUseTicketSearch(query),
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
const deleteWorklogMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  fetchCurrentUserWeekWorklogsByIssue: (...args: unknown[]) => fetchByIssueMock(...args),
  postWorklog: (...args: unknown[]) => postWorklogMock(...args),
  updateWorklog: vi.fn(),
  deleteWorklog: (...args: unknown[]) => deleteWorklogMock(...args),
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
    mockUseTicketSearch.mockReturnValue({ kind: 'idle' });
    // @ts-expect-error minimal chrome stub
    globalThis.chrome = { runtime: { openOptionsPage: vi.fn() }, tabs: { create: vi.fn() } };
  });

  it('logging an entry via "Recently worked" does not double-count — the header shows server + session exactly once', async () => {
    const { container } = renderApp();

    // Initial server-only total: 3600s = 1.0h.
    await waitFor(() => expect(figureText(container)).toMatch(/^1\.0/));

    // Story 7.5: PROJ-9 (the only issue this week) surfaces in "Recently
    // worked" — its "+" opens QuickLogForm, pre-targeted (D-7.5-11).
    fireEvent.click(await screen.findByLabelText('Log time to PROJ-9'));
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
  // additive as one made through `RecentlyWorked`/`SearchPanel`, and must
  // not add a second fetch. `getLastLoggedTicketMock` resolves `null` (its
  // file-level default), so `useResumeTicket` resolves the resume ticket
  // from the free week-scan alone: `PROJ-9`, the same issue `useTodayTotal`
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

  // ---- Story 7.4: `searchEntries` is the FOURTH session list, additive the
  // exact same way the PTO/resume lists already are — a log made through
  // `SearchPanel` must not add a second week-query fetch either.
  it('a search-driven log does not double-count either — the header stays additive and the week query is fetched exactly once', async () => {
    mockUseTicketSearch.mockReturnValue({
      kind: 'results',
      items: [
        {
          issue: {
            id: '50',
            key: 'GAPI-330',
            fields: {
              summary: 'Payment gateway rollout',
              issuetype: { id: '1', name: 'Story', subtask: false },
            },
          },
          assignment: 'unknown',
        },
      ],
      truncated: false,
    });
    postWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-search-1', timeSpentSeconds: 5400 },
    });

    const { container } = renderApp();
    await waitFor(() => expect(figureText(container)).toMatch(/^1\.0/));

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'payment' } });
    const hoursInput = await screen.findByLabelText('Hours for GAPI-330');
    fireEvent.change(hoursInput, { target: { value: '1.5' } });
    fireEvent.keyDown(hoursInput, { key: 'Enter' });

    await waitFor(() =>
      expect(postWorklogMock).toHaveBeenCalledWith('GAPI-330', {
        timeSpentSeconds: 5400,
        started: expect.any(String),
      }),
    );

    // 3600 (server) + 5400 (session) = 9000s = 2.5h — not double-counted by
    // a phantom refetch.
    await waitFor(() => expect(figureText(container)).toMatch(/^2\.5/), { timeout: 1000 });
    expect(fetchByIssueMock).toHaveBeenCalledTimes(1);
    expect(setLastLoggedTicketMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'GAPI-330', seconds: 5400 }),
    );
  });

  // ---- Finding 5 (Minor), resolved: this test does NOT pin D-7.3-9's
  // identity-latch invariant, and no longer claims to. The reviewer's
  // mutation N3 (removing `ResumeCard`'s `!latchedTicketRef.current` guard,
  // i.e. re-latching on every render) proved this test stays GREEN under a
  // fully neutered latch — only Story 7.3's own `ResumeCard.test.tsx` goes
  // red. The reason is structural, not a test-writing mistake: in THIS
  // file (and in production) a search-driven log never causes
  // `useResumeTicket`'s underlying `['week-worklogs', …]` query to
  // re-resolve — that non-invalidation is exactly what the sibling
  // double-count test above this one already pins — so `resume`'s identity
  // never changes after mount here, and the latch (present or removed)
  // never gets an opportunity to fire twice. Giving this specific test real
  // teeth for the latch itself would require forcing a second, unrelated
  // week-query resolution mid-test purely to exercise it — precisely what
  // `ResumeCard.test.tsx`'s own "freezes the write target once the card is
  // ready" test (RED-proven in Story 7.3) already does, directly and more
  // cheaply, by re-rendering the component with a changed `resume` prop.
  // That test is the real pin for D-7.3-9; this one instead pins something
  // it CAN actually observe end-to-end: that a search-driven write lands at
  // the search ticket's key in the shared `last-logged` store, never at the
  // resume card's key, and that no incidental re-render of the composition
  // root disturbs the already-mounted card's displayed values.
  it('a search-driven log writes to the shared last-logged store under the SEARCH ticket, never the resume card\'s, and does not incidentally disturb the on-screen card', async () => {
    mockUseTicketSearch.mockReturnValue({
      kind: 'results',
      items: [
        {
          issue: {
            id: '50',
            key: 'GAPI-330',
            fields: {
              summary: 'Payment gateway rollout',
              issuetype: { id: '1', name: 'Story', subtask: false },
            },
          },
          assignment: 'unknown',
        },
      ],
      truncated: false,
    });
    postWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-search-2', timeSpentSeconds: 3600 },
    });

    renderApp();
    // The resume card auto-resolved PROJ-9 (its pre-fill: 1.5h, from the
    // PRE_LOG_WORKLOGS fixture's 3600s worklog).
    const resumeInput = (await screen.findByLabelText(
      'Hours for PROJ-9',
    )) as HTMLInputElement;
    const preFillBefore = resumeInput.value;

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'payment' } });
    const searchHoursInput = await screen.findByLabelText('Hours for GAPI-330');
    fireEvent.keyDown(searchHoursInput, { key: 'Enter' });

    await waitFor(() =>
      expect(setLastLoggedTicketMock).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'GAPI-330' }),
      ),
    );
    // The storage write landed for the SEARCH ticket, never for PROJ-9.
    expect(setLastLoggedTicketMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: 'PROJ-9' }),
    );
    // The resume card itself: still PROJ-9, still the original pre-fill —
    // completely unaware anything was written to the same storage record.
    expect(screen.getByLabelText('Hours for PROJ-9')).toBeTruthy();
    expect(screen.queryByLabelText('Hours for GAPI-330')).toBeNull(); // search cleared on success
    expect((screen.getByLabelText('Hours for PROJ-9') as HTMLInputElement).value).toBe(
      preFillBefore,
    );
  });

  // ---- D-7.4-18 teeth (the finding a reviewer will hunt for): a conditional
  // render of `TodayView` here would UNMOUNT it on the first keystroke,
  // wiping `loggedEntries` and re-firing `onTotalChange(0)` on remount —
  // search would silently corrupt the chrome header's running total. This
  // test drives the REAL `TodayView` (nothing in this file mocks it away)
  // so it can actually observe that hazard, and is proven to go RED against
  // a conditional-render implementation (see the Dev Agent Record).
  //
  // Story 7.5 Task 9: re-run via the SEARCH path (the browse mechanism
  // TicketPicker's removal leaves in place) rather than the old picker.
  it('D-7.4-18: typing a query and pressing Esc leaves a logged entry AND the chrome total untouched', async () => {
    mockUseTicketSearch.mockReturnValue({
      kind: 'results',
      items: [
        {
          issue: {
            id: '50',
            key: 'GAPI-330',
            fields: {
              summary: 'Payment gateway rollout',
              issuetype: { id: '1', name: 'Story', subtask: false },
            },
          },
          assignment: 'unknown',
        },
      ],
      truncated: false,
    });

    const { container } = renderApp();
    await waitFor(() => expect(figureText(container)).toMatch(/^1\.0/));

    const searchInput = screen.getByRole('combobox');
    fireEvent.change(searchInput, { target: { value: 'payment' } });
    const hoursInput = await screen.findByLabelText('Hours for GAPI-330');
    fireEvent.change(hoursInput, { target: { value: '2h' } });
    fireEvent.keyDown(hoursInput, { key: 'Enter' });

    await waitFor(() => expect(figureText(container)).toMatch(/^3\.0/), { timeout: 1000 });
    // The action button's aria-label is unique to the LOGGED ROW.
    const loggedRowLabel = /Edit GAPI-330/;
    expect(screen.getByLabelText(loggedRowLabel)).toBeVisible();

    fireEvent.change(searchInput, { target: { value: 'a' } });

    // While a search is active, the logged row is present in the DOM (state
    // preserved) but no longer VISIBLE — it is inside the `hidden` wrapper.
    expect(screen.getByLabelText(loggedRowLabel)).not.toBeVisible();
    // The total must not have been wiped by an unmount/remount cycle.
    expect(figureText(container)).toMatch(/^3\.0/);

    fireEvent.keyDown(searchInput, { key: 'Escape' });

    expect((searchInput as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText(loggedRowLabel)).toBeVisible();
    expect(figureText(container)).toMatch(/^3\.0/);
  });
});

// ---- Story 7.5, D-7.5-11: the resume card is untouched by a DIFFERENT ----
// Recently-worked row's "+" (owner ruling — required test) -----------------
describe('App — "Recently worked" + never touches the resume card (Story 7.5, D-7.5-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTicketSearch.mockReturnValue({ kind: 'idle' });
    // @ts-expect-error minimal chrome stub
    globalThis.chrome = { runtime: { openOptionsPage: vi.fn() }, tabs: { create: vi.fn() } };
  });

  const TWO_TICKET_WORKLOGS = [
    {
      key: 'PROJ-9',
      summary: 'Existing',
      worklogs: [{ id: 'wl-existing', timeSpentSeconds: 3600, started: todayIsoAt(9) }],
    },
    {
      key: 'PROJ-10',
      summary: 'A second ticket',
      worklogs: [{ id: 'wl-existing-2', timeSpentSeconds: 1800, started: todayIsoAt(7) }],
    },
  ];

  it("clicking a DIFFERENT row's + leaves the resume card's subtask, pre-fill, and write target unchanged", async () => {
    fetchByIssueMock.mockResolvedValue({ kind: 'ok', value: TWO_TICKET_WORKLOGS });
    postWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-quicklog-1', timeSpentSeconds: 7200 },
    });

    renderApp();

    // The resume card auto-resolves PROJ-9 — the freshest worklog.
    const resumeInput = (await screen.findByLabelText(
      'Hours for PROJ-9',
    )) as HTMLInputElement;
    const preFillBefore = resumeInput.value;

    // PROJ-10 is a DIFFERENT ticket, also surfaced by "Recently worked".
    fireEvent.click(await screen.findByLabelText('Log time to PROJ-10'));
    const quickLogHours = await screen.findByLabelText('Hours');
    fireEvent.change(quickLogHours, { target: { value: '2h' } });
    fireEvent.click(screen.getByText('Log'));

    await waitFor(() =>
      expect(postWorklogMock).toHaveBeenCalledWith('PROJ-10', {
        timeSpentSeconds: 7200,
        started: expect.any(String),
      }),
    );

    // The resume card: still mounted, still PROJ-9, still the SAME pre-fill —
    // D-7.3-9 stays absolute; the `+` never reached up and retargeted it.
    const resumeInputAfter = screen.getByLabelText('Hours for PROJ-9') as HTMLInputElement;
    expect(resumeInputAfter.value).toBe(preFillBefore);
    expect(setLastLoggedTicketMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'PROJ-10' }),
    );
    expect(setLastLoggedTicketMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: 'PROJ-9', seconds: 7200 }),
    );
  });
});

// ---- Review Finding 2 (Major), D-7.5-18: the shell's pendingDeletionId ----
// filter, given real teeth on the RENDERED chrome figure -------------------
//
// The reviewer proved that stripping `.filter((e) => e.worklogId !==
// pendingDeletionId)` from ALL THREE of `App.tsx`'s shell sums (`ptoSeconds`
// / `resumeSeconds` / `searchSeconds`) left the full 92-file suite green —
// nothing anywhere exercised the chrome header figure while an
// EXTERNALLY-owned entry (i.e. one NOT in `TodayView`'s own `loggedEntries`)
// was pending deletion. `LoggedToday.test.tsx` and `TodayView.test.tsx` only
// ever delete `TodayView`'s OWN entries, which is a different code path
// (`TodayView`'s `totalSeconds`, not `App.tsx`'s `searchSeconds` /
// `ptoSeconds` / `resumeSeconds`). This test deletes a SEARCH-driven entry
// (owned by `App.tsx`'s `searchEntries`, routed via
// `TodayView.handleAnyDeleted` → `onExternalEntryDeleted`) and asserts the
// RENDERED figure, not the `onPendingDeletionChange` callback — a callback
// firing correctly proves nothing about whether the shell's OWN sum
// actually used it.
describe('App — the shell seconds filter drops the figure immediately on delete and restores on Undo (Review Finding 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchByIssueMock.mockReset();
    fetchByIssueMock.mockResolvedValue({ kind: 'ok', value: PRE_LOG_WORKLOGS });
    postWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-search-2', timeSpentSeconds: 5400 },
    });
    mockUseTicketSearch.mockReturnValue({
      kind: 'results',
      items: [
        {
          issue: {
            id: '50',
            key: 'GAPI-330',
            fields: {
              summary: 'Payment gateway rollout',
              issuetype: { id: '1', name: 'Story', subtask: false },
            },
          },
          assignment: 'unknown',
        },
      ],
      truncated: false,
    });
    // @ts-expect-error minimal chrome stub
    globalThis.chrome = { runtime: { openOptionsPage: vi.fn() }, tabs: { create: vi.fn() } };
  });

  it('deleting a SHELL-owned (search-logged) entry drops the header figure immediately and Undo restores it', async () => {
    const { container } = renderApp();
    await waitFor(() => expect(figureText(container)).toMatch(/^1\.0/));

    // Log 1.5h against GAPI-330 via search — a `searchEntries`-owned row,
    // NOT one of `TodayView`'s own `loggedEntries`.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'payment' } });
    const hoursInput = await screen.findByLabelText('Hours for GAPI-330');
    fireEvent.change(hoursInput, { target: { value: '1.5h' } });
    fireEvent.keyDown(hoursInput, { key: 'Enter' });

    await waitFor(() => expect(figureText(container)).toMatch(/^2\.5/), { timeout: 1000 });

    // Delete it. This routes LoggedToday → TodayView.handleAnyDeleted (not
    // owned by loggedEntries) → App.tsx's onExternalEntryDeleted family via
    // onPendingDeletionChange, which THIS test asserts actually reaches
    // `searchSeconds`'s own filter — not just the callback.
    fireEvent.click(await screen.findByLabelText('Delete GAPI-330, 1.5h'));

    // The figure must drop back to the server-only 1.0h IMMEDIATELY — well
    // before the undo window commits anything to Jira.
    expect(figureText(container)).toMatch(/^1\.0/);
    expect(deleteWorklogMock).not.toHaveBeenCalled();

    // Undo restores it just as immediately.
    fireEvent.click(screen.getByText('Undo'));
    expect(figureText(container)).toMatch(/^2\.5/);
  });
});

// ---- Review Finding 6 (Nit), D-7.5-20: `⌘Z` genuinely reaches the resume ---
// card's hour input and the search field — corrected from the story's own
// (wrong) claim that this was "structurally impossible". `LoggedToday`'s
// `⌘Z` listener is `document.addEventListener`, not component-scoped, so it
// DOES observe keystrokes from these two inputs; `isTextEntryElement` is
// what makes it fall through to native undo instead of cancelling the
// pending deletion. `LoggedToday.test.tsx` cannot exercise this itself (it
// never mounts `ResumeCard`/`SearchPanel`) — only the real composition root
// here can.
describe('App — ⌘Z falls through to native undo from the resume card and search field too (Review Finding 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchByIssueMock.mockReset();
    fetchByIssueMock.mockResolvedValue({ kind: 'ok', value: PRE_LOG_WORKLOGS });
    postWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-search-3', timeSpentSeconds: 5400 },
    });
    mockUseTicketSearch.mockReturnValue({
      kind: 'results',
      items: [
        {
          issue: {
            id: '50',
            key: 'GAPI-330',
            fields: {
              summary: 'Payment gateway rollout',
              issuetype: { id: '1', name: 'Story', subtask: false },
            },
          },
          assignment: 'unknown',
        },
      ],
      truncated: false,
    });
    // @ts-expect-error minimal chrome stub
    globalThis.chrome = { runtime: { openOptionsPage: vi.fn() }, tabs: { create: vi.fn() } };
  });

  async function logAndStartPendingDelete(container: HTMLElement): Promise<void> {
    await waitFor(() => expect(figureText(container)).toMatch(/^1\.0/));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'payment' } });
    const hoursInput = await screen.findByLabelText('Hours for GAPI-330');
    fireEvent.change(hoursInput, { target: { value: '1.5h' } });
    fireEvent.keyDown(hoursInput, { key: 'Enter' });
    await waitFor(() => expect(figureText(container)).toMatch(/^2\.5/), { timeout: 1000 });
    fireEvent.click(await screen.findByLabelText('Delete GAPI-330, 1.5h'));
    expect(screen.getByText('Undo')).toBeTruthy();
  }

  it('⌘Z pressed inside the resume card\'s hour input does not cancel a pending deletion elsewhere', async () => {
    const { container } = renderApp();
    await logAndStartPendingDelete(container);

    const resumeInput = await screen.findByLabelText('Hours for PROJ-9');
    // Plain `.focus()` (unlike `fireEvent`) isn't auto-wrapped by RTL, and
    // moving focus away from the search field can trigger its own blur
    // state update.
    act(() => {
      resumeInput.focus();
    });
    fireEvent.keyDown(resumeInput, { key: 'z', metaKey: true });

    // Undo is still offered — the keystroke fell through to native text
    // undo in the resume card's own input, exactly as `isTextEntryElement`
    // intends, and did NOT reach `cancelPendingDeletion`.
    expect(screen.getByText('Undo')).toBeTruthy();
    expect(screen.queryByLabelText('Delete GAPI-330, 1.5h')).toBeNull();
  });

  it('⌘Z pressed inside the search field does not cancel a pending deletion elsewhere', async () => {
    const { container } = renderApp();
    await logAndStartPendingDelete(container);

    const searchInput = screen.getByRole('combobox');
    act(() => {
      (searchInput as HTMLInputElement).focus();
    });
    fireEvent.keyDown(searchInput, { key: 'z', metaKey: true });

    expect(screen.getByText('Undo')).toBeTruthy();
    expect(screen.queryByLabelText('Delete GAPI-330, 1.5h')).toBeNull();
  });
});

// ---- Story 7.5, D-7.5-17: the measured NFR1 win ----------------------------
describe('App — removing TicketPicker takes fetchHierarchy off the first-paint path (Story 7.5, D-7.5-17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchByIssueMock.mockResolvedValue({ kind: 'ok', value: PRE_LOG_WORKLOGS });
    mockUseTicketSearch.mockReturnValue({ kind: 'idle' });
    // @ts-expect-error minimal chrome stub
    globalThis.chrome = { runtime: { openOptionsPage: vi.fn() }, tabs: { create: vi.fn() } };
  });

  it('never calls fetchHierarchy on a connected, real-composition-root popup render', async () => {
    // `lib/hierarchy.ts` is NOT mocked in this file — if `fetchHierarchy`
    // (via the now-deleted popup `TicketPicker` → `useHierarchyTickets`
    // chain) were still reachable, it would call the ALSO-unmocked
    // `jiraGet`, which this file's `@/lib/jira-client` mock does not even
    // export — an immediate TypeError. A direct spy is the explicit
    // measurement the story asks for, rather than relying on that crash.
    const hierarchy = await import('@/lib/hierarchy');
    const fetchHierarchySpy = vi.spyOn(hierarchy, 'fetchHierarchy');

    const { container } = renderApp();
    await waitFor(() => expect(figureText(container)).toMatch(/^1\.0/));
    // "Recently worked" mounts fully (it is the section that replaced the
    // tree) — give any lazy/deferred hierarchy mount a beat to fire, if one
    // still existed.
    await screen.findByText('Recently worked');

    expect(fetchHierarchySpy).not.toHaveBeenCalled();
  });
});
