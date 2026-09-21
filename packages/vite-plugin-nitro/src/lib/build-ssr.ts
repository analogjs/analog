import { build, mergeConfig, UserConfig } from 'vite';
import * as vite from 'vite';
import { relative, resolve } from 'node:path';

import { Options } from './options.js';
import { I18N_WORKER_SSR_ENTRY } from './utils/i18n-workers.js';

export async function buildSSRApp(
  config: UserConfig,
  options?: Options,
  i18nWorkers = false,
) {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const sourceRoot = options?.sourceRoot ?? 'src';
  const rootDir = relative(workspaceRoot, config.root || '.') || '.';
  const ssrBuildConfig = mergeConfig(config, <UserConfig>{
    build: {
      ssr: true,
      [vite.rolldownVersion ? 'rolldownOptions' : 'rollupOptions']: {
        input: i18nWorkers
          ? { 'main.server': I18N_WORKER_SSR_ENTRY }
          : options?.entryServer ||
            resolve(workspaceRoot, rootDir, `${sourceRoot}/main.server.ts`),
      },
      outDir:
        options?.ssrBuildDir || resolve(workspaceRoot, 'dist', rootDir, 'ssr'),
    },
  });

  await build(ssrBuildConfig);
}
