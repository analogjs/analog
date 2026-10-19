import {
  BuilderContext,
  BuilderOutput,
  createBuilder,
  targetFromTargetString,
} from '@angular-devkit/architect';
import { resolve } from 'node:path';
import type { InlineConfig } from 'vite';
import { ViteBuildSchema } from './schema';

/**
 * Builder `outputPath` is workspace-relative, matching Angular builders and
 * the Nx `@nx/vite:build` executor that `@analogjs/platform:vite` used in v2.
 * Vite resolves a relative `build.outDir` against `root` (the project root),
 * so resolve it here to keep the output in `<workspaceRoot>/<outputPath>`.
 */
export function resolveOutDir(
  workspaceRoot: string,
  outputPath: string | undefined,
): string | undefined {
  return outputPath ? resolve(workspaceRoot, outputPath) : undefined;
}

async function viteBuilder(
  options: ViteBuildSchema,
  context: BuilderContext,
): Promise<BuilderOutput> {
  const { createBuilder } = await Function('return import("vite")')();
  if (!context.target) {
    throw new Error('Builder must be executed with a target');
  }
  const projectConfig = await context.getProjectMetadata(context.target);
  const projectName = context.target.project;
  const configuration = context.target.configuration || 'production';
  const buildTargetSpecifier = `::${configuration}`;
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

  // Explicit build options and the requested configuration win over an
  // ambient NODE_ENV, so `build:production` cannot silently produce a
  // development build when NODE_ENV happens to be set. See #2458.
  const mode = (buildOptions.mode ?? configuration) as string;

  if (process.env.NODE_ENV && process.env.NODE_ENV !== mode) {
    context.logger.warn(
      `NODE_ENV is set to "${process.env.NODE_ENV}" but is ignored because the build resolved mode "${mode}" from the build options and configuration.`,
    );
  }

  const buildConfig: InlineConfig = {
    configFile: options.configFile,
    root: projectConfig.root as string,
    mode,
    build: {
      outDir: resolveOutDir(context.workspaceRoot, options.outputPath),
      sourcemap: !!buildOptions.sourcemap,
    },
  };

  try {
    const builder = await createBuilder(buildConfig, false);
    await builder.buildApp();

    return {
      success: true,
    };
  } catch (e) {
    console.error(e);
    return {
      success: false,
    };
  }
}

export default createBuilder(viteBuilder) as any;
