import { useCallback, useEffect, useState } from 'react';
import { FieldLabel } from '@/components/settings/SettingsPrimitives';
import { approvalCycleItem } from '@/lib/storage/settings';

/**
 * Approval cycle (Story 7.10, AC3/AC9, Logging-defaults item 5).
 * `round2:314-320`.
 *
 * D-7.10-46: exactly one option today (`calendar-month`) and renders
 * normally, as the design draws it — not hidden, not disabled, and no
 * second cycle invented just because a `<select>` "should" have choices.
 */

const STRINGS = {
  label: 'Approval cycle',
  consequence: 'How often approvals run — for now, every calendar month.',
  optionCalendarMonth: 'Calendar month',
};

type Props = {
  onSaved?: (() => void) | undefined;
};

export function CycleField({ onSaved }: Props): React.ReactElement {
  const [cycle, setCycle] = useState('calendar-month');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const stored = await approvalCycleItem.getValue();
      if (!ac.signal.aborted) {
        setCycle(stored);
        setLoaded(true);
      }
    })();
    return () => ac.abort();
  }, []);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setCycle(value);
      await approvalCycleItem.setValue(value);
      onSaved?.();
    },
    [onSaved],
  );

  if (!loaded) {
    return <div aria-hidden="true" className="h-[34px] animate-skeleton rounded-md bg-border-faint" />;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={STRINGS.label} consequence={STRINGS.consequence} htmlFor="cycle-select" />
      <select
        id="cycle-select"
        value={cycle}
        onChange={(e) => void handleChange(e)}
        className="h-[34px] w-full rounded-md border border-border bg-surface px-[11px] font-data text-body text-foreground focus:outline-none focus-visible:border-[1.5px] focus-visible:border-primary focus-visible:ring-focus"
      >
        <option value="calendar-month">{STRINGS.optionCalendarMonth}</option>
      </select>
    </div>
  );
}
