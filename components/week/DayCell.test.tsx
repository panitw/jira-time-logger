import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DayStatus } from '@/lib/day-status';
import { hoursToSeconds } from '@/lib/hours';
import type { WeekGridCell } from '@/lib/week-grid';

const postWorklogMock = vi.fn();
const updateWorklogMock = vi.fn();
const deleteWorklogMock = vi.fn();

vi.mock('@/lib/jira-client', () => ({
  postWorklog: (...args: unknown[]) => postWorklogMock(...args),
  updateWorklog: (...args: unknown[]) => updateWorklogMock(...args),
  deleteWorklog: (...args: unknown[]) => deleteWorklogMock(...args),
}));

const sendMessageMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

const enqueueOutboxMock = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock('@/lib/storage/outbox', () => ({
  enqueue: (...args: unknown[]) => enqueueOutboxMock(...args),
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { DayCell } = await import('./DayCell');

function emptyCell(): WeekGridCell {
  return { seconds: 0, worklogs: [] };
}

function singleCell(seconds: number, startedISO = '2026-06-15T09:00:00.000+0000'): WeekGridCell {
  return { seconds, worklogs: [{ id: 'w-1', startedISO }] };
}

function multiCell(): WeekGridCell {
  return {
    seconds: hoursToSeconds(6),
    worklogs: [
      { id: 'w-1', startedISO: '2026-06-15T09:00:00.000+0000' },
      { id: 'w-2', startedISO: '2026-06-15T13:00:00.000+0000' },
    ],
  };
}

function renderCell(cell: WeekGridCell, onMutated = vi.fn(), status: DayStatus | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <table>
        <tbody>
          <tr>
            <DayCell
              rowKey="PROJ-1"
              rowSummary="Build the grid"
              dayIndex={0}
              dayName="Monday"
              dayISO="2026-06-15"
              cell={cell}
              status={status}
              onMutated={onMutated}
            />
          </tr>
        </tbody>
      </table>
    </QueryClientProvider>,
  );
  return { ...utils, onMutated };
}

describe('DayCell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postWorklogMock.mockResolvedValue({ kind: 'ok', value: { id: 'new-1', timeSpentSeconds: 9000 } });
    updateWorklogMock.mockResolvedValue({ kind: 'ok', value: { id: 'w-1', timeSpentSeconds: 9000 } });
    deleteWorklogMock.mockResolvedValue({ kind: 'ok', value: undefined });
  });

  // Story 7.7, AC4/D-7.7-26: the 34px anatomy box shows a `faint-decorative`
  // middot for an empty cell, not the em-dash pair `secondsToCellDisplay`
  // uses elsewhere (totals/multi-cell) — a deliberate, scoped divergence.
  it('renders an empty cell as a faint middot with an edit button', () => {
    renderCell(emptyCell());
    const btn = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    expect(btn.textContent).toBe('·');
    expect(btn.className).toContain('text-faint-decorative');
    expect(btn.className).toContain('border-transparent');
  });

  it('POSTs a new worklog when an empty cell is filled + Enter', async () => {
    const { onMutated } = renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(postWorklogMock).toHaveBeenCalledWith('PROJ-1', {
        timeSpentSeconds: hoursToSeconds(2.5),
        started: expect.any(String),
      });
    });
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
    expect(sendMessageMock).toHaveBeenCalledWith('badge-update', { hoursMissing: 0 });
  });

  it('pre-fills the editor with the current value and PUTs on a single-worklog cell', async () => {
    renderCell(singleCell(hoursToSeconds(4)));
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid') as HTMLInputElement;
    expect(input.value).toBe('4');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(updateWorklogMock).toHaveBeenCalledWith('PROJ-1', 'w-1', {
        timeSpentSeconds: hoursToSeconds(5),
        started: '2026-06-15T09:00:00.000+0000',
      });
    });
  });

  it('DELETEs the single worklog when cleared to empty + Enter', async () => {
    renderCell(singleCell(hoursToSeconds(4)));
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(deleteWorklogMock).toHaveBeenCalledWith('PROJ-1', 'w-1');
    });
  });

  it('hard-blocks over-24 hours: shows amber error (not red), no network call, stays editing on Enter (D-7.6-37)', async () => {
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '25' } });
    expect(
      screen.getByText('Hours per entry can’t exceed 24. Split into multiple entries if needed.'),
    ).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(postWorklogMock).not.toHaveBeenCalled();
    // Still in edit mode — amber now, never red (validation, not a refused write).
    expect(input.className).toContain('border-amber-border');
    expect(input.className).not.toContain('border-state-danger');
  });

  it('rejects unparseable input: amber border (not red), Enter is a no-op (no POST) (D-7.6-37)', () => {
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.className).toContain('border-amber-border');
    expect(input.className).not.toContain('border-state-danger');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(postWorklogMock).not.toHaveBeenCalled();
  });

  it('Escape cancels editing back to the prior value (no write)', () => {
    renderCell(singleCell(hoursToSeconds(4)));
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(updateWorklogMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid').textContent).toBe('4.0');
  });

  it('multi-worklog cell is read-only: no editor opens, shows the Multiple entries affordance', () => {
    renderCell(multiCell());
    const cell = screen.getByLabelText('2 entries for Monday, PROJ-1 Build the grid — edit in the Today view');
    expect(cell).toBeTruthy();
    // No editable button/input is exposed.
    expect(screen.queryByRole('button')).toBeNull();
    const marker = screen.getByTitle('Multiple entries — edit in Today view');
    expect(marker.textContent).toBe('6.0');
  });

  it('network failure enqueues an outbox POST and shows the pending chip', async () => {
    postWorklogMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Pending — will retry')).toBeTruthy();
    });
    expect(enqueueOutboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'post', issueKey: 'PROJ-1' }),
    );
  });

  it('non-transient failure shows an error chip and does not enqueue', async () => {
    postWorklogMock.mockResolvedValueOnce({ kind: 'forbidden' });
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/Couldn’t log time/)).toBeTruthy();
    });
    expect(enqueueOutboxMock).not.toHaveBeenCalled();
  });

  it('applies the carry-through tint for a met day', () => {
    renderCell(singleCell(hoursToSeconds(8)), vi.fn(), 'met');
    const btn = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    const td = btn.closest('td')!;
    expect(td.className).toContain('bg-state-success-subtle');
    expect(td.className).toContain('motion-safe:transition-colors');
  });

  it('applies the amber tint for an attention day — never the old danger-red', () => {
    renderCell(emptyCell(), vi.fn(), 'attention');
    const btn = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    const td = btn.closest('td')!;
    expect(td.className).toContain('bg-amber-soft');
    expect(td.className).not.toContain('state-danger');
  });

  it('Enter then the blur fired by closing the editor does not double-submit', async () => {
    renderCell(singleCell(hoursToSeconds(4)));
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '5' } });
    // Enter commits; the subsequent blur (as the input unmounts) must be a no-op.
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    await waitFor(() => expect(updateWorklogMock).toHaveBeenCalledTimes(1));
  });

  it('clearing an already-empty cell is a no-op (no delete)', () => {
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(deleteWorklogMock).not.toHaveBeenCalled();
    expect(postWorklogMock).not.toHaveBeenCalled();
  });

  // --- Story 7.7, AC4: cell anatomy ---------------------------------------

  describe('cell anatomy (AC4/D-7.7-26)', () => {
    it('a value-bearing cell is a white box with the cell-border token', () => {
      renderCell(singleCell(hoursToSeconds(4)));
      const btn = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
      expect(btn.className).toContain('h-[34px]');
      expect(btn.className).toContain('rounded-md');
      expect(btn.className).toContain('border-cell-border');
      expect(btn.className).toContain('bg-surface');
    });

    it('the focused (focus-visible) cell takes a primary border plus ring-focus, never static', () => {
      renderCell(singleCell(hoursToSeconds(4)));
      const btn = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
      const classTokens = btn.className.split(/\s+/);
      // D-7.3-15: applied via focus-visible:, never unconditionally present
      // (no bare "border-primary"/"ring-focus" token, only the prefixed one).
      expect(classTokens).toContain('focus-visible:border-primary');
      expect(classTokens).toContain('focus-visible:ring-focus');
      expect(classTokens).not.toContain('border-primary');
      expect(classTokens).not.toContain('ring-focus');
    });

    it('a weekend cell holding a value dims its text to text-muted (D-7.7-26/15, "one recessive object")', () => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <table>
            <tbody>
              <tr>
                <DayCell
                  rowKey="PROJ-1"
                  rowSummary="Build the grid"
                  dayIndex={5}
                  dayName="Saturday"
                  dayISO="2026-06-20"
                  cell={singleCell(hoursToSeconds(2))}
                  status={null}
                  onMutated={vi.fn()}
                />
              </tr>
            </tbody>
          </table>
        </QueryClientProvider>,
      );
      const btn = screen.getByLabelText('Hours for Saturday, PROJ-1 Build the grid');
      expect(btn.className).toContain('text-muted');
      expect(btn.className).not.toContain('text-foreground');
    });

    it('a weekend cell with NO value keeps the ordinary faint-decorative middot (flagged decision, kept simple)', () => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <table>
            <tbody>
              <tr>
                <DayCell
                  rowKey="PROJ-1"
                  rowSummary="Build the grid"
                  dayIndex={5}
                  dayName="Saturday"
                  dayISO="2026-06-20"
                  cell={emptyCell()}
                  status={null}
                  onMutated={vi.fn()}
                />
              </tr>
            </tbody>
          </table>
        </QueryClientProvider>,
      );
      const btn = screen.getByLabelText('Hours for Saturday, PROJ-1 Build the grid');
      expect(btn.textContent).toBe('·');
      expect(btn.className).toContain('text-faint-decorative');
    });

    it('a time-off cell fills with its own token trio — no icon (D-7.7-17)', () => {
      renderCell(singleCell(hoursToSeconds(8)), vi.fn(), 'time-off');
      const btn = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
      expect(btn.className).toContain('bg-time-off-fill');
      expect(btn.className).toContain('text-legacy-purple');
      expect(btn.className).toContain('border-time-off-border');
      expect(btn.querySelector('svg')).toBeNull();
    });

    it("the value-bearing cell's <td> carries the spoken-hours accessible name (D-7.7-24)", () => {
      renderCell(singleCell(hoursToSeconds(4)));
      const td = screen
        .getByLabelText('Hours for Monday, PROJ-1 Build the grid')
        .closest('td')!;
      expect(td.getAttribute('aria-label')).toBe('Monday, PROJ-1, 4 hours');
    });

    it('an empty cell\'s <td> carries no spoken-hours label (only the button label serves it)', () => {
      renderCell(emptyCell());
      const td = screen
        .getByLabelText('Hours for Monday, PROJ-1 Build the grid')
        .closest('td')!;
      expect(td.getAttribute('aria-label')).toBeNull();
    });
  });

  // --- Story 7.7, AC5: in-place editing — Tab / Enter ---------------------

  describe('in-place editing: Tab and Enter (AC5/D-7.7-33)', () => {
    it('Tab is never intercepted — no preventDefault, so native tab order (and the existing blur-commit) keeps working', () => {
      renderCell(singleCell(hoursToSeconds(4)));
      fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
      const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
      const preventDefault = vi.fn();
      fireEvent.keyDown(input, { key: 'Tab', preventDefault });
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('Enter commits AND fires onCommitAdvance (the new 7.7 delta)', async () => {
      const onCommitAdvance = vi.fn();
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <table>
            <tbody>
              <tr>
                <DayCell
                  rowKey="PROJ-1"
                  rowSummary="Build the grid"
                  dayIndex={0}
                  dayName="Monday"
                  dayISO="2026-06-15"
                  cell={emptyCell()}
                  status={null}
                  onMutated={vi.fn()}
                  onCommitAdvance={onCommitAdvance}
                />
              </tr>
            </tbody>
          </table>
        </QueryClientProvider>,
      );
      fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
      const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
      fireEvent.change(input, { target: { value: '2' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onCommitAdvance).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(postWorklogMock).toHaveBeenCalled());
    });

    it('Enter does NOT advance when the value is invalid (stays editing, no commit)', () => {
      const onCommitAdvance = vi.fn();
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <table>
            <tbody>
              <tr>
                <DayCell
                  rowKey="PROJ-1"
                  rowSummary="Build the grid"
                  dayIndex={0}
                  dayName="Monday"
                  dayISO="2026-06-15"
                  cell={emptyCell()}
                  status={null}
                  onMutated={vi.fn()}
                  onCommitAdvance={onCommitAdvance}
                />
              </tr>
            </tbody>
          </table>
        </QueryClientProvider>,
      );
      fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
      const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
      fireEvent.change(input, { target: { value: 'abc' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onCommitAdvance).not.toHaveBeenCalled();
      expect(postWorklogMock).not.toHaveBeenCalled();
    });
  });

  // --- Story 7.7, D-7.7-33: registerFocusable ------------------------------

  describe('registerFocusable (D-7.7-33)', () => {
    it('registers a focus function in display mode and unregisters while editing', () => {
      const registerFocusable = vi.fn();
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <table>
            <tbody>
              <tr>
                <DayCell
                  rowKey="PROJ-1"
                  rowSummary="Build the grid"
                  dayIndex={0}
                  dayName="Monday"
                  dayISO="2026-06-15"
                  cell={emptyCell()}
                  status={null}
                  onMutated={vi.fn()}
                  registerFocusable={registerFocusable}
                />
              </tr>
            </tbody>
          </table>
        </QueryClientProvider>,
      );
      // Registered with a real focus function while displaying.
      expect(registerFocusable).toHaveBeenCalledWith(expect.any(Function));
      registerFocusable.mockClear();

      fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
      // Unregistered (null) once the button unmounts for the editor.
      expect(registerFocusable).toHaveBeenCalledWith(null);
    });

    it('the registered focus function actually focuses the display button', () => {
      const captured: { fn: (() => void) | null } = { fn: null };
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <table>
            <tbody>
              <tr>
                <DayCell
                  rowKey="PROJ-1"
                  rowSummary="Build the grid"
                  dayIndex={0}
                  dayName="Monday"
                  dayISO="2026-06-15"
                  cell={emptyCell()}
                  status={null}
                  onMutated={vi.fn()}
                  registerFocusable={(fn) => {
                    captured.fn = fn;
                  }}
                />
              </tr>
            </tbody>
          </table>
        </QueryClientProvider>,
      );
      captured.fn?.();
      expect(document.activeElement).toBe(
        screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'),
      );
    });
  });
});

// The reported bug: entering hours and tabbing out made the number VANISH
// (back to the empty-cell middot) for the whole in-flight window, then
// reappear when the refetch landed. Display mode reads the server-derived
// `cell` prop, which still held the old value — so a cell went 3.0 → · → 3.0
// on every single save. In a time logger that reads as "my entry was lost".
describe('committed hours survive the in-flight window (no disappearing value)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postWorklogMock.mockResolvedValue({ kind: 'ok', value: { id: 'new-1', timeSpentSeconds: 10800 } });
    updateWorklogMock.mockResolvedValue({ kind: 'ok', value: { id: 'w-1', timeSpentSeconds: 10800 } });
    deleteWorklogMock.mockResolvedValue({ kind: 'ok', value: undefined });
  });

  it('keeps the typed hours on screen after Tab, while the POST is still in flight', () => {
    // A POST that never settles — the entire window under test.
    postWorklogMock.mockReturnValue(new Promise(() => {}));
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    const input = screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);

    // The cell prop is STILL the empty one — no refetch has happened.
    const btn = screen.getByRole('button');
    expect(btn.textContent).toBe('3.0');
    expect(btn.textContent).not.toBe('·');
  });

  it('dresses the cell as value-bearing, not as empty, while in flight', () => {
    // The regression was not only the digits: `hasValue` drove the fill,
    // border and text colour too, so the box also lost its white/bordered
    // treatment for the same window.
    postWorklogMock.mockReturnValue(new Promise(() => {}));
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    fireEvent.change(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'), {
      target: { value: '3' },
    });
    fireEvent.blur(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));

    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-surface');
    expect(btn.className).toContain('border-cell-border');
    expect(btn.className).not.toContain('text-faint-decorative');
  });

  it('speaks the committed hours too — the accessible name never lags the screen', () => {
    postWorklogMock.mockReturnValue(new Promise(() => {}));
    const { container } = renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    fireEvent.change(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'), {
      target: { value: '3' },
    });
    fireEvent.blur(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));

    expect(container.querySelector('td')?.getAttribute('aria-label')).toBe(
      'Monday, PROJ-1, 3 hours',
    );
  });

  it('hands back to the server once the refetched prop agrees', async () => {
    const { rerender } = renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    fireEvent.change(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'), {
      target: { value: '3' },
    });
    fireEvent.blur(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    await waitFor(() => expect(postWorklogMock).toHaveBeenCalled());

    // The refetch lands carrying the same value — no flicker either way.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <table>
          <tbody>
            <tr>
              <DayCell
                rowKey="PROJ-1"
                rowSummary="Build the grid"
                dayIndex={0}
                dayName="Monday"
                dayISO="2026-06-15"
                cell={singleCell(hoursToSeconds(3))}
                status={null}
                onMutated={vi.fn()}
              />
            </tr>
          </tbody>
        </table>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button').textContent).toBe('3.0');
  });

  it('clears to the empty glyph immediately on a delete — not the stale hours', () => {
    deleteWorklogMock.mockReturnValue(new Promise(() => {}));
    renderCell(singleCell(hoursToSeconds(4)));
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    fireEvent.change(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'), {
      target: { value: '' },
    });
    fireEvent.blur(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));

    expect(screen.getByRole('button').textContent).toBe('·');
  });

  it('KEEPS the value on a transient failure — it is queued and will land', async () => {
    postWorklogMock.mockResolvedValue({ kind: 'network', cause: 'offline' });
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    fireEvent.change(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'), {
      target: { value: '3' },
    });
    fireEvent.blur(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));

    await waitFor(() => expect(enqueueOutboxMock).toHaveBeenCalled());
    // The outbox owns it now, and the chip says so — the number must agree.
    expect(screen.getByRole('button').textContent).toBe('3.0');
  });

  it('DROPS the value when Jira refuses — a refused write exists nowhere but this screen', async () => {
    postWorklogMock.mockResolvedValue({ kind: 'forbidden' });
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    fireEvent.change(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'), {
      target: { value: '3' },
    });
    fireEvent.blur(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('button').textContent).toBe('·');
    expect(enqueueOutboxMock).not.toHaveBeenCalled();
  });

  it('re-opening after a transient failure seeds the editor from what is on screen', async () => {
    postWorklogMock.mockResolvedValue({ kind: 'rate-limited', retryAfterMs: 1000 });
    renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    fireEvent.change(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'), {
      target: { value: '3' },
    });
    fireEvent.blur(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    await waitFor(() => expect(enqueueOutboxMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button'));
    // Seeded from the queued 3.0, never from the stale empty prop.
    expect(
      (screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid') as HTMLInputElement).value,
    ).toBe('3');
  });

  it('yields to a THIRD value from the server — a concurrent change wins outright', async () => {
    const { rerender } = renderCell(emptyCell());
    fireEvent.click(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    fireEvent.change(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'), {
      target: { value: '3' },
    });
    fireEvent.blur(screen.getByLabelText('Hours for Monday, PROJ-1 Build the grid'));
    await waitFor(() => expect(postWorklogMock).toHaveBeenCalled());

    // Someone logged 5h to this cell elsewhere; the refetch reports THAT.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <table>
          <tbody>
            <tr>
              <DayCell
                rowKey="PROJ-1"
                rowSummary="Build the grid"
                dayIndex={0}
                dayName="Monday"
                dayISO="2026-06-15"
                cell={singleCell(hoursToSeconds(5))}
                status={null}
                onMutated={vi.fn()}
              />
            </tr>
          </tbody>
        </table>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button').textContent).toBe('5.0');
  });
});
