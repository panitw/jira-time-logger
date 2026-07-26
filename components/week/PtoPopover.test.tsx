import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const logFullDayPtoMock = vi.fn();
const logHalfDayPtoMock = vi.fn();
vi.mock('@/lib/pto', () => ({
  logFullDayPto: (...args: unknown[]) => logFullDayPtoMock(...args),
  logHalfDayPto: (...args: unknown[]) => logHalfDayPtoMock(...args),
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

const { PtoPopover } = await import('./PtoPopover');

type Overrides = Partial<React.ComponentProps<typeof PtoPopover>>;

function renderPopover(overrides: Overrides = {}) {
  const onAddWorklog = overrides.onAddWorklog ?? vi.fn();
  const onMutated = overrides.onMutated ?? vi.fn();
  const props: React.ComponentProps<typeof PtoPopover> = {
    dayIndex: 3,
    dayName: 'Thursday',
    dayLabel: 'May 15',
    dayISO: '2026-05-15',
    loggedSeconds: 14400, // 4.0h
    ptoSubtaskKey: 'KNP-99',
    targetHours: 8,
    onAddWorklog,
    onMutated,
    ...overrides,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      {/* Host the trigger inside a real th to mirror production usage. */}
      <table>
        <thead>
          <tr>
            <th scope="col">
              <PtoPopover {...props} />
            </th>
          </tr>
        </thead>
      </table>
    </QueryClientProvider>,
  );
  return { ...utils, onAddWorklog, onMutated };
}

function openPopover() {
  fireEvent.click(
    screen.getByRole('button', {
      name: /Time off and worklog actions for Thursday, May 15/,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  logFullDayPtoMock.mockResolvedValue({
    kind: 'ok',
    value: { id: 'wl-1', timeSpentSeconds: 28800 },
  });
  logHalfDayPtoMock.mockResolvedValue({
    kind: 'ok',
    value: { id: 'wl-2', timeSpentSeconds: 14400 },
  });
  // @ts-expect-error minimal chrome stub
  globalThis.chrome = { runtime: { openOptionsPage: vi.fn() } };
});

describe('PtoPopover', () => {
  it('renders a labelled trigger button inside the header', () => {
    renderPopover();
    const trigger = screen.getByRole('button', {
      name: 'Time off and worklog actions for Thursday, May 15',
    });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // The short day label remains visible.
    expect(trigger.textContent).toContain('Thu');
  });

  it('opens a popover with the three actions + Currently footer', () => {
    renderPopover();
    openPopover();
    expect(screen.getByText('Thursday')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Mark full-day time off \(8h\)/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Mark half-day time off \(4h\)/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Add a worklog/ })).toBeTruthy();
    expect(screen.getByText(/Currently: 4h logged/)).toBeTruthy();
  });

  it('renders Currently: 0h logged when the day has no hours', () => {
    renderPopover({ loggedSeconds: 0 });
    openPopover();
    expect(screen.getByText(/Currently: 0h logged/)).toBeTruthy();
  });

  it('Mark full-day PTO posts via logFullDayPto for the CLICKED day, fires badge + onMutated, closes', async () => {
    const { onMutated } = renderPopover();
    openPopover();
    fireEvent.click(screen.getByRole('menuitem', { name: /Mark full-day time off/ }));

    await waitFor(() => {
      expect(logFullDayPtoMock).toHaveBeenCalledWith('KNP-99', 8, expect.any(String));
    });
    // started is 09:00 local on the clicked day (2026-05-15), not today.
    const started = logFullDayPtoMock.mock.calls[0]![2] as string;
    expect(new Date(started).getTime()).toBe(
      new Date('2026-05-15T09:00:00').getTime(),
    );
    expect(sendMessageMock).toHaveBeenCalledWith('badge-update', { hoursMissing: 0 });
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: /Mark full-day time off/ })).toBeNull();
    });
  });

  it('Mark half-day PTO posts via logHalfDayPto', async () => {
    renderPopover();
    openPopover();
    fireEvent.click(screen.getByRole('menuitem', { name: /Mark half-day time off/ }));
    await waitFor(() => {
      expect(logHalfDayPtoMock).toHaveBeenCalledWith('KNP-99', 8, expect.any(String));
    });
  });

  it('transient failure → enqueues outbox post + shows Pending chip, no onMutated/badge', async () => {
    logFullDayPtoMock.mockResolvedValueOnce({ kind: 'network', cause: 'offline' });
    const { onMutated } = renderPopover();
    openPopover();
    fireEvent.click(screen.getByRole('menuitem', { name: /Mark full-day time off/ }));

    await waitFor(() => {
      expect(screen.getByText('Pending — will retry')).toBeTruthy();
    });
    expect(enqueueOutboxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'post',
        issueKey: 'KNP-99',
        body: expect.objectContaining({ timeSpentSeconds: 28800 }),
      }),
    );
    expect(onMutated).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('persistent failure → inline error, no onMutated/badge/enqueue', async () => {
    logFullDayPtoMock.mockResolvedValueOnce({ kind: 'forbidden' });
    const { onMutated } = renderPopover();
    openPopover();
    fireEvent.click(screen.getByRole('menuitem', { name: /Mark full-day time off/ }));

    await waitFor(() => {
      expect(screen.getByText(/Couldn.t mark time off/)).toBeTruthy();
    });
    expect(onMutated).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(enqueueOutboxMock).not.toHaveBeenCalled();
  });

  it('PTO unconfigured → PTO buttons disabled + Settings link; Add a worklog stays enabled', () => {
    const { onAddWorklog } = renderPopover({ ptoSubtaskKey: null });
    openPopover();
    const full = screen.getByRole('menuitem', { name: /Mark full-day time off/ }) as HTMLButtonElement;
    const half = screen.getByRole('menuitem', { name: /Mark half-day time off/ }) as HTMLButtonElement;
    expect(full.disabled).toBe(true);
    expect(half.disabled).toBe(true);
    expect(screen.getByText(/Time off subtask not configured/)).toBeTruthy();

    fireEvent.click(screen.getByText('Settings'));
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();

    const add = screen.getByRole('menuitem', { name: /Add a worklog/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    expect(onAddWorklog).toHaveBeenCalled();
  });

  it('PTO unconfigured → focus lands on the enabled Add a worklog action, not the disabled PTO button', () => {
    renderPopover({ ptoSubtaskKey: null });
    openPopover();
    const add = screen.getByRole('menuitem', { name: /Add a worklog/ }) as HTMLButtonElement;
    // The first PTO action is disabled (unfocusable); focus must fall back to
    // the enabled action rather than dropping to <body>.
    expect(document.activeElement).toBe(add);
  });

  it('Add a worklog… closes the popover and calls onAddWorklog', () => {
    const { onAddWorklog } = renderPopover();
    openPopover();
    fireEvent.click(screen.getByRole('menuitem', { name: /Add a worklog/ }));
    expect(onAddWorklog).toHaveBeenCalled();
    expect(screen.queryByRole('menuitem', { name: /Add a worklog/ })).toBeNull();
  });

  it('Esc closes the popover', () => {
    renderPopover();
    openPopover();
    expect(screen.getByRole('menuitem', { name: /Mark full-day time off/ })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menuitem', { name: /Mark full-day time off/ })).toBeNull();
  });

  it('click-outside closes the popover', () => {
    renderPopover();
    openPopover();
    expect(screen.getByRole('menuitem', { name: /Mark full-day time off/ })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menuitem', { name: /Mark full-day time off/ })).toBeNull();
  });
});
