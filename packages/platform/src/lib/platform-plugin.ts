import { Plugin } from 'vite';
import viteNitroPlugin from '@analogjs/vite-plugin-nitro';
import angular from '@analogjs/vite-plugin-angular';

import { Options } from './options';
import { routerPlugin } from './router-plugin';
import { ssrBuildPlugin } from './ssr/ssr-build-plugin';
import { contentPlugin } from './content-plugin';
import { clearClientPageEndpointsPlugin } from './clear-client-page-endpoint';
import { ssrXhrBuildPlugin } from './ssr/ssr-xhr-plugin';

export function platformPlugin(opts: Options = {}): Plugin[] {
  const { apiPrefix, ...platformOptions } = {
    ssr: true,
    ...opts,
  };

  let nitroOptions = platformOptions?.nitro;
  if (apiPrefix) {
    nitroOptions = {
      ...nitroOptions,
      runtimeConfig: {
        apiPrefix,
      },
    };
  }

  return [
    ...viteNitroPlugin(platformOptions, nitroOptions),
    (platformOptions.ssr ? ssrBuildPlugin() : false) as Plugin,
    ...routerPlugin(),
    ...contentPlugin(),
    ...angular({ jit: platformOptions.jit, ...(opts?.vite ?? {}) }),
    ssrXhrBuildPlugin(),
    clearClientPageEndpointsPlugin(),
  ];
}
