import { format, parse, parseISO, isValid } from 'date-fns';
import type { CycleId } from '@/lib/storage/view-state';

/**
 * Cycle title from the `cycle` id: `"2026-05"` → `"May 2026"`; a weekly id
 * (`yyyy-MM-dd`) falls back to `"MMM d"`. Mirrors the `getCurrentCycleId`
 * shapes. Pure (React-free) so both the manager matrix and the drill-down
 * panel can reuse it without a heavyweight cross-component import.
 */
export function formatCycleTitle(cycle: CycleId): string {
  const monthly = parse(cycle, 'yyyy-MM', new Date());
  if (isValid(monthly) && /^\d{4}-\d{2}$/.test(cycle)) {
    return format(monthly, 'MMMM yyyy');
  }
  const weekly = parseISO(cycle);
  if (isValid(weekly)) return format(weekly, 'MMM d');
  return cycle;
}
