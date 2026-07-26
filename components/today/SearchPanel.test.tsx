import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchResultItem, TicketSearchState } from '@/hooks/useTicketSearch';

const postWorklogMock = vi.fn();
vi.mock('@/lib/jira-client', () => ({
  postWorklog: (...args: unknown[]) => postWorklogMock(...args),
}));

const sendMessageMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

const enqueueOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: (...args: unknown[]) => enqueueOutboxMock(...args),
}));

const setLastLoggedTicketMock = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/lib/storage/last-logged', () => ({
  setLastLoggedTicket: (...args: unknown[]) => setLastLoggedTicketMock(...args),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const mockUseTicketSearch = vi.fn<(query: string) => TicketSearchState>();
vi.mock('@/hooks/useTicketSearch', () => ({
  useTicketSearch: (query: string) => mockUseTicketSearch(query),
}));

const { SearchPanel } = await import('./SearchPanel');

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function subtaskItem(overrides: Partial<SearchResultItem['issue']['fields']> = {}): SearchResultItem {
  return {
    issue: {
      id: '1',
      key: 'PROJ-1',
      fields: {
        summary: 'Fix the flaky checkout test',
        issuetype: { id: '10001', name: 'Subtask', subtask: true },
        assignee: { accountId: 'me', displayName: 'Me' },
        ...overrides,
      },
    },
    assignment: 'you',
  };
}

function nonSubtaskItem(): SearchResultItem {
  return {
    issue: {
      id: '2',
      key: 'GAPI-330',
      fields: {
        summary: 'Payment gateway rollout',
        issuetype: { id: '10002', name: 'Story', subtask: false },
        assignee: { accountId: 'other-1', displayName: 'Anucha P.' },
      },
    },
    assignment: 'other',
  };
}

function unassignedItem(): SearchResultItem {
  return {
    issue: {
      id: '3',
      key: 'GAPI-361',
      fields: {
        summary: 'Debug the ETL job',
        issuetype: { id: '10001', name: 'Subtask', subtask: true },
      },
    },
    assignment: 'other',
  };
}

function resultsState(items: SearchResultItem[], truncated = false): TicketSearchState {
  return { kind: 'results', items, truncated };
}

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postWorklogMock.mockResolvedValue({ kind: 'ok', value: { id: 'wl-1', timeSpentSeconds: 3600 } });
    mockUseTicketSearch.mockReturnValue({ kind: 'idle' });
  });

  // ---- AC1: idle field -----------------------------------------------------
  it('AC1: renders the placeholder verbatim, a `/` badge, and aria-keyshortcuts', () => {
    renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    expect(input.getAttribute('placeholder')).toBe('Search any ticket — key or text');
    expect(input.getAttribute('aria-keyshortcuts')).toBe('/');
    expect(screen.getByText('/')).toBeTruthy();
  });

  // ---- AC2: `/` shortcut ----------------------------------------------------
  it('AC2/D-7.4-17: `/` pressed on document focuses the field and prevents the default insert', () => {
    renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    const notPrevented = fireEvent.keyDown(document, { key: '/' });
    expect(notPrevented).toBe(false); // preventDefault() was called
    expect(document.activeElement).toBe(input);
  });

  it('D-7.4-17: `/` is ignored (lets the character through) when focus is in a plain text input', () => {
    const other = document.createElement('input');
    other.type = 'text';
    document.body.appendChild(other);
    other.focus();

    renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
    const searchInput = screen.getByRole('combobox');

    const notPrevented = fireEvent.keyDown(document, { key: '/' });
    expect(notPrevented).toBe(true); // NOT prevented — the plain input keeps the slash
    expect(document.activeElement).toBe(other);
    expect(document.activeElement).not.toBe(searchInput);

    document.body.removeChild(other);
  });

  it('D-7.4-17: `/` IS honoured (steals focus) when the focused text input carries data-slash-passthrough="true"', () => {
    const hourInput = document.createElement('input');
    hourInput.type = 'text';
    hourInput.setAttribute('data-slash-passthrough', 'true');
    document.body.appendChild(hourInput);
    hourInput.focus();

    renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
    const searchInput = screen.getByRole('combobox');

    const notPrevented = fireEvent.keyDown(document, { key: '/' });
    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(searchInput);

    document.body.removeChild(hourInput);
  });

  it('badge flips `/` ⇄ `esc` on focus/blur', () => {
    renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    expect(screen.getByText('/')).toBeTruthy();
    fireEvent.focus(input);
    expect(screen.getByText('esc')).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.getByText('/')).toBeTruthy();
  });

  // ---- AC3/D-7.4-18: onActiveChange wiring -----------------------------------
  it('D-7.4-18: calls onActiveChange(true) on the first keystroke and onActiveChange(false) once cleared', () => {
    const onActiveChange = vi.fn();
    renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={onActiveChange} />);
    expect(onActiveChange).toHaveBeenLastCalledWith(false);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'a' } });
    expect(onActiveChange).toHaveBeenLastCalledWith(true);

    fireEvent.change(input, { target: { value: '' } });
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });

  // ---- AC5/D-7.4-19: ARIA shape ------------------------------------------------
  describe('with results on screen', () => {
    beforeEach(() => {
      mockUseTicketSearch.mockReturnValue(
        resultsState([subtaskItem(), nonSubtaskItem(), unassignedItem()]),
      );
    });

    it('D-7.4-19: input is role=combobox, list is role=listbox, rows are role=option with zero interactive descendants', () => {
      const { container } = renderWithProviders(
        <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />,
      );
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });

      const input = screen.getByRole('combobox');
      expect(input.tagName).toBe('INPUT');
      const listbox = container.querySelector('ul[role="listbox"]');
      expect(listbox).toBeTruthy();
      const options = container.querySelectorAll('li[role="option"]');
      expect(options.length).toBe(3);
      for (const option of Array.from(options)) {
        expect(
          option.querySelector('button, a[href], input, textarea, select'),
        ).toBeNull();
      }
    });

    it('exactly one aria-activedescendant tracks the active option, and it moves/wraps with ↑/↓', () => {
      renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'abc' } });

      const firstId = input.getAttribute('aria-activedescendant');
      expect(firstId).toBeTruthy();

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      const secondId = input.getAttribute('aria-activedescendant');
      expect(secondId).not.toBe(firstId);

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' }); // wraps back to the first
      expect(input.getAttribute('aria-activedescendant')).toBe(firstId);

      fireEvent.keyDown(input, { key: 'ArrowUp' }); // wraps to the last
      expect(input.getAttribute('aria-activedescendant')).not.toBe(firstId);
    });

    it('no overflow-y-auto or max-h-* on the results container (7.2 AC2 — one scroll region)', () => {
      const { container } = renderWithProviders(
        <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />,
      );
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
      const listbox = container.querySelector('ul[role="listbox"]')!;
      expect(listbox.className).not.toMatch(/overflow-y-auto/);
      expect(listbox.className).not.toMatch(/max-h-/);
    });

    it('footnote renders verbatim with AC4 results', () => {
      renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
      expect(
        screen.getByText("Searched live in Jira — includes tickets that aren't assigned to you."),
      ).toBeTruthy();
    });

    it('AC4: renders the "assigned to you" pill and the assignee/Unassigned pill', () => {
      renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
      expect(screen.getByText('assigned to you')).toBeTruthy();
      expect(screen.getByText('Anucha P.')).toBeTruthy();
      expect(screen.getByText('Unassigned')).toBeTruthy();
    });

    // ---- D-7.4-11: the non-subtask warning ----------------------------------
    it('D-7.4-11: a non-subtask result renders the plain-language warning; a subtask result does not', () => {
      const { container } = renderWithProviders(
        <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />,
      );
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });

      const warningText = 'Hours logged here may not show up when your manager reviews approvals.';
      const options = container.querySelectorAll('li[role="option"]');
      const [subtaskRow, nonSubtaskRow] = Array.from(options);

      expect(subtaskRow!.textContent).not.toContain(warningText);
      expect(nonSubtaskRow!.textContent).toContain(warningText);
      // Amber, never red or icon-only — a visible text label survives with
      // the icon deleted.
      expect(nonSubtaskRow!.querySelector('.text-amber-ink')).toBeTruthy();
      expect(nonSubtaskRow!.querySelector('.text-state-danger')).toBeNull();
      // The warning also rides in the row's composed accessible name, so a
      // keyboard user landing on it via aria-activedescendant cannot miss it
      // even without reading the row visually.
      expect(nonSubtaskRow!.getAttribute('aria-label')).toContain(warningText);
      expect(subtaskRow!.getAttribute('aria-label')).not.toContain(warningText);
    });

    // ---- AC6: in-flight indicator, tested separately below -----------------

    // ---- AC5: one-step logging ----------------------------------------------
    it('⏎ in the search field logs the active result exactly once, using the header hour value', async () => {
      const onLogged = vi.fn();
      renderWithProviders(<SearchPanel onLogged={onLogged} onActiveChange={vi.fn()} />);
      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'abc' } });

      const hoursInput = screen.getByLabelText('Hours for PROJ-1');
      fireEvent.change(hoursInput, { target: { value: '2.5' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() =>
        expect(postWorklogMock).toHaveBeenCalledWith('PROJ-1', {
          timeSpentSeconds: 9000,
          started: expect.any(String),
        }),
      );
      expect(postWorklogMock).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(onLogged).toHaveBeenCalledWith(
          expect.objectContaining({ key: 'PROJ-1', seconds: 9000 }),
        ),
      );
      expect(sendMessageMock).toHaveBeenCalledWith('badge-update', { hoursMissing: 0 });
      expect(setLastLoggedTicketMock).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'PROJ-1', seconds: 9000 }),
      );
      // On success the query clears and the lists restore.
      await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
    });

    it('⏎ in the hour input logs the active result the same way', async () => {
      renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
      const hoursInput = screen.getByLabelText('Hours for PROJ-1');
      fireEvent.keyDown(hoursInput, { key: 'Enter' });

      await waitFor(() =>
        expect(postWorklogMock).toHaveBeenCalledWith('PROJ-1', {
          timeSpentSeconds: 3600,
          started: expect.any(String),
        }),
      );
    });

    it('clicking a non-active row logs THAT row, not the preselected one', async () => {
      const { container } = renderWithProviders(
        <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />,
      );
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });

      const rows = container.querySelectorAll('li[role="option"]');
      fireEvent.click(rows[1]!); // GAPI-330 (the non-subtask row)

      await waitFor(() =>
        expect(postWorklogMock).toHaveBeenCalledWith('GAPI-330', {
          timeSpentSeconds: 3600,
          started: expect.any(String),
        }),
      );
    });

    // ---- Unparseable / over-limit → amber, never a post ----------------------
    it('unparseable hours render amber and do not post', () => {
      renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'abc' } });

      const hoursInput = screen.getByLabelText('Hours for PROJ-1');
      fireEvent.change(hoursInput, { target: { value: 'xyz' } });
      const message = screen.getByText('Use formats like 2.5h, 2h 30m, or 2:30');
      expect(message.className).toContain('text-amber-ink');

      fireEvent.keyDown(input, { key: 'Enter' });
      expect(postWorklogMock).not.toHaveBeenCalled();
    });

    // ---- A refused write is red; a rate-limited SEARCH never is --------------
    it('a refused write renders red', async () => {
      postWorklogMock.mockResolvedValueOnce({ kind: 'forbidden' });
      renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'abc' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      const message = await screen.findByText('Couldn’t log time — try again');
      expect(message.className).toContain('text-state-danger');
      expect(setLastLoggedTicketMock).not.toHaveBeenCalled();
    });

    it('a network failure enqueues the outbox post and shows the pending chip, without stamping the record', async () => {
      postWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
      renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'abc' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => expect(screen.getByText('Pending — will retry')).toBeTruthy());
      expect(enqueueOutboxMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'post', issueKey: 'PROJ-1' }),
      );
      expect(setLastLoggedTicketMock).not.toHaveBeenCalled();
    });

    // ---- D-7.4-14: truncation is stated, never silent ------------------------
    it('D-7.4-14: states the truncation line when capped, and omits it otherwise', () => {
      mockUseTicketSearch.mockReturnValue(resultsState([subtaskItem()], true));
      const { rerender } = renderWithProviders(
        <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />,
      );
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
      expect(
        screen.getByText('Showing the first 1 matches — narrow your search to see more.'),
      ).toBeTruthy();

      mockUseTicketSearch.mockReturnValue(resultsState([subtaskItem()], false));
      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />
        </QueryClientProvider>,
      );
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
      expect(
        screen.queryByText('Showing the first 1 matches — narrow your search to see more.'),
      ).toBeNull();
    });
  });

  // ---- AC6: in-flight indicator ----------------------------------------------
  it('AC6: shows LoaderCircle while in flight, and the field is never disabled', () => {
    mockUseTicketSearch.mockReturnValue({ kind: 'in-flight' });
    const { container } = renderWithProviders(
      <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(container.querySelector('[class*="animate-spin"]')).toBeTruthy();
    expect((input as HTMLInputElement).disabled).toBe(false);
  });

  it('AC6: aria-busy="true" on the results container while in flight, and false once results land', () => {
    mockUseTicketSearch.mockReturnValue({ kind: 'in-flight' });
    const { container, rerender } = renderWithProviders(
      <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
    const listbox = container.querySelector('ul[role="listbox"]')!;
    expect(listbox.getAttribute('aria-busy')).toBe('true');

    mockUseTicketSearch.mockReturnValue(resultsState([subtaskItem()]));
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
    expect(listbox.getAttribute('aria-busy')).toBe('false');
  });

  it('surfaces a neutral (never red) note for an empty result set', () => {
    mockUseTicketSearch.mockReturnValue({ kind: 'empty' });
    renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    const message = screen.getByText('No matching tickets.');
    expect(message.className).not.toContain('text-state-danger');
  });

  it('a rate-limited SEARCH renders a neutral note, never red', () => {
    mockUseTicketSearch.mockReturnValue({ kind: 'failed', errorKind: 'rate-limited' });
    renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
    // Finding 4: the same copy now also announces via the sr-only
    // role="status" region — assert the VISIBLE paragraph specifically.
    const [message] = screen
      .getAllByText('Jira is rate-limiting search — try again in a moment.')
      .filter((el) => !el.className.includes('sr-only'));
    expect(message!.className).not.toContain('text-state-danger');
    expect(message!.className).not.toContain('amber');
  });

  // ---- D-7.4-24: Esc semantics -------------------------------------------------
  describe('Esc (D-7.4-24)', () => {
    it('with a non-empty query: clears the query, keeps focus, and preventDefault/stopPropagation fire', () => {
      mockUseTicketSearch.mockReturnValue(resultsState([subtaskItem()]));
      renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
      const input = screen.getByRole('combobox') as HTMLInputElement;
      input.focus();
      fireEvent.change(input, { target: { value: 'abc' } });
      expect(input.value).toBe('abc');

      const notPrevented = fireEvent.keyDown(input, { key: 'Escape' });
      expect(notPrevented).toBe(false);
      expect(input.value).toBe('');
      expect(document.activeElement).toBe(input);
    });

    it('with an empty query while focused: blurs the field', () => {
      renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
      const input = screen.getByRole('combobox') as HTMLInputElement;
      input.focus();
      expect(document.activeElement).toBe(input);

      fireEvent.keyDown(input, { key: 'Escape' });
      expect(document.activeElement).not.toBe(input);
    });
  });

  // ---- D-7.4-26: the seam Story 7.5 calls -------------------------------------
  it('D-7.4-26: exposes SearchPanelHandle.focus() via the ref', () => {
    const ref = createRef<{ focus: () => void }>();
    renderWithProviders(<SearchPanel ref={ref} onLogged={vi.fn()} onActiveChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    expect(document.activeElement).not.toBe(input);
    ref.current?.focus();
    expect(document.activeElement).toBe(input);
  });

  // ---- AC7 / D-7.4-23: promoted-to-primary autofocus ----------------------------
  it('AC7: autoFocus focuses the field once, at mount', () => {
    renderWithProviders(
      <SearchPanel autoFocus onLogged={vi.fn()} onActiveChange={vi.fn()} />,
    );
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });

  // ---- Finding 3 (Major) / D-7.4-17: reverse focus-steal, SearchPanel's own
  // side. `App.tsx` passes `autoFocus={resume.status === 'none'}` — a
  // TRANSITION that can flip `false -> true` up to
  // `COLD_START_SKELETON_BUDGET_MS` after mount (D-7.3-10). Without the
  // guard mirrored from `ResumeCard.tsx`, this effect steals focus back from
  // whatever the user has since focused. Proven RED by removing the guard
  // (see the Dev Agent Record) and restored — this test must fail without it.
  it('Finding 3/D-7.4-17: does not steal focus once it has already been claimed elsewhere before autoFocus flips true', () => {
    const { rerender } = renderWithProviders(
      <SearchPanel autoFocus={false} onLogged={vi.fn()} onActiveChange={vi.fn()} />,
    );

    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    expect(document.activeElement).toBe(other);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <SearchPanel autoFocus onLogged={vi.fn()} onActiveChange={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(document.activeElement).toBe(other);
    expect(document.activeElement).not.toBe(screen.getByRole('combobox'));

    document.body.removeChild(other);
  });

  // ---- Finding 4 (Minor): failure/in-flight announcements ----------------------
  describe('Finding 4: the role="status" region announces failure and in-flight states', () => {
    it('announces "Searching…" while in flight', () => {
      mockUseTicketSearch.mockReturnValue({ kind: 'in-flight' });
      const { container } = renderWithProviders(
        <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />,
      );
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
      const status = container.querySelector('[role="status"].sr-only')!;
      expect(status.textContent).toBe('Searching…');
    });

    it('announces the rate-limited message, distinct from a generic failure', () => {
      mockUseTicketSearch.mockReturnValue({ kind: 'failed', errorKind: 'rate-limited' });
      const { container } = renderWithProviders(
        <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />,
      );
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
      const status = container.querySelector('[role="status"].sr-only')!;
      expect(status.textContent).toBe('Jira is rate-limiting search — try again in a moment.');
    });

    it('announces a generic failure message for a non-rate-limit error', () => {
      mockUseTicketSearch.mockReturnValue({ kind: 'failed', errorKind: 'network' });
      const { container } = renderWithProviders(
        <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />,
      );
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
      const status = container.querySelector('[role="status"].sr-only')!;
      expect(status.textContent).toBe("Couldn’t search Jira — try again.");
    });
  });

  // ---- Finding 2 (Major) / D-7.4-16: scroll the active option into view --------
  describe('Finding 2/D-7.4-16: the active option is scrolled into view', () => {
    let scrollIntoViewMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      scrollIntoViewMock = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;
      // Mirrors production: `hasResults` is false until a query exists, so
      // the transition this effect depends on actually happens (a static
      // `mockReturnValue` here would make `hasResults` true from mount,
      // before the `<li>` options even exist in the DOM, and the effect
      // would never re-fire once a query is typed).
      mockUseTicketSearch.mockImplementation((query: string) =>
        query.trim()
          ? resultsState([subtaskItem(), nonSubtaskItem(), unassignedItem()])
          : { kind: 'idle' },
      );
    });

    it('scrolls the initially-preselected option into view with block: "nearest"', () => {
      renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest' });
    });

    it('scrolls the newly-active option into view on every ↑/↓ move', () => {
      renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'abc' } });
      const callsAfterMount = scrollIntoViewMock.mock.calls.length;

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(scrollIntoViewMock.mock.calls.length).toBeGreaterThan(callsAfterMount);
      expect(scrollIntoViewMock).toHaveBeenLastCalledWith({ block: 'nearest' });
    });
  });

  // ---- Finding 2 / Finding 6 (Major/Minor) / D-7.4-16: the warning is
  // reachable WITHOUT scrolling — pinning the guarantee, not the pixel, per
  // the story's own instruction. jsdom has no layout engine, so "reachable
  // without scrolling" is proven structurally: the warning lives in the
  // ALWAYS-VISIBLE header strip (a sibling of, and rendered before, the
  // listbox itself) rather than only inside the (possibly off-screen)
  // result row, and the write control (the hour input) is wired to it via
  // aria-describedby.
  it('Finding 2/6: the non-subtask warning is in the header strip (not only the row) and reachable from the hour input', () => {
    mockUseTicketSearch.mockReturnValue(resultsState([nonSubtaskItem()]));
    const { container } = renderWithProviders(
      <SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });

    const listbox = container.querySelector('ul[role="listbox"]')!;
    const warningText = 'Hours logged here may not show up when your manager reviews approvals.';
    const headerWarning = Array.from(container.querySelectorAll('p')).find(
      (p) => p.textContent === warningText,
    );
    expect(headerWarning).toBeTruthy();
    // NOT inside the listbox/row — it is part of the header strip, so it
    // never scrolls with the results.
    expect(listbox.contains(headerWarning!)).toBe(false);

    const hoursInput = screen.getByLabelText('Hours for GAPI-330');
    const describedBy = hoursInput.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toContain(headerWarning!.id);
  });

  it('Finding 2/6: a subtask-only result set renders no header-strip warning', () => {
    mockUseTicketSearch.mockReturnValue(resultsState([subtaskItem()]));
    renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
    expect(
      screen.queryByText('Hours logged here may not show up when your manager reviews approvals.'),
    ).toBeNull();
  });

  // ---- Finding 7 (Nit) / D-7.4-17: this panel's own hour input --------------
  it('Finding 7/D-7.4-17: this panel’s own hour input carries data-slash-passthrough="true"', () => {
    mockUseTicketSearch.mockReturnValue(resultsState([subtaskItem()]));
    renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
    const hoursInput = screen.getByLabelText('Hours for PROJ-1');
    expect(hoursInput.getAttribute('data-slash-passthrough')).toBe('true');
  });

  // ---- Finding 9 (Nit): an emptied hour field explains itself, fails closed ----
  it('Finding 9: clearing the hour field renders amber helper text and does not post', () => {
    mockUseTicketSearch.mockReturnValue(resultsState([subtaskItem()]));
    renderWithProviders(<SearchPanel onLogged={vi.fn()} onActiveChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'abc' } });

    const hoursInput = screen.getByLabelText('Hours for PROJ-1');
    fireEvent.change(hoursInput, { target: { value: '' } });
    const message = screen.getByText('Use formats like 2.5h, 2h 30m, or 2:30');
    expect(message.className).toContain('text-amber-ink');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(postWorklogMock).not.toHaveBeenCalled();
  });
});
