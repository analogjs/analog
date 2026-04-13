import { Plugin } from 'vite';
import viteNitroPlugin from '@analogjs/vite-plugin-nitro';
import angular from '@analogjs/vite-plugin-angular';
import { mapValues, union } from 'es-toolkit';

import { Options } from './options.js';
import {
  activateDeferredDebug,
  applyDebugOption,
  debugPlatform,
} from './utils/debug.js';
import { discoverLibraryRoutes } from './discover-library-routes.js';
import { routerPlugin } from './router-plugin.js';
import { ssrBuildPlugin } from './ssr/ssr-build-plugin.js';
import { contentPlugin } from './content-plugin.js';
import { clearClientPageEndpointsPlugin } from './clear-client-page-endpoint.js';
import { depsPlugin } from './deps-plugin.js';
import { injectHTMLPlugin } from './ssr/inject-html-plugin.js';
import { serverModePlugin } from '../server-mode-plugin.js';
import { routeGenerationPlugin } from './route-generation-plugin.js';
import { resolveStylePipelinePlugins } from './style-pipeline.js';

// Bridge Plugin types from external @analogjs packages that resolve a different vite instance
function externalPlugins(plugins: unknown): Plugin[] {
  return plugins as Plugin[];
}

export async function platformPlugin(opts: Options = {}): Promise<Plugin[]> {
  applyDebugOption(opts.debug, opts.workspaceRoot);

  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const viteOptions = opts?.vite === false ? undefined : opts?.vite;
  const { ...platformOptions } = {
    ssr: true,
    ...opts,
  };
  if (platformOptions.discoverRoutes) {
    const workspaceRoot =
      platformOptions.workspaceRoot ??
      process.env['NX_WORKSPACE_ROOT'] ??
      process.cwd();
    const discovered = discoverLibraryRoutes(workspaceRoot);
    platformOptions.additionalPagesDirs = union(
      platformOptions.additionalPagesDirs ?? [],
      discovered.additionalPagesDirs,
    );
    platformOptions.additionalContentDirs = union(
      platformOptions.additionalContentDirs ?? [],
      discovered.additionalContentDirs,
    );
    platformOptions.additionalAPIDirs = union(
      platformOptions.additionalAPIDirs ?? [],
      discovered.additionalAPIDirs,
    );
  }

  const useAngularCompilationAPI =
    platformOptions.experimental?.useAngularCompilationAPI ??
    viteOptions?.experimental?.useAngularCompilationAPI;
  debugPlatform('experimental options resolved', {
    useAngularCompilationAPI: !!useAngularCompilationAPI,
    typedRouter: platformOptions.experimental?.typedRouter,
    stylePipeline: !!platformOptions.experimental?.stylePipeline,
  });
  let nitroOptions = platformOptions?.nitro;

  if (nitroOptions?.routeRules) {
    nitroOptions = {
      ...nitroOptions,
      routeRules: mapValues(nitroOptions.routeRules, (rule) => ({
        ...rule,
        headers: {
          ...rule.headers,
          'x-analog-no-ssr': rule?.ssr === false ? 'true' : undefined,
        } as any,
      })),
    };
  }

  return [
    {
      name: 'analogjs-debug-activate',
      config(_, { command }) {
        activateDeferredDebug(command);
      },
    },
    ...externalPlugins(viteNitroPlugin(platformOptions as any, nitroOptions)),
    ...(platformOptions.ssr
      ? [...ssrBuildPlugin(), ...injectHTMLPlugin()]
      : []),
    ...(!isTest ? depsPlugin(platformOptions) : []),
    ...resolveStylePipelinePlugins(
      platformOptions.experimental?.stylePipeline,
      platformOptions.workspaceRoot,
    ),
    ...routerPlugin(platformOptions),
    routeGenerationPlugin(platformOptions),
    ...contentPlugin(platformOptions?.content, platformOptions),
    ...(opts?.vite === false
      ? []
      : externalPlugins(
          await angular({
            jit: platformOptions.jit,
            workspaceRoot: platformOptions.workspaceRoot,
            // Let the Angular plugin keep its own dev-friendly default unless the
            // app explicitly opts into stricter serve-time diagnostics.
            disableTypeChecking: platformOptions.disableTypeChecking,
            include: [
              ...(platformOptions.include ?? []),
              ...(platformOptions.additionalPagesDirs ?? []).map(
                (pageDir) => `${pageDir}/**/*.page.ts`,
              ),
            ],
            additionalContentDirs: platformOptions.additionalContentDirs,
            hmr: platformOptions.hmr,
            liveReload: platformOptions.liveReload,
            inlineStylesExtension: platformOptions.inlineStylesExtension,
            fileReplacements: platformOptions.fileReplacements,
            debug: platformOptions.debug,
            stylePipeline: platformOptions.experimental?.stylePipeline
              ?.angularPlugins?.length
              ? {
                  plugins:
                    platformOptions.experimental.stylePipeline.angularPlugins,
                }
              : undefined,
            ...(viteOptions ?? {}),
            experimental: {
              ...(viteOptions?.experimental ?? {}),
              useAngularCompilationAPI,
            },
          }),
        )),
    ...serverModePlugin(),
    ...clearClientPageEndpointsPlugin(),
  ];
}
