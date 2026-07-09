import { describe, expect, it } from 'vitest';

import { runInterceptors, type ServerFnInterceptorFn } from './interceptors';

describe('runInterceptors', () => {
  it('runs interceptors in order and threads ctx.with into the handler', async () => {
    const order: string[] = [];
    const a: ServerFnInterceptorFn = (ctx, next) => {
      order.push('a');
      return next(ctx.with({ a: 1 } as never));
    };
    const b: ServerFnInterceptorFn = (ctx, next) => {
      order.push('b');
      return next(ctx.with({ b: 2 } as never));
    };
    const handler = (input: unknown, context: unknown) => {
      order.push('handler');
      return { input, context };
    };

    const result = (await runInterceptors([a, b], 'IN', handler)) as {
      input: unknown;
      context: Record<string, unknown>;
    };

    expect(order).toEqual(['a', 'b', 'handler']);
    expect(result.input).toBe('IN');
    expect(result.context).toEqual({ a: 1, b: 2 });
  });

  it('short-circuits when an interceptor returns without calling next', async () => {
    const deny: ServerFnInterceptorFn = () => 'denied';
    let handlerRan = false;
    const handler = () => {
      handlerRan = true;
      return 'ok';
    };

    expect(await runInterceptors([deny], undefined, handler)).toBe('denied');
    expect(handlerRan).toBe(false);
  });

  it('runs the handler inside runInCtx even after an interceptor awaits before next', async () => {
    // Models the DI injection context: only "active" during synchronous
    // execution of the wrapped fn. The per-hop wrapping must re-activate it for
    // the handler even though the interceptor awaited first.
    let active = false;
    const runInCtx = <T>(fn: () => T): T => {
      active = true;
      try {
        return fn();
      } finally {
        active = false;
      }
    };

    const asyncInterceptor: ServerFnInterceptorFn = async (ctx, next) => {
      await Promise.resolve(); // context is torn down across this await
      return next(ctx);
    };

    let handlerSawContext = false;
    const handler = () => {
      handlerSawContext = active;
      return 'ok';
    };

    const result = await runInterceptors(
      [asyncInterceptor],
      undefined,
      handler,
      runInCtx,
    );

    expect(result).toBe('ok');
    expect(handlerSawContext).toBe(true);
  });
});
