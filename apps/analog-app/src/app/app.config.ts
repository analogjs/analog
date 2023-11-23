import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideFileRouter } from '@analogjs/router';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    // provideFileRouter(withNavigationErrorHandler(console.error)),
    provideRouter([
      { path: '', loadComponent: () => import('./pages/(home).page') },
    ]),
    provideHttpClient(withFetch()),
    provideClientHydration(),
  ],
};
