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

/**
 * Wraps the Angular dev-server builder (@angular/build, v18+) and
 * injects the Analog route discovery esbuild plugin through the
 * `extensions.buildPlugins` argument. The dev server rebuilds and
 * reloads when pages are added or removed via the plugin's watchDirs.
 */
export async function* serveAnalogApplication(
  options: JsonObject,
  context: BuilderContext,
): AsyncIterable<BuilderOutput> {
  const { executeDevServerBuilder } = await (Function(
    'return import("@angular/build")',
  )() as Promise<typeof import('@angular/build')>);

  const projectMetadata = await context.getProjectMetadata(context.target!);
  const projectRoot = resolve(
    context.workspaceRoot,
    (projectMetadata['root'] as string) ?? '.',
  );

  yield* executeDevServerBuilder(options as never, context, {
    buildPlugins: [
      analogRouterPlugin({
        workspaceRoot: context.workspaceRoot,
        projectRoot,
        dev: true,
      }),
      analogContentPlugin({
        workspaceRoot: context.workspaceRoot,
        projectRoot,
      }),
    ],
  }) as AsyncIterable<BuilderOutput>;
}

export default createBuilder(serveAnalogApplication) as Builder<JsonObject>;
