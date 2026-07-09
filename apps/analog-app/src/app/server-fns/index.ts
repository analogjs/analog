import { inject, type StaticProvider } from '@angular/core';
import { REQUEST } from '@analogjs/router/tokens';

import {
  provideServerFns,
  withServerFnInterceptors,
  type ServerFnInterceptorFn,
} from '@analogjs/router/server';
import { fail } from '@analogjs/router/server/actions';
import { CatalogService } from './catalog.service';

// Import server function modules for their registration side effects. A real
// build transform would generate this from the discovered `*.server.ts` files.
import './products.server';

// Demo interceptor: reads a request header via DI and can short-circuit, or
// threads a value into the handler context.
const authInterceptor: ServerFnInterceptorFn = (ctx, next) => {
  const req = inject(REQUEST);
  if (req?.headers['x-demo-deny'] === '1') {
    return fail(401, { message: 'denied by interceptor' });
  }
  return next(ctx.with({ user: 'demo-user' }));
};

/** App + interceptor providers made available inside server function handlers. */
export const serverFnAppProviders: StaticProvider[] = [
  { provide: CatalogService, useClass: CatalogService, deps: [] },
  ...(provideServerFns(
    withServerFnInterceptors([authInterceptor]),
  ) as StaticProvider[]),
];

export * from './products.server';
