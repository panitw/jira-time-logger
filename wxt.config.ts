import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  outDir: 'output',
  manifest: {
    // `key` pins the extension ID (and therefore the OAuth redirect URI) to the
    // production signing key instead of the install path, so the unpacked dev
    // build, the Chrome .crx, the Edge .crx, and every developer machine all
    // resolve to ONE id and ONE registered callback URL.
    //
    // This is the PUBLIC half of the signing key — safe to commit. The .pem it
    // derives from is not, and lives only in the team vault. Regenerate this
    // value with `pnpm ext:id`; see docs/release.md > OAuth callback URL.
    //
    // Pinned id:       npebpnfjmeehmaeekloeiicbkldggmmb
    // Registered URI:  https://npebpnfjmeehmaeekloeiicbkldggmmb.chromiumapp.org/
    //
    // DO NOT change this value. The extension id is derived from it, so a new
    // key orphans every existing install as a duplicate rather than updating it
    // in place, and invalidates the callback URL registered with Atlassian.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt0hb5Tskw49OXWji01uv8Hi/jfJe34DRkPts2lyhincNF/ronkKvKNPSzZUkmnLM+KQdLfkYxfPVCbkgF3FZ8DzeblZeKOz78Xlc1EEDEKwODiCMGmNsCEAAkW6n3ltit4WSTDpie9710HistyoVXxaTHNR/NLubu6daPn4pUwl2xHr5m1tkbcBRMb+mo3XGjf9+pHSq0WH337SBTL9v/ZiblCxfZfyjRpkuP9nmvefFo/RewNuumeDA0ceTxd5uYpwnc35R6Udz0vq9cHEn9lvdbDVCAxfnY7EJeJQUpj09FtgQJCiijeAxGst76GYVn0h9I4wTPuX1vuCRZD1AMwIDAQAB',
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
