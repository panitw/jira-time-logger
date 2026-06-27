/**
 * Current approval cycle date range computation.
 *
 * Supports 'calendar-month' and 'weekly' cadences. The badge counter
 * (Story 3.1) uses the weekly Monday boundary plus `workdaysSoFar`.
 */
import { format } from 'date-fns';

import { type CycleId } from '@/lib/storage/view-state';

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

/**
 * Canonical cycle-id producer (Story 5.2) — the single source of the cycle
 * identifier string used across Epic 5 (manager view-state, Story 5.1 approval
 * comment `cycle` field, dirty-detection, posted approval comments).
 *
 *   calendar-month → `format(reference, 'yyyy-MM')`  e.g. "2026-06"
 *   weekly         → ISO Monday `yyyy-MM-dd` of `currentCycleRange('weekly').start`
 *
 * Reuses `currentCycleRange` for the weekly Monday so the id never diverges
 * from the range math. Do NOT hand-roll a parallel cycle-id format elsewhere —
 * Story 5.1's checksummed `cycle` keys on this exact string.
 */
export function getCurrentCycleId(approvalCycle: string, reference: Date = new Date()): CycleId {
  if (approvalCycle === 'weekly') {
    return format(currentCycleRange('weekly', reference).start, 'yyyy-MM-dd');
  }
  return format(reference, 'yyyy-MM');
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
