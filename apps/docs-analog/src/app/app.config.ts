import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import {
  type ApplicationConfig,
  provideAppInitializer,
  inject,
} from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import { provideFileRouter, requestContextInterceptor } from '@analogjs/router';
import {
  provideContent,
  withLocale,
  withMarkdownRenderer,
} from '@analogjs/content';
import { withInMemoryScrolling, withRouterConfig } from '@angular/router';
import { resolveActiveLocale } from './locale';
import { ScrollRestorer } from './scroll';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      // Emit Scroll events so ScrollRestorer can defer the actual scroll
      // until our async markdown content has loaded.
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'disabled',
      }),
    ),
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor]),
    ),
    provideClientHydration(withEventReplay()),
    provideContent(
      withMarkdownRenderer(),
      withLocale({ loadLocale: resolveActiveLocale }),
    ),
    provideAppInitializer(() => inject(ScrollRestorer).start()),
  ],
};
