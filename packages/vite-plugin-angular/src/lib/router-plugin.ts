import type { Plugin } from 'vite';
import { JavaScriptTransformer } from './utils/devkit.js';

export function routerPlugin(): Plugin {
  const transformCache = new Map<string, Uint8Array>();
  const javascriptTransformer = new JavaScriptTransformer({ jit: true }, 1, {
    get: (key: string) => transformCache.get(key),
    put: (key: string, value: Uint8Array) => {
      transformCache.set(key, value);
    },
  });

  /**
   * Transforms Angular packages the didn't get picked up by Vite's pre-optimization.
   */
  return {
    name: 'analogjs-router-optimization',
    enforce: 'pre',
    apply: 'serve',
    buildEnd() {
      return javascriptTransformer.close();
    },
    transform: {
      filter: {
        id: /fesm(.*?)\.mjs/,
      },
      async handler(_code: string, id: string) {
        const path = id.split('?')[0];
        const contents = await javascriptTransformer.transformFile(path);

        return {
          code: Buffer.from(contents).toString('utf-8'),
        };
      },
    },
  };
}
