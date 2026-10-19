import {
  BuilderContext,
  BuilderOutput,
  createBuilder,
  targetFromTargetString,
} from '@angular-devkit/architect';
import type { InlineConfig } from 'vite';
import { ViteBuildSchema } from './schema';

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
      outDir: options.outputPath,
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
