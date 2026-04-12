import type { Plugin, TransformResult, UserConfig } from 'vite';
// Use the namespace import so these runtime helpers still resolve on Vite 6,
// which does not expose them as named exports.
import * as vite from 'vite';
import { getJsTransformConfigKey, isRolldown } from './utils/rolldown.js';

const vitestAngularSetupEntries = [
  '@analogjs/vitest-angular/setup-testbed',
  '@analogjs/vitest-angular/setup-zone',
  '@analogjs/vitest-angular/setup-snapshots',
  '@analogjs/vitest-angular/setup-serializers',
];

/**
 * Sets up test config for Vitest and downlevels Angular FESM bundles and
 * `@angular/cdk` from modern async/await to ES2016 so that Zone.js can
 * intercept promises during `fakeAsync` tests.
 *
 * Under Vite 8+ (Rolldown) downleveling is not needed.
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
          include: [
            'tslib',
            '@angular/core',
            '@angular/core/testing',
            '@angular/platform-browser/testing',
          ],
        },
        ssr: {
          noExternal: [
            ...vitestAngularSetupEntries,
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
          if (isRolldown()) {
            return undefined;
          }

          const { code, map } = await vite.transformWithEsbuild(_code, id, {
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
      const jsTransformConfigKey = getJsTransformConfigKey();

      return {
        [jsTransformConfigKey]:
          jsTransformConfigKey === 'oxc'
            ? (userConfig.oxc ?? false)
            : (userConfig.esbuild ?? false),
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
        // Match `.ts` at the end of the path OR before a `?` query string.
        // Vite/Vitest appends query params for virtual modules (e.g.
        // `component.ts?inline`), so a plain `$` anchor would reject them
        // and leave sourcemaps misaligned — causing Angular TestBed teardown
        // crashes (`_doc` undefined in `removeAllRootElements`).
        // The negative lookahead `(?!x)` prevents matching `.tsx` or `.d.ts`.
        id: /\.ts(?:\?|$)/,
      },
      async handler(code: string, id: string) {
        const [, query] = id.split('?');

        if (query && query.includes('inline')) {
          return;
        }

        if (isRolldown()) {
          // lang must be 'ts' (not 'js') so OXC parses TypeScript syntax;
          // using 'js' would cause parse errors on type annotations.
          const result = await vite.transformWithOxc(code, id, {
            lang: 'ts',
          });

          return result as unknown as TransformResult;
        } else {
          const result = await vite.transformWithEsbuild(code, id, {
            loader: 'ts',
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
