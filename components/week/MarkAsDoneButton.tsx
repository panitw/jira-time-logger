import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GapAcknowledgmentDialog } from '@/components/week/GapAcknowledgmentDialog';
import { hoursToSeconds } from '@/lib/hours';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import type { ISODate } from '@/lib/storage/view-state';
import { setWeekMarkedDone } from '@/lib/storage/view-state';
import { type WeekGap, computeWeekGaps, WORKDAYS_PER_WEEK } from '@/lib/week-gaps';
import type { WeekGrid } from '@/lib/week-grid';
import { todayDateString } from '@/lib/worklog-date';

const STRINGS = {
  markWeekDone: 'Mark week as done',
};

/**
 * The Mark-week-as-done CTA + gap-check + confirmation flow (Story 4.5,
 * FR24/FR25/FR26; restyled/relocated by Story 7.7's `WeekChromeHeader`,
 * AC2/AC7). Always-enabled primary button: the Mon–Fri gap-check runs on
 * click. Zero gaps → mark done immediately (no dialog); ≥1 gap → open the
 * `GapAcknowledgmentDialog`. The write is local-only (`setWeekMarkedDone`) and
 * broadcasts `badge-update` so the SW recomputes the toolbar badge to 0.
 *
 * Story 7.7: this is now the product's ONLY "Mark week as done" button — it
 * used to also render at the bottom of `WeeklyGrid`; that copy was removed
 * when `WeekChromeHeader` gained the AC2-mandated header button, so the
 * product never ships two (the Dev Notes' "Files" section says so
 * explicitly). `chrome` switches its `Button` to the white-on-gradient
 * variant for that header context; `today` threads through to the dialog's
 * per-gap notes (`gapDayNote`/`dayStatusNote`, D-7.7-19).
 */
export function MarkAsDoneButton({
  grid,
  weekOf,
  targetHours,
  today = todayDateString(),
  chrome = false,
  onMarkedDone,
}: {
  grid: WeekGrid;
  weekOf: ISODate;
  targetHours: number;
  today?: ISODate;
  /** Renders the white-on-gradient `Button` variant for `WeekChromeHeader`'s
   * purple canvas instead of the data-surface primary button. */
  chrome?: boolean;
  onMarkedDone: () => void;
}): React.ReactElement {
  const [gaps, setGaps] = useState<WeekGap[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const markDone = useCallback(async () => {
    try {
      await setWeekMarkedDone(weekOf);
      void sendMessage('badge-update', { hoursMissing: 0 });
      onMarkedDone();
    } catch (e) {
      log.error('week.mark-done.failed', { weekOf, cause: String(e) });
    }
  }, [weekOf, onMarkedDone]);

  const handleClick = useCallback(() => {
    const found = computeWeekGaps(grid, { targetHours });
    if (found.length === 0) {
      void markDone();
      return;
    }
    setGaps(found);
    setDialogOpen(true);
  }, [grid, targetHours, markDone]);

  const handleConfirm = useCallback(() => {
    setDialogOpen(false);
    void markDone();
  }, [markDone]);

  const handleCancel = useCallback(() => {
    setDialogOpen(false);
  }, []);

  // D-7.7-34 point 4: "N of 40h" is the WEEK total, not the gap count.
  // `grid.dayTotalsSeconds` is the same source `WeekView`'s own week-total
  // math sums — no second, divergent computation of the week total.
  const weekLoggedSeconds = grid.dayTotalsSeconds.reduce((sum, s) => sum + s, 0);
  const weekTargetSeconds = hoursToSeconds(targetHours * WORKDAYS_PER_WEEK);

  return (
    <>
      <Button variant={chrome ? 'chrome' : 'primary'} onClick={handleClick}>
        {STRINGS.markWeekDone}
      </Button>
      <GapAcknowledgmentDialog
        open={dialogOpen}
        gaps={gaps}
        weekLoggedSeconds={weekLoggedSeconds}
        weekTargetSeconds={weekTargetSeconds}
        dailyTargetHours={targetHours}
        today={today}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
