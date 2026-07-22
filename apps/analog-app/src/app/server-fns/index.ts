import { inject, type StaticProvider } from '@angular/core';
import { REQUEST } from '@analogjs/router/tokens';

import {
  provideServerFns,
  withServerFnInterceptors,
  type ServerFnInterceptorFn,
} from '@analogjs/router/server';
import { fail } from '@analogjs/router/server/actions';

// Registration of `*.server.ts` modules is the build transform's job (the
// generated Nitro dispatch handler imports the discovered modules, and the
// transform stamps each serverFn with its derived id). This module only wires
// the app + interceptor providers made available inside handlers.

// Demo interceptor: reads a request header via DI and can short-circuit, or
// threads a value into the handler context. It intentionally `await`s before
// calling `next` to prove `inject()` still works in the downstream handler.
const authInterceptor: ServerFnInterceptorFn = async (ctx, next) => {
  const req = inject(REQUEST);
  if (req?.headers['x-demo-deny'] === '1') {
    return fail(401, { message: 'denied by interceptor' });
  }
  await Promise.resolve();
  return next(ctx.with({ user: 'demo-user' }));
};

/** App + interceptor providers made available inside server function handlers. */
// CatalogService is `providedIn: 'root'`, so it resolves from the bootstrapped
// app injector without being listed — the same way it would during SSR.
export const serverFnAppProviders: StaticProvider[] = [
  ...(provideServerFns(
    withServerFnInterceptors([authInterceptor]),
  ) as StaticProvider[]),
];
