import viteAngular, { PluginOptions } from '@analogjs/vite-plugin-angular';
import { enableProdMode } from '@angular/core';
import type { AstroIntegration, AstroRenderer, ViteUserConfig } from 'astro';
import type { DeepPartial } from 'astro/dist/type-utils';

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
    /**
     *
     * Why I am casting viteAngular as any
     *
     * The vite angular plugins is shipped as commonjs, while this astro
     * integration is shipped using ESM and if you call the default
     * function, you get the following error: viteAngular is not a function.
     * Attempt to use ESM for the angular vite plugin broke something, hence
     * this workaround for now.
     *
     */
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
                'new (xhr2.default.XMLHttpRequest || xhr2.default)'
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
  return {
    name: '@analogjs/astro-angular',
    hooks: {
      'astro:config:setup': ({
        addRenderer,
        config,
        isRestart,
        updateConfig,
      }) => {
        if (!isRestart && config.markdown?.syntaxHighlight === 'shiki') {
          config.markdown.syntaxHighlight = 'prism';
        }

        addRenderer(getRenderer());
        updateConfig({
          vite: getViteConfiguration(
            options?.vite
          ) as DeepPartial<ViteUserConfig>,
        });
      },
      'astro:config:done': ({ config }) => {
        if (
          'markdown' in config &&
          config.markdown.syntaxHighlight === 'shiki'
        ) {
          console.warn(
            `[warning] The Angular integration doesn't support Shiki syntax highlighting in MDX files. Overriding with Prism.\n
To disable this warning, set the syntaxHighlight option in your astro.config.mjs mdx() integration to 'prism' or false.`
          );
        }
        if (process.env['NODE_ENV'] === 'production') {
          enableProdMode();
        }
      },
    },
  };
}
