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
  if (!context.target) {
    throw new Error('Builder must be executed with a target');
  }
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
    await server.listen();
    server.printUrls();

    const resolvedUrls = [
      ...server.resolvedUrls.local,
      ...server.resolvedUrls.network,
    ];

    const processOnExit = async () => {
      await server.close();
    };

    // Use process.once to avoid listener accumulation when Nx invokes
    // multiple builders in the same process during a large build graph.
    await new Promise<void>((resolve) => {
      const shutdown = () => {
        processOnExit().then(
          () => resolve(),
          () => resolve(),
        );
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
      process.once('exit', shutdown);
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

export default createBuilder(viteDevServerBuilder) as any;
