import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
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
