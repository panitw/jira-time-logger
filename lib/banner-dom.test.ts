import { describe, it, expect, afterEach } from 'vitest';
import {
  BANNER_STRINGS,
  ensureBannerHost,
  renderCollapsedBanner,
  renderExpandedQuickLog,
} from '@/lib/banner-dom';
import { BANNER_HOST_ID } from '@/lib/banner-styles';
import { scan, criticalOrSerious } from '@/lib/test/axe';

afterEach(() => {
  document.getElementById(BANNER_HOST_ID)?.remove();
  document.body.replaceChildren();
});

describe('banner DOM (Story 3.3 / 6.1 a11y)', () => {
  it('the collapsed banner host is a labelled region with semantic buttons', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });

    expect(host.getAttribute('role')).toBe('region');
    expect(host.getAttribute('aria-label')).toBe(BANNER_STRINGS.bannerRegionLabel);

    const buttons = host.querySelectorAll('button');
    // contextual "Log time on KEY" + "Open extension" + ✕ dismiss.
    expect(buttons).toHaveLength(3);
    buttons.forEach((b) => expect(b.getAttribute('type')).toBe('button'));
    // The icon-only dismiss carries an aria-label (never a mystery ✕).
    const dismiss = host.querySelector('button[aria-label]');
    expect(dismiss?.getAttribute('aria-label')).toBe(BANNER_STRINGS.dismissLabel);
    // Brand dot is decorative.
    expect(host.querySelector('[aria-hidden="true"]')?.textContent).toBe('●');
  });

  it('collapsed banner (contextual) has zero Critical/Serious axe violations', async () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    const results = await scan(host);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });

  it('collapsed banner (non-contextual, no CTA) has zero Critical/Serious axe violations', async () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 3 });
    expect(host.querySelectorAll('button')).toHaveLength(2); // open + dismiss
    const results = await scan(host);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });

  it('the expanded quick-log input has an accessible name (aria-label)', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    const { input, logBtn, error } = renderExpandedQuickLog(host, 'PROJ-12');
    expect(input.getAttribute('aria-label')).toBe(BANNER_STRINGS.hoursLabel('PROJ-12'));
    expect(logBtn.getAttribute('type')).toBe('button');
    // The error slot announces assertively when shown.
    expect(error.getAttribute('role')).toBe('alert');
  });

  it('expanded quick-log has zero Critical/Serious axe violations', async () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    renderExpandedQuickLog(host, 'PROJ-12');
    const results = await scan(host);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });
});
