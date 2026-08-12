import { inject } from '@angular/core';
import { REQUEST } from '@analogjs/router/tokens';
import type { ServerFnInterceptorFn } from '@analogjs/router/server';
import { fail } from '@analogjs/router/server/actions';

/**
 * Demo server-function interceptor: reads a request header via DI and can
 * short-circuit, or threads a value into the handler context. It intentionally
 * `await`s before calling `next` to prove `inject()` still works in the
 * downstream handler.
 */
export const authInterceptor: ServerFnInterceptorFn = async (ctx, next) => {
  const req = inject(REQUEST);
  if (req?.headers['x-demo-deny'] === '1') {
    return fail(401, { message: 'denied by interceptor' });
  }
  await Promise.resolve();
  return next(ctx.with({ user: 'demo-user' }));
};
