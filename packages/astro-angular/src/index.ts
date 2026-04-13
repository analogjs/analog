import viteAngular from '@analogjs/vite-plugin-angular';
import type { PluginOptions } from '@analogjs/vite-plugin-angular';
import { enableProdMode } from '@angular/core';
import type { AstroIntegration, AstroRenderer, ViteUserConfig } from 'astro';
import * as vite from 'vite';

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

function getViteConfiguration(pluginOptions?: PluginOptions) {
  const isRolldown = !!vite.rolldownVersion;
  return {
    [isRolldown ? 'oxc' : 'esbuild']: {
      ...(isRolldown ? { jsx: { development: true } } : { jsxDev: true }),
    },
    optimizeDeps: {
      include: [
        '@angular/platform-browser',
        '@angular/core',
        options?.useAngularHydration
          ? '@analogjs/astro-angular/client-ngh.js'
          : '@analogjs/astro-angular/client.js',
      ],
      exclude: [
        '@angular/platform-server',
        '@analogjs/astro-angular/server.js',
        '@analogjs/astro-angular/server-ngh.js',
      ],
    },

    plugins: [
      viteAngular(pluginOptions),
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
            entrypoint: '@analogjs/astro-angular/middleware',
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
