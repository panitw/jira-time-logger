import { useState, useCallback } from 'react';
import { approvalCycleItem } from '@/lib/storage/settings';

const STRINGS = {
  label: 'Approval cycle',
  optionCalendarMonth: 'Calendar month',
};

type Props = {
  onSaved?: () => void;
};

export function CycleField({ onSaved }: Props): React.ReactElement {
  const [cycle, setCycle] = useState('calendar-month');
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    void (async () => {
      setCycle(await approvalCycleItem.getValue());
      setLoaded(true);
    })();
  }

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setCycle(value);
      await approvalCycleItem.setValue(value);
      onSaved?.();
    },
    [onSaved],
  );

  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700">{STRINGS.label}</label>
      <select
        value={cycle}
        onChange={(e) => void handleChange(e)}
        className="mt-1 block w-48 rounded-md border border-neutral-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
      >
        <option value="calendar-month">{STRINGS.optionCalendarMonth}</option>
      </select>
    </div>
  );
}