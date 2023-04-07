/**
 * Common providers shared with client and server-side.
 */
import { Provider } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { withInMemoryScrolling } from '@angular/router';
import { provideFileRouter } from '@analogjs/router';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';

export const mainProviders: Provider = [
  provideFileRouter(withInMemoryScrolling({ anchorScrolling: 'enabled' })),
  provideContent(withMarkdownRenderer()),
  provideHttpClient(),
];
