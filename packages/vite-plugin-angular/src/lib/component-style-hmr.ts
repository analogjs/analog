import MagicString from 'magic-string';
import type { HmrContext, ModuleNode, Plugin } from 'vite';
import { normalizePath } from 'vite';
import type { AnalogStylesheetRegistry } from './stylesheet-registry.js';
import { getComponentStyleSheetMeta } from './encapsulation-plugin.js';
import { isCompilerSource, stripQuery } from './utils/module-id.js';

const clientId = 'virtual:analog-component-style-hmr';
const event = 'analog:component-style';

// Updating the existing link keeps Angular's SharedStylesHost ownership intact.
const client = `import { createHotContext } from '/@vite/client';
const hot = createHotContext(import.meta.url);
const cleanups = new WeakMap();
hot.on('${event}', ({ paths, timestamp }) => {
  const identity = (value) => {
    const url = new URL(value, location.href);
    url.searchParams.delete('t');
    url.searchParams.delete('direct');
    return url.pathname + '?' + [...url.searchParams].sort().map(([key, value]) => key + '=' + value).join('&');
  };
  const updated = new Set(paths.map(identity));
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (!updated.has(identity(link.href))) continue;
    const url = new URL(link.href);
    url.searchParams.set('t', timestamp);
    cleanups.get(link)?.();
    const failed = () => location.reload();
    const cleanup = () => { link.removeEventListener('error', failed); link.removeEventListener('load', cleanup); cleanups.delete(link); };
    cleanups.set(link, cleanup);
    link.addEventListener('error', failed, { once: true });
    link.addEventListener('load', cleanup, { once: true });
    link.href = url.href;
  }
});`;

export function componentStyleHmrPlugin(): Plugin {
  let enabled = false;
  let base = '/';
  return {
    name: 'analog-component-style-hmr',
    apply: 'serve',
    enforce: 'post',
    configResolved(config) {
      enabled = config.server.hmr !== false;
      base = config.base;
    },
    resolveId(id) {
      if (id === clientId) return `\0${clientId}`;
      return;
    },
    load(id) {
      if (id === `\0${clientId}`)
        return client.replace(
          "'/@vite/client'",
          JSON.stringify(`${base}@vite/client`),
        );
      return;
    },
    transform(code, id, options) {
      if (
        enabled &&
        !options?.ssr &&
        isCompilerSource(id) &&
        code.includes('ɵɵExternalStylesFeature')
      ) {
        const output = new MagicString(code).prepend(`import '${clientId}';\n`);
        return {
          code: output.toString(),
          map: output.generateMap({
            source: id,
            includeContent: true,
            hires: true,
          }),
        };
      }
      return;
    },
  };
}

/** Return undefined when native stylesheet identity/encapsulation is not proven. */
export async function updateComponentStyles(
  ctx: HmrContext,
  registry: AnalogStylesheetRegistry | undefined,
  refresh: (source: string) => void,
  owners: readonly string[] = [],
): Promise<ModuleNode[] | undefined> {
  if (!registry || !/\.(css|s[ac]ss|less)$/.test(ctx.file)) return;
  const graph = ctx.server.moduleGraph;
  const modules = new Set<ModuleNode>();
  const visit = (module: ModuleNode) => {
    if (modules.has(module) || owners.includes(stripQuery(module.id ?? '')))
      return;
    modules.add(module);
    if (
      !module.id?.includes('ngcomp=') &&
      !(module.type === 'js' && /\.(css|s[ac]ss|less)$/.test(module.id ?? ''))
    )
      for (const importer of module.importers) visit(importer);
  };
  for (const module of ctx.modules) visit(module);
  for (const module of graph.getModulesByFile(normalizePath(ctx.file)) ?? [])
    visit(module);
  for (const request of registry.getRequestIdsForSource(
    normalizePath(ctx.file),
  )) {
    const module = await graph.getModuleByUrl('/' + request.replace(/^\//, ''));
    if (module) visit(module);
  }
  const styles = [...modules].filter((module) =>
    module.id?.includes('ngcomp='),
  );
  if (
    !styles.length ||
    styles.some((module) => {
      const meta = getComponentStyleSheetMeta(module.id!);
      return (
        !module.file ||
        !module.url ||
        !meta.componentId ||
        !['emulated', 'none'].includes(meta.encapsulation)
      );
    })
  )
    return;
  // A stylesheet can also be imported as a JS string or by another integration.
  // Let its established HMR path handle those consumers.
  if (
    [...modules].some(
      (module) =>
        module.id?.includes('?inline') ||
        (module.type === 'js' &&
          !module.id?.includes('ngcomp=') &&
          isCompilerSource(module.id ?? '')),
    )
  )
    return;
  const sources = new Set(
    styles.flatMap((module) => (module.file ? [stripQuery(module.file)] : [])),
  );
  for (const source of sources) refresh(source);
  for (const module of modules)
    graph.invalidateModule(module, undefined, ctx.timestamp);
  ctx.server.ws.send(event, {
    paths: [
      ...new Set(
        styles.flatMap((module) => [
          module.url,
          ...registry
            .getExternalRequestsForSource(module.file!)
            .map(
              (request) =>
                `${ctx.server.config.base ?? '/'}${request}${new URL(module.url, 'http://localhost').search}`,
            ),
        ]),
      ),
    ],
    timestamp: ctx.timestamp,
  });
  return [...modules].filter(
    (module) =>
      module.type === 'js' &&
      !module.id?.includes('ngcomp=') &&
      module.isSelfAccepting === true,
  );
}
