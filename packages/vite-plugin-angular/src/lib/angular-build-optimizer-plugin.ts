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
  let preserveVendorMaps = false;

  return {
    name: '@analogjs/vite-plugin-angular-optimizer',
    // Normally build-only. Astro's Cloudflare integration (`@astrojs/cloudflare`)
    // transforms SSR modules through a serve-style `workerd` runner *during*
    // `astro build`; an `apply: 'build'` plugin is excluded from that pipeline,
    // so the Angular linker never runs on the worker's partially-compiled
    // packages and they fall back to the JIT compiler. Also apply under a
    // production `NODE_ENV` (which `astro build` sets) so the linker runs in
    // that runner too. Regular Analog dev servers run with a development
    // `NODE_ENV`, so their behavior is unchanged.
    apply(_config, env) {
      return (
        env.command === 'build' || process.env['NODE_ENV'] === 'production'
      );
    },
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
    configResolved(config) {
      preserveVendorMaps = !!config.build.sourcemap;
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
          // `{ mappings: '' }` declares zero segments, dropping the module's own
          // map from the chain; `null` keeps it. Removing `sourceMappingURL` is
          // what makes that map unreachable, so it only runs when discarding.
          return {
            code:
              isProd && !preserveVendorMaps
                ? code.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '')
                : code,
            map: preserveVendorMaps ? null : { mappings: '' },
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
