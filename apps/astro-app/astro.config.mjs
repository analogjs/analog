import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

// Some Astro integrations register renderer entrypoints as URL objects.
// Astro/Vite later treats those as string module ids, so we normalize them
// up front to keep dev middleware and SSR module loading stable.
function normalizeRendererEntrypoints(integration) {
  return {
    ...integration,
    hooks: {
      ...integration.hooks,
      'astro:config:setup': async (params) => {
        const setup = integration.hooks?.['astro:config:setup'];
        if (!setup) {
          return;
        }

        // Preserve Astro's original hook helpers via the prototype chain.
        // A spread copy drops non-enumerable helpers such as addPageExtension().
        const normalizedParams = Object.create(params);
        normalizedParams.addRenderer = (renderer) => {
          params.addRenderer({
            ...renderer,
            clientEntrypoint:
              renderer.clientEntrypoint instanceof URL
                ? fileURLToPath(renderer.clientEntrypoint)
                : renderer.clientEntrypoint,
            serverEntrypoint:
              renderer.serverEntrypoint instanceof URL
                ? fileURLToPath(renderer.serverEntrypoint)
                : renderer.serverEntrypoint,
          });
        };

        return setup(normalizedParams);
      },
    },
  };
}

// https://astro.build/config
export default defineConfig({
  outDir: '../../dist/apps/astro-app',
  vite: {
    server: {
      watch: {
        // Polling is more reliable for this mounted workspace than native FS events.
        usePolling: true,
        interval: 100,
      },
    },
  },
  integrations: [
    angular({
      strictStylePlacement: true,
      useAngularHydration: true,
    }),
    react(),
    {
      name: 'focus-hydration',
      hooks: {
        'astro:config:setup': ({ addClientDirective }) => {
          addClientDirective({
            name: 'focus',
            entrypoint: './src/client-directives/focus.ts',
          });
        },
      },
    },    
    // MDX currently provides a renderer entrypoint as a file URL here.
    normalizeRendererEntrypoints(mdx({ syntaxHighlight: 'prism' })),
  ],
});
