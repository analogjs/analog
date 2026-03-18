import { build, mergeConfig, UserConfig } from 'vite';
import { relative, resolve } from 'node:path';

import { Options } from './options.js';
import { getBundleOptionsKey } from './utils/rolldown.js';

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
    },
  });

  await build(ssrBuildConfig);
}
