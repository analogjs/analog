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

  it('wires the app injector into the runtime event handler', () => {
    const src = buildServerFnDispatchModule({ modules });
    // The transport logic lives in `createServerFnEventHandler`
    // (unit-tested in the router package); this module only wires it up, so it
    // must not re-inline dispatch or h3 request handling.
    expect(src).toContain(
      `import { createServerFnAppInjector, createServerFnEventHandler } from '@analogjs/router/server';`,
    );
    expect(src).toContain(
      'export default createServerFnEventHandler(\n  createServerFnAppInjector(serverFnAppConfig),\n);',
    );
    expect(src).not.toContain('dispatchServerFn');
    expect(src).not.toContain('event.node.res');
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
