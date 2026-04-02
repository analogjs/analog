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
   * Experimental options
   */
  experimental?: {
    /**
     * Use Angular's `provideClientHydration` to hydrate components.
     */
    useAngularHydration?: boolean;
  };
}

function getRenderer(ngHydration: boolean | undefined): AstroRenderer {
  return {
    name: '@analogjs/astro-angular',
    clientEntrypoint: ngHydration
      ? fileURLToPath(import.meta.resolve('./client-ngh.js'))
      : '@analogjs/astro-angular/client.js',
    serverEntrypoint: ngHydration
      ? fileURLToPath(import.meta.resolve('./server-ngh.js'))
      : '@analogjs/astro-angular/server.js',
  };
}

function getViteConfiguration(vite?: PluginOptions): ViteUserConfig {
  return {
    esbuild: {
      jsxDev: true,
    },
    optimizeDeps: {
      include: [
        '@angular/platform-browser',
        '@angular/core',
        '@analogjs/astro-angular/client.js',
      ],
      exclude: [
        '@angular/platform-server',
        '@analogjs/astro-angular/server.js',
      ],
    },

    plugins: [
      viteAngular(vite),
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
        addRenderer(getRenderer(options?.experimental?.useAngularHydration));
        updateConfig({
          vite: getViteConfiguration(
            options?.vite,
          ) as unknown as ViteUserConfig,
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
