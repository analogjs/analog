import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
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
import { withRouterConfig } from '@angular/router';
import { resolveActiveLocale } from './locale';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
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
  ],
};
