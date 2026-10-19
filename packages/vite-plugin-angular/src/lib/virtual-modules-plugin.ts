import { dirname, isAbsolute, resolve } from 'node:path';
import { normalizePath, Plugin } from 'vite';
import { VIRTUAL_RAW_PREFIX, toVirtualRawId } from './utils/virtual-ids.js';

export interface VirtualModulesPluginOptions {
  jit: boolean;
}

export function virtualModulesPlugin(
  pluginOptions: VirtualModulesPluginOptions,
): Plugin {
  return {
    name: '@analogjs/vite-plugin-angular:virtual-modules',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id.startsWith(VIRTUAL_RAW_PREFIX)) {
        return `\0${id}`;
      }

      if (pluginOptions.jit && id.startsWith('angular:jit:')) {
        const filePath = normalizePath(
          resolve(dirname(importer as string), id.split(';')[1]),
        );
        return toVirtualRawId(filePath);
      }

      // Intercept .html?raw imports to bypass Vite server.fs restrictions
      if (id.includes('.html?raw')) {
        const filePath = id.split('?')[0];
        const resolved = isAbsolute(filePath)
          ? normalizePath(filePath)
          : importer
            ? normalizePath(resolve(dirname(importer), filePath))
            : undefined;
        if (resolved) {
          return toVirtualRawId(resolved);
        }
      }

      return undefined;
    },
  };
}
