import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { svg, type IconName } from './banner-icons';

const ALL_ICONS: IconName[] = ['ArrowUpRight', 'CircleCheck', 'Circle', 'CircleX', 'CornerDownLeft', 'X'];

describe('banner-icons svg() — hand-inlined lucide paths (AC9, D-7.11-36/3)', () => {
  it.each(ALL_ICONS)('%s renders an <svg> with viewBox 0 0 24 24', (name) => {
    const el = svg(name);
    expect(el.tagName.toLowerCase()).toBe('svg');
    expect(el.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it.each(ALL_ICONS)('%s is aria-hidden and focusable="false" (A11y-2)', (name) => {
    const el = svg(name);
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('focusable')).toBe('false');
  });

  it.each(ALL_ICONS)('%s defaults to 13px and honours a custom size', (name) => {
    const def = svg(name);
    expect(def.getAttribute('width')).toBe('13');
    expect(def.getAttribute('height')).toBe('13');
    const sized = svg(name, { size: 20 });
    expect(sized.getAttribute('width')).toBe('20');
    expect(sized.getAttribute('height')).toBe('20');
  });

  it.each(ALL_ICONS.filter((n) => n !== 'Circle'))('%s is stroked, not filled', (name) => {
    const el = svg(name);
    expect(el.getAttribute('fill')).toBe('none');
    expect(el.getAttribute('stroke')).toBe('currentColor');
  });

  it("Circle (icons.attention) is filled with currentColor, per DESIGN.md's Do's list", () => {
    const el = svg('Circle');
    expect(el.getAttribute('fill')).toBe('currentColor');
  });

  it('ArrowUpRight ("Open extension ↗") renders exactly the two lucide paths', () => {
    const el = svg('ArrowUpRight');
    const paths = el.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('d')).toBe('M7 7h10v10');
    expect(paths[1]?.getAttribute('d')).toBe('M7 17 17 7');
  });

  it('CircleCheck (success) renders a circle + check path', () => {
    const el = svg('CircleCheck');
    expect(el.querySelectorAll('circle')).toHaveLength(1);
    const path = el.querySelector('path');
    expect(path?.getAttribute('d')).toBe('m9 12 2 2 4-4');
  });

  it('CircleX (write-failed) renders a circle + two crossing paths', () => {
    const el = svg('CircleX');
    expect(el.querySelectorAll('circle')).toHaveLength(1);
    expect(el.querySelectorAll('path')).toHaveLength(2);
  });

  it('CornerDownLeft (keyboard hint) renders a polyline + path', () => {
    const el = svg('CornerDownLeft');
    expect(el.querySelectorAll('polyline')).toHaveLength(1);
    expect(el.querySelectorAll('path')).toHaveLength(1);
  });

  it('X (dismiss, D-7.11-31a) renders exactly two crossing paths — not CircleX, not Trash2', () => {
    const el = svg('X');
    expect(el.querySelectorAll('circle')).toHaveLength(0);
    const paths = el.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('d')).toBe('M18 6 6 18');
    expect(paths[1]?.getAttribute('d')).toBe('m6 6 12 12');
  });

  it('accepts an explicit document (no implicit global dependency)', () => {
    const el = svg('X', {}, document);
    expect(el.ownerDocument).toBe(document);
  });
});

describe('lib/banner-icons.ts makes no network request (AC1)', () => {
  it('source contains no fetch/XHR/Image/url(http', () => {
    const source = readFileSync(path.join(process.cwd(), 'lib/banner-icons.ts'), 'utf-8');
    expect(source).not.toMatch(/fetch\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/new Image/);
    expect(source).not.toMatch(/url\(http/);
  });
});
