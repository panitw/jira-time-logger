import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scan, criticalOrSerious } from '@/lib/test/axe';

// --- Storage / network boundary mocks (render the REAL options surface) ----

function item<T>(value: T) {
  return {
    getValue: vi.fn(async () => value),
    setValue: vi.fn(async () => {}),
    watch: vi.fn(() => () => {}),
  };
}

vi.mock('@/lib/storage/settings', () => ({
  catchAllProjectKeyItem: item<string>(''),
  ptoSubtaskKeyItem: item<string | null>(null),
  ptoSubtaskSummaryItem: item<string | null>(null),
  reminderTimeItem: item<string>('17:00'),
  targetHoursItem: item<number>(8),
  approvalCycleItem: item<string>('calendar-month'),
  lastSyncTimestampItem: item<number | null>(null),
}));

const mockGetAuth = vi.fn();
const mockHasValidAuth = vi.fn();
vi.mock('@/lib/storage/tokens', () => ({
  getAuth: () => mockGetAuth(),
  hasValidAuth: (b: unknown) => mockHasValidAuth(b),
  setAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/manager-resolution', () => ({
  resolveReportingLine: vi.fn(async () => ({
    kind: 'ok',
    value: { managerDisplayName: 'Carol Boss', skipLevelDisplayName: 'Dave Lead' },
  })),
}));

vi.mock('@/lib/disconnect', () => ({ disconnectAll: vi.fn(async () => {}) }));

vi.mock('@/lib/storage/quota', () => ({
  getStorageUsedBytes: vi.fn(async () => 1024),
  clearCache: vi.fn(async () => {}),
}));

vi.mock('@/lib/jira-client', () => ({ jiraGet: vi.fn(async () => ({ kind: 'ok', value: {} })) }));

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { App } = await import('./App');

beforeEach(() => {
  vi.clearAllMocks();
  // Default: connected via API token (no network fetch needed for meta).
  mockGetAuth.mockResolvedValue({
    kind: 'api-token',
    email: 'me@example.com',
    siteUrl: 'https://acme.atlassian.net',
  });
  mockHasValidAuth.mockReturnValue(true);
});

describe('Options page a11y (Story 6.1 AC1)', () => {
  it('connected options page has zero Critical/Serious axe violations', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText(/Connection/)).toBeInTheDocument());
    // Let the manager-resolution effect settle.
    await waitFor(() => expect(screen.queryByText(/Carol Boss/)).toBeTruthy());
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });

  it('first-run (disconnected) options page has zero Critical/Serious axe violations', async () => {
    mockHasValidAuth.mockReturnValue(false);
    mockGetAuth.mockResolvedValue(null);
    const { container } = render(<App />);
    // ConnectButton renders once first-run resolves.
    await waitFor(() => expect(container.querySelector('button')).toBeTruthy());
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });

  it('the header brand icon is decorative (empty alt — not announced as an image)', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText(/Connection/)).toBeInTheDocument());
    const img = container.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('');
  });
});
