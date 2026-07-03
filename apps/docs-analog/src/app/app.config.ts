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
  type CanMatchFn,
  Router,
  type Route,
  type UrlMatchResult,
  type UrlSegment,
  withInMemoryScrolling,
  withRouterConfig,
} from '@angular/router';
import { provideAnalogDocs } from '@analogjs/content/docs';
import { injectSwitchLocale } from '@analogjs/router/i18n';
import { resolveActiveLocale, SUPPORTED_LOCALES } from './locale';
import { ScrollRestorer } from './scroll';
import { getSidebar } from './sidebar';

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

// English is the unprefixed default; rewrite any incoming /en/... URL
// (e.g. external Algolia hits) to the canonical /... form.
const stripEnPrefix: CanMatchFn = (_route, segments) => {
  const router = inject(Router);
  const rest = segments
    .slice(1)
    .map((s) => s.path)
    .join('/');
  return router.parseUrl('/' + rest);
};
const enRedirectRoute: Route = {
  matcher: (segments: UrlSegment[]): UrlMatchResult | null =>
    segments.length > 0 && segments[0].path === 'en'
      ? { consumed: segments, posParams: {} }
      : null,
  canMatch: [stripEnPrefix],
  // Never reached — canMatch returns a UrlTree which triggers the redirect.
  children: [],
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
      withExtraRoutes([enRedirectRoute, localeHomeRoute]),
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
    // Factory form so $localize labels evaluate against translations
    // loaded by provideI18n's app initializer (useFactory defers until
    // a component first injects the token — well after bootstrap).
    provideAnalogDocs(() => ({
      brand: {
        name: 'Analog',
        logoSrc: '/img/logos/analog-logo.svg',
        logoAlt: '',
      },
      sidebar: getSidebar(),
      switchLocaleFactory: () => injectSwitchLocale(),
      locales: {
        default: 'en',
        list: [
          { code: 'en', label: 'English' },
          { code: 'es', label: 'Español' },
          { code: 'de', label: 'Deutsch' },
          { code: 'pt-br', label: 'Português (Brasil)' },
          { code: 'zh-hans', label: '简体中文' },
        ],
        // Legacy locales (fr/ko/tr) still appear in the Algolia index
        // even though we no longer ship those translations; list them
        // here so Search can recognize and strip their URL prefixes.
        indexed: ['de', 'es', 'fr', 'ko', 'pt-br', 'tr', 'zh-hans'],
      },
      search: {
        appId: '8W3CAMYOQF',
        apiKey: '650d723674c8cd38658add35fb9433e3',
        indexName: 'analogjs',
      },
      headerNav: [
        {
          label: $localize`:@@nav.docs:Docs`,
          routerLink: '/docs/introduction',
        },
        {
          label: $localize`:@@nav.support:Support`,
          routerLink: '/docs/support',
        },
        { label: 'GitHub', href: 'https://github.com/analogjs/analog' },
        { label: 'Discord', href: 'https://chat.analogjs.org' },
      ],
      footer: {
        brand: {
          logoSrc: '/img/logos/analog-logo.svg',
          logoAlt: 'Analog logo',
          copyright: `© 2022–${new Date().getFullYear()} Analog`,
          tagline: $localize`:@@footer.license:Released under the MIT License`,
        },
        columns: [
          {
            title: $localize`:@@footer.documentation:Documentation`,
            items: [
              {
                label: $localize`:@@sidebar.introduction:Introduction`,
                routerLink: '/docs/introduction',
              },
              {
                label: $localize`:@@sidebar.getting-started:Getting Started`,
                routerLink: '/docs/getting-started',
              },
              { label: 'llms.txt', href: 'https://analogjs.org/llms.txt' },
              {
                label: 'llms-full.txt',
                href: 'https://analogjs.org/llms-full.txt',
              },
            ],
          },
          {
            title: $localize`:@@footer.open-source:Open source`,
            items: [
              {
                label: $localize`:@@sidebar.contributors:Contributors`,
                routerLink: '/docs/contributors',
              },
              {
                label: $localize`:@@footer.contributing:Contributing`,
                routerLink: '/docs/contributing',
              },
              {
                label: $localize`:@@footer.sponsoring:Sponsoring`,
                routerLink: '/docs/sponsoring',
              },
            ],
          },
          {
            title: $localize`:@@footer.more:More`,
            items: [
              { label: 'GitHub', href: 'https://github.com/analogjs/analog' },
              { label: 'Discord', href: 'https://chat.analogjs.org' },
              {
                label: 'Stack Overflow',
                href: 'https://stackoverflow.com/questions/tagged/analogjs',
              },
            ],
          },
        ],
      },
    })),
    provideAppInitializer(() => inject(ScrollRestorer).start()),
  ],
};
