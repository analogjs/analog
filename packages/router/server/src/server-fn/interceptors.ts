import { InjectionToken, type Provider } from '@angular/core';

import type { ServerFnContext } from '@analogjs/router';

/** Context threaded through the interceptor chain and handed to the handler. */
export interface ServerFnInterceptorContext {
  readonly input: unknown;
  readonly context: ServerFnContext;
  /** Return a new context with additional typed fields merged in. */
  with(
    patch: Partial<ServerFnContext> & Record<string, unknown>,
  ): ServerFnInterceptorContext;
}

export type ServerFnNext = (
  ctx: ServerFnInterceptorContext,
) => Promise<unknown>;

/** Functional interceptor, modeled on `HttpInterceptorFn`. */
export type ServerFnInterceptorFn = (
  ctx: ServerFnInterceptorContext,
  next: ServerFnNext,
) => Promise<unknown> | unknown;

export const SERVER_FN_INTERCEPTORS = new InjectionToken<
  ServerFnInterceptorFn[]
>('SERVER_FN_INTERCEPTORS');

export interface ServerFnsFeature {
  providers: Provider[];
}

/** `withServerFnInterceptors([...])` — registers the chain (DI, ordered). */
export function withServerFnInterceptors(
  interceptors: ServerFnInterceptorFn[],
): ServerFnsFeature {
  return {
    providers: interceptors.map((fn) => ({
      provide: SERVER_FN_INTERCEPTORS,
      useValue: fn,
      multi: true,
    })),
  };
}

/** `provideServerFns(withServerFnInterceptors(...))` — mirrors provideHttpClient. */
export function provideServerFns(...features: ServerFnsFeature[]): Provider[] {
  return features.flatMap((f) => f.providers);
}

function makeCtx(
  input: unknown,
  context: ServerFnContext,
): ServerFnInterceptorContext {
  return {
    input,
    context,
    with(patch) {
      return makeCtx(input, { ...context, ...patch } as ServerFnContext);
    },
  };
}

/**
 * Run the interceptor chain, then the handler, threading the context.
 *
 * `runInCtx` re-establishes the DI injection context around each interceptor
 * and the handler individually. This is what keeps `inject()` working in a
 * handler even when an upstream interceptor `await`s before calling `next`
 * (which would otherwise resume outside Angular's synchronous injection
 * context). It defaults to a pass-through for non-DI callers/tests.
 */
export async function runInterceptors(
  interceptors: ServerFnInterceptorFn[],
  input: unknown,
  handler: (
    input: unknown,
    context: ServerFnContext,
  ) => Promise<unknown> | unknown,
  runInCtx: <T>(fn: () => T) => T = (fn) => fn(),
): Promise<unknown> {
  let i = -1;
  const dispatch: ServerFnNext = async (ctx) => {
    i += 1;
    if (i < interceptors.length) {
      return runInCtx(() => interceptors[i](ctx, dispatch));
    }
    return runInCtx(() => handler(ctx.input, ctx.context));
  };
  return dispatch(makeCtx(input, {} as ServerFnContext));
}
