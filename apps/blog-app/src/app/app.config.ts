import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import {
  withEnabledBlockingInitialNavigation,
  withInMemoryScrolling,
} from '@angular/router';
import { provideFileRouter } from '@analogjs/router';
import {
  CUSTOM_CONTENT_SLUG_TOKEN,
  provideContent,
  withMarkdownRenderer,
} from '@analogjs/content';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideClientHydration(),
    provideContent(withMarkdownRenderer()),
    provideFileRouter(
      withInMemoryScrolling({ anchorScrolling: 'enabled' }),
      withEnabledBlockingInitialNavigation()
    ),
    { provide: CUSTOM_CONTENT_SLUG_TOKEN, useFactory: () => 'custom_slug' },
  ],
};
