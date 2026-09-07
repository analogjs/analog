import type { Plugin } from 'vite';
import { JavaScriptTransformer } from './utils/devkit.js';
import {
  createPersistentTransformCache,
  resolveTransformCacheDir,
  withMemoryLayer,
  type TransformCacheStore,
} from './utils/transform-cache.js';

const FESM_MODULE_ID = /fesm(.*?)\.mjs/;

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
        id: FESM_MODULE_ID,
      },
      async handler(_code: string, id: string) {
        // Early Vite 6 does not apply hook filters. Never overwrite a compiled
        // application module by reading its original TypeScript from disk.
        if (!FESM_MODULE_ID.test(id)) return;
        const path = id.split('?')[0];
        const contents = await javascriptTransformer.transformFile(path);

        return {
          code: Buffer.from(contents).toString('utf-8'),
        };
      },
    },
  };
}
