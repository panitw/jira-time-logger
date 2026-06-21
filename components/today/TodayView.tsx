import { format } from 'date-fns';

const STRINGS = {
  heading: 'Today',
  totalPlaceholder: '0h logged',
};

export function TodayView(): React.ReactElement {
  const today = format(new Date(), 'EEE, MMM d');

  return (
    <div className="motion-safe:animate-fade-in">
      <h2 className="text-lg font-semibold text-neutral-900">
        {STRINGS.heading}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        {today} &middot; {STRINGS.totalPlaceholder}
      </p>
    </div>
  );
}