import { withPrismHighlighter } from '@analogjs/content/prism-highlighter';
import { provideFileRouter } from '@analogjs/router';
import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(),
    provideHttpClient(),
    provideContent(
      withMarkdownRenderer(),
      // NOTE: .agx files are not affected by the highlighter yet.
      withPrismHighlighter()
    ),
  ],
};
