import MagicString from 'magic-string';
import type { HmrContext, ModuleNode, Plugin } from 'vite';
import { normalizePath } from 'vite';
import type { AnalogStylesheetRegistry } from './stylesheet-registry.js';
import {
  getComponentStyleSheetMeta,
  isComponentStyleSheet,
} from './encapsulation-plugin.js';
import { isCompilerSource, stripQuery } from './utils/module-id.js';

const clientId = 'virtual:analog-component-style-hmr';
const event = 'analog:component-style';

// Updating the existing link keeps Angular's SharedStylesHost ownership intact.
const client = `import { createHotContext } from '/@vite/client';
import { RendererFactory2 } from '@angular/core';
const hot = createHotContext(import.meta.url);
export function replaceMetadata(replace, type, ...args) {
  // Angular clears renderer caches while recreating live views. A previously
  // destroyed component also needs that hook before it can be created again.
  if (type.ɵcmp?.tView) {
    const factories = new Set();
    for (const root of document.querySelectorAll('[ng-version]')) {
      const factory = globalThis.ng?.getInjector?.(root)?.get(RendererFactory2, null);
      if (factory) factories.add(factory);
    }
    if (!factories.size || [...factories].some((factory) => !factory.componentReplaced)) {
      hot.invalidate('The renderer cannot invalidate component metadata safely');
      return;
    }
    for (const factory of factories) factory.componentReplaced(type.ɵcmp.id);
  }
  return replace(type, ...args);
}
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
        (code.includes('ɵɵExternalStylesFeature') ||
          code.includes('ɵɵreplaceMetadata'))
      ) {
        const output = new MagicString(code).prepend(`import '${clientId}';\n`);
        if (code.includes('ɵɵreplaceMetadata')) {
          const ast = this.parse(code);
          const namespaces = new Set(
            ast.body.flatMap((node) =>
              node.type === 'ImportDeclaration' &&
              node.source.value === '@angular/core'
                ? node.specifiers
                    .filter(
                      (specifier) =>
                        specifier.type === 'ImportNamespaceSpecifier',
                    )
                    .map((specifier) => specifier.local.name)
                : [],
            ),
          );
          const visit = (node: any) => {
            if (!node || typeof node !== 'object') return;
            if (
              node.type === 'CallExpression' &&
              node.callee.type === 'MemberExpression' &&
              !node.callee.computed &&
              namespaces.has(node.callee.object.name) &&
              node.callee.property.name === 'ɵɵreplaceMetadata'
            ) {
              output.prependLeft(
                node.arguments[0].start,
                code.slice(node.callee.start, node.callee.end) + ', ',
              );
              output.overwrite(
                node.callee.start,
                node.callee.end,
                '__analogReplaceMetadata',
              );
            }
            for (const child of Object.values(node)) {
              if (Array.isArray(child)) child.forEach(visit);
              else if (child && typeof child === 'object') visit(child);
            }
          };
          visit(ast);
          output.prepend(
            `import { replaceMetadata as __analogReplaceMetadata } from '${clientId}';\n`,
          );
        }
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
      !isComponentStyleSheet(module.id ?? '') &&
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
    isComponentStyleSheet(module.id ?? ''),
  );
  if (
    !styles.length ||
    styles.some((module) => {
      const meta = getComponentStyleSheetMeta(module.id!);
      return (
        !module.file ||
        !module.url ||
        (meta.encapsulation === 'emulated' && !meta.componentId) ||
        !['emulated', 'none', 'shadow'].includes(meta.encapsulation)
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
          !isComponentStyleSheet(module.id ?? '') &&
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
  if (
    styles.some(
      (module) =>
        getComponentStyleSheetMeta(module.id!).encapsulation === 'shadow',
    )
  ) {
    ctx.server.ws.send({ type: 'full-reload' });
    return [];
  }
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
      !isComponentStyleSheet(module.id ?? '') &&
      module.isSelfAccepting === true,
  );
}
