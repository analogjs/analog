import { Plugin } from 'vite';

import { Options } from './options.js';
import {
  activateDeferredDebug,
  applyDebugOption,
  debugPlatform,
} from './utils/debug.js';
import { routerPlugin } from './router-plugin.js';
import { ssrBuildPlugin } from './ssr/ssr-build-plugin.js';
import { contentPlugin } from './content-plugin.js';
import { clearClientPageEndpointsPlugin } from './clear-client-page-endpoint.js';
import { depsPlugin } from './deps-plugin.js';
import { injectHTMLPlugin } from './ssr/inject-html-plugin.js';
import { serverModePlugin } from '../server-mode-plugin.js';
import { routeGenerationPlugin } from './route-generation-plugin.js';
import { resolveStylePipelinePlugins } from './style-pipeline.js';
import { i18nComponentRegistryPlugin } from './i18n-component-registry-plugin.js';
import { analogNitroPlugin } from './nitro/analog-nitro-plugin.js';

export function platformPlugin(opts: Options = {}): Plugin[] {
  applyDebugOption(opts.debug, opts.workspaceRoot);

  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const { ...platformOptions } = {
    ssr: true,
    ...opts,
  };

  debugPlatform('experimental options resolved', {
    typedRouter: platformOptions.experimental?.typedRouter,
    stylePipeline: !!platformOptions.experimental?.stylePipeline,
  });

  return [
    {
      name: 'analogjs-debug-activate',
      config(_, { command }) {
        activateDeferredDebug(command);
      },
    },
    analogNitroPlugin(platformOptions),
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
    ...(platformOptions.i18n ? [i18nComponentRegistryPlugin()] : []),
    ...serverModePlugin(),
    ...clearClientPageEndpointsPlugin(),
  ];
}
