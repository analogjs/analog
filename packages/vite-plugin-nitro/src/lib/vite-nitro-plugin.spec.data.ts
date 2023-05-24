import { NitroConfig } from 'nitropack';
import { ConfigEnv, UserConfig, Plugin } from 'vite';
import { Mock, vi } from 'vitest';
import * as path from 'path';

export const mockViteDevServer = {
  middlewares: {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    use: () => {},
  },
};

export const mockNitroConfig: NitroConfig = {
  buildDir: path.resolve('./dist/.nitro'),
  logLevel: 0,
  output: {
    dir: path.resolve('dist/analog'),
    publicDir: path.resolve('dist/analog/public'),
  },
  rootDir: '.',
  runtimeConfig: {},
  scanDirs: ['src/server'],
  srcDir: 'src',
  prerender: {
    crawlLinks: undefined,
  },
  typescript: {
    generateTsConfig: false,
  },
};

export async function mockBuildFunctions(): Promise<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [Mock<any, any>, Mock<any, any>]
> {
  const buildServerImport = await import('./build-server');
  const buildServerImportSpy = vi.fn();
  buildServerImport.buildServer = buildServerImportSpy;

  const buildSSRAppImport = await import('./build-ssr');
  const buildSSRAppImportSpy = vi.fn();
  buildSSRAppImport.buildSSRApp = buildSSRAppImportSpy;

  return [buildSSRAppImportSpy, buildServerImportSpy];
}

export async function runConfigAndCloseBundle(plugin: Plugin): Promise<void> {
  await (
    plugin.config as (config: UserConfig, env: ConfigEnv) => Promise<UserConfig>
  )({}, { command: 'build' } as ConfigEnv);
  await (plugin.closeBundle as () => Promise<void>)();
}
