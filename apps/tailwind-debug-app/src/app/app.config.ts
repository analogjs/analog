import { CSP_NONCE, type ApplicationConfig } from '@angular/core';
import { provideFileRouter, withTypedRouter } from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: CSP_NONCE, useValue: null },
    provideFileRouter(withTypedRouter({ strictRouteParams: true })),
  ],
};
