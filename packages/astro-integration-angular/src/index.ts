import viteAngular from '@analogjs/vite-plugin-angular';
import { AstroIntegration, AstroRenderer } from 'astro';

function getRenderer(): AstroRenderer {
  return {
    name: '@analogjs/astro-integration-angular',
    clientEntrypoint: '@analogjs/astro-integration-angular/client.js',
    serverEntrypoint: '@analogjs/astro-integration-angular/server.js',
  };
}

function getViteConfiguration() {
  return {
    optimizeDeps: {
      include: ['@analogjs/astro-integration-angular/client.js'],
      exclude: ['@analogjs/astro-integration-angular/server.js'],
    },
    /**
     *
     * Why I am casting viteAngular as any
     *
     * The vite angular plugins is shipped as commonjs, while this astro
     * integration is shipped using ESM and if you call the the default
     * function, you get the following error: viteAngular is not a function.
     * Attempt to use ESM for the angular vite plugin broke something, hence
     * this workaround for now.
     *
     */
    plugins: [(viteAngular as any).default()],
  };
}

export default function (): AstroIntegration {
  return {
    name: '@analogjs/astro-integration-angular',
    hooks: {
      'astro:config:setup': ({ addRenderer, updateConfig }) => {
        addRenderer(getRenderer());
        updateConfig({ vite: getViteConfiguration() });
      },
    },
  };
}
