import { ManagerMatrix } from '@/components/manager/ManagerMatrix';
import { type CycleId } from '@/lib/storage/view-state';

/**
 * Manager view (Story 5.3): renders the person × Epic approval matrix.
 *
 * Thin wrapper that keeps the `{ cycle: CycleId }` prop and `App.tsx` wiring
 * stable while delegating the grid, per-row progressive load, and empty states
 * to `ManagerMatrix`. `onSwitchToToday` flips the popup to the Worker/Today
 * view for the no-reports defensive fallback (AC 13).
 */
type Props = {
  cycle: CycleId;
  onSwitchToToday: () => void;
};

export function ManagerView({ cycle, onSwitchToToday }: Props): React.ReactElement {
  return <ManagerMatrix cycle={cycle} onSwitchToToday={onSwitchToToday} />;
}
