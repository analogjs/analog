import { provideFileRouter } from '@analogjs/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { withInMemoryScrolling, withRouterResources } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withFetch()),
    provideClientHydration(),
    provideFileRouter(
      withInMemoryScrolling({ anchorScrolling: 'enabled' }),
      withRouterResources(),
    ),
  ],
};
