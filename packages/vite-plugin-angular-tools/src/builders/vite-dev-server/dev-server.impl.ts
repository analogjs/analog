import {
  BuilderContext,
  BuilderOutput,
  createBuilder,
  targetFromTargetString,
} from '@angular-devkit/architect';
import type { InlineConfig } from 'vite';
import { ViteDevServerSchema } from './schema';

async function viteDevServerBuilder(
  options: ViteDevServerSchema,
  context: BuilderContext,
): Promise<BuilderOutput> {
  const { createServer } = await Function('return import("vite")')();
  const projectConfig = await context.getProjectMetadata(context.target);
  const projectName = context.target.project;
  const buildTargetSpecifier = options.buildTarget ?? `::development`;
  const buildTarget = targetFromTargetString(
    buildTargetSpecifier,
    projectName,
    'build',
  );

  const browserBuilderName = await context.getBuilderNameForTarget(buildTarget);
  const rawBuildOptions = await context.getTargetOptions(buildTarget);
  const buildOptions = await context.validateOptions(
    rawBuildOptions,
    browserBuilderName,
  );

  const serverConfig: InlineConfig = {
    configFile: buildOptions.configFile as string,
    root: projectConfig.root as string,
    mode: (process.env.NODE_ENV ??
      buildOptions.mode ??
      'development') as string,
    build: {
      sourcemap: !!buildOptions.sourcemap,
    },
    server: {
      hmr: options?.hmr,
      port: options?.port,
    },
  };

  try {
    const server = await createServer(serverConfig);
    await runViteDevServer(server);
    const resolvedUrls = [
      ...server.resolvedUrls.local,
      ...server.resolvedUrls.network,
    ];

    await new Promise<void>((resolve) => {
      process.once('SIGINT', () => resolve());
      process.once('SIGTERM', () => resolve());
      process.once('exit', () => resolve());
    });

    return {
      success: true,
      baseUrl: resolvedUrls[0] ?? '',
    };
  } catch (e) {
    console.error(e);
    return {
      success: false,
      baseUrl: '',
    };
  }
}

// vite ViteDevServer
async function runViteDevServer(server: Record<string, any>): Promise<void> {
  await server.listen();

  server.printUrls();

  const processOnExit = async () => {
    await server.close();
  };

  process.once('SIGINT', processOnExit);
  process.once('SIGTERM', processOnExit);
  process.once('exit', processOnExit);
}

export default createBuilder(viteDevServerBuilder) as any;
