import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RecentlyWorked } from './RecentlyWorked';
import { scan, criticalOrSerious } from '@/lib/test/axe';

function isoAt(hours: number, daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
}

const FOUR_ITEMS = [
  { key: 'PROJ-1', summary: 'Alpha task', startedAt: isoAt(9) },
  { key: 'PROJ-2', summary: 'Beta task', startedAt: isoAt(9, 1) },
  { key: 'PROJ-3', summary: 'Gamma task', startedAt: isoAt(9, 2) },
  { key: 'PROJ-4', summary: 'Delta task', startedAt: isoAt(9, 3) },
];

describe('RecentlyWorked', () => {
  // ---- D-7.5-13: 0 / 1 / 4+ coverage -------------------------------------

  it('renders NO section at all when there are zero items — not an empty card', () => {
    const { container } = render(
      <RecentlyWorked items={[]} onSelectTicket={vi.fn()} onRequestSearchFocus={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('Recently worked')).toBeNull();
  });

  it('renders exactly one row when only one ticket is available — never padded to four', () => {
    render(
      <RecentlyWorked
        items={[FOUR_ITEMS[0]!]}
        onSelectTicket={vi.fn()}
        onRequestSearchFocus={vi.fn()}
      />,
    );
    expect(screen.getByText('PROJ-1')).toBeTruthy();
    expect(screen.queryByText('PROJ-2')).toBeNull();
    // The count pill reflects what's actually shown, not a fixed 4.
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('renders up to four rows when four or more are available, in the given (ranked) order', () => {
    render(
      <RecentlyWorked items={FOUR_ITEMS} onSelectTicket={vi.fn()} onRequestSearchFocus={vi.fn()} />,
    );
    for (const item of FOUR_ITEMS) {
      expect(screen.getByText(item.key)).toBeTruthy();
    }
    expect(screen.getByText('4')).toBeTruthy();
  });

  // ---- D-7.5-12: the handoff row carries no count ------------------------

  it('the handoff row reads exactly "More assigned tickets · Search to find them →" — no number anywhere', () => {
    const { container } = render(
      <RecentlyWorked items={FOUR_ITEMS} onSelectTicket={vi.fn()} onRequestSearchFocus={vi.fn()} />,
    );
    expect(
      screen.getByText('More assigned tickets · Search to find them →'),
    ).toBeTruthy();
    // The only digit-bearing text anywhere is the count pill ("4") — no
    // "N more assigned tickets" literal count leaked in.
    expect(container.textContent).not.toMatch(/\d+\s*more/i);
  });

  it('the handoff row is present even with fewer than four rows shown', () => {
    render(
      <RecentlyWorked
        items={[FOUR_ITEMS[0]!]}
        onSelectTicket={vi.fn()}
        onRequestSearchFocus={vi.fn()}
      />,
    );
    expect(screen.getByText('More assigned tickets · Search to find them →')).toBeTruthy();
  });

  it('the handoff row is a single <button> spanning the row and calls onRequestSearchFocus — nothing expands in place', () => {
    const onRequestSearchFocus = vi.fn();
    render(
      <RecentlyWorked
        items={FOUR_ITEMS}
        onSelectTicket={vi.fn()}
        onRequestSearchFocus={onRequestSearchFocus}
      />,
    );
    const handoff = screen.getByText('More assigned tickets · Search to find them →');
    expect(handoff.tagName).toBe('BUTTON');
    fireEvent.click(handoff);
    expect(onRequestSearchFocus).toHaveBeenCalledTimes(1);
    // No new list/accordion appeared.
    expect(screen.getAllByText(/PROJ-\d/).length).toBe(4);
  });

  // ---- D-7.5-11: the `+` calls onSelectTicket, never anything resume-card--

  it('clicking a row\'s "+" calls onSelectTicket with that row\'s key/summary', () => {
    const onSelectTicket = vi.fn();
    render(
      <RecentlyWorked items={FOUR_ITEMS} onSelectTicket={onSelectTicket} onRequestSearchFocus={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText('Log time to PROJ-2'));
    expect(onSelectTicket).toHaveBeenCalledWith('PROJ-2', 'Beta task');
    expect(onSelectTicket).toHaveBeenCalledTimes(1);
  });

  // ---- AC6: key/summary on separate lines, min-w-0 so truncation engages -

  it('renders an 80+ character summary truncated, without shoving the key, and keeps the row height fixed', () => {
    const longSummary =
      'This is a genuinely long GAPI-style summary line that exceeds eighty characters in total length easily';
    expect(longSummary.length).toBeGreaterThan(80);
    const { container } = render(
      <RecentlyWorked
        items={[{ key: 'GAPI-1', summary: longSummary, startedAt: isoAt(9) }]}
        onSelectTicket={vi.fn()}
        onRequestSearchFocus={vi.fn()}
      />,
    );
    // The key renders whole, never truncated.
    expect(screen.getByText('GAPI-1')).toBeTruthy();
    // The summary text node is present in full (jsdom does not paint CSS
    // ellipsis, so this asserts the *markup contract* instead): it lives in
    // a `min-w-0` flex column with a `truncate` class on the summary span.
    const textColumn = container.querySelector('.min-w-0');
    expect(textColumn).toBeTruthy();
    const summaryEl = screen.getByText(longSummary);
    expect(summaryEl.className).toContain('truncate');
    // Fixed row height utility present (not left to fall out of content).
    const row = summaryEl.closest('div[class*="h-["]');
    expect(row).toBeTruthy();
  });

  // ---- a11y -----------------------------------------------------------

  it('has zero Critical/Serious axe violations', async () => {
    const { container } = render(
      <RecentlyWorked items={FOUR_ITEMS} onSelectTicket={vi.fn()} onRequestSearchFocus={vi.fn()} />,
    );
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });
});
