import {
  defineRouteMeta,
  injectRouter,
  provideFileRouter,
} from '@analogjs/router';

export const routerBasicFixture: Array<
  typeof defineRouteMeta | typeof injectRouter | typeof provideFileRouter
> = [defineRouteMeta, injectRouter, provideFileRouter];
