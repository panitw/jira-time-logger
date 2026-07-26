import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResumeTicket } from '@/hooks/useResumeTicket';

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

const { ResumeCard, recencyNote } = await import('./ResumeCard');

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const READY: ResumeTicket = {
  status: 'ready',
  key: 'PROJ-1',
  summary: 'Fix the flaky checkout test',
  prefillSeconds: 9000, // 2.5h
  startedAt: new Date().toISOString(),
};

describe('ResumeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postWorklogMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-1', timeSpentSeconds: 9000 },
    });
  });

  it('returns null for status: "none" — no empty card, no wrapper', () => {
    const { container } = renderWithProviders(
      <ResumeCard resume={{ status: 'none' }} onLogged={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders a skeleton in the loading state (no spinner)', () => {
    const { container } = renderWithProviders(
      <ResumeCard resume={{ status: 'loading' }} onLogged={vi.fn()} />,
    );
    expect(container.querySelectorAll('.animate-skeleton').length).toBeGreaterThan(0);
    expect(container.querySelector('[class*="animate-spin"]')).toBeNull();
    expect(container.querySelector('.shadow-lift')).toBeTruthy();
  });

  // ---- AC1/AC2: anatomy -----------------------------------------------
  it('renders the eyebrow, recency note, ticket key, and summary as separate block nodes', () => {
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    expect(screen.getByText('CONTINUE LOGGING')).toBeTruthy();
    const key = screen.getByText('PROJ-1');
    const summary = screen.getByText('Fix the flaky checkout test');
    // Separate nodes, sharing a parent — neither contains the other, so a
    // long summary can never displace/overlap the key's own line.
    expect(key).not.toBe(summary);
    expect(key.contains(summary)).toBe(false);
    expect(summary.contains(key)).toBe(false);
    expect(key.parentElement).toBe(summary.parentElement);
  });

  it('a 200-char summary keeps the key on its own node with line-clamp-2 applied', () => {
    const longSummary = 'x'.repeat(200);
    renderWithProviders(
      <ResumeCard resume={{ ...READY, summary: longSummary }} onLogged={vi.fn()} />,
    );
    const key = screen.getByText('PROJ-1');
    const summary = screen.getByText(longSummary);
    expect(key.textContent).toBe('PROJ-1');
    expect(summary.className).toContain('line-clamp-2');
    expect(summary).not.toBe(key);
  });

  // ---- AC3: hour entry row ------------------------------------------------
  it('pre-fills the hour input from prefillSeconds and focuses it on mount', () => {
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const input = screen.getByLabelText('Hours for PROJ-1') as HTMLInputElement;
    expect(input.value).toBe('2.5');
    expect(document.activeElement).toBe(input);
  });

  // ---- Finding 6: class-presence guards for requirements no behavioural
  // assertion can observe under jsdom (no layout/paint engine) ---------------
  it('the card root carries `relative z-[1]` — load-bearing against the relative chrome header (Task 3)', () => {
    const { container } = renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('relative');
    expect(root.className).toContain('z-[1]');
  });

  it('the input wrapper carries the 1.5px primary border and focus-within ring (AC3, D-7.3-15)', () => {
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const input = screen.getByLabelText('Hours for PROJ-1');
    const wrapper = input.parentElement as HTMLElement;
    expect(wrapper.className).toContain('border-[1.5px]');
    expect(wrapper.className).toContain('border-primary');
    expect(wrapper.className).toContain('focus-within:ring-focus');
  });

  it('the input carries aria-keyshortcuts="Enter" (AC3 keyboard contract)', () => {
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const input = screen.getByLabelText('Hours for PROJ-1');
    expect(input.getAttribute('aria-keyshortcuts')).toBe('Enter');
  });

  it('the CornerDownLeft badge is aria-hidden so it is not announced as content', () => {
    const { container } = renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
  });

  it('+0.5/+1/+2 each post exactly that amount immediately, with no confirmation and without mutating the input', async () => {
    const onLogged = vi.fn();
    renderWithProviders(<ResumeCard resume={READY} onLogged={onLogged} />);
    const input = screen.getByLabelText('Hours for PROJ-1') as HTMLInputElement;
    const before = input.value;

    fireEvent.click(screen.getByLabelText('Log 1 hours to PROJ-1'));

    await waitFor(() =>
      expect(postWorklogMock).toHaveBeenCalledWith('PROJ-1', {
        timeSpentSeconds: 3600,
        started: expect.any(String),
      }),
    );
    await waitFor(() => expect(onLogged).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'PROJ-1', seconds: 3600 }),
    ));
    // The input value is untouched by the quick-post action.
    expect(input.value).toBe(before);
  });

  it('+0.5 posts 1800s and +2 posts 7200s', async () => {
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Log 0.5 hours to PROJ-1'));
    await waitFor(() =>
      expect(postWorklogMock).toHaveBeenCalledWith(
        'PROJ-1',
        expect.objectContaining({ timeSpentSeconds: 1800 }),
      ),
    );

    postWorklogMock.mockClear();
    fireEvent.click(screen.getByLabelText('Log 2 hours to PROJ-1'));
    await waitFor(() =>
      expect(postWorklogMock).toHaveBeenCalledWith(
        'PROJ-1',
        expect.objectContaining({ timeSpentSeconds: 7200 }),
      ),
    );
  });

  // ---- AC4: Enter to log ---------------------------------------------------
  it('Enter posts the typed value, resets + selects the input, and returns focus to it', async () => {
    const onLogged = vi.fn();
    renderWithProviders(<ResumeCard resume={READY} onLogged={onLogged} />);
    const input = screen.getByLabelText('Hours for PROJ-1') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(postWorklogMock).toHaveBeenCalledWith('PROJ-1', {
        timeSpentSeconds: 10800,
        started: expect.any(String),
      }),
    );
    await waitFor(() => expect(onLogged).toHaveBeenCalled());
    await waitFor(() => expect(input.value).toBe('3'));
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(sendMessageMock).toHaveBeenCalledWith('badge-update', { hoursMissing: 0 });
    expect(setLastLoggedTicketMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'PROJ-1', seconds: 10800 }),
    );
  });

  it('the popup does not close on Enter — no <form> default-submit path exists', () => {
    const { container } = renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    expect(container.querySelector('form')).toBeNull();
  });

  // ---- D-7.3-16: unparseable → amber, not red ------------------------------
  it('unparseable input renders amber and Enter is a no-op (does not post)', () => {
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const input = screen.getByLabelText('Hours for PROJ-1');
    fireEvent.change(input, { target: { value: 'abc' } });
    const message = screen.getByText('Use formats like 2.5h, 2h 30m, or 2:30');
    expect(message.className).toContain('text-amber-ink');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(postWorklogMock).not.toHaveBeenCalled();
  });

  // ---- Finding 8: invalid input is programmatically associated and
  // announced, not just visually amber -------------------------------------
  it('an invalid value sets aria-invalid and aria-describedby, and the message is role="alert" (Finding 8)', () => {
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const input = screen.getByLabelText('Hours for PROJ-1');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();

    fireEvent.change(input, { target: { value: 'abc' } });

    const message = screen.getByText('Use formats like 2.5h, 2h 30m, or 2:30');
    expect(message.getAttribute('role')).toBe('alert');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(message.parentElement!.id);
  });

  it('a refused write is described by aria-describedby but does not set aria-invalid (value itself was valid)', async () => {
    postWorklogMock.mockResolvedValueOnce({ kind: 'forbidden' });
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const input = screen.getByLabelText('Hours for PROJ-1');
    fireEvent.keyDown(input, { key: 'Enter' });
    const message = await screen.findByText('Couldn’t log time — try again');
    expect(message.getAttribute('role')).toBe('alert');
    expect(input.getAttribute('aria-describedby')).toBe(message.parentElement!.id);
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('over-limit input (>24h) renders amber, not red', () => {
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const input = screen.getByLabelText('Hours for PROJ-1');
    fireEvent.change(input, { target: { value: '25' } });
    const msg = screen.getByText(/Hours per entry/);
    expect(msg.className).toContain('text-amber-ink');
    expect(msg.className).not.toContain('text-state-danger');
  });

  it('a refused write renders red (reserved for an actual Jira refusal)', async () => {
    postWorklogMock.mockResolvedValueOnce({ kind: 'forbidden' });
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const input = screen.getByLabelText('Hours for PROJ-1');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      const msg = screen.getByText('Couldn’t log time — try again');
      expect(msg.className).toContain('text-state-danger');
    });
    expect(setLastLoggedTicketMock).not.toHaveBeenCalled();
  });

  it('a network failure enqueues the outbox post and shows the pending chip, without stamping the record', async () => {
    postWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const input = screen.getByLabelText('Hours for PROJ-1');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByText('Pending — will retry')).toBeTruthy();
    });
    expect(enqueueOutboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'post', issueKey: 'PROJ-1' }),
    );
    expect(setLastLoggedTicketMock).not.toHaveBeenCalled();
  });

  // ---- D-7.4-17 (Story 7.4, Task 8): the `/` collision, both directions ------
  it('the hour input carries data-slash-passthrough="true" (D-7.4-17)', () => {
    renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const input = screen.getByLabelText('Hours for PROJ-1');
    expect(input.getAttribute('data-slash-passthrough')).toBe('true');
  });

  // The reverse steal: a cold-open card can still be 'loading' when the user
  // presses `/` and starts typing into search. Without the guard, the card
  // resolving to 'ready' fires its focus latch and yanks focus straight back
  // out of search — this test is proven RED against the pre-Task-8 code (the
  // guard line removed) and green with it in place.
  it('does not steal focus back from search when the card resolves to "ready" after focus was already claimed elsewhere (D-7.4-17 reverse focus-steal)', () => {
    const { rerender } = renderWithProviders(
      <ResumeCard resume={{ status: 'loading' }} onLogged={vi.fn()} />,
    );

    // Simulate the search field (or any other surface) claiming focus while
    // the card is still loading.
    const searchField = document.createElement('input');
    document.body.appendChild(searchField);
    searchField.focus();
    expect(document.activeElement).toBe(searchField);

    // The card now resolves to 'ready' — its focus latch effect fires.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <ResumeCard resume={READY} onLogged={vi.fn()} />
      </QueryClientProvider>,
    );

    // Focus must stay in search — NOT get yanked back into the now-ready
    // card's hour input.
    expect(document.activeElement).toBe(searchField);
    expect(document.activeElement).not.toBe(screen.getByLabelText('Hours for PROJ-1'));

    document.body.removeChild(searchField);
  });

  // ---- Focus latch ----------------------------------------------------------
  it('a re-render after focus has moved away does not steal it back', () => {
    const { rerender } = renderWithProviders(<ResumeCard resume={READY} onLogged={vi.fn()} />);
    const input = screen.getByLabelText('Hours for PROJ-1') as HTMLInputElement;
    expect(document.activeElement).toBe(input);

    // User moves focus elsewhere.
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    expect(document.activeElement).toBe(elsewhere);

    // Simulate the Task 2 enrichment re-render — same identity, a new
    // object reference (as `useResumeTicket`'s `useMemo` would produce).
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <ResumeCard resume={{ ...READY, startedAt: new Date().toISOString() }} onLogged={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(document.activeElement).toBe(elsewhere);
    document.body.removeChild(elsewhere);
  });

  // ---- Blocker (Finding 1) / D-7.3-9: identity latch --------------------
  // Reproduces the reviewer's exact hazard: the user has started typing
  // against the ticket the card first presented, an enrichment re-render
  // then lands the server-wins override with a DIFFERENT subtask (a worklog
  // logged elsewhere, e.g. Jira web), and the user presses Enter. Before the
  // fix, `ResumeCard` re-seeded on the identity change and both the write
  // target AND the posted amount silently followed the swap — the reviewer
  // measured `postWorklog` called with `["PROJ-9", { timeSpentSeconds: 7200
  // (2h) }]` where the user had typed `3` against `PROJ-1`. This test must
  // stay green with the fix and was proven RED without it (see the story's
  // Finding Resolutions for the revert/confirm/restore record).
  it('freezes the write target once the card is ready — an enrichment identity swap does not retarget an in-progress edit (D-7.3-9)', async () => {
    const onLogged = vi.fn();
    const { rerender } = renderWithProviders(<ResumeCard resume={READY} onLogged={onLogged} />);
    const input = screen.getByLabelText('Hours for PROJ-1') as HTMLInputElement;

    // The user types a value against the ticket the card first presented.
    fireEvent.change(input, { target: { value: '3' } });

    // The week query resolves and the server-wins override retargets the
    // card to a DIFFERENT subtask with a different pre-fill — exactly what
    // `useResumeTicket`'s enrichment does when a fresher worklog exists on
    // another issue.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <ResumeCard
          resume={{
            status: 'ready',
            key: 'PROJ-9',
            summary: 'Logged elsewhere',
            prefillSeconds: 7200, // 2h
            startedAt: new Date().toISOString(),
          }}
          onLogged={onLogged}
        />
      </QueryClientProvider>,
    );

    // The card's own displayed identity must also stay frozen — the swap
    // must not be visible anywhere, not just in the write.
    expect(screen.getByLabelText('Hours for PROJ-1')).toBeTruthy();
    expect(screen.queryByLabelText('Hours for PROJ-9')).toBeNull();

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(postWorklogMock).toHaveBeenCalledWith('PROJ-1', {
        timeSpentSeconds: 10800, // the TYPED 3h, not the swapped-in 2h
        started: expect.any(String),
      }),
    );
    expect(postWorklogMock).not.toHaveBeenCalledWith('PROJ-9', expect.anything());
  });

  // ---- Recency note copy table (AC2) -----------------------------------
  describe('recencyNote', () => {
    it('renders "logged {h}h today" for a same-day worklog', () => {
      const now = new Date();
      expect(recencyNote(now.toISOString(), 5400, now)).toBe('logged 1.5h today');
    });

    it('renders "last logged yesterday" for a previous-day worklog', () => {
      const now = new Date(2026, 5, 15, 12, 0, 0);
      const yesterday = new Date(2026, 5, 14, 9, 0, 0);
      expect(recencyNote(yesterday.toISOString(), 3600, now)).toBe('last logged yesterday');
    });

    it('renders "last logged N days ago" for 2–6 days', () => {
      const now = new Date(2026, 5, 15, 12, 0, 0);
      const threeDaysAgo = new Date(2026, 5, 12, 9, 0, 0);
      expect(recencyNote(threeDaysAgo.toISOString(), 3600, now)).toBe('last logged 3 days ago');
    });

    it('renders a bare month/day for 7+ days ago in the same year', () => {
      const now = new Date(2026, 5, 15, 12, 0, 0);
      const eightDaysAgo = new Date(2026, 5, 7, 9, 0, 0);
      expect(recencyNote(eightDaysAgo.toISOString(), 3600, now)).toBe('last logged Jun 7');
    });
  });

  // ---- AC1: shadow-lift exclusivity guard ----------------------------------
  it('shadow-lift appears in exactly one source file across components/ and entrypoints/', () => {
    const roots = ['components', 'entrypoints'].map((d) =>
      path.resolve(process.cwd(), d),
    );
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry) || entry.endsWith('.test.tsx') || entry.endsWith('.test.ts')) {
          continue;
        }
        const contents = readFileSync(full, 'utf-8');
        if (contents.includes('shadow-lift')) hits.push(full);
      }
    };
    for (const root of roots) walk(root);
    expect(hits).toEqual([path.resolve(process.cwd(), 'components/today/ResumeCard.tsx')]);
  });
});
