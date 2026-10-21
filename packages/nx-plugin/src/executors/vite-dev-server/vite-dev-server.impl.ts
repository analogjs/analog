import {
  type ExecutorContext,
  joinPathFragments,
  parseTargetString,
  readTargetOptions,
} from '@nx/devkit';
import { pathToFileURL } from 'node:url';
import type { InlineConfig, ServerOptions } from 'vite';

import type { ViteDevServerExecutorOptions } from './schema';

type NxViteExecutors = Partial<typeof import('@nx/vite/executors')>;

interface DevServerOptions extends ViteDevServerExecutorOptions {
  port?: number;
  host?: boolean | string;
  https?: ServerOptions['https'];
  hmr?: boolean;
  open?: boolean | string;
  cors?: boolean;
  logLevel?: InlineConfig['logLevel'];
  mode?: string;
  clearScreen?: boolean;
  force?: boolean;
}

interface DevServerOutput {
  success: boolean;
  baseUrl: string;
}

export default async function* viteDevServerExecutor(
  options: DevServerOptions,
  context: ExecutorContext,
): AsyncGenerator<DevServerOutput> {
  const nxViteExecutors: NxViteExecutors = await import('@nx/vite/executors');

  if (nxViteExecutors.viteDevServerExecutor) {
    yield* nxViteExecutors.viteDevServerExecutor(options, context);
    return;
  }

  yield* analogViteDevServer(options, context);
}

async function* analogViteDevServer(
  options: DevServerOptions,
  context: ExecutorContext,
): AsyncGenerator<DevServerOutput> {
  const { createServer } = await import('vite');
  const projectRoot =
    context.projectsConfigurations.projects[context.projectName!].root;
  const buildOptions = readTargetOptions(
    parseTargetString(options.buildTarget, context),
    context,
  );

  const serverConfig: InlineConfig = {
    root: joinPathFragments(context.root, projectRoot),
    configFile: buildOptions.configFile
      ? joinPathFragments(context.root, buildOptions.configFile)
      : undefined,
    mode: options.mode ?? buildOptions.mode ?? 'development',
    logLevel: options.logLevel,
    clearScreen: options.clearScreen,
    optimizeDeps: options.force ? { force: true } : undefined,
    server: {
      port: options.port,
      host: options.host,
      https: options.https,
      hmr: options.hmr,
      open: options.open,
      cors: options.cors,
      proxy: options.proxyConfig
        ? await loadProxyConfig(context.root, options.proxyConfig)
        : undefined,
    },
  };

  try {
    const server = await createServer(serverConfig);
    await server.listen();
    server.printUrls();
    process.once('SIGINT', () => server.close());
    process.once('SIGTERM', () => server.close());

    const { local = [], network = [] } = server.resolvedUrls ?? {};
    yield { success: true, baseUrl: [...local, ...network][0] ?? '' };
  } catch (e) {
    console.error(e);
    yield { success: false, baseUrl: '' };
    return;
  }

  await new Promise<void>((resolve) => {
    process.once('SIGINT', () => resolve());
    process.once('SIGTERM', () => resolve());
    process.once('exit', () => resolve());
  });
}

async function loadProxyConfig(
  workspaceRoot: string,
  proxyConfig: string,
): Promise<ServerOptions['proxy']> {
  const module = await import(
    pathToFileURL(joinPathFragments(workspaceRoot, proxyConfig)).href
  );
  return module.default ?? module;
}
