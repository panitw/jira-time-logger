import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Finding 29 (Nit, Story 7.8): `date-fns#format` renders in the local
    // zone. `DrillDownPanel.test.tsx`'s change-summary fixtures assert a
    // literal formatted date (e.g. "3 Jun") derived from a UTC ISO instant
    // — at any negative UTC offset (all of the Americas) that instant falls
    // on the PREVIOUS local day, so the test passes in CI/here and reds for
    // a US-based contributor with no code change. Pin the whole suite to
    // UTC so date-formatting assertions are deterministic everywhere.
    env: { TZ: 'UTC' },
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'output/',
        '.output/',
        '.wxt/',
        '**/*.test.ts',
        '**/*.test.tsx',
        'lib/test/**',
        'vitest.setup.ts',
        'eslint.config.js',
        'vitest.config.ts',
        'wxt.config.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname),
    },
  },
});
