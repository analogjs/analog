import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

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
      experimental: {
        useAngularHydration: true,
      },
    }),
    react(),
    mdx({ syntaxHighlight: 'prism' }),
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
  ],
});
