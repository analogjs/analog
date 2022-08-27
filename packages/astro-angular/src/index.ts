import viteAngular from '@analogjs/vite-plugin-angular';
import { AstroIntegration, AstroRenderer } from 'astro';

function getRenderer(): AstroRenderer {
  return {
    name: '@analogjs/astro-angular',
    clientEntrypoint: '@analogjs/astro-angular/client.js',
    serverEntrypoint: '@analogjs/astro-angular/server.js',
  };
}

function getViteConfiguration() {
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
    name: '@analogjs/astro-angular',
    hooks: {
      'astro:config:setup': ({ addRenderer, updateConfig }) => {
        addRenderer(getRenderer());
        updateConfig({ vite: getViteConfiguration() });
      },
    },
  };
}
