import angular from '@analogjs/vite-plugin-angular';

function getRenderer() {
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
    plugins: [angular.default()],
  };
}

export default function () {
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
