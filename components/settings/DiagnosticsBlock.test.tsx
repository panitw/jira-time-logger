/* eslint-disable import/order */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('chrome', {
  runtime: { id: 'test' },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      getBytesInUse: vi.fn(async () => 5000),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

vi.mock('@/lib/storage/settings', () => ({
  lastSyncTimestampItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  catchAllProjectKeyItem: { getValue: vi.fn(async () => 'KNP'), setValue: vi.fn(async () => {}) },
  ptoSubtaskKeyItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  ptoSubtaskSummaryItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  managerDisplayNameItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  skipLevelDisplayNameItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  reminderTimeItem: { getValue: vi.fn(async () => '17:00'), setValue: vi.fn(async () => {}) },
  targetHoursItem: { getValue: vi.fn(async () => 8), setValue: vi.fn(async () => {}) },
  approvalCycleItem: { getValue: vi.fn(async () => 'calendar-month'), setValue: vi.fn(async () => {}) },
  setManagerNames: vi.fn(async () => {}),
  getManagerNames: vi.fn(async () => ({
    managerDisplayName: null,
    skipLevelDisplayName: null,
    managerAccountId: null,
    skipLevelAccountId: null,
  })),
}));

import { DiagnosticsBlock } from './DiagnosticsBlock';

describe('DiagnosticsBlock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders heading', async () => {
    render(<DiagnosticsBlock />);
    await waitFor(() => expect(screen.getByText('Diagnostics')).toBeTruthy());
  });

  it('shows "never" when last sync is null', async () => {
    render(<DiagnosticsBlock />);
    await waitFor(() => expect(screen.getByText('never')).toBeTruthy());
  });

  it('shows clear cache button', async () => {
    render(<DiagnosticsBlock />);
    await waitFor(() => expect(screen.getByText('Clear local cache')).toBeTruthy());
  });

  it('shows "Cleared" after clicking clear cache', async () => {
    render(<DiagnosticsBlock />);
    await waitFor(() => screen.getByText('Clear local cache'));
    fireEvent.click(screen.getByText('Clear local cache'));
    await waitFor(() => expect(screen.getByText('Cleared')).toBeTruthy());
  });
});