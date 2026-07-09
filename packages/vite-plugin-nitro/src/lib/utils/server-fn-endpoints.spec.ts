import { describe, expect, it } from 'vitest';

import {
  buildServerFnDispatchModule,
  getServerFnDispatchHandler,
  SERVER_FN_DISPATCH_ROUTE,
  SERVER_FN_DISPATCH_VIRTUAL,
} from './server-fn-endpoints';

describe('getServerFnDispatchHandler', () => {
  it('registers the single dispatch route pointing at the virtual module', () => {
    const handler = getServerFnDispatchHandler(false);
    expect(handler).toEqual({
      route: SERVER_FN_DISPATCH_ROUTE,
      handler: SERVER_FN_DISPATCH_VIRTUAL,
      lazy: true,
    });
  });

  it('prefixes the route with /api when an API dir is present', () => {
    expect(getServerFnDispatchHandler(true).route).toBe(
      `/api${SERVER_FN_DISPATCH_ROUTE}`,
    );
  });
});

describe('buildServerFnDispatchModule', () => {
  const modules = [
    { file: '/ws/app/src/app/server-fns/products.server.ts' },
    { file: '/ws/app/src/app/pages/shipping/index.server.ts' },
  ];

  it('imports every discovered module for registration side-effects', () => {
    const src = buildServerFnDispatchModule({ modules });
    expect(src).toContain(
      `import "/ws/app/src/app/server-fns/products.server.ts";`,
    );
    expect(src).toContain(
      `import "/ws/app/src/app/pages/shipping/index.server.ts";`,
    );
  });

  it('imports app providers when a providers module is given', () => {
    const src = buildServerFnDispatchModule({
      modules,
      providersModule: '/ws/app/src/app/server-fns/index.ts',
    });
    expect(src).toContain(
      `import { serverFnAppProviders } from "/ws/app/src/app/server-fns/index.ts";`,
    );
    expect(src).not.toContain('const serverFnAppProviders = []');
  });

  it('falls back to empty providers when none is given', () => {
    const src = buildServerFnDispatchModule({ modules });
    expect(src).toContain('const serverFnAppProviders = [];');
    expect(src).not.toContain('import { serverFnAppProviders }');
  });

  it('dispatches by router param through dispatchServerFn', () => {
    const src = buildServerFnDispatchModule({ modules });
    expect(src).toContain(
      `import { dispatchServerFn } from '@analogjs/router/server';`,
    );
    expect(src).toContain(`const id = getRouterParam(event, 'id');`);
    expect(src).toContain('await dispatchServerFn(');
    expect(src).toContain('event.node.res.statusCode = status;');
  });

  it('emits posix-style import specifiers unchanged', () => {
    const src = buildServerFnDispatchModule({
      modules: [{ file: '/ws/app/src/app/a.server.ts' }],
      providersModule: '/ws/app/src/app/server-fns/index.ts',
    });
    expect(src).toContain('import "/ws/app/src/app/a.server.ts";');
    expect(src).toContain(`from "/ws/app/src/app/server-fns/index.ts";`);
  });
});
