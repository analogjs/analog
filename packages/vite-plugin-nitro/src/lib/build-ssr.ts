import { build, mergeConfig, UserConfig } from 'vite';
import * as path from 'path';

import { Options } from './options.js';

export async function buildSSRApp(config: UserConfig, options?: Options) {
  const ssrBuildConfig = mergeConfig(config, {
    build: {
      ssr: true,
      rollupOptions: {
        input:
          options?.entryServer ||
          path.resolve(config.root!, './src/main.server.ts'),
      },
      outDir: options?.ssrBuildDir || path.resolve('dist', config.root!, 'ssr'),
    },
  });

  await build(ssrBuildConfig);
}
