import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DrillDownPanel } from './DrillDownPanel';
import type { ReportEpicWorklogs } from '@/lib/jira-types';

// Guard: the panel must NEVER touch the network. If anything in the panel's
// import graph tried to fetch, this spy would catch a global fetch call.
const fetchSpy = vi.spyOn(globalThis, 'fetch');

function epicData(over: Partial<ReportEpicWorklogs> = {}): ReportEpicWorklogs {
  return {
    epicKey: 'PROJ-A',
    epicSummary: 'PROJ-A summary',
    totalSeconds: 64 * 3600,
    restrictedCount: 0,
    worklogs: [],
    ...over,
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof DrillDownPanel>> = {}) {
  return render(
    <DrillDownPanel
      open
      onOpenChange={() => {}}
      personName="Sarah"
      epicKey="PROJ-A"
      cycle="2026-05"
      epic={epicData()}
      {...props}
    />,
  );
}

describe('DrillDownPanel', () => {
  it('renders the header "<Person> · <EpicKey> · <Cycle>"', () => {
    renderPanel();
    expect(screen.getByText('Sarah · PROJ-A · May 2026')).toBeTruthy();
  });

  it('renders the total-hours line from totalSeconds (spelled-out "hours")', () => {
    renderPanel({ epic: epicData({ totalSeconds: 64 * 3600 }) });
    expect(screen.getByText('64 hours')).toBeTruthy();
  });

  it('renders one decimal total when not whole', () => {
    renderPanel({ epic: epicData({ totalSeconds: 12.5 * 3600 }) });
    expect(screen.getByText('12.5 hours')).toBeTruthy();
  });

  it('shows a tiny-but-nonzero total as 0.x hours, never a bare "0 hours"', () => {
    // 60s rounds to 0.0 → the matrix cell shows `──`, but the header must not
    // read "0 hours" while a ticket row below shows the contribution.
    renderPanel({ epic: epicData({ totalSeconds: 60 }) });
    expect(screen.getByText('0.0 hours')).toBeTruthy();
    expect(screen.queryByText('0 hours')).toBeNull();
  });

  it('renders a semantic <ul> with one <li> per ticket (key + summary + Nh)', () => {
    renderPanel({
      epic: epicData({
        worklogs: [
          { ticketKey: 'PROJ-A-101', ticketSummary: 'Epic planning', seconds: 12 * 3600 },
          { ticketKey: 'PROJ-A-102', ticketSummary: 'Build', seconds: 32 * 3600 },
        ],
      }),
    });
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(list).getByText('PROJ-A-101')).toBeTruthy();
    expect(within(list).getByText('Epic planning')).toBeTruthy();
    expect(within(list).getByText('12.0h')).toBeTruthy();
    expect(within(list).getByText('32.0h')).toBeTruthy();
  });

  it('aggregates multiple worklog records on the same ticket into one <li>', () => {
    renderPanel({
      epic: epicData({
        worklogs: [
          { ticketKey: 'PROJ-A-101', ticketSummary: 'Epic planning', seconds: 5 * 3600 },
          { ticketKey: 'PROJ-A-101', ticketSummary: 'Epic planning', seconds: 7 * 3600 },
        ],
      }),
    });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(screen.getByText('12.0h')).toBeTruthy();
  });

  it('sorts tickets by descending hours, tie-breaking by ticketKey ascending', () => {
    renderPanel({
      epic: epicData({
        worklogs: [
          { ticketKey: 'PROJ-A-103', ticketSummary: 'Small', seconds: 2 * 3600 },
          { ticketKey: 'PROJ-A-101', ticketSummary: 'Big', seconds: 10 * 3600 },
          { ticketKey: 'PROJ-A-102', ticketSummary: 'Big two', seconds: 10 * 3600 },
        ],
      }),
    });
    const items = screen.getAllByRole('listitem');
    expect(items[0]!.textContent).toContain('PROJ-A-101'); // 10h, key asc first
    expect(items[1]!.textContent).toContain('PROJ-A-102'); // 10h, key asc second
    expect(items[2]!.textContent).toContain('PROJ-A-103'); // 2h last
  });

  it('shows the empty state when there are no ticket records', () => {
    renderPanel({ epic: epicData({ worklogs: [] }) });
    expect(
      screen.getByText('No tickets in PROJ-A for Sarah this cycle.'),
    ).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('renders the VisibilityWarning chip with correct N when restrictedCount > 0', () => {
    renderPanel({ epic: epicData({ restrictedCount: 3 }) });
    expect(
      screen.getByText(/⚠ 3 worklogs with restricted visibility were excluded/),
    ).toBeTruthy();
  });

  it('renders the singular VisibilityWarning chip for restrictedCount === 1', () => {
    renderPanel({ epic: epicData({ restrictedCount: 1 }) });
    expect(
      screen.getByText(/⚠ 1 worklog with restricted visibility was excluded/),
    ).toBeTruthy();
  });

  it('OMITS the VisibilityWarning when restrictedCount === 0', () => {
    renderPanel({ epic: epicData({ restrictedCount: 0 }) });
    expect(screen.queryByText(/restricted visibility/)).toBeNull();
  });

  it('shows a 3-row skeleton (no list) when epic data is not yet resolved', () => {
    renderPanel({ epic: undefined });
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByTestId('drilldown-skeleton')).toBeTruthy();
  });

  it('routes the Close button through onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    renderPanel({ onOpenChange });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not render content when closed', () => {
    renderPanel({ open: false });
    expect(screen.queryByText('Sarah · PROJ-A · May 2026')).toBeNull();
  });

  it('never triggers a network fetch', () => {
    renderPanel({
      epic: epicData({
        worklogs: [
          { ticketKey: 'PROJ-A-101', ticketSummary: 'Epic planning', seconds: 12 * 3600 },
        ],
      }),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
