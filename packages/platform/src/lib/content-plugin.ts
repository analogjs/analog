import { Plugin } from 'vite';

/**
 * This excludes the build from including the
 * @analogjs/content package because it is
 * dynamically imported at runtime.
 *
 * This prevents a dependency on @analogjs/router
 * to @analogjs/content
 *
 * @returns
 */
export function contentPlugin(): Plugin[] {
  return [
    {
      name: 'analogjs-content-plugin',
      config() {
        return {
          build: {
            rollupOptions: {
              external: ['@analogjs/content'],
            },
          },
        };
      },
    },
  ];
}
