/**
 * Current approval cycle date range computation.
 *
 * Supports 'calendar-month' and 'weekly' cadences. The badge counter
 * (Story 3.1) uses the weekly Monday boundary plus `workdaysSoFar`.
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

/**
 * Count of Mon–Fri workdays from the current week's Monday through `reference`
 * inclusive. Anchored to the same Monday boundary as
 * `currentCycleRange('weekly')` so badge deficit math stays consistent with the
 * week range.
 *
 *   Monday    → 1
 *   Friday    → 5
 *   Saturday  → 5 (weekend does not add workdays)
 *   Sunday    → 5
 */
export function workdaysSoFar(reference: Date = new Date()): number {
  const day = reference.getDay();
  // getDay(): Sun=0, Mon=1, ... Sat=6. Workdays elapsed this week (Mon..reference).
  if (day === 0 || day === 6) return 5; // weekend: full work week elapsed
  return day; // Mon=1 ... Fri=5
}
