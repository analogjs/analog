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
  const projectConfig = await context.getProjectMetadata(context.target);
  const projectName = context.target.project;
  const configuration = context.target?.configuration || 'production';
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

  const buildConfig: InlineConfig = {
    configFile: options.configFile,
    root: projectConfig.root as string,
    mode: (process.env.NODE_ENV ??
      buildOptions.mode ??
      configuration) as string,
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
