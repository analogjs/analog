import { JavaScriptTransformer } from './utils/devkit.js';

export function routerPlugin() {
  const javascriptTransformer = new JavaScriptTransformer({ jit: true }, 1);

  return {
    name: 'analogjs-router-optimization',
    enforce: 'pre',
    async transform(_code: string, id: string) {
      if (id.endsWith('analogjs-router.mjs')) {
        const contents = await javascriptTransformer.transformFile(id, false);

        return {
          code: Buffer.from(contents).toString('utf-8'),
        };
      }

      return;
    },
  };
}
