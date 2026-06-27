import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GapAcknowledgmentDialog } from '@/components/week/GapAcknowledgmentDialog';
import { log } from '@/lib/log';
import { sendMessage } from '@/lib/messages';
import type { ISODate } from '@/lib/storage/view-state';
import { setWeekMarkedDone } from '@/lib/storage/view-state';
import { type WeekGap, computeWeekGaps } from '@/lib/week-gaps';
import type { WeekGrid } from '@/lib/week-grid';

const STRINGS = {
  markWeekDone: 'Mark week as done',
};

/**
 * The Mark-week-as-done CTA + gap-check + confirmation flow (Story 4.5,
 * FR24/FR25/FR26). Always-enabled primary button: the Mon–Fri gap-check runs on
 * click. Zero gaps → mark done immediately (no dialog); ≥1 gap → open the
 * `GapAcknowledgmentDialog`. The write is local-only (`setWeekMarkedDone`) and
 * broadcasts `badge-update` so the SW recomputes the toolbar badge to 0.
 */
export function MarkAsDoneButton({
  grid,
  weekOf,
  targetHours,
  onMarkedDone,
}: {
  grid: WeekGrid;
  weekOf: ISODate;
  targetHours: number;
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

  return (
    <>
      <Button variant="primary" onClick={handleClick}>
        {STRINGS.markWeekDone}
      </Button>
      <GapAcknowledgmentDialog
        open={dialogOpen}
        gaps={gaps}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
