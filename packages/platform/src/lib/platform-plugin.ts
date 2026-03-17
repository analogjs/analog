import { Plugin } from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries -- spec uses dynamic import() for vi.mock(), not lazy-loading
import viteNitroPlugin from '@analogjs/vite-plugin-nitro';
import angular from '@analogjs/vite-plugin-angular';

import { Options } from './options.js';
import { routerPlugin } from './router-plugin.js';
import { ssrBuildPlugin } from './ssr/ssr-build-plugin.js';
import { contentPlugin } from './content-plugin.js';
import { clearClientPageEndpointsPlugin } from './clear-client-page-endpoint.js';
import { ssrXhrBuildPlugin } from './ssr/ssr-xhr-plugin.js';
import { depsPlugin } from './deps-plugin.js';
import { injectHTMLPlugin } from './ssr/inject-html-plugin.js';
import { serverModePlugin } from '../server-mode-plugin.js';
import { routeGenerationPlugin } from './route-generation-plugin.js';

export function platformPlugin(opts: Options = {}): Plugin[] {
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const viteOptions = opts?.vite === false ? undefined : opts?.vite;
  const { ...platformOptions } = {
    ssr: true,
    ...opts,
  };
  const useAngularCompilationAPI =
    platformOptions.experimental?.useAngularCompilationAPI ??
    viteOptions?.experimental?.useAngularCompilationAPI;

  let nitroOptions = platformOptions?.nitro;

  if (nitroOptions?.routeRules) {
    nitroOptions = {
      ...nitroOptions,
      routeRules: Object.keys(nitroOptions.routeRules).reduce(
        (config, curr) => {
          return {
            ...config,
            [curr]: {
              ...config[curr],
              headers: {
                ...config[curr].headers,
                'x-analog-no-ssr':
                  config[curr]?.ssr === false ? 'true' : undefined,
              } as any,
            },
          };
        },
        nitroOptions.routeRules,
      ),
    };
  }

  return [
    ...viteNitroPlugin(platformOptions, nitroOptions),
    ...(platformOptions.ssr ? [ssrBuildPlugin(), ...injectHTMLPlugin()] : []),
    ...(!isTest ? depsPlugin(platformOptions) : []),
    ...routerPlugin(platformOptions),
    routeGenerationPlugin(platformOptions),
    ...contentPlugin(platformOptions?.content, platformOptions),
    ...((opts?.vite === false
      ? []
      : angular({
          jit: platformOptions.jit,
          workspaceRoot: platformOptions.workspaceRoot,
          disableTypeChecking: platformOptions.disableTypeChecking ?? false,
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
        })) as any),
    serverModePlugin(),
    ssrXhrBuildPlugin() as Plugin,
    clearClientPageEndpointsPlugin() as Plugin,
  ];
}
