#!/usr/bin/env node
// scripts/gen-icons.mjs
//
// Rasterises assets/icon/*.svg into the public/icon/*.png set referenced by
// `manifest.icons` in wxt.config.ts. The PNGs are build output that happens to
// be committed (WXT copies public/ verbatim, so they must exist on disk) —
// edit the SVGs and re-run this, never the PNGs.
//
// Two sources, because one drawing cannot serve both ends of the range:
//   16, 32       -> icon-small.svg  (no check mark, heavier dial strokes)
//   48, 96, 128  -> icon.svg        (full mark)
// See the comment headers in each SVG for the reasoning.
//
// Rasterisation uses `sips`, which ships with macOS. There is no cross-platform
// fallback: this is a design-time script run by hand, not part of `pnpm build`,
// and the committed PNGs mean non-macOS contributors never need to run it.
//
// Usage:
//   pnpm icons

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Target size -> source artwork. */
const TARGETS = [
  { size: 16, source: 'icon-small.svg' },
  { size: 32, source: 'icon-small.svg' },
  { size: 48, source: 'icon.svg' },
  { size: 96, source: 'icon.svg' },
  { size: 128, source: 'icon.svg' },
];

if (process.platform !== 'darwin') {
  console.error(
    '\n[icons] ERROR: this script needs `sips` (macOS only).\n' +
      '[icons] The generated PNGs are committed, so you only need to run this\n' +
      '[icons] if you changed assets/icon/*.svg.\n',
  );
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'jtl-icons-'));

try {
  for (const { size, source } of TARGETS) {
    const svg = readFileSync(join(projectRoot, 'assets/icon', source), 'utf8');

    // sips rasterises an SVG at its declared width/height, so stamp the target
    // size onto the root element and let it render natively. Rendering large
    // and downsampling instead would soften the small sizes, where the whole
    // point of icon-small.svg is that strokes land on whole pixels.
    const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
    if (sized === svg) {
      throw new Error(`could not inject dimensions into ${source}`);
    }

    const svgPath = join(work, `${size}.svg`);
    writeFileSync(svgPath, sized);

    execFileSync(
      'sips',
      ['-s', 'format', 'png', svgPath, '--out', join(projectRoot, 'public/icon', `${size}.png`)],
      { stdio: 'ignore' },
    );

    console.info(`[icons] ${String(size).padStart(3)}px  <- ${source}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.info('\n[icons] Wrote public/icon/{16,32,48,96,128}.png\n');
