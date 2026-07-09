import { describe, expect, it } from 'vitest';

import {
  buildServerFnDispatchModule,
  getServerFnDispatchHandler,
  SERVER_FN_DISPATCH_ROUTE,
  SERVER_FN_DISPATCH_VIRTUAL,
} from './server-fn-endpoints';

describe('getServerFnDispatchHandler', () => {
  it('registers the single dispatch route pointing at the virtual module', () => {
    const handler = getServerFnDispatchHandler();
    expect(handler).toEqual({
      route: SERVER_FN_DISPATCH_ROUTE,
      handler: SERVER_FN_DISPATCH_VIRTUAL,
      lazy: true,
    });
  });

  it('never /api-prefixes the route (client refs call /_analog/fn/:id absolutely)', () => {
    expect(getServerFnDispatchHandler().route).toBe('/_analog/fn/:id');
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

  it('dispatches by router param, enforces method, and propagates headers', () => {
    const src = buildServerFnDispatchModule({ modules });
    expect(src).toContain(
      `import { dispatchServerFn } from '@analogjs/router/server';`,
    );
    expect(src).toContain(`const id = getRouterParam(event, 'id');`);
    expect(src).toContain('await dispatchServerFn(');
    // App injector built once; request method passed for server-side enforcement.
    expect(src).toContain(`import { Injector } from '@angular/core';`);
    expect(src).toContain(
      'const appInjector = Injector.create({ providers: serverFnAppProviders });',
    );
    expect(src).toContain('parent: appInjector,');
    expect(src).toContain('method: event.method,');
    expect(src).toContain('event.node.res.statusCode = status;');
    // Response headers (redirect Location, Set-Cookie, X-Analog-Errors) are set.
    expect(src).toContain('const { status, body, headers }');
    expect(src).toContain('event.node.res.setHeader(key, value);');
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
