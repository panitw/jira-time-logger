import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scan, criticalOrSerious } from '@/lib/test/axe';

/**
 * Retargeted for Story 7.10 / D-7.10-39: the options page no longer hosts
 * the settings surface itself — it redirects to the full page's Settings
 * section via `lib/open-full-page.ts#openFullPage`, then closes its own
 * tab. `entrypoints/options/App.test.tsx` never existed at this baseline
 * despite the story's Dev Notes citing 182 lines for it — verified absent
 * by `find`; only this a11y file exists, so only this file is retargeted.
 */

const openFullPageMock = vi.fn();
vi.mock('@/lib/open-full-page', () => ({
  openFullPage: (...args: unknown[]) => openFullPageMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('close', vi.fn());
});

const { App } = await import('./App');

describe('Options page redirect (Story 7.10, D-7.10-39)', () => {
  it('redirects to the full page Settings section on mount', () => {
    render(<App />);
    expect(openFullPageMock).toHaveBeenCalledWith('settings');
  });

  it('closes its own tab after redirecting', () => {
    render(<App />);
    expect(window.close).toHaveBeenCalled();
  });

  it('renders a brief honest line, never a spinner', () => {
    render(<App />);
    expect(screen.getByText('Opening Settings on the full page…')).toBeTruthy();
    expect(document.querySelector('[role="progressbar"]')).toBeNull();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('has zero Critical/Serious axe violations', async () => {
    const { container } = render(<App />);
    const results = await scan(container);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });
});
