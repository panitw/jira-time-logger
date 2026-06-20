import { useCallback, useEffect, useState } from 'react';
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

  if (!loaded) return <div><label className="block text-sm font-medium text-neutral-700">{STRINGS.label}</label><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;

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