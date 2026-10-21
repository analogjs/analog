import {
  ExecutorContext,
  parseTargetString,
  readTargetOptions,
} from '@nx/devkit';
import { resolve } from 'node:path';

import {
  getProjectRoot,
  loadEsm,
  loadNxExecutor,
  waitForExit,
} from '../../utils/executor-utils';
import { ViteDevServerExecutorOptions } from './schema';

interface ViteDevServer {
  listen(): Promise<unknown>;
  printUrls(): void;
  close(): Promise<void>;
  resolvedUrls: { local: string[] } | null;
}

interface Vite {
  createServer(config: object): Promise<ViteDevServer>;
}

export default async function* viteDevServerExecutor(
  options: ViteDevServerExecutorOptions,
  context: ExecutorContext,
): AsyncGenerator<{ success: boolean; baseUrl: string }> {
  const nxExecutor = await loadNxExecutor<typeof viteDevServerExecutor>(
    '@nx/vite/executors',
    'viteDevServerExecutor',
  );
  if (nxExecutor) {
    return yield* nxExecutor(options, context);
  }

  const buildOptions = readTargetOptions(
    parseTargetString(options.buildTarget, context),
    context,
  );
  const { createServer } = await loadEsm<Vite>('vite');
  const server = await createServer({
    configFile:
      buildOptions.configFile && resolve(context.root, buildOptions.configFile),
    root: getProjectRoot(context),
    mode: options.mode ?? buildOptions.mode ?? 'development',
    logLevel: options.logLevel,
    clearScreen: options.clearScreen,
    optimizeDeps: { force: options.force },
    server: {
      port: options.port,
      host: options.host,
      https: typeof options.https === 'object' ? options.https : undefined,
      hmr: options.hmr,
      open: options.open,
      cors: options.cors,
    },
  });

  await server.listen();
  server.printUrls();
  yield { success: true, baseUrl: server.resolvedUrls?.local[0] ?? '' };

  await waitForExit();
  await server.close();
}
