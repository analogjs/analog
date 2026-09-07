import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';

export default defineConfig(() => ({
  plugins: [
    analog({
      workspaceRoot: process.cwd(),
      experimental: { streaming: true },
      prerender: {
        routes: ['/static'],
        sitemap: { host: 'https://fixture.test' },
      },
    }),
    angular(),
    nitro({
      preset:
        process.env['ANALOG_FIXTURE_PRESET'] === 'workerd'
          ? 'cloudflare-module'
          : 'node-server',
      cloudflare: {
        wrangler: {
          compatibility_date: '2026-07-30',
          compatibility_flags: ['nodejs_compat', 'enable_request_signal'],
        },
      },
      routeRules: { '/buffered': { streaming: false } },
    }),
  ],
}));
