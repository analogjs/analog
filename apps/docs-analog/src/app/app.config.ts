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
import {
  provideFileRouter,
  requestContextInterceptor,
  withExtraRoutes,
} from '@analogjs/router';
import { provideI18n } from '@analogjs/router/i18n';
import {
  provideContent,
  withLocale,
  withMarkdownRenderer,
} from '@analogjs/content';
import {
  type Route,
  type UrlMatchResult,
  type UrlSegment,
  withInMemoryScrolling,
  withRouterConfig,
} from '@angular/router';
import { SUPPORTED_LOCALES, resolveActiveLocale } from './locale';
import { ScrollRestorer } from './scroll';

// Picking a locale from the marketing home (`/`) hard-reloads to
// `/<locale>/` — this route renders the same HomePage so the URL keeps
// the picker label and downstream /docs links in the right locale.
const localeHomeRoute: Route = {
  matcher: (segments: UrlSegment[]): UrlMatchResult | null => {
    if (segments.length !== 1) return null;
    if (!SUPPORTED_LOCALES.includes(segments[0].path as never)) return null;
    return {
      consumed: segments,
      posParams: { locale: segments[0] },
    };
  },
  loadComponent: () => import('./pages/(home).page').then((m) => m.default),
};

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
      withExtraRoutes([localeHomeRoute]),
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
    provideI18n({
      loader: async (locale: string) => {
        const m = (await import(`../i18n/${locale}.json`)) as {
          default: Record<string, string>;
        };
        return m.default;
      },
    }),
    provideAppInitializer(() => inject(ScrollRestorer).start()),
  ],
};
