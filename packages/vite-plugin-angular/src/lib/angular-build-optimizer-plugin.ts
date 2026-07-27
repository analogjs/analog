import type { Plugin, UserConfig } from 'vite';
import * as vite from 'vite';
import { JavaScriptTransformer } from './utils/devkit.js';

export function buildOptimizerPlugin({
  jit,
}: {
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
    1,
  );
  let isProd = false;

  return {
    name: '@analogjs/vite-plugin-angular-optimizer',
    apply: 'build',
    config(userConfig) {
      isProd =
        userConfig.mode === 'production' ||
        process.env['NODE_ENV'] === 'production';

      return {
        define: isProd
          ? {
              ngJitMode: 'false',
              ngI18nClosureMode: 'false',
              ngDevMode: 'false',
              ngServerMode: `${!!userConfig.build?.ssr}`,
            }
          : {},
        [vite.rolldownVersion ? 'oxc' : 'esbuild']: {
          define: isProd
            ? {
                ngDevMode: 'false',
                ngJitMode: 'false',
                ngI18nClosureMode: 'false',
                ngServerMode: `${!!userConfig.build?.ssr}`,
              }
            : undefined,
        },
      } as UserConfig;
    },
    transform: {
      filter: {
        // Allow an optional `?query` after the extension. Some environments
        // (e.g. Cloudflare's `workerd`, used by Astro's Cloudflare integration)
        // reference optimized deps with a `?v=<hash>` suffix, e.g.
        // `.../fesm2022/_platform_location-chunk.mjs?v=a786a9ff`. A `$`-anchored
        // extension match skips those, so the Angular linker never runs and the
        // partially-compiled package falls back to the JIT compiler at runtime.
        id: /\.[cm]?js(?:\?|$)/,
      },
      async handler(code, id) {
        // Strip the `?query` so the fesm check and the transformer see a real
        // filename rather than `foo.mjs?v=<hash>`.
        const cleanId = id.split('?')[0];
        const angularPackage = /fesm20/.test(cleanId);

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
          jit && cleanId.includes('@angular/compiler') ? true : false;
        const result: Uint8Array = await javascriptTransformer.transformData(
          cleanId,
          code,
          false,
          sideEffects,
        );

        return {
          code: Buffer.from(result).toString(),
        };
      },
    },
  };
}
