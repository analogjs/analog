import { NitroConfig } from 'nitropack';
import { ConfigEnv, UserConfig, Plugin } from 'vite';
import { Mock, vi } from 'vitest';
import { resolve } from 'node:path';

export const mockViteDevServer = {
  middlewares: {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    use: () => {},
  },
};

export const mockNitroConfig: NitroConfig = {
  buildDir: resolve('./dist/.nitro'),
  preset: undefined,
  compatibilityDate: '2024-11-19',
  handlers: [],
  logLevel: 0,
  output: {
    dir: resolve('dist/analog'),
    publicDir: resolve('dist/analog/public'),
  },
  rootDir: '.',
  scanDirs: ['src/server'],
  srcDir: 'src/server',
  prerender: {
    crawlLinks: undefined,
  },
  typescript: {
    generateTsConfig: false,
  },
  imports: {
    autoImport: false,
  },
  rollupConfig: {
    plugins: [
      {
        name: 'analogjs-vite-plugin-nitro-rollup-page-endpoint',
        transform() {},
      },
    ],
  },
  routeRules: undefined,
  runtimeConfig: {
    apiPrefix: 'api',
  },
  virtual: {
    '#ANALOG_API_MIDDLEWARE': expect.anything(),
  },
};

export async function mockBuildFunctions() {
  const buildServerImport = await import('./build-server');
  const buildServerImportSpy = vi.fn();
  buildServerImport.buildServer = buildServerImportSpy;

  const buildSitemapImport = await import('./build-sitemap');
  const buildSitemapImportSpy = vi.fn();
  buildSitemapImport.buildSitemap = buildSitemapImportSpy;

  return { buildServerImportSpy, buildSitemapImportSpy };
}

export async function runConfigAndCloseBundle(plugin: Plugin[]): Promise<void> {
  await (
    plugin[1].config as (
      config: UserConfig,
      env: ConfigEnv,
    ) => Promise<UserConfig>
  )({}, { command: 'build' } as ConfigEnv);
}
