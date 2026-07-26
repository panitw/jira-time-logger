import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scan, criticalOrSerious } from '@/lib/test/axe';

const mockGetAuth = vi.fn();
const mockHasValidAuth = vi.fn();

vi.mock('@/lib/storage/tokens', () => ({
  getAuth: () => mockGetAuth(),
  hasValidAuth: (bundle: unknown) => mockHasValidAuth(bundle),
}));

vi.mock('@/lib/storage/settings', () => ({
  targetHoursItem: { getValue: async () => 8 },
}));

vi.mock('@/hooks/useTodayTotal', () => ({
  useTodayTotal: () => ({ seconds: 9000, isPending: false, isError: false }),
}));

// Story 7.2 Finding 9 (nit): TodayView and PtoQuickAction are stubbed to bare
// divs below, so the scans in this file cover the CHROME SHELL ONLY (header,
// action bar, disconnected panel) — not the popup body a user actually sees.
// That is intentional (it keeps this suite fast and focused on what 7.2
// itself built), but it means AC8's "the axe gate stays at zero
// Critical/Serious on every surface" should be read as shell-scoped here,
// not full-popup-scoped. The real `TodayView` subtree has its own dedicated
// scan in `components/today/TodayView.test.tsx` ("a11y scan (Story 6.1
// AC1)"), which is the coverage for the body these mocks hollow out.
vi.mock('@/components/today/TodayView', () => ({
  TodayView: () => <div data-testid="today-view">Today Placeholder</div>,
}));

vi.mock('@/lib/pto', () => ({
  logFullDayPto: vi.fn(),
  logHalfDayPto: vi.fn(),
}));
vi.mock('@/lib/messages', () => ({ sendMessage: vi.fn() }));
vi.mock('@/lib/storage/outbox', () => ({ enqueue: vi.fn(async () => ({})) }));
vi.mock('@/components/today/PtoQuickAction', () => ({
  PtoQuickAction: () => <div data-testid="pto-quick-action" />,
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
  // @ts-expect-error minimal chrome stub
  globalThis.chrome = { runtime: { openOptionsPage: vi.fn(), getURL: vi.fn((path: string) => `chrome-extension://abc/${path}`) }, tabs: { create: vi.fn() } };
});

describe('Popup shell a11y (Story 7.2 AC8)', () => {
  it('connected popup has zero Critical/Serious axe violations', async () => {
    mockGetAuth.mockResolvedValue({ kind: 'oauth', access_token: 't' });
    mockHasValidAuth.mockReturnValue(true);
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('today-view')).toBeTruthy());
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });

  it('disconnected popup has zero Critical/Serious axe violations', async () => {
    mockGetAuth.mockResolvedValue(null);
    mockHasValidAuth.mockReturnValue(false);
    const { container } = renderApp();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connect to Jira' })).toBeTruthy(),
    );
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });
});
