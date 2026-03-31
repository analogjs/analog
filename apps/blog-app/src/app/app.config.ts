import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { withShikiHighlighter } from '@analogjs/content/shiki-highlighter';
import {
  provideFileRouter,
  withTypedRouter,
  withLoaderCaching,
} from '@analogjs/router';
import { withContentRoutes } from '@analogjs/router/content';
import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import {
  withEnabledBlockingInitialNavigation,
  withInMemoryScrolling,
} from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideClientHydration(),
    provideContent(
      withMarkdownRenderer({
        loadMermaid: !import.meta.env.SSR ? () => import('mermaid') : undefined,
      }),
      withShikiHighlighter(),
    ),
    provideFileRouter(
      withContentRoutes(),
      withInMemoryScrolling({ anchorScrolling: 'enabled' }),
      withEnabledBlockingInitialNavigation(),
      // Experimental: TanStack Router-inspired typed routes
      withTypedRouter(),
      withLoaderCaching({ defaultStaleTime: 60_000 }),
    ),
  ],
};
