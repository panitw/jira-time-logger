import { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { TicketPicker } from '@/components/today/TicketPicker';
import { QuickLogForm } from '@/components/today/QuickLogForm';
import { LoggedToday, type LoggedEntry, type EditPatch } from '@/components/today/LoggedToday';
import { PtoQuickAction } from '@/components/today/PtoQuickAction';
import { secondsToHoursDisplay } from '@/lib/hours';
import { targetHoursItem, catchAllProjectKeyItem } from '@/lib/storage/settings';
import { log } from '@/lib/log';

const STRINGS = {
  heading: 'Today',
  pickLabel: 'Pick a ticket to log',
  catchAllNotConfiguredPrefix:
    'Catch-all not configured. Configure in ',
  settings: 'Settings',
  catchAllNotConfiguredSuffix: ' to log Admin/Meetings/PTO.',
};

export function TodayView(): React.ReactElement {
  const today = format(new Date(), 'EEE, MMM d');
  const [selectedTicket, setSelectedTicket] = useState<{ key: string; summary: string } | null>(null);
  const [loggedEntries, setLoggedEntries] = useState<LoggedEntry[]>([]);
  const [targetHours, setTargetHours] = useState(8);
  const [catchAllProjectKey, setCatchAllProjectKey] = useState<string | null>(null);

  useEffect(() => {
    void targetHoursItem.getValue().then(setTargetHours);
  }, []);

  useEffect(() => {
    void catchAllProjectKeyItem.getValue().then(setCatchAllProjectKey);
  }, []);

  const catchAllUnconfigured =
    catchAllProjectKey !== null && catchAllProjectKey.trim() === '';

  const openOptions = useCallback((): void => {
    chrome.runtime.openOptionsPage();
  }, []);

  const handleSelect = useCallback((ticketKey: string, ticketSummary: string): void => {
    log.info('today.ticket.picked', { key: ticketKey });
    setSelectedTicket({ key: ticketKey, summary: ticketSummary });
  }, []);

  const handleLogged = useCallback((entry: LoggedEntry): void => {
    setLoggedEntries((prev) => [...prev, entry]);
    setSelectedTicket(null);
  }, []);

  const handleCancel = useCallback((): void => {
    setSelectedTicket(null);
  }, []);

  const handleEdited = useCallback((worklogId: string, patch: EditPatch): void => {
    setLoggedEntries((prev) =>
      prev.map((e) =>
        e.worklogId === worklogId
          ? {
              ...e,
              hoursDisplay: patch.hoursDisplay,
              seconds: patch.seconds,
              started: patch.started,
              comment: patch.comment,
            }
          : e,
      ),
    );
  }, []);

  const handleDeleted = useCallback((worklogId: string): void => {
    setLoggedEntries((prev) => prev.filter((e) => e.worklogId !== worklogId));
  }, []);

  const totalSeconds = loggedEntries.reduce((sum, e) => sum + e.seconds, 0);
  const totalDisplay = secondsToHoursDisplay(totalSeconds);

  return (
    <div className="motion-safe:animate-fade-in">
      <h2 className="text-lg font-semibold text-neutral-900">
        {STRINGS.heading}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        {today} &middot; {totalDisplay} / {targetHours}h
      </p>

      <PtoQuickAction onLogged={handleLogged} />

      {catchAllUnconfigured && (
        <p className="mt-2 text-center text-sm text-neutral-500">
          {STRINGS.catchAllNotConfiguredPrefix}
          <button
            type="button"
            onClick={openOptions}
            className="text-accent hover:underline"
          >
            {STRINGS.settings}
          </button>
          {STRINGS.catchAllNotConfiguredSuffix}
        </p>
      )}

      <div className="mt-3">
        <LoggedToday
          entries={loggedEntries}
          onEdited={handleEdited}
          onDeleted={handleDeleted}
        />
      </div>

      <div className="mt-1">
        {selectedTicket ? (
          <QuickLogForm
            ticketKey={selectedTicket.key}
            ticketSummary={selectedTicket.summary}
            onLogged={handleLogged}
            onCancel={handleCancel}
          />
        ) : (
          <>
            <p className="text-xs font-medium text-neutral-500 mb-1">
              {STRINGS.pickLabel}
            </p>
            <TicketPicker onSelect={handleSelect} />
          </>
        )}
      </div>
    </div>
  );
}
