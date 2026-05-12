import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  outDir: 'output',
  manifest: {
    name: 'jira-time-logger',
    description:
      "Log Jira time daily, approve monthly. Toolbar badge, inline banner, manager matrix.",
    permissions: ['identity', 'storage', 'alarms', 'notifications'],
    host_permissions: [
      'https://*.atlassian.net/*',
      'https://api.atlassian.com/*',
      'https://auth.atlassian.com/*',
    ],
    // options_ui is auto-derived by WXT from entrypoints/options/.
    // `open_in_tab: true` is declared via <meta name="manifest.open_in_tab">
    // inside entrypoints/options/index.html (WXT's preferred pattern).
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname),
      },
    },
  }),
});
