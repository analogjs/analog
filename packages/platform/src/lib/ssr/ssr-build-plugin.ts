import * as vite from 'vite';

/**
 * SSR build patches for Angular platform-server, Zone.js, and Domino.
 *
 * **Why each patch exists:**
 * - zone-node: removes a `const global = globalThis` alias that shadows the
 *   real global in strict mode.
 * - platform-server: rewrites `xhr2.XMLHttpRequest` for CJS/ESM compat and
 *   replaces bare `global` references with `globalThis`.
 * - xhr2: strips Node-specific `os`/`process` references for SSR bundling.
 * - domino/sloppy.js: replaces `with()` statements that are illegal in ESM.
 */
export function ssrBuildPlugin(): vite.Plugin[] {
  const plugins: vite.Plugin[] = [
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

            // Narrowly scoped text replacement of the bare `global`
            // identifier. Matching `global.`, `global,` and ` global[`
            // targets the known occurrences in the @angular/platform-server
            // bundle while leaving strings, comments and asset paths that
            // merely contain the word `global` untouched (see #2426).
            result = result
              .replaceAll('global.', 'globalThis.')
              .replaceAll('global,', 'globalThis,')
              .replaceAll(' global[', ' globalThis[');

            return { code: result };
          }

          if (id.includes(vite.normalizePath('xhr2.js'))) {
            return {
              code: code
                .replace('os.type()', `''`)
                .replace('os.arch()', `''`)
                .replace('process.versions.node', `'node'`)
                .replace('process.versions.v8', `'v8'`),
            };
          }

          if (id.includes(vite.normalizePath('domino/lib/sloppy.js'))) {
            return {
              code: code.replace(/with\(/gi, 'if('),
            };
          }

          return;
        },
      },
    },
  ];

  return plugins;
}

/**
 * Vite plugin that patches `@angular/core`'s `getComponentId()` to
 * mirror every compiled component definition to a global Set, bypassing
 * the `ngServerMode` guard that normally prevents registration on the
 * server. The set lives at `globalThis.__ngComponentDefs` and is read by
 * `@analogjs/router`'s SSR render function to null cached `tView`
 * objects between requests so that `$localize` tagged templates in
 * `consts()` re-evaluate with the freshly loaded translations.
 *
 * Only active when the platform's `i18n` option is configured.
 * Only transforms `@angular/core` modules in SSR builds.
 */
export function i18nDefRegistryPlugin(): Plugin {
  const DETECT_MARKER = 'GENERATED_COMP_IDS.set(compId, componentDef.type);';
  const RETURN_STMT = 'return compId;\n}';

  return {
    name: 'analogjs-i18n-def-registry',
    enforce: 'post',

    transform: {
      filter: {
        id: /\/@angular\/core\//,
      },
      handler(code, id, options) {
        if (!options?.ssr) return;
        if (!code.includes(DETECT_MARKER)) return;

        return {
          code: code.replace(
            RETURN_STMT,
            '(globalThis.__ngComponentDefs ??= new Set()).add(componentDef);\n' +
              RETURN_STMT,
          ),
        };
      },
    },
  };
}
