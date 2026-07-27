import { useCallback, useEffect, useState } from 'react';
import { FieldLabel } from '@/components/settings/SettingsPrimitives';
import { reminderTimeItem } from '@/lib/storage/settings';

/**
 * Daily reminder (Story 7.10, AC3/AC6/AC9, Logging-defaults item 4).
 * `round2:305-311`.
 *
 * D-7.6-37, deferred here: nothing was sent to Jira for a client-side format
 * check — red is reserved for a write Jira actually refused. Amber, not red
 * (was `border-state-danger`/`text-state-danger`).
 */

const STRINGS = {
  label: 'Daily reminder',
  consequence: "The popup nudges you to log time after this if today's hours look short.",
  error: 'Use 24-hour format (e.g. 17:00)',
};

type Props = {
  onSaved?: (() => void) | undefined;
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
    if (!match) {
      setError(true);
      return;
    }
    const hh = parseInt(match[1]!, 10);
    const mm = parseInt(match[2]!, 10);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      setError(true);
      return;
    }
    setError(false);
    await reminderTimeItem.setValue(time);
    onSaved?.();
  }, [time, onSaved]);

  const handleTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTime(e.target.value);
    setError(false);
  }, []);

  const handleBlurWithRevert = useCallback(() => {
    void handleBlur()
      .then(() => {
        /* success */
      })
      .catch(() => {
        void (async () => {
          const stored = await reminderTimeItem.getValue();
          setTime(stored);
          setError(false);
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
        htmlFor="reminder-time-input"
      />
      <div
        className={`flex h-[34px] items-center rounded-md bg-surface px-[11px] focus-within:border-[1.5px] focus-within:border-primary focus-within:ring-focus ${
          error ? 'border-[1.5px] border-amber-border' : 'border border-border'
        }`}
      >
        <input
          id="reminder-time-input"
          type="time"
          value={time}
          onChange={handleTimeChange}
          onBlur={handleBlurWithRevert}
          aria-describedby={error ? 'reminder-time-error' : undefined}
          className="w-full border-none bg-transparent p-0 font-chrome text-body tabular text-foreground focus:outline-none"
        />
      </div>
      {error && (
        <p id="reminder-time-error" className="text-body-sm text-amber-ink">
          {STRINGS.error}
        </p>
      )}
    </div>
  );
}
