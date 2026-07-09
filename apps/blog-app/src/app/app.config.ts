import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { provideImageLoader } from '@analogjs/content/image';
import { withShikiHighlighter } from '@analogjs/content/shiki-highlighter';
import { provideFileRouter } from '@analogjs/router';
import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { withInMemoryScrolling } from '@angular/router';

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
    provideImageLoader({ domains: ['images.unsplash.com'] }),
    provideFileRouter(withInMemoryScrolling({ anchorScrolling: 'enabled' })),
  ],
};
