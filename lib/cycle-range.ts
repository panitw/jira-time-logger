/**
 * Current approval cycle date range computation.
 *
 * For Story 2.4, only 'calendar-month' cadence is implemented.
 * Weekly cadence is future work.
 */

export type CycleRange = {
  start: Date;
  end: Date;
};

export function currentCycleRange(cycle: string, reference: Date = new Date()): CycleRange {
  if (cycle === 'weekly') {
    const day = reference.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(reference);
    start.setDate(reference.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  // Default: calendar-month
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function isWithinCycle(date: Date, cycle: string, reference: Date = new Date()): boolean {
  const { start, end } = currentCycleRange(cycle, reference);
  return date >= start && date <= end;
}
