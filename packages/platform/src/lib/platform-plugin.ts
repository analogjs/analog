import { Plugin } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { Options } from './options';
import { viteNitroPlugin } from './vite-nitro-plugin';
import { routerPlugin } from './router-plugin';
import { devServerPlugin } from './ssr/dev-server-plugin';
import { ssrBuildPlugin } from './ssr/ssr-build-plugin';

export function platformPlugin(opts: Options = {}): Plugin[] {
  return [
    viteNitroPlugin(opts, opts?.nitro),
    (opts.ssr ? ssrBuildPlugin() : false) as Plugin,
    ...routerPlugin(),
    (opts.ssr
      ? devServerPlugin({ entryServer: opts.entryServer })
      : false) as Plugin,
    ...angular(opts?.vite),
  ];
}
