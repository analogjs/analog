import { Plugin } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { Options } from './options';
import { viteNitroPlugin } from './vite-nitro-plugin';
import { routerPlugin } from './router-plugin';
import { devServerPlugin } from './ssr/dev-server-plugin';
import { ssrBuildPlugin } from './ssr/ssr-build-plugin';
import { contentPlugin } from './content-plugin';

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
    viteNitroPlugin(platformOptions, nitroOptions),
    (platformOptions.ssr ? ssrBuildPlugin() : false) as Plugin,
    ...routerPlugin(),
    ...contentPlugin(),
    (platformOptions.ssr
      ? devServerPlugin({ entryServer: opts.entryServer })
      : false) as Plugin,
    ...angular(opts?.vite),
  ];
}
