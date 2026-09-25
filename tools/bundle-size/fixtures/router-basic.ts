import { injectRouter, provideFileRouter } from '@analogjs/router';

export const routerBasicFixture: Array<
  typeof injectRouter | typeof provideFileRouter
> = [injectRouter, provideFileRouter];
