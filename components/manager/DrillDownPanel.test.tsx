import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrillDownPanel } from './DrillDownPanel';
import type { ReportEpicWorklogs } from '@/lib/jira-types';

// Guard: the panel must NEVER touch the network. If anything in the panel's
// import graph tried to fetch, this spy would catch a global fetch call.
const fetchSpy = vi.spyOn(globalThis, 'fetch');

// Story 7.8 / Task 8: the panel now conditionally renders `ApproveButton`
// (the reused row write path), so it needs the same defensive boundary
// mocks `ApproveButton.test.tsx` uses — the panel's OWN tests never click
// the action through to a mutation, but the component still needs a
// QueryClient in its tree, and mocking these keeps the test isolated from
// chrome.runtime like every other manager surface test.
//
// Finding 5 (Major): the mock is now a NAMED reference (not inline) so a
// test can assert on the exact payload posted through the panel's action —
// closing the money-path hole where `user`/`by` could be silently swapped.
const sendRequestMock = vi.fn();
vi.mock('@/lib/messages', () => ({
  sendRequest: (...a: unknown[]) => sendRequestMock(...a),
}));
vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

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

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return React.createElement(QueryClientProvider, { client }, children);
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
    { wrapper },
  );
}

describe('DrillDownPanel', () => {
  // Story 7.8 / Task 8: the header drops the cycle (dc.html:583) — the
  // subtitle line now carries the total hours + the dirty reason instead.
  it('renders the header "<Person> · <EpicKey>" (no cycle)', () => {
    renderPanel();
    expect(screen.getByText('Sarah · PROJ-A')).toBeTruthy();
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
      screen.getByText(/3 worklogs with restricted visibility were excluded/),
    ).toBeTruthy();
  });

  it('renders the singular VisibilityWarning chip for restrictedCount === 1', () => {
    renderPanel({ epic: epicData({ restrictedCount: 1 }) });
    expect(
      screen.getByText(/1 worklog with restricted visibility was excluded/),
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
    expect(screen.queryByText('Sarah · PROJ-A')).toBeNull();
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

  // --- Story 7.8 / AC5: the reason, changed flags, and plain-language summary ---

  describe('the dirty reason, per-worklog changed flags, and the change summary (AC5)', () => {
    it('shows no reason and no "Needs re-approval" chip when the Epic is not approved', () => {
      renderPanel({ epic: epicData(), approvalAt: null });
      expect(screen.queryByText(/edited.*after approval/)).toBeNull();
      expect(screen.queryByText('Needs re-approval')).toBeNull();
    });

    it('shows no reason when approved but nothing changed after approval', () => {
      renderPanel({
        epic: epicData({
          worklogs: [
            {
              ticketKey: 'PROJ-A-101',
              ticketSummary: 'Epic planning',
              seconds: 12 * 3600,
              updated: '2026-05-01T00:00:00.000Z',
            },
          ],
        }),
        approvalAt: '2026-05-20T00:00:00.000Z',
      });
      expect(screen.queryByText(/edited.*after approval/)).toBeNull();
      expect(screen.queryByText('Needs re-approval')).toBeNull();
    });

    it('shows "edited N days after approval" and the "Needs re-approval" chip when a worklog changed after approval', () => {
      renderPanel({
        epic: epicData({
          worklogs: [
            {
              ticketKey: 'PROJ-A-101',
              ticketSummary: 'Epic planning',
              seconds: 12 * 3600,
              updated: '2026-05-24T00:00:00.000Z',
            },
          ],
        }),
        approvalAt: '2026-05-20T00:00:00.000Z',
      });
      expect(screen.getByText(/edited 4 days after approval/)).toBeTruthy();
      expect(screen.getByText('Needs re-approval')).toBeTruthy();
    });

    it('flags a changed ticket row with a visible "changed" word (AC7/AC11 — icon aria-hidden, never colour/shape alone)', () => {
      renderPanel({
        epic: epicData({
          worklogs: [
            {
              ticketKey: 'PROJ-A-101',
              ticketSummary: 'Epic planning',
              seconds: 12 * 3600,
              updated: '2026-05-24T00:00:00.000Z',
            },
          ],
        }),
        approvalAt: '2026-05-20T00:00:00.000Z',
      });
      const flag = screen.getByText('changed');
      expect(flag).toBeTruthy();
      // The Radix content is portaled to document.body, not the local
      // `container` — the icon is a SIBLING of the text span inside their
      // shared `DayStatusIndicator` wrapper, so look at the parent.
      const icon = flag.parentElement?.querySelector('svg[aria-hidden="true"]');
      expect(icon).toBeTruthy();
    });

    it('does NOT flag a ticket row that changed BEFORE approval', () => {
      renderPanel({
        epic: epicData({
          worklogs: [
            {
              ticketKey: 'PROJ-A-101',
              ticketSummary: 'Epic planning',
              seconds: 12 * 3600,
              updated: '2026-05-10T00:00:00.000Z', // before the approval
            },
          ],
        }),
        approvalAt: '2026-05-20T00:00:00.000Z',
      });
      expect(screen.queryByText('changed')).toBeNull();
    });

    it('states only what the data supports: count + approval date + changed dates, never a fabricated delta', () => {
      renderPanel({
        epic: epicData({
          worklogs: [
            {
              ticketKey: 'PROJ-A-101',
              ticketSummary: 'Epic planning',
              seconds: 12 * 3600,
              started: '2026-06-12T09:00:00.000Z',
              updated: '2026-06-12T10:00:00.000Z',
            },
            {
              ticketKey: 'PROJ-A-102',
              ticketSummary: 'Build',
              seconds: 2 * 3600,
              started: '2026-06-18T09:00:00.000Z',
              updated: '2026-06-18T10:00:00.000Z',
            },
          ],
        }),
        approvalAt: '2026-06-03T00:00:00.000Z',
      });
      expect(
        screen.getByText('2 tickets changed since you approved on 3 Jun: 12 Jun, 18 Jun.'),
      ).toBeTruthy();
      // Never a fabricated hours delta or a claimed description of the edit.
      expect(screen.queryByText(/\+\d/)).toBeNull();
    });

    // Finding 10 (Major): `t.date` used to be the latest `started ?? updated`
    // across ALL of a ticket's worklogs, with no reference to `changedHere` —
    // so a ticket with one UNCHANGED worklog whose `started` is later than
    // its one CHANGED worklog's `updated` named the wrong date entirely.
    it('Finding 10: names only the date something actually changed, never an untouched worklog\'s later date', () => {
      renderPanel({
        epic: epicData({
          worklogs: [
            // Changed (updated after approval) — the OLDER started date.
            {
              ticketKey: 'PROJ-A-101',
              ticketSummary: 'Epic planning',
              seconds: 5 * 3600,
              started: '2026-05-20T09:00:00.000Z',
              updated: '2026-06-12T10:00:00.000Z',
            },
            // Untouched since approval — but its `started` is LATER, so the
            // old (buggy) "latest started/updated across ALL worklogs" logic
            // would have picked THIS date for the summary.
            {
              ticketKey: 'PROJ-A-101',
              ticketSummary: 'Epic planning',
              seconds: 7 * 3600,
              started: '2026-06-25T09:00:00.000Z',
              updated: '2026-06-01T00:00:00.000Z',
            },
          ],
        }),
        approvalAt: '2026-06-03T00:00:00.000Z',
      });
      // The exact-text match below already proves the SUMMARY names only
      // 12 Jun — "25 Jun" (the ticket's own general representative `date`,
      // legitimately shown in its own row from the LATER but UNCHANGED
      // worklog's `started`) is expected to still appear elsewhere in the
      // panel; that is the `date` field, a different concern from
      // `changedAtMs`, and asserting its total absence would be wrong.
      expect(
        screen.getByText('1 ticket changed since you approved on 3 Jun: 12 Jun.'),
      ).toBeTruthy();
    });

    // Finding 21 (Minor): two tickets that changed on the SAME day must not
    // repeat that date in the list.
    it('Finding 21: dedupes the changed-dates list when two tickets change on the same day', () => {
      renderPanel({
        epic: epicData({
          worklogs: [
            {
              ticketKey: 'PROJ-A-101',
              ticketSummary: 'Epic planning',
              seconds: 5 * 3600,
              updated: '2026-06-12T10:00:00.000Z',
            },
            {
              ticketKey: 'PROJ-A-102',
              ticketSummary: 'Build',
              seconds: 2 * 3600,
              updated: '2026-06-12T15:00:00.000Z',
            },
          ],
        }),
        approvalAt: '2026-06-03T00:00:00.000Z',
      });
      expect(
        screen.getByText('2 tickets changed since you approved on 3 Jun: 12 Jun.'),
      ).toBeTruthy();
    });

    // Finding 19 (Minor): the `>` boundary — a worklog touched AT the exact
    // approval instant (`updated === approvalAt`) must NOT read as changed.
    it('Finding 19: a worklog updated at EXACTLY the approval instant is not changed (strict >, not >=)', () => {
      renderPanel({
        epic: epicData({
          worklogs: [
            {
              ticketKey: 'PROJ-A-101',
              ticketSummary: 'Epic planning',
              seconds: 12 * 3600,
              updated: '2026-05-20T00:00:00.000Z', // === approvalAt exactly
            },
          ],
        }),
        approvalAt: '2026-05-20T00:00:00.000Z',
      });
      expect(screen.queryByText('changed')).toBeNull();
      expect(screen.queryByText(/edited.*after approval/)).toBeNull();
      expect(screen.queryByText('Needs re-approval')).toBeNull();
    });
  });

  // --- Story 7.8 / AC5: the "Re-approve Nh" / "Approve Nh" action ---------

  describe('the row-scoped action (Task 8 — reuses ApproveButton, no second write path)', () => {
    beforeEach(() => {
      sendRequestMock.mockReset();
      sendRequestMock.mockResolvedValue({ confirmed: ['PROJ-A', 'PROJ-B'], failed: [], enqueued: [] });
    });

    it('renders no action at all when `action` is omitted (nothing to do)', () => {
      renderPanel();
      expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    });

    it('renders "Re-approve <row total>h" in reapprove mode, scoped to the ROW total (not just this Epic)', () => {
      renderPanel({
        epic: epicData({ totalSeconds: 12 * 3600 }), // this Epic alone is only 12h
        action: {
          mode: 'reapprove',
          reportAccountId: 'r-sarah',
          managerAccountId: 'mgr-1',
          epics: [
            { epicKey: 'PROJ-A', restrictedCount: 0 },
            { epicKey: 'PROJ-B', restrictedCount: 0 },
          ],
          rowSeconds: 72 * 3600, // the ROW total across both Epics
          restrictedCount: 0,
          disabledReason: undefined,
          priorApprovalAt: '2026-05-20T08:30:00.000Z',
        },
      });
      expect(screen.getByRole('button', { name: 'Re-approve 72h' })).toBeTruthy();
    });

    it('renders "Approve <row total>h" in approve mode', () => {
      renderPanel({
        action: {
          mode: 'approve',
          reportAccountId: 'r-sarah',
          managerAccountId: 'mgr-1',
          epics: [{ epicKey: 'PROJ-A', restrictedCount: 0 }],
          rowSeconds: 64 * 3600,
          restrictedCount: 0,
          disabledReason: undefined,
          priorApprovalAt: undefined,
        },
      });
      expect(screen.getByRole('button', { name: 'Approve 64h' })).toBeTruthy();
    });

    // Finding 5 (Major, money path): drives the panel's action through to a
    // full `sendRequest('approve-cycle', {user, cycle, by, epics})` payload
    // assertion — mirroring `ManagerMatrix.test.tsx:771`'s row-button test.
    // Proven necessary by the review: swapping `user`/`by`, narrowing
    // `epics` to one literal, and dropping `mode`/`restrictedCount` each
    // passed 25/25 without this assertion. `user` MUST be the report (the
    // subject) and `by` MUST be the manager (the approver) — swapped, this
    // posts a checksum-covered comment naming the report as approver.
    it('Finding 5: posts the exact approve-cycle payload — user is the REPORT, by is the MANAGER, epics/cycle intact', async () => {
      renderPanel({
        cycle: '2026-05',
        action: {
          mode: 'reapprove',
          reportAccountId: 'r-sarah',
          managerAccountId: 'mgr-1',
          epics: [
            { epicKey: 'PROJ-A', restrictedCount: 0 },
            { epicKey: 'PROJ-B', restrictedCount: 2 },
          ],
          rowSeconds: 72 * 3600,
          restrictedCount: 2,
          disabledReason: undefined,
          priorApprovalAt: '2026-05-20T08:30:00.000Z',
        },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Re-approve 72h' }));
      const dialog = screen.getByRole('dialog');
      // Trigger and confirm buttons share the same label ("Re-approve 72h")
      // by design (dc.html:618: the commit button carries the figure) — scope
      // to the dialog to reach the CONFIRM one.
      fireEvent.click(within(dialog).getByRole('button', { name: 'Re-approve 72h' }));
      await waitFor(() =>
        expect(sendRequestMock).toHaveBeenCalledWith('approve-cycle', {
          user: 'r-sarah',
          cycle: '2026-05',
          by: 'mgr-1',
          epics: [
            { epicKey: 'PROJ-A', restrictedCount: 0 },
            { epicKey: 'PROJ-B', restrictedCount: 2 },
          ],
        }),
      );
    });

    // Finding 6 (Major, write path / FR36): Story 5.8's canonicality gate —
    // deleting `disabledReason={action.disabledReason}` passed 25/25 with
    // nothing red and `tsc` clean (the prop is optional). A non-canonical
    // manager could otherwise re-approve from the panel while the row's own
    // button sits greyed out two inches away.
    it('Finding 6: a non-empty action.disabledReason disables the action (aria-disabled + announced reason) and opens no dialog', () => {
      renderPanel({
        action: {
          mode: 'approve',
          reportAccountId: 'r-sarah',
          managerAccountId: 'mgr-1',
          epics: [{ epicKey: 'PROJ-A', restrictedCount: 0 }],
          rowSeconds: 64 * 3600,
          restrictedCount: 0,
          disabledReason: "Only Sarah's canonical manager can approve their cycle.",
          priorApprovalAt: undefined,
        },
      });
      const btn = screen.getByRole('button', { name: 'Approve 64h' });
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      expect(screen.getByTestId('approve-disabled-reason').textContent).toMatch(
        /canonical manager/,
      );
      fireEvent.click(btn);
      expect(screen.queryByRole('dialog', { name: /64h/i })).toBeNull();
      expect(sendRequestMock).not.toHaveBeenCalled();
    });

    // Finding 7 (Major): the ORIGINAL test only asserted name-scoped absence
    // (`queryByText(/ask anucha|open in jira|copy summary/i)`), which a
    // `<button>Dismiss</button>` + `<a href>View ticket</a>` both passed —
    // neither name matches the banned phrases, yet either is exactly the
    // forbidden secondary. Assert STRUCTURALLY instead: the footer contains
    // exactly one button and zero links, full stop.
    it('Finding 7 / D-7.8-18: the footer renders structurally exactly one button and zero links (no secondary in ANY form)', () => {
      renderPanel({
        action: {
          mode: 'approve',
          reportAccountId: 'r-sarah',
          managerAccountId: 'mgr-1',
          epics: [{ epicKey: 'PROJ-A', restrictedCount: 0 }],
          rowSeconds: 64 * 3600,
          restrictedCount: 0,
          disabledReason: undefined,
          priorApprovalAt: undefined,
        },
      });
      const footer = screen.getByTestId('drilldown-footer');
      expect(within(footer).getAllByRole('button')).toHaveLength(1);
      expect(within(footer).queryByRole('link')).toBeNull();
    });

    // Finding 18 (Minor): D-7.8-18's stated compensation for the removed
    // secondary — "the primary spans the footer's full width" — was
    // recorded in a comment but the trigger had no way to actually widen.
    it('Finding 18: the action trigger carries w-full (spans the footer, per D-7.8-18)', () => {
      renderPanel({
        action: {
          mode: 'approve',
          reportAccountId: 'r-sarah',
          managerAccountId: 'mgr-1',
          epics: [{ epicKey: 'PROJ-A', restrictedCount: 0 }],
          rowSeconds: 64 * 3600,
          restrictedCount: 0,
          disabledReason: undefined,
          priorApprovalAt: undefined,
        },
      });
      expect(screen.getByRole('button', { name: 'Approve 64h' }).className).toMatch(/w-full/);
    });

    // Finding 20 (Minor): `action.mode` is row-scoped, but the panel's OWN
    // evidence is Epic-scoped — when a DIFFERENT Epic in the row is dirty,
    // this Epic shows no reason/chip while the footer still says
    // "Re-approve". The honest line explains why.
    it('Finding 20: shows the "another Epic changed" note when mode is reapprove but THIS Epic is clean', () => {
      renderPanel({
        epic: epicData({ worklogs: [] }), // this Epic has nothing changed
        approvalAt: '2026-05-20T00:00:00.000Z',
        action: {
          mode: 'reapprove', // row-scoped: SOME other Epic in the row is dirty
          reportAccountId: 'r-sarah',
          managerAccountId: 'mgr-1',
          epics: [{ epicKey: 'PROJ-A', restrictedCount: 0 }],
          rowSeconds: 64 * 3600,
          restrictedCount: 0,
          disabledReason: undefined,
          priorApprovalAt: '2026-05-25T00:00:00.000Z',
        },
      });
      expect(screen.getByTestId('drilldown-other-epic-dirty-note')).toBeTruthy();
      expect(screen.queryByText('Needs re-approval')).toBeNull();
    });

    it('does NOT show the "another Epic changed" note in approve mode', () => {
      renderPanel({
        action: {
          mode: 'approve',
          reportAccountId: 'r-sarah',
          managerAccountId: 'mgr-1',
          epics: [{ epicKey: 'PROJ-A', restrictedCount: 0 }],
          rowSeconds: 64 * 3600,
          restrictedCount: 0,
          disabledReason: undefined,
          priorApprovalAt: undefined,
        },
      });
      expect(screen.queryByTestId('drilldown-other-epic-dirty-note')).toBeNull();
    });

    it('never renders a secondary action beside the primary (D-7.8-18)', () => {
      renderPanel({
        action: {
          mode: 'approve',
          reportAccountId: 'r-sarah',
          managerAccountId: 'mgr-1',
          epics: [{ epicKey: 'PROJ-A', restrictedCount: 0 }],
          rowSeconds: 64 * 3600,
          restrictedCount: 0,
          disabledReason: undefined,
          priorApprovalAt: undefined,
        },
      });
      const buttons = screen.getAllByRole('button');
      // Only Close + the one primary action — no "Ask Anucha"/"Open in Jira"/
      // "Copy summary" substitute anywhere in the panel.
      expect(screen.queryByText(/ask anucha|open in jira|copy summary/i)).toBeNull();
      expect(buttons.filter((b) => /approve/i.test(b.textContent ?? ''))).toHaveLength(1);
    });
  });
});
