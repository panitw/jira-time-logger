import { useCallback, useState } from 'react';
import { TicketPicker } from '@/components/today/TicketPicker';
import { Button } from '@/components/ui/button';
import { secondsToCellDisplay } from '@/lib/hours';
import { log } from '@/lib/log';
import { DAYS_PER_WEEK, type WeekGrid, type WeekGridRow } from '@/lib/week-grid';

const STRINGS = {
  dayHeadersShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  dayNamesLong: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ],
  subtaskColHeader: 'Subtask',
  totalsRowLabel: 'Daily totals',
  addSubtask: '+ Add a subtask to this week',
  markWeekDone: 'Mark week as done',
};

type Props = { grid: WeekGrid };

/** A locally-added subtask row (Story 4.1) — all-`──` cells, no worklog posted. */
type LocalRow = { key: string; summary: string };

function emptyCells(): number[] {
  return new Array<number>(DAYS_PER_WEEK).fill(0);
}

export function WeeklyGrid({ grid }: Props): React.ReactElement {
  const [localRows, setLocalRows] = useState<LocalRow[]>([]);
  const [picking, setPicking] = useState(false);

  const existingKeys = new Set(grid.rows.map((r) => r.key));

  const handlePick = useCallback(
    (ticketKey: string, ticketSummary: string): void => {
      log.info('week.add-subtask.picked', { key: ticketKey });
      setLocalRows((prev) => {
        if (existingKeys.has(ticketKey) || prev.some((r) => r.key === ticketKey)) {
          return prev;
        }
        return [...prev, { key: ticketKey, summary: ticketSummary }];
      });
      setPicking(false);
    },
    // existingKeys is derived from props each render; depending on grid.rows is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid.rows],
  );

  // Local rows render as all-`──` rows for the rest of this popup session.
  // Reconcile against the live grid rows each render: if a locally-added key
  // later arrives via a refetch (e.g. a worklog was posted to it elsewhere),
  // drop the local placeholder so the row is not rendered twice (duplicate
  // React keys / phantom empty row).
  const localGridRows: WeekGridRow[] = localRows
    .filter((r) => !existingKeys.has(r.key))
    .map((r) => ({
      key: r.key,
      summary: r.summary,
      category: 'task',
      cellsSeconds: emptyCells(),
      rowTotalSeconds: 0,
    }));
  const allRows = [...grid.rows, ...localGridRows];

  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="px-1 py-1 text-left text-xs font-medium text-neutral-500"
            >
              {STRINGS.subtaskColHeader}
            </th>
            {STRINGS.dayHeadersShort.map((label) => (
              <th
                key={label}
                scope="col"
                className="px-1 py-1 text-right text-xs font-medium text-neutral-500"
              >
                {label}
              </th>
            ))}
          </tr>
          <tr aria-label={STRINGS.totalsRowLabel} className="border-b border-neutral-200">
            <th
              scope="row"
              className="px-1 py-1 text-left text-xs font-medium text-neutral-500"
            >
              {STRINGS.totalsRowLabel}
            </th>
            {grid.dayTotalsSeconds.map((seconds, i) => (
              <td
                key={STRINGS.dayHeadersShort[i] ?? i}
                className="px-1 py-1 text-right font-mono text-xs text-neutral-500"
              >
                {secondsToCellDisplay(seconds)}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {allRows.map((row) => (
            <tr key={row.key} className="border-b border-neutral-100">
              <th
                scope="row"
                className="max-w-[140px] truncate px-1 py-1 text-left font-normal"
                title={`${row.key} ${row.summary}`}
              >
                <span className="font-mono text-neutral-900">{row.key}</span>{' '}
                <span className="text-neutral-700">{row.summary}</span>
              </th>
              {row.cellsSeconds.map((seconds, i) => (
                <td
                  key={STRINGS.dayHeadersShort[i] ?? i}
                  className="px-1 py-1 text-right font-mono text-neutral-700"
                  aria-label={`Hours for ${STRINGS.dayNamesLong[i]}, ${row.key} ${row.summary}`}
                >
                  {secondsToCellDisplay(seconds)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2">
        {picking ? (
          <TicketPicker onSelect={handlePick} />
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="rounded px-1 py-1 text-sm text-neutral-500 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {STRINGS.addSubtask}
          </button>
        )}
      </div>

      <div className="mt-4 flex justify-center">
        <Button variant="primary" disabled>
          {STRINGS.markWeekDone}
        </Button>
      </div>
    </div>
  );
}
