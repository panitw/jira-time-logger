import { format } from 'date-fns';
import { TicketPicker } from '@/components/today/TicketPicker';
import { log } from '@/lib/log';

const STRINGS = {
  heading: 'Today',
  totalPlaceholder: '0h logged',
  pickLabel: 'Pick a ticket to log',
};

export function TodayView(): React.ReactElement {
  const today = format(new Date(), 'EEE, MMM d');

  const handleSelect = (ticketKey: string, _ticketSummary: string): void => {
    log.info('today.ticket.picked', { key: ticketKey });
  };

  return (
    <div className="motion-safe:animate-fade-in">
      <h2 className="text-lg font-semibold text-neutral-900">
        {STRINGS.heading}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        {today} &middot; {STRINGS.totalPlaceholder}
      </p>
      <div className="mt-3">
        <p className="text-xs font-medium text-neutral-500 mb-1">
          {STRINGS.pickLabel}
        </p>
        <TicketPicker onSelect={handleSelect} />
      </div>
    </div>
  );
}
