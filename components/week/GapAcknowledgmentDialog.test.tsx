import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GapAcknowledgmentDialog } from './GapAcknowledgmentDialog';
import { hoursToSeconds } from '@/lib/hours';
import type { WeekGap } from '@/lib/week-gaps';

const TODAY = '2026-06-19';

function gap(dayIndex: number, dayName: string, iso: string, logged: number): WeekGap {
  return {
    dayIndex,
    dayName,
    iso,
    loggedSeconds: logged,
    targetSeconds: 8 * 3600,
    timeOffSeconds: 0,
  };
}

const defaultProps = {
  weekLoggedSeconds: hoursToSeconds(28),
  weekTargetSeconds: hoursToSeconds(40),
  dailyTargetHours: 8,
  today: TODAY,
};

describe('GapAcknowledgmentDialog', () => {
  // --- AC7: title is the WEEK total, "N of 40h" -----------------------

  it('titles with the WEEK total, not the gap count (D-7.7-34 point 4)', () => {
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
        {...defaultProps}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('Close the week at 28 of 40h?')).toBeTruthy();
  });

  it('the framing sentence uses the REAL day count and the REAL daily target — singular', () => {
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
        {...defaultProps}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/^1 day is under 8h\. That's fine if it's accurate/),
    ).toBeTruthy();
  });

  it('the framing sentence pluralizes for multiple gaps and uses a non-8 target when configured', () => {
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(1, 'Tuesday', '2026-06-16', 0), gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
        {...defaultProps}
        dailyTargetHours={7}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/^2 days are under 7h\. That's fine if it's accurate/),
    ).toBeTruthy();
  });

  // --- Evidence rows: day / logged-target / note ------------------------

  it('renders one evidence row per gap with day, logged/target, and an honest note', () => {
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(1, 'Tuesday', '2026-06-16', 0), gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
        {...defaultProps}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Tue 16');
    expect(items[0]?.textContent).toContain('0 / 8h');
    expect(items[0]?.textContent).toContain('Workday with nothing logged');
    expect(items[1]?.textContent).toContain('Thu 18');
    expect(items[1]?.textContent).toContain('4 / 8h');
    expect(items[1]?.textContent).toContain('4h short');
  });

  it('never renders the stale "not marked as time off" copy', () => {
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
        {...defaultProps}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByText(/not marked as time off/)).toBeNull();
    expect(screen.queryByText(/not marked time off/)).toBeNull();
  });

  // --- Required checkbox gates the primary ------------------------------

  describe('the required checkbox gates "Close the week" (D-7.7-34 point 1)', () => {
    it('the primary is disabled until the checkbox is checked', () => {
      render(
        <GapAcknowledgmentDialog
          open
          gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
          {...defaultProps}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />,
      );
      const primary = screen.getByRole('button', { name: 'Close the week' }) as HTMLButtonElement;
      expect(primary.disabled).toBe(true);
    });

    it('checking the box enables the primary; clicking it fires onConfirm', () => {
      const onConfirm = vi.fn();
      render(
        <GapAcknowledgmentDialog
          open
          gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
          {...defaultProps}
          onCancel={vi.fn()}
          onConfirm={onConfirm}
        />,
      );
      const checkbox = screen.getByRole('checkbox', {
        name: "These hours are correct. I'm not missing time.",
      });
      fireEvent.click(checkbox);
      const primary = screen.getByRole('button', { name: 'Close the week' }) as HTMLButtonElement;
      expect(primary.disabled).toBe(false);
      fireEvent.click(primary);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('clicking the disabled primary before checking does NOT confirm (RED-provable: remove `disabled` to see it fail)', () => {
      const onConfirm = vi.fn();
      render(
        <GapAcknowledgmentDialog
          open
          gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
          {...defaultProps}
          onCancel={vi.fn()}
          onConfirm={onConfirm}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Close the week' }));
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('is a real, keyboard-reachable <input type="checkbox"> in a <label>, not a decorative span', () => {
      render(
        <GapAcknowledgmentDialog
          open
          gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
          {...defaultProps}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />,
      );
      const checkbox = screen.getByRole('checkbox', {
        name: "These hours are correct. I'm not missing time.",
      });
      expect(checkbox.tagName).toBe('INPUT');
      expect((checkbox as HTMLInputElement).type).toBe('checkbox');
    });
  });

  // --- Focus + focus trap -------------------------------------------------

  it('puts default focus on the checkbox, not the (disabled) primary', async () => {
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
        {...defaultProps}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox', {
      name: "These hours are correct. I'm not missing time.",
    });
    await waitFor(() => expect(document.activeElement).toBe(checkbox));
  });

  // --- Backdrop must NOT dismiss; Esc still cancels (AC7) ------------------

  describe('backdrop vs Esc (AC7) — RED-provable by removing onPointerDownOutside', () => {
    // Radix's dismissable-layer defers attaching its OWN `pointerdown`
    // listener by one `setTimeout(0)` tick (so the very pointerdown that
    // OPENED the dialog can't immediately close it) — the test must let
    // that tick pass before firing the outside pointerdown, or the event
    // never reaches Radix at all and the assertion is a false positive
    // (passes identically whether `onPointerDownOutside` is wired or not).
    it('a pointer-down outside the dialog does NOT close it', async () => {
      const onCancel = vi.fn();
      render(
        <GapAcknowledgmentDialog
          open
          gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
          {...defaultProps}
          onCancel={onCancel}
          onConfirm={vi.fn()}
        />,
      );
      expect(screen.getByRole('dialog')).toBeTruthy();
      // Let Radix's deferred outside-pointerdown listener attach.
      await new Promise((resolve) => setTimeout(resolve, 0));
      fireEvent.pointerDown(document.body);
      expect(onCancel).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('Esc still triggers onCancel ("Keep editing") — never onConfirm', () => {
      const onCancel = vi.fn();
      const onConfirm = vi.fn();
      render(
        <GapAcknowledgmentDialog
          open
          gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
          {...defaultProps}
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
  });

  it('"Keep editing" triggers onCancel (not onConfirm)', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <GapAcknowledgmentDialog
        open
        gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
        {...defaultProps}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(
      <GapAcknowledgmentDialog
        open={false}
        gaps={[gap(3, 'Thursday', '2026-06-18', 4 * 3600)]}
        {...defaultProps}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
