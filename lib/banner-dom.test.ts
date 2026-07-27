import { describe, it, expect, afterEach } from 'vitest';
import {
  BANNER_STRINGS,
  ensureBannerHost,
  renderCollapsedBanner,
  renderExpandedQuickLog,
} from '@/lib/banner-dom';
import { BANNER_HOST_ID, RAIL_HEIGHT } from '@/lib/banner-styles';
import { scan, criticalOrSerious } from '@/lib/test/axe';

afterEach(() => {
  document.getElementById(BANNER_HOST_ID)?.remove();
  document.body.replaceChildren();
});

describe('banner DOM — the guest rail (Story 3.3 / 7.11 restyle / 6.1 a11y)', () => {
  it('the collapsed banner host is a labelled region with semantic buttons, in mark→eyebrow→divider→state→spacer→cta→open→dismiss order', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });

    expect(host.getAttribute('role')).toBe('region');
    expect(host.getAttribute('aria-label')).toBe(BANNER_STRINGS.bannerRegionLabel);

    const buttons = host.querySelectorAll('button');
    // contextual "Log time on KEY" + "Open extension" + dismiss.
    expect(buttons).toHaveLength(3);
    buttons.forEach((b) => expect(b.getAttribute('type')).toBe('button'));
    // The icon-only dismiss carries an aria-label (never a mystery glyph).
    const dismiss = host.querySelector('button[aria-label]');
    expect(dismiss?.getAttribute('aria-label')).toBe(BANNER_STRINGS.dismissLabel);

    // Order: mark, eyebrow, divider, state line, spacer, cta, open, dismiss.
    const children = Array.from(host.children);
    expect(children).toHaveLength(8);
    expect(children[1]?.textContent).toBe(BANNER_STRINGS.eyebrow);
    expect(children[3]?.textContent).toBe('6h unlogged this week');
  });

  it('renders the collapsed rail at RAIL_HEIGHT (44px), never the old 56/120px pair', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6 });
    expect(host.getAttribute('style')).toContain(`height:${RAIL_HEIGHT}`);
  });

  it('the mark is TWO nested spans (geometry, D-7.11-36) — not a text glyph', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6 });
    const outer = host.children[0];
    expect(outer?.tagName).toBe('SPAN');
    expect(outer?.getAttribute('aria-hidden')).toBe('true');
    expect(outer?.children).toHaveLength(1);
    expect(outer?.children[0]?.tagName).toBe('SPAN');
    // No text content anywhere in the mark — it is pure geometry.
    expect(outer?.textContent).toBe('');
  });

  it('state line drops the trailing period and weights the figure at 600 (C6)', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6 });
    const stateLine = Array.from(host.children).find((c) => c.textContent?.includes('unlogged'));
    expect(stateLine?.textContent).toBe('6h unlogged this week');
    expect(stateLine?.textContent?.endsWith('.')).toBe(false);
    const figure = stateLine?.querySelector('span');
    expect(figure?.textContent).toBe('6h');
    expect(figure?.getAttribute('style')).toContain('font-weight:600');
  });

  it('AC7 — a ticket page renders the filled contextual action + the GHOST "Open extension"', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    const handles = renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    expect(handles.primaryButton).not.toBeNull();
    expect(handles.primaryButton?.textContent).toBe('Log time on PROJ-12');
    // Ghost: transparent background, no border.
    expect(handles.openExtensionButton.getAttribute('style')).toContain('background:transparent');
    expect(handles.openExtensionButton.getAttribute('style')).toContain('border:none');
  });

  it('AC7 — a non-ticket page renders NO contextual action, and an OUTLINE "Open extension" as the only control', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    const handles = renderCollapsedBanner(host, { hoursMissing: 3 });
    expect(handles.primaryButton).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(2); // open + dismiss
    expect(handles.openExtensionButton.getAttribute('style')).toContain('background:#FFFFFF');
    expect(handles.openExtensionButton.getAttribute('style')).toContain('border:1px solid #E4E3EC');
  });

  it('AC8 — below 860px: no eyebrow, no divider, no "Open extension"; action label shortens; state line ellipsis-truncates', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    const handles = renderCollapsedBanner(
      host,
      { hoursMissing: 6, currentTicket: 'PROJ-12', narrow: true },
    );
    expect(Array.from(host.children).some((c) => c.textContent === BANNER_STRINGS.eyebrow)).toBe(false);
    // The dismiss stays; "Open extension" must not be in the DOM at all below 860px.
    expect(host.querySelectorAll('button')).toHaveLength(2); // cta + dismiss, no open-extension
    expect(handles.primaryButton?.textContent).toBe('Log on PROJ-12');
    const stateLine = Array.from(host.children).find((c) => c.textContent?.includes('unlogged'));
    expect(stateLine?.getAttribute('style')).toContain('text-overflow:ellipsis');
  });

  it('AC8 — the contextual action never wraps: white-space:nowrap and a non-growing flex-basis regardless of width', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    const handles = renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12', narrow: true });
    const style = handles.primaryButton?.getAttribute('style') ?? '';
    expect(style).toContain('white-space:nowrap');
    expect(style).toContain('flex:0 0 auto');
  });

  // TT5 — AC10: the rail states a number and stops. No escalation as the
  // deficit grows: the collapsed rail's DECLARED styles must be
  // byte-identical at 1h, 6h and 40h missing.
  it('AC10 — serialized collapsed-rail styles are byte-identical at hoursMissing 1 / 6 / 40 (no colour escalation)', () => {
    const serialize = (hoursMissing: number): string => {
      const host = ensureBannerHost();
      document.body.appendChild(host);
      renderCollapsedBanner(host, { hoursMissing, currentTicket: 'PROJ-12' });
      const styles = Array.from(host.querySelectorAll<HTMLElement>('*'))
        .map((el) => el.getAttribute('style') ?? '')
        .join('|');
      host.remove();
      return styles;
    };
    const at1 = serialize(1);
    const at6 = serialize(6);
    const at40 = serialize(40);
    expect(at1).toBe(at6);
    expect(at6).toBe(at40);
  });

  it('AC9 — no text glyph is used as an icon anywhere in the collapsed rail', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    const banned = ['●', '✕', '✓', '⚠', '◆', '◔', '↗', '⏎'];
    for (const glyph of banned) {
      expect(host.textContent).not.toContain(glyph);
    }
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

  it('narrow collapsed banner has zero Critical/Serious axe violations (TT16 — new)', async () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12', narrow: true });
    const results = await scan(host);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });

  // Finding 6 — the visible label is a real <label for>, not a <span>
  // duplicating an aria-label (Story 7.10's Blocker class: clicking the
  // visible text must focus the field).
  it('the expanded quick-log input has an accessible name via a real <label for>, not a duplicate aria-label', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    const { input, logBtn, error } = renderExpandedQuickLog(host, 'PROJ-12');
    const label = host.querySelector('label');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe(BANNER_STRINGS.hoursLabel('PROJ-12'));
    expect(label?.getAttribute('for')).toBe(input.id);
    expect(input.id).not.toBe('');
    expect(input.hasAttribute('aria-label')).toBe(false);
    expect(logBtn.getAttribute('type')).toBe('button');
    // The error/status slot announces assertively when shown.
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.style.display).toBe('none');
  });

  // Finding 2 / D-7.11-33 — a pointer-reachable dismiss in the expanded
  // state, same accessible name as the collapsed rail's.
  it('the expanded quick-log has a labelled, pointer-reachable dismiss control (D-7.11-33)', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    const { dismissButton } = renderExpandedQuickLog(host, 'PROJ-12');
    expect(dismissButton.getAttribute('type')).toBe('button');
    expect(dismissButton.getAttribute('aria-label')).toBe(BANNER_STRINGS.dismissLabel);
    expect(host.querySelector('button[aria-label]')).not.toBeNull();
  });

  // Finding 4 — the design gates the error slot and the keyboard hint
  // mutually exclusively; the no-error spacer only exists to push the hint
  // right while the error slot is display:none.
  it('the expanded quick-log has a no-error spacer (flex:1 1 auto) alongside the hint', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    const { spacer, hint } = renderExpandedQuickLog(host, 'PROJ-12');
    expect(spacer.getAttribute('style')).toContain('flex:1 1 auto');
    expect(hint.style.display).not.toBe('none');
  });

  it('expansion NEVER writes host.style.height — D-7.11-45, the content-swap contract (AC5)', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    const before = host.getAttribute('style');
    renderExpandedQuickLog(host, 'PROJ-12');
    const after = host.getAttribute('style');
    // The container's OWN style attribute is untouched by expansion — only
    // its children are replaced.
    expect(after).toBe(before);
    expect(after).toContain(`height:${RAIL_HEIGHT}`);
  });

  it('the keyboard hint uses a CornerDownLeft icon, never the "⏎" text glyph (AC9)', () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    renderExpandedQuickLog(host, 'PROJ-12');
    expect(host.textContent).not.toContain('⏎');
    expect(host.textContent).toContain('to log · esc to close');
    expect(host.querySelector('svg')).not.toBeNull();
  });


  it('expanded quick-log has zero Critical/Serious axe violations', async () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    renderExpandedQuickLog(host, 'PROJ-12');
    const results = await scan(host);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });

  it('expanded quick-log with a visible error has zero Critical/Serious axe violations (TT16 — new)', async () => {
    const host = ensureBannerHost();
    document.body.appendChild(host);
    renderCollapsedBanner(host, { hoursMissing: 6, currentTicket: 'PROJ-12' });
    const { error } = renderExpandedQuickLog(host, 'PROJ-12');
    error.textContent = 'Use formats like 2.5h, 2h 30m';
    error.style.display = '';
    const results = await scan(host);
    expect(criticalOrSerious(results.violations)).toEqual([]);
  });
});
