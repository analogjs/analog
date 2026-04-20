import { promises as fsPromises } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { normalizePath, Plugin, preprocessCSS, ResolvedConfig } from 'vite';
import {
  VIRTUAL_RAW_PREFIX,
  VIRTUAL_STYLE_PREFIX,
  toVirtualRawId,
  toVirtualStyleId,
} from './utils/virtual-ids.js';
import {
  loadVirtualRawModule,
  loadVirtualStyleModule,
  shouldPreprocessTestCss,
} from './utils/virtual-resources.js';

export interface VirtualModulesPluginOptions {
  jit: boolean;
}

export function virtualModulesPlugin(
  pluginOptions: VirtualModulesPluginOptions,
): Plugin {
  let resolvedConfig: ResolvedConfig;

  return {
    name: '@analogjs/vite-plugin-angular:virtual-modules',
    enforce: 'pre',
    configResolved(config) {
      resolvedConfig = config;
    },
    resolveId(id, importer) {
      if (
        id.startsWith(VIRTUAL_STYLE_PREFIX) ||
        id.startsWith(VIRTUAL_RAW_PREFIX)
      ) {
        return `\0${id}`;
      }

      if (pluginOptions.jit && id.startsWith('angular:jit:')) {
        const filePath = normalizePath(
          resolve(dirname(importer as string), id.split(';')[1]),
        );
        return id.includes(':style')
          ? toVirtualStyleId(filePath)
          : toVirtualRawId(filePath);
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

      // Intercept style ?inline imports to bypass Vite server.fs restrictions
      if (/\.(css|scss|sass|less)\?inline$/.test(id)) {
        const filePath = id.split('?')[0];
        const resolved = isAbsolute(filePath)
          ? normalizePath(filePath)
          : importer
            ? normalizePath(resolve(dirname(importer), filePath))
            : undefined;
        if (resolved) {
          return toVirtualStyleId(resolved);
        }
      }

      return undefined;
    },
    async load(id) {
      const styleModule = await loadVirtualStyleModule(
        this,
        id,
        resolvedConfig,
      );
      if (styleModule !== undefined) return styleModule;

      const rawModule = await loadVirtualRawModule(this, id);
      if (rawModule !== undefined) return rawModule;

      // Vitest fallback: the module-runner calls ensureEntryFromUrl before
      // transformRequest, which skips pluginContainer.resolveId entirely,
      // so a user `import foo from './a.scss?inline'` reaches load as the
      // bare query form. Handle it here so tests still resolve.
      if (/\.(css|scss|sass|less)\?inline$/.test(id)) {
        const filePath = id.split('?')[0];
        const code = await fsPromises.readFile(filePath, 'utf-8');
        if (!shouldPreprocessTestCss(resolvedConfig, filePath)) {
          return `export default ${JSON.stringify(code)}`;
        }
        const result = await preprocessCSS(code, filePath, resolvedConfig);
        return `export default ${JSON.stringify(result.code)}`;
      }

      return;
    },
  };
}
