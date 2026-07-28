/* eslint-disable import-x/order */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/storage/settings', () => ({
  reminderTimeItem: { getValue: vi.fn(async () => '09:30'), setValue: vi.fn(async () => {}) },
  targetHoursItem: { getValue: vi.fn(async () => 10), setValue: vi.fn(async () => {}) },
  approvalCycleItem: { getValue: vi.fn(async () => 'calendar-month'), setValue: vi.fn(async () => {}) },
}));

import { ReminderTimeField } from './ReminderTimeField';
import { TargetHoursField } from './TargetHoursField';
import { CycleField } from './CycleField';

/**
 * Retargeted for Story 7.10 / AC9 (label rename: "Daily reminder time" →
 * "Daily reminder", "Work-day target (hours)" → "Work-day target", each now
 * with a one-line consequence) and D-7.6-37 (red → amber: nothing was ever
 * sent to Jira for a client-side format/range check).
 */
describe('ReminderTimeField', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the AC9 label and its consequence', async () => {
    render(<ReminderTimeField />);
    await waitFor(() => expect(screen.getByText('Daily reminder')).toBeTruthy());
    expect(
      screen.getByText("The popup nudges you to log time after this if today's hours look short."),
    ).toBeTruthy();
  });

  it('shows stored value (09:30) not default (17:00)', async () => {
    render(<ReminderTimeField />);
    await waitFor(() => expect(screen.getByDisplayValue('09:30')).toBeTruthy());
  });

  it('shows an AMBER error on invalid format, never red', async () => {
    render(<ReminderTimeField />);
    await waitFor(() => screen.getByDisplayValue('09:30'));
    const input = screen.getByDisplayValue('09:30');
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText('Use 24-hour format (e.g. 17:00)')).toBeTruthy());
    const errorText = screen.getByText('Use 24-hour format (e.g. 17:00)');
    expect(errorText.className).toMatch(/text-amber-ink/);
    expect(errorText.className).not.toMatch(/state-danger/);
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

  it('shows the AC9 label and its consequence', async () => {
    render(<TargetHoursField />);
    await waitFor(() => expect(screen.getByText('Work-day target')).toBeTruthy());
    expect(
      screen.getByText('Sets your daily target for the week and matrix progress bars.'),
    ).toBeTruthy();
    expect(screen.getByText('hours per day')).toBeTruthy();
  });

  it('shows stored value (10) not default (8)', async () => {
    render(<TargetHoursField />);
    await waitFor(() => expect(screen.getByDisplayValue('10')).toBeTruthy());
  });

  it('shows an AMBER error when value < 1, never red', async () => {
    render(<TargetHoursField />);
    await waitFor(() => screen.getByDisplayValue('10'));
    const input = screen.getByDisplayValue('10');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText('Must be at least 1')).toBeTruthy());
    const errorText = screen.getByText('Must be at least 1');
    expect(errorText.className).toMatch(/text-amber-ink/);
    expect(errorText.className).not.toMatch(/state-danger/);
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

  it('shows the AC9 label, its consequence, and the single option — not hidden, not disabled', async () => {
    render(<CycleField />);
    await waitFor(() => {
      expect(screen.getByText('Approval cycle')).toBeTruthy();
      expect(screen.getByText('How often approvals run — for now, every calendar month.')).toBeTruthy();
      expect(screen.getByText('Calendar month')).toBeTruthy();
    });
    expect(screen.getByRole('combobox')).not.toBeDisabled();
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
