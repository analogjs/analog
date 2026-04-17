import { normalizePath, type Plugin, type TransformResult } from 'vite';

export function ssrBuildPlugin(): Plugin {
  return {
    name: 'analogjs-ssr-build-plugin',
    transform: {
      filter: {
        id: {
          include: [/zone-node/, /platform-server/, /domino\/lib\/sloppy/],
        },
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
          return {
            code: code
              .replace(
                'new xhr2.XMLHttpRequest',
                'new (xhr2.default.XMLHttpRequest || xhr2.default)',
              )
              .replaceAll('global.', 'globalThis.')
              .replaceAll('global,', 'globalThis,')
              .replaceAll(' global[', ' globalThis['),
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
  };
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
