/* eslint-disable import-x/order */
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
}));

import { DiagnosticsBlock } from './DiagnosticsBlock';

/**
 * Retargeted for Story 7.10 / AC3 (Diagnostics reworked into a two-row
 * hairline fact table). The button label follows the design source
 * (`round2:338`: "Clear cache", was "Clear local cache").
 */
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

  it('shows the Clear cache button', async () => {
    render(<DiagnosticsBlock />);
    await waitFor(() => expect(screen.getByText('Clear cache')).toBeTruthy());
  });

  it('shows "Cleared" after clicking clear cache', async () => {
    render(<DiagnosticsBlock />);
    await waitFor(() => screen.getByText('Clear cache'));
    fireEvent.click(screen.getByText('Clear cache'));
    await waitFor(() => expect(screen.getByText('Cleared')).toBeTruthy());
  });
});
