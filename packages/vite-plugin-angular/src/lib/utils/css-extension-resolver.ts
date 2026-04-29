import * as vite from 'vite';

type CssResolver = (
  id: string,
  importer: string | undefined,
  environment?: { name: string } | undefined,
) => Promise<string | undefined>;

/**
 * Resolves bare-specifier `.css` imports with the `style` package-export
 * condition in scope, without leaking `style` into Vite's global
 * `resolve.conditions`.
 *
 * Two real cases pull in opposite directions on this condition:
 *
 *   1. `import '@angular/material/prebuilt-themes/azure-blue.css'` from TS:
 *      Material's prebuilt theme entries are gated *only* under the `style`
 *      condition (no `default`, no `import`), so without `style` in scope
 *      the request fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 *
 *   2. `@plugin 'tailwindcss-primeui'` from a CSS file: Tailwind v4's JS
 *      plugin resolver inherits Vite's global conditions. If `style` is
 *      injected globally, that resolver matches the package's `style`
 *      export (a `.css` file) and feeds it to Node's ESM loader, which
 *      can't load `.css` and throws
 *      `Internal server error: Unknown file extension ".css"`.
 *
 * The fix: scope the `style` condition to requests that *look* like CSS
 * assets — bare specifiers ending in `.css` (with optional query suffix
 * for `?inline`, `?module`, etc.). Non-CSS bare specifiers fall through
 * to Vite's normal resolver chain, so packages with mixed exports
 * (`tailwindcss-primeui` exposes both `style` and `import`) resolve to
 * their JS surface.
 *
 * Vite 7 exposes `ResolvedConfig.createResolver(options)`; Vite 8 exposes
 * `vite.createIdResolver(config, options)`. Their resolver-call signatures
 * differ — this plugin normalizes both.
 */
export function cssExtensionStyleResolverPlugin(): vite.Plugin {
  let resolveCss: CssResolver | undefined;

  return {
    name: '@analogjs/vite-plugin-angular:css-style-resolver',
    enforce: 'pre',

    configResolved(config) {
      const styleResolveOptions = {
        ...config.resolve,
        conditions: [...(config.resolve.conditions ?? []), 'style'],
      };

      const createIdResolver = (
        vite as unknown as {
          createIdResolver?: (
            c: vite.ResolvedConfig,
            o: typeof styleResolveOptions,
          ) => (
            environment: { name: string },
            id: string,
            importer: string | undefined,
            ssr: boolean,
          ) => Promise<string | undefined>;
        }
      ).createIdResolver;

      if (typeof createIdResolver === 'function') {
        const r = createIdResolver(config, styleResolveOptions);
        resolveCss = async (id, importer, environment) => {
          return await r(
            environment ?? { name: 'client' },
            id,
            importer,
            false,
          );
        };
        return;
      }

      const legacyCreateResolver = (
        config as unknown as {
          createResolver?: (
            o: typeof styleResolveOptions,
          ) => (
            id: string,
            importer: string | undefined,
            aliasOnly: boolean,
            ssr: boolean,
          ) => Promise<string | undefined>;
        }
      ).createResolver;

      if (typeof legacyCreateResolver === 'function') {
        const r = legacyCreateResolver(styleResolveOptions);
        resolveCss = async (id, importer) => {
          return await r(id, importer, false, false);
        };
        return;
      }

      // Both APIs have been stable across the supported Vite range
      // (7.x via `ResolvedConfig.createResolver`, 8.x via
      // `vite.createIdResolver`). If neither is present, fail loudly
      // rather than silently regressing CSS imports of `style`-only
      // package exports such as `@angular/material/prebuilt-themes/*`.
      throw new Error(
        '[@analogjs/vite-plugin-angular]: neither vite.createIdResolver ' +
          '(Vite 8) nor ResolvedConfig.createResolver (Vite 7) is available. ' +
          'Unsupported Vite version.',
      );
    },

    async resolveId(id, importer) {
      if (!resolveCss) return null;

      // Skip non-bare specifiers — relative, absolute, virtual, and
      // data-URI imports don't consult package exports, so the `style`
      // condition is irrelevant for them.
      if (
        id.startsWith('.') ||
        id.startsWith('/') ||
        /^[A-Za-z]:\//.test(id) ||
        id.startsWith('\0') ||
        id.startsWith('data:') ||
        id.startsWith('virtual:')
      ) {
        return null;
      }

      // Only fire on `.css` requests (with optional query, e.g. `?inline`,
      // `?module`). Non-CSS bare specifiers go through Vite's normal
      // resolver chain unchanged, which is critical for packages whose
      // exports include both `style` and `import`/`default` — e.g.
      // `tailwindcss-primeui`, where `@plugin` resolution must land on
      // the JS file, not the CSS file.
      if (!/\.css(?:\?|$)/.test(id)) return null;

      const env = (this as unknown as { environment?: { name: string } })
        .environment;
      const resolved = await resolveCss(id, importer, env);
      return resolved ?? null;
    },
  };
}
