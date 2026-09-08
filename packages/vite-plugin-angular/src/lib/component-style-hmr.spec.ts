import { describe, expect, it, vi } from 'vitest';
import { parseSync } from 'oxc-parser';
import type { HmrContext, ModuleNode } from 'vite';
import { AnalogStylesheetRegistry } from './stylesheet-registry.js';
import {
  componentStyleHmrPlugin,
  updateComponentStyles,
} from './component-style-hmr.js';

function fixture(encapsulations = [0, 2]) {
  const modules = encapsulations.map(
    (encapsulation, index) =>
      ({
        id: `/view.scss?direct&ngcomp=c${index}&e=${encapsulation}`,
        url: `/hash.scss?direct&ngcomp=c${index}&e=${encapsulation}`,
        file: '/view.scss',
        type: 'css',
        importers: new Set(),
      }) as ModuleNode,
  );
  const dependency = {
    id: '/_tokens.scss',
    type: 'css',
    importers: new Set(modules),
  } as ModuleNode;
  const invalidateModule = vi.fn();
  const send = vi.fn();
  const ctx = {
    file: '/_tokens.scss',
    timestamp: 42,
    modules: [dependency],
    server: {
      config: { base: '/' },
      moduleGraph: {
        getModulesByFile: () => new Set([dependency]),
        invalidateModule,
      },
      ws: { send },
    },
  } as unknown as HmrContext;
  return { ctx, modules, send, invalidateModule };
}

describe('component stylesheet updates', () => {
  it('rewrites every generated metadata replacement without traversing unrelated declarations', () => {
    const plugin = componentStyleHmrPlugin();
    (plugin.configResolved as any)({
      server: { hmr: {} },
      base: '/',
    } as any);
    const declarations = Array.from(
      { length: 100 },
      (_, index) =>
        `const value${index} = { nested: [${index}, ${index + 1}] };`,
    ).join('\n');
    const code = `
      import * as i0 from '@angular/core';
      ${declarations}
      if (import.meta.hot) {
        import.meta.hot.accept((next) => {
          i0.ɵɵreplaceMetadata(ComponentA, next.ComponentA, {});
          i0.ɵɵreplaceMetadata(ComponentB, next.ComponentB, {});
        });
      }
    `;
    const transformed = (plugin.transform as any).call(
      { parse: (source: string) => parseSync('component.ts', source).program },
      code,
      '/src/component.ts',
      { ssr: false },
    );

    expect(transformed.code).toContain(
      `import '${'virtual:analog-component-style-hmr'}';`,
    );
    expect(transformed.code).toContain(
      "import { replaceMetadata as __analogReplaceMetadata } from 'virtual:analog-component-style-hmr';",
    );
    expect(
      transformed.code.match(/__analogReplaceMetadata\(i0\.ɵɵreplaceMetadata/g),
    ).toHaveLength(2);
    expect(transformed.code).not.toContain('i0.ɵɵreplaceMetadata(ComponentA');
    expect(transformed.map).toBeDefined();
  });

  it('invalidates Angular renderer caches for previously destroyed components', () => {
    const plugin = componentStyleHmrPlugin();
    const code = (plugin.load as any)(
      '\0virtual:analog-component-style-hmr',
    ) as string;
    const body = code
      .slice(
        code.indexOf('export function replaceMetadata'),
        code.indexOf('const cleanups'),
      )
      .replace('export ', '');
    const componentReplaced = vi.fn();
    const hot = { invalidate: vi.fn() };
    const replace = vi.fn();
    const run = new Function(
      'document',
      'globalThis',
      'RendererFactory2',
      'hot',
      body + '; return replaceMetadata;',
    )(
      { querySelectorAll: () => [{}] },
      { ng: { getInjector: () => ({ get: () => ({ componentReplaced }) }) } },
      {},
      hot,
    );
    const type = { ɵcmp: { id: 'c1', tView: {} } };
    run(replace, type, 'metadata');
    expect(componentReplaced).toHaveBeenCalledExactlyOnceWith('c1');
    expect(replace).toHaveBeenCalledWith(type, 'metadata');
    expect(componentReplaced.mock.invocationCallOrder[0]).toBeLessThan(
      replace.mock.invocationCallOrder[0]!,
    );
    expect(hot.invalidate).not.toHaveBeenCalled();

    const unsupported = new Function(
      'document',
      'globalThis',
      'RendererFactory2',
      'hot',
      body + '; return replaceMetadata;',
    )(
      { querySelectorAll: () => [] },
      { location: { reload: hot.invalidate } },
      {},
      hot,
    );
    replace.mockClear();
    unsupported(replace, type);
    expect(hot.invalidate).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });
  it('recognizes Angular unscoped stylesheet identities without a component id', async () => {
    const { ctx, modules, send } = fixture([2]);
    const module = modules[0]!;
    module.id = module.id!.replace('ngcomp=c0', 'ngcomp');
    module.url = module.url.replace('ngcomp=c0', 'ngcomp');
    expect(
      await updateComponentStyles(ctx, new AnalogStylesheetRegistry(), vi.fn()),
    ).toEqual([]);
    expect(send).toHaveBeenCalledWith('analog:component-style', {
      paths: [module.url],
      timestamp: 42,
    });
  });
  it('includes browser identities when Vite rewrites a generated CSS URL for Sass', async () => {
    const { ctx, modules, send } = fixture();
    const registry = new AnalogStylesheetRegistry();
    registry.registerExternalRequest('hash.css', '/view.scss');
    for (const module of modules)
      module.url = module.url.replace('hash.scss', 'hash.css.scss');
    await updateComponentStyles(ctx, registry, vi.fn());
    expect(send).toHaveBeenCalledWith('analog:component-style', {
      paths: modules.flatMap((module) => [
        module.url,
        module.url.replace('hash.css.scss', 'hash.css'),
      ]),
      timestamp: 42,
    });
  });

  it('ignores watch-only CSS edges while returning global CSS to Vite', async () => {
    const { ctx, send } = fixture();
    const component = {
      id: '/component.ts',
      type: 'js',
      importers: new Set(),
    } as ModuleNode;
    const watched = {
      id: '/view.scss',
      type: 'js',
      importers: new Set([component]),
    } as ModuleNode;
    const global = {
      id: '/global.scss',
      type: 'js',
      isSelfAccepting: true,
      importers: new Set(),
    } as ModuleNode;
    ctx.modules.push(watched, global);
    expect(
      await updateComponentStyles(ctx, new AnalogStylesheetRegistry(), vi.fn()),
    ).toEqual([global]);
    expect(send).toHaveBeenCalledOnce();
  });

  it.each(['file', 'url'] as const)(
    'retains fallback without stylesheet %s identity',
    async (field) => {
      const { ctx, modules, send } = fixture();
      Object.assign(modules[0]!, { [field]: undefined });
      expect(
        await updateComponentStyles(
          ctx,
          new AnalogStylesheetRegistry(),
          vi.fn(),
        ),
      ).toBeUndefined();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('updates every shared usage after refreshing and invalidating cached styles', async () => {
    const { ctx, modules, send, invalidateModule } = fixture();
    const refresh = vi.fn();
    expect(
      await updateComponentStyles(ctx, new AnalogStylesheetRegistry(), refresh),
    ).toEqual([]);
    expect(refresh).toHaveBeenCalledExactlyOnceWith('/view.scss');
    expect(invalidateModule).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledExactlyOnceWith('analog:component-style', {
      paths: modules.map((module) => module.url),
      timestamp: 42,
    });
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0]!,
    );
  });

  it('refreshes shared ShadowDom sources before the reload fallback', async () => {
    const { ctx, send } = fixture([0, 3]);
    const refresh = vi.fn();
    expect(
      await updateComponentStyles(ctx, new AnalogStylesheetRegistry(), refresh),
    ).toEqual([]);
    expect(refresh).toHaveBeenCalledWith('/view.scss');
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
  });

  it('refreshes every shared Sass usage before a disabled native path reloads', async () => {
    const { ctx, send, invalidateModule } = fixture();
    const refresh = vi.fn();
    expect(
      await updateComponentStyles(
        ctx,
        new AnalogStylesheetRegistry(),
        refresh,
        [],
        false,
      ),
    ).toEqual([]);
    expect(refresh).toHaveBeenCalledExactlyOnceWith('/view.scss');
    expect(invalidateModule).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'full-reload' });
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0]!,
    );
  });

  it.each([[0, 9], []])(
    'retains fallback when any usage is unsupported: %j',
    async (...encapsulations) => {
      const { ctx, send } = fixture(encapsulations as number[]);
      expect(
        await updateComponentStyles(
          ctx,
          new AnalogStylesheetRegistry(),
          vi.fn(),
        ),
      ).toBeUndefined();
      expect(send).not.toHaveBeenCalled();
    },
  );
});
