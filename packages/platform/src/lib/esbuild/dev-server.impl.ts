import {
  createBuilder,
  targetFromTargetString,
} from '@angular-devkit/architect';
import type {
  Builder,
  BuilderContext,
  BuilderOutput,
} from '@angular-devkit/architect';
import type { JsonObject } from '@angular-devkit/core';
import { resolve } from 'node:path';

import { analogContentPlugin } from './analog-content-plugin.js';
import type { AnalogBuilderOptions } from './analog-options.js';
import { analogRouterPlugin } from './analog-router-plugin.js';
import { loadAngularBuild } from './load-angular-build.js';

/**
 * Wraps the Angular dev-server builder (@angular/build, v18+) and
 * injects the Analog route discovery esbuild plugin through the
 * `extensions.buildPlugins` argument. Watching and live reload are
 * defaulted on, and the project root is watched so added or removed
 * pages rebuild and reach the served bundles.
 */
export async function* serveAnalogApplication(
  options: JsonObject,
  context: BuilderContext,
): AsyncIterable<BuilderOutput> {
  // Angular's dev server takes these defaults from its JSON schema, and
  // this builder's pass-through schema has none — without them the inner
  // build runs unwatched and rebuilds never reach the served bundles.
  const serveOptions = { ...options };
  serveOptions['watch'] ??= true;
  serveOptions['liveReload'] ??= true;

  const { executeDevServerBuilder } = await loadAngularBuild();

  const projectMetadata = await context.getProjectMetadata(context.target!);
  const projectRoot = resolve(
    context.workspaceRoot,
    (projectMetadata['root'] as string) ?? '.',
  );

  // Plugin settings live in the build target's `analog` option section.
  let analog: AnalogBuilderOptions = {};
  if (typeof serveOptions['buildTarget'] === 'string') {
    const buildTargetOptions = await context.getTargetOptions(
      targetFromTargetString(serveOptions['buildTarget']),
    );
    analog = (buildTargetOptions['analog'] as AnalogBuilderOptions) ?? {};
  }

  yield* executeDevServerBuilder(serveOptions as never, context, {
    buildPlugins: [
      analogRouterPlugin({
        workspaceRoot: context.workspaceRoot,
        projectRoot,
        dev: true,
        additionalPagesDirs: analog.additionalPagesDirs,
        additionalContentDirs: analog.additionalContentDirs,
      }),
      analogContentPlugin({
        workspaceRoot: context.workspaceRoot,
        projectRoot,
        highlighter: analog.highlighter,
        mermaid: analog.mermaid,
        additionalContentDirs: analog.additionalContentDirs,
      }),
    ],
  }) as AsyncIterable<BuilderOutput>;
}

export default createBuilder(serveAnalogApplication) as Builder<JsonObject>;
