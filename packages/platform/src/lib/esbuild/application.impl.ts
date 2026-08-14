import { createBuilder } from '@angular-devkit/architect';
import type {
  Builder,
  BuilderContext,
  BuilderOutput,
} from '@angular-devkit/architect';
import type { JsonObject } from '@angular-devkit/core';
import { resolve } from 'node:path';

import { analogRouterPlugin, routerDefine } from './analog-router-plugin.js';

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
  const { buildApplication } = await (Function(
    'return import("@angular/build")',
  )() as Promise<typeof import('@angular/build')>);

  const projectMetadata = await context.getProjectMetadata(context.target!);
  const projectRoot = resolve(
    context.workspaceRoot,
    (projectMetadata['root'] as string) ?? '.',
  );

  yield* buildApplication(
    {
      ...options,
      define: {
        // DEV is flipped through configurations, e.g. the development
        // configuration can set "define": { "import.meta.env": "{\"DEV\":true,\"SSR\":false}" }
        ...routerDefine({ DEV: false }),
        ...options.define,
      },
    } as never,
    context,
    {
      codePlugins: [
        analogRouterPlugin({
          workspaceRoot: context.workspaceRoot,
          projectRoot,
        }),
      ],
    },
  ) as AsyncIterable<BuilderOutput>;
}

export default createBuilder(
  buildAnalogApplication,
) as Builder<ApplicationBuilderOptions>;
