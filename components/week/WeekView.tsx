import { format, parseISO, isValid } from 'date-fns';
import type { ISODate } from '@/lib/storage/view-state';

type Props = { weekOf: ISODate };

const STRINGS = {
  headingPrefix: 'Week of',
  invalidDate: 'Unknown week',
};

export function WeekView({ weekOf }: Props): React.ReactElement {
  const parsed = parseISO(weekOf);
  const displayDate = isValid(parsed)
    ? format(parsed, 'EEE, MMM d')
    : STRINGS.invalidDate;

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">
        {STRINGS.headingPrefix} {displayDate}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">0h logged</p>
    </div>
  );
}