import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const logFullDayPtoMock = vi.fn();
const logHalfDayPtoMock = vi.fn();
vi.mock('@/lib/pto', () => ({
  logFullDayPto: (...args: unknown[]) => logFullDayPtoMock(...args),
  logHalfDayPto: (...args: unknown[]) => logHalfDayPtoMock(...args),
}));

vi.mock('@/lib/messages', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('@/lib/storage/outbox', () => ({
  enqueue: vi.fn(async () => ({})),
}));

const ptoKeyGetValue = vi.fn(async () => 'KNP-99' as string | null);
vi.mock('@/lib/storage/settings', () => ({
  ptoSubtaskKeyItem: { getValue: () => ptoKeyGetValue() },
  ptoSubtaskSummaryItem: { getValue: async () => 'PTO' },
  targetHoursItem: { getValue: async () => 8 },
}));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { PopupActionBar } = await import('./PopupActionBar');

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('PopupActionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ptoKeyGetValue.mockResolvedValue('KNP-99');
    logFullDayPtoMock.mockResolvedValue({
      kind: 'ok',
      value: { id: 'wl-1', timeSpentSeconds: 28800 },
    });
    // @ts-expect-error minimal chrome stub
    globalThis.chrome = { runtime: { openOptionsPage: vi.fn(), getURL: vi.fn((path: string) => `chrome-extension://abc/${path}`) }, tabs: { create: vi.fn() } };
  });

  it('renders both actions', async () => {
    renderWithProviders(<PopupActionBar onLogged={vi.fn()} />);
    expect(await screen.findByText('Mark today as time off')).toBeTruthy();
    expect(screen.getByText('Open week')).toBeTruthy();
  });

  it('the time-off trigger is the ghost variant', async () => {
    renderWithProviders(<PopupActionBar onLogged={vi.fn()} />);
    const trigger = (await screen.findByText('Mark today as time off')).closest('button')!;
    expect(trigger.className).toContain('bg-transparent');
    expect(trigger.className).not.toContain('bg-accent');
  });

  it('the time-off popover opens upward (bottom-full)', async () => {
    renderWithProviders(<PopupActionBar onLogged={vi.fn()} />);
    const trigger = await screen.findByText('Mark today as time off');
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu', { name: 'Time off options' });
    expect(menu.className).toContain('bottom-full');
    expect(menu.className).not.toContain('top-full');
  });

  it('the time-off popover is keyboard-dismissable with Esc and restores focus to the trigger', async () => {
    renderWithProviders(<PopupActionBar onLogged={vi.fn()} />);
    const trigger = await screen.findByText('Mark today as time off');
    fireEvent.click(trigger);
    expect(await screen.findByText('Full day (8h)')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Full day (8h)')).toBeNull();
    });
    expect(document.activeElement).toBe(trigger.closest('button'));
  });

  it('calling onLogged when time off is posted successfully', async () => {
    const onLogged = vi.fn();
    renderWithProviders(<PopupActionBar onLogged={onLogged} />);
    fireEvent.click(await screen.findByText('Mark today as time off'));
    fireEvent.click(await screen.findByText('Full day (8h)'));

    await waitFor(() => {
      expect(onLogged).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'KNP-99', seconds: 28800 }),
      );
    });
  });

  it('"Open week" has an accessible name naming the new-tab behaviour and opens fullpage.html?section=week', async () => {
    renderWithProviders(<PopupActionBar onLogged={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Open week review in a new tab' });
    fireEvent.click(button);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://abc/fullpage.html?section=week',
    });
  });
});
