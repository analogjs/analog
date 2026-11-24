import { statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
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

const FS_PREFIX = '/@fs/';

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/**
 * The file a URL that Vite wrote into a module's code points at. Vitest
 * resolves the imports of a module restored from `fsModuleCache` by these
 * URLs, so they must resolve to the same file as the original import.
 * `/@fs/<path>` is that path. A root-relative URL (`/src/app/a.css`) is the
 * file under the Vite root when there is one; otherwise the caller reads it
 * as the path given, which is the order Vite tries the two in. A URL that
 * already starts with the root's path is root-relative only when the root
 * holds a directory at its own path (`/app/app`), as in Vite's resolver.
 */
function resolveViteUrl(
  url: string,
  root: string | undefined,
): string | undefined {
  if (url.startsWith(FS_PREFIX)) {
    const fsPath = url.slice(FS_PREFIX.length);
    // `/@fs/C:/a.css` on Windows, `/@fs/home/a.css` elsewhere.
    return /^[A-Z]:/i.test(fsPath) ? fsPath : `/${fsPath}`;
  }
  if (!root || !url.startsWith('/')) {
    return undefined;
  }
  if (url.startsWith(`${root}/`) && !isDirectory(join(root, root))) {
    return undefined;
  }
  const filePath = join(root, url);
  return statSync(filePath, { throwIfNoEntry: false })?.isFile()
    ? filePath
    : undefined;
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
    const resolved = normalizePath(
      resolveViteUrl(filePath, options.resolvedConfig?.root) ??
        (isAbsolute(filePath)
          ? filePath
          : resolve(dirname(importer), filePath)),
    );
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
