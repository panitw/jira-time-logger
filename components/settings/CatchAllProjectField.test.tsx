/* eslint-disable import/order */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/storage/settings', () => ({
  catchAllProjectKeyItem: { getValue: vi.fn(async () => 'KNP'), setValue: vi.fn(async () => {}) },
  ptoSubtaskKeyItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  ptoSubtaskSummaryItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  managerDisplayNameItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  skipLevelDisplayNameItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  reminderTimeItem: { getValue: vi.fn(async () => '17:00'), setValue: vi.fn(async () => {}) },
  targetHoursItem: { getValue: vi.fn(async () => 8), setValue: vi.fn(async () => {}) },
  approvalCycleItem: { getValue: vi.fn(async () => 'calendar-month'), setValue: vi.fn(async () => {}) },
  lastSyncTimestampItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  setManagerNames: vi.fn(async () => {}),
  getManagerNames: vi.fn(async () => ({ managerDisplayName: null, skipLevelDisplayName: null })),
}));
vi.mock('@/lib/storage/tokens', () => ({
  getAuth: vi.fn(async () => null),
  setAuth: vi.fn(),
  clearAuth: vi.fn(),
  hasValidAuth: vi.fn(() => false),
}));
vi.mock('@/lib/scheduler', () => ({
  scheduler: { acquire: vi.fn((fn: () => Promise<unknown>) => fn()) },
}));
vi.mock('@/lib/oauth/refresh', () => ({
  refreshTokens: vi.fn(async () => ({ kind: 'auth-expired' })),
}));

vi.stubGlobal('chrome', {
  runtime: { id: 'test' },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});
vi.stubGlobal('fetch', vi.fn());
vi.stubGlobal('btoa', (s: string) => Buffer.from(s).toString('base64'));

import { CatchAllProjectField } from './CatchAllProjectField';

describe('CatchAllProjectField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders section heading', async () => {
    render(<CatchAllProjectField />);
    await waitFor(() => {
      expect(screen.getByText('Catch-all project')).toBeTruthy();
    });
  });

  it('shows KNP as default placeholder after loading', async () => {
    render(<CatchAllProjectField />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('KNP')).toBeTruthy();
    });
  });

  it('shows validation error when project key is invalid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
      headers: new Headers(),
    } as Response);

    render(<CatchAllProjectField />);
    await waitFor(() => screen.getByPlaceholderText('KNP'));

    const input = screen.getByPlaceholderText('KNP');
    fireEvent.change(input, { target: { value: 'INVALID' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Project key not found or no access — check the key and your permissions',
        ),
      ).toBeTruthy();
    });
  });

  it.skip('shows (default) helper when key is KNP', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ issues: [] }),
        headers: new Headers(),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ issues: [] }),
        headers: new Headers(),
      } as Response);

    render(<CatchAllProjectField />);
    await waitFor(() => {
      expect(screen.getByText('(default)')).toBeTruthy();
    });
  });
});