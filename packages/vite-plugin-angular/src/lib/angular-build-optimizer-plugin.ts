import { Plugin } from 'vite';

import { JavaScriptTransformer } from './utils/devkit.js';

export function buildOptimizerPlugin({
  isProd,
  jit,
}: {
  isProd: boolean;
  supportedBrowsers: string[];
  jit: boolean;
}): Plugin {
  const javascriptTransformer = new JavaScriptTransformer(
    {
      sourcemap: false,
      thirdPartySourcemaps: false,
      advancedOptimizations: true,
      jit: true,
    },
    1
  );

  return {
    name: '@analogjs/vite-plugin-angular-optimizer',
    apply: 'build',
    config() {
      return {
        define: isProd
          ? {
              ngJitMode: 'false',
              ngI18nClosureMode: 'false',
              ngDevMode: 'false',
            }
          : {},
        esbuild: {
          define: isProd
            ? {
                ngDevMode: 'false',
                ngJitMode: 'false',
                ngI18nClosureMode: 'false',
              }
            : undefined,
        },
      };
    },
    async transform(code, id) {
      if (/\.[cm]?js$/.test(id)) {
        const angularPackage = /fesm20/.test(id);

        if (!angularPackage) {
          return {
            code: isProd
              ? code.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '')
              : code,
            map: {
              mappings: '',
            },
          };
        }

        const sideEffects =
          jit && id.includes('@angular/compiler') ? true : false;
        const result: Uint8Array = await javascriptTransformer.transformData(
          id,
          code,
          false,
          sideEffects
        );

        return {
          code: Buffer.from(result).toString(),
        };
      }

      return;
    },
  };
}
