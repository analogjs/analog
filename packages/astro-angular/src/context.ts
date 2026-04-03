import type { SSRResult } from 'astro';

export type RendererContext = {
  result: SSRResult;
};

type Context = {
  id: string;
  c: number;
};

const contexts = new WeakMap<SSRResult, Context>();

export function getContext(result: SSRResult): Context {
  let ctx = contexts.get(result);
  if (ctx) {
    return ctx;
  }
  ctx = {
    c: 0,
    get id() {
      return 'analog-' + this.c.toString();
    },
  };
  contexts.set(result, ctx);
  return ctx;
}

export function incrementId(ctx: Context): string {
  let id = ctx.id;
  ctx.c++;
  return id;
}
