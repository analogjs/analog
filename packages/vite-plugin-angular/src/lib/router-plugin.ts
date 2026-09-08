import { stripQuery } from './utils/module-id.js';
import type { Plugin } from 'vite';
import { createJavaScriptTransformer } from './javascript-transformer.js';
import {
  transformCacheLayer,
  resolveTransformCacheDir,
} from './utils/transform-cache.js';

const FESM_MODULE_ID = /fesm(.*?)\.mjs/;

export function routerPlugin(): Plugin {
  const persistentDir = resolveTransformCacheDir(process.cwd());
  const javascriptTransformer = createJavaScriptTransformer(
    () => ({ jit: true, sourcemap: false }),
    transformCacheLayer(persistentDir),
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
        const path = stripQuery(id);
        const contents = await javascriptTransformer.transformFile(path);

        return {
          code: Buffer.from(contents).toString('utf-8'),
        };
      },
    },
  };
}
