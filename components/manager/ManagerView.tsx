import { ManagerMatrix } from '@/components/manager/ManagerMatrix';
import type { FullPageSection } from '@/lib/open-full-page';
import { type CycleId } from '@/lib/storage/view-state';

/**
 * Manager view (Story 5.3): renders the person × Epic approval matrix.
 *
 * Thin wrapper that keeps the `{ cycle: CycleId }` prop and `App.tsx` wiring
 * stable while delegating the grid, per-row progressive load, and empty states
 * to `ManagerMatrix`. `onSwitchToToday` flips the popup to the Worker/Today
 * view for the no-reports defensive fallback (AC 13).
 *
 * Story 7.10, D-7.10-30: `section`/`onSectionChange`/`showManagerTab` pass
 * straight through to `ManagerMatrix` (and on into `MatrixChromeHeader`) —
 * this wrapper adds no chrome of its own (D-7.7-22).
 */
type Props = {
  cycle: CycleId;
  onSwitchToToday: () => void;
  section: FullPageSection;
  onSectionChange: (section: FullPageSection) => void;
  showManagerTab: boolean;
};

export function ManagerView({
  cycle,
  onSwitchToToday,
  section,
  onSectionChange,
  showManagerTab,
}: Props): React.ReactElement {
  return (
    <ManagerMatrix
      cycle={cycle}
      onSwitchToToday={onSwitchToToday}
      section={section}
      onSectionChange={onSectionChange}
      showManagerTab={showManagerTab}
    />
  );
}
