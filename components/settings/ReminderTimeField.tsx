import { useCallback, useEffect, useState } from 'react';
import { reminderTimeItem } from '@/lib/storage/settings';

const STRINGS = {
  label: 'Daily reminder time',
  error: 'Use 24-hour format (e.g. 17:00)',
};

type Props = {
  onSaved?: () => void;
};

export function ReminderTimeField({ onSaved }: Props): React.ReactElement {
  const [time, setTime] = useState('17:00');
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const stored = await reminderTimeItem.getValue();
      if (!ac.signal.aborted) {
        setTime(stored);
        setLoaded(true);
      }
    })();
    return () => ac.abort();
  }, []);

  const handleBlur = useCallback(async () => {
    const match = time.match(/^(\d{2}):(\d{2})$/);
    if (!match) { setError(true); return; }
    const hh = parseInt(match[1]!, 10);
    const mm = parseInt(match[2]!, 10);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) { setError(true); return; }
    setError(false);
    await reminderTimeItem.setValue(time);
    onSaved?.();
  }, [time, onSaved]);

  const handleTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTime(e.target.value);
    setError(false);
  }, []);

  const handleBlurWithRevert = useCallback(() => {
    void handleBlur().then(() => { /* success */ }).catch(() => {
      void (async () => {
        const stored = await reminderTimeItem.getValue();
        setTime(stored);
        setError(false);
      })();
    });
  }, [handleBlur]);

  if (!loaded) return <div><label className="block text-sm font-medium text-neutral-700">{STRINGS.label}</label><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;

  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700">{STRINGS.label}</label>
      <input
        type="time"
        value={time}
        onChange={handleTimeChange}
        onBlur={handleBlurWithRevert}
        className={`mt-1 block w-32 rounded-md border px-3 py-1.5 text-sm ${error ? 'border-state-danger focus:ring-state-danger' : 'border-neutral-200 focus:ring-accent'} focus:outline-none focus:ring-2 focus:ring-offset-1`}
      />
      {error && <p className="mt-1 text-xs text-state-danger">{STRINGS.error}</p>}
    </div>
  );
}