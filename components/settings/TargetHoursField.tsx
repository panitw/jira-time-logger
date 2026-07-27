import { useCallback, useEffect, useState } from 'react';
import { FieldLabel } from '@/components/settings/SettingsPrimitives';
import { targetHoursItem } from '@/lib/storage/settings';

/**
 * Work-day target (Story 7.10, AC3/AC6/AC9, Logging-defaults item 3).
 * `round2:298-304`.
 *
 * D-7.6-37, deferred here: nothing was sent to Jira for a client-side range
 * check — red is reserved for a write Jira actually refused. Amber, not red
 * (was `border-state-danger`/`text-state-danger`).
 */

const STRINGS = {
  label: 'Work-day target',
  consequence: 'Sets your daily target for the week and matrix progress bars.',
  suffix: 'hours per day',
  errorTooLow: 'Must be at least 1',
  errorTooHigh: 'Must be at most 24',
};

type Props = {
  onSaved?: (() => void) | undefined;
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

  if (!loaded) {
    return <div aria-hidden="true" className="h-[34px] animate-skeleton rounded-md bg-border-faint" />;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel
        label={STRINGS.label}
        consequence={STRINGS.consequence}
        htmlFor="target-hours-input"
      />
      <div
        className={`flex h-[34px] items-center gap-1.5 rounded-md bg-surface px-[11px] focus-within:border-[1.5px] focus-within:border-primary focus-within:ring-focus ${
          error ? 'border-[1.5px] border-amber-border' : 'border border-border'
        }`}
      >
        <input
          id="target-hours-input"
          type="number"
          value={hours}
          onChange={handleHoursChange}
          onBlur={handleBlurWithRevert}
          min={1}
          max={24}
          aria-describedby={error ? 'target-hours-error' : undefined}
          className="w-10 border-none bg-transparent p-0 font-chrome text-body tabular text-foreground focus:outline-none"
        />
        <span className="text-body-sm text-faint">{STRINGS.suffix}</span>
      </div>
      {error && (
        <p id="target-hours-error" className="text-body-sm text-amber-ink">
          {error}
        </p>
      )}
    </div>
  );
}
