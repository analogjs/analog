import { NitroConfig } from 'nitropack';
import { ConfigEnv, UserConfig, Plugin } from 'vite';
import { Mock, vi } from 'vitest';

export const mockViteDevServer = {
  middlewares: {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    use: () => {},
  },
};

export const mockNitroConfig: NitroConfig = {
  buildDir: './dist/.nitro',
  logLevel: 0,
  output: {
    dir: '../dist/analog',
    publicDir: '../dist/analog/public',
  },
  rootDir: '.',
  runtimeConfig: {},
  scanDirs: ['src/server'],
  srcDir: 'src/server',
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
