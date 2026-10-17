import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideFileRouter } from '@analogjs/router';
import { withContentRoutes } from '@analogjs/router/content';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { __HIGHLIGHTER__ } from '@analogjs/content/__HIGHLIGHTER_ENTRY_POINT__';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideFileRouter(withContentRoutes()),
    provideHttpClient(),
    provideClientHydration(withEventReplay()),
    provideContent(withMarkdownRenderer(), __HIGHLIGHTER__()),
  ],
};
