import { build, mergeConfig, UserConfig } from 'vite';
import * as path from 'path';

import { Options } from './options.js';

export async function buildSSRApp(config: UserConfig, options?: Options) {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const rootDir = path.relative(workspaceRoot, config.root || '.') || '.';

  const ssrBuildConfig = mergeConfig(config, {
    build: {
      ssr: true,
      rollupOptions: {
        input:
          options?.entryServer || path.resolve(rootDir, './src/main.server.ts'),
      },
      outDir: options?.ssrBuildDir || path.resolve('dist', rootDir, 'ssr'),
    },
  });

  await build(ssrBuildConfig);
}
