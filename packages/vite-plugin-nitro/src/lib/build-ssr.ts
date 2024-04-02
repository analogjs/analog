import { build, mergeConfig, UserConfig } from 'vite';
import { relative, resolve } from 'node:path';

import { Options } from './options.js';

export async function buildSSRApp(config: UserConfig, options?: Options) {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const rootDir = relative(workspaceRoot, config.root || '.') || '.';
  const ssrBuildConfig = mergeConfig(config, {
    build: {
      ssr: true,
      rollupOptions: {
        input:
          options?.entryServer ||
          resolve(workspaceRoot, rootDir, 'src/main.server.ts'),
      },
      outDir:
        options?.ssrBuildDir || resolve(workspaceRoot, 'dist', rootDir, 'ssr'),
    },
  });

  await build(ssrBuildConfig);
}
