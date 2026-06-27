import { type CycleId } from '@/lib/storage/view-state';

/**
 * Placeholder Manager view (Story 5.2 seam).
 *
 * This is the clean seam for Story 5.3's person × Epic approval matrix:
 * 5.3 replaces this body with the real `ManagerMatrix` (per-row TanStack
 * queries, cell coloring, drill-down) while keeping this component's
 * `{ cycle: CycleId }` prop and `App.tsx` wiring unchanged. It does NOT fetch
 * any data. The "you're not anyone's manager" empty state also lives in 5.3,
 * not here.
 */
const STRINGS = {
  heading: 'Manager',
  body: 'The approval matrix for your reports will appear here.',
};

export function ManagerView({ cycle }: { cycle: CycleId }): React.ReactElement {
  return (
    <div className="motion-safe:animate-fade-in" data-cycle={cycle}>
      <h2 className="text-lg font-semibold text-neutral-900">{STRINGS.heading}</h2>
      <p className="mt-1 text-sm text-neutral-500">{STRINGS.body}</p>
    </div>
  );
}
