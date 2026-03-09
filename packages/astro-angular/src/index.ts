import viteAngular, { PluginOptions } from '@analogjs/vite-plugin-angular';
import { enableProdMode } from '@angular/core';
import type { AstroIntegration, AstroRenderer, ViteUserConfig } from 'astro';

interface AngularOptions {
  vite?: PluginOptions;
}

function getRenderer(): AstroRenderer {
  return {
    name: '@analogjs/astro-angular',
    clientEntrypoint: '@analogjs/astro-angular/client.js',
    serverEntrypoint: '@analogjs/astro-angular/server.js',
  };
}

function getViteConfiguration(vite?: PluginOptions) {
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
      'astro:config:setup': ({ addRenderer, updateConfig }) => {
        addRenderer(getRenderer());
        updateConfig({
          vite: getViteConfiguration(
            options?.vite,
          ) as unknown as ViteUserConfig,
        });
      },
      'astro:config:done': () => {
        if (process.env['NODE_ENV'] === 'production') {
          enableProdMode();
        }
      },
    },
  };
}
