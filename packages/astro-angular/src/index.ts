import { fileURLToPath } from 'node:url';
import viteAngular, { PluginOptions } from '@analogjs/vite-plugin-angular';
import { enableProdMode } from '@angular/core';
import type { AstroIntegration, AstroRenderer, ViteUserConfig } from 'astro';

interface AngularOptions {
  vite?: PluginOptions;
  /**
   * Enable stricter rendering, which ensures Angular style tags are added to the document head instead of next to the
   * component in the body.
   *
   * Enabling this option disables astro's streaming under SSR.
   */
  strictStylePlacement?: boolean;
  /**
   * Use Angular's `provideClientHydration` to hydrate components.
   */
  useAngularHydration?: boolean;
}

function getRenderer(ngHydration: boolean | undefined): AstroRenderer {
  return {
    name: '@analogjs/astro-angular',
    clientEntrypoint: ngHydration
      ? '@analogjs/astro-angular/client-ngh.js'
      : '@analogjs/astro-angular/client.js',
    serverEntrypoint: ngHydration
      ? '@analogjs/astro-angular/server-ngh.js'
      : '@analogjs/astro-angular/server.js',
  };
}

const SERVER_ENTRYPOINTS = [
  '@angular/platform-server',
  '@analogjs/astro-angular/server.js',
  '@analogjs/astro-angular/server-ngh.js',
];

/**
 * Modules the dependency optimizer must leave alone on the server.
 * `@angular/core` is excluded on top of the server entrypoints because
 * pre-bundling it produces a second copy of the Angular runtime, so components
 * render against a different runtime than the one they were registered in —
 * surfacing as empty SSR output plus `NG0912` component ID collisions.
 */
const SERVER_OPTIMIZE_DEPS_EXCLUDE = [...SERVER_ENTRYPOINTS, '@angular/core'];

function getViteConfiguration(options?: AngularOptions): ViteUserConfig {
  return {
    esbuild: {
      jsxDev: true,
    },
    optimizeDeps: {
      include: [
        '@angular/platform-browser',
        '@angular/core',
        options?.useAngularHydration
          ? '@analogjs/astro-angular/client-ngh.js'
          : '@analogjs/astro-angular/client.js',
      ],
      exclude: SERVER_ENTRYPOINTS,
    },

    plugins: [
      viteAngular(options?.vite),
      {
        name: '@analogjs/astro-angular-platform-server',
        transform(code: string, id: string) {
          if (id.includes('platform-server')) {
            code = code.replace(/global\./g, 'globalThis.');

            return {
              code: code.replace(
                'new xhr2.XMLHttpRequest',
                'new (xhr2.default.XMLHttpRequest || xhr2.default)',
              ),
            };
          }

          return;
        },
      },
      {
        name: 'analogjs-astro-client-ngservermode',
        configEnvironment(name: string) {
          if (name === 'client') {
            return {
              define: {
                ngServerMode: 'false',
              },
            };
          }

          return undefined;
        },
      },
      {
        // Top-level `optimizeDeps` only seeds the client environment. Adapters
        // that run SSR in their own environment — `@astrojs/cloudflare`, which
        // serves the `ssr` environment on `workerd` — get none of the excludes
        // above, so Angular's server entrypoints are pre-bundled there and the
        // renderer breaks. Re-declare them per server environment.
        name: 'analogjs-astro-server-optimize-deps',
        configEnvironment(name: string) {
          if (name === 'client') {
            return undefined;
          }

          return {
            optimizeDeps: {
              exclude: SERVER_OPTIMIZE_DEPS_EXCLUDE,
            },
          };
        },
      },
    ],
    ssr: {
      noExternal: ['@angular/**', '@analogjs/**'],
    },
  };
}

export default function (options?: AngularOptions): AstroIntegration {
  process.env['ANALOG_ASTRO'] = 'true';

  return {
    name: '@analogjs/astro-angular',
    hooks: {
      'astro:config:setup': ({ addRenderer, updateConfig, addMiddleware }) => {
        addRenderer(getRenderer(options?.useAngularHydration));
        updateConfig({
          vite: getViteConfiguration(options),
        });
        if (options?.strictStylePlacement) {
          addMiddleware({
            order: 'pre',
            entrypoint: fileURLToPath(import.meta.resolve('./middleware.js')),
          });
        }
      },
      'astro:config:done': () => {
        if (process.env['NODE_ENV'] === 'production') {
          enableProdMode();
        }
      },
    },
  };
}
