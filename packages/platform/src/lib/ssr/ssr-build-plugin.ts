import { createRequire } from 'node:module';
import { normalizePath, Plugin, rolldownVersion } from 'vite';

/**
 * SSR build patches for Angular platform-server, Zone.js, and Domino.
 *
 * Returns an array of Vite plugins because under Vite 8+ (Rolldown) we
 * append Rolldown's built-in `replacePlugin` for an AST-safe
 * `global → globalThis` rewrite that avoids false positives inside string
 * literals and comments.
 *
 * **Why each patch exists:**
 * - zone-node: removes a `const global = globalThis` alias that shadows the
 *   real global in strict mode.
 * - platform-server: rewrites `xhr2.XMLHttpRequest` for CJS/ESM compat and
 *   replaces bare `global` references with `globalThis`.
 * - xhr2: strips Node-specific `os`/`process` references for SSR bundling.
 * - domino/sloppy.js: replaces `with()` statements that are illegal in ESM.
 */
export function ssrBuildPlugin(): Plugin[] {
  const plugins: Plugin[] = [
    {
      name: 'analogjs-ssr-build-plugin',
      apply: 'build',
      config() {
        return {
          ssr: {
            noExternal: ['xhr2'],
          },
        };
      },
      transform: {
        filter: {
          id: /zone-node|platform-server|xhr2\.js|domino\/lib\/sloppy\.js/,
        },
        handler(code, id) {
          if (
            id.includes('zone-node') &&
            code.includes('const global = globalThis;')
          ) {
            return {
              code: code.replace('const global = globalThis;', ''),
            };
          }

          if (id.includes('platform-server')) {
            let result = code.replace(
              'new xhr2.XMLHttpRequest',
              'new (xhr2.default.XMLHttpRequest || xhr2.default)',
            );

            // Under Vite 8+ the appended `replacePlugin` handles
            // global → globalThis via AST-aware replacement (scoped to
            // platform-server by `withFilter`).  For Vite ≤7 we fall back
            // to text-based replaceAll — imprecise but sufficient for the
            // known occurrences in @angular/platform-server bundles.
            if (!rolldownVersion) {
              result = result
                .replaceAll('global.', 'globalThis.')
                .replaceAll('global,', 'globalThis,')
                .replaceAll(' global[', ' globalThis[');
            }

            return { code: result };
          }

          if (id.includes(normalizePath('xhr2.js'))) {
            return {
              code: code
                .replace('os.type()', `''`)
                .replace('os.arch()', `''`)
                .replace('process.versions.node', `'node'`)
                .replace('process.versions.v8', `'v8'`),
            };
          }

          if (id.includes(normalizePath('domino/lib/sloppy.js'))) {
            return {
              code: code.replace(/with\(/gi, 'if('),
            };
          }

          return;
        },
      },
    },
  ];

  // Under Vite 8+ (Rolldown), append Rolldown's built-in `replacePlugin`
  // for AST-aware `global → globalThis` rewriting scoped to platform-server.
  //
  // `createRequire` is used instead of dynamic `import()` because this code
  // runs synchronously during plugin construction (not inside an async hook).
  // Rolldown is guaranteed to be installed when `rolldownVersion` is truthy.
  if (rolldownVersion) {
    const require = createRequire(import.meta.url);
    const { replacePlugin } =
      require('rolldown/plugins') as typeof import('rolldown/plugins');
    const { withFilter } =
      require('rolldown/filter') as typeof import('rolldown/filter');

    plugins.push(
      withFilter(
        replacePlugin(
          { global: 'globalThis' },
          { preventAssignment: true, objectGuards: true },
        ),
        { transform: { id: /platform-server/ } },
      ) as unknown as Plugin,
    );
  }

  return plugins;
}
