import type { Plugin, TransformResult, UserConfig } from 'vite';
import { rolldownVersion, transformWithEsbuild, transformWithOxc } from 'vite';

/**
 * Sets up test config for Vitest and downlevels Angular FESM bundles and
 * `@angular/cdk` from modern async/await to ES2016 so that Zone.js can
 * intercept promises during `fakeAsync` tests.
 *
 * Under Vite 8+ (Rolldown) the OXC transformer is used with
 * `noDocumentAll` and `pureGetters` assumptions enabled for smaller output.
 * Under Vite ≤7, esbuild handles the downlevel.
 */
export function angularVitestPlugin(): Plugin {
  return {
    name: '@analogjs/vitest-angular-esm-plugin',
    apply: 'serve',
    enforce: 'post',
    config(userConfig) {
      return {
        optimizeDeps: {
          include: ['tslib'],
        },
        ssr: {
          noExternal: [
            '@analogjs/vitest-angular/setup-testbed',
            /fesm2022(.*?)testing/,
            /fesm2015/,
          ],
        },
        test: {
          pool: (userConfig as any).test?.pool ?? 'vmThreads',
        },
      };
    },
    // Filter by module ID so only Angular FESM2022 bundles and CDK enter
    // the handler.  The inner guards add a secondary code-content check
    // (`async` keyword) for fesm2022 to avoid needless transforms.
    transform: {
      filter: {
        id: /fesm2022|@angular\/cdk/,
      },
      async handler(_code, id) {
        if (
          (/fesm2022/.test(id) && _code.includes('async ')) ||
          _code.includes('@angular/cdk')
        ) {
          if (rolldownVersion) {
            const { code, map } = await transformWithOxc(_code, id, {
              lang: 'js',
              target: 'es2016',
              sourcemap: true,
              // OXC assumptions for smaller downlevel output:
              // - noDocumentAll: skip `document.all` compat checks
              // - pureGetters: assume property access has no side effects
              assumptions: {
                noDocumentAll: true,
                pureGetters: true,
              },
            });

            return {
              code,
              map,
            };
          } else {
            const { code, map } = await transformWithEsbuild(_code, id, {
              loader: 'js',
              format: 'esm',
              target: 'es2016',
              sourcemap: true,
              sourcefile: id,
            });

            return {
              code,
              map,
            };
          }
        }

        return undefined;
      },
    },
  };
}

/**
 * Eagerly disables the built-in JS transformer (esbuild on Vite ≤7, OXC on
 * Vite 8+) so Vitest's internal plugin doesn't race with the Angular
 * compiler.  Must run at `enforce: 'pre'` to take effect before Vitest
 * reads the resolved config.
 */
export function angularVitestEsbuildPlugin(): Plugin {
  return {
    name: '@analogjs/vitest-angular-esbuild-oxc-plugin',
    enforce: 'pre',
    config(userConfig: UserConfig) {
      if (rolldownVersion) {
        return {
          oxc: userConfig.oxc ?? false,
        };
      }

      return {
        esbuild: userConfig.esbuild ?? false,
      };
    },
  };
}

/**
 * Post-processes `.ts` files with the JS transformer (esbuild / OXC) to
 * re-align sourcemaps so breakpoints and coverage reports work correctly.
 *
 * Inline style/template virtual modules (`?inline`) are excluded because
 * they are already handled by the Angular compiler.
 */
export function angularVitestSourcemapPlugin(): Plugin {
  return {
    name: '@analogjs/vitest-angular-sourcemap-plugin',
    transform: {
      filter: {
        // Anchored at end-of-path to avoid matching `.tsx`, `.d.ts`, or
        // directory names that happen to contain `.ts` (e.g., `.tscache/`).
        id: /\.ts$/,
      },
      async handler(code: string, id: string) {
        const [, query] = id.split('?');

        if (query && query.includes('inline')) {
          return;
        }

        if (rolldownVersion) {
          const result = await transformWithOxc(code, id, {
            lang: 'js',
          });

          return result as unknown as TransformResult;
        } else {
          const result = await transformWithEsbuild(code, id, {
            loader: 'js',
          });

          return result;
        }
      },
    },
  };
}

export function angularVitestPlugins(): Plugin[] {
  return [
    angularVitestPlugin(),
    angularVitestEsbuildPlugin(),
    angularVitestSourcemapPlugin(),
  ];
}
