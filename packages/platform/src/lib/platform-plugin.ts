import { Plugin } from 'vite';
import viteNitroPlugin from '@analogjs/vite-plugin-nitro';
import angular from '@analogjs/vite-plugin-angular';

import { Options } from './options.js';
import { routerPlugin } from './router-plugin.js';
import {
  ssrBuildPlugin,
  i18nDefRegistryPlugin,
} from './ssr/ssr-build-plugin.js';
import { contentPlugin } from './content-plugin.js';
import { clearClientPageEndpointsPlugin } from './clear-client-page-endpoint.js';
import { ssrXhrBuildPlugin } from './ssr/ssr-xhr-plugin.js';
import { depsPlugin } from './deps-plugin.js';
import { injectHTMLPlugin } from './ssr/inject-html-plugin.js';
import { serverModePlugin } from '../server-mode-plugin.js';
import { i18nExtractPlugin } from './i18n-extract-plugin.js';

export function platformPlugin(opts: Options = {}): Plugin[] {
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const { ...platformOptions } = {
    ssr: true,
    ...opts,
  };

  let nitroOptions = platformOptions?.nitro;

  const imagesOptions = platformOptions?.content?.images;
  if (imagesOptions) {
    // Single source of truth for the image optimization config: the
    // client-side loader and markdown renderers read it back from
    // VITE_ANALOG_IMAGES.
    process.env['VITE_ANALOG_IMAGES'] = JSON.stringify(imagesOptions);

    const apiPrefix = `/${platformOptions.apiPrefix || 'api'}`;
    const publicPath = imagesOptions.path ?? `${apiPrefix}/_image`;
    // The api middleware (and the dev server) strip the api prefix
    // before requests reach nitro, while apps with a routes/api dir
    // serve the full path — register both forms.
    const routes = new Set([
      `${publicPath}/**`,
      publicPath.startsWith(`${apiPrefix}/`)
        ? `${publicPath.slice(apiPrefix.length)}/**`
        : `${publicPath}/**`,
    ]);

    nitroOptions = {
      ...nitroOptions,
      handlers: [
        ...(nitroOptions?.handlers ?? []),
        ...[...routes].map((route) => ({
          route,
          handler: '#ANALOG_IMAGE_HANDLER',
        })),
      ],
      virtual: {
        ...nitroOptions?.virtual,
        '#ANALOG_IMAGE_HANDLER': [
          `import { createImageHandler } from '@analogjs/content/image/server';`,
          `export default createImageHandler(${JSON.stringify(imagesOptions)});`,
        ].join('\n'),
      },
    };
  }

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
          fastCompile: platformOptions.fastCompile,
          fastCompileMode: platformOptions.fastCompileMode,
          ...(opts?.vite ?? {}),
        })) as any),
    serverModePlugin(),
    ssrXhrBuildPlugin() as Plugin,
    clearClientPageEndpointsPlugin() as Plugin,
    ...(platformOptions.i18n ? [i18nDefRegistryPlugin()] : []),
    ...(platformOptions.i18n?.extract
      ? [i18nExtractPlugin(platformOptions.i18n)]
      : []),
  ];
}
