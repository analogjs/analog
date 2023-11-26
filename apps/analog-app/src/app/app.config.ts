import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideFileRouter } from '@analogjs/router';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';

// @ts-ignore
import routes from 'pages/**/*';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withNavigationErrorHandler(console.error)),
    provideHttpClient(withFetch()),
    provideClientHydration(),
  ],
};
