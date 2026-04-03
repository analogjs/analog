import { Plugin } from 'vite';
import viteNitroPlugin from '@analogjs/vite-plugin-nitro';
import angular from '@analogjs/vite-plugin-angular';
import { mapValues, union } from 'lodash-es';

import { Options } from './options.js';
import { discoverLibraryRoutes } from './discover-library-routes.js';
import { routerPlugin } from './router-plugin.js';
import { ssrBuildPlugin } from './ssr/ssr-build-plugin.js';
import { contentPlugin } from './content-plugin.js';
import { clearClientPageEndpointsPlugin } from './clear-client-page-endpoint.js';
import { depsPlugin } from './deps-plugin.js';
import { injectHTMLPlugin } from './ssr/inject-html-plugin.js';
import { serverModePlugin } from '../server-mode-plugin.js';
import { routeGenerationPlugin } from './route-generation-plugin.js';

// Bridge Plugin types from external @analogjs packages that resolve a different vite instance
function externalPlugins(plugins: unknown): Plugin[] {
  return plugins as Plugin[];
}

export function platformPlugin(opts: Options = {}): Plugin[] {
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
    ...externalPlugins(viteNitroPlugin(platformOptions as any, nitroOptions)),
    ...(platformOptions.ssr
      ? [...ssrBuildPlugin(), ...injectHTMLPlugin()]
      : []),
    ...(!isTest ? depsPlugin(platformOptions) : []),
    ...routerPlugin(platformOptions),
    routeGenerationPlugin(platformOptions),
    ...contentPlugin(platformOptions?.content, platformOptions),
    ...(opts?.vite === false
      ? []
      : externalPlugins(
          angular({
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
            liveReload: platformOptions.liveReload,
            inlineStylesExtension: platformOptions.inlineStylesExtension,
            fileReplacements: platformOptions.fileReplacements,
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
