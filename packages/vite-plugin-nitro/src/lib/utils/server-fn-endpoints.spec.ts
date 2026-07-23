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

  it('loads the Angular JIT compiler, which the linker never reaches here', () => {
    const src = buildServerFnDispatchModule({ modules });

    // Must be first: the partially-compiled Angular imports below it are
    // evaluated in order, and they need the compiler already registered.
    expect(src.trimStart().startsWith(`import '@angular/compiler';`)).toBe(
      true,
    );
  });

  it("answers a malformed body with the JSON error contract, not h3's", () => {
    const src = buildServerFnDispatchModule({ modules });

    expect(src).toContain('try {');
    expect(src).toContain('statusCode = 400');
    expect(src).toContain('Malformed request body');
  });

  it('bootstraps against the app server config when one is given', () => {
    const src = buildServerFnDispatchModule({
      modules,
      appConfigModule: '/ws/app/src/app/app.config.server.ts',
    });
    expect(src).toContain(
      `import { config as serverFnAppConfig } from "/ws/app/src/app/app.config.server.ts";`,
    );
    expect(src).not.toContain('const serverFnAppConfig = { providers: [] }');
  });

  it('falls back to an empty config when the app has none', () => {
    const src = buildServerFnDispatchModule({ modules });
    expect(src).toContain('const serverFnAppConfig = { providers: [] };');
    expect(src).not.toContain('import { config as serverFnAppConfig }');
  });

  it('dispatches by router param, enforces method, and propagates headers', () => {
    const src = buildServerFnDispatchModule({ modules });
    expect(src).toContain(
      `import { dispatchServerFn, createServerFnAppInjector } from '@analogjs/router/server';`,
    );
    expect(src).toContain(`const id = getRouterParam(event, 'id');`);
    expect(src).toContain('await dispatchServerFn(');
    // The app injector is a bootstrapped root injector (so providedIn: 'root'
    // resolves), built once and awaited per request.
    expect(src).toContain(
      'const appInjector = createServerFnAppInjector(serverFnAppConfig);',
    );
    expect(src).toContain('parent: await appInjector,');
    expect(src).toContain('method: event.method,');
    expect(src).toContain('event.node.res.statusCode = status;');
    // Response headers (redirect Location, Set-Cookie, X-Analog-Errors) are set.
    expect(src).toContain('const { status, body, headers }');
    expect(src).toContain('event.node.res.setHeader(key, value);');
  });

  it('emits posix-style import specifiers unchanged', () => {
    const src = buildServerFnDispatchModule({
      modules: [{ file: '/ws/app/src/app/a.server.ts' }],
      appConfigModule: '/ws/app/src/app/app.config.server.ts',
    });
    expect(src).toContain('import "/ws/app/src/app/a.server.ts";');
    expect(src).toContain(`from "/ws/app/src/app/app.config.server.ts";`);
  });
});
