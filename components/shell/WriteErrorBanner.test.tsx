import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WriteErrorBanner } from './WriteErrorBanner';
import type { OutboxEntry } from '@/lib/storage/outbox';

function failedEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: 'fail-1',
    kind: 'post',
    endpoint: 'rest/api/3/issue/GAPI-348/worklog',
    issueKey: 'GAPI-348',
    attemptCount: 10,
    status: 'failed',
    lastError: 'forbidden',
    enqueuedAt: new Date().toISOString(),
    body: { timeSpentSeconds: 5400, started: '2026-07-27T09:00:00.000Z' },
    ...overrides,
  };
}

describe('WriteErrorBanner (AC3)', () => {
  // Accessibility (b): the alert must be mounted EMPTY and populate one tick
  // later, or most screen readers never announce it (a `failed` entry
  // persists across popup sessions, so it IS present at first paint).
  it('mounts role="alert" present but WITH NO TEXT at first synchronous paint, then populates on the next tick', async () => {
    render(<WriteErrorBanner entries={[failedEntry()]} onRetry={vi.fn()} onLogElsewhere={vi.fn()} />);
    const alertRegion = screen.getByRole('alert');
    // Synchronous assertion, no await: the region exists but carries no text.
    expect(alertRegion.textContent).toBe('');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(alertRegion.textContent).toContain("Jira didn't accept that worklog");
  });

  // RED-proof note: a naive `mounted ? <p>…</p> : null` REPLACED BY rendering
  // the content synchronously (no `mounted` gate) makes the assertion above
  // fail immediately — `textContent` would already contain the headline at
  // the first synchronous check.

  it('names the ticket, maps lastError "forbidden" to its 403 reason, and states the saved-locally amount', async () => {
    render(
      <WriteErrorBanner
        entries={[failedEntry({ issueKey: 'GAPI-348', lastError: 'forbidden', body: { timeSpentSeconds: 5400, started: 'x' } })]}
        onRetry={vi.fn()}
        onLogElsewhere={vi.fn()}
      />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(
      screen.getByText('GAPI-348 · 403, you may not have Work On Issues permission. Your 1.5h is saved locally.'),
    ).toBeTruthy();
  });

  it.each([
    ['not-found', "404, that ticket or worklog no longer exists"],
    ['auth-expired', '401, your Jira session expired'],
    ['parse-error', "Jira sent a response we couldn't read"],
    ['network', 'gave up after 10 retries'],
    ['rate-limited', 'gave up after 10 retries'],
  ])('maps lastError %s to its reason text', async (lastError, expectedReason) => {
    render(
      <WriteErrorBanner
        entries={[failedEntry({ lastError, body: { timeSpentSeconds: 3600, started: 'x' } })]}
        onRetry={vi.fn()}
        onLogElsewhere={vi.fn()}
      />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(screen.getByText(new RegExp(expectedReason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
  });

  it('the headline uses text-error-ink (7.60:1), never text-status-error (4.42:1 — below AA)', async () => {
    render(<WriteErrorBanner entries={[failedEntry()]} onRetry={vi.fn()} onLogElsewhere={vi.fn()} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    const headline = screen.getByText("Jira didn't accept that worklog");
    expect(headline.className).toContain('text-error-ink');
    expect(headline.className).not.toContain('text-status-error');
  });

  it('"Retry" calls onRetry with the entry id', async () => {
    const onRetry = vi.fn();
    render(<WriteErrorBanner entries={[failedEntry({ id: 'fail-77' })]} onRetry={onRetry} onLogElsewhere={vi.fn()} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith('fail-77');
  });

  // D-7.9-29: "Log elsewhere" does NOT dismiss the banner — the write still
  // failed. The component has no internal visibility state at all, so this
  // proves it structurally: the banner is still fully rendered post-click.
  it('D-7.9-29: "Log elsewhere" calls onLogElsewhere and does not dismiss the banner', async () => {
    const onLogElsewhere = vi.fn();
    render(<WriteErrorBanner entries={[failedEntry()]} onRetry={vi.fn()} onLogElsewhere={onLogElsewhere} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log elsewhere' }));
    expect(onLogElsewhere).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain("Jira didn't accept that worklog");
  });

  it('renders exactly one CircleX icon, aria-hidden, colored text-status-error (the icon-only legitimate use)', async () => {
    const { container } = render(
      <WriteErrorBanner entries={[failedEntry()]} onRetry={vi.fn()} onLogElsewhere={vi.fn()} />,
    );
    const icons = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(icons.length).toBe(1);
    expect(icons[0]!.getAttribute('class')).toContain('text-status-error');
  });

  it('skips a delete-only failed entry\'s missing timeSpentSeconds — falls back to the next post/put entry', async () => {
    render(
      <WriteErrorBanner
        entries={[
          failedEntry({ id: 'del-1', kind: 'delete', issueKey: 'GAPI-1', body: undefined }),
          failedEntry({ id: 'post-1', kind: 'post', issueKey: 'GAPI-2', body: { timeSpentSeconds: 3600, started: 'x' } }),
        ]}
        onRetry={vi.fn()}
        onLogElsewhere={vi.fn()}
      />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(screen.getByText(/GAPI-2/)).toBeTruthy();
  });

  it('carries NO self -mt-[10px] offset (D-7.9-16 — <main> is the sole owner)', () => {
    const { container } = render(
      <WriteErrorBanner entries={[failedEntry()]} onRetry={vi.fn()} onLogElsewhere={vi.fn()} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('-mt-[10px]');
  });

  // Review Finding 15 / D-7.9-18(a): a multi-failure banner must SAY how
  // many writes failed, not silently represent N failures as one.
  it('D-7.9-18(a): names the primary ticket AND states how many other writes also failed', async () => {
    render(
      <WriteErrorBanner
        entries={[
          failedEntry({ id: 'post-1', issueKey: 'GAPI-1', body: { timeSpentSeconds: 3600, started: 'x' } }),
          failedEntry({ id: 'post-2', issueKey: 'GAPI-2', body: { timeSpentSeconds: 1800, started: 'x' } }),
          failedEntry({ id: 'post-3', issueKey: 'GAPI-3', body: { timeSpentSeconds: 900, started: 'x' } }),
          // A delete-only failure must NOT count toward the "other writes"
          // total — it carries no worklog write to report.
          failedEntry({ id: 'del-1', kind: 'delete', issueKey: 'GAPI-4', body: undefined }),
        ]}
        onRetry={vi.fn()}
        onLogElsewhere={vi.fn()}
      />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(screen.getByText(/GAPI-1/)).toBeTruthy();
    expect(screen.getByText(/\+2 more/)).toBeTruthy();
  });

  it('a single failure states no count suffix', async () => {
    render(<WriteErrorBanner entries={[failedEntry()]} onRetry={vi.fn()} onLogElsewhere={vi.fn()} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();
  });
});
