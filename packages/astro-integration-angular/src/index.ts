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
