import type { ExecutorContext } from '@nx/devkit';
import { resolve } from 'node:path';

import {
  getProjectRoot,
  loadEsm,
  loadNxExecutor,
  waitForExit,
} from '../../utils/executor-utils';
import { ViteBuildExecutorOptions } from './schema';

interface Vite {
  build(config: object): Promise<unknown>;
}

export default async function* viteBuildExecutor(
  options: ViteBuildExecutorOptions,
  context: ExecutorContext,
): AsyncGenerator<{ success: boolean }> {
  const nxExecutor = await loadNxExecutor<typeof viteBuildExecutor>(
    '@nx/vite/executors',
    'viteBuildExecutor',
  );
  if (nxExecutor) {
    return yield* nxExecutor(options, context);
  }

  const { build } = await loadEsm<Vite>('vite');
  await build({
    configFile: options.configFile && resolve(context.root, options.configFile),
    root: getProjectRoot(context),
    base: options.base,
    mode: options.mode ?? 'production',
    logLevel: options.logLevel,
    optimizeDeps: { force: options.force },
    build: {
      outDir: options.outputPath && resolve(context.root, options.outputPath),
      emptyOutDir: options.emptyOutDir,
      sourcemap: options.sourcemap,
      target: options.target,
      minify: options.minify,
      manifest: options.manifest,
      ssrManifest: options.ssrManifest,
      ssr: options.ssr,
      cssCodeSplit: options.cssCodeSplit,
      watch: options.watch === true ? {} : options.watch || undefined,
    },
  });
  yield { success: true };

  if (options.watch) {
    await waitForExit();
  }
}
