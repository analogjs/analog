import { createBuilder } from '@angular-devkit/architect';
import type {
  Builder,
  BuilderContext,
  BuilderOutput,
} from '@angular-devkit/architect';
import type { JsonObject } from '@angular-devkit/core';
import { resolve } from 'node:path';

import { analogApiPlugin } from './analog-api-plugin.js';
import { analogContentPlugin } from './analog-content-plugin.js';
import type { AnalogBuilderOptions } from './analog-options.js';
import { analogPageEndpointsPlugin } from './analog-page-endpoints-plugin.js';
import { analogRouterPlugin } from './analog-router-plugin.js';
import { analogServerFnsPlugin } from './analog-server-fns-plugin.js';
import { loadAngularBuild } from './load-angular-build.js';

type ApplicationBuilderOptions = JsonObject & {
  define?: Record<string, string>;
  analog?: AnalogBuilderOptions & JsonObject;
};

/**
 * Wraps the Angular application builder (@angular/build, v18+) and
 * injects the Analog route discovery esbuild plugin through the
 * `extensions.codePlugins` argument of `buildApplication`. The `analog`
 * option section configures the plugins; all other options pass
 * through to the underlying builder untouched.
 */
export async function* buildAnalogApplication(
  options: ApplicationBuilderOptions,
  context: BuilderContext,
): AsyncIterable<BuilderOutput> {
  const { buildApplication } = await loadAngularBuild();

  const projectMetadata = await context.getProjectMetadata(context.target!);
  const projectRoot = resolve(
    context.workspaceRoot,
    (projectMetadata['root'] as string) ?? '.',
  );
  const { analog = {}, ...buildOptions } = options;

  // import.meta.env is applied per bundle by analogRouterPlugin, since
  // the browser and server bundles need different SSR values.
  yield* buildApplication(buildOptions as never, context, {
    codePlugins: [
      analogRouterPlugin({
        workspaceRoot: context.workspaceRoot,
        projectRoot,
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
      analogApiPlugin({
        workspaceRoot: context.workspaceRoot,
        projectRoot,
      }),
      analogPageEndpointsPlugin({
        workspaceRoot: context.workspaceRoot,
        projectRoot,
        additionalPagesDirs: analog.additionalPagesDirs,
      }),
      analogServerFnsPlugin({
        workspaceRoot: context.workspaceRoot,
        projectRoot,
        additionalPagesDirs: analog.additionalPagesDirs,
      }),
    ],
  }) as AsyncIterable<BuilderOutput>;
}

export default createBuilder(
  buildAnalogApplication,
) as Builder<ApplicationBuilderOptions>;
