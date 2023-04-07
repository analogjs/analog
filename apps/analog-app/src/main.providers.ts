/**
 * Common providers shared with client and server-side.
 */
import { Provider } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideFileRouter } from '@analogjs/router';

export const mainProviders: Provider = [
  provideFileRouter(),
  provideHttpClient(),
];
