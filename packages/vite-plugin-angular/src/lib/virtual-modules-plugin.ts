import { dirname, isAbsolute, resolve } from 'node:path';
import { normalizePath, type Plugin, type ResolvedConfig } from 'vite';
import {
  isAngularBuildContext,
  type AngularBuildContext,
} from './angular-build-context.js';
import { markStylePathSafe } from './utils/safe-module-paths.js';
import { VIRTUAL_RAW_PREFIX, toVirtualRawId } from './utils/virtual-ids.js';
import {
  loadVirtualRawModule,
  rewriteHtmlRawImport,
} from './utils/virtual-resources.js';

export interface VirtualModulesPluginOptions {
  jit?: boolean;
}

export function resolveAngularVirtualId(
  id: string,
  importer: string | undefined,
  options: {
    jit: boolean;
    resolvedConfig?: ResolvedConfig;
  },
): string | undefined {
  if (id.startsWith(VIRTUAL_RAW_PREFIX)) {
    return `\0${id}`;
  }

  if (options.jit && id.startsWith('angular:jit:')) {
    const filePath = normalizePath(
      resolve(dirname(importer as string), id.split(';')[1]),
    );
    if (id.includes(':style')) {
      markStylePathSafe(options.resolvedConfig, filePath);
      return filePath + '?inline';
    }
    return toVirtualRawId(filePath);
  }

  // Intercept .html?raw imports to bypass Vite server.fs restrictions
  const rawRewrite = rewriteHtmlRawImport(id, importer);
  if (rawRewrite) {
    return rawRewrite;
  }

  // User `.scss?inline` / `.css?inline` imports: resolve and mark
  // safe so Vite's native CSS pipeline handles them.
  if (/\.(css|scss|sass|less)\?inline$/.test(id) && importer) {
    const filePath = id.split('?')[0];
    const resolved = isAbsolute(filePath)
      ? normalizePath(filePath)
      : normalizePath(resolve(dirname(importer), filePath));
    markStylePathSafe(options.resolvedConfig, resolved);
    return resolved + '?inline';
  }

  return undefined;
}

export async function loadAngularVirtualModule(
  pluginCtx: { addWatchFile(path: string): void },
  id: string,
  resolvedConfig?: ResolvedConfig,
): Promise<string | undefined> {
  const rawModule = await loadVirtualRawModule(pluginCtx, id);
  if (rawModule !== undefined) {
    return rawModule;
  }

  // Vitest fallback: the module-runner can skip resolveId, so the bare
  // ?inline query reaches load. Mark safe and let Vite handle it.
  if (/\.(css|scss|sass|less)\?inline$/.test(id)) {
    markStylePathSafe(resolvedConfig, id.split('?')[0]);
  }

  return undefined;
}

export function virtualModulesPlugin(
  ctxOrOptions?: AngularBuildContext | VirtualModulesPluginOptions,
): Plugin {
  const sharedCtx = isAngularBuildContext(ctxOrOptions)
    ? ctxOrOptions
    : undefined;
  const standaloneJit = isAngularBuildContext(ctxOrOptions)
    ? ctxOrOptions.options.jit
    : (ctxOrOptions?.jit ?? false);
  let localConfig: ResolvedConfig | undefined;

  return {
    name: '@analogjs/vite-plugin-angular:virtual-modules',
    enforce: 'pre',
    configResolved(config) {
      localConfig = config;
      sharedCtx?.setResolvedConfig(config);
    },
    resolveId(id, importer) {
      return resolveAngularVirtualId(id, importer, {
        jit: sharedCtx ? sharedCtx.options.jit : standaloneJit,
        resolvedConfig: sharedCtx?.resolvedConfig ?? localConfig,
      });
    },
    async load(id) {
      return loadAngularVirtualModule(
        this,
        id,
        sharedCtx?.resolvedConfig ?? localConfig,
      );
    },
  };
}
