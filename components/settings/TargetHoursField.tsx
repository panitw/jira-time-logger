import { useCallback, useEffect, useState } from 'react';
import { targetHoursItem } from '@/lib/storage/settings';

const STRINGS = {
  label: 'Work-day target (hours)',
  errorTooLow: 'Must be at least 1',
  errorTooHigh: 'Must be at most 24',
};

type Props = {
  onSaved?: () => void;
};

export function TargetHoursField({ onSaved }: Props): React.ReactElement {
  const [hours, setHours] = useState('8');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const stored = await targetHoursItem.getValue();
      if (!ac.signal.aborted) {
        setHours(String(stored));
        setLoaded(true);
      }
    })();
    return () => ac.abort();
  }, []);

  const handleBlur = useCallback(async () => {
    const num = parseFloat(hours);
    if (Number.isNaN(num) || num < 1 || !Number.isInteger(num)) {
      setError(STRINGS.errorTooLow);
      return;
    }
    if (num > 24) {
      setError(STRINGS.errorTooHigh);
      return;
    }
    setError(null);
    await targetHoursItem.setValue(num);
    onSaved?.();
  }, [hours, onSaved]);

  const handleHoursChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setHours(e.target.value);
    setError(null);
  }, []);

  const handleBlurWithRevert = useCallback(() => {
    void handleBlur().catch(() => {
      void (async () => {
        const stored = await targetHoursItem.getValue();
        setHours(String(stored));
        setError(null);
      })();
    });
  }, [handleBlur]);

  if (!loaded) return <div><label className="block text-sm font-medium text-neutral-700">{STRINGS.label}</label><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;

  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700">{STRINGS.label}</label>
      <input
        type="number"
        value={hours}
        onChange={handleHoursChange}
        onBlur={handleBlurWithRevert}
        min={1}
        max={24}
        className={`mt-1 block w-24 rounded-md border px-3 py-1.5 text-sm ${error ? 'border-state-danger focus:ring-state-danger' : 'border-neutral-200 focus:ring-accent'} focus:outline-none focus:ring-2 focus:ring-offset-1`}
      />
      {error && <p className="mt-1 text-xs text-state-danger">{error}</p>}
    </div>
  );
}