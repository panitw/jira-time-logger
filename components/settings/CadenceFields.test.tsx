/* eslint-disable import/order */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('chrome', {
  runtime: { id: 'test' },
  storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
});

vi.mock('@/lib/storage/settings', () => ({
  reminderTimeItem: { getValue: vi.fn(async () => '09:30'), setValue: vi.fn(async () => {}) },
  targetHoursItem: { getValue: vi.fn(async () => 10), setValue: vi.fn(async () => {}) },
  approvalCycleItem: { getValue: vi.fn(async () => 'calendar-month'), setValue: vi.fn(async () => {}) },
  catchAllProjectKeyItem: { getValue: vi.fn(async () => 'KNP'), setValue: vi.fn(async () => {}) },
  ptoSubtaskKeyItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  ptoSubtaskSummaryItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  managerDisplayNameItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  skipLevelDisplayNameItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  lastSyncTimestampItem: { getValue: vi.fn(async () => null), setValue: vi.fn(async () => {}) },
  setManagerNames: vi.fn(async () => {}),
  getManagerNames: vi.fn(async () => ({ managerDisplayName: null, skipLevelDisplayName: null })),
}));

import { ReminderTimeField } from './ReminderTimeField';
import { TargetHoursField } from './TargetHoursField';
import { CycleField } from './CycleField';

describe('ReminderTimeField', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows label', async () => {
    render(<ReminderTimeField />);
    await waitFor(() => expect(screen.getByText('Daily reminder time')).toBeTruthy());
  });

  it('shows stored value (09:30) not default (17:00)', async () => {
    render(<ReminderTimeField />);
    await waitFor(() => expect(screen.getByDisplayValue('09:30')).toBeTruthy());
  });

  it('shows error on invalid format', async () => {
    render(<ReminderTimeField />);
    await waitFor(() => screen.getByDisplayValue('09:30'));
    const input = screen.getByDisplayValue('09:30');
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText('Use 24-hour format (e.g. 17:00)')).toBeTruthy());
  });

  it('saves valid time on blur', async () => {
    const onSaved = vi.fn();
    render(<ReminderTimeField onSaved={onSaved} />);
    await waitFor(() => screen.getByDisplayValue('09:30'));
    const input = screen.getByDisplayValue('09:30');
    fireEvent.change(input, { target: { value: '12:00' } });
    fireEvent.blur(input);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

describe('TargetHoursField', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows label', async () => {
    render(<TargetHoursField />);
    await waitFor(() => expect(screen.getByText('Work-day target (hours)')).toBeTruthy());
  });

  it('shows stored value (10) not default (8)', async () => {
    render(<TargetHoursField />);
    await waitFor(() => expect(screen.getByDisplayValue('10')).toBeTruthy());
  });

  it('shows error when value < 1', async () => {
    render(<TargetHoursField />);
    await waitFor(() => screen.getByDisplayValue('10'));
    const input = screen.getByDisplayValue('10');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText('Must be at least 1')).toBeTruthy());
  });

  it('shows error when value > 24', async () => {
    render(<TargetHoursField />);
    await waitFor(() => screen.getByDisplayValue('10'));
    const input = screen.getByDisplayValue('10');
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText('Must be at most 24')).toBeTruthy());
  });

  it('saves valid hours on blur', async () => {
    const onSaved = vi.fn();
    render(<TargetHoursField onSaved={onSaved} />);
    await waitFor(() => screen.getByDisplayValue('10'));
    const input = screen.getByDisplayValue('10');
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.blur(input);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

describe('CycleField', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows label and default option', async () => {
    render(<CycleField />);
    await waitFor(() => {
      expect(screen.getByText('Approval cycle')).toBeTruthy();
      expect(screen.getByText('Calendar month')).toBeTruthy();
    });
  });

  it('saves on change', async () => {
    const onSaved = vi.fn();
    render(<CycleField onSaved={onSaved} />);
    await waitFor(() => screen.getByText('Approval cycle'));
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'calendar-month' } });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});