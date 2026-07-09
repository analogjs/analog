import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import {
  provideImageLoader,
  withImageOptimization,
} from '@analogjs/content/image';
import { withShikiHighlighter } from '@analogjs/content/shiki-highlighter';
import { provideFileRouter } from '@analogjs/router';
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
      withImageOptimization({
        sizes: '(max-width: 768px) 100vw, 768px',
      }),
    ),
    provideImageLoader(),
    provideFileRouter(
      withInMemoryScrolling({ anchorScrolling: 'enabled' }),
      withEnabledBlockingInitialNavigation(),
    ),
  ],
};
