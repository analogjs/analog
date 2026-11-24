import type { Plugin } from 'vite';
import {
  isAngularBuildContext,
  type AngularBuildContext,
} from './angular-build-context.js';
import { JavaScriptTransformer } from './utils/devkit.js';
import {
  createPersistentTransformCache,
  resolveTransformCacheDir,
  withMemoryLayer,
  type TransformCacheStore,
} from './utils/transform-cache.js';

export interface RouterPluginOptions {
  workspaceRoot?: string;
}

export function routerPlugin(
  ctxOrOptions?: AngularBuildContext | RouterPluginOptions,
): Plugin {
  const sharedCtx = isAngularBuildContext(ctxOrOptions)
    ? ctxOrOptions
    : undefined;
  let configuredRoot = isAngularBuildContext(ctxOrOptions)
    ? ctxOrOptions.options.workspaceRoot
    : ctxOrOptions?.workspaceRoot;

  const memoryCache = new Map<string, Uint8Array>();
  const memoryOnly: TransformCacheStore = {
    get: (key: string) => memoryCache.get(key),
    put: (key: string, value: Uint8Array) => {
      memoryCache.set(key, value);
    },
  };
  let javascriptTransformer: InstanceType<typeof JavaScriptTransformer>;
  function getTransformer() {
    if (!javascriptTransformer) {
      const persistentDir = resolveTransformCacheDir(
        configuredRoot ?? process.cwd(),
      );
      javascriptTransformer = new JavaScriptTransformer(
        { jit: true },
        1,
        persistentDir
          ? withMemoryLayer(createPersistentTransformCache(persistentDir))
          : memoryOnly,
      );
    }
    return javascriptTransformer;
  }

  /**
   * Transforms Angular packages that didn't get picked up by Vite's pre-optimization.
   */
  return {
    name: 'analogjs-router-optimization',
    enforce: 'pre',
    apply: 'serve',
    configResolved(config) {
      configuredRoot ??= config.root || process.cwd();
    },
    buildEnd() {
      return javascriptTransformer?.close();
    },
    transform: {
      filter: {
        id: /fesm(.*?)\.mjs/,
      },
      async handler(_code: string, id: string) {
        const path = id.split('?')[0];
        const contents = await getTransformer().transformFile(path);

        return {
          code: Buffer.from(contents).toString('utf-8'),
        };
      },
    },
  };
}
