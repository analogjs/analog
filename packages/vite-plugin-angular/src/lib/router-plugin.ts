import type { Plugin } from 'vite';
import { JavaScriptTransformer } from './utils/devkit.js';
import {
  createPersistentTransformCache,
  resolveTransformCacheDir,
  withMemoryLayer,
  type TransformCacheStore,
} from './utils/transform-cache.js';

export function routerPlugin(): Plugin {
  const memoryCache = new Map<string, Uint8Array>();
  const memoryOnly: TransformCacheStore = {
    get: (key: string) => memoryCache.get(key),
    put: (key: string, value: Uint8Array) => {
      memoryCache.set(key, value);
    },
  };
  const persistentDir = resolveTransformCacheDir(process.cwd());
  const javascriptTransformer = new JavaScriptTransformer(
    { jit: true },
    1,
    persistentDir
      ? withMemoryLayer(createPersistentTransformCache(persistentDir))
      : memoryOnly,
  );

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
