import { useState, useCallback } from 'react';
import { reminderTimeItem } from '@/lib/storage/settings';

const STRINGS = {
  label: 'Daily reminder time',
};

type Props = {
  onSaved?: () => void;
};

export function ReminderTimeField({ onSaved }: Props): React.ReactElement {
  const [time, setTime] = useState('17:00');
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    void (async () => {
      setTime(await reminderTimeItem.getValue());
      setLoaded(true);
    })();
  }

  const handleBlur = useCallback(async () => {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    await reminderTimeItem.setValue(time);
    onSaved?.();
  }, [time, onSaved]);

  const handleTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTime(e.target.value);
  }, []);

  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700">{STRINGS.label}</label>
      <input
        type="time"
        value={time}
        onChange={handleTimeChange}
        onBlur={() => void handleBlur()}
        className="mt-1 block w-32 rounded-md border border-neutral-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
      />
    </div>
  );
}