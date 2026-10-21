import type { ExecutorContext } from '@nx/devkit';
import { resolve } from 'node:path';

import {
  getProjectRoot,
  loadEsm,
  loadNxExecutor,
  waitForExit,
} from '../../utils/executor-utils';
import { VitestExecutorOptions } from './schema';

export default async function* vitestExecutor(
  options: VitestExecutorOptions,
  context: ExecutorContext,
): AsyncGenerator<{ success: boolean }> {
  const nxExecutor = await loadNxExecutor<typeof vitestExecutor>(
    '@nx/vitest/executors',
    'vitestExecutor',
  );
  if (nxExecutor) {
    return yield* nxExecutor(options, context);
  }

  const watch = options.watch === true;
  const { startVitest } =
    await loadEsm<typeof import('vitest/node')>('vitest/node');
  const vitest = await startVitest('test', options.testFiles ?? [], {
    root: getProjectRoot(context),
    config: options.configFile && resolve(context.root, options.configFile),
    mode: options.mode,
    watch,
    ...(options.reportsDirectory && {
      coverage: {
        reportsDirectory: resolve(context.root, options.reportsDirectory),
      },
    }),
  });
  const failed =
    !vitest ||
    vitest.state.getCountOfFailedTests() > 0 ||
    Number(process.exitCode ?? 0) !== 0;
  yield { success: !failed };

  if (watch) {
    await waitForExit();
    await vitest.close();
  }
}
