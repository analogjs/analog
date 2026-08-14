import { createBuilder } from '@angular-devkit/architect';
import type {
  Builder,
  BuilderContext,
  BuilderOutput,
} from '@angular-devkit/architect';
import type { JsonObject } from '@angular-devkit/core';
import { resolve } from 'node:path';

import { analogContentPlugin } from './analog-content-plugin.js';
import { analogRouterPlugin } from './analog-router-plugin.js';
import { loadAngularBuild } from './load-angular-build.js';

type ApplicationBuilderOptions = JsonObject & {
  define?: Record<string, string>;
};

/**
 * Wraps the Angular application builder (@angular/build, v18+) and
 * injects the Analog route discovery esbuild plugin through the
 * `extensions.codePlugins` argument of `buildApplication`. All other
 * options pass through to the underlying builder untouched.
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

  // import.meta.env is applied per bundle by analogRouterPlugin, since
  // the browser and server bundles need different SSR values.
  yield* buildApplication(options as never, context, {
    codePlugins: [
      analogRouterPlugin({
        workspaceRoot: context.workspaceRoot,
        projectRoot,
      }),
      analogContentPlugin({
        workspaceRoot: context.workspaceRoot,
        projectRoot,
      }),
    ],
  }) as AsyncIterable<BuilderOutput>;
}

export default createBuilder(
  buildAnalogApplication,
) as Builder<ApplicationBuilderOptions>;
