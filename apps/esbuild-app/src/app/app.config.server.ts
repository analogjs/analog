import { mergeApplicationConfig } from '@angular/core';
import { provideAnalogServerRendering } from '@analogjs/router/ssr';
import routeFiles from 'analog:route-files';
import pageEndpoints from 'analog:page-endpoints';

import { appConfig } from './app.config';

// Endpoint-backed pages render per request automatically; fn-demo is
// listed because its server-function dependency is not visible from
// filenames.
export const config = mergeApplicationConfig(appConfig, {
  providers: [
    provideAnalogServerRendering(routeFiles, {
      pageEndpoints,
      serverPaths: ['fn-demo'],
      debugRoutes: true,
    }),
  ],
});
