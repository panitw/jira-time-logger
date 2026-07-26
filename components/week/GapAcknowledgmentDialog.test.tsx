import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GapAcknowledgmentDialog } from './GapAcknowledgmentDialog';
import type { WeekGap } from '@/lib/week-gaps';

function gap(dayIndex: number, dayName: string, logged: number): WeekGap {
  return {
    dayIndex,
    dayName,
    loggedSeconds: logged,
    targetSeconds: 8 * 3600,
  };
}

describe('GapAcknowledgmentDialog', () => {
  it('renders the singular body sentence for one gap (1 day is …)', () => {
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(3, 'Thursday', 4 * 3600)]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText('1 day is short of target and not marked as time off. Submit anyway?'),
    ).toBeTruthy();
  });

  it('renders the plural body sentence for multiple gaps (N days are …)', () => {
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(1, 'Tuesday', 0), gap(3, 'Thursday', 4 * 3600)]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText('2 days are short of target and not marked as time off. Submit anyway?'),
    ).toBeTruthy();
  });

  it('lists one <li> per gap with the factual summary', () => {
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(1, 'Tuesday', 0), gap(3, 'Thursday', 4 * 3600)]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toBe(
      'Tuesday: 0h logged / 8h target, not marked time off',
    );
    expect(items[1]?.textContent).toBe(
      'Thursday: 4h logged / 8h target, not marked time off',
    );
  });

  it('puts default focus on Submit anyway', async () => {
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(3, 'Thursday', 4 * 3600)]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const submit = screen.getByRole('button', { name: 'Submit anyway' });
    await waitFor(() => expect(document.activeElement).toBe(submit));
  });

  it('Cancel triggers onCancel (not onConfirm)', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(3, 'Thursday', 4 * 3600)]}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Esc triggers onCancel (never onConfirm)', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(3, 'Thursday', 4 * 3600)]}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    });
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Submit anyway triggers onConfirm', () => {
    const onConfirm = vi.fn();
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(3, 'Thursday', 4 * 3600)]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit anyway' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    render(
      <GapAcknowledgmentDialog
        open={false}
        gaps={[gap(3, 'Thursday', 4 * 3600)]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
