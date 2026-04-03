import type { SSRResult } from 'astro';

export type RendererContext = {
  result: SSRResult;
};

type Context = {
  c: number;
  getId(): string;
};

const contexts = new WeakMap<SSRResult, Context>();

export function getContext(result: SSRResult): Context {
  let ctx = contexts.get(result);
  if (ctx) {
    return ctx;
  }
  ctx = {
    c: 0,
    getId() {
      return 'analog-' + this.c.toString();
    },
  };
  contexts.set(result, ctx);
  return ctx;
}

export function incrementId(ctx: Context): string {
  const id = ctx.getId();
  ctx.c++;
  return id;
}
