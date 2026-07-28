import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TicketSearchState } from '@/hooks/useTicketSearch';

const searchStateMock = vi.fn<() => TicketSearchState>(() => ({ kind: 'idle' }));
vi.mock('@/hooks/useTicketSearch', () => ({
  useTicketSearch: () => searchStateMock(),
}));

const { AddSubtaskRow } = await import('./AddSubtaskRow');

function issue(key: string, summary: string, assignee?: string) {
  return {
    key,
    fields: {
      summary,
      ...(assignee ? { assignee: { displayName: assignee } } : {}),
    },
  } as never;
}

function results(...items: { key: string; summary: string; assignment?: string; assignee?: string }[]) {
  return {
    kind: 'results' as const,
    truncated: false,
    items: items.map((i) => ({
      issue: issue(i.key, i.summary, i.assignee),
      assignment: (i.assignment ?? 'unknown') as never,
    })),
  };
}

function open(): void {
  fireEvent.click(screen.getByRole('button', { name: /Add a subtask to this week/ }));
}

describe('AddSubtaskRow — idle state (design :842)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchStateMock.mockReturnValue({ kind: 'idle' });
  });

  it('renders the dashed opener and NO search field until asked', () => {
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Add a subtask to this week/ })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('opens the search on click', () => {
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} />);
    open();
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add a subtask to this week/ })).toBeNull();
  });

  it('startOpen skips the button entirely (the day-header entry point)', () => {
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    expect(screen.getByRole('combobox')).toBeTruthy();
  });
});

describe('AddSubtaskRow — results popup (design :854)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchStateMock.mockReturnValue(
      results(
        { key: 'GAPI-361', summary: 'reprocess failed bulk file batches', assignment: 'other', assignee: 'Anucha P.' },
        { key: 'MBS-1206', summary: 'SuspenseDetail', assignment: 'you' },
      ),
    );
  });

  it('heads the popup and counts the results', () => {
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    expect(screen.getByText('Add to this week')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('states the consequence of adding, not just the source of the results', () => {
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    expect(
      screen.getByText('Searched live in Jira — a new row starts empty, with no hours logged.'),
    ).toBeTruthy();
  });

  it('offers "Add row" on a ticket not yet in the week', () => {
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    expect(screen.getAllByText('Add row')).toHaveLength(2);
    expect(screen.queryByText('already in week')).toBeNull();
  });

  it('reports "already in week" instead of "Add row" for a key already on screen', () => {
    render(<AddSubtaskRow existingKeys={new Set(['MBS-1206'])} onAdd={vi.fn()} startOpen />);
    expect(screen.getByText('already in week')).toBeTruthy();
    expect(screen.getAllByText('Add row')).toHaveLength(1);
  });

  it('renders the assignment pills the search hook resolves', () => {
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    expect(screen.getByText('assigned to you')).toBeTruthy();
    expect(screen.getByText('Anucha P.')).toBeTruthy();
  });

  it('adds on click, reporting key and summary', () => {
    const onAdd = vi.fn();
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={onAdd} startOpen />);
    fireEvent.click(screen.getByRole('option', { name: /GAPI-361/ }));
    expect(onAdd).toHaveBeenCalledWith('GAPI-361', 'reprocess failed bulk file batches');
  });

  it('closes after adding — the popup is not left hanging open', () => {
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    fireEvent.click(screen.getByRole('option', { name: /GAPI-361/ }));
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('AddSubtaskRow — keyboard (the "↑↓ · ⏎ to add" hint must be true)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchStateMock.mockReturnValue(
      results({ key: 'A-1', summary: 'first' }, { key: 'B-2', summary: 'second' }),
    );
  });

  it('⏎ adds the active row — the first, before any arrowing', () => {
    const onAdd = vi.fn();
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={onAdd} startOpen />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('A-1', 'first');
  });

  it('↓ moves the active row before ⏎ commits it', () => {
    const onAdd = vi.fn();
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={onAdd} startOpen />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('B-2', 'second');
  });

  it('↓ wraps at the end and ↑ wraps at the start', () => {
    const onAdd = vi.fn();
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={onAdd} startOpen />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // wraps to first
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // wraps to last
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('B-2', 'second');
  });

  it('tracks the active row in aria-activedescendant, not just visually', () => {
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    const input = screen.getByRole('combobox');
    const before = input.getAttribute('aria-activedescendant');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).not.toBe(before);
    expect(screen.getByRole('option', { name: /B-2/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('Escape closes and cancels — never adds', () => {
    const onAdd = vi.fn();
    const onCancel = vi.fn();
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={onAdd} onCancel={onCancel} startOpen />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(onAdd).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('the ✕ closes and cancels', () => {
    const onCancel = vi.fn();
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} onCancel={onCancel} startOpen />);
    fireEvent.click(screen.getByRole('button', { name: /Close the add-a-subtask search/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('AddSubtaskRow — non-results states', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prompts before anything has been typed', () => {
    searchStateMock.mockReturnValue({ kind: 'idle' });
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    expect(screen.getByText('Type a ticket key or search text.')).toBeTruthy();
  });

  it('reports in-flight without claiming there are no results', () => {
    searchStateMock.mockReturnValue({ kind: 'in-flight' });
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    expect(screen.getByText('Searching…')).toBeTruthy();
    expect(screen.queryByText('No matching tickets.')).toBeNull();
    expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('true');
  });

  it('reports an empty result set', () => {
    searchStateMock.mockReturnValue({ kind: 'empty' });
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    expect(screen.getByText('No matching tickets.')).toBeTruthy();
  });

  it('distinguishes rate-limiting from a generic failure — they need different user action', () => {
    searchStateMock.mockReturnValue({ kind: 'failed', errorKind: 'rate-limited' });
    const { unmount } = render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    expect(screen.getByText(/rate-limiting search/)).toBeTruthy();
    unmount();

    searchStateMock.mockReturnValue({ kind: 'failed', errorKind: 'forbidden' });
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    expect(screen.getByText(/Couldn’t search Jira/)).toBeTruthy();
  });

  it('discloses truncation rather than silently capping the list', () => {
    searchStateMock.mockReturnValue({
      ...results({ key: 'A-1', summary: 'first' }),
      truncated: true,
    });
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={vi.fn()} startOpen />);
    expect(screen.getByText(/Showing the first 20 matches/)).toBeTruthy();
  });

  it('an empty search carries no options for ⏎ to commit', () => {
    const onAdd = vi.fn();
    searchStateMock.mockReturnValue({ kind: 'empty' });
    render(<AddSubtaskRow existingKeys={new Set()} onAdd={onAdd} startOpen />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();
  });
});
