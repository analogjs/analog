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
import { analogDeferStreamingPlugin } from './analog-defer-streaming-plugin.js';
import { analogInitPlugin } from './analog-init-plugin.js';
import { analogPageEndpointsPlugin } from './analog-page-endpoints-plugin.js';
import { analogRouterPlugin } from './analog-router-plugin.js';
import { analogServerFnsPlugin } from './analog-server-fns-plugin.js';
import { emitSitemap } from './build-sitemap.js';
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
  const results = buildApplication(buildOptions as never, context, {
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
        markedOptions: analog.markedOptions,
        shikiOptions: analog.shikiOptions,
        prismOptions: analog.prismOptions,
        additionalContentDirs: analog.additionalContentDirs,
      }),
      analogApiPlugin({
        workspaceRoot: context.workspaceRoot,
        projectRoot,
        additionalAPIDirs: analog.additionalAPIDirs,
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
      ...(analog.streaming ? [analogDeferStreamingPlugin()] : []),
      analogInitPlugin({ workspaceRoot: context.workspaceRoot }),
    ],
  }) as AsyncIterable<BuilderOutput>;

  let lastSuccess = false;
  for await (const result of results) {
    lastSuccess = result.success === true;
    yield result;
  }

  // After a successful prerendering build, one sitemap entry per
  // prerendered page in the browser output.
  const outputPath = buildOptions['outputPath'];
  const browserDir =
    typeof outputPath === 'string'
      ? resolve(context.workspaceRoot, outputPath, 'browser')
      : undefined;
  if (analog.sitemap?.host && lastSuccess && browserDir) {
    const routes = emitSitemap(browserDir, analog.sitemap.host);
    context.logger.info(`Emitted sitemap.xml with ${routes.length} routes.`);
  }
}

export default createBuilder(
  buildAnalogApplication,
) as Builder<ApplicationBuilderOptions>;
