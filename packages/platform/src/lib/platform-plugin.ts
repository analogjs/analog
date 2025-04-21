import { Plugin } from 'vite';
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

export function platformPlugin(opts: Options = {}): Plugin[] {
  const { ...platformOptions } = {
    ssr: true,
    ...opts,
  };

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
    ...depsPlugin(),
    ...routerPlugin(platformOptions),
    ...contentPlugin(platformOptions?.content, platformOptions),
    ...angular({
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
      ...(opts?.vite ?? {}),
    }),
    serverModePlugin(),
    ssrXhrBuildPlugin(),
    clearClientPageEndpointsPlugin(),
  ];
}
