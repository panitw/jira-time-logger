const STRINGS = {
  heading: 'Logged today',
  empty: 'Nothing logged today yet. Pick a ticket below to start.',
};

export type LoggedEntry = {
  key: string;
  summary: string;
  hoursDisplay: string;
  started: string;
  seconds: number;
};

type LoggedTodayProps = {
  entries: LoggedEntry[];
};

export function LoggedToday({ entries }: LoggedTodayProps): React.ReactElement | null {
  if (entries.length === 0) {
    return (
      <div className="mb-3">
        <p className="text-xs font-medium text-neutral-500 mb-1">{STRINGS.heading}</p>
        <p className="text-sm text-neutral-400">{STRINGS.empty}</p>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <p className="text-xs font-medium text-neutral-500 mb-1">{STRINGS.heading}</p>
      <div className="rounded-md border border-neutral-200 divide-y divide-neutral-100">
        {entries.map((entry, i) => (
          <div
            key={`${entry.key}-${entry.started}-${i}`}
            className="flex items-center gap-2 px-3 py-1.5 animate-slide-in"
          >
            <span className="font-mono text-sm font-medium text-neutral-900 shrink-0">
              {entry.key}
            </span>
            <span className="text-sm text-neutral-700 truncate flex-1">
              {entry.summary}
            </span>
            <span className="font-mono text-sm font-medium text-neutral-700 shrink-0">
              {entry.hoursDisplay}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
