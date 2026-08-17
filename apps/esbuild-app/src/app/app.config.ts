import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  provideClientHydration,
  withIncrementalHydration,
} from '@angular/platform-browser';
import { provideFileRouter, withDebugRoutes } from '@analogjs/router';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideClientHydration(withIncrementalHydration()),
    provideHttpClient(withFetch()),
    provideFileRouter(withDebugRoutes()),
    provideContent(
      withMarkdownRenderer({ loadMermaid: () => import('mermaid') }),
    ),
  ],
};
