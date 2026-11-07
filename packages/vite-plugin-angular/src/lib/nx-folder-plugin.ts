import { normalizePath, Plugin } from 'vite';

/**
 * Ignores anything in the .nx folder from triggering HMR
 *
 * @returns
 */
export function nxFolderPlugin(): Plugin {
  return {
    name: '@analogjs/vite-plugin-angular:nx-folder',
    apply: 'serve',
    handleHotUpdate(ctx) {
      if (ctx.file.includes(normalizePath('/.nx/'))) {
        return [];
      }

      return ctx.modules;
    },
  };
}
