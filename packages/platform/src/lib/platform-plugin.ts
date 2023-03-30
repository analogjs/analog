import { Plugin } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { Options } from './options';
import { viteNitroPlugin } from './vite-nitro-plugin';
import { routerPlugin } from './router-plugin';
import { devServerPlugin } from './ssr/dev-server-plugin';
import { ssrBuildPlugin } from './ssr/ssr-build-plugin';
import { contentPlugin } from './content-plugin';

export function platformPlugin(opts: Options = {}): Plugin[] {
  const defaultOptions: Options = {
    ssr: true,
  };
  const mergedOptions = {
    ...defaultOptions,
    ...opts,
  };

  return [
    viteNitroPlugin(mergedOptions, mergedOptions?.nitro),
    (mergedOptions.ssr ? ssrBuildPlugin() : false) as Plugin,
    ...routerPlugin(),
    ...contentPlugin(),
    (mergedOptions.ssr
      ? devServerPlugin({ entryServer: opts.entryServer })
      : false) as Plugin,
    ...angular(opts?.vite),
  ];
}
