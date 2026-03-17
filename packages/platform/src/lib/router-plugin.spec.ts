import { describe, expect, it, vi } from 'vitest';

import { routerPlugin } from './router-plugin.js';

describe('routerPlugin', () => {
  const configureServer = () => {
    const importer = { id: '/src/main.ts' };
    const pageImporter = { id: '/src/app/routes.ts' };
    const analogModule = {
      id: '/node_modules/@analogjs/router/fesm2022/router.mjs',
      importers: new Set([importer]),
    };
    const changedRouteModule = {
      id: '/src/app/pages/hot-added.page.ts',
      importers: new Set([pageImporter]),
    };
    const unrelatedModule = {
      id: '/src/app/pages/home.page.ts',
      importers: new Set(),
    };
    const invalidateModule = vi.fn();
    const getModulesByFile = vi.fn((path: string) =>
      path === '/src/app/pages/hot-added.page.ts'
        ? new Set([changedRouteModule])
        : undefined,
    );
    const send = vi.fn();
    const on = vi.fn();
    const server = {
      moduleGraph: {
        fileToModulesMap: new Map([
          ['/src/app/pages/example.page.ts', [analogModule, unrelatedModule]],
        ]),
        getModulesByFile,
        invalidateModule,
      },
      watcher: {
        on,
      },
      ws: {
        send,
      },
    };

    const [plugin] = routerPlugin();
    const configureServer = plugin.configureServer as (server: unknown) => void;

    configureServer(server);

    return {
      analogModule,
      changedRouteModule,
      importer,
      pageImporter,
      getModulesByFile,
      invalidateModule,
      send,
      on,
    };
  };

  it('invalidates route modules when a route file changes', () => {
    const {
      analogModule,
      changedRouteModule,
      importer,
      pageImporter,
      getModulesByFile,
      invalidateModule,
      send,
      on,
    } = configureServer();

    const changeHandler = on.mock.calls.find(
      ([eventName]) => eventName === 'change',
    )?.[1];

    expect(changeHandler).toBeTypeOf('function');

    changeHandler('/src/app/pages/hot-added.page.ts');

    expect(getModulesByFile).toHaveBeenCalledWith(
      '/src/app/pages/hot-added.page.ts',
    );
    expect(invalidateModule).toHaveBeenCalledWith(changedRouteModule);
    expect(invalidateModule).toHaveBeenCalledWith(pageImporter);
    expect(invalidateModule).toHaveBeenCalledWith(analogModule);
    expect(invalidateModule).toHaveBeenCalledWith(importer);
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
  });

  it('ignores unrelated file changes', () => {
    const { invalidateModule, send, on } = configureServer();

    const changeHandler = on.mock.calls.find(
      ([eventName]) => eventName === 'change',
    )?.[1];

    changeHandler('/src/app/components/button.component.ts');

    expect(invalidateModule).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
