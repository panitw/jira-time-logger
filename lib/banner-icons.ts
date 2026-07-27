/**
 * Hand-inlined lucide SVG paths for the guest rail (Story 7.11, AC9).
 *
 * The guest rail is vanilla DOM under Jira's CSP and cannot import React
 * components — `lucide-react` icons cannot be used directly. `DESIGN.md:222-224`
 * gives an explicit exception: hand-inline the same shapes as plain SVG,
 * copied at BUILD TIME from the installed `lucide-react@^0.460.0` package
 * (`node_modules/lucide-react/dist/esm/icons/*.js`). No network fetch, no
 * `<img>`, no icon font, no dependency at runtime (AC1).
 *
 * This is the ONE home for icon path data on this surface (D-7.11-39) — no
 * `createElementNS` calls elsewhere in `lib/banner-dom.ts` or `content.ts`.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The icons this surface needs, and where each one is used:
 *  - ArrowUpRight — "Open extension ↗" (icons.open-external)
 *  - CircleCheck  — success "✓ Logged {N}h" (icons.met)
 *  - Circle       — format-error glyph, filled (icons.attention)
 *  - CircleX      — write-failed glyph (icons.error)
 *  - CornerDownLeft — "⏎ to log · esc to close" (icons.submit)
 *  - X            — dismiss (E-1 / D-7.11-31a: `error`/`delete` both carry
 *    the wrong meaning; a dismiss is neither a failure nor a delete). */
export type IconName = 'ArrowUpRight' | 'CircleCheck' | 'Circle' | 'CircleX' | 'CornerDownLeft' | 'X';

type PathSpec = { tag: 'path'; d: string };
type CircleSpec = { tag: 'circle'; cx: string; cy: string; r: string };
type PolylineSpec = { tag: 'polyline'; points: string };
type ShapeSpec = PathSpec | CircleSpec | PolylineSpec;

/** Path data copied verbatim from `lucide-react@0.460.0`'s icon source. */
const ICON_SHAPES: Record<IconName, ShapeSpec[]> = {
  ArrowUpRight: [
    { tag: 'path', d: 'M7 7h10v10' },
    { tag: 'path', d: 'M7 17 17 7' },
  ],
  CircleCheck: [
    { tag: 'circle', cx: '12', cy: '12', r: '10' },
    { tag: 'path', d: 'm9 12 2 2 4-4' },
  ],
  Circle: [{ tag: 'circle', cx: '12', cy: '12', r: '10' }],
  CircleX: [
    { tag: 'circle', cx: '12', cy: '12', r: '10' },
    { tag: 'path', d: 'm15 9-6 6' },
    { tag: 'path', d: 'm9 9 6 6' },
  ],
  CornerDownLeft: [
    { tag: 'polyline', points: '9 10 4 15 9 20' },
    { tag: 'path', d: 'M20 4v7a4 4 0 0 1-4 4H4' },
  ],
  X: [
    { tag: 'path', d: 'M18 6 6 18' },
    { tag: 'path', d: 'm6 6 12 12' },
  ],
};

/** `Circle` (icons.attention) is filled (`fill="currentColor"`) per
 * `DESIGN.md`'s Do's list ("Fill `{icons.attention}` and `{icons.time-off}`
 * with `currentColor`; leave every other icon stroked"). Every other icon
 * here is stroked, matching lucide's own default. */
const FILLED_ICONS: ReadonlySet<IconName> = new Set(['Circle']);

/**
 * Build one icon as an inline SVG element. Always `aria-hidden="true"` and
 * `focusable="false"` (A11y-2) — meaning is carried by adjacent text in
 * every call site, never by the icon alone.
 */
export function svg(name: IconName, opts: { size?: number } = {}, doc: Document = document): SVGSVGElement {
  const size = String(opts.size ?? 13);
  const root = doc.createElementNS(SVG_NS, 'svg');
  root.setAttribute('viewBox', '0 0 24 24');
  root.setAttribute('width', size);
  root.setAttribute('height', size);
  root.setAttribute('fill', FILLED_ICONS.has(name) ? 'currentColor' : 'none');
  root.setAttribute('stroke', 'currentColor');
  root.setAttribute('stroke-width', '2');
  root.setAttribute('stroke-linecap', 'round');
  root.setAttribute('stroke-linejoin', 'round');
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('focusable', 'false');

  for (const shape of ICON_SHAPES[name]) {
    const el = doc.createElementNS(SVG_NS, shape.tag);
    if (shape.tag === 'path') {
      el.setAttribute('d', shape.d);
    } else if (shape.tag === 'circle') {
      el.setAttribute('cx', shape.cx);
      el.setAttribute('cy', shape.cy);
      el.setAttribute('r', shape.r);
    } else {
      el.setAttribute('points', shape.points);
    }
    root.appendChild(el);
  }

  return root;
}
