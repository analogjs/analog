import { JavaScriptTransformer } from './utils/devkit.js';

export function routerPlugin() {
  const javascriptTransformer = new JavaScriptTransformer({ jit: true }, 1);

  return {
    name: 'analogjs-router-optimization',
    enforce: 'pre',
    async transform(_code: string, id: string) {
      if (id.includes('analogjs-') && id.includes('.mjs')) {
        const path = id.split('?')[0];
        const contents = await javascriptTransformer.transformFile(path);

        return {
          code: Buffer.from(contents).toString('utf-8'),
        };
      }

      return;
    },
  };
}
