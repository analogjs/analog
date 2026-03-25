import { build, mergeConfig, UserConfig } from 'vite';
import { relative, resolve } from 'node:path';

import { Options } from './options.js';
import { getBundleOptionsKey } from './utils/rolldown.js';

export async function buildClientApp(
  config: UserConfig,
  options?: Options,
): Promise<void> {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const rootDir = relative(workspaceRoot, config.root || '.') || '.';
  const clientBuildConfig = mergeConfig(config, <UserConfig>{
    build: {
      ssr: false,
      outDir:
        config.build?.outDir ||
        resolve(workspaceRoot, 'dist', rootDir, 'client'),
      emptyOutDir: true,
    },
  });

  await build(clientBuildConfig);
}

export async function buildSSRApp(
  config: UserConfig,
  options?: Options,
): Promise<void> {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const sourceRoot = options?.sourceRoot ?? 'src';
  const rootDir = relative(workspaceRoot, config.root || '.') || '.';
  const bundleOptionsKey = getBundleOptionsKey();
  const ssrBuildConfig = mergeConfig(config, <UserConfig>{
    build: {
      ssr: true,
      [bundleOptionsKey]: {
        input:
          options?.entryServer ||
          resolve(workspaceRoot, rootDir, `${sourceRoot}/main.server.ts`),
      },
      outDir:
        options?.ssrBuildDir || resolve(workspaceRoot, 'dist', rootDir, 'ssr'),
      // Preserve the client build output. The client pass already handled its
      // own cleanup, and on Windows this nested SSR build can otherwise remove
      // sibling artifacts that Nitro needs to read immediately afterward.
      emptyOutDir: false,
    },
  });

  await build(ssrBuildConfig);
}
